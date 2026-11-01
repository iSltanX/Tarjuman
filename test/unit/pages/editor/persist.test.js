// الحفظ من المحرّر (P8-AC3 وعقد التخزين §٣ و§٦): النسخة الحالية تُكتب والأصل باقٍ، والتعارض مع المشغّل
// يُرفض بـST_CONFLICT، والاستعادة بتأكيد، والحفظ ينعكس في المشغّل المفتوح عبر أحداث التخزين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyChange, openedState, restoreOriginal, saveEdits, versionOf } from '../../../../src/pages/editor/persist.js';
import { createEditSession } from '../../../../src/core/edit/index.js';
import { createController } from '../../../../src/content/controller.js';
import { createStore } from '../../../../src/core/store/index.js';
import { withView } from '../../../../src/core/model/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID, fakeExtractor, makeCues, videoRecord } from '../../../helpers/fixtures.js';

const clock = (start = Date.parse(NOW)) => {
  let t = start;
  return () => (t += 1000);
};

async function setup(record = videoRecord({ offset: 500 })) {
  const area = createMemoryArea();
  const seed = createStore({ area, now: clock() });
  await seed.updateVideo(VIDEO_ID, () => record);
  await area.flush();
  const editor = createStore({ area, now: clock(Date.parse(NOW) + 333) });
  const player = createStore({ area, now: clock(Date.parse(NOW) + 777) });
  const opened = await editor.getVideo(VIDEO_ID);
  return { area, editor, player, opened };
}
const settle = async (area) => {
  await area.flush();
  await new Promise((r) => setTimeout(r, 5));
  await area.flush();
};

test('الفتح: المقاطع الحالية والإزاحة والبصمة المشار إليها', async () => {
  const { opened } = await setup();
  const s = openedState(opened);
  assert.equal(s.edited, false);
  assert.equal(s.offsetMs, 500);
  assert.equal(s.fingerprint.id, opened.arabic.fingerprintId);
  assert.deepEqual(s.cues, opened.arabic.original);
  assert.throws(() => openedState(videoRecord({ arabic: false })), (e) => e.code === 'ST_NO_RECORD');
});

test('الحفظ: النسخة المعدّلة تُكتب، والأصل المستورد باقٍ، والإزاحة المثبّتة تُكتب معها في خطوة واحدة', async () => {
  const { editor, opened } = await setup();
  const s = createEditSession({ cues: openedState(opened).cues, offsetMs: 500 });
  s.setText(0, 'نص معدّل');
  s.commitOffset();
  const saved = await saveEdits(editor, VIDEO_ID, opened, { cues: s.snapshot(), offsetChanged: s.offsetChanged, offsetMs: s.offsetMs });
  assert.equal(saved.rev, opened.rev + 1);
  assert.deepEqual(saved.arabic.original, opened.arabic.original, 'الأصل لا يُستبدل');
  assert.equal(saved.arabic.current[0].text, 'نص معدّل');
  assert.equal(saved.arabic.current[0].startMs, opened.arabic.original[0].startMs + 500);
  assert.equal(saved.view.displayOffsetMs, 0);
  const stored = await editor.getVideo(VIDEO_ID);
  assert.equal(versionOf(stored), versionOf(saved));
  assert.equal(classifyChange(saved, { oldValue: opened, newValue: stored }), 'echo', 'صدى كتابتنا يُهمل');
});

test('الحفظ بلا تثبيت لا يمس الإزاحة التي غيّرها المشغّل قبل الفتح', async () => {
  const { editor, opened } = await setup();
  const s = createEditSession({ cues: openedState(opened).cues, offsetMs: 500 });
  s.shift({ kind: 'all' }, 500);
  const saved = await saveEdits(editor, VIDEO_ID, opened, { cues: s.snapshot(), offsetChanged: s.offsetChanged, offsetMs: s.offsetMs });
  assert.equal(saved.view.displayOffsetMs, 500, 'لا تطبيق مزدوج ٣: المحفوظ +500 والإزاحة +500');
  assert.equal(saved.arabic.current[0].startMs, opened.arabic.original[0].startMs + 500);
});

test('التعارض: كتابة من المشغّل بعد الفتح ترفض الحفظ بـST_CONFLICT ولا يُكتب شيء', async () => {
  const { area, editor, player, opened } = await setup();
  await player.updateVideo(VIDEO_ID, (r) => withView(r, { displayOffsetMs: 1000 }, NOW));
  await settle(area);
  const s = createEditSession({ cues: openedState(opened).cues, offsetMs: 500 });
  s.setText(0, 'لن يُحفظ');
  await assert.rejects(saveEdits(editor, VIDEO_ID, opened, { cues: s.snapshot(), offsetChanged: false, offsetMs: 500 }), (e) => e.code === 'ST_CONFLICT');
  const stored = await editor.getVideo(VIDEO_ID);
  assert.equal(stored.arabic.current, null);
  assert.equal(stored.view.displayOffsetMs, 1000);
  assert.equal(classifyChange(opened, { oldValue: opened, newValue: stored }), 'changed');
  assert.equal(classifyChange(opened, { oldValue: opened, newValue: null }), 'removed');
  assert.equal(classifyChange(opened, undefined), 'none');
});

test('استعادة الأصل: تسقط النسخة المعدّلة المحفوظة، والأصل كما استُورد', async () => {
  const { editor, opened } = await setup();
  const s = createEditSession({ cues: openedState(opened).cues });
  s.setText(1, 'معدّل');
  const saved = await saveEdits(editor, VIDEO_ID, opened, { cues: s.snapshot(), offsetChanged: false, offsetMs: 500 });
  assert.equal(openedState(saved).edited, true);
  const back = await restoreOriginal(editor, VIDEO_ID, saved);
  assert.equal(back.arabic.current, null);
  assert.deepEqual(openedState(back).cues, opened.arabic.original);
  await assert.rejects(restoreOriginal(editor, VIDEO_ID, opened), (e) => e.code === 'ST_CONFLICT', 'على نسخة قديمة');
});

test('الحفظ ينعكس في المشغّل المفتوح: المتحكم يسمع التخزين فيعرض المقاطع المحفوظة والإزاحة', async () => {
  const { area, editor, opened } = await setup(videoRecord({ offset: 500, cues: makeCues(4) }));
  const store = createStore({ area, now: clock(Date.parse(NOW) + 999) });
  const c = createController({ store, extractor: fakeExtractor(), page: { title: () => 'عنوان', durationMs: () => 60000 }, now: clock() });
  store.onChange((ch) => c.handleStoreChange(ch));
  await c.start(VIDEO_ID);
  assert.equal(c.getState().arabic.edited, false);
  const s = createEditSession({ cues: openedState(opened).cues, offsetMs: 500 });
  s.setText(2, 'تظهر في المشغّل');
  s.commitOffset();
  await saveEdits(editor, VIDEO_ID, opened, { cues: s.snapshot(), offsetChanged: true, offsetMs: 0 });
  await settle(area);
  const st = c.getState();
  assert.equal(st.arabic.edited, true);
  assert.equal(st.arabic.cues[2].text, 'تظهر في المشغّل');
  assert.equal(st.arabic.cues[0].startMs, opened.arabic.original[0].startMs + 500);
  assert.equal(st.view.displayOffsetMs, 0, 'الظاهر في المشغّل كما كان قبل التثبيت');
});
