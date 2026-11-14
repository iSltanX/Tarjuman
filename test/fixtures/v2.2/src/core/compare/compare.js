// المقارن (R13): يقارن الملف العربي بالبصمة ويصف الفروق فقط، فلا يعدّل شيئًا. المقارنة بالأرقام: النقص والزيادة والتوقيت
// لكل رقم موجود في الجانبين. التوقيت المقارَن هو المحفوظ لا الظاهر (عقد التوقيت §٨). تقرير بصيغة عقد البيانات §٥.
// الاستعادة الشاملة (R50) لا تصح إلا بمحاذاة متحققة؛ وإن طابق البناء ولم تتحقق المحاذاة فالسبب في notes دون حقل جديد.
import { isIdentity } from '../align/index.js';
import { messageFor } from '../errors/index.js';
import { isBlankText } from '../model/cue.js';
import { LIMITS } from '../model/validate.js';
import { parseTrackKey } from '../model/ids.js';
import { langScript, scriptLetterPattern } from '../lang/index.js';
import { alignToFingerprint, sameStructure } from './restore.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */
/** @typedef {import('../model/tracks.js').ComparisonReport} ComparisonReport */

export const DEFAULT_DRIFT_MS = 100;
const MAX_DRIFT_MS = 60000;

const HAS_LETTER = /\p{L}/u;
// حرف عربي فعلي: الأرقام الهندية من الكتابة العربية لكنها ليست حروفًا، فلا تُخفي مقطعًا إنجليزيًا.
const HAS_ARABIC_LETTER = /(?=\p{Script=Arabic})\p{L}/u;
// الفراغ بتعريفه الواحد في نموذج المقطع (تدقيق 7a66f91، U80)، ويُصدَّر من هنا كما كان.
export { isBlankText };
const ascending = (a, b) => a - b;
/** مقطع بحروف ليست من نص بعينه فقط (الرموز والأرقام وحدها ليست ترجمة ناقصة). @param {string} text @param {RegExp} letter */
export const lacksScript = (text, letter) => !isBlankText(text) && HAS_LETTER.test(text) && !letter.test(text);
/** مقطع بحروف غير عربية فقط (حين تكون الترجمة بالعربية). */
export const lacksArabic = (text) => lacksScript(text, HAS_ARABIC_LETTER);

/**
 * فحص «غير مترجم» بحسب لغة الترجمة (AA1، حرية اللغات): مقطع بحروف ليس فيها حرف من نص لغة الترجمة. لا يصح إلا حين يُعرف نص
 * لغة الترجمة ويختلف عن نص لغة المسار (الإنجليزية ← الفرنسية بالنص اللاتيني نفسه لا يُميَّز فيها المترجم من غيره)، وإلا null
 * فلا فحص. والحقل في التقرير noArabic باسمه التاريخي، لأن 1.1.0 يقرؤه بمدققه.
 * @param {string | null | undefined} target لغة الترجمة @param {string | null | undefined} [source] لغة المسار
 * @returns {((text: string) => boolean) | null}
 */
export function untranslatedTest(target, source = null) {
  const t = target ? langScript(target) : null;
  if (!t) return null;
  const s = source ? langScript(source) : null;
  if (s && s === t) return null;
  const letter = scriptLetterPattern(target);
  return letter ? (text) => lacksScript(text, letter) : null;
}
const HIGH_SURROGATE = /[\uD800-\uDBFF]/;
/** ملاحظة في حد النموذج (500 محرف) دون شطر زوج بديل. */
const clipNote = (s) => (s.length <= LIMITS.maxNoteChars ? s : `${s.slice(0, LIMITS.maxNoteChars - (HIGH_SURROGATE.test(s[LIMITS.maxNoteChars - 2]) ? 2 : 1))}…`);

/**
 * @param {Cue[]} cues الملف العربي كما استُورد (الأرقام كما وردت)
 * @param {Fingerprint | null} fingerprint بصمة التصدير، أو null فلا مقارنة بالأصل
 * @param {{ driftMs?: number, target?: string | null }} [opts] عتبة الانحراف بالملي ثانية (الافتراضي 100)؛ يُبلَّغ عمّا يزيد عليها
 *   وحدها. وtarget لغة الترجمة لفحص «غير مترجم» (AA1): null لا فحص، والافتراضي العربية كما كان قبل 2.0.0.
 * @returns {ComparisonReport}
 */
export function compare(cues, fingerprint, { driftMs = DEFAULT_DRIFT_MS, target = 'ar' } = {}) {
  if (!Number.isInteger(driftMs) || driftMs < 0 || driftMs > MAX_DRIFT_MS) throw new RangeError(`عتبة الانحراف غير صالحة: ${driftMs}`);
  const untranslated = untranslatedTest(target, fingerprint ? parseTrackKey(fingerprint.trackKey)?.lang ?? null : null);

  const source = fingerprint ? new Map(fingerprint.cues.map((c) => [c.n, c])) : null;
  const found = new Set();
  const extra = new Set();
  const empty = new Set();
  const noArabic = new Set();
  const drift = [];
  let sequential = true;

  cues.forEach((cue, i) => {
    if (cue.n !== i + 1) sequential = false;
    const text = cue.text;
    if (isBlankText(text)) empty.add(cue.n);
    // المقطع الذي لا حروف فيه (♪ أو أرقام أو رموز) ليس ترجمة ناقصة؛ المقصود ما بقي بحروف ليست من نص لغة الترجمة.
    else if (untranslated && untranslated(text)) noArabic.add(cue.n);
    if (!source) return;

    const src = source.get(cue.n);
    // رقم غير موجود في الأصل، أو مكرر: أول ظهور فقط يقابل الأصل.
    if (!src || found.has(cue.n)) {
      extra.add(cue.n);
      return;
    }
    found.add(cue.n);
    const startDeltaMs = cue.startMs - src.startMs;
    const endDeltaMs = cue.endMs - src.endMs;
    if (Math.abs(startDeltaMs) > driftMs || Math.abs(endDeltaMs) > driftMs) drift.push({ n: cue.n, startDeltaMs, endDeltaMs });
  });

  const missing = [];
  if (source) for (const n of source.keys()) if (!found.has(n)) missing.push(n);
  const countTarget = cues.length;
  const countSource = fingerprint ? fingerprint.count : null;
  const numbering = sequential ? 'same' : 'different';
  const notes = [];
  let restoreTimingAvailable = false;
  if (sameStructure(cues, fingerprint)) {
    const alignment = alignToFingerprint(cues, fingerprint);
    restoreTimingAvailable = isIdentity(alignment, fingerprint.count, countTarget);
    if (!restoreTimingAvailable) notes.push(clipNote(messageFor('CMP_RESTORE_UNVERIFIED', { reasons: alignment.reasons.join(' ') }).trim()));
  }

  return {
    fingerprintId: fingerprint ? fingerprint.id : null,
    matched: fingerprint !== null && countSource === countTarget && sequential && !missing.length && !extra.size && !drift.length,
    countSource,
    countTarget,
    numbering,
    missing: missing.sort(ascending),
    extra: [...extra].sort(ascending),
    drift: drift.sort((a, b) => a.n - b.n),
    empty: [...empty].sort(ascending),
    noArabic: [...noArabic].sort(ascending),
    restoreTimingAvailable,
    driftThresholdMs: driftMs,
    notes,
  };
}
