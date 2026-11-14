// أيقونات الشريط (الهوية الرابعة، لوحة 10): أيقونات الهوية نفسها (src/ui/icons.js، شبكة 20) بخط أبيض أسمك قليلًا 1.9 كأيقونات
// يوتيوب المجاورة، بحجم 18/20/22/26 بحسب مساحة المشغّل. لا حروف ولا صناديق: اسم الوظيفة في التلميح واسم الوصول، واللغة واسم
// الملف داخل القائمة. اللون currentColor فتتبع حالات العادي والمرور والتعطيل. تُبنى بـcreateElementNS وsetAttribute وحدهما.
import { ICON_VIEWBOX, IDENTITY_ICONS } from '../../ui/icons.js';

const SVG = 'http://www.w3.org/2000/svg';

export const PLAYER_STROKE = 1.9;
const STROKE = { fill: 'none', stroke: 'currentColor', 'stroke-width': PLAYER_STROKE, 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'stroke-miterlimit': 4 };

/** @param {Document} doc @param {string} tag @param {Record<string, string | number>} attrs */
function node(doc, tag, attrs) {
  const n = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/** أدوات الشريط ← أيقونة الهوية: تحميل الأصل، ورفع الترجمة، والنص المتزامن، وتقديم وتأخير. */
const KIND = Object.freeze({ download: 'download', upload: 'upload', panel: 'panel', minus: 'minus', plus: 'plus' });

/**
 * @param {Document} doc
 * @param {'download' | 'upload' | 'panel' | 'minus' | 'plus'} kind upload زر الترجمة (يرفع ملفًا أو يفتح قائمة الترجمة)، وpanel زر اللوحة
 * @returns {SVGSVGElement}
 */
export function playerIcon(doc, kind) {
  const svg = node(doc, 'svg', { viewBox: ICON_VIEWBOX, 'aria-hidden': 'true', focusable: 'false', class: 'icon' });
  for (const [tag, attrs] of IDENTITY_ICONS[KIND[kind]]) svg.appendChild(node(doc, tag, { ...STROKE, ...attrs }));
  return svg;
}
