# عقد الرسائل

> **مثبّت في P2 (2026-11-01)، ووسّعته P10 للإصدار الثاني (2026-11-02) ثم جُمِّد.** المسارات ثلاثة في الإصدار الأول (§١–§٣)، ويضيف الثاني ثلاث رسائل محددة (§٥–§٧)؛ وكلها بيانات أو طلبات مقيّدة، لا أوامر عامة. **وأضافت C2 (تدقيق 7a66f91، قرار سلطان Q15، 2026-11-05) رسالة الكاتب الواحد `tj:store` (§٨).** الشيفرة: `src/content/bridge.js` و`src/content/messages.js` و`src/core/model/messages.js`، واختباراتها `test/unit/content/page-boundary.test.js`.

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
- النافذة تتحقق من الرد (`isVideoStateReply`) قبل عرضه. **لا رد** (رفض «Receiving end does not exist» أو تبويب ليس يوتيوب أو نسخة أقدم) يعني «افتح فيديو على يوتيوب» (`TJ_NOT_YOUTUBE`).
- `chrome.tabs.query({ active: true, lastFocusedWindow: true })` و`chrome.tabs.sendMessage` و`chrome.tabs.create` لا تحتاج إذن `tabs`.
- `mounted` حالة نقطتي التركيب للتشخيص والدخان الحي (عقد الواجهات §٣).
- **ثبت حيًا في P2** في Brave وChrome: نافذة الأيقونة وجدت تبويب يوتيوب النشط وتلقت الرد بالمعرّف و`mounted: stub`.

## ٣. الصفحات ↔ المشغّل: التخزين وحده

- لا رسائل مباشرة. الصفحة تكتب بالتخزين (عقد التخزين §٦، والكتابة نفسها عبر الكاتب الواحد في العامل الخلفي §٨)، والمتحكم في كل تبويب يوتيوب يسمع `store.onChange` فيعيد قراءة سجل فيديوه أو إعداداته (`controller.handleStoreChange`). **ثبت حيًا في P2** (Brave وChrome): سجل كُتب من صفحة إضافة ظهر في رد المشغّل خلال ثانية (`storage-change-reaches-player`).
- صدى كتابات المتحكم نفسه يُتجاهل بنسخة السجل (`rev` و`updatedAt` معًا)، والحدث الأقدم من حالته يُهمل؛ والكتابة الخارجية أثناء كتابته أو قراءته تؤجَّل حتى تنتهي ثم يقرأ الأحدث. ترتيب وصول الحدث ووعد الكتابة غير مضمون في Chrome، والمتحكم مختبر بالترتيبين.

## ٤. الممنوعات

- MAIN ← الإضافة: لا أوامر. الإضافة → MAIN: لا رسائل.
- لا `chrome.runtime.sendMessage` من سكربت المحتوى إلا رسالتي الحفظ (§٧) والتخزين (§٨) إلى العامل الخلفي، ولا `externally_connectable`، ولا `runtime.connect`. والعامل الخلفي للحفظ والكاتب الواحد وحدهما.
- لا رسالة جديدة دون تغيير هذا العقد على `main`.

---

## ٥. الإصدار الثاني: رد حالة الفيديو الموسّع (R64)

الطلب نفسه `{ type: "tj:get-video-state", v: 1 }` والرد بالإصدار نفسه `v: 1` وحقوله كلها كما في §٢، **ومعها** حقول جديدة تتجاهلها نافذة الإصدار الأول (`isVideoStateReply` لم يتغير):

```js
{
  …§٢,
  slots: [{ n: 1, filled: true, active: true, name: "ترجمتي" | null }, { n: 2, … }, { n: 3, … }],   // 1 2 3 بلا نص
  capture: { state: "captured" | "rejected" | "none", count: 1, code: "EX_NOT_ENGLISH" | null },   // الالتقاط لهذه الجلسة
  tools: { overlay: "mounted", controls: "mounted", code: "CT_MOUNT_FAILED" | null }               // = mounted مع آخر رمز تعطل
}
```

- `capture.state`: `captured` عند مسار ملتقط صالح، و`rejected` عند آخر رفض يخص الفيديو (`code` رمزه، مثل `EX_NOT_ENGLISH` لمسار عربي أو مترجم آليًا)، وإلا `none`.
- `tools.code` آخر رمز تعطل من نقطتي التركيب إن وُجد (`state: "error"`)؛ والسبب المفهوم من `messageFor(code)`.
- `isVideoStateReplyV2(reply)` يتحقق من الحقول الجديدة؛ والنافذة الجديدة تعرض الرد القديم (بلا هذه الحقول) كما يعرضه الأول.

## ٦. الإصدار الثاني: تشخيص الصفحة (R64)

```js
chrome.tabs.sendMessage(tabId, { type: "tj:get-page-diagnostics", v: 1 })    // pageDiagnosticsRequest()
// الرد: { v: 1, ok: true, sections: { controller, extractor, mounted } } — أعداد ورموز فقط
```

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

### الحفظ عبر العامل الخلفي (R65) — سكربت المحتوى → العامل

```js
chrome.runtime.sendMessage({ type: "tj:save-file", v: 1, file: { name: "iG9CE55wbtY.en.manual.normal.srt", text: "…" } })   // saveRequest(file)
// الرد: { v: 1, ok: true, mode: "downloads" | "subfolder" | "ask", downloadId, pending?: true } | { v: 1, ok: false, code: "SV_…" }
```

- العامل يقبلها من **سكربت الإضافة وحده**: `sender.id === chrome.runtime.id`، والمرسِل سكربت محتوى على `https://www.youtube.com/` أو صفحة من الإضافة؛ وما عدا ذلك يُتجاهل بلا رد.
- **العامل يقرأ مكان الحفظ من التفضيلات** (`store.getPrefs().saveLocation`) **لا من الرسالة**، ولا تحمل الرسالة نوع MIME ولا مسارًا. ويتحقق من الاسم والامتداد والحجم (`validateSaveFile`، عقد الواجهات §١٣) قبل أي تنزيل.
- **لا رد** (عامل غير متاح أو خطأ قناة) يجعل المرسِل يرجع إلى التنزيل الحالي عبر Blob برسالة `SV_FALLBACK_BLOB` (عقد الواجهات §١٣). أما **ردٌّ لم يصل في مهلته** والرسالة قد وصلت فلا يرجع إلى Blob (قد يكون العامل بدأ التنزيل فيتكرر الملف): `SV_NO_REPLY`. و`pending: true` حين يبقى التنزيل «جاريًا» بعد مهلة الانتظار (حوار الحفظ مفتوح)، فيعرض المستدعي `SV_PENDING` لا «حُفظ» (تدقيق 5fedcb9).

### ما ثبت حيًا في P10

في Brave وChrome (أدلة [`docs/evidence/P10/`](../evidence/P10/)): رسالة الحفظ من المشغّل وصلت العامل الخلفي فحفظ بالوضع المخزَّن (`downloads` و`subfolder` و`ask`)؛ و`tj:seek` من صفحة الإضافة غيّر زمن الفيديو المعروض وحده ورُفض لمعرّف آخر بـ`TJ_WRONG_VIDEO`؛ ورد الحالة الموسّع حمل الخانات والالتقاط وحالة الأدوات، ونافذة الإصدار الأول (حزمة `tj-v1`) قرأت رد مشغّلها كما اعتادت.

## ٨. الكاتب الواحد للتخزين — `tj:store` (C2، تدقيق 7a66f91، قرار سلطان Q15)

صفحات الإضافة وسكربت المحتوى → العامل الخلفي. كل كتابة في التخزين (عقد التخزين §١٢)، والقراءة مباشرة بلا رسالة.

```js
chrome.runtime.sendMessage({ type: "tj:store", v: 1, wid: "…", op: "put", videoId, base: "3|2026-11-05T10:00:00.000Z", items: { … } })   // storeRequest(op, args, wid)
// العمليات: ready · put · delete · orphan · index · settings · prefs · saves · clear (STORE_OPS)
// الرد: { v: 1, ok: true, value? } | { v: 1, ok: false, code: "ST_CONFLICT" | "MD_INVALID" | "ST_QUOTA_EXCEEDED" | "ST_WRITE_FAILED" | "ST_SCHEMA_NEWER" | "ST_MIGRATION_FAILED" | …, detail }
```

- **المرسِل** كما في §٧: `sender.id === chrome.runtime.id`، وسكربت محتوى على `https://www.youtube.com/` أو صفحة من الإضافة؛ وما عدا ذلك، أو عملية غير معروفة، يُتجاهل بلا رد (`isStoreRequest`).
- **المحتوى:** ما يُخزَّن اليوم وحده (السجل وتوابعه ورقع الإعدادات والتفضيلات)، بلا شيفرة ولا رابط ولا مسار. والكاتب يتحقق من كل قيمة بمدققها قبل الكتابة.
- **`wid`:** معرّف عشوائي لكل طلب. وإعادة الإرسال بعد خطأ قناة بالمعرّف نفسه، فلا تُطبَّق الكتابة مرتين (عقد التخزين §١٢).
- **حد القناة:** رسالة أكبر من حد المتصفح تُرفض بـ`ST_WRITE_FAILED` دون إعادة.
- **العامل غير المتاح** بعد ثلاث إعادات: `ST_WRITE_FAILED`، ولا كتابة مباشرة بديلة.

