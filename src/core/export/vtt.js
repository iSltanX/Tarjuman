// كاتب WebVTT للتصدير (الفكرة ١١، ح-50): ترويسة «WEBVTT» ثم سطر فارغ، ولكل مقطع رقمه معرّفًا للإشارة وسطر زمن
// «HH:MM:SS.mmm --> HH:MM:SS.mmm» ثم نصه، وبين المقاطع سطر فارغ، ونهاية أسطر LF وUTF-8 بلا BOM. والنص مهرّب: & ثم < و>، فلا يُقرأ
// منه وسم ولا كيان (وسم التنسيق مثل <i> يظهر نصًا كما يعرضه ترجمان). و«-->» في النص يُرفض برقم مقطعه كما نصّت الخطة. ولا تُحقن
// محارف عزل الاتجاه: التنقية تزيلها عمدًا (src/core/text/sanitize.js). والتحقق بقراءة مستقلة تفكّ التهريب (verifyVtt) على
// مثال verifyRoundTrip في write.js. ومنتقيات الملفات لا تتغير، والاستيراد يقرأ ما يكتبه هنا بكياناته (src/core/srt/lenient.js،
// تحقق 2.3.0، ص-١٤).
import { TjError } from '../errors/index.js';
import { joinList } from '../../i18n/index.js';
import { isBlankText } from '../model/cue.js';

const MAX_LIST = 8;
const list = (ns) => joinList(ns.slice(0, MAX_LIST)) + (ns.length > MAX_LIST ? '…' : '');
const HEADER = 'WEBVTT';
const ARROW = '-->';
const TIME_LINE_RE = /^(\d{2,}):([0-5]\d):([0-5]\d)\.(\d{3}) --> (\d{2,}):([0-5]\d):([0-5]\d)\.(\d{3})$/;

/**
 * @param {number} ms زمن بالملي ثانية، عدد صحيح غير سالب.
 * @returns {string} HH:MM:SS.mmm بأرقام لاتينية، والساعات رقمان على الأقل.
 */
export function formatVttTime(ms) {
  if (!Number.isInteger(ms) || ms < 0) throw new RangeError(`زمن WebVTT غير صالح: ${ms}`);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))}.${p(ms % 1000, 3)}`;
}

/** @param {string} text نص مقطع ← نص WebVTT لا يُقرأ منه وسم ولا كيان (& أولًا). */
export const escapeVtt = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** عكس escapeVtt للكيانات الثلاثة وحدها (&amp; آخرًا، فلا يُفكّ «&amp;lt;» مرتين). @param {string} text */
export const unescapeVtt = (text) => String(text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * يرفض ما لا يُكتب منه ملف WebVTT سليم، برمز واضح لا باستثناء كاتب، كـassertWritable في SRT: السطر الفارغ والفارغ بصريًا
 * (EX_EMPTY_TEXT)، و«-->» في النص (EX_TEXT_BREAKS_VTT)، والتوقيت المعكوس أو المتداخل مع التالي (EX_TIMING_INVALID).
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 */
export function assertVttWritable(cues) {
  const empty = [];
  const arrows = [];
  const timing = [];
  cues.forEach((c, i) => {
    const n = i + 1;
    const text = String(c.text);
    if (text.split('\n').some((l) => l.trim() === '') || isBlankText(text)) empty.push(n);
    else if (text.includes(ARROW)) arrows.push(n);
    if (!(c.startMs < c.endMs) || (i + 1 < cues.length && c.endMs > cues[i + 1].startMs)) timing.push(n);
  });
  if (empty.length) throw new TjError('EX_EMPTY_TEXT', { params: { list: list(empty) } });
  if (arrows.length) throw new TjError('EX_TEXT_BREAKS_VTT', { params: { list: list(arrows) } });
  if (timing.length) throw new TjError('EX_TIMING_INVALID', { params: { list: list(timing) } });
}

/**
 * يكتب المقاطع كما هي دون تعديل للتوقيت أو النص (عدا التهريب)، ويرفض ما لا يُمثَّل في WebVTT: سطرًا فارغًا (ينهي الإشارة)،
 * و«-->» (يقطعها)، وفاصل سطر غير LF (CR يُقرأ سطرًا جديدًا؛ المستدعي يوحّد الأسطر بـlfLines).
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 * @returns {string}
 */
export function writeVtt(cues) {
  const blocks = cues.map((cue, i) => {
    const text = String(cue.text);
    if (/[\r\u2028\u2029]/.test(text)) throw new Error(`المقطع ${i + 1} فيه فاصل سطر غير LF (CR أو U+2028)`);
    if (text.split('\n').some((l) => l.trim() === '')) throw new Error(`المقطع ${i + 1} فيه سطر فارغ، وهو ينهي الإشارة في WebVTT`);
    if (text.includes(ARROW)) throw new Error(`المقطع ${i + 1} فيه «-->»، وهو يقطع الإشارة في WebVTT`);
    return `${i + 1}\n${formatVttTime(cue.startMs)} ${ARROW} ${formatVttTime(cue.endMs)}\n${escapeVtt(text)}\n`;
  });
  return blocks.length ? `${HEADER}\n\n${blocks.join('\n')}` : `${HEADER}\n`;
}

const toMs = (h, m, s, f) => Number(h) * 3600000 + Number(m) * 60000 + Number(s) * 1000 + Number(f);

/**
 * قراءة صارمة لما يكتبه writeVtt وحده (لا محلّل WebVTT عام): الترويسة، ثم كتل «رقم، زمن، نص» بفاصل سطر فارغ، والنص بفكّ التهريب.
 * @param {string} text @returns {{ n: number, startMs: number, endMs: number, text: string }[]}
 */
function readOwnVtt(text) {
  if (text === `${HEADER}\n`) return [];
  if (!text.startsWith(`${HEADER}\n\n`) || !text.endsWith('\n')) throw new Error('ترويسة أو نهاية غير متوقعة');
  return text.slice(HEADER.length + 2, -1).split('\n\n').map((block, i) => {
    const [num, time, ...lines] = block.split('\n');
    if (num !== String(i + 1)) throw new Error(`رقم المقطع ${i + 1}`);
    const m = TIME_LINE_RE.exec(time ?? '');
    if (!m || !lines.length) throw new Error(`زمن المقطع ${i + 1}`);
    const body = lines.join('\n');
    if (/[<>]|&(?!(?:amp|lt|gt);)/.test(body)) throw new Error(`تهريب المقطع ${i + 1}`);
    return { n: i + 1, startMs: toMs(m[1], m[2], m[3], m[4]), endMs: toMs(m[5], m[6], m[7], m[8]), text: unescapeVtt(body) };
  });
}

/**
 * الثابت السادس على ملف WebVTT الكامل: يُعاد قراءته بفكّ التهريب فيعطي العدد والنص والأزمنة نفسها، وإلا EX_INVARIANT_FAILED.
 * @param {string} text
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 */
export function verifyVtt(text, cues) {
  let back;
  try {
    back = readOwnVtt(text);
  } catch (cause) {
    throw new TjError('EX_INVARIANT_FAILED', { detail: `إعادة قراءة WebVTT فشلت: ${cause.message}`, cause });
  }
  const bad = back.length !== cues.length
    ? 0
    : back.findIndex((b, i) => b.text !== String(cues[i].text) || b.startMs !== cues[i].startMs || b.endMs !== cues[i].endMs) + 1;
  if (back.length !== cues.length || bad) {
    throw new TjError('EX_INVARIANT_FAILED', { detail: back.length !== cues.length ? `WebVTT: العدد ${back.length} والمتوقع ${cues.length}` : `WebVTT: المقطع ${bad}` });
  }
}
