// محاكاة chrome.storage.local بواجهة StorageArea نفسها (src/core/store/area.js)، ومحاكاة دنيا لـchrome
// للصفحات والمحتوى. الحجم يُقاس كما في Chrome: بايتات المفتاح + بايتات JSON للقيمة بترميز UTF-8 (تدقيق 7a66f91، U104: كان
// بوحدات UTF-16 فيقلّ حجم العربية إلى النصف في اختبارات الحصة؛ وValueStore في Chromium يحسب طول السلسلة المرمّزة). onChanged يصل في مهمة
// لاحقة كما في المتصفح؛ flush() ينتظره.

const clone = (v) => (v === undefined ? undefined : structuredClone(v));
/** نسخة بمفاتيح الكائنات مرتبة أبجديًا كما يعيدها chrome.storage في Chromium (base::Value::Dict). */
const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
const sizeOf = (key, value) => Buffer.byteLength(key, 'utf8') + Buffer.byteLength(JSON.stringify(value), 'utf8');

/**
 * @param {{ quotaBytes?: number, unlimited?: boolean, initial?: Record<string, unknown>, eventsBeforeResolve?: boolean, chromiumKeyOrder?: boolean }} [opts]
 *   eventsBeforeResolve: يصل onChanged قبل أن يُحلّ وعد الكتابة (ترتيب لا يضمنه Chrome في أي اتجاه)
 *   chromiumKeyOrder: get يعيد مفاتيح الكائنات مرتبة كما في المتصفح الحقيقي (تدقيق 5fedcb9، GM-010)
 */
export function createMemoryArea({ quotaBytes = 10485760, unlimited = false, initial = {}, eventsBeforeResolve = false, chromiumKeyOrder = false } = {}) {
  const data = new Map(Object.entries(structuredClone(initial)));
  const listeners = new Set();
  const failures = new Map();
  let pending = [];

  const total = (map = data) => [...map].reduce((s, [k, v]) => s + sizeOf(k, v), 0);
  const maybeFail = (method) => {
    const err = failures.get(method);
    if (err) {
      failures.delete(method);
      throw err;
    }
  };
  const emit = (changes) => {
    if (!Object.keys(changes).length) return Promise.resolve();
    const deliver = () => {
      for (const fn of listeners) fn(clone(changes), 'local');
    };
    if (eventsBeforeResolve) {
      deliver();
      return Promise.resolve();
    }
    const p = new Promise((resolve) => {
      setTimeout(() => {
        deliver();
        resolve();
      }, 0);
    });
    pending.push(p);
    return p;
  };
  const keysOf = (keys) => (keys === null || keys === undefined ? [...data.keys()] : Array.isArray(keys) ? keys : [keys]);

  const api = {
    async get(keys) {
      maybeFail('get');
      const out = {};
      for (const k of keysOf(keys)) if (data.has(k)) out[k] = chromiumKeyOrder ? sorted(data.get(k)) : clone(data.get(k));
      return out;
    },
    async set(items) {
      maybeFail('set');
      const next = new Map(data);
      for (const [k, v] of Object.entries(items)) next.set(k, clone(v));
      if (!unlimited && total(next) > quotaBytes) throw new Error('Resource::kQuotaBytes quota exceeded');
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: clone(data.get(k)), newValue: clone(v) };
        if (changes[k].oldValue === undefined) delete changes[k].oldValue;
        data.set(k, clone(v));
      }
      emit(changes);
    },
    async remove(keys) {
      maybeFail('remove');
      const changes = {};
      for (const k of keysOf(keys)) {
        if (!data.has(k)) continue;
        changes[k] = { oldValue: clone(data.get(k)) };
        data.delete(k);
      }
      emit(changes);
    },
    async clear() {
      maybeFail('clear');
      const changes = {};
      for (const [k, v] of data) changes[k] = { oldValue: clone(v) };
      data.clear();
      emit(changes);
    },
    async getKeys() {
      maybeFail('getKeys');
      return [...data.keys()];
    },
    async getBytesInUse(keys) {
      maybeFail('getBytesInUse');
      return keysOf(keys).filter((k) => data.has(k)).reduce((s, k) => s + sizeOf(k, data.get(k)), 0);
    },
    onChanged(fn) {
      const wrapped = (changes) => fn(changes);
      listeners.add(wrapped);
      return () => listeners.delete(wrapped);
    },
    quotaBytes,
    unlimited,
    // أدوات الاختبار
    /** ينتظر وصول كل أحداث onChanged المعلّقة. */
    async flush() {
      while (pending.length) {
        const p = pending;
        pending = [];
        await Promise.all(p);
      }
    },
    /** يجعل الاستدعاء التالي للدالة يفشل بالخطأ المعطى. */
    failNext(method, err = new Error('فشل محاكى')) {
      failures.set(method, err);
    },
    /** نسخة من كل البيانات. */
    dump: () => Object.fromEntries([...data].map(([k, v]) => [k, clone(v)])),
    /** كتابة خام بلا تحقق (لمحاكاة سجل تالف أو سياق آخر). */
    rawSet(key, value) {
      const old = data.get(key);
      data.set(key, clone(value));
      emit({ [key]: { oldValue: clone(old), newValue: clone(value) } });
    },
  };
  // الأصل لكل نسخة مغلّفة ({ ...area, get }): المخازن فوقها تشترك في كاتب واحد يكتب في المساحة نفسها (C2).
  api.origin = api;
  return api;
}

/**
 * chrome دنيا فوق مساحة ذاكرة: storage.local (وعود)، وstorage.onChanged، وruntime، وtabs بسجل للاستدعاءات.
 * @param {{ area?: ReturnType<typeof createMemoryArea>, id?: string, permissions?: string[] }} [opts]
 */
export function createFakeChrome({ area = createMemoryArea(), id = 'abcdefghijklmnopabcdefghijklmnop', permissions = ['storage', 'unlimitedStorage'] } = {}) {
  const storageListeners = new Map();
  const messageListeners = new Set();
  const calls = { tabsCreate: [], tabsSendMessage: [] };
  const base = `chrome-extension://${id}/`;
  const chrome = {
    storage: {
      local: {
        get: area.get, set: area.set, remove: area.remove, clear: area.clear, getKeys: area.getKeys,
        getBytesInUse: area.getBytesInUse, QUOTA_BYTES: area.quotaBytes,
      },
      onChanged: {
        addListener(fn) {
          storageListeners.set(fn, area.onChanged((changes) => fn(changes, 'local')));
        },
        removeListener(fn) {
          storageListeners.get(fn)?.();
          storageListeners.delete(fn);
        },
      },
    },
    runtime: {
      id,
      getURL: (p) => base + String(p).replace(/^\//, ''),
      getManifest: () => ({ manifest_version: 3, permissions }),
      onMessage: {
        addListener: (fn) => messageListeners.add(fn),
        removeListener: (fn) => messageListeners.delete(fn),
      },
    },
    tabs: {
      async create(props) {
        calls.tabsCreate.push(props);
        return { id: calls.tabsCreate.length, ...props };
      },
      async query() {
        return [{ id: 1, active: true }];
      },
      async sendMessage(tabId, msg) {
        calls.tabsSendMessage.push({ tabId, msg });
        return undefined;
      },
    },
  };
  return {
    chrome,
    area,
    calls,
    /**
     * يرسل رسالة إلى مستمعي runtime.onMessage كما تفعل صفحة الإضافة، ويعيد الرد.
     * @param {unknown} msg @param {{ id?: string, url?: string }} [sender]
     */
    dispatchMessage(msg, sender = { id, url: `${base}pages/popup/index.html` }) {
      return new Promise((resolve) => {
        let answered = false;
        for (const fn of messageListeners) {
          const keep = fn(msg, sender, (reply) => {
            answered = true;
            resolve(reply);
          });
          if (keep === true) return;
        }
        if (!answered) resolve(undefined);
      });
    },
  };
}
