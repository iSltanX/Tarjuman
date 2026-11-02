// أدوات مشتركة للنص الدراسي وتقرير المراجعة (R58): رابط المشاهدة وزمنه، والزمن المقروء، وتهريب Markdown. التهريب بشرطة
// مائلة قبل علامات Markdown وHTML وحدها، فيُعرض نص الترجمة كما هو حرفيًا في أي عارض ولا يُفسَّر (وسم أو رابط أو تأكيد)،
// وإزالة الشرطات تعيده كما كان.
import { TjError } from '../errors/index.js';
import { isVideoId } from '../model/ids.js';
import { cleanTitle } from './instructions.js';

/** @param {string} videoId */
export function videoUrl(videoId) {
  if (!isVideoId(videoId)) throw new TjError('TJ_BAD_VIDEO_ID');
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** رابط زمن: الثانية الصحيحة التي يبدأ فيها المقطع. */
export const timeUrl = (videoId, ms) => `${videoUrl(videoId)}&t=${Math.floor(Math.max(0, ms) / 1000)}s`;

/** زمن مقروء HH:MM:SS بأرقام لاتينية. */
export function clock(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const pad = (x) => String(x).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const MD_SPECIAL = /[\\`*_[\]<>|~&#]/g;
/** نص حرفي في Markdown. */
export const mdEscape = (text) => String(text).replace(MD_SPECIAL, (ch) => `\\${ch}`);
/** عكس mdEscape (للاختبار وللمقارنة بالنص الأصلي). */
export const mdUnescape = (text) => String(text).replace(/\\([\\`*_[\]<>|~&#])/g, '$1');

/** نص المقطع في سطر واحد: فواصل الأسطر داخله مسافة، ولا يتغير غيرها. */
export const oneLine = (text) => String(text).split('\n').map((l) => l.trim()).filter(Boolean).join(' ');

/** عنوان الوثيقة: عنوان الفيديو سطرًا واحدًا بعد التجريد (كالتعليمات)، و«غير متوفر» إن غاب. */
export const docTitle = (title) => cleanTitle(title);

/** @param {unknown} format */
export function checkFormat(format) {
  if (format !== 'txt' && format !== 'md') throw new TjError('MD_INVALID', { detail: `صيغة غير معروفة: ${String(format)}` });
  return format;
}
