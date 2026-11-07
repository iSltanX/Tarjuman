// نموذج الإعدادات بلا DOM (P7-AC4/AC8، وP13-AC7/AC8): قراءة حقول الإدخال بتحقق صارم يطابق نموذج الإعدادات والتفضيلات
// (برموز PG_)، وحالة «افتراضي» لكل قسم وتعديل استعادته، وأقسام الصفحة، ومكان حفظ الملفات (R65)، وحد سرعة القراءة،
// ومصطلحات القاموس، وهندسة المعاينة الحية. لا كتابة هنا: الكتابة في view.js عبر setSettings وsetPrefs.
import { READING_DEFAULTS } from '../../core/edit/density.js';
import { DEFAULT_FOLDER, DEFAULT_PREFS, GLOSSARY_LIMITS, READING_SPEED, isValidFolderName, validateTerm } from '../../core/model/prefs.js';
import { DEFAULT_SETTINGS, SUBTITLE_SCALE } from '../../core/model/settings.js';
import { PLAYER_TOKENS } from '../../ui/player-tokens.js';
import { subtitleFontStack } from '../../ui/subtitle-fonts.js';
import { isolate } from '../../ui/format.js';

/** أزرار الخطوة المعروضة: 0.5 و1 ثانية، وما عداهما «مخصص». */
export const STEP_PRESETS_MS = Object.freeze([500, 1000]);
/** الخطوة المخصصة: من 0.1 إلى 10 ثوانٍ بمضاعفات 0.1 (نموذج الإعدادات). */
export const STEP_RANGE_MS = Object.freeze({ min: 100, max: 10000, grid: 100 });
export const SPLIT_RANGE = Object.freeze({ min: 50, max: 2000 });
export const DRIFT_RANGE_MS = Object.freeze({ min: 10, max: 5000 });
export const COMPLETENESS_RANGE_PCT = Object.freeze({ min: 50, max: 100 });
export const CONFIRM_WORD = 'امسح';

/** أقسام الصفحة بترتيبها: المعرّف هو جزء العنوان (#display)، والأيقونة من مجموعة src/ui. */
export const SECTIONS = Object.freeze([
  Object.freeze({ id: 'display', title: 'العرض', icon: 'eye', desc: 'وضع العرض الافتراضي، وخط الترجمة وحجمها وخلفيتها وموضعها فوق الفيديو.' }),
  // قسم «اللغات» (AA3، لوحة 15): بعد «العرض» كترتيب اللوحة.
  Object.freeze({ id: 'langs', title: 'اللغات', icon: 'swap', desc: 'الزوج الافتراضي لتعليمات الترجمة في نافذة الإضافة، واللغات الأخيرة، ولغة الترجمات المحفوظة بلا لغة.' }),
  Object.freeze({ id: 'timing', title: 'التوقيت', icon: 'clock', desc: 'خطوة زرّي − و+ في شريط المشغّل.' }),
  Object.freeze({ id: 'export', title: 'التصدير', icon: 'download', desc: 'مكان حفظ الملفات، ووضع التصدير الافتراضي، وعتبة التقسيم الاحتياطي.' }),
  Object.freeze({ id: 'compare', title: 'المقارنة والمراجعة', icon: 'compare', desc: 'عتبات مقارنة ملف الترجمة بالأصل عند الرفع، وحد سرعة القراءة في المراجعة.' }),
  Object.freeze({ id: 'glossary', title: 'المصطلحات', icon: 'glossary', desc: 'مقابلاتك المفضّلة للمصطلحات، تُرفق بتعليمات الترجمة حين تنسخها.' }),
  Object.freeze({ id: 'storage', title: 'التخزين', icon: 'library', desc: 'المساحة المستخدمة على هذا المتصفح، وسعة الترجمات والنسخ السابقة، ومسح كل البيانات.' }),
  Object.freeze({ id: 'data', title: 'البيانات', icon: 'backup', desc: 'نسخة احتياطية من مكتبتك في ملف على جهازك، تستعيدها هنا أو في متصفح آخر.' }),
  Object.freeze({ id: 'diagnostics', title: 'التشخيص', icon: 'activity', desc: 'تقرير منقّى بلا روابط ولا نصوص، لطلب المساعدة.' }),
  Object.freeze({ id: 'about', title: 'حول', icon: 'info', desc: 'الإصدار، والحقوق وروابط المشروع، والدعم، ودليل الاستخدام، والتراخيص.' }),
]);
export const DEFAULT_SECTION = SECTIONS[0].id;

/** @param {unknown} id */
export const isSectionId = (id) => SECTIONS.some((s) => s.id === id);

/** الأقسام التي تملك «استعادة الافتراضي»: مفاتيح الإعدادات ومجموعات التفضيلات التي تعيدها. */
const RESETTABLE = Object.freeze({
  display: Object.freeze({ settings: Object.freeze(['displayModeDefault', 'appearance']), prefs: Object.freeze([]) }),
  timing: Object.freeze({ settings: Object.freeze(['offsetStepMs']), prefs: Object.freeze([]) }),
  export: Object.freeze({ settings: Object.freeze(['export']), prefs: Object.freeze(['saveLocation']) }),
  compare: Object.freeze({ settings: Object.freeze(['thresholds']), prefs: Object.freeze(['review']) }),
});

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
  const prefsPatch = Object.fromEntries(keys.prefs.map((k) => [k, structuredClone(DEFAULT_PREFS[k])]));
  const isDefault = keys.settings.every((k) => sameJson(settings[k], DEFAULT_SETTINGS[k])) && keys.prefs.every((k) => sameJson(prefs[k], DEFAULT_PREFS[k]));
  return { isDefault, patch, prefsPatch, disabledReason: isDefault ? 'إعدادات هذا القسم افتراضية بالفعل.' : null };
}

/** مكان حفظ ملفات الترجمة (R65، مواصفة التصميم §١٩.٨): الأوضاع الثلاثة، والافتراضي كالسلوك الحالي. */
export const DEFAULT_SUBFOLDER = DEFAULT_FOLDER;
export const SAVE_LOCATIONS = Object.freeze([
  Object.freeze({ value: 'downloads', label: 'مجلد التنزيلات (الافتراضي)', hint: 'حيث يحفظ المتصفح تنزيلاته، وبإعداده في السؤال عن مكان الحفظ.' }),
  Object.freeze({ value: 'subfolder', label: 'مجلد فرعي داخل التنزيلات', hint: 'يُنشأ عند الحاجة، ويُحفظ فيه تلقائيًا ما دام المتصفح لا يسأل عن مكان كل تنزيل.' }),
  Object.freeze({ value: 'ask', label: 'اسأل عن مكان الحفظ عند كل تنزيل', hint: 'يفتح حوار الحفظ من النظام في كل مرة.' }),
]);
export const SAVE_LOCATION_NOTE = 'لا تسمح المتصفحات للإضافات بالحفظ التلقائي خارج مجلد التنزيلات؛ لاختيار مجلد آخر اختر «اسأل عن مكان الحفظ عند كل تنزيل».';

/**
 * سطر المكان المختار: وصف للإعداد لا مسار فعلي (المسار لا يُعرض إلا من سجل المتصفح لملف نزّله ترجمان واكتمل ووُجد).
 * @param {'downloads' | 'subfolder' | 'ask'} mode @param {string} [subfolder]
 */
export function saveLocationStatus(mode, subfolder = DEFAULT_SUBFOLDER) {
  // «مجلد X داخل التنزيلات» كما في رسالة الحفظ بالمحرّر: الشرطة بين عربي ولاتيني تنقلب في اتجاه النص (تدقيق Fable، UX-08).
  if (mode === 'subfolder') return `المكان المختار: مجلد ${isolate(subfolder)} داخل التنزيلات`;
  if (mode === 'ask') return 'المكان المختار: يُسأل عند كل تنزيل';
  return 'المكان المختار: مجلد التنزيلات';
}

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
export const glossaryCounter = (n) => `${n} من ${GLOSSARY_LIMITS.maxTerms}`;

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

/**
 * «الخط والحجم افتراضيان» (أبقيت للتوافق؛ الصفحة تستعمل sectionReset).
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

// المعاينة: صندوق 480×270 لفيديو داكن، والنص بنسبة 4.6% من ارتفاع مشغّل مرجعي كما تفعل الطبقة. المرجع 400px تقريبًا
// (لا 270) ليبقى النص مقروءًا في الصندوق الصغير؛ والحجم النسبي هو ما يحكم في المشغّل.
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
