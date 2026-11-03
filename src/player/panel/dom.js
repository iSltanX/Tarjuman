// بناء DOM اللوحة (بلا HTML نصي أبدًا: Trusted Types في يوتيوب وقاعدة check-static): عناصر بـcreateElement وtextContent
// وsetAttribute وحدها، وأدوات تعديل تكتب فقط ما تغيّر فلا عمل DOM بلا لزوم.
import { ICONS } from '../../ui/icons.js';
import { logo } from '../../ui/logo.js';

const SVG = 'http://www.w3.org/2000/svg';

/** أيقونات اللوحة التي ليست في مجموعة الواجهة المشتركة (src/ui/icons.js)، بالنمط نفسه (شبكة 24، خط 2). */
const LOCAL_ICONS = Object.freeze({
  minus: [['path', { d: 'M5 12h14' }]],
  'eye-off': [
    ['path', { d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49' }],
    ['path', { d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' }],
    ['path', { d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
  'arrow-up': [['path', { d: 'M12 19V5' }], ['path', { d: 'm5 12 7-7 7 7' }]],
  'arrow-down': [['path', { d: 'M12 5v14' }], ['path', { d: 'm19 12-7 7-7-7' }]],
});

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
 * أيقونة SVG مضمّنة من مجموعة الواجهة (أو المحلية)، بلون currentColor. الاسم المجهول أيقونة فارغة لا خطأ.
 * @param {Document} doc @param {string} name @param {{ size?: 'sm' | 'xs' | null, fill?: boolean }} [o]
 */
export function icon(doc, name, { size = null, fill = false } = {}) {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `ic${size ? ` ic--${size}` : ''}${fill ? ' ic--fill' : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of ICONS[name] ?? LOCAL_ICONS[name] ?? []) {
    const n = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    svg.appendChild(n);
  }
  return svg;
}

/** حدود جسد «التاء» ونقطتيها في مسارات الشعار المعتمد (دون الاسم): x من 288.2 إلى 408.2، وy من 0 إلى 68.3. */
const GLYPH_BOX = Object.freeze({ viewBox: '288 0 121 69', ratio: 121 / 69 });

/**
 * رمز الشعار وحده (جسد التاء بلون الإبراز ونقطتاه بالذهب) من مسارات src/ui/logo.js نفسها دون تعديلها: يُبنى الشعار الكامل
 * ثم يُنزع منه الاسم ويُضبط إطار العرض. الألوان من أصناف tj-logo__glyph وtj-logo__dots في ورقة اللوحة.
 * @param {Document} doc @param {number} height
 */
export function mark(doc, height) {
  const svg = logo({ height, label: null, className: 'mark', doc });
  svg.querySelector('.tj-logo__word')?.remove();
  svg.setAttribute('viewBox', GLYPH_BOX.viewBox);
  svg.setAttribute('width', String(Math.round(height * GLYPH_BOX.ratio)));
  svg.setAttribute('height', String(height));
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
