// نصوص مشتركة بين كل الواجهات: اسم المنتج، والتنقّل، وصيغ العدّ، ووحدات الحجم، والأزواج اللغوية، ومنتقي اللغة، وأسماء خطوط الترجمة.
export default Object.freeze({
  productName: 'ترجمان',
  listSep: '، ',
  pair: '{from} ← {to}',
  pairNoFrom: '؟ ← {to}',
  languageUnknown: 'لغة غير محددة',
  cancel: 'إلغاء',
  // صيغ العدّ بصيغة formatCount: one وtwo كلمتان كاملتان، وfew وmany وsingle تتبع العدد.
  count: {
    cue: { one: 'مقطع واحد', two: 'مقطعان', few: 'مقاطع', many: 'مقطعًا', single: 'مقطع' },
    video: { one: 'فيديو واحد', two: 'فيديوهان', few: 'فيديوهات', many: 'فيديو', single: 'فيديو' },
    change: { one: 'تغيير واحد', two: 'تغييران', few: 'تغييرات', many: 'تغييرًا', single: 'تغيير' },
    language: { one: 'لغة واحدة', two: 'لغتان', few: 'لغات', many: 'لغة', single: 'لغة' },
    file: { one: 'ملف واحد', two: 'ملفان', few: 'ملفات', many: 'ملفًا', single: 'ملف' },
  },
  bytes: { zero: '0 ك.ب', kb: '{n} ك.ب', mb: '{n} م.ب', gb: '{n} غ.ب' },
  nav: {
    library: 'المحفوظات', settings: 'الإعدادات', editor: 'المحرّر',
    brand: 'ترجمان — المحفوظات', pages: 'صفحات ترجمان', yourData: 'ترجماتك وإعداداتك في متصفحك',
  },
  page: { title: 'ترجمان — {page}', renderFailed: 'تعذّر عرض الصفحة' },
  slot: {
    label: 'الترجمة {n}', labelActive: 'الترجمة {n}، نشطة', labelEmpty: 'الترجمة {n}، فارغة', picker: 'الترجمة النشطة',
  },
  langPicker: {
    from: 'من', to: 'إلى', empty: 'اختر لغة', search: 'ابحث عن لغة', auto: 'تلقائي من ترجمة الفيديو', autoShort: 'تلقائي',
    quick: 'للوصول السريع', video: 'في هذا الفيديو', recent: 'المستخدمة مؤخرًا', all: 'كل اللغات', results: 'النتائج', none: 'لا لغة بهذا الاسم أو الرمز',
    swap: 'مبادلة اللغتين', list: 'اللغات', row: 'لغتا الترجمة',
  },
  fonts: {
    almarai: { name: 'المراعي', note: 'واضح ومتوازن للقراءة السريعة' },
    'noto-sans-arabic': { name: 'نوتو سانس العربي', note: 'يدعم حروفًا وعلامات تشكيل أكثر' },
    tajawal: { name: 'تجوّل', note: 'أضيق، فيحتاج أسطرًا أقل' },
    markazi: { name: 'مركزي', note: 'نسخي كلاسيكي' },
  },
});
