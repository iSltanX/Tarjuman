// خدمة الحفظ في العامل الخلفي (عقد interfaces §١٣ وmessages §٧): للحفظ وحده. تقبل tj:save-file من سكربت ترجمان على
// يوتيوب أو من صفحة في الإضافة وحدهما، وتقرأ مكان الحفظ من التفضيلات لا من الرسالة، وتتحقق من الاسم والامتداد والحجم،
// ثم تنزّل النص من رابط data: (العامل بلا URL.createObjectURL) بواجهة التنزيلات، وتسجّل معرّف الملف. لا منطق آخر.
import { isExtensionPage, isOwnContentScript, isSaveRequest, MESSAGE_VERSION } from '../core/model/messages.js';
import { SAVE_LIMITS, downloadTarget, startDownload, validateSaveFile } from '../core/save/index.js';

/**
 * نص UTF-8 في رابط data: بترميز base64، على دفعات (String.fromCharCode لا يقبل مصفوفة ضخمة).
 * @param {string} text @param {string} mime
 */
export function dataUrl(text, mime) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

/**
 * @param {{
 *   runtime: typeof chrome.runtime,
 *   downloads: { download: Function, search: Function },
 *   store: { getPrefs: () => Promise<{ saveLocation: object }>, setLastSave: (id: number) => Promise<void> },
 *   settle?: object
 * }} deps
 * @returns {{ handle: (req: unknown, sender: object) => Promise<object> | null, install: () => () => void }}
 */
export function createSaveService({ runtime, downloads, store, settle }) {
  /** يعيد وعد الرد، أو null لرسالة لا تخصه (فلا رد). */
  function handle(req, sender) {
    if (!(isOwnContentScript(sender, runtime) || isExtensionPage(sender, runtime)) || !isSaveRequest(req)) return null;
    return (async () => {
      const v = validateSaveFile(req.file, { maxChars: SAVE_LIMITS.maxMessageChars });
      if (!v.ok) return { v: MESSAGE_VERSION, ok: false, code: v.code };
      let prefs;
      try {
        prefs = await store.getPrefs();
      } catch {
        return { v: MESSAGE_VERSION, ok: false, code: 'SV_FAILED' };
      }
      const r = await startDownload(downloads, { url: dataUrl(req.file.text, v.mime), ...downloadTarget(prefs.saveLocation, req.file.name) }, settle);
      if (!r.ok) return { v: MESSAGE_VERSION, ok: false, code: r.code };
      await store.setLastSave(r.downloadId).catch(() => {});
      return { v: MESSAGE_VERSION, ok: true, mode: prefs.saveLocation.mode, downloadId: r.downloadId, ...(r.state === 'pending' ? { pending: true } : {}) };
    })().catch(() => ({ v: MESSAGE_VERSION, ok: false, code: 'SV_FAILED' }));
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
