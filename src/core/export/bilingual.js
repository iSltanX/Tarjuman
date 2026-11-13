// ملف الترجمة المصدَّر (الفكرة ١١، ح-50): SRT أو WebVTT، بالترجمة وحدها أو مع الأصل في سطر واحد تحت كل مقطع. تستهلكه المحفوظات
// والمحرّر بحوار «تصدير…» واحد (الصيغة × المحتوى). المحاذاة بـoriginalLookup (src/core/align/original.js) في الزمن المحفوظ، فيحمل
// كل مقطع الأصل الذي تراه تحته في لوحة النص؛ ثم exportTiming على الملف كله (عقد التوقيت، القاعدة ٩: الإزاحة تنقل الترجمة والأصل
// معًا). فالترجمة التي دمجت مقطعين يُضمّ تحتها أصلاهما، والتي شطرت مقطعًا يتكرر الأصل تحت شطريها، والمقطع في فجوة بلا سطر أصل.
// والترجمة وحدها SRT بخطوات buildArabicExport نفسها فيخرج الملف نفسه بايتًا (اختبار). لا .ass ولا محارف عزل (التنقية تزيلها عمدًا)، ولا كتابة في التخزين هنا.
import { TjError, messageFor } from '../errors/index.js';
import { joinList } from '../../i18n/index.js';
import { flatText, originalLookup } from '../align/original.js';
import { lfLines, validateCues } from '../model/cue.js';
import { isVideoId } from '../model/ids.js';
import { exportTiming } from '../model/timing.js';
import { assertValid } from '../model/validate.js';
import { breaksSrtText, readableText } from '../srt/lenient.js';
import { SUBTITLE_FORMATS, fileName } from './names.js';
import { assertVttWritable, verifyVtt, writeVtt } from './vtt.js';
import { assertWritable, verifyReread, verifyRoundTrip, writableArabic, writeSrtFrom } from './write.js';

const MAX_LIST = 8;
const list = (ns) => joinList(ns.slice(0, MAX_LIST)) + (ns.length > MAX_LIST ? '…' : '');

/**
 * سطر الأصل المحاذي لكل مقطع في الزمن المحفوظ: نص ما يتداخل معه من الأصل في سطر واحد (flatText) منقّى كما يُكتب العربي
 * (readableText: بلا تحكم ولا تجاوز اتجاه)، وفواصل CR وU+2028 فيه مسافة كـLF (lfLines، ع-١٧)، و'' لمقطع في فجوة أو لأصل فرغ بالتنقية.
 * @param {{ startMs: number, endMs: number }[]} cues @param {{ startMs: number, endMs: number, text: string }[]} original
 * @returns {string[]}
 */
export function originalLines(cues, original) {
  const lookup = originalLookup(original);
  return cues.map((c) => flatText(readableText(lfLines(lookup(c.startMs, c.endMs))).text));
}

/**
 * اسم ملف الترجمة المصدَّر: VIDEOID.<لغتها>[.original][.dual-<لغة الأصل>].srt|vtt، وبلا لغة «translation».
 * @param {{ videoId: string, lang?: string | null, variant?: 'current' | 'original', format?: 'srt' | 'vtt', bilingual?: boolean, sourceLang?: string | null }} o
 */
export const subtitleFileName = ({ videoId, lang = null, variant = 'current', format = 'srt', bilingual = false, sourceLang = null }) => fileName({
  videoId, lang, translation: true, variant, format, dualOf: bilingual ? sourceLang : null,
});

/**
 * @param {{
 *   videoId: string, cues: import('../model/cue.js').Cue[], offsetMs?: number, timing?: 'shown' | 'saved',
 *   variant?: 'current' | 'original', lang?: string | null, format?: 'srt' | 'vtt', bilingual?: boolean,
 *   original?: import('../model/cue.js').Cue[] | null, sourceLang?: string | null,
 * }} spec cues بالتوقيت المحفوظ (لا بعد الإزاحة)؛ offsetMs إزاحة العرض وtiming اختيار المستخدم حين لا تكون صفرًا (exportTiming)؛
 *   original مقاطع مسار الأصل المحفوظ (EnglishTrack.cues) وsourceLang لغته، لـ«مع الأصل» وحده.
 * @returns {{ name: string, text: string, notes: string[], timing: 'saved' | 'shown', count: number }} notes ما جُرّد من نص الترجمة
 *   عند الكتابة، وفي SRT للترجمة وحدها ما يتغير عند إعادة رفعه (كـbuildArabicExport).
 * @throws {TjError} TJ_BAD_VIDEO_ID، ST_NO_RECORD، MD_INVALID، EX_STUDY_NO_ENGLISH (مع الأصل بلا أصل)، MD_NEGATIVE_TIME،
 *   EX_EMPTY_TEXT، EX_TEXT_BREAKS_SRT، EX_TRACK_BREAKS_SRT (سطر الأصل)، EX_TEXT_BREAKS_VTT، EX_TIMING_INVALID، EX_INVARIANT_FAILED.
 */
export function buildSubtitleExport({
  videoId, cues, offsetMs = 0, timing = 'shown', variant = 'current', lang = null, format = 'srt', bilingual = false, original = null, sourceLang = null,
}) {
  if (!isVideoId(videoId)) throw new TjError('TJ_BAD_VIDEO_ID');
  if (!Array.isArray(cues) || cues.length === 0) throw new TjError('ST_NO_RECORD');
  if (!SUBTITLE_FORMATS.includes(format)) throw new TjError('MD_INVALID', { detail: 'تصدير: format' });
  if (!Number.isInteger(offsetMs)) throw new TjError('MD_INVALID', { detail: 'تصدير: offsetMs' });
  assertValid(validateCues(cues, 'cues'), 'cues');
  if (bilingual && !(Array.isArray(original) && original.length)) throw new TjError('EX_STUDY_NO_ENGLISH');
  const name = subtitleFileName({ videoId, lang, variant, format, bilingual, sourceLang });
  // المحاذاة في الزمن المحفوظ قبل الإزاحة (القاعدة ٩): المقطع وأصله ينتقلان معًا.
  const lines = bilingual ? originalLines(cues, original) : null;
  const timed = exportTiming(cues, offsetMs, timing);
  if (!timed.ok) throw new TjError('MD_NEGATIVE_TIME', { params: { list: list(timed.negative) } });
  // نص الترجمة كما يُكتب ويُفحص بقواعد صيغته: SRT بقواعد الاستيراد (السياج والعنوان حدّان)، وWebVTT بالسطر الفارغ و«-->».
  const { cues: clean, stripped } = writableArabic(timed.cues);
  if (format === 'srt') assertWritable(clean, { arabic: true });
  else assertVttWritable(clean);
  const out = lines ? clean.map((c, i) => (lines[i] ? { ...c, text: `${c.text}\n${lines[i]}` } : c)) : clean;
  if (lines && format === 'vtt') assertVttWritable(out);
  if (lines && format === 'srt') {
    // سطر الأصل بقواعد قارئ SRT العام (markdown: false): «# …» والسياج نص في المشغّلات، وسطر الزمن أو رقم يليه زمن يقطع الكتلة.
    const bad = out.flatMap((c, i) => (lines[i] && breaksSrtText(c.text, { markdown: false }) ? [i + 1] : []));
    if (bad.length) throw new TjError('EX_TRACK_BREAKS_SRT', { params: { list: list(bad) } });
  }
  let text;
  let changed = [];
  if (format === 'vtt') {
    text = writeVtt(out);
    verifyVtt(text, out);
  } else {
    text = writeSrtFrom(out);
    verifyRoundTrip(text, out);
    // الترجمة وحدها يعاد قراءتها بقارئ الاستيراد (كـbuildArabicExport). والثنائي ليس للرفع إلى ترجمان (حارس IM_BILINGUAL)،
    // و«# …» في سطر أصله حدٌّ عند ذلك القارئ، فيكفيه الصارم كالتصدير الإنجليزي.
    if (!lines) changed = verifyReread(text, out);
  }
  const notes = [];
  if (stripped.length) notes.push(messageFor('EX_NOTE_CONTROL_STRIPPED', { list: list(stripped) }));
  if (changed.length) notes.push(messageFor('EX_NOTE_REREAD_CHANGES', { list: list(changed) }));
  return { name, text, notes, timing: timed.timing, count: out.length };
}
