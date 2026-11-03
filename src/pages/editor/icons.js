// أيقونات المحرّر (مواصفة التصميم §١٩.٩) التي لا مقابل لها في src/ui: السهم (عودة إلى المحفوظات) والعلامة والدمج والشطر. بالشكل نفسه
// (خطوط 24×24 بلون النص) وبـcreateElementNS وحده؛ وما يوجد في src/ui (play) يُستعمل من هناك.
import { icon } from '../../ui/components.js';

const SVG = 'http://www.w3.org/2000/svg';

const LOCAL = Object.freeze({
  arrow: [['path', { d: 'M5 12h14' }], ['path', { d: 'm12 5 7 7-7 7' }]],
  flag: [['path', { d: 'M4 22V4' }], ['path', { d: 'M4 4h12l-2 4 2 4H4' }]],
  merge: [['path', { d: 'M8 6h3a4 4 0 0 1 4 4v8' }], ['path', { d: 'M8 18h3a4 4 0 0 0 4-4' }], ['path', { d: 'm12 15 3 3 3-3' }]],
  split: [['circle', { cx: 6, cy: 6, r: 3 }], ['circle', { cx: 6, cy: 18, r: 3 }], ['path', { d: 'M20 4 8.12 15.88' }], ['path', { d: 'M14.47 14.48 20 20' }], ['path', { d: 'M8.12 8.12 12 12' }]],
});

/**
 * @param {keyof typeof LOCAL | Parameters<typeof icon>[0]} name
 * @param {{ doc?: Document, className?: string }} [o]
 */
export function editorIcon(name, { doc = document, className = 'tj-icon' } = {}) {
  if (!(name in LOCAL)) return icon(/** @type {Parameters<typeof icon>[0]} */ (name), { doc, className });
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
