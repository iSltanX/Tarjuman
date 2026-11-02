// دمج المقاطع وشطرها في المحرّر (R54). سياسة الترقيم تمنع الاستعادة الشاملة للتوقيت: لا إعادة ترقيم أبدًا؛ المدموج يحمل رقم
// الأول ويغيب رقم الثاني، والقطعتان تحملان رقم المقطع نفسه. فلا يعود الترقيم متسلسلًا 1..العدد بعد دمج أو شطر، ولو عاد العدد
// إلى أصله بدمج وشطر معًا (والمحاذاة تكشف الإزاحة أيضًا). الكاتب يرقّم من 1 عند التصدير. دوال نقية تعيد مصفوفة جديدة.
import { TjError } from '../errors/index.js';

/** @typedef {import('../model/cue.js').Cue} Cue */

const one = ({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text });
const lines = (text) => String(text).split('\n').map((l) => l.trim()).filter(Boolean);

/**
 * دمج المقطع index مع التالي: من بداية الأول إلى أبعد النهايتين، والنصان سطرًا بعد سطر، ورقم الأول.
 * @param {Cue[]} cues @param {number} index
 * @returns {Cue[]}
 * @throws {TjError} ED_MERGE_INVALID إن لم يكن بعده مقطع
 */
export function mergeCues(cues, index) {
  if (!Number.isInteger(index) || index < 0 || index >= cues.length - 1) throw new TjError('ED_MERGE_INVALID');
  const a = cues[index];
  const b = cues[index + 1];
  const merged = { n: a.n, startMs: a.startMs, endMs: Math.max(a.endMs, b.endMs), text: [...lines(a.text), ...lines(b.text)].join('\n') };
  return [...cues.slice(0, index).map(one), merged, ...cues.slice(index + 2).map(one)];
}

/**
 * شطر المقطع index عند الموضع at من نصه: ما قبله وما بعده (بلا مسافات أطراف)، والزمن مقسوم بنسبة المحارف غير الفارغة.
 * @param {Cue[]} cues @param {number} index @param {number} at موضع المؤشر في النص (0 < at < الطول)
 * @returns {Cue[]}
 * @throws {TjError} ED_SPLIT_INVALID إن بقيت قطعة بلا نص أو ضاقت المدة عن قطعتين
 */
export function splitCue(cues, index, at) {
  const c = cues[index];
  if (!c || !Number.isInteger(at) || at <= 0 || at >= c.text.length || c.endMs - c.startMs < 2) throw new TjError('ED_SPLIT_INVALID');
  const head = lines(c.text.slice(0, at)).join('\n');
  const tail = lines(c.text.slice(at)).join('\n');
  if (!head || !tail) throw new TjError('ED_SPLIT_INVALID');
  const weight = (s) => s.replace(/\s/gu, '').length;
  const ratio = weight(head) / (weight(head) + weight(tail));
  const cut = Math.min(c.endMs - 1, Math.max(c.startMs + 1, c.startMs + Math.round((c.endMs - c.startMs) * ratio)));
  return [
    ...cues.slice(0, index).map(one),
    { n: c.n, startMs: c.startMs, endMs: cut, text: head },
    { n: c.n, startMs: cut, endMs: c.endMs, text: tail },
    ...cues.slice(index + 1).map(one),
  ];
}
