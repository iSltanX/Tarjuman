// خطوط الترجمة فوق الفيديو وحدها (figma-design-brief.md §٧.١، وR41): بيانات فقط بلا DOM. معرّفاتها هي
// SUBTITLE_FONTS في نموذج الإعدادات، والأول هو الافتراضي. الملفات من مستودع Google Fonts الرسمي برخصة SIL OFL 1.1
// (fonts/subtitle/)، وتحمّلها الطبقة (P6) عبر FontFace ببياناتها، وتعرضها صفحة الإعدادات (P7). خطوط الواجهة لا تتغير.

/** مسار ملفات الخطوط داخل الإضافة (المعلن في web_accessible_resources). */
export const SUBTITLE_FONT_DIR = 'ui/fonts/subtitle';

/** خطوط النظام العربية بعد الخط المضمّن، بالترتيب. */
export const SYSTEM_ARABIC_FALLBACK = Object.freeze(['SF Arabic', 'Geeza Pro', 'Noto Sans Arabic', 'Segoe UI', 'Tahoma', 'sans-serif']);

/**
 * @typedef {{
 *   id: 'almarai' | 'noto-sans-arabic' | 'tajawal' | 'markazi',
 *   nameAr: string, nameLatin: string, note: string,
 *   family: string, files: { 400: string, 700: string }, license: string
 * }} SubtitleFont
 */

const font = (id, nameAr, nameLatin, note) => Object.freeze({
  id, nameAr, nameLatin, note,
  // اسم عائلة فريد داخل الإضافة، فلا يتصادم مع خط مثبّت على الجهاز ولا مع خطوط يوتيوب.
  family: `Tarjuman Subtitle ${nameLatin}`,
  files: Object.freeze({ 400: `${SUBTITLE_FONT_DIR}/${id}-400.woff2`, 700: `${SUBTITLE_FONT_DIR}/${id}-700.woff2` }),
  license: `${SUBTITLE_FONT_DIR}/${id}-OFL.txt`,
});

/** @type {readonly SubtitleFont[]} */
export const SUBTITLE_FONT_LIST = Object.freeze([
  font('almarai', 'المراعي', 'Almarai', 'الافتراضي'),
  font('noto-sans-arabic', 'نوتو سانس العربي', 'Noto Sans Arabic', 'أوسع تغطية للحروف والتشكيل'),
  font('tajawal', 'تجوّل', 'Tajawal', 'أضيق، فيقلّ الالتفاف'),
  font('markazi', 'مركزي', 'Markazi Text', 'نسخي كلاسيكي'),
]);

/** @param {string} id @returns {SubtitleFont} الخط بمعرّفه، والافتراضي لمعرّف غير معروف. */
export const subtitleFont = (id) => SUBTITLE_FONT_LIST.find((f) => f.id === id) ?? SUBTITLE_FONT_LIST[0];

/**
 * سلسلة font-family للخط المختار: هو، ثم المراعي المضمّن، ثم خطوط النظام العربية.
 * @param {string} id
 */
export function subtitleFontStack(id) {
  const names = [...new Set([subtitleFont(id).family, SUBTITLE_FONT_LIST[0].family])];
  return [...names.map((n) => `"${n}"`), ...SYSTEM_ARABIC_FALLBACK.map((n) => (n === 'sans-serif' ? n : `"${n}"`))].join(', ');
}
