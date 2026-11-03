# الهوية «بُنّ على ورق» والوضع العادي الكامل — التصميم والتنفيذ

> **الحالة:** جارية على الفرع `tj/identity-redesign` في worktree مستقل، فوق إصلاحات التدقيق `tj/audit-fixes@78b9210` بقرار سلطان (2026-11-03). لا دمج ولا دفع ولا نشر قبل موافقته.
> **المرجع البصري:** لوحة التصميم «ترجمان — الهوية والشاشات» (claude.ai، لوحاتها في هذا الملف بأسمائها) ونظام التصميم «نظام تصميم ترجمان». ما هنا يحل محل ما يخالفه في [ui-redesign.md](ui-redesign.md) و[ui-polish.md](ui-polish.md).
> **خارج النطاق:** وضع الذكاء الاصطناعي بالمفتاح مؤجّل كاملًا بقرار سلطان؛ لا مزوّدات ولا مفاتيح ولا شاشات له في المنتج.

## ١. قرارات سلطان

| القرار | القيمة | التاريخ |
| --- | --- | --- |
| اللوحة اللونية | «بُنّ على ورق»: ورق دافئ بثلاث طبقات مسطّحة، وإبراز بُنّي واحد، والقرمزي للخطر، ونقطتا الشعار ذهب | 2026-11-03 |
| الشعار | «التاء» المعتمد بشكله دون تعديل؛ الجسد بالإبراز، والنقطتان بالذهب، والاسم بالمداد | 2026-11-01 / 2026-11-03 |
| الخط | Cairo للعناوين، وAlmarai للنص والتسميات | — |
| أيقونات الشريط | السلسلة «ب»: سهم على سطر لتحميل الأصل، وفقاعتا حديث للترجمة، و− و+ والقيمة؛ بلا كلمات ولا صناديق، والاسم عند التحويم والتركيز | 2026-11-03 |
| لوحة النص المتزامن | في الوضع العادي بلا مفتاح؛ **يمين الفيديو** في عمود يوتيوب الثانوي، وزر فتحها يمينًا؛ لا تغطي الفيديو ولا أدواته؛ إزاحة واحدة مشتركة مع المشغّل | 2026-11-03 |
| إغلاق اللوحة وإخفاء زرها | فعلان منفصلان؛ الإخفاء يعود من نافذة الأيقونة أو الإعدادات | 2026-11-03 |
| اللوحة في واجهة يوتيوب العربية (RTL) | يمين الفيديو أيضًا: يعكس ترجمان تخطيط عمودَي يوتيوب كالمرآة ما دامت اللوحة ظاهرة في العمود الثانوي (الفيديو يسارًا بعرضه نفسه، والعمود يمينه، بهامشَي الحافة والفاصل كما في تخطيط يوتيوب)، ويعود تخطيط يوتيوب كما كان حين يُخفى الزر أو في العمود الواحد أو بمغادرة الصفحة | 2026-11-03 |
| صور الفيديو في المحفوظات | تحميل مباشر من `i.ytimg.com` بمعرّف الفيديو الحقيقي، بمفتاح «صور الفيديو» مفعّل افتراضيًا، ونص الخصوصية يقول ذلك | 2026-11-03 |
| الأساس | فوق إصلاحات التدقيق | 2026-11-03 |

**تغييرات على العقود بقرار سلطان** (تُوثَّق في `docs/contracts/` مع التنفيذ):
- `prefs.ui = { thumbnails, panelEntry, panelOpen, panelDual }` (data-model §١٤): تفضيلات الجهاز، ولا تُستعاد من النسخة الاحتياطية.
- `mountPanel(controller)` نقطة تركيب ثالثة في `src/content/main.js` (interfaces §٤).
- صفحة المحفوظات تطلب صور `https://i.ytimg.com/vi/<id>/mqdefault.jpg` وحدها، حين `prefs.ui.thumbnails`، دون صلاحية جديدة (الصفحات بلا CSP لـ`img-src`). استثناء مسمّى في `check-static` واختبار «لا شبكة».

## ٢. الهوية

- **الرموز** في `src/ui/tokens.css` (الصفحات) و`src/ui/player-tokens.js` (المشغّل واللوحة). القيم في نظام التصميم، والنسب محسوبة: الأساسي ≥ 12:1، والثانوي ≥ 7:1، والخافت ≥ 4.5:1 على كل سطح بالوضعين، وحد الحقل ≥ 3:1.
- **الطبقات مسطّحة**: الصفحة `tj-bg`، والبطاقة `tj-surface`، والغائر `tj-surface-2`؛ تفصلها النغمة وخط `tj-border`. لا ظل إلا خط حافة للقوائم (`tj-e2`) وظل الحوار (`tj-e3`).
- **الإبراز** للإجراء الرئيسي والتحديد والمقطع الحالي والروابط والتركيز وحدها. **المعيّن** (نقطة التاء) نقطة الشارة والانشغال ومؤشر اللحظة؛ لا دوائر لهذه الأدوار.
- **الزوايا** 4/6/10/14، و**التحكم** 32/36/40، والشريط العلوي 56.
- **المشغّل داكن بالوضعين**؛ واللوحة الجانبية تتبع وضع يوتيوب (`html[dark]`).

## ٣. جرد التصميم مقابل المنتج

كل إضافة في التصميم بتنفيذها واختبارها. «الحي» فحوص `test/live/identity/run.mjs` بأسمائها في `docs/evidence/identity/<browser>/live.json`.

| اللوحة | الإضافة | التنفيذ | اختبار الوحدة والتكامل | الحي |
| --- | --- | --- | --- | --- |
| Main · ColorCoffee | لوحة «بُنّ على ورق» بالوضعين، والشعار بثلاثة ألوان، وأيقونات الإضافة | `src/ui/tokens.css` و`player-tokens.js` و`logo.js` و`components.css` و`src/icons/*` | `model/ui-format`، `pages/*/identity-css`، `panel/tokens` (مطابقة رموز اللوحة لـtokens.css) | `identity-logo-and-paper-light/dark`، `extension-icon-coffee-tile-transparent-corners` |
| Popup · Settings | الشارة الصادقة «بياناتك على جهازك» | `ui/components.js`، `popup/main.js` | `pages/settings/ui-prefs` («حول») | `identity-badge-truthful`، `settings-privacy-line-matches-behavior` |
| PlayerIcons | السلسلة «ب» أيقونات بلا كلمات ولا نقاط، بحجم واحد، والاسم بالتحويم والتركيز | `player/controls/icons.js` و`group.js` و`session.js` | `controls/group`، `controls/*-v2`، `integration/player/*` | `player-bar-icons-only-no-words-no-dots`، `player-bar-icon-buttons-same-size`، `player-bar-tooltip-on-hover/focus` |
| PlayerMenus · PlayerMenuStates | «تحميل الأصل» و«الترجمة»، واسم لغة الأصل الحقيقي، ونص «الأصل غير ملتقط» | `player/controls/menus.js` و`text.js`، `src/ui/lang.js` | `controls/download`، `controls/display-v2`، `ui/lang` | `player-menu-titles` |
| WatchPanel · WatchPanelDark | لوحة النص المتزامن يمين الفيديو في عمود يوتيوب، بلا تغطية، بارتفاع المشغّل | `src/player/panel/**`، `content/main.js` | `panel/mount`، `panel/states`، `panel/rows`، `panel/footer`، `panel/behavior` | `panel-host-first-in-youtube-secondary-column`، `panel-entry-right-of-video-not-overlapping`، `panel-open-right-of-video-same-height-no-overlap`، `panel-dark-follows-youtube-theme` |
| WatchPanel | الصفوف بأزمنتها (البداية + الإزاحة) والحالي والضغط للانتقال | `panel/transcript.js` و`session.js` | `panel/rows` | `panel-rows-equal-arabic-cues`، `panel-current-row-follows-video-time-with-offset`، `panel-click-row-seeks-video`، `panel-row-times-shift-with-offset` |
| WatchPanel | المتابعة وإيقافها بالتمرير و«العودة إلى» | `panel/follow.js` | `panel/rows` (ومنها L2) | `panel-user-scroll-pauses-follow-and-offers-return`، `panel-return-to-current-resumes-follow` |
| WatchPanel | الإزاحة الواحدة المشتركة مع الشريط | `panel/session.js` ← `controller.nudgeOffset` | `panel/footer` | `panel-offset-change-reaches-player-bar`، `player-bar-offset-change-reaches-panel` |
| WatchPanel | الأصل مع الترجمة باسم لغته، ومعطّل بسببه بلا أصل | `panel/model.js` و`view.js` | `panel/states`، `panel/model` | `panel-dual-names-real-original-language`، `panel-dual-shows-original-lines-and-hides-them`، `panel-dual-choice-saved` |
| PanelStates | الإغلاق يُبقي الزر؛ والإخفاء فعل منفصل بتراجع؛ والعودة من النافذة أو الإعدادات | `panel/session.js`، `popup/entry.js`، `settings/view.js` | `panel/states` (ومنها L3/L10)، `popup/view`، `settings/ui-prefs` | `panel-close-keeps-entry`، `panel-hide-shows-undo-message`، `panel-undo-restores-entry-and-open-panel`، `panel-hidden-entry-gone-after-message`، `popup-shows-hidden-entry-row`، `popup-show-entry-saves-and-reports-real-result`، `youtube-entry-returns-after-popup` |
| PanelStates | الحالات: تحميل، ولا ترجمة (خطوات)، وخطأ بعنوان محايد، وعمود ضيق | `panel/view.js` و`text.js` | `panel/states` | `panel-follows-new-video-without-stale-rows` (حالة «لا ترجمة» حيًا) |
| WatchPanel | اللوحة يمين الفيديو في واجهة يوتيوب العربية أيضًا (تبديل العمودين ما دامت ظاهرة، والفيديو بعرضه) | `panel/column.js` (`createColumnMirror`) و`session.js` | `panel/mount` (المرآة بقيم يوتيوب، والاستعادة عند الإخفاء وLTR والعمود الواحد والإزالة، وإعادة القراءة بتغيّر التخطيط) | `panel-right-of-video-in-arabic-youtube`، `arabic-youtube-mirror-keeps-player-width-margins-and-gap`، `arabic-youtube-restored-when-entry-hidden` |
| WatchNarrow | العرض الضيق تحت الفيديو، ووضع المسرح، وملء الشاشة، والتنقل | `panel/column.js` (العمود الواحد ← `#below`)، `panel/index.js` | `panel/mount`، `panel/behavior` | `panel-narrow-goes-below-video-no-overlap`، `panel-theater-mode-below-video`، `panel-back-beside-video-after-resize-and-theater`، `panel-hidden-in-fullscreen`، `panel-restored-after-fullscreen-without-loss`، `panel-back-restores-saved-translation` |
| Library | صورة الفيديو بمعرّفه الحقيقي، والبديلة للغائب، والمدة الحقيقية، والطلب الوحيد بلا مُحيل | `pages/library/thumb.js` و`view.js` | `library/thumb`، `library/thumb-static`، `library/row` (ومنها L9)، `settings/no-network` | `library-thumbnail-real-video-id`، `library-thumbnail-fallback-for-missing-video`، `library-duration-is-real`، `library-only-external-request-is-ytimg-thumbnail` |
| Library · Settings | مفتاح «صور الفيديو» يوقف الطلبات فورًا | `settings/view.js`، `library/view.js` | `settings/ui-prefs`، `library/row` | `settings-thumbnails-off-saved`، `library-thumbnails-off-no-requests-fallback-only`، `settings-thumbnails-back-on` |
| Library | شرائح الترجمات الموجودة (أزرار تبديل) وشريحة الرفع للخانة الفارغة، والتوسيع في الصف | `library/view.js` و`expand.js` | `library/v2` (ومنها H1)، `library/view`، `integration/backup` | `library-chips-real-slot-and-add-action`، `library-add-chip-uploads-real-file-into-empty-slot`، `library-chip-activates-translation-with-undo`، `library-expansion-one-card-per-translation-plus-one-empty`، `library-no-translation-state-is-clear` |
| Settings | «زر النص المتزامن» و«صور الفيديو» | `settings/view.js` | `settings/ui-prefs` | `settings-ui-switches-on-by-default` |
| Editor · EditorStates | الهوية، و«فتح الفيديو» بلا قفز زمني | `pages/editor/editor.css` و`app.js`، `ui/seek.js` (`openVideo`) | `editor/identity`، `ui/seek` | لقطات المحرّر ليست في هذه الجولة الحية (سبقتها جولة الصقل) |
| AIProposal | — | **مؤجّل**؛ لا يُنفَّذ ولا يُعرض في المنتج | لا شيء من الذكاء الاصطناعي في الشيفرة (المراجعة المستقلة) | — |

## ٤. لوحة النص المتزامن (الوضع العادي)

**المكان:** أول عنصر في عمود يوتيوب الثانوي (`#secondary-inner` أو `#secondary` في `ytd-watch-flexy`)، فتكون يمين الفيديو في التخطيط العريض، وتحته في وضع المسرح كما يضع يوتيوب عموده. وفي **تخطيط العمود الواحد** (العرض الضيق، `ytd-watch-flexy[is-single-column]`، أضيق من 1000 تقريبًا) يُخفي يوتيوب العمود الثانوي كله وينقل مقترحاته تحت الفيديو، فتنتقل اللوحة إلى `#below` بعد صندوق بيانات الفيديو (الصندوق الذي فيه `ytd-watch-metadata`: العنوان والقناة والوصف) وقبل المقترحات، كما في لوحة WatchNarrow، وتعود إلى العمود بعودة العمودين بالجلسة نفسها. وفي **واجهة يوتيوب العربية** (اتجاه `#columns` المحسوب RTL) يضع يوتيوب عموده يسار الفيديو، فيعكس ترجمان تخطيط العمودين كالمرآة ما دامت اللوحة ظاهرة فيه: `flex-direction: row-reverse` على `#columns`، ويتبادل `#primary` و`#secondary` حشوَيهما وهامشَيهما الأيمن والأيسر كما حسبها يوتيوب، فيكون التخطيط صورة الأصل المعكوسة بالمقاسات نفسها (الفيديو بعرضه، وهامش الحافة، والفاصل). أنماط سطرية على العناصر الثلاثة وحدها تُستعاد قيمها السابقة كما كانت حين لا حاجة، وتُعاد قراءتها إن غيّر يوتيوب تخطيطه (`column.js` `createColumnMirror`). لا تغطي الفيديو ولا أدواته. ارتفاعها بارتفاع المشغّل في العريض، وحدّ أقصى تحته. تُخفى في ملء الشاشة، وخارج صفحات `/watch`.

**الزر:** شريط في رأس العمود حين تكون مغلقة: الرمز، و«النص المتزامن»، وقيمة الإزاحة إن خالفت الصفر. `aria-expanded`.

**المحتوى:**
- الرأس: الرمز، و«النص المتزامن»، وقائمة «خيارات اللوحة» فيها «إخفاء زر اللوحة» بسطر شرح، وزر الإغلاق.
- سطر الحالة: «متزامن · الترجمة N «اسم» · M مقطعًا».
- «العربية وحدها / مع ‹لغة الأصل›»: اسم اللغة من مسار الأصل الفعلي (`english.lang` باسمه العربي من `Intl.DisplayNames`)؛ ومعطّل بسببه حين لا أصل. ومفتاح «متابعة التشغيل».
- الصفوف: زمن المقطع (بداية المقطع + الإزاحة)، والعربي، والأصل تحته إن طُلب وتوفر (بتداخل الزمن). الحالي بخلفية الإبراز الخفيفة ومعيّن ومسار تقدّم؛ الماضي أخفت. الضغط على الزمن أو الصف ينقل الفيديو إلى موضعه.
- التتبّع: يتبع الحالي ما دام «متابعة التشغيل» مفعّلًا؛ تمرير المستخدم يوقفه ويُظهر «العودة إلى ‹الزمن›» الذي يعيده.
- التذييل: «توقيت الترجمة · مشترك مع أزرار المشغّل»، وتصفير، و− والقيمة و+ (`controller.nudgeOffset` و`resetOffset`)، والخطوة. **الإزاحة واحدة**: ما يُغيَّر هنا يظهر في الشريط والترجمة، والعكس.
- الحالات: جارٍ التحميل (هيكل)، ولا ترجمة عربية (خطوات تدل على زرّي الشريط دون تكرارهما)، وخطأ (ما حدث وإعادة المحاولة)، وعمود ضيق (تسميات مختصرة)، والزر مخفي (رسالة بتراجع 6 ثوانٍ).

**الإغلاق والإخفاء:** الإغلاق `prefs.ui.panelOpen=false` ويبقى الزر. الإخفاء `prefs.ui.panelEntry=false` ويزيل الزر من كل صفحات الفيديو، ويعود من نافذة الأيقونة («زر النص المتزامن مخفي · إظهاره») أو الإعدادات («زر النص المتزامن»).

**الصمود:** تبديل الفيديو والتنقل داخل الموقع (`yt-navigate-finish`)، وتبديل الخانة، وتغيير العرض، وملء الشاشة، وإعادة رسم يوتيوب للعمود؛ دون فقد بيانات ولا تعطيل المشغّل. الإخفاق رمز في `diagnostics` ولا يرمي.

## ٥. المحفوظات

- **الصورة:** `<img loading="lazy" referrerpolicy="no-referrer" src="https://i.ytimg.com/vi/<id>/mqdefault.jpg">` بمعرّف الفيديو المحفوظ وحده، حين `prefs.ui.thumbnails`. عند الخطأ أو الإطفاء: بلاطة بأيقونة الفيديو لا توهم بأنها صورة. الذاكرة المؤقتة ذاكرة المتصفح؛ لا تخزين في الإضافة.
- **المدة:** `record.durationMs` إن عُرف، وإلا لا شيء.
- **الصف:** الصورة، والعنوان، والمعرّف والتاريخ وعدد المقاطع، وشارة الحالة، وعمود «الترجمات» بشريحة لكل ترجمة موجودة (الرقم والاسم المختصر، والنشطة بالإبراز) وشريحة متقطّعة للخانة الفارغة التالية **إجراءً للرفع**؛ والأفعال: تحرير، وفتح الفيديو، والتوسيع، والمزيد.
- **التوسيع في الصف** يحل محل لوحة «الترجمات…» الجانبية: بطاقة لكل ترجمة موجودة (الملف، والتاريخ والتعديلات والإزاحة، ونتيجة المقارنة، والنسخة السابقة واستعادتها، وتفعيل، وتصدير SRT، وملف بديل، وحذف، والاسم المختصر)، وبطاقة متقطّعة واحدة للخانة الفارغة بزر رفع.
- **التجميع بالتاريخ** (اليوم، هذا الأسبوع، أقدم) حين الترتيب «آخر تعديل».

## ٦. ما بقي أو تعذّر

### ٦.١ قرارات معلّقة لسلطان (لم يُخترع لها سلوك)

| البند | الحال الآن | ما يلزم |
| --- | --- | --- |
| «تصدير الحالية أولًا» و«تصدير الكل أولًا» في حواري الاستبدال والحذف | في لوحة LibraryDialogs موسومة «غير منفّذ (قرار معلّق)»؛ المنتج يصدّر من «المزيد» وبطاقة كل ترجمة. | قرار: يُضافان إلى الحوارين أم يُحذفان من التصميم. |
| اسم ملف تصدير ترجمة غير نشطة | كل الخانات تُصدَّر باسم `VIDEOID.ar.srt` المتفق عليه، فيلتبس تصدير خانتين. | قرار تسمية (مثل `VIDEOID.ar.2.srt`) يمس عقد الاستيراد بالاسم. |
| المدة في `IndexEntry` | المدة تُقرأ من سجل الفيديو كسولًا لكل صف ظاهر (`store.getVideo`). | قرار عقدي: إضافة `durationMs` إلى الملخّص فتُقرأ دون السجل. |
| تشخيص اللوحة في تقرير الصفحة | `messages.js` مجمَّد بالعقد، فلا يظهر `mounted.panel` في تقرير نافذة الأيقونة (يظهر في بناء التطوير وحده)، ورمزا `PL_MOUNT_FAILED`/`PL_RENDER_FAILED` مشتركان مع الطبقة برسالة «طبقة الترجمة». | قرار عقدي: حقل للوحة في الرد ورمزان خاصان بها. |
| «إضافته من الإنجليزية» في المحرّر | في لوحة Editor (مقطع ناقص)؛ غير منفّذ. | قرار: يُنفَّذ أم يُحذف من التصميم. |
| النقطة الذهبية في شريط «غير محفوظ» بالمحرّر | الذهب لنقطتي الشعار وحدهما في الهوية؛ هنا استُعمل للحالة. | قرار: يُسمح أم يُستبدل بالإبراز. |
| ترتيب التركيز في المحرّر تحت 900 | `order:-1` يغيّر الترتيب البصري لا ترتيب التركيز (سلوك سابق لهذه الجولة). | قرار تخطيط. |
| «العربية فوق الإنجليزية» الثابتة في نافذة الأيقونة والإعدادات والنص الدراسي | سابقة لهذه الجولة وموافقة لنطاق المنتج (الاستخراج إنجليزي)؛ اللوحة والشريط يسمّيان لغة الأصل الفعلية. | قرار: تعميم «فوق الأصل» أم الإبقاء. |

### ٦.٢ ما وُوئم في اللوحات على المنتج (لا قرار جديد)

قائمة خيارات اللوحة ببند واحد («إخفاء زر اللوحة»)، وخطأ اللوحة بلا «نسخ تقرير التشخيص»، وتذييلها بلا «مزامنة بجملة…» (هي في قائمة التوقيت بالشريط)، و«رجوع» نصًّا في مزامنة الجملة، و«لا مسار ملتقط» بنص المنتج ورابط «لماذا؟» بلا أزرار، وقائمة «المزيد» بلا «الترجمات…»، والشارة «بياناتك على جهازك» بدل «محلي بالكامل»، والسلسلة «ب» «المعتمدة».

### ٦.٣ ما يحتاج مواءمة قبل الدمج

- **سكربتات حية سابقة** (`test/live/pages/p13.mjs` و`test/live/polish/run.mjs` و`test/live/ui/run.mjs` و`test/live/editor/v2.mjs`) تستهدف لوحة «الترجمات…» المحذوفة ومحدد `.tj-slots` في المحفوظات؛ تفشل إن أعيد تشغيلها كما هي. يغطي `test/live/identity/run.mjs` المحفوظات الجديدة حيًا، واختبارات الوحدة تغطي التوسيع كاملًا (الاستعادة والتسمية والحذف والتصدير)؛ ومواءمتها مهمة الدمج.
- ديون صغيرة: أيقونات محلية مكررة في الصفحات لم تُرفع إلى `src/ui/icons.js`، واللوحة تستورد `parseSeconds` من `controls/text.js` والنافذة `relativeTime` من `library/model.js`، وثابت خطوة الإزاحة مكرر بين اللوحة والشريط.
