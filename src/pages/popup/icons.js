// أيقونة نافذة الأيقونة التي لا مقابل لها في src/ui/icons.js: «العين المشطوبة» لصف «زر النص المتزامن مخفي». بالشكل نفسه
// (خطوط 24×24 بلون النص) وبـcreateElementNS وحده؛ وما يوجد في src/ui يُستعمل من هناك (كالمحرّر: editor/icons.js). والعين
// المشطوبة معدّلة من eye-off في Lucide (ISC)، ونسبتها في THIRD_PARTY_NOTICES.txt (scripts/release/notices.mjs).
import { ICONS, icon } from '../../ui/components.js';

const SVG = 'http://www.w3.org/2000/svg';

const LOCAL = Object.freeze({
  'eye-off': [
    ['path', { d: 'M9.88 9.88a3 3 0 1 0 4.24 4.24' }],
    ['path', { d: 'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68' }],
    ['path', { d: 'M6.61 6.61A13.16 13.16 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
});

/**
 * @param {keyof typeof LOCAL | keyof typeof ICONS} name
 * @param {{ doc?: Document, className?: string }} [o]
 */
export function popupIcon(name, { doc = document, className = 'tj-icon' } = {}) {
  if (!(name in LOCAL)) return icon(/** @type {keyof typeof ICONS} */ (name), { doc, className });
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of LOCAL[name]) {
    const node = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.append(node);
  }
  return svg;
}
