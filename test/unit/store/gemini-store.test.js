// تحقق Gemini، الجولة الثانية: ع-١٤ (أ) «استبدال» الاستعادة يصلح سجلًا تالفًا مُلخّصه سليم (عقد storage §١٠: «replace يطمسه
// كله… فيصلحه»؛ كان كل استبدال «changed» لأن نسخة السجل التالف لا تطابق نسخة المُلخّص المعروض)، وع-١٥ كتابة بلا expect لا
// تُرفض بـST_CONFLICT تحت تزاحم سياقين (كانت المحاولات الثلاث فورية فتخسر السباق نفسه أمام رشقة السياق الآخر).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, localTransport, sharedWriter, videoKey } from '../../../src/core/store/index.js';
import { bundleToBackup } from '../../../src/core/model/bundle.js';
import { withView } from '../../../src/core/model/transitions.js';
import { createBackup, planRestore, readBackup, reportCode, restoreItems, runRestore } from '../../../src/core/backup/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { storeEnv } from '../../helpers/store-env.js';
import { NOW, VIDEO_ID as A, videoRecord } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

let t = Date.parse(NOW);
const now = () => (t += 1000);
const noPause = () => Promise.resolve();

/** تلف خارجي في video:<id> وحده، والمُلخّص index:<id> سليم كما كتبه التخزين. */
const CORRUPTIONS = [
  ['كائن فارغ', () => ({})],
  ['نص', () => 'x'],
  ['بلا rev', (rec) => Object.fromEntries(Object.entries(rec).filter(([k]) => k !== 'rev'))],
  ['null', () => null],
];

/** فيديو محفوظ، ثم تلف سجله، ثم سياق جديد (صفحة الإعدادات) يرى صفه في المحفوظات. */
async function corrupted(corrupt) {
  const area = createMemoryArea({ unlimited: true });
  await seedBundle(createStore({ area, now }), sampleBundle());
  const rec = (await area.get(videoKey(A)))[videoKey(A)];
  area.rawSet(videoKey(A), corrupt(rec));
  await area.flush();
  const page = createStore({ area, now });
  const row = (await page.listLibrary()).find((x) => x.entry.videoId === A);
  return { area, page, row };
}

for (const [label, corrupt] of CORRUPTIONS) {
  test(`ع-١٤ (أ): سجل تالف (${label}) ومُلخّصه سليم: الافتراضي يتخطاه، والاستبدال على نسخة المعاينة يصلحه من النسخة`, async () => {
    const { page, row } = await corrupted(corrupt);
    assert.ok(row, 'الصف ظاهر في المحفوظات بمُلخّصه');
    const before = await page.getBundle(A).then((b) => (b === null ? null : 'مقروء'), (e) => e.code);
    assert.ok(before === null || before === 'ST_CORRUPT_RECORD', `لا يُفتح قبل الإصلاح (${before})`);
    const expect = { rev: row.entry.rev, updatedAt: row.entry.updatedAt };
    const entry = bundleToBackup(sampleBundle({ third: true }));
    assert.deepEqual(await page.restoreVideo(entry, { expect }), { status: 'skipped' }, 'الموجود ولو تالفًا يُتخطى افتراضيًا');
    assert.deepEqual(await page.restoreVideo(entry, { replace: true, expect }), { status: 'replaced' });
    const fixed = await page.getBundle(A);
    assert.equal(fixed.record.videoId, A);
    assert.equal(fixed.slots[2].track.fileName, sampleBundle({ third: true }).slots[2].track.fileName, 'أُصلح من النسخة');
  });
}

test('ع-١٤ (أ): مسار صفحة الإعدادات كاملًا (مجسّ p02-ج): replaced=1 وchanged=0 والفيديو مقروء بعدها', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  await seedBundle(store, sampleBundle());
  const built = await createBackup({ store, appVersion: '2.2.0', pause: noPause });
  area.rawSet(videoKey(A), {});
  await area.flush();
  const page = createStore({ area, now });
  const read = await readBackup(built.text, { pause: noPause });
  const library = await page.listLibrary();
  const unreadable = await page.unreadableVideos();
  const prints = new Map();
  for (const id of unreadable) prints.set(id, await page.rawPrint(id));
  const seen = new Map(library.map((x) => [x.entry.videoId, x.entry]));
  const plan = planRestore(read, [...seen.keys(), ...unreadable], seen, prints);
  const { items, skipped } = restoreItems(plan, 'all');
  const report = await runRestore({ store: page, items, skipped, pause: noPause });
  assert.deepEqual([report.replaced.length, report.changed.length, report.failed.length], [1, 0, 0]);
  assert.equal(reportCode(report), 'BK_RESTORE_DONE');
  assert.equal((await page.getBundle(A)).record.videoId, A, 'مقروء بعد الاستبدال');
});

test('ع-١٤ (أ): إصلاح من سياق آخر بعد المعاينة لا يُطمس: الاستبدال على المُلخّص القديم changed، وبيانات الآخر باقية', async () => {
  const { area, page, row } = await corrupted(() => ({}));
  const expect = { rev: row.entry.rev, updatedAt: row.entry.updatedAt };
  const other = createStore({ area, now });
  const theirs = sampleBundle();
  theirs.record.title = 'إصلاح من تبويب آخر';
  assert.deepEqual(await other.restoreVideo(bundleToBackup(theirs), { replace: true }), { status: 'replaced' });
  await area.flush();
  assert.deepEqual(await page.restoreVideo(bundleToBackup(sampleBundle({ third: true })), { replace: true, expect }), { status: 'changed' });
  assert.equal((await page.getVideo(A)).title, 'إصلاح من تبويب آخر');
});

test('ع-١٥: سياقان يكتبان على الفيديو نفسه معًا بلا expect (رشقة ±): لا ST_CONFLICT، ولا تحديث ضائع', async () => {
  const env = storeEnv();
  const a = env.context();
  const b = env.context();
  await a.updateVideo(A, () => ({ ...videoRecord(), view: { displayOffsetMs: 0, displayMode: 'ar' } }));
  const N = 12;
  const codes = [];
  const bump = (ctx) => ctx.updateVideo(A, (r) => withView(r, { displayOffsetMs: r.view.displayOffsetMs + 100 }, new Date(env.now()).toISOString()))
    .catch((err) => { codes.push(err.code ?? err.name); });
  await Promise.all(Array.from({ length: N }, (_, i) => bump(i % 2 ? a : b)));
  assert.deepEqual(codes, [], 'لا رفض لكتابة بلا expect');
  assert.equal((await env.context().getVideo(A)).view.displayOffsetMs, N * 100, 'كل الكتابات وقعت مرة واحدة');
});

test('ع-١٥: إعادة الكتابة بعد ST_CONFLICT بمهلة متزايدة وحتى ثلاث مرات، ومع expect لا إعادة ولا مهلة', async () => {
  const area = createMemoryArea({ unlimited: true });
  await createStore({ area, now }).updateVideo(A, () => videoRecord());
  const base = localTransport(sharedWriter(area));
  // كاتب يرفض كل put: سياق آخر يسبق في كل جولة.
  const transport = { send: (req) => (req.op === 'put' ? Promise.resolve({ v: 1, ok: false, code: 'ST_CONFLICT', detail: 'محاكى' }) : base.send(req)) };
  const slept = [];
  const store = createStore({ area, now, transport, sleep: async (ms) => { slept.push(ms); } });
  let calls = 0;
  await assert.rejects(store.updateVideo(A, (r) => { calls++; return withView(r, { displayOffsetMs: 300 }, NOW); }), (e) => e.code === 'ST_CONFLICT');
  assert.equal(calls, 3, 'ثلاث محاولات كما في العقد');
  assert.equal(slept.length, 2, 'مهلة قبل الثانية وقبل الثالثة');
  assert.ok(slept[0] > 0 && slept[1] > slept[0], `متزايدة: ${slept.join('، ')}`);
  slept.length = 0;
  const cur = await store.getVideo(A);
  await assert.rejects(store.updateVideo(A, (r) => withView(r, { displayOffsetMs: 600 }, NOW), { expect: cur }), (e) => e.code === 'ST_CONFLICT');
  assert.deepEqual(slept, [], 'expect يُرفض فورًا');
});
