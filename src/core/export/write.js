// كتابة ملفات SRT المصدَّرة والتحقق منها. الكاتب المرجعي src/core/srt/writer.js (يرقّم من 1 دائمًا)؛
// والتقسيم الاحتياطي يحتاج ترقيمًا مستمرًا، فتُكتب الأجزاء اللاحقة هنا بالصيغة نفسها بالحرف، ويُتحقق أن
// ضمّ الأجزاء بسطر فارغ بينها يعطي الملف الكامل الذي كتبه الكاتب المرجعي (ويعيد المحلل الصارم قراءته).
import { TjError } from '../errors/index.js';
import { parseSrtStrict } from '../srt/parser.js';
import { formatSrtTime } from '../srt/time.js';
import { writeSrt } from '../srt/writer.js';

const MAX_LIST = 8;
const list = (ns) => ns.slice(0, MAX_LIST).join('، ') + (ns.length > MAX_LIST ? '…' : '');

/**
 * يرفض ما لا يُكتب ملف SRT سليمًا منه، برمز عربي واضح لا باستثناء كاتب.
 * يفترض مقاطع صالحة البنية (validateCues)، ويفحص النص والتوقيت.
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 */
export function assertWritable(cues) {
  const empty = [];
  const timing = [];
  cues.forEach((c, i) => {
    const n = i + 1;
    if (String(c.text).split('\n').some((l) => l.trim() === '')) empty.push(n);
    if (!(c.startMs < c.endMs) || (i + 1 < cues.length && c.endMs > cues[i + 1].startMs)) timing.push(n);
  });
  if (empty.length) throw new TjError('EX_EMPTY_TEXT', { params: { list: list(empty) } });
  if (timing.length) throw new TjError('EX_TIMING_INVALID', { params: { list: list(timing) } });
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
