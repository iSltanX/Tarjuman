// ن-٦ (التحقق المستقل للجولة الثانية، وقرار سلطان 2026-11-13: «حكم البث يخص الفيديو الملتقط نفسه. لا يُرفض التقاط فيديو عادي بشارة
// بث بقيت من الفيديو الذي قبله»): بعد التنقل من بث إلى فيديو عادي بقيت شارة البث ظاهرة حتى 787 م.ث (Brave)، والتقاط الجديد الذي سبق
// تبدّل العنوان يُقيَّم في setVideo بقراءة isLive() تلك اللحظة، فكان يُرفض EX_LIVE ويبقى الرفض ويضيع الالتقاط. صار: لا حكم بشارة
// بعد التبدّل بأقل من LIVE_SETTLE_MS؛ يُمسك الالتقاط ويُقبل متى زالت، ولا يُرفض إلا إن بقيت حتى تنقضي المدة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as extract$ from '../../../src/extract/index.js';
import { captureMsg, sample } from './helpers.js';

const { createExtractor } = extract$;
// قبل الإصلاح لا ثابت للمدة: الافتراضي هنا يُبقي الاختبارات تفشل بسلوكها لا باستيرادها.
const SETTLE = extract$.LIVE_SETTLE_MS ?? 3000;
const manual = sample('manual');
const LIVE = 'LLLLLLLLLLL';
const B = manual.fixture.videoId;
const C = 'CCCCCCCCCCC';

/** مستخرج بفيديو معروض وشارة بث وساعة ومؤقتات وهمية تتقدم معًا. */
function setup() {
  const state = { id: LIVE, live: true, t: 1000 };
  const queue = new Map();
  let seq = 0;
  const timers = {
    setTimeout: (fn, ms) => {
      queue.set(++seq, { fn, at: state.t + ms });
      return seq;
    },
    clearTimeout: (id) => queue.delete(id),
  };
  const advance = (ms) => {
    const end = state.t + ms;
    for (;;) {
      const next = [...queue.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      queue.delete(next[0]);
      state.t = next[1].at;
      next[1].fn();
    }
    state.t = end;
  };
  const extractor = createExtractor({
    currentVideoId: () => state.id, durationMs: () => manual.fixture.durationMs, isLive: () => state.live, now: () => state.t, ...timers,
  });
  let events = 0;
  extractor.subscribe(() => events++);
  // المستخدم على البث منذ مدة.
  extractor.setVideo(LIVE);
  advance(60000);
  return { extractor, state, advance, timers: () => queue.size, events: () => events };
}
const rejectedLive = (extractor) => extractor.diagnostics().rejected.EX_LIVE ?? 0;

test('ن-٦: من بث إلى فيديو عادي، والتقاطه وصل قبل تبدّل العنوان والشارة باقية: يُقبل حين تزول، ولا رفض EX_LIVE', () => {
  const { extractor, state, advance, timers } = setup();
  assert.equal(extractor.handleMessage(captureMsg({ videoId: B, body: manual.body })).code, 'EX_WRONG_VIDEO', 'ينتظر تبدّل العنوان');
  advance(300);
  state.id = B;
  extractor.setVideo(B);
  assert.equal(extractor.tracks().length, 0, 'لم يُقبل والشارة ظاهرة');
  assert.equal(extractor.lastRejection(), null, 'ولا رفض «بث جارٍ» يظهر للمستخدم بشارة لا تخصه');
  assert.equal(rejectedLive(extractor), 0);
  advance(250);
  assert.equal(extractor.tracks().length, 0, 'الشارة باقية بعد 250 م.ث');
  state.live = false; // زالت شارة البث السابق (حتى 787 م.ث حيًا)
  advance(600);
  assert.deepEqual(extractor.tracks().map((t) => t.key), ['en|manual'], 'قُبل التقاط الفيديو العادي');
  assert.equal(extractor.lastRejection(), null);
  assert.equal(rejectedLive(extractor), 0);
  assert.equal(timers(), 0, 'لا مؤقت باقٍ');
});

test('ن-٦: التقاط يصل بعد تبدّل العنوان والشارة باقية: يُمسك ثم يُقبل، ويُبلَّغ المشتركون بقبوله', () => {
  const { extractor, state, advance, events } = setup();
  state.id = B;
  extractor.setVideo(B);
  advance(100);
  const before = events();
  assert.deepEqual(extractor.handleMessage(captureMsg({ videoId: B, body: manual.body })), { accepted: false, code: 'EX_LIVE' });
  assert.equal(extractor.lastRejection(), null);
  state.live = false;
  advance(250);
  assert.equal(extractor.tracks().length, 1);
  assert.ok(events() > before, 'أُبلغ المشتركون');
});

test('ن-٦: بث حقيقي: تبقى الشارة حتى تنقضي المدة فيُرفض EX_LIVE كما كان، وبعدها يُرفض فورًا', () => {
  const { extractor, state, advance, timers } = setup();
  state.id = B; // B بث هو أيضًا
  extractor.setVideo(B);
  extractor.handleMessage(captureMsg({ videoId: B, body: manual.body }));
  advance(SETTLE - 300);
  assert.equal(extractor.lastRejection(), null, 'قبل انقضاء المدة لا حكم');
  advance(600);
  assert.equal(extractor.lastRejection()?.code, 'EX_LIVE', 'انقضت المدة والشارة ظاهرة: شارته هو');
  assert.equal(rejectedLive(extractor), 1);
  assert.equal(extractor.tracks().length, 0);
  assert.equal(timers(), 0);
  extractor.handleMessage(captureMsg({ videoId: B, body: manual.body }));
  assert.equal(rejectedLive(extractor), 2, 'بعد المدة يُحكم بالشارة فورًا');
  assert.equal(timers(), 0, 'بلا إمساك');
});

test('ن-٦: تبدّل الفيديو أثناء الإمساك يسقط الممسوك، فلا يُقبل التقاط فيديو لم يعد معروضًا', () => {
  const { extractor, state, advance, timers } = setup();
  state.id = B;
  extractor.setVideo(B);
  extractor.handleMessage(captureMsg({ videoId: B, body: manual.body }));
  state.id = C;
  extractor.setVideo(C);
  assert.equal(timers(), 0, 'أُلغي المؤقت');
  state.live = false;
  advance(SETTLE);
  assert.equal(extractor.tracks().length, 0);
  assert.equal(extractor.lastRejection(), null);
  state.id = B;
  extractor.setVideo(B);
  assert.equal(extractor.tracks().length, 0, 'ولا يعود بالعودة إلى B');
});
