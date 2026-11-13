// تحقق Gemini، Y3 (القرار ٢٧ب): مدة الفيديو تُورَّث كما كان يُورَّث العنوان. يوتيوب يغيّر الرابط (فالمعرّف) قبل أن يحمّل عنصر
// الفيديو بيانات الجديد، فمدة العنصر لحظة التبديل مدةُ الفيديو السابق؛ وكانت الحالة والكتابات الأربع تقرؤها بلا حارس، و`base` في
// الانتقالات يكتب كل مدة موجبة فوق مدة السجل. الحارس هو حارس العنوان نفسه: المدة لحظة التبديل للصفحة السابقة ما دامت لم تتغيّر،
// فتُعدّ مجهولة (null)؛ إلا في فيديو الصفحة الأول، والعودة إلى فيديو عُرفت له هذه المدة، والمدة المخالفة للمعروفة للسابق.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { englishTrack, fakeExtractor, fingerprint, makeCues, videoRecord } from '../../helpers/fixtures.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const DA = 212_000;
const DB = 345_000;
/** مدة سجل videoRecord المحفوظ. */
const SAVED = 60_000;
const cues = () => makeCues(5, { text: (i) => `line ${i}` });

/** صفحة بمدة فيديو يغيّرها الاختبار، ومستخرج وهمي يُبلِّغ (كما يفعل عند وصول قائمة المسارات). */
async function setup({ records = [] } = {}) {
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  for (const r of records) await store.updateVideo(r.videoId, () => r);
  const page = { durationMs: /** @type {number | null} */ (DA) };
  const ex = fakeExtractor({ videoId: null });
  const c = createController({ store, extractor: ex, page: { title: () => null, durationMs: () => page.durationMs } });
  const nav = async (id) => {
    const p = c.setVideo(id);
    ex.setVideo(id);
    await p;
  };
  return { store, page, ex, c, nav };
}

/** A ثم B ومدة العنصر ما زالت لـA: «الثانية الأولى بعد التنقل». */
async function staleB(opts) {
  const env = await setup(opts);
  await env.c.start(A);
  await env.nav(B);
  return env;
}

test('Y3 (المدة): بعد التنقل ومدة العنصر ما زالت للسابق ⇒ durationMs null، ثم مدة الجديد حين تتغيّر', async () => {
  const { page, ex, c, nav } = await setup();
  await c.start(A);
  assert.equal(c.getState().durationMs, DA, 'فيديو الصفحة الأول بمدته');
  await nav(B);
  assert.equal(c.getState().durationMs, null, 'لا تُورَّث مدة A إلى B');
  page.durationMs = DB;
  ex.setTracks([]);
  assert.equal(c.getState().durationMs, DB);
});

test('Y3 (المدة): loadArabic في الثانية الأولى بعد التنقل لفيديو بلا سجل: المدة null لا مدة A', async () => {
  const { c } = await staleB();
  const rec = await c.loadArabic({ fileName: 'b.ar.srt', cues: makeCues(3) });
  assert.equal(rec.durationMs, null);
});

test('Y3 (المدة): recordExport في الثانية الأولى بعد التنقل لا يكتب مدة A فوق مدة B المحفوظة', async () => {
  const { store, ex, c } = await staleB({ records: [videoRecord({ videoId: B, arabic: false })] });
  ex.setTracks([{ key: 'en|manual', kind: 'manual', cues: cues() }]);
  await c.recordExport({ trackKey: 'en|manual', fingerprint: fingerprint({ videoId: B, track: englishTrack({ cues: cues() }), id: 'fp_test000003' }) });
  assert.equal((await store.getVideo(B)).durationMs, SAVED);
});

test('Y3 (المدة): recordSavedExport في الثانية الأولى بعد التنقل لا يكتب مدة A فوق مدة B المحفوظة', async () => {
  const { store, c } = await staleB({ records: [videoRecord({ videoId: B, arabic: false })] });
  const track = englishTrack();
  const { stored } = await c.recordSavedExport({ trackKey: track.key, fingerprint: fingerprint({ videoId: B, track, mode: 'long', id: 'fp_test000002' }) });
  assert.equal(stored, true);
  assert.equal((await store.getVideo(B)).durationMs, SAVED);
});

test('Y3 (المدة): loadArabicInto في الثانية الأولى: المدة null، وبعد تحميل بيانات B تحمل الكتابة التالية مدته', async () => {
  const { page, ex, c } = await staleB();
  const r1 = await c.loadArabicInto(1, { fileName: 'b.ar.srt', cues: makeCues(3) });
  assert.equal(r1.record.durationMs, null);
  page.durationMs = DB;
  ex.setTracks([]);
  const r2 = await c.loadArabicInto(1, { fileName: 'b2.ar.srt', cues: makeCues(2) }, { replace: true });
  assert.equal(r2.record.durationMs, DB);
});

test('Y3 (المدة): لا حارس حين تكون المدة للفيديو نفسه (العودة من المصغّر)، ولا حين تخالف المعروفة للسابق', async () => {
  const { page, c, nav } = await setup();
  await c.start(A);
  await nav(null);
  assert.equal(c.getState().durationMs, null, 'صفحة بلا فيديو بلا مدة');
  await nav(A);
  assert.equal(c.getState().durationMs, DA, 'المدة نفسها التي عُرفت لـA');
  page.durationMs = DB;
  await nav(B);
  assert.equal(c.getState().durationMs, DB, 'مدة العنصر غير مدة A المعروفة: هي مدة B');
});

test('Y3 (المدة): تنقل أثناء كتابة جارية: لا تُكتب في سجل الفيديو السابق مدةُ الجديد', async () => {
  const { store, page, c, nav } = await setup();
  await c.start(A);
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const orig = store.updateVideo;
  store.updateVideo = async (id, fn) => {
    await gate;
    return orig(id, fn);
  };
  const writing = c.loadArabic({ fileName: 'a.ar.srt', cues: makeCues(3) });
  await nav(B);
  page.durationMs = DB;
  release();
  const rec = await writing;
  assert.equal(rec.videoId, A);
  assert.notEqual(rec.durationMs, DB, 'مدة B لا تُكتب في سجل A');
});
