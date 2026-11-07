// G-F10: المسار السريع في listLibrary يقرأ lang:<id> دون مطابقة lang.base مع السجل.
// متى يكون lang:<id> قديمًا فعلًا؟ لا يكتب السجلَ دونه إلا الإصدار الأول و1.1.0 (الرجوع). تُبنى الحالتان بلقطة 1.1.0 المجمّدة:
//  (١) 1.1.0 يحذف الفيديو (يبقى lang: يتيمًا) ثم يُرفع له ترجمة من جديد (سجل جديد)؛
//  (٢) 1.1.0 يستبدل الترجمة بملف بالاسم نفسه (فيكتب رأسًا مطابقًا للسجل، وlang: قديم).
// ويُقارن صف المحفوظات قبل القراءة الكاملة وبعدها (readBundle يصالح ويعيد كتابة lang:).
// الاستعمال: command node f10-stale-lang-listlibrary.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('جذر الشيفرة مطلوب');
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, VIDEO_ID: A, makeCues } = await import(`${R}/test/helpers/fixtures.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { buildExport } = await import(`${R}/src/core/export/index.js`);
const { readImport } = await import(`${R}/src/core/import/index.js`);
const { withExport, withArabicImport } = await import(`${R}/src/core/model/transitions.js`);
const { libraryEntries, exportOptions, pairText } = await import(`${R}/src/pages/library/model.js`);
const { writeSrt } = await import(`${R}/src/core/srt/writer.js`);
const { createStore: createStoreV11 } = await import(`${R}/test/fixtures/v1.1/src/core/store/index.js`);
const v11 = await import(`${R}/test/fixtures/v1.1/src/core/model/transitions.js`);

let tick = Date.parse(NOW);
const clock = () => (tick += 1000);
const iso = () => new Date(clock()).toISOString();
const show = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(`  ${label}\n    الفعلي:   ${a}\n    المتوقع:  ${e}\n    ${a === e ? 'مطابق' : 'مختلف'}`);
};
const ja = { key: 'ja|manual', lang: 'ja', kind: 'manual', capturedAt: NOW, source: 'capture', cues: makeCues(3, { text: (i) => `行 ${i}` }) };
const file = (label) => new File([writeSrt(ja.cues.map((c) => ({ ...c, text: `${label} ${c.n}` })))], `${A}.ar.srt`);

/** 2.0.0: تصدير مسار ياباني ثم ترجمة لغتها «ar» مرجعها بصمته (ترجمة واحدة: بلا رأس). */
async function seed20(area) {
  const s = createStore({ area, now: clock });
  const fp = buildExport({ videoId: A, track: ja, mode: 'normal', now: clock(), target: 'ar' }).fingerprint;
  await s.updateVideo(A, (rec) => withExport(rec, { videoId: A, englishTrack: ja, fingerprint: fp }, iso(), { keep: [] }));
  const imp = await readImport(file('ترجمة'), { fingerprints: (await s.getVideo(A)).fingerprints, lang: 'ar' });
  await s.updateVideo(A, (rec) => withArabicImport(rec, { videoId: A, fileName: imp.fileName, cues: imp.cues, comparison: imp.comparison, fingerprintId: imp.fingerprintId, notes: imp.notes, lang: 'ar' }, iso()).record);
}
const v11Import = (label, replace) => (rec) => v11.withArabicImport(rec, { videoId: A, fileName: `${A}.ar.srt`, cues: ja.cues.map((c) => ({ ...c, text: `${label} ${c.n}` })), comparison: null, fingerprintId: null, notes: [] }, iso(), { replace }).record;
const rowOf = async (s) => {
  const [row] = libraryEntries(await s.listLibrary());
  return { english: row.english.map((t) => t.key), pair: pairText(row), exportEn: exportOptions(row).filter((o) => o.action.type === 'en').map((o) => o.action.trackKey) };
};
const lag = (d) => {
  const l = d[`lang:${A}`];
  const r = d[`video:${A}`];
  return l ? { baseMatchesRecord: l.base.rev === r.rev && l.base.createdAt === r.createdAt && l.base.updatedAt === r.updatedAt, sources: l.sources.map((t) => t.key), slot1Lang: l.slots[0]?.lang ?? null } : null;
};

console.log('=== ١) 1.1.0 يحذف الفيديو ثم يُرفع له ترجمة جديدة (lang: يتيم من السجل المحذوف) ===');
{
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  await seed20(area);
  const s11 = createStoreV11({ area, now: clock });
  await s11.deleteVideo(A);
  show('بعد حذف 1.1.0: المفاتيح الباقية', Object.keys(area.dump()).filter((k) => k.endsWith(A)).map((k) => k.split(':')[0]), ['lang']);
  await s11.updateVideo(A, v11Import('جديدة', false)); // فيديو ياباني بلا مسار إنجليزي: لا مسار يُلتقط في 1.1.0
  show('lang:<id> بعد السجل الجديد', lag(area.dump()), { baseMatchesRecord: false, sources: ['ja|manual'], slot1Lang: 'ar' });
  const s20 = createStore({ area, now: clock });
  show('صف المحفوظات (المسار السريع بلا رأس)', await rowOf(s20), { english: [], pair: '؟ ← لغة غير محددة', exportEn: [''] });
  const b = await s20.getBundle(A); // ما يقرؤه المشغّل والتوسيع والمحرّر
  show('الحزمة الكاملة (readBundle): المسارات ولغة الترجمة', { english: b.record.english.map((t) => t.key), lang: b.record.arabic.lang ?? null }, { english: [], lang: null });
  show('صف المحفوظات بعد أول قراءة كاملة (تعافٍ ذاتي)', await rowOf(createStore({ area, now: clock })), { english: [], pair: '؟ ← لغة غير محددة', exportEn: [''] });
}

console.log('\n=== ٢) 1.1.0 يستبدل الترجمة بملف بالاسم نفسه (رأس يطابق السجل، وlang: قديم) ===');
{
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  await seed20(area);
  const s11 = createStoreV11({ area, now: clock });
  await s11.updateVideo(A, v11Import('بديلة', true));
  const d = area.dump();
  show('بعد الاستبدال في 1.1.0: رأس bundle: مطابق للسجل، وlang: قديم', { head: d[`bundle:${A}`]?.base.rev === d[`video:${A}`].rev, lang: lag(d)?.baseMatchesRecord }, { head: true, lang: false });
  const s20 = createStore({ area, now: clock });
  show('صف المحفوظات (fromHead السريع): الزوج', (await rowOf(s20)).pair, 'اليابانية ← لغة غير محددة');
  const b = await s20.getBundle(A);
  show('الحزمة الكاملة: لغة الترجمة النشطة (البديلة من 1.1.0)', b.record.arabic.lang ?? null, null);
  show('صف المحفوظات بعد أول قراءة كاملة', (await rowOf(createStore({ area, now: clock }))).pair, 'اليابانية ← لغة غير محددة');
}
