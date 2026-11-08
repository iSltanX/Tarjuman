// خدمة الكاتب الواحد في العامل الخلفي (عقد messages §٨ وstorage §١٢؛ تدقيق 7a66f91، C2، قرار سلطان Q15). تقبل tj:store من
// سكربت ترجمان على يوتيوب أو من صفحة في الإضافة وحدهما، كما تقبل خدمة الحفظ، وتمرّر الطلب إلى الكاتب. لا منطق آخر.
import { MESSAGE_VERSION, isExtensionPage, isOwnContentScript, isStoreRequest } from '../core/model/messages.js';

// ما يحتاجه جانب يوتيوب فعلًا (تدقيق V2، U-043): الباقي (المسح الكامل وحذف فيديو وتفضيلات اللغات وسجل الحفظ) لصفحات الإضافة
// وحدها. تحصين في العمق: قائمة السماح لا تمنع سياق عرض مخترقًا يقرأ storage.local مباشرة، لكنها تضيّق ما يقبله الكاتب.
// وuiLocaleInit: سكربت يوتيوب يهيّئ لغة الواجهة من لغة يوتيوب إن لم يكن لها قيمة؛ أما تغيير الاختيار (uiLocale) فلصفحة الإعدادات وحدها.
export const CONTENT_SCRIPT_OPS = Object.freeze(['ready', 'put', 'orphan', 'index', 'settings', 'prefs', 'uiLocaleInit']);

/**
 * @param {{ runtime: typeof chrome.runtime, writer: { handle: (req: unknown) => Promise<object> } }} deps
 * @returns {{ handle: (req: unknown, sender: object) => Promise<object> | null, install: () => () => void }}
 */
export function createStoreService({ runtime, writer }) {
  /** وعد الرد، أو null لرسالة لا تخصه (فلا رد). */
  function handle(req, sender) {
    if (!isStoreRequest(req)) return null;
    if (isExtensionPage(sender, runtime)) return writer.handle(req);
    if (!isOwnContentScript(sender, runtime)) return null;
    // مرسِل معروف بعملية ليست له: رد برفض بالشكل المعتاد لا تجاهل صامت.
    if (!CONTENT_SCRIPT_OPS.includes(req.op)) return Promise.resolve({ v: MESSAGE_VERSION, ok: false, code: 'TJ_BAD_MESSAGE', detail: null });
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
