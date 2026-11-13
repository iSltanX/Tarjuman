// تحقق Gemini، Y3: عنوان الفيديو السابق يبقى بعد تنقل SPA. يوتيوب يغيّر العنوان (والمعرّف) قبل عنوان المستند بنحو ثلث ثانية
// إلى ثانية (Chrome: yt-navigate-finish 1547 م.ث، وعنوان المستند 1851 م.ث)، فكان المتحكم يعرض عنوان السابق ما لم يُعَد الحساب،
// وتكتب أفعاله الأربعة التي تقرأ page.title() عنوان السابق في سجل الجديد. الحارس: عنوان المستند لحظة التبديل عنوانُ الصفحة السابقة
// ما دام لم يتغيّر، فيُعدّ مجهولًا (null)؛ إلا في فيديو الصفحة الأول، وفي العودة إلى فيديو عُرف له هذا العنوان، وحين يكون غير
// العنوان المعروف للسابق (سبق العنوانُ الجديد اكتشافَ التنقل).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { englishTrack, fakeExtractor, fingerprint, makeCues, videoRecord } from '../../helpers/fixtures.js';

const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';
const TA = 'Do schools kill creativity?';
const TB = 'Finding Your Element';
const cues = () => makeCues(5, { text: (i) => `line ${i}` });

/** صفحة بعنوان مستند يتغيّر بيد الاختبار، ومستخرج وهمي يُبلِّغ (كما يفعل عند وصول قائمة المسارات). */
async function setup({ records = [] } = {}) {
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  for (const r of records) await store.updateVideo(r.videoId, () => r);
  const doc = { title: TA };
  const ex = fakeExtractor({ videoId: null });
  const c = createController({ store, extractor: ex, page: { title: () => doc.title, durationMs: () => 60000 } });
  // تبديل المستخرج كما في main.js، ثم «وصول قائمة» تعيد الحساب.
  const nav = async (id) => {
    const p = c.setVideo(id);
    ex.setVideo(id);
    await p;
  };
  return { store, doc, ex, c, nav };
}

test('Y3: بعد التنقل وعنوان المستند ما زال للسابق ⇒ العنوان null، ثم عنوان الجديد حين يتغيّر وتصل قائمة', async () => {
  const { doc, ex, c, nav } = await setup();
  await c.start(A);
  assert.equal(c.getState().title, TA, 'فيديو الصفحة الأول بعنوانه');
  await nav(B);
  assert.equal(c.getState().videoId, B);
  assert.equal(c.getState().title, null, 'لا يُورَّث عنوان A إلى B');
  ex.setTracks([]);
  assert.equal(c.getState().title, null, 'إعادة الحساب والعنوان لم يتغيّر بعد');
  doc.title = TB;
  ex.setTracks([]);
  assert.equal(c.getState().title, TB);
});

/** A ثم B وعنوان المستند ما زال لـA: «الثانية الأولى بعد التنقل». */
async function staleB(opts) {
  const env = await setup(opts);
  await env.c.start(A);
  await env.nav(B);
  return env;
}

test('Y3: recordSavedExport في الثانية الأولى بعد التنقل لا يكتب عنوان A فوق عنوان B المحفوظ', async () => {
  const savedB = videoRecord({ videoId: B, arabic: false });
  const { store, c } = await staleB({ records: [savedB] });
  // تصدير جديد (الوضع الطويل) للمسار المحفوظ، فيُكتب السجل لا تُحدَّث بصمة.
  const track = englishTrack();
  const { stored } = await c.recordSavedExport({ trackKey: track.key, fingerprint: fingerprint({ videoId: B, track, mode: 'long', id: 'fp_test000002' }) });
  assert.equal(stored, true);
  assert.equal((await store.getVideo(B)).title, savedB.title);
});

test('Y3: recordExport في الثانية الأولى بعد التنقل لا يكتب عنوان A', async () => {
  const savedB = videoRecord({ videoId: B, arabic: false });
  const { store, ex, c } = await staleB({ records: [savedB] });
  ex.setTracks([{ key: 'en|manual', kind: 'manual', cues: cues() }]);
  await c.recordExport({ trackKey: 'en|manual', fingerprint: fingerprint({ videoId: B, track: englishTrack({ cues: cues() }), id: 'fp_test000003' }) });
  assert.equal((await store.getVideo(B)).title, savedB.title);
});

test('Y3: loadArabic في الثانية الأولى بعد التنقل لفيديو بلا سجل: العنوان null لا عنوان A', async () => {
  const { c } = await staleB();
  const rec = await c.loadArabic({ fileName: 'b.ar.srt', cues: makeCues(3) });
  assert.equal(rec.title, null);
});

test('Y3: loadArabicInto في الثانية الأولى بعد التنقل: العنوان null، وبعد تغيّر العنوان تحمل الكتابة التالية عنوان B', async () => {
  const { doc, ex, c } = await staleB();
  const r1 = await c.loadArabicInto(1, { fileName: 'b.ar.srt', cues: makeCues(3) });
  assert.equal(r1.record.title, null);
  doc.title = TB;
  ex.setTracks([]);
  const r2 = await c.loadArabicInto(1, { fileName: 'b2.ar.srt', cues: makeCues(2) }, { replace: true });
  assert.equal(r2.record.title, TB);
});

test('Y3: لا حارس حين يكون العنوان للفيديو نفسه: العودة من صفحة بلا فيديو (المصغّر) إلى الفيديو نفسه، وعنوان سبق اكتشاف التنقل', async () => {
  const { doc, c, nav } = await setup();
  await c.start(A);
  await nav(null);
  assert.equal(c.getState().title, null, 'صفحة بلا فيديو بلا عنوان');
  await nav(A);
  assert.equal(c.getState().title, TA, 'العنوان نفسه الذي عُرف لـA');
  doc.title = TB;
  await nav(B);
  assert.equal(c.getState().title, TB, 'عنوان المستند غير عنوان A المعروف: هو عنوان B');
});

test('Y3: السابق محفوظ بعنوان في سجله: عنوان مستنده يُعرف مع ذلك، فعنوان سبق اكتشاف التنقل لا يُحجب عن الجديد', async () => {
  const { doc, c, nav } = await setup({ records: [videoRecord({ videoId: A })] });
  await c.start(A);
  assert.equal(c.getState().title, 'عنوان تجريبي', 'عنوان السجل مقدَّم');
  doc.title = TB;
  await nav(B);
  assert.equal(c.getState().title, TB);
});

test('Y3: من صفحة بلا فيديو (البحث) إلى فيديو: عنوان الصفحة السابقة لا يصير عنوانه', async () => {
  const { doc, ex, c, nav } = await setup();
  doc.title = 'nature documentary';
  await c.start(null);
  await nav(B);
  assert.equal(c.getState().title, null);
  doc.title = TB;
  ex.setTracks([]);
  assert.equal(c.getState().title, TB);
});

test('Y3: تنقل أثناء كتابة جارية: لا تُكتب في سجل الفيديو السابق عنوانُ الصفحة الجديدة', async () => {
  const { store, doc, c, nav } = await setup();
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
  doc.title = TB;
  release();
  const rec = await writing;
  assert.equal(rec.videoId, A);
  assert.notEqual(rec.title, TB, 'عنوان B لا يُكتب في سجل A');
});

test('Y3 (قيد موثّق): فيديو بعنوان السابق حرفًا بحرف يبقى بلا عنوان في الصفحة نفسها، ويُعرف بعد إعادة تحميلها', async () => {
  const { store, doc, ex, c, nav } = await setup();
  await c.start(A);
  await nav(B);
  ex.setTracks([]);
  assert.equal(c.getState().title, null, 'TA لـB لا يُميَّز من عنوان A الباقي');
  const rec = await c.loadArabic({ fileName: 'b.ar.srt', cues: makeCues(3) });
  assert.equal(rec.title, null, 'ولا يُكتب في سجله');
  // إعادة التحميل: فيديو الصفحة الأول يأخذ عنوانها.
  const fresh = createController({ store, extractor: fakeExtractor({ videoId: null }), page: { title: () => doc.title, durationMs: () => 60000 } });
  await fresh.start(B);
  assert.equal(fresh.getState().title, TA);
});
