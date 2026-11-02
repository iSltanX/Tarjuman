// تصحيح الانجراف الزمني بنقطتين (R54): تحويل خطي للتوقيت كله يضع بداية المقطع a عند a.toMs وبداية المقطع b عند b.toMs، ويمد
// ما بينهما وما حولهما على الخط نفسه. لا يمس النص ولا الأرقام. يرفض الزمن السالب بأرقام المقاطع التي تصيرها، ولا يقص شيئًا.

import { TjError } from '../errors/index.js';

/** @typedef {import('../model/cue.js').Cue} Cue */

const isTime = (x) => Number.isInteger(x) && x >= 0;

/**
 * @param {Cue[]} cues
 * @param {{ a: { n: number, toMs: number }, b: { n: number, toMs: number } }} anchors المقطع برقمه (أول ظهور له) وزمن بدايته الصحيح
 * @returns {{ ok: true, cues: Cue[] } | { ok: false, negative: number[] }}
 * @throws {TjError} ED_DRIFT_ANCHORS لمرساتين غير صالحتين (مقطع غير موجود، أو المقطع نفسه، أو ترتيب ينقلب)
 */
export function driftCorrect(cues, { a, b } = {}) {
  const ia = cues.findIndex((c) => c.n === a?.n);
  const ib = cues.findIndex((c) => c.n === b?.n);
  if (ia < 0 || ib < 0 || ia === ib || !isTime(a.toMs) || !isTime(b.toMs)) throw new TjError('ED_DRIFT_ANCHORS');
  const fromA = cues[ia].startMs;
  const fromB = cues[ib].startMs;
  const scale = (b.toMs - a.toMs) / (fromB - fromA);
  if (!Number.isFinite(scale) || scale <= 0) throw new TjError('ED_DRIFT_ANCHORS');
  const map = (t) => Math.round(a.toMs + (t - fromA) * scale);
  const out = cues.map((c) => ({ n: c.n, startMs: map(c.startMs), endMs: map(c.endMs), text: c.text }));
  const negative = out.filter((c) => c.startMs < 0 || c.endMs < 0).map((c) => c.n);
  return negative.length ? { ok: false, negative } : { ok: true, cues: out };
}
