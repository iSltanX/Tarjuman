// تتبّع التشغيل في قائمة الصفوف: ما دام «متابعة التشغيل» مفعّلًا يبقى الصف المرساة (الحالي) ظاهرًا داخل القائمة نفسها
// (بحساب scrollTop لا scrollIntoView، فلا تتحرك الصفحة كلها). تمرير المستخدم (عجلة أو لمس أو لوحة مفاتيح أو شريط التمرير)
// يوقف التتبّع فيظهر «العودة إلى ‹الزمن›»؛ والتمرير البرمجي لا يُعدّ تمريرًا للمستخدم لأنه لا يطلق هذه الأحداث (لا نستمع إلى scroll). حالة الجلسة
// وحدها (مفعّلة افتراضيًا)، لا تُحفظ.

/** نطاق الصف المريح من ارتفاع القائمة: ما كان داخله لا تتحرك له القائمة، وما خرج منه يُوضع عند الموضع المفضّل. */
const BAND = Object.freeze({ top: 0.08, bottom: 0.6, rest: 0.3 });
/** مسافة تمرير أبعد من هذا (بأضعاف ارتفاع القائمة) تنتقل فورًا لا بسلاسة. */
const SMOOTH_MAX = 3;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

/**
 * @param {{
 *   win: Window, list: HTMLElement, rowEl: (i: number) => HTMLElement | null,
 *   onChange: (on: boolean) => void,
 * }} deps
 */
export function createFollow({ win, list, rowEl, onChange }) {
  let on = true;

  function set(next) {
    if (on === next) return;
    on = next;
    onChange(on);
  }

  // مدخلات المستخدم وحدها توقف التتبّع.
  const stop = () => set(false);
  list.addEventListener('wheel', stop);
  list.addEventListener('touchmove', stop);
  list.addEventListener('keydown', (ev) => {
    if (SCROLL_KEYS.has(ev.key)) stop();
  });
  // سحب شريط التمرير أو النقر على حاشية القائمة (الهدف القائمة نفسها لا صف فيها).
  list.addEventListener('mousedown', (ev) => {
    if (ev.target === list) stop();
  });

  const reducedMotion = () => {
    try {
      return !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch {
      return false;
    }
  };

  function scrollTo(top, smooth) {
    if (typeof list.scrollTo === 'function') list.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    else list.scrollTop = top;
  }

  /**
   * يُظهر الصف داخل القائمة. بلا force لا تتحرك القائمة إن كان الصف في النطاق المريح؛ ومعه (فتح اللوحة، أو العودة)
   * يوضع عند الموضع المفضّل دائمًا. بلا تخطيط (قائمة مخفية) لا يفعل شيئًا.
   * @param {number} i @param {{ force?: boolean, instant?: boolean }} [o]
   * @returns {boolean} هل حُرّكت القائمة
   */
  function reveal(i, { force = false, instant = false } = {}) {
    const r = rowEl(i);
    const h = list.clientHeight;
    if (!r || !h) return false;
    const top = r.offsetTop;
    const bottom = top + r.offsetHeight;
    const view = list.scrollTop;
    const inBand = top >= view + h * BAND.top && top <= view + h * BAND.bottom && bottom <= view + h;
    if (inBand && !force) return false;
    const max = Math.max(0, (list.scrollHeight || 0) - h);
    const target = Math.min(max, Math.max(0, Math.round(top - h * BAND.rest)));
    if (target === Math.round(view)) return false;
    scrollTo(target, !instant && Math.abs(target - view) < h * SMOOTH_MAX && !reducedMotion());
    return true;
  }

  return {
    get on() {
      return on;
    },
    set,
    reveal,
    /** الضغط على «العودة إلى …»: يعيد التتبّع ويضع المرساة في مكانها. @param {number} anchor */
    resume(anchor) {
      const was = on;
      on = true;
      if (anchor >= 0) reveal(anchor, { force: true });
      if (!was) onChange(true);
    },
  };
}
