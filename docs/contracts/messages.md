# عقد الرسائل

> **مثبّت في P2 (2026-11-01)، ووسّعته P10 للإصدار الثاني (2026-11-02) ثم جُمِّد.** المسارات ثلاثة في الإصدار الأول (§١–§٣)، ويضيف الثاني ثلاث رسائل محددة (§٥–§٧)؛ وكلها بيانات أو طلبات مقيّدة، لا أوامر عامة. **وأضافت C2 (تدقيق 7a66f91، قرار سلطان Q15، 2026-11-05) رسالة الكاتب الواحد `tj:store` (§٨).** **وأضافت الفكرة ١٠ (القرار ح-55 في جولة 2026-11-13، حُسم نيابةً عن سلطان بتفويضه) رسالة الأمر `tj:command` من العامل الخلفي إلى سكربت المحتوى (§٩)، والأولى في هذا الاتجاه.** الشيفرة: `src/content/bridge.js` و`src/content/messages.js` و`src/core/model/messages.js` و`src/background/commands.js`، واختباراتها `test/unit/content/page-boundary.test.js`.

## ١. MAIN → ISOLATED (الالتقاط)

- سكربت `src/main-world/capture.js` يرسل بـ`window.postMessage(…, origin)` رسالة الالتقاط بحقولها في [عقد الاستخراج](extraction.md).
- الجسر (`installBridge`) يقبل الحدث فقط إن كان `event.source === window` و`event.origin` أصل الصفحة نفسه و`data.source === "tarjuman"`، ويمرّر `data` **خامًا** إلى `extractor.handleMessage(data)`؛ والتحقق من البنية والأنواع داخل المستخرج (`validateCaptureMessage`، P3). البيانات غير موثوقة دائمًا.
- **اتجاه واحد:** الإضافة لا ترسل إلى الصفحة شيئًا أبدًا، ولا تقبل منها أوامر.

## ٢. نافذة الأيقونة ← سكربت المحتوى (حالة الفيديو)

طلب واحد فقط، ترسله نافذة الأيقونة إلى سكربت المحتوى في التبويب النشط:

```js
// الطلب
chrome.tabs.sendMessage(tabId, { type: "tj:get-video-state", v: 1 })   // videoStateRequest()

// الرد (buildVideoStateReply) — أعداد وملخصات، بلا نص مقاطع
{
  v: 1, ok: true,
  watch: true,                       // صفحة مشاهدة بمعرّف صالح
  videoId: "iG9CE55wbtY" | null, title: "…" | null, loading: false,
  english: {
    captured: [{ key: "en|manual", kind: "manual", cueCount: 427, ok: true }],   // التقاط هذه الجلسة
    saved: [{ key: "en|manual", kind: "manual", cueCount: 427 }]                 // المحفوظ في السجل
  },
  arabic: null | { fileName: "…", cueCount: 425, edited: false, matched: false | true | null },
  view: { displayOffsetMs: 500, displayMode: "ar" | "dual" | "off" },
  mounted: { overlay: "stub" | "waiting" | "mounted" | "error" | "none", controls: "…" }
}
```

- سكربت المحتوى يرد **فقط** إن كان المرسِل صفحة من الإضافة نفسها (`sender.id === chrome.runtime.id` وعنوانه يبدأ بـ`chrome.runtime.getURL("")`) والطلب بالنوع والإصدار (`isExtensionPage` و`isVideoStateRequest`)؛ وما عدا ذلك يُتجاهل بلا رد.
- النافذة تتحقق من الرد (`isVideoStateReply`) قبل عرضه. **لا رد** (رفض «Receiving end does not exist»، أو تبويب ليس يوتيوب، أو نسخة أقدم، أو لا رد في المهلة) يُميَّز بعنوان التبويب حين يكشفه المتصفح (تدقيق 7a66f91، Q31؛ `queryPopupState`): صفحة على `https://www.youtube.com/` بلا رد صالح «أعد تحميلها» (`TJ_RELOAD_PAGE`: فُتحت قبل التثبيت أو التحديث، وChromium لا يحقن سكربتات البيان في التبويبات المفتوحة)، وغير يوتيوب «افتح فيديو على يوتيوب»، وبلا عنوان مكشوف الاحتمالان في جملة (`TJ_OPEN_OR_RELOAD`). وفي Chromium لا يُكشف العنوان بأذونات البيان (عقد الواجهات §١٤)، فالجملة الجامعة هي ما يظهر فيه. **وقبلهما** (تحقق Gemini، B5-أ)، حين لا رد والتبويب يوتيوب أو مجهول: `chrome.permissions.contains({ origins: ["https://www.youtube.com/*"] })`، فإن كان `false` (سحب Firefox الإذن، أو «الوصول إلى المواقع» في Chromium عند النقر) فالنص `TJ_SITE_ACCESS_OFF` (`miss: "siteOff"`): الإذن مطفأ، ويُعاد من صفحة إضافات المتصفح ثم يُعاد تحميل صفحة الفيديو. وتحت النص منذ الفكرة ٣-أ زر «امنح الإذن من الإعدادات» (`missAction` ← `{ hash: "diagnostics" }`) يفتح الإعدادات على «التشخيص»، وفيه «الوصول إلى يوتيوب» وزر «السماح» الذي يعيد طلب الإذن نفسه (`requestYoutubeAccess` في `core/consent/youtube-access.js`)؛ والنافذة لا تطلب إذنًا. وغياب الواجهة أو رفضها أو تأخرها لا يغيّر الحالة. ولا إذن جديد (`permissions.contains` لا يحتاج إذنًا).
- `chrome.tabs.query({ active: true, lastFocusedWindow: true })` و`chrome.tabs.sendMessage` و`chrome.tabs.create` لا تحتاج إذن `tabs`.
- `mounted` حالة نقطتي التركيب للتشخيص والدخان الحي (عقد الواجهات §٣).
- **ثبت حيًا في P2** في Brave وChrome: نافذة الأيقونة وجدت تبويب يوتيوب النشط وتلقت الرد بالمعرّف و`mounted: stub`.

## ٣. الصفحات ↔ المشغّل: التخزين وحده

- لا رسائل مباشرة. الصفحة تكتب بالتخزين (عقد التخزين §٦، والكتابة نفسها عبر الكاتب الواحد في العامل الخلفي §٨)، والمتحكم في كل تبويب يوتيوب يسمع `store.onChange` فيعيد قراءة سجل فيديوه أو إعداداته (`controller.handleStoreChange`). **ثبت حيًا في P2** (Brave وChrome): سجل كُتب من صفحة إضافة ظهر في رد المشغّل خلال ثانية (`storage-change-reaches-player`).
- صدى كتابات المتحكم نفسه يُتجاهل بنسخة السجل (`rev` و`updatedAt` معًا)، والحدث الأقدم من حالته يُهمل؛ والكتابة الخارجية أثناء كتابته أو قراءته تؤجَّل حتى تنتهي ثم يقرأ الأحدث. ترتيب وصول الحدث ووعد الكتابة غير مضمون في Chrome، والمتحكم مختبر بالترتيبين.

## ٤. الممنوعات

- MAIN ← الإضافة: لا أوامر. الإضافة → MAIN: لا رسائل.
- لا `chrome.runtime.sendMessage` من سكربت المحتوى إلا رسالتي الحفظ (§٧) والتخزين (§٨) إلى العامل الخلفي، ولا `externally_connectable`، ولا `runtime.connect`. والعامل الخلفي للحفظ والكاتب الواحد، ومنذ الفكرة ١٠ لتمرير أوامر الاختصارات (§٩)، وحدها؛ ولا يرسل العامل إلى سكربت المحتوى إلا `tj:command`.
- لا رسالة جديدة دون تغيير هذا العقد على `main`.

---

## ٥. الإصدار الثاني: رد حالة الفيديو الموسّع (R64)

الطلب نفسه `{ type: "tj:get-video-state", v: 1 }` والرد بالإصدار نفسه `v: 1` وحقوله كلها كما في §٢، **ومعها** حقول جديدة تتجاهلها نافذة الإصدار الأول (`isVideoStateReply` لم يتغير):

```js
{
  …§٢,
  slots: [{ n: 1, filled: true, active: true, name: "ترجمتي" | null }, { n: 2, … }, { n: 3, … }],   // 1 2 3 بلا نص
  capture: { state: "captured" | "rejected" | "none", count: 1, code: "EX_NOT_ENGLISH" | null, format?: "srv3" | "vtt" },   // الالتقاط لهذه الجلسة
  tools: { overlay: "mounted", controls: "mounted", code: "CT_MOUNT_FAILED" | null }               // = mounted مع آخر رمز تعطل
}
```

- `capture.state`: `captured` عند مسار ملتقط صالح، و`rejected` عند آخر رفض يخص الفيديو (`code` رمزه، مثل `EX_NOT_ENGLISH` لمسار عربي أو مترجم آليًا)، وإلا `none`.
- `capture.format` (الفكرة ٤، الإنذار المبكر، بعد 2.2.0): اسم الصيغة المرفوضة (`srv3` أو `vtt`) عند رفض `EX_UNSUPPORTED_FORMAT` بصيغة مسمّاة وحده، وغائب في غيره؛ فتسمّيها رسالة الرمز في النافذة (`messageFor(code, { format })`) كما في قائمة التحميل. ومصدره `lastRejection().format`. والتغيير في `core/model/messages.js` المجمَّد هذا الحقل وحده.
- `tools.code` آخر رمز تعطل من نقطتي التركيب إن وُجد (`state: "error"`)؛ والسبب المفهوم من `messageFor(code)`.
- `isVideoStateReplyV2(reply)` يتحقق من الحقول الجديدة؛ والنافذة الجديدة تعرض الرد القديم (بلا هذه الحقول) كما يعرضه الأول.

### حقول 2.0.0 (AA3، كتلة «تعليمات الترجمة»؛ قرارا سلطان ق٢ وق٥)

حقول إضافية بالإصدار نفسه `v: 1`، تتجاهلها النافذة الأقدم، وتعرض النافذة الجديدة ردًّا بلاها بقيم «لا يُعرف»:

```js
{
  …§٥,
  arabic: { …§٢, lang: "ar" | null },                                       // لغة الترجمة النشطة، وnull «غير محددة»
  source: { key: "ja|asr", lang: "ja", kind: "asr", via: null, from: "export" | "captured" | "saved" } | null,
  lastExport: { key: "ja|asr", lang: "ja", via: null, parts: [{ index: 1, from: 1, to: 200 }, …] | null } | null,
  available: [{ lang: "es", kind: "manual", name: "Español" | null }, …] | null
}
```

- `source` مسار الفيديو الذي تُعبّأ منه «من» في النافذة بلغته كما أرسلها يوتيوب (ق٥، لا تخمين من نص): آخر ما نُزّل إن بقي مساره ملتقطًا في الزيارة أو محفوظًا، وإلا ما تختاره قائمة التحميل افتراضيًا (الملتقط ثم المحفوظ)، وإلا `null`. و`via` لغة أصل ترجمة يوتيوب الآلية (ق٢). وإعادة تنزيل تصدير بصمته محفوظة (من المشغّل أو المحفوظات) تحدّث البصمة نفسها بمعرّفها، بـ`createdAt` جديد وتنتقل إلى آخر القائمة، فتصير آخر تنزيل دون إضافة بصمة؛ وعند تساوي الوقت فالأحدث موضعًا (تدقيق V2، U-024).
- `lastExport` آخر بصمة تصدير للفيديو بأجزائها إن قُسّم، لفقرة الأجزاء في التعليمات المنسوخة من النافذة حين تكون «من» لغتها نفسها.
- `available` مسارات الفيديو كما في بيانات المشغّل (لغة ونوع واسم معروض، **بلا رابط ولا رمز**، عقد الاستخراج)، أو `null` قبل وصولها.
- لا نص مقاطع في أي حقل؛ و`name` نص يوتيوب يُعرض معزولًا بـ`textContent`.

## ٦. الإصدار الثاني: تشخيص الصفحة (R64)

```js
chrome.tabs.sendMessage(tabId, { type: "tj:get-page-diagnostics", v: 1 })    // pageDiagnosticsRequest()
// الرد: { v: 1, ok: true, sections: { controller, mounted: { overlay, controls }, dom, panel } } — أعداد ورموز فقط
// وتشخيص المستخرج داخل controller (controller.diagnostics().extractor)، لا قسمًا مستقلًا
```

**ف7 (2026-11-10):** في تشخيص المستخرج `requestsSeen` (طلبات الترجمة التي رآها غلافا الالتقاط للفيديو المعروض، و0 حين لم يُرَ طلب) و`requestsSeenPage` (أكبر عدّ في الصفحة). أعداد فقط، من رسالة `kind: "seen"` (عقد الاستخراج).

**ف10 (2026-11-10):** `dom` خريطة وجود العناصر التي يعتمد عليها ترجمان، نعم أو لا لكل مفتاح في `SELECTORS` (§٧ في عقد الواجهات) ومعها `anyVideo` لأي عنصر فيديو (`domPresence` في `src/content/messages.js`). ومنذ الفكرة ١ (الجولة الثالثة) معها مواضع لوحة النص، مفتاحًا لكل محدد في `PANEL_SELECTORS` (§٧) كما يبحث عنها `panel/column.js`، و`belowAnchor` داخل `#below` وحده؛ فيُعرف أيّ مواضعها غاب حين لا تظهر اللوحة. ومفاتيحها غير مفاتيح `SELECTORS`، فالخريطة مسطّحة. أسماء وقيم منطقية فقط. و`panel` تشخيص لوحة النص المتزامن (`mounted.panel.diagnostics()`: أعداد وحالة ورموز)، وكان خارج التقرير. وحالة الأدوات والطبقة قد تكون `error` برمز `CT_PLAYER_NOT_FOUND` أو `PL_PLAYER_NOT_FOUND` (عقد الأخطاء §١٣).

**الفكرة ٤-ب (ح-38، بعد 2.2.0):** في تشخيص المستخرج لكل مسار `reason` (سبب فشله من القائمة المغلقة `REASONS`، و`null` للسليم) و`rolling` (`eventIndex` و`repeatedWords` و`basis`، أو `null`) و`stats` و`converter` (أعداد وقيم منطقية بأسمائها)، ولكل رفض حديث `reason`. وما زال القسم **أعدادًا ورموزًا فقط**: يُنتقى كل حقل باسمه، فلا يعبر نص ترجمة ولا وصف خطأ ولا تفصيله ولا رابط ولا معرّف، و`format` صنف من قائمة مغلقة. وتفصيلها في عقد الأخطاء §٤.

يُقبل من صفحات الإضافة وحدها (`isExtensionPage`) كطلب الحالة. الأقسام بلا نص ولا عنوان ولا رابط، والنافذة تبني منها `createDiagnosticReport` (عقد الأخطاء §٤) الذي ينقّيها مرة أخرى.

## ٧. الإصدار الثاني: رسالتا القفز والحفظ

### القفز إلى زمن الفيديو (R56، Q14) — الصفحات → سكربت المحتوى

```js
chrome.tabs.sendMessage(tabId, { type: "tj:seek", v: 1, videoId: "iG9CE55wbtY", ms: 754200 })   // seekRequest(videoId, ms)
// الرد: { v: 1, ok: true, ms } | { v: 1, ok: false, code: "TJ_WRONG_VIDEO" | "TJ_NO_VIDEO" | "TJ_BAD_MESSAGE" }
```

- يُقبل من **صفحات الإضافة وحدها** (`isExtensionPage`)، و`videoId` **يساوي الفيديو المعروض** في المتحكم (`state.videoId`)، و`ms` عدد صحيح من 0 إلى `LIMITS.maxTimeMs` (`isSeekRequest`). وإلا يُرفض برمز ولا يتغير شيء.
- **لا يتغير إلا الزمن:** `video.currentTime = ms / 1000` عبر `seekMainVideo` في `youtube-dom`، دون تشغيل ولا إيقاف ولا تغيير إعداد. لا يُقبل أي أمر آخر من الصفحات.
- أداة الصفحات `jumpToVideo` (عقد الواجهات §١٤) تجد التبويب أو تفتحه.

### معرّف الفيديو وحده للقفز (تدقيق 7a66f91، U102) — الصفحات → سكربت المحتوى

```js
chrome.tabs.sendMessage(tabId, { type: "tj:get-video-id", v: 1 })   // videoIdRequest()
// الرد: { v: 1, ok: true, videoId: string | null }                  // isVideoIdReply
```

- بشروط القبول نفسها (صفحات الإضافة وحدها)، ولا يحمل الرد غير المعرّف: `jumpToVideo` كانت تطلب رد الحالة الكامل (العنوان واسم الملف وأسماء الخانات) من كل تبويب وهي تحتاج المعرّف وحده. والرد لا يغادر الإضافة في الحالين.

### الحفظ عبر العامل الخلفي (R65) — سكربت المحتوى → العامل

```js
chrome.runtime.sendMessage({ type: "tj:save-file", v: 1, file: { name: "iG9CE55wbtY.en.manual.normal.srt", text: "…" } })   // saveRequest(file)
// الرد: { v: 1, ok: true, mode: "downloads" | "subfolder" | "ask", downloadId, pending?: true } | { v: 1, ok: false, code: "SV_…" }
```

- العامل يقبلها من **سكربت الإضافة وحده**: `sender.id === chrome.runtime.id`، والمرسِل سكربت محتوى على `https://www.youtube.com/` أو صفحة من الإضافة؛ وما عدا ذلك يُتجاهل بلا رد.
- **العامل يقرأ مكان الحفظ من التفضيلات** (`store.getPrefs().saveLocation`) **لا من الرسالة**، ولا تحمل الرسالة نوع MIME ولا مسارًا. ويتحقق من الاسم والامتداد والحجم (`validateSaveFile`، عقد الواجهات §١٣) قبل أي تنزيل.
- **رسالة لم تصل أصلًا** (لا مستقبل: `Could not establish connection`/`Receiving end does not exist`، أو سياق الإضافة لم يعد صالحًا فرمى الإرسال) تجعل المرسِل يرجع إلى التنزيل الحالي عبر Blob برسالة `SV_FALLBACK_BLOB` (عقد الواجهات §١٣). أما **ردٌّ لم يصل في مهلته، أو قناة انغلقت بعد الإرسال** (توقف العامل أثناء حوار الحفظ مثلًا) فلا يرجع إلى Blob (قد يكون العامل بدأ التنزيل فيتكرر الملف): `SV_NO_REPLY` (تدقيق 7a66f91، U34). ومتى صدر معرّف التنزيل وتعذّر الاستعلام عن نتيجته أو غاب عنصره فالرد `SV_UNSETTLED` بلا بديل. و`pending: true` حين يبقى التنزيل «جاريًا» بعد مهلة الانتظار (حوار الحفظ مفتوح)، فيعرض المستدعي `SV_PENDING` لا «حُفظ» (تدقيق 5fedcb9).

### ما ثبت حيًا في P10

في Brave وChrome (`test/live/compat/`): رسالة الحفظ من المشغّل وصلت العامل الخلفي فحفظ بالوضع المخزَّن (`downloads` و`subfolder` و`ask`)؛ و`tj:seek` من صفحة الإضافة غيّر زمن الفيديو المعروض وحده ورُفض لمعرّف آخر بـ`TJ_WRONG_VIDEO`؛ ورد الحالة الموسّع حمل الخانات والالتقاط وحالة الأدوات، ونافذة الإصدار الأول (حزمة `tj-v1`) قرأت رد مشغّلها كما اعتادت.

## ٧ب. خطة 2.2.0: لصق ناتج النموذج — `tj:paste-import` (ف5، بقرار سلطان 2026-11-10)

```js
chrome.tabs.sendMessage(tabId, { type: "tj:paste-import", v: 1, videoId: "iG9CE55wbtY", text: "1\n00:00:01,000 --> …" })   // pasteImportRequest(videoId, text)
// ← { v: 1, ok: true } | { v: 1, ok: false, code: "TJ_BAD_MESSAGE" | "TJ_NO_VIDEO" | "TJ_WRONG_VIDEO" | "TJ_RELOAD_PAGE" | "busy" }   // busy: رفع أو تأكيد لم ينتهِ في المشغّل (نص النافذة، لا رمز خطأ)
```

- **من نافذة الإضافة وحدها** (`isExtensionPage`)، والنص هو ما لصقه المستخدم في حقل «الصق الترجمة هنا» من حدث اللصق (`event.clipboardData`): لا إذن `clipboardRead` ولا قراءة للحافظة برمجيًا (قاعدة `clipboard-read` في `scripts/code-rules.mjs`).
- `isPasteImportRequest`: أربعة مفاتيح بالضبط، ومعرّف صالح، ونص غير فارغ حتى `MAX_PASTE_CHARS` (5 م.ب محارف). وللفيديو المعروض وحده (`TJ_WRONG_VIDEO` لغيره).
- الصفحة تمرره إلى `mounted.controls.importText(text)`: ملف بلا رمز لغة في اسمه («نص ملصوق») إلى خط الرفع نفسه (`readImport` بحد الحجم نفسه، والمقارنة، والتأكيد في قائمة الترجمة). والرد يقول إن الخط بدأ، لا نتيجته؛ والنتيجة في المشغّل.
- المحفوظات لا تمر بهذه الرسالة: «لصق ترجمة…» يبني الملف في الصفحة نفسها ويمر بـ`prepareUpload`.

## ٨. الكاتب الواحد للتخزين — `tj:store` (C2، تدقيق 7a66f91، قرار سلطان Q15)

صفحات الإضافة وسكربت المحتوى → العامل الخلفي. كل كتابة في التخزين (عقد التخزين §١٢)، والقراءة مباشرة بلا رسالة.

```js
chrome.runtime.sendMessage({ type: "tj:store", v: 1, wid: "…", op: "put", videoId, base: "3|2026-11-05T10:00:00.000Z", items: { … } })   // storeRequest(op, args, wid)
// العمليات: ready · put · delete · orphan · index · settings · prefs · langPrefs · saves · clear · uiLocale · uiLocaleInit · glossaries · draft (STORE_OPS؛ langPrefs منذ 2.0.0، AA1؛ ولغة الواجهة في عقد storage §١٤؛ وglossaries قوائم المصطلحات لكل زوج، الفكرة ٨، عقد storage §١٥؛ وdraft مسودة المحرّر، الفكرة ٩، عقد storage §١٦)
// الرد: { v: 1, ok: true, value? } | { v: 1, ok: false, code: "ST_CONFLICT" | "MD_INVALID" | "ST_QUOTA_EXCEEDED" | "ST_WRITE_FAILED" | "ST_SCHEMA_NEWER" | "ST_MIGRATION_FAILED" | …, detail }
```

- **المرسِل** كما في §٧: `sender.id === chrome.runtime.id`، وسكربت محتوى على `https://www.youtube.com/` أو صفحة من الإضافة؛ وما عدا ذلك، أو عملية غير معروفة، يُتجاهل بلا رد (`isStoreRequest`).
- **`print` في `put` (اختياري، تدقيق V2، U-023):** بصمة القيم الخام لمفاتيح الفيديو الستة كما عُرضت في تأكيد المستخدم (`rawPrint` في عقد التخزين)، وتُرسل لاستبدال سجل غير مقروء. يقارنها الكاتب بالبصمة الحاضرة **داخل طابوره** قبل أي كتابة، فإن اختلفت (أصلحه أو غيّره كاتب آخر بعد المعاينة) رُفض الطلب بـ`ST_CONFLICT` ولم يُكتب شيء؛ ولا يكفي `base` وحده لسجل لا يُقرأ. وبلا `print` لا مقارنة، وتبقى مقارنة `base` كما كانت. وللحذف `print` بالمعنى نفسه (عقد التخزين §١٢).
- **العمليات بحسب المرسِل** (تدقيق V2، U-043؛ `CONTENT_SCRIPT_OPS` في `store-service.js`): صفحات الإضافة تُقبل منها كل العمليات أعلاه. وسكربت المحتوى على يوتيوب يُقبل منه `ready` و`put` و`orphan` و`index` و`settings` و`prefs` و`uiLocaleInit` وحدها، وهي ما يحتاجه جانب يوتيوب فعلًا (و`uiLocaleInit` تهيئة لغة الواجهة من لغة يوتيوب إن لم تكن لها قيمة، عقد التخزين §١٤)؛ وما عداها (`delete` و`clear` و`langPrefs` و`saves` و`uiLocale` و`glossaries` و`draft`) يُرفض منه برد الخطأ المعتاد `{ v: 1, ok: false, code: "TJ_BAD_MESSAGE", detail: null }` ولا يصل إلى الكاتب. تحصين في العمق لا يمنع سياق عرض مخترقًا يقرأ `storage.local` مباشرة.
- **المحتوى:** ما يُخزَّن اليوم وحده (السجل وتوابعه ورقع الإعدادات والتفضيلات، ومسودة المحرّر بنصها)، بلا شيفرة ولا رابط ولا مسار. والكاتب يتحقق من كل قيمة بمدققها قبل الكتابة.
- **`wid`:** معرّف عشوائي لكل طلب. وإعادة الإرسال بعد خطأ قناة بالمعرّف نفسه، فلا تُطبَّق الكتابة مرتين (عقد التخزين §١٢).
- **حد القناة:** رسالة أكبر من حد المتصفح تُرفض بـ`ST_WRITE_FAILED` دون إعادة.
- **العامل غير المتاح** بعد ثلاث إعادات: `ST_WRITE_FAILED`، ولا كتابة مباشرة بديلة.
- **سياق الإضافة المبطَل** (تحقق Gemini، B5-ب): سكربت محتوى بقي في صفحة فُتحت قبل تحديث الإضافة أو إعادة تحميلها (`sendMessage` يرمي «Extension context invalidated.»، أو زال `chrome.runtime.id` بعد أن كان) يرد عليه الناقل نفسه `{ v: 1, ok: false, code: "TJ_RELOAD_PAGE" }` فورًا بلا إعادة، لا `ST_WRITE_FAILED` بعد الإعادات الثلاث؛ والقراءة في السياق نفسه كذلك (عقد التخزين §٣).

## ٩. أمر الاختصار — `tj:command` (الفكرة ١٠، المسار ب، القرار ح-55 في جولة 2026-11-13، حُسم نيابةً عن سلطان بتفويضه)

العامل الخلفي → سكربت المحتوى في التبويب النشط. والأوامر في البيان (`commands`) **بلا `suggested_key`**، فلا يصل حدثها حتى يربطها المستخدم في صفحة اختصارات متصفحه؛ والفحص الثابت يقبل المفتاح بالأسماء الخمسة وحدها ويرفض المفتاح المقترح، ويعيد تدقيق الحزمة ذلك على البيان المشحون (`commands-known-without-keys`؛ تحقق 2.3.0، ص-١٨).

```js
chrome.commands.onCommand.addListener((name, tab) => …)                        // src/background/commands.js (installCommands)
chrome.tabs.sendMessage(tabId, { type: "tj:command", v: 1, name: "display-mode" })   // commandRequest(name)
// name: "display-mode" | "offset-earlier" | "offset-later" | "mark-review" | "replay-line"   (COMMAND_NAMES)
// الرد: { v: 1, ok: true } | { v: 1, ok: false, code: "TJ_BAD_MESSAGE" | "TJ_NO_VIDEO" | "CT_NEEDS_ARABIC" | "CT_LOADING" }
```

- **التبويب:** من وسيط الحدث (`tab.id`؛ Chrome، وFirefox منذ 126 والحد الأدنى 144)، وإلا `tabs.query({ active: true, currentWindow: true })` احتياطًا؛ وكلاهما بلا إذن `tabs` (المعرّف يصل بلا العنوان). ولا شيء بلا تبويب صالح، ولا لاسم غير الخمسة (`isCommandName`).
- **لا مستقبل:** العامل لا يعرف عنوان التبويب، فيرسل؛ وتبويب بلا سكربت ترجمان (موقع آخر، أو صفحة يوتيوب فُتحت قبل تثبيت الإضافة أو تحديثها) يرفض الإرسال، فيُبتلع الرفض **بصمت**: لا موضع يُعرض فيه شيء بلا إذن جديد. والرد لا يُنتظر لشيء، ويُعاد للاختبار وحده.
- **هوية المرسِل:** سكربت المحتوى يقبلها من **العامل الخلفي للإضافة نفسها وحده** (`isBackgroundSender`): `isExtensionPage` (§٢)، وبلا `sender.tab`، وعنوانه بالضبط `runtime.getURL("background/worker.js")` (عامل الخدمة في Chromium) أو `runtime.getURL("_generated_background_page.html")` (صفحة الخلفية التي يولّدها Firefox من `background.scripts`، ولم يثبت حيًّا بعد). وما عداه، ومنه نافذة الإضافة وصفحاتها، يُتجاهل بلا رد. والطلب ثلاثة مفاتيح بالضبط (`isCommandRequest`)، والمعيب من العامل `TJ_BAD_MESSAGE`.
- **الفعل:** `mounted.controls.command(name)` (عقد الواجهات §٣) إلى أفعال جلسة الشريط نفسها؛ وبلا أدوات مركّبة (صفحة ليست مشاهدة، أو قبل ظهور الشريط) `TJ_NO_VIDEO` بلا شيء، وبلا ترجمة أو أثناء قراءتها رسالة قصيرة في المشغّل برمزها. والرسالة لا تحمل غير الاسم: لا زمن ولا قيمة ولا نص.
