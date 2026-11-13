// نصوص طبقة النواة التي يراها المستخدم: النسخة الاحتياطية وملفات التصدير (تقرير المراجعة والنص الدراسي) والاستيراد.
// رسائل الأخطاء في errors.js، والنص الذي كتبه المستخدم وعناوين الفيديو لا تمر من هنا.
export default Object.freeze({
  diagnostics: { excluded: '[مستبعد]', unknown: 'غير معروف', removed: '[محذوف]', removedType: '[{type}-محذوف]' },
  backup: {
    moreThan: 'أكثر من {size}',
    partial: '{name}، جزئيًا',
    // أسماء مجموعات الإعدادات المستبعدة في تحذير الاستعادة؛ المفتاح آخر مقطع من اسم المجموعة الداخلي.
    group: {
      settings: 'الإعدادات', prefs: 'القاموس والتفضيلات',
      offsetStepMs: 'خطوة الإزاحة', displayModeDefault: 'وضع العرض الافتراضي', appearance: 'مظهر الترجمة',
      export: 'التصدير', thresholds: 'عتبات المقارنة',
      glossary: 'القاموس', review: 'حد سرعة القراءة', saveLocation: 'مكان الحفظ', glossaries: 'قوائم مصطلحات الأزواج',
    },
  },
  export: {
    kind: { manual: 'يدوي', asr: 'تلقائي' },
    describe: { valid: '{label}، {count}', invalid: '{label}، غير صالح للتصدير' },
    watch: 'مشاهدة على يوتيوب',
    report: {
      title: 'تقرير مراجعة: {heading}',
      summary: 'البنود: {items} · أعود إليه: {todo} · راجعته: {done}',
      segment: 'المقطع {n}',
      problems: 'المشكلات',
      none: 'لا شيء',
      mark: 'العلامة',
      text: 'النص',
      original: 'الأصل',
      markLabel: { todo: 'أعود إليه', done: 'راجعته' },
      // أسماء قصيرة لرموز المشكلات المعروفة؛ وغيرها رسالته بلا قوالب.
      problem: {
        ED_END_BEFORE_START: 'النهاية قبل البداية',
        ED_NEGATIVE_TIME: 'زمن سالب',
        ED_TIME_FORMAT: 'صيغة زمن غير صالحة',
        ED_TIME_RANGE: 'زمن فوق الحد',
        ED_TEXT_INVALID: 'نص غير صالح',
        ED_OVERLAP: 'تداخل مع التالي',
        ED_SHORT: 'مدة قصيرة جدًا',
        ED_GAP: 'فجوة كبيرة بعده',
        ED_TEXT_EMPTY: 'بلا نص',
        ED_TEXT_BLANK_LINE: 'سطر فارغ في النص',
        ED_TEXT_BREAKS_SRT: 'سطر يُقرأ رأسَ مقطع',
        ED_READING_FAST: 'قراءة سريعة',
        ED_LINE_LONG: 'سطر طويل',
      },
    },
  },
  // فعل ملاحظة الدمج يطابق عدد الملفات: few ← «دُمجت» (3 إلى 10 بالمئة)، وإلا «دُمج».
  import: { mergedVerb: ({ few }) => (few ? 'دُمجت' : 'دُمج') },
});
