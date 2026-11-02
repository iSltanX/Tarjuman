// لحظة المشاهدة في قوائم الشريط (P12): المقطع الظاهر الآن («علّم للمراجعة»)، ونافذة الجمل حول لحظة ثابتة والإزاحة التي
// تجعل جملة مختارة تظهر عندها («مزامنة بجملة»، R59). دوال نقية على مقاطع الترجمة النشطة بتوقيتها المحفوظ؛ لا تغيّر زمن
// الفيديو ولا الملف، والإزاحة الناتجة على شبكة 100ms وضمن حدودها (عقد التوقيت).
import { normalizeOffset } from '../../core/model/timing.js';
import { indexFor } from '../sync/cue-index.js';

/** جمل العرض الفرعي في المرة الواحدة (مواصفة التصميم §١٩.٤). */
export const SENTENCE_PAGE = 7;
/** مقطع انتهى للتو يبقى «الظاهر» قليلًا: فتح القائمة بعد اختفائه بلحظة لا يضيّعه. */
export const VISIBLE_GRACE_MS = 1500;

/**
 * رقم المقطع الظاهر عند زمن البحث (lookupMs)، أو آخر مقطع انتهى قبله بمهلة قصيرة، أو null.
 * @param {import('../../core/model/cue.js').Cue[]} cues
 * @param {number} ms زمن البحث بتوقيت الملف
 * @returns {number | null}
 */
export function visibleCueIndex(cues, ms, graceMs = VISIBLE_GRACE_MS) {
  if (!cues.length || !Number.isFinite(ms)) return null;
  const hit = indexFor(cues).find(ms);
  if (hit.cue) return cues.indexOf(hit.cue);
  let best = null;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (c.endMs <= ms && ms - c.endMs <= graceMs && (best === null || c.endMs > cues[best].endMs)) best = i;
  }
  return best;
}

/**
 * أقرب مقطع إلى زمن البحث: الظاهر، وإلا الأقرب بدايةً. محور نافذة الجمل.
 * @param {import('../../core/model/cue.js').Cue[]} cues @param {number} ms
 */
export function nearestCueIndex(cues, ms) {
  if (!cues.length) return null;
  const hit = indexFor(cues).find(ms);
  if (hit.cue) return cues.indexOf(hit.cue);
  let best = 0;
  for (let i = 1; i < cues.length; i++) if (Math.abs(cues[i].startMs - ms) < Math.abs(cues[best].startMs - ms)) best = i;
  return best;
}

/**
 * بداية نافذة الجمل حول المحور: ثلاث قبله وثلاث بعده ما أمكن، داخل حدود الملف.
 * @param {number} count عدد المقاطع @param {number} center
 */
export function windowAround(count, center, size = SENTENCE_PAGE) {
  return Math.max(0, Math.min(center - Math.floor(size / 2), count - size));
}

/**
 * نافذة الجمل من بدايتها: الأرقام والنصوص، وهل يوجد أبكر أو أحدث.
 * @param {import('../../core/model/cue.js').Cue[]} cues @param {number} start
 * @returns {{ start: number, items: { index: number, n: number, text: string }[], earlier: boolean, later: boolean }}
 */
export function sentenceWindow(cues, start, size = SENTENCE_PAGE) {
  const from = Math.max(0, Math.min(start, Math.max(0, cues.length - size)));
  const items = cues.slice(from, from + size).map((c, k) => ({ index: from + k, n: c.n, text: oneLine(c.text) }));
  return { start: from, items, earlier: from > 0, later: from + size < cues.length };
}

/** نص المقطع في سطر واحد (الأسطر تُضم بمسافة؛ والقص في العرض). @param {string} text */
export const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

/**
 * الإزاحة التي تجعل بداية المقطع المختار تظهر عند اللحظة المرجعية: الظاهر = المحفوظ + الإزاحة.
 * @param {number} atMs اللحظة المرجعية (زمن الفيديو عند فتح العرض الفرعي)
 * @param {{ startMs: number }} cue
 */
export const syncOffset = (atMs, cue) => normalizeOffset(Math.round(atMs) - cue.startMs);
