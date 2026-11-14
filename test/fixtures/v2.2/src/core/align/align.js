// محاذاة مقطعين بالتوقيت (R49 وR50): أي مقطع في الأول يقابل أي مقطع في الثاني، مع الدمج (مقطع واحد يغطي عدة مقاطع)
// والشطر (مقطع يقابله عدة مقاطع) والإسقاط والإضافة. برمجة ديناميكية رتيبة في نطاق زمني محدود حول كل حد بين مقطعين،
// فتكفي ملفًا من 50,000 مقطع. التوقيت هو الدليل الأول؛ والترقيم مرساة ضعيفة لا تغلبه (تمنع فصل مقطع شاذ الزمن عن
// رقمه، ولا تفرض الرقم على منطقة أزاحها دمج أو شطر)، وتطابق النص الحرفي مرساة بين نسختين من الترجمة نفسها (useText).
// الثقة منخفضة عند الشك، والأسباب نصوص عربية تُعرض كما هي. لا DOM ولا تخزين، ولا تعديل للمدخلات.
import { messageFor } from '../errors/index.js';
import { joinList } from '../../i18n/index.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {{ a: number | null, b: number | null }} Pair */
/** @typedef {{ pairs: Pair[], confidence: 'high' | 'low', reasons: string[] }} Alignment */

export const ALIGN_DEFAULTS = Object.freeze({
  windowMs: 15000, // نصف عرض النطاق الزمني حول كل حد
  maxGroup: 3, // أقصى مقاطع في دمج أو شطر واحد
  weakIou: 0.5, // تقابل زمني (التقاطع ÷ الاتحاد) دونه زوج ضعيف
  useText: false, // تطابق النص (بعد توحيد المسافات) مرساة: بين الأصل والمعدّل من الترجمة نفسها
  offset: 'auto', // إزاحة عامة تُقدَّر من الفروق وتُطرح من الثاني قبل المحاذاة، أو رقم بالملي ثانية، أو 0 لإيقافها
});

// تكاليف المسار (الأقل أفضل). المقطع المتروك بلا مقابل 0.6، فزوج بلا أي تقاطع (2) أسوأ من تركهما معًا (1.2).
const SKIP = 0.6;
const NO_OVERLAP = 2;
const GROUP_PENALTY = 0.15; // لكل مقطع زائد في الدمج أو الشطر: التطابق 1:1 يُفضَّل عند التساوي
const NUMBER_CAP = 0.9; // الرقم المتطابق يقرّب الزوج دون التقاء الزمن، ولا يغلب تطابقًا زمنيًا قريبًا
const TEXT_FACTOR = 0.5;
const MIN_MEMBER = 0.5;
const MAX_CELLS = 6_000_000;
const OFFSET_BUCKET_MS = 100;
const OFFSET_SAMPLES = 1000;
const OFFSET_MIN_SAMPLES = 10;
const LIST_MAX = 5;

// ثقة منخفضة: تغطية دون النصف، أو أزواج ضعيفة بلا مرساة فوق 2% (وأكثر من اثنين)، أو أزواج لا يجمعها إلا الرقم فوق 5%.
const MIN_COVERAGE = 0.5;
const WEAK_RATE = 0.02;
const NUMBER_ONLY_RATE = 0.05;
const RATE_FLOOR = 2;
// الزوج الضعيف الذي يجمعه بمقابله رقمه يُقبل انجرافًا إن وافق فرقه وسيط فروق جيرانه بفارق ≤ 300ms أو ربع مدته، وأغلب
// الأزواج متطابقة زمنيًا.
const TREND_SPAN = 5;
const TREND_TOLERANCE_MS = 300;
const TREND_TOLERANCE_RATE = 0.25;

const OP_MATCH = 1;
const OP_SKIP_A = 2;
const OP_SKIP_B = 3;
const OP_MERGE = 4;
const OP_SPLIT = 5;

const flat = (s) => String(s).replace(/\s+/gu, ' ').trim();

/** قائمة أرقام قصيرة للرسائل: أول خمسة ثم «…». */
export const shortList = (ns) => joinList(ns.slice(0, LIST_MAX)) + (ns.length > LIST_MAX ? '…' : '');

/** التقاطع ÷ الاتحاد لمجالين زمنيين؛ والمجالان الصفريان متطابقان إن تساوت نقطتاهما. */
export function iou(s1, e1, s2, e2) {
  const union = Math.max(e1, e2) - Math.min(s1, s2);
  if (union <= 0) return s1 === s2 ? 1 : 0;
  const overlap = Math.min(e1, e2) - Math.max(s1, s2);
  return overlap > 0 ? overlap / union : 0;
}

const strictlyIncreasing = (cues) => cues.every((c, i) => i === 0 || c.n > cues[i - 1].n);

/** أول موضع يقل فيه الزمن عن سابقه في كل قائمة (للأسباب). */
function unordered(cues) {
  const out = [];
  for (let i = 1; i < cues.length; i++) if (cues[i].startMs < cues[i - 1].startMs) out.push(cues[i].n);
  return out;
}

/** عدد القيم في مصفوفة مرتبة الأقل من x. */
function countBelow(sorted, x) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * الإزاحة العامة: فرق بداية كل مقطع من عيّنة الثاني عن بدايات الأول القريبة منه، مقرّبًا إلى 100ms. تُعتمد القيمة الأكثر
 * تكرارًا إن ظهرت في نصف العيّنة على الأقل وكان الفرق الصفري أقل من نصفها؛ فالملفان المتطابقان لا يُزاحان أبدًا.
 */
function estimateOffset(A, B, windowMs) {
  if (A.length < OFFSET_MIN_SAMPLES || B.length < OFFSET_MIN_SAMPLES) return 0;
  const starts = A.map((c) => c.startMs).sort((x, y) => x - y);
  const step = Math.max(1, Math.floor(B.length / OFFSET_SAMPLES));
  const counts = new Map();
  let samples = 0;
  for (let j = 0; j < B.length; j += step) {
    samples++;
    const s = B[j].startMs;
    const seen = new Set();
    for (let k = countBelow(starts, s - windowMs); k < starts.length && starts[k] <= s + windowMs; k++) {
      seen.add(Math.round((s - starts[k]) / OFFSET_BUCKET_MS) * OFFSET_BUCKET_MS);
    }
    for (const d of seen) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [d, c] of counts) {
    if (c > bestCount || (c === bestCount && Math.abs(d) < Math.abs(best))) {
      best = d;
      bestCount = c;
    }
  }
  const zero = counts.get(0) ?? 0;
  return best !== 0 && bestCount >= samples / 2 && zero * 2 < bestCount ? best : 0;
}

/**
 * @param {Cue[]} a الأول (الأصل أو المرجع)
 * @param {Cue[]} b الثاني (الملف أو المعدّل)
 * @param {Partial<typeof ALIGN_DEFAULTS>} [opts]
 * @returns {Alignment} pairs بترتيب الزمن، وكل طرف فيها موضع (من 0) في مصفوفته أو null لما لا مقابل له. المقطع الذي يقابل
 *   عدة مقاطع (دمج أو شطر) يتكرر موضعه في أزواج متتالية.
 */
export function alignCues(a, b, opts = {}) {
  const o = { ...ALIGN_DEFAULTS, ...opts };
  const n = a.length;
  const m = b.length;
  const reasons = [];
  const lone = () => [...a.map((_, i) => ({ a: i, b: null })), ...b.map((_, j) => ({ a: null, b: j }))];
  if (!n || !m) return { pairs: lone(), confidence: 'low', reasons: [messageFor('CMP_ALIGN_EMPTY')] };

  const offset = typeof o.offset === 'number' ? o.offset : o.offset === 'auto' ? estimateOffset(a, b, o.windowMs) : 0;
  const bs = b.map((c) => c.startMs - offset);
  const be = b.map((c) => c.endMs - offset);
  const useNumbers = strictlyIncreasing(a) && strictlyIncreasing(b);
  const textA = o.useText ? a.map((c) => flat(c.text)) : null;
  const textB = o.useText ? b.map((c) => flat(c.text)) : null;

  // النطاق: لكل صف i (عدد ما استُهلك من الأول) مدى j المسموح، من الحد الزمني بين المقطعين i−1 وi ± النافذة. الأعداد
  // من منتصفات الثاني مرتبة (لا تفسدها مقاطع شاذة الترتيب)، ثم يُضمن اتصال الصفوف.
  const mids = bs.map((s, j) => (s + be[j]) / 2).sort((x, y) => x - y);
  const L = new Int32Array(n + 1);
  const R = new Int32Array(n + 1);
  let prev = -Infinity;
  for (let i = 0; i <= n; i++) {
    let t = i === 0 ? a[0].startMs : i === n ? a[n - 1].endMs : (a[i - 1].endMs + a[i].startMs) / 2;
    t = Math.max(t, prev);
    prev = t;
    L[i] = countBelow(mids, t - o.windowMs);
    R[i] = countBelow(mids, t + o.windowMs);
  }
  L[0] = 0;
  R[n] = m;
  for (let i = 1; i <= n; i++) {
    R[i] = Math.max(R[i], R[i - 1]);
    L[i] = Math.min(L[i], R[i - 1]);
  }
  // العدّ بعدد عادي والتوقف فور تجاوز السقف، قبل أي حجز (مجموع العروض قد يفيض عن 32 بتًا في ملف متكدس).
  let cells = 0;
  for (let i = 0; i <= n; i++) {
    cells += R[i] - L[i] + 1;
    if (cells > MAX_CELLS) return { pairs: lone(), confidence: 'low', reasons: [messageFor('CMP_ALIGN_TOO_DENSE')] };
  }
  const rowStart = new Int32Array(n + 2);
  for (let i = 0; i <= n; i++) rowStart[i + 1] = rowStart[i] + (R[i] - L[i] + 1);

  const cost = new Float64Array(cells).fill(Infinity);
  const op = new Uint8Array(cells);
  const span = new Uint8Array(cells);
  const at = (i, j) => (j < L[i] || j > R[i] ? -1 : rowStart[i] + j - L[i]);
  const get = (i, j) => {
    const k = at(i, j);
    return k < 0 ? Infinity : cost[k];
  };

  const timeCost = (overlap) => (overlap > 0 ? 1 - overlap : NO_OVERLAP);
  const matchCost = (i, j) => {
    const x = iou(a[i].startMs, a[i].endMs, bs[j], be[j]);
    let c = timeCost(x);
    if (textA && textA[i] && textA[i] === textB[j]) c = Math.min(c, TEXT_FACTOR * (1 - x));
    if (useNumbers && a[i].n === b[j].n) c = Math.min(c, NUMBER_CAP);
    return c;
  };
  // الدمج والشطر يشترطان أن يغطي المقطع الجامع نصف كل عضو على الأقل؛ فمقطع ساقط أو مضاف بجانب جاره لا يُحسب دمجًا
  // أو شطرًا لأن مدى المجموعة يقارب الجار وحده.
  const covered = (s, e, cs, ce) => (e > s ? Math.max(0, Math.min(e, ce) - Math.max(s, cs)) / (e - s) : s >= cs && s <= ce ? 1 : 0);
  // b[j] يغطي a[i0..i1]
  const mergeCost = (i0, i1, j) => {
    for (let x = i0; x <= i1; x++) if (covered(a[x].startMs, a[x].endMs, bs[j], be[j]) < MIN_MEMBER) return Infinity;
    const x = iou(a[i0].startMs, a[i1].endMs, bs[j], be[j]);
    let c = timeCost(x);
    if (textA && textB[j] && textB[j] === flat(textA.slice(i0, i1 + 1).join(' '))) c = Math.min(c, TEXT_FACTOR * (1 - x));
    return c + GROUP_PENALTY * (i1 - i0);
  };
  // a[i] يقابله b[j0..j1]
  const splitCost = (i, j0, j1) => {
    for (let y = j0; y <= j1; y++) if (covered(bs[y], be[y], a[i].startMs, a[i].endMs) < MIN_MEMBER) return Infinity;
    const x = iou(a[i].startMs, a[i].endMs, bs[j0], be[j1]);
    let c = timeCost(x);
    if (textA && textA[i] && textA[i] === flat(textB.slice(j0, j1 + 1).join(' '))) c = Math.min(c, TEXT_FACTOR * (1 - x));
    return c + GROUP_PENALTY * (j1 - j0);
  };

  let best = Infinity;
  let bestOp = 0;
  let bestSpan = 0;
  // الأسبق عرضًا يفوز عند التساوي: التطابق 1:1 أولًا.
  const offer = (c, which, k) => {
    if (c < best) {
      best = c;
      bestOp = which;
      bestSpan = k;
    }
  };
  cost[0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = L[i]; j <= R[i]; j++) {
      if (i === 0 && j === 0) continue;
      best = Infinity;
      bestOp = 0;
      bestSpan = 0;
      if (i > 0 && j > 0) offer(get(i - 1, j - 1) + matchCost(i - 1, j - 1), OP_MATCH, 1);
      if (i > 0) offer(get(i - 1, j) + SKIP, OP_SKIP_A, 1);
      if (j > 0) offer(get(i, j - 1) + SKIP, OP_SKIP_B, 1);
      for (let k = 2; k <= o.maxGroup; k++) {
        if (i >= k && j > 0) {
          const from = get(i - k, j - 1);
          if (from < Infinity) offer(from + mergeCost(i - k, i - 1, j - 1), OP_MERGE, k);
        }
        if (j >= k && i > 0) {
          const from = get(i - 1, j - k);
          if (from < Infinity) offer(from + splitCost(i - 1, j - k, j - 1), OP_SPLIT, k);
        }
      }
      const idx = at(i, j);
      cost[idx] = best;
      op[idx] = bestOp;
      span[idx] = bestSpan;
    }
  }

  // الرجوع من (n, m): كل خطوة تضيف أزواجها معكوسة، ثم يُقلب المسار.
  /** @type {Pair[]} */
  const rev = [];
  /** @type {{ kind: 'match' | 'merge' | 'split', i0: number, i1: number, j0: number, j1: number }[]} */
  const groups = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const idx = at(i, j);
    const which = op[idx];
    const k = span[idx];
    if (which === OP_MATCH) {
      rev.push({ a: i - 1, b: j - 1 });
      groups.push({ kind: 'match', i0: i - 1, i1: i - 1, j0: j - 1, j1: j - 1 });
      i--;
      j--;
    } else if (which === OP_SKIP_A) {
      rev.push({ a: i - 1, b: null });
      i--;
    } else if (which === OP_SKIP_B) {
      rev.push({ a: null, b: j - 1 });
      j--;
    } else if (which === OP_MERGE) {
      for (let x = i - 1; x >= i - k; x--) rev.push({ a: x, b: j - 1 });
      groups.push({ kind: 'merge', i0: i - k, i1: i - 1, j0: j - 1, j1: j - 1 });
      i -= k;
      j--;
    } else {
      for (let y = j - 1; y >= j - k; y--) rev.push({ a: i - 1, b: y });
      groups.push({ kind: 'split', i0: i - 1, i1: i - 1, j0: j - k, j1: j - 1 });
      i--;
      j -= k;
    }
  }
  const pairs = rev.reverse();
  groups.reverse();

  // الجودة والأسباب. فرق البداية لكل زوج 1:1 (بعد الإزاحة العامة)، ليُعرف أيوافق الزوج الضعيف اتجاه جيرانه.
  const matchAt = new Map();
  const deltas = [];
  groups.forEach((g, k) => {
    if (g.kind !== 'match') return;
    matchAt.set(k, deltas.length);
    deltas.push(bs[g.j0] - a[g.i0].startMs);
  });
  /** انجراف تدريجي: فرق الزوج قريب من وسيط فروق الأزواج المجاورة (خمسة من كل جهة). */
  const followsTrend = (k, g) => {
    const p = matchAt.get(k);
    const near = deltas.slice(Math.max(0, p - TREND_SPAN), p + TREND_SPAN + 1).sort((x, y) => x - y);
    const median = near[near.length >> 1];
    const tolerance = Math.max(TREND_TOLERANCE_MS, (a[g.i0].endMs - a[g.i0].startMs) * TREND_TOLERANCE_RATE);
    return Math.abs(deltas[p] - median) <= tolerance;
  };
  // الانجراف يبدأ من توقيت سليم: لا يُقبل إلا وأغلب الأزواج 1:1 متطابقة زمنيًا (فملف مزاح كله أو صغير مزاح ليس انجرافًا).
  const strongMatches = groups.filter((g) => g.kind === 'match' && iou(a[g.i0].startMs, a[g.i0].endMs, bs[g.j0], be[g.j0]) >= o.weakIou).length;
  const trendAllowed = strongMatches * 2 >= deltas.length;
  const weak = [];
  const numberOnly = [];
  const drifting = [];
  const merges = [];
  const splits = [];
  const shiftedRuns = [];
  let run = null;
  groups.forEach((g, k) => {
    const x = iou(a[g.i0].startMs, a[g.i1].endMs, bs[g.j0], be[g.j1]);
    if (g.kind === 'merge') merges.push(a[g.i0].n);
    if (g.kind === 'split') splits.push(a[g.i0].n);
    if (x < o.weakIou) {
      const byText = textA && (g.kind === 'match'
        ? textA[g.i0] && textA[g.i0] === textB[g.j0]
        : flat(textA.slice(g.i0, g.i1 + 1).join(' ')) === flat(textB.slice(g.j0, g.j1 + 1).join(' ')));
      if (!byText) {
        if (g.kind === 'match' && useNumbers && a[g.i0].n === b[g.j0].n) (trendAllowed && followsTrend(k, g) ? drifting : numberOnly).push(b[g.j0].n);
        else weak.push(b[g.j0].n);
      }
    }
    // الإزاحة عن الرقم: أزواج 1:1 متتالية يختلف رقماها والترقيمان متصاعدان.
    if (g.kind === 'match' && useNumbers && a[g.i0].n !== b[g.j0].n) {
      if (run && run.to === b[g.j0].n - 1) run.to = b[g.j0].n;
      else {
        run = { from: b[g.j0].n, to: b[g.j0].n };
        shiftedRuns.push(run);
      }
    } else run = null;
  });
  const onlyA = pairs.filter((p) => p.b === null).map((p) => a[p.a].n);
  const onlyB = pairs.filter((p) => p.a === null).map((p) => b[p.b].n);
  const matchedA = n - onlyA.length;
  const matchedB = m - onlyB.length;
  const coverage = Math.max(matchedA / n, matchedB / m);
  const units = groups.length;
  // الحد المسموح من الأزواج الضعيفة: نسبة من الوحدات، ولا يقل عن اثنين إلا في ملف صغير (فلا يبلغ نصف وحداته)، ولا يبلغ
  // الوحدات كلها أبدًا: ملف من مقطع واحد لا يجمعه بالمرجع إلا رقمه ليس محاذاة متحققة (تدقيق 5fedcb9، CX-006).
  const allowed = (rate) => Math.min(units - 1, Math.max(Math.min(RATE_FLOOR, Math.floor(units / 2)), Math.ceil(units * rate)));

  let low = false;
  if (coverage < MIN_COVERAGE) {
    low = true;
    reasons.push(messageFor('CMP_ALIGN_COVERAGE', { percent: Math.round(coverage * 100) }));
  }
  if (weak.length) {
    if (weak.length > allowed(WEAK_RATE)) low = true;
    reasons.push(messageFor('CMP_ALIGN_WEAK', { count: weak.length, list: shortList(weak) }));
  }
  if (numberOnly.length) {
    if (numberOnly.length > allowed(NUMBER_ONLY_RATE)) low = true;
    reasons.push(messageFor('CMP_ALIGN_NUMBER_ONLY', { count: numberOnly.length, list: shortList(numberOnly) }));
  }
  if (drifting.length) {
    const most = deltas.reduce((m, d) => Math.max(m, Math.abs(d)), 0);
    reasons.push(messageFor('CMP_ALIGN_DRIFTING', { count: drifting.length, seconds: (most / 1000).toFixed(1) }));
  }
  if (offset) reasons.push(messageFor('CMP_ALIGN_OFFSET', { seconds: (offset / 1000).toFixed(1) }));
  if (merges.length) reasons.push(messageFor('CMP_ALIGN_MERGED', { count: merges.length, list: shortList(merges) }));
  if (splits.length) reasons.push(messageFor('CMP_ALIGN_SPLIT', { count: splits.length, list: shortList(splits) }));
  if (shiftedRuns.length) {
    const first = shiftedRuns[0];
    const total = shiftedRuns.reduce((s, r) => s + r.to - r.from + 1, 0);
    reasons.push(messageFor('CMP_ALIGN_SHIFTED', { from: first.from, to: first.to, count: total }));
  }
  if (onlyA.length) reasons.push(messageFor('CMP_ALIGN_ONLY_A', { count: onlyA.length, list: shortList(onlyA) }));
  if (onlyB.length) reasons.push(messageFor('CMP_ALIGN_ONLY_B', { count: onlyB.length, list: shortList(onlyB) }));
  const disorder = [...unordered(a), ...unordered(b)];
  if (disorder.length) reasons.push(messageFor('CMP_ALIGN_UNORDERED', { list: shortList(disorder) }));

  return { pairs, confidence: low ? 'low' : 'high', reasons };
}

/**
 * الأزواج كتلًا: كل كتلة مواضع متتالية من الطرفين يجمعها تقابل واحد (1:1، أو دمج، أو شطر، أو طرف بلا مقابل).
 * @param {Pair[]} pairs
 * @returns {{ a: number[], b: number[] }[]}
 */
export function toBlocks(pairs) {
  const blocks = [];
  let cur = null;
  for (const p of pairs) {
    const joins = cur && ((p.a !== null && cur.a.at(-1) === p.a) || (p.b !== null && cur.b.at(-1) === p.b));
    if (!joins) {
      cur = { a: [], b: [] };
      blocks.push(cur);
    }
    if (p.a !== null && cur.a.at(-1) !== p.a) cur.a.push(p.a);
    if (p.b !== null && cur.b.at(-1) !== p.b) cur.b.push(p.b);
  }
  return blocks;
}

/**
 * محاذاة «هوية» متحققة: ثقة عالية، والعددان متساويان، وكل مقطع يقابل نظيره في موضعه 1:1. شرط الاستعادة الشاملة.
 * @param {Alignment} alignment @param {number} n @param {number} m
 */
export const isIdentity = (alignment, n, m) => alignment.confidence === 'high' && n === m && alignment.pairs.length === n
  && alignment.pairs.every((p, i) => p.a === i && p.b === i);
