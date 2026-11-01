// نموذج الإعدادات بلا DOM (P7-AC4/AC8): قراءة حقول الإدخال بتحقق صارم يطابق نموذج الإعدادات (برموز PG_)، وحالة
// «الخط والحجم افتراضيان»، وهندسة المعاينة الحية. لا كتابة هنا: الكتابة في view.js عبر store.setSettings.
import { DEFAULT_SETTINGS, SUBTITLE_SCALE } from '../../core/model/settings.js';
import { PLAYER_TOKENS } from '../../ui/player-tokens.js';
import { subtitleFontStack } from '../../ui/subtitle-fonts.js';

/** أزرار الخطوة المعروضة: 0.5 و1 ثانية، وما عداهما «مخصص». */
export const STEP_PRESETS_MS = Object.freeze([500, 1000]);
/** الخطوة المخصصة: من 0.1 إلى 10 ثوانٍ بمضاعفات 0.1 (نموذج الإعدادات). */
export const STEP_RANGE_MS = Object.freeze({ min: 100, max: 10000, grid: 100 });
export const SPLIT_RANGE = Object.freeze({ min: 50, max: 2000 });
export const DRIFT_RANGE_MS = Object.freeze({ min: 10, max: 5000 });
export const COMPLETENESS_RANGE_PCT = Object.freeze({ min: 50, max: 100 });
export const CONFIRM_WORD = 'امسح';

const ARABIC_INDIC = new RegExp('[\\u0660-\\u0669\\u06F0-\\u06F9]', 'g');

/** يحوّل الأرقام الهندية والفارسية إلى لاتينية والفاصلة العربية إلى نقطة، ويجرّد المسافات. @param {string} text */
export function normalizeNumber(text) {
  return String(text ?? '')
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[٫,،]/g, '.')
    .replace(/\s+/g, '');
}

/** @typedef {{ ok: true, value: number } | { ok: false, code: string }} Parsed */

/** @param {string} text الخطوة بالثواني (مثل 0.3 أو 2) @returns {Parsed} القيمة بالملي ثانية */
export function parseStep(text) {
  const s = normalizeNumber(text);
  if (!/^\d+(?:\.\d)?$/.test(s)) return { ok: false, code: 'PG_STEP_INVALID' };
  const ms = Math.round(Number(s) * 1000);
  return ms >= STEP_RANGE_MS.min && ms <= STEP_RANGE_MS.max && ms % STEP_RANGE_MS.grid === 0 ? { ok: true, value: ms } : { ok: false, code: 'PG_STEP_INVALID' };
}

const integerIn = (text, { min, max }, code) => {
  const s = normalizeNumber(text);
  if (!/^\d{1,6}$/.test(s)) return { ok: false, code };
  const n = Number(s);
  return n >= min && n <= max ? { ok: true, value: n } : { ok: false, code };
};

/** @param {string} text @returns {Parsed} */
export const parseSplit = (text) => integerIn(text, SPLIT_RANGE, 'PG_SPLIT_INVALID');
/** @param {string} text @returns {Parsed} */
export const parseDrift = (text) => integerIn(text, DRIFT_RANGE_MS, 'PG_DRIFT_INVALID');
/** نسبة الاكتمال مئوية في الحقل، وكسرًا في الإعدادات. @param {string} text @returns {Parsed} */
export function parseCompleteness(text) {
  const r = integerIn(text, COMPLETENESS_RANGE_PCT, 'PG_COMPLETENESS_INVALID');
  return r.ok ? { ok: true, value: r.value / 100 } : r;
}

/** نص الخطوة بالثواني للحقل: 0.5 و1 و2.5. @param {number} ms */
export const stepText = (ms) => String(ms / 1000);

/** @param {number} ms @returns {'0.5' | '1' | 'custom'} الزر المختار للخطوة المحفوظة */
export const stepChoice = (ms) => (ms === 500 ? '0.5' : ms === 1000 ? '1' : 'custom');

/** نسبة الاكتمال الظاهرة في الحقل. @param {number} fraction */
export const completenessText = (fraction) => String(Math.round(fraction * 100));

/**
 * «استعادة الخط والحجم الافتراضيين» معطّل حين تكونان افتراضيتين.
 * @param {{ font: string, scale: number }} appearance
 */
export function resetState(appearance) {
  const isDefault = appearance.font === DEFAULT_SETTINGS.appearance.font && appearance.scale === DEFAULT_SETTINGS.appearance.scale;
  return { isDefault, disabledReason: isDefault ? 'الخط والحجم افتراضيان بالفعل.' : null };
}

/** يقرّب قيمة المنزلق إلى شبكته (70..160 بخطوة 5). @param {unknown} v */
export function snapScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return SUBTITLE_SCALE.default;
  const snapped = Math.round(n / SUBTITLE_SCALE.step) * SUBTITLE_SCALE.step;
  return Math.max(SUBTITLE_SCALE.min, Math.min(SUBTITLE_SCALE.max, snapped));
}

/** موضع علامة الافتراضي (100%) على المنزلق من بدايته، نسبة مئوية. */
export const DEFAULT_SCALE_MARK_PCT = ((SUBTITLE_SCALE.default - SUBTITLE_SCALE.min) / (SUBTITLE_SCALE.max - SUBTITLE_SCALE.min)) * 100;

// المعاينة: صندوق 480×270 لفيديو داكن، والنص بنسبة 4.6% من ارتفاع مشغّل مرجعي (figma-design-brief §٧.١ «نحو 4.6%») كما
// تفعل الطبقة. المرجع 400px تقريبًا (لا 270) ليبقى النص مقروءًا في الصندوق الصغير؛ والحجم النسبي هو ما يحكم في المشغّل.
export const PREVIEW_BOX = Object.freeze({ width: 480, height: 270 });
export const PREVIEW_REFERENCE_HEIGHT = 400;
export const PREVIEW_BASE_RATIO = 0.046;
export const PREVIEW_MIN_FONT_PX = 12;
export const PREVIEW_POSITION_PCT = Object.freeze({ bottom: 8, raised: 20, top: 8 });
export const PREVIEW_LINES = Object.freeze(['هذا هو السطر العربي المترجم.', 'والسطر الثاني بعده']);

/**
 * أنماط المعاينة الحية من إعدادات المظهر.
 * @param {{ font: string, scale: number, background: 'none' | 'soft' | 'solid', position: 'bottom' | 'raised' | 'top' }} a
 */
export function previewStyle(a) {
  const pct = PREVIEW_POSITION_PCT[a.position] ?? PREVIEW_POSITION_PCT.bottom;
  return {
    fontFamily: subtitleFontStack(a.font),
    fontSize: `${Math.max(PREVIEW_MIN_FONT_PX, Math.round(PREVIEW_REFERENCE_HEIGHT * PREVIEW_BASE_RATIO * (a.scale / 100)))}px`,
    anchor: a.position === 'top' ? 'top' : 'bottom',
    offset: `${pct}%`,
    background: a.background,
    softBg: PLAYER_TOKENS.subBgSoft,
    solidBg: PLAYER_TOKENS.subBgSolid,
    text: PLAYER_TOKENS.subText,
  };
}

/** كلمة تأكيد «مسح كل البيانات»: الكلمة نفسها بعد تجريد المسافات الطرفية. @param {string} typed */
export const confirmWordOk = (typed) => String(typed ?? '').trim() === CONFIRM_WORD;
