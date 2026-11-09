// الرد على صفحات الإضافة (عقد messages §٢ و§٥–§٧): حالة الفيديو الحالي (موسّعة بالخانات والالتقاط وحالة الأدوات)،
// وتشخيص الصفحة (أعداد ورموز)، والقفز إلى زمن في الفيديو المعروض وحده. لا يُقبل شيء إلا من صفحة في الإضافة نفسها،
// والقفز لا يغيّر إلا الزمن. ما عدا ذلك تغيّره الصفحات في التخزين، والمتحكم يسمع تغيّره.
import {
  MESSAGE_VERSION, buildVideoStateReply, isExtensionPage, isPageDiagnosticsRequest, isSeekRequest, isVideoIdRequest, isVideoStateRequest, MSG,
} from '../core/model/messages.js';
import { seekMainVideo } from '../player/youtube-dom.js';

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
 * @param {{
 *   controller: { getState: () => import('./controller.js').ControllerState, diagnostics?: () => object },
 *   mounted: { overlay?: { state: string, diagnostics?: () => object }, controls?: { state: string, diagnostics?: () => object } },
 *   runtime?: typeof chrome.runtime,
 *   seek?: (ms: number) => boolean,
 * }} deps
 * @returns {() => void} إلغاء الاستماع
 */
export function installMessageHandler({ controller, mounted, runtime = globalThis.chrome.runtime, seek = (ms) => seekMainVideo(ms) }) {
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
        },
      });
    } else if (req && typeof req === 'object' && req.type === MSG.seek) {
      const s = controller.getState();
      if (!isSeekRequest(req)) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_BAD_MESSAGE' });
      else if (!s.videoId) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_NO_VIDEO' });
      else if (req.videoId !== s.videoId) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_WRONG_VIDEO' });
      else if (!seek(req.ms)) sendResponse({ v: MESSAGE_VERSION, ok: false, code: 'TJ_SEEK_FAILED' });
      else sendResponse({ v: MESSAGE_VERSION, ok: true, ms: req.ms });
    }
    return undefined;
  };
  runtime.onMessage.addListener(handler);
  return () => runtime.onMessage.removeListener(handler);
}
