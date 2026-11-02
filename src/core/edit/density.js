// مقاييس كثافة القراءة (R55): سرعة القراءة بالمحارف في الثانية وأطول سطر. تنبيه غير مانع ولا يختصر النص؛ والعتبة الافتراضية
// معايرة على ترجمتين عربيتين حقيقيتين (عيّنتا P1 بمقابليهما من P9) وجدولها ومبررها في docs/evidence/P11/reading-calibration.md،
// وتُضبط من الإعدادات. المحارف المعدودة: كل محرف مرئي ومسافات السطر، دون فواصل الأسطر وعلامات التشكيل ومحارف التنسيق الخفية
// (التشكيل لا يزيد زمن القراءة).

/** @typedef {import('../model/cue.js').Cue} Cue */

/**
 * العتبة الافتراضية (معايرة): فوق 20 محرفًا في الثانية قراءة سريعة (2.7% من مقاطع العيّنتين، فوق المئين 95)، وفوق 42 محرفًا
 * سطر طويل (المئين 92، وأغلبه في وضع «مقاطع أطول»). عتبة 17 تنبّه على عُشر الكلام العادي فتصير ضجيجًا.
 */
export const READING_DEFAULTS = Object.freeze({ maxCps: 20, maxLineChars: 42 });

const SILENT = /[\p{M}\p{Cf}]/gu;

/** طول سطر بالمحارف المرئية (نقاط الترميز) بعد قص الأطراف. */
const visibleLength = (line) => [...line.trim().replace(SILENT, '')].length;

/**
 * @param {Pick<Cue, 'startMs' | 'endMs' | 'text'>} cue
 * @returns {{ cps: number, longestLine: number }} cps مقرّب إلى منزلة عشرية؛ ومدة غير موجبة: Infinity لنص غير فارغ و0 للفارغ
 */
export function readingMetrics(cue) {
  const lines = String(cue.text).split('\n');
  const lengths = lines.map(visibleLength);
  const chars = lengths.reduce((s, x) => s + x, 0);
  const seconds = (cue.endMs - cue.startMs) / 1000;
  const cps = seconds > 0 ? Math.round((chars / seconds) * 10) / 10 : chars ? Infinity : 0;
  return { cps, longestLine: Math.max(0, ...lengths) };
}

/**
 * رموز تنبيهات الكثافة لمقطع بالعتبة المعطاة (للوحة المشكلات في P14).
 * @param {Pick<Cue, 'startMs' | 'endMs' | 'text'>} cue
 * @param {Partial<typeof READING_DEFAULTS>} [limits]
 * @returns {('ED_READING_FAST' | 'ED_LINE_LONG')[]}
 */
export function densityIssues(cue, limits = {}) {
  const { maxCps, maxLineChars } = { ...READING_DEFAULTS, ...limits };
  const m = readingMetrics(cue);
  const out = [];
  if (m.cps > maxCps) out.push('ED_READING_FAST');
  if (m.longestLine > maxLineChars) out.push('ED_LINE_LONG');
  return out;
}
