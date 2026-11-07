// المسار المستخرج، والبصمة، والترجمة، وتقرير المقارنة (عقد data-model §٢–§٥). الأسماء التاريخية باقية في السجل المخزَّن
// (english للمسارات المستخرجة وarabic للترجمة النشطة) لأن الإصدار الأول و1.1.0 يقرآنه بها. ومنذ 2.0.0 (AA1) المسار بأي لغة
// أو مترجم آليًا من يوتيوب (via)، والترجمة بلغتها (lang)، في الذاكرة؛ والسجل المخزَّن إسقاطٌ لما يقرؤه 1.1.0 وحده
// (model/lang-store.js)، فمدققاته الصارمة (validateEnglishTrack ووضع stored) كما كانت.
import { validateCueTime, validateCues } from './cue.js';
import {
  ENGLISH_LANG_RE, FINGERPRINT_ID_RE, TRACK_KINDS, isSourceLang, isVideoId, parseTrackKey, parseV1TrackKey, trackKey,
} from './ids.js';
import {
  LIMITS, OK, eachOf, exactKeys, fail, firstFailure, intList, isIntIn, isIsoDate, isText, noteList,
} from './validate.js';

/**
 * @typedef {import('./cue.js').Cue} Cue
 * @typedef {import('./cue.js').CueTime} CueTime
 * @typedef {{
 *   key: string, lang: string, kind: 'manual' | 'asr', capturedAt: string, source: 'capture', cues: Cue[]
 * }} EnglishTrack
 * @typedef {{ index: number, from: number, to: number }} FingerprintPart
 * @typedef {{
 *   id: string, videoId: string, trackKey: string, mode: 'normal' | 'long', count: number, cues: CueTime[],
 *   textHash: string, fileName: string | null, createdAt: string, parts: FingerprintPart[] | null
 * }} Fingerprint
 * @typedef {{ n: number, startDeltaMs: number, endDeltaMs: number }} Drift
 * @typedef {{
 *   fingerprintId: string | null, matched: boolean, countSource: number | null, countTarget: number,
 *   numbering: 'same' | 'different', missing: number[], extra: number[], drift: Drift[], empty: number[],
 *   noArabic: number[], restoreTimingAvailable: boolean, driftThresholdMs: number, notes: string[]
 * }} ComparisonReport
 * @typedef {{
 *   fileName: string, importedAt: string, original: Cue[], current: Cue[] | null, editedAt: string | null,
 *   fingerprintId: string | null, comparison: ComparisonReport | null, notes: string[]
 * }} ArabicTrack
 */

export const EXPORT_MODES = Object.freeze(['normal', 'long']);
const TEXT_HASH_RE = /^[a-z0-9-]{2,16}:[0-9a-f]{8,128}$/;

const ENGLISH_KEYS = ['key', 'lang', 'kind', 'capturedAt', 'source', 'cues'];

/**
 * المسار المستخرج في الذاكرة (AA1): بأي لغة، والمترجم آليًا من يوتيوب يحمل via (لغة المسار الذي تُرجم عنه) ومفتاحه lang|kind|via.
 * @param {unknown} t @param {string} [path]
 */
export function validateSourceTrack(t, path = 'english') {
  return firstFailure([
    () => exactKeys(t, ENGLISH_KEYS, path, ['via']),
    () => (isSourceLang(t.lang) ? OK : fail(`${path}.lang`, 'رمز لغة غير صالح')),
    () => (TRACK_KINDS.includes(t.kind) ? OK : fail(`${path}.kind`, 'نوع غير معروف')),
    () => (!('via' in t) || isSourceLang(t.via) ? OK : fail(`${path}.via`, 'رمز لغة الأصل غير صالح')),
    () => (t.key === trackKey(t.lang, t.kind, t.via ?? null) ? OK : fail(`${path}.key`, 'المفتاح لا يطابق lang|kind|via')),
    () => (isIsoDate(t.capturedAt) ? OK : fail(`${path}.capturedAt`, 'تاريخ غير صالح')),
    () => (t.source === 'capture' ? OK : fail(`${path}.source`, 'مصدر غير معروف')),
    () => validateCues(t.cues, `${path}.cues`, { min: 1 }),
  ]);
}

/** هل يقرأ الإصدار الأول و1.1.0 هذا المسار في السجل: إنجليزي أصلي بمفاتيحه الستة. @param {{ key: string, via?: string }} t */
export const isV1Track = (t) => !!t && !('via' in t) && parseV1TrackKey(t.key) !== null;

/** المسار كما يقرؤه الإصدار الأول و1.1.0 (السجل المخزَّن): إنجليزي أصلي بمفاتيحه الستة، بلا via. @param {unknown} t @param {string} [path] */
export function validateEnglishTrack(t, path = 'english') {
  return firstFailure([
    () => exactKeys(t, ENGLISH_KEYS, path),
    () => (typeof t.lang === 'string' && ENGLISH_LANG_RE.test(t.lang) ? OK : fail(`${path}.lang`, 'ليست لغة إنجليزية')),
    () => (TRACK_KINDS.includes(t.kind) ? OK : fail(`${path}.kind`, 'نوع غير معروف')),
    () => (t.key === trackKey(t.lang, t.kind) ? OK : fail(`${path}.key`, 'المفتاح لا يطابق lang|kind')),
    () => (isIsoDate(t.capturedAt) ? OK : fail(`${path}.capturedAt`, 'تاريخ غير صالح')),
    () => (t.source === 'capture' ? OK : fail(`${path}.source`, 'مصدر غير معروف')),
    () => validateCues(t.cues, `${path}.cues`, { min: 1 }),
  ]);
}

const FP_KEYS = ['id', 'videoId', 'trackKey', 'mode', 'count', 'cues', 'textHash', 'fileName', 'createdAt', 'parts'];
/**
 * @param {unknown} f @param {string} [path]
 * @param {{ stored?: boolean }} [o] stored: كما يقرؤها 1.1.0 في السجل (مفتاح مسار إنجليزي أصلي وحده)
 */
export function validateFingerprint(f, path = 'fingerprint', { stored = false } = {}) {
  const keyOk = stored ? parseV1TrackKey : parseTrackKey;
  return firstFailure([
    () => exactKeys(f, FP_KEYS, path),
    () => (typeof f.id === 'string' && FINGERPRINT_ID_RE.test(f.id) ? OK : fail(`${path}.id`, 'معرّف بصمة غير صالح')),
    () => (isVideoId(f.videoId) ? OK : fail(`${path}.videoId`, 'معرّف فيديو غير صالح')),
    () => (keyOk(f.trackKey) ? OK : fail(`${path}.trackKey`, 'مفتاح مسار غير صالح')),
    () => (EXPORT_MODES.includes(f.mode) ? OK : fail(`${path}.mode`, 'وضع تصدير غير معروف')),
    () => (isIntIn(f.count, 1, LIMITS.maxCues) ? OK : fail(`${path}.count`, 'عدد غير صالح')),
    () => eachOf(f.cues, `${path}.cues`, LIMITS.maxCues, validateCueTime),
    () => (f.cues.length === f.count ? OK : fail(`${path}.count`, 'العدد لا يساوي طول cues')),
    () => (f.cues.every((c, i) => c.n === i + 1) ? OK : fail(`${path}.cues`, 'الترقيم ليس متسلسلًا من 1')),
    () => (typeof f.textHash === 'string' && TEXT_HASH_RE.test(f.textHash) ? OK : fail(`${path}.textHash`, 'صيغة البصمة النصية غير صالحة')),
    () => (f.fileName === null || isText(f.fileName, LIMITS.maxFileNameChars) ? OK : fail(`${path}.fileName`, 'اسم ملف غير صالح')),
    () => (isIsoDate(f.createdAt) ? OK : fail(`${path}.createdAt`, 'تاريخ غير صالح')),
    () => validateParts(f.parts, f.count, `${path}.parts`),
  ]);
}

/** الأجزاء الاحتياطية: ترقيم مستمر يغطي 1..count دون فجوة ولا تداخل. */
function validateParts(parts, count, path) {
  if (parts === null) return OK;
  if (!Array.isArray(parts) || parts.length < 2) return fail(path, 'الأجزاء قائمة من جزأين فأكثر أو null');
  let next = 1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const r = exactKeys(p, ['index', 'from', 'to'], `${path}[${i}]`);
    if (!r.ok) return r;
    if (p.index !== i + 1) return fail(`${path}[${i}].index`, 'ترتيب الأجزاء غير متسلسل');
    if (p.from !== next || !Number.isInteger(p.to) || p.to < p.from) return fail(`${path}[${i}]`, 'الترقيم غير مستمر');
    next = p.to + 1;
  }
  return next === count + 1 ? OK : fail(path, 'الأجزاء لا تغطي كل المقاطع');
}

const CMP_KEYS = [
  'fingerprintId', 'matched', 'countSource', 'countTarget', 'numbering', 'missing', 'extra', 'drift', 'empty',
  'noArabic', 'restoreTimingAvailable', 'driftThresholdMs', 'notes',
];
/** @param {unknown} c @param {string} [path] */
export function validateComparisonReport(c, path = 'comparison') {
  const max = LIMITS.maxCues;
  return firstFailure([
    () => exactKeys(c, CMP_KEYS, path),
    () => (c.fingerprintId === null || (typeof c.fingerprintId === 'string' && FINGERPRINT_ID_RE.test(c.fingerprintId)) ? OK : fail(`${path}.fingerprintId`, 'معرّف بصمة غير صالح')),
    () => (typeof c.matched === 'boolean' ? OK : fail(`${path}.matched`, 'ليس منطقيًا')),
    () => (c.countSource === null || isIntIn(c.countSource, 0, max) ? OK : fail(`${path}.countSource`, 'عدد غير صالح')),
    () => (isIntIn(c.countTarget, 0, max) ? OK : fail(`${path}.countTarget`, 'عدد غير صالح')),
    () => (c.numbering === 'same' || c.numbering === 'different' ? OK : fail(`${path}.numbering`, 'قيمة غير معروفة')),
    () => intList(c.missing, `${path}.missing`, max),
    () => intList(c.extra, `${path}.extra`, max),
    () => eachOf(c.drift, `${path}.drift`, max, (d, p) => firstFailure([
      () => exactKeys(d, ['n', 'startDeltaMs', 'endDeltaMs'], p),
      () => (Number.isInteger(d.n) && d.n >= 1 && Number.isInteger(d.startDeltaMs) && Number.isInteger(d.endDeltaMs) ? OK : fail(p, 'انحراف غير صالح')),
    ])),
    () => intList(c.empty, `${path}.empty`, max),
    () => intList(c.noArabic, `${path}.noArabic`, max),
    () => (typeof c.restoreTimingAvailable === 'boolean' ? OK : fail(`${path}.restoreTimingAvailable`, 'ليس منطقيًا')),
    () => (isIntIn(c.driftThresholdMs, 0, 60000) ? OK : fail(`${path}.driftThresholdMs`, 'عتبة غير صالحة')),
    () => noteList(c.notes, `${path}.notes`),
    () => (c.fingerprintId !== null || (c.countSource === null && !c.matched && !c.restoreTimingAvailable)
      ? OK : fail(path, 'بلا بصمة: countSource=null وmatched=false وrestoreTimingAvailable=false')),
    () => (!c.restoreTimingAvailable || (c.countSource === c.countTarget && c.numbering === 'same')
      ? OK : fail(`${path}.restoreTimingAvailable`, 'الاستعادة لا تُتاح إلا عند تطابق العدد والترقيم')),
    () => (!c.matched || (c.countSource === c.countTarget && c.numbering === 'same' && !c.missing.length && !c.extra.length && !c.drift.length)
      ? OK : fail(`${path}.matched`, 'المطابقة تعني تطابق العدد والترقيم وغياب النقص والزيادة والانحراف')),
  ]);
}

const AR_KEYS = ['fileName', 'importedAt', 'original', 'current', 'editedAt', 'fingerprintId', 'comparison', 'notes'];
/**
 * الترجمة (الاسم التاريخي ArabicTrack). في الذاكرة يجوز lang: رمز لغتها أو null «غير محددة» (AA1)، وغيابه لترجمة حُفظت قبل
 * 2.0.0 بمعنى null. والمخزَّن (stored) بمفاتيحه الثمانية كما يقرؤه 1.1.0.
 * @param {unknown} a @param {string} [path] @param {{ stored?: boolean }} [o]
 */
export function validateArabicTrack(a, path = 'arabic', { stored = false } = {}) {
  return firstFailure([
    () => exactKeys(a, AR_KEYS, path, stored ? [] : ['lang']),
    () => (!('lang' in a) || a.lang === null || isSourceLang(a.lang) ? OK : fail(`${path}.lang`, 'رمز لغة غير صالح')),
    () => (isText(a.fileName, LIMITS.maxFileNameChars) && a.fileName.length > 0 ? OK : fail(`${path}.fileName`, 'اسم ملف غير صالح')),
    () => (isIsoDate(a.importedAt) ? OK : fail(`${path}.importedAt`, 'تاريخ غير صالح')),
    () => validateCues(a.original, `${path}.original`, { min: 1 }),
    () => (a.current === null ? OK : validateCues(a.current, `${path}.current`, { min: 1 })),
    () => (a.editedAt === null || isIsoDate(a.editedAt) ? OK : fail(`${path}.editedAt`, 'تاريخ غير صالح')),
    () => ((a.current === null) === (a.editedAt === null) ? OK : fail(`${path}.editedAt`, 'النسخة الحالية وتاريخ تعديلها يوجدان معًا أو يغيبان معًا')),
    () => (a.fingerprintId === null || (typeof a.fingerprintId === 'string' && FINGERPRINT_ID_RE.test(a.fingerprintId)) ? OK : fail(`${path}.fingerprintId`, 'معرّف بصمة غير صالح')),
    () => (a.comparison === null ? OK : validateComparisonReport(a.comparison, `${path}.comparison`)),
    () => noteList(a.notes, `${path}.notes`),
  ]);
}
