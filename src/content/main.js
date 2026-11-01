// نقطة دخول سكربت المحتوى (ISOLATED) في إثبات P1: جسر الالتقاط، وقرار القبول، وذاكرة الجلسة،
// والرد على صفحة الفحص. لا عناصر على صفحة يوتيوب، ولا تخزين دائم، ولا طلبات شبكة.
import { installBridge } from './bridge.js';
import { createCaptureStore } from '../extract/capture-store.js';
import { checkAcceptance, convertCapture } from '../extract/capture-adapter.js';
import { watchCurrentVideo, mainVideoDurationMs, isLiveNow } from '../extract/youtube-page.js';
import { messageFor } from '../extract/codes.js';

const store = createCaptureStore();
const durations = new Map();
const tracker = watchCurrentVideo({ onChange: (id) => store.setCurrentVideo(id) });
store.setCurrentVideo(tracker.current());

function rememberDuration(videoId) {
  const d = mainVideoDurationMs();
  if (videoId && d) durations.set(videoId, d);
  return videoId ? durations.get(videoId) ?? null : null;
}

installBridge((msg) => {
  const current = tracker.current();
  store.setCurrentVideo(current);
  const decision = checkAcceptance(msg, { currentVideoId: current, isLive: isLiveNow() });
  if (!decision.accepted) {
    store.reject({
      code: decision.code, detail: decision.detail, videoId: msg.videoId, lang: msg.lang, trackKind: msg.trackKind,
      hasTlang: msg.hasTlang, format: msg.format, bodyLength: msg.bodyLength, status: msg.status, currentVideoId: current,
    });
    return;
  }
  rememberDuration(current);
  store.accept({
    videoId: msg.videoId, lang: msg.lang, trackKind: msg.trackKind, format: msg.format, transport: msg.transport,
    bodyLength: msg.bodyLength, body: msg.body, acceptedFor: current,
    meta: { hasPot: msg.hasPot, capsAsr: msg.capsAsr, kindParam: msg.kindParam },
  });
});

/**
 * لقطة الحالة لصفحة الفحص والحزام. الجسم الخام لا يُعاد إلا بطلب صريح من الحزام لحفظ العينات.
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
  };
}

const extensionPrefix = chrome.runtime.getURL('');
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || typeof sender.url !== 'string' || !sender.url.startsWith(extensionPrefix)) return;
  if (req && req.type === 'tj:poc-snapshot') sendResponse(snapshot());
});

// خطاف اختبار للحزام في العالم المعزول فقط (لا تراه الصفحة). يخص الإثبات ويُزال في P2.
globalThis.__tarjumanPoc = { snapshot };
