// محوّل ASR (تقرير كلود §٤.٢): تسطيح إلى كلمات بأزمنتها، ثم تجميع في مقاطع، دون إسقاط أي كلمة
// ودون إزالة تداخل نصي تخمينًا. الصيغة المتدحرجة (حدث يعيد ذيل السابق إعادةَ عرض لا كلامًا جديدًا) توقف التحويل.
import { ConvertError } from './json3.js';
import { SENTENCE_END, hasNoSpaceScript, joinWords, wrapLines } from './text.js';

export const ASR_DEFAULTS = Object.freeze({
  gapMs: 700, maxChars: 84, maxDurationMs: 6000, lineChars: 42, tailMs: 1500, minDurationMs: 300, rollingWords: 3,
});

// الصيغة المتدحرجة تعيد سطر عرض، فلا يُقارن من ذيل الحدث ورأس تاليه أكثر من هذا (حد لكلمات الحدث؛ تدقيق 7a66f91، U77).
export const ROLLING_MAX_WORDS = 64;
// أزواج متتالية متداخلة يتكرر فيها النمط بلا توقيت للكلمات يميّز التكرار الحقيقي، حتى يُحكم بالتدحرج من النمط وحده.
export const ROLLING_RUN = 2;


/**
 * كلمات الحدث بأزمنتها: زمن الكلمة زمن المقطع الجزئي (seg) الذي تبدأ فيه، محصورًا في نافذة حدثه [البداية، النهاية]،
 * فلا يصير زمن سالب ولا يجر زمن شاذ بقية المسار (تدقيق 7a66f91، I10). والعيّنات الحقيقية كلها داخل نوافذها.
 * @param {import('./json3.js').TextEvent} e
 * @returns {{ words: { t: number, text: string, eventEndMs: number | null }[], clamped: number }}
 */
export function eventWords(e) {
  const hi = e.endMs ?? Infinity;
  const bounds = [];
  let pos = 0;
  for (const s of e.segs) {
    const raw = e.startMs + s.offsetMs;
    const t = Math.min(Math.max(raw, e.startMs), hi);
    bounds.push({ pos, t, clamped: t !== raw });
    pos += s.text.length;
  }
  const words = [];
  let clamped = 0;
  let b = 0;
  for (const m of e.text.matchAll(/\S+/gu)) {
    while (b + 1 < bounds.length && bounds[b + 1].pos <= m.index) b++;
    if (bounds[b].clamped) clamped++;
    words.push({ t: bounds[b].t, text: m[0], eventEndMs: e.endMs });
  }
  return { words, clamped };
}

/**
 * أطول ذيل من a يطابق رأس b، بالكلمات بعد NFC، في نافذة ROLLING_MAX_WORDS من كل طرف. خطي (KMP)، لا يبني نصوصًا.
 * @param {{ text: string }[]} aw @param {{ text: string }[]} bw
 */
function tailHeadOverlap(aw, bw) {
  const a = aw.slice(Math.max(0, aw.length - ROLLING_MAX_WORDS)).map((w) => w.text.normalize('NFC'));
  const b = bw.slice(0, ROLLING_MAX_WORDS).map((w) => w.text.normalize('NFC'));
  if (!a.length || !b.length) return 0;
  const pi = new Array(b.length).fill(0);
  for (let i = 1, k = 0; i < b.length; i++) {
    while (k > 0 && b[i] !== b[k]) k = pi[k - 1];
    if (b[i] === b[k]) k++;
    pi[i] = k;
  }
  let k = 0;
  for (const w of a) {
    while (k > 0 && (k === b.length || w !== b[k])) k = pi[k - 1];
    if (k < b.length && w === b[k]) k++;
  }
  return k;
}

/**
 * يكشف الصيغة المتدحرجة (asbplayer #1318): حدثان متداخلان زمنيًا ورأس الثاني يكرر ذيل الأول، ثم لا يُحكم من النص
 * وحده (تدقيق 7a66f91، U28): التكرار الحقيقي (أغنية، هتاف، «no no no») كلماته المكررة أزمنتها بعد أزمنة الأولى. فيُحكم
 * بالتدحرج إن كانت أزمنة الكلمات المكررة مساوية لمقابلاتها أو سابقة لها («time»)، أو إن تكرر النمط في ROLLING_RUN زوجًا
 * متتاليًا والكلمات المكررة بلا توقيت يميّزها (زمن واحد للكتلة كلها، كترجمة البث المتدحرجة: «pattern»).
 * @param {import('./json3.js').TextEvent[]} events
 * @param {number} minWords
 * @param {{ t: number, text: string }[][]} [words] كلمات كل حدث بأزمنتها (eventWords)، تُحسب إن غابت
 * @returns {{ eventIndex: number, repeatedWords: number, basis: 'time' | 'pattern' } | null}
 */
export function detectRollingOverlap(events, minWords, words = events.map((e) => eventWords(e).words)) {
  let run = 0;
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1];
    const b = events[i];
    const aw = words[i - 1];
    const bw = words[i];
    const k = b.startMs < (a.endMs ?? a.startMs) ? tailHeadOverlap(aw, bw) : 0;
    if (k < minWords) {
      run = 0;
      continue;
    }
    let notLater = true;
    let untimed = true;
    for (let j = 0; j < k; j++) {
      if (bw[j].t > aw[aw.length - k + j].t) notLater = false;
      if (bw[j].t !== bw[0].t) untimed = false;
    }
    if (notLater) return { eventIndex: b.index, repeatedWords: k, basis: 'time' };
    run = untimed ? run + 1 : 0;
    if (run >= ROLLING_RUN) return { eventIndex: b.index, repeatedWords: k, basis: 'pattern' };
  }
  return null;
}

/**
 * @param {import('./json3.js').TextEvent[]} events مرتبة ومنزوعة التكرار الحرفي
 * @param {Partial<typeof ASR_DEFAULTS>} [options]
 * @returns {{ cues: { startMs: number, endMs: number, text: string }[], report: object }}
 */
export function convertAsr(events, options = {}) {
  const o = { ...ASR_DEFAULTS, ...options };
  let clampedToEvent = 0;
  const perEvent = events.map((e) => {
    const r = eventWords(e);
    clampedToEvent += r.clamped;
    return r.words;
  });
  const rolling = detectRollingOverlap(events, o.rollingWords, perEvent);
  if (rolling) {
    throw new ConvertError('EX_UNSUPPORTED_FORMAT', 'صيغة ASR متدحرجة: حدث يعيد ذيل السابق مع تداخل زمني', rolling);
  }
  // الكلمات بترتيب الأحداث ثم ترتيبها داخل الحدث؛ والزمن يُجعل غير متناقص دون تغيير الترتيب.
  const words = [];
  let clamped = 0;
  for (const ew of perEvent) {
    for (const w of ew) {
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
    // كلمات اللغات التي لا تفصل بالمسافات تُوصل بلا مسافة (AA1)؛ وغيرها بمسافة كما كان.
    const texts = g.words.map((w) => w.text);
    return { startMs: g.startMs, endMs: end, text: wrapLines(texts.some(hasNoSpaceScript) ? joinWords(texts) : texts.join(' '), o.lineChars) };
  });
  return { cues, report: { words: words.length, clampedWordTimes: clamped, clampedToEvent, options: o } };
}
