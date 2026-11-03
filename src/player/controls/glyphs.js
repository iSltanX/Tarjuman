// رموز الحالة الصغيرة في قوائم المشغّل ورسائله (جولة الصقل): SVG من مجموعة أيقونات الواجهة نفسها بدل محارف ⓘ ⚠ ✕ ✓ التي
// كان المتصفح يرسمها بخطوط النظام المتفرقة (Hiragino وPingFang). اللون currentColor من نغمة السطر، ولا معنى باللون وحده:
// كل رمز بجانب نص يقول المعنى. تُبنى بـcreateElementNS وsetAttribute وحدهما.
import { ICONS } from '../../ui/icons.js';

const SVG = 'http://www.w3.org/2000/svg';
const NAME = Object.freeze({
  info: 'info', warn: 'warning', warning: 'warning', error: 'danger', danger: 'danger', ok: 'check', success: 'check', x: 'x', copy: 'copy',
  download: 'download', upload: 'upload', restore: 'restore', clock: 'clock', flag: 'flag',
});
// رمز العلَم لـ«علّم للمراجعة»: غير موجود في مجموعة الواجهة، ويُرسم بالسُمك والنهايات نفسها.
const EXTRA = Object.freeze({
  flag: [['path', { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' }], ['path', { d: 'M4 22v-7' }]],
});

/**
 * @param {Document} doc
 * @param {'info' | 'warn' | 'warning' | 'error' | 'danger' | 'ok' | 'success' | 'x' | 'copy' | 'download' | 'upload' | 'restore' | 'clock' | 'flag'} tone
 * @param {string} [className]
 * @returns {SVGSVGElement}
 */
export function glyph(doc, tone, className = 'glyph') {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of EXTRA[NAME[tone]] ?? ICONS[NAME[tone] ?? 'info']) {
    const n = doc.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    svg.appendChild(n);
  }
  return svg;
}
