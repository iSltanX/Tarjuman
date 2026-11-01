// رسالة عابرة أعلى الصفحة (figma-design-brief §١٢): ثلاث ثوانٍ، وعلى قارئ الشاشة عبر منطقة حيّة مستقلة. ثلاث نبرات
// بنص دائمًا (لا معنى باللون وحده). الرسائل نصوص جاهزة تأتي من رموز الأخطاء.
import { el, icon } from '../../ui/components.js';

export const TOAST_MS = 3000;

/**
 * @param {{ doc?: Document, setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void }} [env]
 * @returns {{ root: HTMLElement, live: HTMLElement, show: (text: string, tone?: 'success' | 'danger' | 'info') => void, announce: (text: string) => void }}
 */
export function createToaster({ doc = document, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  const stack = el('div', { className: 'lib-toasts', doc });
  // منطقة حيّة مخفية للإعلان؛ تبقى في الصفحة طوال عمرها فيلتقط قارئ الشاشة تغيّر نصها.
  const live = el('div', { className: 'tj-sr-only', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, doc });
  const timers = new Map();

  function show(text, tone = 'success') {
    const node = el('div', {
      className: `lib-toast lib-toast--${tone}`,
      children: [icon(tone === 'danger' ? 'danger' : tone === 'info' ? 'info' : 'success', { doc }), el('span', { text, doc })],
      doc,
    });
    stack.append(node);
    // الخطأ يُقرأ أبطأ من النجاح: ضعف المدة.
    const id = setTimer(() => {
      timers.delete(node);
      node.remove();
    }, tone === 'danger' ? TOAST_MS * 2 : TOAST_MS);
    timers.set(node, id);
    // أكثر من ثلاث رسائل متراكمة: الأقدم تذهب.
    while (stack.children.length > 3) {
      const old = stack.children[0];
      clearTimer(timers.get(old));
      timers.delete(old);
      old.remove();
    }
  }

  function announce(text) {
    // تفريغ ثم كتابة في مهمة لاحقة، ليُعلَن النص نفسه مرتين متتاليتين.
    live.textContent = '';
    setTimer(() => {
      live.textContent = text;
    }, 30);
  }

  return { root: stack, live, show, announce };
}
