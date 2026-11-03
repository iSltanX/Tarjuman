# أدلة الهوية «بُنّ على ورق» والوضع العادي الكامل (2026-11-03)

السكربت: [`test/live/identity/run.mjs`](../../../test/live/identity/run.mjs) على بناء تطوير من الفرع `tj/identity-redesign` خارج المستودع، بلا نافذة، بملف تعريف جديد خاص بهذه الجولة لكل متصفح (`<browser>-identity-<وقت>` تحت مجلد ملفات الاختبار، لا ملف جلسة الإصلاحات)، مكتوم الصوت، بحساب يوتيوب غير مسجّل، وببيانات بذرة منفصلة (`test/live/ui/seed.mjs`: أربعة فيديوهات، اثنان بمعرّفين حقيقيين واثنان بمعرّفين غير موجودين). كل فعل نقرة أو عجلة أو مفتاح حقيقي (Input)، ولا رابط ولا نص مقاطع في الأدلة. القرارات والفروق في [`docs/identity-redesign.md`](../../identity-redesign.md).

| المتصفح | النتيجة | الملف |
| --- | --- | --- |
| Brave (Chrome/156.0.8078.80) | **69/69** | [`brave/live.json`](brave/live.json) |
| Chrome 156.0.8078.80 | **69/69** | [`chrome/live.json`](chrome/live.json) |

## ما تحقق

| الجزء | التحقق (معرّف الفحص) |
| --- | --- |
| الهوية | الشعار بالجسد البُنّي والنقطتين الذهبيتين والاسم بالمداد، وورق الصفحة، بالوضعين كما يحسبها المتصفح (`identity-logo-and-paper-light/dark`)؛ وأيقونة الإضافة ببلاطة البُنّ وزوايا شفافة (`extension-icon-coffee-tile-transparent-corners`)؛ والشارة «بياناتك على جهازك» (`identity-badge-truthful`). |
| صور المحفوظات | صورة الفيديو بمعرّفه الحقيقي محمّلة بعرض 320 وبلا مُحيل، وبلاطة أيقونة الفيديو للمعرّف غير الموجود (يعيد يوتيوب صورة رمادية 120 بحالة 404 فلا تُعرض)، والمدة من السجل (`library-thumbnail-*`، `library-duration-is-real`). الطلب الخارجي الوحيد من صفحات الإضافة `i.ytimg.com/vi/<id>/mqdefault.jpg`، أربعة لأربعة صفوف (`library-only-external-request-is-ytimg-thumbnail`). وإطفاء «صور الفيديو» يحوّل الصفوف المفتوحة إلى البلاطة فورًا، وبعد إعادة التحميل صفر طلبات (`library-thumbnails-off-no-requests-fallback-only`). |
| شرائح المحفوظات | شريحة لكل ترجمة موجودة وشريحة متقطّعة للخانة الفارغة (`library-chips-real-slot-and-add-action`)؛ ضغطها يفتح منتقي الملفات فيُختار ملف عربي حقيقي ويُحفظ في الخانة 2 من حوار الرفع ويصير النشط (`library-add-chip-uploads-real-file-into-empty-slot`)؛ وتفعيل الترجمة 1 من شريحتها برسالة «تراجع» والتراجع يعيد السابقة (`library-chip-activates-translation-with-undo`)؛ والتوسيع بطاقة لكل ترجمة وبطاقة متقطّعة واحدة (`library-expansion-*`). |
| الإعدادات والنافذة | المفتاحان مفعّلان افتراضيًا، ونص الخصوصية يذكر طلب الصور (`settings-*`)؛ وصف «زر النص المتزامن مخفي · إظهاره» في النافذة يعيد الزر في تبويب يوتيوب المفتوح، والنتيجة من التخزين (`popup-*`، `youtube-entry-returns-after-popup`). |
| المحرّر | يفتح الترجمة المحفوظة بالهوية؛ والحالة الفارغة «فتح الفيديو» تفتح تبويب الفيديو بلا معامل زمن (`editor-*`). |
| موضع اللوحة | المضيف أول عمود يوتيوب الثانوي، يمين الفيديو بلا تداخل، بارتفاع المشغّل، بلا تجاوز أفقي للصفحة (`panel-host-first-in-youtube-secondary-column`، `panel-entry-right-of-video-not-overlapping`، `panel-open-right-of-video-same-height-no-overlap`). |
| الصفوف والتزامن | صف لكل مقطع عربي (427)، والحالي بزمن الفيديو مع الإزاحة +0.5، والضغط على صف ينقل الفيديو إلى بدايته + الإزاحة، وأزمنة الصفوف تتبع الإزاحة (`panel-rows-*`، `panel-current-row-*`، `panel-click-row-seeks-video`، `panel-row-times-shift-with-offset`). |
| المتابعة | تمرير العجلة يوقفها ويُظهر «العودة إلى ‹الزمن›»، وضغطها يعيد الحالي إلى القائمة (`panel-user-scroll-*`، `panel-return-to-current-*`). |
| الإزاحة المشتركة | «تأخير» في اللوحة يغيّر الإزاحة في المتحكم وشارة الشريط، و− في الشريط يغيّر قيمة اللوحة (`panel-offset-change-reaches-player-bar`، `player-bar-offset-change-reaches-panel`). |
| الأصل | «مع الإنجليزية» باسم لغة الأصل الملتقط فعلًا (`en`)، والصفوف بأسطر الأصل (427) ثم بدونها (0)، والاختيار محفوظ (`panel-dual-*`). |
| الإغلاق والإخفاء | الإغلاق يُبقي الزر، والإخفاء رسالة بتراجع يعيد الزر واللوحة مفتوحة كما كانت، وبعد انقضائها لا زر (`panel-close-*`، `panel-hide-*`، `panel-undo-*`، `panel-hidden-entry-gone-after-message`). |
| الصمود | تنقّل داخل الموقع إلى مقترح (حالة «لا ترجمة» بلا صفوف قديمة ومضيف واحد) ثم الرجوع بالترجمة نفسها والإزاحة نفسها (`panel-follows-new-video-*`، `panel-back-restores-saved-translation`)؛ والعرض 900 (يوتيوب بعمود واحد) تحت الفيديو وبعد صندوق عنوانه بلا تداخل (`panel-narrow-*`)؛ ووضع المسرح تحت الفيديو، والعودة يمينه (`panel-theater-*`، `panel-back-beside-*`)؛ وملء الشاشة يخفيها ثم تعود بصفوفها وإزاحتها (`panel-hidden-in-fullscreen`، `panel-restored-after-fullscreen-without-loss`). |
| الشريط | الأيقونتان بلا كلمات ولا نقاط وبحجم واحد مع − و+ (`player-bar-icons-only-*`، `player-bar-icon-buttons-same-size`)، والاسم في التلميح بالتحويم وبالتركيز (`player-bar-tooltip-on-hover/focus`)، وعنوانا القائمتين «تحميل الأصل» و«الترجمة» (`player-menu-titles`). |
| إعادة الفتح | بعد «إظهاره» من النافذة يُفتح الزر العائد اللوحة بضغطة (`panel-reopens-from-returned-entry`). |
| عام | تشخيص اللوحة بلا رموز إخفاق، وخطوط اللوحة والشريط المضمّنة محمّلة (`panel-diagnostics-no-failure-codes`، `panel-and-bar-bundled-fonts-loaded`)، ولا أخطاء من الإضافة (`no-extension-errors`). |

## ما يُعدّ وحده ولا يُحسب خطأً

- **404 صورة المعرّف غير الموجود** (`measures.extensionNetworkLog.expectedMissingThumb404` = 8): سلوك يوتيوب للمعرّف الغائب، والبلاطة هي السلوك المقصود؛ وأي خطأ شبكة آخر من صفحات الإضافة صفر (`other` = 0).
- **«Unsafe attempt to load URL …/ui/fonts/*.woff2»** (`measures.fontReadLogs` = 12): رسالة المتصفح مع كل قراءة **ناجحة** لخطوط الإضافة على يوتيوب، معروفة من [P6](../P6/README.md) وتُعدّ وحدها كما في [P10](../P10/README.md)؛ والخطوط محمّلة فعلًا (`panel-and-bar-bundled-fonts-loaded`).
- **الإعلان في Chrome** (`measures.adsWaited`): Chrome لا يحجب إعلانات يوتيوب؛ تُترك تعمل مكتومة حتى تنتهي (بنقرة «تخطٍّ» حقيقية إن ظهرت) قبل الفحوص الزمنية، لأن اللوحة لا تحدّث الحالي ولا تقفز أثناء الإعلان (`isAdShowing`).

## الواجهة العربية (قرار سلطان 2026-11-03: يمين الفيديو)

بلغة `ar` يكون تخطيط يوتيوب RTL ويضع عموده الثانوي يسار الفيديو. فيعكس ترجمان تخطيط العمودين كالمرآة ما دامت اللوحة ظاهرة (`measures.arabicInterface`، لقطة `watch-panel-arabic-interface`):

- اللوحة يمين الفيديو مفتوحة بصفوفها كاملة بلا تداخل ولا تجاوز أفقي (`panel-right-of-video-in-arabic-youtube`).
- المعكوس صورة الأصل في الصفحة نفسها: عرض المشغّل، وهامش حافة الفيديو، وهامش حافة العمود، والفاصل بينهما، كلٌّ ضمن 2 بكسل من تخطيط يوتيوب الأصلي (`arabic-youtube-mirror-keeps-player-width-margins-and-gap`، والقيم في `mirroredRow` و`nativeRow`).
- إخفاء الزر يعيد تخطيط يوتيوب كما كان: العمود يسار الفيديو، ولا نمط سطري باقٍ على `#columns` و`#primary` و`#secondary` (`arabic-youtube-restored-when-entry-hidden`).

## اللقطات (في كل مجلد متصفح)

- **يوتيوب:** `watch-panel-open` (اللوحة يمين الفيديو)، و`watch-panel-resume` («العودة إلى»)، و`watch-panel-dual` (مع الأصل)، و`watch-player-menu-translation` (قائمة «الترجمة»)، و`watch-panel-hidden-toast`، و`watch-panel-other-video` (لا ترجمة)، و`watch-panel-narrow` (العمود الواحد)، و`watch-fullscreen`، و`watch-panel-dark`، و`watch-panel-arabic-interface`.
- **الصفحات بالوضعين:** `library-*` (ومنها `library-expanded-*` و`library-upload-dialog-light`)، و`settings-display-*`، و`popup-entry-hidden-*`، و`editor-*` و`editor-empty-light`.

## لم يُتحقق هنا

- **الاعتراض الحي من يوتيوب:** تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فالأصل هنا المحفوظ في البذرة؛ والاعتراض الحي الوحيد بنقرات سلطان (`test/e2e/live/v2/hand.mjs`).
- **الوضع الداكن ليوتيوب نفسه:** يوتيوب غير المسجَّل لم يتبع وضع الجهاز المحاكى، فضُبطت سمة وضعه الداكن `html[dark]` يدويًا (التي تقرؤها اللوحة) ثم أزيلت.
- **حساب مسجَّل، والبث المباشر، وقارئ شاشة حقيقي، وتكبير المتصفح الفعلي:** خارج هذه الجولة؛ أسماء الوصول والتركيز في اختبارات الوحدة.
- **السكربتات الحية السابقة** وُوئمت وشُغّلت بعد هذه الأدلة: [`alignment/`](alignment/README.md).
