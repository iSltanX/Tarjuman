// أيقونات الشريط (figma-design-brief §٥.٢): ممتلئة بيضاء على شبكة 24 مثل أيقونات يوتيوب، بلون currentColor
// فتتبع حالات العادي والمرور والتعطيل. تُبنى بـcreateElementNS وtextContent وحدهما (لا HTML نصي).
import { UI_FONT_BODY } from '../../ui/ui-fonts.js';

const SVG = 'http://www.w3.org/2000/svg';

/** @param {Document} doc @param {string} tag @param {Record<string, string | number>} attrs @param {string} [text] */
function node(doc, tag, attrs, text) {
  const n = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
}

const STROKE = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

/**
 * مستطيل الترجمة الممتلئ (كأيقونة CC) بحرفين داكنين داخله. خط السطر محسوب لحدود الحرف في المراعي العريض (المضمّن) فيتوسط
 * الإطار (مركزه 10.5): «EN» ارتفاع الحرف الكبير 0.716em، و«ع» من −0.378em إلى 0.472em حول خط السطر.
 */
function captionBox(doc, label, fontSize, baseline) {
  return [
    node(doc, 'rect', { x: 1.5, y: 5, width: 14, height: 11, rx: 2.2, fill: 'currentColor' }),
    node(doc, 'text', {
      x: 8.5, y: baseline, 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 700, fill: '#000', 'fill-opacity': 0.82,
      // خط الواجهة المضمّن (ui-fonts.js) لا خط النظام: Brave يحجب غير الافتراضي منها عن صفحة يوتيوب.
      'font-family': UI_FONT_BODY,
    }, label),
  ];
}

const SHAPES = {
  download: (doc) => [
    ...captionBox(doc, 'EN', 6.4, 12.8),
    node(doc, 'path', { d: 'M19.5 5.5v9', ...STROKE }),
    node(doc, 'path', { d: 'M16.6 11.8l2.9 2.9 2.9-2.9', ...STROKE }),
    node(doc, 'path', { d: 'M16.2 19.2h6.6', ...STROKE }),
  ],
  upload: (doc) => [
    ...captionBox(doc, 'ع', 8.6, 10.9),
    node(doc, 'path', { d: 'M19.5 15.5v-9', ...STROKE }),
    node(doc, 'path', { d: 'M16.6 9.2l2.9-2.9 2.9 2.9', ...STROKE }),
    node(doc, 'path', { d: 'M16.2 19.2h6.6', ...STROKE }),
  ],
  minus: (doc) => [node(doc, 'path', { d: 'M6 12h12', ...STROKE, 'stroke-width': 2.6 })],
  plus: (doc) => [node(doc, 'path', { d: 'M12 6v12M6 12h12', ...STROKE, 'stroke-width': 2.6 })],
};

/**
 * @param {Document} doc
 * @param {'download' | 'upload' | 'minus' | 'plus'} kind
 * @returns {SVGSVGElement}
 */
export function playerIcon(doc, kind) {
  const svg = node(doc, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: 'icon' });
  for (const s of SHAPES[kind](doc)) svg.appendChild(s);
  return svg;
}
