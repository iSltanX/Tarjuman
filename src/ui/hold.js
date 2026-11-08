// إمساك المؤقت بالمؤشر والتركيز (WCAG 2.2.1، وWCAG 2.4.3 مع وجهة التركيز عند الزوال): الآلية المشتركة لكل رسالة عابرة فيها «تراجع».
// رُفعت من src/ui/toast.js (createToaster) إلى ملف بلا اعتماد على المكوّنات ليستعملها المشغّل (جذر Shadow DOM مغلق على صفحة
// يوتيوب) والمحرّر بالحرف نفسه (التدقيق الموحد V2، U-042). تُصدَّر أيضًا من toast.js.

/**
 * مؤقت زوال يُمسَك ما دام له سبب إمساك (المؤشر فوق الرسالة، أو التركيز فيها)، ويبدأ بمدته كاملة حين يزول آخر سبب.
 * @param {{ ms: number, onExpire: () => void, setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void }} o
 * @returns {{ arm: () => void, cancel: () => void, hold: (why: string, on: boolean) => void, reset: () => void, held: () => boolean }}
 */
export function holdTimer({ ms, onExpire, setTimer = (fn, t) => setTimeout(fn, t), clearTimer = (id) => clearTimeout(id) }) {
  let timer = null;
  const held = new Set();
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const arm = () => {
    cancel();
    if (!held.size) {
      timer = setTimer(() => {
        timer = null;
        onExpire();
      }, ms);
    }
  };
  return {
    arm,
    cancel,
    hold(why, on) {
      if (on) held.add(why);
      else held.delete(why);
      arm();
    },
    /** رسالة جديدة في العنصر نفسه: تُنسى أسباب إمساك الرسالة السابقة (خامدة لا تطلق mouseleave). */
    reset() {
      held.clear();
    },
    held: () => held.size > 0,
  };
}

/** عناصر يُنقل إليها التركيز من الشيفرة الآن (لا من المستخدم): تركيزها لا يُمسك الرسالة. */
const quiet = new WeakSet();

/**
 * ينقل التركيز إلى عنصر في الرسالة دون أن يُعدّ سبب إمساك، كأن تنقله الواجهة إلى «تراجع» لأن الزر الذي كان عليه اختفى. فلو
 * أُمسك بهذا لبقيت الرسالة بلا نهاية وإن لم يقصدها المستخدم (كشفه الاختبار الحي للوحة، التدقيق الموحد V2). والمتصفح يطلق
 * focusin داخل focus() نفسها، فيرى المستمع العلامة.
 * @param {HTMLElement} el
 */
export function focusQuietly(el) {
  quiet.add(el);
  try {
    el.focus();
  } finally {
    quiet.delete(el);
  }
}

/**
 * يربط أحداث الإمساك بعنصر الرسالة: المؤشر (mouseenter وmouseleave) والتركيز (focusin وfocusout إلى خارجها). والتركيز الذي
 * تنقله الواجهة بـfocusQuietly لا يُمسك؛ وما يفعله المستخدم بعده (المؤشر، أو تركيز آخر داخلها) يُمسك.
 * @param {HTMLElement} node @param {(why: 'pointer' | 'focus', on: boolean) => void} hold
 */
export function onHold(node, hold) {
  node.addEventListener('mouseenter', () => hold('pointer', true));
  node.addEventListener('mouseleave', () => hold('pointer', false));
  node.addEventListener('focusin', (e) => {
    if (!quiet.has(e.target)) hold('focus', true);
  });
  node.addEventListener('focusout', (e) => {
    if (!node.contains(e.relatedTarget ?? null)) hold('focus', false);
  });
}
