// بيئة وهمية لتحميل نقاط الدخول (main.js وworker.js) التي تنفّذ تركيبها لحظة الاستيراد (تدقيق 7a66f91، U103): كائن chrome يسجّل
// مستمعيه، ومستند ونافذة من DOM الاختبار القائم. install() تضع المتغيرات العامة وترجع restore() تعيدها كما كانت.
import { FakeDocument, FakeElement } from '../unit/pages/library/fake-dom.js';

/** مخزن بسيط في الذاكرة لـstorage.local مع getBytesInUse وgetKeys. */
function memoryLocal(initial = {}) {
  const data = { ...initial };
  const pick = (keys) => (keys == null ? { ...data } : Object.fromEntries([].concat(keys).filter((k) => k in data).map((k) => [k, data[k]])));
  return {
    QUOTA_BYTES: 10485760,
    get: async (k) => pick(k),
    set: async (o) => { Object.assign(data, o); },
    remove: async (k) => { for (const x of [].concat(k)) delete data[x]; },
    clear: async () => { for (const k of Object.keys(data)) delete data[k]; },
    getKeys: async () => Object.keys(data),
    getBytesInUse: async () => Buffer.byteLength(JSON.stringify(data), 'utf8'), // بالبايت كما في chrome-storage.js (U104)
  };
}

/** حدث chrome: addListener يسجّل، والقائمة `listeners` للفحص. */
function chromeEvent() {
  const listeners = [];
  return { listeners, addListener: (f) => listeners.push(f), removeListener: (f) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); }, hasListener: (f) => listeners.includes(f) };
}

/**
 * @param {{ permissions?: string[], tabs?: object, search?: string, href?: string, storage?: Record<string, unknown> }} [o]
 */
export function createEntryEnv({ permissions = [], tabs = {}, search = '', href = 'chrome-extension://tj/pages/x/index.html', storage } = {}) {
  const proto = FakeElement.prototype;
  if (!proto.appendChild) proto.appendChild = function appendChild(n) { this.append(n); return n; };
  const doc = new FakeDocument();
  doc.querySelector = (sel) => doc.documentElement.querySelector(sel);
  const app = doc.createElement('main');
  app.setAttribute('id', 'app');
  doc.body.append(app);
  const events = { onMessage: chromeEvent(), storageChanged: chromeEvent() };
  const created = [];
  const chromeApi = {
    runtime: {
      id: 'tj-test-id',
      getManifest: () => ({ version: '1.0.0', permissions }),
      getURL: (p) => `chrome-extension://tj/${p}`,
      onMessage: events.onMessage,
      sendMessage: async () => ({ v: 1, ok: true }),
    },
    i18n: { getUILanguage: () => 'ar' },
    downloads: {},
    tabs: {
      create: async (o) => { created.push(o); return { id: 1 }; },
      query: async () => [],
      sendMessage: async () => undefined,
      ...tabs,
    },
    storage: { local: memoryLocal(storage), onChanged: events.storageChanged },
  };
  const winListeners = new Map();
  const win = {
    document: doc,
    location: { origin: 'https://www.youtube.com', href: 'https://www.youtube.com/', search, pathname: '/', hostname: 'www.youtube.com' },
    addEventListener: (type, fn) => winListeners.set(type, [...(winListeners.get(type) ?? []), fn]),
    removeEventListener() {},
    setInterval: () => 0,
    clearInterval() {},
    setTimeout: () => 0,
    clearTimeout() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    close() { win.closed = true; },
    closed: false,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  doc.defaultView = win;
  const keys = ['chrome', 'document', 'window', 'location'];
  const saved = new Map();
  return {
    doc, app, win, chrome: chromeApi, events, created, winListeners,
    install() {
      for (const k of keys) saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
      Object.defineProperty(globalThis, 'chrome', { value: chromeApi, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'location', { value: { ...win.location, search, href }, configurable: true, writable: true });
      return () => {
        for (const k of keys) {
          const d = saved.get(k);
          if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k];
        }
      };
    },
  };
}
