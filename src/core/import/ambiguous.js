// «المواضع الغامضة» (ف6، 2026-11-10): آخر بند في تعليمات الترجمة يطلب من النموذج أرقام المقاطع التي بقي معناها غامضًا في سطر
// بعد الملف. سطر كهذا قائمة أرقام مقاطع موجودة في الملف، فتُعاد أرقامه ولا يُعدّ شرحًا زائدًا. ولا يُعلَّم شيء إلا بضغطة
// المستخدم (قرار سلطان ق6)، بالعلامات الموجودة («أعود إليه»).
import { markAnchor, prepareCues, resolveMark } from '../model/marks.js';

/** @typedef {import('../model/cue.js').Cue} Cue */

// فاصل القائمة: فاصلة لاتينية أو عربية أو منقوطة، أو «و» العطف، أو مسافة.
const SEPARATORS = /\s*(?:[,،;؛]|\band\b|(?:^|\s)و)\s*|\s+/u;
const DIGITS = /^\d+$/;
const MAX_LIST = 200;
// وسم يسمّي الغموض (التعليمات: «إن بقيت مواضع غامضة فاذكر أرقام مقاطعها» / «If any passages remain ambiguous…»).
const LABEL = /غامض|غموض|ملتبس|التباس|غير واضح|ambigu|unclear|uncertain|unsure/iu;

/**
 * أرقام المقاطع في سطر «مواضع غامضة: 3، 6» (أو «Ambiguous segments: 3, 6»، أو «3 و6»)، أو null إن لم يكن قائمة أرقام لمقاطع
 * موجودة. الوسم قبل النقطتين يسمّي الغموض (فـ«عدد المقاطع: 8» و«Time 12:30» ليسا قائمة)، وما بعدهما أرقام وفواصل وحدها؛ وبلا
 * وسم رقمان فأكثر (فرقم وحيد ليس قائمة). و«ترجمتُ 427 مقطعًا» ليس قائمة.
 * @param {string} line سطر بعد الملف (بعد التنقية)
 * @param {ReadonlySet<number>} existing أرقام مقاطع الملف
 * @returns {number[] | null} الأرقام بلا تكرار وبترتيبها، أو null
 */
export function ambiguousNumbers(line, existing) {
  const text = String(line ?? '').trim().replace(/[.。]$/u, '');
  if (!text) return null;
  const colon = text.search(/[:：]/u);
  if (colon !== -1 && !LABEL.test(text.slice(0, colon))) return null;
  const list = (colon === -1 ? text : text.slice(colon + 1)).trim();
  if (!list) return null;
  const parts = list.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > MAX_LIST || !parts.every((p) => DIGITS.test(p))) return null;
  if (colon === -1 && parts.length < 2) return null;
  const nums = [...new Set(parts.map(Number))];
  return nums.every((n) => existing.has(n)) ? nums.sort((a, b) => a - b) : null;
}

/**
 * علامات «أعود إليه» للمقاطع المذكورة في الترجمة المعروضة، دون ما عليه علامة من قبل. للتعليم بضغطة وتراجع دقيق.
 * @param {Cue[]} cues الترجمة الحالية للخانة
 * @param {{ n: number, startMs: number, textHash: string, kind: string }[]} marks علامات الخانة الآن
 * @param {number[]} numbers أرقام المقاطع الغامضة
 * @param {string} now
 * @returns {import('../model/marks.js').Mark[]}
 */
export function ambiguousMarks(cues, marks, numbers, now) {
  const wanted = new Set(numbers);
  const prep = prepareCues(cues);
  const marked = new Set(marks.map((m) => resolveMark(m, cues, prep).index).filter((i) => i !== null && i >= 0));
  return cues
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => wanted.has(c.n) && !marked.has(i))
    .map(({ c }) => ({ ...markAnchor(c), kind: 'todo', at: now }));
}
