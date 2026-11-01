// مجال الاستخراج والتصدير (تملكه P3). رسائل P1 تبقى في src/extract/codes.js وتُجمع هنا، ولـP3 أن تنقلها.
import { EXTRACT_MESSAGES } from '../../extract/codes.js';

export const PREFIXES = Object.freeze(['EX_', 'KIND_']);

export const MESSAGES = Object.freeze({
  ...EXTRACT_MESSAGES,
  EX_NO_TRACK: 'لا مسار إنجليزي ملتقطًا لهذا الفيديو. فعّل الترجمة (CC) واختر English.',
});
