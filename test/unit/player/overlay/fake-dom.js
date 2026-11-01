// DOM وهمي صغير بما تحتاجه الطبقة والمراقبة فقط (لا اعتماديات): عناصر بأبناء وسمات وأصناف وأنماط CSSOM،
// وShadow DOM مع adoptedStyleSheets، ومحددات (معرّف وصنف ووسم وأحفاد)، ومراقبات MutationObserver
// وResizeObserver تُنفَّذ فورًا، ومؤقتات يدوية. يكفي لاختبار منطق الطبقة؛ والمتصفح الفعلي في الاختبار الحي.

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
  return sel.trim().split(/\s+/).map((part) => {
    const m = /^([a-z][a-z0-9-]*)?(?:#([\w-]+))?((?:\.[\w-]+)*)$/i.exec(part);
    if (!m) throw new Error(`محدد غير مدعوم في الـDOM الوهمي: ${sel}`);
    return { tag: m[1]?.toLowerCase() ?? null, id: m[2] ?? null, classes: m[3] ? m[3].split('.').filter(Boolean) : [] };
  });
}

const matchesCompound = (el, c) =>
  (!c.tag || el.tagName === c.tag) && (!c.id || el.id === c.id) && c.classes.every((k) => el.classList.contains(k));

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
    return this._attrs.has(k) ? this._attrs.get(k) : null;
  }

  hasAttribute(k) {
    return this._attrs.has(k);
  }

  removeAttribute(k) {
    this._attrs.delete(k);
    this._mutated(k);
  }

  appendChild(node) {
    node.remove();
    node.parentNode = this;
    this.children.push(node);
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

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }

  dispatchEvent(ev) {
    ev.target = this;
    for (const fn of [...(this._listeners.get(ev.type) ?? [])]) fn(ev);
    return true;
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
    createElement: (tag) => new FakeElement(tag, doc),
    _notify(rec) {
      for (const o of [...observers]) o._deliver(rec);
    },
    addEventListener(type, fn) {
      if (!doc._listeners.has(type)) doc._listeners.set(type, new Set());
      doc._listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => doc._listeners.get(type)?.delete(fn),
    dispatchEvent(ev) {
      for (const fn of [...(doc._listeners.get(ev.type) ?? [])]) fn(ev);
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
    addEventListener(type, fn) {
      if (!win._listeners.has(type)) win._listeners.set(type, new Set());
      win._listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => win._listeners.get(type)?.delete(fn),
    listenerCount: (type) => win._listeners.get(type)?.size ?? 0,
    fire(type, ev = { type }) {
      for (const fn of [...(win._listeners.get(type) ?? [])]) fn(ev);
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
