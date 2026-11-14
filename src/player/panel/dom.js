// بناء DOM اللوحة (بلا HTML نصي أبدًا: Trusted Types في يوتيوب وقاعدة check-static): عناصر بـcreateElement وtextContent
// وsetAttribute وحدها، وأدوات تعديل تكتب فقط ما تغيّر فلا عمل DOM بلا لزوم.
import { ICONS, ICON_VIEWBOX } from '../../ui/icons.js';
import { LOGO_RATIO, LOGO_VIEWBOX, MARK_BOOK, MARK_BOOK_SMALL, MARK_DOTS, SMALL_BELOW } from '../../ui/logo.js';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * @param {Document} doc @param {string} tag
 * @param {{ className?: string, text?: string, attrs?: Record<string, string | number | null | undefined>, on?: Record<string, (ev: any) => void> }} [o]
 * @param {Node[]} [children]
 */
export function el(doc, tag, { className, text, attrs, on } = {}, children = []) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [k, v] of Object.entries(attrs ?? {})) if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  for (const [k, fn] of Object.entries(on ?? {})) node.addEventListener(k, fn);
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

/**
 * أيقونة SVG مضمّنة من مجموعة الهوية الواحدة (src/ui/icons.js، شبكة 20)، بلون currentColor. الاسم المجهول أيقونة فارغة لا خطأ.
 * @param {Document} doc @param {string} name @param {{ size?: 'sm' | 'xs' | null, fill?: boolean }} [o]
 */
export function icon(doc, name, { size = null, fill = false } = {}) {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', ICON_VIEWBOX);
  svg.setAttribute('class', `ic${size ? ` ic--${size}` : ''}${fill ? ' ic--fill' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of ICONS[name] ?? []) {
    const n = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    svg.appendChild(n);
  }
  return svg;
}

/**
 * رمز الشعار وحده («التاء») رأسًا للوحة بعرض بالبكسل، من مسارات src/ui/logo.js نفسها: النسخة الصغيرة تحت 32 (رأس
 * اللوحة 22 في لوحة الهوية 01). اللون من صنف tj-logo في ورقة اللوحة (الأرجوان العميق، والورق الليلي في الداكن).
 * @param {Document} doc @param {number} width
 */
export function mark(doc, width) {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', LOGO_VIEWBOX);
  svg.setAttribute('class', 'tj-logo mark');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(Math.round((width / LOGO_RATIO) * 10) / 10));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of [...MARK_DOTS, width < SMALL_BELOW ? MARK_BOOK_SMALL : MARK_BOOK]) {
    const p = doc.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/** @param {Node} node @param {string} text */
export function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/** @param {Element} node @param {string} name @param {string | number | boolean | null} value null يزيل السمة */
export function setAttr(node, name, value) {
  if (value === null || value === undefined || value === false) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
    return;
  }
  const v = value === true ? '' : String(value);
  if (node.getAttribute(name) !== v) node.setAttribute(name, v);
}

/** @param {Element} node @param {boolean} on */
export const setHidden = (node, on) => setAttr(node, 'hidden', on ? true : null);

/** @param {Element} node @param {string} cls @param {boolean} on */
export function setClass(node, cls, on) {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
}
