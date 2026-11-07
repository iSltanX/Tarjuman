// خطوط واجهة ترجمان نفسها (مواصفة التصميم §٤): Cairo للعناوين وAlmarai للنص والأزرار، مضمّنة في الإضافة بأسماء عائلات
// فريدة. لا تعتمد على خط مثبّت على الجهاز: Brave يحجب الخطوط المثبّتة يدويًا عن صفحات المواقع (حماية البصمة)، فكانت
// أدوات المشغّل داخل يوتيوب تُرسم بـTahoma. وتغيير خط الترجمة (subtitle-fonts.js) لا يمس الواجهة: عائلتان مختلفتان وإن
// كان ملف المراعي واحدًا يخدمهما. صفحات الإضافة تحمّلها من ui/fonts.css، والمشغّل عبر FontFace (player/overlay/fonts.js).

/** مسار ملفات خط العناوين داخل الإضافة (المعلن في web_accessible_resources). */
export const UI_FONT_DIR = 'ui/fonts/ui';

/**
 * @typedef {{ id: 'cairo' | 'almarai', family: string, files: Record<string, string>, license: string }} UiFont
 */

/** @type {readonly UiFont[]} */
export const UI_FONT_LIST = Object.freeze([
  Object.freeze({
    id: 'cairo', family: 'Tarjuman UI Cairo',
    files: Object.freeze({ 700: `${UI_FONT_DIR}/cairo-700.woff2`, 800: `${UI_FONT_DIR}/cairo-800.woff2` }),
    license: `${UI_FONT_DIR}/cairo-OFL.txt`,
  }),
  Object.freeze({
    id: 'almarai', family: 'Tarjuman UI Almarai',
    files: Object.freeze({ 400: 'ui/fonts/subtitle/almarai-400.woff2', 700: 'ui/fonts/subtitle/almarai-700.woff2' }),
    license: 'ui/fonts/subtitle/almarai-OFL.txt',
  }),
]);

/** سلسلتا font-family للواجهة: المضمّن أولًا، ثم خطوط النظام العربية. */
export const UI_FONT_HEAD = '"Tarjuman UI Cairo", "Tarjuman UI Almarai", "SF Arabic", Tahoma, sans-serif';
export const UI_FONT_BODY = '"Tarjuman UI Almarai", "SF Arabic", "Noto Sans Arabic", Tahoma, sans-serif';
export const UI_FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
