// الرد على صفحات الإضافة (عقد messages §٢ و§٥–§٧): حالة الفيديو الحالي (موسّعة بالخانات والالتقاط وحالة الأدوات)،
// وتشخيص الصفحة (أعداد ورموز)، والقفز إلى زمن في الفيديو المعروض وحده. لا يُقبل شيء إلا من صفحة في الإضافة نفسها،
// والقفز لا يغيّر إلا الزمن. ما عدا ذلك تغيّره الصفحات في التخزين، والمتحكم يسمع تغيّره.
import {
  MESSAGE_VERSION, buildVideoStateReply, isExtensionPage, isPageDiagnosticsRequest, isPasteImportRequest, isSeekRequest, isVideoIdRequest, isVideoStateRequest, MSG,
} from '../core/model/messages.js';
import { PANEL_SELECTORS, SELECTORS, seekMainVideo } from '../player/youtube-dom.js';

/** آخر رمز تعطل من نقطتي التركيب، إن كانت إحداهما في حالة خطأ. */
function toolsCode(mounted) {
  for (const h of [mounted.controls, mounted.overlay]) {
    if (h?.state === 'error') {
      try {
        return h.diagnostics?.().lastCode ?? null;
      } catch {
        return null;
      }
    }
  }
  return safe(() => mounted.overlay?.diagnostics?.().videoCode) ?? null;
}

const safe = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/**
 * مواضع لوحة النص في خريطة الوجود (الفكرة ١): PANEL_SELECTORS كما تبحث عنها panel/column.js، وصندوق بيانات الفيديو داخل #below.
 * مفاتيحها غير مفاتيح SELECTORS، فالخريطة مسطّحة.
 */
const PANEL_PRESENCE = Object.freeze({ ...PANEL_SELECTORS, belowAnchor: `${PANEL_SELECTORS.below} ${PANEL_SELECTORS.belowAnchor}` });

/**
 * خريطة وجود العناصر التي يعتمد عليها ترجمان (ف10، 2026-11-10): نعم أو لا لكل محدد في SELECTORS، ولكل موضع للوحة النص في
 * PANEL_SELECTORS (الفكرة ١: فيُعرف من التقرير أيّ مواضعها غاب حين لا تظهر اللوحة)، و`anyVideo` لأي عنصر فيديو. أسماء ونعم/لا فقط،
 * بلا نص ولا رابط، لتقرير تشخيص الصفحة.
 * @param {Document} [doc] @returns {Record<string, boolean>}
 */
export function domPresence(doc = document) {
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const [k, sel] of [...Object.entries(SELECTORS), ...Object.entries(PANEL_PRESENCE)]) {
    try {
      out[k] = !!doc.querySelector(sel);
    } catch {
      out[k] = false;
    }
  }
  out.anyVideo = !!doc.querySelector('video');
  return out;
}

/**
 * @param {{
 *   controller: { getState: () => import('./controller.js').ControllerState, diagnostics?: () => object },
 *   mounted: { overlay?: { state: string, diagnostics?: () => object }, controls?: { state: string, diagnostics?: () => object }, panel?: { diagnostics?: () => object } },
 *   runtime?: typeof chrome.runtime,
 *   seek?: (ms: number) => boolean,
 *   dom?: () => Record<string, boolean>,
 * }} deps  dom للاختبار: خريطة وجود العناصر (ف10)، والافتراضي domPresence للمستند
 * @returns {() => void} إلغاء الاستماع
 */
export function installMessageHandler({ controller, mounted, runtime = globalThis.chrome.runtime, seek = (ms) => seekMainVideo(ms), dom = () => domPresence() }) {
  const handler = (req, sender, sendResponse) => {
    if (!isExtensionPage(sender, runtime)) return undefined;
    if (isVideoStateRequest(req)) {
      sendResponse(buildVideoStateReply(controller.getState(), {
        overlay: mounted.overlay?.state ?? 'none',
        controls: mounted.controls?.state ?? 'none',
        code: toolsCode(mounted),
      }));
    } else if (isVideoIdRequest(req)) {
      // المعرّف وحده للقفز من الصفحات (U102).
      sendResponse({ v: MESSAGE_VERSION, ok: true, videoId: safe(() => controller.getState().videoId) ?? null });
    } else if (isPageDiagnosticsRequest(req)) {
      sendResponse({
        v: MESSAGE_VERSION, ok: true,
        sections: {
          controller: safe(() => controller.diagnostics?.() ?? null),
          mounted: {
            overlay: safe(() => mounted.overlay?.diagnostics?.() ?? { state: mounted.overlay?.state ?? 'none' }),
            controls: safe(() => mounted.controls?.diagnostics?.() ?? { state: mounted.controls?.state ?? 'none' }),
          },
          // ف10: خريطة وجود عناصر يوتيوب التي يعتمد عليها ترجمان (نعم أو لا)، وتشخيص لوحة النص المتزامن.
          dom: safe(() => dom()),
          panel: safe(() => mounted.panel?.diagnostics?.() ?? null),
        },
      });
    } else if (req && typeof req === 'object' && req.type === MSG.seek) {
      const s = controller.getState();
      if (!isSeekRequest(req)) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_BAD_MESSAGE' });
      else if (!s.videoId) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_NO_VIDEO' });
      else if (req.videoId !== s.videoId) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_WRONG_VIDEO' });
      else if (!seek(req.ms)) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_SEEK_FAILED' });
      else sendResponse({ v: MESSAGE_VERSION, ok: true, ms: req.ms });
    } else if (req && typeof req === 'object' && req.type === MSG.pasteImport) {
      // ف5: النص الملصوق في نافذة الإضافة يدخل خط الرفع نفسه في المشغّل، للفيديو المعروض وحده.
      const s = controller.getState();
      if (!isPasteImportRequest(req)) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_BAD_MESSAGE' });
      else if (!s.videoId) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_NO_VIDEO' });
      else if (req.videoId !== s.videoId) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_WRONG_VIDEO' });
      else {
        const r = safe(() => mounted.controls?.importText?.(req.text)) ?? { ok: false, code: 'TJ_RELOAD_PAGE' };
        sendResponse(r.ok ? { v: MESSAGE_VERSION, ok: true } : { v: MESSAGE_VERSION, ok: false, code: r.code });
      }
    }
    return undefined;
  };
  runtime.onMessage.addListener(handler);
  return () => runtime.onMessage.removeListener(handler);
}
