// ترتيب المراجع الإنجليزية (R50): أي بصمة تصدير يطابقها الملف فعلًا، بالعدد والترقيم والتوقيت لا بالأحدث. الأحدث يرجّح
// عند التساوي وحده. الترتيب وصف: لا يختار ولا يحسم، والقرار للمستخدم حين يتقارب الأفضلان (reviewIncoming).
import { messageFor } from '../errors/index.js';
import { compare } from './compare.js';
import { alignToFingerprint } from './restore.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */
/** @typedef {{ fingerprintId: string, score: number, matched: boolean, why: string }} RankedReference */

// الأوزان: التوقيت أقوى الأدلة، ثم الأرقام المتطابقة زمنًا، ثم العدد وحده.
export const RANK_WEIGHTS = Object.freeze({ count: 0.15, numbers: 0.25, timing: 0.6 });
const TIMING_TOLERANCE_MS = 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const percent = (x) => Math.round(x * 100);

/**
 * @param {Cue[]} cues الملف الوارد
 * @param {Fingerprint} fp
 */
function scoreOne(cues, fp) {
  const report = compare(cues, fp, { driftMs: TIMING_TOLERANCE_MS });
  const total = Math.max(cues.length, fp.count);
  const countScore = total ? 1 - Math.abs(cues.length - fp.count) / total : 0;
  // أرقام موجودة في البصمة بزمن مطابق (ضمن 100ms): ما لا زيادة فيه ولا انحراف.
  const numbers = total ? Math.max(0, cues.length - report.extra.length - report.drift.length) / total : 0;
  // أزمنة متطابقة بالمحاذاة (بلا إزاحة عامة): زوج 1:1 فرق بدايته ونهايته ضمن 100ms.
  const alignment = alignToFingerprint(cues, fp);
  let same = 0;
  for (const p of alignment.pairs) {
    if (p.a === null || p.b === null) continue;
    const s = fp.cues[p.a];
    const c = cues[p.b];
    if (Math.abs(c.startMs - s.startMs) <= TIMING_TOLERANCE_MS && Math.abs(c.endMs - s.endMs) <= TIMING_TOLERANCE_MS) same++;
  }
  const timing = total ? Math.min(same, cues.length, fp.count) / total : 0;
  const score = round3(RANK_WEIGHTS.count * countScore + RANK_WEIGHTS.numbers * numbers + RANK_WEIGHTS.timing * timing);
  const why = report.matched
    ? messageFor('CMP_REF_MATCHED')
    : messageFor('CMP_REF_SUMMARY', { countTarget: cues.length, countSource: fp.count, timing: percent(timing), numbers: percent(numbers) });
  return { fingerprintId: fp.id, score, matched: report.matched, why };
}

/**
 * @param {Cue[]} cues
 * @param {Fingerprint[]} fingerprints بصمات الفيديو المحفوظة
 * @returns {RankedReference[]} الأفضل أولًا؛ score بين 0 و1، وmatched مطابقة تامة كما في تقرير المقارنة
 */
export function rankReferences(cues, fingerprints) {
  if (!Array.isArray(fingerprints) || !fingerprints.length || !Array.isArray(cues) || !cues.length) return [];
  return fingerprints
    .map((fp, index) => ({ ...scoreOne(cues, fp), index, at: Date.parse(fp.createdAt) || 0 }))
    .sort((x, y) => y.score - x.score || y.at - x.at || x.index - y.index)
    .map(({ fingerprintId, score, matched, why }) => ({ fingerprintId, score, matched, why }));
}
