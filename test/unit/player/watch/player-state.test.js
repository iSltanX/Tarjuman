// مراقبة حالة المشغّل: الإعلان (الفئتان، وعند الشك إعلان)، وظهور الشريط وارتفاعه، وملء الشاشة، والحجم،
// ومراقبة class وحدها (لا شجرة المشغّل)، والمؤقت الاحتياطي، وفك كل شيء عند الإيقاف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchPlayerState, STATE_POLL_MS } from '../../../../src/player/watch/player-state.js';
import { addPlayer, createFakeEnv } from '../overlay/fake-dom.js';

function setup(opts) {
  const env = createFakeEnv();
  const parts = addPlayer(env, opts);
  const got = [];
  const w = watchPlayerState({ doc: env.doc, win: env.win, player: parts.player, onChange: (s) => got.push(s) });
  return { env, ...parts, w, got };
}

test('اللقطة الأولى: الحجم وارتفاع الشريط (من أسفل المشغّل إلى أعلى الشريط) بلا إعلان', () => {
  const { w } = setup({ width: 640, height: 360 });
  assert.deepEqual(w.snapshot(), { ad: false, controlsHidden: false, fullscreen: false, width: 640, height: 360, lift: 48 });
});

test('الإعلان: ad-showing أو ad-interrupting يخفي، وانتهاؤه يعيد، فورًا بالمراقبة', () => {
  const { player, got, w } = setup();
  player.classList.add('ad-showing');
  assert.equal(got.at(-1).ad, true);
  player.classList.remove('ad-showing');
  assert.equal(got.at(-1).ad, false);
  player.classList.add('ad-interrupting');
  assert.equal(w.snapshot().ad, true, 'المقاطِع إعلان أيضًا');
  player.classList.remove('ad-interrupting');
  assert.equal(w.snapshot().ad, false);
  assert.equal(got.length, 4);
});

test('الشريط: ytp-autohide يُنزل الارتفاع إلى صفر وظهوره يعيده', () => {
  const { player, got } = setup();
  player.classList.add('ytp-autohide');
  assert.deepEqual([got.at(-1).controlsHidden, got.at(-1).lift], [true, 0]);
  player.classList.remove('ytp-autohide');
  assert.deepEqual([got.at(-1).controlsHidden, got.at(-1).lift], [false, 48]);
});

test('الشريط غير المرسوم (ارتفاعه صفر) لا يرفع الترجمة', () => {
  const { chrome, player, got } = setup();
  chrome.rect = { ...chrome.rect, height: 0 };
  player.classList.add('x');
  player.classList.remove('x');
  assert.equal(got.at(-1)?.lift ?? 0, 0);
});

test('تغيّر الحجم (ResizeObserver) يحدّث الأبعاد والارتفاع', () => {
  const { env, player, chrome, got } = setup({ width: 640, height: 360 });
  player.rect = { top: 0, left: 0, width: 1280, height: 720, bottom: 720, right: 1280 };
  chrome.rect = { top: 654, left: 0, width: 1280, height: 66, bottom: 720, right: 1280 };
  env.win.resize(player);
  assert.deepEqual([got.at(-1).width, got.at(-1).height, got.at(-1).lift], [1280, 720, 66]);
});

test('ملء الشاشة: فئة ytp-fullscreen أو document.fullscreenElement عند fullscreenchange', () => {
  const { env, player, got } = setup();
  player.classList.add('ytp-fullscreen');
  assert.equal(got.at(-1).fullscreen, true);
  player.classList.remove('ytp-fullscreen');
  assert.equal(got.at(-1).fullscreen, false);
  env.doc.fullscreenElement = player;
  env.doc.dispatchEvent({ type: 'fullscreenchange' });
  assert.equal(got.at(-1).fullscreen, true);
  env.doc.fullscreenElement = null;
  env.doc.dispatchEvent({ type: 'fullscreenchange' });
  assert.equal(got.at(-1).fullscreen, false);
});

test('لا بلاغ إلا عند تغيّر فعلي', () => {
  const { player, got } = setup();
  player.classList.add('unrelated');
  player.classList.remove('unrelated');
  assert.equal(got.length, 0);
});

test('المراقبة على class المشغّل وحده لا على شجرته (يوتيوب يحدّثها كل ثانية)', () => {
  const env = createFakeEnv();
  const { player } = addPlayer(env);
  const seen = [];
  const Base = env.win.MutationObserver;
  env.win.MutationObserver = class extends Base {
    observe(target, opts) {
      seen.push({ target, opts });
      super.observe(target, opts);
    }
  };
  watchPlayerState({ doc: env.doc, win: env.win, player, onChange() {} });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].target, player);
  assert.deepEqual(seen[0].opts, { attributes: true, attributeFilter: ['class'] }, 'لا subtree ولا childList ولا characterData');
  assert.equal(env.resizeObservers(), 1);
});

test('المؤقت الاحتياطي يلتقط تغيّرًا فاته المراقب', () => {
  const { env, player, got } = setup();
  player._classes.add('ad-showing'); // بلا إشعار المراقب
  assert.equal(got.length, 0);
  env.win.advance(STATE_POLL_MS);
  assert.equal(got.at(-1).ad, true);
});

test('الإيقاف يفك المراقبين والمستمع والمؤقت', () => {
  const { env, w, player, got } = setup();
  w.stop();
  assert.equal(env.observers(), 0);
  assert.equal(env.resizeObservers(), 0);
  assert.equal(env.doc.listenerCount('fullscreenchange'), 0);
  assert.equal(env.win.pendingTimers(), 0);
  player.classList.add('ad-showing');
  assert.equal(got.length, 0);
});
