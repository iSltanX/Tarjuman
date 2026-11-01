// المقطع: أزمنة بالملي ثانية ونص خام (لا HTML). التحقق هنا بنيوي فقط؛ ترتيب الأزمنة (نهاية قبل بداية،
// وتداخل) مشكلة توقيت يعرضها المحرّر ويمنع الحفظ منه والتصدير، لا خطأ نموذج.
import { LIMITS, OK, eachOf, exactKeys, fail, firstFailure, isIntIn, isText } from './validate.js';

/** @typedef {{ n: number, startMs: number, endMs: number, text: string }} Cue */
/** @typedef {{ n: number, startMs: number, endMs: number }} CueTime */

const CUE_KEYS = ['n', 'startMs', 'endMs', 'text'];
const TIME_KEYS = ['n', 'startMs', 'endMs'];

/** @param {unknown} c @param {string} [path] */
export function validateCue(c, path = 'cue') {
  return firstFailure([
    () => exactKeys(c, CUE_KEYS, path),
    () => (isIntIn(c.n, 1, LIMITS.maxCues * 10) ? OK : fail(`${path}.n`, 'رقم المقطع ليس عددًا صحيحًا موجبًا')),
    () => (isIntIn(c.startMs, 0, LIMITS.maxTimeMs) ? OK : fail(`${path}.startMs`, 'زمن البداية غير صالح')),
    () => (isIntIn(c.endMs, 0, LIMITS.maxTimeMs) ? OK : fail(`${path}.endMs`, 'زمن النهاية غير صالح')),
    () => (isText(c.text, LIMITS.maxTextChars) ? OK : fail(`${path}.text`, 'النص غير صالح أو أطول من الحد')),
  ]);
}

/**
 * @param {unknown} list @param {string} [path]
 * @param {{ min?: number }} [opts] min=1 للمسارات والترجمات (لا ملف بلا مقاطع)
 */
export function validateCues(list, path = 'cues', { min = 0 } = {}) {
  if (Array.isArray(list) && list.length < min) return fail(path, `أقل من ${min} مقطع`);
  return eachOf(list, path, LIMITS.maxCues, validateCue);
}

/** @param {unknown} t @param {string} [path] */
export function validateCueTime(t, path = 'cue') {
  return firstFailure([
    () => exactKeys(t, TIME_KEYS, path),
    () => (isIntIn(t.n, 1, LIMITS.maxCues * 10) ? OK : fail(`${path}.n`, 'رقم المقطع غير صالح')),
    () => (isIntIn(t.startMs, 0, LIMITS.maxTimeMs) ? OK : fail(`${path}.startMs`, 'زمن البداية غير صالح')),
    () => (isIntIn(t.endMs, 0, LIMITS.maxTimeMs) ? OK : fail(`${path}.endMs`, 'زمن النهاية غير صالح')),
  ]);
}

/**
 * نسخة مستقلة بالمفاتيح الأربعة فقط.
 * @param {Cue[]} cues
 * @returns {Cue[]}
 */
export const cloneCues = (cues) => cues.map(({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text }));

/**
 * @param {Cue[]} cues
 * @returns {CueTime[]}
 */
export const cueTimes = (cues) => cues.map(({ n, startMs, endMs }) => ({ n, startMs, endMs }));
