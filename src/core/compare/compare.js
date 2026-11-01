// المقارن (R13): يقارن الملف العربي بالبصمة ويصف الفروق فقط، فلا يعدّل شيئًا. المقارنة بالأرقام: النقص والزيادة والتوقيت
// لكل رقم موجود في الجانبين. التوقيت المقارَن هو المحفوظ لا الظاهر (عقد التوقيت §٨). تقرير بصيغة عقد البيانات §٥.
import { canRestore } from './restore.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */
/** @typedef {import('../model/tracks.js').ComparisonReport} ComparisonReport */

export const DEFAULT_DRIFT_MS = 100;
const MAX_DRIFT_MS = 60000;

const HAS_LETTER = /\p{L}/u;
const HAS_ARABIC = /\p{Script=Arabic}/u;
const ascending = (a, b) => a - b;

/**
 * @param {Cue[]} cues الملف العربي كما استُورد (الأرقام كما وردت)
 * @param {Fingerprint | null} fingerprint بصمة التصدير، أو null فلا مقارنة بالأصل
 * @param {{ driftMs?: number }} [opts] عتبة الانحراف بالملي ثانية (الافتراضي 100)؛ يُبلَّغ عمّا يزيد عليها وحدها
 * @returns {ComparisonReport}
 */
export function compare(cues, fingerprint, { driftMs = DEFAULT_DRIFT_MS } = {}) {
  if (!Number.isInteger(driftMs) || driftMs < 0 || driftMs > MAX_DRIFT_MS) throw new RangeError(`عتبة الانحراف غير صالحة: ${driftMs}`);

  const source = fingerprint ? new Map(fingerprint.cues.map((c) => [c.n, c])) : null;
  const found = new Set();
  const extra = new Set();
  const empty = new Set();
  const noArabic = new Set();
  const drift = [];
  let sequential = true;

  cues.forEach((cue, i) => {
    if (cue.n !== i + 1) sequential = false;
    const text = cue.text.trim();
    if (text === '') empty.add(cue.n);
    // المقطع الذي لا حروف فيه (♪ أو أرقام أو رموز) ليس ترجمة ناقصة؛ المقصود ما بقي بحروف غير عربية.
    else if (HAS_LETTER.test(text) && !HAS_ARABIC.test(text)) noArabic.add(cue.n);
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
    restoreTimingAvailable: canRestore(cues, fingerprint),
    driftThresholdMs: driftMs,
    notes: [],
  };
}
