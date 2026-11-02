// التوافق والرجوع (P10-AC2، R47، عقد storage §٧–§٩) بلقطة مجمّدة من نموذج tj-v1 وتخزينه (test/fixtures/v1): بيانات الأول
// تُقرأ وتُكتب في الثاني بلا ترحيل ولا رفع لإصدار المخطط؛ وما يكتبه الثاني (ثلاث ترجمات وسابقة وعلامات وتفضيلات) يقرؤه
// الأول ويكتب عليه (إزاحة، واستبدال، وحذف العربية، وحذف الفيديو، وتغيير الإعدادات) دون خطأ ولا فقد صامت؛ ثم يقرأ الثاني
// الناتج ويصالحه بقواعد عقد التخزين §٩.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore as createStoreV1 } from '../../fixtures/v1/src/core/store/index.js';
import * as v1 from '../../fixtures/v1/src/core/model/transitions.js';
import { validateVideoRecord as validateV1 } from '../../fixtures/v1/src/core/model/video.js';
import { createStore } from '../../../src/core/store/index.js';
import { withActiveSlot, withMark, withSlotUpload } from '../../../src/core/model/bundle.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID, englishTrack, fingerprint, makeCues, videoRecord } from '../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const A = VIDEO_ID;
const clock = (start) => {
  let t = start;
  return () => (t += 1000);
};
/** الإصداران على مساحة تخزين واحدة (ملف التعريف نفسه)، بساعتين متتاليتين لا تتطابق تواريخهما. */
function pair() {
  const area = createMemoryArea({ unlimited: true });
  return { area, one: createStoreV1({ area, now: clock(Date.parse(NOW)) }), two: createStore({ area, now: clock(Date.parse(NOW) + 500) }) };
}
const arabicInput = (label) => ({ videoId: A, fileName: `${label}.ar.srt`, cues: makeCues(5, { text: (i) => `${label} ${i}` }), comparison: null, fingerprintId: null, notes: [] });
const iso = (s) => new Date(Date.parse(NOW) + s * 1000).toISOString();

/** حزمة الثاني الكاملة ومعها تفضيلاته. */
async function fullV2(two) {
  await seedBundle(two, sampleBundle({ third: true }));
  await two.setPrefs(samplePrefs());
  return two.getBundle(A);
}

test('الأول ← الثاني: سجل الأول وإعداداته تُقرأ وتُكتب بلا ترحيل، وmeta.schema يبقى 1، ولا مفتاح جديد لسجل بسيط', async () => {
  const { area, one, two } = pair();
  await one.updateVideo(A, () => videoRecord({ offset: 700 }));
  await one.setSettings({ offsetStepMs: 1000, appearance: { font: 'tajawal', scale: 120 } });
  const before = area.dump();
  const rec = await two.getVideo(A);
  assert.deepEqual(rec, before[`video:${A}`], 'كما كتبه الأول حرفيًا');
  assert.equal((await two.getSettings()).appearance.font, 'tajawal');
  const b = await two.getBundle(A);
  assert.equal(b.active, 1);
  assert.equal(b.slots[0].offsetMs, 700);
  assert.deepEqual(area.dump(), before, 'القراءة لا تكتب شيئًا');
  await two.updateVideo(A, (r) => v1.withView(r, { displayOffsetMs: 1200 }, NOW));
  const after = area.dump();
  assert.equal(after.meta.schema, 1);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'لا مفتاح جديد');
  assert.equal(validateV1(after[`video:${A}`]).ok, true, 'السجل بشكل الأول');
});

test('الثاني ← الأول: يقرأ الأول ما كتبه الثاني بلا خطأ: النشطة سجله، والفهرس، والإعدادات، والأحداث، والسعة', async () => {
  const { area, one, two } = pair();
  const b = await fullV2(two);
  const events = [];
  one.onChange((e) => events.push(e));
  const rec = await one.getVideo(A);
  assert.deepEqual(rec, b.record, 'الأول يرى النشطة كما هي');
  assert.equal(validateV1(rec).ok, true);
  const list = await one.listIndex();
  assert.deepEqual(list.map((e) => e.videoId), [A]);
  assert.equal((await one.getSettings()).offsetStepMs, 500);
  assert.ok((await one.capacity()).bytesInUse > 0);
  await two.updateBundle(A, (x) => withMark(x, 2, { index: 0, kind: 'todo' }, NOW).bundle);
  await area.flush();
  assert.ok(events.length >= 1 && events.every((e) => Object.keys(e).sort().join() === 'cleared,index,settings,videos'), 'أحداث الأول بشكلها، والمفاتيح الجديدة لا تصله');
  assert.equal(area.dump().meta.schema, 1, 'لا ST_SCHEMA_NEWER');
});

test('الأول يغيّر إعدادًا: تفضيلات الثاني (القاموس ومكان الحفظ) باقية كاملة، والإعدادات كاملة', async () => {
  const { one, two } = pair();
  await fullV2(two);
  await one.setSettings({ displayModeDefault: 'dual', export: { splitThreshold: 300 } });
  assert.deepEqual(await two.getPrefs(), samplePrefs(), 'لا فقد صامت للتفضيلات');
  const s = await two.getSettings();
  assert.equal(s.displayModeDefault, 'dual');
  assert.equal(s.export.splitThreshold, 300);
  await two.setSettings({ offsetStepMs: 1000 });
  assert.equal((await one.getSettings()).offsetStepMs, 1000, 'والأول يقرأ ما كتبه الثاني في الإعدادات');
});

test('الأول يزيح النشطة: تبقى في خانتها باسمها وعلاماتها، والأخريات والسابقة بلا مساس', async () => {
  const { one, two } = pair();
  const b = await fullV2(two);
  await one.updateVideo(A, (r) => v1.withView(r, { displayOffsetMs: -300 }, iso(5)));
  const after = await two.getBundle(A);
  assert.equal(after.active, 1);
  assert.equal(after.slots[0].offsetMs, -300);
  assert.deepEqual(after.slots[0].marks, b.slots[0].marks);
  assert.deepEqual(after.slots[1], b.slots[1]);
  assert.deepEqual(after.slots[2], b.slots[2]);
  assert.deepEqual(after.previous, b.previous);
});

test('الأول يستبدل النشطة: تبقى في خانتها ولا سابقة لها (الأول لا يعرفها)، والأخريات سليمة', async () => {
  const { one, two } = pair();
  const b = await fullV2(two);
  await one.updateVideo(A, (r) => v1.withArabicImport(r, arabicInput('من الأول'), iso(5), { replace: true }).record);
  const after = await two.getBundle(A);
  assert.equal(after.slots[0].track.fileName, 'من الأول.ar.srt');
  assert.equal(after.slots[0].offsetMs, 0);
  assert.equal(after.slots[0].marks.length, 2, 'العلامات باقية وحلّها يبيّن مصيرها');
  assert.deepEqual(after.previous, b.previous, 'السابقة كما كانت');
  assert.deepEqual([after.slots[1].track, after.slots[2].track], [b.slots[1].track, b.slots[2].track]);
});

test('الأول يحذف العربية: تُفعَّل أصغر خانة ممتلئة غيرها بإزاحتها، والسابقة والأخرى باقيتان', async () => {
  const { one, two } = pair();
  const b = await fullV2(two);
  await one.updateVideo(A, (r) => v1.withoutArabic(r, iso(5)));
  const after = await two.getBundle(A);
  assert.equal(after.active, 2);
  assert.deepEqual(after.record.arabic, b.slots[1].track);
  assert.equal(after.record.view.displayOffsetMs, -1200);
  assert.equal(after.slots[0].track, null);
  assert.deepEqual(after.slots[2].track, b.slots[2].track);
  assert.deepEqual(after.previous, b.previous);
  assert.equal((await one.getVideo(A)).arabic.fileName, b.slots[1].track.fileName, 'والأول يرى المصالحة');
});

test('الأول يحذف الفيديو: الثاني يجده محذوفًا وينظّف توابعه؛ والأول يمسح الكل فيمسحها معه', async () => {
  const { area, one, two } = pair();
  await fullV2(two);
  await one.deleteVideo(A);
  assert.equal(await two.getBundle(A), null);
  assert.deepEqual(Object.keys(area.dump()).sort(), ['meta', 'prefs'], 'لا توابع يتيمة');
  await fullV2(two);
  await one.clearAll();
  assert.deepEqual(Object.keys(area.dump()), ['meta']);
  assert.deepEqual(await two.getPrefs(), (await createStore({ area }).getPrefs()), 'التفضيلات تعود افتراضية بعد المسح الكامل المقصود');
});

test('الأول يصدّر حتى امتلاء حد البصمات: يسقط مرجع الخانة غير النشطة، فيُقرأ في الثاني null لا تلفًا', async () => {
  const { one, two } = pair();
  await fullV2(two);
  const track = englishTrack();
  for (let i = 0; i < 10; i++) {
    const fp = fingerprint({ track, id: `fp_more${String(i).padStart(6, '0')}`, createdAt: iso(10 + i) });
    await one.updateVideo(A, (r) => v1.withExport(r, { videoId: A, englishTrack: track, fingerprint: fp }, iso(10 + i)));
  }
  const after = await two.getBundle(A);
  assert.equal(after.record.fingerprints.length, 10);
  assert.equal(after.slots[1].track.fingerprintId, null);
  assert.equal(after.slots[1].track.fileName, sampleBundle().slots[1].track.fileName, 'الترجمة نفسها سليمة');
  assert.equal(after.record.arabic.fingerprintId, 'fp_test000001', 'مرجع النشطة يحميه الأول');
});

test('رحلة الرجوع كاملة: الأول ← الثاني ← الأول ← الثاني دون فقد', async () => {
  const { area, one, two } = pair();
  // ١. الأول ينشئ بيانات.
  await one.updateVideo(A, () => videoRecord());
  await one.setSettings({ offsetStepMs: 1000 });
  // ٢. الثاني يضيف ترجمة ثانية ويفعّلها وعلامات وتفضيلات.
  await two.updateBundle(A, (b) => withSlotUpload(b, 2, arabicInput('ثانية'), iso(3)).bundle);
  await two.updateBundle(A, (b) => withMark(b, 2, { index: 1, kind: 'todo' }, iso(4)).bundle);
  await two.updateBundle(A, (b) => withActiveSlot(b, 1, iso(5)));
  await two.setPrefs(samplePrefs());
  // ٣. الأول مرة أخرى يقرأ ويكتب: إزاحة وإعداد.
  assert.equal((await one.getVideo(A)).arabic.fileName, `${A}.ar.srt`);
  await one.updateVideo(A, (r) => v1.withView(r, { displayOffsetMs: 2000 }, iso(6)));
  await one.setSettings({ appearance: { scale: 130 } });
  assert.equal((await one.listIndex()).length, 1);
  // ٤. الثاني يقرأ الناتج سليمًا.
  const b = await two.getBundle(A);
  assert.equal(b.active, 1);
  assert.equal(b.slots[0].offsetMs, 2000);
  assert.equal(b.slots[1].track.fileName, 'ثانية.ar.srt');
  assert.equal(b.slots[1].marks.length, 1);
  assert.deepEqual(await two.getPrefs(), samplePrefs());
  const s = await two.getSettings();
  assert.equal(s.offsetStepMs, 1000);
  assert.equal(s.appearance.scale, 130);
  assert.equal(area.dump().meta.schema, 1);
});
