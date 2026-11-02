// انحدارات التخزين (تدقيق 5fedcb9): الاستعادة مع كاتب آخر بين القراءة والكتابة (CX-003)، والسجل المحلي التالف في
// الاستعادة (GM-006)، والقراءة المتأخرة لا تطمس حزمة أحدث في ذاكرة السياق (GM-004)، والسجل غير المقروء بلا مُلخّص يُذكر
// في النسخة الاحتياطية ومعاينة الاستعادة (CX-H4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/core/store/index.js';
import { bundleToBackup } from '../../../src/core/model/bundle.js';
import { withView } from '../../../src/core/model/transitions.js';
import { createBackup } from '../../../src/core/backup/create.js';
import { planRestore, restoreItems, runRestore } from '../../../src/core/backup/restore.js';
import { readBackup } from '../../../src/core/backup/read.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID as A } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

let t = Date.parse(NOW);
const now = () => (t += 1000);

/** مساحة مشتركة، ولكل سياق مخزنه؛ و`hold` يوقف قراءة السياق الأول التالية حتى يُطلق. */
function shared() {
  const area = createMemoryArea({ unlimited: true });
  const gate = { armed: null };
  const slowArea = {
    ...area,
    async get(keys) {
      const out = await area.get(keys);
      if (gate.armed && gate.armed.match(keys)) {
        const g = gate.armed;
        gate.armed = null;
        await g.run();
      }
      return out;
    },
  };
  return { area, gate, a: createStore({ area: slowArea, now }), b: createStore({ area, now }) };
}

test('CX-003: استعادة افتراضية وسياق آخر ينشئ الفيديو بين قراءتها وكتابتها: تُتخطى، وتبقى بيانات الآخر كاملة', async () => {
  const { gate, a, b } = shared();
  await a.ready();
  const source = sampleBundle({ third: true });
  const entry = bundleToBackup(source);
  const theirs = sampleBundle();
  // بعد لقطة الاستعادة الأولى (مفاتيح الحزمة الخمسة) يكمل السياق الآخر إنشاء الفيديو بخانتين وعلامات.
  gate.armed = { match: (keys) => Array.isArray(keys) && keys.length === 5 && keys[0] === `video:${A}`, run: () => seedBundle(b, theirs) };
  const r = await a.restoreVideo(entry);
  assert.deepEqual(r, { status: 'skipped' }, 'لا «أضيف» فوق سجل ظهر');
  const got = await b.getBundle(A);
  assert.equal(got.slots[1].name, 'مراجعة', 'خانات الآخر باقية');
  assert.equal(got.slots[2].track, null, 'ثالثة النسخة لم تُكتب');
  assert.equal(got.slots[0].marks.length, theirs.slots[0].marks.length, 'علاماته باقية');
});

test('CX-003: الاستبدال الصريح مع كاتب آخر بينهما يُعاد على الأحدث (مراجعة بعده)، لا فوق لقطة قديمة', async () => {
  const { gate, a, b } = shared();
  await seedBundle(b, sampleBundle());
  const entry = bundleToBackup(sampleBundle({ third: true }));
  gate.armed = { match: (keys) => Array.isArray(keys) && keys.length === 5, run: () => b.updateVideo(A, (r) => withView(r, { displayOffsetMs: 900 }, NOW)) };
  const r = await a.restoreVideo(entry, { replace: true });
  assert.deepEqual(r, { status: 'replaced' });
  const got = await b.getBundle(A);
  assert.equal(got.slots[2].track.fileName, sampleBundle({ third: true }).slots[2].track.fileName);
  const revBefore = 2; // البذرة ثم ± من الآخر
  assert.equal(got.record.rev, revBefore + 1, 'المراجعة بعد كتابة الآخر');
});

test('GM-006: سجل محلي تالف: الاستعادة الافتراضية تتخطاه بلا فشل، والاستبدال الصريح يصلحه من النسخة', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  await seedBundle(store, sampleBundle());
  area.rawSet(`alts:${A}`, { schema: 1, videoId: A, slots: [null, { track: 'x', offsetMs: 0 }, null] });
  await assert.rejects(store.getBundle(A), (e) => e.code === 'ST_CORRUPT_RECORD');
  const entry = bundleToBackup(sampleBundle({ third: true }));
  assert.deepEqual(await store.restoreVideo(entry), { status: 'skipped' });
  assert.deepEqual(await store.restoreVideo(entry, { replace: true }), { status: 'replaced' });
  const fixed = await store.getBundle(A);
  assert.equal(fixed.slots[2].track.fileName, sampleBundle({ third: true }).slots[2].track.fileName, 'أُصلح من النسخة');
  // وسجل الفيديو نفسه تالفًا: الأمر نفسه.
  area.rawSet(`video:${A}`, { schema: 1, videoId: A, broken: true });
  assert.deepEqual(await store.restoreVideo(entry), { status: 'skipped' });
  assert.deepEqual(await store.restoreVideo(entry, { replace: true }), { status: 'replaced' });
  assert.equal((await store.getBundle(A)).record.videoId, A);
});

test('GM-006: توابع يتيمة بلا سجل ونسخة بحزمة بسيطة: رأس جديد يطمسها، فلا تعود بيانات قديمة', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  await seedBundle(store, sampleBundle({ third: true }));
  // السجل ومُلخّصه وحدهما يُحذفان من خارج التخزين، فتبقى التوابع يتيمة.
  await area.remove([`video:${A}`, `index:${A}`]);
  const simple = sampleBundle();
  const entry = bundleToBackup({ ...simple, active: 1, slots: [simple.slots[0], { ...simple.slots[1], track: null, name: null, marks: [], offsetMs: 0 }, { ...simple.slots[2], track: null }], previous: null });
  assert.deepEqual(await store.restoreVideo(entry), { status: 'added' });
  const got = await store.getBundle(A);
  assert.deepEqual(got.slots.map((s) => Boolean(s.track)), [true, false, false], 'لا خانة قديمة عادت من التوابع اليتيمة');
  assert.equal(got.previous, null);
});

test('GM-004: قراءة بدأت قبل كتابة في السياق نفسه وانتهت بعدها لا تطمس الأحدث، فتبقى الخانات والعلامات في bundleOf', async () => {
  const area = createMemoryArea({ unlimited: true });
  const gate = { armed: false, release: null };
  const store = createStore({
    area: { ...area, async get(keys) { const out = await area.get(keys); if (gate.armed && Array.isArray(keys) && keys.length === 5) { gate.armed = false; await new Promise((r) => { gate.release = r; }); } return out; } },
    now,
  });
  await seedBundle(store, sampleBundle());
  gate.armed = true;
  const reading = store.getVideo(A); // تقرأ اللقطة الحالية ثم تنتظر
  await new Promise((r) => setTimeout(r, 0));
  const saved = await store.updateVideo(A, (r) => withView(r, { displayOffsetMs: 1500 }, NOW));
  gate.release();
  await reading;
  const b = store.bundleOf(saved);
  assert.equal(b.slots[1].name, 'مراجعة', 'الخانة الثانية باقية');
  assert.ok(b.slots[1].track, 'ترجمتها باقية');
  assert.equal(b.previous?.from, 2, 'السابقة باقية');
});

test('CX-H4: سجل تالف بلا مُلخّص لا يظهر في المحفوظات، فيُذكر «تعذّر» في النسخة، ويُعدّ «موجودًا» في معاينة الاستعادة فيُستبدل', async () => {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  await seedBundle(store, sampleBundle());
  const backup = await createBackup({ store, appVersion: '1.0.0', now, pause: async () => {} });
  area.rawSet(`video:${A}`, { schema: 1, videoId: A, broken: true });
  area.rawSet(`index:${A}`, { broken: true });
  assert.equal((await store.listLibrary()).length, 0, 'لا يظهر في المحفوظات');
  assert.deepEqual(await store.unreadableVideos(), [A]);
  const after = await createBackup({ store, appVersion: '1.0.0', now, pause: async () => {} });
  assert.deepEqual(after.skipped, [{ videoId: A, code: 'ST_CORRUPT_RECORD' }], 'التقرير لا يدّعي نسخ الكل');
  const read = await readBackup(backup.text, { pause: async () => {} });
  const plan = planRestore(read, [...(await store.listLibrary()).map((x) => x.entry.videoId), ...(await store.unreadableVideos())]);
  assert.deepEqual(plan.existing.map((v) => v.videoId), [A], 'موجود: يُتخطى افتراضيًا ويُختار استبداله');
  const { items, skipped } = restoreItems(plan, 'all');
  const report = await runRestore({ store, items, skipped, pause: async () => {} });
  assert.deepEqual([report.replaced, report.failed], [[A], []]);
  assert.equal((await store.getBundle(A)).slots[1].name, 'مراجعة', 'أُصلح من النسخة');
});

test('CX-H3: إضافة مصطلح وتغيير مكان الحفظ من سياقين معًا لا يُسقط أحدهما الآخر', async () => {
  const { gate, a, b } = shared();
  await a.setPrefs({ glossary: { attach: true, terms: [{ source: 'one', target: 'واحد', note: null }] } });
  // بعد قراءة السياق الأول للتفضيلات يغيّر الآخر مكان الحفظ.
  gate.armed = { match: (keys) => keys === 'prefs', run: () => b.setPrefs({ saveLocation: { mode: 'subfolder', folder: 'ترجماتي' } }) };
  await a.setPrefs({ glossary: { attach: true, terms: [{ source: 'one', target: 'واحد', note: null }, { source: 'two', target: 'اثنان', note: null }] } });
  const p = await b.getPrefs();
  assert.equal(p.glossary.terms.length, 2, 'المصطلح باقٍ');
  assert.deepEqual(p.saveLocation, { mode: 'subfolder', folder: 'ترجماتي' }, 'ومكان الحفظ باقٍ');
});

test('GM-009: المحفوظات من الرأس المطابق والتوابع الخفيفة بقراءات ثابتة العدد، بلا السجلات ولا السوابق، وبالنتيجة نفسها', async () => {
  const { summarizeBundle, slotModels } = await import('../../../src/core/model/bundle.js');
  const area = createMemoryArea({ unlimited: true, chromiumKeyOrder: true });
  const store = createStore({ area, now });
  const ids = Array.from({ length: 50 }, (_, i) => `vid${String(i).padStart(8, '0')}`);
  for (const [i, id] of ids.entries()) await seedBundle(store, sampleBundle({ videoId: id, third: i % 3 === 0 }));
  const reads = [];
  const get = area.get;
  area.get = async (keys) => { reads.push(keys); return get(keys); };
  const list = await store.listLibrary();
  const keys = reads.flatMap((k) => (Array.isArray(k) ? k : [k]));
  assert.equal(list.length, 50);
  assert.ok(reads.length <= 4, `قراءات: ${reads.length}`);
  assert.equal(keys.filter((k) => /^(?:video|prev):/.test(k)).length, 0, 'لا سجل ولا سابقة');
  area.get = get;
  for (const row of list) {
    const b = await store.getBundle(row.entry.videoId);
    assert.deepEqual(row.summary, summarizeBundle(b), row.entry.videoId);
    assert.deepEqual(row.slots, slotModels(b), row.entry.videoId);
  }
});
