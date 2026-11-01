// انتظار قصير للالتقاط الذي سبق تغيّر العنوان: ثبت حيًا في P1 أن المشغّل قد يطلب ترجمة الفيديو التالي
// قبل أن يتغير عنوان الصفحة بنحو 300ms عند التنقل الداخلي. يُحفظ الالتقاط الذي لا يخص الفيديو المعروض
// مدة windowMs فقط، فإن صار فيديوه هو المعروض خلالها أُعيد تقييمه بكل القواعد. ولا يُقبل أبدًا التقاط
// لفيديو لم يصبح معروضًا، فتبقى المعاينات والإعلانات مرفوضة.

export const PENDING_WINDOW_MS = 2000;
const MAX_PENDING = 8;

/** @param {{ windowMs?: number }} [opts] */
export function createPendingBuffer({ windowMs = PENDING_WINDOW_MS } = {}) {
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
  };
}
