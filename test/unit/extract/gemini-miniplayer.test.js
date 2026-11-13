// تحقق Gemini، Y4-أ: المشغّل المصغّر يفرّغ الالتقاط. بمشغّل مصغّر حقيقي في Chrome وBrave وEdge (المفتاح i ثم زر العودة) صار
// المعرّف null فمُسح التقاط الفيديو، وبعد العودة إليه لم يُعِد يوتيوب طلب الترجمة و«CC» مفعّلة، فبقي فارغًا وظهرت رسالة ccStuck.
// المعتمد (الفكرة ٢): صفحة بلا فيديو لا تمسح التقاط آخر فيديو، والفيديو الآخر يمسحه. وأثناء الصفحة بلا فيديو لا يظهر منه شيء.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { createStore } from '../../../src/core/store/index.js';
import { createCaptureStore } from '../../../src/extract/capture-store.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { captureMsg, makeExtractor, sample } from './helpers.js';

const manual = sample('manual');
const A = manual.fixture.videoId;
const B = A === 'BBBBBBBBBBB' ? 'CCCCCCCCCCC' : 'BBBBBBBBBBB';

/** المستخرج والفيديو المعروض معًا كما يفعل main.js: العنوان يتغيّر ثم setVideo. */
function page() {
  const { extractor, state } = makeExtractor({ videoId: A, durationMs: manual.fixture.durationMs });
  const go = (id) => {
    state.videoId = id;
    extractor.setVideo(id);
  };
  return { extractor, go };
}

test('Y4-أ: مخزن الالتقاط: A ثم null ثم A ⇒ التقاط A باقٍ؛ ثم B ⇒ فارغ', () => {
  const s = createCaptureStore();
  s.setCurrentVideo(A);
  s.accept({ videoId: A, lang: 'en', trackKind: 'manual', body: 'x' });
  s.setCurrentVideo(null);
  assert.equal(s.accepted().length, 1, 'صفحة بلا فيديو لا تمسحه');
  s.setCurrentVideo(A);
  assert.equal(s.accepted().length, 1, 'باقٍ بعد العودة');
  s.setCurrentVideo(null);
  s.setCurrentVideo(B);
  assert.equal(s.accepted().length, 0, 'فيديو آخر يمسحه ولو بعد صفحة بلا فيديو');
  s.setCurrentVideo(A);
  assert.equal(s.accepted().length, 0, 'ولا يعود بالعودة إلى A');
  assert.equal(s.navigations, 6);
});

test('Y4-أ: المستخرج: A ثم null (المصغّر) ثم A ⇒ المسار باقٍ ويُحوَّل؛ وأثناء null لا مسار ظاهر', () => {
  const { extractor, go } = page();
  assert.equal(extractor.handleMessage(captureMsg({ videoId: A, body: manual.body })).accepted, true);
  assert.deepEqual(extractor.tracks().map((t) => t.key), ['en|manual']);
  go(null);
  assert.deepEqual(extractor.tracks(), [], 'لا يظهر مسار فيديو في صفحة بلا فيديو');
  assert.equal(extractor.convert('en|manual').code, 'EX_NO_TRACK');
  go(A);
  assert.deepEqual(extractor.tracks().map((t) => t.key), ['en|manual'], 'العودة إلى A دون طلب ترجمة جديد');
  const conv = extractor.convert('en|manual');
  assert.equal(conv.ok, true);
  assert.equal(conv.cues.length, 427);
  assert.equal(extractor.diagnostics().accepted, 1);
});

test('Y4-أ: المستخرج: A ثم null ثم B ⇒ فارغ، والعودة إلى A بعدها لا تعيد التقاطه', () => {
  const { extractor, go } = page();
  extractor.handleMessage(captureMsg({ videoId: A, body: manual.body }));
  go(null);
  go(B);
  assert.deepEqual(extractor.tracks(), []);
  assert.equal(extractor.diagnostics().accepted, 0, 'المخزن أُفرغ لا الخانات وحدها');
  go(A);
  assert.deepEqual(extractor.tracks(), []);
});

test('Y4-أ: المستخرج: A ثم B مباشرة يمسح كما كان', () => {
  const { extractor, go } = page();
  extractor.handleMessage(captureMsg({ videoId: A, body: manual.body }));
  go(B);
  assert.deepEqual(extractor.tracks(), []);
  go(A);
  assert.deepEqual(extractor.tracks(), []);
});

test('Y4-أ: المتحكم بالمستخرج الحقيقي: captured فارغ أثناء المصغّر، ويعود بعد العودة إلى A', async () => {
  const { extractor, go } = page();
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  const c = createController({ store, extractor, page: { title: () => null, durationMs: () => manual.fixture.durationMs } });
  // كما في main.js: المتحكم ثم المستخرج عند كل تغيّر.
  const nav = async (id) => {
    const p = c.setVideo(id);
    go(id);
    await p;
  };
  await c.start(A);
  extractor.handleMessage(captureMsg({ videoId: A, body: manual.body }));
  assert.equal(c.getState().captured.length, 1);
  await nav(null);
  assert.equal(c.getState().videoId, null);
  assert.equal(c.getState().captured.length, 0, 'لا شيء من A في حالة بلا فيديو');
  await nav(A);
  assert.equal(c.getState().captured.length, 1, 'الالتقاط باقٍ فلا ccStuck ولا حاجة إلى إعادة CC');
  assert.equal(c.getState().english?.source, 'captured');
  await nav(null);
  await nav(B);
  assert.equal(c.getState().captured.length, 0);
});
