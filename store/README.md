# مواد المتاجر — المتطلبات وخطر الرفض

> **المرحلة:** T1 من [جولة النشر](../docs/store-release.md). قُرئت المصادر الرسمية في **2026-11-03** مباشرة، ما لم يُذكر غير ذلك. ولم تُعدَّل الشيفرة.
> **الرموز:** **[قرار]** يلزمه قرار سلطان. و«لم يُتحقق» ما لم يوجد في مصدر رسمي. و«استئناس» سابقة لا سياسة، فوجود إضافة في متجر لا يضمن قبول غيرها.
> **هذا المجلد** للمواد المتتبَّعة (T6). أما الحزم فتُبنى في `release/`، وهو متجاهَل في Git. وفهرس مواد T6 وتغطيتها لحقول هذا الجدول في [§٧](#٧-مواد-المتاجر-t6).

## ١. الخلاصة: خطر الرفض لكل متجر

الخطر الحاسم واحد في المتاجر الثلاثة: أن يُعدّ تصدير ترجمة يوتيوب إلى SRT تنزيلًا غير مصرّح به لمحتوى محمي. والتصدير وظيفة ترجمان الأساسية، فإن عُدّ مخالفة لم يبقَ ما يُزال ثم يُعاد الإرسال دونه.

| المتجر | احتمال الرفض بسبب التصدير | أثره إن وقع | أسباب رفض أخرى يمكن تفاديها |
| --- | --- | --- | --- |
| Chrome Web Store (ومنه Brave) | **متوسط** | **حاسم**: علاج السياسة سحب الإضافة، وطعن واحد فقط | سياسة الخصوصية، والإفصاح، وتبرير `downloads` |
| Microsoft Edge Add-ons | **منخفض** | حاسم أيضًا، فالبند نفسه | ذكر متصفح آخر، وسياسة خصوصية لا تخص Edge، ونقص خطوات الاختبار |
| Firefox Add-ons (AMO) | **منخفض** | حاسم أيضًا، لكن لا سابقة رفض | شيفرة المصدر وإعادة البناء، ودقة `data_collection_permissions` |

### Chrome Web Store: احتمال متوسط وأثر حاسم

**النص.** تنهى السياسة عن تشجيع الوصول أو التنزيل أو البث غير المصرّح به لمحتوى أو وسائط محمية، أو تسهيله أو تمكينه («Malicious and Prohibited Products»). وصفحة استكشاف المخالفات تجمع لهذا القسم المعرّفات Blue Zinc وBlue Copper وBlue Lithium وBlue Magnesium، دون تخصيص كل معرّف بسبب. ومن الأسباب الشائعة التي تعدّدها: تسهيل تنزيل فيديوهات يوتيوب، وتسهيل تنزيل محتوى يخالف حقوق مالكه. وعلاجها: إن كانت هذه وظيفة الإضافة الأساسية فالموصى به سحبها.

**لماذا قد يُعامل ترجمان معاملتها:**
- شروط يوتيوب (المؤرخة في 15 ديسمبر 2023) تمنع تنزيل أي جزء من «المحتوى» إلا بما تسمح به الخدمة صراحة أو بإذن كتابي.
- وتعريف المحتوى فيها يشمل النصوص، وإن لم يذكر الترجمات المصاحبة بالاسم. والترجمة اليدوية ملك صاحب القناة في الغالب.
- بلاغ في مجموعة مطوري Chromium بتاريخ 2026-03-12: رُفضت إضافة تحت Blue Zinc بعبارة «specifically, YouTube». وكان من ميزاتها نسخ نص الترجمة وتنزيل الصور المصغّرة، ولم يُعرف أي ميزة سببت الرفض، ولم يُجب فريق Chrome عن ذلك.
- ناشر جديد، وإضافة جديدة، وإذن `downloads` الذي تعدّه صفحة المراجعة حساسًا: كلها إشارات تُخضع الإضافة لتدقيق أطول.
- الالتقاط يغلّف `fetch` و`XMLHttpRequest` في عالم الصفحة. هذا مشروع ومعلن، لكنه مما يلفت المراجع.

**لماذا لا يُعدّ الاحتمال مرتفعًا:**
- نص السياسة لا يذكر الترجمات ولا النصوص المكتوبة. ويوتيوب لا يرد فيه إلا مع «videos».
- السياسة تستثني «video downloaders» من الإبراز في المتجر، ومع ذلك أُبرزت إضافتان لتصدير ترجمات يوتيوب (استئناس):

| الإضافة | المستخدمون | Featured | آخر تحديث | ملاحظة |
| --- | --- | --- | --- | --- |
| Transcript for YouTube™ | 40,000 | نعم | 2026-10-27 | تصدّر TXT وSRT وVTT، وفي وصفها إسناد العلامة إلى Google ونفي الارتباط. تحققت منها |
| Download Youtube Subtitles | 30,000 | نعم | 2024-03-07 | تصدّر srt وvtt وtxt |
| Download YouTube Transcript | 7,000 | — | 2026-04-26 | تصدّر SRT وVTT وTXT |

**العاقبة.** يُسمح بالطعن في قرار المخالفة مرة واحدة. و«التعدي المتكرر على حقوق الملكية الفكرية» ينهي حساب المطوّر بنص السياسة، وفي الحالات القصوى قد تُعلَّق خدمات Google المرتبطة بالحساب. فإن رُفضت الإضافة تحت Blue Zinc: طعن واحد مدروس، ولا إعادة إرسال متكررة.

**ما يخفّف الخطر دون إخفاء الوظيفة** (تنفيذه في T6):
1. يصف الإدراج ما يحدث: تصدير الترجمة الإنجليزية لترجمتها بنفسك، ثم عرض ترجمتك العربية فوق الفيديو. ولا تظهر كلمة «downloader» في العنوان.
2. ينصّ الإدراج على أن الإضافة لا تنزّل فيديو ولا صوتًا، ولا تطلب ملفات الترجمة من يوتيوب بنفسها، وإنما تقرأ نسخة من الترجمة التي طلبها مشغّل يوتيوب نفسه.
3. حقل Test instructions بالإنجليزية يشرح المسار للمراجع خطوة خطوة.
4. يُشار إلى يوتيوب بصيغة «for YouTube™» مع جملة إسناد العلامة إلى Google LLC، كما تطلب إرشادات علامة المتجر.
5. سياسة الخصوصية منشورة ورابطها يعمل قبل الإرسال.

### Microsoft Edge Add-ons: احتمال منخفض

- **البند 2.8** يمنع تقديم الوصول أو التنزيل أو البث غير المصرّح به لمحتوى أو وسائط محمية، أو تشجيعه أو تمكينه. صيغته عامة، بلا مثال عن يوتيوب، ولا ذكر للترجمات في السياسة كلها.
- **سوابق (استئناس):**
  - إضافات منشورة لتنزيل ترجمات يوتيوب، منها YouTube Caption ونحو 1,500 مستخدم (SRT وVTT)، وSubtitle Downloader: Netflix, YouTube & More (تحديث 2026-10-23).
  - بل أدوات تنزيل فيديو يوتيوب نفسها، منها Video DownloadHelper بنحو 1.5 مليون مستخدم.
  - ولم يُعثر على بلاغ رفض في Edge بسبب تنزيل من يوتيوب.
- **أسباب رفض يمكن تفاديها:**
  - البند 1.1.2: لا ذكر لمتصفح آخر في الاسم أو الوصف. ودليل النقل يجعل حذف ذكر Chrome شرطًا لاجتياز الاعتماد.
  - البند 1.5.2: سياسة الخصوصية تخص Edge أساسًا.
  - البند 1.3: خطوات الاختبار كاملة عند الإرسال، ومعها ملف SRT عربي للتجربة.
  - البند 1.3.2: الخادم يعمل، وهذا يخص نقطة البلاغات بعد T2.1.
  - البند 1.6: لا أذونات «للمستقبل»، فإذن البلاغ الاختياري لا يُشحن إلا والميزة كاملة.
  - البند 1.1.7: الشيفرة المعمّاة ممنوعة، وقد يطلب المراجع شيفرة مقروءة.

### Firefox Add-ons (AMO): احتمال منخفض، والخطر إجرائي

- **السياسات** لا تذكر يوتيوب ولا تنزيل الفيديو ولا الترجمات. وما ينطبق علينا ثلاثة: سياسة الاستخدام المقبول (حقوق الملكية الفكرية)، وقانون الولايات المتحدة، ومبدأ «No Surprises» (أن يذكر الإدراج ما ترسله الإضافة).
- **سوابق (استئناس):**
  - Video DownloadHelper مدرجة ومُوصى بها (`recommended`)، ووصفها يتضمن «Download Youtube videos». تحققت منها: 1,835,582 مستخدمًا يوميًا، والإصدار 10.6.7.2 بتاريخ 2026-10-21.
  - إضافات تنزيل ترجمات يوتيوب مدرجة، منها Youtube Subtitle Downloader وYouTube Transcript Copy.
  - ما وُجد من حظر كان لأسباب أخرى: جمع بيانات بلا إفصاح، ومحتوى احتيالي.
- **الخطر الفعلي إجرائي:**
  - شيفرة المصدر إلزامية لأن البناء يجمّع بـesbuild، ويجب أن يطابق بناء المراجع حزمتنا تمامًا.
  - `data_collection_permissions` إلزامي لكل إضافة جديدة، ويجب أن يصف ما يحدث بدقة.
  - سياسة الخصوصية لازمة متى خرجت بيانات من الجهاز.

## ٢. ما يحدث للبيانات، وما يقتضيه في كل متجر

الخلاصة: **سياسة الخصوصية لازمة في المتاجر الثلاثة**، فيُنشر الموقع (T7) قبل أي إرسال.

| ما يحدث | Chrome | Edge | Firefox |
| --- | --- | --- | --- |
| قراءة نسخة استجابة الترجمة ومعالجتها على الجهاز | «تعامل مع بيانات المستخدم»، فاستخراج محتوى الصفحة ومحتوى طلبات HTTP واستجاباتها منه، والإفصاح لازم وإن بقيت البيانات على الجهاز (user-data-faq، س2 وس3) | لا نقل، فلا يقتضي إفصاحًا خاصًا | النقل عند Mozilla ما خرج من الإضافة أو المتصفح، فلا نقل هنا |
| حفظ ملف SRT على القرص بأمر المستخدم | داخل الوظيفة المعلنة | داخل الوظيفة المعلنة | الأسئلة الشائعة تجيز النسخ الاحتياطي المحلي الذي يطلقه المستخدم بلا موافقة صريحة |
| صور المحفوظات من `i.ytimg.com` بمعرّف الفيديو (مفتاح مفعّل افتراضيًا) | لا نص يخصه (لم يُتحقق) | لا نص يخصه (لم يُتحقق) | **حُسم في T5:** نقل أقرب فئاته `browsingActivity`، فالصور في Firefox مطفأة حتى يوافق المستخدم عليها اختيارية (قرار سلطان 2026-11-04) |
| البلاغ (T2.1): وصف يكتبه المستخدم واسم المتصفح وإصداره إلى خادم المطوّر | سياسة خصوصية وإفصاح في لوحة المتجر، وإفصاح بارز وموافقة **داخل واجهة الإضافة**، وHTTPS بلا بيانات في الرابط أو الترويسات (Purple Copper)، وأضيق إذن ولو كان اختياريًا | سياسة خصوصية (اتفاقية المطوّر §4(h)، والبند 1.5.1) | `optional: ["technicalAndInteraction"]`، وهو مفعّل افتراضيًا ويُطفأ عند التثبيت. فإن أُطفئ لا يُرسل البلاغ، أو يُطلب الإذن بـ`permissions.request`. والنص الحر قد يُعدّ بيانات شخصية بتقدير المراجع |

## ٣. جدول المتطلبات

العمود «ترجمان» يذكر حاله اليوم والمرحلة التي تسد الناقص. وكل حقل مطلوب هنا يقابله في T6 مادة جاهزة.

**مراجعة AA5 (2026-11-07، للإصدار 2.0.0):** قُرئت الصفحات الرسمية اليوم، وما فيها مطابق للجدول، فلا حد تغيّر:

- **Chrome:** [images](https://developer.chrome.com/docs/webstore/images)، بلا تاريخ في الصفحة.
  - أيقونة 128×128 PNG، والرسم 96×96 بحشو شفاف 16.
  - لقطات من 1 إلى 5 بمقاس 1280×800 أو 640×400، بلا حشو، وكلها تُصغَّر اليوم إلى 640×400.
  - Small promo 440×280 اختياري، ومن لا يملكه يُعرض بعد من يملكه.
  - Marquee 1400×560 شرط الظهور في الشريط.
  - [best-listing](https://developer.chrome.com/docs/webstore/best-listing): الملخص 132 محرفًا فأقل، ولا حد رقمي للاسم فيها.
- **Edge:** [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)، بتاريخ `ms.date` 2026-05-05، وحُدّثت في 2026-09-02.
  - الوصف من 250 إلى 10,000.
  - الشعار 1:1، والموصى 300×300 والأدنى 128.
  - Small tile 440×280 اختياري، وLarge tile 1400×560 PNG اختياري.
  - لقطات حتى 6 بمقاس 640×480 أو 1280×800.
  - كلمات البحث حتى 7، و30 محرفًا لكل منها، و21 كلمة.
  - والمراجعة حتى سبعة أيام عمل.
- **AMO:** [create-an-appealing-listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)، آخر تحديث 2019-03-18.
  - الملخص 250.
  - اللقطات بالموصى 1280×800 (1.6:1)، ولا حد عملي لعددها.
  - فحزمة لقطات AMO الأولى 1280×800، ومعها 1280×960 من لوحة 18 احتياطًا لشرط 4:3 الذي لم يُتحقق منه (الصف أدناه).

### Chrome Web Store

| الحقل | مطلوب؟ | الحد أو المقاس | ترجمان | المصدر |
| --- | --- | --- | --- | --- |
| حساب المطوّر | مطلوب | رسوم تسجيل لمرة واحدة. مبلغها 5 دولارات في تدوينة Chromium (2020-03-12)، والصفحة الحالية لا تذكره. والتحقق بخطوتين إلزامي، وبريد التواصل موثّق، واسم الناشر مطلوب | سلطان بيده عند النشر | [register](https://developer.chrome.com/docs/webstore/register)، [policies](https://developer.chrome.com/docs/webstore/program-policies/policies) |
| إعلان تاجر أو غير تاجر (DSA) | مطلوب من كل المطوّرين | التاجر يُنشر اسمه القانوني وهاتفه وعنوانه أسفل الإدراج | غير تاجر (§٥) | [trader-disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure) |
| الحزمة | مطلوبة | ZIP حتى 2GB، والبيان في جذرها، ورقم الإصدار يزيد مع كل رفع، وللناشر الجديد إضافتان منشورتان | T4 | [publish](https://developer.chrome.com/docs/webstore/publish)، [prepare](https://developer.chrome.com/docs/webstore/prepare) |
| الاسم | من `name` في البيان | حتى 75 محرفًا، و`short_name` حتى 12 | «ترجمان — ترجمتك فوق الفيديو» (27) منذ 2.0.0، و`short_name` «ترجمان». T2 وAA5 | [prepare](https://developer.chrome.com/docs/webstore/prepare) |
| الملخص | من `description` في البيان | حتى 132 محرفًا، نص عادي | الحالي 122 محرفًا، ويُراجع بعد T2.1 | [best-listing](https://developer.chrome.com/docs/webstore/best-listing) |
| الوصف التفصيلي | مطلوب، والفارغ يُرفض | بلا حد منشور. ممنوع حشو الكلمات (Yellow Argon): لا قوائم مواقع أو علامات، ولا تكرار الكلمة أكثر من 5 مرات | T6 | [listing-requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements) |
| الفئة واللغة | في Product details | الإلزام وقائمة الفئات لم يُتحقق منهما | T6 | [cws-dashboard-listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) |
| أيقونة المتجر | مطلوبة | 128×128 PNG، والرسم 96×96 بحشو شفاف 16px | توجد أيقونة 128، ويُتحقق من الحشو في T6 | [images](https://developer.chrome.com/docs/webstore/images) |
| لقطات الشاشة | مطلوبة: من 1 إلى 5 | 1280×800 أو 640×400، بزوايا مربعة وبلا حشو | T6 | [images](https://developer.chrome.com/docs/webstore/images) |
| Small promo tile | اختياري | 440×280 PNG أو JPEG. والإضافات التي لا تملكه تُعرض بعد التي تملكه | T6 | [images](https://developer.chrome.com/docs/webstore/images) |
| Marquee | اختياري | 1400×560، وهو شرط الظهور في الشريط الدوّار | T6 | [images](https://developer.chrome.com/docs/webstore/images) |
| فيديو | اختياري | رابط يوتيوب | — | [cws-dashboard-listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) |
| Homepage وSupport URL | اختياريان | Official URL يتطلب موقعًا موثّقًا في Search Console | T7 | [cws-dashboard-listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) |
| Single purpose | مطلوب | وصف مفصّل للغرض الواحد | T6 | [cws-dashboard-privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) |
| تبرير الأذونات | مطلوب لكل إذن | `storage` و`unlimitedStorage` و`downloads`، وإذن البلاغ الاختياري بعد T2.1 | T6 | [cws-dashboard-privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) |
| إعلان الشيفرة البعيدة | مطلوب | «No, I am not using remote code» | T6 | [cws-dashboard-privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) |
| Data usage وتصديقات Limited Use | مطلوب للنشر والتحديث | خانات لأنواع البيانات، وقائمتها الكاملة لم يُتحقق منها | T5 وT6 | [user-data-faq](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) |
| رابط سياسة الخصوصية | مطلوب، فالإضافة تتعامل مع بيانات المستخدم | غيابه أو تعطّل رابطه سبب رفض (Purple Lithium) | T5 وT7 | [troubleshooting](https://developer.chrome.com/docs/webstore/troubleshooting) |
| إقرار Limited Use في الموقع | مطلوب لمن يتعامل مع البيانات | في الصفحة الرئيسية للموقع أو على بُعد نقرة منها | T7 | [limited-use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) |
| الظهور والمناطق | — | Public أو Unlisted أو Private، وكل المناطق أو بعضها | Public وكل المناطق | [cws-dashboard-distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) |
| Test instructions | اختياري | ليس شرطًا للنشر، ونوصي به | T6 | [cws-dashboard-test-instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions) |
| الإشارة إلى يوتيوب | — | لا علامة Google اسمًا ولا شعارًا. يجوز «for» أو «compatible with» مع ™، وجملة إسناد في الوصف | T6 | [branding](https://developer.chrome.com/docs/webstore/branding) |

### Microsoft Edge Add-ons

| الحقل | مطلوب؟ | الحد أو المقاس | ترجمان | المصدر |
| --- | --- | --- | --- | --- |
| حساب Partner Center | مطلوب | مجاني بحساب Microsoft. النوع Individual أو Company، ولا يتغير هو ولا الدولة بعد التسجيل. واسم الناشر حتى 50 محرفًا ويظهر علنًا | الحساب الحالي: Individual باسم BySultan | [create-dev-account](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account) |
| صفة التاجر | — | نوع الحساب هو الإعلان: التوزيع المرتبط بعمل تجاري يقتضي حساب Company (اتفاقية المطوّر §2) | Individual، فليس تاجرًا | Microsoft Store App Developer Agreement 8.11 |
| الحزمة | مطلوبة | zip والبيان في جذرها، وبلا `update_url`. حد الحجم لم يُتحقق منه | لا `update_url` اليوم. T4 | [port-chrome-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension) |
| الاسم والوصف القصير | من البيان | لا ذكر لمتصفح آخر (1.1.2). والحد الأقصى للطول لم يُتحقق منه | البيان لا يذكر متصفحًا اليوم | [developer-policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) |
| Category | مطلوب | — | T6 | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| Privacy policy URL | مطلوب متى جُمعت معلومات شخصية | سياسة تخص Edge أساسًا (1.5.2) | T5 وT7 | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| Website وSupport contact | اختياريان | يظهران للمستخدمين، وقد يُعرض بريد الدعم علنًا | `bysltan.com` و`iSultanBy@gmail.com`. T7 | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| Mature content | خانة | — | T6 | [developer-policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) |
| Single purpose، وتبرير الأذونات، والشيفرة البعيدة، وData usage | صفحة Privacy | الإفصاح الناقص أو غير الدقيق سبب رفض | T6 | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| Description | مطلوب لكل لغة | من 250 إلى 10,000 محرف | T6 | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| Extension logo | مطلوب لكل لغة | 1:1، والموصى به 300×300، والأدنى 128×128 | **حُسم في T6:** `store/icons/edge-logo-300.png` | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| Small promotional tile | اختياري في صفحة النشر، و«مطلوب» في صفحة النظرة العامة | 440×280، ونقدّمه احتياطًا | T6 | [extensions overview](https://learn.microsoft.com/en-us/microsoft-edge/extensions/) |
| Large promotional tile | اختياري | 1400×560 PNG | T6 | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| Screenshots | اختيارية | حتى 6، بمقاس 640×480 أو 1280×800 | T6 | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| YouTube video | اختياري | تُوقف الإعلانات فيه (2.13) | — | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| Search terms | اختيارية | حتى 7 مصطلحات، و30 محرفًا لكل منها، و21 كلمة إجمالًا | T6 | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| Notes for certification | اختيارية، والبند 1.3 يوجب خطوات الاختبار | الوصول إلى الميزات وبيانات التجربة | T6 | [developer-policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) |
| Visibility وMarkets | — | Public أو Hidden، وكل الأسواق أو بعضها | Public وكل الأسواق | [publish-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) |
| المراجعة | — | حتى 7 أيام عمل، وللتحديث المدة نفسها | — | [update-extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/update-extension) |

### Firefox Add-ons (AMO)

| الحقل | مطلوب؟ | الحد أو المقاس | ترجمان | المصدر |
| --- | --- | --- | --- | --- |
| حساب Mozilla واتفاقية التوزيع | مطلوبان | التحقق بخطوتين إلزامي للدخول إلى حساب المطوّر منذ 2021-03-15. والاتفاقية السارية نسخة 2021-12-01، والمحدّثة تسري في 2026-12-01، و«الاستمرار في التوزيع بعد السريان قبول لها» بنصها، بلا خطوة قبول منفصلة (مراجعة 2026-11-05) | سلطان بيده | [distribution agreement](https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/)، [2FA](https://blog.mozilla.org/addons/2021/03/11/two-factor-authentication-required-for-extension-developers/) |
| ملف الإضافة | مطلوب | zip أو xpi حتى 200MB. وبلا `gecko_android` يُتاح لسطح المكتب وحده | T2 وT4 | [submitting-an-add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) |
| `browser_specific_settings.gecko.id` | لازم للتوقيع في MV3 | نص شبيه بالبريد حتى 80 محرفًا، أو GUID. و`tarjuman@bysltan.com` يطابق الصيغة | معتمد، ويربط الإدراج وتحديثاته. T2 | [MDN browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) |
| `data_collection_permissions` | إلزامي لكل إضافة جديدة منذ 2025-11-03 | `required: ["none"]` إن لم يُجمع شيء دون موافقة، و`technicalAndInteraction` لا يكون إلا اختياريًا | T2 وT2.1، ويحكم T5 في الصور | [firefox-builtin-data-consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) |
| شيفرة المصدر | إلزامية لكل إصدار | README فيه نظام التشغيل والأدوات وإصداراتها وكل أوامر البناء، وملف القفل، وأدوات مفتوحة المصدر. والمطابقة تامة | T4 | [source-code-submission](https://extensionworkshop.com/documentation/publish/source-code-submission/) |
| Name | مطلوب | حتى 50 محرفًا | «ترجمان — ترجمتك فوق الفيديو» (27) منذ 2.0.0. T2 وAA5 | addons-server (`max_length=50`) |
| Add-on URL (slug) | يُولَّد ويُعدَّل | فريد، حتى 30 محرفًا | T6 | [submitting-an-add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) |
| Summary | مطلوب | حتى 250 محرفًا، بلا روابط | T6 | [create-an-appealing-listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/) |
| Description | اختياري | حتى 15,000، وMarkdown محدود. ويذكر ما تنقله الإضافة («No Surprises») | T6 | [add-on-policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) |
| Categories | مطلوبة للإدراج | حتى 2 في الوثيقة، و3 في الشيفرة. ومنها Language Support وPhotos, Music & Videos | T6 | [submitting-an-add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) |
| Tags | اختيارية | حتى 10 من قائمة ثابتة، فيها `youtube` و`translate` | T6 | AMO API `/api/v5/addons/tags/` |
| Support email وwebsite وHomepage | اختيارية | 100 و255 و255 محرفًا | `iSultanBy@gmail.com` و`bysltan.com`. T7 | addons-server |
| License | مطلوبة للمدرج | منها `all-rights-reserved` | **حُسم في T4:** All Rights Reserved (§٥) | [addons-server licenses](https://mozilla.github.io/addons-server/topics/api/licenses.html) |
| Privacy policy | مطلوبة متى نُقلت بيانات من الجهاز | لم تعد تُستضاف في AMO، ويُستحسن رابطها في الإدراج | T5 وT7 | [add-on-policies-faq](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/) |
| Notes for Reviewers | اختيارية | حتى 3,000، ولا يراها إلا Mozilla | T6 | addons-server |
| Release notes | اختيارية | حتى 3,000 | T6 | addons-server |
| Icon | من البيان | مربعة، وتُخزَّن بمقاسات 32 و64 و128 | 128 موجودة | [create-an-appealing-listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/) |
| Screenshots | اختيارية | الموصى به 1280×800 (1.6:1). وإن كان المفتاح `content-optimization` مفعّلًا في الإنتاج، وهذا لم يُتحقق منه، فالشرط 1000×750 فأكثر بنسبة 4:3. ومقاس 1280×960 يجتاز الحالتين | T6 | [create-an-appealing-listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/) |
| المراجعة | — | تحقق آلي قبل التوقيع حتى 24 ساعة، وأطول إن اختيرت للمراجعة اليدوية. ومراجعة الشيفرة يدويًا ممكنة في أي وقت بعد النشر | — | [submitting-an-add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) |

## ٤. وقائع تقنية للمراحل التالية

قرأتها في T1 ولم تُختبر بعد. يثبتها T2 وT3 بالبناء والاختبار.

- **Firefox: الخلفية.** `background.service_worker` غير مدعوم، فتحل محله `background.scripts`. وإن وُجد `service_worker` وحده فخطأ `BACKGROUND_SERVICE_WORKER_NOFALLBACK`.
- **Firefox: الخطوط.** `use_dynamic_url` غير مدعوم، ورابط `moz-extension://` عشوائي لكل نسخة متصفح أصلًا. وأثر المفتاح في `web-ext lint` لم يُختبر.
- **Firefox: إصدارات المفاتيح.** `world: "MAIN"` مدعوم منذ 128، و`optional_host_permissions` منذ 128 أيضًا، فالحد الأدنى 140 يغطيهما ويتسق مع `data_collection_permissions`.
- **Firefox: إذن يوتيوب.** أذونات المضيف المشتقة من `content_scripts.matches` تُمنح عند التثبيت منذ 127، ويستطيع المستخدم سحبها. يختبرها T3.
- **Firefox: التنزيل.** `downloads.download` بعنوان `data:` لا يذكره MDN، وهو يوثّق طريق `blob`. **حُسم في T3:** Firefox يرفض `data:`، فصار التنزيل فيه بـ`blob:` (`3d6a800`).
- **Firefox: بيئة المراجع.** الافتراضية Ubuntu 24.04.4 على ARM64، وNode 24.14.0، وnpm 11.9.0. وعندنا Node 24.18.1 وnpm 11.16.0، وملف القفل يحوي `@esbuild/linux-arm64`.
- **البصمات وبيئة البناء** (تدقيق 7a66f91، U63، قرار سلطان Q33 أ):
  - **السبب:** بصمة كل أرشيف تتبع مكتبة zlib المربوطة بـNode، لا إصداره وحده. Node 24.18.1 من Homebrew مربوط بـzlib النظام 1.2.12، فأعطى `6da3a155…` لحزمة Chrome في `docs/evidence/review-apply/`. والنسخ الرسمية بـzlib المضمّن 1.3.1 (24.14.0 و24.16.0 و20.20.2، وLinux) أعطت `e66810a8…`. والملفات الـ41 داخل الأرشيفين متطابقة بايتًا.
  - **الأثر:** مراجع AMO ببيئته الافتراضية لا يطابق `SHA256SUMS` المكتوب عندنا، ويطابق الملفات. وهذا ما تعد به `SOURCE-README.txt` وملاحظات المراجعين: الملفات لا الأرشيف.
  - **ما يُكتب:** `-store.json` فيه بيئة البناء (`build`: Node وzlib والمعمارية والنظام)، وبصمة كل ملف في كل حزمة، و`reproducibility: "files"`. و`store.mjs` يطبع البيئة في سطر الختام.
  - **ما يُتبع:** تُذكر البيئة مع كل جدول بصمات، والمقارنة ملفًا ملفًا إن اختلفت البيئة.
- **Firefox: التصغير.** صفحة شيفرة المصدر لا توصي بالتصغير وإن أجازته، والبناء يستعمل `minifySyntax`. ينظر فيه T4 ولا يغيّره T1. **حُسم في T4:** يبقى `minifySyntax` (لا إعادة تسمية ولا حذف مسافات ولا خرائط مصدر)، وحزمة المصدر تعيد بناء الحزمة بايتًا، وتعليماتها تصفه.
- **البناء: هدف esbuild.** `target: 'chrome111'`، فيُراجع لهدف Firefox في T2.
- **البناء: التراخيص.** `legalComments: 'none'` يحذف تعليقات التراخيص، فتلزم إشعارات الأطراف الثالثة في T4. **حُسم في T4:** `THIRD_PARTY_NOTICES.txt` في كل حزمة، وفيه ترخيص esbuild لدوالّه المساعدة.
- **Chrome: التصغير والتعمية.** التصغير مسموح والتعمية ممنوعة (Red Titanium، ومن أمثلتها تهريب المحارف بـ`\u`). و`charset: 'utf8'` في `scripts/build.mjs` يمنع هذا التهريب.
- **Edge: الحزمة.** يُحذف `update_url` إن وُجد، وهو غير موجود اليوم.

## ٥. القرارات

حسمها سلطان في 2026-11-03، بعد عرض التوصيات عليه.

| القرار | المعتمد | أثره |
| --- | --- | --- |
| Chrome Web Store مع خطر Blue Zinc | الإرسال إلى المتاجر الثلاثة بإدراج شفاف (§١)، وطعن واحد إن رُفض، ولا إعادة إرسال متكررة | T6 وT8 |
| اسم الناشر | **BySultan** في المتاجر الثلاثة | T6 |
| حساب Edge | حساب Partner Center الحالي من نوع **Individual**، دون حساب جديد ولا تغيير في نوعه. والنوع الفردي إعلان بأن التوزيع ليس عملًا تجاريًا (اتفاقية المطوّر §2) | — |
| حساب Google للنشر | حساب مخصص باسم الناشر BySultan، لا الحساب الشخصي. وبريده `iSultanBy@gmail.com`، وهو بريد التواصل الظاهر في متجر Chrome وبريد الدعم | — |
| صفة التاجر في Chrome | **غير تاجر**، متسقة مع حساب Edge الفردي | T8 |
| الاسم | `name`: **«ترجمان — ترجمتك فوق الفيديو»** (27 محرفًا) منذ 2.0.0، نص لوحة الهوية 18 (`docs/aa-plan.md` §٢ وAA5)، وكان «ترجمان - ترجمتك العربية فوق الفيديو» (35 محرفًا) في 1.1.0 على نمط مِجهَر. و`short_name` و`default_title`: «ترجمان». وتبقى علامة يوتيوب خارج العنوان. ومتجرا Chrome وEdge يأخذان العنوان من البيان، فيظهر الاسم الكامل في صفحة الإضافات بالمتصفح أيضًا | T2 يعدّله في البيان للهدفين، وAA5 للاسم الجديد |
| لغة الإدراج | العربية وحدها بلا `_locales`، وملاحظات المراجعين بالإنجليزية | T6 |
| الظهور | عام (Public) في المتاجر الثلاثة، وكل المناطق | T6 وT8 |
| Firefox | `tarjuman@bysltan.com` (على نمط `mijhar@bysltan.com`)، لسطح المكتب وحده بلا `gecko_android` | T2 |
| الموقع | `bysltan.com`، وصفحات ترجمان فيه من T7 | T7 |
| بريد الدعم | `iSultanBy@gmail.com`، ويظهر علنًا في صفحات المتاجر وصفحة الدعم | T5 وT6 وT7 |

**التأكيدات** (سلطان، 2026-11-03): صفة «غير تاجر» في Chrome، وبريد حساب Google هو بريد الدعم نفسه، و«BySultan» هو الاسم الظاهر للعموم في Edge (Publisher display name). فلم يبقَ قرار قبل الإرسال إلا ما ينتظر مرحلته.

**قرارات تنتظر مرحلتها:** لا شيء. روابط الموقع والدعم ثُبّتت بعد نشره (2026-11-04، `submission.md` §٥)، ونص الإدراج وفيديو اللقطات حُسما في T6 (أدناه).

**قرارات T4** (اعتمدها سلطان كما أوصي بها في 2026-11-04: «نعم، اعتمدها»):

| القرار | المعتمد | التنفيذ |
| --- | --- | --- |
| الترخيص | `LICENSE` «جميع الحقوق محفوظة» بنص ترجمان: ما يملكه ترجمان، وحق الاستعمال لمن ثبّته، وما ليس له بتراخيصه (الخطوط وLucide وFeather وesbuild)، ونفي الصلة بيوتيوب. وفي AMO يُختار «All Rights Reserved» | نُفّذ: حُذف سطر المسودة. واختيار AMO عند الإرسال (T6 وT8) |
| رابط المستودع في «حول» | «المستودع على GitHub» يعطي 404 للعموم لأن `iSltanX/Tarjuman` خاص، فيُستبدل برابط «الدعم والخصوصية» إلى `https://bysltan.com/tarjuman/support` | نُفّذ بعد نشر الصفحة (2026-11-04، 200) وقبل T8: `LINKS.support` في `src/pages/settings/about.js` بنص «الدعم والخصوصية»، واستثناؤه في `check-static.mjs` و`audit.mjs` واختباراه. **ثم (2026-11-07، الإصدار 2.0.0):** صار المستودع عامًّا (200 للعموم)، فعاد رابطه `LINKS.repo` بطلب سلطان في بطاقة «الحقوق» مع الموقع، وبقي رابط الدعم |
| رقم أول نسخة في المتاجر | `1.1.0`: الرقم `1.0.0` للوسم `tj-v2` وللحزم الشخصية بعده، وأول نسخة للمتاجر تضيف Edge وFirefox والإبلاغ والهوية الجديدة (`CHANGELOG.md`) | نُفّذ: البيان و`package.json` وملف القفل على `1.1.0`، وحزم المتاجر `tarjuman-1.1.0-*` |
| وجهة «انسخ البلاغ» | رسائل فشل الإرسال («انسخه وأرسله بطريقتك») ورسالة النجاح («احتفظ بالرقم إن أردت المتابعة») تسمّيان صفحة الدعم `/tarjuman/support` أو بريد الدعم `iSultanBy@gmail.com`. نُقلت العبارتان من مِجهَر في T2.1، وكشفتهما مراجعة T4 | نُفّذ مع رابط «حول»: الرسائل الثلاث «انسخه وأرسله إلى بريد الدعم iSultanBy@gmail.com.»، والنجاح «واذكره حين تراسل بريد الدعم …» (`SUPPORT_EMAIL` في `src/core/report/messages.js`، و`src/pages/settings/report.js`) واختباراتهما |
| سطر Lucide في «عرض التراخيص» | «أيقونات الواجهة · Lucide — ISC، ومنها Feather — MIT» يفتح `THIRD_PARTY_NOTICES.txt` من الحزمة، وجملة في ملاحظة «حول» (بتفويض سلطان: «قم بما تراه مناسب») | نُفّذ في T4 |

**قرارات T5** (اعتمدها سلطان كما أوصي بها في 2026-11-04: «نعم، اعتمدها»):

| القرار | المعتمد | التنفيذ |
| --- | --- | --- |
| إعلان Firefox وصور المحفوظات | الخيار أ: في Firefox وحده الصور مطفأة حتى يفعّل المستخدم مفتاحها ويوافق على «نشاط التصفح» (`browsingActivity` في `optional`)، ويبقى Chromium كما هو. فيبقى `required: ["none"]` صادقًا. التفصيل في `docs/site/README.md` | نُفّذ: `src/core/consent/thumbnails.js`، والمفتاح في الإعدادات، والمحفوظات، وطبقة Firefox والحارسان. لم يُختبر حيًا (T8) |
| حذف البلاغ بطلب صاحبه | «لحذفه راسل بريد الدعم برقمه» | نُفّذ في `privacy.md` `#report` |
| استعمال البلاغ | «يُستعمل لفهم المشكلة وإصلاحها وتحسين ترجمان وحده» | نُفّذ في `privacy.md` `#limited-use` |

فلا [قرار] في `privacy.md`، و`PRIVACY.md` بلا تنبيه مسودة. وثُبّت تاريخ السريان 2026-11-04 يوم نشر الموقع، و`--strict` ينجح. ثم ثُبّت 2026-11-05 بقرار سلطان في تدقيق 7a66f91 (C9) بعد نصوص C1 المعتمدة، ويصل الموقع بطلب دمج منفصل.

**قرارات T6** (سلطان، 2026-11-04):

| القرار | المعتمد | التنفيذ |
| --- | --- | --- |
| هوية المواد | دمج `main` في فرع النشر، فتحمل المواد الهوية الثالثة «المعيّنان المتشابكان» و«باذنجاني على رمادي» | نُفّذ (`a717bd4`) |
| فيديو اللقطات | Cosmos Laundromat، ‏(CC) Blender Foundation، برخصة CC BY 3.0. وعرض سلطان لقطات إعلان Hexed من ديزني، ثم اختار Cosmos بعد بيان خطرها: الإعلان محمي، وشخصياته وعنوانه علامات ديزني، وهو يقوّي خطر الرفض في §١ | نُفّذ |
| اللقطات | **معتمدة كما هي**: إطار المشغّل غلاف الفيلم («لقطاتك معتمدة ما يحتاج أرسلك شي»)، فلا لقطات بمشهد حقيقي من النافذة اليدوية | نُفّذ |
| نص الإدراج والفئات | **معتمد كما هو** («أعتمدها»): نصوص `listing.ar.md` كلها، والفئات (Chrome: Accessibility، وEdge: Accessibility، وAMO: Language Support وPhotos, Music & Videos) | نُفّذ |

**قرارات مراجعة الجاهزية** (سلطان، 2026-11-05: «اعتمد وادفع»، بعد عرض الصياغتين في جولة تنظيم المستودع):

| القرار | المعتمد | التنفيذ |
| --- | --- | --- |
| Edge 1.5.2: «the privacy policy should primarily refer to the Microsoft Edge browser» | سياسة خصوصية واحدة كما هي، وفقرة في «Notes for certification» تبيّن أن الحزمة نفسها منشورة لمتصفحات أخرى، وأن السياسة تسمّي Microsoft Edge حيث يختلف السلوك. وإن رفضها المراجع فالبديل قسم خاص بـEdge في صفحة الخصوصية بطلب دمج في الموقع وإذن منفصل | `reviewer.edge` في `reviewers.en.md` |
| فئة البلاغ في Firefox | يبقى `technicalAndInteraction` في البيان (البلاغ من «crash and error reports» بتعريف Mozilla، لا رسالة بين أشخاص)، وبند في «Notes for Reviewers» يشرح ذلك ويذكر أن Chrome وEdge يُفصحان عن الحقل احتياطًا تحت «Personal communications». فلا تغيير في الشيفرة ولا الحزم | `reviewer.amo` في `reviewers.en.md` |

**بيدك عند النشر، لا في هذه الجولة:** إنشاء الحسابات الثلاثة، ودفع رسوم Chrome، والتحقق بخطوتين، وإعلان صفة التاجر، والرفع.

## ٦. المصادر

قُرئت كلها في 2026-11-03. والتاريخ بين القوسين «آخر تحديث» كما تعرضه الصفحة، وبعضه أقدم من محتواها.

- **Chrome Web Store:**
  - [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies) (2025-05-22)
  - [Malicious and Prohibited Products](https://developer.chrome.com/docs/webstore/program-policies/malicious-and-prohibited) (2022-11-01)
  - [Impersonation and IP](https://developer.chrome.com/docs/webstore/program-policies/impersonation-and-intellectual-property) (2022-11-01)
  - [Troubleshooting violations](https://developer.chrome.com/docs/webstore/troubleshooting)
  - [Review process](https://developer.chrome.com/docs/webstore/review-process)
  - [User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
  - [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use) (2022-11-01)
  - [Listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements) (2024-07-10)
  - [Images](https://developer.chrome.com/docs/webstore/images)
  - [Listing tab](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
  - [Privacy tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
  - [Distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
  - [Test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions) (2025-05-16)
  - [Register](https://developer.chrome.com/docs/webstore/register) (2024-02-13)
  - [Trader disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure) (2024-02-09)
  - [Branding](https://developer.chrome.com/docs/webstore/branding)
  - [بلاغ الرفض](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/K17UE-7Bjgs) (2026-03-12)
  - [Policy updates 2026](https://developer.chrome.com/blog/cws-policy-updates-2026) (نُشر 2026-07-01، قُرئ 2026-11-05): ما يُجمع من بيانات يلزم الغرض الواحد وحده، وكل جمع يُفصَح عنه للمستخدم إفصاحًا بارزًا، ويُبلَّغ المستخدم إن تغيّرت ممارسات البيانات بعد التثبيت. وترجمان لا يجمع شيئًا إلا البلاغ الذي يرسله المستخدم بعد معاينته، وصور المحفوظات طلب إلى يوتيوب لا جمع لدى المطوّر، وكلاهما مذكور في الإدراج والسياسة وإجابات §٤ من `submission.md`
  - [Review updates 2026](https://developer.chrome.com/blog/cws-review-updates-2026) (2026-08-20، قُرئ 2026-11-05): اختبار تثبيت آلي عند رفع الحزمة، وإيقاف شارة «Featured» لاحقًا في 2026، فسوابق «Featured» في §١ استئناس يضعف
  - [Transcript for YouTube™](https://chromewebstore.google.com/detail/mjmghnkcbdmdbkolinkcbapglcinoahd)
- **Microsoft Edge Add-ons:**
  - [Developer policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) (ms.date 2026-07-24)
  - [Publish an extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) (2026-05-05)
  - [Create a developer account](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account) (2025-12-12)
  - [Port a Chrome extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension) (2021-02-17)
  - [Update an extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/update-extension) (2022-11-04)
  - Microsoft Store App Developer Agreement، الإصدار 8.11 (يسري من 2026-04-17)
- **Firefox Add-ons:**
  - [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) (2026-10-20)، وتعديل يسري في 2026-12-01 لا يمس الإرسال ولا المراجعة
  - [Policies FAQ](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/) (2025-08-04)
  - [Built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) (2026-10-18)
  - [Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
  - [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) (2026-05-10)
  - [Signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/) (2024-08-21)
  - [MV3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
  - [Mozilla Acceptable Use Policy](https://www.mozilla.org/en-US/about/legal/acceptable-use/)
  - [Video DownloadHelper](https://addons.mozilla.org/en-US/firefox/addon/video-downloadhelper/)
- **يوتيوب:**
  - [شروط الخدمة](https://www.youtube.com/static?template=terms&hl=en&gl=US): النسخة الأمريكية مؤرخة في 2023-12-15، والعربية سارية منذ 2022-01-05 وفيها استثناء ثالث «ما يسمح به القانون الساري»

## ٧. مواد المتاجر (T6)

أُعدّت في 2026-11-04 على الفرع بعد دمج الهوية الثالثة من `main` (قرار سلطان). ويقيسها كلها `node scripts/release/store-assets.mjs --check` (ضمن `npm run check`): الحقول بحدود §٣، والصور بمقاسها وشفافيتها. والأدلة في [`docs/evidence/T6/`](../docs/evidence/T6/README.md).

| الملف | ما فيه |
| --- | --- |
| [`listing.ar.md`](listing.ar.md) | ما يراه المستخدمون: الاسم والوصف القصير من البيان، وملخص AMO، والوصف الكامل بنسختيه، والفئة، وكلمات Edge، ووسم AMO، ورابطه، وسجل الإصدار. اعتمده سلطان مع الفئات (2026-11-04) |
| [`submission.md`](submission.md) | إجابات النماذج: الغرض الواحد، ومبررات الأذونات، والشيفرة البعيدة، وإفصاح البيانات، والروابط، وحقول كل متجر |
| [`reviewers.en.md`](reviewers.en.md) | ملاحظات المراجعين بالإنجليزية لكل متجر، ومعها مقاطع عربية للتجربة |
| `icons/` | `chrome-store-icon-128.png` (البلاطة 96 بحشو شفاف 16)، و`edge-logo-300.png`. والبلاطة تطابق أيقونة الإضافة المشحونة (`src/icons/tarjuman-icon-128.png`) إلا تنعيم الزوايا |
| `promo/` | `small-promo-440x280.png` (Chrome وEdge)، و`marquee-1400x560.png` (Chrome Marquee وEdge Large) |
| `screenshots/chromium/` | ست لقطات 1280×800: الخمس الأولى لـChrome، والست لـEdge |
| `screenshots/firefox/` | اللقطات الست بمقاس 1280×960 لـAMO |
| [`test-files/`](test-files/README.md) | ملف الترجمة الإنجليزية لفيديو اللقطات كما نزّله ترجمان، وترجمته العربية |

**مصدر الصور:** لقطات حقيقية من حزمة المتجر `tarjuman-1.1.0-chrome.zip` (`test/live/stores/t6-shots.mjs`)، داخل إطار بعنوان عربي قصير (`test/live/stores/t6-art.mjs`) بخطوط ترجمان وشعاره وألوانه. وصورة الترويج الكبيرة فيها لقطة حقيقية كذلك. وفيديو اللقطات Cosmos Laundromat، (CC) Blender Foundation | gooseberry.blender.org، برخصة CC BY 3.0، بلا أشخاص حقيقيين ولا اسم قناة ولا تعليقات ولا حساب. ولا لقطة من `docs/evidence/` القديمة.

### تغطية حقول §٣

كل حقل مطلوب في جدول T1 وماده. و«سلطان» ما يُنجز بيده عند النشر، و«T7» ما ينتظر نشر الصفحات.

| المتجر | الحقل المطلوب | المادة |
| --- | --- | --- |
| Chrome | الحزمة | `release/store/tarjuman-1.1.0-chrome.zip` (T4) |
| Chrome | الاسم والملخص | `manifest.name` و`manifest.description` في `listing.ar.md` |
| Chrome | الوصف التفصيلي | `chromium.description` |
| Chrome | الفئة واللغة | `listing.ar.md` «الفئة»، والعربية |
| Chrome | أيقونة المتجر | `icons/chrome-store-icon-128.png` |
| Chrome | لقطات (1 إلى 5) | `screenshots/chromium/01` إلى `05` |
| Chrome | Single purpose | `reviewer.singlePurpose` في `submission.md` §١ |
| Chrome | تبرير الأذونات | `reviewer.permission.*` في `submission.md` §٢، ومعها الإذن الاختياري لقناة البلاغات |
| Chrome | إعلان الشيفرة البعيدة | `submission.md` §٣ |
| Chrome | Data usage وLimited Use | `submission.md` §٤، ومنه قناة البلاغات |
| Chrome | رابط سياسة الخصوصية | `submission.md` §٥ (T7) |
| Chrome | إعلان التاجر | غير تاجر (سلطان، §٥) |
| Edge | الحزمة | `release/store/tarjuman-1.1.0-edge.zip` (T4) |
| Edge | Category | `listing.ar.md` «الفئة» |
| Edge | Privacy policy URL | `submission.md` §٥ (T7) |
| Edge | Single purpose والأذونات والشيفرة البعيدة وData usage | `submission.md` §١ إلى §٤ |
| Edge | Description (250 إلى 10,000) | `chromium.description` (2,387 محرفًا بعد نصوص C1 في تدقيق 7a66f91، بلا ذكر متصفح آخر) |
| Edge | Extension logo | `icons/edge-logo-300.png` |
| Edge | الاسم والوصف القصير | من البيان |
| Edge | خطوات الاختبار (البند 1.3) | `reviewer.chrome` و`reviewer.edge` في `reviewers.en.md` |
| Firefox | ملف الإضافة وشيفرة المصدر | `tarjuman-1.1.0-firefox.zip` و`tarjuman-1.1.0-source.zip` (T4) |
| Firefox | `data_collection_permissions` | في البيان (T2.1 وT5)، وشرحه في `submission.md` §٢ |
| Firefox | Name وSummary | من البيان، و`amo.summary` |
| Firefox | Categories | `listing.ar.md` «الفئة» |
| Firefox | License | All Rights Reserved (`submission.md` §٦) |
| Firefox | Privacy policy | `submission.md` §٥ (T7) |

والاختياري كله له مادة أيضًا: Small promo وMarquee وLarge tile (`promo/`)، ولقطات Edge وAMO، وكلمات Edge، ووسم AMO ورابطه، وNotes for Reviewers، وRelease notes، وTest instructions. ولا فيديو ترويجي في هذا الإصدار.
