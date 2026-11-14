# عقد الواجهات وحدود الوحدات

> **مثبّت في P2 (2026-11-01)، ووسّعته P10 للإصدار الثاني (2026-11-02) ثم جُمِّد.** يحدد أين يعيش كل شيء ومن يملكه وما يستدعيه، فتعمل W3 (P3 وP4 وP5) ثم W4 (P6 وP7 وP8)، ثم W7 (P12 وP13 وP14)، بالتوازي **دون لمس أي ملف مشترك**. §٠–§١١ للإصدار الأول وتبقى صحيحة، و§١٢–§١٨ إضافات الثاني. التوقيعات هنا مطابقة للشيفرة؛ وأي حاجة إلى تغييرها تغيير عقد (المرحلة متعطلة حتى يحسمه المنسّق على `main`).

## ٠. بنية الشيفرة والملكية بعد P2

```text
src/
  manifest.json                    مشترك (مجمَّد): كل نقاط الدخول والأذونات، وأوامر الاختصارات بلا مفاتيح (الفكرة ١٠، §١٣)
  main-world/capture.js            مجمَّد (P1): الالتقاط في MAIN
  content/{main,bridge,controller,messages}.js   مشترك (مجمَّد)
  extract/                         P3 — index.js واجهة ExtractorAdapter (§٢)
  core/
    model/                         مشترك (مجمَّد): البنى والمدققات والتوقيت والانتقالات والرسائل
    store/                         مشترك (مجمَّد): التخزين
    errors/index.js                مشترك؛ ولكل مرحلة ملف مجالها (errors.md)
    diagnostics/                   مشترك: المنقّي وتقرير التشخيص
    convert/                       P3      srt/  P4      export/  P3      import/ compare/  P4      edit/  P8
  player/
    youtube-dom.js                 مشترك: كل محددات يوتيوب (§٧)
    overlay/ sync/ watch/          P5 (overlay/index.js نقطة التركيب §٣)
    controls/                      P6 (controls/index.js نقطة التركيب §٣)
  pages/popup/ library/ settings/  P7       pages/editor/  P8
  ui/                              مشترك: رموز التصميم والمكوّنات والصيغ (§٩)
test/
  helpers/                         مشترك: محاكاة chrome.storage، وعينات العقد، ومستخرج وهمي
  live/harness/                    مشترك: الحزام الحي والدخان
  unit/<المجال>/  integration/<المجال>/  live/<المجال>/   لكل مرحلة مجلداتها (plan.json)
```

**القراءة مسموحة للجميع، والكتابة للمالك وحده.** الاستيراد من وحدة مرحلة أخرى قراءة: مسموح بالتوقيعات المذكورة هنا فقط.

## ١. المتحكم — `src/content/controller.js` (مجمَّد)

مصدر الحالة الوحيد في صفحة يوتيوب. الطبقة والأدوات تقرآن حالته وتشتركان في تغيّرها، ولا تكتبان في التخزين إلا عبر أفعاله.

```js
const controller = createController({ store, extractor, page: { title, durationMs }, now })

controller.getState()            // ControllerState مجمَّدة؛ لا تُعدَّل
controller.subscribe(fn)         // fn(state) عند كل تغيّر؛ يعيد دالة إلغاء
controller.diagnostics()         // أعداد ورموز: الكتابات الجارية، وإخفاقات المشتركين وآخرها، وتشخيص المستخرج
```

حالة الإصدار الثاني وأفعاله في §١٢؛ وكل ما هنا باقٍ بمعناه وتوقيعه. والمتحكم مجمَّد: كل فعل جديد فيه سطر في §١٢ بقراره، وآخرها `editCueText` (الفكرة ٦، ح-54).

كل مشترك يُبلَّغ على حدة: استثناء في مشترك (الطبقة مثلًا) لا يوقف المتحكم ولا يحرم غيره (الأدوات)، ويُعدّ في `diagnostics()`. وقد يصل أكثر من إشعار للتغيّر الواحد؛ والمشترك يقرأ الحالة الأخيرة ولا يفترض عددًا.

**الحالة `ControllerState`:**

| الحقل | المعنى | يستعمله |
| --- | --- | --- |
| `videoId`، `title`، `durationMs` | الفيديو المعروض (من العنوان عبر `youtube-dom`). **المصدر الوحيد لمعرّف الفيديو الحالي.** | الكل |
| `loading` | سجل الفيديو يُقرأ من التخزين. | P5، P6 |
| `saved` | `VideoRecord` كما خُزّن أو `null`. | P6 |
| `arabic` | `{ cues, edited, fileName, comparison }` أو `null`؛ `cues = current ?? original`. **مرجع `cues` ثابت** ما لم يتغير مصدره (`importedAt` و`editedAt`)، ولو حُفظت الإزاحة أو الوضع. | P5، P6 |
| `english` | للوضع المزدوج: `{ key, kind, lang, cues, source: "captured" \| "saved" }` أو `null`؛ الملتقط أولًا واليدوي قبل التلقائي. مرجع `cues` ثابت ما لم يتغير المسار (`key` و`capturedAt`). | P5 |
| `captured` | `TrackInfo[]` مسارات هذه الجلسة للفيديو الحالي (§٢). | P6 |
| `captureIssue` | آخر رفض يخص الفيديو الحالي `{ code, at }` (مثل `EX_NOT_ENGLISH`)؛ رفض فيديو آخر أو معاينة لا يظهر. | P6 |
| `view` | `{ displayOffsetMs, displayMode }`. | P5، P6 |
| `settings` | `Settings` كاملة (المظهر للطبقة، والخطوة والتصدير للأدوات). | P5، P6 |
| `notice` | `{ code, tone, at }` أو `null`: `ST_RESTORED` عند العودة إلى فيديو محفوظ، و`ST_OFFSET_RESET` بعد استيراد صفّر إزاحة. تعرضه الأدوات رسالة عابرة ثم `dismissNotice()`. | P6 |
| `error` | `{ code, message, detail }` لخطأ خلفي (قراءة أو حفظ)، أو `null`. | P6 |
| `version` | يزيد مع كل تغيّر. | — |

**الأفعال** (كلها تعيد وعدًا إلا المذكور):

| الفعل | القاعدة | الأخطاء المرمية |
| --- | --- | --- |
| `nudgeOffset(1 \| -1)` | ± بخطوة الإعدادات (عقد التوقيت §٢). الحالة تتغير فورًا، والحفظ إن وُجد سجل. **أثناء `loading` لا أثر لأفعال العرض الأربعة** (الأدوات تعطّلها حتى يكتمل). | `RangeError` لاتجاه آخر (متزامن) |
| `setOffset(ms)`، `resetOffset()` | الإدخال الدقيق وإعادة الضبط (شبكة 100ms، ±10 دقائق). | — |
| `setDisplayMode("ar" \| "dual" \| "off")` | يُحفظ لكل فيديو. | `MD_INVALID` (متزامن) |
| `loadArabic(input, { replace })` | `input = { fileName, cues, comparison, fingerprintId, notes }` من تدفق الاستيراد (§٦). يصفّر الإزاحة بإشعار، ويحفظ المسار الملتقط مرجعًا إن لم يكن محفوظًا. | `ST_ARABIC_EXISTS` دون `replace`، `MD_INVALID`، `ST_*` |
| `recordExport({ trackKey, fingerprint })` | بعد تنزيل SRT إنجليزي: يحفظ المسار بوضعه العادي كما استُخرج والبصمة. لا إزاحة فيه. | `EX_NO_TRACK`، `MD_INVALID`، `ST_*` |
| `recordSavedExport({ trackKey, fingerprint })` → `{ stored }` | بعد «تنزيل المحفوظ» من المشغّل بلا التقاط (تدقيق Fable، FA-17، بقرار سلطان 2026-11-07): يحفظ البصمة إن لم تكن بصمة التصدير نفسه محفوظة (`sameExport`)، والمسار المحفوظ كما هو. | `EX_NO_TRACK`، `ST_*` |
| `convertCaptured(key, { mode })` | مقاطع مسار ملتقط بوضع التصدير (متزامن) — `ConvertResult` (§٢). | — |
| `updateSettings(patch)` | مثل اختيار الخطوة من قائمة الشارة. | `MD_INVALID`، `ST_*` |
| `dismissNotice()` | متزامن. | — |
| `reload()` | يعيد قراءة سجل الفيديو الحالي. | — |

`start(videoId)` و`setVideo(id)` و`handleStoreChange(change)` يستدعيها `main.js` وحده. تبديل الفيديو يمسح الحالة **ومسارات المستخرج معًا قبل أي إشعار** (`setVideo` يستدعي `extractor.setVideo`)، فلا يظهر شيء من السابق (والصفحة بلا فيديو تحجب مسارات آخر فيديو ولا تمسحها، فتعود بالعودة إليه: تحقق Gemini، `Y4-أ`)، ثم يحمّل سجل الجديد؛ ونتيجة تحميل قديمة تُهمل، وكتابة تمت أثناء التحميل تُقرأ بعده. وإن تبدّل الفيديو أثناء تحميل الإعدادات في `start` فالأحدث يبقى. وعنوان المستند ومدة عنصر الفيديو لحظة التبديل للصفحة السابقة (يوتيوب يغيّرهما بعد الرابط)، فـ`title` و`durationMs` في الحالة وفي كتابات `loadArabic` و`recordExport` و`recordSavedExport` و`loadArabicInto` يكون كلٌّ منهما `null` ما بقي هو نفسه؛ إلا في فيديو الصفحة الأول، والعودة إلى فيديو عُرفت له هذه القيمة، وقيمة تخالف المعروفة للسابق. ولا يُكتب في سجل فيديو عنوانُ غيره ولا مدته إن تبدّل المعروض أثناء الكتابة (تحقق Gemini، `Y3`).

## ٢. المستخرج — `src/extract/index.js` (P3)

أنشأته P2 رقيقًا فوق وحدات P1 بطلب مسجّل، وتملكه P3: تغيّر ما خلفه كما تشاء وتحفظ هذه التوقيعات لأن `main.js` والمتحكم مجمَّدان.

```js
const extractor = createExtractor({ currentVideoId: () => id | null, durationMs: () => ms | null, isLive: () => bool, now? })

extractor.handleMessage(data)        // بيانات MAIN الخام → { accepted: boolean, code: string | null }؛ يتحقق من البنية ثم القبول
extractor.setVideo(videoId)          // عند التنقل إلى فيديو: يفرّغ ما لا يخصه، ويعيد تقييم ما انتظر له (2000ms)؛ وnull يحجب مسارات آخر فيديو ولا يفرّغها (Y4-أ)
extractor.tracks()                   // TrackInfo[] للفيديو الحالي
extractor.convert(key, { mode })     // ConvertResult؛ نسخة مستقلة كل مرة
extractor.lastRejection()            // { code, reason, format, at, videoId } | null — ما يخص المستخدم فقط؛ reason من REASONS، وformat هو srv3 أو vtt لرفض الصيغة وإلا null (الفكرة ٤)
extractor.subscribe(fn)              // fn() عند أي تغيّر، وعند كل قائمة مسارات للفيديو الحالي (Y3)؛ يعيد دالة إلغاء
extractor.diagnostics()              // أعداد ورموز فقط، بلا جسم ولا نص ولا رابط؛ ولكل مسار reason وrolling وstats وconverter، ولكل رفض reason (الفكرة ٤-ب)
extractor.setCompleteness(ratio)     // عتبة EX_MAYBE_INCOMPLETE من الإعدادات (0.5..1، وغير الصالح 0.85)؛ المتحكم يمرّرها (تدقيق 7a66f91، U37)

TrackInfo = { key: "en|manual", lang, kind, capturedAt: "ISO", ok, code, warnings: string[], cueCount, completeness, lastEndMs }
ConvertResult = { ok, code, key, lang, kind, mode: "normal" | "long", cues: Cue[], warnings: string[], report }
```

- `mode: "long"` («مقاطع أطول») نفّذته P3 في W3. الوضعان تحت الثوابت نفسها.
- **تدقيق 7a66f91 (C4):** المتحكم يستدعي `setCompleteness` عند كل إعدادات جديدة (البدء، و`updateSettings`، وتغيّرها من سياق آخر)، و`main.js` بلا تغيير. والتقاط لا يُحوَّل لا يحل محل التقاط سليم للمفتاح نفسه، بل يُعاد `{ accepted: false, code }` ويُسجَّل في `diagnostics().recentRejections` (U32)، إلا فشل الحدود وحده (`EX_BEYOND_DURATION`) فيتبع المدة اللحظية ويحل الأحدث محل السابق كما كان. ومخزن الالتقاط مالك الأجسام، وما يُطرد من الخانات (فوق ثمانية، أو فوق حد إجمالي `MAX_CAPTURED_CHARS` = ضعف حد الرسالة) يُحرَّر منه، والأحدث يبقى دائمًا؛ و`diagnostics().accepted` عدد المحتفظ به (U33). والبيئة تقبل `maxCapturedChars` اختياريًا (للاختبار).
- `setVideo` متكرر بأمان (المعرّف نفسه لا يفرّغ شيئًا)، والمتحكم يستدعيه قبل `main.js`. والمشتركون يُبلَّغون كلٌّ على حدة، وإخفاقاتهم تُعدّ في `diagnostics().listenerFailures`.
- لا ترسل وحدة الاستخراج طلبًا ولا تخزّن شيئًا؛ الحفظ عبر `controller.recordExport`.
- `src/extract/youtube-page.js` و`video-id.js` (من P1) حلّ محلهما `src/player/youtube-dom.js`، ولم يعد سكربت المحتوى يستوردهما؛ لـP3 أن تحذفهما وتقرأ من `youtube-dom` إن احتاجت.

## ٣. نقطتا التركيب (P5 وP6)

```js
// src/player/overlay/index.js  (P5)
export function mountOverlay(controller, env = { doc, win }) → MountHandle
// src/player/controls/index.js (P6)
export function mountControls(controller, deps = { doc, win, exportFlow, importFlow }) → MountHandle

MountHandle = { state: "stub" | "waiting" | "mounted" | "error", unmount(): void }
```

- `main.js` يستدعي كلًا منهما **مرة واحدة عند `document_start`** قبل وجود المشغّل؛ فالتنفيذ ينتظر `#movie_player` بنفسه (`MutationObserver`)، ويعيد التركيب عند إعادة رسم يوتيوب لعناصره، ويحدّث `state`.
- `deps` للاختبار فقط: الأدوات تستورد تدفقي التصدير (§٥) والاستيراد (§٦) بنفسها، فلا يعرفهما `main.js`.
- التنفيذان يركّبان فعلًا منذ P5 وP6 (أدناه)، ويبدآن `state: "waiting"`؛ و`"stub"` حال المقبض بعد `unmount()` وحده (كان البديلان قبلهما لا يلمسان DOM ويعيدان `"stub"`). وتظهر الحالة في رد نافذة الأيقونة (`mounted`) وتشخيص الصفحة والدخان الحي.
- **الطبقة (P5، والخط والحجم P6):** حاوية Shadow DOM داخل `#movie_player`، و`textContent` فقط، والمظهر من `state.settings.appearance` بما فيه الخط (`font`) والحجم النسبي (`scale`، نسبة فوق الحجم النسبي لارتفاع المشغّل)، والخطوط من ملفات الإضافة (§٩) عبر `FontFace` ببياناتها لا برابطها، وعند التعذّر المراعي المضمّن ثم خط النظام العربي برمز في التشخيص، والإنجليزي للوضع المزدوج من `state.english`، والإعلان والشريط وملء الشاشة عبر `youtube-dom`، والبحث بـ`lookupMs` (عقد التوقيت). تغيّر `state.videoId` يمسح الطبقة فورًا. وإخفاء ترجمة يوتيوب الأصلية بنمط تحقنه الطبقة نفسها على `SELECTORS.captionWindow` ما دامت نشطة.
- **الأدوات (P6):** مجموعة داخل بداية `getRightControls()`، والقوائم داخل `#movie_player`، وعزل الضغطات في الحقول، والرسائل من `messageFor(code)`، والخطوة بـ`controller.updateSettings({ offsetStepMs })`. ونوافذ الشريط الأربع حوارات غير نمطية (`role="dialog"`، وأزرارها `aria-haspopup="dialog"`، وزر الرفع بلا ترجمة بلا `aria-haspopup` لأنه يفتح المنتقي)، تُغلق بخروج التركيز إلى ما خارج الطبقة والمجموعة إلا قرارًا ينتظر أو عملًا جاريًا. والرسائل تُحدَّث بمعرّفاتها فلا يُعاد إنشاء القائم، و«علّم للمراجعة» و«مزامنة بجملة…» معطّلان أثناء الإعلان (`CT_AD_SHOWING`) (تدقيق 7a66f91، C6).
- الرموز داخل المشغّل نصًا من `playerTokensCss()` (§٩)، فسكربت المحتوى لا يحمّل ملفات CSS من الإضافة.

- **حصر الأزرار (F-05، 2026-11-09):** `mountControls` لا تركّب أزرار الشريط إلا حين يعيد `videoIdFromLocation` معرّفًا (صفحة مشاهدة أو `/live/`)، وتبقى في الانتظار في غيرها. وغلافا `fetch` وXHR باقيان في كل الصفحات لأن التنقل داخل يوتيوب بلا إعادة تحميل.
- **أوامر الاختصارات (الفكرة ١٠، القرار ح-55، حُسم نيابةً عن سلطان بتفويضه):** مقبض `mountControls` فيه `command(name) → { ok: true } | { ok: false, code }`، يستدعيه معالج الرسائل لرسالة `tj:command` من العامل الخلفي (عقد الرسائل §٩)، وبلا جلسة `TJ_NO_VIDEO`. والجلسة تمرّره إلى أفعالها، ولكل أمر رسالة قصيرة في قناتها (`COMMAND_CHANNEL`) تتبدّل مع الضغطات ولا تتراكم:
  - `display-mode`: الوضع التالي بترتيب قائمة «الترجمة» (`ar` ← `dual` ← `off`) بـ`controller.setDisplayMode`، متخطيًا `dual` بلا `state.english`، ورسالة بالوضع (`modeToast`).
  - `offset-earlier` و`offset-later`: `nudge(∓1, { notify: true })`، أي `controller.nudgeOffset` بخطوة الإعدادات، ورسالة بالإزاحة (`nudgeFlash`) بدل التلميح العابر، لأن التلميح داخل الطبقة يُخفى مع الشريط والرسائل خارجها.
  - `mark-review`: `markVisible()` كما هو («علّم للمراجعة»).
  - `replay-line`: `seekMainVideo` إلى بداية الجملة التي يعيدها `replayCueIndex(cues, lookupMs(…))` في `sentence.js` (الظاهرة، وإلا آخر ما بدأ) زائدًا الإزاحة، بلا تشغيل ولا إيقاف؛ وأثناء الإعلان `CT_AD_SHOWING`، وقبل أول جملة نص `replayNone`.
  - بلا ترجمة (`CT_NEEDS_ARABIC`، نص `commandNeedsTranslation`) أو أثناء قراءتها (`CT_LOADING`): رسالة واحدة ولا فعل.

## ٤. نقطة الدخول — `src/content/main.js` (مجمَّد)

التركيب وحده، بهذا الترتيب: المستخرج ← الجسر (أولًا، فقد يصل الالتقاط مبكرًا) ← التخزين ← المتحكم ← مراقبة الفيديو (`controller.setVideo`، وهو يبدّل المستخرج معه؛ ثم `extractor.setVideo` تكرارًا آمنًا) ← `store.onChange` ← نقطتا التركيب ← رد نافذة الأيقونة ← `controller.start`. لا منطق منتج فيه.

**نقطة التركيب الثالثة (الوضع العادي، قرار سلطان 2026-11-03، [product-spec.md §٦.٦](../product-spec.md)):** `mounted.panel = mountPanel(controller, env = { doc, win })` من `src/player/panel/index.js`، بمقبض مثل الأخريين: `{ state: "stub" | "waiting" | "mounted" | "error", unmount(), diagnostics(), peek() }`، وتُستدعى مرة عند `document_start` وتنتظر العمود بنفسها. المضيف **أول ابن** في عمود يوتيوب الثانوي (`ytd-watch-flexy #secondary-inner`، وبديله `#secondary`) في صفحات الفيديو وحدها، بـShadow DOM مغلق و`textContent` فقط؛ فيكون يمين الفيديو في التخطيط العريض وتحته في وضع المسرح؛ وفي تخطيط العمود الواحد (`ytd-watch-flexy[is-single-column]`، يُخفي فيه يوتيوب العمود الثانوي) ينتقل إلى `ytd-watch-flexy #below` بعد الصندوق الذي يحمل `ytd-watch-metadata` ويعود بعودة العمودين. ومحددات هذه المواضع وسمتا العمود الواحد والوضع الداكن في `youtube-dom.js` (`PANEL_SELECTORS` و`ATTRS`، §٧) لا في ملفات اللوحة. والمضيف مخفي واللوحة مغلقة (الافتراضي، قرار سلطان 2026-11-03)، وزرها في شريط المشغّل ضمن مجموعة `mountControls` (صلة التركيز بينهما، ورمز تعذّر ظهور اللوحة إلى زرها `PL_COLUMN_NOT_FOUND` (ع-ل)، في `src/player/link.js` داخل الحزمة نفسها، دون مساس بـ`main.js`). وما دام ظاهرًا في العمود الثانوي: يُضيَّق `#secondary` الأعرض من 402 إليه، وفي واجهة يوتيوب العربية (RTL) يُعكس تخطيط `#columns` كالمرآة (قرار سلطان 2026-11-03: يمين الفيديو): `row-reverse` و`overflow-x: clip`، وتبادل حشو `#primary` و`#secondary` وهامشيهما الأفقيين؛ بأنماط سطرية على الثلاثة وحدها تُستعاد قيمها السابقة عند الإغلاق أو الإخفاء أو العمود الواحد أو LTR أو الإزالة، وتُعاد قراءتها بتغيّر تخطيط يوتيوب. ولا يغطي الفيديو ولا أدواته. يعاد إلى موضعه إن أعاد يوتيوب رسم العمود، ويُخفى في ملء الشاشة ويُزال بمغادرة صفحة الفيديو. تقرأ حالة المتحكم وتكتب بأفعاله وحدها: `updatePrefs({ ui })` للفتح والإغلاق وإخفاء الزر ونص اللوحة، و`nudgeOffset` و`resetOffset` للإزاحة المشتركة، و`updateSettings({ offsetStepMs })` للخطوة بمسار قائمة التوقيت نفسه، و`reload` لإعادة المحاولة. والمقطع الحالي بـ`indexFor(...).find` و`lookupMs` كالطبقة. ولا يظهر `mounted.panel` في رد نافذة الأيقونة (`messages.js` مجمَّد) بل في `__tarjuman.mounted.panel.diagnostics()` ببناء التطوير.

## ٥. تدفق التصدير — `src/core/export/index.js` (P3)

وحدة نقية تستهلكها الأدوات (P6) والمحفوظات (P7) والمحرّر (P8). تكتب الملفات عبر `src/core/srt` (قراءة).

```js
buildExport({ videoId, title, track: { key, lang, kind, cues }, mode: "normal" | "long", split: null | { size, by?: "count" | "content" } , now })
  → { files: [{ name, text }], fingerprint: Fingerprint, instructions: string, warnings: string[] }   // يرمي TjError(EX_…)
buildArabicExport({ videoId, cues, variant: "current" | "original" }) → { name, text, notes: string[] }   // cues بعد exportTiming؛ notes (C5، U99)
buildSubtitleExport({ videoId, cues, offsetMs, timing: "shown" | "saved", variant, lang, format: "srt" | "vtt", bilingual, original, sourceLang })
  → { name, text, notes: string[], timing: "saved" | "shown", count }   // الفكرة ١١: cues بالتوقيت المحفوظ، وexportTiming في داخلها
fileName({ videoId, lang: "en" | "ar", kind?, mode?, variant?, part?, format?: "srt" | "vtt", dualOf? }) → string   // مثل VIDEOID.en.asr.normal.srt
instructions({ videoId, title, parts? }) → string                                     // تعليمات الترجمة: الملحق أ حرفيًا (P7)
describeTrack(trackInfo) → string                                                      // «English – يدوي، 412 مقطعًا»
download(file, { doc? })                                                               // Blob و<a download>، بلا إذن downloads
```

وفي الإصدار الثاني يحل `saveFile` (§١٣) محل `download` في كل تنزيل حين تلمس مراحل W7 موضعه، و`download` باقٍ احتياطه.

- **التقسيم بالمحتوى (إضافة W6 بطلب P11، R60):** `split.by` اختياري؛ `"count"` (الافتراضي) التوزيع المتوازن القديم `planParts`، و`"content"` عند حدود الجمل أو الصمت `planPartsByContent` (§١٦). الأسماء وأجزاء البصمة والضمّ المطابق للملف الكامل كما في التقسيم القديم، وقيمة غيرهما `MD_INVALID`.

- **ما يُكتب يُقرأ بالعدد نفسه (تدقيق 7a66f91، C5):** `assertWritable(cues, { arabic? })` يرفض نصًا فيه سطر يُقرأ رأسَ مقطع (`breaksSrtText` في `src/core/srt/lenient.js`: سطر زمن كامل، أو رقم يليه ما يشبه الزمن، أو سياج أو عنوان) برمز `EX_TEXT_BREAKS_SRT` للعربي و`EX_TRACK_BREAKS_SRT` للإنجليزي (U78)، والإنجليزي على ما يغيّر العدد في أي قارئ SRT وحده (سطر زمن، أو رقم يليه زمن؛ `breaksSrtText(text, { markdown: false })`) فالسياج والعنوان فيه نص. وفي العربي الفارغ بصريًا (`isBlankText` في `src/core/model/cue.js`) فارغ (U80)، وبعد الثابت السادس يُعاد قراءة ملفه بالمحلّل المتسامح (`verifyReread`): العدد والأرقام والأزمنة نفسها، وإلا `EX_INVARIANT_FAILED`. والعربي يُكتب بنصه كما يقرؤه الاستيراد (`writableArabic`: بلا محارف تحكم ولا تجاوز اتجاه ولا مسافات أطراف الأسطر)، و`notes` ما جُرّد منه (`EX_NOTE_CONTROL_STRIPPED`) وما يجرّده الاستيراد عند إعادة القراءة (`EX_NOTE_REREAD_CHANGES`) بأرقام المقاطع في الملف (U99). والإنجليزي بنصه كما هو، فنواتج العيّنات الحقيقية مطابقة بايتًا.
  - **ملف الاستكمال (AV2 U-004):** `buildPatchPackage` يفحص `breaksSrtText(text, { markdown: false })` كالتصدير الكامل، فالعنوان والسياج والوسوم ومحارف الاتجاه نص إنجليزي لا تحجب الملف، ويبقى سطر الزمن `EX_PATCH_SOURCE_UNWRITABLE`؛ والذهاب والإياب بالمحلل الصارم بعد إعادة ترقيم الكتل (أرقام الاستكمال غير متتالية عن قصد) مع فحص ترقيمها الأصلي.
  - **مصدر ملف الاستكمال بعد إعادة التنزيل (تحقق الجولة الثانية، ن-٢):** المسار المحفوظ يُستبدل بكل تنزيل جديد (`recordExport`)، فبصمة ترجمة قديمة قد لا يعيدها. فإن لم يعدها المسار التلقائي (عددًا وأزمنة وبصمة نص، أو اشتقاق «مقاطع أطول» بالافتراضية) تُوضع حدودها على كلماته (`regroupAsr` في `src/core/export/patch.js`): الحد الذي زمنه زمن بداية مقطع محفوظ عند أول كلماته، وغيره حيث يقطع محوّل ما قبل ع-٣ من الحد السابق (نهاية جملة أو تجاوز `maxChars`)، والنص بلفّ المحوّل والأزمنة أزمنة البصمة؛ ولا يُقبل إلا إن أعاد بصمة النص نفسها. فترجمة 2.2.0 من أصل تلقائي تُستكمل بترقيمها بعد أن أعاد صاحبها تنزيل الأصل (1,056 ← 1,066)، وكذا «مقاطع أطول» حين تقع حدودها على بدايات مقاطع محفوظة أو على قطع ما قبل ع-٣. والنص الذي لا يفصل كلماته بالمسافات والمسار اليدوي لا يُعاد تجميعهما، فيبقى `EX_PATCH_SOURCE_MISMATCH`، ورسالته تدل على المخرج: مرجع أحدث بالشكل نفسه من «مرجع الأصل» في المحرّر.
- **حد الرفع في التقسيم (تدقيق 7a66f91، C5، U31 والقرار Q23):** `splitPlan(cues, split, limits = UPLOAD_LIMITS) → { ranges, size, raised } | null` في `src/core/export/parts.js`، و`UPLOAD_LIMITS = { files: MAX_FILES, bytes: MAX_FILE_BYTES }` حدّا الاستيراد نفسيهما (50 ملفًا و5 م.ب). حجم الجزء لا يقل عن ceil(count/50)، فيُرفع المطلوب بتحذير `EX_SPLIT_SIZE_RAISED` في `warnings`؛ وجزء بتقدير حجمه العربي فوق حد البايتات `EX_SPLIT_PART_TOO_LARGE` إن كفى حجم أصغر، وإلا `EX_SPLIT_IMPOSSIBLE`، قبل أي ملف.
- **النص الدراسي (تدقيق 7a66f91، C5، U30):** `studyTiming(cues, displayOffsetMs, english?) → { cues, clamped, english }` يزيح الإنجليزي للثنائي بالإزاحة نفسها (عقد التوقيت، القاعدة ٩)، فيُوزَّع على الفقرات بمرجعها الزمني، في المحفوظات والمحرّر.
- **ملف الترجمة SRT أو WebVTT، وحده أو مع الأصل (الفكرة ١١، القرار ح-50 في جولة 2026-11-13، حُسم نيابةً عن سلطان بتفويضه):** `buildSubtitleExport` في `src/core/export/bilingual.js` يأخذ المقاطع **بالتوقيت المحفوظ** وإزاحة العرض واختيار التوقيت. و«مع الأصل» سطر واحد تحت كل مقطع هو نص الأصل المتداخل معه زمنًا (`originalLookup`، كما في لوحة النص) منقّى (`readableText` بعد `lfLines`)، يُحاذى في الزمن المحفوظ ثم يُطبَّق `exportTiming` على الملف كله (عقد التوقيت، القاعدة ٩، لا تتغير). فالترجمة التي دمجت مقطعين يُضمّ تحتها أصلاهما، والتي شطرت مقطعًا يتكرر الأصل تحت شطريها، والمقطع في فجوة بلا سطر أصل.
  - **الاسم:** `VIDEOID.<لغتها>[.original][.dual-<لغة الأصل>].srt|vtt` (`fileName` بـ`format` و`dualOf`، و`SUBTITLE_FORMATS = ["srt", "vtt"]`)، فلا يُقرأ عند الرفع لغةً زائفة (`ar-EN`)، ويقرأ `langFromFileName` لغته من الرمز الذي قبل `.original` و`.dual-…` (`ID.ar.dual-en.srt` ← `ar`). ولا `.ass`، ولا محارف عزل الاتجاه (التنقية تزيلها عمدًا).
  - **الفحص:** الترجمة وحدها SRT هي ملف `buildArabicExport` نفسه بايتًا. وبلا أصل `EX_STUDY_NO_ENGLISH`، وسطر أصل يقطع كتلة SRT (سطر زمن، أو رقم يليه زمن؛ `breaksSrtText(…, { markdown: false })`) `EX_TRACK_BREAKS_SRT` برقم مقطعه. و`-->` في WebVTT: في نص الترجمة `EX_TEXT_BREAKS_VTT` («عدّل نصها»)، وفي سطر الأصل `EX_TRACK_BREAKS_VTT` (صدّر SRT أو «الترجمة وحدها»، لأن الأصل لا يُعدَّل في المحرّر؛ تحقق 2.3.0، ص-٢٣)، والترجمة تُفحص أولًا. والملف الثنائي SRT يُتحقق بالمحلّل الصارم وحده، لأنه ليس للرفع إلى ترجمان (حارسه في §٦).
  - **المستهلكون:** المحفوظات (`exportArabic` و`exportSlot` بسؤال `ask({ offsetMs, hasOriginal, name })` يعيد `{ format, bilingual, timing }` أو null، وأصل الخانة من مسار مرجعها)، والمحرّر (`planArabicExport({ …, format, bilingual, original, sourceLang })`، والأصل `S.englishTrack`).
  - **WebVTT** (`src/core/export/vtt.js`): `writeVtt(cues)` بترويسة `WEBVTT` وسطر فارغ، ولكل مقطع رقمه وسطر `HH:MM:SS.mmm --> HH:MM:SS.mmm` ثم نصه، بـLF وبلا BOM، والنص مهرّب (`&` ثم `<` و`>`). و`assertVttWritable` يرفض السطر الفارغ (`EX_EMPTY_TEXT`) و`-->` في النص (`EX_TEXT_BREAKS_VTT`) والتوقيت المعيب (`EX_TIMING_INVALID`). و`verifyVtt(text, cues)` يعيد قراءة ما كتبه بفكّ التهريب كـ`verifyRoundTrip`، وإلا `EX_INVARIANT_FAILED`. واستيراد WebVTT العام خارج النطاق: منتقيات الملفات الثلاثة لا تتغير.
  - **نص الأصل المحاذي:** `originalLookup(enCues) → (startMs, endMs) => string` و`flatText` في `src/core/align/original.js` (ويصدّرهما `src/core/align/index.js`). نُقلا من `src/player/panel/model.js`، فتستعملهما لوحة النص (`transcript.js`) والتصدير وحارس الاستيراد بتعريف واحد، والنواة لا تستورد من المشغّل.
- **في المشغّل (P6):** `controller.convertCaptured(key, { mode })` ← `buildExport` ← `download` لكل ملف ← `controller.recordExport({ trackKey: key, fingerprint })`.
- **في الصفحات (P7، P8):** الإنجليزية من المسار المحفوظ بالوضع «عادي» وحده؛ والعربية بـ`exportTiming` (عقد التوقيت §٥) ثم `buildArabicExport`، ومنذ الفكرة ١١ بـ`buildSubtitleExport` التي تجمعهما؛ وحفظ أي بصمة بـ`store.updateVideo` و`withExport`.
- البصمة بحسب عقد البيانات §٤، وتُحفظ لكل تصدير.
- **تعليمات الترجمة (من «تهيئة W4»، تنفّذها P7):** نص [الملحق أ في مواصفة المنتج](../product-spec.md#ملحق-أ-تعليمات-الترجمة-المعتمدة) حرفيًا بتعبئته (العنوان في سطر واحد بعد تجريد المحارف الخفية ومحارف التحكم، و«غير متوفر» إن غاب؛ والرابط من المعرّف بعد التحقق منه؛ واستبدال بمرور واحد)، وفقرة الأجزاء عند التقسيم الاحتياطي وحده (`parts`). `buildExport` يمرّر `videoId` و`title`. لا تُعرض داخل الإضافة؛ تنسخها قائمة التحميل (P6) وزر «نسخ» في المحفوظات (P7). وإلى أن تنفّذها P7 يبقى التوقيع القديم `instructions({ count, mode, parts })` في الشيفرة.

## ٦. تدفق الاستيراد والمقارنة — `src/core/import/index.js` و`src/core/compare/index.js` (P4)

```js
readImport(fileOrFiles, { fingerprints: Fingerprint[], settings: Settings, originals?: EnglishTrack[] })
  → Promise<{ ok: true, fileName, cues: Cue[], comparison: ComparisonReport | null, fingerprintId: string | null, notes: string[], warnings: { code, params? }[],
               lang: string | null, ambiguous: number[] | null,   // ambiguous: أرقام «المواضع الغامضة» (ف6، §١٩)
               bilingual: { code: "IM_BILINGUAL", count, total, indexes, lang, line: "last" | "first" } | null }   // الفكرة ١١ (ح-49)
          | { ok: false, error: { code, message, line? } }>
withoutOriginalLines(result, { fingerprints, settings }) → result   // بعد نقرة «أزل سطر الأصل من كل مقطع»: bilingual: null، وstripped وstrippedLine، وملاحظة، ومقارنة جديدة
compare(cues, fingerprint | null, { driftMs }) → ComparisonReport
previewRestoreTiming(cues, fingerprint) → { available: boolean, changes: [{ n, from: { startMs, endMs }, to: { startMs, endMs } }] }
applyRestoreTiming(cues, fingerprint) → Cue[]          // بعد تأكيد المستخدم فقط؛ يرمي إن لم تُتح
```

- `fileOrFiles` كائنات `File` من `<input type="file">` (في المشغّل أو الصفحات). أكثر من ملف = أجزاء احتياطية تُدمج بالأرقام.
- **اختيار البصمة:** الأحدث بين المطابقة عددًا، وإلا الأحدث؛ ويُسجَّل في `fingerprintId` وفي `comparison.fingerprintId`.
- الناتج الناجح هو مدخل `controller.loadArabic(result, { replace })` في المشغّل، أو `withArabicImport` في المحفوظات. لا كتابة في التخزين داخل وحدة الاستيراد.
- كل تحويل للنص يُذكر في `notes`، ولا تعديل للتوقيت إلا بالاستعادة المؤكدة.
- **المحلّل المتسامح (تدقيق 7a66f91، C5):** سطر يشبه الزمن داخل نص مقطع (بعد سطر زمن صالح وقبل أول حدّ) وليس قبله رقم نصٌّ منه («1 --> 2» و«10:30 --> 11:00»)، فما يصدّره ترجمان يقرؤه ترجمان (U35)؛ والرقم ثم ما يشبه الزمن رأس معيب `IM_BAD_TIME`، وسطر الزمن الكامل بلا رقم `IM_MISSING_NUMBER` كما كانا. والسطر الفارغ والسياج والعنوان (`#` إلى `######` ثم مسافة) حدود لنص أي مقطع: الأسوار بين المقاطع تُزال بملاحظة، والعنوان بينها `IM_STRAY_TEXT` برقم سطره، ومعه `heading: true` حين يكون العنوان نفسه حدّ المقطع فتقول الرسالة إنه قُرئ عنوانًا (قرار سلطان: معامل لا رمز جديد، تحقق Gemini ع-١٢ ب)، وبعد آخر مقطع شرح يُزال (U38). والسطر الذي بقي فيه بعد التنقية محرف خفي وحده (RLM أو LRM أو ZWSP أو ZWNJ أو ZWJ) ليس حدًّا: يُسقط من نص المقطع، فبعد آخر سطر مرئي فاصل بلا ملاحظة (ع-٧)، وقبله (وسط النص أو أوله) بملاحظة `IM_NOTE_CONTROL` ويبقى ما بعده من المقطع كما في 2.2.0 (تحقق الجولة الثانية، ن-٣)؛ فلا يُرفض ملف كان يُقبل، ولا يصير نص آخر مقطع شرحًا فيُحفظ فارغًا. وفي سطر الزمن تُطبَّع الفاصلة العربية «٫» و«،» والأسهم «→» و«⟶» و«->» و«–>» و«—>» بملاحظة `IM_NOTE_TIME_MARKS`، والزمن السالب `IM_BAD_TIME` على سطره. وUTF-16 بلا BOM `IM_NOT_UTF8`، واسم الأجزاء المدموجة بلا «partNNofMM».
- **حارس الملف الثنائي (الفكرة ١١، القرار ح-49 في جولة 2026-11-13، حُسم نيابةً عن سلطان بتفويضه):** `bilingualCheck(cues, originals)` في `src/core/import/bilingual.js`.
  - **الحكم:** آخر سطر في أكثر مقاطع الملف (فوق النصف، والمقطع ذو السطر الواحد لا يُعدّ) يطابق نص الأصل المحاذي (`originalLookup` على مسار أصل محفوظ، `EnglishTrack.cues`)، أو أول سطر في الثنائي المعكوس (`line: "first"`، الأصل فوق الترجمة). والمقارنة بعد فكّ كيانات WebVTT ونزع الوسوم وتوحيد المسافات، ولا تغيّر نصًا.
  - **فرق الزمن (تحقق 2.3.0، ص-١ وص-٢٣، بقرار سلطان):** المحاذاة بزمن الملف بعد طرح فرق مرشّح: الصفر، وأكثر ثلاثة فروق تكرارًا بين بداية مقطع وبداية مقطع أصل نصه أول سطر الأصل فيه، مما هو إزاحة صالحة (`isValidOffset`: شبكة 100 م.ث وحد ±10 دقائق)، ويُؤخذ أكثرها مطابقة. فلا تُفوّته إزاحة صُدِّر بها «بتوقيت المشاهدة» ولو ضُمّ في سطر أصله مقطعان (ترجمة ميدواي «مقاطع أطول» بإزاحة +1.5 ث: 729 من 729، وكانت 498). ولا مطابقة بنص مقطع أصل في غير موضعه، فملف بلغة الأصل وحدها كل مقطع فيه مقطعا أصل سطرًا تحت سطر لا يُحكم ثنائيًا (كان 213 من 213).
  - **العرض:** `readImport` يعيده في `bilingual` لا في `warnings`. فتعرضه مراجعة الرفع في المحفوظات (`uploadContent`) والمشغّل (التأكيد، ولا حفظ مباشر في أول رفع) تحذيرًا برمز `IM_BILINGUAL` (بمعامل `line`: «آخر سطر» أو «أول سطر») معه زر «أزل سطر الأصل من كل مقطع». لا يُزال شيء قبل النقرة، ولا يُرفض الملف.
  - **النقرة:** `withoutOriginalLines` (في المحفوظات `withoutOriginal(prep)`، وفي المشغّل `stripFor`): يُحذف سطر الأصل حيث طابق وحده (`withoutMatchedLines`: الآخر، أو الأول في المعكوس)، وتُضاف ملاحظة `IM_NOTE_BILINGUAL_REMOVED` بموضعه إلى `notes`، وتُعاد المقارنة بالمرجع نفسه، ثم المرجع الأقرب والتتمة. والتركيز إلى سطر ما أُزيل.
  - **ملف الاستكمال:** `readPatch(files, { …, originals })` مثله: `bilingual: { count, total, line, plan }` بخطة بلا سطر الأصل، تبدّلها معاينة الاستكمال في المحرّر بالزر نفسه.
  - **بلا أصل محفوظ لا حارس** (القيود §٤).
- **ملف التصحيح (تدقيق 7a66f91، C5):** `readPatch` يتحقق من كل ملف عند قراءته (التكرار، والرقم داخل البصمة، والزمن) فيتوقف عند أول ملف باطل، وبحد تراكمي `IM_TOO_MANY_CUES` (U40).
- **في الإصدار الثاني (P11):** `compare` يتيح `restoreTimingAvailable` بمحاذاة هوية متحققة وحدها (§١٦)، وإن طابق العدد والترقيم ولم تتحقق المحاذاة فالسبب `CMP_RESTORE_UNVERIFIED` في `comparison.notes` دون حقل جديد؛ و`readImport` يضم في `comparison.notes` ملاحظات القراءة ثم ملاحظات المقارن. والقارئ يقبل أغلفة Markdown المحددة (السياج ``` أو ~~~، وعلامات التأكيد حول أسطر الأرقام والتوقيت، وأسطر الشرح والعناوين حول الملف) بملاحظة لكلٍّ، ويرفض النص بلا توقيت بـ`IM_NO_TIMING`.

- **التنقية الموحدة (N-05 وF-06، 2026-11-09؛ ووُسّعت في ع-١٧):** `sanitizeText` في `src/core/text/sanitize.js` تزيل U+E0000–U+E0FFF عدا مكمّل محددات التنويع (الوسوم وغير المعيّن)، ومحدد التنويع U+FE00–U+FE0F وU+E0100–U+E01EF إلا بعد محرف له به تسلسلات تنويع مسجّلة (ن-٤ بقرار المالك بعد ص-٣ في التحقق الأخير لـ2.3.0): U+FE0E وU+FE0F بعد `\p{Emoji}`، وU+E0100–U+E01EF بعد `\p{Unified_Ideograph}`، وU+FE00–U+FE0D بعد أساس التنويعات القياسية (`STANDARDIZED`، تقريب موثّق في الوحدة)؛ فيُزال بعد الحرف اللاتيني والعربي وسائر الحروف، وبعد محدد آخر متتابعًا، وفي أول النص أو السطر، وبعد مسافة أو تحكم أو تنسيق أو علامة ضامة، وU+202A–U+202E وU+2060–U+2064 وU+2066–U+2069 وU+206A–U+206F وU+FFF9–U+FFFB وU+FEFF (عدا BOM أول الملف الذي يزيله المحلّل) والبديل اليتيم، وتُبقي U+200B–U+200F؛ وبـ`{ controls: true }` تزيل معها محارف التحكم C0 وC1 عدا الجدول وفواصل الأسطر والصفحات. تمر بها قطع json3 بعد فك JSON (بـ`controls`، والبديل اليتيم يُزال من كل قطعة قبل وصلها فلا يلتئم بديلا قطعتين محرفًا)، ونص SRT المرفوع (ومحارف التحكم فيه يزيلها المحلّل بملاحظتها)، و`videoTitle`، وكل ما يُكتب في ملف مصدَّر (التصدير الإنجليزي والاستكمال بـ`controls`، والعربي والنص الدراسي وتقرير المراجعة). وفي التصدير العربي ولوحة المشكلات CR وCRLF وU+2028 وU+2029 في نص المقطع فاصل سطر كما يقرؤها الاستيراد (`lfLines` في `model/cue.js`): تُكتب LF، والمتتاليان منها سطر فارغ `ED_TEXT_BLANK_LINE` و`EX_EMPTY_TEXT`. وبصمة النص `textHash` تبقى على المسار المحفوظ كما هو، فيطابقها ملف الاستكمال.

## ٧. محددات يوتيوب — `src/player/youtube-dom.js` (مشترك)

كل اسم داخلي غير رسمي ليوتيوب هنا وحده (R39)؛ والحاجة إلى محدد جديد طلب ملف مشترك.

- **يفرضه الفحص الثابت (الفكرة ١، الجولة الثالثة):** قاعدة في `scripts/check-static.mjs` تمنع في `src` خارج هذا الملف أصناف المشغّل (`ytp-`) وعناصر الصفحة (`ytd-`)، و`movie_player`، وأحداث `yt-navigate-` و`yt-page-` و`yt-player-`، و`ytInitial…` و`getPlayerResponse`، وأعمدة صفحة المشاهدة (`#secondary` و`#secondary-inner` و`#primary` و`#below` و`#columns`، ومقارنة المعرّف بأسمائها)، و`is-single-column`، وسمة `dark` على `html`. والقيمة `dark` لسمة ترجمان `data-theme` و`below` موضعًا للوحة ليستا من أسماء يوتيوب فتمرّان.
- **الاستثناء الوحيد:** سكربت عالم الصفحة `src/main-world/capture.js` (مجمَّد) بأسطره الأربعة المراجَعة حرفيًا في القاعدة: `getElementById('movie_player')`، و`getPlayerResponse`، و`window.ytInitialPlayerResponse`، وسماع `yt-navigate-finish` و`yt-page-data-updated` و`yt-player-updated`. لا يستورد هذا الملف، فلا يجرّ إلى عالم الصفحة ما لا يحتاجه (`sanitize.js` وعنوان التبويب).
- **كانت محددات اللوحة** في `src/player/panel/column.js` وسمة الوضع الداكن في `src/player/panel/session.js`، خلافًا لهذا القسم، ونُقلت إلى `PANEL_SELECTORS` و`ATTRS`. و`column.js` يعيد تصدير محدداتها بأسمائه القديمة (`COLUMN_SELECTORS` و`SINGLE_COLUMN_ATTR` و`BELOW_SELECTOR` و`BELOW_ANCHOR_TAG` و`COLUMNS_SELECTOR` و`PRIMARY_SELECTOR` و`SECONDARY_SELECTOR`).
- **لا يُضاف إلى `SELECTORS` شيء من اللوحة:** مفاتيحها مربوطة بخط أساس «هل تغيّر يوتيوب؟» (قسم `dom`) وبخريطة الوجود في تشخيص الصفحة، فللوحة قسم مستقل.

| التصدير | المحتوى |
| --- | --- |
| `SELECTORS` | `player` (`#movie_player`)، و`video`، و`rightControls`، و`leftControls`، و`volumePanel`، و`chromeBottom`، و`progressBar`، و`captionWindow`، و`captionSegment`، و`subtitlesButton`، و`liveBadge`، و`inlinePreview` |
| `CLASSES` | `adShowing`، و`adInterrupting`، و`autohide`، و`fullscreen`، و`bigMode`، و`smallMode`، و`chapter` (عنوان الفصل في الأدوات اليسرى)، و`timeDisplay` (زمن المشغّل `ytp-time-display`) |
| `EVENTS` | `navigateStart`، و`navigateFinish` (`yt-navigate-finish`)، و`pageDataUpdated` |
| `PANEL_SELECTORS` | مواضع لوحة النص (§٤): `flexy` (`ytd-watch-flexy`)، و`secondaryInner` و`secondary` (داخل `ytd-watch-flexy`)، و`anySecondaryInner` و`anySecondary` (مطلقًا، احتياطًا لتغيّر البنية)، و`below` (`ytd-watch-flexy #below`)، و`belowAnchor` (`ytd-watch-metadata`، في صندوق داخل `#below`)، و`columns`، و`primary` |
| `ATTRS` | `singleColumn` (`is-single-column` على `ytd-watch-flexy`)، و`dark` (على `html`: وضع يوتيوب الداكن، تتبعه ألوان اللوحة)، و`layout` (نمط أسماء سمات `ytd-watch-flexy` التي تغيّر التخطيط: الأعمدة والنافذة والمسرح وملء الشاشة) |
| الدوال | `videoIdFromLocation` (`/watch?v=` و`/live/<id>`؛ لا Shorts)، و`youtubeUiLanguage`، و`getPlayer`، و`getMainVideo`، و`getRightControls`، و`getLeftControls`، و`getChromeBottom`، و`getCaptionContainer`، و`isAdShowing` (الإعلان أو المقاطِع؛ عند الشك إعلان)، و`areControlsHidden`، و`isPlayerFullscreen`، و`isSubtitlesButton` (العقدة زر CC أو ما داخله؛ قائمة «تنزيل الأصل» لا تُغلق بالضغط عليه، الفكرة ٧-أ)، و`pressSubtitles` (تضغط زر CC بنقرة المستخدم على زر يسمّي فعله، وتقرأ `aria-pressed` قبل كل ضغطة، والإعادة إطفاء ثم انتظار ثم تشغيل؛ الفكرة ٧-ب، ح-56)، و`subtitlesPressable` (زر CC موجود والمتصفح غير محجوب)، و`CC_PRESS_BLOCKED` (متصفحات حجب الضغط، فارغة)، و`mainVideoDurationMs`، و`seekMainVideo` (§١٤)، و`isLiveNow`، و`displayedCaption`، و`videoTitle`، و`watchCurrentVideo`، و`isBelow` (العنصر هو `#below`) |

كل دالة تأخذ `doc`/`win` لتُختبر بلا متصفح (و`isBelow` عنصرًا)، ولا تغيّر DOM يوتيوب. و`pressSubtitles` وحدها تضغط زر CC، بنقرة المستخدم على زر يسمّي فعله (المواصفة §٤، ح-56).

- **`timeDisplay` (ت-١):** `src/player/controls/bar.js` يجده داخل `leftControls` ويقيس عرض نصه ليكشف قصّ زمن يوتيوب ويحسب المساحة الخالية للأدوات (فيطويها ويسجّل `CT_BAR_OVERFLOW` إن بقي القص)، و`volumePanel` و`chapter` يُحجزان من حسبة المقاس (48 و40 و34)، لا من حسبة الطي: الطي بالمساحة في السكون بلا حجزهما، فيبدأ حيث يبدأ القص فعلًا، ولا يُطوى زر اللوحة والشارة معطّلة (ن-١ بقرار سلطان، نقض ح-2). ويراقبه «هل تغيّر يوتيوب؟» بالمحدد نفسه (`WATCHED` في `scripts/youtube-shapes.mjs`)، فإن غيّر يوتيوب اسمه أو أخرجه من الأدوات اليسرى ظهر «غاب: dom.timeDisplay».
- **«هل تغيّر يوتيوب؟» يمر على السجل كله (الإصدار 2):** لكل مفتاح في `SELECTORS` و`PANEL_SELECTORS` و`CLASSES` و`ATTRS` مدخل في لقطته (`dom` و`panel` و`classes` و`attrs`)، ويفرض ذلك اختبار «مطابقة السجل» في `test/unit/scripts/youtube-shapes.test.js`. فاسم يُضاف هنا يدخل الفاحص معه، والأصناف والسمات حالاتٌ إما رُصدت وإما `'unobserved'`.

## ٨. صفحات الإضافة وعناوينها

| الصفحة | المسار | تُفتح من | المالك |
| --- | --- | --- | --- |
| نافذة الأيقونة | `pages/popup/index.html` | الأيقونة (`action.default_popup`) | P7 |
| المحفوظات | `pages/library/index.html` | نافذة الأيقونة | P7 |
| الإعدادات | `pages/settings/index.html` | نافذة الأيقونة | P7 |
| المحرّر | `pages/editor/index.html?v=VIDEO_ID` (و`&t=2` لخانة، و`&p=complete` للوحة «الاستكمال»، ف1) | نافذة الأيقونة والمحفوظات | P8 |

- المسارات من `PAGES` و`pagePath(name, { v })` في `src/core/model/ids.js`، والفتح بـ`openPage(name, params)` في `src/ui/page.js` (`chrome.tabs.create`)، وقراءة `v` بـ`videoParam(location.search)`. «فتح الفيديو» بـ`watchUrl(id)` وحده.
- **هيكل الصفحة:** مجلد فيه `index.html` (يربط `../../ui/tokens.css` و`base.css` و`components.css` ثم `<script src="main.js">`) و`main.js` نقطة دخول يجمّعها البناء مع ما تستورده، وأي ملفات CSS محلية تُنسخ تلقائيًا. صفحة واحدة لكل مجلد؛ لا صفحة جديدة دون تغيير البيان (عقد).
- الصفحات لا تراسل المشغّل إلا برسائل عقد الرسائل: طلب حالة الفيديو (§٢ و§٥ هناك)، وتشخيص الصفحة (§٦)، ومعرّف الفيديو وحده والقفز إلى زمن (`tj:seek`، §٧ هناك و§١٤ هنا)، ولصق ناتج النموذج من النافذة (`tj:paste-import`، §٧ب). ولا طلبات شبكة منها (فحص ثابت) إلا صور الفيديو في المحفوظات: `<img>` من `i.ytimg.com` بمعرّف الفيديو ما دام مفتاحها مفعّلًا (`src/pages/library/thumb.js`).

## ٩. أساس الواجهة — `src/ui/` (مشترك)

| الملف | المحتوى |
| --- | --- |
| `tokens.css` | ألوان `Pages` بالوضعين (§٣.١ من مواصفة التصميم) بالبادئة `--tj-`، والخطوط وبدائلها، والمسافات والزوايا والظلال والحركة. الوضع يتبع النظام، و`data-theme` يفرضه. |
| `base.css` | RTL، وسلّم الخطوط (`tj-display`…`tj-mono-sm`)، و`tj-ltr` لعزل الأزمنة والمعرّفات، والحاويات، وحلقة التركيز، وتقليل الحركة. |
| `components.css` و`components.js` | `button` (ستة أنواع: `primary` و`secondary` و`outline` و`ghost` و`danger` و`accent`؛ وخمسة مقاسات: `xs` و`sm` و`md` و`lg` و`xl`؛ وزر الأيقونة وحدها، والتحميل، و«معطّل بسبب»)، و`field` (تسمية وتلميح وخطأ، وLTR أحادي للأرقام)، و`confirmDialog` (`<dialog>`، Esc إلغاء)، و`alertBox` (أربع نبرات)، و`emptyState`، و`statusPill` (سبع نبرات: `neutral` و`info` و`success` و`warning` و`danger` و`edited` و`brand`، والخيار `plain`)، و`topbar` و`choiceGroup` و`chipGroup` و`slotPicker`، و`el` و`ltr` و`icon` و`relabel`. DOM وtextContent فقط. و`ltr(text, { mono, wrap })` عنصر ذري معزول LTR، و`wrap` يلتف داخله (`tj-ltr--wrap`) لاسم ملف قد يطول بلا فواصل؛ و`ltrNodes(text)` يحوّل كل مقطع LRI…PDI في نص عنصرَ `ltr` ذريًا يلتف داخله (و`null` لنص بلا مقطع)، وبه يرسم `alertBox` و`createToaster().show` نصهما (الجولة الرابعة). |
| `format.js` | `formatOffset` (`+0.5` `−1.0` `0.0`)، و`formatTimecode` (`HH:MM:SS,mmm`)، و`formatCount` بصيغ `COUNT_FORMS` («مقطع واحد»، «مقطعان»، «3 مقاطع»، «11 مقطعًا»)، وخيارها `{ case: 'gen' | 'acc' }` للمثنى المجرور والمنصوب والمفرد المنصوب («مقطعين»، «مقطعًا واحدًا»؛ ع-٢٦) ولا يمس الإنجليزية، وبلا الخيار كما كانت، و`formatBytes`. والعزل داخل جملة عربية: `ltrInline` (LRI…PDI لاسم ملف أو رقم موقّع)، و`isolate` (FSI…PDI لنص حر كعنوان فيديو؛ تدقيق 7a66f91، C6، U49)، و`ltrParts(text)` يقسم النص عند مقاطع LRI…PDI ليرسم كل مقطع عنصرًا ذريًا (`ltrNodes` في الصفحات، و`.iso` في سطر النتيجة بقوائم المشغّل): العزل النصي وحده لا يمنع انقلاب أجزاء الاسم إن انكسر سطره (الجولة الرابعة). |
| `player-tokens.js` | رموز `Player` (§٣.٢) و`playerTokensCss(selector)` لطبقة العرض والأدوات. |
| `page.js` | `startPage({ title, render })` بحدّ أخطاء، و`openPage`، و`extensionVersion`. |
| `subtitle-fonts.js` | بيانات خطوط الترجمة فوق الفيديو وحدها (من «تهيئة W4»): لكل خط معرّفه (`SUBTITLE_FONTS` في نموذج الإعدادات)، واسمه العربي واللاتيني، واسم عائلة فريد داخل الإضافة، وملفّا وزنيه 400 و700، وسلسلة البدائل (المراعي المضمّن ثم خطوط النظام العربية). بلا DOM. |
| `fonts/subtitle/` | ملفات WOFF2 للخطوط الأربعة بوزنين مع رخصة OFL لكل عائلة، من مستودع Google Fonts الرسمي. تُعلن مع `fonts/ui/` في إدخال `web_accessible_resources` واحد لملفات `.woff2` وحدها على يوتيوب، ولا تُحمَّل من الشبكة. والإدخال بـ`use_dynamic_url: true` في البيان الواحد للهدفين: في Chromium لا يُبلَغ الملف إلا بمعرّف متغير يُولَّد لكل جلسة، لا بمعرّف الإضافة الثابت؛ وFirefox لا يدعم المفتاح فيتجاهله، وعنوان `moz-extension://` فيه عشوائي لكل نسخة متصفح أصلًا (`scripts/targets.mjs` لا يغيّر الإدخال، و`scripts/check-static.mjs` يشترطه كما هو). وسكربت المحتوى يقرأ الملف بـ`fetch(runtime.getURL(…))` ويبني الخط من بياناته (`FontFace`) في الهدفين. |
| `gallery/` | معرض المكوّنات بحالاتها، في بناء التطوير وحده. |

خطوط الواجهة مضمّنة في الإضافة أيضًا (لا مثبّتة على الجهاز)، بأسماء عائلات فريدة في `ui-fonts.js`: Cairo للعناوين من `fonts/ui/`، وAlmarai للنص من ملف `fonts/subtitle/` نفسه، ثم بدائل النظام. صفحات الإضافة تحمّلها من `ui/fonts.css`، والمشغّل عبر `FontFace` كخطوط الترجمة، ولا تُحمَّل من الشبكة. وتغيير خط الترجمة لا يغيّر خطوط الواجهة: عائلتان مختلفتان وإن خدمهما ملف المراعي نفسه. المكوّن الجديد يُبنى داخل صفحة مرحلته، ثم يُرفع إلى `src/ui` بطلب.

## ١٠. البناء والتشخيص والحزام

- `npm run build` → `dist/` (إنتاج، يفشل إن بقي خطاف التطوير)؛ و`npm run build:dev` يضيف في العالم المعزول `globalThis.__tarjuman = { controller, extractor, store, mounted }` ومعرض المكوّنات، و`version_name` ينتهي بـ`-dev`.
- تقرير التشخيص: `createDiagnosticReport({ version, browser, sections })` في `src/core/diagnostics/report.js` يسقط المفاتيح النصية (`text` و`cues` و`body` و`srt` و`title`…) ثم ينقّي الباقي؛ كل مرحلة تضيف قسمها من أعداد ورموز.
- الاختبار الحي عبر `test/live/harness/` (README هناك)، ودخان الإضافة `smoke.mjs`.
- `scripts/run-tests.mjs` يفشل إن لم يجد اختبارًا، إلا بـ`--allow-empty` (لـ`test/integration` وحده حتى تكتبه W3)؛ و`check-static` حدّ أدنى سطري بعد نزع التعليقات، يمنع الأسماء الخطرة معرّفاتٍ وبالأقواس، لا محلل كامل.

## ١١. مراجعة العقد لكل مرحلة لاحقة

| المرحلة | تكتب في | تستهلك (قراءة) | تحتاج ملفًا مشتركًا؟ |
| --- | --- | --- | --- |
| P3 | `src/extract/**` (ومنه `index.js`)، و`core/convert`، و`core/export`، و`errors/extract.js` | `core/model`، و`core/srt` (الكاتب والمحلّل الصارم)، و`core/diagnostics`، و`youtube-dom` | لا |
| P4 | `core/srt`، و`core/import`، و`core/compare`، و`errors/import.js`، و`test/fixtures/srt`، و`test/integration/roundtrip` | `core/model` (البصمة والتقرير)، و`test/helpers` (`fingerprint()` بصمة العقد قبل دمج P3) | لا |
| P5 | `player/overlay/**` (ومنه `index.js`)، و`sync`، و`watch`، و`errors/overlay.js` | المتحكم، و`lookupMs`، و`youtube-dom`، و`playerTokensCss`، و`test/helpers` (`fakeExtractor`) | لا |
| P6 | `player/controls/**` (ومنه `index.js`)، و`player/overlay/**` (الخط والحجم وحدهما)، و`errors/controls.js`، و`test/integration/player` | المتحكم وأفعاله، و`core/export` و`core/import`، و`youtube-dom`، و`src/ui/format.js`، و`playerTokensCss`، و`src/ui/subtitle-fonts.js` وملفات الخطوط | لا |
| P7 | `pages/{popup,library,settings}`، و`core/export/instructions.js` و`core/export/index.js` (تعليمات الترجمة)، و`errors/pages.js` | التخزين، والانتقالات، والرسائل، و`core/export` و`core/import`، و`src/ui` ومنه `subtitle-fonts.js`، والتشخيص | لا |
| P8 | `pages/editor`، و`core/edit`، و`errors/editor.js` | التخزين (`expect`)، والتوقيت والانتقالات، و`core/compare` (الاستعادة)، و`core/export`، و`src/ui` | لا |

ما قد يُطلب لاحقًا بمسار الاستثناء (لم يظهر حاجة إليه الآن): محدد يوتيوب جديد في `youtube-dom.js`، أو رفع مكوّن من صفحة إلى `src/ui`.

---

## ١٢. المتحكم في الإصدار الثاني — `src/content/controller.js`

يقرأ السجل بـ`store.getVideo` كما كان ثم حزمته بـ`store.bundleOf(record)` (عقد التخزين §١٠)، فتبقى اختبارات السباق والقراءة على حالها؛ ويكتب عبر `updateVideo` لأفعال الإصدار الأول و`updateBundle` للجديدة.

**حقول جديدة في `ControllerState`** (كل حقول §١ باقية بمعناها، و`arabic` و`view` للنشطة):

| الحقل | المعنى | يستعمله |
| --- | --- | --- |
| `bundle` | الحزمة (عقد البيانات §١٠) أو `null`؛ لا تُعدَّل. | P12 |
| `activeSlot` | `1 \| 2 \| 3 \| null`. | P12 |
| `slots` | `SlotModel[]` بثلاثة عناصر `{ n, filled, active, name, edited, cueCount }` لاختيار 1 2 3 وحوار الرفع. | P12 |
| `marks` | علامات النشطة `{ slot, items: Mark[] }` أو `null`؛ حلّها بـ`resolveMark` (عقد البيانات §١٢). | P12 |
| `previous` | `{ from, savedAt } \| null` بلا نص. | P12 |
| `prefs` | `Prefs` كاملة (القاموس لإشارة «+ القاموس (12)»). | P12 |

**أفعال جديدة:**

| الفعل | القاعدة | الأخطاء |
| --- | --- | --- |
| `activateSlot(n)` | تبديل النشطة كتابةً واحدة (`withActiveSlot`)؛ الطبقة تعرض الجديدة بإزاحتها بعد الحفظ. لا أثر أثناء `loading`. | `ST_SLOT_EMPTY`، `MD_INVALID`، `ST_*` |
| `loadArabicInto(n, input, { replace, activate })` | الرفع إلى خانة (`withSlotUpload`) بمدخل `loadArabic` ومعه `current?`. الممتلئة تحتاج `replace` وتحفظ السابقة. إشعار `ST_OFFSET_RESET` إن صُفّرت إزاحة النشطة، وإلا `ST_PREVIOUS_SAVED` عند الاستبدال. تعيد `{ record, replaced, activated }`. | `ST_ARABIC_EXISTS`، `MD_INVALID`، `ST_*` |
| `markCue({ index }, kind = "todo")` | يعلّم مقطع النشطة برقمه في `state.arabic.cues` (`withMark`)، و`null` يزيل علامته. تعيد `{ mark, undo }`، و`undo()` يعيد العلامات كما كانت بكتابة واحدة في الخانة نفسها ما دامت النشطة، وبعد تبديلها يُرفض بـ`ST_CONFLICT` بلا كتابة (التحقق الأخير لـ2.3.0 ص-٢٤ بقرار سلطان). | `ST_NO_RECORD`، `ST_CONFLICT`، `RangeError`، `ST_*` |
| `updatePrefs(patch)` | `store.setPrefs`. | `MD_INVALID`، `ST_*` |
| `editCueText({ index, slot? }, text)` | نص مقطع واحد من النشطة برقمه في `state.arabic.cues` (الفكرة ٦، القرار ح-54 في جولة 2026-11-13، حُسم نيابةً عن سلطان بتفويضه: التحرير السريع في لوحة النص، والتوقيت والدمج والشطر في المحرّر وحده). كتابة حزمة واحدة في الخانة التي يراها المستخدم: يُرفض بـ`ST_CONFLICT` إن تغيّرت مرساة المقطع (الرقم والبداية وبصمة النص) منذ رآه أو زالت الخانة، أو كانت `slot` (الخانة التي رآه فيها، التحقق الأخير لـ2.3.0 ص-٨ بقرار سلطان) غير النشطة، أو صارت النشطة في التخزين غيرها من سياق آخر؛ والنص منقّى كما ينقّي الاستيراد نص المقطع (`typedText` في `src/core/srt/lenient.js`، ص-٢٤)؛ ثم `slotEditTransition` (نسخة حالية بفواصل أسطر LF، ومطابقة الأصل `current = null`، وخطأ توقيت في الملف يرفضها كحفظ المحرّر)، ثم `reanchorMarks` مع `withMarksReplaced` فتبقى علامة المقطع مرتبطة. والنص نفسه لا يُكتب. تعيد `{ undo }`، و`undo()` يكتب النص السابق بالمسار نفسه وبحارس المرساة الجديدة، في الخانة نفسها ما دامت النشطة (وإلا `ST_CONFLICT`). وحارس النص الفارغ وما يكسر SRT في اللوحة قبل الاستدعاء (`cueTextIssue` في `src/player/panel/model.js`). | `ST_NO_RECORD`، `ST_CONFLICT`، `ED_SAVE_HAS_ERRORS`، `MD_INVALID`، `RangeError`، `ST_*` |

`loadArabic` (الإصدار الأول) يبقى: يكتب في النشطة، واستبدالها يحفظ السابقة تلقائيًا عبر `updateVideo`. و`handleStoreChange` يحدّث `prefs` من `change.prefs`. والقفز إلى زمن ليس فعلًا في المتحكم: يتحقق منه معالج الرسائل (§١٤).

**إضافات 2.0.0 (AA3):**

- **في `ControllerState`:** `langPrefs` (تفضيلات اللغات كاملة، تُقرأ في `start` وتتبع `change.langPrefs`)، و`available` (قائمة مسارات الفيديو من المستخرج أو `null`)، و`arabic.lang`.
- **`setSlotLang(n, lang)`:** لغة ترجمة خانة ممتلئة أو `null` «غير محددة» بكتابة حزمة واحدة (`withSlotLang`) بلا مساس بتاريخ التعديل، من قائمة الترجمة في المشغّل. لا أثر أثناء `loading`. الأخطاء `ST_SLOT_EMPTY` و`MD_INVALID` و`ST_*`.
- **`loadArabicInto` بمدخل `lang`:** لغة الملف كما اختارها المستخدم في التأكيد، أو المقترحة.
- **`store.onChange`:** الحدث يحمل `langPrefs: { oldValue, newValue } | null` حين تتغير تفضيلات اللغات من أي سياق (النافذة والإعدادات والمحفوظات والمحرّر والمشغّل يتبعونها).
- **`store.updateBundle(videoId, fn, { expect, touch = true })`:** `touch: false` لكتابة لا تعدّل المحتوى (لغة الترجمة): `rev` يتقدم و`updatedAt` كما كان.
- **`store.listLibrary()`:** كل بند يحمل `pairs`: الزوج اللغوي `{ from, to, via }` لكل خانة (`null` للفارغة) من المُلخّص ومرافق اللغة دون قراءة السجلات (وبالقراءة الكاملة حين يكون للفيديو أكثر من مسار أصل، لأن مسار بصمة الترجمة في السجل)، ويضم إلى `entry.english` مسارات الأصل بغير الإنجليزية من المرافق كما في القراءة الكاملة.
- **أدوات المشغّل:** لا نسخ لتعليمات الترجمة فيها (`exportFlow.instructions` لم يعد يُستدعى من الشريط، و`buildExport` بـ`target: null`)؛ والرفع `readFor({ …, fallbackLang })` بلغة «إلى» في النافذة مقترحةً، تُقبل بلا رمز في الاسم إن وافق نص الملف نص كتابتها (`textFitsLang` في `core/lang`).

## ١٣. مكان حفظ الملفات — `src/core/save/` و`src/background/` (R65)

```js
// src/core/save/index.js
saveFile(file: { name, text, mime? }, deps?) → Promise<{ ok: true, mode: 'downloads' | 'subfolder' | 'ask' | 'blob', downloadId: number | null, pending?: true } | { ok: false, code }>
validateSaveFile(file, { maxChars }) → { ok: true } | { ok: false, code: 'SV_BAD_FILE' | 'SV_TOO_LARGE' }
downloadTarget(saveLocation, name) → { filename, saveAs? }
savedPath(downloadId, { downloads, extensionId }) → Promise<string | null>     // المكان الفعلي لملف نزّله ترجمان (byExtensionId === extensionId)
SAVE_LIMITS = { maxNameChars: 150, maxPageBytes: 536870912, maxMessageChars: 16777216 }   // C7، U55: الصفحات بالبايت (كان maxPageChars: 268435456 وحدة)
SAVE_TYPES = { srt, vtt, txt, md, json }   // النوع من الامتداد وحده؛ vtt: 'text/vtt;charset=utf-8' منذ الفكرة ١١
```

- **ثلاثة مسارات بالدالة نفسها:** الصفحات (فيها `chrome.downloads`) تحفظ مباشرة: `Blob` ورابطه ثم `downloads.download`. وسكربت المحتوى (لا يصل إلى `chrome.downloads`) يرسل `tj:save-file` إلى العامل (عقد الرسائل §٧). وعند تعذّر الواجهة أو القناة يرجع إلى `download` القديم (Blob و`<a download>`) و`mode: 'blob'`، ويعرض المستدعي `SV_FALLBACK_BLOB`. وانقضاء مهلة رد العامل أو انغلاق القناة بعد الإرسال لا يرجع إلى Blob (`SV_NO_REPLY`)، والتنزيل الباقي «جاريًا» بعد مهلة الانتظار `pending: true` فيعرض المستدعي `SV_PENDING`. ومتى صدر معرّف التنزيل فلا بديل Blob إلا بفشل يعلنه المتصفح نفسه (`interrupted`)؛ وتعذّر `search` أو غياب العنصر `SV_UNSETTLED`، والرابط يبقى عشر دقائق كالجاري (تدقيق 7a66f91، U34).
- **الأوضاع** من `prefs.saveLocation` وحدها، يقرؤها `saveFile` في الصفحة أو العامل من التخزين، لا من المستدعي:

| الوضع | `downloads.download` | السلوك |
| --- | --- | --- |
| `downloads` (الافتراضي) | `{ filename: name }` بلا `saveAs` | مجلد التنزيلات، **ويتبع إعداد المتصفح في السؤال** كالتنزيل الحالي. |
| `subfolder` | `{ filename: "‹folder›/‹name›", saveAs: false }` | مجلد فرعي داخل التنزيلات يُنشأ عند الحاجة، ويُحفظ فيه تلقائيًا ما دام إعداد المتصفح «اسأل عن مكان الحفظ» مطفأً (افتراضي المتصفح)؛ ومع تفعيله لا يتجاوزه `saveAs: false` (ما ثبت حيًا). |
| `ask` | `{ filename: name, saveAs: true }` | حوار الحفظ من النظام عند كل تنزيل؛ والإلغاء `SV_CANCELLED`. |

  ودائمًا `conflictAction: 'uniquify'`: **لا كتابة فوق ملف قائم**. وسلوك كل وضع في كل متصفح كما ثبت حيًا في «ما ثبت حيًا» أدناه.
- **التحقق قبل التنزيل:** الاسم 1..150 محرفًا من الحروف (ومنها العربية) والأرقام و`. _ -` والمسافة، بلا فواصل مسار ولا `..` ولا محارف تحكم، ولا يبدأ بنقطة ولا مسافة (ويبدأ بـ`_` أو `-` كما يبدأ معرّف يوتيوب؛ تدقيق 5fedcb9)؛ وامتداده `.srt` أو `.vtt` (الفكرة ١١) أو `.txt` أو `.md` أو `.json`؛ والنوع من الامتداد لا من المستدعي؛ والحجم: عبر العامل حتى `maxMessageChars`، وما فوقه يرجع سكربت المحتوى إلى تنزيل Blob مع إشعار `SV_FALLBACK_BLOB` (لا رفض)؛ ومن الصفحات حتى `maxPageBytes` **بالبايت الفعلي** (`utf8Length`)، وهو حد قراءة النسخة الاحتياطية نفسه (عقد [`backup.md`](backup.md) §١؛ تدقيق 7a66f91، U55، قرار Q28). وإلا `SV_BAD_FILE` أو `SV_TOO_LARGE` (الأخير لحد الصفحات) بلا تنزيل.
- **العامل الخلفي** `src/background/worker.js` (`background.service_worker` في البيان، وفي بناء Firefox صفحة خلفية `background.scripts` من `scripts/targets.mjs`) فيه خمس خدمات لا منطق منتج غيرها: الكاتب الواحد للتخزين (`createStoreService` في `store-service.js`، عقد الرسائل §٨)، والحفظ، وتلميح أيقونة الإضافة بلغة الواجهة (`installActionTitle` في `action-title.js`)، وتثبيت حال صور المحفوظات عند الترقية في Chromium (`installThumbsPin` في `thumbs-pin.js`، و2)، وتمرير أوامر الاختصارات إلى التبويب النشط (`installCommands({ commands, tabs })` في `commands.js`، الفكرة ١٠، عقد الرسائل §٩)، ومستمعه متزامن كمستمعَي الرسائل. **والحفظ** `createSaveService({ runtime, downloads, store })` في `save-service.js` يستمع لـ`tj:save-file`، ويقبلها من سكربت الإضافة وحده (`sender.id` ثم سكربت محتوى على يوتيوب أو صفحة إضافة)، ويقرأ الوضع من التفضيلات، ويتحقق من الملف، ويحفظ النص من رابط `blob:` حيث للخلفية `URL.createObjectURL` (صفحة الخلفية في Firefox، الذي يرفض `data:` في `downloads.download`؛ ويبقيها حية ما دام التنزيل قد يقرأ الرابط، تحقق Gemini، B4)، وإلا من رابط `data:` (عامل الخدمة في Chromium)، ويسجّل المعرّف بـ`store.setLastSave`.
- **الإذن محصور في ملفات ترجمان** (اعتماد سلطان 2026-11-02)، ويفرضه `check-static`:
  - `chrome.downloads` في `src/core/save/**` و`src/background/**` وحدهما.
  - لا يُستدعى منه إلا `download` و`search`، و`search` بالمعرّف وحده `search({ id })` لمعرّف نزّلته الإضافة نفسها (من نتيجة `download` أو `getLastSave`).
  - **«آخر ملف»:** `savedPath` لا يعيد مسارًا إلا لعنصر `byExtensionId` فيه معرّف الإضافة (`runtime.id`)، فلا يُعرض مسار تنزيل آخر صار يحمل الرقم المحفوظ (Firefox يعيد ترقيم السجل كل جلسة، ويفقد `byExtensionId` بعد إعادة التشغيل فيغيب السطر؛ تدقيق 7a66f91، U04).
  - لا `open` ولا `show` ولا `showDefaultFolder` ولا `erase` ولا `removeFile` ولا `cancel` ولا `pause` ولا `resume` ولا `acceptDanger` ولا `getFileIcon` ولا `setUiOptions` ولا `setShelfEnabled` ولا `drag`، ولا مستمع `onCreated` أو `onChanged` أو `onErased` أو `onDeterminingFilename` (تمس كل تنزيلات المتصفح).
- **المكان الفعلي** `savedPath(id)`: من `downloads.search({ id })` لذلك الملف وحده، إن كانت حالته `complete` و`exists`؛ وإلا `null` فلا يُعرض مسار. **لا يُخزَّن مسار**، ولا يدخل التشخيص.
- **البيان:** `permissions` = `storage` و`unlimitedStorage` و`downloads` وحدها (تحذير التثبيت الجديد الوحيد «إدارة التنزيلات»)، و`background: { service_worker: "background/worker.js" }`. لا `tabs` ولا `host_permissions`. ومنذ الفكرة ١٠ `commands` بالأوامر الخمسة، لكلٍّ `description` من رسائل البيان باللغتين وحده، **بلا `suggested_key`** ولا `global` ولا أمر خاص؛ وليس إذنًا ولا يُظهر تحذيرًا، ويفرض شكله `scripts/check-static.mjs` (`COMMAND_NAMES`) في بياني الهدفين، وطبقة Firefox لا تمسه.

### ما ثبت حيًا في P10

إثبات مبكر قبل بناء ما يعتمد عليه (المهمة ٣)، في Brave 1.98 وChrome 156 بملفي اختبار ومجلد تنزيلات داخل ملف الاختبار (`test/live/compat/save-location.mjs`):

| السلوك | Brave | Chrome |
| --- | --- | --- |
| `downloads` من صفحة إضافة ومن المشغّل (عبر العامل): مجلد التنزيلات نفسه الذي ينزّل إليه التنزيل الحالي عبر Blob | ✓ | ✓ |
| `subfolder`: `‹التنزيلات›/Tarjuman/‹الاسم›` تلقائيًا بلا حوار، من الصفحة ومن المشغّل | ✓ | ✓ |
| لا كتابة فوق ملف قائم: الحفظ الثاني بالاسم نفسه `‹الاسم› (1).srt` | ✓ | ✓ |
| `ask`: حوار الحفظ من النظام من الصفحة ومن المشغّل، والملف حيث اختير (نقرة «حفظ» من سلطان) | ✓ | ✓ |
| **الافتراضي يتبع إعداد المتصفح «اسأل عن مكان الحفظ»**: مع تفعيله ينتظر التنزيل الحالي (Blob) والوضع الافتراضي الحوار نفسه، ثم يكتملان | ✓ | ✓ |
| اسم بفاصل مسار يُرفض `SV_BAD_FILE` بلا تنزيل | ✓ | ✓ |
| تحذير التثبيت الجديد الوحيد «إدارة عمليات التنزيل» (`getPermissionWarningsByManifest`) | ✓ | ✓ |
| **(بوابة W6)** مع تفعيل «اسأل عن مكان الحفظ» في المتصفح: `subfolder` يُلغى بلا نافذة `SV_CANCELLED` كالوضع الافتراضي تمامًا، فالمتصفح يطلب الحوار فيهما و`saveAs: false` لا يتجاوز إعداده. لم يُرَ الحوار بنافذة. فـ«تلقائيًا» في نص الإعدادات (P13) مشروطة بإعداد المتصفح. (ملاحظة `browser-asks-subfolder-mode` في `test/live/compat/save-location.mjs`) | ✓ (بلا نافذة) | لم يُختبر |

وبلا نافذة لا يُظهر المتصفح حوار «اسأل» أصلًا، فلوحظ بنافذة ظاهرة وحدها.

## ١٤. القفز إلى زمن الفيديو — `src/ui/seek.js` و`src/content/messages.js` (R56، Q14)

```js
// صفحات الإضافة (المحرّر في P14)
jumpToVideo({ videoId, ms }, { tabs, windows }) → Promise<{ ok: true, via: 'open' | 'new', tabId } | { ok: false, code }>
// youtube-dom
seekMainVideo(ms, { doc }) → boolean          // video.currentTime = ms / 1000 وحده
```

- **بلا إذن `tabs` ولا `host_permissions`:** `tabs.query({})` ثم طلب **معرّف الفيديو وحده** (`tj:get-video-id`، عقد الرسائل §٧؛ تدقيق 7a66f91، U102: كان رد الحالة الكامل بالعنوان واسم الملف وأسماء الخانات) من كل تبويب؛ وحده تبويب يوتيوب فيه سكربت ترجمان يرد بمعرّفه، فيُعرف تبويب الفيديو المفتوح دون قراءة عنوانه. والتبويبات المهملة (`discarded`) خارج السؤال، والحد `MAX_TABS` (200) على **الأحدث استعمالًا** لا على أول ما يعيده المتصفح (كان الفيديو في التبويب 203 يُفتح مكررًا). عند التعدد: الأحدث استعمالًا (`lastAccessed`)، ثم النشط.
- **التبويب المفتوح:** `tabs.update(id, { active: true })` و`windows.update(windowId, { focused: true })` ثم `tj:seek`؛ ورفضه يعيد رمزه.
- **لا تبويب:** `tabs.create({ url: watchUrl(videoId, { atMs: ms }) })` (`&t=<ثوانٍ>s`)، و`via: 'new'`.
- معالج الرسائل في سكربت المحتوى يقبل `tj:seek` بشروط عقد الرسائل §٧، ويغيّر الزمن بـ`seekMainVideo` وحدها.
- **ثبت حيًا (Q14)** في Brave وChrome: **عنوان التبويب لا يُقرأ بأذونات البيان الحالية** (`tabs.query({})` بلا `url` لتبويب يوتيوب، والفلتر `{ url }` يعيد صفرًا)، فلا يُعتمد عليه؛ وسؤال التبويبات وجد تبويب الفيديو المفتوح فانتقل إلى 1:01 دون تغيير حالة التشغيل، ورفض معرّفًا آخر بـ`TJ_WRONG_VIDEO`، وبلا تبويب فتح جديدًا عند `&t=125s`. وتبويب يستعيده المتصفح من جلسة سابقة يُعدّ مفتوحًا (`via: 'open'`).

## ١٥. أساس الواجهة في الإصدار الثاني — `src/ui/`

مكوّنات بنتها P7 وP8 داخل صفحاتهما رُفعت إلى `src/ui` بمعرضها وحالاتها، بالوضعين وRTL. **الصفحات الحالية لم تتغير** (تبقى نسخها المحلية، أو ملفاتها المحيلة إلى `src/ui`)، وصفحات W7 تعتمد المرفوعة حين تلمس موضعها.

| الملف | المكوّن | من |
| --- | --- | --- |
| `menu.js` | `createMenu` — القائمة المنسدلة | المحفوظات (رُفع مع إعادة التصميم) |
| `forms.js` | `segmented` — المقطّعة · `numberField` — حقل الرقم بوحدة · `savedMark` — علامة «حُفظ» | الإعدادات (P7) |
| `toast.js` | `createToaster` — الرسالة العابرة | المحفوظات (P7) |
| `components.js` | `choiceGroup` — مجموعة الخيارات · `chipGroup` — رقائق الفرز · `slotPicker` — اختيار الترجمة 1 2 3 (`TJ/SlotPicker`، مواصفة التصميم §١٩.٢) | إعادة التصميم |
| `seek.js` | `jumpToVideo` (§١٤) | P10 |

- أصناف CSS بالبادئة `tj-` في `components.css`. والتوقيعات كما في الشيفرة، ومعرضها `src/ui/gallery/` (بناء التطوير).
- **تدقيق 7a66f91، C7 (الوصول والتركيز):**
  - `createToaster().show(text, tone, { action?, announce?, focusAfter? })`: الرسالة تثبت ما دام المؤشر أو التركيز فيها وتعيد مهلتها كاملة بعد مغادرتهما (WCAG 2.2.1)، و`announce` نص الإعلان إن خالف المرئي، و`focusAfter` وجهة التركيز إن زالت الرسالة وفيها التركيز (ضغطة «تراجع» أو إزاحتها برابعة) بدل body (U58).
  - **التدقيق الموحد V2، U-042:** آلية الإمساك نفسها في `src/ui/hold.js` (`holdTimer` و`onHold`، وتُصدَّر من `toast.js`) بلا اعتماد على المكوّنات، وعليها رسائل «تراجع» المحلية الثلاث: المشغّل (6 ث، `controls/session.js` و`layer.js`) واللوحة (6 ث، `panel/session.js` و`view.js`) والمحرّر (7 ث، `editor/app.js`، وينتقل التركيز عند زوالها إلى ما كان عليه قبل الرسالة). لا مؤقت يزيل رسالة المؤشر فوقها أو التركيز فيها.
  - `createMenu`: عنوان المجموعة (`{ kind: 'group' }`) عنصر `role="group"` باسمه يضم بنود مجموعته حتى الفاصل التالي، والعنوان المرئي `aria-hidden` (كان `role="presentation"` فلا يصل). و`closeMenuWithin(container)` يغلق القائمة المفتوحة داخل حاوية تُعاد بناؤها فلا يبقى مستمعها على المستند (U58).
  - `confirmDialog`: `aria-labelledby` إلى العنوان، و`aria-describedby` إلى النص أو المحتوى إن لم يكن نص (U51). ويفتح والتركيز على «إلغاء»، إلا إن مُرِّر `focus` عنصرًا داخل محتواه فيُركَّز هو: حوار «لصق ترجمة…» في المحفوظات يفتح على حقل اللصق فيعمل Ctrl+V فورًا (تحقق مستقل، ح-3، قرار سلطان 2026-11-13).
  - `button({ disabledReason })`: السبب في عنصر `aria-hidden` يشير إليه `aria-describedby`، فلا يدخل اسم الزر المحسوب من محتواه (U91؛ ومثله `setDisabled` في المحرّر). والخاصية `value` والسمة معًا.
  - `formatBytes`: الصفر «0 ك.ب»، وما فوق 1024 م.ب «غ.ب» (U59).
  - الشريط العلوي تحت 400px بلا أيقونتي الرابطين وبحشوات أضيق، وتحت 360px يلتف (U86، WCAG 1.4.10).
  - `picker.js` — `pickFiles({ accept, multiple })` منتقي صفحات الإضافة: الحقل ملحق بالمستند مخفيًا خارج Tab ما دام المنتقي مفتوحًا ثم يُزال، و`null` عند الإلغاء (I03: ثبت حيًا أن جمع القمامة يُسقط الحقل غير الملحق فيضيع الاختيار). و`.tj-seg` تلتف إن ضاق عمودها (I09).
  - `track.js` (ح-57 وح-58، 2026-11-14) — `trackDescription(track, { count?, state?, region? })` وصف مسار الأصل الواحد للنافذة وقائمة «تنزيل الأصل» واللوحة باللغتين (`common.track`)، و`roundTripText(via)` بنص سطر الفيديو المترجم إلى لغته وتفصيله.
  - `clipboard.js` — `copyText(text)` (تحقق Gemini، B1): النص الجاهز بـ`writeText` كما كان، ووعد النص (تقرير التشخيص) بـ`clipboard.write` و`ClipboardItem` في النقرة نفسها قبل اكتمال الجمع، فلا يرفضه Chromium إن غادر التركيز أثناء الجمع؛ و`writeText` بعد الجمع احتياطًا حين لا `ClipboardItem` أو يرفضه المتصفح. تستعمله الإعدادات والمحفوظات (`clipboardWrite`، ويقبل النص أو وعده) و«نسخ تشخيص الصفحة» في نافذة الأيقونة.
- `slotPicker` يأخذ `SlotModel[]` من `slotModels(bundle)` أو `state.slots`، والفارغة معطّلة في الاختيار وتصلح هدفًا في حوار الرفع وحده.

## ١٦. واجهات الربط للإصدار الثاني (مثبتة قبل W6)

> منقولة كما ثُبّتت في خطة الإصدار الثاني («واجهات الربط للإصدار الثاني»). تنفّذ P11 توقيعاتها كما هي، وأي حاجة إلى تغييرها طلب مسجّل، والمرحلة متعطلة حتى يحسمه المنسّق. **وعند دمج W6** حسم المنسّق طلبي P11 بإضافتين اختياريتين (`glossary` في `buildPatchPackage` أدناه، و`split.by` في `buildExport` §٥)، ووثّق ما أضافه التنفيذ دون تغيير توقيع في «ما أضافه التنفيذ» آخر هذا القسم؛ ثم جُمِّد كله ببوابة W6. الأنواع غير المذكورة (المقطع، والبصمة، والمسار الإنجليزي، وتقرير المقارنة) كما في عقد البيانات.

**أشكال يتبادلها الطرفان:**

- **مصطلح القاموس:** `{ source: string (1..80), target: string (1..80), note: string | null (≤120) }`، والقاموس حتى 100 مصطلح. تحفظه P10 في تفضيلات الإصدار الثاني (`prefs.glossary.terms`، عقد البيانات §١٤)، وتستهلكه `instructions` في P11.
- **بند تقرير المراجعة:** `{ n, startMs, endMs, problems: string[] (رموز), mark: 'todo' | 'done' | null, text: string | null, english: string | null }`. يبنيه المحرّر (P14) من لوحة المراجعة، ويكتبه `buildReviewReport` في P11. و`mark` من علامة المقطع (عقد البيانات §١٢).

**محرّكات P11 (منطق نقي، لا DOM ولا تخزين):**

```js
// src/core/align
alignCues(a: Cue[], b: Cue[], opts?) → { pairs: { a: number | null, b: number | null }[], confidence: 'high' | 'low', reasons: string[] }
diffTranslations(current: Cue[], incoming: Cue[], opts?) → { aligned: boolean, confidence, counts: { textChanged, timingChanged, added, removed, unchanged }, changes: { n, kind, before, after }[] }
mergeThreeWay({ base, mine, theirs }: { base: Cue[], mine: Cue[], theirs: Cue[] }, opts?)
  → { ok: true, cues: Cue[], kept: number[], taken: number[], conflicts: { n, mine, theirs }[] } | { ok: false, reason: string }

// src/core/compare
rankReferences(cues: Cue[], fingerprints: Fingerprint[]) → { fingerprintId, score, matched, why }[]   // الأفضل أولًا
fingerprintCoverage(fingerprint, cues) → { ok: true, numbersOf, windowOf, pairs, missing, extra, structural } | { ok: false }   // تدقيق 5fedcb9
currentComparison(cues, fingerprint, { driftMs?, coverage? }) → ComparisonReport   // النقص والزيادة والانحراف بالمحاذاة، والباقي من compare؛ ولا matched مع دمج أو شطر (C5، U29)
previewComparison(cues, fingerprint, { settings?, notes? }) → ComparisonReport & { renumbered }   // core/import: معاينة الرفع بالمحاذاة كما بعد الحفظ، وrenumbered حين قابلت المحاذاة أرقامًا غير أرقام التصدير؛ وتقرير الحفظ بالرقم كما هو (تدقيق Fable، FA-04، بقرار سلطان 2026-11-07)
trackComparison(track, fingerprints) → ComparisonReport | null                     // الحاضر لترجمة محفوظة، والمحفوظ بلا مرجع؛ ومنه شارة الصف وملخص المشغّل وسطر نتيجة بطاقة الخانة في المحفوظات (قرار سلطان D-03، تدقيق V2 U-061)
compare(...)   // التوقيع نفسه؛ restoreTimingAvailable لا يصح إلا بمحاذاة متحققة، والسبب في notes

// src/core/import (وsrc/core/srt بالتوقيع نفسه، مع Markdown)
reviewIncoming({ fileName, cues, videoId, fingerprints, knownVideoIds? })
  → { references: ReturnType<rankReferences>, suggested: string | null, certain: boolean, nameHint: null | { videoId: string, differs: boolean } }
readPatch(fileOrFiles, { fingerprint, cues }) → Promise<{ ok: true, plan } | { ok: false, error: { code, message, line? } }>
applyPatch(cues: Cue[], plan, { only?: number[] }) → Cue[]
applyPatchDetailed(cues, plan, { only? }) → { cues: Cue[], renumbered: boolean }   // C5، U96: الترقيم من 1 إن كسر الإدراج تسلسل ترجمة متسلسلة

// src/core/export
instructions({ videoId, title, parts?, glossary? }) → string            // glossary: مصطلحات القاموس أعلاه
// 2.0.0 (AA1): instructions({ videoId, title, source, target, via?, parts?, glossary? }) → string — لغة الملف المرفق واللغة المطلوبة
//   (رمزان صالحان مختلفان وإلا MD_INVALID)، وvia لغة أصل مسار ترجمه يوتيوب آليًا؛ وpatchInstructions({ videoId, title, source, target, glossary? })
//   وglossaryParagraph(glossary, { source, target }) كذلك. وbuildExport يقبل target (اللغة المطلوبة) ويعيد instructions null حين تساوي لغة المسار.
// 2.1.1 (طلب سلطان 2026-11-09): instructions وpatchInstructions تقبلان locale?: 'ar' | 'en' (لغة الواجهة الحالية افتراضيًا)، وglossaryParagraph معاملًا ثالثًا: لغة النص وحدها،
//   العربية الملحقان أ وب والإنجليزية الملحق ج، ولا يمس ذلك source ولا target.
planPartsByContent(cues: Cue[], size: number) → { index, from, to }[] | null   // planParts القديم باقٍ
buildPatchPackage({ videoId, title, fingerprint, englishTracks, numbers, glossary? }) → { ok: true, file: { name, text }, instructions: string, count } | { ok: false, code, params? }   // glossary (W6): فقرة القاموس في instructions وحدها؛ ولا يرمي: EX_PATCH_SOURCE_UNWRITABLE بـparams.list (C5، U79)
buildStudyText({ videoId, title, cues, english?, format: 'txt' | 'md', bilingual: boolean }) → { name, text }
buildReviewReport({ videoId, title, items, includeText: boolean, format: 'txt' | 'md' }) → { name, text }   // items: بنود التقرير أعلاه

// src/core/edit (ملفات المحرّكات الجديدة فقط)
searchCues(cues, query, { field: 'ar' | 'en', english?, wholeWord, ignoreMarks }) → { index, start, end }[]
planReplace(cues, matches, replacement, { only?: number[] }) → { changes: { index, n, before, after }[] }
mergeCues(cues, index) → Cue[] · splitCue(cues, index, at) → Cue[]
driftCorrect(cues, { a: { n, toMs }, b: { n, toMs } }) → { ok: true, cues } | { ok: false, negative: number[] }
readingMetrics(cue) → { cps: number, longestLine: number }
```

**ما تثبّته P10 داخل W6 وتستهلكه W7:** واجهة التخزين بالتوابع وواجهة الاستعادة (عقد التخزين §١٠)، وأفعال المتحكم وحالته الجديدة (§١٢)، ورسالة القفز وأداة الصفحات (§١٤، وعقد الرسائل §٧)، وحلّ ارتباط العلامات (عقد البيانات §١٢)، وصيغة النسخة الاحتياطية ([`backup.md`](backup.md))، ومكان الحفظ: `saveFile(file: { name, text, mime? }) → Promise<{ ok: true, mode, downloadId } | { ok: false, code }>` في `src/core/save` بتفضيل `saveLocation: { mode: 'downloads' | 'subfolder' | 'ask', folder: string }` (§١٣). تُجمَّد كلها ببوابة W6 قبل أن تبدأ W7.

**ما أضافه التنفيذ (P11) دون تغيير توقيع، موثّقًا عند دمج W6:**

- `mergeThreeWay(sides, { align?, resolve? })`: `align` خيارات المحاذاة (و`useText` مفعّل فيه افتراضيًا: النص غير المعدّل مرساة)، و`resolve` اختيار المستخدم لكل تعارض بمفتاحه `key` (`{ [key]: 'mine' | 'theirs' }` أو `Map`)، ولا يُحسم تعارض إلا بقيمة صالحة فيه. و`key` رقم أول مقطع في المنطقة من الأصل `n` ما لم يتكرر هذا الرقم في الأصل، وإلا `"n.k"` لظهوره k (قطعتا شطر محفوظ تحملان رقمًا واحدًا، فلكل منطقة اختيارها؛ تصحيح بعد تدقيق 5fedcb9). وضعف الثقة `{ ok: false, reason }` بنص `CMP_MERGE_LOW_MINE` أو `CMP_MERGE_LOW_THEIRS`.
- `src/core/align`: `ALIGN_DEFAULTS` (`windowMs` 15000، و`maxGroup` 3، و`weakIou` 0.5، و`useText` false، و`offset` `'auto'`)، والمساعدات `iou` و`isIdentity` و`toBlocks`. أسباب المحاذاة رسائل `CMP_ALIGN_…` منسّقة تُعرض كما هي.
- `src/core/compare`: `rankReferences` يكتب `why` برسالة `CMP_REF_MATCHED` أو `CMP_REF_SUMMARY`.
- `src/core/import`: `partsStatus(fingerprint, cues) → { index, from, to, total, received, complete }[] | null` حالة استلام الأجزاء المشتقة (R52)، وهي `plan.parts` في ناتج `readPatch`، و`videoIdFromName(fileName, { videoId?, knownVideoIds? }) → null | { videoId, differs }` قرينة الاسم، و`REVIEW_THRESHOLDS` (`suggest` 0.5، و`certain` 0.8، و`gap` 0.1)، و`classTransitions` و`cuesKey`.
- `src/core/export`: `patchInstructions({ videoId, title, glossary? }) → string` نص الملحق ب، و`glossaryParagraph(terms) → string | null` فقرة القاموس وحدها، و`GLOSSARY_TEMPLATE` و`PATCH_INSTRUCTIONS_TEMPLATE`، و`CONTENT_SPLIT` (`tolerance` 0.15، و`silenceMs` 1500). و`GLOSSARY_LIMITS` هو ثابت نموذج التفضيلات نفسه (`maxTerms` 100، و`maxSource` و`maxTarget` 80، و`maxNote` 120)، يعيد التصدير تصديره ولا يعرّف غيره.
- `src/core/edit/density.js`: `READING_DEFAULTS` (`maxCps` 20، و`maxLineChars` 84 منذ ح7، قرار سلطان ق5 في 2026-11-10، وكان 42) معايرة على مقاطع عربية حقيقية، وهي ما يعنيه `prefs.review.maxCps: null`؛ و`densityIssues(cue, limits?) → ('ED_READING_FAST' | 'ED_LINE_LONG')[]` للوحة المشكلات (P14).
- `src/core/edit`: محرّكات P11 في ملفاتها (`search.js` و`structure.js` و`drift.js` و`density.js`) تُستورد منها مباشرة، و`index.js` القديم لم يُمس.
- الرموز الجديدة في [عقد الأخطاء](errors.md) §٦.

**نقاط ربط تُختبر في بوابة W6:** القاموس من التفضيلات المخزنة عبر `instructions` (P11)، و`reviewIncoming` على بصمات تقرؤها واجهة التخزين (`bundle.record.fingerprints`)، و`diffTranslations` على ترجمتين من خانتين (`bundle.slots[i].track`).

## ١٧. بنية الشيفرة والملكية بعد P10

```text
src/
  manifest.json                     مجمَّد بعد W6: الأذونات storage وunlimitedStorage وdownloads، والعامل الخلفي (ومنذ الفكرة ١٠ commands بلا مفاتيح)
  background/worker.js، save-service.js   مجمَّد بعد W6: العامل الخلفي للحفظ وحده (ثم الكاتب الواحد C2، وأوامر الاختصارات commands.js في الفكرة ١٠، §١٣)
  content/{main,bridge,controller,messages}.js   مجمَّد بعد W6 (§١٢، وعقد الرسائل §٥–§٧)
  core/
    model/                          مجمَّد بعد W6: + slots.js وmarks.js وbundle.js وprefs.js
    store/                          مجمَّد بعد W6: + bundles.js (الحزمة والمصالحة والاستعادة)
    save/                           مجمَّد بعد W6: saveFile (§١٣)
    errors/backup.js                تسجّله P10، وتملؤه P13
    align/ (P11)   backup/ (P13)
  player/youtube-dom.js             + seekMainVideo
  ui/                               + forms.js وtoast.js وseek.js (§١٥)
test/
  helpers/                          + fixtures-v2.js (ثلاث ترجمات وسابقة وعلامات وتفضيلات) ومحاكاة التخزين بالتوابع
  fixtures/v1/                      لقطة مجمّدة من نموذج tj-v1 وتخزينه وأخطائه (لا تُعدَّل)
  integration/compat/               التوافق بالاتجاهين
  live/compat/                      الإثبات الحي للتوافق والرجوع والقفز ومكان الحفظ
```

## ١٨. مراجعة العقد لمراحل W7

| المرحلة | تكتب في | تستهلك (قراءة) | تحتاج ملفًا مشتركًا؟ |
| --- | --- | --- | --- |
| P12 | `player/controls/**`، و`pages/popup/**` | المتحكم (§١٢)، و`saveFile` (§١٣)، و`instructions` بالقاموس، ومحرّكات P11، وردّا الحالة والتشخيص (عقد الرسائل §٥–§٦)، و`slotPicker` و`createToaster` | لا |
| P13 | `pages/library/**`، و`pages/settings/**`، و`core/backup/**`، و`errors/backup.js` | `getBundle` و`updateBundle` وانتقالات الحزمة و`listLibrary` و`restoreVideo` و`bundleBytes` و`getPrefs`/`setPrefs` و`getLastSave` و`savedPath` و`saveFile`، وصيغة `backup.md`، ومحرّكات P11، و`src/ui` | لا |
| P14 | `pages/editor/**`، و`core/edit/**` (عدا محرّكات P11) | `updateBundle` بـ`expect` وانتقالات الخانة والعلامات والموضع، و`resolveMark`، و`jumpToVideo`، و`saveFile`، ومحرّكات P11، و`src/ui` | لا |

## ١٩. خطة 2.2.0 (بقرار سلطان، 2026-11-10)

تغييرات الواجهات المعتمدة في §5 من خطة 2.2.0 (ق2)، كلٌّ ببنده:

- **ح5 — اختيار مرجع المقارنة في المحرّر وحده:** حوار «رفع ترجمة» في المحفوظات (`uploadContent` في `src/pages/library/upload.js`) يعرض المرجع سطرًا: الأقرب الذي يقترحه `review.suggested` بسببه، و«غير مؤكد» حين يتقارب مرجعان، وإحالة إلى المحرّر؛ ولا قائمة. وبطاقة الترجمة (`referenceRow` في `expand.js`) سطر «المرجع» مقروءًا بلا قائمة. وحُذفت `changeReference` من `actions.js` ورمزها `PG_REFERENCE_CHANGED`. والمحرّر يبدّل المرجع كما كان (`withSlotReference`).
- **ف1 — من «ناقص» إلى «أكمِل»:** `pagePath('editor', { v, t?, p? })` يقبل `t` (1..3) و`p` من `EDITOR_PANELS` (`'complete'` وحدها)، وغيرهما `RangeError`. والمحرّر يقرأ `p` بـ`panelParam` ويُفتح على «الاستكمال» (`setSideTab('complete')`) حين في الخانة المفتوحة ناقص أو فارغ أو غير مترجم، وإلا يتجاهله. ونافذة الإضافة: `completeAction(reply, missing)` (العدد من `listIndex()`، `arabic.missing` للنسخة الحاضرة) يعطي «أكمل الناقص (N)»، والبطاقة تقول العدد بدل «تختلف عن الأصل». والمحفوظات: الزر نفسه بجوار شارة الصف وفي سطر نتيجة الترجمة (`env.complete(n)` في `createExpansion`). وقائمة الترجمة في المشغّل: `completeHintLine(comparison)` سطر نصي بلا زر ولا رابط.
- **ف3 — رفع التتمة يُكمل الترجمة:** في `src/core/import/continuation.js`: `findContinuation(bundle, cues) → Continuation | null` تحكم لكل خانة ممتلئة لها بصمة: كل مقطع رقمه وزمنه من البصمة حرفيًا، ولا مقطع متخطًّى (فارغ أو لبنية أو لضعف محاذاة)، ولا نص بلا حرف من لغة الترجمة، وكل استبدال على مقطع فارغ أو غير مترجم (لا تداخل مع ما تُرجم)؛ وتعيد الخانة الوحيدة المتأهلة `{ n, cues, adds, remaining, renumbered, base }`، وأكثر من واحدة لا اقتراح. و`withContinuation(bundle, cont, note, now)` تكتب الناتج نسخة حالية (`withSlotEdit`) وتضيف الملاحظة. وكلتاهما فوق محرّك الاستكمال الموجود: `planPatchCues(cues, { fingerprint, cues, target })` في `patch.js` هي خطة `readPatch` نفسها من مقاطع في الذاكرة. وحوار الرفع في المحفوظات (`prepareUpload` يعيد `continuation`، و`applyContinuation` بـ`expect`) وفي المشغّل (`continuationFor` و`completeInto` في `flows.js`، والخيار `target:complete` في `confirmMenu`) يجعلان «إكمال الترجمة N» المختار حين يُوجد. والمتحكم (§١٢): `completeSlot(cont, note)` يكتب بـ`withContinuation`، ويرفض بـ`ST_CONFLICT` إن تغيّرت ترجمة الخانة عن `cont.base`.
- **ف6 — «المواضع الغامضة» علامات مراجعة:** `parseSrtLenient` يعيد `ambiguous: { numbers, line } | null` حين يكون سطر بعد الملف قائمة أرقام لمقاطع موجودة بوسم يسمّي الغموض أو رقمين فأكثر بلا وسم (`ambiguousNumbers` في `src/core/import/ambiguous.js`)، فلا يُعدّ من أسطر الشرح المزالة، وملاحظته `IM_NOTE_AMBIGUOUS` أول الملاحظات. ونتيجة `readImport` فيها `ambiguous: number[] | null` (أرقام موجودة في الملف المدموج). والتعليم بضغطة: `ambiguousMarks(cues, marks, numbers, now)` علامات «أعود إليه» دون ما عليه علامة، تكتبها `controller.markAmbiguous(numbers, slot)` (§١٢، للخانة التي رُفع إليها الملف، بتراجع دقيق؛ والزر يظهر ما دامت هي المعروضة) في المشغّل، و`markAmbiguous({ store, videoId, n, numbers, now })` في المحفوظات بعد الحفظ.
- **ف4 — تنبيه الملف الطويل قبل الإرسال:** في قائمة «تنزيل الأصل» حين يتجاوز `cueCount` للمسار المختار `settings.export.splitThreshold`: سطر واحد `longFileLine({ count })` بعدد المقاطع، وتفصيله `longFileWhy({ chars })` بطول نصوصها (`fileChars` في `flows.js` من `convertCaptured` بالوضع المختار، مرة لكل مسار ووضع) خلف «لماذا؟» داخل التنبيه (`longWhy` في نموذج القائمة، ح-61). و`fallbackOpen` هو `fallback` وحده: القسم مطوي حتى يفتحه المستخدم (ح-61؛ كان صحيحًا للملف الطويل ويُحترم طيه بـ`fallbackTouched`، وحُذف).
- **ح-61 — أزرار الطي في قائمة «تنزيل الأصل»:** `disclosure(h, act, { name, text, open, controls })` في `menus.js` زر نصي (`button.link`) بـ`aria-expanded` و`aria-controls` و`data-fid` باسم فعله، والتفصيل في الـDOM بسمة `hidden` (`.menu [hidden]` مخفي). وحال كلٍّ في `ui.download` (`longWhy` و`otherOpen` و`roundTrip`) بأفعالها `longWhy` و`otherHow` و`roundTrip`، فتبقى عند إعادة الرسم. ولغات الفيديو الأخرى بعد مسار ملتقط `otherLanguagesFolded`: سطر `otherSummaryLine(n)` وخلف «كيف؟» `otherLanguagesLine(n, { counted: false })` وملاحظة Brave، وفي تفصيل سطر ح-58 حين يكون. وسطر `instructionsNote` بعد `saveLine` ناجح وحده (`LABELS.instructionsNext`).
- **ح-58 — الفيديو المترجم إلى لغته:** نموذج القائمة يحمل `target` («إلى» المحفوظة للفيديو وإلا الافتراضية، `initialPair` على `state.langPrefs`) و`roundTripOpen`، والسطر حين `roundTrip(sel, target)`؛ ونافذة الإضافة من `pairState(...).roundTrip` (لغة المصدر أو `null`) و`roundTripNote` في `view.js`.
- **ف9 — علّم وزامن من صف لوحة النص:** شريط أفعال واحد في القائمة (`createTranscript({ doc, onSeek, onAct, syncReason })` في `src/player/panel/transcript.js`) يُنقل إلى الصف الممرور عليه أو المركّز ويعود إلى صف نقطة Tab، وفيه «علّم للمراجعة» (`aria-pressed`) و«أسمع هذه الآن»، موصوفان بنص صفهما. و`transcript.sync({ …, marks })` يضع `data-mark="todo"` على صفوف «أعود إليه» بعد حلها بمراسيها (`resolveMarks`)، واسم زمن الصف يذكرها؛ ونموذج اللوحة (`derive`) يحمل `marks` للخانة المعروضة من `state.marks`. وجلسة اللوحة: العلامة بـ`controller.markCue({ index }, 'todo' | null)` (§١٢) بتراجعه، والمزامنة بـ`syncOffset` من `src/player/controls/sentence.js` ثم `controller.setOffset` بتراجع للترجمة نفسها وحدها، ومتاحة للصفوف القريبة من لحظة التشغيل (`SYNC_NEAR_ROWS` = 3 صفوف أو `SYNC_NEAR_MS` = 30 ث) ومعطّلة أثناء الإعلان (`CT_AD_SHOWING`). والرسالة داخل اللوحة (`.note`، `role="status"`) بمؤقت `UNDO_MS` يمسكه المؤشر والتركيز. لا زر في شريط المشغّل. **ومنذ الفكرة ٦** (ح-54، جولة 2026-11-13) زر ثالث «عدّل النص» (`data-act="edit"`) يكتب نص مقطع واحد في الملف: `createTranscript({ …, onEdit })` يفتح حقلًا واحدًا (`.edit__field`، و`.edit__save` و`.edit__cancel` و`.edit__msg`) مكان نص الصف بنص المقطع الخام (`openEdit`)، ومرساة الحقل الخانة المعروضة مع مرساة المقطع (`transcript.sync({ …, slot })`، ص-٨)، ويبلّغ `onEdit('save', i, text, { slot })` بالحفظ، و`onEdit('closed', i, '')` بإغلاقه (فتعود المتابعة التي علّقها، ص-٢٤)، و`onEdit('lost', -1, text, { reason })` بعد المزامنة حين يزول وفيه ما كُتب ولم يُحفظ: `'changed'` تغيّر مقطعه من مكان آخر أو تبدّلت الخانة أو حُذفت الترجمة، و`'video'` تغيّر الفيديو، و`'closed'` أُغلقت اللوحة (`transcript.clear(reason)`)؛ والجلسة تنقّي النص (`typedText`) وتفحصه بـ`cueTextIssue(cue, text)` (`model.js`، فحوص `findIssues` على المقطع وحده) ثم تكتب بـ`controller.editCueText({ index, slot }, text)` (§١٢) برسالة «تراجع» لفيديوها وخانتها وحدهما (كتراجع العلامة، `undoStale` و`undoStaleSlot`)، وزر الرسالة بتسميته (`note.label`، «نسخ النص» لما ضاع، برسالة بسببه تظهر حين تُفتح اللوحة إن كانت مغلقة). و`transcript.sync` يحدّث نص الصفوف المتغيرة في مكانها حين تبقى المقاطع بعددها وأرقامها وأزمنتها والأصل نفسه، وإلا يعيد البناء ثم يفتح الحقل على مقطعه بمرساته في خانته نفسها. و`holdsFlow()` يمسك تبديل اللغة ما دام الحقل مفتوحًا (و`mountPanel(...).editing()` حُذفت بلا مستدعٍ، ص-٢٤).
- **ح4 — مفتاح واحد للوحة:** حُذف مفتاح `panelOpen` («مفتوحة في صفحات الفيديو») من «العرض» في `src/pages/settings/view.js` (ومعه `PANEL_OPEN_SWITCH` ونصوص `settings.panelOpenSwitch`)، وبقي `panelEntry` («زر النص المتزامن»). وقيمة `prefs.ui.panelOpen` المحفوظة كما هي، يكتبها زر اللوحة في الشريط وزر الإغلاق فيها. ورأس اللوحة (`createPanelView`): قائمة «⋯» ببندها الواحد صارت زر `hideBtn` مباشرًا (`.hide`، `aria-label` «إخفاء زر اللوحة» وتلميحه أين يعود) يستدعي `on.hide()` برسالة «تراجع» كما كانت، وحُذفت `setMenu` و`parts.menu`/`optsBtn`/`hideItem` و`peek().menu` و`boxes.opts`.
- **ح3 — لا قسم «التوقيت» في الإعدادات:** `SECTIONS` في `src/pages/settings/model.js` بلا `timing` (تسعة أقسام)، وحُذف من `RESETTABLE` (فلا `sectionReset(…, 'timing')`)، و`SECTION_ALIASES` = `{ timing: 'display' }` و`sectionFor(id) → string | null` يحلّان جزء العنوان: الرابط القديم `#timing` يفتح «العرض» ويُكتب `#display`. وحُذف القسم من `view.js` ونصوص `settings.timing` و`settings.sections.timing` باللغتين. وبقيت `parseStep` و`stepText` و`stepChoice` و`STEP_RANGE_MS` (صيغة الخطوة المشتركة في الاختبارات) ورمز `PG_STEP_INVALID` بلا تغيير. والخطوة `settings.offsetStepMs` تُكتب من قائمة التوقيت في المشغّل وتذييل اللوحة، والمحرّر يبدأ بها (`stepMs: settings.offsetStepMs`).
- **ف5 — لصق ناتج النموذج:** نافذة الإضافة: حقل «الصق الترجمة هنا» (حدث `paste` وحده) و`sendPaste({ videoId, text })` في `status.js` برسالة `tj:paste-import` (عقد الرسائل §٧ب). ومقبض الأدوات `mountControls(...).importText(text)` يبدأ خط الرفع نفسه بملف «نص ملصوق». والمحفوظات: أيقونة «لصق ترجمة…» بجانب «تحرير» في الصف (منذ 2026-11-10، وكانت بندًا في «المزيد») بحوار حقله، ثم `upload(m, preferred, files)` بالملف المبني من النص.

