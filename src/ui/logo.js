// الشعار المعتمد «التاء» (قرار سلطان 2026-11-14، docs/identity.md): نقطتا التاء نقطتا قلم (معيّن مائل بزاوية القلم) فوق كتاب
// مفتوح سطحه جسم التاء، بوحدة m = 12 في إطار 240 × 195. وتحت 32 بكسل النسخة الصغيرة: الطرفان أخفض والثنية أعرض، والنقطتان
// كما هما. الرمز بالأرجوان العميق من --tj-logo-glyph، والاسم «ترجمان» نصٌّ بخط Cairo 800 المضمّن بلون الحبر، والرمز في
// البداية. لا يُقلب في RTL، ولا ينزل الرمز عن 24 متجهًا (16 و20 رسمٌ بكسلي في الأيقونة وحدها).
import { getDir, t } from '../i18n/index.js';

const SVG = 'http://www.w3.org/2000/svg';

/** إطار الرمز: 20m × 16.25m. */
export const LOGO_VIEWBOX = '0 0 240 195';
export const LOGO_RATIO = 240 / 195;

/** النقطتان: نقطتا قلم، قطرهما الرأسي 8m والأفقي 7m وميلهما 1m، وبينهما 1m. واحدة في النسختين. */
export const MARK_DOTS = Object.freeze(['M84 0L115.5 51L60 102L28.5 51Z', 'M180 0L211.5 51L156 102L124.5 51Z']);
/** الجسم في النسخة الأساسية: طرفان على 10m، وثنية الكعب على 13.5m بانحناءة عرضها 1m، والقاعدة على 17m. */
export const MARK_BOOK = 'M0 111C52 111 90 133 114 150Q120 154.5 126 150C150 133 188 111 240 111L240 195L0 195Z';
/** الجسم في النسخة الصغيرة (تحت 32 بكسل): الطرفان أخفض 1m والثنية أعرض. */
export const MARK_BOOK_SMALL = 'M0 123C52 123 90 141 112 158Q120 162.5 128 158C150 141 188 123 240 123L240 195L0 195Z';
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
export function logo({ width = 24, wordSize = 18, word = true, label = t('common.productName'), className = '', doc = document } = {}) {
  const root = doc.createElement('span');
  root.className = `tj-logo ${className}`.trim();
  root.setAttribute('dir', getDir());
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
    w.textContent = t('common.productName');
    root.append(w);
  }
  return root;
}
