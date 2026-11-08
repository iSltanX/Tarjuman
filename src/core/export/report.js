// تقرير المراجعة (R58): أرقام المقاطع وأزمنتها بروابطها، ومشكلاتها بأسماء قصيرة، وعلامة المراجعة، ومقتطفات النص باختيار المستخدم.
// البنود يبنيها المحرّر (P14) من لوحة المراجعة بالشكل المثبت في واجهات الربط؛ والتقرير يكتبها كما هي بترتيبها، ولا يغيّر حرفًا
// من النص المقتطف (فواصل الأسطر داخله مسافة).
import { TjError, hasCode, messageFor } from '../errors/index.js';
import { hasKey, joinList, t, texts } from '../../i18n/index.js';
import { checkFormat, clock, docTitle, mdEscape, oneLine, timeUrl, videoUrl } from './doc.js';

/**
 * @typedef {{
 *   n: number, startMs: number, endMs: number, problems: string[], mark: 'todo' | 'done' | null,
 *   text: string | null, english: string | null
 * }} ReviewItem
 */

/** أسماء قصيرة لرموز المشكلات المعروفة؛ وغيرها رسالته بلا قوالب، والمجهول رمزه. */
export const PROBLEM_LABELS = texts('core.export.report.problem');

const label = (code) => (hasKey(`core.export.report.problem.${code}`) ? PROBLEM_LABELS[code]
  : hasCode(code) ? messageFor(code).replace(/\s*\{\w+\}\s*/g, ' ').replace(/\s+/g, ' ').trim() : String(code));

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
  const summary = t('core.export.report.summary', { items: items.length, todo, done });
  const watch = t('core.export.watch');
  const head = t('core.export.report.title', { heading: md ? mdEscape(heading) : heading });
  const lines = md
    ? [`# ${head}`, '', `[${watch}](${url})`, '', summary, '']
    : [head, url, '', summary, ''];
  for (const it of items) {
    const span = `${clock(it.startMs)} → ${clock(it.endMs)}`;
    const link = timeUrl(videoId, it.startMs);
    lines.push(md ? `## ${t('core.export.report.segment', { n: it.n })} · [${span}](${link})` : `${t('core.export.report.segment', { n: it.n })} · ${span} · ${link}`);
    lines.push(`- ${t('core.export.report.problems')}: ${it.problems.length ? joinList(it.problems.map((p) => esc(label(p)))) : t('core.export.report.none')}`);
    if (it.mark) lines.push(`- ${t('core.export.report.mark')}: ${t(`core.export.report.markLabel.${it.mark}`)}`);
    if (includeText && it.text !== null) lines.push(`- ${t('core.export.report.text')}: ${esc(oneLine(it.text))}`);
    if (includeText && it.english !== null) lines.push(`- ${t('core.export.report.original')}: ${esc(oneLine(it.english))}`);
    lines.push('');
  }
  const tl = typeof lang === 'string' && /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8}){0,4}$/.test(lang) ? lang.replace(/_/g, '-') : 'translation';
  return { name: `${videoId}.${tl}.review.${format}`, text: lines.join('\n') };
}
