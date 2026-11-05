// P-1 وL-5: Firefox 140–143 بلا storage.local.getBytesInUse (وبلا getKeys قبل 143). يمرّ عبر chromeLocalArea الحقيقي
// بمحاكاة chrome.storage.local تُحذف منها الدالتان، ثم يركّب المحفوظات والإعدادات والتوسيع والتشخيص على DOM وهمي.
const T = '$SCRATCH/tj';
const { chromeLocalArea } = await import(`${T}/src/core/store/area.js`);
const { createStore } = await import(`${T}/src/core/store/index.js`);
const { createLibrary } = await import(`${T}/src/pages/library/view.js`);
const { createSettings } = await import(`${T}/src/pages/settings/view.js`);
const { collectDiagnostics } = await import(`${T}/src/pages/settings/diagnostics.js`);
const { createMemoryArea } = await import(`${T}/test/helpers/chrome-storage.js`);
const { sampleBundle, seedBundle } = await import(`${T}/test/helpers/fixtures-v2.js`);
const { newDocument, settle, textOf, buttonNamed } = await import(`${T}/test/unit/pages/library/fake-dom.js`);

function fakeChrome({ withBytes }) {
  const mem = createMemoryArea({ unlimited: true });
  const local = {
    get: (k) => mem.get(k), set: (i) => mem.set(i), remove: (k) => mem.remove(k), clear: () => mem.clear(),
    QUOTA_BYTES: 10485760,
  };
  if (withBytes) local.getBytesInUse = (k) => mem.getBytesInUse(k);
  // لا getKeys (Firefox < 143): area.js يرجع إلى get(null).
  const listeners = new Set();
  mem.onChanged((changes) => { for (const fn of listeners) fn(changes, 'local'); });
  return {
    mem,
    api: {
      storage: { local, onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) } },
      runtime: { getManifest: () => ({ permissions: ['storage', 'unlimitedStorage', 'downloads'] }) },
    },
  };
}

for (const withBytes of [true, false]) {
  console.log(`\n=== storage.local.getBytesInUse ${withBytes ? 'موجودة' : 'غائبة (Firefox 140–143)'} ===`);
  const { api, mem } = fakeChrome({ withBytes });
  const area = chromeLocalArea(api);
  const store = createStore({ area });
  await seedBundle(store, sampleBundle({ videoId: 'AAAAAAAAAAA' }));
  await mem.flush();
  // capacity مباشرة
  try {
    const cap = await store.capacity();
    console.log('capacity:', JSON.stringify(cap));
  } catch (e) { console.log('capacity يرمي:', e.code, '|', String(e.detail ?? e.message)); }
  // المحفوظات
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.now(), openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }),
    clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}', confirm: async () => false,
  });
  doc.body.append(lib.root);
  await lib.load();
  await settle(5);
  console.log('library.status =', lib.state.status, '| entries =', lib.state.entries.length, '| rows =', lib.root.querySelectorAll('li.lib-row').length);
  if (lib.state.status === 'error') {
    const alert = lib.root.querySelector('.lib-state--error');
    console.log('نص الخطأ:', textOf(alert));
  }
  // التوسيع (له نسخة سابقة فيقرأ bundleBytes) — يحتاج الصف
  const row = lib.root.querySelector('li.lib-row');
  if (row) {
    buttonNamed(row, 'إظهار الترجمات')?.click();
    await settle(10);
    const exp = row.querySelector('.lib-exp');
    console.log('التوسيع:', exp ? (exp.querySelector('.tj-alert') ? `تنبيه: ${textOf(exp.querySelector('.tj-alert'))}` : `بطاقات=${exp.querySelectorAll('section.lib-card').length}`) : 'لا توسيع');
  }
  lib.dispose();
  // الإعدادات: قسم التخزين
  const sdoc = newDocument();
  const st = createSettings({ store, version: '1.1.0', doc: sdoc, clipboardWrite: async () => {}, diagnosticsText: async () => '{}', setTimer: (fn) => 0, clearTimer: () => {} });
  sdoc.body.append(st.root);
  await st.load();
  await settle(10);
  const storage = st.root.querySelector('section[data-section="storage"]');
  console.log('التخزين/المساحة:', textOf(storage.querySelector('.st-quota__text')));
  console.log('التخزين/الترجمات:', textOf(storage.querySelector('.st-library-usage')), '||', textOf(storage.querySelector('.st-library-bytes')));
  st.dispose();
  // تقرير التشخيص
  const diag = JSON.parse(await collectDiagnostics({ store, version: '1.1.0', nav: { userAgent: 'Firefox/142.0' }, at: '2026-11-05T00:00:00Z' }));
  console.log('التشخيص/storage:', JSON.stringify(diag.sections?.storage ?? diag.storage ?? diag));
}
