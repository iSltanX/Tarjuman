// نقطة التركيب mountOverlay: الانتظار عند document_start حتى يظهر #movie_player، والتركيب مرة، وإعادته إن
// أعاد يوتيوب رسم المشغّل أو أزال المضيف، ومتانتها عند الإخفاق، والتنظيف عند الإلغاء. الحالة حية (getter).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_MS, MAX_FAILURES, mountOverlay } from '../../../../src/player/overlay/index.js';
import { addPlayer } from './fake-dom.js';
import { makeState, prepareVideo, watchPage } from './harness.js';

const hostsIn = (el) => el.children.filter((c) => c.id === 'tarjuman-overlay');

test('عند document_start بلا مشغّل: ينتظر ثم يركّب فور ظهوره، مرة واحدة', () => {
  const page = watchPage({ withPlayer: false });
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  assert.equal(handle.state, 'waiting');
  assert.equal(page.env.observers(), 1, 'مراقب على المستند ما دام المشغّل غائبًا');
  const parts = addPlayer(page.env);
  prepareVideo(parts.video);
  page.env.win.advance(60); // تجميع دفعات التغيّر 50ms
  assert.equal(handle.state, 'mounted');
  assert.equal(hostsIn(parts.player).length, 1);
  assert.equal(page.env.observers(), 1, 'مراقب class المشغّل وحده بعد التركيب (مراقب المستند فُصل)');
  page.env.win.advance(HEALTH_MS * 5);
  assert.equal(hostsIn(parts.player).length, 1, 'الفحص الدوري لا يكرر المضيف');
  assert.equal(handle.diagnostics().attempts, 1);
});

test('المشغّل موجود أصلًا: يركّب فورًا', () => {
  const page = watchPage();
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  assert.equal(handle.state, 'mounted');
  assert.equal(hostsIn(page.player).length, 1);
});

test('الحالة حية على المقبض نفسه (رد نافذة الأيقونة يقرؤها لاحقًا)', () => {
  const page = watchPage({ withPlayer: false });
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  const read = () => handle.state;
  assert.equal(read(), 'waiting');
  addPlayer(page.env);
  page.env.win.advance(60);
  assert.equal(read(), 'mounted');
  handle.unmount();
  assert.equal(read(), 'stub');
});

test('يوتيوب يعيد رسم المشغّل بعنصر جديد: يُعاد التركيب على الجديد ويُزال القديم', () => {
  const page = watchPage();
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  const oldHost = hostsIn(page.player)[0];
  page.player.remove();
  const next = addPlayer(page.env);
  prepareVideo(next.video);
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(handle.state, 'mounted');
  assert.equal(hostsIn(next.player).length, 1);
  assert.equal(oldHost.isConnected, false);
  assert.equal(handle.diagnostics().attempts, 2);
});

test('إزالة الصفحة للمضيف وحده: يعاد تركيبه عند الفحص الدوري', () => {
  const page = watchPage();
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  hostsIn(page.player)[0].remove();
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(hostsIn(page.player).length, 1);
  assert.equal(handle.state, 'mounted');
});

test('اختفاء المشغّل (مغادرة صفحة المشاهدة): ينظّف الجلسة ويعود إلى الانتظار', () => {
  const page = watchPage();
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  page.player.remove();
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(handle.state, 'waiting');
  assert.equal(page.controller.subscribers(), 0, 'لا اشتراك معلّق');
  assert.equal(handle.peek(), null);
});

test('حدث انتهاء التنقل يفحص فورًا دون انتظار الدورة', () => {
  const page = watchPage({ withPlayer: false });
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  const parts = addPlayer(page.env);
  prepareVideo(parts.video);
  page.env.doc.observers; // لا شيء: المراقب يجمّع، والحدث أسرع منه
  page.ev('yt-navigate-finish');
  page.env.win.advance(60);
  assert.equal(handle.state, 'mounted');
});

test('إخفاق التركيب لا يرمي: state=error برمز PL_MOUNT_FAILED، ويتوقف بعد المحاولات المسموحة', () => {
  const page = watchPage();
  page.env.doc.createElement = () => {
    throw new TypeError('boom');
  };
  let handle;
  assert.doesNotThrow(() => {
    handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  });
  assert.equal(handle.state, 'error');
  assert.equal(handle.diagnostics().lastCode, 'PL_MOUNT_FAILED');
  page.env.win.advance(HEALTH_MS * 10);
  assert.equal(handle.diagnostics().failures, MAX_FAILURES, 'لا إعادة بلا نهاية');
  assert.equal(handle.diagnostics().attempts, MAX_FAILURES);
  assert.equal(page.controller.subscribers(), 0);
});

test('صفحة جديدة بعد الإخفاق تصفّر العدّاد وتحاول من جديد', () => {
  const page = watchPage();
  const real = page.env.doc.createElement;
  page.env.doc.createElement = () => {
    throw new TypeError('boom');
  };
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  page.env.win.advance(HEALTH_MS * 5);
  assert.equal(handle.state, 'error');
  page.env.doc.createElement = real;
  page.ev('yt-navigate-finish');
  page.env.win.advance(60);
  assert.equal(handle.state, 'mounted');
});

test('التشخيص لا يحوي نص مقاطع ولا روابط', () => {
  const page = watchPage({ state: makeState() });
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  page.video.seekTo(1.5);
  assert.equal(handle.peek().lines[0].text, 'سطر 1');
  const s = JSON.stringify(handle.diagnostics());
  assert.doesNotMatch(s, /سطر|https?:/);
});

test('unmount: يزيل الطبقة وكل مراقب ومؤقت ومستمع، ومتكرر بأمان', () => {
  const page = watchPage();
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  page.video.play();
  handle.unmount();
  handle.unmount();
  assert.equal(handle.state, 'stub');
  assert.equal(hostsIn(page.player).length, 0);
  assert.equal(page.env.observers(), 0);
  assert.equal(page.env.resizeObservers(), 0);
  assert.equal(page.env.win.pendingTimers(), 0);
  assert.equal(page.env.win._raf.size, 0);
  assert.equal(page.env.doc.adoptedStyleSheets.length, 0);
  assert.equal(page.controller.subscribers(), 0);
  for (const t of ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated', 'fullscreenchange']) assert.equal(page.env.doc.listenerCount(t), 0, t);
});

test('يعمل مع المتحكم الحقيقي: الحالة تتبدل والطبقة تتبع', async () => {
  const { createController } = await import('../../../../src/content/controller.js');
  const { createStore } = await import('../../../../src/core/store/index.js');
  const { createMemoryArea } = await import('../../../helpers/chrome-storage.js');
  const { fakeExtractor, videoRecord, NOW } = await import('../../../helpers/fixtures.js');
  const page = watchPage();
  const area = createMemoryArea();
  const store = createStore({ area, now: () => Date.parse(NOW) });
  await store.updateVideo('AAAAAAAAAAA', () => videoRecord({ offset: 500, mode: 'dual' }));
  await area.flush();
  const controller = createController({ store, extractor: fakeExtractor(), page: { title: () => 't', durationMs: () => 60000 }, now: () => Date.parse(NOW) });
  const handle = mountOverlay(controller, { doc: page.env.doc, win: page.env.win });
  await controller.start('AAAAAAAAAAA');
  // مقاطع videoRecord: 1.0–3.0 ثم 3.5–5.5 ... بنص «سطر n»، والإنجليزي المحفوظ «line n»، والإزاحة +0.5.
  page.video.seekTo(1.2);
  assert.deepEqual(handle.peek().lines.map((l) => l.text), [], 'تأخير 0.5 فلا يظهر الأول بعد');
  page.video.seekTo(1.7);
  assert.deepEqual(handle.peek().lines.map((l) => [l.kind, l.text]), [['ar', 'سطر 1'], ['en', 'line 1']]);
  await controller.setDisplayMode('ar');
  assert.deepEqual(handle.peek().lines.map((l) => l.kind), ['ar']);
  await controller.setVideo('BBBBBBBBBBB');
  assert.deepEqual(handle.peek().lines, [], 'تبديل الفيديو يمسح فورًا');
  handle.unmount();
});

test('ملء شاشة بعنصر لا يستضيف أبناءً: لا إعادة بناء للجلسة عند كل فحص دوري', () => {
  const page = watchPage();
  page.env.doc.fullscreenElement = page.video;
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  page.env.win.advance(HEALTH_MS * 6);
  assert.equal(handle.state, 'mounted');
  assert.equal(handle.diagnostics().attempts, 1);
});

test('إخفاق بناء الجلسة في منتصفه لا يترك مؤقتًا ولا مراقبًا ولا مستمعًا (مراجعة)', () => {
  const page = watchPage();
  page.controller.subscribe = () => {
    throw new TypeError('boom');
  };
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win });
  page.env.win.advance(HEALTH_MS * 5);
  assert.equal(handle.state, 'error');
  assert.equal(handle.diagnostics().failures, MAX_FAILURES);
  handle.unmount();
  assert.equal(page.env.win.pendingTimers(), 0);
  assert.equal(page.env.observers(), 0);
  assert.equal(page.env.resizeObservers(), 0);
  for (const t of ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated', 'fullscreenchange']) assert.equal(page.env.doc.listenerCount(t), 0, t);
  assert.equal(page.env.doc.adoptedStyleSheets.length, 0);
});
