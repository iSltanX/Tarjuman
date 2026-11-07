// انتظار قصير للالتقاط الذي سبق تغيّر العنوان: ثبت حيًا في P1 أن المشغّل قد يطلب ترجمة الفيديو التالي
// قبل أن يتغير عنوان الصفحة بنحو 300ms عند التنقل الداخلي. يُحفظ الالتقاط الذي لا يخص الفيديو المعروض
// مدة windowMs فقط، فإن صار فيديوه هو المعروض خلالها أُعيد تقييمه بكل القواعد. ولا يُقبل أبدًا التقاط
// لفيديو لم يصبح معروضًا، فتبقى المعاينات والإعلانات مرفوضة.
import { MAX_BODY_CHARS } from './message.js';

export const PENDING_WINDOW_MS = 2000;
const MAX_PENDING = 8;
/**
 * حد إجمالي لمحارف الأجسام المعلّقة (تدقيق Fable، FA-07): كان الحد بالعدد وحده، فثماني رسائل من الصفحة بنحو ثمانية ملايين محرف
 * لفيديوهات أخرى تبقى كلها (~460 م.ب) حتى الرسالة التالية. والأحدث يبقى وإن بلغ الحد وحده، كحد المسارات المقبولة (U33).
 */
export const MAX_PENDING_CHARS = MAX_BODY_CHARS;

/** @param {{ windowMs?: number, maxChars?: number }} [opts] maxChars للاختبار */
export function createPendingBuffer({ windowMs = PENDING_WINDOW_MS, maxChars = MAX_PENDING_CHARS } = {}) {
  /** @type {{ at: number, msg: import('./message.js').CaptureMessage }[]} */
  let items = [];
  const prune = (now) => {
    items = items.filter((x) => now - x.at <= windowMs);
  };
  return {
    /** @param {import('./message.js').CaptureMessage} msg @param {number} now */
    add(msg, now) {
      prune(now);
      if (!msg.videoId) return;
      items.push({ at: now, msg });
      if (items.length > MAX_PENDING) items.shift();
      const size = (x) => x.msg.body?.length ?? 0;
      let total = items.reduce((n, x) => n + size(x), 0);
      while (items.length > 1 && total > maxChars) total -= size(items.shift());
    },
    /** يسقط ما تجاوز النافذة الزمنية؛ يستدعيه المستخرج مع كل رسالة فلا يبقى معلّق قديم حتى التنقل. @param {number} now */
    prune(now) {
      prune(now);
    },
    /**
     * يسحب الالتقاطات المعلّقة للفيديو الذي صار معروضًا الآن.
     * @param {string | null} videoId @param {number} now
     */
    take(videoId, now) {
      prune(now);
      if (!videoId) return [];
      const hit = items.filter((x) => x.msg.videoId === videoId);
      items = items.filter((x) => x.msg.videoId !== videoId);
      return hit.map((x) => ({ msg: x.msg, ageMs: now - x.at }));
    },
    get size() {
      return items.length;
    },
    /** محارف الأجسام المعلّقة الآن (للتشخيص والاختبار). */
    get chars() {
      return items.reduce((n, x) => n + (x.msg.body?.length ?? 0), 0);
    },
  };
}
