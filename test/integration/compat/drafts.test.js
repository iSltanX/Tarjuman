// توافق مسودة المحرّر (الفكرة ٩، ح-48؛ عقد storage §١٦) مع الإصدارات السابقة بلقطتيها المجمّدتين: 1.1.0 (test/fixtures/v1.1) وtj-v1
// (test/fixtures/v1). المفتاح draft:<id> جديد عليهما: يتجاهله parseKey فيهما فلا يدخل قراءتهما ولا أحداثهما ولا كتاباتهما، وحذفهما
// للفيديو يتركه يتيمًا يكنسه فهرس المحفوظات في هذا الإصدار، ومسحهما الكامل يزيله. والنسخة الاحتياطية لا تحمله ولا يتغير إصدارها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore as createStoreV11 } from '../../fixtures/v1.1/src/core/store/index.js';
import { withView as withViewV11 } from '../../fixtures/v1.1/src/core/model/transitions.js';
import { parseKey as parseKeyV11 } from '../../fixtures/v1.1/src/core/store/keys.js';
import { createStore as createStoreV1 } from '../../fixtures/v1/src/core/store/index.js';
import { parseKey as parseKeyV1 } from '../../fixtures/v1/src/core/store/keys.js';
import { createStore } from '../../../src/core/store/index.js';
import { createBackup } from '../../../src/core/backup/create.js';
import { draftOf } from '../../../src/core/model/draft.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID as A, videoRecord } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const clock = (start) => {
  let t = start;
  return () => (t += 1000);
};
const KEY = `draft:${A}`;
const TEXT = 'تعديل في مسودة لم يُحفظ بعد';

/** المكتبة الحالية بمسودة للخانة الأولى، ثم إصدار سابق على المساحة نفسها. */
async function seeded(makeOld) {
  const area = createMemoryArea({ unlimited: true });
  const two = createStore({ area, now: clock(Date.parse(NOW) + 500) });
  await seedBundle(two, sampleBundle());
  const slot = (await two.getBundle(A)).slots[0];
  const cues = slot.track.current.map((c, i) => (i === 0 ? { ...c, text: TEXT } : c));
  await two.setDraft(A, 1, draftOf({ cues, offsetMs: slot.offsetMs, committedMs: 0 }, slot, NOW));
  await area.flush();
  return { area, two, old: makeOld(area), draft: structuredClone(area.dump()[KEY]) };
}
const v11 = (area) => createStoreV11({ area, now: clock(Date.parse(NOW)) });
const v1 = (area) => createStoreV1({ area, now: clock(Date.parse(NOW)) });

test('parseKey في 1.1.0 وtj-v1 يتجاهل المفتاح draft:<id> (يعيد null)، فلا يدخل قراءتهما ولا أحداثهما ولا ترحيلهما', () => {
  assert.equal(parseKeyV11(KEY), null);
  assert.equal(parseKeyV1(KEY), null);
});

test('1.1.0 يقرأ المكتبة ويكتب عليها والمسودة قائمة: بلا خطأ، ولا تمسها كتاباته، ولا حدث عنده لكتابتها أو حذفها', async () => {
  const { area, two, old, draft } = await seeded(v11);
  const events = [];
  const off = old.onChange((c) => events.push(c));
  assert.equal((await old.getBundle(A)).active, 1);
  assert.equal((await old.listLibrary()).length, 1);
  assert.deepEqual(await old.unreadableVideos(), []);
  await old.updateVideo(A, (r) => withViewV11(r, { displayOffsetMs: 300 }, NOW));
  await old.setSettings({ offsetStepMs: 1000 });
  await area.flush();
  assert.deepEqual(area.dump()[KEY], draft, 'لم يمسها 1.1.0');
  const before = events.length;
  await two.setDraft(A, 2, { ...draft.slots[0], savedAt: '2026-11-01T12:30:00.000Z' });
  await two.clearDraft(A, 2);
  await area.flush();
  assert.equal(events.length, before, 'لا حدث في 1.1.0 لكتابة المسودة أو حذفها');
  off();
});

test('1.1.0 يحذف الفيديو فتبقى المسودة يتيمة، ويكنسها فهرس المحفوظات في هذا الإصدار؛ ومسحه الكامل يزيلها', async () => {
  const { area, two, old } = await seeded(v11);
  await old.deleteVideo(A);
  await area.flush();
  assert.ok(area.dump()[KEY], 'حذف 1.1.0 لا يعرف المفتاح فيبقى');
  assert.deepEqual(await two.listLibrary(), []);
  assert.equal(area.dump()[KEY], undefined, 'كُنست');
  const again = await seeded(v11);
  await again.old.clearAll();
  assert.equal(again.area.dump()[KEY], undefined, 'المسح الكامل في 1.1.0 يزيلها');
});

test('tj-v1 يقرأ ويكتب ويحذف: المسودة باقية بلا خطأ ثم يتيمة يكنسها هذا الإصدار؛ ومسحه الكامل يزيلها', async () => {
  const { area, two, old, draft } = await seeded(v1);
  assert.ok(await old.getVideo(A));
  await old.setSettings({ offsetStepMs: 1000 });
  await old.updateVideo(A, () => videoRecord({ offset: 700 }));
  await area.flush();
  assert.deepEqual(area.dump()[KEY], draft, 'لم يمسها tj-v1');
  await old.deleteVideo(A);
  await area.flush();
  assert.ok(area.dump()[KEY]);
  assert.deepEqual(await two.listIndex(), []);
  assert.equal(area.dump()[KEY], undefined, 'كُنست');
  const again = await seeded(v1);
  await again.old.clearAll();
  assert.equal(again.area.dump()[KEY], undefined, 'المسح الكامل في tj-v1 يزيلها');
});

test('النسخة الاحتياطية لا تحمل المسودة: لا نصها ولا مفتاحها، وإصدار الصيغة كما بدونها', async () => {
  const noPause = async () => {};
  const { two } = await seeded(v11);
  const withDraft = await createBackup({ store: two, appVersion: '2.2.0', pause: noPause });
  assert.equal(withDraft.text.includes(TEXT), false, 'نص المسودة غائب');
  assert.equal(withDraft.text.includes('draft'), false);
  await two.clearDraft(A, 1);
  const without = await createBackup({ store: two, appVersion: '2.2.0', pause: noPause });
  assert.equal(JSON.parse(withDraft.text).version, JSON.parse(without.text).version);
  assert.deepEqual(JSON.parse(withDraft.text).data, JSON.parse(without.text).data);
});
