# عقد نموذج البيانات

> **مثبّت في P2 (2026-11-01) ومجمَّد.** الشيفرة المرجعية `src/core/model/` بأنواع JSDoc ومدققات صارمة، وعينات مطابقة في `test/helpers/fixtures.js` تجتاز المدققات (`test/unit/model/`). تغيير أي بنية هنا تغيير عقد: المرحلة متعطلة حتى يحسمه المنسّق على `main`.

## ٠. قواعد عامة

- **الأزمنة** أعداد صحيحة بالملي ثانية من 0 إلى 360,000,000 (100 ساعة). **التواريخ** نصوص ISO بتوقيت UTC مثل `2026-11-01T12:00:00.000Z`.
- **النص خام**: لا HTML ولا وسوم؛ الأسطر بـ`\n`، ولا محرف `\u0000`. العرض بـ`textContent` وحده.
- **المدققات صارمة**: المفتاح المفقود أو غير المعروف فشل، فلا تضيف مرحلة حقلًا دون تغيير عقد. كل مدقق يعيد `{ ok: true }` أو `{ ok: false, path, reason }` ولا يرمي، و`assertValid` يحوّل الفشل إلى `MD_INVALID`.
- **لا يُخزَّن أبدًا**: جسم `json3` الخام، وأي رابط أو رأس أو `pot` أو توقيع أو ملف ارتباط (عقد الاستخراج).
- **الحدود** (`LIMITS`): 50,000 مقطع، و5,000 محرف للنص، و500 للعنوان، و255 لاسم الملف، و8 مسارات إنجليزية، و10 بصمات، و50 ملاحظة بطول 500.

## ١. المعرّفات والمفاتيح — `src/core/model/ids.js`

| الاسم | الصيغة | مثال |
| --- | --- | --- |
| معرّف الفيديو | `^[A-Za-z0-9_-]{11}$` | `iG9CE55wbtY` |
| مفتاح المسار الإنجليزي | `lang\|kind`، واللغة تبدأ بـ`en` | `en\|manual`، `en-GB\|asr` |
| معرّف البصمة | `^fp_[a-z0-9]{6,40}$` (`newFingerprintId`) | `fp_mhg2x1c0k3j9qa` |

## ٢. المقطع — `cue.js`

```js
Cue = { n: 1, startMs: 27103, endMs: 29678, text: "سطر أول\nسطر ثانٍ" }   // أزمنة أول مقطع في عينة P1 اليدوية
CueTime = { n, startMs, endMs }                                       // في البصمة: بلا نص
```

- `n` عدد صحيح موجب، ويُحفظ **كما ورد** في الملف العربي (الترقيم غير المتسلسل يبلّغ عنه المقارن ولا يُصلح). الكاتب يرقّم من 1 عند التصدير.
- **التحقق بنيوي فقط:** نهاية قبل بداية أو تداخل مشكلة توقيت يعرضها المحرّر ويمنع الحفظ منه والتصدير، لا خطأ نموذج؛ فيقبل التخزين ملفًا مستوردًا فيه هذه المشكلات ليعرضها.
- النص الفارغ مقبول بنيويًا (مقطع لم يترجمه النموذج يبلّغ عنه المقارن في `empty`).

## ٣. المسار الإنجليزي — `tracks.js`

```js
EnglishTrack = {
  key: "en|manual", lang: "en", kind: "manual" | "asr",
  capturedAt: "2026-11-01T10:47:42.000Z", source: "capture",
  cues: Cue[]            // الوضع «عادي» كما أخرجه المحوّل؛ مقطع واحد على الأقل
}
```

- `kind` من `kind=asr` في طلب المشغّل وحده (عقد الاستخراج). `source` له قيمة واحدة الآن: `capture`.
- يُحفظ عند تنزيل SRT إنجليزي (مع بصمته)، أو مرجعًا عند استيراد عربي إن كان ملتقطًا؛ ولا يُحفظ كل التقاط تلقائيًا.
- **الحجم الواقعي** (عينات P1): اليدوي 427 مقطعًا ≈ 40 ألف محرف JSON، والتلقائي 1,056 مقطعًا ≈ 103 آلاف.

## ٤. البصمة — `tracks.js`

```js
Fingerprint = {
  id: "fp_…", videoId: "iG9CE55wbtY", trackKey: "en|manual", mode: "normal" | "long",
  count: 427, cues: CueTime[],        // ترقيم متسلسل من 1، وcount = cues.length
  textHash: "fnv1a64:…",              // "<خوارزمية>:<hex>"، تختارها P3 وتوسمها
  fileName: "iG9CE55wbtY.en.manual.normal.srt" | null,
  createdAt: "ISO",
  parts: null | [{ index: 1, from: 1, to: 200 }, { index: 2, from: 201, to: 427 }]
}
```

- تُحفظ محليًا ولا تُضمَّن في الملف المصدَّر. بصمة لكل تصدير (لكل وضع ولكل تقسيم).
- `parts` للتقسيم الاحتياطي وحده: جزآن فأكثر، **ترقيم مستمر** يغطي 1..count دون فجوة ولا تداخل (المدقق يفرضه).
- `trackKey` يشير إلى مسار محفوظ في السجل نفسه. حد السجل 10 بصمات، وتسقط الأقدم إلا التي تشير إليها الترجمة العربية.
- البصمة لا تحمل نصًا أبدًا (المدقق يرفض `text`).

## ٥. تقرير المقارنة — `tracks.js`

وصف فقط، لا يعدّل شيئًا. ينتجه المقارن (P4) ويعرضه الشريط (ملخصًا، P6) والمحفوظات (P7) والمحرّر (تفصيلًا، P8).

```js
ComparisonReport = {
  fingerprintId: "fp_…" | null,    // null = لا بصمة للمقارنة («عُرض الملف كما هو»)
  matched: boolean,                // تطابق العدد والترقيم، ولا نقص ولا زيادة ولا انحراف فوق العتبة
  countSource: 427 | null,         // عدد البصمة؛ null بلا بصمة
  countTarget: 425,                // عدد الملف العربي
  numbering: "same" | "different",
  missing: [57, 58], extra: [],    // أرقام مقاطع
  drift: [{ n: 12, startDeltaMs: 300, endDeltaMs: -200 }],   // العربي − البصمة، فوق العتبة فقط
  empty: [201], noArabic: [88],    // تحذيرات محتوى لا تؤثر في matched
  restoreTimingAvailable: boolean, // true فقط عند تطابق العدد والترقيم
  driftThresholdMs: 100,           // العتبة المستعملة
  notes: ["أُزيل سياج ``` حول الملف"]   // كل تحويل للنص يُذكر هنا
}
```

**قيود يفرضها المدقق:** بلا بصمة ← `countSource=null` و`matched=false` و`restoreTimingAvailable=false`. و`restoreTimingAvailable` يعني `countSource = countTarget` و`numbering = same`. و`matched` يعني ذلك وغياب `missing` و`extra` و`drift`.

## ٦. الترجمة العربية وسجل الفيديو — `tracks.js` و`video.js`

```js
ArabicTrack = {
  fileName: "iG9CE55wbtY.ar.srt", importedAt: "ISO",
  original: Cue[],          // الأصل المستورد: لا يتغير إلا باستبدال الملف
  current: Cue[] | null,    // null = مطابقة للأصل؛ وإلا آخر حفظ من المحرّر
  editedAt: "ISO" | null,   // يوجد مع current ويغيب معه
  fingerprintId: "fp_…" | null, comparison: ComparisonReport | null,
  notes: string[]           // ملاحظات الاستيراد (مثل التنظيف)
}

VideoRecord = {
  schema: 1, videoId, title: string | null, durationMs: number | null,
  createdAt: "ISO", updatedAt: "ISO", rev: 1,      // يضبطها التخزين؛ rev يزيد مع كل حفظ
  english: EnglishTrack[],                         // مفاتيح فريدة
  fingerprints: Fingerprint[],
  arabic: ArabicTrack | null,
  view: { displayOffsetMs: 0, displayMode: "ar" | "dual" | "off" }
}
```

- ترجمة عربية فعّالة واحدة لكل فيديو (المواصفة §١١). المعروض `current ?? original` (`arabicCues(record)`).
- `displayOffsetMs` عدد صحيح من **مضاعفات 100** ضمن ±600,000 (عقد التوقيت). `displayMode`: `ar` العربية وحدها، و`dual` العربية فوق الإنجليزية، و`off` إخفاء.
- `arabic.fingerprintId` يشير إلى بصمة محفوظة في السجل نفسه.
- **الحجم الواقعي:** نحو 330 محرفًا لكل مقطع لسجل كامل (مسار إنجليزي وبصمة وعربي أصل وحالي): فيديو بـ1,056 مقطعًا ≈ 354 ألفًا، وبـ2,000 مقطع ≈ 0.7 م.ب (قيس على عينات P1؛ `test/unit/model`).

## ٧. انتقالات السجل — `transitions.js`

دوال نقية يستعملها المتحكم (P6 عبره) والمحفوظات (P7) والمحرّر (P8)، فتبقى القواعد واحدة أينما حُفظ السجل. كل دالة تعيد سجلًا جديدًا، والتخزين يتحقق ويضبط `rev` والتواريخ.

| الدالة | متى | ما تفعله | ما لا تمسه |
| --- | --- | --- | --- |
| `withExport(rec, { videoId, title, durationMs, englishTrack, fingerprint })` | بعد تنزيل SRT إنجليزي | تحفظ المسار (أحدث التقاط لمفتاحه) وتضيف البصمة | العربية والإزاحة |
| `withArabicImport(rec, { videoId, fileName, cues, comparison, fingerprintId, notes, englishTrack, displayModeDefault }, now, { replace })` | استيراد أو استبدال | الملف يصبح الأصل المستورد، و**الإزاحة صفر دائمًا**، و`off` يعود إلى الافتراضي. وجود ترجمة دون `replace` يرمي `ST_ARABIC_EXISTS`. تعيد `{ record, offsetWas, replaced }` | — |
| `withView(rec, { displayOffsetMs?, displayMode? })` | ± ووضع العرض | الإزاحة أو الوضع | أي توقيت محفوظ |
| `withArabicEdit(rec, { cues, displayOffsetMs? })` | «حفظ» المحرّر | `current` = المقاطع، و`editedAt` الآن، والإزاحة إن مُرِّرت في الخطوة نفسها | `original` |
| `withOriginalRestored(rec)` | «استعادة الأصل» | `current = null` | `original` |
| `withoutArabic(rec)` | حذف العربية وحدها | `arabic = null` والإزاحة صفر | المسار الإنجليزي والبصمات |

## ٨. الإعدادات — `settings.js`

```js
Settings = {
  schema: 1,
  offsetStepMs: 500,                       // 100..10000 من مضاعفات 100 (الخطوة 0.5 / 1 / مخصصة)
  displayModeDefault: "ar" | "dual",
  appearance: { size: "s" | "m" | "l" | "xl", background: "none" | "soft" | "solid", position: "bottom" | "raised" | "top" },
  export: { modeDefault: "normal" | "long", splitThreshold: 200, showInstructions: true },   // العتبة 50..2000
  thresholds: { driftMs: 100, completeness: 0.85 }                                        // 10..5000 و0.5..1
}
```

الافتراضيات: الخطوة 500، والعربية وحدها، والمقاس `m`، والخلفية `soft`، والموضع `bottom`، والتصدير «عادي» (Q4)، والتقسيم عند 200، وإظهار التعليمات، والانحراف 100ms، والاكتمال 85% (Q6). **القراءة متسامحة** (`normalizeSettings`: كل حقل تالف يعود افتراضيه دون فقد البقية)، و**الكتابة صارمة** (`validateSettings`)، والتعديل الجزئي يُدمج حتى مستوى المجموعة (`mergeSettings`).

## ٩. مُلخّص الفهرس — `video.js`

يُحفظ بجانب كل سجل (عقد التخزين §٢) ويكفي المحفوظات دون قراءة السجلات الكاملة:

```js
IndexEntry = {
  schema: 1, videoId, title, updatedAt, rev,
  english: [{ key: "en|manual", kind: "manual", cueCount: 427 }],
  arabic: null | { fileName, cueCount, edited: boolean, matched: boolean | null, missing: 3, extra: 0, drift: 0 },
  fingerprints: 1,
  view: { displayOffsetMs, displayMode }
}
```

`summarizeVideo(record)` يبنيه؛ و`matched=null` حين لا بصمة.
