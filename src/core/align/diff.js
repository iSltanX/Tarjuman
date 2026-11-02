// فرق ترجمتين (R49): ما سيتغير في النص والتوقيت لو حلّت الترجمة الواردة محل الحالية، بمحاذاة التوقيت لا بالرقم وحده
// (فلا يبدو كل ما بعد مقطع ساقط «تغييرًا»). وصف فقط: لا يعدّل شيئًا.
import { alignCues, toBlocks } from './align.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/**
 * @typedef {'text' | 'timing' | 'text-timing' | 'added' | 'removed' | 'merged' | 'split'} ChangeKind
 * @typedef {{ n: number, kind: ChangeKind, before: Cue | Cue[] | null, after: Cue | Cue[] | null }} Change
 */

const MIN_COVERAGE = 0.5;
const one = ({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text });

/**
 * @param {Cue[]} current الترجمة الحالية (المعروضة)
 * @param {Cue[]} incoming الملف الوارد
 * @param {Partial<import('./align.js').ALIGN_DEFAULTS>} [opts] خيارات المحاذاة
 * @returns {{
 *   aligned: boolean, confidence: 'high' | 'low',
 *   counts: { textChanged: number, timingChanged: number, added: number, removed: number, unchanged: number },
 *   changes: Change[]
 * }}
 *   aligned: وُجد تقابل بالتوقيت في نصف المقاطع على الأقل. وإلا فالاستبدال كامل: الأعداد إجمالية (حُذف كل الحالي وأضيف كل
 *   الوارد) بلا قائمة. وconfidence ثقة المحاذاة؛ المنخفضة تكفي للعرض ولا تكفي لإبقاء التعديلات (mergeThreeWay).
 *   n في التغيير رقم المقطع في الحالية، أو في الواردة لما أضيف. والدمج «قبل» مصفوفة، والشطر «بعد» مصفوفة.
 *   textChanged يعدّ text وtext-timing والدمج والشطر، وtimingChanged يعدّ timing وtext-timing والدمج والشطر.
 */
export function diffTranslations(current, incoming, opts = {}) {
  const alignment = alignCues(current, incoming, opts);
  const counts = { textChanged: 0, timingChanged: 0, added: 0, removed: 0, unchanged: 0 };
  const both = alignment.pairs.filter((p) => p.a !== null && p.b !== null);
  const coverage = both.length
    ? Math.max(new Set(both.map((p) => p.a)).size / current.length, new Set(both.map((p) => p.b)).size / incoming.length)
    : 0;
  if (coverage < MIN_COVERAGE) {
    return { aligned: false, confidence: alignment.confidence, counts: { ...counts, added: incoming.length, removed: current.length }, changes: [] };
  }

  /** @type {Change[]} */
  const changes = [];
  for (const block of toBlocks(alignment.pairs)) {
    const before = block.a.map((i) => current[i]);
    const after = block.b.map((j) => incoming[j]);
    if (!after.length) {
      for (const c of before) changes.push({ n: c.n, kind: 'removed', before: one(c), after: null });
      counts.removed += before.length;
    } else if (!before.length) {
      for (const c of after) changes.push({ n: c.n, kind: 'added', before: null, after: one(c) });
      counts.added += after.length;
    } else if (before.length > 1 || after.length > 1) {
      const merged = before.length > 1;
      changes.push({
        n: before[0].n, kind: merged ? 'merged' : 'split', before: merged ? before.map(one) : one(before[0]), after: merged ? one(after[0]) : after.map(one),
      });
      counts.textChanged++;
      counts.timingChanged++;
    } else {
      const [x] = before;
      const [y] = after;
      const text = x.text !== y.text;
      const timing = x.startMs !== y.startMs || x.endMs !== y.endMs;
      if (!text && !timing) {
        counts.unchanged++;
        continue;
      }
      if (text) counts.textChanged++;
      if (timing) counts.timingChanged++;
      changes.push({ n: x.n, kind: text && timing ? 'text-timing' : text ? 'text' : 'timing', before: one(x), after: one(y) });
    }
  }
  return { aligned: true, confidence: alignment.confidence, counts, changes };
}
