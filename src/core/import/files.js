// أدوات مشتركة لقراءة ملفات المستخدم في الاستيراد وملف التصحيح: قائمة الملفات من منتقيها، واسم معروض آمن بلا محارف تحكم.
import { LIMITS } from '../model/validate.js';

const DEFAULT_NAME = 'translation.ar.srt';
const NAME_CONTROLS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
const HIGH_SURROGATE = /[\uD800-\uDBFF]/;

/** @param {unknown} input File أو مصفوفة ملفات أو FileList */
export function toList(input) {
  if (input === null || input === undefined) return [];
  if (typeof input === 'object' && typeof input.arrayBuffer !== 'function') return Array.from(input);
  return [input];
}

/** قصّ إلى حد من وحدات UTF-16 دون شطر زوج بديل. */
export const clip = (s, max) => (s.length <= max ? s : s.slice(0, HIGH_SURROGATE.test(s[max - 1]) ? max - 1 : max));

/** @param {{ name?: string } | null | undefined} file */
export function displayName(file) {
  const raw = typeof file?.name === 'string' ? file.name : '';
  return clip(raw.replace(NAME_CONTROLS, ''), LIMITS.maxFileNameChars).trim() || DEFAULT_NAME;
}
