// نموذج الإعدادات بلا DOM (P7-AC4/AC8، وP13-AC7/AC8): قراءة حقول الإدخال بتحقق صارم يطابق نموذج الإعدادات والتفضيلات
// (برموز PG_)، وحالة «افتراضي» لكل قسم وتعديل استعادته، وأقسام الصفحة، ومكان حفظ الملفات (R65)، وحد سرعة القراءة،
// ومصطلحات القاموس، وهندسة المعاينة الحية. لا كتابة هنا: الكتابة في view.js عبر setSettings وsetPrefs.
import { READING_DEFAULTS } from '../../core/edit/density.js';
import { DEFAULT_FOLDER, DEFAULT_PREFS, GLOSSARY_LIMITS, READING_SPEED, isValidFolderName, validateTerm } from '../../core/model/prefs.js';
import { DEFAULT_SETTINGS, SUBTITLE_SCALE } from '../../core/model/settings.js';
import { t } from '../../i18n/index.js';
import { PLAYER_TOKENS } from '../../ui/player-tokens.js';
import { subtitleFont, subtitleFontStack } from '../../ui/subtitle-fonts.js';

/** الخطوة المخصصة: من 0.1 إلى 10 ثوانٍ بمضاعفات 0.1 (نموذج الإعدادات). */
export const STEP_RANGE_MS = Object.freeze({ min: 100, max: 10000, grid: 100 });
export const SPLIT_RANGE = Object.freeze({ min: 50, max: 2000 });
export const DRIFT_RANGE_MS = Object.freeze({ min: 10, max: 5000 });
export const COMPLETENESS_RANGE_PCT = Object.freeze({ min: 50, max: 100 });
/** كلمة تأكيد «مسح كل البيانات» بلغة الواجهة الحالية (تُحسب عند الاستدعاء لا عند تحميل الوحدة). */
export const confirmWord = () => t('settings.storage.confirmWord');

/** عنوان القسم ووصفه من الفهرس عند القراءة، فيتبعان لغة الواجهة. */
const section = (id, icon, desc = false) => Object.freeze({
  id, icon,
  get title() { return t(`settings.sections.${id}.title`); },
  get desc() { return desc ? t(`settings.sections.${id}.desc`) : undefined; },
});

/** أقسام الصفحة بترتيبها: المعرّف هو جزء العنوان (#display)، والأيقونة من مجموعة src/ui. */
export const SECTIONS = Object.freeze([
  section('display', 'eye', true),
  // قسم «اللغات» (AA3، لوحة 15): بعد «العرض» كترتيب اللوحة.
  section('langs', 'swap', true),
  // «التوقيت» حُذف (ح3، 2026-11-10): خطوة ± تُضبط حيث تُستعمل (قائمة التوقيت في المشغّل وتذييل لوحة النص).
  section('export', 'download', true),
  section('compare', 'compare', true),
  section('glossary', 'glossary', true),
  section('storage', 'library', true),
  section('data', 'backup', true),
  section('diagnostics', 'activity', true),
  section('about', 'info'),
]);
export const DEFAULT_SECTION = SECTIONS[0].id;

/** @param {unknown} id */
export const isSectionId = (id) => SECTIONS.some((s) => s.id === id);

/** روابط أقسام حُذفت إلى ما يقوم مقامها: #timing القديم (ح3) إلى «العرض». */
export const SECTION_ALIASES = Object.freeze({ timing: 'display' });

/**
 * القسم الذي يُعرض لجزء العنوان: معرّف قسم، أو بديل قسم محذوف، أو null.
 * @param {unknown} id
 * @returns {string | null}
 */
export const sectionFor = (id) => {
  if (isSectionId(id)) return /** @type {string} */ (id);
  // ملك الكائن وحده: «#constructor» و«#toString» ليسا بديلين (مراجعة المرحلة 5، م3).
  return typeof id === 'string' && Object.hasOwn(SECTION_ALIASES, id) ? SECTION_ALIASES[id] : null;
};

/** الأقسام التي تملك «استعادة الافتراضي»: مفاتيح الإعدادات ومجموعات التفضيلات التي تعيدها. */
const RESETTABLE = Object.freeze({
  display: Object.freeze({ settings: Object.freeze(['displayModeDefault', 'appearance']), prefs: Object.freeze([]) }),
  export: Object.freeze({ settings: Object.freeze(['export']), thresholds: Object.freeze(['completeness']), prefs: Object.freeze(['saveLocation']) }),
  compare: Object.freeze({ settings: Object.freeze([]), thresholds: Object.freeze(['driftMs']), prefs: Object.freeze(['review']) }),
});

// زر «العرض» لا يمس مفاتيح لوحة النص المتزامن وزرها وصور المحفوظات ولا لغة الواجهة، فالتلميح يسمّي ما يشمله.

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * هل قيم القسم افتراضية؟ وما التعديلان (للإعدادات وللتفضيلات) اللذان يعيدانها؟ القسم بلا استعادة يعيد null.
 * @param {import('../../core/model/settings.js').Settings} settings @param {string} sectionId
 * @param {import('../../core/model/prefs.js').Prefs} [prefs]
 * @returns {{ isDefault: boolean, patch: Record<string, unknown>, prefsPatch: Record<string, unknown>, disabledReason: string | null } | null}
 */
export function sectionReset(settings, sectionId, prefs = DEFAULT_PREFS) {
  const keys = RESETTABLE[sectionId];
  if (!keys) return null;
  const patch = Object.fromEntries(keys.settings.map((k) => [k, structuredClone(DEFAULT_SETTINGS[k])]));
  // عتبتا settings.thresholds في قسمين، فلكل قسم عتبته وحدها.
  const thresholds = keys.thresholds ?? [];
  if (thresholds.length) patch.thresholds = Object.fromEntries(thresholds.map((k) => [k, DEFAULT_SETTINGS.thresholds[k]]));
  const prefsPatch = Object.fromEntries(keys.prefs.map((k) => [k, structuredClone(DEFAULT_PREFS[k])]));
  const isDefault = keys.settings.every((k) => sameJson(settings[k], DEFAULT_SETTINGS[k]))
    && thresholds.every((k) => settings.thresholds[k] === DEFAULT_SETTINGS.thresholds[k])
    && keys.prefs.every((k) => sameJson(prefs[k], DEFAULT_PREFS[k]));
  return { isDefault, patch, prefsPatch, disabledReason: isDefault ? t(sectionId === 'display' ? 'settings.reset.displayDefault' : 'settings.reset.sectionDefault') : null };
}

/** مكان حفظ ملفات الترجمة (R65، مواصفة التصميم §١٩.٨): الأوضاع الثلاثة، والافتراضي كالسلوك الحالي. */
export const DEFAULT_SUBFOLDER = DEFAULT_FOLDER;
const saveLocation = (value, key, withHint = true) => Object.freeze({
  value,
  get label() { return t(`settings.location.${key}Label`); },
  get hint() { return withHint ? t(`settings.location.${key}Hint`) : undefined; },
});
export const SAVE_LOCATIONS = Object.freeze([
  saveLocation('downloads', 'downloads'),
  saveLocation('subfolder', 'subfolder'),
  saveLocation('ask', 'ask', false),
]);
export const saveLocationNote = () => t('settings.location.note');

/** @param {{ mode: string, folder: string }} loc */
export const isDefaultLocation = (loc) => loc.mode === DEFAULT_PREFS.saveLocation.mode && loc.folder === DEFAULT_PREFS.saveLocation.folder;

/**
 * اسم المجلد الفرعي من الحقل: يُشذّب ثم يُتحقق منه بقاعدة النموذج نفسها.
 * @param {string} text @returns {{ ok: true, value: string } | { ok: false, code: 'SV_BAD_FOLDER' }}
 */
export function parseFolder(text) {
  const v = String(text ?? '').trim();
  return isValidFolderName(v) ? { ok: true, value: v } : { ok: false, code: 'SV_BAD_FOLDER' };
}

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

/** حد سرعة القراءة: الافتراضي المعايَر (P11) حين يكون null في التفضيلات. */
export const READING_DEFAULT_CPS = READING_DEFAULTS.maxCps;

/**
 * حد سرعة القراءة (حرف/ث): الحقل الفارغ يعيد الافتراضي (null)، وإلا عدد صحيح 5..40.
 * @param {string} text @returns {{ ok: true, value: number | null } | { ok: false, code: 'PG_READING_INVALID' }}
 */
export function parseReadingSpeed(text) {
  const s = normalizeNumber(text);
  if (!s) return { ok: true, value: null };
  if (!/^\d{1,3}$/.test(s)) return { ok: false, code: 'PG_READING_INVALID' };
  const n = Number(s);
  return n >= READING_SPEED.min && n <= READING_SPEED.max ? { ok: true, value: n } : { ok: false, code: 'PG_READING_INVALID' };
}

/** نص الحقل: فارغ للافتراضي. @param {number | null} maxCps */
export const readingText = (maxCps) => (maxCps === null ? '' : String(maxCps));

/** عدّاد القاموس «12 من 100». @param {number} n */
export const glossaryCounter = (n) => t('settings.glossary.counter', { n, max: GLOSSARY_LIMITS.maxTerms });

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * مصطلح جديد من حقول الإضافة: يُشذّب ويُطوى، ثم يُتحقق منه بمدقق النموذج، وبالتفرد دون اعتبار لحالة الأحرف، وبالحد.
 * @param {{ source: string, target: string, note: string }} input
 * @param {import('../../core/model/prefs.js').GlossaryTerm[]} terms القائمة الحالية
 * @returns {{ ok: true, term: import('../../core/model/prefs.js').GlossaryTerm } | { ok: false, code: string, field: 'source' | 'target' | 'note' | null }}
 */
export function termDraft(input, terms) {
  if (terms.length >= GLOSSARY_LIMITS.maxTerms) return { ok: false, code: 'PG_TERM_LIMIT', field: null };
  const note = oneLine(input.note);
  const term = { source: oneLine(input.source), target: oneLine(input.target), note: note || null };
  const r = validateTerm(term);
  if (!r.ok) {
    const field = /source$/.test(r.path) ? 'source' : /target$/.test(r.path) ? 'target' : 'note';
    return { ok: false, code: { source: 'PG_TERM_SOURCE_INVALID', target: 'PG_TERM_TARGET_INVALID', note: 'PG_TERM_NOTE_INVALID' }[field], field };
  }
  const key = term.source.toLocaleLowerCase('en');
  if (terms.some((t) => t.source.toLocaleLowerCase('en') === key)) return { ok: false, code: 'PG_TERM_DUPLICATE', field: 'source' };
  return { ok: true, term };
}

/** نص الخطوة بالثواني للحقل: 0.5 و1 و2.5. @param {number} ms */
export const stepText = (ms) => String(ms / 1000);

/** @param {number} ms @returns {'0.5' | '1' | 'custom'} الزر المختار للخطوة المحفوظة */
export const stepChoice = (ms) => (ms === 500 ? '0.5' : ms === 1000 ? '1' : 'custom');

/** نسبة الاكتمال الظاهرة في الحقل. @param {number} fraction */
export const completenessText = (fraction) => String(Math.round(fraction * 100));

/** يقرّب قيمة المنزلق إلى شبكته (70..160 بخطوة 5). @param {unknown} v */
export function snapScale(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return SUBTITLE_SCALE.default;
  const snapped = Math.round(n / SUBTITLE_SCALE.step) * SUBTITLE_SCALE.step;
  return Math.max(SUBTITLE_SCALE.min, Math.min(SUBTITLE_SCALE.max, snapped));
}

/** موضع علامة الافتراضي (100%) على المنزلق من بدايته، نسبة مئوية. */
export const DEFAULT_SCALE_MARK_PCT = ((SUBTITLE_SCALE.default - SUBTITLE_SCALE.min) / (SUBTITLE_SCALE.max - SUBTITLE_SCALE.min)) * 100;

// المعاينة: صندوق 480×270 لفيديو داكن، والنص بنسبة 4.6% من ارتفاع مشغّل مرجعي كما تفعل الطبقة. المرجع 400px تقريبًا
// (لا 270) ليبقى النص مقروءًا في الصندوق الصغير؛ والحجم النسبي هو ما يحكم في المشغّل.
export const PREVIEW_BOX = Object.freeze({ width: 480, height: 270 });
export const PREVIEW_REFERENCE_HEIGHT = 400;
export const PREVIEW_BASE_RATIO = 0.046;
export const PREVIEW_MIN_FONT_PX = 12;
export const PREVIEW_POSITION_PCT = Object.freeze({ bottom: 8, raised: 20, top: 8 });
/** سطرا المعاينة بلغة الواجهة الحالية. */
export const previewLines = () => [t('settings.display.previewLine1'), t('settings.display.previewLine2')];

/**
 * أنماط المعاينة الحية من إعدادات المظهر.
 * @param {{ font: string, scale: number, background: 'none' | 'soft' | 'solid', position: 'bottom' | 'raised' | 'top' }} a
 */
export function previewStyle(a) {
  const pct = PREVIEW_POSITION_PCT[a.position] ?? PREVIEW_POSITION_PCT.bottom;
  return {
    fontFamily: subtitleFontStack(a.font),
    // حد عرض السطر كالطبقة (ف2): ما زاد على نحو 42 حرفًا يلتفّ سطرين متوازنين.
    lineCap: `${subtitleFont(a.font).lineCapEm}em`,
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
export const confirmWordOk = (typed) => String(typed ?? '').trim().toLocaleLowerCase() === confirmWord().toLocaleLowerCase();
