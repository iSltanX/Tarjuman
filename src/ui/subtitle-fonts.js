// خطوط الترجمة فوق الفيديو وحدها (مواصفة التصميم الأولى §٧.١، وR41): بيانات فقط بلا DOM. معرّفاتها هي
// SUBTITLE_FONTS في نموذج الإعدادات، والأول هو الافتراضي. الملفات من مستودع Google Fonts الرسمي برخصة SIL OFL 1.1
// (fonts/subtitle/)، وتحمّلها الطبقة (P6) عبر FontFace ببياناتها، وتعرضها صفحة الإعدادات (P7). خطوط الواجهة لا تتغير.

import { t } from '../i18n/index.js';

/** مسار ملفات الخطوط داخل الإضافة (المعلن في web_accessible_resources). */
export const SUBTITLE_FONT_DIR = 'ui/fonts/subtitle';

/** خطوط النظام العربية بعد الخط المضمّن، بالترتيب. */
export const SYSTEM_ARABIC_FALLBACK = Object.freeze(['SF Arabic', 'Geeza Pro', 'Noto Sans Arabic', 'Segoe UI', 'Tahoma', 'sans-serif']);

/**
 * @typedef {{
 *   id: 'almarai' | 'noto-sans-arabic' | 'tajawal' | 'markazi',
 *   nameAr: string, nameLatin: string, note: string, lineCapEm: number,
 *   family: string, files: { 400: string, 700: string }, license: string
 * }} SubtitleFont
 */

// حد عرض سطر الترجمة فوق الفيديو بوحدة em (ف2، 2026-11-10): نحو 42 حرفًا، وما زاد يلتفّ سطرين متوازنين (text-wrap: balance).
// الوحدة ch تقيس عرض الصفر فلا تطابق الحرف العربي، فعويِر كل خط بوزن 700 (وزن السطر العربي) على أسطر العيّنات الحقيقية
// test/e2e/fixtures (2,015 سطرًا من 20 حرفًا فأكثر): الحد أعرض سطر بين 40 و42 حرفًا مقرّبًا إلى الأعلى، فسطر من 42 حرفًا
// يبقى سطرًا واحدًا. والقياس: Almarai 21.50، وNoto Sans Arabic 21.69، وTajawal 21.69، وMarkazi Text 15.98.
const font = (id, nameLatin, lineCapEm) => Object.freeze({
  id, nameLatin, lineCapEm,
  /** اسم الخط بلغة الواجهة. */
  get nameAr() { return t(`common.fonts.${id}.name`); },
  get note() { return t(`common.fonts.${id}.note`); },
  // اسم عائلة فريد داخل الإضافة، فلا يتصادم مع خط مثبّت على الجهاز ولا مع خطوط يوتيوب.
  family: `Tarjuman Subtitle ${nameLatin}`,
  files: Object.freeze({ 400: `${SUBTITLE_FONT_DIR}/${id}-400.woff2`, 700: `${SUBTITLE_FONT_DIR}/${id}-700.woff2` }),
  license: `${SUBTITLE_FONT_DIR}/${id}-OFL.txt`,
});

/** @type {readonly SubtitleFont[]} */
export const SUBTITLE_FONT_LIST = Object.freeze([
  font('almarai', 'Almarai', 21.6),
  font('noto-sans-arabic', 'Noto Sans Arabic', 21.8),
  font('tajawal', 'Tajawal', 21.8),
  font('markazi', 'Markazi Text', 16.1),
]);

/**
 * حد سطر الأصل في الوضع المزدوج (بالمراعي المضمّن وزن 400، وem سطره هو): أعرض سطر إنجليزي بين 40 و42 حرفًا في عيّنة TED
 * اليدوية 19.03em، مقرّبًا إلى الأعلى.
 */
export const LATIN_LINE_CAP_EM = 19.1;

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
