// رموز لوحة النص المتزامن في صفحة يوتيوب (الهوية «بُنّ على ورق»، docs/identity-redesign.md §٢ و§٤). سكربت المحتوى لا يحمّل
// CSS من الإضافة، فالقيم هنا نصًا يوضع في ورقة الظل. المصدر الوحيد للحقيقة src/ui/tokens.css: كل قيمة هنا مطابقة لرمزها
// هناك بالوضعين، واختبار test/unit/player/panel/tokens.test.js يقرأ الملف ويقارن، فلا تنجرف لوحة الصفحة عن لوحة الصفحات.
// اللوحة تتبع وضع يوتيوب (html[dark]) لا وضع النظام، فالوضعان معًا هنا لا media query.
import { UI_FONT_BODY, UI_FONT_HEAD, UI_FONT_MONO } from '../../ui/ui-fonts.js';

/** الوضع الفاتح (:root في tokens.css). المفاتيح بصيغة camelCase، ورمز CSS كلٌّ منها --tj-<kebab>. */
const LIGHT = Object.freeze({
  bg: '#FAF8F4',
  surface: '#FFFFFF',
  surface2: '#F1EDE6',
  sunken: '#F6F3EE',
  hover: 'rgb(31 26 22 / 4.5%)',
  pressed: 'rgb(31 26 22 / 8%)',
  text: '#1F1A16',
  text2: '#4B423B',
  muted: '#6B5F57',
  border: '#E8E3DB',
  borderStrong: '#DAD3C8',
  borderInput: '#867B70',
  brand: '#5C4434',
  brandHover: '#47342A',
  brandInk: '#FFFFFF',
  brandSoft: '#F0E7DD',
  brandText: '#4E3A2C',
  brandTrack: 'rgb(92 68 52 / 18%)',
  focus: '#5C4434',
  logoDots: '#C9A24D',
  success: '#2A7A47',
  successBg: '#EAF5EE',
  danger: '#B0273F',
  dangerBg: '#FCEAEE',
  e2: '0 0 0 1px rgb(31 26 22 / 10%), 0 8px 24px rgb(31 26 22 / 8%)',
});

/** الوضع الداكن (:root[data-theme="dark"] في tokens.css). */
const DARK = Object.freeze({
  bg: '#1F1C1A',
  surface: '#292522',
  surface2: '#332E2A',
  sunken: '#1A1816',
  hover: 'rgb(245 240 230 / 6%)',
  pressed: 'rgb(245 240 230 / 10%)',
  text: '#F5F0E6',
  text2: '#D6CDC1',
  muted: '#ACA297',
  border: '#352F2A',
  borderStrong: '#3F3832',
  borderInput: '#8A7F74',
  brand: '#D6B38F',
  brandHover: '#E4CBB0',
  brandInk: '#2B1B10',
  brandSoft: '#3A2E25',
  brandText: '#E4CBB0',
  brandTrack: 'rgb(214 179 143 / 22%)',
  focus: '#E4CBB0',
  logoDots: '#E2C27A',
  success: '#86CF9D',
  successBg: '#1B3225',
  danger: '#EC8094',
  dangerBg: '#3E1620',
  e2: '0 0 0 1px rgb(255 255 255 / 14%), 0 8px 24px rgb(0 0 0 / 40%)',
});

/** ما لا يتبدل بالوضع: الزوايا والارتفاعات والحركة والخطوط (:root وحده). */
const SHARED = Object.freeze({
  radiusSm: '4px',
  radiusMd: '6px',
  radiusLg: '10px',
  radiusXl: '14px',
  controlSm: '32px',
  controlLg: '40px',
  motionMenu: '140ms',
  motionToast: '180ms',
  ease: 'cubic-bezier(0.2, 0, 0, 1)',
  fontHead: UI_FONT_HEAD,
  fontBody: UI_FONT_BODY,
  fontMono: UI_FONT_MONO,
});

export const PANEL_TOKENS = Object.freeze({ light: LIGHT, dark: DARK, shared: SHARED });

const kebab = (s) => s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);

// استثناء وحيد من القاعدة: --tj-e2 (لا --tj-e-2) كما في tokens.css.
const IRREGULAR = Object.freeze({ e2: '--tj-e2' });

/** رمز CSS لمفتاح: surface2 ← --tj-surface-2، وe2 ← --tj-e2. @param {string} key */
export const tokenName = (key) => IRREGULAR[key] ?? `--tj-${kebab(key)}`;

const block = (selector, map) => `${selector} { ${Object.entries(map).map(([k, v]) => `${tokenName(k)}: ${v};`).join(' ')} }`;

/**
 * متغيرات CSS على جذر اللوحة: الفاتح والمشترك افتراضيًا، والداكن حين data-theme="dark".
 * @param {string} [root] محدد الجذر داخل الظل
 */
export function panelTokensCss(root = '.root') {
  return [
    block(root, { ...SHARED, ...LIGHT }),
    block(`${root}[data-theme="dark"]`, DARK),
  ].join('\n');
}
