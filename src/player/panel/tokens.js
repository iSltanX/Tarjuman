// رموز لوحة النص المتزامن في صفحة يوتيوب (الهوية الثالثة «باذنجاني على رمادي»، docs/identity-v3.md). سكربت المحتوى لا يحمّل
// CSS من الإضافة، فالقيم هنا نصًا يوضع في ورقة الظل. المصدر الوحيد للحقيقة src/ui/tokens.css: كل قيمة هنا مطابقة لرمزها
// هناك بالوضعين، واختبار test/unit/player/panel/tokens.test.js يقرأ الملف ويقارن، فلا تنجرف لوحة الصفحة عن لوحة الصفحات.
// اللوحة تتبع وضع يوتيوب (html[dark]) لا وضع النظام، فالوضعان معًا هنا لا media query.
import { UI_FONT_BODY, UI_FONT_HEAD, UI_FONT_MONO } from '../../ui/ui-fonts.js';

/** الوضع الفاتح (:root في tokens.css). المفاتيح بصيغة camelCase، ورمز CSS كلٌّ منها --tj-<kebab>. */
const LIGHT = Object.freeze({
  bg: '#F6F5F4',
  surface: '#FEFEFD',
  surface2: '#E8E7E6',
  sunken: '#F0EEEE',
  hover: 'rgb(34 28 33 / 5%)',
  pressed: 'rgb(34 28 33 / 9%)',
  text: '#221C21',
  text2: '#5B575A',
  muted: '#666165',
  border: '#E3E1E1',
  borderStrong: '#D6D4D4',
  borderInput: '#817E80',
  brand: '#6B2D5E',
  brandHover: '#5B2951',
  brandInk: '#FEFEFD',
  brandSoft: '#F5F1F3',
  brandText: '#5B2951',
  brandTrack: 'rgb(107 45 94 / 18%)',
  focus: '#6B2D5E',
  control: '#E8E7E6',
  controlHover: '#DFDDDD',
  controlPressed: '#D4D2D2',
  selected: '#E1D4DD',
  selectedInk: '#5B2951',
  success: '#2E6A4C',
  successBg: '#E9EFEB',
  danger: '#B0302A',
  dangerBg: '#F6E9E8',
  e2: '0 0 0 1px rgb(34 28 33 / 10%)',
});

/** الوضع الداكن (:root[data-theme="dark"] في tokens.css). */
const DARK = Object.freeze({
  bg: '#121112',
  surface: '#1E1D1E',
  surface2: '#2B292A',
  sunken: '#0D0C0D',
  hover: 'rgb(241 237 239 / 6%)',
  pressed: 'rgb(241 237 239 / 10%)',
  text: '#F1EDEF',
  text2: '#B5B2B3',
  muted: '#979596', // فُتّح من #939192 (Q26، تدقيق 7a66f91): ≥ 4.5:1 على الصف الحالي (brandSoft)
  border: '#262526',
  borderStrong: '#313031',
  borderInput: '#827F81',
  brand: '#D9A7CB',
  brandHover: '#E0BCD6',
  brandInk: '#0E0E0E',
  brandSoft: '#312B2F',
  brandText: '#E0BCD6',
  brandTrack: 'rgb(217 167 203 / 24%)',
  focus: '#D9A7CB',
  control: '#2B292A',
  controlHover: '#363435',
  controlPressed: '#413F40',
  selected: '#4B3E48',
  selectedInk: '#E6CEDF',
  success: '#8DCDA9',
  successBg: '#292F2C',
  danger: '#F4A58C',
  dangerBg: '#382D2B',
  e2: '0 0 0 1px rgb(255 255 255 / 12%)',
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
