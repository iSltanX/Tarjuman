# دليل المطوّرين

البناء والتثبيت من الشيفرة والفحوص وهيكل المستودع والتغليف. والمدخل العام للمستودع [`README.md`](../README.md)، وقواعد المساهمة في [`CONTRIBUTING.md`](../.github/CONTRIBUTING.md).

## المتطلبات

- [Node.js](https://nodejs.org/) ‏22 فأحدث (يُفحص CI على 22 و24).
- `npm ci` يثبّت أدوات البناء والفحص وحدها (esbuild وweb-ext)، ولا اعتمادية تُشحن مع الإضافة.
- اختبار التوافق `U78` يحتاج `ffmpeg` في المسار، كما في CI.

## البناء

| الأمر | ما يفعله |
| --- | --- |
| `npm run build` | يبني نسخة Chromium (Chrome وEdge وBrave) في `dist`. |
| `npm run build:dev` | بناء التطوير: معرض المكوّنات وخطاف حزام الاختبارات الحية، و`version_name` ينتهي بـ`-dev`. لا يُنشر. |
| `npm run build:firefox` | يبني نسخة Firefox في `dist-firefox`، بالشيفرة نفسها وبيان Firefox. |
| `npm run package` | حزمة التثبيت الشخصي في `release/tarjuman-<الإصدار>`، وحزم المتاجر الثلاثة وحزمة المصدر وبصماتها في `release/store`، بعد تدقيقها. |

والتفصيل في [دليل الصيانة](maintenance.md) §٥: ما في كل حزمة، والتدقيق، وإعادة البناء من المصدر بالبايتات نفسها.

## التثبيت من الشيفرة

للتجربة، ولـFirefox حتى يُنشر في متجره. ابنِ الحزم أولًا:

```bash
npm ci
npm run package
```

- **في Chrome وEdge وBrave:** انسخ `release/tarjuman-2.0.0` إلى مجلد ثابت لا تنقله، ثم افتح صفحة الإضافات (`chrome://extensions` أو `edge://extensions` أو `brave://extensions`)، وفعّل «وضع المطوّر»، واضغط «تحميل غير معبأ» واختر المجلد. المتصفح يشتق معرّف الإضافة من مسار المجلد، والمحفوظات مربوطة به.
- **في Firefox:** افتح `about:debugging#/runtime/this-firefox`، واضغط «تحميل إضافة مؤقتة» واختر `release/store/tarjuman-2.0.0-firefox.zip`. تُزال الإضافة المؤقتة عند إغلاق Firefox، فخذ نسخة احتياطية قبل الإغلاق.

ونسخة المتجر إضافة أخرى بمعرّف آخر، فلا ترى محفوظات النسخة المحلية. والنسخة الاحتياطية تنقلها ([دليل الاستخدام](user-guide.md) §١ و§٩).

## الفحوص

ما يشغّله CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) في كل دفع وطلب دمج:

| الأمر | ما يفحصه |
| --- | --- |
| `npm run check` | الفحص الثابت (الأذونات، ولا شيفرة بعيدة ولا `eval` ولا HTML نصي ولا اتصال غير معلن)، والأسرار، والإشعارات، وتطابق `PRIVACY.md` مع مصدره، ومواد المتاجر، واختبارات الوحدة، والبناءان. |
| `npm run test:integration` | اختبارات التكامل بين الطبقات. |
| `node scripts/run-tests.mjs test/e2e/static test/e2e/regression` | e2e الثابت والانحدار على الحزمة المبنية، بلا متصفح. |
| `npm run lint:firefox` | `web-ext lint` على بناء Firefox. |

وللتطوير السريع `npm test` (الوحدة وحدها) و`npm run check:quick` (الفحص الثابت والوحدة).

**الاختبارات الحية** في `test/live` و`test/e2e/live` تفتح متصفحات حقيقية بلا نافذة بملف تعريف مؤقت، ولا تُشغَّل في CI ولا إلا بإذن صاحب المشروع. وطريقتها في [دليل التشغيل](delivery/runbook.md) («الاختبارات الحية»)، وأدلتها في `docs/evidence`.

## هيكل المستودع

| المجلد | ما فيه |
| --- | --- |
| `src/manifest.json` | بيان Chromium، ومنه يُشتق بيان Firefox في `scripts/targets.mjs`. |
| `src/background` | العامل الخلفي: حفظ الملفات بواجهة التنزيلات، والكاتب الواحد للتخزين. |
| `src/content` و`src/main-world` | سكربتا المحتوى: المتحكم وجسر الصفحة، والتقاط نسخة رد الترجمة الذي طلبه المشغّل. |
| `src/extract` | استقبال الرد الملتقط وحفظه واختيار مسار الترجمة. |
| `src/player` | أزرار الشريط وقوائمه، والطبقة فوق الفيديو، ولوحة النص المتزامن. |
| `src/pages` | صفحات الإضافة: نافذة الأيقونة، والمحفوظات، والمحرّر، والإعدادات. |
| `src/core` | المنطق النقي بلا DOM: النموذج والتخزين، والتحويل إلى SRT، والاستيراد والتصدير والمقارنة والمحاذاة، والتحرير، والنسخ الاحتياطي، والبلاغ، والأخطاء. |
| `src/ui` | النظام البصري المشترك: الرموز والخطوط والشعار والأيقونات والمكوّنات. |
| `src/dev` | حزام الاختبارات الحية، في بناء التطوير وحده. |
| `test` | الوحدة والتكامل وe2e والحية، والعيّنات والمساعدات. |
| `scripts` | البناء وطبقة Firefox والفحوص والتغليف وتدقيق الحزم، ومولّد `PRIVACY.md`. |
| `store` | مواد المتاجر: النصوص والأيقونات والبلاطات واللقطات وإجابات نماذج التقديم وملاحظات المراجعين. |
| `docs` | الوثائق، وفهرسها في [`docs/README.md`](README.md). |
| `tools/readme-assets` | مولّد صور README وصورة المعاينة الاجتماعية. |

ومجلدا `plan` و`dashboard` و`tools/plan` أدوات سير العمل الداخلي (الخطة ومراحلها ولوحتها)، ولا يحتاجها بناء الإضافة ولا تشغيلها. وتفصيلها في [دليل التشغيل](delivery/runbook.md)، وأوامرها `npm run plan:check` و`plan:sync` و`plan:render` و`dashboard`.

## البنية والقرارات

- [`product-spec.md`](product-spec.md): النطاق والقرارات والحدود.
- [`contracts`](contracts/README.md): العقود بين الطبقات: الاستخراج، والتوقيت، ونموذج البيانات، والتخزين، والرسائل، والواجهات، والأخطاء، والنسخ الاحتياطي.
- [`known-limitations.md`](known-limitations.md): القيود المعروفة وما لم يُختبر.
- [`identity-v4.md`](identity-v4.md): الهوية البصرية المعتمدة، و[`design/figma-design-brief.md`](design/figma-design-brief.md) مواصفة الواجهات.

## الملفات المولّدة

لا تُحرَّر بيد، بل يُعدَّل مصدرها ثم يُعاد التوليد:

| الملف | مصدره | الأمر |
| --- | --- | --- |
| `PRIVACY.md` | [`site/privacy.md`](site/privacy.md) | `node scripts/site/privacy.mjs` (و`--check` في `npm run check`) |
| `THIRD_PARTY_NOTICES.txt` | تراخيص الخطوط والأيقونات وأدوات البناء | `npm run notices` |
| صور `.github/assets` | قوالب [`tools/readme-assets`](../tools/readme-assets/README.md) | `node tools/readme-assets/render.mjs` |
| نصوص صفحات الموقع | [`site`](site/README.md) | `scripts/tarjuman/site-text.mjs` في مستودع الموقع |

## الإصدار والمتاجر

- [دليل الصيانة](maintenance.md): الفحص الدوري، وبناء الحزم وبصماتها، ورفع الإصدار.
- [`store/README.md`](../store/README.md): متطلبات المتاجر وموادها وقراراتها، و[`store/submission.md`](../store/submission.md) إجابات نماذج التقديم وروابط المتاجر المنشورة.
- [`CHANGELOG.md`](../CHANGELOG.md): ما تغيّر في كل إصدار.
