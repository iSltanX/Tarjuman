// توافق 2.0.0 مع 1.1.0 في بيانات اللغة (AA1، قرار سلطان ق٦، عقد storage §١٣): لقطة 1.1.0 المجمّدة (test/fixtures/v1.1) تقرأ ما
// يكتبه 2.0.0 من مسارات بغير الإنجليزية ومسارات مترجمة آليًا وترجمات بلغاتها، بلا خطأ ولا كتابة ولا حذف، وتكتب عليه؛ ثم
// يقرؤه 2.0.0 فيعيد اللغات والمراجع لما لم يُستبدل، ولا يلصق لغة ترجمة بغيرها. ومكتبة 1.1.0 تُقرأ في 2.0.0 كما هي. والنسخة
// الاحتياطية بلا لغات بصيغة 1.1.0، وبها بالإصدار 2 الذي يرفضه 1.1.0 برسالة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore as createStoreV11 } from '../../fixtures/v1.1/src/core/store/index.js';
import { withSlotUpload as withSlotUploadV11 } from '../../fixtures/v1.1/src/core/model/bundle.js';
import { withView as withViewV11 } from '../../fixtures/v1.1/src/core/model/transitions.js';
import { validateVideoRecord as validateRecordV11 } from '../../fixtures/v1.1/src/core/model/video.js';
import { COMPANION_VALIDATORS as V11_VALIDATORS } from '../../fixtures/v1.1/src/core/model/bundle.js';
import { readBackup as readBackupV11 } from '../../fixtures/v1.1/src/core/backup/read.js';
import { createStore } from '../../../src/core/store/index.js';
import { createBackup } from '../../../src/core/backup/create.js';
import { readBackup } from '../../../src/core/backup/read.js';
import { planRestore, restoreItems, runRestore } from '../../../src/core/backup/restore.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID as A, comparison, fingerprint, makeCues } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const clock = (start) => {
  let t = start;
  return () => (t += 1000);
};
const noPause = async () => {};

function pair() {
  const area = createMemoryArea({ unlimited: true });
  return { area, old: createStoreV11({ area, now: clock(Date.parse(NOW)) }), two: createStore({ area, now: clock(Date.parse(NOW) + 500) }) };
}

const JA = { key: 'ja|manual', lang: 'ja', kind: 'manual', capturedAt: NOW, source: 'capture', cues: makeCues(5, { text: (i) => `日本語の行 ${i}` }) };
const MT = { key: 'ar|asr|en', lang: 'ar', kind: 'asr', via: 'en', capturedAt: NOW, source: 'capture', cues: makeCues(5, { text: (i) => `ترجمة آلية ${i}` }) };

/** حزمة 2.0.0: مسار ياباني مرجعُه بصمة للنشطة (اليابانية ← الإنجليزية)، ومسار مترجم آليًا، وترجمات بلغاتها الثلاث. */
function langBundle() {
  const b = sampleBundle();
  const fpJa = fingerprint({ track: JA, id: 'fp_test000003' });
  b.record.english.push(structuredClone(JA), structuredClone(MT));
  b.record.fingerprints.push(fpJa);
  const t1 = b.slots[0].track;
  Object.assign(t1, { fingerprintId: fpJa.id, comparison: comparison({ fingerprintId: fpJa.id }), lang: 'en' });
  b.record.arabic = structuredClone(t1);
  b.slots[1].track.lang = 'fr';
  b.previous.track.lang = 'ar';
  return b;
}

test('2.0.0 ← 1.1.0: السجل والتوابع إسقاطٌ يقبله مدقق 1.1.0، والجديد كله في lang:', async () => {
  const { area, two } = pair();
  await seedBundle(two, langBundle());
  const d = area.dump();
  const rec = d[`video:${A}`];
  assert.equal(validateRecordV11(rec).ok, true, 'السجل بشكل 1.1.0');
  assert.deepEqual(rec.english.map((t) => t.key), ['en|manual'], 'المسار الإنجليزي الأصلي وحده في السجل');
  assert.deepEqual(rec.fingerprints.map((f) => f.id), ['fp_test000001', 'fp_test000002']);
  assert.equal(rec.arabic.fingerprintId, null, 'مرجع البصمة اليابانية لا يراه 1.1.0');
  assert.equal(rec.arabic.comparison, null);
  assert.equal('lang' in rec.arabic, false);
  for (const kind of ['alts', 'prev']) {
    const v = d[`${kind}:${A}`];
    assert.equal(V11_VALIDATORS[kind](v).ok, true, `${kind} بشكل 1.1.0`);
  }
  assert.equal('lang' in d[`alts:${A}`].slots[1].track, false);
  const lang = d[`lang:${A}`];
  assert.deepEqual(lang.sources.map((t) => t.key), ['ja|manual', 'ar|asr|en']);
  assert.deepEqual(lang.prints.map((f) => f.id), ['fp_test000003']);
  assert.equal(lang.slots[0].lang, 'en');
  assert.equal(lang.slots[0].ref.fingerprintId, 'fp_test000003');
  assert.equal(lang.slots[1].lang, 'fr');
  assert.equal(lang.slots[2], null);
  assert.equal(lang.previous.lang, 'ar');
  assert.deepEqual(lang.base, { rev: rec.rev, createdAt: rec.createdAt, updatedAt: rec.updatedAt });
});

test('2.0.0 يقرأ ما كتبه بنفسه كما هو: المسارات واللغات والمراجع، بلا كتابة عند القراءة', async () => {
  const { area, two } = pair();
  await seedBundle(two, langBundle());
  const before = area.dump();
  const b = await createStore({ area, now: clock(Date.parse(NOW) + 9e6) }).getBundle(A);
  assert.deepEqual(b.record.english.map((t) => t.key), ['en|manual', 'ja|manual', 'ar|asr|en']);
  assert.equal(b.record.english[2].via, 'en');
  assert.equal(b.record.arabic.lang, 'en');
  assert.equal(b.record.arabic.fingerprintId, 'fp_test000003', 'المرجع عاد');
  assert.equal(b.slots[0].track.lang, 'en');
  assert.equal(b.slots[1].track.lang, 'fr');
  assert.equal(b.previous.track.lang, 'ar');
  assert.deepEqual(area.dump(), before, 'القراءة لا تكتب');
});

test('1.1.0 يقرأ مكتبة 2.0.0 بلا خطأ ولا كتابة، ويتجاهل اللغات', async () => {
  const { area, old, two } = pair();
  await seedBundle(two, langBundle());
  const before = area.dump();
  const b = await old.getBundle(A);
  assert.equal(b.active, 1);
  assert.deepEqual(b.record.english.map((t) => t.key), ['en|manual']);
  assert.equal(b.slots[1].name, 'مراجعة');
  const list = await old.listIndex();
  assert.deepEqual(list.map((e) => e.videoId), [A]);
  assert.ok((await old.capacity()).bytesInUse > 0);
  assert.deepEqual(area.dump(), before, 'لا كتابة ولا حذف من 1.1.0 عند القراءة');
});

test('1.1.0 يكتب (إزاحة) ثم 2.0.0 يقرأ: اللغات والمراجع والمسارات كلها باقية، وتُحدَّث نسخة lang:', async () => {
  const { area, old, two } = pair();
  await seedBundle(two, langBundle());
  await old.updateVideo(A, (r) => withViewV11(r, { displayOffsetMs: 900 }, NOW));
  assert.equal(area.dump()[`lang:${A}`].base.rev, 1, 'lang: لم يمسه 1.1.0');
  const b = await two.getBundle(A);
  assert.equal(b.record.view.displayOffsetMs, 900);
  assert.equal(b.record.arabic.lang, 'en');
  assert.equal(b.record.arabic.fingerprintId, 'fp_test000003');
  assert.equal(b.slots[1].track.lang, 'fr');
  assert.deepEqual(b.record.english.map((t) => t.key), ['en|manual', 'ja|manual', 'ar|asr|en']);
  const d = area.dump();
  assert.equal(d[`lang:${A}`].base.rev, d[`video:${A}`].rev, 'المصالحة كتبت النسخة الجديدة');
});

test('1.1.0 يستبدل الترجمة النشطة: لا تلتصق بها لغة سابقتها ولا مرجعها، وتبقى لغة الخانة الأخرى', async () => {
  const { old, two } = pair();
  await seedBundle(two, langBundle());
  await old.updateBundle(A, (b) => withSlotUploadV11(b, 1, {
    videoId: A, fileName: 'new.srt', cues: makeCues(5, { text: (i) => `جديد ${i}` }), comparison: null, fingerprintId: null, notes: [],
  }, NOW, { replace: true }).bundle);
  const b = await two.getBundle(A);
  assert.equal(b.record.arabic.fileName, 'new.srt');
  assert.equal('lang' in b.record.arabic, false, 'غير محددة');
  assert.equal(b.record.arabic.fingerprintId, null);
  assert.equal(b.slots[1].track.lang, 'fr');
  assert.deepEqual(b.record.english.map((t) => t.key), ['en|manual', 'ja|manual', 'ar|asr|en'], 'المسارات باقية');
});

test('1.1.0 يحذف الفيديو: lang: يتيم يزيله 2.0.0 عند فهرسة المحفوظات، ولا يعود لسجل جديد', async () => {
  const { area, old, two } = pair();
  await seedBundle(two, langBundle());
  await old.deleteVideo(A);
  assert.ok(area.dump()[`lang:${A}`], '1.1.0 لا يعرف lang:');
  await two.listIndex();
  assert.equal(area.dump()[`lang:${A}`], undefined, 'أُزيل اليتيم');
});

test('سجل أعاد إنشاءه إصدار سابق بعد lang: قديم: لا تُدمج لغاته، وتُكتب من جديد', async () => {
  const { area, two } = pair();
  await seedBundle(two, langBundle());
  const stale = area.dump()[`lang:${A}`];
  await area.remove([`video:${A}`, `index:${A}`, `bundle:${A}`, `alts:${A}`, `prev:${A}`, `marks:${A}`]);
  await seedBundle(createStoreV11({ area, now: clock(Date.parse(NOW) + 7e6) }), { ...sampleBundle({ previous: false }) });
  area.rawSet(`lang:${A}`, stale);
  const b = await two.getBundle(A);
  assert.deepEqual(b.record.english.map((t) => t.key), ['en|manual'], 'لا مسارات من سجل سابق');
  assert.equal('lang' in b.record.arabic, false);
});

test('مكتبة كتبها 1.1.0 وحده: يقرؤها 2.0.0 بلا كتابة، وترجماتها «غير محددة»', async () => {
  const { area, old, two } = pair();
  await seedBundle(old, sampleBundle());
  const before = area.dump();
  const b = await two.getBundle(A);
  assert.equal(b.slots[1].name, 'مراجعة');
  assert.equal('lang' in b.record.arabic, false);
  assert.deepEqual(area.dump(), before);
});

test('النسخة الاحتياطية: بلا لغات بالإصدار 1 الذي يستعيده 1.1.0، وبها بالإصدار 2 الذي يرفضه 1.1.0 ويستعيده 2.0.0 كاملًا', async () => {
  const plain = pair();
  await seedBundle(plain.two, sampleBundle());
  const v1 = await createBackup({ store: plain.two, appVersion: '2.0.0', pause: noPause });
  assert.equal(JSON.parse(v1.text).version, 1);
  assert.equal((await readBackupV11(v1.text, { pause: noPause })).ok, true, '1.1.0 يقرأ نسخة بلا لغات');

  const withLang = pair();
  await seedBundle(withLang.two, langBundle());
  const v2 = await createBackup({ store: withLang.two, appVersion: '2.0.0', pause: noPause });
  assert.equal(JSON.parse(v2.text).version, 2);
  const r11 = await readBackupV11(v2.text, { pause: noPause });
  assert.equal(r11.code, 'BK_VERSION_NEWER', '1.1.0 يرفضها برسالة لا بفساد صامت');

  const target = createStore({ area: createMemoryArea({ unlimited: true }), now: clock(Date.parse(NOW) + 3e6) });
  const read = await readBackup(v2.text, { pause: noPause });
  assert.equal(read.ok, true);
  const { items } = restoreItems(planRestore(read, []), 'all');
  const report = await runRestore({ store: target, items, pause: noPause });
  assert.deepEqual(report.added, [A], 'استُعيدت');
  const b = await target.getBundle(A);
  assert.deepEqual(b.record.english.map((t) => t.key), ['en|manual', 'ja|manual', 'ar|asr|en']);
  assert.equal(b.record.arabic.lang, 'en');
  assert.equal(b.record.arabic.fingerprintId, 'fp_test000003');
  assert.equal(b.slots[1].track.lang, 'fr');
  assert.equal(b.previous.track.lang, 'ar');
});
