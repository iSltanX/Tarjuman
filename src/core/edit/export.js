// ما يصدّره المحرّر (عقد التوقيت §٥): لوحة المشكلات أولًا (الأخطاء تمنع، والتداخل والنص الفارغ لا يُكتب منهما
// SRT سليم)، ثم exportTiming بالاختيار الصريح، ثم buildArabicExport. لا يغيّر شيئًا مخزَّنًا ولا يرمي.
import { buildArabicExport } from '../export/index.js';
import { isTjError, toErrorInfo } from '../errors/index.js';
import { isVideoId } from '../model/ids.js';
import { exportTiming } from '../model/timing.js';
import { findIssues } from './issues.js';

/**
 * @param {{
 *   videoId: string, cues: { n: number, startMs: number, endMs: number, text: string }[], offsetMs: number,
 *   choice?: 'shown' | 'saved', variant?: 'current' | 'original', drafts?: Map<string, string>, lang?: string | null
 * }} o lang لغة الترجمة لاسم الملف (AA1) choice يُسأل عنه المستخدم إن كانت الإزاحة غير صفرية؛ «shown» هو الافتراضي
 * @returns {{ ok: true, name: string, text: string, timing: 'saved' | 'shown', askUser: boolean, count: number, notes: string[] }
 *   | { ok: false, code: string, count?: number, list?: number[], negative?: number[], message?: string }}
 *   notes ما جُرّد عند الكتابة وما يتغير عند إعادة الاستيراد (buildArabicExport)، يُعرض قبل التنزيل.
 */
export function planArabicExport({ videoId, cues, offsetMs, choice = 'shown', variant = 'current', drafts, lang = null }) {
  if (!isVideoId(videoId)) return { ok: false, code: 'TJ_BAD_VIDEO_ID' };
  if (!Array.isArray(cues) || !cues.length) return { ok: false, code: 'ST_NO_RECORD' };
  // الإزاحة عدد صحيح دائمًا من الجلسة؛ وغيره رفض برمز لا RangeError من exportTiming (تدقيق 7a66f91، U98).
  if (!Number.isInteger(offsetMs)) return { ok: false, code: 'MD_INVALID' };
  const issues = findIssues(cues, { drafts });
  if (issues.errors) return { ok: false, code: 'ED_EXPORT_HAS_ERRORS', count: issues.errors };
  if (issues.exportBlockers.length) return { ok: false, code: 'ED_EXPORT_BLOCKED', list: [...new Set(issues.exportBlockers.map((i) => i.n))] };
  const timed = exportTiming(cues, offsetMs, choice);
  if (!timed.ok) return { ok: false, code: timed.code, negative: timed.negative };
  try {
    const file = buildArabicExport({ videoId, cues: timed.cues, variant, lang });
    return { ok: true, name: file.name, text: file.text, timing: timed.timing, askUser: timed.askUser, count: timed.cues.length, notes: file.notes };
  } catch (err) {
    if (!isTjError(err)) throw err;
    const info = toErrorInfo(err);
    return { ok: false, code: info.code, message: info.message };
  }
}
