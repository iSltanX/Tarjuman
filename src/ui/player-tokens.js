// رموز المشغّل لطبقة العرض والأدوات داخل يوتيوب (الهوية «التاء»، docs/identity.md). سكربت المحتوى لا يحمّل ملفات CSS من
// الإضافة، فتُعطى الرموز نصًا يوضع في <style> داخل Shadow DOM. المشغّل داكن بالوضعين: القوائم زجاج ليلي من ليل الأرجوان 92%
// بتمويه 14px، والإجراء الرئيسي والمحدد بالأرجوان المضيء الليلي. الترجمة فوق الفيديو بيضاء على أسود ولا تدخلها ألوان الهوية.
// الخطوط المضمّنة أولًا (ui-fonts.js).
import { UI_FONT_BODY, UI_FONT_HEAD, UI_FONT_MONO } from './ui-fonts.js';

export const PLAYER_TOKENS = Object.freeze({
  icon: 'rgb(255 255 255 / 92%)',
  iconHover: '#FFFFFF',
  iconDisabled: 'rgb(255 255 255 / 45%)',
  menuBg: 'rgb(21 12 18 / 92%)',
  menuText: '#F4EBF1',
  menuText2: '#C7B9C2',
  menuHover: 'rgb(255 255 255 / 10%)',
  menuLine: 'rgb(255 255 255 / 12%)',
  accent: '#E791C2',
  accentInk: '#150C12',
  selected: 'rgb(231 145 194 / 18%)',
  selectedInk: '#E791C2',
  warn: '#EBB25F',
  error: '#F28885',
  ok: '#7CCD8E',
  tooltipBg: 'rgb(21 12 18 / 92%)',
  subText: '#FFFFFF',
  subBgSoft: 'rgb(0 0 0 / 72%)',
  subBgSolid: 'rgb(0 0 0 / 92%)',
  subEn: 'rgb(255 255 255 / 85%)',
  fontHead: UI_FONT_HEAD,
  fontBody: UI_FONT_BODY,
  fontMono: UI_FONT_MONO,
  menuRadius: '10px',
  motionMenu: '180ms',
  motionToast: '180ms',
  motionSubtitle: '80ms',
});

const kebab = (s) => s.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);

/**
 * متغيرات CSS بالبادئة --tj-p- على المحدد المعطى (‎:host في Shadow DOM افتراضيًا).
 * @param {string} [selector]
 */
export function playerTokensCss(selector = ':host') {
  const body = Object.entries(PLAYER_TOKENS).map(([k, v]) => `--tj-p-${kebab(k)}: ${v};`).join(' ');
  return `${selector} { ${body} }`;
}
