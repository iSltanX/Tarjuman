// التنزيل المحلي بلا إذن downloads (R37): Blob ثم رابط <a download> يُنقر برمجيًا في صفحة المشغّل. لا شبكة
// ولا خادم؛ والرابط المؤقت من Blob يُلغى بعد عشر ثوانٍ (إلغاؤه فورًا قد يقطع التنزيل في بعض المتصفحات).
import { TjError } from '../errors/index.js';

export const SRT_MIME = 'application/x-subrip;charset=utf-8';
export const REVOKE_AFTER_MS = 10000;

/**
 * @param {{ name: string, text: string, mime?: string }} file
 * @param {{ doc?: Document }} [env] doc للاختبار بلا متصفح
 * @throws {TjError} EX_DOWNLOAD_FAILED
 */
export function download(file, { doc = globalThis.document } = {}) {
  const win = doc?.defaultView ?? globalThis;
  let url = null;
  try {
    url = win.URL.createObjectURL(new win.Blob([file.text], { type: file.mime ?? SRT_MIME }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = file.name;
    a.style.display = 'none';
    doc.body.append(a);
    a.click();
    a.remove();
    const href = url;
    win.setTimeout(() => win.URL.revokeObjectURL(href), REVOKE_AFTER_MS);
  } catch (cause) {
    if (url) {
      try {
        win.URL.revokeObjectURL(url);
      } catch {
        // الإلغاء محاولة تنظيف فقط.
      }
    }
    throw new TjError('EX_DOWNLOAD_FAILED', { detail: cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause), cause });
  }
}
