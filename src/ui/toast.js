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
 *   show: (text: string, tone?: 'success' | 'danger' | 'info', opts?: ToastOptions) => HTMLElement
 * }}
 * show يعرض الرسالة ويعلنها؛ announce وحده للإعلان بلا رسالة مرئية.
 *
 * @typedef {{
 *   action?: { label: string, onClick: () => unknown },
 *   announce?: string,
 *   focusAfter?: () => HTMLElement | null | undefined,
 * }} ToastOptions
 * announce نص الإعلان إن خالف النص المرئي (يذكر طريق التراجع مثلًا)، وfocusAfter وجهة التركيز إن زالت الرسالة وهو فيها.
 */
export function createToaster({ doc = document, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  const stack = el('div', { className: 'tj-toasts', doc });
  // منطقة حيّة مخفية للإعلان؛ تبقى طوال عمر الصفحة فيلتقط قارئ الشاشة تغيّر نصها.
  const live = el('div', { className: 'tj-sr-only', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, doc });
  /** @type {Map<HTMLElement, { timer: unknown, ms: number, held: Set<string>, focusAfter?: () => HTMLElement | null | undefined }>} */
  const items = new Map();

  /**
   * يزيل الرسالة. وإن كان التركيز فيها (ضغطة «تراجع» أو إزاحتها برسالة رابعة) ذهب إلى وجهتها لا إلى body (تدقيق 7a66f91، U58).
   * @param {HTMLElement} node
   */
  const drop = (node) => {
    const it = items.get(node);
    clearTimer(it?.timer);
    items.delete(node);
    const had = node.contains(doc.activeElement);
    node.remove();
    if (had) it?.focusAfter?.()?.focus?.();
  };

  /** المؤقت يبدأ من جديد بمدته كاملة حين يغادر المؤشر والتركيز الرسالة؛ وما داما فيها لا تزول (WCAG 2.2.1). */
  const arm = (node) => {
    const it = items.get(node);
    if (!it) return;
    clearTimer(it.timer);
    it.timer = it.held.size ? null : setTimer(() => drop(node), it.ms);
  };
  const hold = (node, why, on) => {
    const it = items.get(node);
    if (!it) return;
    if (on) it.held.add(why);
    else it.held.delete(why);
    arm(node);
  };

  function announce(text) {
    // تفريغ ثم كتابة في مهمة لاحقة، ليُعلَن النص نفسه مرتين متتاليتين.
    live.textContent = '';
    setTimer(() => {
      live.textContent = text;
    }, 30);
  }

  /** @param {string} text @param {'success' | 'danger' | 'info'} [tone] @param {ToastOptions} [opts] */
  function show(text, tone = 'success', { action, announce: spoken, focusAfter } = {}) {
    announce(spoken ?? text);
    const children = [icon(tone === 'danger' ? 'danger' : tone === 'info' ? 'info' : 'success', { doc }), el('span', { text, doc })];
    /** @type {HTMLElement} */
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
    items.set(node, { timer: null, ms: (tone === 'danger' ? 2 : 1) * TOAST_MS * (action ? 2 : 1), held: new Set(), focusAfter });
    node.addEventListener('mouseenter', () => hold(node, 'pointer', true));
    node.addEventListener('mouseleave', () => hold(node, 'pointer', false));
    node.addEventListener('focusin', () => hold(node, 'focus', true));
    node.addEventListener('focusout', (e) => {
      if (!node.contains(e.relatedTarget ?? null)) hold(node, 'focus', false);
    });
    stack.append(node);
    arm(node);
    while (stack.children.length > TOAST_MAX) drop(stack.children[0]);
    return node;
  }

  return { root: stack, live, show, announce };
}
