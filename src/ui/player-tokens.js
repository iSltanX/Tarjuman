// رموز المشغّل لطبقة العرض والأدوات داخل يوتيوب (الهوية الثالثة «باذنجاني على رمادي»، docs/identity-v3.md). سكربت المحتوى لا
// يحمّل ملفات CSS من الإضافة، فتُعطى الرموز نصًا يُوضع في <style> داخل Shadow DOM. المشغّل داكن بالوضعين: القوائم زجاج من ليل
// النظام 94% فوق الفيديو، والإجراء الرئيسي باذنجاني فاتح بحبر داكن، والمحدد (الخانة والمقطّعة والخيار، وزر الشريط المضغوط أو
// المفتوح) صبغة باذنجانية داكنة بنص فاتح بلا إطار. الخطوط المضمّنة أولًا (ui-fonts.js).
import { UI_FONT_BODY, UI_FONT_HEAD, UI_FONT_MONO } from './ui-fonts.js';

export const PLAYER_TOKENS = Object.freeze({
  icon: 'rgb(255 255 255 / 90%)',
  iconHover: '#FFFFFF',
  iconDisabled: 'rgb(255 255 255 / 40%)',
  menuBg: 'rgb(18 17 18 / 94%)',
  menuText: '#F4F2ED',
  menuText2: '#B5B2B3',
  menuHover: 'rgb(255 255 255 / 10%)',
  menuLine: 'rgb(255 255 255 / 12%)',
  accent: '#D9A7CB',
  accentInk: '#0E0E0E',
  selected: '#4B3E48',
  selectedInk: '#E6CEDF',
  warn: '#E6C077',
  error: '#F4A58C',
  ok: '#8DCDA9',
  tooltipBg: 'rgb(18 17 18 / 94%)',
  subText: '#FFFFFF',
  subBgSoft: 'rgb(0 0 0 / 72%)',
  subBgSolid: 'rgb(0 0 0 / 92%)',
  subEn: 'rgb(255 255 255 / 85%)',
  fontHead: UI_FONT_HEAD,
  fontBody: UI_FONT_BODY,
  fontMono: UI_FONT_MONO,
  menuRadius: '10px',
  motionMenu: '140ms',
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
