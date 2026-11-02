// الدمج الثلاثي (R49 وR57): الأصل القديم (base) والمعدّل منه (mine) والملف الجديد (theirs). يبقي تعديل المستخدم حيث لم يغيّر
// الجديد الموضع نفسه، ويأخذ تغيير الجديد حيث لم يعدّل المستخدم، ويسرد ما غيّره الطرفان بغير الشيء نفسه تعارضًا لا يُحسم
// بصمت: يأخذ الناتج الجديدَ فيه حتى يختار المستخدم (opts.resolve). يرفض بسبب مكتوب إن ضعفت ثقة إحدى المحاذاتين.
// الوحدة منطقة من الأصل تتفق حدودها في المحاذاتين؛ والمنطقة البسيطة (مقطع بمقطع في الطرفين) تُدمج حقلًا حقلًا: النص
// وحده، والتوقيت وحده.
import { messageFor } from '../errors/index.js';
import { alignCues, toBlocks } from './align.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {{ n: number, mine: Cue[], theirs: Cue[] }} Conflict */

const one = ({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text });
const sameCue = (x, y) => x.startMs === y.startMs && x.endMs === y.endMs && x.text === y.text;
const sameList = (xs, ys) => xs.length === ys.length && xs.every((x, i) => sameCue(x, ys[i]));
const overlaps = (x, y) => x.startMs < y.endMs && y.startMs < x.endMs;

/**
 * كتل محاذاة الأصل بطرف موزّعة على مواضعها: لكل كتلة مدى من الأصل، أو فجوة (عدد ما قبلها من الأصل) لما أُضيف.
 * @returns {{ blocks: { from: number, to: number, gap: number | null, cues: Cue[] }[], cutAt: Uint8Array }} cutAt[g] = 1 حين
 *   يقع حد كتلة بين الأصل g−1 وg.
 */
function placed(pairs, side, n) {
  const cutAt = new Uint8Array(n + 1);
  cutAt[0] = 1;
  cutAt[n] = 1;
  let consumed = 0;
  const blocks = toBlocks(pairs).map((b) => {
    const cues = b.b.map((j) => side[j]);
    if (!b.a.length) return { from: -1, to: -1, gap: consumed, cues };
    const from = b.a[0];
    const to = b.a.at(-1);
    cutAt[from] = 1;
    cutAt[to + 1] = 1;
    consumed = to + 1;
    return { from, to, gap: null, cues };
  });
  return { blocks, cutAt };
}

/**
 * @param {{ base: Cue[], mine: Cue[], theirs: Cue[] }} sides
 * @param {{ align?: Partial<import('./align.js').ALIGN_DEFAULTS>, resolve?: Record<number, 'mine' | 'theirs'> | Map<number, 'mine' | 'theirs'> }} [opts]
 *   align خيارات المحاذاة (useText مفعّل افتراضيًا: النص غير المعدّل مرساة). resolve اختيار المستخدم لكل تعارض برقمه n.
 * @returns {{ ok: true, cues: Cue[], kept: number[], taken: number[], conflicts: Conflict[] } | { ok: false, reason: string }}
 *   kept وtaken مواضع (من 0) في cues لما أُبقي من تعديل المستخدم ولما أُخذ من تغيير الجديد (والحذف المُبقى لا موضع له).
 *   conflicts ما لم يُحسم: n رقم أول مقطع في المنطقة من الأصل القديم (أو من الجديد لإضافتين متداخلتين)، وmine وtheirs
 *   مقاطع الطرفين فيها (مصفوفة فارغة = حُذف). أرقام الناتج من مصدر كل مقطع كما هي.
 */
export function mergeThreeWay({ base, mine, theirs }, opts = {}) {
  const alignOpts = { useText: true, ...opts.align };
  const am = alignCues(base, mine, alignOpts);
  if (am.confidence === 'low') return { ok: false, reason: messageFor('CMP_MERGE_LOW_MINE', { reasons: am.reasons.join(' ') }) };
  const at = alignCues(base, theirs, alignOpts);
  if (at.confidence === 'low') return { ok: false, reason: messageFor('CMP_MERGE_LOW_THEIRS', { reasons: at.reasons.join(' ') }) };
  const choice = (n) => (opts.resolve instanceof Map ? opts.resolve.get(n) : opts.resolve?.[n]);

  const n = base.length;
  const M = placed(am.pairs, mine, n);
  const T = placed(at.pairs, theirs, n);
  // المناطق: حد بين الأصل g−1 وg مسموح حين يقطع عنده الطرفان معًا.
  const regionOf = new Int32Array(n);
  const regions = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 || (M.cutAt[i] && T.cutAt[i])) regions.push({ from: i, to: i, mine: [], theirs: [] });
    regions[regions.length - 1].to = i;
    regionOf[i] = regions.length - 1;
  }
  // الإضافة عند فجوة داخل منطقة جزء منها؛ وعند حد مسموح إضافة مستقلة بين منطقتين.
  const gaps = new Map();
  const gapAt = (g) => {
    if (!gaps.has(g)) gaps.set(g, { mine: [], theirs: [] });
    return gaps.get(g);
  };
  const assign = (P, key) => {
    for (const b of P.blocks) {
      if (b.gap === null) regions[regionOf[b.from]][key].push(...b.cues);
      else if (b.gap > 0 && b.gap < n && !(M.cutAt[b.gap] && T.cutAt[b.gap])) regions[regionOf[b.gap]][key].push(...b.cues);
      else gapAt(b.gap)[key].push(...b.cues);
    }
  };
  assign(M, 'mine');
  assign(T, 'theirs');

  const cues = [];
  const kept = [];
  const taken = [];
  /** @type {Conflict[]} */
  const conflicts = [];
  const emit = (list, into) => list.forEach((c) => {
    if (into) into.push(cues.length);
    cues.push(one(c));
  });

  const insertions = (g) => {
    const gap = gaps.get(g);
    if (!gap) return;
    const { mine: mi, theirs: ti } = gap;
    if (sameList(mi, ti)) return emit(ti, ti.length ? taken : null);
    if (mi.some((x) => ti.some((y) => overlaps(x, y)))) {
      const pick = choice(ti[0].n);
      if (!pick) conflicts.push({ n: ti[0].n, mine: mi.map(one), theirs: ti.map(one) });
      return pick === 'mine' ? emit(mi, kept) : emit(ti, taken);
    }
    // إضافتان لا تتداخلان: تبقيان كلتاهما بترتيب الزمن.
    const all = [...mi.map((c) => ({ c, mine: true })), ...ti.map((c) => ({ c, mine: false }))].sort((x, y) => x.c.startMs - y.c.startMs);
    for (const { c, mine: own } of all) emit([c], own ? kept : taken);
  };

  for (const r of regions) {
    insertions(r.from);
    const B = base.slice(r.from, r.to + 1);
    const mineChanged = !sameList(B, r.mine);
    const theirsChanged = !sameList(B, r.theirs);
    const key = B[0].n;
    if (B.length === 1 && r.mine.length === 1 && r.theirs.length === 1) {
      // حقلًا حقلًا: لكل من النص والتوقيت قيمة الأصل والطرفين.
      const [b] = B;
      const [x] = r.mine;
      const [y] = r.theirs;
      const field = (get, same) => {
        const bv = get(b);
        const xv = get(x);
        const yv = get(y);
        if (same(xv, bv)) return { v: yv, from: same(yv, bv) ? null : 'theirs' };
        if (same(yv, bv) || same(xv, yv)) return { v: same(yv, bv) ? xv : yv, from: same(yv, bv) ? 'mine' : 'theirs' };
        return { conflict: true, xv, yv };
      };
      const text = field((c) => c.text, (p, q) => p === q);
      const time = field((c) => [c.startMs, c.endMs], (p, q) => p[0] === q[0] && p[1] === q[1]);
      const pick = text.conflict || time.conflict ? choice(key) : null;
      if ((text.conflict || time.conflict) && !pick) conflicts.push({ n: key, mine: [one(x)], theirs: [one(y)] });
      const resolve = (f) => (f.conflict ? { v: pick === 'mine' ? f.xv : f.yv, from: pick === 'mine' ? 'mine' : 'theirs' } : f);
      const t = resolve(text);
      const s = resolve(time);
      const index = cues.length;
      cues.push({ n: y.n, startMs: s.v[0], endMs: s.v[1], text: t.v });
      if (t.from === 'mine' || s.from === 'mine') kept.push(index);
      if (t.from === 'theirs' || s.from === 'theirs') taken.push(index);
      continue;
    }
    if (!mineChanged) emit(r.theirs, theirsChanged ? taken : null);
    else if (!theirsChanged) emit(r.mine, kept);
    else if (sameList(r.mine, r.theirs)) emit(r.theirs, taken);
    else {
      const pick = choice(key);
      if (!pick) conflicts.push({ n: key, mine: r.mine.map(one), theirs: r.theirs.map(one) });
      if (pick === 'mine') emit(r.mine, kept);
      else emit(r.theirs, taken);
    }
  }
  insertions(n);
  return { ok: true, cues, kept, taken, conflicts };
}
