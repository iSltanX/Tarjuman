// الإعدادات (عقد data-model §٧). القراءة متسامحة: كل حقل غير صالح يعود إلى افتراضيه دون فقد البقية.
// الكتابة صارمة: validateSettings قبل أي حفظ.
import { DEFAULT_OFFSET_STEP_MS, OFFSET_GRID_MS } from './timing.js';
import { OK, exactKeys, fail, firstFailure, isIntIn, isPlainObject } from './validate.js';

export const SETTINGS_SCHEMA = 1;
export const DISPLAY_MODE_DEFAULTS = Object.freeze(['ar', 'dual']);
export const SUBTITLE_SIZES = Object.freeze(['s', 'm', 'l', 'xl']);
export const SUBTITLE_BACKGROUNDS = Object.freeze(['none', 'soft', 'solid']);
export const SUBTITLE_POSITIONS = Object.freeze(['bottom', 'raised', 'top']);

/**
 * @typedef {{
 *   schema: 1, offsetStepMs: number, displayModeDefault: 'ar' | 'dual',
 *   appearance: { size: 's' | 'm' | 'l' | 'xl', background: 'none' | 'soft' | 'solid', position: 'bottom' | 'raised' | 'top' },
 *   export: { modeDefault: 'normal' | 'long', splitThreshold: number, showInstructions: boolean },
 *   thresholds: { driftMs: number, completeness: number }
 * }} Settings
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  schema: SETTINGS_SCHEMA,
  offsetStepMs: DEFAULT_OFFSET_STEP_MS,
  displayModeDefault: 'ar',
  appearance: Object.freeze({ size: 'm', background: 'soft', position: 'bottom' }),
  export: Object.freeze({ modeDefault: 'normal', splitThreshold: 200, showInstructions: true }),
  thresholds: Object.freeze({ driftMs: 100, completeness: 0.85 }),
});

const FIELDS = {
  offsetStepMs: (v) => isIntIn(v, OFFSET_GRID_MS, 10000) && v % OFFSET_GRID_MS === 0,
  displayModeDefault: (v) => DISPLAY_MODE_DEFAULTS.includes(v),
  'appearance.size': (v) => SUBTITLE_SIZES.includes(v),
  'appearance.background': (v) => SUBTITLE_BACKGROUNDS.includes(v),
  'appearance.position': (v) => SUBTITLE_POSITIONS.includes(v),
  'export.modeDefault': (v) => v === 'normal' || v === 'long',
  'export.splitThreshold': (v) => isIntIn(v, 50, 2000),
  'export.showInstructions': (v) => typeof v === 'boolean',
  'thresholds.driftMs': (v) => isIntIn(v, 10, 5000),
  'thresholds.completeness': (v) => typeof v === 'number' && v >= 0.5 && v <= 1,
};
const GROUPS = { appearance: ['size', 'background', 'position'], export: ['modeDefault', 'splitThreshold', 'showInstructions'], thresholds: ['driftMs', 'completeness'] };

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
  return {
    schema: SETTINGS_SCHEMA,
    offsetStepMs: pick('offsetStepMs'),
    displayModeDefault: pick('displayModeDefault'),
    appearance: { size: pick('appearance.size'), background: pick('appearance.background'), position: pick('appearance.position') },
    export: { modeDefault: pick('export.modeDefault'), splitThreshold: pick('export.splitThreshold'), showInstructions: pick('export.showInstructions') },
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
