// A3 — Codex الملاحظة 6 وGemini F-11: استعادة تفضيلات اللغات عبر صفحة الإعدادات الحقيقية (createSettings بـDOM وهمي فوق تخزين
// بمحاكاة)، بنمط اختبار المشروع test/unit/pages/settings/c7-settings.test.js (U54). فشل setLangPrefs محقون وحده؛ setSettings
// وsetPrefs حقيقيان.
// التشغيل: command node restore-langprefs.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('usage: node restore-langprefs.mjs <code-root>');
const { createBackup } = await import(`${R}/src/core/backup/index.js`);
const { runRestore, mergeReports, settingsFailureCode, reportCode } = await import(`${R}/src/core/backup/restore.js`);
const { TjError, messageFor } = await import(`${R}/src/core/errors/index.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { createSettings } = await import(`${R}/src/pages/settings/view.js`);
const { LANGS_TEXT } = await import(`${R}/src/pages/settings/langs.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW } = await import(`${R}/test/helpers/fixtures.js`);
const { samplePrefs, sampleBundle, seedBundle } = await import(`${R}/test/helpers/fixtures-v2.js`);
const { buttonNamed, findAll, newDocument, settle, textOf } = await import(`${R}/test/unit/pages/library/fake-dom.js`);

const out = (label, actual, expected) => console.log(`${label}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${JSON.stringify(actual) === JSON.stringify(expected) ? 'مطابق' : 'مخالف'}`);
const noPause = () => Promise.resolve();
const ID = 'AAAAAAAAAAA';
function newStore(area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true })) {
  let t = Date.parse(NOW);
  return { area, store: createStore({ area, now: () => (t += 1000) }) };
}
async function mount({ store, area }) {
  await area.flush();
  const doc = newDocument();
  const answers = [];
  let picked = null;
  const settings = createSettings({
    store, doc, version: '2.0.0', now: () => Date.parse('2026-11-05T10:00:00.000Z'), pause: noPause,
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), savedPath: async () => null,
    pickFile: async () => picked,
    confirm: async (o) => { const a = answers.shift(); if (typeof a === 'function') await a(o); return a !== undefined && a !== false; },
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(settings.root);
  await settings.load();
  await settle(10);
  return { settings, doc, answers, root: settings.root, pick: (f) => { picked = f; } };
}
const asFile = (text) => ({ size: text.length, text: async () => text });
const checkbox = (root, label) => findAll(root, (e) => e.tagName === 'input' && e.getAttribute('type') === 'checkbox').find((b) => textOf(b.parentNode) === label);
const rowOf = (sec, label) => findAll(sec, (e) => e.classList.contains('st-row') && textOf(e.querySelector('.tj-label') ?? { textContent: '' }) === label)[0];
const dataSec = (m) => m.root.querySelector('#data');
const langsView = (m) => {
  const sec = m.root.querySelector('section[data-section="langs"]');
  return { pair: findAll(rowOf(sec, LANGS_TEXT.pair), (e) => e.classList.contains('tj-lang__v')).map(textOf), remember: sec.querySelector('#st-lang-remember').checked };
};
const alertState = (m) => {
  const sec = dataSec(m);
  const t = textOf(sec);
  return {
    title: ['BK_RESTORE_DONE', 'BK_RESTORE_PARTIAL', 'BK_RESTORE_STOPPED'].find((c) => t.includes(messageFor(c))) ?? null,
    settingsLine: ['BK_RESTORE_SETTINGS_FAILED', 'BK_RESTORE_PREFS_PART_FAILED', 'BK_RESTORE_SETTINGS_PART_FAILED'].find((c) => t.includes(messageFor(c)))
      ?? (t.includes('استُعيدت الإعدادات والقاموس.') ? 'استُعيدت الإعدادات والقاموس.' : null),
    retryButton: buttonNamed(sec, 'أعد المحاولة') !== null,
  };
};

// ---- النسخة: إعدادات وقاموس وتفضيلات لغات غير افتراضية ----
const src = newStore();
await seedBundle(src.store, sampleBundle({ videoId: ID }));
await src.store.setSettings({ offsetStepMs: 1000 });
await src.store.setPrefs(samplePrefs());
await src.store.setLangPrefs({ pair: { from: 'ja', to: 'en' }, remember: false, recent: ['ja', 'fr'], video: { videoId: ID, pair: { from: 'ja', to: 'en' } } });
const built = await createBackup({ store: src.store, appVersion: '2.0.0', pause: noPause });
const wantLang = await src.store.getLangPrefs();

function faultyStore(failLang) {
  const dst = newStore();
  const calls = { settings: 0, prefs: 0, lang: 0 };
  const faulty = Object.create(dst.store);
  faulty.setSettings = (p) => { calls.settings++; return dst.store.setSettings(p); };
  faulty.setPrefs = (p) => { calls.prefs++; return dst.store.setPrefs(p); };
  faulty.setLangPrefs = (p) => { calls.lang++; if (calls.lang <= failLang) return Promise.reject(new TjError('ST_WRITE_FAILED')); return dst.store.setLangPrefs(p); };
  return { ...dst, faulty, calls };
}
async function restoreVia(m) {
  m.pick(asFile(built.text));
  m.answers.push((o) => { checkbox(o.content, 'استعادة الإعدادات والقاموس').checked = true; });
  await m.settings.data.restoreFromFile();
  await settle(15);
}

console.log('== 6.0 شكل التقرير الحقيقي من runRestore (لا تقرير مبني يدويًا) ==');
{
  const d = faultyStore(99);
  const first = await runRestore({ store: d.faulty, items: [], settings: { offsetStepMs: 1000 }, prefs: samplePrefs(), langPrefs: wantLang, pause: noPause });
  out('التشغيل الأول (فشل اللغات وحدها)', { settings: first.settings, parts: first.parts, langPrefs: first.langPrefs }, { settings: 'failed', parts: { settings: 'restored', prefs: 'restored' }, langPrefs: 'failed' });
  // إعادة المحاولة كما تبنيها data.js:327-335: settings وprefs = null (retrySettings)، وlangPrefs تُمرَّر لأن report.langPrefs === 'failed'.
  const retry = await runRestore({ store: d.faulty, items: [], settings: null, prefs: null, langPrefs: wantLang, pause: noPause });
  out('تقرير إعادة المحاولة الحقيقي (اللغات تُعاد فعلًا ثم تفشل)', { settings: retry.settings, parts: retry.parts, langPrefs: retry.langPrefs, langAttempts: d.calls.lang }, { settings: 'failed', parts: { settings: null, prefs: null }, langPrefs: 'failed', langAttempts: 2 });
  const merged = mergeReports(first, retry);
  out('الدمج mergeReports', { settings: merged.settings, langPrefs: merged.langPrefs ?? '(محذوف)', code: reportCode(merged) }, { settings: 'failed', langPrefs: 'failed', code: 'BK_RESTORE_PARTIAL' });
  out('settingsFailureCode للتشغيل الأول', settingsFailureCode(first), '(رمز يخص اللغات، لا BK_RESTORE_SETTINGS_FAILED)');
}

console.log('\n== 6.أ/ب عبر الصفحة: فشل اللغات مرة ثم نجاحها في «أعد المحاولة» ==');
{
  const d = faultyStore(1);
  const m = await mount({ store: d.faulty, area: d.area });
  const beforeLangs = langsView(m);
  await restoreVia(m);
  const s1 = alertState(m);
  const stored1 = { offsetStepMs: (await d.store.getSettings()).offsetStepMs, terms: (await d.store.getPrefs()).glossary.terms.length };
  out('التقرير الأول: العنوان وسطر الإعدادات وزر المحاولة', { title: s1.title, settingsLine: s1.settingsLine, retryButton: s1.retryButton },
    { title: 'BK_RESTORE_PARTIAL', settingsLine: '(سطر يقول إن اللغات وحدها تعذّرت)', retryButton: true });
  console.log(`  نص السطر المعروض: «${messageFor(s1.settingsLine)}»`);
  out('  القيم المخزّنة فعلًا بعد التقرير الأول (الإعدادات والقاموس)', stored1, { offsetStepMs: 1000, terms: samplePrefs().glossary.terms.length });
  buttonNamed(dataSec(m), 'أعد المحاولة').click();
  await settle(20);
  const s2 = alertState(m);
  out('بعد «أعد المحاولة» (نجحت اللغات): العنوان، ومحاولات اللغات، وكتابات الإعدادات، والمخزَّن',
    { title: s2.title, retryButton: s2.retryButton, langAttempts: d.calls.lang, settingsWrites: d.calls.settings, langStored: (await d.store.getLangPrefs()).pair },
    { title: 'BK_RESTORE_DONE', retryButton: false, langAttempts: 2, settingsWrites: 1, langStored: { from: 'ja', to: 'en' } });
  out('قسم اللغات في الصفحة نفسها قبل الاستعادة ← بعدها (بلا إعادة تحميل)', { before: beforeLangs, after: langsView(m) }, { before: beforeLangs, after: { pair: ['اليابانية', 'الإنجليزية'], remember: false } });
}

console.log('\n== 6.أ عبر الصفحة: فشل اللغات مرتين (في التشغيل وفي «أعد المحاولة») ==');
{
  const d = faultyStore(2);
  const m = await mount({ store: d.faulty, area: d.area });
  await restoreVia(m);
  buttonNamed(dataSec(m), 'أعد المحاولة').click();
  await settle(20);
  const s = alertState(m);
  out('بعد المحاولة الثانية الفاشلة: العنوان وسطر الإعدادات وزر المحاولة',
    { title: s.title, settingsLine: s.settingsLine, retryButton: s.retryButton },
    { title: 'BK_RESTORE_PARTIAL', settingsLine: '(سطر فشل اللغات)', retryButton: true });
  out('  المخزَّن فعلًا: تفضيلات اللغات', { pair: (await d.store.getLangPrefs()).pair, remember: (await d.store.getLangPrefs()).remember, videos: Object.keys((await d.store.getLangPrefs()).videos) }, { pair: wantLang.pair, remember: wantLang.remember, videos: Object.keys(wantLang.videos) });
  console.log(`  محاولات setLangPrefs: ${d.calls.lang}`);
}

console.log('\n== 6.د قسم اللغات بعد «مسح كل البيانات» (بلا langs.load) ==');
{
  const d = faultyStore(0);
  const m = await mount({ store: d.faulty, area: d.area });
  await restoreVia(m);
  const afterRestore = langsView(m);
  const clearBtn = buttonNamed(m.root.querySelector('#storage'), 'مسح كل البيانات');
  m.answers.push((o) => { o.content.querySelector('input').value = 'امسح'; });
  clearBtn.click();
  await settle(25);
  const afterClear = langsView(m);
  const stored = await d.store.getLangPrefs();
  out('قسم اللغات: بعد الاستعادة ← بعد المسح، والمخزَّن بعد المسح',
    { afterRestore, afterClear, storedPair: stored.pair, storedRemember: stored.remember },
    { afterRestore, afterClear: { pair: ['تلقائي من مسار الفيديو', 'العربية'], remember: true }, storedPair: { from: 'auto', to: 'ar' }, storedRemember: true });
}
