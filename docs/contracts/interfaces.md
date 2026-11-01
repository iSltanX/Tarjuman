# عقد الواجهات وحدود الوحدات

> **مثبّت في P2 (2026-11-01) ومجمَّد.** يحدد أين يعيش كل شيء ومن يملكه وما يستدعيه، فتعمل W3 (P3 وP4 وP5) ثم W4 (P6 وP7 وP8) بالتوازي **دون لمس أي ملف مشترك**. التوقيعات هنا مطابقة للشيفرة؛ وأي حاجة إلى تغييرها تغيير عقد (المرحلة متعطلة حتى يحسمه المنسّق على `main`).

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

- `mode: "long"` يعيد الآن `TJ_NOT_IMPLEMENTED` حتى تنفّذه P3. الوضعان تحت الثوابت نفسها.
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
- **الطبقة (P5):** حاوية Shadow DOM داخل `#movie_player`، و`textContent` فقط، والمظهر من `state.settings.appearance`، والإنجليزي للوضع المزدوج من `state.english`، والإعلان والشريط وملء الشاشة عبر `youtube-dom`، والبحث بـ`lookupMs` (عقد التوقيت). تغيّر `state.videoId` يمسح الطبقة فورًا. وإخفاء ترجمة يوتيوب الأصلية بنمط تحقنه الطبقة نفسها على `SELECTORS.captionWindow` ما دامت نشطة.
- **الأدوات (P6):** مجموعة داخل بداية `getRightControls()`، والقوائم داخل `#movie_player`، وعزل الضغطات في الحقول، والرسائل من `messageFor(code)`، والخطوة بـ`controller.updateSettings({ offsetStepMs })`.
- الرموز داخل المشغّل نصًا من `playerTokensCss()` (§٩)، فسكربت المحتوى لا يحمّل ملفات CSS من الإضافة.

## ٤. نقطة الدخول — `src/content/main.js` (مجمَّد)

التركيب وحده، بهذا الترتيب: المستخرج ← الجسر (أولًا، فقد يصل الالتقاط مبكرًا) ← التخزين ← المتحكم ← مراقبة الفيديو (`controller.setVideo`، وهو يبدّل المستخرج معه؛ ثم `extractor.setVideo` تكرارًا آمنًا) ← `store.onChange` ← نقطتا التركيب ← رد نافذة الأيقونة ← `controller.start`. لا منطق منتج فيه.

## ٥. تدفق التصدير — `src/core/export/index.js` (P3)

وحدة نقية تستهلكها الأدوات (P6) والمحفوظات (P7) والمحرّر (P8). تكتب الملفات عبر `src/core/srt` (قراءة).

```js
buildExport({ videoId, title, track: { key, lang, kind, cues }, mode: "normal" | "long", split: null | { size } , now })
  → { files: [{ name, text }], fingerprint: Fingerprint, instructions: string, warnings: string[] }   // يرمي TjError(EX_…)
buildArabicExport({ videoId, cues, variant: "current" | "original" }) → { name, text }   // cues بعد exportTiming
fileName({ videoId, lang: "en" | "ar", kind?, mode?, variant?, part? }) → string        // مثل VIDEOID.en.asr.normal.srt
instructions({ count, mode }) → string                                                // نص تعليمات النموذج العربي
describeTrack(trackInfo) → string                                                      // «English – يدوي، 412 مقطعًا»
download(file, { doc? })                                                               // Blob و<a download>، بلا إذن downloads
```

- **في المشغّل (P6):** `controller.convertCaptured(key, { mode })` ← `buildExport` ← `download` لكل ملف ← `controller.recordExport({ trackKey: key, fingerprint })`.
- **في الصفحات (P7، P8):** الإنجليزية من المسار المحفوظ بالوضع «عادي» وحده؛ والعربية بـ`exportTiming` (عقد التوقيت §٥) ثم `buildArabicExport`؛ وحفظ أي بصمة بـ`store.updateVideo` و`withExport`.
- البصمة بحسب عقد البيانات §٤، وتُحفظ لكل تصدير.

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
| `gallery/` | معرض المكوّنات بحالاتها، في بناء التطوير وحده. |

الخطوط بالاسم مع بدائلها، مثبّتة على الجهاز؛ لا تُحمَّل من الشبكة. المكوّن الجديد يُبنى داخل صفحة مرحلته، ثم يُرفع إلى `src/ui` بطلب.

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
| P6 | `player/controls/**` (ومنه `index.js`)، و`errors/controls.js`، و`test/integration/player` | المتحكم وأفعاله، و`core/export` و`core/import`، و`youtube-dom`، و`src/ui/format.js`، و`playerTokensCss` | لا |
| P7 | `pages/{popup,library,settings}`، و`errors/pages.js` | التخزين، والانتقالات، والرسائل، و`core/export` و`core/import`، و`src/ui`، والتشخيص | لا |
| P8 | `pages/editor`، و`core/edit`، و`errors/editor.js` | التخزين (`expect`)، والتوقيت والانتقالات، و`core/compare` (الاستعادة)، و`core/export`، و`src/ui` | لا |

ما قد يُطلب لاحقًا بمسار الاستثناء (لم يظهر حاجة إليه الآن): محدد يوتيوب جديد في `youtube-dom.js`، أو رفع مكوّن من صفحة إلى `src/ui`.
