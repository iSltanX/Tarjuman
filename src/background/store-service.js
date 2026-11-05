// خدمة الكاتب الواحد في العامل الخلفي (عقد messages §٨ وstorage §١٢؛ تدقيق 7a66f91، C2، قرار سلطان Q15). تقبل tj:store من
// سكربت ترجمان على يوتيوب أو من صفحة في الإضافة وحدهما، كما تقبل خدمة الحفظ، وتمرّر الطلب إلى الكاتب. لا منطق آخر.
import { isExtensionPage, isOwnContentScript, isStoreRequest } from '../core/model/messages.js';

/**
 * @param {{ runtime: typeof chrome.runtime, writer: { handle: (req: unknown) => Promise<object> } }} deps
 * @returns {{ handle: (req: unknown, sender: object) => Promise<object> | null, install: () => () => void }}
 */
export function createStoreService({ runtime, writer }) {
  /** وعد الرد، أو null لرسالة لا تخصه (فلا رد). */
  function handle(req, sender) {
    if (!(isOwnContentScript(sender, runtime) || isExtensionPage(sender, runtime)) || !isStoreRequest(req)) return null;
    return writer.handle(req);
  }

  return {
    handle,
    install() {
      const listener = (req, sender, sendResponse) => {
        const p = handle(req, sender);
        if (!p) return undefined;
        p.then(sendResponse);
        return true; // الرد غير متزامن
      };
      runtime.onMessage.addListener(listener);
      return () => runtime.onMessage.removeListener(listener);
    },
  };
}
