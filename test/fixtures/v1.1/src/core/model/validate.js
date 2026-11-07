// أدوات التحقق المشتركة للنموذج. كل مدقق يعيد { ok: true } أو { ok: false, path, reason } ولا يرمي،
// وassertValid يحوّل الفشل إلى TjError('MD_INVALID'). المدققات صارمة: المفتاح غير المعروف فشل.
import { TjError } from '../errors/index.js';

export const LIMITS = Object.freeze({
  maxCues: 50000,
  maxTextChars: 5000,
  maxTimeMs: 100 * 3600 * 1000,
  maxTitleChars: 500,
  maxFileNameChars: 255,
  maxEnglishTracks: 8,
  maxFingerprints: 10,
  maxNotes: 50,
  maxNoteChars: 500,
  // الإصدار الثاني (عقد data-model §١٦)
  maxMarks: 5000,
});

/** @typedef {{ ok: true } | { ok: false, path: string, reason: string }} Result */

/** @type {Result} */
export const OK = Object.freeze({ ok: true });

/** @returns {Result} */
export const fail = (path, reason) => ({ ok: false, path, reason });

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/** @param {unknown} x */
export const isPlainObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

/** @param {unknown} s */
export const isIsoDate = (s) => typeof s === 'string' && ISO_RE.test(s) && !Number.isNaN(Date.parse(s));

/** @param {unknown} x @param {number} min @param {number} max */
export const isIntIn = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;

/** @param {unknown} s @param {number} max */
export const isText = (s, max) => typeof s === 'string' && s.length <= max && !s.includes('\u0000');

/**
 * طول النص بايتاتٍ في UTF-8 دون نسخه (الأزواج البديلة أربعة، والبديل اليتيم ثلاثة كما يكتبه TextEncoder). حد النسخة الاحتياطية
 * والحفظ بالبايت الفعلي لا بوحدات UTF-16 (تدقيق 7a66f91، U55، قرار Q28).
 * @param {string} s
 */
export function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

// سطر واحد مشذّب بلا محارف تحكم ولا تنسيق ولا فواصل أسطر (الأسماء المختصرة والمصطلحات).
const LINE_BAD_RE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
/** @param {unknown} s @param {number} max @param {number} [min] */
export const isLine = (s, max, min = 1) => typeof s === 'string' && s === s.trim() && s.length >= min && s.length <= max && !LINE_BAD_RE.test(s);

/**
 * يتحقق أن الكائن بمفاتيح معروفة فقط وكلها موجودة.
 * @param {unknown} obj @param {string[]} keys @param {string} path
 * @returns {Result}
 */
export function exactKeys(obj, keys, path) {
  if (!isPlainObject(obj)) return fail(path, 'ليس كائنًا');
  for (const k of Object.keys(obj)) if (!keys.includes(k)) return fail(`${path}.${k}`, 'مفتاح غير معروف');
  for (const k of keys) if (!(k in obj)) return fail(`${path}.${k}`, 'مفتاح مفقود');
  return OK;
}

/**
 * أول فشل من نتائج كسولة.
 * @param {(() => Result)[]} checks
 * @returns {Result}
 */
export function firstFailure(checks) {
  for (const c of checks) {
    const r = c();
    if (!r.ok) return r;
  }
  return OK;
}

/**
 * @param {unknown} list @param {string} path @param {number} max
 * @param {(x: unknown, p: string) => Result} each
 * @returns {Result}
 */
export function eachOf(list, path, max, each) {
  if (!Array.isArray(list)) return fail(path, 'ليس قائمة');
  if (list.length > max) return fail(path, `أكثر من ${max} عنصر`);
  for (let i = 0; i < list.length; i++) {
    const r = each(list[i], `${path}[${i}]`);
    if (!r.ok) return r;
  }
  return OK;
}

/** @param {unknown} list @param {string} path @param {number} max */
export const intList = (list, path, max) => eachOf(list, path, max, (x, p) => (isIntIn(x, 1, Number.MAX_SAFE_INTEGER) ? OK : fail(p, 'ليس رقم مقطع صحيحًا')));

/** @param {unknown} list @param {string} path */
export const noteList = (list, path) => eachOf(list, path, LIMITS.maxNotes, (x, p) => (isText(x, LIMITS.maxNoteChars) ? OK : fail(p, 'ملاحظة غير صالحة')));

/**
 * @param {Result} result @param {string} what اسم البنية في التفاصيل
 */
export function assertValid(result, what) {
  if (!result.ok) throw new TjError('MD_INVALID', { detail: `${what}: ${result.path} — ${result.reason}` });
}
