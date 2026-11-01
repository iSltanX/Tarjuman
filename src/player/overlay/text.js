// نص الطبقة (P5، figma-design-brief §٤): اتجاه كل سطر مستقل عن غيره. السطر الذي فيه أي حرف عربي RTL ولو بدأ
// بكلمة لاتينية («API هو الواجهة.»)، والسطر الخالي من العربية LTR. المقطع المتعدد الأسطر يُعرض سطرًا لكل سطر.

// العربية الأساسية والمكمّلة والممتدتان وأشكال العرض أ وب (لا العبرية ولا غيرها: القرار للعربية وحدها).
const ARABIC = /[؀-ۿݐ-ݿࡰ-࢟ࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** @param {string} line */
export const hasArabic = (line) => ARABIC.test(line);

/** @param {string} line @returns {'rtl' | 'ltr'} */
export const lineDirection = (line) => (hasArabic(line) ? 'rtl' : 'ltr');

/**
 * أسطر المقطع بلا فراغات طرفية ولا أسطر فارغة. النص خام (لا HTML) ويُعرض بـtextContent وحده.
 * @param {string | null | undefined} text
 * @returns {string[]}
 */
export function splitLines(text) {
  return String(text ?? '')
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}
