// التخزين بالتوابع (P10-AC4، عقد storage §٧–§١١): كتابة السجل وتوابعه في set واحدة ونسخة تعارض واحدة، وحفظ السابقة
// تلقائيًا من updateVideo القديم، وتنظيف اليتيم، والمصالحة تُكتب مرة، والتالف لا يُكتب فوقه، والاستعادة تحفظ التواريخ
// وتتخطى الموجود افتراضيًا، والمحفوظات للفرز.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/core/store/index.js';
import { withActiveSlot, withMark, withSlotUpload, bundleToBackup } from '../../../src/core/model/bundle.js';
import { withArabicImport, withView, withoutArabic } from '../../../src/core/model/transitions.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID, makeCues, videoRecord } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const A = VIDEO_ID;
const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};
const code = (c) => (e) => e.code === c;
function make(opts) {
  const area = createMemoryArea({ unlimited: true, ...opts });
  const store = createStore({ area, now: clock() });
  const sets = [];
  const origSet = area.set;
  area.set = async (items) => { sets.push(Object.keys(items).sort()); return origSet(items); };
  return { area, store, sets, other: createStore({ area, now: clock(Date.parse(NOW) + 333) }) };
}
const upload = (label) => ({ videoId: A, fileName: `${label}.srt`, cues: makeCues(4, { text: (i) => `${label} ${i}` }), comparison: null, fingerprintId: null, notes: [] });
const KEYS6 = [`alts:${A}`, `bundle:${A}`, `index:${A}`, `marks:${A}`, `prev:${A}`, `video:${A}`];

test('الحزمة الكاملة تُكتب في set واحدة بمفاتيحها الستة وتُقرأ كما هي، والرأس يحمل نسخة السجل', async () => {
  const { store, area, sets } = make();
  await store.ready();
  const written = await seedBundle(store, sampleBundle({ third: true }));
  assert.deepEqual(sets.at(-1), KEYS6);
  const d = area.dump();
  assert.deepEqual(d[`bundle:${A}`].base, { rev: 1, createdAt: written.record.createdAt, updatedAt: written.record.updatedAt });
  assert.deepEqual(d[`bundle:${A}`].summary, { filled: 3, edited: 1, warned: 0, marks: { todo: 2, done: 1 } });
  assert.equal(d[`video:${A}`].arabic.fileName, written.slots[0].track.fileName, 'النشطة في السجل نفسه');
  assert.equal(d[`alts:${A}`].slots[0], null);
  const got = await store.getBundle(A);
  assert.deepEqual(got, written);
  assert.deepEqual(await store.getVideo(A), written.record);
});

test('± يكتب السجل والفهرس والرأس وحدها، والتبديل يضيف الأخريات، واستبدال النشطة بالمسار القديم يحفظ السابقة في الكتابة نفسها', async () => {
  const { store, sets } = make();
  await seedBundle(store, sampleBundle({ previous: false }));
  await store.updateVideo(A, (r) => withView(r, { displayOffsetMs: 900 }, NOW));
  assert.deepEqual(sets.at(-1), [`bundle:${A}`, `index:${A}`, `video:${A}`], 'لا تعاد كتابة الترجمات غير النشطة');
  await store.updateBundle(A, (b) => withActiveSlot(b, 2, NOW));
  assert.deepEqual(sets.at(-1), [`alts:${A}`, `bundle:${A}`, `index:${A}`, `video:${A}`]);
  const before = await store.getBundle(A);
  await store.updateVideo(A, (r) => withArabicImport(r, upload('بديلة'), NOW, { replace: true }).record);
  assert.deepEqual(sets.at(-1), [`bundle:${A}`, `index:${A}`, `prev:${A}`, `video:${A}`], 'السابقة مع السجل في set واحدة');
  const after = await store.getBundle(A);
  assert.equal(after.previous.from, 2);
  assert.deepEqual(after.previous.track, before.record.arabic);
  assert.equal(after.previous.offsetMs, -1200);
});

test('سجل الإصدار الأول البسيط لا يكتب مفاتيح جديدة، واستبداله الأول يبدأ الحزمة بسابقته', async () => {
  const { store, area } = make();
  await store.updateVideo(A, () => videoRecord());
  assert.deepEqual(Object.keys(area.dump()).sort(), [`index:${A}`, 'meta', `video:${A}`]);
  await store.updateVideo(A, (r) => withArabicImport(r, upload('ثانٍ'), NOW, { replace: true }).record);
  const d = area.dump();
  assert.ok(d[`bundle:${A}`] && d[`prev:${A}`]);
  assert.equal(d[`alts:${A}`], undefined, 'التابع الفارغ لا يُنشأ');
  assert.equal((await store.getBundle(A)).previous.track.fileName, `${A}.ar.srt`);
});

test('نسخة تعارض واحدة: علامة من المشغّل تجعل حفظ المحرّر بالحزمة المفتوحة ST_CONFLICT، وبلا expect تُعاد الدالة', async () => {
  const { store, other } = make();
  await seedBundle(store, sampleBundle());
  const opened = await other.getBundle(A);
  await store.updateBundle(A, (b) => withMark(b, 1, { index: 1, kind: 'todo' }, NOW).bundle);
  await assert.rejects(other.updateBundle(A, (b) => withActiveSlot(b, 2, NOW), { expect: opened }), code('ST_CONFLICT'));
  await assert.rejects(other.updateVideo(A, (r) => withView(r, { displayOffsetMs: 100 }, NOW), { expect: opened.record }), code('ST_CONFLICT'));
  const slow = other.updateBundle(A, async (b) => {
    await new Promise((r) => setTimeout(r, 15));
    return withActiveSlot(b, 2, NOW);
  });
  await store.updateBundle(A, (b) => withMark(b, 1, { index: 3, kind: 'done' }, NOW).bundle);
  await slow;
  const final = await store.getBundle(A);
  assert.equal(final.active, 2, 'التبديل لم يضع');
  assert.equal(final.slots[0].marks.length, 4, 'ولا العلامتان');
});

test('الحذف الكامل يزيل كل ما يتبع الفيديو، و null من الدالة كذلك', async () => {
  const { store, area } = make();
  await seedBundle(store, sampleBundle());
  await store.deleteVideo(A);
  assert.deepEqual(Object.keys(area.dump()), ['meta']);
  await seedBundle(store, sampleBundle());
  await store.updateBundle(A, () => null);
  assert.deepEqual(Object.keys(area.dump()), ['meta']);
});

test('اليتيم: حذف الإصدار الأول للسجل والفهرس وحدهما يُنظَّف عند القراءة وفي المسح، ولا يلمس غيره', async () => {
  const { store, area } = make();
  await seedBundle(store, sampleBundle());
  await seedBundle(store, sampleBundle({ videoId: 'BBBBBBBBBBB' }));
  await area.remove([`video:${A}`, `index:${A}`]);
  assert.equal(await store.getVideo(A), null);
  assert.equal(Object.keys(area.dump()).some((k) => k.endsWith(A)), false);
  await area.remove(['video:BBBBBBBBBBB', 'index:BBBBBBBBBBB']);
  await store.listIndex();
  assert.deepEqual(Object.keys(area.dump()), ['meta']);
});

test('سجل جديد لمعرّف بقيت له توابع يتيمة يبدأ نظيفًا: لا تعود الترجمات المحذوفة', async () => {
  const { store, area } = make();
  await seedBundle(store, sampleBundle());
  await area.remove([`video:${A}`, `index:${A}`]);
  const fresh = await store.updateVideo(A, () => videoRecord({ arabic: false }));
  const b = await store.getBundle(A);
  assert.equal(fresh.rev, 1);
  assert.deepEqual(b.slots.map((s) => s.track), [null, null, null]);
  assert.equal(b.previous, null);
});

test('المصالحة تُكتب مرة: كتابة الإصدار الأول في السجل وحده تُفسَّر ثم يحمل الرأس نسختها، ولا كتابة بعدها', async () => {
  const { store, area, sets } = make();
  await seedBundle(store, sampleBundle({ third: true }));
  const rec = area.dump()[`video:${A}`];
  area.rawSet(`video:${A}`, { ...withoutArabic(rec, NOW), rev: rec.rev + 1, updatedAt: '2026-11-03T00:00:00.000Z' });
  const n = sets.length;
  const [b] = await Promise.all([store.getBundle(A), store.getVideo(A), store.getBundle(A)]);
  assert.equal(b.active, 2, 'حذف الأول للعربية فعّل الثانية');
  assert.equal(sets.length, n + 1, 'كتابة واحدة ولو تزامنت القراءات');
  assert.equal(area.dump()[`bundle:${A}`].base.rev, b.record.rev);
  await store.getBundle(A);
  await store.getVideo(A);
  assert.equal(sets.length, n + 1, 'لا كتابة بعدها');
});

test('تابع تالف ST_CORRUPT_RECORD ولا يُكتب فوقه، والحذف يصلحه', async () => {
  const { store, area } = make();
  await seedBundle(store, sampleBundle());
  area.rawSet(`alts:${A}`, { schema: 1, videoId: A, slots: [null, { track: 'x', offsetMs: 0 }, null] });
  await assert.rejects(store.getBundle(A), code('ST_CORRUPT_RECORD'));
  await assert.rejects(store.updateVideo(A, (r) => withView(r, { displayOffsetMs: 0 }, NOW)), code('ST_CORRUPT_RECORD'));
  await store.deleteVideo(A);
  assert.equal(await store.getBundle(A), null);
});

test('bundleOf: الحزمة المقروءة مع السجل نفسه بنسخته، وإلا حزمة السجل وحده', async () => {
  const { store } = make();
  await seedBundle(store, sampleBundle());
  const rec = await store.getVideo(A);
  assert.equal(store.bundleOf(rec).slots[1].name, 'مراجعة');
  assert.equal(store.bundleOf({ ...rec, rev: rec.rev + 7 }).slots[1].track, null);
  assert.equal(store.bundleOf(null), null);
});

test('الاستعادة: الجديد يُضاف بتواريخه، والموجود يُتخطى افتراضيًا ويُستبدل بطلب صريح، والتالف MD_INVALID', async () => {
  const { store } = make();
  const source = { ...sampleBundle({ third: true }), record: { ...sampleBundle({ third: true }).record, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z', rev: 9 } };
  const entry = bundleToBackup(source);
  assert.deepEqual(await store.restoreVideo(entry), { status: 'added' });
  const got = await store.getBundle(A);
  assert.equal(got.record.createdAt, '2026-10-01T00:00:00.000Z');
  assert.equal(got.record.updatedAt, '2026-10-05T00:00:00.000Z');
  assert.equal(got.record.rev, 1);
  assert.equal(got.slots[2].track.fileName, source.slots[2].track.fileName);
  await store.updateBundle(A, (b) => withActiveSlot(b, 3, NOW));
  assert.deepEqual(await store.restoreVideo(entry), { status: 'skipped' });
  assert.equal((await store.getBundle(A)).active, 3, 'المتخطى لم يتغير');
  assert.deepEqual(await store.restoreVideo(entry, { replace: true }), { status: 'replaced' });
  const replaced = await store.getBundle(A);
  assert.equal(replaced.active, 1);
  assert.equal(replaced.record.rev, 3);
  await assert.rejects(store.restoreVideo({ ...entry, active: 7 }), code('MD_INVALID'));
});

test('المحفوظات للفرز: ملخص الحزمة ونماذج 1 2 3، وسجل الإصدار الأول بملخص من سجله', async () => {
  const { store } = make();
  await seedBundle(store, sampleBundle({ third: true }));
  await store.updateVideo('BBBBBBBBBBB', () => videoRecord({ videoId: 'BBBBBBBBBBB' }));
  const list = await store.listLibrary();
  assert.deepEqual(list.map((x) => x.entry.videoId), ['BBBBBBBBBBB', A]);
  const [b, a] = list;
  assert.deepEqual(b.summary, { filled: 1, edited: 0, warned: 0, marks: { todo: 0, done: 0 } });
  assert.deepEqual(b.slots.map((s) => s.active), [true, false, false]);
  assert.deepEqual(a.summary.marks, { todo: 2, done: 1 });
  assert.deepEqual(a.slots.map((s) => [s.filled, s.name]), [[true, null], [true, 'مراجعة'], [true, null]]);
  const bytes = await store.bundleBytes(A);
  assert.ok(bytes.record > 0 && bytes.alts > 0 && bytes.previous > 0 && bytes.marks > 0, JSON.stringify(bytes));
});

test('الأحداث: تغيّر التوابع يُعلن بمعرّفاتها مع السجل، والتفضيلات بقيمتها', async () => {
  const { store, area } = make();
  const events = [];
  store.onChange((e) => events.push(e));
  await seedBundle(store, sampleBundle());
  await store.updateBundle(A, (b) => withSlotUpload(b, 3, upload('ثالثة'), NOW).bundle);
  await area.flush();
  assert.ok(events.every((e) => !e.bundles.length || e.videos[A]), 'كل تغيّر للتوابع يصحبه السجل');
  assert.ok(events.some((e) => e.bundles.includes(A)));
});

test('تدقيق 5fedcb9 (GM-010): بترتيب مفاتيح Chromium، ± وآخر موضع لا يعيدان كتابة الترجمات الأخرى والسابقة والعلامات', async () => {
  const { store, sets } = make({ chromiumKeyOrder: true });
  await seedBundle(store, sampleBundle({ third: true }));
  await store.updateVideo(A, (r) => withView(r, { displayOffsetMs: 900 }, NOW));
  assert.deepEqual(sets.at(-1), [`bundle:${A}`, `index:${A}`, `video:${A}`], '±: السجل والفهرس والرأس وحدها');
  await store.updateBundle(A, (b) => withActiveSlot(b, 2, NOW));
  assert.ok(sets.at(-1).includes(`alts:${A}`), 'التبديل يغيّر التوابع فعلًا فتُكتب');
  await store.updateVideo(A, (r) => withView(r, { displayOffsetMs: 300 }, NOW));
  assert.deepEqual(sets.at(-1), [`bundle:${A}`, `index:${A}`, `video:${A}`]);
});
