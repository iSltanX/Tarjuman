// TJ-01 مقابل U03: ما يضيفه DeepSeek. ثلاث حالات على الوحدات الحقيقية (chromeLocalArea وcreateStore والمحفوظات والإعدادات)
// فوق محاكاة التخزين وDOM الاختبارات الوهمي. لا متصفح ولا شبكة.
// (أ) مكتبة فارغة بلا getBytesInUse: هل تسقط المحفوظات أيضًا؟
// (ب) getBytesInUse موجودة لكنها ترفض للمفاتيح المحددة (فشل عابر لـbundleBytes وحده، في أي متصفح): هل يختفي التوسيع كله؟
// (ج) الحالة نفسها في سطر «الترجمات والنسخ السابقة» في الإعدادات: هل تُمحى الأعداد أيضًا؟
const T = new URL('../tj3/', import.meta.url).pathname;
const { chromeLocalArea } = await import(`${T}src/core/store/area.js`);
const { createStore } = await import(`${T}src/core/store/index.js`);
const { createLibrary } = await import(`${T}src/pages/library/view.js`);
const { createSettings } = await import(`${T}src/pages/settings/view.js`);
const { createMemoryArea } = await import(`${T}test/helpers/chrome-storage.js`);
const { sampleBundle, seedBundle } = await import(`${T}test/helpers/fixtures-v2.js`);
const { newDocument, settle, textOf, buttonNamed } = await import(`${T}test/unit/pages/library/fake-dom.js`);

function fakeChrome({ bytes }) {
  const mem = createMemoryArea({ unlimited: true });
  const local = { get: (k) => mem.get(k), set: (i) => mem.set(i), remove: (k) => mem.remove(k), clear: () => mem.clear(), getKeys: () => mem.getKeys() };
  if (bytes === 'ok') local.getBytesInUse = (k) => mem.getBytesInUse(k);
  if (bytes === 'keys-fail') local.getBytesInUse = (k) => (k === null ? mem.getBytesInUse(k) : Promise.reject(new Error('transient')));
  const listeners = new Set();
  mem.onChanged((changes) => { for (const fn of listeners) fn(changes, 'local'); });
  return { mem, api: { storage: { local, onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } }, runtime: { getManifest: () => ({ permissions: ['storage', 'unlimitedStorage', 'downloads'] }) } } };
}
async function library(store) {
  const doc = newDocument();
  const lib = createLibrary({ store, doc, now: () => Date.now(), openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}', confirm: async () => false });
  doc.body.append(lib.root);
  await lib.load();
  await settle(5);
  return lib;
}
async function settingsLines(store) {
  const sdoc = newDocument();
  const st = createSettings({ store, version: '1.1.0', doc: sdoc, clipboardWrite: async () => {}, diagnosticsText: async () => '{}', setTimer: () => 0, clearTimer: () => {} });
  sdoc.body.append(st.root);
  await st.load();
  await settle(10);
  const s = st.root.querySelector('section[data-section="storage"]');
  const out = { quota: textOf(s.querySelector('.st-quota__text')), library: textOf(s.querySelector('.st-library-usage')), bytes: textOf(s.querySelector('.st-library-bytes')) };
  st.dispose();
  return out;
}

console.log('=== (أ) مكتبة فارغة، getBytesInUse غائبة ===');
{
  const { api } = fakeChrome({ bytes: 'absent' });
  const store = createStore({ area: chromeLocalArea(api) });
  const lib = await library(store);
  console.log('library.status =', lib.state.status, '| rows =', lib.root.querySelectorAll('li.lib-row').length, '| code =', lib.state.error?.code ?? null);
  console.log('الإعدادات:', JSON.stringify(await settingsLines(store)));
  lib.dispose();
}
for (const bytes of ['ok', 'keys-fail']) {
  console.log(`\n=== (ب/ج) فيديو له نسخة سابقة، getBytesInUse: ${bytes === 'ok' ? 'تعمل' : 'تعمل لـnull وترفض للمفاتيح (فشل عابر)'} ===`);
  const { api, mem } = fakeChrome({ bytes });
  const store = createStore({ area: chromeLocalArea(api) });
  await seedBundle(store, sampleBundle({ videoId: 'AAAAAAAAAAA', previous: true }));
  await mem.flush();
  const lib = await library(store);
  console.log('library.status =', lib.state.status, '| rows =', lib.root.querySelectorAll('li.lib-row').length);
  const row = lib.root.querySelector('li.lib-row');
  if (row) {
    buttonNamed(row, 'إظهار الترجمات')?.click();
    await settle(10);
    const exp = row.querySelector('.lib-exp');
    const cards = exp ? exp.querySelectorAll('section.lib-card').length : -1;
    const alert = exp?.querySelector('.tj-alert');
    const btns = exp ? exp.querySelectorAll('button').length : -1;
    console.log('التوسيع: بطاقات =', cards, '| أزرار =', btns, '| تنبيه =', alert ? textOf(alert) : null);
  }
  console.log('الإعدادات:', JSON.stringify(await settingsLines(store)));
  lib.dispose();
}
