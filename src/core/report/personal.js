// تنبيه غير مانع في وصف البلاغ (تدقيق 7a66f91، U84، قرار سلطان Q12): الوصف يُرسل كما كتبه المستخدم، فإن بدا فيه رابط يوتيوب
// أو معرّف فيديو أو بريد ذُكّر به ليحذفه إن لم يحتجه البلاغ؛ ويبقى الإرسال ممكنًا. منفصل عمدًا عن findSecrets (المانع، ومعه
// check-secrets وsanitizeText). ولا يَعِد بأن الوصف الحر يخلو من البيانات الشخصية: هو تذكير بأشكال شائعة لا أكثر.

import { t } from '../../i18n/index.js';

/** رابط من نطاقات يوتيوب، بمخطط أو بدونه. */
const YT_LINK = /(?<![\p{L}\p{N}_-])(?:[a-z0-9-]+\.)*(?:youtube(?:-nocookie)?\.com|youtu\.be)\b/iu;
/** بريد: محارف بلا مسافة ثم @ ثم نطاق بنقطة وامتداد حرفي. */
const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/u;
/**
 * معرّف بشكل معرّف يوتيوب: 11 محرفًا من [A-Za-z0-9_-] قائمًا بذاته، فيه حرف ورقم معًا. الكلمات الإنجليزية من 11 حرفًا
 * (translation) ورموز الأخطاء (SV_BAD_FILE) بلا أرقام فلا تُنبَّه؛ والمعرّف بلا رقم (نحو 15% من المعرّفات) يفوته التنبيه.
 */
const ID_TOKEN = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{11}(?![A-Za-z0-9_-])/g;
const looksLikeId = (t) => /\d/.test(t) && /[A-Za-z]/.test(t) && !/^[\d_-]+$/.test(t);

/**
 * @param {string} text
 * @returns {('youtube-link' | 'email' | 'video-id')[]} ما بدا في النص، بترتيب ثابت، بلا تكرار
 */
export function personalHints(text) {
  const s = String(text ?? '');
  const out = [];
  if (YT_LINK.test(s)) out.push('youtube-link');
  if (EMAIL.test(s)) out.push('email');
  ID_TOKEN.lastIndex = 0;
  if ([...s.matchAll(ID_TOKEN)].some((m) => looksLikeId(m[0]))) out.push('video-id');
  return out;
}

/** نص التنبيه، أو '' بلا شيء. بلغة الواجهة الحالية. @param {ReturnType<typeof personalHints>} hints */
export function personalHintText(hints) {
  if (!hints.length) return '';
  return t('settings.report.personal.text', { names: hints.map((h) => t(`settings.report.personal.names.${h}`)) });
}
