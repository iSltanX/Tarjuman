// قائمة منسدلة بزر (مشتركة بين الصفحات): role=menu بالأسهم وHome/End وEsc والإغلاق بالنقر خارجها، وبند معطّل يذكر
// سببه دائمًا، وعناوين مجموعات وفواصل. قائمة واحدة مفتوحة في الصفحة. textContent وsetAttribute فقط.
//
// عنوان المجموعة role=group باسمه يضم بنودها حتى الفاصل التالي (تدقيق 7a66f91، U58): كان role=presentation فلا يصل «تصدير»
// إلى من يتنقل بالأسهم، فيسمع «العربية — النسخة الحالية» اختيارًا لا تصديرًا. وcloseMenuWithin يغلق القائمة المفتوحة قبل هدم
// حاويتها (تحديث في الخلفية)، فلا يبقى مستمع pointerdown عالقًا على المستند.
import { el, icon } from './components.js';

let seq = 0;
/** القائمة المفتوحة حاليًا (واحدة في أي وقت): إغلاقها وجذرها. @type {{ close: () => void, root: HTMLElement } | null} */
let current = null;

/**
 * يغلق القائمة المفتوحة إن كانت داخل الحاوية (بلا إعادة تركيز؛ من يهدم الحاوية يعيده بنفسه). يعيد هل أُغلقت.
 * @param {HTMLElement} container
 */
export function closeMenuWithin(container) {
  if (!current || !container.contains(current.root)) return false;
  current.close();
  return true;
}

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
  /** @type {HTMLElement[]} */
  const nodes = [];
  /** المجموعة المفتوحة: بنودها تُلحق بها حتى فاصل أو مجموعة أخرى. @type {HTMLElement | null} */
  let group = null;
  for (const it of items) {
    if ('kind' in it && it.kind === 'separator') {
      group = null;
      nodes.push(el('div', { className: 'tj-menu__sep', attrs: { role: 'separator' }, doc }));
      continue;
    }
    if ('kind' in it && it.kind === 'group') {
      // العنوان مرئي ومخفي عن شجرة الوصول، والاسم على المجموعة نفسها فيُقرأ مرة.
      group = el('div', {
        className: 'tj-menu__grp', attrs: { role: 'group', 'aria-label': it.label },
        children: [el('div', { className: 'tj-menu__group', attrs: { 'aria-hidden': 'true' }, text: it.label, doc })],
        doc,
      });
      nodes.push(group);
      continue;
    }
    const node = itemNode(it);
    if (group) group.append(node);
    else nodes.push(node);
  }
  function itemNode(it) {
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
  }
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

  /**
   * تُفتح القائمة إلى الأعلى حين يقطعها أسفل النافذة ويتسع لها ما فوق الزر أكثر مما تحته (2026-11-10: كانت قائمة صف المحفوظات
   * الأخير تُقطع أسفل الشاشة). وإن لم يتسع لها الجانب المختار كله حُدّ ارتفاعها بما فيه (--tj-menu-max) فتُمرَّر من داخلها ولا
   * تتجاوز حافة النافذة. القياس بعد إظهارها؛ وبلا قياس (بيئة بلا تخطيط) تبقى إلى الأسفل بحدها الثابت في الأنماط كما كانت.
   */
  function place() {
    menu.classList.remove('tj-menu__list--up');
    // القيمة الفارغة تزيل الإعلان في CSSOM، فلا يبقى حد من فتحة سابقة.
    menu.style.setProperty('--tj-menu-max', '');
    const win = doc.defaultView;
    const vh = win?.innerHeight;
    if (typeof vh !== 'number' || !(vh > 0) || typeof menu.getBoundingClientRect !== 'function') return;
    const list = menu.getBoundingClientRect();
    const btn = button.getBoundingClientRect();
    const height = list.bottom - list.top;
    const below = vh - btn.bottom - 12;
    const above = btn.top - 12;
    const up = list.bottom > vh - 8 && above > below;
    if (up) menu.classList.add('tj-menu__list--up');
    const room = up ? above : below;
    if (height > room) menu.style.setProperty('--tj-menu-max', `${Math.max(120, Math.floor(room))}px`);
  }

  function open() {
    if (opened) return;
    current?.close();
    opened = true;
    menu.hidden = false;
    place();
    button.setAttribute('aria-expanded', 'true');
    doc.addEventListener('pointerdown', onPointerDown, true);
    current = { close: () => close(), root };
    focusItem(0);
  }

  function close({ restoreFocus = false } = {}) {
    if (!opened) return;
    opened = false;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', onPointerDown, true);
    if (current?.root === root) current = null;
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
