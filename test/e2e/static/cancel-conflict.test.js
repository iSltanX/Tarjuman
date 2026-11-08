// P15-AC3 (آلي): مسارات التعارض والفشل الجزئي ببصمة التخزين قبلها وبعدها، على التخزين ووحدات الاستعادة الحقيقية. ومسارات
// الإلغاء في الواجهات مثبتة آليًا في test/integration (رفع المشغّل وتأكيده: player/slots.test.js؛ وحوار رفع المحفوظات
// ومعاينة الاستعادة: backup/backup.test.js).
//   node scripts/run-tests.mjs test/e2e/static
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, mergeReports, planRestore, readBackup, restoreItems, retryItems, runRestore } from '../../../src/core/backup/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW } from '../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];
const noPause = () => Promise.resolve();
const clock = () => {
  let t = Date.parse(NOW);
  return () => (t += 1000);
};
const print = (area) => JSON.stringify(area.dump());
const keysOf = (area, id) => Object.keys(area.dump()).filter((k) => k.endsWith(`:${id}`)).sort();

/** مكتبة من ثلاثة فيديوهات بخاناتها وسابقتها وعلاماتها وتفضيلاتها، ونسختها الاحتياطية مقروءة كما تقرؤها الإعدادات. */
async function sourceBackup() {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: clock() });
  for (const id of IDS) await seedBundle(store, sampleBundle({ videoId: id, third: id === IDS[2] }));
  await store.setPrefs(samplePrefs());
  const built = await createBackup({ store, appVersion: '0.2.0', pause: noPause });
  return { area, store, backup: await readBackup(built.text, { pause: noPause }) };
}

/** تخزين يفشل في كتابة أي مفتاح لفيديو بعينه (عطب مصطنع في منتصف الاستعادة)، وسليم فيما سواه. */
function failingFor(area, id, err = new Error('فشل محاكى في الكتابة')) {
  return { ...area, set: async (items) => { if (Object.keys(items).some((k) => k.endsWith(`:${id}`))) throw err; return area.set(items); } };
}

test('تعارض الحفظ بين تبويبين: الأحدث يُرفض بـST_CONFLICT، والتخزين بعد الرفض هو ما كتبه الأول حرفيًا', async () => {
  const area = createMemoryArea({ unlimited: true });
  const seed = createStore({ area, now: clock() });
  await seedBundle(seed, sampleBundle({ videoId: IDS[0] }));
  // سياقان (تبويبا محرّر) على التخزين نفسه، كلٌّ يقرأ الحزمة قبل أن يحفظ الآخر.
  const tabA = createStore({ area, now: clock() });
  const tabB = createStore({ area, now: clock() });
  const readA = await tabA.getBundle(IDS[0]);
  const readB = await tabB.getBundle(IDS[0]);
  // الخانة 2 غير النشطة (كما يحفظها محرّر مفتوح عليها).
  const edit = (label) => (b) => {
    const cues = structuredClone(b.slots[1].track.current ?? b.slots[1].track.original);
    cues[0].text = `${cues[0].text} — ${label}`;
    b.slots[1].track.current = cues;
    b.slots[1].track.editedAt = NOW;
    return b;
  };
  await tabA.updateBundle(IDS[0], edit('من الأول'), { expect: readA });
  await area.flush();
  const afterA = print(area);
  await assert.rejects(tabB.updateBundle(IDS[0], edit('من الثاني'), { expect: readB }), (err) => err.code === 'ST_CONFLICT');
  await area.flush();
  assert.equal(print(area), afterA, 'الرفض لا يكتب شيئًا');
  const now = await tabB.getBundle(IDS[0]);
  assert.match(now.slots[1].track.current[0].text, /من الأول$/);
  // بعد إعادة القراءة يُقبل حفظ الثاني فوق ما كتبه الأول (لا فقد صامت لأيٍّ منهما).
  const fresh = await tabB.getBundle(IDS[0]);
  await tabB.updateBundle(IDS[0], edit('من الثاني'), { expect: fresh });
  assert.match((await tabA.getBundle(IDS[0])).slots[1].track.current[0].text, /من الأول — من الثاني$/);
});

test('فشل جزئي مصطنع في الاستعادة: الناجح يُكتب كاملًا، والفاشل لا يترك مفتاحًا، وإعادة المحاولة تكمل المكتبة مطابقة', async () => {
  const src = await sourceBackup();
  const target = createMemoryArea({ unlimited: true });
  const before = print(target);
  const { items } = restoreItems(planRestore(src.backup, []), new Set());
  const broken = createStore({ area: failingFor(target, IDS[1]), now: clock() });
  const report = await runRestore({ store: broken, items, pause: noPause });
  assert.deepEqual(report.added, [IDS[0], IDS[2]]);
  assert.deepEqual(report.failed.map((f) => f.videoId), [IDS[1]]);
  assert.equal(report.stopped, false);
  assert.notEqual(print(target), before);
  assert.deepEqual(keysOf(target, IDS[1]), [], 'لا مفتاح للفيديو الفاشل (كتابة ذرية)');
  assert.ok(keysOf(target, IDS[0]).length > 0 && keysOf(target, IDS[2]).length > 0);

  const healthy = createStore({ area: target, now: clock() });
  const retry = await runRestore({ store: healthy, items: retryItems(report, items), pause: noPause });
  const merged = mergeReports(report, retry);
  assert.deepEqual([...merged.added].sort(), [...IDS].sort());
  assert.deepEqual(merged.failed, []);
  for (const id of IDS) {
    const a = await src.store.getBundle(id);
    const b = await healthy.getBundle(id);
    assert.deepEqual(b.slots.map((s) => s.track?.fileName ?? null), a.slots.map((s) => s.track?.fileName ?? null), id);
    assert.deepEqual(b.slots.map((s) => s.marks.length), a.slots.map((s) => s.marks.length), id);
    assert.equal(b.previous?.track.fileName ?? null, a.previous?.track.fileName ?? null, id);
    assert.equal(b.active, a.active, id);
  }
});

test('امتلاء التخزين في منتصف الاستعادة يوقفها: ما قبله مكتوب، وما بعده «باقٍ» بلا مفتاح، ويُستكمل بالإعادة', async () => {
  const src = await sourceBackup();
  const target = createMemoryArea({ unlimited: true });
  const quota = Object.assign(new Error('Resource::kQuotaBytes quota exceeded'), {});
  const { items } = restoreItems(planRestore(src.backup, []), new Set());
  const report = await runRestore({ store: createStore({ area: failingFor(target, IDS[1], quota), now: clock() }), items, pause: noPause });
  assert.equal(report.stopped, true);
  assert.deepEqual(report.added, [IDS[0]]);
  assert.deepEqual(report.remaining, [IDS[1], IDS[2]]);
  assert.deepEqual([...keysOf(target, IDS[1]), ...keysOf(target, IDS[2])], []);
  const retry = await runRestore({ store: createStore({ area: target, now: clock() }), items: retryItems(report, items), pause: noPause });
  assert.deepEqual(mergeReports(report, retry).added.sort(), [...IDS].sort());
});

test('الاستعادة فوق الموجود بالتخطي الافتراضي لا تغيّر بصمة الموجود، والإلغاء قبل التشغيل (المعاينة وحدها) لا يكتب شيئًا', async () => {
  const src = await sourceBackup();
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: clock() });
  await seedBundle(store, sampleBundle({ videoId: IDS[0], previous: false }));
  await area.flush();
  const before = print(area);
  // المعاينة (قراءة وتخطيط) ثم الإلغاء: لا كتابة.
  const plan = planRestore(src.backup, (await store.listIndex()).map((x) => x.videoId));
  assert.equal(print(area), before);
  // التشغيل بالتخطي: الموجود كما هو حرفيًا، والجديد يُضاف.
  const report = await runRestore({ store, ...restoreItems(plan, new Set()), pause: noPause });
  assert.deepEqual(report.skipped, [IDS[0]]);
  await area.flush();
  assert.deepEqual(report.failed, []);
  const after = area.dump();
  for (const k of Object.keys(JSON.parse(before))) assert.deepEqual(after[k], JSON.parse(before)[k], `الموجود ${k} لم يتغير`);
  assert.ok(keysOf(area, IDS[1]).length > 0 && keysOf(area, IDS[2]).length > 0);
});
