# عقد الواجهات وحدود الوحدات

> **مثبّت في P2 (2026-11-01)، ووسّعته P10 للإصدار الثاني (2026-11-02) ثم جُمِّد.** يحدد أين يعيش كل شيء ومن يملكه وما يستدعيه، فتعمل W3 (P3 وP4 وP5) ثم W4 (P6 وP7 وP8)، ثم W7 (P12 وP13 وP14)، بالتوازي **دون لمس أي ملف مشترك**. §٠–§١١ للإصدار الأول وتبقى صحيحة، و§١٢–§١٨ إضافات الثاني. التوقيعات هنا مطابقة للشيفرة؛ وأي حاجة إلى تغييرها تغيير عقد (المرحلة متعطلة حتى يحسمه المنسّق على `main`).

## ٠. بنية الشيفرة والملكية بعد P2

```text
src/
  manifest.json                    مشترك (مجمَّد): كل نقاط الدخول والأذونات
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

حالة الإصدار الثاني وأفعاله في §١٢؛ وكل ما هنا باقٍ بمعناه وتوقيعه.

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
| `convertCaptured(key, { mode })` | مقاطع مسار ملتقط بوضع التصدير (متزامن) — `ConvertResult` (§٢). | — |
| `updateSettings(patch)` | مثل اختيار الخطوة من قائمة الشارة. | `MD_INVALID`، `ST_*` |
| `dismissNotice()` | متزامن. | — |
| `reload()` | يعيد قراءة سجل الفيديو الحالي. | — |

`start(videoId)` و`setVideo(id)` و`handleStoreChange(change)` يستدعيها `main.js` وحده. تبديل الفيديو يمسح الحالة **ومسارات المستخرج معًا قبل أي إشعار** (`setVideo` يستدعي `extractor.setVideo`)، فلا يظهر شيء من السابق، ثم يحمّل سجل الجديد؛ ونتيجة تحميل قديمة تُهمل، وكتابة تمت أثناء التحميل تُقرأ بعده. وإن تبدّل الفيديو أثناء تحميل الإعدادات في `start` فالأحدث يبقى.

## ٢. المستخرج — `src/extract/index.js` (P3)

أنشأته P2 رقيقًا فوق وحدات P1 بطلب مسجّل، وتملكه P3: تغيّر ما خلفه كما تشاء وتحفظ هذه التوقيعات لأن `main.js` والمتحكم مجمَّدان.

```js
const extractor = createExtractor({ currentVideoId: () => id | null, durationMs: () => ms | null, isLive: () => bool, now? })

extractor.handleMessage(data)        // بيانات MAIN الخام → { accepted: boolean, code: string | null }؛ يتحقق من البنية ثم القبول
extractor.setVideo(videoId)          // عند التنقل: يفرّغ ما لا يخص الفيديو، ويعيد تقييم ما انتظر له (2000ms)
extractor.tracks()                   // TrackInfo[] للفيديو الحالي
extractor.convert(key, { mode })     // ConvertResult؛ نسخة مستقلة كل مرة
extractor.lastRejection()            // { code, at, videoId } | null — ما يخص المستخدم فقط
extractor.subscribe(fn)              // fn() عند أي تغيّر؛ يعيد دالة إلغاء
extractor.diagnostics()              // أعداد ورموز فقط، بلا جسم ولا نص ولا رابط

TrackInfo = { key: "en|manual", lang, kind, capturedAt: "ISO", ok, code, warnings: string[], cueCount, completeness, lastEndMs }
ConvertResult = { ok, code, key, lang, kind, mode: "normal" | "long", cues: Cue[], warnings: string[], report }
```

- `mode: "long"` («مقاطع أطول») نفّذته P3 في W3. الوضعان تحت الثوابت نفسها.
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
- البديلان الحاليان لا يلمسان DOM ويعيدان `state: "stub"`، ويظهر ذلك في رد نافذة الأيقونة (`mounted`) والدخان الحي.
- **الطبقة (P5، والخط والحجم P6):** حاوية Shadow DOM داخل `#movie_player`، و`textContent` فقط، والمظهر من `state.settings.appearance` بما فيه الخط (`font`) والحجم النسبي (`scale`، نسبة فوق الحجم النسبي لارتفاع المشغّل)، والخطوط من ملفات الإضافة (§٩) عبر `FontFace` ببياناتها لا برابطها، وعند التعذّر المراعي المضمّن ثم خط النظام العربي برمز في التشخيص، والإنجليزي للوضع المزدوج من `state.english`، والإعلان والشريط وملء الشاشة عبر `youtube-dom`، والبحث بـ`lookupMs` (عقد التوقيت). تغيّر `state.videoId` يمسح الطبقة فورًا. وإخفاء ترجمة يوتيوب الأصلية بنمط تحقنه الطبقة نفسها على `SELECTORS.captionWindow` ما دامت نشطة.
- **الأدوات (P6):** مجموعة داخل بداية `getRightControls()`، والقوائم داخل `#movie_player`، وعزل الضغطات في الحقول، والرسائل من `messageFor(code)`، والخطوة بـ`controller.updateSettings({ offsetStepMs })`.
- الرموز داخل المشغّل نصًا من `playerTokensCss()` (§٩)، فسكربت المحتوى لا يحمّل ملفات CSS من الإضافة.

## ٤. نقطة الدخول — `src/content/main.js` (مجمَّد)

التركيب وحده، بهذا الترتيب: المستخرج ← الجسر (أولًا، فقد يصل الالتقاط مبكرًا) ← التخزين ← المتحكم ← مراقبة الفيديو (`controller.setVideo`، وهو يبدّل المستخرج معه؛ ثم `extractor.setVideo` تكرارًا آمنًا) ← `store.onChange` ← نقطتا التركيب ← رد نافذة الأيقونة ← `controller.start`. لا منطق منتج فيه.

**نقطة التركيب الثالثة (الهوية «بُنّ على ورق»، قرار سلطان 2026-11-03، [identity-redesign.md §٤](../identity-redesign.md)):** `mounted.panel = mountPanel(controller, env = { doc, win })` من `src/player/panel/index.js`، بمقبض مثل الأخريين: `{ state: "stub" | "waiting" | "mounted" | "error", unmount(), diagnostics(), peek() }`، وتُستدعى مرة عند `document_start` وتنتظر العمود بنفسها. المضيف **أول ابن** في عمود يوتيوب الثانوي (`ytd-watch-flexy #secondary-inner`، وبديله `#secondary`) في صفحات الفيديو وحدها، بـShadow DOM مغلق و`textContent` فقط؛ فيكون يمين الفيديو في التخطيط العريض وتحته في الضيق ووضع المسرح، ولا يغطي الفيديو ولا أدواته. يعاد إلى موضعه إن أعاد يوتيوب رسم العمود، ويُخفى في ملء الشاشة ويُزال بمغادرة صفحة الفيديو. تقرأ حالة المتحكم وتكتب بأفعاله وحدها: `updatePrefs({ ui })` للفتح والإغلاق وإخفاء الزر ونص اللوحة، و`nudgeOffset` و`resetOffset` للإزاحة المشتركة، و`updateSettings({ offsetStepMs })` للخطوة بمسار قائمة التوقيت نفسه، و`reload` لإعادة المحاولة. والمقطع الحالي بـ`indexFor(...).find` و`lookupMs` كالطبقة. ولا يظهر `mounted.panel` في رد نافذة الأيقونة (`messages.js` مجمَّد) بل في `__tarjuman.mounted.panel.diagnostics()` ببناء التطوير.

## ٥. تدفق التصدير — `src/core/export/index.js` (P3)

وحدة نقية تستهلكها الأدوات (P6) والمحفوظات (P7) والمحرّر (P8). تكتب الملفات عبر `src/core/srt` (قراءة).

```js
buildExport({ videoId, title, track: { key, lang, kind, cues }, mode: "normal" | "long", split: null | { size, by?: "count" | "content" } , now })
  → { files: [{ name, text }], fingerprint: Fingerprint, instructions: string, warnings: string[] }   // يرمي TjError(EX_…)
buildArabicExport({ videoId, cues, variant: "current" | "original" }) → { name, text }   // cues بعد exportTiming
fileName({ videoId, lang: "en" | "ar", kind?, mode?, variant?, part? }) → string        // مثل VIDEOID.en.asr.normal.srt
instructions({ videoId, title, parts? }) → string                                     // تعليمات الترجمة: الملحق أ حرفيًا (P7)
describeTrack(trackInfo) → string                                                      // «English – يدوي، 412 مقطعًا»
download(file, { doc? })                                                               // Blob و<a download>، بلا إذن downloads
```

وفي الإصدار الثاني يحل `saveFile` (§١٣) محل `download` في كل تنزيل حين تلمس مراحل W7 موضعه، و`download` باقٍ احتياطه.

- **التقسيم بالمحتوى (إضافة W6 بطلب P11، R60):** `split.by` اختياري؛ `"count"` (الافتراضي) التوزيع المتوازن القديم `planParts`، و`"content"` عند حدود الجمل أو الصمت `planPartsByContent` (§١٦). الأسماء وأجزاء البصمة والضمّ المطابق للملف الكامل كما في التقسيم القديم، وقيمة غيرهما `MD_INVALID`.

- **في المشغّل (P6):** `controller.convertCaptured(key, { mode })` ← `buildExport` ← `download` لكل ملف ← `controller.recordExport({ trackKey: key, fingerprint })`.
- **في الصفحات (P7، P8):** الإنجليزية من المسار المحفوظ بالوضع «عادي» وحده؛ والعربية بـ`exportTiming` (عقد التوقيت §٥) ثم `buildArabicExport`؛ وحفظ أي بصمة بـ`store.updateVideo` و`withExport`.
- البصمة بحسب عقد البيانات §٤، وتُحفظ لكل تصدير.
- **تعليمات الترجمة (من «تهيئة W4»، تنفّذها P7):** نص [الملحق أ في مواصفة المنتج](../product-spec.md#ملحق-أ-تعليمات-الترجمة-المعتمدة) حرفيًا بتعبئته (العنوان في سطر واحد بعد تجريد المحارف الخفية ومحارف التحكم، و«غير متوفر» إن غاب؛ والرابط من المعرّف بعد التحقق منه؛ واستبدال بمرور واحد)، وفقرة الأجزاء عند التقسيم الاحتياطي وحده (`parts`). `buildExport` يمرّر `videoId` و`title`. لا تُعرض داخل الإضافة؛ تنسخها قائمة التحميل (P6) وزر «نسخ» في المحفوظات (P7). وإلى أن تنفّذها P7 يبقى التوقيع القديم `instructions({ count, mode, parts })` في الشيفرة.

## ٦. تدفق الاستيراد والمقارنة — `src/core/import/index.js` و`src/core/compare/index.js` (P4)

```js
readImport(fileOrFiles, { fingerprints: Fingerprint[], settings: Settings })
  → Promise<{ ok: true, fileName, cues: Cue[], comparison: ComparisonReport | null, fingerprintId: string | null, notes: string[], warnings: { code, params? }[] }
          | { ok: false, error: { code, message, line? } }>
compare(cues, fingerprint | null, { driftMs }) → ComparisonReport
previewRestoreTiming(cues, fingerprint) → { available: boolean, changes: [{ n, from: { startMs, endMs }, to: { startMs, endMs } }] }
applyRestoreTiming(cues, fingerprint) → Cue[]          // بعد تأكيد المستخدم فقط؛ يرمي إن لم تُتح
```

- `fileOrFiles` كائنات `File` من `<input type="file">` (في المشغّل أو الصفحات). أكثر من ملف = أجزاء احتياطية تُدمج بالأرقام.
- **اختيار البصمة:** الأحدث بين المطابقة عددًا، وإلا الأحدث؛ ويُسجَّل في `fingerprintId` وفي `comparison.fingerprintId`.
- الناتج الناجح هو مدخل `controller.loadArabic(result, { replace })` في المشغّل، أو `withArabicImport` في المحفوظات. لا كتابة في التخزين داخل وحدة الاستيراد.
- كل تحويل للنص يُذكر في `notes`، ولا تعديل للتوقيت إلا بالاستعادة المؤكدة.
- **في الإصدار الثاني (P11):** `compare` يتيح `restoreTimingAvailable` بمحاذاة هوية متحققة وحدها (§١٦)، وإن طابق العدد والترقيم ولم تتحقق المحاذاة فالسبب `CMP_RESTORE_UNVERIFIED` في `comparison.notes` دون حقل جديد؛ و`readImport` يضم في `comparison.notes` ملاحظات القراءة ثم ملاحظات المقارن. والقارئ يقبل أغلفة Markdown المحددة (السياج ``` أو ~~~، وعلامات التأكيد حول أسطر الأرقام والتوقيت، وأسطر الشرح والعناوين حول الملف) بملاحظة لكلٍّ، ويرفض النص بلا توقيت بـ`IM_NO_TIMING`.

## ٧. محددات يوتيوب — `src/player/youtube-dom.js` (مشترك)

كل اسم داخلي غير رسمي ليوتيوب هنا وحده (R39)؛ والحاجة إلى محدد جديد طلب ملف مشترك.

| التصدير | المحتوى |
| --- | --- |
| `SELECTORS` | `player` (`#movie_player`)، و`video`، و`rightControls`، و`chromeBottom`، و`progressBar`، و`captionWindow`، و`captionSegment`، و`subtitlesButton`، و`liveBadge`، و`inlinePreview` |
| `CLASSES` | `adShowing`، و`adInterrupting`، و`autohide`، و`fullscreen`، و`bigMode`، و`smallMode` |
| `EVENTS` | `navigateStart`، و`navigateFinish` (`yt-navigate-finish`)، و`pageDataUpdated` |
| الدوال | `videoIdFromLocation` (`/watch?v=` و`/live/<id>`؛ لا Shorts)، و`getPlayer`، و`getMainVideo`، و`getRightControls`، و`getChromeBottom`، و`getCaptionContainer`، و`isAdShowing` (الإعلان أو المقاطِع؛ عند الشك إعلان)، و`areControlsHidden`، و`isPlayerFullscreen`، و`mainVideoDurationMs`، و`isLiveNow`، و`displayedCaption`، و`videoTitle`، و`watchCurrentVideo` |

كل دالة تأخذ `doc`/`win` لتُختبر بلا متصفح، ولا تغيّر DOM يوتيوب.

## ٨. صفحات الإضافة وعناوينها

| الصفحة | المسار | تُفتح من | المالك |
| --- | --- | --- | --- |
| نافذة الأيقونة | `pages/popup/index.html` | الأيقونة (`action.default_popup`) | P7 |
| المحفوظات | `pages/library/index.html` | نافذة الأيقونة | P7 |
| الإعدادات | `pages/settings/index.html` | نافذة الأيقونة | P7 |
| المحرّر | `pages/editor/index.html?v=VIDEO_ID` | نافذة الأيقونة والمحفوظات | P8 |

- المسارات من `PAGES` و`pagePath(name, { v })` في `src/core/model/ids.js`، والفتح بـ`openPage(name, params)` في `src/ui/page.js` (`chrome.tabs.create`)، وقراءة `v` بـ`videoParam(location.search)`. «فتح الفيديو» بـ`watchUrl(id)` وحده.
- **هيكل الصفحة:** مجلد فيه `index.html` (يربط `../../ui/tokens.css` و`base.css` و`components.css` ثم `<script src="main.js">`) و`main.js` نقطة دخول يجمّعها البناء مع ما تستورده، وأي ملفات CSS محلية تُنسخ تلقائيًا. صفحة واحدة لكل مجلد؛ لا صفحة جديدة دون تغيير البيان (عقد).
- الصفحات لا تراسل المشغّل إلا بطلب حالة الفيديو (عقد الرسائل)، ولا طلبات شبكة منها أبدًا (فحص ثابت).

## ٩. أساس الواجهة — `src/ui/` (مشترك)

| الملف | المحتوى |
| --- | --- |
| `tokens.css` | ألوان `Pages` بالوضعين (§٣.١ من مواصفة التصميم) بالبادئة `--tj-`، والخطوط وبدائلها، والمسافات والزوايا والظلال والحركة. الوضع يتبع النظام، و`data-theme` يفرضه. |
| `base.css` | RTL، وسلّم الخطوط (`tj-display`…`tj-mono-sm`)، و`tj-ltr` لعزل الأزمنة والمعرّفات، والحاويات، وحلقة التركيز، وتقليل الحركة. |
| `components.css` و`components.js` | `button` (أربعة أنواع وثلاثة مقاسات، والتحميل، و«معطّل بسبب»)، و`field` (تسمية وتلميح وخطأ، وLTR أحادي للأرقام)، و`confirmDialog` (`<dialog>`، Esc إلغاء)، و`alertBox` (أربع نبرات)، و`emptyState`، و`statusPill` (ست نبرات)، و`el` و`ltr` و`icon`. DOM وtextContent فقط. |
| `format.js` | `formatOffset` (`+0.5` `−1.0` `0.0`)، و`formatTimecode` (`HH:MM:SS,mmm`)، و`formatCount` بصيغ `COUNT_FORMS` («مقطع واحد»، «مقطعان»، «3 مقاطع»، «11 مقطعًا»)، و`formatBytes`. |
| `player-tokens.js` | رموز `Player` (§٣.٢) و`playerTokensCss(selector)` لطبقة العرض والأدوات. |
| `page.js` | `startPage({ title, render })` بحدّ أخطاء، و`openPage`، و`extensionVersion`. |
| `subtitle-fonts.js` | بيانات خطوط الترجمة فوق الفيديو وحدها (من «تهيئة W4»): لكل خط معرّفه (`SUBTITLE_FONTS` في نموذج الإعدادات)، واسمه العربي واللاتيني، واسم عائلة فريد داخل الإضافة، وملفّا وزنيه 400 و700، وسلسلة البدائل (المراعي المضمّن ثم خطوط النظام العربية). بلا DOM. |
| `fonts/subtitle/` | ملفات WOFF2 للخطوط الأربعة بوزنين مع رخصة OFL لكل عائلة، من مستودع Google Fonts الرسمي. تُعلن في `web_accessible_resources` لملفات `.woff2` وحدها على يوتيوب بـ`use_dynamic_url`، ولا تُحمَّل من الشبكة. |
| `gallery/` | معرض المكوّنات بحالاتها، في بناء التطوير وحده. |

خطوط الواجهة بالاسم مع بدائلها، مثبّتة على الجهاز؛ لا تُحمَّل من الشبكة. خطوط الترجمة وحدها مضمّنة في الإضافة (`fonts/subtitle/`) ولا تغيّر خطوط الواجهة. المكوّن الجديد يُبنى داخل صفحة مرحلته، ثم يُرفع إلى `src/ui` بطلب.

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
| `markCue({ index }, kind = "todo")` | يعلّم مقطع النشطة برقمه في `state.arabic.cues` (`withMark`)، و`null` يزيل علامته. تعيد `{ mark, undo }`، و`undo()` يعيد العلامات كما كانت بكتابة واحدة. | `ST_NO_RECORD`، `RangeError`، `ST_*` |
| `updatePrefs(patch)` | `store.setPrefs`. | `MD_INVALID`، `ST_*` |

`loadArabic` (الإصدار الأول) يبقى: يكتب في النشطة، واستبدالها يحفظ السابقة تلقائيًا عبر `updateVideo`. و`handleStoreChange` يحدّث `prefs` من `change.prefs`. والقفز إلى زمن ليس فعلًا في المتحكم: يتحقق منه معالج الرسائل (§١٤).

## ١٣. مكان حفظ الملفات — `src/core/save/` و`src/background/` (R65)

```js
// src/core/save/index.js
saveFile(file: { name, text, mime? }, deps?) → Promise<{ ok: true, mode: 'downloads' | 'subfolder' | 'ask' | 'blob', downloadId: number | null, pending?: true } | { ok: false, code }>
validateSaveFile(file, { maxChars }) → { ok: true } | { ok: false, code: 'SV_BAD_FILE' | 'SV_TOO_LARGE' }
downloadTarget(saveLocation, name) → { filename, saveAs? }
savedPath(downloadId, { downloads }) → Promise<string | null>     // المكان الفعلي لملف نزّله ترجمان
SAVE_LIMITS = { maxNameChars: 150, maxPageChars: 268435456, maxMessageChars: 16777216 }
```

- **ثلاثة مسارات بالدالة نفسها:** الصفحات (فيها `chrome.downloads`) تحفظ مباشرة: `Blob` ورابطه ثم `downloads.download`. وسكربت المحتوى (لا يصل إلى `chrome.downloads`) يرسل `tj:save-file` إلى العامل (عقد الرسائل §٧). وعند تعذّر الواجهة أو القناة يرجع إلى `download` القديم (Blob و`<a download>`) و`mode: 'blob'`، ويعرض المستدعي `SV_FALLBACK_BLOB`. وانقضاء مهلة رد العامل لا يرجع إلى Blob (`SV_NO_REPLY`)، والتنزيل الباقي «جاريًا» بعد مهلة الانتظار `pending: true` فيعرض المستدعي `SV_PENDING`.
- **الأوضاع** من `prefs.saveLocation` وحدها، يقرؤها `saveFile` في الصفحة أو العامل من التخزين، لا من المستدعي:

| الوضع | `downloads.download` | السلوك |
| --- | --- | --- |
| `downloads` (الافتراضي) | `{ filename: name }` بلا `saveAs` | مجلد التنزيلات، **ويتبع إعداد المتصفح في السؤال** كالتنزيل الحالي. |
| `subfolder` | `{ filename: "‹folder›/‹name›", saveAs: false }` | مجلد فرعي داخل التنزيلات يُنشأ عند الحاجة، ويُحفظ فيه تلقائيًا ما دام إعداد المتصفح «اسأل عن مكان الحفظ» مطفأً (افتراضي المتصفح)؛ ومع تفعيله لا يتجاوزه `saveAs: false` (ما ثبت حيًا). |
| `ask` | `{ filename: name, saveAs: true }` | حوار الحفظ من النظام عند كل تنزيل؛ والإلغاء `SV_CANCELLED`. |

  ودائمًا `conflictAction: 'uniquify'`: **لا كتابة فوق ملف قائم**. وسلوك كل وضع في كل متصفح كما ثبت حيًا في «ما ثبت حيًا» أدناه.
- **التحقق قبل التنزيل:** الاسم 1..150 محرفًا من الحروف (ومنها العربية) والأرقام و`. _ -` والمسافة، بلا فواصل مسار ولا `..` ولا محارف تحكم، ولا يبدأ بنقطة ولا مسافة (ويبدأ بـ`_` أو `-` كما يبدأ معرّف يوتيوب؛ تدقيق 5fedcb9)؛ وامتداده `.srt` أو `.txt` أو `.md` أو `.json`؛ والنوع من الامتداد لا من المستدعي؛ والحجم حتى `maxMessageChars` عبر العامل و`maxPageChars` من الصفحات. وإلا `SV_BAD_FILE` أو `SV_TOO_LARGE` بلا تنزيل.
- **العامل الخلفي** `src/background/worker.js` (`background.service_worker` في البيان) **للحفظ وحده**: `createSaveService({ runtime, downloads, store })` في `save-service.js` يستمع لـ`tj:save-file`، ويقبلها من سكربت الإضافة وحده (`sender.id` ثم سكربت محتوى على يوتيوب أو صفحة إضافة)، ويقرأ الوضع من التفضيلات، ويتحقق من الملف، ويحفظ النص في رابط `data:` (لا `URL.createObjectURL` في العامل)، ويسجّل المعرّف بـ`store.setLastSave`. لا منطق آخر فيه.
- **الإذن محصور في ملفات ترجمان** (اعتماد سلطان 2026-11-02)، ويفرضه `check-static`:
  - `chrome.downloads` في `src/core/save/**` و`src/background/**` وحدهما.
  - لا يُستدعى منه إلا `download` و`search`، و`search` بالمعرّف وحده `search({ id })` لمعرّف نزّلته الإضافة نفسها (من نتيجة `download` أو `getLastSave`).
  - لا `open` ولا `show` ولا `showDefaultFolder` ولا `erase` ولا `removeFile` ولا `cancel` ولا `pause` ولا `resume` ولا `acceptDanger` ولا `getFileIcon` ولا `setUiOptions` ولا `setShelfEnabled` ولا `drag`، ولا مستمع `onCreated` أو `onChanged` أو `onErased` أو `onDeterminingFilename` (تمس كل تنزيلات المتصفح).
- **المكان الفعلي** `savedPath(id)`: من `downloads.search({ id })` لذلك الملف وحده، إن كانت حالته `complete` و`exists`؛ وإلا `null` فلا يُعرض مسار. **لا يُخزَّن مسار**، ولا يدخل التشخيص.
- **البيان:** `permissions` = `storage` و`unlimitedStorage` و`downloads` وحدها (تحذير التثبيت الجديد الوحيد «إدارة التنزيلات»)، و`background: { service_worker: "background/worker.js" }`. لا `tabs` ولا `host_permissions`.

### ما ثبت حيًا في P10

إثبات مبكر قبل بناء ما يعتمد عليه (المهمة ٣)، في Brave 1.98 وChrome 156 بملفي اختبار ومجلد تنزيلات داخل ملف الاختبار؛ الأدلة [`save-location-*.json`](../evidence/P10/):

| السلوك | Brave | Chrome |
| --- | --- | --- |
| `downloads` من صفحة إضافة ومن المشغّل (عبر العامل): مجلد التنزيلات نفسه الذي ينزّل إليه التنزيل الحالي عبر Blob | ✓ | ✓ |
| `subfolder`: `‹التنزيلات›/Tarjuman/‹الاسم›` تلقائيًا بلا حوار، من الصفحة ومن المشغّل | ✓ | ✓ |
| لا كتابة فوق ملف قائم: الحفظ الثاني بالاسم نفسه `‹الاسم› (1).srt` | ✓ | ✓ |
| `ask`: حوار الحفظ من النظام من الصفحة ومن المشغّل، والملف حيث اختير (نقرة «حفظ» من سلطان) | ✓ | ✓ |
| **الافتراضي يتبع إعداد المتصفح «اسأل عن مكان الحفظ»**: مع تفعيله ينتظر التنزيل الحالي (Blob) والوضع الافتراضي الحوار نفسه، ثم يكتملان | ✓ | ✓ |
| اسم بفاصل مسار يُرفض `SV_BAD_FILE` بلا تنزيل | ✓ | ✓ |
| تحذير التثبيت الجديد الوحيد «إدارة عمليات التنزيل» (`getPermissionWarningsByManifest`) | ✓ | ✓ |
| **(بوابة W6)** مع تفعيل «اسأل عن مكان الحفظ» في المتصفح: `subfolder` يُلغى بلا نافذة `SV_CANCELLED` كالوضع الافتراضي تمامًا، فالمتصفح يطلب الحوار فيهما و`saveAs: false` لا يتجاوز إعداده. لم يُرَ الحوار بنافذة. فـ«تلقائيًا» في نص الإعدادات (P13) مشروطة بإعداد المتصفح. ([`save-location-brave.json`](../evidence/W6/save-location-brave.json)، ملاحظة `browser-asks-subfolder-mode`) | ✓ (بلا نافذة) | لم يُختبر |

وبلا نافذة لا يُظهر المتصفح حوار «اسأل» أصلًا، فلوحظ بنافذة ظاهرة وحدها.

## ١٤. القفز إلى زمن الفيديو — `src/ui/seek.js` و`src/content/messages.js` (R56، Q14)

```js
// صفحات الإضافة (المحرّر في P14)
jumpToVideo({ videoId, ms }, { tabs, windows }) → Promise<{ ok: true, via: 'open' | 'new', tabId } | { ok: false, code }>
// youtube-dom
seekMainVideo(ms, { doc }) → boolean          // video.currentTime = ms / 1000 وحده
```

- **بلا إذن `tabs` ولا `host_permissions`:** `tabs.query({})` ثم طلب حالة الفيديو (`tj:get-video-state`) من كل تبويب؛ وحده تبويب يوتيوب فيه سكربت ترجمان يرد بمعرّفه، فيُعرف تبويب الفيديو المفتوح دون قراءة عنوانه. عند التعدد: الأحدث استعمالًا (`lastAccessed`)، ثم النشط.
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
- `slotPicker` يأخذ `SlotModel[]` من `slotModels(bundle)` أو `state.slots`، والفارغة معطّلة في الاختيار وتصلح هدفًا في حوار الرفع وحده.

## ١٦. واجهات الربط للإصدار الثاني (مثبتة قبل W6)

> منقولة كما ثُبّتت في [الموجات](../delivery/waves.md) («واجهات الربط للإصدار الثاني»). تنفّذ P11 توقيعاتها كما هي، وأي حاجة إلى تغييرها طلب مسجّل، والمرحلة متعطلة حتى يحسمه المنسّق. **وعند دمج W6** حسم المنسّق طلبي P11 بإضافتين اختياريتين (`glossary` في `buildPatchPackage` أدناه، و`split.by` في `buildExport` §٥)، ووثّق ما أضافه التنفيذ دون تغيير توقيع في «ما أضافه التنفيذ» آخر هذا القسم؛ ثم جُمِّد كله ببوابة W6. الأنواع غير المذكورة (المقطع، والبصمة، والمسار الإنجليزي، وتقرير المقارنة) كما في عقد البيانات.

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
currentComparison(cues, fingerprint, { driftMs?, coverage? }) → ComparisonReport   // النقص والزيادة والانحراف بالمحاذاة، والباقي من compare
trackComparison(track, fingerprints) → ComparisonReport | null                     // الحاضر لترجمة محفوظة، والمحفوظ بلا مرجع
compare(...)   // التوقيع نفسه؛ restoreTimingAvailable لا يصح إلا بمحاذاة متحققة، والسبب في notes

// src/core/import (وsrc/core/srt بالتوقيع نفسه، مع Markdown)
reviewIncoming({ fileName, cues, videoId, fingerprints, knownVideoIds? })
  → { references: ReturnType<rankReferences>, suggested: string | null, certain: boolean, nameHint: null | { videoId: string, differs: boolean } }
readPatch(fileOrFiles, { fingerprint, cues }) → Promise<{ ok: true, plan } | { ok: false, error: { code, message, line? } }>
applyPatch(cues: Cue[], plan, { only?: number[] }) → Cue[]

// src/core/export
instructions({ videoId, title, parts?, glossary? }) → string            // glossary: مصطلحات القاموس أعلاه
planPartsByContent(cues: Cue[], size: number) → { index, from, to }[] | null   // planParts القديم باقٍ
buildPatchPackage({ videoId, title, fingerprint, englishTracks, numbers, glossary? }) → { ok: true, file: { name, text }, instructions: string, count } | { ok: false, code }   // glossary (W6): فقرة القاموس في instructions وحدها
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
- `src/core/edit/density.js`: `READING_DEFAULTS` (`maxCps` 20، و`maxLineChars` 42) معايرة على مقاطع عربية حقيقية، وهي ما يعنيه `prefs.review.maxCps: null`؛ و`densityIssues(cue, limits?) → ('ED_READING_FAST' | 'ED_LINE_LONG')[]` للوحة المشكلات (P14).
- `src/core/edit`: محرّكات P11 في ملفاتها (`search.js` و`structure.js` و`drift.js` و`density.js`) تُستورد منها مباشرة، و`index.js` القديم لم يُمس.
- الرموز الجديدة في [عقد الأخطاء](errors.md) §٦.

**نقاط ربط تُختبر في بوابة W6:** القاموس من التفضيلات المخزنة عبر `instructions` (P11)، و`reviewIncoming` على بصمات تقرؤها واجهة التخزين (`bundle.record.fingerprints`)، و`diffTranslations` على ترجمتين من خانتين (`bundle.slots[i].track`).

## ١٧. بنية الشيفرة والملكية بعد P10

```text
src/
  manifest.json                     مجمَّد بعد W6: الأذونات storage وunlimitedStorage وdownloads، والعامل الخلفي
  background/worker.js، save-service.js   مجمَّد بعد W6: العامل الخلفي للحفظ وحده
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
