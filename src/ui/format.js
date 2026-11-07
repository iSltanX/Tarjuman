// صيغ العرض المشتركة بين المشغّل والصفحات (figma-design-brief.md §٤): أرقام لاتينية، والإزاحة بعلامتها،
// والأزمنة بصيغة SRT، والعدّ بالعربية.
import { textDirection as langTextDirection } from '../core/lang/index.js';

const MINUS = '−';

/**
 * الإزاحة بالثواني بخانة عشرية وعلامة صريحة: +0.5 و−1.0 و0.0 (الصفر بلا علامة).
 * @param {number} ms
 */
export function formatOffset(ms) {
  const v = Math.round(ms / 100) / 10;
  if (v === 0) return '0.0';
  return `${v > 0 ? '+' : MINUS}${Math.abs(v).toFixed(1)}`;
}

const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

/**
 * الإزاحة الموقّعة داخل جملة عربية: معزولة LTR (LRI…PDI) فتبقى علامتها يسار أرقامها كما في الشارة، لا «0.5+» ولا «1.0−»
 * (قواعد UBA: العلامة بعد حرف عربي تأخذ اتجاه السياق؛ تدقيق 5fedcb9، CL-001). نص لا عنصر، فيصلح للتلميح واسم الوصول والخيارات.
 * والحقول والشارة تبقى بـformatOffset (اتجاهها LTR من نفسها).
 * @param {number} ms
 */
export const offsetInline = (ms) => `${LRI}${formatOffset(ms)}${PDI}`;

/**
 * اتجاه نص معروض في الواجهة: من لغته إن عُرفت، وإلا RTL إن احتوى أي حرف من نص يُكتب من اليمين ولو بدأ بكلمة لاتينية
 * («API هو الواجهة»)، وإلا LTR (مواصفة التصميم §٤ لسطر الترجمة؛ كان dir="auto" يأخذ أول حرف قوي فيقلب ترتيبها؛ تدقيق
 * 5fedcb9، CL-002). ومنذ 2.0.0 (AA1) العبرية والفارسية والأردية وغيرها مثل العربية، لا العربية وحدها.
 * @param {string} s @param {string | null} [lang] @returns {'rtl' | 'ltr'}
 */
export const textDirection = (s, lang = null) => langTextDirection(s, lang);

/** نص LTR معزول داخل جملة عربية (فرق موقّع، أو مثال «+1.2»). @param {string} s */
export const ltrInline = (s) => `${LRI}${s}${PDI}`;

const FSI = String.fromCodePoint(0x2068);
/**
 * نص حر اتجاهه من أول حرف قوي فيه، معزول داخل جملة عربية (عنوان فيديو): «10 Tips…» لا تنقلب كلماته و«?» لا تنتقل إلى أوله
 * (FSI…PDI؛ تدقيق 7a66f91، U49). @param {string} s
 */
export const isolate = (s) => `${FSI}${s}${PDI}`;

/**
 * زمن بصيغة HH:MM:SS,mmm (للعرض؛ الكاتب في src/core/srt يكتب الصيغة نفسها في الملف).
 * @param {number} ms
 */
export function formatTimecode(ms) {
  const sign = ms < 0 ? MINUS : '';
  const a = Math.abs(Math.round(ms));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${sign}${p(Math.floor(a / 3600000))}:${p(Math.floor((a % 3600000) / 60000))}:${p(Math.floor((a % 60000) / 1000))},${p(a % 1000, 3)}`;
}

/**
 * العدّ بالعربية: «مقطع واحد»، «مقطعان»، «3 مقاطع»، «11 مقطعًا»، «100 مقطع».
 * @param {number} n
 * @param {{ one: string, two: string, few: string, many: string, single: string }} forms مثل COUNT_FORMS.cue
 */
export function formatCount(n, forms) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const mod = n % 100;
  if (mod >= 3 && mod <= 10) return `${n} ${forms.few}`;
  if (mod >= 11) return `${n} ${forms.many}`;
  return `${n} ${forms.single}`;
}

export const COUNT_FORMS = Object.freeze({
  cue: Object.freeze({ one: 'مقطع واحد', two: 'مقطعان', few: 'مقاطع', many: 'مقطعًا', single: 'مقطع' }),
  video: Object.freeze({ one: 'فيديو واحد', two: 'فيديوهان', few: 'فيديوهات', many: 'فيديو', single: 'فيديو' }),
  change: Object.freeze({ one: 'تغيير واحد', two: 'تغييران', few: 'تغييرات', many: 'تغييرًا', single: 'تغيير' }),
});

/**
 * حجم بالبايت بوحدة عربية مختصرة: «820 ك.ب» و«2.1 م.ب» و«3.0 غ.ب». الصفر «0 ك.ب» لا «1 ك.ب»، وما دون الكيلوبايت «1 ك.ب»،
 * وما فوق 1024 م.ب بالغيغابايت (كانت «3072.0 م.ب»؛ تدقيق 7a66f91، U59).
 * @param {number} bytes
 */
export function formatBytes(bytes) {
  if (!(bytes > 0)) return '0 ك.ب';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  return `${(bytes / 1024 ** 3).toFixed(1)} غ.ب`;
}
