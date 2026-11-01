// رموز الاستخراج ورسائلها العربية (عقد الاستخراج). تقول ما حدث وما يمكن فعله.

export const EXTRACT_MESSAGES = Object.freeze({
  EX_WRONG_VIDEO: 'الترجمة الملتقطة تخص فيديو آخر، فتم تجاهلها.',
  EX_NO_VIDEO: 'لا يوجد فيديو معروض الآن، فتم تجاهل الترجمة الملتقطة.',
  EX_NOT_ENGLISH: 'المسار الملتقط ليس إنجليزيًا. اختر English من قائمة الترجمة.',
  EX_TRANSLATED_TRACK: 'المختار ترجمة آلية من يوتيوب، اختر English الأصلية.',
  EX_EMPTY_BODY: 'تعذّر استخراج الترجمة (استجابة فارغة). أوقف الترجمة ثم شغّلها مجددًا.',
  EX_UNSUPPORTED_FORMAT: 'صيغة الترجمة غير مدعومة في هذه النسخة.',
  EX_INVARIANT_FAILED: 'أوقفنا التصدير: النص الناتج لا يطابق المصدر.',
  EX_MAYBE_INCOMPLETE: 'قد يكون النص ناقصًا: آخر توقيت بعيد عن نهاية الفيديو.',
  EX_LIVE: 'هذا بث مباشر جارٍ، والملف الكامل غير متاح.',
  KIND_MISMATCH: 'نوع المسار في الطلب لا يطابق بنيته؛ راجع التشخيص.',
});

/** @param {string} code */
export function messageFor(code) {
  return EXTRACT_MESSAGES[code] ?? code;
}
