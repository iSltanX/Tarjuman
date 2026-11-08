// الشعار المعتمد «كتابٌ مفتوح» (الهوية الرابعة، قرار سلطان 2026-11-07، docs/identity.md): نقطتا التاء معيّنان متلامسان فوق
// كتاب مفتوح، فيُقرأ الشكل تاءً وكتابًا معًا. الاتجاه A «الأصيل المضبوط» بنسب φ من قطر المعيّن D = 100، في إطار 200 × 176.4.
// المسارات حرفيًا من الرمزين #logo و#logoS في لوحة الهوية (project/*.dc.html، الإصدار 1794035287-e3de)، ومنهما ملف المصدر
// tools/brand/tarjuman-A-asil.svg وأيقونات الإضافة (tools/brand/icons.mjs). وتحت 32 بكسل تُستعمل النسخة المصحّحة #logoS: الفجوة
// D/φ³ والكتاب أنحف، فلا تلتحم النقطتان بالكتاب (لوحة 03). الرمز صنوبر (عاج في الداكن) من --tj-logo-glyph، والاسم «ترجمان» نصٌّ
// بخط Cairo 800 المضمّن بلون الحبر، والرمز في البداية (يمين الاسم في RTL). لا يُقلب في RTL، ولا ينزل الرمز عن 16.

const SVG = 'http://www.w3.org/2000/svg';

/** إطار الرمز كما في اللوحة: العرض 2D والارتفاع 1.764D. */
export const LOGO_VIEWBOX = '0 0 200 176.4';
export const LOGO_RATIO = 200 / 176.4;

/** النقطتان: معيّنان قطرهما D = 100 متلامسان عند x = 100. واحدة في الرمزين. */
export const MARK_DOTS = Object.freeze(['M50 0L100 50 50 100 0 50Z', 'M150 0L200 50 150 100 100 50Z']);
/** الكتاب في الرمز الأساسي #logo: كتف مسطّح D/φ⁴، وغور الكعب D/φ³، وارتفاع D/φ، والفجوة فوقه D/φ⁴. */
export const MARK_BOOK = 'M0 114.6H23.6C46.5 114.6 71 124.2 100 152.8C129 124.2 153.5 114.6 176.4 114.6H200V176.4H0Z';
/** الكتاب في النسخة المصحّحة #logoS (تحت 32 بكسل): الفجوة D/φ³ والكتاب أنحف (D/φ − D/φ⁴). */
export const MARK_BOOK_SMALL = 'M0 123.6H23.6C50 123.6 76 132 100 158C124 132 150 123.6 176.4 123.6H200V176.4H0Z';
/** الحد الذي تُستعمل تحته النسخة المصحّحة (عرض الرمز بالبكسل). */
export const SMALL_BELOW = 32;

/**
 * الرمز وحده SVG مضمّن بلون currentColor (أو رموز الشعار في الصفحات عبر أصنافه).
 * @param {{ width?: number, small?: boolean, className?: string, doc?: Document }} [o] small افتراضيًا للعرض دون 32
 */
export function logoMark({ width = 24, small = width < SMALL_BELOW, className = 'tj-logo__mark', doc = document } = {}) {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', LOGO_VIEWBOX);
  svg.setAttribute('class', className);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(Math.round((width / LOGO_RATIO) * 10) / 10));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [cls, d] of [['tj-logo__dots', MARK_DOTS[0]], ['tj-logo__dots', MARK_DOTS[1]], ['tj-logo__book', small ? MARK_BOOK_SMALL : MARK_BOOK]]) {
    const p = doc.createElementNS(SVG, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/**
 * الشعار بالتركيب الأفقي: الرمز ثم الاسم «ترجمان» نصًّا بـCairo 800. العرض للرمز بالبكسل، وحجم الاسم بالبكسل (رأس النافذة
 * والشريط العلوي: رمز 24 واسم 18). label null يجعله زخرفيًا (حين يسمّيه عنصر حوله).
 * @param {{ width?: number, wordSize?: number, word?: boolean, label?: string | null, className?: string, doc?: Document }} [o]
 */
export function logo({ width = 24, wordSize = 18, word = true, label = 'ترجمان', className = '', doc = document } = {}) {
  const root = doc.createElement('span');
  root.className = `tj-logo ${className}`.trim();
  root.setAttribute('dir', 'rtl');
  if (label) {
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', label);
  } else {
    root.setAttribute('aria-hidden', 'true');
  }
  root.append(logoMark({ width, doc }));
  if (word) {
    const w = doc.createElement('span');
    w.className = 'tj-logo__word';
    w.setAttribute('aria-hidden', 'true');
    w.style.fontSize = `${wordSize}px`;
    w.style.lineHeight = `${Math.round(wordSize * 4 / 3)}px`;
    w.textContent = 'ترجمان';
    root.append(w);
  }
  return root;
}
