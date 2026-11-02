// رسالة عابرة أعلى الصفحة: ثلاث ثوانٍ، وتُعلَن لقارئ الشاشة بمنطقة حيّة مستقلة (show يعلن نصها). ثلاث نبرات بنص
// دائمًا (لا معنى باللون وحده). الرسائل نصوص جاهزة تأتي من رموز الأخطاء. الأنماط من src/ui المشتركة.
import { el, icon } from '../../ui/components.js';

export const TOAST_MS = 3000;

/**
 * @param {{ doc?: Document, setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void }} [env]
 * @returns {{ root: HTMLElement, live: HTMLElement, show: (text: string, tone?: 'success' | 'danger' | 'info') => void, announce: (text: string) => void }}
 * show يعرض الرسالة ويعلنها؛ announce وحده للإعلان بلا رسالة مرئية (نجاح «نسخ» يتحول زره بدل رسالة).
 */
export function createToaster({ doc = document, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  const stack = el('div', { className: 'tj-toasts lib-toasts', doc });
  // منطقة حيّة مخفية للإعلان؛ تبقى في الصفحة طوال عمرها فيلتقط قارئ الشاشة تغيّر نصها.
  const live = el('div', { className: 'tj-sr-only', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, doc });
  const timers = new Map();

  function show(text, tone = 'success') {
    announce(text);
    const node = el('div', {
      className: `tj-toast tj-toast--${tone} lib-toast lib-toast--${tone}`,
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
