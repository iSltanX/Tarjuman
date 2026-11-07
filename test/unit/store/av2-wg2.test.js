// تدقيق V2 الموحد، المجموعة WG-2 على التخزين (U-009 وU-016 وU-017): محفوظات الترجمة الناقصة المرجعها مسار بغير الإنجليزية،
// وإنقاذ الحزمة برأس تالف، وتفرّد بصمات المرافق. الحالات بدوال المنتج كما في docs/Audit-V2/evidence/unified/repro/A2-store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/core/store/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { readImport } from '../../../src/core/import/index.js';
import { withExport, withArabicImport } from '../../../src/core/model/transitions.js';
import { withSlotEdit, withSlotName, withSlotUpload } from '../../../src/core/model/bundle.js';
import { validateLangValue } from '../../../src/core/model/lang-store.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { createBackup } from '../../../src/core/backup/create.js';
import { filterCounts, filterEntries, libraryEntries, rowStatus } from '../../../src/pages/library/model.js';
import { librarySummary } from '../../../src/pages/settings/diagnostics.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID as A, makeCues } from '../../helpers/fixtures.js';

const noPause = async () => {};
let tick = Date.parse(NOW);
const clock = () => (tick += 1000);
const iso = () => new Date(clock()).toISOString();
const newArea = () => createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
const captured = (key, lang, kind, cues, via) => ({ key, lang, kind, capturedAt: NOW, source: 'capture', cues, ...(via ? { via } : {}) });
const JA = captured('ja|manual', 'ja', 'manual', makeCues(3, { text: (i) => `行 ${i}` }));
const VIA = captured('en|asr|ja', 'en', 'asr', makeCues(3, { text: (i) => `line ${i}` }), 'ja');

/** تصدير ثم استيراد ترجمة ينقصها المقطع الأخير على فيديو مصدره track. */
async function seed(t) {
  const area = newArea();
  const store = createStore({ area, now: clock });
  const built = buildExport({ videoId: A, track: t, mode: 'normal', now: Date.parse(NOW), target: 'ar' });
  await store.updateVideo(A, (rec) => withExport(rec, { videoId: A, title: 'فيديو', durationMs: 60000, englishTrack: t, fingerprint: built.fingerprint }, iso(), { keep: [] }));
  const saved = await store.getVideo(A);
  const file = new File([writeSrt(t.cues.slice(0, 2).map((c) => ({ ...c, text: `ترجمة ${c.n}` })))], `${A}.ar.srt`);
  const imp = await readImport(file, { fingerprints: saved.fingerprints.filter((f) => f.trackKey === t.key), lang: 'ar' });
  assert.equal(imp.comparison.missing.length, 1);
  await store.updateVideo(A, (rec) => withArabicImport(rec, { videoId: A, fileName: imp.fileName, cues: imp.cues, comparison: imp.comparison, fingerprintId: imp.fingerprintId, notes: imp.notes, lang: imp.lang, englishTrack: t }, iso()).record);
  return { area, store };
}

for (const [label, t, named] of [
  ['مسار ياباني، بلا رأس', JA, false],
  ['مسار ياباني، خانة مسمّاة (رأس مطابق)', JA, true],
  ['مسار مترجم آليًا via', VIA, false],
]) {
  test(`AV2 U-009: ${label}: الترجمة الناقصة «1 ناقصة» وتدخل مرشح التحذيرات`, async () => {
    const { store } = await seed(t);
    if (named) await store.updateBundle(A, (b) => withSlotName(b, 1, 'نسختي'));
    const rows = libraryEntries(await store.listLibrary());
    const full = await store.getBundle(A);
    assert.deepEqual({ id: rowStatus(rows[0]).id, text: rowStatus(rows[0]).text }, { id: 'warning', text: '1 ناقصة' });
    assert.equal(filterEntries(rows, 'warnings').length, 1);
    assert.equal(filterCounts(rows).warnings, 1);
    assert.equal(rows[0].summary.warned, 1);
    assert.deepEqual(rows[0].english.map((x) => x.key), full.record.english.map((x) => x.key));
    // ما يعرضه التشخيص من الصفوف نفسها.
    const diag = librarySummary(rows);
    assert.equal(diag.mismatched, 1);
    assert.equal(diag.withEnglish, 1);
    assert.ok(diag.fingerprints >= 1);
  });
}

test('AV2 U-009: بعد استكمال المقطع الناقص تعود «مترجمة» (لا مقارنة متقادمة تُنسخ إلى الصف)', async () => {
  const { store } = await seed(JA);
  await store.updateBundle(A, (b) => withSlotEdit(b, 1, { cues: JA.cues.map((c) => ({ ...c, text: `ترجمة ${c.n}` })) }, iso()));
  const rows = libraryEntries(await store.listLibrary());
  assert.notEqual(rowStatus(rows[0]).id, 'warning');
  assert.equal(filterEntries(rows, 'warnings').length, 0);
  assert.equal(rows[0].summary.warned, 0);
});

test('AV2 U-009: مسار أصل إنجليزي لا يمر بالقراءة الكاملة (المسار السريع باقٍ)', async () => {
  const en = captured('en|manual', 'en', 'manual', makeCues(3, { text: (i) => `line ${i}` }));
  const { area, store } = await seed(en);
  let reads = 0;
  const wrapped = { ...area, get: async (k) => { reads += Array.isArray(k) ? k.length : 1; return area.get(k); } };
  const s = createStore({ area: wrapped, now: clock });
  await s.listLibrary();
  assert.ok(reads < 20, `قراءات ${reads}`);
  void store;
});

// ---------------------------------------------------------------------------------------------------------------------
// U-016: الإنقاذ برأس تالف يُبقي لغة النشطة ومرجعها أيًّا كانت خانتها.

async function seedTwoLangs(active) {
  const area = newArea();
  const s = createStore({ area, now: clock });
  const fp = buildExport({ videoId: A, track: JA, mode: 'normal', now: clock(), target: 'ar' }).fingerprint;
  await s.updateVideo(A, (rec) => withExport(rec, { videoId: A, englishTrack: JA, fingerprint: fp }, iso(), { keep: [] }));
  const up = (label, lang, fingerprintId = null) => ({ videoId: A, fileName: `${label}.ar.srt`, cues: JA.cues.map((c) => ({ ...c, text: `${label} ${c.n}` })), comparison: null, fingerprintId, notes: [], lang });
  await s.updateBundle(A, (b) => withSlotUpload(b, 1, up('one', 'fr'), iso()).bundle);
  await s.updateBundle(A, (b) => withSlotUpload(b, 2, up('two', 'ar', fp.id), iso(), { activate: active === 2 }).bundle);
  return { area, s, fp };
}

for (const active of [1, 2]) {
  test(`AV2 U-016: الإنقاذ برأس تالف ونشطة في الخانة ${active}: لغة النشطة ومرجعها باقيان`, async () => {
    const { area, fp } = await seedTwoLangs(active);
    const truth = await createStore({ area, now: clock }).getBundle(A);
    assert.equal(truth.record.arabic.lang, active === 2 ? 'ar' : 'fr');
    const head = structuredClone(area.dump()[`bundle:${A}`]);
    head.schema = 99;
    area.rawSet(`bundle:${A}`, head);
    const sal = await createStore({ area, now: clock }).salvageBundle(A);
    assert.deepEqual(sal.dropped.includes('head'), true);
    const filled = sal.bundle.slots.filter((x) => x.track);
    assert.equal(filled.length, 1);
    assert.equal(filled[0].track.fileName, truth.record.arabic.fileName);
    assert.equal(filled[0].track.lang, truth.record.arabic.lang, 'لغة النشطة');
    assert.equal(filled[0].track.fingerprintId, truth.record.arabic.fingerprintId, 'مرجع النشطة');
    if (active === 2) assert.equal(filled[0].track.fingerprintId, fp.id);
    assert.deepEqual(sal.bundle.record.english.map((t) => t.key), ['ja|manual']);
    // والتالف لم يُمسّ في التخزين.
    assert.equal(area.dump()[`bundle:${A}`].schema, 99);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// U-017: بصمات مكررة المعرّف في lang:<id> تلف يُكتشف عند القراءة لا عند أول كتابة.

test('AV2 U-017: validateLangValue يرفض معرّف بصمة مكررًا، والقراءة ST_CORRUPT_RECORD، والنسخة تستبعد lang', async () => {
  const { area } = await seedTwoLangs(1);
  const lang = structuredClone(area.dump()[`lang:${A}`]);
  assert.equal(validateLangValue(lang).ok, true);
  lang.prints.push(structuredClone(lang.prints[0]));
  assert.equal(validateLangValue(lang).ok, false);
  area.rawSet(`lang:${A}`, lang);
  const s = createStore({ area, now: clock });
  await assert.rejects(() => s.getBundle(A), (e) => e.code === 'ST_CORRUPT_RECORD');
  await assert.rejects(() => s.updateBundle(A, (b) => b), (e) => e.code === 'ST_CORRUPT_RECORD');
  const bk = await createBackup({ store: createStore({ area, now: clock }), appVersion: '2.0.0', pause: noPause });
  assert.deepEqual(bk.partial.map((x) => x.dropped), [['lang']]);
});
