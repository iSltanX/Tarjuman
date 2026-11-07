// الإعدادات (عقد data-model §٧). القراءة متسامحة: كل حقل غير صالح يعود إلى افتراضيه دون فقد البقية.
// الكتابة صارمة: validateSettings قبل أي حفظ.
import { DEFAULT_OFFSET_STEP_MS, OFFSET_GRID_MS } from './timing.js';
import { OK, exactKeys, fail, firstFailure, isIntIn, isPlainObject } from './validate.js';

export const SETTINGS_SCHEMA = 1;
export const DISPLAY_MODE_DEFAULTS = Object.freeze(['ar', 'dual']);
/** خطوط الترجمة فوق الفيديو (بياناتها وملفاتها في src/ui/subtitle-fonts.js)؛ الأول هو الافتراضي. */
export const SUBTITLE_FONTS = Object.freeze(['almarai', 'noto-sans-arabic', 'tajawal', 'markazi']);
/** حجم الترجمة نسبة مئوية فوق الحجم النسبي لارتفاع المشغّل. */
export const SUBTITLE_SCALE = Object.freeze({ min: 70, max: 160, step: 5, default: 100 });
/** المقاسات القديمة (قبل W4) تُقرأ نسبًا: القراءة المتسامحة وحدها تحوّلها، ولا تُكتب أبدًا. */
export const LEGACY_SUBTITLE_SIZES = Object.freeze({ s: 85, m: 100, l: 120, xl: 145 });
export const SUBTITLE_BACKGROUNDS = Object.freeze(['none', 'soft', 'solid']);
export const SUBTITLE_POSITIONS = Object.freeze(['bottom', 'raised', 'top']);

/**
 * @typedef {{
 *   schema: 1, offsetStepMs: number, displayModeDefault: 'ar' | 'dual',
 *   appearance: {
 *     font: 'almarai' | 'noto-sans-arabic' | 'tajawal' | 'markazi', scale: number,
 *     background: 'none' | 'soft' | 'solid', position: 'bottom' | 'raised' | 'top'
 *   },
 *   export: { modeDefault: 'normal' | 'long', splitThreshold: number },
 *   thresholds: { driftMs: number, completeness: number }
 * }} Settings
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  schema: SETTINGS_SCHEMA,
  offsetStepMs: DEFAULT_OFFSET_STEP_MS,
  displayModeDefault: 'ar',
  appearance: Object.freeze({ font: SUBTITLE_FONTS[0], scale: SUBTITLE_SCALE.default, background: 'soft', position: 'bottom' }),
  export: Object.freeze({ modeDefault: 'normal', splitThreshold: 200 }),
  thresholds: Object.freeze({ driftMs: 100, completeness: 0.85 }),
});

const FIELDS = {
  offsetStepMs: (v) => isIntIn(v, OFFSET_GRID_MS, 10000) && v % OFFSET_GRID_MS === 0,
  displayModeDefault: (v) => DISPLAY_MODE_DEFAULTS.includes(v),
  'appearance.font': (v) => SUBTITLE_FONTS.includes(v),
  'appearance.scale': (v) => isIntIn(v, SUBTITLE_SCALE.min, SUBTITLE_SCALE.max) && v % SUBTITLE_SCALE.step === 0,
  'appearance.background': (v) => SUBTITLE_BACKGROUNDS.includes(v),
  'appearance.position': (v) => SUBTITLE_POSITIONS.includes(v),
  'export.modeDefault': (v) => v === 'normal' || v === 'long',
  'export.splitThreshold': (v) => isIntIn(v, 50, 2000),
  'thresholds.driftMs': (v) => isIntIn(v, 10, 5000),
  'thresholds.completeness': (v) => typeof v === 'number' && v >= 0.5 && v <= 1,
};
const GROUPS = { appearance: ['font', 'scale', 'background', 'position'], export: ['modeDefault', 'splitThreshold'], thresholds: ['driftMs', 'completeness'] };

const get = (obj, path) => path.split('.').reduce((o, k) => (isPlainObject(o) ? o[k] : undefined), obj);

/** @param {unknown} s */
export function validateSettings(s) {
  return firstFailure([
    () => exactKeys(s, ['schema', 'offsetStepMs', 'displayModeDefault', 'appearance', 'export', 'thresholds'], 'settings'),
    () => (s.schema === SETTINGS_SCHEMA ? OK : fail('settings.schema', 'إصدار غير معروف')),
    ...Object.entries(GROUPS).map(([g, keys]) => () => exactKeys(s[g], keys, `settings.${g}`)),
    ...Object.entries(FIELDS).map(([p, ok]) => () => (ok(get(s, p)) ? OK : fail(`settings.${p}`, 'قيمة غير صالحة'))),
  ]);
}

/**
 * إعدادات كاملة من قيمة مخزَّنة قد تكون ناقصة أو قديمة أو تالفة.
 * @param {unknown} raw
 * @returns {Settings}
 */
export function normalizeSettings(raw) {
  const pick = (path) => {
    const v = get(raw, path);
    return FIELDS[path](v) ? v : get(DEFAULT_SETTINGS, path);
  };
  // الحجم: النسبة إن صحّت، وإلا المقاس القديم بنسبته، وإلا الافتراضي.
  const size = get(raw, 'appearance.size');
  const legacy = typeof size === 'string' && Object.hasOwn(LEGACY_SUBTITLE_SIZES, size) ? LEGACY_SUBTITLE_SIZES[size] : undefined;
  const scale = FIELDS['appearance.scale'](get(raw, 'appearance.scale')) || legacy === undefined ? pick('appearance.scale') : legacy;
  return {
    schema: SETTINGS_SCHEMA,
    offsetStepMs: pick('offsetStepMs'),
    displayModeDefault: pick('displayModeDefault'),
    appearance: { font: pick('appearance.font'), scale, background: pick('appearance.background'), position: pick('appearance.position') },
    export: { modeDefault: pick('export.modeDefault'), splitThreshold: pick('export.splitThreshold') },
    thresholds: { driftMs: pick('thresholds.driftMs'), completeness: pick('thresholds.completeness') },
  };
}

/**
 * يدمج تعديلًا جزئيًا (حتى مستوى المجموعة) فوق إعدادات كاملة، دون تحقق؛ التحقق عند الحفظ.
 * @param {Settings} base
 * @param {Partial<{ [K in keyof Settings]: Settings[K] extends object ? Partial<Settings[K]> : Settings[K] }>} patch
 * @returns {Settings}
 */
export function mergeSettings(base, patch) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k in GROUPS && isPlainObject(v)) out[k] = { ...out[k], ...v };
    else out[k] = v;
  }
  return out;
}
