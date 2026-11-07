// G-F03: mergeLang لا يعيد الحزمة المدمجة إلى الحدود (8 مسارات، 10 بصمات) فيرمي MD_INVALID عند القراءة.
// الحالة تُبنى بدوال المنتج: 2.0.0 (buildExport ← withExport بـkeep، readImport ← withArabicImport) ثم الرجوع إلى 1.1.0
// (لقطته المجمّدة test/fixtures/v1.1: createStore وwithExport بـkeep كما في متحكمه) يصدّر مسارات إنجليزية، ثم 2.0.0 يقرأ.
// وضابط: هل يبلغ 2.0.0 الحالة وحده؟ وما أثر MD_INVALID على القراءة والمحفوظات والنسخة الاحتياطية والحذف، وهل البيانات سليمة؟
// الاستعمال: command node f03-mergelang-limits.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('جذر الشيفرة مطلوب');
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, VIDEO_ID: A, makeCues } = await import(`${R}/test/helpers/fixtures.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { buildExport } = await import(`${R}/src/core/export/index.js`);
const { readImport } = await import(`${R}/src/core/import/index.js`);
const { withExport, withArabicImport } = await import(`${R}/src/core/model/transitions.js`);
const { referencedFingerprints } = await import(`${R}/src/core/model/bundle.js`);
const { createBackup } = await import(`${R}/src/core/backup/create.js`);
const { writeSrt } = await import(`${R}/src/core/srt/writer.js`);
const { createStore: createStoreV11 } = await import(`${R}/test/fixtures/v1.1/src/core/store/index.js`);
const v11 = await import(`${R}/test/fixtures/v1.1/src/core/model/transitions.js`);
const { referencedFingerprints: refsV11 } = await import(`${R}/test/fixtures/v1.1/src/core/model/bundle.js`);
const { validateVideoRecord: validateV11 } = await import(`${R}/test/fixtures/v1.1/src/core/model/video.js`);

const noPause = async () => {};
let tick = Date.parse(NOW);
const clock = () => (tick += 1000);
const iso = () => new Date(clock()).toISOString();
const show = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(`  ${label}\n    الفعلي:   ${a}\n    المتوقع:  ${e}\n    ${a === e ? 'مطابق' : 'مختلف'}`);
};
const track = (lang, kind = 'manual') => ({ key: `${lang}|${kind}`, lang, kind, capturedAt: NOW, source: 'capture', cues: makeCues(4, { text: (i) => `${lang} ${i}` }) });
const fpOf = (t) => buildExport({ videoId: A, track: t, mode: 'normal', now: clock(), target: 'ar' }).fingerprint;

/** تصدير في 2.0.0 كما في controller.recordExport (keep من الحزمة). */
async function export20(store, t) {
  const keep = referencedFingerprints(await store.getBundle(A));
  await store.updateVideo(A, (rec) => withExport(rec, { videoId: A, title: 'فيديو', durationMs: 60000, englishTrack: t, fingerprint: fpOf(t) }, iso(), { keep }));
}
/** تصدير في 1.1.0 كما في متحكمه (keep من حزمته). */
async function export11(store, t) {
  const keep = refsV11(await store.getBundle(A));
  await store.updateVideo(A, (rec) => v11.withExport(rec, { videoId: A, englishTrack: t, fingerprint: fpOf(t) }, iso(), { keep }));
}
/** ترجمة مرجعها بصمة المسار ref (اختيار البصمة كما في readImport). */
async function import20(store, ref) {
  const rec = await store.getVideo(A);
  const imp = await readImport(new File([writeSrt(ref.cues.map((c) => ({ ...c, text: `ترجمة ${c.n}` })))], `${A}.ar.srt`), { fingerprints: rec.fingerprints.filter((f) => f.trackKey === ref.key), lang: 'ar' });
  await store.updateVideo(A, (r) => withArabicImport(r, { videoId: A, fileName: imp.fileName, cues: imp.cues, comparison: imp.comparison, fingerprintId: imp.fingerprintId, notes: imp.notes, lang: 'ar' }, iso()).record);
}
async function tryRead(store) {
  try {
    const b = await store.getBundle(A);
    return { ok: true, english: b.record.english.length, prints: b.record.fingerprints.length };
  } catch (err) {
    return { ok: false, code: err.code, detail: err.details?.detail ?? err.detail ?? null };
  }
}
const counts = (d) => ({ recordEnglish: d[`video:${A}`].english.length, recordPrints: d[`video:${A}`].fingerprints.length, langSources: d[`lang:${A}`]?.sources.length ?? 0, langPrints: d[`lang:${A}`]?.prints.length ?? 0 });

async function effects(area, title) {
  console.log(`  -- أثر الحالة (${title}) --`);
  const before = JSON.stringify(area.dump());
  const s = createStore({ area, now: clock });
  show('getBundle في 2.0.0 (المشغّل والمحرّر والتوسيع يقرؤون الحزمة)', await tryRead(s), { ok: true, english: '<= 8', prints: '<= 10' });
  show('getBundle مرة ثانية (لا تعافٍ ذاتي)', (await tryRead(createStore({ area, now: clock }))).ok, true);
  const rows = await s.listLibrary();
  show('listLibrary: الصف يظهر (بمُلخّص الفهرس)', rows.map((r) => [r.entry.videoId, r.slots.filter((x) => x.filled).length]), [[A, 1]]);
  const bk = await createBackup({ store: s, appVersion: '2.0.0', pause: noPause });
  show('createBackup: {videos, skipped}', { videos: JSON.parse(bk.text).videos?.length ?? JSON.parse(bk.text).data?.videos?.length ?? null, skipped: bk.skipped }, { videos: 1, skipped: [] });
  show('التخزين لم يتغير بالقراءة الفاشلة (البيانات على القرص كما هي)', JSON.stringify(area.dump()) === before, true);
  const r11 = await tryRead(createStoreV11({ area: createMemoryArea({ unlimited: true, initial: JSON.parse(before) }), now: clock }));
  show('1.1.0 يقرأ التخزين نفسه', r11.ok, true);
  const del = createMemoryArea({ unlimited: true, initial: JSON.parse(before) });
  await createStore({ area: del, now: clock }).deleteVideo(A);
  show('deleteVideo في 2.0.0 ينجح (الخروج الوحيد يحذف الفيديو كله)', Object.keys(del.dump()).filter((k) => k.endsWith(A)), []);
}

console.log('=== ضابط: 2.0.0 وحده لا يتجاوز الحد بمسارات ذات بصمات؟ (8 مسارات بثماني بصمات ثم مسار تاسع) ===');
{
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  const s = createStore({ area, now: clock });
  const langs = ['en', 'ja', 'fr', 'de', 'es', 'ko', 'it', 'pt'];
  for (const l of langs) await export20(s, track(l));
  show('بعد 8 تصديرات لثماني لغات', counts(area.dump()), { recordEnglish: 1, recordPrints: 1, langSources: 7, langPrints: 7 });
  let thrown = null;
  try {
    await export20(s, track('ru'));
  } catch (err) {
    thrown = { code: err.code, detail: err.details?.detail ?? null };
  }
  show('تصدير مسار تاسع (ru) في 2.0.0 وحده', thrown, null);
  console.log('    (ملاحظة مستقلة: putEnglish في transitions.js لا يُسقط مسارًا له بصمة، فالتصدير التاسع يُرفض MD_INVALID قبل أي كتابة.)');
}

console.log('\n=== السيناريو أ (البصمات): ترجمة مرجعها بصمة يابانية + بصمات إنجليزية تملأ الحد في 1.1.0 ===');
{
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  const s = createStore({ area, now: clock });
  const ja = track('ja');
  const en = track('en');
  await export20(s, ja);
  await import20(s, ja);
  for (let i = 0; i < 9; i++) await export20(s, en); // كل تصدير بصمة جديدة (newFingerprintId)
  show('2.0.0 قبل الرجوع: الحزمة في الحدود', await tryRead(s), { ok: true, english: 2, prints: 10 });
  show('2.0.0 قبل الرجوع: الإسقاط', counts(area.dump()), { recordEnglish: 1, recordPrints: 9, langSources: 1, langPrints: 1 });
  const s11 = createStoreV11({ area, now: clock });
  await export11(s11, en); // تصدير واحد في 1.1.0
  const d = area.dump();
  show('بعد تصدير واحد في 1.1.0: الإسقاط (1.1.0 في حدوده: 10 بصمات إنجليزية)', counts(d), { recordEnglish: 1, recordPrints: 10, langSources: 1, langPrints: 1 });
  show('سجل 1.1.0 صالح بمدققه', validateV11(d[`video:${A}`]).ok, true);
  await effects(area, 'أ');
}

console.log('\n=== السيناريو ب (المسارات): ستة مسارات بغير الإنجليزية لها بصمات + مساران إنجليزيان، ثم 1.1.0 يضيف en-GB ===');
{
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  const s = createStore({ area, now: clock });
  const foreign = ['ja', 'fr', 'de', 'es', 'ko', 'it'].map((l) => track(l));
  for (const t of foreign) await export20(s, t);
  await export20(s, track('en'));
  await export20(s, track('en', 'asr'));
  await import20(s, foreign[0]);
  show('2.0.0 قبل الرجوع', await tryRead(s), { ok: true, english: 8, prints: 8 });
  const s11 = createStoreV11({ area, now: clock });
  await export11(s11, track('en-GB'));
  show('بعد تصدير en-GB في 1.1.0: الإسقاط', counts(area.dump()), { recordEnglish: 3, recordPrints: 3, langSources: 6, langPrints: 6 });
  await effects(area, 'ب');
}
