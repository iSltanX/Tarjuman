// صيغ العرض المشتركة بين المشغّل والصفحات (figma-design-brief.md §٤): أرقام لاتينية، والإزاحة بعلامتها،
// والأزمنة بصيغة SRT، والعدّ بالعربية.

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
 * العدّ بالعربية: «مقطع واحد»، «مقطعان»، «3 مقاطع»، «11 مقطعًا».
 * @param {number} n
 * @param {{ one: string, two: string, few: string, many: string }} forms مثل COUNT_FORMS.cue
 */
export function formatCount(n, forms) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const mod = n % 100;
  if (mod >= 3 && mod <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

export const COUNT_FORMS = Object.freeze({
  cue: Object.freeze({ one: 'مقطع واحد', two: 'مقطعان', few: 'مقاطع', many: 'مقطعًا' }),
  video: Object.freeze({ one: 'فيديو واحد', two: 'فيديوهان', few: 'فيديوهات', many: 'فيديو' }),
  change: Object.freeze({ one: 'تغيير واحد', two: 'تغييران', few: 'تغييرات', many: 'تغييرًا' }),
});

/**
 * حجم بالبايت بوحدة عربية مختصرة: «820 ك.ب» و«2.1 م.ب».
 * @param {number} bytes
 */
export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}
