// رموز لوحة النص المتزامن في صفحة يوتيوب (الهوية الرابعة «كتابٌ مفتوح»، docs/identity-v4.md). سكربت المحتوى لا يحمّل CSS من
// الإضافة، فالقيم هنا نصًا يوضع في ورقة الظل. المصدر الوحيد للحقيقة src/ui/tokens.css: كل قيمة هنا مطابقة لرمزها هناك بالوضعين،
// واختبار test/unit/player/panel/tokens.test.js يقرأ الملف ويقارن، فلا تنجرف لوحة الصفحة عن لوحة الصفحات. اللوحة تتبع وضع
// يوتيوب (html[dark]) لا وضع النظام، فالوضعان معًا هنا لا media query.
import { UI_FONT_BODY, UI_FONT_HEAD, UI_FONT_MONO } from '../../ui/ui-fonts.js';

/** الوضع الفاتح (:root في tokens.css). المفاتيح بصيغة camelCase، ورمز CSS كلٌّ منها --tj-<kebab>. */
const LIGHT = Object.freeze({
  bg: '#F3EFE6',
  surface: '#FFFDF8',
  surface2: '#EAE5DA',
  surface3: '#DFD9CC',
  sunken: '#EAE5DA',
  hover: 'rgb(24 46 43 / 5%)',
  pressed: 'rgb(24 46 43 / 10%)',
  text: '#182E2B',
  text2: '#4A5A58',
  muted: '#596865',
  onInk: '#FFFDF8',
  border: '#E2DDD2',
  borderStrong: '#CDC6B8',
  borderInput: '#85908D',
  brand: '#1E4A44',
  brandHover: '#173C37',
  brandInk: '#FFFFFF',
  brandSoft: '#E6EFEC',
  brandText: '#1E4A44',
  accent: '#B9705A',
  accentText: '#8F4A36',
  accentSoft: '#F6E7E0',
  accentTrack: 'rgb(185 112 90 / 24%)',
  focus: '#B9705A',
  control: '#DFD9CC',
  controlHover: '#CDC6B8',
  controlPressed: '#CDC6B8',
  selected: '#1E4A44',
  selectedInk: '#FFFFFF',
  selectedSoft: '#E6EFEC',
  selectedSoftInk: '#1E4A44',
  current: '#F6E7E0',
  currentInk: '#8F4A36',
  mark: '#B9705A',
  logoGlyph: '#1E4A44',
  logoWord: '#182E2B',
  success: '#2A6E46',
  successBg: '#E3F0E7',
  warning: '#8F5414',
  warningBg: '#F7EAD9',
  danger: '#B4383E',
  dangerBg: '#F8E3E3',
  info: '#38679A',
  infoBg: '#E3ECF5',
  e2: '0 0 0 1px rgb(24 46 43 / 10%), 0 4px 12px rgb(24 46 43 / 8%)',
  e3: '0 0 0 1px rgb(24 46 43 / 10%), 0 20px 48px rgb(24 46 43 / 16%)',
});

/** الوضع الداكن (:root[data-theme="dark"] في tokens.css). */
const DARK = Object.freeze({
  bg: '#0F1917',
  surface: '#16221F',
  surface2: '#1E2B28',
  surface3: '#263431',
  sunken: '#1E2B28',
  hover: 'rgb(237 233 224 / 6%)',
  pressed: 'rgb(237 233 224 / 11%)',
  text: '#EDE9E0',
  text2: '#B6B9B2',
  muted: '#8F9893',
  onInk: '#0F1917',
  border: '#26332F',
  borderStrong: '#33423D',
  borderInput: '#7E8A86',
  brand: '#EDE9E0',
  brandHover: '#FFFFFF',
  brandInk: '#0F1917',
  brandSoft: '#1F2F2B',
  brandText: '#CFE0DA',
  accent: '#D9937B',
  accentText: '#E2A48E',
  accentSoft: '#33251F',
  accentTrack: 'rgb(217 147 123 / 26%)',
  focus: '#D9937B',
  control: '#263431',
  controlHover: '#33423D',
  controlPressed: '#33423D',
  selected: '#EDE9E0',
  selectedInk: '#0F1917',
  selectedSoft: '#1F2F2B',
  selectedSoftInk: '#CFE0DA',
  current: '#33251F',
  currentInk: '#E2A48E',
  mark: '#D9937B',
  logoGlyph: '#EDE9E0',
  logoWord: '#EDE9E0',
  success: '#7CC79A',
  successBg: '#17291F',
  warning: '#E4B06A',
  warningBg: '#33291A',
  danger: '#F08C8C',
  dangerBg: '#351D1D',
  info: '#8FB4DC',
  infoBg: '#1A2634',
  e2: '0 0 0 1px rgb(255 255 255 / 10%), 0 4px 12px rgb(0 0 0 / 40%)',
  e3: '0 0 0 1px rgb(255 255 255 / 10%), 0 20px 48px rgb(0 0 0 / 60%)',
});

/** ما لا يتبدل بالوضع: الزوايا والارتفاعات والحركة والخطوط (:root وحده). */
const SHARED = Object.freeze({
  radiusSm: '4px',
  radiusMd: '6px',
  radiusLg: '10px',
  radiusXl: '16px',
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
