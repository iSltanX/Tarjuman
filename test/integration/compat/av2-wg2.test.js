// تدقيق V2 الموحد، المجموعة WG-2 (U-011 وU-012 وU-014 وU-016): الرجوع إلى tj-v1 وإلى 1.1.0 بلقطتيهما المجمّدتين
// (test/fixtures/v1 وv1.1) ثم القراءة في 2.0.0. الحالات تُبنى بدوال المنتج كما في برامج الإثبات (docs/Audit-V2/evidence).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore as createStoreV1 } from '../../fixtures/v1/src/core/store/index.js';
import * as v1 from '../../fixtures/v1/src/core/model/transitions.js';
import { createStore as createStoreV11 } from '../../fixtures/v1.1/src/core/store/index.js';
import * as v11 from '../../fixtures/v1.1/src/core/model/transitions.js';
import { withActiveSlot as withActiveSlotV11, referencedFingerprints as refsV11 } from '../../fixtures/v1.1/src/core/model/bundle.js';
import { createBackup as createBackupV11 } from '../../fixtures/v1.1/src/core/backup/create.js';
import { validateVideoRecord as validateRecordV11 } from '../../fixtures/v1.1/src/core/model/video.js';
import { COMPANION_VALIDATORS as V11_VALIDATORS } from '../../fixtures/v1.1/src/core/model/bundle.js';
import { createStore } from '../../../src/core/store/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { readImport } from '../../../src/core/import/index.js';
import { withExport, withArabicImport } from '../../../src/core/model/transitions.js';
import { referencedFingerprints, summarizeBundle, withSlotUpload } from '../../../src/core/model/bundle.js';
import { createBackup } from '../../../src/core/backup/create.js';
import { readBackup } from '../../../src/core/backup/read.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { libraryEntries, pairText } from '../../../src/pages/library/model.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID as A, makeCues } from '../../helpers/fixtures.js';

const noPause = async () => {};
let tick = Date.parse(NOW);
const clock = () => (tick += 1000);
const iso = () => new Date(clock()).toISOString();
const newArea = () => createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
const track = (lang, kind = 'manual') => ({ key: `${lang}|${kind}`, lang, kind, capturedAt: NOW, source: 'capture', cues: makeCues(5, { text: (i) => `${lang} ${i}` }) });
const fpOf = (t) => buildExport({ videoId: A, track: t, mode: 'normal', now: clock(), target: 'ar' }).fingerprint;
const EN = track('en');

/** تصدير في 2.0.0 كما في controller.recordExport (keep من الحزمة). */
async function export20(store, t) {
  const keep = referencedFingerprints(await store.getBundle(A));
  await store.updateVideo(A, (rec) => withExport(rec, { videoId: A, title: 'فيديو', durationMs: 60000, englishTrack: t, fingerprint: fpOf(t) }, iso(), { keep }));
}
/** تصدير في 1.1.0 كما في متحكمه. */
async function export11(store, t) {
  const keep = refsV11(await store.getBundle(A));
  await store.updateVideo(A, (rec) => v11.withExport(rec, { videoId: A, englishTrack: t, fingerprint: fpOf(t) }, iso(), { keep }));
}
const arFile = (ref, count, label) => new File([writeSrt(ref.cues.slice(0, count).map((c) => ({ ...c, text: `${label} ${c.n}` })))], `${label}.ar.srt`);
/** ترجمة مرجعها بصمة المسار ref (في الخانة المسمّاة إن عُيّنت، وإلا النشطة). */
async function import20(store, ref, { slot = null, count = ref.cues.length, label = 'ترجمة', lang = 'ar' } = {}) {
  const rec = await store.getVideo(A);
  const imp = await readImport(arFile(ref, count, label), { fingerprints: rec.fingerprints.filter((f) => f.trackKey === ref.key), lang });
  const input = { videoId: A, fileName: imp.fileName, cues: imp.cues, comparison: imp.comparison, fingerprintId: imp.fingerprintId, notes: imp.notes, lang };
  if (slot === null) await store.updateVideo(A, (r) => withArabicImport(r, input, iso()).record);
  else await store.updateBundle(A, (b) => withSlotUpload(b, slot, input, iso(), { activate: false }).bundle);
}
const counts = (d) => ({ recordEnglish: d[`video:${A}`].english.length, recordPrints: d[`video:${A}`].fingerprints.length, langSources: d[`lang:${A}`]?.sources.length ?? 0, langPrints: d[`lang:${A}`]?.prints.length ?? 0 });

/** 2.0.0: تصدير (A) ← ترجمة كاملة في 1 مرجعها A؛ تصدير (B) ← ترجمة في 2 ينقصها مقطع مرجعها B (غير نشطة). */
async function seedTwoSlots(store) {
  await export20(store, EN);
  await import20(store, EN, { count: 5, label: 'one' });
  await export20(store, EN);
  const rec = await store.getVideo(A);
  const imp2 = await readImport(arFile(EN, 4, 'two'), { fingerprints: rec.fingerprints, lang: 'ar' });
  await store.updateBundle(A, (b) => withSlotUpload(b, 2, { videoId: A, fileName: imp2.fileName, cues: imp2.cues, comparison: imp2.comparison, fingerprintId: imp2.fingerprintId, notes: imp2.notes, lang: 'ar' }, iso(), { activate: false }).bundle);
  const b = await store.getBundle(A);
  return { A1: b.slots[0].track.fingerprintId, B: b.slots[1].track.fingerprintId };
}

/** الرجوع إلى tj-v1: عشرة تصديرات بلا keep تُخلي بصمة الخانة 2. */
async function rollbackToV1(area, ids) {
  const one = createStoreV1({ area, now: clock });
  for (let i = 0; i < 10; i++) {
    await one.updateVideo(A, (rec) => v1.withExport(rec, { videoId: A, englishTrack: EN, fingerprint: fpOf(EN) }, iso()));
  }
  const d = area.dump();
  assert.equal(d[`video:${A}`].fingerprints.some((f) => f.id === ids.B), false, 'بصمة الخانة 2 أُخليت');
  return d;
}

test('AV2 U-011: الرجوع إلى tj-v1 يُخلي مرجع الخانة 2، فتبقى مقارنتها (والتحذير) عند قراءة 2.0.0 وبعدها', async () => {
  const area = newArea();
  const ids = await seedTwoSlots(createStore({ area, now: clock }));
  const d = await rollbackToV1(area, ids);
  const b11 = await createStoreV11({ area: createMemoryArea({ unlimited: true, initial: structuredClone(d) }), now: clock }).getBundle(A);
  const b20 = await createStore({ area, now: clock }).getBundle(A);
  assert.deepEqual(b20.slots[1].track.comparison?.missing, [5], 'قراءة 2.0.0 الأولى');
  assert.equal(b20.slots[1].track.fingerprintId, null);
  assert.deepEqual(area.dump()[`alts:${A}`].slots[1].track.comparison?.missing, [5], 'ما كُتب بعد المصالحة');
  const fresh = await createStore({ area, now: clock }).getBundle(A);
  assert.deepEqual(fresh.slots[1].track.comparison?.missing, [5], 'سياق جديد');
  assert.equal(summarizeBundle(fresh).warned, summarizeBundle(b11).warned, 'تحذير الخانة 2 كما يراه 1.1.0');
  assert.ok(summarizeBundle(fresh).warned >= 1);
  const bk = await createBackup({ store: createStore({ area, now: clock }), appVersion: '2.0.0', pause: noPause });
  const back = await readBackup(bk.text, { pause: noPause });
  assert.deepEqual([back.videos.length, back.invalid.length], [1, 0]);
  assert.deepEqual(back.videos[0].entry.alts[1].track.comparison?.missing, [5], 'نسخة 2.0.0 تحمل مقارنة الخانة 2');
});

test('AV2 U-011: نسخة 1.1.0 الاحتياطية بمرجع مُخلى (غير نشط ونشط) تُستعاد في 2.0.0 بلا رفض', async () => {
  const area = newArea();
  const ids = await seedTwoSlots(createStore({ area, now: clock }));
  const d = await rollbackToV1(area, ids);
  const area11 = createMemoryArea({ unlimited: true, chromiumKeyOrder: true, initial: structuredClone(d) });
  const s11 = createStoreV11({ area: area11, now: clock });
  const bk = await createBackupV11({ store: s11, appVersion: '1.1.0', pause: noPause });
  const r = await readBackup(bk.text, { pause: noPause });
  assert.deepEqual([r.videos.length, r.invalid.length], [1, 0], JSON.stringify(r.invalid));
  // الحالة نفسها نشطةً.
  await s11.updateBundle(A, (b) => withActiveSlotV11(b, 2, iso()));
  const bk2 = await createBackupV11({ store: createStoreV11({ area: area11, now: clock }), appVersion: '1.1.0', pause: noPause });
  const r2 = await readBackup(bk2.text, { pause: noPause });
  assert.deepEqual([r2.videos.length, r2.invalid.length], [1, 0], JSON.stringify(r2.invalid));
  // 2.0.0 يقرأ تخزين 1.1.0 ويحتفظ بالمقارنة في السجل.
  const area20 = createMemoryArea({ unlimited: true, chromiumKeyOrder: true, initial: area11.dump() });
  await createStore({ area: area20, now: clock }).getBundle(A);
  assert.deepEqual(area20.dump()[`video:${A}`].arabic.comparison?.missing, [5]);
  // ونسخة 2.0.0 تحمل المقارنة.
  const bk20 = await createBackup({ store: createStore({ area: area20, now: clock }), appVersion: '2.0.0', pause: noPause });
  const r20 = await readBackup(bk20.text, { pause: noPause });
  assert.deepEqual([r20.videos.length, r20.invalid.length], [1, 0]);
  assert.deepEqual(r20.videos[0].entry.record.arabic.comparison?.missing, [5]);
});

/** ما بعد الحالة: القراءة والمحفوظات والنسخة الاحتياطية في 2.0.0، وقراءة 1.1.0 لما كتبه. */
async function assertReadable(area, label) {
  const s = createStore({ area, now: clock });
  const b = await s.getBundle(A);
  assert.ok(b.record.english.length <= 8, `${label}: المسارات ${b.record.english.length}`);
  assert.ok(b.record.fingerprints.length <= 10, `${label}: البصمات ${b.record.fingerprints.length}`);
  assert.equal(b.record.arabic !== null, true, `${label}: الترجمة باقية`);
  assert.ok(b.record.english.some((t) => t.key === 'ja|manual'), `${label}: المرجع الياباني باقٍ`);
  assert.ok(b.record.fingerprints.some((f) => f.id === b.record.arabic.fingerprintId), `${label}: بصمة المرجع باقية`);
  await createStore({ area, now: clock }).getBundle(A);
  const bk = await createBackup({ store: createStore({ area, now: clock }), appVersion: '2.0.0', pause: noPause });
  const back = await readBackup(bk.text, { pause: noPause });
  assert.deepEqual([bk.skipped.length, back.videos.length, back.invalid.length], [0, 1, 0], `${label}: النسخة تضم الفيديو`);
  const area11 = createMemoryArea({ unlimited: true, initial: area.dump() });
  const b11 = await createStoreV11({ area: area11, now: clock }).getBundle(A);
  assert.ok(b11, `${label}: 1.1.0 يقرأ ما كتبه 2.0.0`);
  assert.equal(validateRecordV11(area.dump()[`video:${A}`]).ok, true);
  for (const kind of ['alts', 'prev', 'marks']) if (area.dump()[`${kind}:${A}`]) assert.equal(V11_VALIDATORS[kind](area.dump()[`${kind}:${A}`]).ok, true);
}

test('AV2 U-012: مرجع ياباني وتسع تصديرات إنجليزية ثم تصدير في 1.1.0 (أحد عشر بصمة): الفيديو مقروء ومنسوخ', async () => {
  const area = newArea();
  const s = createStore({ area, now: clock });
  const ja = track('ja');
  await export20(s, ja);
  await import20(s, ja);
  for (let i = 0; i < 9; i++) await export20(s, EN);
  assert.equal((await s.getBundle(A)).record.fingerprints.length, 10);
  await export11(createStoreV11({ area, now: clock }), EN);
  assert.deepEqual(counts(area.dump()), { recordEnglish: 1, recordPrints: 10, langSources: 1, langPrints: 1 });
  await assertReadable(area, 'أ');
});

test('AV2 U-012: ستة مسارات أجنبية ببصمات ومساران إنجليزيان ثم en-GB في 1.1.0 (تسعة مسارات): الفيديو مقروء ومنسوخ', async () => {
  const area = newArea();
  const s = createStore({ area, now: clock });
  const foreign = ['ja', 'fr', 'de', 'es', 'ko', 'it'].map((l) => track(l));
  for (const t of foreign) await export20(s, t);
  await export20(s, track('en'));
  await export20(s, track('en', 'asr'));
  await import20(s, foreign[0]);
  assert.equal((await s.getBundle(A)).record.english.length, 8);
  await export11(createStoreV11({ area, now: clock }), track('en-GB'));
  assert.deepEqual(counts(area.dump()), { recordEnglish: 3, recordPrints: 3, langSources: 6, langPrints: 6 });
  await assertReadable(area, 'ب');
});

test('AV2 U-012: فشل كتابة المصالحة لا يجعل الفيديو غير مقروء (تُخدَم الحزمة المصالحة في الذاكرة)', async () => {
  const area = newArea();
  const s = createStore({ area, now: clock });
  const ja = track('ja');
  await export20(s, ja);
  await import20(s, ja);
  // 1.1.0 يكتب السجل فيصير lang: قديمًا، فتحتاج القراءة التالية إلى كتابة مصالحة.
  const old = createStoreV11({ area, now: clock });
  await old.updateVideo(A, (r) => v11.withView(r, { displayOffsetMs: 700 }, iso()));
  area.failNext('set', new Error('فشل محاكى'));
  const b = await createStore({ area, now: clock }).getBundle(A);
  assert.equal(b.record.view.displayOffsetMs, 700);
  assert.ok(b.record.english.some((t) => t.key === 'ja|manual'), 'مسارات اللغة مدموجة في الذاكرة');
  assert.equal(b.record.arabic.fingerprintId !== null, true);
});

/** حالتا U-014: lang: قديم بعد كتابات 1.1.0، والصف الأول يجب أن يطابق القراءة الكاملة. */
const rowOf = async (s) => {
  const [row] = libraryEntries(await s.listLibrary());
  return { english: row.english.map((t) => t.key), pair: pairText(row) };
};
const v11Import = (label, replace) => (rec) => v11.withArabicImport(rec, { videoId: A, fileName: `${A}.ar.srt`, cues: track('ja').cues.map((c) => ({ ...c, text: `${label} ${c.n}` })), comparison: null, fingerprintId: null, notes: [] }, iso(), { replace }).record;
async function seedJa(area) {
  const s = createStore({ area, now: clock });
  const ja = track('ja');
  await export20(s, ja);
  await import20(s, ja, { label: A });
}

test('AV2 U-014: 1.1.0 يحذف الفيديو ثم يرفع سجلًا جديدًا (lang: يتيم): الصف الأول كالقراءة الكاملة', async () => {
  const area = newArea();
  await seedJa(area);
  const s11 = createStoreV11({ area, now: clock });
  await s11.deleteVideo(A);
  await s11.updateVideo(A, v11Import('جديدة', false));
  const first = await rowOf(createStore({ area, now: clock }));
  await createStore({ area, now: clock }).getBundle(A);
  const after = await rowOf(createStore({ area, now: clock }));
  assert.deepEqual(first, after, 'لا فرق بين أول عرض وما بعد القراءة الكاملة');
  assert.deepEqual(first.english, []);
});

test('AV2 U-014: 1.1.0 يستبدل الترجمة بملف بالاسم نفسه (رأس مطابق وlang: قديم): الصف الأول كالقراءة الكاملة', async () => {
  const area = newArea();
  await seedJa(area);
  await createStoreV11({ area, now: clock }).updateVideo(A, v11Import('بديلة', true));
  const first = await rowOf(createStore({ area, now: clock }));
  await createStore({ area, now: clock }).getBundle(A);
  const after = await rowOf(createStore({ area, now: clock }));
  assert.deepEqual(first, after);
  assert.equal(first.pair, 'اليابانية ← لغة غير محددة');
});
