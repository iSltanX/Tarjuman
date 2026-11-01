// محوّل ASR (تقرير كلود §٤.٢): تسطيح إلى كلمات بأزمنتها، ثم تجميع في مقاطع، دون إسقاط أي كلمة
// ودون إزالة تداخل نصي تخمينًا. الصيغة المتدحرجة (حدث يكرر ذيل السابق) توقف التحويل.
import { ConvertError } from './json3.js';
import { splitWords, wrapLines } from './text.js';

export const ASR_DEFAULTS = Object.freeze({
  gapMs: 700, maxChars: 84, maxDurationMs: 6000, lineChars: 42, tailMs: 1500, minDurationMs: 300, rollingWords: 3,
});

const SENTENCE_END = /[.?!]["'”’)\]]*$/u;

/**
 * يكشف الصيغة الشاذة: حدثان متداخلان زمنيًا وبداية الثاني تكرر ذيل الأول (asbplayer #1318).
 * @param {import('./json3.js').TextEvent[]} events
 * @param {number} minWords
 */
export function detectRollingOverlap(events, minWords) {
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1];
    const b = events[i];
    const aEnd = a.endMs ?? a.startMs;
    if (b.startMs >= aEnd) continue;
    const aw = splitWords(a.text);
    const bw = splitWords(b.text);
    const max = Math.min(aw.length, bw.length);
    for (let k = max; k >= minWords; k--) {
      if (aw.slice(aw.length - k).join(' ') === bw.slice(0, k).join(' ')) {
        return { eventIndex: b.index, repeatedWords: k };
      }
    }
  }
  return null;
}

/**
 * كلمات الحدث بأزمنتها: زمن الكلمة زمن المقطع الجزئي (seg) الذي تبدأ فيه.
 * @param {import('./json3.js').TextEvent} e
 */
function eventWords(e) {
  const bounds = [];
  let pos = 0;
  for (const s of e.segs) {
    bounds.push({ pos, t: e.startMs + s.offsetMs });
    pos += s.text.length;
  }
  const out = [];
  let b = 0;
  for (const m of e.text.matchAll(/\S+/gu)) {
    while (b + 1 < bounds.length && bounds[b + 1].pos <= m.index) b++;
    out.push({ t: bounds[b].t, text: m[0], eventEndMs: e.endMs });
  }
  return out;
}

/**
 * @param {import('./json3.js').TextEvent[]} events مرتبة ومنزوعة التكرار الحرفي
 * @param {Partial<typeof ASR_DEFAULTS>} [options]
 * @returns {{ cues: { startMs: number, endMs: number, text: string }[], report: object }}
 */
export function convertAsr(events, options = {}) {
  const o = { ...ASR_DEFAULTS, ...options };
  const rolling = detectRollingOverlap(events, o.rollingWords);
  if (rolling) {
    throw new ConvertError('EX_UNSUPPORTED_FORMAT', 'صيغة ASR متدحرجة: حدث يكرر ذيل السابق مع تداخل زمني', rolling);
  }
  // الكلمات بترتيب الأحداث ثم ترتيبها داخل الحدث؛ والزمن يُجعل غير متناقص دون تغيير الترتيب.
  const words = [];
  let clamped = 0;
  for (const e of events) {
    for (const w of eventWords(e)) {
      const prev = words[words.length - 1];
      if (prev && w.t < prev.t) {
        w.t = prev.t;
        clamped++;
      }
      words.push(w);
    }
  }
  const groups = [];
  let cur = null;
  for (const w of words) {
    if (!cur) {
      cur = { startMs: w.t, words: [w], chars: w.text.length };
      continue;
    }
    const prev = cur.words[cur.words.length - 1];
    const canBreak = w.t > cur.startMs;
    const shouldBreak = SENTENCE_END.test(prev.text)
      || w.t - prev.t > o.gapMs
      || cur.chars + 1 + w.text.length > o.maxChars
      || w.t - cur.startMs > o.maxDurationMs;
    if (canBreak && shouldBreak) {
      groups.push(cur);
      cur = { startMs: w.t, words: [w], chars: w.text.length };
    } else {
      cur.words.push(w);
      cur.chars += 1 + w.text.length;
    }
  }
  if (cur) groups.push(cur);

  const cues = groups.map((g, i) => {
    const next = groups[i + 1];
    const last = g.words[g.words.length - 1];
    let end = last.t + o.tailMs;
    if (last.eventEndMs !== null) end = Math.min(end, last.eventEndMs);
    end = Math.max(end, g.startMs + o.minDurationMs);
    if (next) end = Math.min(end, next.startMs);
    return { startMs: g.startMs, endMs: end, text: wrapLines(g.words.map((w) => w.text).join(' '), o.lineChars) };
  });
  return { cues, report: { words: words.length, clampedWordTimes: clamped, options: o } };
}
