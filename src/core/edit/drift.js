// تصحيح الانجراف الزمني بنقطتين (R54): تحويل خطي للتوقيت كله يضع بداية المقطع a عند a.toMs وبداية المقطع b عند b.toMs، ويمد
// ما بينهما وما حولهما على الخط نفسه. لا يمس النص ولا الأرقام. يرفض الزمن السالب بأرقام المقاطع التي تصيرها، ولا يقص شيئًا.

import { TjError } from '../errors/index.js';
import { LIMITS } from '../model/validate.js';

/** @typedef {import('../model/cue.js').Cue} Cue */

const isTime = (x) => Number.isInteger(x) && x >= 0;

/**
 * @param {Cue[]} cues
 * @param {{ a: { n: number, toMs: number, index?: number }, b: { n: number, toMs: number, index?: number } }} anchors المقطع برقمه
 *   (أول ظهور له) وزمن بدايته الصحيح؛ وindex موضعه حين يحمل رقمه مقطعان (قطعتا شطر: تدقيق 5fedcb9، GM-005)، ويُقبل إن كان رقمه n
 * @returns {{ ok: true, cues: Cue[] } | { ok: false, negative: number[] }}
 * @throws {TjError} ED_DRIFT_ANCHORS لمرساتين غير صالحتين (مقطع غير موجود، أو المقطع نفسه، أو ترتيب ينقلب)، وED_DRIFT_RANGE
 *   لزمن يتجاوز حد النموذج (100 ساعة)
 */
export function driftCorrect(cues, { a, b } = {}) {
  const at = (x) => (Number.isInteger(x?.index) && cues[x.index]?.n === x.n ? x.index : cues.findIndex((c) => c.n === x?.n));
  const ia = at(a);
  const ib = at(b);
  if (ia < 0 || ib < 0 || ia === ib || !isTime(a.toMs) || !isTime(b.toMs)) throw new TjError('ED_DRIFT_ANCHORS');
  const fromA = cues[ia].startMs;
  const fromB = cues[ib].startMs;
  const scale = (b.toMs - a.toMs) / (fromB - fromA);
  if (!Number.isFinite(scale) || scale <= 0) throw new TjError('ED_DRIFT_ANCHORS');
  const map = (t) => Math.round(a.toMs + (t - fromA) * scale);
  const out = cues.map((c) => ({ n: c.n, startMs: map(c.startMs), endMs: map(c.endMs), text: c.text }));
  const negative = out.filter((c) => c.startMs < 0 || c.endMs < 0).map((c) => c.n);
  if (negative.length) return { ok: false, negative };
  if (out.some((c) => c.endMs > LIMITS.maxTimeMs || c.startMs > LIMITS.maxTimeMs)) throw new TjError('ED_DRIFT_RANGE');
  return { ok: true, cues: out };
}
