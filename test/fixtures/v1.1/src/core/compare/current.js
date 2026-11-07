// تقرير المقارنة للنسخة المعروضة بالمحاذاة (تدقيق 5fedcb9: GM-002 وGM-005 وGM-013 وCX-H1). المقارن compare يحكم بالرقم ويصف
// الملف كما رُفع (عقد data-model §٥ و§١٠، ويبقى كما حُفظ). أما التحذيرات الحاضرة (لوحتا المحرّر، ومرشّح المحفوظات وشارتها،
// وقائمة المشغّل ونافذة الأيقونة) فتُشتق من النسخة الحالية بمحاذاتها بالبصمة زمنيًا كما يفعل ملف التصحيح (readPatch)، فلا يُقرأ
// ملف أُعيد ترقيمه ناقصًا من آخره، ولا يُحسب دمج أو شطر مقصود نقصًا وزيادة وانحرافًا. وبثقة محاذاة منخفضة يبقى حكم الرقم.
// لا يمس restoreTimingAvailable ولا الترقيم: الاستعادة الشاملة بشرطها كما هي (R54). منطق نقي مشتق، لا حالة مخزّنة.
import { alignCues, toBlocks } from '../align/index.js';
import { DEFAULT_DRIFT_MS, compare } from './compare.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */
/** @typedef {import('../model/tracks.js').ComparisonReport} ComparisonReport */

/**
 * @typedef {{
 *   ok: true,
 *   numbersOf: number[][], windowOf: { startMs: number, endMs: number }[], pairs: [number, number][],
 *   missing: number[], extra: number[], structural: Set<number>
 * } | { ok: false }} Coverage
 *   numbersOf[j] أرقام البصمة التي يغطيها المقطع j (1:1 رقم، والمدموج أرقامه، وقطعة الشطر رقم أصلها، والزائد لا شيء)؛
 *   windowOf[j] نافذة المرجع الإنجليزي له (البصمة، أو اتحادها للمدموج، أو زمنه هو للقطعة والزائد)؛ pairs أزواج 1:1 [i, j]؛
 *   missing أرقام البصمة التي لا يغطيها مقطع؛ extra مواضع مقاطع لا تقابل البصمة.
 */

/**
 * تغطية البصمة بالمقاطع بالمحاذاة الزمنية (البصمة بلا نص).
 * @param {Fingerprint | null} fingerprint @param {Cue[]} cues
 * @returns {Coverage}
 */
export function fingerprintCoverage(fingerprint, cues) {
  if (!fingerprint || !Array.isArray(fingerprint.cues) || !fingerprint.cues.length || !Array.isArray(cues) || !cues.length) return { ok: false };
  const fp = fingerprint.cues;
  const alignment = alignCues(fp.map((c) => ({ ...c, text: '' })), cues);
  if (alignment.confidence === 'low') return { ok: false };
  const numbersOf = cues.map(() => []);
  const windowOf = cues.map((c) => ({ startMs: c.startMs, endMs: c.endMs }));
  const pairs = [];
  const covered = new Uint8Array(fp.length);
  const extra = [];
  const structural = new Set();
  for (const block of toBlocks(alignment.pairs)) {
    for (const i of block.a) if (block.b.length) covered[i] = 1;
    if (!block.a.length) {
      extra.push(...block.b);
      continue;
    }
    if (block.a.length === 1 && block.b.length === 1) {
      const [i] = block.a;
      const [j] = block.b;
      numbersOf[j] = [fp[i].n];
      windowOf[j] = { startMs: fp[i].startMs, endMs: fp[i].endMs };
      pairs.push([i, j]);
      continue;
    }
    for (const j of block.b) structural.add(j);
    if (block.b.length === 1) {
      // دمج: المقطع الواحد يغطي مقاطع البصمة كلها، ونافذته اتحادها.
      const [j] = block.b;
      numbersOf[j] = block.a.map((i) => fp[i].n);
      windowOf[j] = { startMs: fp[block.a[0]].startMs, endMs: Math.max(...block.a.map((i) => fp[i].endMs)) };
    } else {
      // شطر (أو بنية أوسع): كل قطعة برقم أول أصلها، ونافذتها زمنها هي فيتوزع الإنجليزي بين القطع.
      for (const j of block.b) numbersOf[j] = [fp[block.a[0]].n];
    }
  }
  const missing = [];
  covered.forEach((c, i) => { if (!c) missing.push(fp[i].n); });
  return { ok: true, numbersOf, windowOf, pairs, missing, extra, structural };
}

/**
 * تقرير المقارنة للنسخة المعروضة: compare، ثم النقص والزيادة والانحراف من التغطية إن وثقت المحاذاة.
 * @param {Cue[]} cues @param {Fingerprint | null} fingerprint
 * @param {{ driftMs?: number, coverage?: Coverage }} [opts] coverage إن حُسبت (فلا تُعاد المحاذاة)
 * @returns {ComparisonReport}
 */
export function currentComparison(cues, fingerprint, { driftMs = DEFAULT_DRIFT_MS, coverage } = {}) {
  const base = compare(cues, fingerprint, { driftMs });
  if (!fingerprint) return base;
  const cov = coverage ?? fingerprintCoverage(fingerprint, cues);
  if (!cov.ok) return base;
  const drift = [];
  for (const [i, j] of cov.pairs) {
    const f = fingerprint.cues[i];
    const c = cues[j];
    const startDeltaMs = c.startMs - f.startMs;
    const endDeltaMs = c.endMs - f.endMs;
    if (Math.abs(startDeltaMs) > driftMs || Math.abs(endDeltaMs) > driftMs) drift.push({ n: c.n, startDeltaMs, endDeltaMs });
  }
  const missing = [...cov.missing].sort((a, b) => a - b);
  const extra = [...new Set(cov.extra.map((j) => cues[j].n))].sort((a, b) => a - b);
  drift.sort((a, b) => a.n - b.n);
  // «مطابق للأصل» يعني الأرقام والتوقيت (user-guide)، فالدمج والشطر يمنعانه ولو توازنا عددًا؛ وتبقى خارج النقص والزيادة
  // والانحراف (تدقيق 7a66f91، U29: كان ملف بدمج وشطر «مطابقًا» وتقرير استيراده «توقيت مختلف في 11»).
  const matched = base.matched || (base.countSource === base.countTarget && base.numbering === 'same' && !cov.structural.size
    && !missing.length && !extra.length && !drift.length);
  return { ...base, matched, missing, extra, drift };
}

const memo = new WeakMap();

/**
 * التقرير الحاضر لترجمة محفوظة (ArabicTrack أو مسار خانة): للنسخة المعروضة بمرجعها، أو تقريرها المحفوظ إن لم يكن لها
 * مرجع محفوظ في السجل. والأصل غير المعدّل بلا تحذير في تقريره لا يحتاج محاذاة. محفوظ لكل مصفوفة مقاطع.
 * @param {{ original: Cue[], current: Cue[] | null, fingerprintId: string | null, comparison: ComparisonReport | null } | null} track
 * @param {Fingerprint[]} fingerprints
 * @returns {ComparisonReport | null}
 */
export function trackComparison(track, fingerprints) {
  if (!track) return null;
  const stored = track.comparison ?? null;
  const fp = track.fingerprintId ? (fingerprints ?? []).find((f) => f.id === track.fingerprintId) ?? null : null;
  if (!fp) return stored;
  const cues = track.current ?? track.original;
  if (track.current === null && stored && stored.fingerprintId === fp.id && !stored.missing.length && !stored.extra.length && !stored.drift.length) return stored;
  let byFp = memo.get(cues);
  if (!byFp) memo.set(cues, (byFp = new Map()));
  const key = `${fp.id}|${stored?.driftThresholdMs ?? DEFAULT_DRIFT_MS}`;
  if (!byFp.has(key)) {
    const report = currentComparison(cues, fp, { driftMs: stored?.driftThresholdMs ?? DEFAULT_DRIFT_MS });
    byFp.set(key, { ...report, notes: stored ? [...stored.notes] : report.notes });
  }
  return byFp.get(key);
}
