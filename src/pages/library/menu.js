// قائمة منسدلة بزر (تصدير SRT، والمزيد): role=menu بالأسهم وHome/End وEsc وإغلاق بالنقر خارجها، وبند معطّل يذكر سببه
// دائمًا. قائمة واحدة مفتوحة في الصفحة. تُبنى داخل الصفحة وتُطلب ترقيتها إلى src/ui (sharedRequests).
import { el } from '../../ui/components.js';
import { pageIcon } from './icons.js';

let seq = 0;
/** إغلاق القائمة المفتوحة حاليًا (واحدة في أي وقت). */
let closeCurrent = null;

/**
 * @param {{
 *   label: string, ariaLabel?: string, icon?: Parameters<typeof pageIcon>[0], chevron?: boolean, iconOnly?: boolean,
 *   items: { id: string, label: string, hint?: string, disabledReason?: string | null, tone?: 'danger', icon?: Parameters<typeof pageIcon>[0], onSelect: () => void }[],
 *   className?: string, doc?: Document
 * }} o
 * @returns {{ root: HTMLElement, button: HTMLElement, menu: HTMLElement, open: () => void, close: () => void, isOpen: () => boolean }}
 */
export function createMenu({ label, ariaLabel, icon: iconName, chevron = false, iconOnly = false, items, className = '', doc = document }) {
  const id = `lib-menu-${++seq}`;
  const button = el('button', {
    className: `tj-btn tj-btn--secondary tj-btn--sm lib-menu__button ${className}`.trim(),
    attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': id, ...(ariaLabel ? { 'aria-label': ariaLabel } : {}) },
    children: [iconName ? pageIcon(iconName, { doc }) : null, iconOnly ? null : el('span', { text: label, doc }), chevron ? pageIcon('chevron', { doc, className: 'tj-icon lib-menu__chevron' }) : null],
    doc,
  });
  const itemButtons = items.map((it) => {
    const b = el('button', {
      className: `lib-menu__item${it.tone === 'danger' ? ' lib-menu__item--danger' : ''}`,
      attrs: { type: 'button', role: 'menuitem', tabindex: '-1', ...(it.disabledReason ? { 'aria-disabled': 'true' } : {}) },
      children: [
        it.icon ? pageIcon(it.icon, { doc }) : null,
        el('span', {
          className: 'lib-menu__text',
          children: [el('span', { className: 'lib-menu__label', text: it.label, doc }), it.disabledReason || it.hint ? el('span', { className: 'lib-menu__hint', text: it.disabledReason ?? it.hint, doc }) : null],
          doc,
        }),
      ],
      doc,
    });
    b.addEventListener('click', () => {
      if (it.disabledReason) return;
      close();
      it.onSelect();
    });
    return b;
  });
  const menu = el('div', { className: 'lib-menu__list', attrs: { id, role: 'menu', 'aria-label': ariaLabel ?? label }, children: itemButtons, doc });
  menu.hidden = true;
  const root = el('div', { className: 'lib-menu', children: [button, menu], doc });

  let opened = false;
  const onPointerDown = (e) => {
    if (!root.contains(e.target)) close();
  };

  function focusItem(i) {
    const n = itemButtons.length;
    itemButtons[((i % n) + n) % n].focus();
  }

  function open() {
    if (opened) return;
    closeCurrent?.();
    opened = true;
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    doc.addEventListener('pointerdown', onPointerDown, true);
    closeCurrent = close;
    focusItem(0);
  }

  function close({ restoreFocus = false } = {}) {
    if (!opened) return;
    opened = false;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', onPointerDown, true);
    if (closeCurrent === close) closeCurrent = null;
    if (restoreFocus) button.focus();
  }

  button.addEventListener('click', () => (opened ? close() : open()));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      open();
      if (e.key === 'ArrowUp') focusItem(-1);
    }
  });
  menu.addEventListener('keydown', (e) => {
    const at = itemButtons.indexOf(doc.activeElement);
    if (e.key === 'ArrowDown') focusItem(at + 1);
    else if (e.key === 'ArrowUp') focusItem(at - 1);
    else if (e.key === 'Home') focusItem(0);
    else if (e.key === 'End') focusItem(-1);
    else if (e.key === 'Escape') close({ restoreFocus: true });
    else if (e.key === 'Tab') close();
    else return;
    if (e.key !== 'Tab') e.preventDefault();
  });

  return { root, button, menu, open, close: () => close(), isOpen: () => opened };
}
