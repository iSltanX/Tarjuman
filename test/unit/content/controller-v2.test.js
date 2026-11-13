// المتحكم في الإصدار الثاني (P10-AC4، عقد interfaces §١٢): حالة الخانات والعلامات والتفضيلات، وتبديل النشطة بإزاحتها،
// والرفع إلى خانة بقاعدة Q16 والسابقة، وتعليم المقطع مع التراجع، وحفظ السابقة من loadArabic القديم، وأحداث سياق آخر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { withActiveSlot, withSlotEdit } from '../../../src/core/model/bundle.js';
import { cueTextHash, resolveMarks } from '../../../src/core/model/marks.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID, englishTrack, fakeExtractor, fingerprint, makeCues } from '../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const A = VIDEO_ID;
const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};
const code = (c) => (e) => e.code === c;
const settle = async (area) => {
  await area.flush();
  await new Promise((r) => setTimeout(r, 5));
  await area.flush();
};

async function setup({ bundle = sampleBundle(), prefs, extractor = fakeExtractor(), storeWrap } = {}) {
  const area = createMemoryArea({ unlimited: true });
  const seed = createStore({ area, now: clock() });
  if (bundle) await seedBundle(seed, bundle);
  if (prefs) await seed.setPrefs(prefs);
  await area.flush();
  let store = createStore({ area, now: clock() });
  if (storeWrap) store = storeWrap(store);
  const c = createController({ store, extractor, page: { title: () => 'عنوان', durationMs: () => 90000 }, now: clock() });
  store.onChange((ch) => c.handleStoreChange(ch));
  const other = createStore({ area, now: clock(Date.parse(NOW) + 333) });
  await c.start(A);
  return { area, store, other, c };
}
const upload = (label) => ({ fileName: `${label}.srt`, cues: makeCues(4, { text: (i) => `${label} ${i}` }) });

test('الحالة: الخانات والنشطة والعلامات والسابقة والتفضيلات، و arabic وview للنشطة', async () => {
  const { c } = await setup({ prefs: samplePrefs() });
  const s = c.getState();
  assert.equal(s.activeSlot, 1);
  assert.deepEqual(s.slots.map((x) => [x.n, x.filled, x.active, x.name]), [[1, true, true, null], [2, true, false, 'مراجعة'], [3, false, false, null]]);
  assert.equal(s.marks.slot, 1);
  assert.equal(s.marks.items.length, 2);
  assert.deepEqual(s.previous, { from: 2, savedAt: NOW });
  assert.equal(s.prefs.glossary.terms.length, 3);
  assert.equal(s.arabic.cues[0].text, 'أولى 1 (معدّل)');
  assert.equal(s.view.displayOffsetMs, 500);
});

test('تبديل النشطة: الطبقة ترى الثانية بإزاحتها فورًا بعد الحفظ، والعودة تعيد الأولى بإزاحتها؛ والفارغة ST_SLOT_EMPTY', async () => {
  const { c, store } = await setup();
  const a0 = c.getState().arabic.cues;
  await c.activateSlot(2);
  let s = c.getState();
  assert.equal(s.activeSlot, 2);
  assert.equal(s.view.displayOffsetMs, -1200);
  assert.equal(s.arabic.cues[0].text, 'ثانية 1');
  assert.notEqual(s.arabic.cues, a0);
  assert.equal((await store.getVideo(A)).view.displayOffsetMs, -1200);
  await c.nudgeOffset(1);
  assert.equal((await store.getBundle(A)).slots[1].offsetMs, -700, '± لإزاحة النشطة وحدها');
  assert.equal((await store.getBundle(A)).slots[0].offsetMs, 500);
  await c.activateSlot(1);
  s = c.getState();
  assert.equal(s.view.displayOffsetMs, 500);
  assert.equal(s.arabic.cues[0].text, 'أولى 1 (معدّل)');
  await assert.rejects(c.activateSlot(3), code('ST_SLOT_EMPTY'));
});

test('الرفع إلى خانة فارغة يفعّلها (Q16)؛ والممتلئة تحتاج replace وتحفظ السابقة بإشعار، ولا تُفعَّل', async () => {
  const { c, store } = await setup({ bundle: sampleBundle({ previous: false }) });
  const r = await c.loadArabicInto(3, upload('ثالثة'));
  assert.equal(r.activated, true);
  assert.equal(c.getState().activeSlot, 3);
  assert.equal(c.getState().view.displayOffsetMs, 0);
  assert.equal(c.getState().notice, null);
  await assert.rejects(c.loadArabicInto(2, upload('أخرى')), code('ST_ARABIC_EXISTS'));
  const rep = await c.loadArabicInto(2, upload('أخرى'), { replace: true });
  assert.equal(rep.replaced, true);
  assert.equal(rep.activated, false);
  assert.equal(c.getState().activeSlot, 3, 'المعروض لا يتغير');
  assert.equal(c.getState().notice.code, 'ST_PREVIOUS_SAVED');
  assert.equal((await store.getBundle(A)).previous.from, 2);
});

test('استبدال النشطة بإزاحة غير صفرية: ST_OFFSET_RESET؛ وloadArabic القديم يحفظ السابقة تلقائيًا', async () => {
  const { c, store } = await setup({ bundle: sampleBundle({ previous: false }) });
  await c.loadArabicInto(1, upload('بديلة'), { replace: true });
  assert.equal(c.getState().notice.code, 'ST_OFFSET_RESET');
  assert.equal((await store.getBundle(A)).previous.offsetMs, 500);
  await c.loadArabic(upload('من المسار القديم'), { replace: true });
  const b = await store.getBundle(A);
  assert.equal(b.previous.track.fileName, 'بديلة.srt', 'السابقة لم ينسها المسار القديم');
  assert.equal(b.slots[1].track.fileName, sampleBundle().slots[1].track.fileName);
});

test('تعليم المقطع والتراجع بكتابة واحدة لكل منهما، وإزالة العلامة بـnull', async () => {
  const { c, store } = await setup();
  const { mark, undo } = await c.markCue({ index: 1 });
  assert.equal(mark.kind, 'todo');
  assert.equal(c.getState().marks.items.length, 3);
  await undo();
  assert.deepEqual((await store.getBundle(A)).slots[0].marks, sampleBundle().slots[0].marks);
  assert.equal(c.getState().marks.items.length, 2);
  const del = await c.markCue({ index: 0 }, null);
  assert.equal(del.mark, null);
  assert.equal(c.getState().marks.items.length, 1);
  await del.undo();
  assert.equal(c.getState().marks.items.length, 2, 'التراجع يعيد المزالة');
  await assert.rejects(c.markCue({ index: 99 }), RangeError);
});

test('صدى كتاباته لا يعيد القراءة، وتبديل من المحفوظات (سياق آخر) يصل، والتفضيلات كذلك', async () => {
  let reads = 0;
  const { c, other, area } = await setup({ storeWrap: (s) => ({ ...s, getVideo: (id) => { reads++; return s.getVideo(id); } }) });
  const r0 = reads;
  await c.activateSlot(2);
  await c.markCue({ index: 0 });
  await settle(area);
  assert.equal(reads, r0, 'لا إعادة قراءة بسبب كتابته');
  await other.updateBundle(A, (b) => withActiveSlot(b, 1, NOW));
  await settle(area);
  assert.equal(c.getState().activeSlot, 1);
  assert.equal(c.getState().view.displayOffsetMs, 500);
  await other.setPrefs({ saveLocation: { mode: 'ask' } });
  await settle(area);
  assert.equal(c.getState().prefs.saveLocation.mode, 'ask');
  await c.updatePrefs({ glossary: { attach: false } });
  assert.equal(c.getState().prefs.glossary.attach, false);
});

test('تسجيل التصدير عند امتلاء حد البصمات لا يسقط مرجع الترجمة غير النشطة', async () => {
  const bundle = sampleBundle();
  const track = bundle.record.english[0];
  for (let i = 0; i < 8; i++) bundle.record.fingerprints.push(fingerprint({ track, id: `fp_more${String(i).padStart(6, '0')}` }));
  const ex = fakeExtractor({ tracks: [{ key: track.key, kind: 'manual', cues: track.cues }] });
  const { c, store } = await setup({ bundle, extractor: ex });
  await c.recordExport({ trackKey: track.key, fingerprint: fingerprint({ track, id: 'fp_newest00001' }) });
  const b = await store.getBundle(A);
  assert.equal(b.record.fingerprints.length, 10);
  assert.ok(b.record.fingerprints.some((f) => f.id === 'fp_test000002'), 'مرجع الثانية محمي');
  assert.equal(b.slots[1].track.fingerprintId, 'fp_test000002');
  assert.equal(englishTrack().key, track.key);
});

test('تدقيق 5fedcb9 (GM-027.4): ± لم يُحفظ (فشل الكتابة) لا يبقى ظاهرًا؛ يعود العرض إلى المحفوظ مع الخطأ', async () => {
  const { area, c } = await setup();
  const before = c.getState().view.displayOffsetMs;
  area.failNext('set', new Error('Resource::kQuotaBytes quota exceeded'));
  await c.nudgeOffset(1);
  const s = c.getState();
  assert.equal(s.view.displayOffsetMs, before, 'لا إزاحة لم تُحفظ');
  assert.equal(s.error?.code, 'ST_QUOTA_EXCEEDED');
  await c.nudgeOffset(1);
  assert.notEqual(c.getState().view.displayOffsetMs, before, 'التالية تُحفظ وتظهر');
});

// ———— الفكرة ٦ (ح-54): تحرير نص مقطع واحد من لوحة النص ————

test('الفكرة ٦: editCueText يكتب نص مقطع النشطة نسخةً حالية بأسطره، ولا يمس الأصل المستورد ولا غيره، والتراجع يعيده', async () => {
  const { c, store } = await setup();
  const before = await store.getBundle(A);
  const r = await c.editCueText({ index: 1 }, 'سطر أول\nسطر ثانٍ');
  const b = await store.getBundle(A);
  assert.equal(b.slots[0].track.current[1].text, 'سطر أول\nسطر ثانٍ', 'فواصل الأسطر كما كُتبت');
  assert.deepEqual(b.slots[0].track.current.filter((_, i) => i !== 1), before.slots[0].track.current.filter((_, i) => i !== 1));
  assert.deepEqual(b.slots[0].track.original, before.slots[0].track.original, 'الأصل المستورد لا يُمس');
  assert.deepEqual(b.slots[1], before.slots[1], 'الخانة الأخرى كما هي');
  assert.equal(c.getState().arabic.cues[1].text, 'سطر أول\nسطر ثانٍ', 'الحالة تتبع الكتابة');
  assert.equal(c.getState().arabic.edited, true);
  await r.undo();
  assert.equal((await store.getBundle(A)).slots[0].track.current[1].text, before.slots[0].track.current[1].text);
  assert.equal(c.getState().arabic.cues[1].text, before.slots[0].track.current[1].text);
});

test('الفكرة ٦: نص مطابق للأصل المستورد يعيد الخانة إلى الأصل (current = null) كحفظ المحرّر، والنص نفسه لا يُكتب', async () => {
  const { c, store } = await setup({ bundle: sampleBundle({ active: 2 }) });
  const original = (await store.getBundle(A)).slots[1].track.original;
  const r = await c.editCueText({ index: 2 }, 'نص جديد');
  let b = await store.getBundle(A);
  assert.equal(b.slots[1].track.current[2].text, 'نص جديد');
  assert.equal(c.getState().arabic.edited, true);
  await r.undo();
  b = await store.getBundle(A);
  assert.equal(b.slots[1].track.current, null, 'مطابقة الأصل: لا نسخة معدّلة');
  assert.equal(b.slots[1].track.editedAt, null);
  assert.equal(c.getState().arabic.edited, false);
  assert.deepEqual(c.getState().arabic.cues, original);
  const rev = b.record.rev;
  const same = await c.editCueText({ index: 0 }, original[0].text);
  assert.equal((await store.getBundle(A)).record.rev, rev, 'النص نفسه: لا كتابة');
  await same.undo();
  assert.equal((await store.getBundle(A)).record.rev, rev, 'ولا تراجع يكتب');
});

test('الفكرة ٦: علامة المقطع المعدّل تُربط بنصه الجديد في الكتابة نفسها فتبقى مرتبطة لا «قد تكون انتقلت»', async () => {
  const { c, store } = await setup();
  const mark0 = sampleBundle().slots[0].marks[0];
  await c.editCueText({ index: 0 }, 'أولى 1 بعد التصحيح');
  const b = await store.getBundle(A);
  const cues = b.slots[0].track.current;
  const marks = b.slots[0].marks;
  assert.equal(marks.length, 2);
  const m = marks.find((x) => x.n === mark0.n && x.startMs === mark0.startMs);
  assert.equal(m.textHash, cueTextHash('أولى 1 بعد التصحيح'), 'المرساة بنص المقطع الجديد');
  assert.equal(m.kind, 'todo');
  assert.equal(m.at, mark0.at, 'تاريخ العلامة كما كان');
  assert.deepEqual(resolveMarks(marks, cues).map((x) => [x.index, x.state]), [[0, 'linked'], [2, 'linked']]);
  assert.equal(c.getState().marks.items.find((x) => x.n === mark0.n).textHash, m.textHash);
});

test('الفكرة ٦: ST_CONFLICT إن تغيّر المقطع الذي رآه المستخدم من مكان آخر، ولا يُكتب فوقه، والحالة تُقرأ من جديد', async () => {
  const { c, store, other, area } = await setup();
  // تعديل المقطع نفسه من المحرّر في تبويب آخر، قبل أن يصل حدثه إلى هذا المتحكم.
  let t = Date.parse(NOW);
  const textAt = (text) => (b) => withSlotEdit(b, 1, { cues: b.slots[0].track.current.map((x, i) => (i === 1 ? { ...x, text } : x)) }, new Date((t += 60000)).toISOString());
  await other.updateBundle(A, textAt('من المحرّر'));
  assert.notEqual(c.getState().arabic.cues[1].text, 'من المحرّر', 'لم يصل الحدث بعد');
  await assert.rejects(c.editCueText({ index: 1 }, 'من اللوحة'), code('ST_CONFLICT'));
  assert.equal((await store.getBundle(A)).slots[0].track.current[1].text, 'من المحرّر', 'ما كتبه السياق الآخر باقٍ');
  await settle(area);
  assert.equal(c.getState().arabic.cues[1].text, 'من المحرّر', 'الحالة بآخر نسخة');
  const r = await c.editCueText({ index: 1 }, 'من اللوحة');
  await other.updateBundle(A, textAt('تعديل ثالث'));
  await assert.rejects(r.undo(), code('ST_CONFLICT'), 'والتراجع بحارس المرساة الجديدة');
  assert.equal((await store.getBundle(A)).slots[0].track.current[1].text, 'تعديل ثالث');
});

test('الفكرة ٦: خطأ توقيت في الملف يرفض الكتابة كالمحرّر (ED_SAVE_HAS_ERRORS)، والمدخل غير الصالح يُرفض', async () => {
  const bundle = sampleBundle({ active: 2 });
  const bad = bundle.slots[1].track.original[3];
  bad.endMs = bad.startMs;
  bundle.record.arabic = structuredClone(bundle.slots[1].track);
  const { c, store } = await setup({ bundle });
  const rev = (await store.getBundle(A)).record.rev;
  await assert.rejects(c.editCueText({ index: 0 }, 'نص'), code('ED_SAVE_HAS_ERRORS'));
  assert.equal((await store.getBundle(A)).record.rev, rev);
  await assert.rejects(c.editCueText({ index: 99 }, 'نص'), RangeError);
  await assert.rejects(c.editCueText({ index: 0 }, null), code('MD_INVALID'));
});
