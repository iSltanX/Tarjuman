// إنقاذ المسودة عند تعارض الحفظ (R57): تعديلات المستخدم غير المحفوظة (mine) فوق ما فتحه (base)، مقابل النسخة الأحدث في
// التخزين (theirs). الدمج الثلاثي من P11 يبقي تعديلي حيث لم يغيّر الأحدث الموضع نفسه ويأخذ تغيير الأحدث حيث لم أعدّل، ويسرد ما
// غيّره الطرفان تعارضًا يأخذ فيه الأحدث حتى يختار المستخدم. والإزاحة بالقاعدة نفسها. لا كتابة هنا: الناتج يصبح نسخة العمل
// فوق الأحدث، والحفظ بعده صريح بنسخة الأحدث، فلا يُكتب فوقه.
import { diffTranslations, mergeThreeWay } from '../align/index.js';

/** @typedef {import('../model/cue.js').Cue} Cue */

/**
 * @param {{
 *   base: Cue[], mine: Cue[], theirs: Cue[],
 *   offsets: { base: number, mine: number, theirs: number, committed?: number },
 *   resolve?: Record<number | string, 'mine' | 'theirs'>, offsetChoice?: 'mine' | 'theirs'
 * }} o
 * @returns {{ ok: false, reason: string }
 *   | { ok: true, cues: Cue[], kept: number[], taken: number[], conflicts: { n: number, key: number | string, mine: Cue[], theirs: Cue[] }[],
 *       offsetMs: number, offsetConflict: boolean, counts: { mine: number, theirs: number } }}
 *   counts: ما غيّره كل طرف عن المفتوح (للعرض)؛ وconflicts ما بقي بلا اختيار.
 */
export function planRescue({ base, mine, theirs, offsets, resolve = {}, offsetChoice = 'theirs' }) {
  // الدمج كله في إطار الأساس (U-036): «تثبيت الإزاحة» (committed) نقلٌ لا يغيّر الظاهر، فيُرد توقيتي إلى إطار الأساس قبل
  // الدمج والعدّ، وإلا ظهر كل مقطع «معدَّلًا» وتعارض توقيتي الإزاحي مع توقيت الأحدث. والإزاحات تُقارن في إطار الأساس أيضًا:
  // إزاحتي الفعلية mineEff = offsets.mine + committed، وإزاحة الأحدث offsets.theirs كما هي (الأحدث لم يثبّت ما ثبّتُّه أنا،
  // وإن ثبّت مثله فقيمته في توقيت مقاطعه فتحمله نسخته بالدمج؛ GM-014.1 ثم التدقيق الموحد V2).
  const committed = offsets.committed ?? 0;
  const mineB = committed ? mine.map((c) => ({ ...c, startMs: c.startMs - committed, endMs: c.endMs - committed })) : mine;
  const merged = mergeThreeWay({ base, mine: mineB, theirs }, { resolve });
  if (!merged.ok) return merged;
  // عدّ المقاطع لا الحقول: المقطع الذي تغيّر نصه وتوقيته مقطع واحد.
  const changed = (side) => {
    const d = diffTranslations(base, side);
    return d.aligned ? d.changes.length : d.counts.added + d.counts.removed;
  };
  const mineEff = offsets.mine + committed;
  const mineMoved = mineEff !== offsets.base;
  const theirsMoved = offsets.theirs !== offsets.base;
  const offsetConflict = mineMoved && theirsMoved && mineEff !== offsets.theirs;
  let offsetMs = offsetConflict ? (offsetChoice === 'mine' ? mineEff : offsets.theirs) : mineMoved ? mineEff : offsets.theirs;
  let cues = merged.cues;
  // يُعاد التثبيت بمقدار committed فقط إن بقي في الإزاحة الناتجة ما يساويه بالإشارة نفسها وبقيمة لا تقل عنه؛ وإلا فالظاهر
  // محفوظ بلا تثبيت (لا إضافة غير مشروطة: تثبيت مضاعف إن ثبّت الأحدث الإزاحة نفسها).
  if (committed && Math.sign(offsetMs) === Math.sign(committed) && Math.abs(offsetMs) >= Math.abs(committed)) {
    cues = cues.map((c) => ({ ...c, startMs: c.startMs + committed, endMs: c.endMs + committed }));
    offsetMs -= committed;
  }
  return { ...merged, cues, offsetMs, offsetConflict, counts: { mine: changed(mineB), theirs: changed(theirs) } };
}
