// G-F01: مُلخّص الفهرس والمحفوظات والتشخيص لترجمة مرجعها مسار بغير الإنجليزية.
// الحالة تُبنى بتدفق المنتج: buildExport لمسار ياباني (البصمة) ← withExport كما في controller.recordExport ←
// readImport لملف ينقصه مقطع ← withArabicImport كما في controller.loadArabic. ثم تُقرأ المحفوظات بالمسارات الثلاثة:
// بلا رأس (headless)، وبرأس مطابق (fromHead)، والقراءة الكاملة (readBundle).
// الاستعمال: command node f01-index-foreign-comparison.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('جذر الشيفرة مطلوب');
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, VIDEO_ID, makeCues } = await import(`${R}/test/helpers/fixtures.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { buildExport } = await import(`${R}/src/core/export/index.js`);
const { readImport } = await import(`${R}/src/core/import/index.js`);
const { withExport, withArabicImport } = await import(`${R}/src/core/model/transitions.js`);
const { withSlotName, withSlotEdit, summarizeBundle } = await import(`${R}/src/core/model/bundle.js`);
const { summarizeVideo } = await import(`${R}/src/core/model/video.js`);
const { libraryEntries, rowStatus, filterEntries, filterCounts } = await import(`${R}/src/pages/library/model.js`);
const { librarySummary } = await import(`${R}/src/pages/settings/diagnostics.js`);
const { writeSrt } = await import(`${R}/src/core/srt/writer.js`);

const clock = (start) => { let t = start; return () => (t += 1000); };
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const show = (label, actual, expected) => {
  const a = canon(actual);
  const e = canon(expected);
  console.log(`  ${label}\n    الفعلي:   ${a}\n    المتوقع:  ${e}\n    ${a === e ? 'مطابق' : 'مختلف'}`);
};

/** مسار ملتقط كما يبنيه المتحكم (sourceTrack في src/content/controller.js). */
const captured = (key, lang, kind, cues, via) => ({ key, lang, kind, capturedAt: NOW, source: 'capture', cues, ...(via ? { via } : {}) });

/**
 * تصدير ثم استيراد ترجمة ينقصها المقطع الأخير، على فيديو مصدره مسار track.
 * @returns {Promise<{ area, store }>}
 */
async function seed(track, { alsoEnglish = false } = {}) {
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  const store = createStore({ area, now: clock(Date.parse(NOW)) });
  const at = () => new Date().toISOString();
  // ١) التصدير (أدوات الشريط): buildExport يعطي البصمة، وrecordExport يحفظ المسار والبصمة.
  const built = buildExport({ videoId: VIDEO_ID, track, mode: 'normal', now: Date.parse(NOW), target: 'ar' });
  await store.updateVideo(VIDEO_ID, (rec) => withExport(rec, { videoId: VIDEO_ID, title: 'فيديو', durationMs: 60000, englishTrack: track, fingerprint: built.fingerprint }, at(), { keep: [] }));
  if (alsoEnglish) {
    const en = captured('en|manual', 'en', 'manual', makeCues(3, { text: (i) => `line ${i}` }));
    const b2 = buildExport({ videoId: VIDEO_ID, track: en, mode: 'normal', now: Date.parse(NOW) - 60000, target: 'ar' });
    await store.updateVideo(VIDEO_ID, (rec) => withExport(rec, { videoId: VIDEO_ID, englishTrack: en, fingerprint: b2.fingerprint }, at(), { keep: [] }));
  }
  // ٢) الاستيراد: readImport ببصمات السجل المحفوظ (كما يفعل المتحكم والرفع)، وملف ينقصه المقطع 3.
  const saved = await store.getVideo(VIDEO_ID);
  const arCues = track.cues.slice(0, 2).map((c) => ({ ...c, text: `ترجمة ${c.n}` }));
  const file = new File([writeSrt(arCues)], `${VIDEO_ID}.ar.srt`);
  const imp = await readImport(file, { fingerprints: saved.fingerprints.filter((f) => f.trackKey === track.key), lang: 'ar' });
  if (!imp.ok) throw new Error(JSON.stringify(imp.error));
  await store.updateVideo(VIDEO_ID, (rec) => withArabicImport(rec, {
    videoId: VIDEO_ID, fileName: imp.fileName, cues: imp.cues, comparison: imp.comparison, fingerprintId: imp.fingerprintId,
    notes: imp.notes, lang: imp.lang, englishTrack: track,
  }, at()).record);
  return { area, store, imp };
}

async function report(title, track, opts = {}) {
  console.log(`\n=== ${title} ===`);
  const { area, store, imp } = await seed(track, opts);
  if (opts.named) await store.updateBundle(VIDEO_ID, (b) => withSlotName(b, 1, 'نسختي'));
  const d = area.dump();
  console.log(`  مقارنة الاستيراد: matched=${imp.comparison.matched} missing=${JSON.stringify(imp.comparison.missing)} fingerprintId=${imp.fingerprintId ? 'موجود' : null}`);
  console.log(`  المفاتيح: ${Object.keys(d).filter((k) => k.endsWith(VIDEO_ID)).map((k) => k.split(':')[0]).sort().join(', ')}`);
  console.log(`  video:<id>.arabic: fingerprintId=${d[`video:${VIDEO_ID}`].arabic.fingerprintId} comparison=${d[`video:${VIDEO_ID}`].arabic.comparison === null ? null : 'محفوظة'}`);
  const ref = d[`lang:${VIDEO_ID}`]?.slots?.[0]?.ref ?? null;
  console.log(`  lang:<id>.slots[0].ref.comparison.missing = ${JSON.stringify(ref?.comparison?.missing ?? null)} (المرجع محفوظ في المرافق)`);

  const full = await store.getBundle(VIDEO_ID);
  const fullIndex = summarizeVideo(full.record);
  const fullSummary = summarizeBundle(full);
  show('index:<id>.arabic (المخزَّن) مقابل summarizeVideo(الحزمة المدمجة)', d[`index:${VIDEO_ID}`].arabic, fullIndex.arabic);

  const rows = libraryEntries(await store.listLibrary());
  const row = rows[0];
  const head = d[`bundle:${VIDEO_ID}`];
  const path = head === undefined ? (row.english.length > 1 ? 'readBundle (أكثر من مسار أصل)' : 'headless السريع') : 'fromHead السريع أو readBundle';
  console.log(`  مسار listLibrary المتوقع: ${path}`);
  show('صف المحفوظات: arabic', row.arabic, fullIndex.arabic);
  show('صف المحفوظات: summary.warned', row.summary.warned, fullSummary.warned);
  show('rowStatus (الشارة)', { id: rowStatus(row).id, text: rowStatus(row).text }, { id: 'warning', text: '1 ناقصة' });
  show('filterEntries(warnings).length', filterEntries(rows, 'warnings').length, 1);
  show('filterCounts.warnings', filterCounts(rows).warnings, 1);
  show('صف المحفوظات: english (بعد withSources)', row.english.map((t) => t.key), full.record.english.map((t) => t.key));
  const diag = librarySummary(await store.listIndex());
  const want = librarySummary([fullIndex]);
  show('librarySummary(listIndex) {mismatched, withEnglish, fingerprints}', { mismatched: diag.mismatched, withEnglish: diag.withEnglish, fingerprints: diag.fingerprints }, { mismatched: want.mismatched, withEnglish: want.withEnglish, fingerprints: want.fingerprints });
}

const ja = captured('ja|manual', 'ja', 'manual', makeCues(3, { text: (i) => `行 ${i}` }));
const via = captured('en|asr|ja', 'en', 'asr', makeCues(3, { text: (i) => `line ${i}` }), 'ja');
const en = captured('en|manual', 'en', 'manual', makeCues(3, { text: (i) => `line ${i}` }));

await report('أ) مسار ياباني وحده، ترجمة واحدة (بلا رأس: الحالة الشائعة لأول رفع)', ja);
await report('ب) مسار ياباني وحده، والخانة مسمّاة (برأس مطابق: fromHead)', ja, { named: true });
await report('ج) مسار ياباني ومعه مسار إنجليزي (بلا رأس، مساران: القراءة الكاملة)', ja, { alsoEnglish: true });
await report('د) مسار مترجم آليًا via (en|asr|ja)، ترجمة واحدة', via);
await report('هـ) ضابط: مسار إنجليزي أصلي (en|manual)', en);

console.log('\n=== و) توصية التقرير (نسخ ref.comparison إلى صف المحفوظات): بعد استكمال المقطع الناقص في المحرّر ===');
{
  const { area, store } = await seed(ja);
  await store.updateBundle(VIDEO_ID, (b) => withSlotEdit(b, 1, { cues: ja.cues.map((c) => ({ ...c, text: `ترجمة ${c.n}` })) }, new Date().toISOString()));
  const full = await store.getBundle(VIDEO_ID);
  const ref = area.dump()[`lang:${VIDEO_ID}`].slots[0].ref;
  show('التحذير الحاضر (trackComparison في summarizeVideo على الحزمة المدمجة) {matched, missing}', { matched: summarizeVideo(full.record).arabic.matched, missing: summarizeVideo(full.record).arabic.missing }, { matched: true, missing: 0 });
  show('ref.comparison المحفوظ (تقرير الاستيراد) {matched, missing}', { matched: ref.comparison.matched, missing: ref.comparison.missing.length }, { matched: true, missing: 0 });
  console.log('    (نسخ ref.comparison إلى الصف يعيد «1 ناقصة» بعد الاستكمال: حالة متقادمة يمنعها R46/GM-013.)');
}
