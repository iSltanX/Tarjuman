// DOM وهمي صغير بما تحتاجه الطبقة والأدوات والمراقبة فقط (لا اعتماديات): عناصر بأبناء وسمات وأصناف وأنماط CSSOM،
// وShadow DOM مع adoptedStyleSheets، ومحددات (معرّف وصنف ووسم وسمة وأحفاد وقوائم بفاصلة)، ومراقبات MutationObserver
// وResizeObserver تُنفَّذ فورًا، ومؤقتات يدوية، والتركيز، وأحداث تعبر الجذور المظللة بمرحلتي الالتقاط والفقاعة
// (bubbles: true فقط؛ وغيرها يصل إلى هدفه وحده كما كان). يكفي لاختبار المنطق؛ والمتصفح الفعلي في الاختبار الحي.
//
// لا تُمرَّر عقدة إلى assert.equal أو deepEqual أو notEqual؛ قارن بـassert.ok(a === b) أو assert.ok(x === null) أو بقيمة
// بسيطة (data-fid، textContent، موضع في قائمة). العقدة مترابطة مع الشجرة كلها، وفشل تلك التأكيدات في Node 24 يفحصها
// بعمق 1000 إلى مئات آلاف الأسطر، ثم يبني الفرق بذاكرة تربيعية خارج كومة V8. فيستنزف ذاكرة الجهاز بدل أن يفشل الاختبار،
// ولا توقفه مهلة الاختبار ولا --max-old-space-size (قتل النظام عمليات node بسبب low-swap في تدقيق 5fedcb9).

let uid = 0;

class FakeSheet {
  constructor() {
    this.css = '';
  }

  replaceSync(css) {
    this.css = css;
  }
}

class FakeStyle {
  constructor() {
    this.props = new Map();
  }

  setProperty(k, v) {
    this.props.set(k, String(v));
  }

  removeProperty(k) {
    this.props.delete(k);
  }

  getPropertyValue(k) {
    return this.props.get(k) ?? '';
  }
}

function parseSelector(sel) {
  return sel.trim().split(/\s+(?![^[]*\])/).map((part) => {
    const m = /^([a-z][a-z0-9-]*)?(?:#([\w-]+))?((?:\.[\w-]+)*)((?:\[[\w-]+(?:="[^"]*")?\])*)$/i.exec(part);
    if (!m) throw new Error(`محدد غير مدعوم في الـDOM الوهمي: ${sel}`);
    const attrs = [...(m[4] ?? '').matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((a) => ({ name: a[1], value: a[2] ?? null }));
    return { tag: m[1]?.toLowerCase() ?? null, id: m[2] ?? null, classes: m[3] ? m[3].split('.').filter(Boolean) : [], attrs };
  });
}

const matchesCompound = (el, c) =>
  (!c.tag || el.tagName === c.tag) && (!c.id || el.id === c.id) && c.classes.every((k) => el.classList.contains(k))
  && c.attrs.every((a) => el.hasAttribute?.(a.name) && (a.value === null || el.getAttribute(a.name) === a.value));

/** الأب عبر حدود الظل: أب العقدة، أو مضيف الجذر المظلل. */
const up = (n) => n.parentNode ?? n._host ?? null;

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

export class FakeElement {
  constructor(tag, doc) {
    this.tagName = tag.toLowerCase();
    this.ownerDocument = doc;
    this.uid = ++uid;
    this.id = '';
    this.children = [];
    this.parentNode = null;
    this._attrs = new Map();
    this._text = '';
    this.style = new FakeStyle();
    this.rect = { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 };
    this.shadowRoot = null;
    this._listeners = new Map();
    hideLinks(this, ['ownerDocument', 'children', 'parentNode', 'shadowRoot']);
    const self = this;
    this._classes = new Set();
    this.classList = {
      add: (...c) => {
        c.forEach((k) => self._classes.add(k));
        self._mutated('class');
      },
      remove: (...c) => {
        c.forEach((k) => self._classes.delete(k));
        self._mutated('class');
      },
      contains: (c) => self._classes.has(c),
      toggle: (c, force) => {
        const on = force ?? !self._classes.has(c);
        if (on) self._classes.add(c);
        else self._classes.delete(c);
        self._mutated('class');
        return on;
      },
    };
  }

  get className() {
    return [...this._classes].join(' ');
  }

  set className(v) {
    this._classes = new Set(String(v).split(/\s+/).filter(Boolean));
    this._mutated('class');
  }

  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(v) {
    this.children.forEach((c) => (c.parentNode = null));
    this.children = [];
    this._text = String(v);
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  get nextSibling() {
    const sibs = this.parentNode?.children;
    if (!sibs) return null;
    return sibs[sibs.indexOf(this) + 1] ?? null;
  }

  get isConnected() {
    let n = this;
    while (n) {
      if (n === this.ownerDocument.documentElement) return true;
      n = n.parentNode ?? n._host ?? null;
    }
    return false;
  }

  setAttribute(k, v) {
    this._attrs.set(k, String(v));
    if (k === 'class') this._classes = new Set(String(v).split(/\s+/).filter(Boolean));
    this._mutated(k);
  }

  getAttribute(k) {
    if (k === 'class' && !this._attrs.has(k)) return this._classes.size ? this.className : null;
    return this._attrs.has(k) ? this._attrs.get(k) : null;
  }

  hasAttribute(k) {
    return this._attrs.has(k) || (k === 'class' && this._classes.size > 0);
  }

  getAttributeNames() {
    const names = [...this._attrs.keys()];
    if (this._classes.size && !names.includes('class')) names.push('class');
    return names;
  }

  removeAttribute(k) {
    this._attrs.delete(k);
    if (k === 'class') this._classes = new Set();
    this._mutated(k);
  }

  appendChild(node) {
    node.remove();
    node.parentNode = this;
    this.children.push(node);
    this._childList();
    return node;
  }

  append(...nodes) {
    for (const n of nodes) this.appendChild(n);
  }

  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node);
    if (node === ref) return node;
    node.remove();
    const i = this.children.indexOf(ref);
    if (i < 0) throw new Error('المرجع ليس ابنًا');
    node.parentNode = this;
    this.children.splice(i, 0, node);
    this._childList();
    return node;
  }

  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i > -1) {
      this.children.splice(i, 1);
      node.parentNode = null;
      this._childList();
    }
    return node;
  }

  remove() {
    this.parentNode?.removeChild(this);
  }

  replaceChildren(...nodes) {
    this.children.forEach((c) => (c.parentNode = null));
    this.children = [];
    this._text = '';
    for (const n of nodes) {
      n.remove();
      n.parentNode = this;
      this.children.push(n);
    }
    this._childList();
  }

  contains(other) {
    for (let n = other; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  attachShadow() {
    const root = new FakeElement('#shadow-root', this.ownerDocument);
    root._host = this;
    hideLinks(root, ['_host']);
    root.adoptedStyleSheets = [];
    this.shadowRoot = root;
    return root;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  *descendants() {
    for (const c of this.children) {
      yield c;
      yield* c.descendants();
    }
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }

  querySelectorAll(sel) {
    if (sel.includes(',')) {
      const all = new Set(sel.split(',').flatMap((one) => this.querySelectorAll(one)));
      return [...this.descendants()].filter((el) => all.has(el));
    }
    const parts = parseSelector(sel);
    const last = parts.at(-1);
    const out = [];
    for (const el of this.descendants()) {
      if (!matchesCompound(el, last)) continue;
      let ok = true;
      let anc = el.parentNode;
      for (let i = parts.length - 2; i >= 0 && ok; i--) {
        while (anc && !matchesCompound(anc, parts[i])) anc = anc.parentNode;
        if (!anc) ok = false;
        else anc = anc.parentNode;
      }
      if (ok) out.push(el);
    }
    return out;
  }

  addEventListener(type, fn, opts) {
    addListener(this, type, fn, opts);
  }

  removeEventListener(type, fn, opts) {
    removeListener(this, type, fn, opts);
  }

  dispatchEvent(ev) {
    return dispatch(this, ev);
  }

  focus() {
    this.ownerDocument?._focus(this);
  }

  blur() {
    if (this.ownerDocument?._focused === this) this.ownerDocument._focus(null);
  }

  click() {
    this.dispatchEvent({ type: 'click', bubbles: true, detail: 0 });
  }

  /** تحديد نص الحقل (للنسخ البديل) وموضع المؤشر: يُسجَّلان فقط. */
  select() {
    this.selected = true;
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  /** العنصر المركّز داخل هذا الجذر المظلل (أو مضيف جذر متداخل فيه)، كما في ShadowRoot.activeElement. */
  get activeElement() {
    let n = this.ownerDocument?._focused ?? null;
    while (n) {
      let r = n;
      while (r && !r._host) r = r.parentNode;
      if (!r) return null;
      if (r === this) return n;
      n = r._host;
    }
    return null;
  }

  listenerCount(type) {
    return this._listeners.get(type)?.size ?? 0;
  }

  _mutated(attr) {
    this.ownerDocument?._notify({ type: 'attributes', target: this, attributeName: attr });
  }

  _childList() {
    this.ownerDocument?._notify({ type: 'childList', target: this });
  }
}

const capOf = (opts) => opts === true || !!opts?.capture;
function addListener(node, type, fn, opts) {
  if (!node._listeners.has(type)) node._listeners.set(type, new Set());
  const list = node._listeners.get(type);
  for (const l of list) if (l.fn === fn && l.capture === capOf(opts)) return;
  list.add({ fn, capture: capOf(opts) });
}
function removeListener(node, type, fn, opts) {
  const list = node._listeners.get(type);
  if (!list) return;
  for (const l of [...list]) if (l.fn === fn && l.capture === capOf(opts)) list.delete(l);
}

/**
 * يرسل الحدث: الهدف وحده كما كان، أو (bubbles: true) مسار الالتقاط من المستند إلى الهدف ثم الفقاعة إلى المستند،
 * عابرًا الجذور المظللة إلى مضيفيها. stopPropagation يوقف ما بعد العقدة الحالية، وcomposedPath يعيد المسار.
 */
function dispatch(target, ev) {
  ev.target = target;
  const path = [target];
  if (ev.bubbles) {
    for (let n = up(target); n; n = up(n)) path.push(n);
    const doc = target.ownerDocument ?? target;
    if (doc && path.at(-1) !== doc && doc._listeners) path.push(doc);
  }
  let stopped = false;
  ev.composedPath = () => [...path];
  ev.stopPropagation = () => (stopped = true);
  ev.stopImmediatePropagation = () => (stopped = true);
  ev.defaultPrevented = false;
  ev.preventDefault = () => (ev.defaultPrevented = true);
  const call = (node, phase) => {
    for (const l of [...(node._listeners?.get(ev.type) ?? [])]) {
      if (phase === 'capture' && !l.capture) continue;
      if (phase === 'bubble' && l.capture) continue;
      ev.currentTarget = node;
      l.fn(ev);
    }
  };
  for (let i = path.length - 1; i > 0 && !stopped; i--) call(path[i], 'capture');
  if (!stopped) call(target, 'target');
  for (let i = 1; i < path.length && !stopped; i++) call(path[i], 'bubble');
  return !ev.defaultPrevented;
}

export function createFakeEnv({ href = 'https://www.youtube.com/watch?v=AAAAAAAAAAA' } = {}) {
  const url = new URL(href);
  const observers = new Set();
  const timers = new Map();
  let timerSeq = 0;
  let now = 0;

  const doc = {
    fullscreenElement: null,
    adoptedStyleSheets: [],
    _listeners: new Map(),
    _focused: null,
    createElement: (tag) => new FakeElement(tag, doc),
    createElementNS: (ns, tag) => {
      const el = new FakeElement(tag, doc);
      el.namespaceURI = ns;
      return el;
    },
    _notify(rec) {
      for (const o of [...observers]) o._deliver(rec);
    },
    _focus(el) {
      const prev = doc._focused;
      if (prev === el) return;
      doc._focused = el;
      // ترتيب المتصفح: blur ثم focusout (فقّاعة) على السابق، ثم focus ثم focusin (فقّاعة) على الجديد، في الاستدعاء نفسه؛ فيرى
      // مستمع focusin التركيز الذي نقلته الشيفرة (التدقيق الموحد V2: كشفه الاختبار الحي لإمساك رسالة اللوحة).
      prev?.dispatchEvent({ type: 'blur' });
      prev?.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: el ?? null });
      el?.dispatchEvent({ type: 'focus' });
      el?.dispatchEvent({ type: 'focusin', bubbles: true, relatedTarget: prev ?? null });
    },
    /** العنصر المركّز كما يراه المستند: مضيف الظل الأعلى إن كان التركيز داخل جذر مظلل. */
    get activeElement() {
      let n = doc._focused;
      if (!n || !n.isConnected) return doc.body;
      let out = n;
      for (let x = n; x; x = up(x)) if (x._host) out = x._host;
      return out;
    },
    addEventListener(type, fn, opts) {
      addListener(doc, type, fn, opts);
    },
    removeEventListener: (type, fn, opts) => removeListener(doc, type, fn, opts),
    dispatchEvent(ev) {
      ev.target = ev.target ?? doc;
      ev.composedPath = ev.composedPath ?? (() => [doc]);
      ev.stopPropagation = ev.stopPropagation ?? (() => {});
      for (const l of [...(doc._listeners.get(ev.type) ?? [])]) l.fn(ev);
    },
    listenerCount: (type) => doc._listeners.get(type)?.size ?? 0,
    querySelector: (sel) => doc.documentElement.querySelector(sel),
    querySelectorAll: (sel) => doc.documentElement.querySelectorAll(sel),
  };
  doc.documentElement = new FakeElement('html', doc);
  doc.head = new FakeElement('head', doc);
  doc.body = new FakeElement('body', doc);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.defaultView = null;

  class FakeMutationObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
    }

    observe(target, opts) {
      this.targets.push({ target, opts });
      observers.add(this);
    }

    disconnect() {
      this.targets = [];
      observers.delete(this);
    }

    _deliver(rec) {
      for (const { target, opts } of this.targets) {
        const inScope = rec.target === target || (opts.subtree && target.contains(rec.target));
        if (!inScope) continue;
        if (rec.type === 'attributes' && opts.attributes && (!opts.attributeFilter || opts.attributeFilter.includes(rec.attributeName))) return this.cb([rec], this);
        if (rec.type === 'childList' && opts.childList) return this.cb([rec], this);
      }
      return undefined;
    }
  }

  const resizeObservers = new Set();
  class FakeResizeObserver {
    constructor(cb) {
      this.cb = cb;
      this.targets = new Set();
      resizeObservers.add(this);
    }

    observe(t) {
      this.targets.add(t);
    }

    disconnect() {
      this.targets.clear();
      resizeObservers.delete(this);
    }
  }

  const win = {
    document: doc,
    location: { origin: url.origin, pathname: url.pathname, search: url.search },
    CSSStyleSheet: FakeSheet,
    MutationObserver: FakeMutationObserver,
    ResizeObserver: FakeResizeObserver,
    _listeners: new Map(),
    addEventListener(type, fn, opts) {
      addListener(win, type, fn, opts);
    },
    removeEventListener: (type, fn, opts) => removeListener(win, type, fn, opts),
    listenerCount: (type) => win._listeners.get(type)?.size ?? 0,
    fire(type, ev = { type }) {
      for (const l of [...(win._listeners.get(type) ?? [])]) l.fn(ev);
    },
    setTimeout(fn, ms) {
      const id = ++timerSeq;
      timers.set(id, { fn, at: now + ms, every: null });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval(fn, ms) {
      const id = ++timerSeq;
      timers.set(id, { fn, at: now + ms, every: ms });
      return id;
    },
    clearInterval: (id) => timers.delete(id),
    _raf: new Map(),
    requestAnimationFrame(cb) {
      const id = ++timerSeq;
      win._raf.set(id, cb);
      return id;
    },
    cancelAnimationFrame: (id) => win._raf.delete(id),
    /** يقدّم الساعة الوهمية ms وينفّذ المؤقتات المستحقة بترتيبها. */
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, t] = due;
        now = Math.max(now, t.at);
        if (t.every) t.at += t.every;
        else timers.delete(id);
        t.fn();
      }
      now = end;
    },
    pendingTimers: () => timers.size,
    navigate(next) {
      const u = new URL(next);
      win.location.pathname = u.pathname;
      win.location.search = u.search;
    },
    /** يطلق ResizeObserver لكل مراقب يراقب العنصر. */
    resize(el) {
      for (const o of resizeObservers) if (o.targets.has(el)) o.cb([{ target: el }], o);
    },
  };
  doc.defaultView = win;
  return { doc, win, observers: () => observers.size, resizeObservers: () => resizeObservers.size };
}

/** مشغّل يوتيوب مبسّط: #movie_player بفيديو وشريط سفلي وحاوية ترجمة، تحت body. */
export function addPlayer(env, { width = 640, height = 360 } = {}) {
  const { doc } = env;
  const player = doc.createElement('div');
  player.id = 'movie_player';
  player.rect = { top: 0, left: 0, width, height, bottom: height, right: width };
  const video = doc.createElement('video');
  video.className = 'html5-main-video';
  const chrome = doc.createElement('div');
  chrome.className = 'ytp-chrome-bottom';
  chrome.rect = { top: height - 48, left: 0, width, height: 48, bottom: height, right: width };
  const captions = doc.createElement('div');
  captions.className = 'ytp-caption-window-container';
  player.appendChild(video);
  player.appendChild(chrome);
  player.appendChild(captions);
  doc.body.appendChild(player);
  return { player, video, chrome, captions };
}
