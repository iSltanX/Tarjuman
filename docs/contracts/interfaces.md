# حدود الوحدات وبنية الشيفرة (مسودة)

> مسودة تحدد أين يعيش كل شيء ومن يملكه، كي تعمل W3 وW4 بالتوازي. تثبّت P2 التوقيعات النهائية وتنشئ نقاط التركيب المؤقتة.

## بنية الشيفرة المقترحة

```text
src/
  manifest.json                 P1 ← P2 (ثم مشترك)
  main-world/capture.js         P1
  content/{bridge,controller,main}.js        P1 ← P2 (ثم مشترك)
  extract/                      P1 ← P3
  core/
    model/                      P2 (مشترك)
    convert/                    P1 ← P3   (json3، يدوي، ASR، الثوابت، المقاطع الأطول)
    srt/                        P1 ← P4   (الكاتب، والمحلّل الصارم ثم المتسامح)
    export/                     P3        (الكتابة، والتسمية، والبصمة، والتعليمات، والتقسيم، والتنزيل)
    import/  compare/           P4
    edit/                       P8
    store/                      P2
    errors/index.js             P2 (مشترك) + ملف مجال لكل مرحلة
    diagnostics/                P1 ← P2
  player/
    youtube-dom.js              P2 (مشترك)
    overlay/ sync/ watch/       P5
    controls/                   P6
  pages/
    popup/ library/ settings/   P7
    editor/                     P8
  ui/                           P2 (مشترك)
test/
  unit/<المجال>/  fixtures/  integration/  live/  e2e/   (كل مرحلة تملك مجلداتها)
```

## الواجهات (توقيعات مبدئية)

```js
// المتحكم (src/content/controller.js) — مصدر الحالة في صفحة يوتيوب
controller.getState()            // { videoId, title, english, arabic, view, capture }
controller.subscribe(fn)         // يعيد دالة إلغاء
controller.setOffset(ms) / nudgeOffset(+1|-1) / resetOffset()
controller.setDisplayMode("ar" | "dual" | "off")
controller.loadArabic(importResult, { replace })   // يصفّر الإزاحة (عقد التوقيت §٦)

// نقطتا التركيب
mountOverlay(controller)         // src/player/overlay/index.js  → P5
mountControls(controller, deps)  // src/player/controls/index.js → P6 ؛ deps = { exportFlow, importFlow }

// تدفق التصدير (P3)
exportFlow.listTracks(videoId)                  // المسارات الملتقطة الصالحة
exportFlow.build({ videoId, trackKey, mode, split }) // → { files:[{name, text}], fingerprint, instructions, warnings }
exportFlow.download(file)                       // Blob + <a download>

// تدفق الاستيراد (P4)
importFlow.read(fileOrFiles, { videoId })       // → { cues, report, notes, errors }
importFlow.previewRestoreTiming(cues, fingerprint)   // معاينة فقط
importFlow.applyRestoreTiming(cues, fingerprint)     // بعد تأكيد المستخدم فقط
```

## الصفحات والرسائل

- الصفحات: `popup.html`، و`library.html`، و`settings.html`، و`editor.html?v=VIDEO_ID`. تُفتح من نافذة الأيقونة أو المحفوظات بـ`chrome.tabs.create`.
- نافذة الأيقونة ← سكربت المحتوى في التبويب النشط: `{ type: "tj:get-video-state" }` ← `{ videoId, title, hasArabic, hasEnglish }`.
- الصفحات ↔ المشغّل: عبر التخزين وأحداث تغيّره، لا رسائل مباشرة.
- MAIN ← الصفحة: ممنوع. MAIN → ISOLATED: بحسب [عقد الاستخراج](extraction.md).

## الأخطاء

رمز ثابت (`EX_…`، `IM_…`، `CMP_…`، `PL_…`، `UI_…`، `ED_…`، `ST_…`) ورسالة عربية تقول ما حدث وما يمكن فعله، وتفاصيل تقنية منقّاة للتشخيص فقط.
