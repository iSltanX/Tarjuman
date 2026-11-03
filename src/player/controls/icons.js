// أيقونات الشريط — السلسلة «ب» (الهوية «بُنّ على ورق»، قرار سلطان 2026-11-03، docs/identity-redesign.md): خطوط بيضاء
// على شبكة 24 بسُمك 1.9 ونهايات مدوّرة كأيقونات يوتيوب المجاورة، وحجم بصري واحد في الخمسة. لا حروف ولا صناديق: اسم
// الوظيفة في التلميح واسم الوصول، واللغة واسم الملف داخل القائمة. اللون currentColor فتتبع حالات العادي والمرور والتعطيل.
// تُبنى بـcreateElementNS وsetAttribute وحدهما (لا HTML نصي).

const SVG = 'http://www.w3.org/2000/svg';

/** @param {Document} doc @param {string} tag @param {Record<string, string | number>} attrs */
function node(doc, tag, attrs) {
  const n = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

export const PLAYER_STROKE = 1.9;
const STROKE = { fill: 'none', stroke: 'currentColor', 'stroke-width': PLAYER_STROKE, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

const SHAPES = {
  // تحميل الأصل: سهم ينزل على سطر.
  download: (doc) => [
    node(doc, 'path', { d: 'M12 3.5v12.5', ...STROKE }),
    node(doc, 'path', { d: 'M7 11l5 5 5-5', ...STROKE }),
    node(doc, 'path', { d: 'M5 20.5h14', ...STROKE }),
  ],
  // الترجمة: فقاعتا حديث متداخلتان.
  upload: (doc) => [
    node(doc, 'path', { d: 'M4 3h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3.5 3V12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', ...STROKE }),
    node(doc, 'path', { d: 'M17.5 10H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1v3l-3.5-3H11a2 2 0 0 1-2-2v-1.5', ...STROKE }),
  ],
  // النص المتزامن: إطار المشغّل وعمود اللوحة يمينه بثلاثة أسطر (اللوحة يمين الفيديو).
  panel: (doc) => [
    node(doc, 'rect', { x: 2.5, y: 4.5, width: 19, height: 15, rx: 2.5, ...STROKE }),
    node(doc, 'path', { d: 'M14.5 4.5v15', ...STROKE }),
    node(doc, 'path', { d: 'M17 9h1.5M17 12h1.5M17 15h1.5', ...STROKE }),
  ],
  minus: (doc) => [node(doc, 'path', { d: 'M5.5 12h13', ...STROKE })],
  plus: (doc) => [node(doc, 'path', { d: 'M12 5.5v13M5.5 12h13', ...STROKE })],
};

/**
 * @param {Document} doc
 * @param {'download' | 'upload' | 'panel' | 'minus' | 'plus'} kind upload زر الترجمة (يرفع ملفًا أو يفتح قائمة الترجمة)، وpanel زر اللوحة
 * @returns {SVGSVGElement}
 */
export function playerIcon(doc, kind) {
  const svg = node(doc, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: 'icon' });
  for (const s of SHAPES[kind](doc)) svg.appendChild(s);
  return svg;
}
