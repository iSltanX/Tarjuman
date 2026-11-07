// A3 — Codex الملاحظة 5: بقاء langPrefs.videos[id] بعد حذف بيانات الفيديو، وحفظ المعرّف قبل أي ترجمة، ومقارنة بمسارات الحذف الأخرى.
// التشغيل: command node delete-retention.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('usage: node delete-retention.mjs <code-root>');
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { pairPatch } = await import(`${R}/src/core/model/lang-prefs.js`);
const { deleteVideoData } = await import(`${R}/src/pages/library/actions.js`);
const { createBackup } = await import(`${R}/src/core/backup/create.js`);
const { videoKey } = await import(`${R}/src/core/store/keys.js`);
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW } = await import(`${R}/test/helpers/fixtures.js`);
const { sampleBundle, seedBundle } = await import(`${R}/test/helpers/fixtures-v2.js`);

const out = (label, actual, expected) => console.log(`${label}\n  الفعلي:   ${JSON.stringify(actual)}\n  المتوقع:  ${JSON.stringify(expected)}\n  ${JSON.stringify(actual) === JSON.stringify(expected) ? 'مطابق' : 'مخالف'}`);
const now = () => Date.parse(NOW);
const ID = 'AAAAAAAAAAA';
const fresh = () => {
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  return { area, store: createStore({ area, now }) };
};
// تغيير الزوج في النافذة على صفحة الفيديو (src/pages/popup/main.js:171-176): pairPatch ثم setLangPrefs.
const choosePair = async (store, videoId, pair, why = 'swap') => store.setLangPrefs(pairPatch(await store.getLangPrefs(), { videoId, pair, why }));
const backupOf = async (store) => JSON.parse((await createBackup({ store, appVersion: '2.0.0', now, pause: () => Promise.resolve() })).text).data;

console.log('== 5.أ اختيار زوج لفيديو لم تُحفظ له ترجمة (PRIVACY.md:35 «لا يُحفظ إلا الفيديو الذي حفظت له ترجمة») ==');
{
  const { store } = fresh();
  await choosePair(store, 'ZZZZZZZZZZZ', { from: 'ja', to: 'en' });
  out('المحفوظات / معرّفات langPrefs.videos', { library: (await store.listIndex()).map((e) => e.videoId), langVideos: Object.keys((await store.getLangPrefs()).videos) }, { library: [], langVideos: [] });
}

console.log('\n== 5.ب «حذف بيانات الفيديو» من المحفوظات (deleteVideoData scope=all بـexpect كما في library/view.js:415) ==');
{
  const { store } = fresh();
  await choosePair(store, ID, { from: 'ja', to: 'en' });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  const b = await store.getBundle(ID);
  await deleteVideoData({ store, videoId: ID, scope: 'all', expect: b, now });
  const data = await backupOf(store);
  out('بعد الحذف: المحفوظات، وlangPrefs.videos، والنسخة الاحتياطية',
    { library: (await store.listIndex()).length, langVideo: (await store.getLangPrefs()).videos[ID] ?? null, backupVideos: data.videos.length, backupLangVideo: data.langPrefs?.videos?.[ID] ?? null },
    { library: 0, langVideo: null, backupVideos: 0, backupLangVideo: null });
}

console.log('\n== 5.ج حذف سجل تالف من المحفوظات بالبصمة (deleteUnreadable: rawPrint ثم deleteVideo({print})، library/view.js:245-257) ==');
{
  const { store, area } = fresh();
  await choosePair(store, ID, { from: 'ko', to: 'ar' });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  area.rawSet(videoKey(ID), { damaged: true }); // تلف خارجي للسجل مع بقاء مُلخّصه
  await area.flush();
  const print = await store.rawPrint(ID);
  await store.deleteVideo(ID, { print });
  out('بعد حذف التالف («كل ما حُفظ لهذا الفيديو»): langPrefs.videos[id]', (await store.getLangPrefs()).videos[ID] ?? null, null);
}

console.log('\n== 5.د حذف ترجمة واحدة (scope=arabic): السجل باقٍ، فبقاء زوجه متسق (ضابط) ==');
{
  const { store } = fresh();
  await choosePair(store, ID, { from: 'ja', to: 'en' });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  const b = await store.getBundle(ID);
  await deleteVideoData({ store, videoId: ID, scope: 'arabic', n: 1, expect: b, now });
  out('بعد حذف الترجمة 1: السجل موجود، وزوج الفيديو', { record: (await store.getVideo(ID)) !== null, langVideo: (await store.getLangPrefs()).videos[ID] ?? null }, { record: true, langVideo: { from: 'ja', to: 'en' } });
}

console.log('\n== 5.هـ «مسح كل البيانات» (clearAll ← area.clear، writer.js:232-257) (ضابط) ==');
{
  const { store } = fresh();
  await choosePair(store, ID, { from: 'ja', to: 'en' });
  await seedBundle(store, sampleBundle({ videoId: ID }));
  await store.clearAll();
  out('بعد المسح: langPrefs.videos', (await store.getLangPrefs()).videos, {});
}

console.log('\n== 5.و وسائل الإعدادات في قسم اللغات (src/pages/settings/langs.js:94 و229-232): أيّها يمسّ videos؟ ==');
{
  const { store } = fresh();
  await choosePair(store, ID, { from: 'ja', to: 'en' });
  await store.setLangPrefs({ recent: [] }); // زر «مسح» اللغات الأخيرة
  await store.setLangPrefs({ pair: { from: 'auto', to: 'ar' }, remember: true }); // «استعادة الافتراضي»
  // المتوقع هنا بحسب التصميم الحالي (langs.js:229 «وتبقى الأخيرة وأزواج الفيديوهات»): لا وسيلة في الإعدادات لمسح أزواج الفيديوهات
  // سوى «مسح كل البيانات»؛ فالمطابقة تثبت غياب الوسيلة لا صحة السلوك.
  out('بعد «مسح» الأخيرة و«استعادة الافتراضي»: langPrefs.videos (المتوقع بحسب التصميم: يبقى)', (await store.getLangPrefs()).videos, { [ID]: { from: 'ja', to: 'en' } });
}
