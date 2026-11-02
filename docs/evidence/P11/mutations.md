# تحوير الشيفرة: هل تكشف الاختبارات الأعطال؟ (P11)

> كل عطل يُدخَل وحده في موضع حساس، وتُشغَّل اختبارات وحدته، ثم يعود الملف كما كان (`git status` نظيف بعدها). الكشف = اختبار واحد ساقط على الأقل. نُفّذ في 2026-11-02 بعد إصلاحات المراجعة، بسكربت مؤقت خارج المستودع.

| العطل المتعمّد | الملف | الاختبار | النتيجة |
| --- | --- | --- | --- |
| إلغاء شرط تغطية العضو في الدمج (المقطع الساقط يصير «دمجًا») | `src/core/align/align.js` | `test/unit/align/align.test.js` | كُشف (2 ساقطان) |
| `canRestore` بالبناء وحده بلا محاذاة | `src/core/compare/restore.js` | `test/unit/compare/verified-restore.test.js` | كُشف (1) |
| `restoreTimingAvailable` بلا محاذاة في المقارن | `src/core/compare/compare.js` | `test/unit/compare/verified-restore.test.js` | كُشف (1) |
| حسم التعارض بصمت (لا يُسرد) في الدمج الثلاثي | `src/core/align/merge.js` | `test/unit/align/diff-merge.test.js` | كُشف (3) |
| توسيع المتغيرات داخل مصطلحات القاموس | `src/core/export/instructions.js` | `test/unit/export/v2-instructions.test.js` | كُشف (1) |
| ملف التصحيح بلا تحقق الأزمنة | `src/core/import/patch.js` | `test/unit/import/patch.test.js` | كُشف (1) |
| ملف التصحيح يستبدل الزوج الضعيف زمنيًا | `src/core/import/patch.js` | `test/unit/import/patch.test.js` | كُشف (1) |
| الاستبدال يتجاهل المواضع المختارة | `src/core/edit/search.js` | `test/unit/edit/engines/engines.test.js` | كُشف (1) |
| تصحيح الانجراف يقبل الزمن السالب | `src/core/edit/drift.js` | `test/unit/edit/engines/engines.test.js` | كُشف (1) |
| مقاييس الكثافة تعدّ التشكيل | `src/core/edit/density.js` | `test/unit/edit/engines/engines.test.js` | كُشف (1) |
| قرينة الاسم بعتبة عشوائية متساهلة (3 تبدّلات) | `src/core/import/review.js` | `test/unit/import/review.test.js` | كُشف (2) |
| ترك `<` بلا تهريب في Markdown | `src/core/export/doc.js` | `test/unit/export/study-report.test.js` | كُشف (1) |

**الخلاصة:** 12 من 12 كُشفت.
