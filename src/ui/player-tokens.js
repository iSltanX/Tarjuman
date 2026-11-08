// رموز المشغّل لطبقة العرض والأدوات داخل يوتيوب (الهوية الرابعة «كتابٌ مفتوح»، docs/identity.md؛ قيم .pl في project/tj.css
// للوحة الهوية). سكربت المحتوى لا يحمّل ملفات CSS من الإضافة، فتُعطى الرموز نصًا يُوضع في <style> داخل Shadow DOM. المشغّل داكن
// بالوضعين: القوائم زجاج ليلي من الصنوبر 92% بتمويه 14px فوق الفيديو، والإجراء الرئيسي بالطين الليلي بحبر داكن، والمحدد (الخانة
// والمقطّعة والخيار، وزر الشريط المفتوح) صبغة طين 18% بنص طيني. الترجمة فوق الفيديو بيضاء على أسود ولا تدخلها ألوان الهوية.
// الخطوط المضمّنة أولًا (ui-fonts.js).
import { UI_FONT_BODY, UI_FONT_HEAD, UI_FONT_MONO } from './ui-fonts.js';

export const PLAYER_TOKENS = Object.freeze({
  icon: 'rgb(255 255 255 / 92%)',
  iconHover: '#FFFFFF',
  iconDisabled: 'rgb(255 255 255 / 45%)',
  menuBg: 'rgb(15 25 23 / 92%)',
  menuText: '#F1EFE8',
  menuText2: '#B6B9B2',
  menuHover: 'rgb(255 255 255 / 10%)',
  menuLine: 'rgb(255 255 255 / 12%)',
  accent: '#D9937B',
  accentInk: '#0F1917',
  selected: 'rgb(217 147 123 / 18%)',
  selectedInk: '#D9937B',
  warn: '#E4B06A',
  error: '#F08C8C',
  ok: '#7CC79A',
  tooltipBg: 'rgb(15 25 23 / 92%)',
  subText: '#FFFFFF',
  subBgSoft: 'rgb(0 0 0 / 72%)',
  subBgSolid: 'rgb(0 0 0 / 92%)',
  subEn: 'rgb(255 255 255 / 85%)',
  fontHead: UI_FONT_HEAD,
  fontBody: UI_FONT_BODY,
  fontMono: UI_FONT_MONO,
  menuRadius: '12px',
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
