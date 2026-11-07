// G-F02: ترجمة مرجعها بصمة أُخليت (fingerprintId === null والمقارنة باقية لبصمة غائبة).
// السؤال الأول: هل يبلغ المنتج هذه الحالة؟ يُجرَّب أولًا في 2.0.0 وحده (تصديرات متكررة فوق حد البصمات 10 عبر withExport
// بـkeep كما في المتحكم)، ثم بمسار الرجوع إلى tj-v1 (لقطته المجمّدة test/fixtures/v1، وwithExport فيه بلا keep).
// ثم أثر 2.0.0 عليها: الكتابة (storedTrack)، والنسخة الاحتياطية (createBackup ثم readBackup)، ونسخة 1.1.0 (لقطته
// المجمّدة test/fixtures/v1.1) تُستعاد في 2.0.0.
// الاستعمال: command node f02-evicted-ref-comparison.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('جذر الشيفرة مطلوب');
const { createMemoryArea } = await import(`${R}/test/helpers/chrome-storage.js`);
const { NOW, VIDEO_ID: A, makeCues } = await import(`${R}/test/helpers/fixtures.js`);
const { createStore } = await import(`${R}/src/core/store/index.js`);
const { buildExport } = await import(`${R}/src/core/export/index.js`);
const { readImport } = await import(`${R}/src/core/import/index.js`);
const { withExport, withArabicImport } = await import(`${R}/src/core/model/transitions.js`);
const { withSlotUpload, withActiveSlot, summarizeBundle, referencedFingerprints } = await import(`${R}/src/core/model/bundle.js`);
const { createBackup } = await import(`${R}/src/core/backup/create.js`);
const { readBackup } = await import(`${R}/src/core/backup/read.js`);
const { writeSrt } = await import(`${R}/src/core/srt/writer.js`);
const { createStore: createStoreV1 } = await import(`${R}/test/fixtures/v1/src/core/store/index.js`);
const v1 = await import(`${R}/test/fixtures/v1/src/core/model/transitions.js`);
const { createStore: createStoreV11 } = await import(`${R}/test/fixtures/v1.1/src/core/store/index.js`);
const { withActiveSlot: withActiveSlotV11 } = await import(`${R}/test/fixtures/v1.1/src/core/model/bundle.js`);
const { createBackup: createBackupV11 } = await import(`${R}/test/fixtures/v1.1/src/core/backup/create.js`);

const noPause = async () => {};
let tick = Date.parse(NOW);
const clock = () => (tick += 1000);
const iso = () => new Date(clock()).toISOString();
const show = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  console.log(`  ${label}\n    الفعلي:   ${a}\n    المتوقع:  ${e}\n    ${a === e ? 'مطابق' : 'مختلف'}`);
};
const en = { key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: NOW, source: 'capture', cues: makeCues(5, { text: (i) => `line ${i}` }) };
const exportEn = async (store, keepOf) => {
  const keep = await keepOf();
  return store.updateVideo(A, (rec) => {
    const fp = buildExport({ videoId: A, track: en, mode: 'normal', now: clock(), target: 'ar' }).fingerprint;
    return withExport(rec, { videoId: A, englishTrack: en, fingerprint: fp }, iso(), { keep });
  });
};
const arFile = (label, count) => new File([writeSrt(en.cues.slice(0, count).map((c) => ({ ...c, text: `${label} ${c.n}` })))], `${label}.ar.srt`);

/** 2.0.0: تصدير (البصمة A) ← ترجمة كاملة في 1 مرجعها A؛ تصدير (B) ← ترجمة في 2 ينقصها مقطع مرجعها B (غير نشطة). */
async function seedTwoSlots(store) {
  await exportEn(store, () => []);
  let rec = await store.getVideo(A);
  const imp1 = await readImport(arFile('one', 5), { fingerprints: rec.fingerprints, lang: 'ar' });
  await store.updateVideo(A, (r) => withArabicImport(r, { videoId: A, fileName: imp1.fileName, cues: imp1.cues, comparison: imp1.comparison, fingerprintId: imp1.fingerprintId, notes: imp1.notes, lang: 'ar' }, iso()).record);
  await exportEn(store, async () => referencedFingerprints(await store.getBundle(A)));
  rec = await store.getVideo(A);
  const imp2 = await readImport(arFile('two', 4), { fingerprints: rec.fingerprints, lang: 'ar' });
  await store.updateBundle(A, (b) => withSlotUpload(b, 2, { videoId: A, fileName: imp2.fileName, cues: imp2.cues, comparison: imp2.comparison, fingerprintId: imp2.fingerprintId, notes: imp2.notes, lang: 'ar' }, iso(), { activate: false }).bundle);
  const b = await store.getBundle(A);
  return { A1: b.slots[0].track.fingerprintId, B: b.slots[1].track.fingerprintId };
}

console.log('=== ١) 2.0.0 وحده: 12 تصديرًا إضافيًا (keep من referencedFingerprints كما في controller.recordExport) ===');
{
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  const two = createStore({ area, now: clock });
  const ids = await seedTwoSlots(two);
  // المتحكم يحسب keep من الحزمة قبل الكتابة (referencedFingerprints(bundleFor(saved)))
  for (let i = 0; i < 12; i++) {
    const keep = referencedFingerprints(await two.getBundle(A));
    await two.updateVideo(A, (rec) => withExport(rec, { videoId: A, englishTrack: en, fingerprint: buildExport({ videoId: A, track: en, mode: 'normal', now: clock(), target: 'ar' }).fingerprint }, iso(), { keep }));
  }
  const b = await two.getBundle(A);
  show('عدد البصمات بعد التصديرات', b.record.fingerprints.length, 10);
  show('مرجع الخانة 2 (B) ما زال في السجل', b.record.fingerprints.some((f) => f.id === ids.B), true);
  show('الخانة 2: fingerprintId ما زال B', b.slots[1].track.fingerprintId === ids.B, true);
  console.log('  الخلاصة: 2.0.0 وحده لا يُخلي بصمة يشير إليها مرجع (keep في withExport وreferenced في mergeLang).');
}

console.log('\n=== ٢) الرجوع إلى tj-v1: 2.0.0 بخانتين، ثم tj-v1 يصدّر 10 مرات (withExport بلا keep لا يعرف الخانة 2) ===');
const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
const two = createStore({ area, now: clock });
const ids = await seedTwoSlots(two);
const before = await two.getBundle(A);
console.log(`  قبل الرجوع: الخانة 2 fingerprintId=B، comparison.missing=${JSON.stringify(before.slots[1].track.comparison.missing)}، warned=${summarizeBundle(before).warned}`);
const one = createStoreV1({ area, now: clock });
for (let i = 0; i < 10; i++) {
  await one.updateVideo(A, (rec) => v1.withExport(rec, { videoId: A, englishTrack: en, fingerprint: buildExport({ videoId: A, track: en, mode: 'normal', now: clock(), target: 'ar' }).fingerprint }, iso()));
}
const afterV1 = area.dump();
show('بعد tj-v1: B في video:<id>.fingerprints', afterV1[`video:${A}`].fingerprints.some((f) => f.id === ids.B), false);
show('بعد tj-v1: B في lang:<id>.prints (v1Prints لا يحويها ولا المرافق)', (afterV1[`lang:${A}`]?.prints ?? []).some((f) => f.id === ids.B), false);
show('بعد tj-v1: alts:<id> الخانة 2 كما هي (fingerprintId=B، والمقارنة محفوظة)', [afterV1[`alts:${A}`].slots[1].track.fingerprintId === ids.B, afterV1[`alts:${A}`].slots[1].track.comparison?.missing ?? null], [true, [5]]);

// نسختان من التخزين نفسه: واحدة يقرؤها 1.1.0، وأخرى يقرؤها 2.0.0.
const area11 = createMemoryArea({ unlimited: true, chromiumKeyOrder: true, initial: structuredClone(afterV1) });
const area20 = createMemoryArea({ unlimited: true, chromiumKeyOrder: true, initial: structuredClone(afterV1) });

console.log('\n=== ٣) 1.1.0 يقرأ الحالة (ضابط: سلوك ما قبل 2.0.0) ===');
const s11 = createStoreV11({ area: area11, now: clock });
const b11 = await s11.getBundle(A);
const d11 = area11.dump();
show('1.1.0 في الذاكرة: الخانة 2 {fingerprintId, missing}', [b11.slots[1].track.fingerprintId, b11.slots[1].track.comparison?.missing ?? null], [null, [5]]);
show('1.1.0 بعد كتابة المصالحة: alts الخانة 2 comparison.missing', d11[`alts:${A}`].slots[1].track.comparison?.missing ?? null, [5]);

console.log('\n=== ٤) 2.0.0 يقرأ الحالة: المصالحة تُكتب، وstoredTrack يمسح المقارنة ===');
const s20 = createStore({ area: area20, now: clock });
const b20 = await s20.getBundle(A);
show('2.0.0 في الذاكرة (أول قراءة): الخانة 2 {fingerprintId, missing}', [b20.slots[1].track.fingerprintId, b20.slots[1].track.comparison?.missing ?? null], [null, [5]]);
const d20 = area20.dump();
show('2.0.0 بعد كتابة المصالحة: alts الخانة 2 comparison', d20[`alts:${A}`].slots[1].track.comparison?.missing ?? null, [5]);
show('2.0.0: lang:<id>.slots[1].ref (لم يُحفظ المرجع في المرافق)', d20[`lang:${A}`]?.slots?.[1]?.ref ?? null, '{fingerprintId:B, comparison}');
const fresh = await createStore({ area: area20, now: clock }).getBundle(A);
show('2.0.0 سياق جديد: الخانة 2 comparison.missing', fresh.slots[1].track.comparison?.missing ?? null, [5]);
show('2.0.0 سياق جديد: summarizeBundle.warned (تحذير الخانة 2)', summarizeBundle(fresh).warned, summarizeBundle(b11).warned);

console.log('\n=== ٥) النسخة الاحتياطية ===');
const bk20 = await createBackup({ store: createStore({ area: area20, now: clock }), appVersion: '2.0.0', pause: noPause });
const r20 = await readBackup(bk20.text, { pause: noPause });
show('نسخة 2.0.0 تُقرأ في 2.0.0 {videos, invalid}', [r20.videos.length, r20.invalid.length], [1, 0]);
const entry20 = JSON.parse(bk20.text).videos?.[0] ?? null;
show('نسخة 2.0.0: الخانة 2 comparison في النسخة', entry20?.alts?.[1]?.track?.comparison?.missing ?? null, [5]);

const bk11 = await createBackupV11({ store: createStoreV11({ area: area11, now: clock }), appVersion: '1.1.0', pause: noPause });
const r11 = await readBackup(bk11.text, { pause: noPause });
show('نسخة 1.1.0 تُقرأ في 2.0.0 {videos, invalid}', [r11.videos.length, r11.invalid.length], [1, 0]);
console.log(`    سبب الرفض: ${JSON.stringify(r11.invalid.map((x) => ({ code: x.code, detail: x.detail })))}`);

console.log('\n=== ٦) الحالة نفسها نشطةً: 1.1.0 يجعل الخانة 2 نشطة ثم ينسخ ===');
await s11.updateBundle(A, (b) => withActiveSlotV11(b, 2, iso()));
const d11b = area11.dump();
show('1.1.0: video:<id>.arabic {fingerprintId, missing}', [d11b[`video:${A}`].arabic.fingerprintId, d11b[`video:${A}`].arabic.comparison?.missing ?? null], [null, [5]]);
const bk11b = await createBackupV11({ store: createStoreV11({ area: area11, now: clock }), appVersion: '1.1.0', pause: noPause });
const r11b = await readBackup(bk11b.text, { pause: noPause });
show('نسخة 1.1.0 (النشطة بمرجع مُخلى) تُقرأ في 2.0.0 {videos, invalid}', [r11b.videos.length, r11b.invalid.length], [1, 0]);
console.log(`    سبب الرفض: ${JSON.stringify(r11b.invalid.map((x) => ({ code: x.code, detail: x.detail })))}`);
const area20b = createMemoryArea({ unlimited: true, chromiumKeyOrder: true, initial: structuredClone(d11b) });
await createStore({ area: area20b, now: clock }).getBundle(A);
const after20 = await createStore({ area: area20b, now: clock }).getBundle(A);
show('2.0.0 يقرأ تخزين 1.1.0 نفسه ثم سياق جديد: النشطة comparison.missing', after20.record.arabic.comparison?.missing ?? null, [5]);
show('2.0.0: video:<id>.arabic.comparison بعد المصالحة', area20b.dump()[`video:${A}`].arabic.comparison?.missing ?? null, [5]);
