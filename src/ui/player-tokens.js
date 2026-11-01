// رموز المشغّل (figma-design-brief.md §٣.٢ و§٣.٣) لطبقة العرض والأدوات داخل يوتيوب. سكربت المحتوى لا
// يحمّل ملفات CSS من الإضافة، فتُعطى الرموز نصًا يُوضع في <style> داخل Shadow DOM أو عنصر الأدوات.

export const PLAYER_TOKENS = Object.freeze({
  icon: 'rgb(255 255 255 / 90%)',
  iconHover: '#FFFFFF',
  iconDisabled: 'rgb(255 255 255 / 40%)',
  menuBg: 'rgb(28 28 28 / 92%)',
  menuText: '#FFFFFF',
  menuText2: 'rgb(255 255 255 / 70%)',
  menuHover: 'rgb(255 255 255 / 10%)',
  accent: '#4EC9C4',
  warn: '#F0C46A',
  error: '#FF8A80',
  ok: '#73D394',
  tooltipBg: 'rgb(28 28 28 / 90%)',
  subText: '#FFFFFF',
  subBgSoft: 'rgb(0 0 0 / 72%)',
  subBgSolid: 'rgb(0 0 0 / 92%)',
  subEn: 'rgb(255 255 255 / 85%)',
  fontHead: '"Cairo", "Almarai", "SF Arabic", Tahoma, sans-serif',
  fontBody: '"Almarai", "SF Arabic", "Noto Sans Arabic", Tahoma, sans-serif',
  fontMono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
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
