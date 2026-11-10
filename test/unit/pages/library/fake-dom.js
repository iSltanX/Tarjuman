// DOM وهمي صغير لاختبار واجهات الصفحات بلا متصفح ولا اعتماديات (P7): عناصر بأبناء ونصوص وسمات وأصناف وأحداث
// تصعد إلى الآباء، ومحددات (وسم ومعرّف وصنف وسمة وأحفاد)، وعنصر نشط. يكفي لبناة src/ui وصفحات P7؛ والمتصفح الفعلي
// في الاختبار الحي (test/live/pages).
//
// لا تُمرَّر عقدة إلى assert.equal أو deepEqual أو notEqual؛ قارن بـassert.ok(a === b) أو assert.ok(x === null) أو بقيمة
// بسيطة. فشل تلك التأكيدات على عقدة يفحص الـDOM الوهمي المترابط كله ويبني فرقًا بذاكرة تربيعية خارج كومة V8 (التفصيل في
// test/unit/player/overlay/fake-dom.js).
//
// التركيز كما في المتصفح (تدقيق 7a66f91، U72): فصل العقدة المركّزة أو أحد آبائها بأي طريق (removeChild وremove
// وreplaceChildren وreplaceWith وضبط textContent ونقلها بـappend) يعيد activeElement إلى body ويطلق blur وfocusout عليها،
// والعنصر المفصول أو المخفي (hidden عليه أو على أب) أو المعطّل لا يقبل focus(). كان التركيز يبقى على المفصول فتمر اختبارات
// تسقط فيها الأفعال تركيزها في المتصفح. وfocus() يطلق focus وfocusin (وblur وfocusout على السابق)، وblur() يعيده إلى body.

/** متصل بالمستند: يصعد من العقدة إلى جذره. */
const connected = (node) => {
  const root = node?.ownerDocument?.documentElement;
  for (let n = node; n; n = n.parentNode) if (n === root) return true;
  return false;
};

/** بعد كل فصل: إن لم يعد المركّز متصلًا عاد التركيز إلى body وأُطلق blur وfocusout على المفصول (كما يطلقهما Chromium). */
const fixFocus = (doc) => {
  const el = doc?._focused;
  if (!el || el === doc.body || connected(el)) return;
  doc._focused = doc.body;
  el.dispatchEvent({ type: 'blur', bubbles: false });
  el.dispatchEvent({ type: 'focusout', bubbles: true });
};

/**
 * روابط الشجرة غير قابلة للعدّ (2026-11-10): فحص العقدة (رسالة assert عند الفشل، أو util.inspect) لا يمشي الشجرة كلها عبرها،
 * فيبقى بضعة أسطر بدل مئات الآلاف (عنصر واحد بين 200 أخ كان 119 ألف سطر، وفرقه التربيعي بلغ 114 غ.ب). القراءة والكتابة كما هما.
 * @param {object} node @param {string[]} keys
 */
function hideLinks(node, keys) {
  for (const k of keys) {
    Object.defineProperty(node, k, { value: node[k], writable: true, configurable: true, enumerable: false });
  }
}

class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = String(text);
    this.parentNode = null;
    hideLinks(this, ['parentNode']);
  }

  remove() {
    this.parentNode?.removeChild(this);
  }
}

const compound = (sel) => {
  const m = /^([a-z][a-z0-9-]*)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i.exec(sel);
  if (!m) throw new Error(`محدد غير مدعوم في الـDOM الوهمي: ${sel}`);
  const attrs = [...(m[4] ?? '').matchAll(/\[([\w:-]+)(?:=("?)([^\]"]*)\2)?\]/g)].map((a) => ({ name: a[1], value: a[3] ?? null }));
  return { tag: m[1]?.toLowerCase() ?? null, id: m[2]?.slice(1) ?? null, classes: (m[3] ?? '').split('.').filter(Boolean), attrs };
};

const matches = (el, c) => (!c.tag || el.tagName === c.tag) && (!c.id || el.id === c.id)
  && c.classes.every((k) => el.classList.contains(k))
  && c.attrs.every((a) => (a.value === null ? el.hasAttribute(a.name) : el.getAttribute(a.name) === a.value));

export class FakeElement {
  constructor(tag, doc) {
    this.tagName = tag.toLowerCase();
    this.ownerDocument = doc;
    this.nodeType = 1;
    this.childNodes = [];
    this.parentNode = null;
    this._attrs = new Map();
    this._classes = new Set();
    this._listeners = new Map();
    hideLinks(this, ['ownerDocument', 'childNodes', 'parentNode']);
    this.style = { setProperty(k, v) { this[k] = String(v); }, getPropertyValue(k) { return this[k] ?? ''; } };
    this.id = '';
    this.value = '';
    this.checked = false;
    this.hidden = false;
    this.disabled = false;
    this.title = '';
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((k) => self._classes.add(k)),
      remove: (...c) => c.forEach((k) => self._classes.delete(k)),
      contains: (c) => self._classes.has(c),
      toggle: (c, force) => {
        const on = force ?? !self._classes.has(c);
        if (on) self._classes.add(c);
        else self._classes.delete(c);
        return on;
      },
    };
  }

  /** كـHTMLCollection في المتصفح: طول وفهرسة وitem وتكرار، بلا دوال المصفوفة (indexOf وmap…) حتى لا تنجح هنا شيفرة ترمي هناك. */
  get children() {
    const list = this.childNodes.filter((n) => n.nodeType === 1);
    const coll = { length: list.length, item: (i) => list[i] ?? null, [Symbol.iterator]: () => list[Symbol.iterator]() };
    list.forEach((n, i) => { coll[i] = n; });
    return coll;
  }

  get className() {
    return [...this._classes].join(' ');
  }

  set className(v) {
    this._classes = new Set(String(v).split(/\s+/).filter(Boolean));
  }

  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }

  set textContent(v) {
    this.childNodes.forEach((n) => (n.parentNode = null));
    this.childNodes = String(v) === '' ? [] : [Object.assign(new FakeText(v), { parentNode: this })];
    fixFocus(this.ownerDocument);
  }

  get isConnected() {
    return connected(this);
  }

  setAttribute(k, v) {
    this._attrs.set(k, String(v));
    if (k === 'id') this.id = String(v);
    if (k === 'title') this.title = String(v);
    if (k === 'class') this.className = v;
  }

  getAttribute(k) {
    return this._attrs.has(k) ? this._attrs.get(k) : null;
  }

  hasAttribute(k) {
    return this._attrs.has(k);
  }

  removeAttribute(k) {
    this._attrs.delete(k);
  }

  _adopt(node) {
    const n = typeof node === 'string' ? new FakeText(node) : node;
    n.remove?.();
    n.parentNode = this;
    return n;
  }

  append(...nodes) {
    for (const n of nodes) this.childNodes.push(this._adopt(n));
  }

  prepend(...nodes) {
    const adopted = nodes.map((n) => this._adopt(n));
    this.childNodes.unshift(...adopted);
  }

  appendChild(n) {
    this.append(n);
    return n;
  }

  /** كما في DOM: ينقل العقدة قبل المرجع (أو إلى الآخر بلا مرجع)، ولا يفعل شيئًا إن كانت هي المرجع. */
  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node);
    if (node === ref) return node;
    const n = this._adopt(node);
    const i = this.childNodes.indexOf(ref);
    if (i < 0) throw new Error('المرجع ليس ابنًا');
    this.childNodes.splice(i, 0, n);
    return n;
  }

  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i > -1) {
      this.childNodes.splice(i, 1);
      n.parentNode = null;
      fixFocus(this.ownerDocument);
    }
    return n;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  replaceChildren(...nodes) {
    this.childNodes.forEach((n) => (n.parentNode = null));
    this.childNodes = [];
    fixFocus(this.ownerDocument);
    this.append(...nodes);
  }

  replaceWith(node) {
    const p = this.parentNode;
    if (!p) return;
    const i = p.childNodes.indexOf(this);
    this.parentNode = null;
    node.remove?.();
    node.parentNode = p;
    p.childNodes.splice(i, 1, node);
    fixFocus(this.ownerDocument);
  }

  contains(other) {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  /** كالمتصفح: لا يُركَّز المفصول ولا المخفي (hidden عليه أو على أب) ولا المعطّل. */
  focus() {
    const doc = this.ownerDocument;
    if (!connected(this) || this.disabled) return;
    for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.hidden) return;
    const prev = doc._focused;
    if (prev === this) return;
    doc._focused = this;
    if (prev && prev !== doc.body) {
      prev.dispatchEvent({ type: 'blur', bubbles: false });
      prev.dispatchEvent({ type: 'focusout', bubbles: true });
    }
    this.dispatchEvent({ type: 'focus', bubbles: false });
    this.dispatchEvent({ type: 'focusin', bubbles: true });
  }

  blur() {
    const doc = this.ownerDocument;
    if (doc._focused !== this) return;
    doc._focused = doc.body;
    this.dispatchEvent({ type: 'blur', bubbles: false });
    this.dispatchEvent({ type: 'focusout', bubbles: true });
  }

  /** <dialog> (P13): الفتح يضع open، والإغلاق يزيله ويطلق close بالقيمة المعادة. */
  showModal() {
    this.open = true;
    this.setAttribute('open', '');
  }

  close(value) {
    if (!this.open) return;
    this.open = false;
    this.removeAttribute('open');
    if (value !== undefined) this.returnValue = value;
    this.dispatchEvent({ type: 'close' });
  }

  *descendants() {
    for (const c of this.children) {
      yield c;
      yield* c.descendants();
    }
  }

  querySelectorAll(sel) {
    const out = new Set();
    for (const part of sel.split(',')) {
      const chain = part.trim().split(/\s+/).map(compound);
      for (const el of this.descendants()) {
        if (!matches(el, chain.at(-1))) continue;
        let anc = el.parentNode;
        let ok = true;
        for (let i = chain.length - 2; i >= 0 && ok; i--) {
          while (anc && !(anc.nodeType === 1 && matches(anc, chain[i]))) anc = anc.parentNode;
          ok = Boolean(anc);
          anc = anc?.parentNode;
        }
        if (ok) out.add(el);
      }
    }
    return [...out];
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }

  /** يصعد الحدث من الهدف إلى الجذر، ويتوقف إن stopPropagation، ولا يصعد ما bubbles: false فيه (focus وblur). */
  dispatchEvent(event) {
    const e = Object.assign({ target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } }, event);
    for (let n = this; n && !e.stopped; n = n.parentNode ?? (n === this.ownerDocument.documentElement ? this.ownerDocument : null)) {
      e.currentTarget = n;
      for (const fn of [...(n._listeners?.get(e.type) ?? [])]) fn(e);
      if (e.bubbles === false) break;
    }
    return !e.defaultPrevented;
  }

  click() {
    return this.dispatchEvent({ type: 'click' });
  }
}

export class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.documentElement.append(this.body);
    this._focused = this.body;
    this._listeners = new Map();
    this.title = '';
  }

  /** العنصر المركّز، أو body إن فُصل (الفصل يعيده أصلًا عبر fixFocus؛ وهذا احتياط لطرق فصل لا يراها). */
  get activeElement() {
    return connected(this._focused) ? this._focused : this.body;
  }

  /** يبقى للاختبارات القديمة التي تضبطه مباشرة. */
  set activeElement(el) {
    this._focused = el ?? this.body;
  }

  createElement(tag) {
    return new FakeElement(tag, this);
  }

  createElementNS(_ns, tag) {
    return new FakeElement(tag, this);
  }

  getElementById(id) {
    return this.documentElement.querySelector(`#${id}`);
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }

  querySelectorAll(sel) {
    return this.documentElement.querySelectorAll(sel);
  }
}

export const newDocument = () => new FakeDocument();

/** نص ما تحت العنصر بمسافة واحدة بين الأجزاء. */
export const textOf = (el) => el.textContent.replace(/\s+/g, ' ').trim();

/** كل العناصر تحت الجذر التي يطابق شرطها. */
export const findAll = (root, pred) => [...root.descendants()].filter(pred);

/** أول زر يحمل النص أو اسم الوصول. */
export const buttonNamed = (root, name) => findAll(root, (e) => e.tagName === 'button' && (textOf(e) === name || textOf(e).startsWith(`${name} `) || e.getAttribute('aria-label') === name || e.getAttribute('aria-label')?.startsWith(name)))[0] ?? null;

/** يمرّ على مهام الحدث المعلّقة (وعود مُنجزة وmacro-tasks قصيرة). */
export const settle = async (n = 5) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
