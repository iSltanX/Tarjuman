// الرسالة العابرة المشتركة (عقد interfaces §١٥): رُفعت من المحفوظات (P7) إلى src/ui في الإصدار الثاني. ثلاث ثوانٍ (والخطأ
// ضعفها)، ثلاث نبرات بنص دائمًا (لا معنى باللون وحده)، ومنطقة حيّة مستقلة للإعلان، وحتى ثلاث رسائل متراكمة، وزر
// «تراجع» اختياري لما يمس شيئًا محفوظًا (مواصفة التصميم §١٩.١). الأنماط tj-toast في components.css.
import { el, icon } from './components.js';

export const TOAST_MS = 3000;
export const TOAST_MAX = 3;

/**
 * @param {{ doc?: Document, setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void }} [env]
 * @returns {{
 *   root: HTMLElement, live: HTMLElement, announce: (text: string) => void,
 *   show: (text: string, tone?: 'success' | 'danger' | 'info', opts?: { action?: { label: string, onClick: () => unknown } }) => HTMLElement
 * }}
 * show يعرض الرسالة ويعلنها؛ announce وحده للإعلان بلا رسالة مرئية.
 */
export function createToaster({ doc = document, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  const stack = el('div', { className: 'tj-toasts', doc });
  // منطقة حيّة مخفية للإعلان؛ تبقى طوال عمر الصفحة فيلتقط قارئ الشاشة تغيّر نصها.
  const live = el('div', { className: 'tj-sr-only', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, doc });
  const timers = new Map();

  const drop = (node) => {
    clearTimer(timers.get(node));
    timers.delete(node);
    node.remove();
  };

  function announce(text) {
    // تفريغ ثم كتابة في مهمة لاحقة، ليُعلَن النص نفسه مرتين متتاليتين.
    live.textContent = '';
    setTimer(() => {
      live.textContent = text;
    }, 30);
  }

  function show(text, tone = 'success', { action } = {}) {
    announce(text);
    const children = [icon(tone === 'danger' ? 'danger' : tone === 'info' ? 'info' : 'success', { doc }), el('span', { text, doc })];
    let node;
    if (action) {
      const btn = el('button', { className: 'tj-toast__action', text: action.label, attrs: { type: 'button' }, doc });
      btn.addEventListener('click', () => {
        drop(node);
        action.onClick();
      });
      children.push(btn);
    }
    node = el('div', { className: `tj-toast tj-toast--${tone}${action ? ' tj-toast--action' : ''}`, children, doc });
    stack.append(node);
    timers.set(node, setTimer(() => {
      timers.delete(node);
      node.remove();
    }, (tone === 'danger' ? 2 : 1) * TOAST_MS * (action ? 2 : 1)));
    while (stack.children.length > TOAST_MAX) drop(stack.children[0]);
    return node;
  }

  return { root: stack, live, show, announce };
}
