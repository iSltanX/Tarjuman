// عيّنة النص المختلط (figma-design-brief §٧.٣): اثنتا عشرة حالة بالاتجاه المتوقع لكل سطر. تستعملها اختبارات
// الوحدة وصفحة اللقطات المحلية (test/live/overlay/rtl-sample) معًا، فلا تختلفان.

export const SAMPLES = [
  { id: 1, text: 'هذا هو السطر العربي المترجم.', dirs: ['rtl'] },
  { id: 2, text: 'API هو الواجهة التي نستخدمها.', dirs: ['rtl'] },
  { id: 3, text: 'تحدثنا عن Chrome وBrave.', dirs: ['rtl'] },
  { id: 4, text: 'في عام 2026 صدر الإصدار 1.22.0.', dirs: ['rtl'] },
  { id: 5, text: 'قال: (هذا مهم جدًا)!', dirs: ['rtl'] },
  { id: 6, text: 'السطر الأول من المقطع\nوالسطر الثاني بعده', dirs: ['rtl', 'rtl'] },
  { id: 7, text: 'Thank you.', dirs: ['ltr'] },
  { id: 8, text: 'النسبة 85% من مدة الفيديو.', dirs: ['rtl'] },
  { id: 9, text: 'الملف VIDEOID.en.asr.srt جاهز.', dirs: ['rtl'] },
  { id: 10, text: '— ماذا تقصد؟ — أقصد هذا.', dirs: ['rtl'] },
  { id: 11, text: 'مرحبًا بكم في المحاضرة\nWelcome to the lecture', dirs: ['rtl', 'ltr'] },
  { id: 12, text: 'هذا سطر عربي طويل جدًا يلتف على سطرين داخل مشغّل عرضه 640 بكسل عند الحجم الكبير مع كلمة API في وسطه وخاتمة.', dirs: ['rtl'] },
];
