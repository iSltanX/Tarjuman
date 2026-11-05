// كتابة ملفات SRT المصدَّرة والتحقق منها. الكاتب المرجعي src/core/srt/writer.js (يرقّم من 1 دائمًا)؛
// والتقسيم الاحتياطي يحتاج ترقيمًا مستمرًا، فتُكتب الأجزاء اللاحقة هنا بالصيغة نفسها بالحرف، ويُتحقق أن
// ضمّ الأجزاء بسطر فارغ بينها يعطي الملف الكامل الذي كتبه الكاتب المرجعي (ويعيد المحلل الصارم قراءته).
import { TjError } from '../errors/index.js';
import { isBlankText } from '../model/cue.js';
import { breaksSrtText, parseSrtLenient, readableText } from '../srt/lenient.js';
import { parseSrtStrict } from '../srt/parser.js';
import { formatSrtTime } from '../srt/time.js';
import { writeSrt } from '../srt/writer.js';

const MAX_LIST = 8;
const list = (ns) => ns.slice(0, MAX_LIST).join('، ') + (ns.length > MAX_LIST ? '…' : '');

/**
 * يرفض ما لا يُكتب ملف SRT سليمًا منه، برمز عربي واضح لا باستثناء كاتب.
 * يفترض مقاطع صالحة البنية (validateCues)، ويفحص النص والتوقيت. وسطر نص يُقرأ رأسَ مقطع أو حدًّا له (breaksSrtText) يغيّر
 * عدد المقاطع عند قراءة الملف في ترجمان وffmpeg، فيُرفض برقم مقطعه (تدقيق 7a66f91، U78). وفي العربي (arabic) الفارغ بصريًا
 * فارغ (isBlankText، U80)، والسياج والعنوان حدّان كما يقرؤهما الاستيراد؛ والإنجليزي على السطر الفارغ، وعلى ما يغيّر العدد في
 * أي قارئ SRT وحده (سطر زمن، أو رقم يليه زمن)، فـ«# of people» نص فيه.
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 * @param {{ arabic?: boolean }} [opts]
 */
export function assertWritable(cues, { arabic = false } = {}) {
  const empty = [];
  const breaks = [];
  const timing = [];
  cues.forEach((c, i) => {
    const n = i + 1;
    const text = String(c.text);
    if (text.split('\n').some((l) => l.trim() === '') || (arabic && isBlankText(text))) empty.push(n);
    else if (breaksSrtText(text, { markdown: arabic })) breaks.push(n);
    if (!(c.startMs < c.endMs) || (i + 1 < cues.length && c.endMs > cues[i + 1].startMs)) timing.push(n);
  });
  if (empty.length) throw new TjError('EX_EMPTY_TEXT', { params: { list: list(empty) } });
  if (breaks.length) throw new TjError(arabic ? 'EX_TEXT_BREAKS_SRT' : 'EX_TRACK_BREAKS_SRT', { params: { list: list(breaks) } });
  if (timing.length) throw new TjError('EX_TIMING_INVALID', { params: { list: list(timing) } });
}

/**
 * نصوص العربي كما تُكتب: بلا محارف تحكم ولا تجاوز اتجاه، وبلا مسافات أطراف الأسطر (readableText)، فيقرأ الاستيراد ما في
 * الملف كما هو. والمقاطع التي جُرّدت منها محارف في stripped بأرقامها في الملف (تدقيق 7a66f91، U99).
 * @template {{ startMs: number, endMs: number, text: string }} C
 * @param {C[]} cues
 * @returns {{ cues: C[], stripped: number[] }}
 */
export function writableArabic(cues) {
  const stripped = [];
  const out = cues.map((c, i) => {
    const r = readableText(c.text);
    if (r.stripped) stripped.push(i + 1);
    return r.text === c.text ? c : { ...c, text: r.text };
  });
  return { cues: out, stripped };
}

/**
 * مقاطع بترقيم يبدأ من firstNumber. من 1 يكتبها الكاتب المرجعي نفسه.
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 * @param {number} [firstNumber]
 */
export function writeSrtFrom(cues, firstNumber = 1) {
  if (firstNumber === 1) return writeSrt(cues);
  return cues.map((c, i) => `${firstNumber + i}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');
}

/**
 * الثابت السادس على الملف الكامل: يُعاد تحليله بالمحلل الصارم فيعطي العدد والنص والأزمنة نفسها.
 * @param {string} text
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 */
export function verifyRoundTrip(text, cues) {
  let back;
  try {
    back = parseSrtStrict(text);
  } catch (cause) {
    throw new TjError('EX_INVARIANT_FAILED', { detail: `إعادة التحليل فشلت: ${cause.message}`, cause });
  }
  const bad = back.length !== cues.length
    ? 0
    : back.findIndex((b, i) => b.text !== cues[i].text || b.startMs !== cues[i].startMs || b.endMs !== cues[i].endMs) + 1;
  if (back.length !== cues.length || bad) {
    throw new TjError('EX_INVARIANT_FAILED', { detail: back.length !== cues.length ? `العدد ${back.length} والمتوقع ${cues.length}` : `المقطع ${bad}` });
  }
}

/**
 * إعادة القراءة بالمحلّل المتسامح (قارئ الاستيراد): العدد والأرقام والأزمنة نفسها، وإلا EX_INVARIANT_FAILED (U78). ويعيد
 * أرقام المقاطع (في الملف) التي يقرأ نصها على غير ما كُتب، كوسم تنسيق يُجرَّد (U99).
 * @param {string} text
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 * @param {number} [firstNumber]
 * @returns {number[]}
 */
export function verifyReread(text, cues, firstNumber = 1) {
  let back;
  try {
    back = parseSrtLenient(text).cues;
  } catch (cause) {
    throw new TjError('EX_INVARIANT_FAILED', { detail: `إعادة القراءة المتسامحة فشلت: ${cause.code ?? cause.message}`, cause });
  }
  const bad = back.length !== cues.length
    ? 0
    : back.findIndex((b, i) => b.n !== firstNumber + i || b.startMs !== cues[i].startMs || b.endMs !== cues[i].endMs) + 1;
  if (back.length !== cues.length || bad) {
    throw new TjError('EX_INVARIANT_FAILED', { detail: back.length !== cues.length ? `القراءة المتسامحة ${back.length} والمتوقع ${cues.length}` : `القراءة المتسامحة: المقطع ${bad}` });
  }
  const changed = [];
  back.forEach((b, i) => { if (b.text !== cues[i].text) changed.push(firstNumber + i); });
  return changed;
}
