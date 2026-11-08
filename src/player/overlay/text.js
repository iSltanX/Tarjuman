// نص الطبقة (P5، مواصفة التصميم الأولى §٤): اتجاه كل سطر مستقل عن غيره. منذ 2.0.0 (AA1، حرية اللغات) الاتجاه من لغة السطر إن عُرفت،
// وإلا RTL للسطر الذي فيه أي حرف من نص يُكتب من اليمين (العربية والعبرية والفارسية والأردية وغيرها) ولو بدأ بكلمة لاتينية
// («API هو الواجهة.»)، والسطر الخالي منها LTR. المقطع المتعدد الأسطر يُعرض سطرًا لكل سطر.
import { hasRtlLetter, textDirection } from '../../core/lang/index.js';

/** هل في السطر حرف من نص يُكتب من اليمين (الاسم التاريخي، وكان للعربية وحدها). @param {string} line */
export const hasArabic = (line) => hasRtlLetter(line);

/** @param {string} line @param {string | null} [lang] لغة السطر إن عُرفت @returns {'rtl' | 'ltr'} */
export const lineDirection = (line, lang = null) => textDirection(line, lang);

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
