// رموز المشغّل لطبقة العرض والأدوات واللوحة الجانبية داخل يوتيوب (الهوية «بُنّ على ورق»، docs/identity-redesign.md).
// سكربت المحتوى لا يحمّل ملفات CSS من الإضافة، فتُعطى الرموز نصًا يُوضع في <style> داخل Shadow DOM. القوائم مداد دافئ
// شفاف فوق الفيديو، والاختيار بالكراميل نفسه في الصفحات (الوضع الداكن). الخطوط المضمّنة أولًا (ui-fonts.js).
import { UI_FONT_BODY, UI_FONT_HEAD, UI_FONT_MONO } from './ui-fonts.js';

export const PLAYER_TOKENS = Object.freeze({
  icon: 'rgb(255 255 255 / 90%)',
  iconHover: '#FFFFFF',
  iconDisabled: 'rgb(255 255 255 / 40%)',
  menuBg: 'rgb(33 29 26 / 94%)',
  menuText: '#FFFFFF',
  menuText2: '#D6CDC1',
  menuHover: 'rgb(255 255 255 / 10%)',
  menuLine: 'rgb(255 255 255 / 12%)',
  accent: '#D6B38F',
  accentInk: '#2B1B10',
  warn: '#E5C170',
  error: '#EC8094',
  ok: '#86CF9D',
  tooltipBg: 'rgb(33 29 26 / 94%)',
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
