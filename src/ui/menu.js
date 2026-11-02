// قائمة منسدلة بزر (مشتركة بين الصفحات): role=menu بالأسهم وHome/End وEsc والإغلاق بالنقر خارجها، وبند معطّل يذكر
// سببه دائمًا، وعناوين مجموعات وفواصل. قائمة واحدة مفتوحة في الصفحة. textContent وsetAttribute فقط.
import { el, icon } from './components.js';

let seq = 0;
/** إغلاق القائمة المفتوحة حاليًا (واحدة في أي وقت). */
let closeCurrent = null;

/**
 * @typedef {{ kind: 'separator' } | { kind: 'group', label: string }} MenuDivider
 * @typedef {{
 *   id: string, label: string, hint?: string, disabledReason?: string | null, tone?: 'danger',
 *   icon?: Parameters<typeof icon>[0], onSelect: () => void
 * }} MenuItem
 */

/**
 * @param {{
 *   label: string, ariaLabel?: string, icon?: Parameters<typeof icon>[0], chevron?: boolean, iconOnly?: boolean,
 *   items: (MenuItem | MenuDivider)[], className?: string, align?: 'end' | 'start', size?: 'sm' | 'md',
 *   variant?: 'secondary' | 'ghost', doc?: Document
 * }} o
 * @returns {{ root: HTMLElement, button: HTMLElement, menu: HTMLElement, open: () => void, close: () => void, isOpen: () => boolean }}
 */
export function createMenu({ label, ariaLabel, icon: iconName, chevron = false, iconOnly = false, items, className = '', align = 'end', size = 'sm', variant = 'secondary', doc = document }) {
  const id = `tj-menu-${++seq}`;
  const button = el('button', {
    className: `tj-btn tj-btn--${variant}${size === 'sm' ? ' tj-btn--sm' : ''}${iconOnly ? ' tj-btn--icon' : ''} tj-menu__button ${className}`.trim(),
    attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': id, ...(ariaLabel ? { 'aria-label': ariaLabel } : {}) },
    children: [iconName ? icon(iconName, { doc }) : null, iconOnly ? null : el('span', { text: label, doc }), chevron ? icon('chevron', { doc, className: 'tj-icon tj-menu__chevron' }) : null],
    doc,
  });
  const itemButtons = [];
  const nodes = items.map((it) => {
    if ('kind' in it && it.kind === 'separator') return el('div', { className: 'tj-menu__sep', attrs: { role: 'separator' }, doc });
    if ('kind' in it && it.kind === 'group') return el('div', { className: 'tj-menu__group', attrs: { role: 'presentation' }, text: it.label, doc });
    const b = el('button', {
      className: `tj-menu__item${it.tone === 'danger' ? ' tj-menu__item--danger' : ''}`,
      attrs: { type: 'button', role: 'menuitem', tabindex: '-1', 'data-item': it.id, ...(it.disabledReason ? { 'aria-disabled': 'true' } : {}) },
      children: [
        it.icon ? icon(it.icon, { doc }) : null,
        el('span', {
          className: 'tj-menu__text',
          children: [el('span', { className: 'tj-menu__label', text: it.label, doc }), it.disabledReason || it.hint ? el('span', { className: 'tj-menu__hint', text: it.disabledReason ?? it.hint, doc }) : null],
          doc,
        }),
      ],
      doc,
    });
    b.addEventListener('click', () => {
      if (it.disabledReason) return;
      // يعود التركيز إلى الزر قبل التنفيذ: الحوار الذي يفتحه البند يعيده إليه عند إغلاقه بدل أن يضيع في body.
      close({ restoreFocus: true });
      it.onSelect();
    });
    itemButtons.push(b);
    return b;
  });
  const menu = el('div', { className: `tj-menu__list${align === 'start' ? ' tj-menu__list--start' : ''}`, attrs: { id, role: 'menu', 'aria-label': ariaLabel ?? label }, children: nodes, doc });
  menu.hidden = true;
  const root = el('div', { className: 'tj-menu', children: [button, menu], doc });

  let opened = false;
  const onPointerDown = (e) => {
    if (!root.contains(e.target)) close();
  };

  function focusItem(i) {
    const n = itemButtons.length;
    if (!n) return;
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
