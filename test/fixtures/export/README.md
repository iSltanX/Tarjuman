# ملفات SRT المرجعية للتصدير

ملفات SRT الإنجليزية كما صدّرها ترجمان حيًا من يوتيوب في Brave وChrome غير المؤتمتين (2026-11-01)، بالوضع «عادي». وهي المرجع الذي يُقارن به ما تصدّره الشيفرة. إلا مرجع ميدواي التلقائي: أُعيد توليده من عيّنته بعد ع-٣ (قطع مجموعة ASR حين لا يتسع نصها في سطرين)، وناتج ما قبله مجمّد في ملفين `before-e03`.

| الملف | المقاطع | يستعمله |
| --- | --- | --- |
| `iG9CE55wbtY.en.manual.srt` | 427 | `test/unit/export/build-export.test.js`: تصدير عيّنة `test/fixtures/json3/manual-ted-iG9CE55wbtY.json` يطابقه حرفيًا. |
| `Y9rkKtK1b44.en.asr.srt` | 1,066 | `test/unit/export/build-export.test.js`: تصدير عيّنة `test/fixtures/json3/asr-nwc-Y9rkKtK1b44.json` يطابقه حرفيًا. مولَّد بعد ع-٣، وكان 1,056 مقطعًا كما صُدِّر حيًا. |
| `Y9rkKtK1b44.en.asr.before-e03.srt` | 1,056 | ناتج ما قبل ع-٣ مجمّدًا، وهو ملف P1 الحي نفسه بايتًا: الأصل الذي ترجمه النموذج إلى `test/e2e/fixtures/Y9rkKtK1b44.en.asr.normal.ar.srt`. تقارن به اختبارات تلك الترجمة. |
| `Y9rkKtK1b44.en.asr.long.before-e03.srt` | 729 | ناتج ما قبل ع-٣ بوضع «مقاطع أطول» مجمّدًا: الأصل الذي ترجمه النموذج إلى `test/e2e/fixtures/Y9rkKtK1b44.en.asr.long.ar.srt`. تقارن به اختبارات تلك الترجمة. |
| `gBazR59SZXk.en.manual.srt` | 1,884 | مرجع بند «طويل» في القائمة الثابتة لفيديوهات الاختبار ([دليل الصيانة](../../../docs/maintenance.md) §٣). |

لا رابط ولا رمز في أي ملف (`npm run check:secrets` يمر عليها).
