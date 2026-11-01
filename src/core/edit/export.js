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
 *   choice?: 'shown' | 'saved', variant?: 'current' | 'original', drafts?: Map<string, string>
 * }} o choice يُسأل عنه المستخدم إن كانت الإزاحة غير صفرية؛ «shown» هو الافتراضي
 * @returns {{ ok: true, name: string, text: string, timing: 'saved' | 'shown', askUser: boolean, count: number }
 *   | { ok: false, code: string, count?: number, list?: number[], negative?: number[], message?: string }}
 */
export function planArabicExport({ videoId, cues, offsetMs, choice = 'shown', variant = 'current', drafts }) {
  if (!isVideoId(videoId)) return { ok: false, code: 'TJ_BAD_VIDEO_ID' };
  if (!Array.isArray(cues) || !cues.length) return { ok: false, code: 'ST_NO_RECORD' };
  const issues = findIssues(cues, { drafts });
  if (issues.errors) return { ok: false, code: 'ED_EXPORT_HAS_ERRORS', count: issues.errors };
  if (issues.exportBlockers.length) return { ok: false, code: 'ED_EXPORT_BLOCKED', list: [...new Set(issues.exportBlockers.map((i) => i.n))] };
  const timed = exportTiming(cues, offsetMs, choice);
  if (!timed.ok) return { ok: false, code: timed.code, negative: timed.negative };
  try {
    const file = buildArabicExport({ videoId, cues: timed.cues, variant });
    return { ok: true, name: file.name, text: file.text, timing: timed.timing, askUser: timed.askUser, count: timed.cues.length };
  } catch (err) {
    if (!isTjError(err)) throw err;
    const info = toErrorInfo(err);
    return { ok: false, code: info.code, message: info.message };
  }
}
