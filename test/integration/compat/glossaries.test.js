// توافق قوائم المصطلحات لكل زوج (الفكرة ٨، ح-45 وح-46؛ عقد storage §١٥) مع الإصدارات السابقة بلقطتيها المجمّدتين: 1.1.0
// (test/fixtures/v1.1) وtj-v1 (test/fixtures/v1). المفتاح glossaries مستقل بلا ترحيل: يتجاهله parseKey فيهما، فلا تمسه كتاباتهما
// (القاموس العام والتفضيلات والإعدادات والسجلات) ولا تطلق أحداثهما، ومسحهما الكامل يزيله لأنه مقصود المستخدم. والنسخة الاحتياطية
// بالقوائم بالإصدار 3 يرفضها قارئ 1.1.0 وقارئ 2.2.0 برسالة «من إصدار أحدث»، وبلا قوائم تبقى كما كانت (tj-v1 لا استعادة فيه).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore as createStoreV11 } from '../../fixtures/v1.1/src/core/store/index.js';
import { withView as withViewV11 } from '../../fixtures/v1.1/src/core/model/transitions.js';
import { parseKey as parseKeyV11 } from '../../fixtures/v1.1/src/core/store/keys.js';
import { createStore as createStoreV1 } from '../../fixtures/v1/src/core/store/index.js';
import { parseKey as parseKeyV1 } from '../../fixtures/v1/src/core/store/keys.js';
import { readBackup as readBackupV11 } from '../../fixtures/v1.1/src/core/backup/read.js';
import { createStore } from '../../../src/core/store/index.js';
import { createBackup } from '../../../src/core/backup/create.js';
import { readBackup } from '../../../src/core/backup/read.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID as A, videoRecord } from '../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const clock = (start) => {
  let t = start;
  return () => (t += 1000);
};
const EN_AR = { from: 'en', to: 'ar' };
const ANY_FR = { from: '*', to: 'fr' };

/** المكتبة الحالية بقاموس عام وقائمتي زوج، ثم إصدار سابق على المساحة نفسها. */
async function seeded(makeOld) {
  const area = createMemoryArea({ unlimited: true });
  const two = createStore({ area, now: clock(Date.parse(NOW) + 500) });
  await seedBundle(two, sampleBundle());
  await two.setPrefs(samplePrefs());
  await two.addGlossaryList(EN_AR);
  await two.addListTerm(EN_AR, { source: 'cache', target: 'الذاكرة المؤقتة', note: null });
  await two.addGlossaryList(ANY_FR);
  await two.addListTerm(ANY_FR, { source: 'Tarjuman', target: 'Tarjuman', note: 'اسم علم' });
  await area.flush();
  return { area, two, old: makeOld(area), lists: structuredClone(area.dump().glossaries) };
}
const v11 = (area) => createStoreV11({ area, now: clock(Date.parse(NOW)) });
const v1 = (area) => createStoreV1({ area, now: clock(Date.parse(NOW)) });

test('parseKey في 1.1.0 وtj-v1 يتجاهل المفتاح glossaries (يعيد null)، فلا يدخل قراءتهما ولا أحداثهما ولا ترحيلهما', () => {
  assert.equal(parseKeyV11('glossaries'), null);
  assert.equal(parseKeyV1('glossaries'), null);
});

test('1.1.0 يعدّل القاموس العام والتفضيلات ويقرأ المكتبة: القوائم باقية كما هي، ولا حدث لها عنده، و2.x يقرؤها بعده', async () => {
  const { area, two, old, lists } = await seeded(v11);
  const events = [];
  const off = old.onChange((c) => events.push(c));
  assert.equal((await old.getBundle(A)).active, 1);
  assert.equal((await old.addTerm({ source: 'latency', target: 'زمن الاستجابة', note: null })).added, true);
  assert.equal((await old.removeTerm('prompt')).removed, true);
  await old.setPrefs({ review: { maxCps: 20 } });
  await old.setSettings({ offsetStepMs: 1000 });
  await old.updateVideo(A, (r) => withViewV11(r, { displayOffsetMs: 300 }, NOW));
  await area.flush();
  assert.deepEqual(area.dump().glossaries, lists, 'لم يمسها 1.1.0');
  // كتابة القوائم من 2.x لا تصل 1.1.0 حدثًا (يتجاهل المفتاح).
  const before = events.length;
  await two.addListTerm(EN_AR, { source: 'build', target: 'بناء', note: null });
  await area.flush();
  assert.equal(events.length, before, 'لا حدث في 1.1.0 لتغيير القوائم وحدها');
  off();
  const g = await two.getGlossaries();
  assert.deepEqual(g.lists.map((l) => [l.from, l.to, l.terms.map((t) => t.source)]), [['en', 'ar', ['cache', 'build']], ['*', 'fr', ['Tarjuman']]]);
  assert.deepEqual((await two.getPrefs()).glossary.terms.map((t) => t.source), ['token', 'fine-tuning', 'latency'], 'القاموس العام كما عدّله 1.1.0');
});

test('1.1.0 يمسح كل البيانات: يزيل القوائم مع الباقي، و2.x يقرؤها فارغة', async () => {
  const { area, two, old } = await seeded(v11);
  await old.clearAll();
  assert.equal(area.dump().glossaries, undefined);
  assert.deepEqual(await two.getGlossaries(), { schema: 1, lists: [] });
});

test('tj-v1 يقرأ ويكتب (الإعدادات والسجل): القوائم باقية كما هي؛ ومسحه الكامل يزيلها', async () => {
  const { area, two, old, lists } = await seeded(v1);
  assert.ok(await old.getVideo(A));
  await old.setSettings({ offsetStepMs: 1000 });
  await old.updateVideo(A, () => videoRecord({ offset: 700 }));
  await area.flush();
  assert.deepEqual(area.dump().glossaries, lists, 'لم يمسها tj-v1');
  assert.equal((await two.getGlossaries()).lists.length, 2);
  await old.clearAll();
  assert.equal(area.dump().glossaries, undefined, 'المسح الكامل في tj-v1 يزيلها');
});

test('ح-46: نسخة بقوائم أزواج (الإصدار 3) يرفضها قارئ 1.1.0 وقارئ 2.2.0 بـBK_VERSION_NEWER لا «ليست نسخة»، وبلا قوائم يقرؤها 1.1.0 كما كانت', async () => {
  const noPause = async () => {};
  const { two } = await seeded(v11);
  const v3 = await createBackup({ store: two, appVersion: '2.2.0', pause: noPause });
  assert.equal(JSON.parse(v3.text).version, 3);
  const r11 = await readBackupV11(v3.text, { pause: noPause });
  assert.equal(r11.ok, false);
  assert.equal(r11.code, 'BK_VERSION_NEWER', '1.1.0 يرفضها برسالة لا بفساد صامت');
  // قارئ 2.2.0: الشيفرة نفسها بالإصدار الأعلى الذي يقرؤه (BACKUP_VERSION = 2 في c04a606)، وفحص الإصدار يسبق فحص الشكل ولم يتغير منذه.
  const r22 = await readBackup(v3.text, { pause: noPause, supportedVersion: 2 });
  assert.equal(r22.ok, false);
  assert.equal(r22.code, 'BK_VERSION_NEWER');
  // وبلا قوائم: الإصدار 1 الذي يستعيده 1.1.0 كما هو.
  const area = createMemoryArea({ unlimited: true });
  const plain = createStore({ area, now: clock(Date.parse(NOW)) });
  await seedBundle(plain, sampleBundle());
  const v1Text = (await createBackup({ store: plain, appVersion: '2.2.0', pause: noPause })).text;
  assert.equal(JSON.parse(v1Text).version, 1);
  assert.equal((await readBackupV11(v1Text, { pause: noPause })).ok, true);
});
