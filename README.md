<div dir="rtl">

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/banner-dark.png">
    <img src=".github/assets/banner-light.png" alt="ترجمان: ترجمتك العربية فوق الفيديو" width="100%">
  </picture>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj"><img alt="ترجمان في Chrome Web Store" src="https://img.shields.io/badge/Chrome%20Web%20Store-available-6B2D5E?logo=googlechrome&logoColor=white"></a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi"><img alt="ترجمان في Microsoft Edge Add-ons" src="https://img.shields.io/badge/Edge%20Add--ons-available-6B2D5E?logo=microsoftedge&logoColor=white"></a>
  <a href="https://github.com/iSltanX/Tarjuman/actions/workflows/ci.yml"><img alt="الفحوص" src="https://github.com/iSltanX/Tarjuman/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="الإصدار 1.1.0" src="https://img.shields.io/badge/version-1.1.0-6B2D5E">
  <img alt="Manifest V3" src="https://img.shields.io/badge/manifest-v3-6B2D5E">
  <img alt="Chrome وEdge وBrave على Chromium 130 فأحدث" src="https://img.shields.io/badge/Chromium-130%2B-5B575A">
  <img alt="Firefox 144 فأحدث للحاسوب" src="https://img.shields.io/badge/Firefox-144%2B-5B575A">
  <img alt="المعالجة والحفظ على جهازك" src="https://img.shields.io/badge/data-on--device-2E6A4C">
  <img alt="جميع الحقوق محفوظة" src="https://img.shields.io/badge/license-all%20rights%20reserved-5B575A">
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj"><b>التثبيت من Chrome Web Store</b></a> ·
  <a href="https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi"><b>التثبيت من Microsoft Edge Add-ons</b></a> ·
  <a href="https://bysltan.com/tarjuman">الموقع</a> ·
  <a href="https://bysltan.com/tarjuman/support">المساعدة</a> ·
  <a href="https://bysltan.com/tarjuman/privacy">سياسة الخصوصية</a> ·
  <a href="docs/user-guide.md">دليل الاستخدام</a> ·
  <a href="CHANGELOG.md">سجل التغييرات</a>
</p>

**ترجمان** إضافة للحاسوب تجعلك تشاهد فيديو يوتيوب بترجمة عربية تصنعها أنت. تحفظ الترجمة الإنجليزية للفيديو، اليدوية أو التلقائية، في ملف SRT، فترسله بنفسك إلى نموذج الذكاء الاصطناعي الذي تختاره ليترجمه. ثم ترفع الملف العربي فيعرضه ترجمان فوق الفيديو نفسه، وتضبط توقيته وتحرّره، وتجده محفوظًا متى عدت.

لا نموذج مدمج، ولا مفتاح API، ولا حساب، ولا خادم ترجمة، ولا تنزيل للفيديو أو الصوت.

> **الحالة:** الإصدار `1.1.0` منشور في [Chrome Web Store](https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj)، ومنه يُثبَّت في Chrome وBrave، وفي [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi) لـEdge. ولم يُنشر في Firefox Add-ons بعد، فيُثبَّت فيه من الشيفرة كما في [التثبيت](#التثبيت).

## كيف يعمل

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/how-it-works-dark.png">
    <img src=".github/assets/how-it-works-light.png" alt="ثلاث خطوات: نزّل الأصل في ترجمان، ثم ترجمه بنموذجك خارج ترجمان، ثم شاهد واضبط في ترجمان" width="100%">
  </picture>
</p>

1. افتح فيديو على يوتيوب وشغّل الترجمة الإنجليزية (CC)، ثم افتح «تحميل الأصل (SRT)» من أزرار ترجمان في شريط المشغّل. «تنزيل الملف» يحفظ ملف الترجمة، و«نسخ التعليمات» ينسخ تعليمات ترجمة جاهزة.
2. أرسل الملف والتعليمات إلى النموذج الذي تختاره، واحفظ ناتجه ملف SRT. ترجمان لا يترجم، ولا يتصل بأي نموذج.
3. ارفع الملف العربي بزر «رفع الترجمة العربية (SRT)»، فتظهر ترجمتك فوق الفيديو.

## المميزات

- **ترجمتك فوق الفيديو** بخط عربي واتجاه صحيح، وحدها أو فوق الإنجليزية، في الوضع العادي والمسرح وملء الشاشة. وتختفي أثناء الإعلانات.
- **التوقيت بضغطة:** زرّا − و+ يقدّمان الترجمة أو يؤخّرانها، و«مزامنة بجملة» تضبطها على جملة تسمعها. ويُحفظ التوقيت لكل ترجمة.
- **مقارنة بالأصل:** حين ترفع ملفك يقارنه ترجمان بالأصل الذي نزّلته، فيبيّن ما نقص وما زاد وما انحرف توقيته، ولا يعدّل في ملفك شيئًا بصمت.
- **محرّر للمراجعة:** تعدّل النص والتوقيت، وتدمج المقاطع وتشطرها، وتبحث وتستبدل، وتعلّم ما تعود إليه. ويجهّز لك ملفًا بالمقاطع الناقصة لتستكملها.
- **النص المتزامن:** لوحة بجانب الفيديو تعرض الترجمة كلها والمقطع الحالي مميز. مغلقة حتى تفتحها من زرها.
- **المحفوظات:** كل فيديو ترجمته، بحتى ثلاث ترجمات لكل فيديو، ونسخة سابقة لما استبدلته، ونسخة احتياطية تنقلها إلى جهاز آخر.

## لقطات

<table>
  <tr>
    <td width="50%" valign="top"><img src="store/screenshots/chromium/01-overlay.png" alt="الترجمة العربية فوق الإنجليزية، ولوحة النص المتزامن بجانب الفيديو"><br><sub>ترجمتك فوق الفيديو، والنص المتزامن بجانبه</sub></td>
    <td width="50%" valign="top"><img src="store/screenshots/chromium/02-download.png" alt="قائمة «تحميل الأصل» في شريط المشغّل: تنزيل الملف ونسخ التعليمات"><br><sub>تنزيل الأصل SRT وتعليمات الترجمة من شريط المشغّل</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="store/screenshots/chromium/03-timing.png" alt="حوار توقيت الترجمة بإزاحة +0.5 ثانية"><br><sub>ضبط التوقيت بضغطة، أو بمزامنة على جملة</sub></td>
    <td width="50%" valign="top"><img src="store/screenshots/chromium/04-editor.png" alt="المحرّر: جدول المقاطع بالعربية والإنجليزية ولوحة المراجعة"><br><sub>المحرّر: النص والتوقيت والمراجعة والاستكمال</sub></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="store/screenshots/chromium/05-library.png" alt="المحفوظات: فيديو بترجماته الثلاث وأزرار التصدير والاستبدال"><br><sub>المحفوظات: حتى ثلاث ترجمات لكل فيديو</sub></td>
    <td width="50%" valign="top"><img src="store/screenshots/chromium/06-settings.png" alt="إعدادات العرض: وضع العرض والخط والحجم والخلفية والموضع"><br><sub>مظهر الترجمة: الخط والحجم والخلفية والموضع</sub></td>
  </tr>
</table>

<sub>لقطات حقيقية من الإصدار 1.1.0 في Chrome، وهي لقطات المتاجر نفسها في <a href="store/screenshots/"><code>store/screenshots</code></a>. الفيلم Cosmos Laundromat، (CC) Blender Foundation | gooseberry.blender.org، برخصة CC BY 3.0.</sub>

## المتصفحات المدعومة

| المتصفح | أدنى إصدار | الحزمة | المتجر |
| --- | --- | --- | --- |
| Google Chrome | 130 | `tarjuman-1.1.0-chrome.zip` | [Chrome Web Store](https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj) |
| Microsoft Edge | 130 | `tarjuman-1.1.0-edge.zip` | [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi) |
| Brave | Chromium 130 | حزمة Chrome نفسها | [Chrome Web Store](https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj) |
| Mozilla Firefox | 144 | `tarjuman-1.1.0-firefox.zip` | Firefox Add-ons (لم يُنشر بعد) |

ترجمان للحاسوب وحده، ولا يعمل على متصفحات الهاتف ولا Firefox for Android. ويعمل على صفحات المشاهدة في `www.youtube.com`، لا على Shorts ولا البث المباشر الجاري ولا المشغّلات المضمّنة في مواقع أخرى.

## التثبيت

**من المتجر:** في Chrome وBrave ثبّته من [صفحته في Chrome Web Store](https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj)، وفي Edge من [صفحته في Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi). ولم يُنشر في Firefox Add-ons بعد، ويُضاف رابطه هنا عند نشره.

**إن جرّبته من مجلد قبل نشره:** نسخة المتجر إضافة أخرى بمعرّف جديد، فتبدأ بمحفوظات فارغة. انقل محفوظاتك إليها بالنسخة الاحتياطية، ثم أزل النسخة القديمة، كما في [دليل الاستخدام](docs/user-guide.md) §٩.

**من الشيفرة (للتجربة، ولـFirefox حتى يُنشر فيه):** يلزم [Node.js](https://nodejs.org/) ‏22 فأحدث.

<div dir="ltr">

```bash
npm ci
npm run package
```

</div>

يبني الأمر الحزم ويدقّقها: مجلد الإضافة في `release/tarjuman-1.1.0`، وحزم المتاجر في `release/store`.

- **في Chrome وEdge وBrave:** انسخ `release/tarjuman-1.1.0` إلى مجلد ثابت لا تنقله، ثم افتح صفحة الإضافات (`chrome://extensions` أو `edge://extensions` أو `brave://extensions`)، وفعّل «وضع المطوّر»، واضغط «تحميل غير معبأ» واختر المجلد. المتصفح يشتق معرّف الإضافة من مسار المجلد، والمحفوظات مربوطة به.
- **في Firefox:** افتح `about:debugging#/runtime/this-firefox`، واضغط «تحميل إضافة مؤقتة» واختر `release/store/tarjuman-1.1.0-firefox.zip`. تُزال الإضافة المؤقتة عند إغلاق Firefox، فخذ نسخة احتياطية قبل الإغلاق.

التفصيل في [دليل الاستخدام](docs/user-guide.md) §١، ومعه الأذونات والدورة الكاملة وحل المشكلات.

## ما لا يفعله

- لا ينزّل الفيديو ولا الصوت، ولا يطلب ملفات الترجمة بنفسه. يقرأ نسخة من الترجمة التي طلبها المشغّل حين شغّلتها أنت.
- لا يترجم بنفسه، ولا يحتاج حسابًا ولا مفتاح API.
- لا يعمل على Shorts، ولا على البث المباشر الجاري، ولا على المشغّلات المضمّنة في مواقع أخرى.

## الخصوصية

- ترجماتك وإعداداتك في تخزين الإضافة على جهازك، ولا تُزامَن مع أي خدمة. وإزالة الإضافة تحذفها، فخذ نسخة احتياطية قبلها.
- يخرج من الإضافة شيئان فقط:
  - **صور الفيديو في «المحفوظات»:** تُطلب من خوادم يوتيوب بمعرّف الفيديو، ولها مفتاح يطفئها. وفي Firefox هي مطفأة حتى تفعّل مفتاحها وتوافق على «نشاط التصفح».
  - **بلاغ عن مشكلة:** ترسله أنت بنفسك من الإعدادات بعد أن ترى كل ما فيه، ولا يُرفق به تلقائيًا نص ترجمة ولا معرّف فيديو.
- لا قياس استخدام، ولا إعلانات، ولا بيع لبياناتك.

السياسة الكاملة في [`PRIVACY.md`](PRIVACY.md)، وهي النص المنشور نفسه في [bysltan.com/tarjuman/privacy](https://bysltan.com/tarjuman/privacy).

<details>
<summary><b>الأذونات ولماذا يطلبها</b></summary>

| الإذن | لماذا |
| --- | --- |
| `storage` | حفظ ترجماتك ومرجعها الإنجليزي وبصمات التصدير والعلامات والإعدادات على جهازك. |
| `unlimitedStorage` | فيديو بساعتين نحو 0.7 م.ب، فالحد الافتراضي يمتلئ بنحو خمسة عشر فيديو طويلًا. ولا يضيف تحذير تثبيت. |
| `downloads` | حفظ الملفات التي تطلبها وحدها (ملف SRT الإنجليزي، والترجمات المصدَّرة، والنسخة الاحتياطية)، والاستعلام عن تنزيلات الإضافة وحدها. |
| `https://www.youtube.com/*` | سكربتا المحتوى: أزرار ترجمان في المشغّل، وقراءة نسخة رد الترجمة الذي طلبه المشغّل، ورسم ترجمتك فوق الفيديو. |
| خادم البلاغات (اختياري) | يُطلب عند أول ضغطة «أرسل البلاغ» بعد المعاينة، ولا يُستعمل لغيره. وإن رفضته لا يُرسل شيء. |

</details>

## للمطوّرين

**المتطلبات:** Node.js ‏22 فأحدث. و`npm ci` يثبّت أداتي البناء والفحص وحدهما (esbuild وweb-ext)، ولا اعتمادية تُشحن مع الإضافة.

| الأمر | ما يفعله |
| --- | --- |
| `npm run build` | يبني نسخة Chromium في `dist`. |
| `npm run build:firefox` | يبني نسخة Firefox في `dist-firefox`. |
| `npm test` | اختبارات الوحدة. |
| `npm run check` | الفحص الثابت والأسرار والإشعارات والخصوصية ومواد المتاجر والوحدة والبناءان. |
| `npm run check:wave` | ما سبق مع التكامل و`web-ext lint` وفحص الخطة. |
| `npm run package` | حزمة التثبيت الشخصي وحزم المتاجر الثلاثة وحزمة المصدر وبصماتها، بعد تدقيقها. |
| `npm run dashboard` | لوحة الخطة على http://127.0.0.1:4317. |

| المجلد | ما فيه |
| --- | --- |
| [`src`](src/) | شيفرة الإضافة: البيان، والعامل الخلفي، وسكربتا المحتوى، والمشغّل، والصفحات، والواجهة المشتركة. |
| [`test`](test/) | اختبارات الوحدة والتكامل وe2e، والاختبارات الحية بلا نافذة في `test/live`. |
| [`scripts`](scripts/) | البناء وطبقة Firefox والفحوص والتغليف وتدقيق الحزم. |
| [`store`](store/README.md) | مواد المتاجر: النصوص والأيقونات والبلاطات واللقطات وإجابات نماذج التقديم. |
| [`docs`](docs/README.md) | المواصفة والعقود والمراحل والموجات والأدلة والتدقيقات ودليلا الاستخدام والصيانة. |
| [`tools`](tools/) | أدوات لوحة الخطة، ومولّد صور هذا الملف (`tools/readme-assets`). |
| [`plan`](plan/) و[`dashboard`](dashboard/) | الخطة الآلية ولوحتها. |

فهرس الوثائق في [`docs/README.md`](docs/README.md)، والصيانة والإصدار في [`docs/maintenance.md`](docs/maintenance.md)، والقيود المعروفة في [`docs/known-limitations.md`](docs/known-limitations.md).

## المساهمة والدعم

- **مشكلة في الإضافة:** من «الإبلاغ عن مشكلة» في الإعدادات ← حول، أو من [صفحة المساعدة](https://bysltan.com/tarjuman/support).
- **ثغرة أمنية:** بلّغ عنها سرًّا كما في [`SECURITY.md`](.github/SECURITY.md)، لا في مشكلة عامة.
- **المساهمة في الشيفرة:** ترجمان ليس مفتوح المصدر، والمساهمة بإذن مكتوب من صاحب الحقوق. وقواعد العمل في [`CONTRIBUTING.md`](.github/CONTRIBUTING.md).

## الترخيص

جميع الحقوق محفوظة © 2026 سلطان ([BySultan](https://bysltan.com)). ترجمان غير مطروح بأي ترخيص مفتوح المصدر، والتفصيل في [`LICENSE`](LICENSE). والخطوط المضمّنة (OFL 1.1) والأيقونات (Lucide برخصة ISC) لأصحابها، ونسبتها في [`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt).

يوتيوب (YouTube) علامة تجارية لشركة Google LLC. وترجمان لا صلة له بيوتيوب ولا بـGoogle، ولا يحظى بتأييدهما.

</div>
