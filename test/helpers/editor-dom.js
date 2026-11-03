// DOM وهمي لتركيب المحرّر كاملًا في اختبارات الوحدة (تدقيق 5fedcb9): يبني على test/unit/pages/library/fake-dom.js بما يحتاجه
// mountEditor وحده: dataset، و`:scope >`، وخيارات select، ونافذة بمؤقتات وإطارات يدوية لا تمضي إلا بـflush. يكفي لتسلسلات
// الحفظ والتبديل والتغيّر الخارجي؛ والتخطيط والرسم الفعليان في الاختبار الحي.
import { FakeDocument, FakeElement, settle } from '../unit/pages/library/fake-dom.js';

let patched = false;
function patchElements() {
  if (patched) return;
  patched = true;
  const qsa = FakeElement.prototype.querySelectorAll;
  FakeElement.prototype.querySelectorAll = function querySelectorAll(sel) {
    if (sel.startsWith(':scope > ')) return qsa.call(this, sel.slice(9)).filter((n) => n.parentNode === this);
    return qsa.call(this, sel);
  };
  const dataName = (k) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
  Object.defineProperties(FakeElement.prototype, {
    dataset: {
      get() {
        const self = this;
        return new Proxy({}, {
          get: (_, k) => (typeof k === 'string' ? self.getAttribute(dataName(k)) ?? undefined : undefined),
          set: (_, k, v) => { self.setAttribute(dataName(k), v); return true; },
          deleteProperty: (_, k) => { self.removeAttribute(dataName(k)); return true; },
        });
      },
    },
    options: { get() { return [...this.children].filter((c) => c.tagName === 'option'); } },
    parentElement: { get() { return this.parentNode; } },
    firstChild: { get() { return this.childNodes[0] ?? null; } },
    scrollTop: { writable: true, value: 0 },
  });
  FakeElement.prototype.setSelectionRange = function setSelectionRange(a, b) {
    this.selectionStart = a;
    this.selectionEnd = b;
  };
  // closest بمحددات fake-dom نفسها: العنصر أو أقرب أب يطابق (يُختبر بالبحث من أبيه).
  FakeElement.prototype.closest = function closest(sel) {
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) {
      const scope = n.parentNode && n.parentNode.nodeType === 1 ? n.parentNode : n.ownerDocument.documentElement;
      if (scope !== n && scope.querySelectorAll(sel).includes(n)) return n;
    }
    return null;
  };
  FakeElement.prototype.blur = function blur() {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body;
  };
  FakeDocument.prototype.querySelector = function querySelector(s) {
    return this.documentElement.querySelector(s);
  };
}

/**
 * مستند ونافذة للمحرّر. المؤقتات والإطارات لا تُنفَّذ حتى flush() (فالترتيب في الاختبار صريح).
 * @param {{ videoId: string }} o
 */
export function editorDocument({ videoId }) {
  patchElements();
  const doc = new FakeDocument();
  const scheduled = new Map();
  let id = 0;
  const later = (fn) => { scheduled.set(++id, fn); return id; };
  const listeners = new Map();
  doc.defaultView = {
    setTimeout: later,
    clearTimeout: (t) => scheduled.delete(t),
    requestAnimationFrame: later,
    cancelAnimationFrame: (t) => scheduled.delete(t),
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener() {},
    location: { href: `chrome-extension://tj/pages/editor/index.html?v=${videoId}`, assign(url) { this.assigned = url; } },
    history: { replaceState() {} },
    HTMLTextAreaElement: FakeElement,
    HTMLInputElement: FakeElement,
  };
  const root = doc.createElement('main');
  doc.body.append(root);
  /** ينفّذ المؤقتات والإطارات المعلّقة (وما تجدوله) ثم ينتظر الوعود. */
  const flush = async (rounds = 3) => {
    for (let r = 0; r < rounds; r++) {
      const due = [...scheduled.entries()];
      scheduled.clear();
      for (const [, fn] of due) fn();
      await settle();
    }
  };
  /** يطلق حدثًا على مستمعي المستند (keydown مثلًا). */
  const fireDoc = (event) => {
    const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...event };
    for (const fn of doc._listeners.get(e.type) ?? []) fn(e);
    return e;
  };
  return { doc, root, flush, fireDoc, pending: () => scheduled.size };
}

export { settle };
