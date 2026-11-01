# عقد الرسائل

> **مثبّت في P2 (2026-11-01) ومجمَّد.** المسارات ثلاثة فقط، وكلها بيانات لا أوامر. الشيفرة: `src/content/bridge.js` و`src/content/messages.js` و`src/core/model/messages.js`، واختباراتها `test/unit/content/page-boundary.test.js`.

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

## ٣. الصفحات ↔ المشغّل: التخزين وحده

- لا رسائل مباشرة. الصفحة تكتب بالتخزين (عقد التخزين §٦)، والمتحكم في كل تبويب يوتيوب يسمع `store.onChange` فيعيد قراءة سجل فيديوه أو إعداداته (`controller.handleStoreChange`). الدخان الحي يتحقق منه (`storage-change-reaches-player`).
- صدى كتابات المتحكم نفسه يُتجاهل بمقارنة `rev`؛ والكتابة الخارجية أثناء كتابته تؤجَّل حتى تنتهي ثم يقرأ الأحدث.

## ٤. الممنوعات

- MAIN ← الإضافة: لا أوامر. الإضافة → MAIN: لا رسائل.
- لا `chrome.runtime.sendMessage` من سكربت المحتوى إلى الصفحات، ولا `externally_connectable`، ولا `runtime.connect`، ولا عامل خلفي.
- لا رسالة جديدة دون تغيير هذا العقد على `main`.
