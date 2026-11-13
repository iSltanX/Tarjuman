// قراءة النسخة الاحتياطية والتحقق منها كاملة قبل أي كتابة (عقد backup.md §٤–§٥). الرفض الكلي برمز واحد ولا يُكتب شيء:
// الحجم قبل القراءة، ثم JSON والصيغة الثابتة، ثم الإصدار (الأحدث يُرفض ولو تغيّرت مفاتيحه، فيُقال «حدّث ترجمان» لا «ليس
// نسخة»)، ثم المفاتيح بالضبط، ثم بصمة السلامة والأعداد. وبعدها استبعاد جزئي صادق: مجموعة إعدادات تالفة وحدها، وفيديو تالف
// أو مكرر وحده، والباقي يمضي. الأسباب مسارات ورموز، لا نص ترجمة.
import { sanitizeText } from '../diagnostics/sanitize.js';
import { joinList, t } from '../../i18n/index.js';
import { bundleFromBackup } from '../model/bundle.js';
import { isVideoId } from '../model/ids.js';
import { normalizeLangPrefs } from '../model/lang-prefs.js';
import { normalizeGlossaries, validateGlossaries } from '../model/glossaries.js';
import { DEFAULT_PREFS, normalizePrefs, validatePrefs } from '../model/prefs.js';
import { DEFAULT_SETTINGS, normalizeSettings, validateSettings } from '../model/settings.js';
import { validateVideoRecord } from '../model/video.js';
import { OK, exactKeys, fail, firstFailure, isIntIn, isIsoDate, isPlainObject } from '../model/validate.js';
import { yieldToPage } from './create.js';
import {
  BACKUP_FORMAT, BACKUP_LIMITS, BACKUP_VERSION, COUNT_KEYS, HASH_ALGORITHM, HEADER_KEYS, countData, entryCounts, sha256Hex,
} from './format.js';

/**
 * @typedef {{ videoId: string, title: string | null, createdAt: string, updatedAt: string, entry: object,
 *   counts: { translations: number, marks: number, previous: boolean } }} BackupItem
 * @typedef {{ index: number, videoId: string | null, code: 'BK_VIDEO_INVALID' | 'BK_VIDEO_DUPLICATE', detail: string | null }} InvalidItem
 * @typedef {{ patch: object, excluded: string[] } | null} SectionRead
 * @typedef {{
 *   ok: true,
 *   header: { createdAt: string, version: number, app: { version: string, storageSchema: number }, options: { previous: boolean },
 *     counts: ReturnType<typeof countData> },
 *   settings: SectionRead, prefs: SectionRead, thumbnailsOff: boolean, langPrefs?: import('../model/lang-prefs.js').LangPrefs | null,
 *   glossaries?: import('../model/glossaries.js').Glossaries | null,
 *   videos: BackupItem[], invalid: InvalidItem[], warnings: { code: string, params?: Record<string, string> }[]
 * }} BackupRead
 *   thumbnailsOff: «صور الفيديو في المحفوظات» مطفأة في النسخة (prefs.ui.thumbnails === false). تُطبَّق وحدها من ui، ولا تُطبَّق «نعم»
 *   أبدًا، فلا تعود الصور بالاستعادة؛ والحقل الغائب (نسخة أقدم من الميزة) يُبقي قيمة الجهاز (تدقيق 7a66f91، U05، قرار Q10).
 *   glossaries: قوائم المصطلحات لكل زوج (الفكرة ٨، الإصدار 3) بقراءة متسامحة، أو null إن غابت أو لم يبقَ منها شيء.
 * @typedef {{ ok: false, code: string, params?: Record<string, string>, detail?: string }} BackupReject
 */

const MB = 1024 * 1024;
const reject = (code, detail, params) => ({ ok: false, code, ...(params ? { params } : {}), ...(detail ? { detail: sanitizeText(String(detail)).slice(0, 300) } : {}) });
const isCount = (n) => isIntIn(n, 0, Number.MAX_SAFE_INTEGER);
const isShortText = (s, max) => typeof s === 'string' && s.length >= 1 && s.length <= max;

/** شكل الترويسة بعد الصيغة والإصدار: المفاتيح بالضبط في كل مستوى (المجهول فشل). */
function checkShape(file) {
  return firstFailure([
    () => exactKeys(file, [...HEADER_KEYS], 'backup'),
    () => (isIsoDate(file.createdAt) ? OK : fail('backup.createdAt', 'ليس تاريخًا')),
    () => exactKeys(file.app, ['version', 'storageSchema'], 'backup.app'),
    () => (isShortText(file.app.version, 40) && isIntIn(file.app.storageSchema, 1, 1000) ? OK : fail('backup.app', 'قيمة غير صالحة')),
    () => exactKeys(file.options, ['previous'], 'backup.options'),
    () => (typeof file.options.previous === 'boolean' ? OK : fail('backup.options.previous', 'ليس منطقيًا')),
    () => exactKeys(file.counts, [...COUNT_KEYS], 'backup.counts'),
    () => (['videos', 'translations', 'previous', 'marks'].every((k) => isCount(file.counts[k])) && ['settings', 'prefs'].every((k) => typeof file.counts[k] === 'boolean')
      ? OK : fail('backup.counts', 'قيمة غير صالحة')),
    () => exactKeys(file.integrity, ['algorithm', 'hash'], 'backup.integrity'),
    () => (file.integrity.algorithm === HASH_ALGORITHM && /^[0-9a-f]{64}$/.test(file.integrity.hash) ? OK : fail('backup.integrity', 'قيمة غير صالحة')),
    // تفضيلات اللغات اختيارية منذ الإصدار 2 (AA3)، وقوائم الأزواج منذ الإصدار 3 (الفكرة ٨)، ولا تُقبل واحدة منهما قبل إصدارها.
    () => exactKeys(file.data, ['settings', 'prefs', 'videos'], 'backup.data', [...(file.version >= 2 ? ['langPrefs'] : []), ...(file.version >= 3 ? ['glossaries'] : [])]),
    () => (Array.isArray(file.data.videos) ? OK : fail('backup.data.videos', 'ليست قائمة')),
  ]);
}

/**
 * قسم الإعدادات أو التفضيلات: قراءة متسامحة ثم تحقق صارم، لكل مجموعة وحدها. الصالحة كما هي تدخل التعديل (بأي ترتيب
 * لمفاتيحها)؛ والمجموعة القائمة (القاموس: partial) يدخل منها ما أبقته القراءة المتسامحة (مصطلح مكرر أو تالف يسقط وحده) ويُذكر في
 * التحذير؛ وغيرها التالف يُستبعد وحده (فتبقى قيمته الحالية عند الاستعادة، لا افتراضي يحل محلها)؛ والقسم الذي ليس كائنًا يُستبعد
 * كله (تدقيق 5fedcb9، GM-015.5: كان ترتيب المفاتيح أو مصطلح واحد يُسقط المجموعة كلها).
 * @param {unknown} raw @param {(x: unknown) => object} normalize @param {(x: unknown) => { ok: boolean }} validate
 * @param {string[]} groups @param {string} label @param {object} defaults @param {string[]} [partial]
 * @returns {SectionRead}
 */
function readSection(raw, normalize, validate, groups, label, defaults, partial = []) {
  if (raw === null) return null;
  if (!isPlainObject(raw)) return { patch: {}, excluded: [label] };
  if (validate(raw).ok) return { patch: Object.fromEntries(groups.map((g) => [g, raw[g]])), excluded: [] };
  const fixed = normalize(raw);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const patch = {};
  const excluded = [];
  for (const g of groups) {
    if (!(g in raw)) excluded.push(`${label}.${g}`);
    else if (validate({ ...fixed, [g]: raw[g] }).ok) patch[g] = raw[g];
    else if (partial.includes(g) && !same(fixed[g], defaults[g])) {
      patch[g] = fixed[g];
      excluded.push(`${label}.${g} (جزئيًا)`);
    } else excluded.push(`${label}.${g}`);
  }
  return { patch, excluded };
}

/**
 * مدخل فيديو: السجل بمدققه أولًا (فلا يصل إلى الفك سجل ناقص الشكل)، ثم bundleFromBackup. وأي رمي غير متوقع في الفك
 * فشلٌ لهذا الفيديو وحده، لا للملف كله.
 * @param {unknown} entry
 */
function checkEntry(entry) {
  if (!isPlainObject(entry)) return fail('entry', 'ليس كائنًا');
  const rec = validateVideoRecord(entry.record);
  if (!rec.ok) return fail(`entry.record${rec.path.replace(/^video/, '')}`, rec.reason);
  try {
    return bundleFromBackup(entry);
  } catch (err) {
    return fail('entry', `تعذّر الفك (${err?.name ?? 'Error'})`);
  }
}

const SETTINGS_GROUPS = ['offsetStepMs', 'displayModeDefault', 'appearance', 'export', 'thresholds'];
/** أسماء المجموعات للمستخدم في تحذير الاستبعاد (كانت المفاتيح الداخلية «settings.appearance»؛ U59). */
const GROUP_NAMES = Object.freeze({
  settings: 'settings', prefs: 'prefs',
  'settings.offsetStepMs': 'offsetStepMs', 'settings.displayModeDefault': 'displayModeDefault', 'settings.appearance': 'appearance',
  'settings.export': 'export', 'settings.thresholds': 'thresholds',
  'prefs.glossary': 'glossary', 'prefs.review': 'review', 'prefs.saveLocation': 'saveLocation', glossaries: 'glossaries',
});
/** @param {string} key مثل «prefs.glossary (جزئيًا)» */
const groupName = (key) => {
  const m = /^(\S+)( \(جزئيًا\))?$/.exec(key);
  const id = Object.hasOwn(GROUP_NAMES, m?.[1] ?? key) ? GROUP_NAMES[m?.[1] ?? key] : null;
  const name = id ? t(`core.backup.group.${id}`) : key;
  return m?.[2] ? t('core.backup.partial', { name }) : name;
};

/** محارف تجاوز الاتجاه وعزله تُجرَّد من العنوان واسم الملف كما في الاستيراد (import/files.js؛ U59): تنتحل عرض الاسم. */
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/g;
/**
 * وفي نصوص المقاطع (text) والملاحظات (notes) محارف التحكم وتجاوز الاتجاه وعزله، كما يجرّدها المحلّل المتسامح عند الاستيراد
 * (lenient.js، CONTROL_CHARS) والتصدير عند الكتابة: كان مقطع في نسخة مصنوعة يحمل U+202E فيُخزَّن ويُعرض مقلوبًا (تدقيق Fable،
 * FA-08). وNUL يبقى ليرفضه مدقق المقطع كما كان، وLRM وRLM وALM وZWNJ مشروعة في العربية فتبقى.
 */
const TEXT_CONTROLS = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
function stripBidi(value, key = '') {
  if (typeof value === 'string') {
    if (key === 'title' || key === 'fileName') return value.replace(BIDI_CONTROLS, '');
    if (key === 'text' || key === 'notes') return value.replace(TEXT_CONTROLS, '');
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => stripBidi(v, key === 'notes' ? 'notes' : ''));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripBidi(v, k)]));
  return value;
}
// ui (تفضيلات الواجهة على الجهاز) لا تُستعاد عمدًا: تبقى قيم هذا الجهاز (docs/product-spec.md §٦.٦)؛ إلا إطفاء الصور (thumbnailsOff).
const PREFS_GROUPS = ['glossary', 'review', 'saveLocation'];

/**
 * @param {Blob | string} input ملف من المنتقي (أو نصه في الاختبارات)
 * @param {{ maxBytes?: number, supportedVersion?: number, onProgress?: (p: { done: number, total: number }) => void,
 *   pause?: () => Promise<void>, batch?: number }} [opts]
 * @returns {Promise<BackupRead | BackupReject>}
 */
export async function readBackup(input, { maxBytes = BACKUP_LIMITS.maxBytes, supportedVersion = BACKUP_VERSION, onProgress = () => {}, pause = yieldToPage, batch = BACKUP_LIMITS.batch } = {}) {
  const size = typeof input === 'string' ? input.length : input?.size;
  if (!Number.isFinite(size)) return reject('BK_READ_FAILED', 'لا ملف');
  if (size > maxBytes) return reject('BK_TOO_LARGE', `size=${size}`, { max: t('common.bytes.mb', { n: Math.round(maxBytes / MB) }) });
  let text;
  try {
    text = typeof input === 'string' ? input : await input.text();
  } catch (err) {
    return reject('BK_READ_FAILED', err && err.name);
  }
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return reject('BK_NOT_BACKUP', 'JSON غير صالح');
  }
  text = null;
  if (!isPlainObject(file) || file.format !== BACKUP_FORMAT) return reject('BK_NOT_BACKUP', 'format');
  if (!Number.isInteger(file.version) || file.version < 1) return reject('BK_NOT_BACKUP', 'version');
  if (file.version > supportedVersion) return reject('BK_VERSION_NEWER', `version=${file.version}`);
  // لا خطوات ترقية لصيغة الملف قبل الإصدار 1 (backup.md §٧)؛ والإصداران 2 و3 يضيفان أقسامًا اختيارية وحدها (§٨ و§٩)، فالأقدم يُقرأ كما هو.
  // والإصدار التالي الذي يغيّر شكلًا قائمًا يضيف خطوته هنا.
  const shape = checkShape(file);
  if (!shape.ok) return reject('BK_NOT_BACKUP', `${shape.path} — ${shape.reason}`);

  const { data } = file;
  // ملف مصنوع بتداخل عميق جدًا: JSON.parse يقبله في V8 والتسلسل العودي يرمي RangeError؛ فهو «ليس نسخة» لا «خطأ غير متوقع» (U59).
  let dataJson;
  try {
    dataJson = JSON.stringify(data);
  } catch (err) {
    if (err instanceof RangeError) return reject('BK_NOT_BACKUP', 'depth');
    throw err;
  }
  if (await sha256Hex(dataJson) !== file.integrity.hash) return reject('BK_INTEGRITY', 'hash');
  dataJson = null;
  if (JSON.stringify(countData(data)) !== JSON.stringify(file.counts)) return reject('BK_INTEGRITY', 'counts');
  if (!file.options.previous && data.videos.some((v) => isPlainObject(v) && v.previous !== null)) return reject('BK_INTEGRITY', 'options.previous');

  const warnings = [];
  const settings = readSection(data.settings, normalizeSettings, validateSettings, SETTINGS_GROUPS, 'settings', normalizeSettings(DEFAULT_SETTINGS));
  const prefs = readSection(data.prefs, normalizePrefs, validatePrefs, PREFS_GROUPS, 'prefs', normalizePrefs(DEFAULT_PREFS), ['glossary']);
  // قوائم الأزواج (الفكرة ٨): قراءة متسامحة، فالقائمة أو المصطلح التالف يسقط وحده ويُسمّى في التحذير، وما لا يبقى منه شيء لا يُستعاد.
  let glossaries = null;
  const glossaryExcluded = [];
  if (data.glossaries !== undefined && data.glossaries !== null) {
    const g = normalizeGlossaries(data.glossaries);
    if (g.lists.length) glossaries = g;
    if (!validateGlossaries(data.glossaries).ok) glossaryExcluded.push(g.lists.length ? 'glossaries (جزئيًا)' : 'glossaries');
  }
  const excluded = [...(settings?.excluded ?? []), ...(prefs?.excluded ?? []), ...glossaryExcluded];
  const thumbnailsOff = isPlainObject(data.prefs) && isPlainObject(data.prefs.ui) && data.prefs.ui.thumbnails === false;
  if (excluded.length) warnings.push({ code: 'BK_SETTINGS_INVALID', params: { groups: joinList(excluded.map(groupName)) } });

  /** @type {Map<string, number[]>} */
  const seen = new Map();
  const parsed = [];
  /** @type {InvalidItem[]} */
  const invalid = [];
  const total = data.videos.length;
  onProgress({ done: 0, total });
  for (const [index, raw] of data.videos.entries()) {
    // التجريد عودي كالفك، فيدخل حماية المدخل نفسها: تداخلٌ اجتاز تسلسل البصمة قد يتجاوز عوديته، فيُعدّ هذا الفيديو وحده
    // «تعذّر» لا «خطأ غير متوقع» للملف كله (ع-١٤).
    let entry = raw;
    let r;
    try {
      entry = stripBidi(raw);
      r = checkEntry(entry);
    } catch (err) {
      if (!(err instanceof RangeError)) throw err;
      r = fail('entry', 'تداخل عميق جدًا');
    }
    if (!r.ok) {
      const id = isPlainObject(entry) && isPlainObject(entry.record) && isVideoId(entry.record.videoId) ? entry.record.videoId : null;
      invalid.push({ index, videoId: id, code: 'BK_VIDEO_INVALID', detail: sanitizeText(`${r.path} — ${r.reason}`).slice(0, 300) });
    } else {
      const { record } = r.bundle;
      seen.set(record.videoId, [...(seen.get(record.videoId) ?? []), parsed.length]);
      parsed.push({ index, item: { videoId: record.videoId, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt, entry, counts: entryCounts(entry) } });
    }
    if ((index + 1) % batch === 0 || index + 1 === total) {
      onProgress({ done: index + 1, total });
      await pause();
    }
  }
  /** @type {BackupItem[]} */
  const videos = [];
  for (const { index, item } of parsed) {
    if (seen.get(item.videoId).length > 1) invalid.push({ index, videoId: item.videoId, code: 'BK_VIDEO_DUPLICATE', detail: null });
    else videos.push(item);
  }
  invalid.sort((a, b) => a.index - b.index);
  return {
    ok: true,
    header: { createdAt: file.createdAt, version: file.version, app: file.app, options: file.options, counts: file.counts },
    settings, prefs, thumbnailsOff, videos, invalid, warnings,
    // قراءة متسامحة لكل حقل: التالف يعود افتراضيه ولا يسقط غيره، ويُطبَّق مع «استعادة الإعدادات والقاموس» وحدها.
    langPrefs: isPlainObject(data.langPrefs) ? normalizeLangPrefs(data.langPrefs) : null,
    glossaries,
  };
}
