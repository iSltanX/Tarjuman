// عقد التوقيت (docs/contracts/timing.md) في دوال نقية: إزاحة العرض تُضاف عند العرض فقط، والتوقيت
// المحفوظ لا يتغير إلا بفعل صريح، والتصدير لا يغيّر شيئًا مخزَّنًا. لا قصّ صامت لأي زمن سالب.

export const OFFSET_GRID_MS = 100;
export const MAX_OFFSET_MS = 600000;
export const DEFAULT_OFFSET_STEP_MS = 500;

/** @param {unknown} ms */
export const isValidOffset = (ms) => Number.isInteger(ms) && Math.abs(ms) <= MAX_OFFSET_MS && ms % OFFSET_GRID_MS === 0;

/**
 * يقرّب إلى شبكة 100ms ويقصر على ±10 دقائق؛ غير العددي صفر. التقريب متناظر حول الصفر (النصف بعيدًا عنه)، فإزاحة
 * وعكسها تتقابلان: +50 إلى 100 و−50 إلى −100 (تدقيق 7a66f91، U97؛ كان Math.round يقرّب −50 إلى 0).
 * @param {unknown} ms
 */
export function normalizeOffset(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 0;
  const r = Math.sign(ms) * Math.round(Math.abs(ms) / OFFSET_GRID_MS) * OFFSET_GRID_MS;
  return Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, r)) || 0;
}

/**
 * زمن البحث عن المقطع الظاهر: currentTime × 1000 − الإزاحة. لا يغيّر currentTime أبدًا (§١).
 * @param {number} currentTimeSec video.currentTime
 * @param {number} displayOffsetMs
 */
export const lookupMs = (currentTimeSec, displayOffsetMs) => Math.round(currentTimeSec * 1000) - displayOffsetMs;

/**
 * التوقيت الظاهر لمقطع: المحفوظ + الإزاحة (لا يُخزَّن).
 * @param {{ startMs: number, endMs: number }} cue @param {number} displayOffsetMs
 */
export const shownTimes = (cue, displayOffsetMs) => ({ startMs: cue.startMs + displayOffsetMs, endMs: cue.endMs + displayOffsetMs });

/**
 * ينقل مقاطع بمقدار deltaMs ويعيد نسخة جديدة. إن أنتج النقل زمنًا سالبًا فلا نقل جزئي: ok=false وأرقام المقاطع.
 * @template {{ n: number, startMs: number, endMs: number }} C
 * @param {C[]} cues
 * @param {number} deltaMs
 * @param {{ only?: (cue: C, index: number) => boolean }} [opts] النطاق؛ الافتراضي الملف كله
 * @returns {{ ok: true, cues: C[] } | { ok: false, negative: number[] }}
 */
export function shiftCues(cues, deltaMs, { only } = {}) {
  if (!Number.isInteger(deltaMs)) throw new RangeError('مقدار النقل ليس عددًا صحيحًا');
  const negative = [];
  const out = cues.map((c, i) => {
    if (only && !only(c, i)) return { ...c };
    const startMs = c.startMs + deltaMs;
    const endMs = c.endMs + deltaMs;
    if (startMs < 0 || endMs < 0) negative.push(c.n);
    return { ...c, startMs, endMs };
  });
  return negative.length ? { ok: false, negative } : { ok: true, cues: out };
}

/**
 * «تثبيت الإزاحة» (§٤): تُضاف الإزاحة إلى كل المقاطع وتصبح صفرًا في خطوة واحدة؛ لا أحدهما دون الآخر.
 * @template {{ n: number, startMs: number, endMs: number }} C
 * @param {C[]} cues @param {number} displayOffsetMs
 * @returns {{ ok: true, cues: C[], displayOffsetMs: 0 } | { ok: false, negative: number[] }}
 */
export function commitOffset(cues, displayOffsetMs) {
  const r = shiftCues(cues, displayOffsetMs);
  return r.ok ? { ok: true, cues: r.cues, displayOffsetMs: 0 } : r;
}

/**
 * توقيت التصدير العربي (§٥). الإزاحة صفر ← المحفوظ دون سؤال. وإلا يختار المستخدم «shown» (الافتراضي:
 * المحفوظ + الإزاحة) أو «saved». الزمن السالب يرفض التصدير ويذكر المقاطع. لا يغيّر شيئًا مخزَّنًا.
 * @template {{ n: number, startMs: number, endMs: number }} C
 * @param {C[]} cues @param {number} displayOffsetMs @param {'shown' | 'saved'} [choice]
 * @returns {{ ok: true, cues: C[], timing: 'saved' | 'shown', askUser: boolean } | { ok: false, negative: number[], code: 'MD_NEGATIVE_TIME' }}
 */
export function exportTiming(cues, displayOffsetMs, choice = 'shown') {
  if (displayOffsetMs === 0) return { ok: true, cues: cues.map((c) => ({ ...c })), timing: 'saved', askUser: false };
  if (choice === 'saved') return { ok: true, cues: cues.map((c) => ({ ...c })), timing: 'saved', askUser: true };
  const r = shiftCues(cues, displayOffsetMs);
  return r.ok ? { ok: true, cues: r.cues, timing: 'shown', askUser: true } : { ok: false, negative: r.negative, code: 'MD_NEGATIVE_TIME' };
}
