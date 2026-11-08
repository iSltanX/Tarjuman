// تدقيق V2، WG-4: U-031 وU-032. قائمة المسارات (tracklist) من سكربت عالم الصفحة عبر تنقل SPA، بوثيقة ومشغّل وهميين
// (c8-capture.test.js يحمّله بلا document فيعطّل القائمة). السكربت المصدر في node:vm، واستيراداته تُحقن من الوحدات الحقيقية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { videoIdFromLocation } from '../../../src/core/model/video-location.js';
import { readTimedtextParams } from '../../../src/extract/timedtext-params.js';

const CAPTURE_URL = new URL('../../../src/main-world/capture.js', import.meta.url);
const SOURCE = readFileSync(CAPTURE_URL, 'utf8').replace(/^import \{[^}]*\} from '[^']+';\s*$/gm, '');
const ORIGIN = 'https://www.youtube.com';
const A = 'AAAAAAAAAAA';
const B = 'BBBBBBBBBBB';

const response = (id) => ({
  videoDetails: { videoId: id },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'es', name: { simpleText: 'es' } }], translationLanguages: [{ languageCode: 'ar' }] } },
});

/** صفحة يوتيوب مصطنعة: المشغّل يبقى بآخر فيديو حُمّل ويحمّل فيديو صفحة المشاهدة أو البث. */
function page(startPath) {
  const listeners = new Map();
  const loc = { origin: ORIGIN, href: '' };
  const setUrl = (p) => { loc.href = new URL(p, ORIGIN).href; };
  setUrl(startPath);
  const player = { loaded: null, getPlayerResponse() { return this.loaded ? response(this.loaded) : null; } };
  const doc = {
    readyState: 'complete',
    getElementById: (id) => (id === 'movie_player' ? player : null),
    addEventListener: (t, f) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(f); },
    fire(t) { for (const f of listeners.get(t) ?? []) f({ type: t }); },
  };
  const posted = [];
  const win = {
    location: loc, document: doc,
    postMessage: (msg) => posted.push(JSON.parse(JSON.stringify(msg))),
    fetch: () => Promise.resolve(new Response('{}', { status: 200 })),
    XMLHttpRequest: class { open() {} send() {} addEventListener() {} },
  };
  const timers = [];
  const ctx = vm.createContext({
    window: win, document: doc, URL, URLSearchParams, Response, TextDecoder, WeakMap, JSON, String, Promise, Blob, queueMicrotask,
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {}, readTimedtextParams, videoIdFromLocation,
  });
  const idNow = () => videoIdFromLocation(new URL(loc.href));
  if (idNow()) player.loaded = idNow();
  vm.runInContext(SOURCE, ctx, { filename: 'capture.js' });
  const run = () => { while (timers.length) timers.shift()(); };
  run();
  return {
    posted,
    nav(p) {
      setUrl(p);
      if (idNow()) player.loaded = idNow();
      for (const t of ['yt-navigate-finish', 'yt-page-data-updated', 'yt-player-updated']) doc.fire(t);
      run();
    },
    lists: () => posted.filter((m) => m.kind === 'tracklist').map((m) => m.videoId),
  };
}

test('AV2 U-031: /watch?v=A ثم الصفحة الرئيسية ثم /watch?v=A يرسل القائمة مرتين', () => {
  const p = page(`/watch?v=${A}`);
  assert.deepEqual(p.lists(), [A]);
  p.nav('/');
  p.nav(`/watch?v=${A}`);
  assert.deepEqual(p.lists(), [A, A], 'العودة إلى الفيديو نفسه بعد صفحة بلا فيديو');
});

test('AV2 U-031: ضابط A ثم B ثم A كما هو، والتنقل داخل الفيديو نفسه لا يكرر القائمة', () => {
  const p = page(`/watch?v=${A}`);
  p.nav(`/watch?v=${B}`);
  p.nav(`/watch?v=${A}`);
  assert.deepEqual(p.lists(), [A, B, A]);
  p.nav(`/watch?v=${A}&t=30`);
  assert.deepEqual(p.lists(), [A, B, A], 'المفتاح نفسه لا يعاد');
});

test('AV2 U-032: /live/<id> يرسل قائمة المسارات كصفحة المشاهدة، والعودة إليه كذلك', () => {
  const p = page(`/live/${A}`);
  assert.deepEqual(p.lists(), [A]);
  p.nav('/feed/subscriptions');
  p.nav(`/live/${A}`);
  assert.deepEqual(p.lists(), [A, A]);
});

test('AV2 U-032: Shorts وما ليس فيديو لا قائمة له، ومعرّف غير صالح مرفوض', () => {
  const p = page(`/shorts/${A}`);
  p.nav('/watch?v=short');
  p.nav(`/live/${A}x`);
  assert.deepEqual(p.lists(), []);
});

test('AV2 U-032: منطق المعرّف واحد في العالمين: capture.js ويوتيوب-دوم يستوردان الوحدة نفسها', () => {
  const raw = readFileSync(CAPTURE_URL, 'utf8');
  assert.match(raw, /import \{ videoIdFromLocation \} from '\.\.\/core\/model\/video-location\.js';/);
  const dom = readFileSync(new URL('../../../src/player/youtube-dom.js', import.meta.url), 'utf8');
  assert.match(dom, /video-location\.js/);
  assert.doesNotMatch(dom, /export function videoIdFromLocation/);
});
