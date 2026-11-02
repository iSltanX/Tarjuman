// إنقاذ المسودة عند تعارض الحفظ (R57): تعديلات المستخدم غير المحفوظة (mine) فوق ما فتحه (base)، مقابل النسخة الأحدث في
// التخزين (theirs). الدمج الثلاثي من P11 يبقي تعديلي حيث لم يغيّر الأحدث الموضع نفسه ويأخذ تغيير الأحدث حيث لم أعدّل، ويسرد ما
// غيّره الطرفان تعارضًا يأخذ فيه الأحدث حتى يختار المستخدم. والإزاحة بالقاعدة نفسها. لا كتابة هنا: الناتج يصبح نسخة العمل
// فوق الأحدث، والحفظ بعده صريح بنسخة الأحدث، فلا يُكتب فوقه.
import { diffTranslations, mergeThreeWay } from '../align/index.js';

/** @typedef {import('../model/cue.js').Cue} Cue */

/**
 * @param {{
 *   base: Cue[], mine: Cue[], theirs: Cue[],
 *   offsets: { base: number, mine: number, theirs: number },
 *   resolve?: Record<number | string, 'mine' | 'theirs'>, offsetChoice?: 'mine' | 'theirs'
 * }} o
 * @returns {{ ok: false, reason: string }
 *   | { ok: true, cues: Cue[], kept: number[], taken: number[], conflicts: { n: number, key: number | string, mine: Cue[], theirs: Cue[] }[],
 *       offsetMs: number, offsetConflict: boolean, counts: { mine: number, theirs: number } }}
 *   counts: ما غيّره كل طرف عن المفتوح (للعرض)؛ وconflicts ما بقي بلا اختيار.
 */
export function planRescue({ base, mine, theirs, offsets, resolve = {}, offsetChoice = 'theirs' }) {
  const merged = mergeThreeWay({ base, mine, theirs }, { resolve });
  if (!merged.ok) return merged;
  const changed = (side) => {
    const d = diffTranslations(base, side);
    return d.counts.textChanged + d.counts.timingChanged + d.counts.added + d.counts.removed;
  };
  const mineMoved = offsets.mine !== offsets.base;
  const theirsMoved = offsets.theirs !== offsets.base;
  const offsetConflict = mineMoved && theirsMoved && offsets.mine !== offsets.theirs;
  const offsetMs = offsetConflict ? (offsetChoice === 'mine' ? offsets.mine : offsets.theirs) : mineMoved ? offsets.mine : offsets.theirs;
  return { ...merged, offsetMs, offsetConflict, counts: { mine: changed(mine), theirs: changed(theirs) } };
}

/**
 * كل التعارضات المسرودة في أول تمرير (قبل أي اختيار)، لعرضها باختيار لكلٍّ: تُحسب بلا resolve.
 * @param {Parameters<typeof planRescue>[0]} o
 */
export const rescueConflicts = (o) => {
  const r = planRescue({ ...o, resolve: {} });
  return r.ok ? r.conflicts : [];
};
