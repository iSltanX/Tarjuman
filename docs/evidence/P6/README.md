# أدلة P6 — أدوات شريط المشغّل، وخط الترجمة وحجمها

> 2026-11-02. لا رابط ولا رمز في هذه الأدلة (`check:secrets` يمر عليها). الاختبار الحي بموافقة سلطان: Brave 1.98.60 (Chromium 156.0.8078.48) ثم Chrome 156.0.8078.74، بلا نافذة ومكتوم الصوت، بملف اختبار جديد لكل تشغيل تحت `~/Library/Application Support/Tarjuman-test/` خارج المستودع، وحساب يوتيوب **غير مسجَّل**.

## البروتوكول

- بناء التطوير (`npm run build:dev -- --out <مجلد خارج المستودع>`) يُحمَّل بـ`Extensions.loadUnpacked`، والسكربت [`test/live/controls/run.mjs`](../../../test/live/controls/run.mjs) يشغّل السيناريوهات كلها ويكتب `brave/live.json` و`chrome/live.json` واللقطات.
- **كل فعل على الأدوات نقرة أو ضغطة مستخدم حقيقية** (CDP `Input`) بإحداثيات الأزرار والبنود كما يعيدها `peek()` في بناء التطوير (الأدوات في Shadow DOM مغلق). والقياس بما يراه المستخدم: مواضع الأزرار داخل الشريط وشفافيته، ونص القوائم والرسائل، وسطر الترجمة وخطه وعرضه.
- **الالتقاط:** تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُمرَّر جسم P1 الحقيقي الملتقط للفيديو نفسه (`test/fixtures/json3/manual-ted-iG9CE55wbtY.json`، TED، 427 مقطعًا) إلى المستخرج عبر خطاف التطوير `extractor.handleMessage`، كما فعلت P3. ما بعد الالتقاط كله حقيقي: المتحكم، و`buildExport`، والتنزيل بـBlob، و`readImport` والمقارنة، والتخزين، والطبقة.
- **التنزيلات** إلى مجلد مؤقت (`Browser.setDownloadBehavior`) تُقارَن بايتاتها ببايتات ما يحسبه Node للمدخل نفسه، ثم يُحذف المجلد.
- **الحافظة** تُستبدل في العالم المعزول وحده بدالة تحفظ الطول والبصمة؛ فلا تُمسّ حافظة الجهاز، ويُقارَن المنسوخ ببصمة `buildExport().instructions` في Node.
- **الرفع** بمنتقي ملفات معترض (`Page.setInterceptFileChooserDialog`) يُملأ بملف SRT عربي مشتق من الملف المنزَّل بالترقيم والتوقيت نفسيهما (محاكاة ناتج النموذج)، وملف ثانٍ ينقصه آخر مقطع.
- **بديل الخط:** `--break-font tajawal` يكتب بايتات غير صالحة في ملفي تجوّل داخل مجلد البناء المؤقت وحده، فيُختبر «تعذّر تحميل الخط المختار».

## النتيجة

| المتصفح | الفحوص | ملاحظات |
| --- | --- | --- |
| Brave 1.98.60 | **60/60** | منها فحصان «معلومة» (التقسيم الاحتياطي، والكتابة أثناء التشغيل) |
| Chrome 156.0.8078.74 | **60/60** | من التشغيل الأول |
| الدخان الحي (`test/live/harness/smoke.mjs`، بناء الإنتاج) | **15/15** في المتصفحين | `mount-points-stub`: الطبقة والأدوات `mounted` — [`smoke/brave.json`](smoke/brave.json) و[`smoke/chrome.json`](smoke/chrome.json) |

التفصيل في [`brave/live.json`](brave/live.json) و[`chrome/live.json`](chrome/live.json) (كل فحص بتفاصيله)، واللقطات بجوار كل ملف.

**جولات Brave قبل النهائية** كشفت خللين في المنتج أُصلحا باختبار انحدار لكل منهما، وعيوبًا في الحزام نفسه أُصلحت:

| الجولة | ما ظهر | النوع | ما فُعل |
| --- | --- | --- | --- |
| 1 | رسالة «✓ نُسخت تعليمات الترجمة» تقع فوق آخر بند في القائمة المفتوحة فتأخذ النقر | **منتج** | الرسائل فوق أعلى القائمة ما دامت مفتوحة (`layer.js`، اختبار في `messages.test.js`) |
| 2 | النقطة كُتبت برمز مفتاح Delete؛ وضغط الشارة والقائمة مفتوحة أغلقها | حزام | رموز المفاتيح الصحيحة، وفتح القائمة إن لم تكن مفتوحة |
| 3 | Esc بعد الكتابة في حقل الإزاحة **طبّق** النص نصف المكتوب (+0.1 ث) عبر `change` بعد الإغلاق | **منتج** | الإغلاق إلغاء: الحقلان لا يطبّقان إلا والقائمة مفتوحة (`session.js`، اختبار في `timing.test.js`) |
| 4 | يوتيوب أظهر «Something went wrong» بعد قفزات وتغييرات مقاس كثيرة فلم يظهر سطر يُقاس؛ وقاعدة الشبكة عدّت طلبات يوتيوب طلبات للإضافة | حزام وبيئة | صفحة جديدة بمعامل `t` قبل لقطات الخط؛ وقاعدة P1 (كل إطارات المكدّس من الإضافة) |
| 5 | **60/60** | — | — |

## معايير القبول

| المعيار | الدليل | النتيجة |
| --- | --- | --- |
| P6-AC1 الأدوات في الشريط وحده، تظهر وتختفي معه، وتُعاد بعد إعادة رسمه، في الأوضاع الأربعة دون نقل − و+ أو إخفائهما ولا دفع أدوات يوتيوب | `mounted-first-in-right-controls` (أول `.ytp-right-controls` قبل `ytp-right-controls-left/right` الأصليين) و`five-buttons-ltr-order` و`buttons-inside-youtube-bar` و`tools-hide-with-bar` (شفافية الشريط 0 والطبقة `hidden`) و`tools-return-with-bar` و`reinjected-after-navigation` و`menu-visible-in-fullscreen` و`compact-keeps-all-five` (مشغّل 520 و480 و440 و400px). وقياس الضيق [`brave/narrow.json`](brave/narrow.json) و[`chrome/narrow.json`](chrome/narrow.json): أزرار يوتيوب الظاهرة **هي نفسها** بالمجموعة ودونها في كل عرض من 1000 إلى 400px؛ وعند 520px وأقل يطوي يوتيوب نفسه أدواته اليمنى خلف زره «<» (`ytp-expand-right-bottom-section-button`) بنا ودوننا. آليًا: `mount.test.js` (الانتظار، والإدراج أولًا، وإعادة الإدراج، وإعادة رسم المشغّل، والتنظيف) | ناجح |
| P6-AC2 − و+ بخطوة الإعداد، والشارة بإشارتها، والتلميحات تشرح المعنى | `plus-minus-change-offset-by-step` (+0.5 بعد +،+،−) و`video-time-untouched` و`tooltips-explain-sign`؛ لقطة `ac2-tooltip-plus.png`. آليًا: `group.test.js` و`messages.test.js` | ناجح |
| P6-AC3 قائمة التوقيت من الشارة: إدخال دقيق، وخطوة، وإعادة ضبط، وشرح؛ والحقل لا يمرر الضغطات | `timing-menu-opens-from-badge` و`precise-input-applies` (−2.3) و`invalid-input-not-applied` و`step-choice-applies-to-buttons` و`reset-to-zero` و`esc-closes-and-returns-focus`، و`field-keys-do-not-reach-youtube`: الأرقام والمسافة والأسهم وk وj وl وf وm وt داخل الحقل لم تحرّك الفيديو ولم توقفه ولم تغيّر الصوت أو ملء الشاشة أو المسرح؛ والضابط: «l» خارج الحقل نقل الفيديو 10 ثوانٍ (`notes`). لقطتا `ac3-*.png`. آليًا: `timing.test.js` | ناجح |
| P6-AC4 تدفق التحميل: حالة المسار، والوضع، وتنزيل SRT، ونسخ التعليمات عبر buildExport دون عرضها، ورسالة لكل حالة | `download-menu-before-capture` («فعّل الترجمة (CC) واختر English…») و`capture-accepted-status-line` («English – يدوي، 427 مقطعًا») و`download-normal-bytes-match` (32,411 بايت مطابقة) و`download-long-bytes-match` (28,141) و`fingerprint-saved` و`copy-instructions-from-buildExport` (بصمة المنسوخ = بصمة `buildExport().instructions`) و`instructions-never-displayed` (لا في القائمة ولا الرسائل ولا التلميح ولا الصفحة). معلومة: التقسيم إلى 3 أجزاء نُزّل. لقطات `ac4-*.png`. آليًا: `download.test.js` (والرسائل الخاصة: بث جارٍ، ومسار مرفوض، ومسار تالف، ونقص، وإخفاق البناء والتنزيل والبصمة، والحافظة وبديلها) | ناجح |
| P6-AC5 تدفق الرفع: اختيار، وفحص ومقارنة، وملخص، وعرض، ووضع العرض، واستبدال بتأكيد | `upload-first-file-loads-and-compares` (427 مقطعًا، «مطابق للأصل ✓») و`display-mode-dual` (عربي ثم إنجليزي) و`replace-confirm-shows-new-summary` («مقطع واحد ناقص: 427» وتنبيه التصفير) و`replace-cancel-changes-nothing` و`replace-confirmed-resets-offset-with-notice`. لقطات `ac5-*.png`. آليًا: `upload.test.js` واختبار التكامل | ناجح |
| P6-AC6 الإزاحة ووضع العرض لكل فيديو، ويُستعادان بعد إعادة التحميل والتنقل | `restored-after-reload` (+1.0 والمزدوج) و`restored-notice-shown` («استُعيدت ترجمتك المحفوظة…») و`other-video-starts-clean` و`restored-after-navigating-back`. آليًا: `test/integration/player/player.test.js` على المتحكم والتخزين الحقيقيين | ناجح |
| P6-AC7 لقطات الأوضاع الأربعة: الخمسة في الشريط وحده، وتختفي مع أدوات يوتيوب، بلا أزرار عائمة | `ac7-normal-shown.png` و`ac7-normal-hidden.png` (لا عنصر من ترجمان والشريط مخفي) و`ac7-normal.png` و`ac7-theater.png` و`ac7-fullscreen.png` و`ac7-fullscreen-menu.png` و`ac7-compact.png`، في المتصفحين | ناجح (بصري) |
| P6-AC8 الخط والحجم المحفوظان على الطبقة، وتحديثهما دون إعادة تحميل، والالتفاف داخل 92% فوق الشريط عند 160% | `overlay-uses-font-and-160%` (مركزي، 53px = 4.6% × 725 × 1.6) و`normal-160`/`theater-160`/`fullscreen-160`/`compact-160: wraps-within-92%-and-above-bar` (أطول سطر 890 من 967، و1288 من 1400، و478 من 520 بثلاثة أسطر) و`settings-change-applies-without-reload` (تجوّل 100% دون إعادة تركيب). لقطات `ac7-*-160.png`. آليًا: `text-layout-decision.test.js` و`fonts.test.js` | ناجح |
| P6-AC9 الخطوط من ملفات الإضافة وحدها، والبديل المراعي ثم خط النظام برمز في التشخيص دون رسالة | `font-loaded-from-extension-files` (وزنا مركزي `loaded`، والقراءة `chrome-extension://` بالعنوان المتغير) و`no-external-requests-from-extension` (صفر) و`broken-font-falls-back-to-embedded-almarai` (`CT_FONT_FALLBACK`، والسطر ظاهر، ولا رسالة)؛ لقطة `ac9-fallback-almarai.png`. آليًا: `fonts.test.js` (البيانات لا الرابط، والمرة الواحدة، والبديلان، وإعادة المحاولة بعد إخفاق عابر) | ناجح |
| P6-AC10 − و+ والشارة تغيّر الإزاحة وحدها، ولا عنصر للخط أو الحجم في الشريط | `nudge-changes-offset-only-not-font` (عائلة الخط وحجمه قبل ± وبعده متطابقان، والمظهر كما هو) و`no-font-or-size-control-in-bar` (عنصر واحد لنا بخمسة أزرار). آليًا: `group.test.js` | ناجح |

## حدود الإثبات (صريحة)

- **الالتقاط ممرَّر لا ملتقط:** جسم P1 الحقيقي للفيديو نفسه عبر خطاف التطوير (الالتقاط في MAIN أثبتته P1 في جلسة غير مؤتمتة). وما بعده حقيقي.
- **الحافظة مستبدلة في العالم المعزول:** يثبت أن النص المنسوخ هو ناتج `buildExport` حرفيًا وأنه لا يُعرض؛ وكتابة حافظة الجهاز نفسها (`navigator.clipboard.writeText` ثم البديل) لم تُختبر حيًا حمايةً لحافظة سلطان، واختُبر مسارها بالوحدة.
- **ملء الشاشة بلا نافذة:** عنصر ملء الشاشة `<html>`، والنافذة 1400×950. لم يُجرَّب على شاشة كاملة حقيقية.
- **التنقل:** بنقرة الرابط البرمجية على مقترح (تنقل SPA نفسه وحدثاه) ثم `history.back`، كما في P5.
- **يوتيوب تحت الأتمتة** يُفرغ الفيديو أحيانًا بعد القفز البعيد أو تغيير المقاس («Something went wrong»)؛ فلقطات الخط على صفحة جديدة بمعامل `t`. ظهر ذلك في لقطة `ac7-compact.png` (المقاس 100%) والأزرار سليمة فيها.
- **رسالة المتصفح عند قراءة ملف الخط:** «Unsafe attempt to load URL chrome-extension://…/ui/fonts/subtitle/*.woff2» تظهر في سجل المطوّر مع كل قراءة **ناجحة**، بـ`use_dynamic_url` ودونه وفي المتصفحين ([`font-fetch-diag.json`](font-fetch-diag.json)، والسكربت [`test/live/controls/font-fetch-diag.mjs`](../../../test/live/controls/font-fetch-diag.mjs)): من المتصفح لا من الإضافة، ولا أثر لها على المستخدم. تُعدّ وحدها في الحزام والدخان (`fontReadSecurityLogs` و`notes`).
- **الكتابة في الحقل والفيديو يعمل** (`typing-while-playing`، معلومة): الضغطات معزولة عن يوتيوب فلا يرى نشاطًا، فيُخفي شريطه بعد نحو 3 ثوانٍ دون حركة فأرة، فتختفي القائمة معه (قاعدة المواصفة §٦.٤)، ويبقى التركيز في الحقل والكتابة سليمة، وتعود القائمة بحركة الفأرة. سلوك مقصود يُعرض على سلطان.
- لم يُختبر حساب مسجَّل، ولا بث مباشر حي، ولا PiP (خارج النطاق)، ولا مربع «السماح بتنزيلات متعددة» في نافذة ظاهرة للتقسيم الاحتياطي (يبقى لـP9 كما أوصت P3).

## الملفات

| الملف | المحتوى |
| --- | --- |
| `brave/live.json` · `chrome/live.json` | نتائج الفحوص والقياسات والملاحظات |
| `brave/*.png` · `chrome/*.png` | لقطات الأوضاع الأربعة عند 100% و160%، والقوائم، والبديل |
| `brave/narrow.json` · `chrome/narrow.json` | أزرار يوتيوب الظاهرة بالمجموعة ودونها من 1000 إلى 400px ([`narrow-diag.mjs`](../../../test/live/controls/narrow-diag.mjs)) |
| `font-fetch-diag.json` | تشخيص قراءة ملف الخط بالعنوان المتغير والثابت، بـ`use_dynamic_url` ودونه |
| `smoke/brave.json` · `smoke/chrome.json` | الدخان الحي على بناء الإنتاج |
