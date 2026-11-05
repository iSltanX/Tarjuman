// DOM وهمي لتركيب المحرّر كاملًا في اختبارات الوحدة (تدقيق 5fedcb9): يبني على test/unit/pages/library/fake-dom.js بما يحتاجه
// mountEditor وحده: dataset، و`:scope >`، وخيارات select، ونافذة بمؤقتات وإطارات يدوية لا تمضي إلا بـflush. يكفي لتسلسلات
// الحفظ والتبديل والتغيّر الخارجي؛ والتخطيط والرسم الفعليان في الاختبار الحي.
//
// وكما في المتصفح (تدقيق 7a66f91، U71): `type` يعكس السمة (الافتراضي text للحقل)، وinstanceof HTMLInputElement وHTMLTextAreaElement
// بالوسم لا لكل عنصر (كان كل عنصر «حقل كتابة» فلا يُختبر ⌘Z ولا ⌘Y)، والمؤقتات بساعة وهمية منفصلة عن الإطارات: advance(ms)
// يمضي ما حان من المؤقتات بترتيب مهلها، وflushFrames() الإطارات وحدها، وflush() كل شيء بترتيب الجدولة كما كان.
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
    type: {
      configurable: true,
      get() { return this.getAttribute('type') ?? (this.tagName === 'input' ? 'text' : this.tagName === 'button' ? 'submit' : ''); },
      set(v) { this.setAttribute('type', v); },
    },
    isContentEditable: {
      configurable: true,
      get() {
        for (let n = this; n && n.nodeType === 1; n = n.parentNode) {
          const v = n.getAttribute('contenteditable');
          if (v === '' || v === 'true') return true;
          if (v === 'false') return false;
        }
        return false;
      },
    },
  });
  // كما في المتصفح: إزالة السمة تفرّغ خاصيتها (التلميح القديم كان يبقى في .title).
  const removeAttr = FakeElement.prototype.removeAttribute;
  FakeElement.prototype.removeAttribute = function removeAttribute(k) {
    removeAttr.call(this, k);
    if (k === 'title') this.title = '';
  };
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
  // blur() والتركيز عند الفصل من fake-dom نفسه (U72): يطلق blur وfocusout كالمتصفح.
  FakeDocument.prototype.querySelector = function querySelector(s) {
    return this.documentElement.querySelector(s);
  };
}

/** صنف لا يُنشأ، وinstanceof به بالوسم كما في المتصفح. @param {string} tag */
const tagClass = (tag) => class {
  static [Symbol.hasInstance](x) { return x?.nodeType === 1 && x.tagName === tag; }
};

/**
 * مستند ونافذة للمحرّر. المؤقتات والإطارات لا تُنفَّذ حتى flush() أو advance() أو flushFrames() (فالترتيب في الاختبار صريح).
 * @param {{ videoId: string }} o
 */
export function editorDocument({ videoId }) {
  patchElements();
  const doc = new FakeDocument();
  let clock = 0;
  let id = 0;
  /** @type {Map<number, { fn: () => void, due: number }>} */
  const timers = new Map();
  /** @type {Map<number, () => void>} */
  const frames = new Map();
  const listeners = new Map();
  doc.defaultView = {
    setTimeout: (fn, ms = 0) => { timers.set(++id, { fn, due: clock + Math.max(0, Number(ms) || 0) }); return id; },
    clearTimeout: (t) => timers.delete(t),
    requestAnimationFrame: (fn) => { frames.set(++id, fn); return id; },
    cancelAnimationFrame: (t) => frames.delete(t),
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener() {},
    location: { href: `chrome-extension://tj/pages/editor/index.html?v=${videoId}`, assign(url) { this.assigned = url; } },
    history: { replaceState() {} },
    HTMLTextAreaElement: tagClass('textarea'),
    HTMLInputElement: tagClass('input'),
  };
  const root = doc.createElement('main');
  doc.body.append(root);
  /** ينفّذ المؤقتات والإطارات المعلّقة (وما تجدوله) بترتيب جدولتها ثم ينتظر الوعود؛ والساعة تتقدم إلى مهلة ما نُفّذ. */
  const flush = async (rounds = 3) => {
    for (let r = 0; r < rounds; r++) {
      const due = [...[...timers].map(([k, t]) => [k, () => { clock = Math.max(clock, t.due); t.fn(); }]), ...frames].sort((a, b) => a[0] - b[0]);
      timers.clear();
      frames.clear();
      for (const [, fn] of due) fn();
      await settle();
    }
  };
  /** يقدّم الساعة ms وينفّذ ما حان من المؤقتات (وما تجدوله في المدة نفسها) بترتيب مهلها؛ لا يمس الإطارات. */
  const advance = async (ms) => {
    const target = clock + ms;
    for (;;) {
      let next = null;
      for (const [k, t] of timers) if (t.due <= target && (!next || t.due < next[1].due)) next = [k, t];
      if (!next) break;
      timers.delete(next[0]);
      clock = next[1].due;
      next[1].fn();
      await settle();
    }
    clock = target;
    await settle();
  };
  /** ينفّذ الإطارات المعلّقة وحدها (لا المؤقتات) ثم ينتظر الوعود. */
  const flushFrames = async () => {
    const due = [...frames.values()];
    frames.clear();
    for (const fn of due) fn();
    await settle();
  };
  /** يطلق حدثًا على مستمعي المستند (keydown مثلًا). */
  const fireDoc = (event) => {
    const e = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...event };
    for (const fn of doc._listeners.get(e.type) ?? []) fn(e);
    return e;
  };
  /** يطلق حدثًا على مستمعي النافذة (beforeunload مثلًا). */
  const fireWin = (type) => {
    const e = { type, defaultPrevented: false, returnValue: undefined, preventDefault() { this.defaultPrevented = true; } };
    for (const fn of listeners.get(type) ?? []) fn(e);
    return e;
  };
  return {
    doc, root, flush, advance, flushFrames, fireDoc, fireWin,
    pending: () => timers.size + frames.size,
    /** عدد المؤقتات والإطارات المعلّقة كلٌّ وحده. */
    queued: () => ({ timers: timers.size, frames: frames.size }),
    get now() { return clock; },
  };
}

export { settle };
