// تدفق الاستيراد (عقد interfaces §٦): قراءة آمنة لملف أو أجزاء، وتحليل متسامح بملاحظات، ودمج بالأرقام، واختيار البصمة،
// ومقارنة تُرفق بالنتيجة. لا كتابة في التخزين هنا (يتولاها المتحكم أو withArabicImport)، ولا تعديل للتوقيت ولا للنص إلا
// ما يُذكر في notes. الاستعادة اليدوية للتوقيت من src/core/compare ولا يستدعيها هذا التدفق أبدًا.
import { DEFAULT_DRIFT_MS, compare } from '../compare/index.js';
import { TjError, messageFor, toErrorInfo } from '../errors/index.js';
import { LIMITS } from '../model/validate.js';
import { parseSrtLenient } from '../srt/lenient.js';
import { selectFingerprint } from './fingerprint.js';
import { mergeParts } from './merge.js';
import { MAX_FILES, MAX_FILE_BYTES, readFileText } from './read-file.js';
import { clip, displayName, toList } from './files.js';

export { MAX_FILES, MAX_FILE_BYTES, mergeParts, selectFingerprint };
export { applyPatch, cuesKey, partsStatus, readPatch } from './patch.js';
export { REVIEW_THRESHOLDS, classTransitions, reviewIncoming, videoIdFromName } from './review.js';

const NAMES_NOTE_CHARS = 300;
const PART_MARK = /[._ -]?part[._ -]?\d+/i;

/** اسم الجزء الأول بحسب الأرقام بلا علامة «part N» إن بقي اسم صالح، وإلا كما هو. */
function mergedFileName(order) {
  const stripped = order[0].replace(PART_MARK, '');
  return stripped && !stripped.startsWith('.') ? stripped : order[0];
}

function threshold(settings) {
  const v = settings?.thresholds?.driftMs;
  return Number.isInteger(v) && v >= 10 && v <= 5000 ? v : DEFAULT_DRIFT_MS;
}

/** حدّ النموذج 50 ملاحظة وكل ملاحظة ≤ 500 محرف؛ الفائض يُختصر بملاحظة تذكر عدده. */
function capNotes(notes) {
  const clipped = notes.map((n) => clip(n, LIMITS.maxNoteChars));
  if (clipped.length <= LIMITS.maxNotes) return clipped;
  const kept = clipped.slice(0, LIMITS.maxNotes - 1);
  return [...kept, messageFor('IM_NOTE_MORE', { count: clipped.length - kept.length })];
}

/**
 * @param {File | File[] | FileList} fileOrFiles أكثر من ملف = أجزاء احتياطية تُدمج بالأرقام
 * @param {{ fingerprints?: import('../model/tracks.js').Fingerprint[], settings?: import('../model/settings.js').Settings }} [opts]
 * @returns {Promise<
 *   { ok: true, fileName: string, cues: import('../model/cue.js').Cue[], comparison: import('../model/tracks.js').ComparisonReport | null,
 *     fingerprintId: string | null, notes: string[], warnings: { code: string, params?: Record<string, string | number> }[] }
 *   | { ok: false, error: { code: string, message: string, line?: number } }>}
 */
export async function readImport(fileOrFiles, { fingerprints = [], settings } = {}) {
  let multi = false;
  let current = null;
  try {
    const files = toList(fileOrFiles);
    if (!files.length) throw new TjError('IM_NO_FILE');
    if (files.length > MAX_FILES) throw new TjError('IM_TOO_MANY_FILES', { params: { count: files.length, max: MAX_FILES } });
    multi = files.length > 1;

    const parts = [];
    const notes = [];
    const warnings = [];
    let total = 0;
    for (const file of files) {
      current = displayName(file);
      const parsed = parseSrtLenient(await readFileText(file));
      // الحد على المجموع أيضًا: كل ملف يجتاز حده وحده، والمدقق يرفض ما فوق 50,000 بعد الدمج.
      total += parsed.cues.length;
      if (total > LIMITS.maxCues) {
        current = null;
        throw new TjError('IM_TOO_MANY_CUES', { params: { max: LIMITS.maxCues } });
      }
      parts.push({ name: current, cues: parsed.cues });
      for (const note of parsed.notes) notes.push(multi ? `«${current}»: ${note}` : note);
      for (const w of parsed.warnings) warnings.push(multi ? { ...w, params: { ...w.params, file: current } } : w);
    }
    current = null;

    let cues = parts[0].cues;
    let fileName = parts[0].name;
    if (multi) {
      const merged = mergeParts(parts);
      if (merged.overlaps.length) throw new TjError('IM_PARTS_OVERLAP', { params: merged.overlaps[0] });
      for (const gap of merged.gaps) warnings.push({ code: 'IM_PARTS_GAP', params: gap });
      cues = merged.cues;
      fileName = mergedFileName(merged.order);
      const names = merged.order.join('، ');
      notes.unshift(messageFor('IM_NOTE_MERGED', {
        count: files.length,
        names: names.length > NAMES_NOTE_CHARS ? `${names.slice(0, NAMES_NOTE_CHARS - 1)}…` : names,
      }));
    }

    const fingerprint = selectFingerprint(fingerprints, cues.length);
    const finalNotes = capNotes(notes);
    const report = compare(cues, fingerprint, { driftMs: threshold(settings) });
    // ملاحظات الاستيراد أولًا ثم ما يضيفه المقارن (سبب تعذّر الاستعادة الشاملة).
    const comparison = { ...report, notes: capNotes([...notes, ...report.notes]) };
    return { ok: true, fileName, cues, comparison, fingerprintId: fingerprint ? fingerprint.id : null, notes: finalNotes, warnings };
  } catch (err) {
    const info = toErrorInfo(err);
    const line = err instanceof TjError ? err.params?.line : undefined;
    const error = { code: info.code, message: multi && current ? `«${current}»: ${info.message}` : info.message };
    if (line) error.line = line;
    if (info.code === 'TJ_UNEXPECTED') error.detail = info.detail;
    return { ok: false, error };
  }
}
