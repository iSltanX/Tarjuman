// دمج الأجزاء الاحتياطية بحسب أرقام المقاطع (R11). الدالة تصف فقط: ترتّب الأجزاء بأول رقم فيها، وتبلّغ عن الفجوات
// (جزء ناقص بين جزأين) والتداخل (نطاقا رقمين يتقاطعان) والأرقام المكررة بين الأجزاء. سياسة القبول والرفض في readImport.
// ترتيب المقاطع داخل الجزء يبقى كما ورد، ولا يُعدَّل رقم ولا زمن ولا نص.
import { cloneCues } from '../model/cue.js';

/** @typedef {import('../model/cue.js').Cue} Cue */

/**
 * @param {{ name: string, cues: Cue[] }[]} parts
 * @returns {{
 *   cues: Cue[], order: string[],
 *   gaps: { a: string, b: string, from: number, to: number }[],
 *   overlaps: { a: string, b: string, from: number, to: number }[],
 *   duplicates: number[]
 * }}
 */
export function mergeParts(parts) {
  const info = parts
    .map((part, index) => {
      let min = Infinity;
      let max = -Infinity;
      for (const c of part.cues) {
        if (c.n < min) min = c.n;
        if (c.n > max) max = c.n;
      }
      return { part, index, min, max };
    })
    .filter((p) => p.part.cues.length)
    .sort((x, y) => x.min - y.min || x.max - y.max || x.index - y.index);

  const gaps = [];
  const overlaps = [];
  let reach = -Infinity;
  let reachName = null;
  for (const cur of info) {
    if (reachName !== null) {
      if (cur.min <= reach) overlaps.push({ a: reachName, b: cur.part.name, from: cur.min, to: Math.min(reach, cur.max) });
      else if (cur.min > reach + 1) gaps.push({ a: reachName, b: cur.part.name, from: reach + 1, to: cur.min - 1 });
    }
    if (cur.max > reach) {
      reach = cur.max;
      reachName = cur.part.name;
    }
  }

  const seen = new Set();
  const repeated = new Set();
  for (const { part } of info) {
    for (const n of new Set(part.cues.map((c) => c.n))) {
      if (seen.has(n)) repeated.add(n);
      else seen.add(n);
    }
  }

  return {
    cues: info.flatMap(({ part }) => cloneCues(part.cues)),
    order: info.map(({ part }) => part.name),
    gaps,
    overlaps,
    duplicates: [...repeated].sort((a, b) => a - b),
  };
}
