// الرفع إلى خانة وحماية الاستبدال في الشريط (P12، R48 وR49): الخانة الهدف الافتراضية، وعدد التعديلات اليدوية التي
// يمسها الاستبدال، و«إبقاء تعديلاتي» بالدمج الثلاثي (أصل الخانة، وتعديلاتها، والملف الجديد) حين تسمح المحاذاة وحدها.
// دوال نقية فوق محرّكات P11 (diffTranslations وmergeThreeWay)؛ لا تخزين ولا DOM. التفاصيل والجداول في المحفوظات.
import { diffTranslations, keepEditsMerge } from '../../core/align/index.js';

/**
 * @typedef {import('../../core/model/cue.js').Cue} Cue
 * @typedef {{ n: 1 | 2 | 3, filled: boolean, active: boolean, name: string | null }} SlotModel
 * @typedef {{ original: Cue[], current: Cue[] | null }} SlotTrack
 */

/**
 * الافتراضي أول خانة فارغة؛ وإن امتلأت كلها فالنشطة (الاستبدال المعتاد)، وإلا الأولى.
 * @param {SlotModel[]} slots
 * @returns {1 | 2 | 3}
 */
export function defaultTarget(slots) {
  return (slots.find((s) => !s.filled) ?? slots.find((s) => s.active) ?? slots[0] ?? { n: 1 }).n;
}

/**
 * عدد التعديلات اليدوية في الخانة: كل تغيير في المحاذاة بين الأصل المستورد والنسخة الحالية (نص أو توقيت أو دمج أو شطر أو
 * إضافة أو حذف) تعديل واحد. ونسخة لا تحاذي أصلها تُعدّ مقاطعها كلها.
 * @param {SlotTrack | null | undefined} track
 */
export function manualEdits(track) {
  if (!track || !track.current) return 0;
  const d = diffTranslations(track.original, track.current);
  return d.aligned ? d.changes.length : track.current.length;
}

const sameCue = (a, b) => a.startMs === b.startMs && a.endMs === b.endMs && a.text === b.text;
/** @param {Cue[]} a @param {Cue[]} b */
export const sameCues = (a, b) => a.length === b.length && a.every((c, i) => sameCue(c, b[i]));

/**
 * «إبقاء تعديلاتي» فوق الملف الجديد: الدمج الثلاثي، وما يتعارض يأخذه الجديد. المحاذاة الضعيفة تمنعه بسببها. المحرك نفسه في
 * المحفوظات (keepEditsMerge).
 * @param {SlotTrack} track @param {Cue[]} incoming
 * @returns {{ ok: true, current: Cue[] | null, conflicts: number } | { ok: false, reason: string }}
 *   current النسخة الحالية فوق الأصل الجديد، أو null إن لم يبقَ من التعديلات شيء (فلا تُعدّ الخانة معدّلة).
 */
export function keepEditsPlan(track, incoming) {
  return keepEditsMerge(track, incoming);
}
