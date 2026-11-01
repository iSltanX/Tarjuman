// هندسة الطبقة (figma-design-brief §٧.١): حجم الخط نسبي لارتفاع المشغّل (نحو 4.6%: 22px عند 480px) مضروبًا في نسبة
// الحجم من الإعدادات (appearance.scale من 70% إلى 160%، والافتراضي 100%)، والموضع «أسفل» 8% و«مرتفع» 20% و«أعلى» 8%
// من الأعلى، وترتفع الطبقة السفلية فوق شريط التحكم حين يظهر وتنزل حين يختفي. حسابات نقية تُختبر بلا متصفح.
import { LEGACY_SUBTITLE_SIZES, SUBTITLE_SCALE } from '../../core/model/settings.js';

export const BASE_FONT_RATIO = 0.046;
export const MIN_FONT_PX = 12;
export const POSITION_PCT = Object.freeze({ bottom: 8, raised: 20, top: 8 });
/** مسافة أمان بين أسفل الترجمة وأعلى شريط التحكم حين يظهر. */
export const CHROME_GAP_PX = 8;

/**
 * نسبة الحجم المئوية من المظهر: appearance.scale مقصورة على حدّيها، والمقاس القديم (s/m/l/xl) بنسبته إن وصل
 * (القراءة المتسامحة للإعدادات تحوّله قبل ذلك)، وإلا الافتراضي.
 * @param {{ scale?: unknown, size?: unknown }} appearance
 */
export function scaleOf(appearance) {
  const v = appearance?.scale;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(SUBTITLE_SCALE.max, Math.max(SUBTITLE_SCALE.min, v));
  const legacy = appearance?.size;
  if (typeof legacy === 'string' && Object.hasOwn(LEGACY_SUBTITLE_SIZES, legacy)) return LEGACY_SUBTITLE_SIZES[legacy];
  return SUBTITLE_SCALE.default;
}

/**
 * @param {number} playerHeight ارتفاع المشغّل بالبكسل
 * @param {number} scale نسبة الحجم المئوية (من 70 إلى 160)
 */
export const fontPx = (playerHeight, scale) => {
  const h = Number.isFinite(playerHeight) && playerHeight > 0 ? playerHeight : 0;
  const pct = Number.isFinite(scale) && scale > 0 ? scale : SUBTITLE_SCALE.default;
  return Math.max(MIN_FONT_PX, Math.round(h * BASE_FONT_RATIO * (pct / 100)));
};

/**
 * @param {{
 *   appearance: { scale: number, position: 'bottom' | 'raised' | 'top' },
 *   playerHeight: number,
 *   chromeLift: number, المسافة من أسفل المشغّل إلى أعلى شريط التحكم وهو ظاهر (صفر إن اختفى)
 * }} p
 * @returns {{ fontPx: number, anchor: 'top' | 'bottom', offsetPx: number }}
 */
export function layoutFor({ appearance, playerHeight, chromeLift }) {
  const h = Number.isFinite(playerHeight) && playerHeight > 0 ? playerHeight : 0;
  const base = Math.round((h * POSITION_PCT[appearance.position]) / 100);
  const px = fontPx(h, scaleOf(appearance));
  if (appearance.position === 'top') return { fontPx: px, anchor: 'top', offsetPx: base };
  const lift = chromeLift > 0 ? Math.round(chromeLift + CHROME_GAP_PX) : 0;
  return { fontPx: px, anchor: 'bottom', offsetPx: Math.max(base, lift) };
}
