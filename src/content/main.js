// نقطة دخول سكربت المحتوى (ISOLATED) في إثبات P1: جسر الالتقاط، وقرار القبول، وذاكرة الجلسة،
// والرد على صفحة الفحص. لا عناصر على صفحة يوتيوب، ولا تخزين دائم، ولا طلبات شبكة.
import { installBridge } from './bridge.js';
import { createCaptureStore } from '../extract/capture-store.js';
import { checkAcceptance, convertCapture } from '../extract/capture-adapter.js';
import { watchCurrentVideo, mainVideoDurationMs, isLiveNow, displayedCaption } from '../extract/youtube-page.js';
import { messageFor } from '../extract/codes.js';
import { createPendingBuffer } from '../extract/pending.js';

const MAX_LOG = 500;
const SHOWN_PROBES_MS = [2500, 6000];

const store = createCaptureStore();
const pending = createPendingBuffer();
const durations = new Map();
// سجل الجلسة للإثبات: معرّفات ورموز وأطوال فقط، ولا جسم ولا رابط. يُفقد بإغلاق التبويب.
const sessionLog = [];
function logEvent(e) {
  sessionLog.push({ at: Date.now(), ...e });
  if (sessionLog.length > MAX_LOG) sessionLog.shift();
}

const tracker = watchCurrentVideo({
  onChange: (id, prev) => {
    store.setCurrentVideo(id);
    logEvent({ type: 'nav', from: prev, to: id });
    // التقاط سبق تغيّر العنوان لهذا الفيديو بأقل من نافذة الانتظار: يُعاد تقييمه بكل القواعد.
    for (const { msg, ageMs } of pending.take(id, Date.now())) handleCapture(msg, { pendingAgeMs: ageMs });
  },
});
store.setCurrentVideo(tracker.current());
logEvent({ type: 'start', to: tracker.current() });

function rememberDuration(videoId) {
  const d = mainVideoDurationMs();
  if (videoId && d) durations.set(videoId, d);
  return videoId ? durations.get(videoId) ?? null : null;
}

/** بعد القبول: ما تعرضه يوتيوب على الشاشة في لحظتين، للمطابقة مع SRT لاحقًا. */
function probeShown(videoId) {
  for (const ms of SHOWN_PROBES_MS) {
    setTimeout(() => {
      if (tracker.current() !== videoId) return;
      const s = displayedCaption();
      logEvent({ type: 'shown', videoId, timeSec: s.timeSec, ad: s.ad, text: s.text.slice(0, 200) });
    }, ms);
  }
}

/**
 * @param {import('../extract/message.js').CaptureMessage} msg
 * @param {{ pendingAgeMs?: number }} [opts] من انتظار ما قبل التنقل
 */
function handleCapture(msg, { pendingAgeMs } = {}) {
  const current = tracker.current();
  store.setCurrentVideo(current);
  const decision = checkAcceptance(msg, { currentVideoId: current, isLive: isLiveNow() });
  const base = {
    videoId: msg.videoId, currentVideoId: current, lang: msg.lang, trackKind: msg.trackKind, hasTlang: msg.hasTlang,
    format: msg.format, status: msg.status, bodyLength: msg.bodyLength, transport: msg.transport, hasPot: msg.hasPot,
    ...(pendingAgeMs !== undefined ? { pendingAgeMs } : {}),
  };
  if (!decision.accepted) {
    store.reject({ code: decision.code, detail: decision.detail, ...base });
    logEvent({ type: 'reject', code: decision.code, ...base });
    if (decision.code === 'EX_WRONG_VIDEO' && pendingAgeMs === undefined) pending.add(msg, Date.now());
    return;
  }
  rememberDuration(current);
  store.accept({
    videoId: msg.videoId, lang: msg.lang, trackKind: msg.trackKind, format: msg.format, transport: msg.transport,
    bodyLength: msg.bodyLength, body: msg.body, acceptedFor: current,
    meta: { hasPot: msg.hasPot, capsAsr: msg.capsAsr, kindParam: msg.kindParam },
  });
  logEvent({ type: 'accept', ...base });
  probeShown(current);
}

installBridge((msg) => handleCapture(msg));

/**
 * لقطة الحالة لصفحة الفحص والحزام. الجسم الخام لا يُعاد إلا بطلب صريح (حفظ العينات).
 * @param {{ includeBody?: boolean }} [opts]
 */
function snapshot({ includeBody = false } = {}) {
  const current = tracker.current();
  store.setCurrentVideo(current);
  const durationMs = rememberDuration(current);
  return {
    currentVideoId: current,
    durationMs,
    navigations: store.navigations,
    webdriver: navigator.webdriver === true,
    accepted: store.accepted().map((c) => {
      const conv = convertCapture(c, durationMs);
      return {
        id: c.id, at: c.at, videoId: c.videoId, lang: c.lang, trackKind: c.trackKind, format: c.format,
        transport: c.transport, bodyLength: c.bodyLength, acceptedFor: c.acceptedFor, meta: c.meta,
        ok: conv.ok, code: conv.code, message: conv.code ? messageFor(conv.code) : null,
        invariants: conv.invariants ? conv.invariants.results : null,
        warnings: conv.warnings.map((w) => ({ code: w, message: messageFor(w) })),
        report: conv.report,
        srt: conv.srt,
        ...(includeBody ? { body: c.body } : {}),
      };
    }),
    rejected: store.rejected().map((r) => ({ ...r, message: messageFor(r.code) })),
    log: sessionLog.slice(),
  };
}

const extensionPrefix = chrome.runtime.getURL('');
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || typeof sender.url !== 'string' || !sender.url.startsWith(extensionPrefix)) return;
  if (req && req.type === 'tj:poc-snapshot') sendResponse(snapshot({ includeBody: req.includeBody === true }));
});

// خطاف اختبار للحزام في العالم المعزول فقط (لا تراه الصفحة). يخص الإثبات ويُزال في P2.
globalThis.__tarjumanPoc = { snapshot };
