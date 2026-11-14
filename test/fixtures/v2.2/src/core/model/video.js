// سجل الفيديو ومُلخّصه في الفهرس (عقد data-model §٦ وstorage §٢). السجل وحدة الحفظ لكل فيديو.
import { trackComparison } from '../compare/current.js';
import { isValidOffset } from './timing.js';
import { isVideoId } from './ids.js';
import { validateArabicTrack, validateEnglishTrack, validateFingerprint, validateSourceTrack } from './tracks.js';
import {
  LIMITS, OK, eachOf, exactKeys, fail, firstFailure, isIntIn, isIsoDate, isText,
} from './validate.js';

export const RECORD_SCHEMA = 1;
export const DISPLAY_MODES = Object.freeze(['ar', 'dual', 'off']);

/**
 * @typedef {import('./tracks.js').EnglishTrack} EnglishTrack
 * @typedef {import('./tracks.js').Fingerprint} Fingerprint
 * @typedef {import('./tracks.js').ArabicTrack} ArabicTrack
 * @typedef {{ displayOffsetMs: number, displayMode: 'ar' | 'dual' | 'off' }} ViewState
 * @typedef {{
 *   schema: 1, videoId: string, title: string | null, durationMs: number | null,
 *   createdAt: string, updatedAt: string, rev: number,
 *   english: EnglishTrack[], fingerprints: Fingerprint[], arabic: ArabicTrack | null, view: ViewState
 * }} VideoRecord
 * @typedef {{
 *   schema: 1, videoId: string, title: string | null, updatedAt: string, rev: number,
 *   english: { key: string, kind: 'manual' | 'asr', cueCount: number }[],
 *   arabic: null | { fileName: string, cueCount: number, edited: boolean, matched: boolean | null, missing: number, extra: number, drift: number },
 *   fingerprints: number, view: ViewState
 * }} IndexEntry
 */

const RECORD_KEYS = ['schema', 'videoId', 'title', 'durationMs', 'createdAt', 'updatedAt', 'rev', 'english', 'fingerprints', 'arabic', 'view'];

/** @param {unknown} v @param {string} [path] */
export function validateView(v, path = 'view') {
  return firstFailure([
    () => exactKeys(v, ['displayOffsetMs', 'displayMode'], path),
    () => (isValidOffset(v.displayOffsetMs) ? OK : fail(`${path}.displayOffsetMs`, 'إزاحة غير صالحة (عدد صحيح من مضاعفات 100 ضمن ±600000)')),
    () => (DISPLAY_MODES.includes(v.displayMode) ? OK : fail(`${path}.displayMode`, 'وضع عرض غير معروف')),
  ]);
}

/**
 * السجل. stored (الافتراضي): كما يُخزَّن ويقرؤه الإصدار الأول و1.1.0، بمسارات إنجليزية أصلية وحدها وترجمة بلا لغة. ووضع
 * الذاكرة (stored: false، AA1): مسارات بأي لغة ومترجمة آليًا، وترجمة بلغتها، بالثوابت نفسها.
 * @param {unknown} r @param {{ stored?: boolean }} [o]
 */
export function validateVideoRecord(r, { stored = true } = {}) {
  const path = 'video';
  const trackOf = stored ? validateEnglishTrack : validateSourceTrack;
  return firstFailure([
    () => exactKeys(r, RECORD_KEYS, path),
    () => (r.schema === RECORD_SCHEMA ? OK : fail(`${path}.schema`, `الإصدار ${r.schema} والمتوقع ${RECORD_SCHEMA}`)),
    () => (isVideoId(r.videoId) ? OK : fail(`${path}.videoId`, 'معرّف فيديو غير صالح')),
    () => (r.title === null || isText(r.title, LIMITS.maxTitleChars) ? OK : fail(`${path}.title`, 'عنوان غير صالح')),
    () => (r.durationMs === null || isIntIn(r.durationMs, 0, LIMITS.maxTimeMs) ? OK : fail(`${path}.durationMs`, 'مدة غير صالحة')),
    () => (isIsoDate(r.createdAt) ? OK : fail(`${path}.createdAt`, 'تاريخ غير صالح')),
    () => (isIsoDate(r.updatedAt) ? OK : fail(`${path}.updatedAt`, 'تاريخ غير صالح')),
    () => (isIntIn(r.rev, 1, Number.MAX_SAFE_INTEGER) ? OK : fail(`${path}.rev`, 'مراجعة غير صالحة')),
    () => eachOf(r.english, `${path}.english`, LIMITS.maxEnglishTracks, trackOf),
    () => (new Set(r.english.map((t) => t.key)).size === r.english.length ? OK : fail(`${path}.english`, 'مفتاح مسار مكرر')),
    () => eachOf(r.fingerprints, `${path}.fingerprints`, LIMITS.maxFingerprints, (f, p) => validateFingerprint(f, p, { stored })),
    () => (new Set(r.fingerprints.map((f) => f.id)).size === r.fingerprints.length ? OK : fail(`${path}.fingerprints`, 'معرّف بصمة مكرر')),
    () => {
      const keys = new Set(r.english.map((t) => t.key));
      const bad = r.fingerprints.findIndex((f) => f.videoId !== r.videoId || !keys.has(f.trackKey));
      return bad === -1 ? OK : fail(`${path}.fingerprints[${bad}]`, 'البصمة لفيديو آخر أو لمسار غير محفوظ');
    },
    () => (r.arabic === null ? OK : validateArabicTrack(r.arabic, `${path}.arabic`, { stored })),
    () => (r.arabic === null || r.arabic.fingerprintId === null || r.fingerprints.some((f) => f.id === r.arabic.fingerprintId)
      ? OK : fail(`${path}.arabic.fingerprintId`, 'البصمة المشار إليها غير محفوظة')),
    () => validateView(r.view, `${path}.view`),
  ]);
}

/**
 * سجل فارغ لفيديو. rev=0 هنا ويصبح 1 عند أول حفظ (التخزين يضبطه).
 * @param {{ videoId: string, title?: string | null, durationMs?: number | null, now: string, displayMode?: 'ar' | 'dual' | 'off' }} p
 * @returns {VideoRecord}
 */
export function createVideoRecord({ videoId, title = null, durationMs = null, now, displayMode = 'ar' }) {
  return {
    schema: RECORD_SCHEMA, videoId, title, durationMs, createdAt: now, updatedAt: now, rev: 0,
    english: [], fingerprints: [], arabic: null, view: { displayOffsetMs: 0, displayMode },
  };
}

/**
 * المقاطع العربية المعروضة: النسخة الحالية إن عُدّلت، وإلا الأصل المستورد.
 * @param {VideoRecord | null} record
 */
export const arabicCues = (record) => (record?.arabic ? record.arabic.current ?? record.arabic.original : null);

/**
 * المُلخّص المحفوظ بجانب السجل في الفهرس.
 * @param {VideoRecord} r
 * @returns {IndexEntry}
 */
export function summarizeVideo(r) {
  const a = r.arabic;
  // التحذيرات للنسخة المعروضة الآن لا لتقرير الاستيراد وحده، فلا تبقى «3 ناقصة» بعد الاستكمال والحفظ (R46؛ GM-013).
  const cmp = a ? trackComparison(a, r.fingerprints) : null;
  return {
    schema: RECORD_SCHEMA, videoId: r.videoId, title: r.title, updatedAt: r.updatedAt, rev: r.rev,
    english: r.english.map((t) => ({ key: t.key, kind: t.kind, cueCount: t.cues.length })),
    arabic: a ? {
      fileName: a.fileName,
      cueCount: (a.current ?? a.original).length,
      edited: a.current !== null,
      matched: cmp && cmp.fingerprintId ? cmp.matched : null,
      missing: cmp ? cmp.missing.length : 0,
      extra: cmp ? cmp.extra.length : 0,
      drift: cmp ? cmp.drift.length : 0,
    } : null,
    fingerprints: r.fingerprints.length,
    view: { ...r.view },
  };
}

/** @param {unknown} e */
export function validateIndexEntry(e) {
  const path = 'index';
  return firstFailure([
    () => exactKeys(e, ['schema', 'videoId', 'title', 'updatedAt', 'rev', 'english', 'arabic', 'fingerprints', 'view'], path),
    () => (e.schema === RECORD_SCHEMA && isVideoId(e.videoId) && isIsoDate(e.updatedAt) && isIntIn(e.rev, 1, Number.MAX_SAFE_INTEGER) ? OK : fail(path, 'رأس غير صالح')),
    () => (e.title === null || isText(e.title, LIMITS.maxTitleChars) ? OK : fail(`${path}.title`, 'عنوان غير صالح')),
    () => eachOf(e.english, `${path}.english`, LIMITS.maxEnglishTracks, (x, p) => exactKeys(x, ['key', 'kind', 'cueCount'], p)),
    () => (e.arabic === null ? OK : exactKeys(e.arabic, ['fileName', 'cueCount', 'edited', 'matched', 'missing', 'extra', 'drift'], `${path}.arabic`)),
    () => (isIntIn(e.fingerprints, 0, LIMITS.maxFingerprints) ? OK : fail(`${path}.fingerprints`, 'عدد غير صالح')),
    () => validateView(e.view, `${path}.view`),
  ]);
}
