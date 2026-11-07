// حدود سكربت المحتوى: الجسر من MAIN، ومحددات يوتيوب المعزولة، ورد نافذة الأيقونة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installBridge } from '../../../src/content/bridge.js';
import { installMessageHandler } from '../../../src/content/messages.js';
import {
  SELECTORS, areControlsHidden, isAdShowing, mainVideoDurationMs, videoIdFromLocation, videoTitle, watchCurrentVideo,
} from '../../../src/player/youtube-dom.js';
import { isVideoStateReply, videoStateRequest } from '../../../src/core/model/messages.js';
import { createFakeChrome } from '../../helpers/chrome-storage.js';
import { videoRecord } from '../../helpers/fixtures.js';

function fakeWindow(href = 'https://www.youtube.com/watch?v=AAAAAAAAAAA') {
  const listeners = {};
  const docListeners = {};
  const url = new URL(href);
  const win = {
    location: { origin: url.origin, pathname: url.pathname, search: url.search },
    addEventListener: (t, fn) => ((listeners[t] ??= new Set()).add(fn)),
    removeEventListener: (t, fn) => listeners[t]?.delete(fn),
    setInterval: () => 1,
    clearInterval: () => {},
    document: {
      addEventListener: (t, fn) => ((docListeners[t] ??= new Set()).add(fn)),
      removeEventListener: (t, fn) => docListeners[t]?.delete(fn),
    },
    fire: (t, ev) => listeners[t]?.forEach((fn) => fn(ev)),
    fireDoc: (t) => docListeners[t]?.forEach((fn) => fn()),
    go(next) {
      const u = new URL(next);
      win.location.pathname = u.pathname;
      win.location.search = u.search;
    },
  };
  return win;
}

test('الجسر: نافذة الصفحة نفسها وأصلها والحقل source فقط', () => {
  const win = fakeWindow();
  const got = [];
  const off = installBridge((d) => got.push(d), win);
  win.fire('message', { source: win, origin: win.location.origin, data: { source: 'tarjuman', v: 1 } });
  win.fire('message', { source: {}, origin: win.location.origin, data: { source: 'tarjuman' } });
  win.fire('message', { source: win, origin: 'https://evil.example', data: { source: 'tarjuman' } });
  win.fire('message', { source: win, origin: win.location.origin, data: { source: 'other' } });
  win.fire('message', { source: win, origin: win.location.origin, data: 'tarjuman' });
  assert.equal(got.length, 1);
  off();
  win.fire('message', { source: win, origin: win.location.origin, data: { source: 'tarjuman' } });
  assert.equal(got.length, 1);
});

test('youtube-dom: معرّف الفيديو من العنوان، وShorts خارج النطاق', () => {
  const at = (h) => {
    const u = new URL(h);
    return videoIdFromLocation({ pathname: u.pathname, search: u.search });
  };
  assert.equal(at('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'dQw4w9WgXcQ');
  assert.equal(at('https://www.youtube.com/live/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(at('https://www.youtube.com/shorts/dQw4w9WgXcQ'), null);
  assert.equal(at('https://www.youtube.com/watch?v=bad'), null);
  assert.equal(at('https://www.youtube.com/'), null);
});

test('youtube-dom: العنوان من عنوان التبويب، وأصناف المشغّل', () => {
  assert.equal(videoTitle({ title: '(3) Do schools kill creativity? | TED - YouTube' }), 'Do schools kill creativity? | TED');
  assert.equal(videoTitle({ title: 'YouTube' }), null);
  assert.equal(videoTitle({ title: '' }), null);
  const doc = (classes, video) => ({
    querySelector: (s) => (s === SELECTORS.player ? { classList: { contains: (c) => classes.includes(c) } } : s === SELECTORS.video ? video : null),
    fullscreenElement: null,
  });
  assert.equal(isAdShowing(doc(['ad-showing'])), true);
  assert.equal(isAdShowing(doc(['ad-interrupting'])), true);
  assert.equal(isAdShowing(doc([])), false);
  assert.equal(areControlsHidden(doc(['ytp-autohide'])), true);
  assert.equal(mainVideoDurationMs(doc([], { duration: 12.3456 })), 12346);
  assert.equal(mainVideoDurationMs(doc(['ad-showing'], { duration: 30 })), null, 'لا مدة أثناء الإعلان');
  assert.equal(mainVideoDurationMs(doc([], { duration: Number.NaN })), null);
});

test('youtube-dom: مراقبة الفيديو الحالي بحدث يوتيوب وpopstate', () => {
  const win = fakeWindow();
  const changes = [];
  const w = watchCurrentVideo({ win, onChange: (id, prev) => changes.push([prev, id]) });
  assert.equal(w.current(), 'AAAAAAAAAAA');
  win.go('https://www.youtube.com/watch?v=BBBBBBBBBBB');
  win.fireDoc('yt-navigate-finish');
  win.go('https://www.youtube.com/feed/subscriptions');
  win.fire('popstate');
  assert.deepEqual(changes, [['AAAAAAAAAAA', 'BBBBBBBBBBB'], ['BBBBBBBBBBB', null]]);
  w.stop();
});

test('رد نافذة الأيقونة: لصفحات الإضافة وحدها، وبلا نص مقاطع', async () => {
  const fake = createFakeChrome();
  const rec = videoRecord({ offset: 500 });
  const state = {
    videoId: rec.videoId, title: rec.title, loading: false, saved: rec,
    captured: [{ key: 'en|manual', kind: 'manual', cueCount: 5, ok: true }],
    view: rec.view,
  };
  installMessageHandler({ controller: { getState: () => state }, mounted: { overlay: { state: 'stub' }, controls: { state: 'stub' } }, runtime: fake.chrome.runtime });
  const reply = await fake.dispatchMessage(videoStateRequest());
  assert.equal(isVideoStateReply(reply), true);
  assert.equal(reply.watch, true);
  assert.deepEqual(reply.arabic, { fileName: rec.arabic.fileName, cueCount: 5, edited: false, matched: true, lang: null });
  assert.deepEqual(reply.view, { displayOffsetMs: 500, displayMode: 'ar' });
  assert.deepEqual(reply.mounted, { overlay: 'stub', controls: 'stub' });
  assert.equal(JSON.stringify(reply).includes('سطر'), false, 'لا نص مقاطع في الرد');
  assert.equal(await fake.dispatchMessage(videoStateRequest(), { id: 'other-extension', url: 'chrome-extension://other/x.html' }), undefined);
  assert.equal(await fake.dispatchMessage(videoStateRequest(), { id: fake.chrome.runtime.id, url: 'https://www.youtube.com/watch?v=x' }), undefined, 'لا من سكربت محتوى');
  assert.equal(await fake.dispatchMessage({ type: 'tj:get-video-state', v: 9 }), undefined);
  assert.equal(await fake.dispatchMessage({ type: 'tj:delete-all', v: 1 }), undefined);
});
