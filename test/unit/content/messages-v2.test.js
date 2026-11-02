// رسائل الإصدار الثاني (P10-AC5، عقد messages §٥–§٧): رد الحالة الموسّع متوافق مع النافذة القديمة، وتشخيص الصفحة
// بالأعداد والرموز، والقفز يُقبل من صفحات الإضافة وحدها وللفيديو المعروض وحده ولا يغيّر إلا الزمن.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installMessageHandler } from '../../../src/content/messages.js';
import {
  isSeekRequest, isVideoStateReply, isVideoStateReplyV2, pageDiagnosticsRequest, seekRequest, videoStateRequest,
} from '../../../src/core/model/messages.js';
import { seekMainVideo } from '../../../src/player/youtube-dom.js';
import { createFakeChrome } from '../../helpers/chrome-storage.js';
import { videoRecord } from '../../helpers/fixtures.js';

const A = 'AAAAAAAAAAA';

function state(over = {}) {
  return {
    videoId: A, title: 't', loading: false, saved: videoRecord(), captured: [], captureIssue: null,
    view: { displayOffsetMs: 0, displayMode: 'ar' }, ...over,
  };
}

function setup({ s = state(), seek = () => true, mounted = { overlay: { state: 'mounted' }, controls: { state: 'mounted' } } } = {}) {
  const fake = createFakeChrome();
  const seeks = [];
  installMessageHandler({ controller: { getState: () => s, diagnostics: () => ({ pendingWrites: 0, version: 3 }) }, mounted, runtime: fake.chrome.runtime, seek: (ms) => { seeks.push(ms); return seek(ms); } });
  return { fake, seeks };
}

test('رد الحالة: حقول الأول كما هي (النافذة القديمة تقبله)، ومعها الخانات والالتقاط وحالة الأدوات', async () => {
  const { fake } = setup({
    s: state({
      slots: [{ n: 1, filled: true, active: false, name: null }, { n: 2, filled: true, active: true, name: 'مراجعة' }, { n: 3, filled: false, active: false, name: null }],
      captureIssue: { code: 'EX_NOT_ENGLISH', at: 1 },
    }),
    mounted: { overlay: { state: 'mounted' }, controls: { state: 'error', diagnostics: () => ({ lastCode: 'CT_MOUNT_FAILED', lastDetail: 'x' }) } },
  });
  const r = await fake.dispatchMessage(videoStateRequest());
  assert.equal(isVideoStateReply(r), true, 'النافذة القديمة تقبله');
  assert.equal(isVideoStateReplyV2(r), true);
  assert.deepEqual(r.slots.map((x) => [x.n, x.filled, x.active, x.name]), [[1, true, false, null], [2, true, true, 'مراجعة'], [3, false, false, null]]);
  assert.deepEqual(r.capture, { state: 'rejected', count: 0, code: 'EX_NOT_ENGLISH' });
  assert.deepEqual(r.tools, { overlay: 'mounted', controls: 'error', code: 'CT_MOUNT_FAILED' });
  assert.deepEqual(r.mounted, { overlay: 'mounted', controls: 'error' });
  const old = { ...r };
  delete old.slots;
  delete old.capture;
  delete old.tools;
  assert.equal(isVideoStateReply(old), true);
  assert.equal(isVideoStateReplyV2(old), false, 'رد نسخة أقدم يُعرف');
});

test('رد الحالة لحالة بلا slots (سجل الإصدار الأول): الخانة 1 من السجل', async () => {
  const { fake } = setup({ s: state({ captured: [{ key: 'en|manual', kind: 'manual', cueCount: 5, ok: true }] }) });
  const r = await fake.dispatchMessage(videoStateRequest());
  assert.deepEqual(r.slots.map((x) => x.active), [true, false, false]);
  assert.deepEqual(r.capture, { state: 'captured', count: 1, code: null });
});

test('تشخيص الصفحة: أعداد ورموز من المتحكم ونقطتي التركيب، لصفحات الإضافة وحدها', async () => {
  const { fake } = setup();
  const r = await fake.dispatchMessage(pageDiagnosticsRequest());
  assert.deepEqual(r, { v: 1, ok: true, sections: { controller: { pendingWrites: 0, version: 3 }, mounted: { overlay: { state: 'mounted' }, controls: { state: 'mounted' } } } });
  assert.equal(await fake.dispatchMessage(pageDiagnosticsRequest(), { id: fake.chrome.runtime.id, url: 'https://www.youtube.com/' }), undefined);
});

test('القفز: من صفحة الإضافة للفيديو المعروض وحده، ولا يتغير إلا الزمن؛ وما عداه يُرفض برمز ولا يُنفَّذ', async () => {
  const { fake, seeks } = setup();
  assert.deepEqual(await fake.dispatchMessage(seekRequest(A, 754200)), { v: 1, ok: true, ms: 754200 });
  assert.deepEqual(await fake.dispatchMessage(seekRequest('BBBBBBBBBBB', 1000)), { v: 1, ok: false, code: 'TJ_WRONG_VIDEO' });
  assert.deepEqual(await fake.dispatchMessage({ ...seekRequest(A, 1000), play: true }), { v: 1, ok: false, code: 'TJ_BAD_MESSAGE' });
  assert.deepEqual(await fake.dispatchMessage(seekRequest(A, -5)), { v: 1, ok: false, code: 'TJ_BAD_MESSAGE' });
  assert.deepEqual(await fake.dispatchMessage(seekRequest(A, 1.5)), { v: 1, ok: false, code: 'TJ_BAD_MESSAGE' });
  assert.equal(await fake.dispatchMessage(seekRequest(A, 1000), { id: fake.chrome.runtime.id, url: 'https://www.youtube.com/watch?v=x' }), undefined, 'لا من صفحة يوتيوب');
  assert.equal(await fake.dispatchMessage(seekRequest(A, 1000), { id: 'other', url: 'chrome-extension://other/x.html' }), undefined, 'لا من إضافة أخرى');
  assert.deepEqual(seeks, [754200]);
  const none = setup({ s: state({ videoId: null }) });
  assert.deepEqual(await none.fake.dispatchMessage(seekRequest(A, 1000)), { v: 1, ok: false, code: 'TJ_NO_VIDEO' });
  const failing = setup({ seek: () => false });
  assert.deepEqual(await failing.fake.dispatchMessage(seekRequest(A, 1000)), { v: 1, ok: false, code: 'TJ_SEEK_FAILED' });
  assert.equal(isSeekRequest(seekRequest(A, 360000001)), false, 'فوق الحد');
});

test('seekMainVideo: currentTime وحده، ولا قفز أثناء الإعلان أو بلا فيديو، والزمن بعد النهاية يُقصر', () => {
  const video = { currentTime: 0, duration: 120, paused: true, play() { throw new Error('لا تشغيل'); } };
  const player = { classList: { contains: (c) => c === 'ad-showing' && ad } };
  let ad = false;
  const doc = { querySelector: (sel) => (sel.includes('video') ? video : player) };
  assert.equal(seekMainVideo(30500, doc), true);
  assert.equal(video.currentTime, 30.5);
  assert.equal(video.paused, true, 'لا تغيير لحالة التشغيل');
  assert.equal(seekMainVideo(500000, doc), true);
  assert.equal(video.currentTime, 120);
  ad = true;
  assert.equal(seekMainVideo(1000, doc), false);
  assert.equal(seekMainVideo(1000, { querySelector: () => null }), false);
  assert.equal(seekMainVideo(-1, doc), false);
});
