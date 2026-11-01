// جلسة الطبقة بالـDOM الوهمي: العرض مع التوقيت والإزاحة والوضعين، والإخفاء أثناء الإعلان، ومسح الطبقة فورًا
// عند التنقل بلا خلط بين الفيديوهات، وارتفاعها فوق الشريط، وملء الشاشة، ومتانتها أمام الأعطال، وتنظيفها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverlaySession } from '../../../../src/player/overlay/session.js';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { AR_B, AR_CUES, A, B, EN_CUES, makeState, watchPage } from './harness.js';

function start(over = {}) {
  const page = watchPage(over);
  const session = createOverlaySession({ controller: page.controller, doc: page.env.doc, win: page.env.win, player: page.player });
  const texts = () => session.peek().lines.map((l) => l.text);
  return { ...page, session, texts };
}

test('يعرض المقطع الحالي سطرًا لكل سطر داخل #movie_player، ويتبع القفز والتشغيل', () => {
  const { video, session, texts, player } = start({ state: makeState({ arabic: { cues: [{ n: 1, startMs: 1000, endMs: 3000, text: 'السطر الأول\nوالثاني' }] } }) });
  assert.equal(session.peek().connected, true);
  assert.equal(player.children.filter((c) => c.id === 'tarjuman-overlay').length, 1);
  video.seekTo(1.5);
  assert.deepEqual(texts(), ['السطر الأول', 'والثاني']);
  video.seekTo(5);
  assert.deepEqual(texts(), []);
  video.seekTo(2.5);
  assert.deepEqual(texts(), ['السطر الأول', 'والثاني']);
});

test('ترجمة يوتيوب الأصلية تُخفى ما دامت الطبقة منخرطة وتُعاد عند الإيقاف', () => {
  const { env, controller, session } = start();
  assert.equal(env.doc.adoptedStyleSheets.length, 1, 'تُخفى فور الانخراط');
  controller.set({ view: { displayOffsetMs: 0, displayMode: 'off' } });
  assert.equal(env.doc.adoptedStyleSheets.length, 0, 'وضع الإيقاف يعيدها');
  controller.set({ view: { displayOffsetMs: 0, displayMode: 'ar' } });
  assert.equal(env.doc.adoptedStyleSheets.length, 1);
  controller.set({ arabic: null });
  assert.equal(env.doc.adoptedStyleSheets.length, 0, 'بلا عربية لا نخفي الأصلية');
  assert.equal(session.diagnostics().captionsHidden, false);
});

test('الوضع المزدوج: الإنجليزي تحت العربي بالتوقيت نفسه، والرجوع للعربية وحدها فوري', () => {
  const { video, controller, session } = start({ state: makeState({ english: { cues: EN_CUES, key: 'en|manual', kind: 'manual', lang: 'en', source: 'saved' } }) });
  video.seekTo(1.5);
  assert.deepEqual(session.peek().lines.map((l) => l.kind), ['ar']);
  controller.set({ view: { displayOffsetMs: 0, displayMode: 'dual' } });
  assert.deepEqual(session.peek().lines.map((l) => [l.kind, l.text]), [['ar', 'سطر 1'], ['en', 'line 1']]);
  controller.set({ view: { displayOffsetMs: 0, displayMode: 'ar' } });
  assert.deepEqual(session.peek().lines.map((l) => l.kind), ['ar']);
});

test('الإزاحة من الحالة تغيّر وقت البحث فورًا ولا تمس currentTime', () => {
  const { video, controller, texts } = start();
  video.seekTo(1.2);
  assert.deepEqual(texts(), ['سطر 1']);
  controller.set({ view: { displayOffsetMs: 500, displayMode: 'ar' } });
  assert.deepEqual(texts(), [], 'تأخير 0.5: المقطع المحفوظ عند 1.0 يظهر عند 1.5');
  video.seekTo(1.6);
  assert.deepEqual(texts(), ['سطر 1']);
  controller.set({ view: { displayOffsetMs: -1000, displayMode: 'ar' } });
  video.seekTo(0.3);
  assert.deepEqual(texts(), ['سطر 1'], 'تقديم 1.0: يظهر قبل ثانية');
  assert.equal(video.currentTime, 0.3);
  assert.equal(video.writes, 0);
});

test('الحلقة أثناء التشغيل وحدها: لا إطارات وهو متوقف', () => {
  const { env, video, session } = start();
  assert.equal(env.win._raf.size, 0);
  video.play();
  assert.equal(env.win._raf.size, 1);
  assert.equal(session.diagnostics().engine.running, true);
  video.pause();
  assert.equal(env.win._raf.size, 0);
});

test('الإعلان يخفي الطبقة فورًا ويمسحها، وانتهاؤه يعيد المقطع الصحيح فورًا', () => {
  const { video, startAd, endAd, session, texts, env } = start();
  video.seekTo(1.5);
  assert.deepEqual(texts(), ['سطر 1']);
  startAd();
  assert.equal(session.peek().hidden, true);
  assert.deepEqual(texts(), []);
  video.seekTo(2.0); // زمن الإعلان نفسه لا يعرض شيئًا
  assert.deepEqual(texts(), []);
  video.tickTo(4.0);
  endAd();
  assert.equal(session.peek().hidden, false);
  assert.deepEqual(texts(), ['سطر 2'], 'عادت بالمقطع الصحيح لزمن الفيديو بعد الإعلان');
  assert.equal(env.doc.adoptedStyleSheets.length, 1);
});

test('الإعلان المقاطِع (ad-interrupting) يخفي مثل ad-showing', () => {
  const { video, player, session, texts } = start();
  video.seekTo(1.5);
  player.classList.add('ad-interrupting');
  assert.equal(session.peek().hidden, true);
  assert.deepEqual(texts(), []);
  player.classList.remove('ad-interrupting');
  assert.deepEqual(texts(), ['سطر 1']);
});

test('التنقل: تبدأ يوتيوب التنقل فتُمسح الطبقة فورًا قبل أن يتغير شيء آخر', () => {
  const { video, ev, session, texts } = start();
  video.seekTo(1.5);
  assert.deepEqual(texts(), ['سطر 1']);
  ev('yt-navigate-start');
  assert.deepEqual(texts(), [], 'مسحٌ فوري عند البداية');
  assert.equal(session.peek().hidden, true);
});

test('التنقل إلى فيديو آخر: لا يظهر سطر من الأول، ولا يظهر الثاني إلا بترجمته المحمّلة وحدها', () => {
  const { video, controller, ev, env, session, texts, navigateTo } = start();
  video.seekTo(1.5);
  navigateTo(B);
  // العنوان صار B لكن المتحكم لم يبدّل بعد (ما زال A): لا عرض أبدًا.
  assert.deepEqual(texts(), []);
  assert.equal(session.peek().hidden, true);
  // المتحكم يبدّل ويحمّل: loading ثم ترجمة B.
  controller.set({ videoId: B, loading: true, arabic: null });
  assert.deepEqual(texts(), []);
  controller.set({ loading: false, arabic: { cues: AR_B } });
  video.seekTo(1.5);
  assert.deepEqual(texts(), ['ترجمة الفيديو الثاني 1']);
  assert.equal(session.peek().hidden, false);
  // سجل الفيديو A لا يعود فوق B ولو أُعيد إليه في الحالة بالخطأ.
  controller.set({ videoId: A, arabic: { cues: AR_CUES } });
  assert.deepEqual(texts(), [], 'الحالة A والصفحة B: لا خلط');
  ev('yt-page-data-updated');
  void env;
});

test('الرجوع إلى فيديو لا ترجمة له: تبقى ترجمة يوتيوب الأصلية ظاهرة', () => {
  const { controller, env, navigateTo } = start();
  assert.equal(env.doc.adoptedStyleSheets.length, 1);
  navigateTo(B);
  controller.set({ videoId: B, loading: false, arabic: null });
  assert.equal(env.doc.adoptedStyleSheets.length, 0);
});

test('شريط التحكم: الطبقة السفلية ترتفع فوقه حين يظهر وتنزل حين يختفي', () => {
  const { session, player, env } = start();
  const host = player.children.find((c) => c.id === 'tarjuman-overlay');
  const px = () => host.style.getPropertyValue('--tj-offset');
  assert.equal(px(), '56px', '48 (الشريط) + 8، وهو أعلى من 8% من 360 (29)');
  player.classList.add('ytp-autohide');
  assert.equal(px(), '29px', 'الشريط اختفى: 8% من الارتفاع');
  player.classList.remove('ytp-autohide');
  assert.equal(px(), '56px');
  assert.equal(host.getAttribute('data-anchor'), 'bottom');
  void session;
  void env;
});

test('المظهر من الإعدادات: الحجم والخلفية والموضع', () => {
  const { controller, player } = start();
  const host = player.children.find((c) => c.id === 'tarjuman-overlay');
  const stage = host.shadowRoot.children.find((c) => c.className.includes('stage'));
  assert.equal(host.style.getPropertyValue('--tj-fs'), '17px', '4.6% من 360');
  controller.set({ settings: { ...DEFAULT_SETTINGS, appearance: { size: 'xl', background: 'solid', position: 'top' } } });
  assert.equal(stage.getAttribute('data-bg'), 'solid');
  assert.equal(host.getAttribute('data-anchor'), 'top');
  assert.equal(host.style.getPropertyValue('--tj-fs'), '24px');
  assert.equal(host.style.getPropertyValue('--tj-offset'), '29px');
});

test('تغيّر حجم المشغّل (مسرح، ملء الشاشة) يعيد حجم الخط', () => {
  const { env, player, chrome } = start();
  const host = player.children.find((c) => c.id === 'tarjuman-overlay');
  player.rect = { top: 0, left: 0, width: 1920, height: 1080, bottom: 1080, right: 1920 };
  chrome.rect = { top: 1014, left: 0, width: 1920, height: 66, bottom: 1080, right: 1920 };
  env.win.resize(player);
  assert.equal(host.style.getPropertyValue('--tj-fs'), '50px');
  assert.equal(host.style.getPropertyValue('--tj-offset'), '86px', '8% من 1080 أعلى من الشريط (66) + 8');
});

test('ملء الشاشة بعنصر غريب: ينتقل المضيف إليه ثم يعود إلى المشغّل بعد الخروج', () => {
  const { env, player, session } = start();
  const other = env.doc.createElement('div');
  env.doc.body.appendChild(other);
  env.doc.fullscreenElement = other;
  env.doc.dispatchEvent({ type: 'fullscreenchange' });
  const host = other.children.find((c) => c.id === 'tarjuman-overlay');
  assert.ok(host, 'المضيف داخل عنصر ملء الشاشة');
  assert.equal(player.children.some((c) => c.id === 'tarjuman-overlay'), false);
  env.doc.fullscreenElement = null;
  env.doc.dispatchEvent({ type: 'fullscreenchange' });
  assert.ok(player.children.some((c) => c.id === 'tarjuman-overlay'), 'عاد');
  assert.equal(session.diagnostics().hostMoves, 2);
});

test('ملء الشاشة بعنصر المشغّل أو أبيه: المضيف يبقى مكانه', () => {
  const { env, player, session } = start();
  env.doc.fullscreenElement = player;
  env.doc.dispatchEvent({ type: 'fullscreenchange' });
  assert.ok(player.children.some((c) => c.id === 'tarjuman-overlay'));
  assert.equal(session.diagnostics().hostMoves, 0);
});

test('عنصر ملء الشاشة الذي لا يستضيف أبناءً يُسجَّل PL_FULLSCREEN_HOST مرة واحدة بلا رمي', () => {
  const { env, video, session } = start();
  env.doc.fullscreenElement = video;
  env.doc.dispatchEvent({ type: 'fullscreenchange' });
  env.doc.dispatchEvent({ type: 'fullscreenchange' });
  assert.equal(session.diagnostics().lastCode, 'PL_FULLSCREEN_HOST');
  assert.equal(session.diagnostics().fullscreenUnreachable, 1);
});

test('استبدال عنصر الفيديو يُعاد ربط المحرّك به عند الفحص الدوري', () => {
  const { env, player, video, session, texts } = start();
  video.seekTo(1.5);
  const next = env.doc.createElement('video');
  next.className = 'html5-main-video';
  next.writes = 0;
  next.currentTime = 4.0;
  next.paused = true;
  player.appendChild(next);
  player.removeChild(video);
  session.check();
  assert.deepEqual(texts(), ['سطر 2'], 'من الفيديو الجديد');
  assert.equal(video.listenerCount('seeked'), 0, 'فُكّ ربط القديم');
});

test('عطل في العرض لا يصل إلى المتحكم ولا المشغّل، ويُسجَّل رمزًا', () => {
  const { video, controller, session } = start();
  controller.getState = () => {
    throw new Error('boom');
  };
  assert.doesNotThrow(() => controller.set({ view: { displayOffsetMs: 0, displayMode: 'ar' } }));
  assert.equal(session.diagnostics().lastCode, 'PL_RENDER_FAILED');
  assert.ok(session.diagnostics().renderFailures >= 1);
  assert.doesNotThrow(() => video.seekTo(2));
});

test('التشخيص أعداد ورموز فقط: لا نص مقاطع ولا روابط', () => {
  const { video, session } = start();
  video.seekTo(1.5);
  const s = JSON.stringify(session.diagnostics());
  assert.doesNotMatch(s, /سطر|https?:|youtube/);
  assert.match(s, /renders/);
});

test('التدمير: يلغي الاشتراك ويزيل المضيف والورقة ولا يترك مراقبًا ولا مؤقتًا', () => {
  const { env, controller, player, video, session } = start();
  video.play();
  session.destroy();
  session.destroy(); // آمن مكررًا
  assert.equal(controller.subscribers(), 0);
  assert.equal(player.children.some((c) => c.id === 'tarjuman-overlay'), false);
  assert.equal(env.doc.adoptedStyleSheets.length, 0);
  assert.equal(env.observers(), 0);
  assert.equal(env.resizeObservers(), 0);
  assert.equal(env.win.pendingTimers(), 0);
  assert.equal(env.win._raf.size, 0);
  for (const t of ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated']) assert.equal(env.doc.listenerCount(t), 0, t);
  assert.equal(env.doc.listenerCount('fullscreenchange'), 0);
  assert.equal(video.listenerCount('seeked'), 0);
  void A;
});
