// مسودة المحرّر (الفكرة ٩، ح-48؛ عقد storage §١٦): ما لم يُحفظ من تعديلات خانة، يُكتب تلقائيًا ليُستعاد بضغطة صريحة بعد إغلاق
// المحرّر أو انهياره قبل الحفظ. مفتاح واحد لكل فيديو (draft:<id>) بثلاث خانات، والمحتوى وحده بلا تاريخ تراجع: المقاطع والإزاحة وما
// ثُبّت منها ولم يُحفظ. وهوية الخانة التي بُنيت عليها المسودة بمحتواها (اسم الملف وتاريخ استيراده، ثم تاريخ تعديله أو بصمة مقاطعها،
// والإزاحة على حدة)، لا بمراجعة السجل: كل كتابة لآخر موضع ترفع المراجعة. والبصمة (تحقق 2.3.0 ص-٦) لأن «تراجع» لوحة النص يعيد المحتوى
// مطابقًا بتاريخ تعديل جديد. القراءة متسامحة (الخانة التالفة تسقط وحدها، والقيمة التالفة كأنها غائبة)، والكتابة صارمة. لا تخزين ولا
// DOM هنا.
import { fnv1a64 } from '../export/hash.js';
import { isVideoId } from './ids.js';
import { isValidOffset } from './timing.js';
import { LIMITS, OK, eachOf, exactKeys, fail, firstFailure, isIntIn, isIsoDate, isPlainObject, isText } from './validate.js';

export const DRAFT_SCHEMA = 1;
/** drafts: عدد الفيديوهات التي تبقى لها مسودة؛ وإنشاء مسودة لفيديو جديد فوقها يُسقط أقدمها (بآخر حفظ فيها). */
export const DRAFT_LIMITS = Object.freeze({ drafts: 5 });

/**
 * @typedef {import('./cue.js').Cue} Cue
 * @typedef {{ fileName: string, importedAt: string, editedAt: string | null, offsetMs: number, cuesHash?: string }} DraftBase
 * @typedef {{ savedAt: string, base: DraftBase, offsetMs: number, committedMs: number, cues: Cue[] }} Draft
 * @typedef {{ schema: 1, videoId: string, slots: [Draft | null, Draft | null, Draft | null] }} DraftValue
 * @typedef {'none' | 'equal' | 'same' | 'offset' | 'changed'} DraftKind
 */

/**
 * مقطع المسودة كما في الجلسة: أزمنته أعداد صحيحة ولو سالبة (زمن كُتب خطأً في حقله يبقى خطأً ظاهرًا يمنع الحفظ، والمسودة تحفظه كما
 * هو فلا تُرفض كلها لأجله)، ونصه بحد نص المقطع.
 * @param {unknown} c @param {string} path
 */
function validateDraftCue(c, path) {
  return firstFailure([
    () => exactKeys(c, ['n', 'startMs', 'endMs', 'text'], path),
    () => (isIntIn(c.n, 1, LIMITS.maxCues * 10) ? OK : fail(`${path}.n`, 'رقم المقطع ليس عددًا صحيحًا موجبًا')),
    () => (isIntIn(c.startMs, -LIMITS.maxTimeMs, LIMITS.maxTimeMs) ? OK : fail(`${path}.startMs`, 'زمن البداية غير صالح')),
    () => (isIntIn(c.endMs, -LIMITS.maxTimeMs, LIMITS.maxTimeMs) ? OK : fail(`${path}.endMs`, 'زمن النهاية غير صالح')),
    () => (isText(c.text, LIMITS.maxTextChars) ? OK : fail(`${path}.text`, 'النص غير صالح أو أطول من الحد')),
  ]);
}

/** بصمة cuesHash: «fnv1a64:» ثم 16 خانة ست عشرية. */
const CUES_HASH_RE = /^fnv1a64:[0-9a-f]{16}$/;

/**
 * بصمة مقاطع الخانة التي بُنيت عليها المسودة: FNV-1a بـ64 بتًا على JSON الرقم والبداية والنهاية والنص كما هو (بلا تطبيع ولا طيّ
 * مسافات)، فأي فرق في مقطع يغيّرها. ليست تشفيرًا؛ تكفي لمعرفة أن الخانة عادت كما كانت.
 * @param {Cue[]} cues
 */
export const draftCuesHash = (cues) => `fnv1a64:${fnv1a64(JSON.stringify(cues.map(({ n, startMs, endMs, text }) => [n, startMs, endMs, text])))}`;

/** @param {unknown} b @param {string} path */
function validateBase(b, path) {
  return firstFailure([
    // cuesHash اختياري: المسودات المكتوبة قبله تبقى صالحة، وتُعرف هويتها بتاريخ التعديل وحده.
    () => exactKeys(b, ['fileName', 'importedAt', 'editedAt', 'offsetMs'], path, ['cuesHash']),
    () => (isText(b.fileName, LIMITS.maxFileNameChars) && b.fileName.length > 0 ? OK : fail(`${path}.fileName`, 'اسم ملف غير صالح')),
    () => (isIsoDate(b.importedAt) ? OK : fail(`${path}.importedAt`, 'تاريخ غير صالح')),
    () => (b.editedAt === null || isIsoDate(b.editedAt) ? OK : fail(`${path}.editedAt`, 'تاريخ غير صالح')),
    () => (isValidOffset(b.offsetMs) ? OK : fail(`${path}.offsetMs`, 'إزاحة غير صالحة')),
    () => (b.cuesHash === undefined || (typeof b.cuesHash === 'string' && CUES_HASH_RE.test(b.cuesHash)) ? OK : fail(`${path}.cuesHash`, 'بصمة غير صالحة')),
  ]);
}

/**
 * مسودة خانة واحدة، صارمة.
 * @param {unknown} d @param {string} [path]
 */
export function validateDraft(d, path = 'draft') {
  return firstFailure([
    () => exactKeys(d, ['savedAt', 'base', 'offsetMs', 'committedMs', 'cues'], path),
    () => (isIsoDate(d.savedAt) ? OK : fail(`${path}.savedAt`, 'تاريخ غير صالح')),
    () => validateBase(d.base, `${path}.base`),
    () => (isValidOffset(d.offsetMs) ? OK : fail(`${path}.offsetMs`, 'إزاحة غير صالحة')),
    () => (isIntIn(d.committedMs, -LIMITS.maxTimeMs, LIMITS.maxTimeMs) ? OK : fail(`${path}.committedMs`, 'تثبيت غير صالح')),
    () => (Array.isArray(d.cues) && d.cues.length > 0 ? OK : fail(`${path}.cues`, 'بلا مقاطع')),
    () => eachOf(d.cues, `${path}.cues`, LIMITS.maxCues, validateDraftCue),
  ]);
}

/**
 * القيمة كاملة كما تُخزَّن، صارمة.
 * @param {unknown} v @param {string} [path]
 */
export function validateDraftValue(v, path = 'draft') {
  return firstFailure([
    () => exactKeys(v, ['schema', 'videoId', 'slots'], path),
    () => (v.schema === DRAFT_SCHEMA ? OK : fail(`${path}.schema`, 'إصدار غير معروف')),
    () => (isVideoId(v.videoId) ? OK : fail(`${path}.videoId`, 'معرّف فيديو غير صالح')),
    () => (Array.isArray(v.slots) && v.slots.length === 3 ? OK : fail(`${path}.slots`, 'ليست ثلاث خانات')),
    () => eachOf(v.slots, `${path}.slots`, 3, (d, p) => (d === null ? OK : validateDraft(d, p))),
  ]);
}

/** قيمة بلا مسودات. @param {string} videoId @returns {DraftValue} */
export const emptyDraftValue = (videoId) => ({ schema: DRAFT_SCHEMA, videoId, slots: [null, null, null] });

/** لا مسودة في أي خانة. @param {DraftValue} v */
export const isEmptyDraftValue = (v) => v.slots.every((d) => d === null);

/**
 * القراءة المتسامحة: كل خانة تجتاز مدققها تبقى، والتالفة null؛ والقيمة التي لا تُقرأ أصلًا (أو لفيديو آخر) كأنها بلا مسودات، فتُحذف
 * عند الكتابة التالية للمفتاح.
 * @param {unknown} raw @param {string} videoId
 * @returns {DraftValue}
 */
export function normalizeDraftValue(raw, videoId) {
  const out = emptyDraftValue(videoId);
  if (!isPlainObject(raw) || raw.schema !== DRAFT_SCHEMA || raw.videoId !== videoId || !Array.isArray(raw.slots)) return out;
  for (let i = 0; i < 3; i++) {
    const d = raw.slots[i];
    if (d !== null && d !== undefined && validateDraft(d).ok) out.slots[i] = d;
  }
  return out;
}

/** آخر حفظ في القيمة (لطرد الأقدم عند تجاوز الحد)، أو '' بلا مسودة. @param {DraftValue} v */
export const lastSavedAt = (v) => v.slots.reduce((at, d) => (d && d.savedAt > at ? d.savedAt : at), '');

/**
 * مسودة من الجلسة وما فُتح عليه: المحتوى وحده (المقاطع والإزاحة وما ثُبّت منها ولم يُحفظ)، وهوية الخانة المفتوحة ببصمة مقاطعها.
 * cuesHash بصمة مقاطع الخانة المفتوحة إن حُسبت قبلُ (المحرّر يحسبها مرة لكل أساس، تحقق 2.3.0 ص-٩)، وإلا تُحسب هنا.
 * @param {{ cues: Cue[], offsetMs: number, committedMs: number }} work
 * @param {{ track: { fileName: string, importedAt: string, editedAt: string | null, original: Cue[], current: Cue[] | null }, offsetMs: number }} opened
 * @param {string} savedAt
 * @param {string} [cuesHash]
 * @returns {Draft}
 */
export function draftOf(work, opened, savedAt, cuesHash) {
  const t = opened.track;
  return {
    savedAt,
    base: {
      fileName: t.fileName, importedAt: t.importedAt, editedAt: t.editedAt ?? null, offsetMs: opened.offsetMs, cuesHash: cuesHash ?? draftCuesHash(t.current ?? t.original),
    },
    offsetMs: work.offsetMs,
    committedMs: work.committedMs,
    cues: work.cues.map(({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text })),
  };
}

/** المقاطع نفسها رقمًا وبداية ونهاية ونصًّا (ما تحسب عليه draftCuesHash). @param {Cue[]} a @param {Cue[]} b */
export const sameCues = (a, b) => a.length === b.length && a.every((c, i) => c.n === b[i].n && c.startMs === b[i].startMs && c.endMs === b[i].endMs && c.text === b[i].text);

/**
 * ما تعنيه مسودة لخانة كما هي الآن (ح-48):
 * - 'none': لا مسودة أو لا ترجمة في الخانة.
 * - 'changed': تغيّر محتوى الخانة بعدها (اسم الملف أو تاريخ استيراده، أو تاريخ تعديله ومقاطعها لا تطابق بصمة المسودة)، أو تغيّرت
 *   إزاحتها والمسودة غيّرت الإزاحة أيضًا: لا استعادة فوقها ولا دمج آلي، بل «تنزيلها ملفًا» أو «تجاهلها». فتحرير ثم «تراجع» يعيد
 *   المقاطع كما كانت لا يغيّر الهوية، والمسودة بلا بصمة (كُتبت قبلها) هويتها بتاريخ التعديل وحده.
 * - 'offset': الهوية نفسها والإزاحة وحدها تغيّرت (± من المشغّل) والمسودة لم تمسها: تُستعاد بالإزاحة الحاضرة.
 * - 'same': الهوية والإزاحة كما بُنيت عليهما: تُستعاد كما هي.
 * - 'equal': ما تستعيده يطابق المحفوظ، فلا شيء لاستعادته.
 * restore ما تضعه الاستعادة في الجلسة.
 * @param {Draft | null} draft
 * @param {{ track: { fileName: string, importedAt: string, editedAt: string | null, original: Cue[], current: Cue[] | null } | null, offsetMs: number } | null} slot
 * @returns {{ kind: DraftKind, restore?: { cues: Cue[], offsetMs: number, committedMs: number } }}
 */
export function classifyDraft(draft, slot) {
  const t = slot?.track;
  if (!draft || !t) return { kind: 'none' };
  const b = draft.base;
  if (b.fileName !== t.fileName || b.importedAt !== t.importedAt) return { kind: 'changed' };
  const sameContent = b.editedAt === (t.editedAt ?? null) || (b.cuesHash !== undefined && b.cuesHash === draftCuesHash(t.current ?? t.original));
  if (!sameContent) return { kind: 'changed' };
  const offsetMoved = b.offsetMs !== slot.offsetMs;
  if (offsetMoved && (draft.offsetMs !== b.offsetMs || draft.committedMs !== 0)) return { kind: 'changed' };
  const restore = { cues: draft.cues, offsetMs: offsetMoved ? slot.offsetMs : draft.offsetMs, committedMs: draft.committedMs };
  if (restore.offsetMs === slot.offsetMs && restore.committedMs === 0 && sameCues(draft.cues, t.current ?? t.original)) return { kind: 'equal' };
  return { kind: offsetMoved ? 'offset' : 'same', restore };
}
