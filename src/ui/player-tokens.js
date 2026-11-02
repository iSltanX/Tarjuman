// رموز المشغّل (figma-design-brief.md §٣.٢ و§٣.٣، وجولة الصقل) لطبقة العرض والأدوات داخل يوتيوب. سكربت المحتوى لا
// يحمّل ملفات CSS من الإضافة، فتُعطى الرموز نصًا يُوضع في <style> داخل Shadow DOM أو عنصر الأدوات. القوائم داكنة محايدة
// بلا صبغة فوق الفيديو، ولون الإبراز النيلي الفاتح نفسه في الصفحات (الوضع الداكن). الخطوط المضمّنة أولًا (ui-fonts.js).
import { UI_FONT_BODY, UI_FONT_HEAD, UI_FONT_MONO } from './ui-fonts.js';

export const PLAYER_TOKENS = Object.freeze({
  icon: 'rgb(255 255 255 / 90%)',
  iconHover: '#FFFFFF',
  iconDisabled: 'rgb(255 255 255 / 40%)',
  menuBg: 'rgb(22 22 28 / 94%)',
  menuText: '#FFFFFF',
  menuText2: 'rgb(255 255 255 / 72%)',
  menuHover: 'rgb(255 255 255 / 10%)',
  menuLine: 'rgb(255 255 255 / 12%)',
  accent: '#A5ACFF',
  accentInk: '#14143A',
  warn: '#EBC06A',
  error: '#FF8F85',
  ok: '#70D191',
  tooltipBg: 'rgb(22 22 28 / 92%)',
  subText: '#FFFFFF',
  subBgSoft: 'rgb(0 0 0 / 72%)',
  subBgSolid: 'rgb(0 0 0 / 92%)',
  subEn: 'rgb(255 255 255 / 85%)',
  fontHead: UI_FONT_HEAD,
  fontBody: UI_FONT_BODY,
  fontMono: UI_FONT_MONO,
  menuRadius: '12px',
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
