// وضع «مقاطع أطول» (R09): يضم مقاطع الوضع العادي المتجاورة في مقطع واحد حتى سطرين ونحو 12 ثانية، فيقلّ
// عدد المقاطع ويرى النموذج سياقًا أوسع في كل مقطع. يعمل على مقاطع الوضع العادي وحدها، فلا يمس الكلمات
// ولا ترتيبها؛ والثوابت الستة (invariants.js) تُشغَّل على الناتج كما تُشغَّل على العادي.
import { endsSentence, wrapLines } from './text.js';

/**
 * الأرقام قابلة للضبط (تُمرَّر إلى convertTrack وextractor.convert).
 *  - maxLines/lineChars: حد الأسطر وطول السطر؛ المقطع الموحَّد لا يتجاوز maxLines بعد اللفّ.
 *  - maxDurationMs: أقصى امتداد بين بداية أول مقطع ونهاية آخره.
 *  - maxGapMs: وقفة أطول منها فاصل طبيعي لا يُضم عبره.
 *  - sentenceMinFill: عند تجاوز الحد وسط جملة يُقطع عند آخر نهاية جملة إن بلغ امتلاء المقطع هذه النسبة
 *    (من الزمن أو من الحروف)، وإلا يُقطع عند آخر ما يتسع.
 */
export const LONG_DEFAULTS = Object.freeze({
  maxLines: 2, lineChars: 42, maxDurationMs: 12000, maxGapMs: 1000, sentenceMinFill: 0.4,
});

const VALID = {
  maxLines: (v) => Number.isInteger(v) && v >= 1 && v <= 4,
  lineChars: (v) => Number.isInteger(v) && v >= 10 && v <= 120,
  maxDurationMs: (v) => Number.isInteger(v) && v >= 1000 && v <= 60000,
  maxGapMs: (v) => Number.isInteger(v) && v >= 0 && v <= 10000,
  sentenceMinFill: (v) => typeof v === 'number' && v >= 0 && v <= 1,
};

/**
 * خيارات كاملة: كل حقل غير صالح يعود افتراضيه (قراءة متسامحة كالإعدادات).
 * @param {Partial<typeof LONG_DEFAULTS>} [options]
 * @returns {typeof LONG_DEFAULTS}
 */
export function normalizeLongOptions(options = {}) {
  const out = { ...LONG_DEFAULTS };
  for (const [k, ok] of Object.entries(VALID)) if (options && k in options && ok(options[k])) out[k] = options[k];
  return out;
}

const flat = (text) => String(text).replace(/\s+/gu, ' ').trim();

/**
 * @param {{ startMs: number, endMs: number, text: string }[]} cues مقاطع الوضع العادي (مرتبة بلا تداخل)
 * @param {Partial<typeof LONG_DEFAULTS>} [options]
 * @returns {{ cues: { startMs: number, endMs: number, text: string }[], report: { before: number, after: number, options: typeof LONG_DEFAULTS } }}
 */
export function mergeLong(cues, options = {}) {
  const o = normalizeLongOptions(options);
  const capacity = o.maxLines * o.lineChars;
  const out = [];
  let i = 0;
  while (i < cues.length) {
    const parts = [flat(cues[i].text)];
    let take = i; // آخر مقطع يتسع في المجموعة
    let lastSentence = endsSentence(cues[i].text) ? i : -1;
    let overflow = false;
    for (let k = i + 1; k < cues.length; k++) {
      if (cues[k].startMs - cues[k - 1].endMs > o.maxGapMs) break; // وقفة طبيعية، لا تجاوز
      const joined = [...parts, flat(cues[k].text)].join(' ');
      const fits = cues[k].endMs - cues[i].startMs <= o.maxDurationMs && wrapLines(joined, o.lineChars).split('\n').length <= o.maxLines;
      if (!fits) {
        overflow = true;
        break;
      }
      parts.push(flat(cues[k].text));
      take = k;
      if (endsSentence(cues[k].text)) lastSentence = k;
    }
    let end = take;
    if (overflow && lastSentence >= i && lastSentence < take) {
      const joined = parts.slice(0, lastSentence - i + 1).join(' ');
      const fill = Math.max((cues[lastSentence].endMs - cues[i].startMs) / o.maxDurationMs, joined.length / capacity);
      if (fill >= o.sentenceMinFill) end = lastSentence;
    }
    if (end === i) {
      // مقطع وحده: يبقى كما هو دون إعادة لفّ، فيحفظ أسطر المصدر.
      out.push({ startMs: cues[i].startMs, endMs: cues[i].endMs, text: cues[i].text });
    } else {
      out.push({ startMs: cues[i].startMs, endMs: cues[end].endMs, text: wrapLines(parts.slice(0, end - i + 1).join(' '), o.lineChars) });
    }
    i = end + 1;
  }
  return { cues: out, report: { before: cues.length, after: out.length, options: o } };
}
