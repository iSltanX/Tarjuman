// تكامل نقطة دخول سكربت المحتوى (تحقق Gemini، ع-٥، البند 37): src/content/main.js الحقيقي يُحمَّل على صفحة مشاهدة وهمية بمشغّل
// يوتيوب (DOM الطبقة الوهمي)، وفوق تخزين واحد بكاتبه الواحد (test/helpers/store-env.js) كما في المتصفح. والالتقاط حقيقي: سكربت
// عالم الصفحة (src/main-world/capture.js) يُشغَّل في node:vm، ويطلب «المشغّل» عيّنة json3 الملتقطة حيًا في P1، فيعبر غلافه ثم
// postMessage ثم الجسر إلى المستخرج. وكل ما يُفحص يُرى من الخارج: رد tj:get-video-state لصفحة الإضافة، والأسطر في الطبقة فوق
// الفيديو. كانت طفرات التوصيل في main.js (الجسر، وأحداث التخزين، وتركيب الطبقة، وتبليغ المتحكم بالتنقل، وبدؤه، ورد النافذة) تنجو
// كلها لأن الاختبار القائم (test/unit/c8-entrypoints.test.js) يعدّ المستمعين على صفحة ليست صفحة فيديو.
// main.js يُركَّب لحظة استيراده مرة في العملية، فالاختبارات أدناه خطوات متتالية على الصفحة نفسها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readTimedtextParams } from '../../../src/extract/timedtext-params.js';
import { videoIdFromLocation } from '../../../src/core/model/video-location.js';
import { createFakeChrome } from '../../helpers/chrome-storage.js';
import { json3Index, realTrack, videoRecord } from '../../helpers/fixtures.js';
import { storeEnv } from '../../helpers/store-env.js';
import { addPlayer, createFakeEnv } from '../../unit/player/overlay/fake-dom.js';
import { prepareVideo } from '../../unit/player/overlay/harness.js';
import { addBar } from '../../unit/player/controls/harness.js';

const ORIGIN = 'https://www.youtube.com';
const MANUAL = json3Index().find((f) => f.trackKind === 'manual');
const ASR = json3Index().find((f) => f.trackKind === 'asr');
const A = MANUAL.videoId;
const B = ASR.videoId;
const fixtureBody = (f) => readFileSync(new URL(`../../fixtures/json3/${f.file}`, import.meta.url), 'utf8');
const timedtextUrl = (f) => `${ORIGIN}/api/timedtext?v=${f.videoId}&lang=${f.lang}&fmt=json3${f.trackKind === 'asr' ? '&kind=asr' : ''}`;

// ---------------------------------------------------------------- الصفحة

const senv = storeEnv();
const { area } = senv;
const fake = createFakeChrome({ area });
fake.chrome.runtime.sendMessage = senv.runtime.sendMessage; // الكتابة عبر الكاتب الواحد كما في العامل الخلفي
fake.chrome.i18n = { getUILanguage: () => 'ar' };
const POPUP = { id: fake.chrome.runtime.id, url: fake.chrome.runtime.getURL('pages/popup/index.html') };

const env = createFakeEnv({ href: `${ORIGIN}/watch?v=${A}` });
const parts = addPlayer(env, { width: 854, height: 480 });
prepareVideo(parts.video);
addBar(env, parts, { width: 854 });

/** يمرّر مهام لاحقة حتى تصل أحداث التخزين وتنتهي القراءات وسلاسل الوعود. */
async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await area.flush();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** سكربت عالم الصفحة في سياق مستقل: ما يرسله بـpostMessage يصل نافذة الصفحة الوهمية بمصدرها وأصلها، في مهمة لاحقة كما في المتصفح. */
function loadPageWorld() {
  const url = new URL('../../../src/main-world/capture.js', import.meta.url);
  const source = readFileSync(url, 'utf8');
  const imports = /^import \{ (?:readTimedtextParams|videoIdFromLocation) \} from '[^']+';\s*$/gm;
  assert.equal(source.match(imports)?.length, 2, 'شكل استيرادَي capture.js تغيّر؛ حدّث الحقن');
  const loc = env.win.location;
  const pageWin = {
    location: { origin: ORIGIN, get pathname() { return loc.pathname; }, get search() { return loc.search; }, get href() { return `${ORIGIN}${loc.pathname}${loc.search}`; } },
    postMessage(msg, targetOrigin) {
      assert.equal(targetOrigin, ORIGIN, 'الرسالة لأصل الصفحة وحده');
      const data = structuredClone(msg);
      setTimeout(() => env.win.fire('message', { type: 'message', source: env.win, origin: ORIGIN, data }), 0);
    },
    // طلب المشغّل نفسه: عيّنة P1 بحسب معرّف الفيديو في الرابط.
    fetch: async (input) => {
      const v = new URL(String(input)).searchParams.get('v');
      const f = json3Index().find((x) => x.videoId === v);
      return new Response(f ? fixtureBody(f) : '', { status: f ? 200 : 404 });
    },
    XMLHttpRequest: class {},
  };
  const ctx = vm.createContext({ window: pageWin, URL, Response, Request, TextDecoder, TextEncoder, WeakMap, queueMicrotask, JSON, String, Promise, Blob, readTimedtextParams, videoIdFromLocation });
  vm.runInContext(source.replace(imports, ''), ctx, { filename: url.href });
  return pageWin;
}

/** «المشغّل يطلب الترجمة»: طلب timedtext من عالم الصفحة يعبر غلاف الالتقاط. */
async function playerRequests(f) {
  const res = await page.fetch(timedtextUrl(f));
  assert.equal(res.status, 200);
  await res.text();
  await settle();
}

/** تنقّل يوتيوب داخل الصفحة: بداية، فتغيّر العنوان، فانتهاء (كما في test/integration/player). */
async function navigate(id) {
  env.doc.dispatchEvent({ type: 'yt-navigate-start' });
  env.win.navigate(`${ORIGIN}/watch?v=${id}`);
  env.doc.dispatchEvent({ type: 'yt-navigate-finish' });
  await settle();
}

/** رد حالة الفيديو كما تطلبه نافذة الأيقونة. */
const videoState = (sender = POPUP) => fake.dispatchMessage({ v: 1, type: 'tj:get-video-state' }, sender);

/** الأسطر الظاهرة فوق الفيديو (الجذر المظلل للطبقة)، نصوصًا لا عقدًا. */
function shownLines() {
  const host = env.doc.querySelector('#tarjuman-overlay');
  const stage = host?.shadowRoot?.querySelector('.stage');
  if (!stage || stage.hasAttribute('data-empty') || host.hasAttribute('hidden')) return [];
  return stage.children.map((c) => c.textContent);
}

/** ترجمة عربية لأول المقاطع بتوقيت العيّنة نفسها. */
const AR = realTrack('manual').cues.slice(0, 12).map((c) => ({ ...c, text: `ترجمة المقطع ${c.n}` }));
const midOf = (c) => (c.startMs + c.endMs) / 2000;

const page = loadPageWorld();
for (const k of ['window', 'document', 'chrome']) assert.equal(k in globalThis, false, `${k} معرّف في Node؛ الاستعادة تحتاج حفظه`);
globalThis.window = env.win;
globalThis.document = env.doc;
globalThis.chrome = fake.chrome;
test.after(() => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.chrome;
});
await import('../../../src/content/main.js');
await settle();

// ---------------------------------------------------------------- الخطوات (بالترتيب)

test('التركيب: المتحكم بدأ بفيديو العنوان، والطبقة مركّبة على المشغّل، ورد النافذة من الحالة الحقيقية', async () => {
  const s = await videoState();
  assert.equal(s?.ok, true, JSON.stringify(s));
  assert.equal(s.watch, true);
  assert.equal(s.videoId, A, 'controller.start(tracker.current())');
  assert.equal(s.loading, false);
  assert.equal(s.mounted.overlay, 'mounted', 'الطبقة الحقيقية على #movie_player');
  assert.equal(s.mounted.controls, 'mounted', 'أدوات ترجمان في شريط المشغّل');
  assert.deepEqual(s.english.captured, []);
  assert.equal(s.arabic, null);
  assert.equal(env.win.listenerCount('message'), 1, 'جسر واحد');
  assert.equal(globalThis.__tarjuman, undefined, 'لا خطاف تطوير خارج build:dev');
});

test('الرد لصفحة الإضافة وحدها: سكربت محتوى، وإضافة أخرى، وعنوان يحوي عنوان الإضافة، لا رد لها', async () => {
  const id = fake.chrome.runtime.id;
  for (const sender of [
    { id, tab: { id: 3 }, url: `${ORIGIN}/watch?v=${A}` },
    { id: 'otherextensionidotherextensionid', url: 'chrome-extension://otherextensionidotherextensionid/pages/popup/index.html' },
    { id, url: `${ORIGIN}/watch?v=${A}#${fake.chrome.runtime.getURL('pages/popup/index.html')}` },
  ]) assert.equal(await videoState(sender), undefined, JSON.stringify(sender));
});

test('التقاط حقيقي: طلب المشغّل يعبر غلاف عالم الصفحة والجسر إلى المستخرج، فيظهر المسار في رد النافذة', async () => {
  await playerRequests(MANUAL);
  const s = await videoState();
  assert.deepEqual(s.english.captured, [{ key: 'en|manual', kind: 'manual', cueCount: MANUAL.expected.cues, ok: true }]);
  assert.equal(s.capture.state, 'captured');
  assert.equal(s.source?.key, 'en|manual');
  assert.deepEqual(shownLines(), [], 'لا ترجمة عربية بعد');
});

test('ترجمة حُفظت من سياق آخر (المحرّر): حدث التخزين يصل المتحكم، فتظهر في الرد وفوق الفيديو في زمنها', async () => {
  const editor = senv.context();
  await editor.updateVideo(A, () => videoRecord({ videoId: A, cues: AR }));
  await settle();
  const s = await videoState();
  assert.equal(s.arabic?.fileName, `${A}.ar.srt`, 'store.onChange → controller.handleStoreChange');
  assert.equal(s.arabic.cueCount, AR.length);
  parts.video.seekTo(midOf(AR[2]));
  await settle(2);
  assert.deepEqual(shownLines(), [AR[2].text]);
});

test('التنقل إلى فيديو آخر: المتحكم والمستخرج يتبعانه، فلا تُعرض ترجمة الأول فوق الثاني ولا مساره', async () => {
  await navigate(B);
  const s = await videoState();
  assert.equal(s.videoId, B, 'controller.setVideo(id) عند تغيّر الفيديو');
  assert.equal(s.arabic, null);
  assert.deepEqual(s.english.captured, []);
  parts.video.seekTo(midOf(AR[3]));
  await settle(2);
  assert.deepEqual(shownLines(), [], 'ترجمة الفيديو الأول فوق الثاني');
  await playerRequests(ASR);
  const after = await videoState();
  assert.deepEqual(after.english.captured, [{ key: 'en|asr', kind: 'asr', cueCount: ASR.expected.cues, ok: true }]);
  assert.equal(after.arabic, null);
});

test('العودة إلى الأول: ترجمته المحفوظة تعود فوق الفيديو، ومسار الثاني الملتقط لا يبقى', async () => {
  await navigate(A);
  const s = await videoState();
  assert.equal(s.videoId, A);
  assert.equal(s.arabic?.fileName, `${A}.ar.srt`);
  assert.deepEqual(s.english.captured, []);
  assert.deepEqual(s.english.saved.map((t) => t.key), ['en|manual']);
  parts.video.seekTo(midOf(AR[5]));
  await settle(2);
  assert.deepEqual(shownLines(), [AR[5].text]);
});

test('صفحة بلا فيديو (الصفحة الرئيسية): لا فيديو في الحالة، ولا ترجمة فوق المشغّل', async () => {
  env.doc.dispatchEvent({ type: 'yt-navigate-start' });
  env.win.navigate(`${ORIGIN}/`);
  env.doc.dispatchEvent({ type: 'yt-navigate-finish' });
  await settle();
  const s = await videoState();
  assert.equal(s.watch, false);
  assert.equal(s.videoId, null);
  assert.deepEqual(shownLines(), []);
});
