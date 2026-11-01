// ما يعرضه المحرّر بجانب المقاطع: العمود الإنجليزي المرجعي، وصفوف «ناقص في الترجمة» بحسب تقرير المقارنة.
// قراءة فقط: لا يُغيّر مقطعًا ولا ترتيبًا.

/** @typedef {{ n: number, startMs: number, endMs: number, text?: string }} TimedCue */

/**
 * المسار الإنجليزي المرجعي: مسار البصمة إن وُجد، وإلا اليدوي قبل التلقائي (كما يختار المتحكم).
 * @template {{ key: string, kind: 'manual' | 'asr' }} T
 * @param {T[]} tracks @param {{ trackKey: string } | null} fingerprint
 * @returns {T | null}
 */
export function pickEnglishTrack(tracks, fingerprint) {
  const byKey = fingerprint ? tracks.find((t) => t.key === fingerprint.trackKey) : null;
  return byKey ?? tracks.find((t) => t.kind === 'manual') ?? tracks[0] ?? null;
}

/**
 * نص إنجليزي لكل مقطع عربي: المقاطع الإنجليزية (بوضعها «عادي» كما حُفظت) التي يقع منتصفها في نافذة المقطع.
 * النافذة من البصمة برقم المقطع (فلا يتغير المرجع بتعديل توقيت العربي، ويصح لوضع «مقاطع أطول» الذي جمع
 * عدة مقاطع عادية في مقطع واحد)، وبلا بصمة من توقيت العربي كما فُتح.
 * @param {TimedCue[]} arabic @param {TimedCue[]} english
 * @param {{ cues: { n: number, startMs: number, endMs: number }[] } | null} fingerprint
 * @returns {string[]} بطول المقاطع العربية، و'' لما لا مرجع له
 */
export function englishReference(arabic, english, fingerprint) {
  const out = arabic.map(() => '');
  if (!english.length) return out;
  const byN = fingerprint ? new Map(fingerprint.cues.map((c) => [c.n, c])) : null;
  const windows = [];
  arabic.forEach((c, i) => {
    const w = byN ? byN.get(c.n) : c;
    if (w && w.endMs > w.startMs) windows.push({ i, startMs: w.startMs, endMs: w.endMs });
  });
  windows.sort((a, b) => a.startMs - b.startMs || a.i - b.i);
  const parts = new Map();
  for (const e of english) {
    const mid = (e.startMs + e.endMs) / 2;
    let lo = 0;
    let hi = windows.length - 1;
    let at = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (windows[m].startMs <= mid) {
        at = m;
        lo = m + 1;
      } else hi = m - 1;
    }
    // أول نافذة تحوي المنتصف عند تداخل النوافذ.
    while (at > 0 && windows[at - 1].startMs <= mid && windows[at - 1].endMs >= mid) at--;
    if (at < 0 || mid > windows[at].endMs) continue;
    const i = windows[at].i;
    if (!parts.has(i)) parts.set(i, []);
    parts.get(i).push(e.text.replace(/\s*\n\s*/g, ' '));
  }
  for (const [i, list] of parts) out[i] = list.join(' ');
  return out;
}

/**
 * صفوف القائمة: كل مقطع بموضعه، وكل رقم ناقص من الأصل («ناقص في الترجمة») قبل أول مقطع رقمه أكبر منه.
 * @param {{ n: number }[]} cues @param {number[]} missing أرقام مرتبة من تقرير المقارنة
 * @returns {({ type: 'cue', index: number } | { type: 'missing', n: number })[]}
 */
export function buildRows(cues, missing) {
  const rows = [];
  const gaps = [...missing].sort((a, b) => a - b);
  let k = 0;
  cues.forEach((c, index) => {
    while (k < gaps.length && gaps[k] < c.n) rows.push({ type: 'missing', n: gaps[k++] });
    rows.push({ type: 'cue', index });
  });
  while (k < gaps.length) rows.push({ type: 'missing', n: gaps[k++] });
  return rows;
}
