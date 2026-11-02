// الحفظ من المحرّر (P8-AC3، وP14-AC1 وAC7، وعقد التخزين §١١): النسخة الحالية تُكتب في خانة التحرير والأصل باقٍ والنشطة
// كما هي، والتعارض مع المشغّل يُرفض بـST_CONFLICT، وتغيّرٌ لا يمس محتوى الخانة (علامة من المشغّل) لا يعارض، والاستعادة
// بتأكيد، والحفظ ينعكس في المشغّل المفتوح عبر أحداث التخزين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyChange, openedSlot, pickSlot, restoreSlotOriginal, saveSlot, slotContentChanged, slotParam, versionOf, writeMarks,
  writePosition, writeReference,
} from '../../../../src/pages/editor/persist.js';
import { createEditSession } from '../../../../src/core/edit/index.js';
import { createController } from '../../../../src/content/controller.js';
import { createStore } from '../../../../src/core/store/index.js';
import { withView } from '../../../../src/core/model/index.js';
import { withMark } from '../../../../src/core/model/bundle.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID, fakeExtractor, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { markOn, sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';

const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};

async function setup(seed = (s) => s.updateVideo(VIDEO_ID, () => videoRecord({ offset: 500 }))) {
  const area = createMemoryArea();
  const first = createStore({ area, now: clock() });
  await seed(first);
  await area.flush();
  const editor = createStore({ area, now: clock(Date.parse(NOW) + 333) });
  const player = createStore({ area, now: clock(Date.parse(NOW) + 777) });
  const opened = await editor.getBundle(VIDEO_ID);
  return { area, editor, player, opened };
}
const withSlots = (o) => (s) => seedBundle(s, sampleBundle({ third: true, ...o }));
const settle = async (area) => {
  await area.flush();
  await new Promise((r) => setTimeout(r, 5));
  await area.flush();
};
const save = (store, opened, n, s) => saveSlot(store, VIDEO_ID, opened, n, { cues: s.snapshot(), offsetChanged: s.offsetChanged, offsetMs: s.offsetMs });

test('العنوان والخانة: t=1..3 وإلا null، والمطلوبة الفارغة تفتح النشطة ببيان', () => {
  assert.equal(slotParam('?v=AAAAAAAAAAA&t=2'), 2);
  assert.equal(slotParam('?v=AAAAAAAAAAA&t=4'), null);
  assert.equal(slotParam('?v=AAAAAAAAAAA'), null);
  const b = sampleBundle();
  assert.deepEqual(pickSlot(b, 2), { n: 2, fallback: false });
  assert.deepEqual(pickSlot(b, null), { n: 1, fallback: false });
  assert.deepEqual(pickSlot(b, 3), { n: 1, fallback: true }, 'الخانة 3 فارغة');
  assert.deepEqual(pickSlot(null, 2), { n: null, fallback: true });
});

test('الفتح: مقاطع الخانة وإزاحتها وبصمتها وعلاماتها، والفارغة ST_SLOT_EMPTY', async () => {
  const { opened } = await setup(withSlots());
  const s1 = openedSlot(opened, 1);
  assert.equal(s1.edited, true);
  assert.equal(s1.active, true);
  assert.equal(s1.offsetMs, 500);
  assert.equal(s1.fingerprint.id, 'fp_test000001');
  assert.equal(s1.marks.length, 2);
  const s2 = openedSlot(opened, 2);
  assert.equal(s2.active, false);
  assert.equal(s2.offsetMs, -1200);
  assert.equal(s2.fingerprint.id, 'fp_test000002');
  assert.equal(s2.name, 'مراجعة');
  assert.deepEqual(s2.cues, opened.slots[1].track.original);
  const { opened: one } = await setup();
  assert.equal(openedSlot(one, 1).offsetMs, 500, 'سجل الإصدار الأول خانة 1 نشطة');
  assert.throws(() => openedSlot(one, 2), (e) => e.code === 'ST_SLOT_EMPTY');
});

test('الحفظ في خانة غير نشطة: الأصل باقٍ والنشطة وسجلها كما هما، والإزاحة المثبّتة لخانتها (P14-AC1)', async () => {
  const { editor, opened } = await setup(withSlots());
  const s = createEditSession({ cues: openedSlot(opened, 2).cues, offsetMs: -1200 });
  s.setText(0, 'معدّل في الخانة 2');
  s.shift({ kind: 'all' }, 2000);
  s.commitOffset();
  const saved = await save(editor, opened, 2, s);
  assert.equal(saved.active, 1, 'النشطة لم تتغير');
  assert.deepEqual(saved.record.arabic, opened.record.arabic, 'ما يعرضه المشغّل لم يُمس');
  assert.equal(saved.record.view.displayOffsetMs, 500);
  assert.equal(saved.slots[1].track.current[0].text, 'معدّل في الخانة 2');
  assert.deepEqual(saved.slots[1].track.original, opened.slots[1].track.original, 'الأصل لا يُستبدل');
  assert.equal(saved.slots[1].offsetMs, 0);
  assert.equal(saved.record.rev, opened.record.rev + 1);
  const stored = await editor.getBundle(VIDEO_ID);
  assert.equal(versionOf(stored), versionOf(saved));
  assert.equal(classifyChange(saved, { oldValue: opened.record, newValue: stored.record }), 'echo', 'صدى كتابتنا يُهمل');
});

test('الحفظ في النشطة يكتب السجل كما في الإصدار الأول، والإزاحة لا تُمس بلا تثبيت', async () => {
  const { editor, opened } = await setup();
  const s = createEditSession({ cues: openedSlot(opened, 1).cues, offsetMs: 500 });
  s.shift({ kind: 'all' }, 500);
  const saved = await save(editor, opened, 1, s);
  assert.equal(saved.record.view.displayOffsetMs, 500, 'لا تطبيق مزدوج ٣: المحفوظ +500 والإزاحة +500');
  assert.equal(saved.record.arabic.current[0].startMs, opened.record.arabic.original[0].startMs + 500);
  assert.equal((await editor.getVideo(VIDEO_ID)).arabic.current[0].startMs, opened.record.arabic.original[0].startMs + 500);
});

test('التعارض: كتابة من المشغّل بعد الفتح ترفض الحفظ بـST_CONFLICT ولا يُكتب شيء', async () => {
  const { area, editor, player, opened } = await setup();
  await player.updateVideo(VIDEO_ID, (r) => withView(r, { displayOffsetMs: 1000 }, NOW));
  await settle(area);
  const s = createEditSession({ cues: openedSlot(opened, 1).cues, offsetMs: 500 });
  s.setText(0, 'لن يُحفظ');
  await assert.rejects(save(editor, opened, 1, s), (e) => e.code === 'ST_CONFLICT');
  const stored = await editor.getBundle(VIDEO_ID);
  assert.equal(stored.record.arabic.current, null);
  assert.equal(stored.record.view.displayOffsetMs, 1000);
  assert.equal(classifyChange(opened, { oldValue: opened.record, newValue: stored.record }), 'changed');
  assert.equal(classifyChange(opened, { oldValue: opened.record, newValue: null }), 'removed');
  assert.equal(classifyChange(opened, undefined), 'none');
  assert.equal(slotContentChanged(opened, stored, 1), true, 'الإزاحة من محتوى الخانة');
});

test('علامة من المشغّل لا تمس محتوى خانة التحرير: لا تعارض في المحتوى، والحفظ فوق الأحدث يبقيها (ملاحظة W6)', async () => {
  const { area, editor, player, opened } = await setup(withSlots());
  await player.updateBundle(VIDEO_ID, (b) => withMark(b, 1, { index: 4, kind: 'todo' }, NOW).bundle);
  await settle(area);
  const latest = await editor.getBundle(VIDEO_ID);
  assert.equal(classifyChange(opened, { oldValue: opened.record, newValue: latest.record }), 'changed', 'نسخة الحزمة تغيّرت');
  assert.equal(slotContentChanged(opened, latest, 1), false, 'لكن محتوى الخانة لم يتغير');
  assert.equal(slotContentChanged(opened, latest, 2), false);
  const s = createEditSession({ cues: openedSlot(opened, 1).cues, offsetMs: 500 });
  s.setText(1, 'تعديلي');
  await assert.rejects(save(editor, opened, 1, s), (e) => e.code === 'ST_CONFLICT', 'المفتوحة القديمة تُرفض');
  const saved = await save(editor, latest, 1, s);
  assert.equal(saved.slots[0].track.current[1].text, 'تعديلي');
  assert.equal(saved.slots[0].marks.length, 3, 'علامة المشغّل باقية');
});

test('الحفظ يعيد ربط علامات المقاطع المعدّلة في الكتابة نفسها (البنية كما هي)، ولا يمسها بعد دمج', async () => {
  const { editor, opened } = await setup(withSlots());
  const s = createEditSession({ cues: openedSlot(opened, 1).cues, offsetMs: 500 });
  s.setText(0, 'صُحّح نص المقطع المعلَّم');
  const saved = await saveSlot(editor, VIDEO_ID, opened, 1, {
    cues: s.snapshot(), offsetChanged: false, offsetMs: 500, reanchorFrom: s.baseSnapshot(),
  });
  const [m] = saved.slots[0].marks.filter((x) => x.kind === 'todo');
  assert.equal(m.textHash, markOn(saved.slots[0].track.current[0]).textHash, 'العلامة على النص المحفوظ');
  assert.equal(m.at, opened.slots[0].marks[0].at, 'تاريخها كما هو');
  assert.equal(saved.record.rev, opened.record.rev + 1, 'كتابة واحدة');
});

test('استعادة الأصل لخانة: تسقط النسخة المعدّلة المحفوظة، والنسخة القديمة تُرفض', async () => {
  const { editor, opened } = await setup(withSlots());
  const back = await restoreSlotOriginal(editor, VIDEO_ID, opened, 1);
  assert.equal(back.slots[0].track.current, null);
  assert.equal(back.record.arabic.current, null, 'النشطة: السجل نفسه');
  await assert.rejects(restoreSlotOriginal(editor, VIDEO_ID, opened, 2), (e) => e.code === 'ST_CONFLICT', 'على نسخة قديمة');
});

test('العلامات والموضع والمرجع تُكتب بـexpect فتصير الحزمة الأحدث هي المفتوحة', async () => {
  const { editor, opened } = await setup(withSlots());
  const cue = opened.slots[1].track.original[3];
  const mark = markOn(cue, 'done', '2026-11-02T10:00:00.000Z');
  const a = await writeMarks(editor, VIDEO_ID, opened, 2, { remove: [], add: [mark] });
  assert.equal(a.slots[1].marks.length, 2);
  const b = await writeMarks(editor, VIDEO_ID, a, 2, { remove: [mark], add: [] });
  assert.equal(b.slots[1].marks.length, 1, 'التراجع الدقيق');
  const c = await writePosition(editor, VIDEO_ID, b, 2, 3);
  assert.deepEqual([c.slots[1].position.n, c.slots[1].position.startMs], [cue.n, cue.startMs]);
  const d = await writeReference(editor, VIDEO_ID, c, 2, { fingerprintId: 'fp_test000001', comparison: null });
  assert.equal(d.slots[1].track.fingerprintId, 'fp_test000001');
  assert.equal(d.active, 1);
  await assert.rejects(writePosition(editor, VIDEO_ID, opened, 2, 0), (e) => e.code === 'ST_CONFLICT');
});

test('الحفظ ينعكس في المشغّل المفتوح: المتحكم يسمع التخزين فيعرض المقاطع المحفوظة والإزاحة', async () => {
  const { area, editor, opened } = await setup((s) => s.updateVideo(VIDEO_ID, () => videoRecord({ offset: 500, cues: makeCues(4) })));
  const store = createStore({ area, now: clock(Date.parse(NOW) + 999) });
  const c = createController({ store, extractor: fakeExtractor(), page: { title: () => 'عنوان', durationMs: () => 60000 }, now: clock() });
  store.onChange((ch) => c.handleStoreChange(ch));
  await c.start(VIDEO_ID);
  assert.equal(c.getState().arabic.edited, false);
  const s = createEditSession({ cues: openedSlot(opened, 1).cues, offsetMs: 500 });
  s.setText(2, 'تظهر في المشغّل');
  s.commitOffset();
  await save(editor, opened, 1, s);
  await settle(area);
  const st = c.getState();
  assert.equal(st.arabic.edited, true);
  assert.equal(st.arabic.cues[2].text, 'تظهر في المشغّل');
  assert.equal(st.arabic.cues[0].startMs, opened.record.arabic.original[0].startMs + 500);
  assert.equal(st.view.displayOffsetMs, 0, 'الظاهر في المشغّل كما كان قبل التثبيت');
});
