// تفضيلات الإصدار الثاني (عقد data-model §١٤): القاموس، وحد سرعة القراءة، ومكان حفظ الملفات. في مفتاح prefs مستقل
// لا في settings، لأن كتابة الإعدادات من الإصدار الأول تُسقط كل حقل لا تعرفه. القراءة متسامحة لكل حقل، والكتابة صارمة.
import { OK, eachOf, exactKeys, fail, firstFailure, isIntIn, isPlainObject } from './validate.js';

export const PREFS_SCHEMA = 1;
export const SAVE_MODES = Object.freeze(['downloads', 'subfolder', 'ask']);
export const GLOSSARY_LIMITS = Object.freeze({ maxTerms: 100, maxSource: 80, maxTarget: 80, maxNote: 120 });
export const READING_SPEED = Object.freeze({ min: 5, max: 40 });
export const FOLDER_MAX = 60;
export const DEFAULT_FOLDER = 'Tarjuman';

/**
 * @typedef {{ source: string, target: string, note: string | null }} GlossaryTerm
 * @typedef {{
 *   schema: 1,
 *   glossary: { attach: boolean, terms: GlossaryTerm[] },
 *   review: { maxCps: number | null },
 *   saveLocation: { mode: 'downloads' | 'subfolder' | 'ask', folder: string },
 *   ui: { thumbnails: boolean, panelEntry: boolean, panelOpen: boolean, panelDual: boolean }
 * }} Prefs
 */

/** @type {Readonly<Prefs>} */
export const DEFAULT_PREFS = Object.freeze({
  schema: PREFS_SCHEMA,
  glossary: Object.freeze({ attach: true, terms: Object.freeze([]) }),
  review: Object.freeze({ maxCps: null }),
  saveLocation: Object.freeze({ mode: 'downloads', folder: DEFAULT_FOLDER }),
  // تفضيلات الواجهة على هذا الجهاز (الهوية «بُنّ على ورق»، docs/identity-redesign.md): صور الفيديو في المحفوظات من
  // خوادم يوتيوب (مفعّلة افتراضيًا بقرار سلطان)، وزر لوحة النص المتزامن في صفحة الفيديو، وحالة اللوحة (مفتوحة؟ ومع
  // الأصل؟). لا تُستعاد من النسخة الاحتياطية (backup/read.js: PREFS_GROUPS)، فهي للجهاز لا للبيانات.
  ui: Object.freeze({ thumbnails: true, panelEntry: true, panelOpen: false, panelDual: true }),
});

// سطر واحد بلا محارف تحكم (ومنها فواصل الأسطر)، ومشذّب.
const CONTROL_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const isLine = (s, max, min = 1) => typeof s === 'string' && s === s.trim() && s.length >= min && s.length <= max && !CONTROL_RE.test(s);

const FOLDER_BAD_RE = /[\\/:*?"<>|]/;
const RESERVED_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/**
 * اسم مجلد فرعي واحد داخل التنزيلات: 1..60 محرفًا، بلا فواصل مسار ولا رموز محجوزة ولا محارف تحكم، ولا يبدأ أو
 * ينتهي بنقطة أو مسافة، وليس اسمًا محجوزًا في Windows.
 * @param {unknown} name
 */
export function isValidFolderName(name) {
  return typeof name === 'string' && name.length >= 1 && name.length <= FOLDER_MAX && !FOLDER_BAD_RE.test(name)
    && !CONTROL_RE.test(name) && !/^[.\s]|[.\s]$/.test(name) && !RESERVED_RE.test(name);
}

/** @param {unknown} t @param {string} path */
export function validateTerm(t, path = 'term') {
  return firstFailure([
    () => exactKeys(t, ['source', 'target', 'note'], path),
    () => (isLine(t.source, GLOSSARY_LIMITS.maxSource) ? OK : fail(`${path}.source`, 'المصطلح الإنجليزي سطر من 1 إلى 80 محرفًا')),
    () => (isLine(t.target, GLOSSARY_LIMITS.maxTarget) ? OK : fail(`${path}.target`, 'المقابل العربي سطر من 1 إلى 80 محرفًا')),
    () => (t.note === null || isLine(t.note, GLOSSARY_LIMITS.maxNote) ? OK : fail(`${path}.note`, 'الملاحظة سطر حتى 120 محرفًا أو null')),
  ]);
}

/**
 * المفتاح الموحّد للمصطلح بأي لغة بلا اعتبار لحالة الأحرف (لا مكرر في القاموس). «en» هنا قواعد الحالة الجذرية لا افتراض لغة
 * المصطلح (تتجنب قواعد التركية والليتوانية الخاصة)، وتبقى كما هي لأن 1.1.0 يتحقق من القاموس بالدالة نفسها (AA1).
 * @param {string} s
 */
export const sourceKey = (s) => s.toLocaleLowerCase('en');

/** @param {unknown} list @param {string} path */
function validateTerms(list, path) {
  return firstFailure([
    () => eachOf(list, path, GLOSSARY_LIMITS.maxTerms, validateTerm),
    () => (new Set(list.map((t) => sourceKey(t.source))).size === list.length ? OK : fail(path, 'مصطلح مكرر')),
  ]);
}

const FIELDS = {
  'glossary.attach': (v) => typeof v === 'boolean',
  'review.maxCps': (v) => v === null || isIntIn(v, READING_SPEED.min, READING_SPEED.max),
  'saveLocation.mode': (v) => SAVE_MODES.includes(v),
  'saveLocation.folder': (v) => isValidFolderName(v),
  'ui.thumbnails': (v) => typeof v === 'boolean',
  'ui.panelEntry': (v) => typeof v === 'boolean',
  'ui.panelOpen': (v) => typeof v === 'boolean',
  'ui.panelDual': (v) => typeof v === 'boolean',
};
const GROUPS = { glossary: ['attach', 'terms'], review: ['maxCps'], saveLocation: ['mode', 'folder'], ui: ['thumbnails', 'panelEntry', 'panelOpen', 'panelDual'] };

const get = (obj, path) => path.split('.').reduce((o, k) => (isPlainObject(o) ? o[k] : undefined), obj);

/** @param {unknown} p */
export function validatePrefs(p) {
  return firstFailure([
    () => exactKeys(p, ['schema', 'glossary', 'review', 'saveLocation', 'ui'], 'prefs'),
    () => (p.schema === PREFS_SCHEMA ? OK : fail('prefs.schema', 'إصدار غير معروف')),
    ...Object.entries(GROUPS).map(([g, keys]) => () => exactKeys(p[g], keys, `prefs.${g}`)),
    ...Object.entries(FIELDS).map(([path, ok]) => () => (ok(get(p, path)) ? OK : fail(`prefs.${path}`, 'قيمة غير صالحة'))),
    () => validateTerms(p.glossary.terms, 'prefs.glossary.terms'),
  ]);
}

/**
 * تفضيلات كاملة من قيمة مخزَّنة قد تكون ناقصة أو تالفة: كل حقل تالف يعود افتراضيه، والمصطلح التالف أو المكرر يسقط وحده.
 * @param {unknown} raw
 * @returns {Prefs}
 */
export function normalizePrefs(raw) {
  const pick = (path) => {
    const v = get(raw, path);
    return FIELDS[path](v) ? v : get(DEFAULT_PREFS, path);
  };
  const rawTerms = get(raw, 'glossary.terms');
  const terms = [];
  const seen = new Set();
  for (const t of Array.isArray(rawTerms) ? rawTerms : []) {
    if (terms.length >= GLOSSARY_LIMITS.maxTerms) break;
    if (!validateTerm(t).ok || seen.has(sourceKey(t.source))) continue;
    seen.add(sourceKey(t.source));
    terms.push({ source: t.source, target: t.target, note: t.note });
  }
  return {
    schema: PREFS_SCHEMA,
    glossary: { attach: pick('glossary.attach'), terms },
    review: { maxCps: pick('review.maxCps') },
    saveLocation: { mode: pick('saveLocation.mode'), folder: pick('saveLocation.folder') },
    ui: { thumbnails: pick('ui.thumbnails'), panelEntry: pick('ui.panelEntry'), panelOpen: pick('ui.panelOpen'), panelDual: pick('ui.panelDual') },
  };
}

/**
 * يدمج تعديلًا جزئيًا (حتى مستوى المجموعة) فوق تفضيلات كاملة، دون تحقق؛ التحقق عند الحفظ.
 * @param {Prefs} base @param {Record<string, unknown>} patch
 * @returns {Prefs}
 */
export function mergePrefs(base, patch) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k in GROUPS && isPlainObject(v)) out[k] = { ...out[k], ...structuredClone(v) };
    else out[k] = structuredClone(v);
  }
  return out;
}

/**
 * إضافة مصطلح على أحدث تفضيلات (تدقيق 7a66f91، U13): بالمفتاح الموحّد لا بقائمة تبنيها الصفحة من عرضها، فلا تُسقط إضافةٌ
 * مصطلحًا أضافته صفحة أخرى. المكرر والحد يُفحصان هنا على المخزَّن نفسه.
 * @param {Prefs} prefs كاملة @param {GlossaryTerm} term
 * @returns {{ prefs: Prefs, added: boolean, reason: 'duplicate' | 'limit' | null }}
 */
export function addTerm(prefs, term) {
  const terms = prefs.glossary.terms;
  if (terms.some((t) => sourceKey(t.source) === sourceKey(term.source))) return { prefs, added: false, reason: 'duplicate' };
  if (terms.length >= GLOSSARY_LIMITS.maxTerms) return { prefs, added: false, reason: 'limit' };
  const next = structuredClone(prefs);
  next.glossary.terms.push({ source: term.source, target: term.target, note: term.note });
  return { prefs: next, added: true, reason: null };
}

/**
 * حذف مصطلح بمفتاحه الموحّد على أحدث تفضيلات (U13): حذفٌ من عرض قديم لا يمس مصطلحًا أضيف بعده.
 * @param {Prefs} prefs كاملة @param {string} key sourceKey(source)
 * @returns {{ prefs: Prefs, removed: boolean }}
 */
export function removeTerm(prefs, key) {
  const terms = prefs.glossary.terms.filter((t) => sourceKey(t.source) !== key);
  if (terms.length === prefs.glossary.terms.length) return { prefs, removed: false };
  const next = structuredClone(prefs);
  next.glossary.terms = terms;
  return { prefs: next, removed: true };
}
