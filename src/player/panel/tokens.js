// رموز لوحة النص المتزامن في صفحة يوتيوب (الهوية الخامسة «التاء»، docs/identity.md). سكربت المحتوى لا يحمّل CSS من
// الإضافة، فالقيم هنا نصًا يوضع في ورقة الظل. المصدر الوحيد للحقيقة src/ui/tokens.css: كل قيمة هنا مطابقة لرمزها هناك بالوضعين،
// واختبار test/unit/player/panel/tokens.test.js يقرأ الملف ويقارن، فلا تنجرف لوحة الصفحة عن لوحة الصفحات. اللوحة تتبع وضع
// يوتيوب (html[dark]) لا وضع النظام، فالوضعان معًا هنا لا media query.
import { UI_FONT_BODY, UI_FONT_HEAD, UI_FONT_MONO } from '../../ui/ui-fonts.js';

/** الوضع الفاتح (:root في tokens.css). المفاتيح بصيغة camelCase، ورمز CSS كلٌّ منها --tj-<kebab>. */
const LIGHT = Object.freeze({
  bg: '#F9F5F8',
  surface: '#FEFDFE',
  surface2: '#F2EAEF',
  surface3: '#E9E0E6',
  sunken: '#F2EAEF',
  hover: 'rgb(45 22 38 / 5%)',
  pressed: 'rgb(45 22 38 / 10%)',
  text: '#2D1626',
  text2: '#5B4653',
  muted: '#705D69',
  onInk: '#FEFDFE',
  border: '#E4DBE0',
  borderStrong: '#D2C7CE',
  borderInput: '#91818B',
  brand: '#682455',
  brandHover: '#581847',
  brandInk: '#FFFFFF',
  brandSoft: '#FBE8F4',
  brandText: '#682455',
  accent: '#A5397E',
  accentText: '#8B2868',
  accentSoft: '#FEE5F2',
  accentTrack: 'rgb(165 57 126 / 24%)',
  focus: '#A5397E',
  control: '#E9E0E6',
  controlHover: '#DCD0D7',
  controlPressed: '#DCD0D7',
  selected: '#682455',
  selectedInk: '#FFFFFF',
  selectedSoft: '#FBE8F4',
  selectedSoftInk: '#682455',
  current: '#FEE5F2',
  currentInk: '#8B2868',
  mark: '#A5397E',
  logoGlyph: '#682455',
  logoWord: '#2D1626',
  success: '#246E3A',
  successBg: '#E1F5E4',
  warning: '#97570D',
  warningBg: '#FEEDD7',
  danger: '#B63132',
  dangerBg: '#FFE7E6',
  info: '#2A669F',
  infoBg: '#E2F0FF',
  e2: '0 0 0 1px rgb(45 22 38 / 10%), 0 4px 12px rgb(45 22 38 / 8%)',
  e3: '0 0 0 1px rgb(45 22 38 / 10%), 0 20px 48px rgb(45 22 38 / 16%)',
});

/** الوضع الداكن (:root[data-theme="dark"] في tokens.css). */
const DARK = Object.freeze({
  bg: '#150C12',
  surface: '#20151D',
  surface2: '#2C1F28',
  surface3: '#372932',
  sunken: '#2C1F28',
  hover: 'rgb(244 235 241 / 6%)',
  pressed: 'rgb(244 235 241 / 11%)',
  text: '#F4EBF1',
  text2: '#C7B9C2',
  muted: '#A4939D',
  onInk: '#150C12',
  border: '#392B34',
  borderStrong: '#4A3A44',
  borderInput: '#816E7A',
  brand: '#F3E2EC',
  brandHover: '#FBF2F8',
  brandInk: '#150C12',
  brandSoft: '#382030',
  brandText: '#F0C5E1',
  accent: '#E791C2',
  accentText: '#F3AAD3',
  accentSoft: '#432135',
  accentTrack: 'rgb(231 145 194 / 26%)',
  focus: '#E791C2',
  control: '#372932',
  controlHover: '#4A3A44',
  controlPressed: '#4A3A44',
  selected: '#F3E2EC',
  selectedInk: '#150C12',
  selectedSoft: '#382030',
  selectedSoftInk: '#F0C5E1',
  current: '#432135',
  currentInk: '#F3AAD3',
  mark: '#E791C2',
  logoGlyph: '#F3E2EC',
  logoWord: '#F4EBF1',
  success: '#7CCD8E',
  successBg: '#172C1C',
  warning: '#EBB25F',
  warningBg: '#37250E',
  danger: '#F28885',
  dangerBg: '#3E1E1E',
  info: '#85B6E9',
  infoBg: '#172839',
  e2: '0 0 0 1px rgb(255 255 255 / 10%), 0 4px 12px rgb(0 0 0 / 40%)',
  e3: '0 0 0 1px rgb(255 255 255 / 10%), 0 20px 48px rgb(0 0 0 / 60%)',
});

/** ما لا يتبدل بالوضع: الزوايا والارتفاعات والحركة والخطوط (:root وحده). */
const SHARED = Object.freeze({
  radiusSm: '3px',
  radiusMd: '4px',
  radiusLg: '8px',
  radiusXl: '12px',
  controlSm: '32px',
  controlLg: '40px',
  motionFast: '120ms',
  motionMenu: '180ms',
  motionToast: '180ms',
  ease: 'cubic-bezier(0.2, 0, 0, 1)',
  fontHead: UI_FONT_HEAD,
  fontBody: UI_FONT_BODY,
  fontMono: UI_FONT_MONO,
});

export const PANEL_TOKENS = Object.freeze({ light: LIGHT, dark: DARK, shared: SHARED });

const kebab = (s) => s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);

// استثناءان من القاعدة: --tj-e2 و--tj-e3 (لا --tj-e-2) كما في tokens.css.
const IRREGULAR = Object.freeze({ e2: '--tj-e2', e3: '--tj-e3' });

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
