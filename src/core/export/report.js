// تقرير المراجعة (R58): أرقام المقاطع وأزمنتها بروابطها، ومشكلاتها بأسماء قصيرة، وعلامة المراجعة، ومقتطفات النص باختيار المستخدم.
// البنود يبنيها المحرّر (P14) من لوحة المراجعة بالشكل المثبت في واجهات الربط؛ والتقرير يكتبها كما هي بترتيبها، ولا يغيّر حرفًا
// من النص المقتطف (فواصل الأسطر داخله مسافة).
import { TjError, hasCode, messageFor } from '../errors/index.js';
import { checkFormat, clock, docTitle, mdEscape, oneLine, timeUrl, videoUrl } from './doc.js';

/**
 * @typedef {{
 *   n: number, startMs: number, endMs: number, problems: string[], mark: 'todo' | 'done' | null,
 *   text: string | null, english: string | null
 * }} ReviewItem
 */

/** أسماء قصيرة لرموز المشكلات المعروفة؛ وغيرها رسالته بلا قوالب، والمجهول رمزه. */
export const PROBLEM_LABELS = Object.freeze({
  ED_END_BEFORE_START: 'النهاية قبل البداية',
  ED_NEGATIVE_TIME: 'زمن سالب',
  ED_TIME_FORMAT: 'صيغة زمن غير صالحة',
  ED_TIME_RANGE: 'زمن فوق الحد',
  ED_TEXT_INVALID: 'نص غير صالح',
  ED_OVERLAP: 'تداخل مع التالي',
  ED_SHORT: 'مدة قصيرة جدًا',
  ED_GAP: 'فجوة كبيرة بعده',
  ED_TEXT_EMPTY: 'بلا نص',
  ED_TEXT_BLANK_LINE: 'سطر فارغ في النص',
  ED_TEXT_BREAKS_SRT: 'سطر يُقرأ رأسَ مقطع',
  ED_READING_FAST: 'قراءة سريعة',
  ED_LINE_LONG: 'سطر طويل',
});
const MARK_LABELS = Object.freeze({ todo: 'أعود إليه', done: 'راجعته' });

const label = (code) => PROBLEM_LABELS[code]
  ?? (hasCode(code) ? messageFor(code).replace(/\s*\{\w+\}\s*/g, ' ').replace(/\s+/g, ' ').trim() : String(code));

const isTime = (x) => Number.isInteger(x) && x >= 0;
const isTextOrNull = (x) => x === null || typeof x === 'string';
/** @param {unknown} it */
function validItem(it) {
  return it !== null && typeof it === 'object' && Number.isInteger(it.n) && it.n >= 1 && isTime(it.startMs) && isTime(it.endMs)
    && Array.isArray(it.problems) && it.problems.every((p) => typeof p === 'string')
    && (it.mark === null || it.mark === 'todo' || it.mark === 'done') && isTextOrNull(it.text) && isTextOrNull(it.english);
}

/**
 * الاسم بلغة الترجمة الفعلية منذ AA3: VIDEOID.<لغتها>.review.<format>، وغير المحددة «translation» (كانت ar ثابتة).
 * @param {{ videoId: string, title?: string | null, items: ReviewItem[], includeText: boolean, format: 'txt' | 'md', lang?: string | null }} spec
 * @returns {{ name: string, text: string }}
 * @throws {TjError} TJ_BAD_VIDEO_ID أو MD_INVALID
 */
export function buildReviewReport({ videoId, title = null, items, includeText = false, format, lang = null }) {
  const url = videoUrl(videoId);
  checkFormat(format);
  if (!Array.isArray(items) || !items.every(validItem)) throw new TjError('MD_INVALID', { detail: 'تقرير مراجعة: بنود غير صالحة' });
  const md = format === 'md';
  const esc = md ? mdEscape : (s) => s;
  const todo = items.filter((it) => it.mark === 'todo').length;
  const done = items.filter((it) => it.mark === 'done').length;
  const heading = docTitle(title);
  const summary = `البنود: ${items.length} · أعود إليه: ${todo} · راجعته: ${done}`;
  const lines = md
    ? [`# تقرير مراجعة: ${mdEscape(heading)}`, '', `[مشاهدة على يوتيوب](${url})`, '', summary, '']
    : [`تقرير مراجعة: ${heading}`, url, '', summary, ''];
  for (const it of items) {
    const span = `${clock(it.startMs)} → ${clock(it.endMs)}`;
    const link = timeUrl(videoId, it.startMs);
    lines.push(md ? `## المقطع ${it.n} · [${span}](${link})` : `المقطع ${it.n} · ${span} · ${link}`);
    lines.push(`- المشكلات: ${it.problems.length ? it.problems.map((p) => esc(label(p))).join('، ') : 'لا شيء'}`);
    if (it.mark) lines.push(`- العلامة: ${MARK_LABELS[it.mark]}`);
    if (includeText && it.text !== null) lines.push(`- النص: ${esc(oneLine(it.text))}`);
    if (includeText && it.english !== null) lines.push(`- الأصل: ${esc(oneLine(it.english))}`);
    lines.push('');
  }
  const tl = typeof lang === 'string' && /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8}){0,4}$/.test(lang) ? lang.replace(/_/g, '-') : 'translation';
  return { name: `${videoId}.${tl}.review.${format}`, text: lines.join('\n') };
}
