// تعليق تبديل لغة الواجهة على الصفحة ما دام فيها عمل جارٍ أو حوار مفتوح أو نتيجة لم تُقرأ: إعادة تحميل الصفحة في منتصف استعادة نسخة احتياطية
// تقطع بقيتها وتُضيع تقريرها، وبلاغ قيد الإرسال يفقد رده. من يبدأ عملًا كهذا يأخذ قبضة (holdPage) ويفلتها عند انتهائه، ويُطبَّق التبديل بعد إفلات آخرها.

let holds = 0;
const listeners = new Set();

/**
 * يأخذ قبضة، ويعيد دالة إفلاتها (استدعاؤها مرة ثانية بلا أثر).
 * @returns {() => void}
 */
export function holdPage() {
  holds++;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holds--;
    if (!holds) for (const fn of [...listeners]) fn();
  };
}

/** هل في الصفحة ما يمنع تبديل اللغة الآن. */
export const pageHeld = () => holds > 0;

/** @param {() => void} fn يُستدعى حين تُفلت آخر قبضة @returns {() => void} */
export function onPageReleased(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * ينفّذ عملًا تحت قبضة واحدة، ناجحًا كان أو فاشلًا.
 * @template T @param {() => T | Promise<T>} fn @returns {Promise<T>}
 */
export async function whileHeld(fn) {
  const release = holdPage();
  try {
    return await fn();
  } finally {
    release();
  }
}
