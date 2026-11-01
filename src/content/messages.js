// الرد على نافذة الأيقونة (عقد messages §٢): طلب واحد هو حالة الفيديو الحالي، ولا يُقبل إلا من صفحة في
// الإضافة نفسها. لا أوامر تصل إلى المشغّل برسالة؛ الصفحات تغيّر التخزين، والمتحكم يسمع تغيّره.
import { buildVideoStateReply, isExtensionPage, isVideoStateRequest } from '../core/model/messages.js';

/**
 * @param {{
 *   controller: { getState: () => import('./controller.js').ControllerState },
 *   mounted: { overlay?: { state: string }, controls?: { state: string } },
 *   runtime?: typeof chrome.runtime,
 * }} deps
 * @returns {() => void} إلغاء الاستماع
 */
export function installMessageHandler({ controller, mounted, runtime = globalThis.chrome.runtime }) {
  const handler = (req, sender, sendResponse) => {
    if (!isExtensionPage(sender, runtime) || !isVideoStateRequest(req)) return undefined;
    sendResponse(buildVideoStateReply(controller.getState(), {
      overlay: mounted.overlay?.state ?? 'none',
      controls: mounted.controls?.state ?? 'none',
    }));
    return undefined;
  };
  runtime.onMessage.addListener(handler);
  return () => runtime.onMessage.removeListener(handler);
}
