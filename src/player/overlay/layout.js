// هندسة الطبقة (figma-design-brief §٧.١): حجم الخط نسبي لارتفاع المشغّل (نحو 4.6%: 22px عند 480px)،
// وأربعة مقاسات 85/100/120/145%، والموضع «أسفل» 8% و«مرتفع» 20% و«أعلى» 8% من الأعلى، وترتفع الطبقة السفلية
// فوق شريط التحكم حين يظهر وتنزل حين يختفي. حسابات نقية تُختبر بلا متصفح.

export const SIZE_SCALE = Object.freeze({ s: 0.85, m: 1, l: 1.2, xl: 1.45 });
export const BASE_FONT_RATIO = 0.046;
export const MIN_FONT_PX = 12;
export const POSITION_PCT = Object.freeze({ bottom: 8, raised: 20, top: 8 });
/** مسافة أمان بين أسفل الترجمة وأعلى شريط التحكم حين يظهر. */
export const CHROME_GAP_PX = 8;

/**
 * @param {number} playerHeight ارتفاع المشغّل بالبكسل
 * @param {'s' | 'm' | 'l' | 'xl'} size
 */
export const fontPx = (playerHeight, size) => {
  const h = Number.isFinite(playerHeight) && playerHeight > 0 ? playerHeight : 0;
  return Math.max(MIN_FONT_PX, Math.round(h * BASE_FONT_RATIO * (SIZE_SCALE[size] ?? 1)));
};

/**
 * @param {{
 *   appearance: { size: 's' | 'm' | 'l' | 'xl', position: 'bottom' | 'raised' | 'top' },
 *   playerHeight: number,
 *   chromeLift: number, المسافة من أسفل المشغّل إلى أعلى شريط التحكم وهو ظاهر (صفر إن اختفى)
 * }} p
 * @returns {{ fontPx: number, anchor: 'top' | 'bottom', offsetPx: number }}
 */
export function layoutFor({ appearance, playerHeight, chromeLift }) {
  const h = Number.isFinite(playerHeight) && playerHeight > 0 ? playerHeight : 0;
  const base = Math.round((h * POSITION_PCT[appearance.position]) / 100);
  if (appearance.position === 'top') return { fontPx: fontPx(h, appearance.size), anchor: 'top', offsetPx: base };
  const lift = chromeLift > 0 ? Math.round(chromeLift + CHROME_GAP_PX) : 0;
  return { fontPx: fontPx(h, appearance.size), anchor: 'bottom', offsetPx: Math.max(base, lift) };
}
