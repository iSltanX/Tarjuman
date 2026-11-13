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

test('الفكرة ٤ (الإنذار المبكر): رد الحالة يحمل اسم الصيغة المرفوضة لرسالتها، ولا format لغير رفض الصيغة', async () => {
  const named = setup({ s: state({ captureIssue: { code: 'EX_UNSUPPORTED_FORMAT', reason: 'fmt-vtt', format: 'vtt', at: 1 } }) });
  assert.deepEqual((await named.fake.dispatchMessage(videoStateRequest())).capture, { state: 'rejected', count: 0, code: 'EX_UNSUPPORTED_FORMAT', format: 'vtt' });
  const doc = setup({ s: state({ captureIssue: { code: 'EX_UNSUPPORTED_FORMAT', reason: 'xhr-document', format: null, at: 1 } }) });
  assert.deepEqual((await doc.fake.dispatchMessage(videoStateRequest())).capture, { state: 'rejected', count: 0, code: 'EX_UNSUPPORTED_FORMAT' });
  // ومع مسار ملتقط صالح لا رفض ولا صيغة.
  const ok = setup({ s: state({ captured: [{ key: 'en|manual', kind: 'manual', cueCount: 5, ok: true }], captureIssue: { code: 'EX_UNSUPPORTED_FORMAT', format: 'vtt', at: 1 } }) });
  assert.deepEqual((await ok.fake.dispatchMessage(videoStateRequest())).capture, { state: 'captured', count: 1, code: null });
});

test('رد الحالة لحالة بلا slots (سجل الإصدار الأول): الخانة 1 من السجل', async () => {
  const { fake } = setup({ s: state({ captured: [{ key: 'en|manual', kind: 'manual', cueCount: 5, ok: true }] }) });
  const r = await fake.dispatchMessage(videoStateRequest());
  assert.deepEqual(r.slots.map((x) => x.active), [true, false, false]);
  assert.deepEqual(r.capture, { state: 'captured', count: 1, code: null });
});

test('رد الحالة (AA3): مسار «من» وآخر تنزيل بأجزائه والمسارات المتاحة ولغة الترجمة، بلا رابط ولا نص', async () => {
  const rec = videoRecord();
  const fp = (id, trackKey, createdAt, parts = null) => ({ ...rec.fingerprints[0], id, trackKey, createdAt, parts });
  const saved = {
    ...rec,
    english: [...rec.english, { ...rec.english[0], key: 'ja|asr', lang: 'ja', kind: 'asr' }],
    fingerprints: [fp('fp_aaaaaa1', 'en|manual', '2026-11-01T10:00:00.000Z'), fp('fp_aaaaaa2', 'ja|asr', '2026-11-02T10:00:00.000Z', [{ index: 1, from: 1, to: 3 }, { index: 2, from: 4, to: 5 }])],
    arabic: { ...rec.arabic, lang: 'ar' },
  };
  const { fake } = setup({
    s: state({
      saved, english: { key: 'en|manual', kind: 'manual', lang: 'en', via: null, cues: [], source: 'saved' },
      available: { videoId: A, tracks: [{ lang: 'ja', kind: 'asr', name: '日本語 (自動生成)' }, { lang: 'en', kind: 'manual', name: null }], translatable: true },
    }),
  });
  const r = await fake.dispatchMessage(videoStateRequest());
  assert.equal(isVideoStateReplyV2(r), true);
  assert.deepEqual(r.source, { key: 'ja|asr', lang: 'ja', kind: 'asr', via: null, from: 'export' }, 'آخر ما نُزّل');
  assert.deepEqual(r.lastExport, { key: 'ja|asr', lang: 'ja', via: null, parts: [{ index: 1, from: 1, to: 3 }, { index: 2, from: 4, to: 5 }] });
  assert.deepEqual(r.available, [{ lang: 'ja', kind: 'asr', name: '日本語 (自動生成)' }, { lang: 'en', kind: 'manual', name: null }]);
  assert.equal(r.arabic.lang, 'ar');
  // بلا تنزيل: مسار المتحكم المختار.
  const plain = setup({ s: state({ saved: { ...rec, fingerprints: [] }, english: { key: 'fr|manual|en', kind: 'manual', lang: 'fr', via: 'en', cues: [], source: 'captured' } }) });
  const p = await plain.fake.dispatchMessage(videoStateRequest());
  assert.deepEqual(p.source, { key: 'fr|manual|en', lang: 'fr', kind: 'manual', via: 'en', from: 'captured' });
  assert.equal(p.lastExport, null);
  assert.equal(p.available, null);
  assert.equal(p.arabic.lang, null, 'غير محددة');
  const none = setup({ s: state({ videoId: null, saved: null }) });
  const n = await none.fake.dispatchMessage(videoStateRequest());
  assert.equal(n.source, null);
});

test('تشخيص الصفحة: أعداد ورموز من المتحكم ونقطتي التركيب، لصفحات الإضافة وحدها', async () => {
  const { fake } = setup();
  const r = await fake.dispatchMessage(pageDiagnosticsRequest());
  // ف10: قسما dom وpanel؛ وفي بيئة الاختبار بلا مستند ولا لوحة يكونان null (والخريطة في f10-player-timeout.test.js).
  assert.deepEqual(r, { v: 1, ok: true, sections: { controller: { pendingWrites: 0, version: 3 }, mounted: { overlay: { state: 'mounted' }, controls: { state: 'mounted' } }, dom: null, panel: null } });
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
