# إجابات نماذج التقديم — ترجمان 2.1.1

> **المرحلة:** T6 من جولة النشر، 2026-11-04، ومحدّثة للإصدار 2.1.1. إجابات حقول Chrome Web Store وMicrosoft Edge Add-ons (Partner Center) وFirefox Add-ons (AMO) لحزم `release/store/tarjuman-2.1.1-*` المبنية من الفرع `tj/store-release` بعد دمج الهوية الثالثة. تُطابَق مع نموذج كل متجر وقت التقديم. ولا يُرفع شيء في هذه الجولة.
> **اللغة:** ما يقرؤه المراجعون وحدهم (الغرض الواحد، ومبررات الأذونات، وملاحظات الاختبار) بالإنجليزية للّصق، وتحته معناه بالعربية. وما يراه المستخدمون في [`listing.ar.md`](listing.ar.md).
> **العلامات:** **[قرار]** ينتظر سلطان. و`⟨بعد T7⟩` كانت روابط الموقع قبل نشره، وثُبّتت في §٥ بعد أن أعادت 200 (2026-11-04).

## ١. الغرض الواحد

Chrome («Single purpose description») وEdge («Single Purpose Description»):

<!-- field: reviewer.singlePurpose -->
```text
Tarjuman lets a user watch a YouTube video with subtitles that the user prepares, from any language into their own. On www.youtube.com watch pages it saves the subtitles that the YouTube player already loaded, in whatever language the user picked in the player, as an SRT file, so the user can translate that file outside the extension with a tool of their choice, and then it displays the user's translated SRT file over the same video, with timing adjustment, editing and local per-video storage.
```

المعنى: يتيح للمستخدم مشاهدة فيديو يوتيوب بترجمة يجهّزها هو، من أي لغة إلى لغته. على صفحات المشاهدة يحفظ الترجمة التي جلبها المشغّل، باللغة التي اختارها المستخدم فيه، في ملف SRT ليترجمه خارج الإضافة، ثم يعرض ملفه المترجم فوق الفيديو نفسه، مع ضبط التوقيت والتحرير والحفظ المحلي لكل فيديو.

## ٢. مبررات الأذونات

من `src/manifest.json` (Chromium)، وطبقة Firefox في `scripts/targets.mjs`. ولا إذن غيرها: لا `tabs` ولا `scripting` ولا `webRequest` ولا `host_permissions` إلزامية (`scripts/release/audit.mjs`: `permissions-approved-only` و`no-host-or-optional-permissions`).

<!-- field: reviewer.permission.storage -->
```text
storage: Saves the user's data in the extension's local storage on the device: the user's translations and their languages (up to three per video, plus one previous version), the original subtitle track and export fingerprints used for comparison, review marks, language preferences, and settings. Nothing is synced or sent to the developer.
```

<!-- field: reviewer.permission.unlimitedStorage -->
```text
unlimitedStorage: A saved video keeps full subtitle files (translation and original text with timings). A two-hour video takes about 0.7 MB, so the default 10 MB local quota fills after about fifteen long videos and saving would then fail. The data stays on the device and is removed with the extension. This permission adds no install warning.
```

<!-- field: reviewer.permission.downloads -->
```text
downloads: Saves only the files the user asks for (the original SRT, exported translations, and the backup JSON) to the Downloads folder, a subfolder of it, or a location chosen at each download, according to the user's setting. The extension looks up only the download IDs it created; it does not read, open, rename or delete any other download.
```

<!-- field: reviewer.permission.host -->
```text
Host access (content scripts on https://www.youtube.com/*): Required to add Tarjuman's buttons to the YouTube player, to read a copy of the subtitle response that the YouTube player itself requested when the user turned captions on (a document_start main-world script reads only /api/timedtext responses and makes no request of its own), and to draw the user's subtitles over the video. It also reads, from the player data already on the page, the list of caption languages the video offers (language, kind and name only, no URLs or tokens, no request, no track switching) to show how many other languages exist. It runs on no other site.

Optional host permission https://app-reports.isultantf.workers.dev/*: Requested only when the user presses "Send report" in Settings > About > Report a problem, after a preview of every field that will be sent. It is the developer's problem-report endpoint (HTTPS, one JSON request, no credentials, no automatic retry). If the user declines, nothing is sent. It is not used for anything else.
```

المعنى بالترتيب:
- **التخزين:** حفظ ترجمات المستخدم ولغاتها ومسار الأصل وبصمات التصدير والعلامات وتفضيلات اللغات والإعدادات في تخزين الإضافة على الجهاز، بلا مزامنة ولا إرسال.
- **التخزين غير المحدود:** فيديو بساعتين نحو 0.7 م.ب، فالحد الافتراضي 10 م.ب يمتلئ بنحو خمسة عشر فيديو طويلًا فيفشل الحفظ ([`docs/contracts/storage.md`](../docs/contracts/storage.md) §٥). ولا يضيف تحذير تثبيت (ثبت في P2).
- **التنزيلات:** الملفات التي يطلبها المستخدم وحدها، في المكان الذي يختاره، والاستعلام بمعرّفات ما نزّلته الإضافة وحدها.
- **يوتيوب:** أزرار المشغّل، وقراءة نسخة رد الترجمة الذي طلبه المشغّل بلا طلب جديد، ورسم الترجمة فوق الفيديو. ولا موقع غيره.
- **خادم البلاغات (اختياري):** يُطلب عند أول ضغطة «إرسال البلاغ» بعد المعاينة، وإن رُفض لا يُرسل شيء.

**`web_accessible_resources`:** ملفات الخطوط (`ui/fonts/subtitle/*.woff2` و`ui/fonts/ui/*.woff2`) لـ`www.youtube.com` وحده، بعنوان متغير (`use_dynamic_url`)، لترسم الترجمة وأدوات المشغّل بخطوط مضمّنة دون تحميلها من الشبكة. ليس إذنًا، ويُذكر في ملاحظات المراجعين.

**Firefox — `data_collection_permissions`** (من البيان، فلا حقل لها في نموذج AMO): `required: ["none"]`، و`optional: ["technicalAndInteraction", "browsingActivity"]`. «البيانات التقنية والتفاعل» للبلاغ لأنه يحمل إصدار ترجمان والمتصفح والنظام: يعرضها Firefox وحدها من الاختيارية في نافذة التثبيت، وإن لم تكن ممنوحة تُطلب عند أول إرسال؛ و«نشاط التصفح» تُطلب حين يفعّل المستخدم صور المحفوظات لأنها تُطلب من يوتيوب بمعرّفات الفيديوهات المحفوظة (قرار سلطان، §٥ من [`README.md`](README.md)). ولا يخرج بلاغ إلا حين يضغط المستخدم «إرسال البلاغ»، ولا صورة إلا بالموافقة والمفتاح معًا.

## ٣. الشيفرة البعيدة

Chrome وEdge: **No, I am not using remote code.** الإضافة بصيغة Manifest V3، وكل شيفرتها في الحزمة، ولا `eval` ولا `new Function` ولا سكربت من الشبكة (`audit.mjs`: `no-external-connection-or-forbidden-code`). والطلبان الخارجيان الوحيدان صور `i.ytimg.com` (عنصر `<img>`) والبلاغ (JSON)، ولا يُنفَّذ منهما شيء.

## ٤. إفصاح البيانات

**ما لا يحدث:** لا حساب، ولا قياس استخدام، ولا إعلانات، ولا بيع ولا نقل لغرض آخر. ولا يصل إلى المطوّر إلا البلاغ الذي يرسله المستخدم بنفسه. التفصيل في [`docs/site/privacy.md`](../docs/site/privacy.md) وجدول أدلته.

**Chrome — Data usage** (وEdge «What user data do you plan to collect»، بالفئات نفسها). الفئات بأسمائها الإنجليزية كما في النماذج، وتُطابق نصوصها وقت التقديم لأن صفحتي النماذج الرسميتين لا تسردانها. وصفحة Chrome تقضي بالإفصاح «even when data is processed or stored locally» ([user-data-faq](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)، س3).

| الفئة | تُعلَّم؟ | لماذا |
| --- | --- | --- |
| Website content | **نعم** | يقرأ نص الترجمة الأصلية من رد يوتيوب وعنوان الفيديو وقائمة لغات مساراته من بيانات المشغّل، ويعالجها ويحفظ الأولين على الجهاز. لا يُرسل شيء منها إلى أحد |
| Web history | **نعم** | المحفوظات قائمة بالفيديوهات التي حفظ لها المستخدم ترجمة أو مسارها الأصلي، ومعرّفات فيديوهات غيّر لها زوج اللغات (المعرّف والعنوان والمدة) على الجهاز، وصورها تُطلب من يوتيوب بمعرّفاتها ولها مفتاح يطفئها. وهي الفئة نفسها التي عُدّت بها الصور في Firefox (`browsingActivity`)، فيتسق الإعلان في المتاجر الثلاثة |
| Personal communications | **نعم** | «الإبلاغ عن مشكلة»: الوصف الذي يكتبه المستخدم ويرسله بنفسه إلى المطوّر. يُفصَح عنه احتياطًا لأنه رسالة منه |
| Personally identifiable information | لا | لا اسم ولا بريد ولا معرّف مستخدم أو جهاز، والبلاغ بلا شيء من ذلك |
| Health / Financial and payment information | لا | — |
| Authentication information | لا | لا كلمة مرور ولا رمز. وتنبّه صفحة البلاغ إن بدا في الوصف ما يشبه رمز جلسة |
| Location | لا | لا موقع. وعنوان IP يراه خادم البلاغات وقت الطلب فيحسب منه حد الإرسال ببصمة مملّحة تنتهي بمدتها، ولا يصل إلى البلاغ |
| User activity | لا | لا تتبّع نقرات ولا ضغطات ولا تمرير |

**الإقرارات الثلاثة** (تُعلَّم كلها): لا بيع ولا نقل لطرف ثالث خارج الحالات المعتمدة، ولا استعمال لغير الغرض الواحد، ولا استعمال لتقدير الجدارة الائتمانية أو للإقراض. ويطابقها `#limited-use` في سياسة الخصوصية.

## ٥. الروابط وبيانات التواصل

| الحقل | القيمة | الحالة |
| --- | --- | --- |
| سياسة الخصوصية (المتاجر الثلاثة) | `https://bysltan.com/tarjuman/privacy` | يعمل (200، 2026-11-04، بعد دمج PR ‎#82 في الموقع). المتاجر الثلاثة تطلب رابطًا يعمل |
| الصفحة الرئيسية (Homepage، وEdge «Website»، وAMO «Homepage») | `https://bysltan.com/tarjuman` | يعمل (200، 2026-11-04) |
| الدعم (Support URL، وEdge «Support contact detail»، وAMO «Support website») | `https://bysltan.com/tarjuman/support` | يعمل (200، 2026-11-04)، وهو رابط «الدعم والخصوصية» في «حول» |
| بريد الدعم (AMO «Support email»، وبريد حساب Chrome) | `iSultanBy@gmail.com` | قرار سلطان (§٥ من `README.md`) |
| المستودع | `https://github.com/iSltanX/Tarjuman` | عام: 200 لزائر غير مسجَّل (2026-11-07)، ورابطه في بطاقة «الحقوق» في «حول» منذ 2.0.0. ولا يطلبه حقل في المتاجر الثلاثة |
| صفحة ترجمان في Chrome Web Store (ومنه Brave) | `https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj` | منشورة: 200 لزائر غير مسجَّل (2026-11-09) باسم ترجمان والإصدار `2.1.0`، وتاريخ التحديث 9 نوفمبر 2026. وهي رابط المتجر في `README.md` وصفحة الموقع |
| صفحة ترجمان في Microsoft Edge Add-ons | `https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi` | منشورة: 200 لزائر غير مسجَّل (2026-11-09)، وواجهة المتجر تعيد اسم ترجمان والإصدار `2.1.0` والناشر BySultan. وهي رابط Edge في `README.md` وصفحة الموقع |
| صفحة Firefox Add-ons | — | لا صفحة عامة: لوحة المطوّر تعرض الإضافة «Awaiting Review» (2026-11-09)، وواجهة AMO تعيد 401 للمعرّف `tarjuman@bysltan.com` وللرابط `tarjuman`. وما لم يُنشر «قريبًا» نصًّا بلا رابط في الموقع والوثائق |

## ٦. حقول كل متجر

### Chrome Web Store

| الحقل | القيمة |
| --- | --- |
| الحزمة | `release/store/tarjuman-2.1.1-chrome.zip` |
| الاسم والملخص | من البيان (`listing.ar.md`) |
| الوصف التفصيلي | `chromium.description` في `listing.ar.md` |
| Primary category | Make Chrome Yours › Accessibility (`listing.ar.md` «الفئة») |
| Language | العربية |
| Store icon | `store/icons/chrome-store-icon-128.png` |
| Screenshots | `store/screenshots/chromium/{ar,en}/` الخمس لكل لغة |
| Small promo tile | `store/promo/small-promo-440x280.png` |
| Marquee promo tile | `store/promo/marquee-1400x560.png` |
| YouTube video (لكل لغة) | العربية `https://www.youtube.com/watch?v=OmC8oCZ7z0g`، والإنجليزية `https://www.youtube.com/watch?v=emmPgij1lmk` (قناة BySultan، بطلب سلطان 2026-11-09) |
| Mature content | لا |
| Single purpose، والأذونات، والشيفرة البعيدة، وData usage | §١ إلى §٤ |
| Test instructions | `reviewers.en.md` (`reviewer.chrome`) |
| Visibility والمناطق | Public، وكل المناطق (قرار سلطان) |
| صفة التاجر | غير تاجر (قرار سلطان) |

### Microsoft Edge Add-ons

| الحقل | القيمة |
| --- | --- |
| الحزمة | `release/store/tarjuman-2.1.1-edge.zip` (بايتات حزمة Chrome نفسها، بلا `update_url`) |
| Availability | Public، وكل الأسواق |
| Category | Accessibility (`listing.ar.md`) |
| Website وSupport contact detail | §٥ |
| Mature content | لا |
| Privacy | §١ إلى §٤ |
| Description | `chromium.description` في `listing.ar.md` (لا ذكر لمتصفح آخر، وطوله بين 250 و10,000) |
| Extension logo | `store/icons/edge-logo-300.png` |
| Small / Large promotional tile | `store/promo/small-promo-440x280.png` و`store/promo/marquee-1400x560.png` |
| Screenshots | `store/screenshots/chromium/{ar,en}/` الخمس لكل لغة |
| Search terms | `edge.searchTerms` في `listing.ar.md` |
| Notes for certification | نص مختصر من `reviewers.en.md` (`reviewer.chrome` و`reviewer.edge`) بعيّنة ترجمة محايدة، لأن الحد أقل من 2,000 محرف. وكلمات البحث الإنجليزية مكتوبة في اللوحة مباشرة |

### Firefox Add-ons

| الحقل | القيمة |
| --- | --- |
| ملف الإضافة | `release/store/tarjuman-2.1.1-firefox.zip` |
| التوافق | Firefox للحاسوب وحده، 144 فأحدث (تدقيق 7a66f91، قرار Q08). لا يُختار Firefox for Android، ولا `gecko_android` في البيان |
| شيفرة المصدر | نعم، `release/store/tarjuman-2.1.1-source.zip` وفيه `SOURCE-README.txt`. ويطابق إعادة بنائه الحزمة بايتًا (T4) |
| Name | من البيان |
| Add-on URL | `tarjuman` (`listing.ar.md`) |
| Summary | `en.amo.summary` في `listing.en.md` (AMO بلا لغة عربية، §٨ من `README.md`) |
| Description | `en.amo.description` في `listing.en.md` |
| Categories | Language Support، وPhotos, Music & Videos |
| Tags | `youtube` |
| License | **All Rights Reserved** (`all-rights-reserved`)، مطابقًا لـ`LICENSE` (قرار سلطان في T4) |
| Support email وwebsite وHomepage | §٥ |
| Screenshots | `store/screenshots/firefox/en/` الخمس، بتعليقات إنجليزية |
| Notes for Reviewers | `reviewers.en.md` (`reviewer.amo`، حتى 3,000) |
| Release notes | `amo.releaseNotes` في `listing.ar.md` |

## ٧. ما لا يُقدَّم

لا رابط لا يفتح للعموم، ولا لقطة غير حقيقية، ولا فيديو ترويجي في هذا الإصدار (الحقل اختياري في Chrome وEdge)، ولا وعد لم يثبت سلوكه.
