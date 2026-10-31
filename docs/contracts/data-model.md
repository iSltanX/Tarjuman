# نموذج البيانات (مسودة)

> مسودة من تأسيس الخطة. تثبّتها P2 بأنواع JSDoc ومدققات في `src/core/model/`، وبأمثلة حقيقية منقّاة من عينات P1.

## البنى

```js
/** مقطع واحد. الأزمنة بالملي ثانية، والنص خام (لا HTML). */
Cue = { n: 1, startMs: 10000, endMs: 12500, text: "سطر أول\nسطر ثانٍ" }

/** مسار إنجليزي مستخرج. لا روابط ولا رموز. */
EnglishTrack = {
  key: "en|asr",            // lang|kind
  lang: "en", kind: "manual" | "asr",
  capturedAt: "ISO", source: "capture",
  cues: Cue[]
}

/** بصمة تصدير: تُحفظ محليًا ولا تُضمَّن في الملف. */
Fingerprint = {
  id: "fp_…", videoId, trackKey, mode: "normal" | "long",
  count, cues: [{ n, startMs, endMs }], textHash, createdAt,
  parts: null | [{ index, from, to }]   // عند التقسيم الاحتياطي فقط
}

/** الترجمة العربية: أصل لا يتغير ونسخة حالية. */
ArabicTrack = {
  fileName, importedAt, original: Cue[],
  current: Cue[] | null,    // null = مطابقة للأصل
  editedAt: "ISO" | null,
  fingerprintId: "fp_…" | null,
  comparison: ComparisonReport | null
}

/** سجل الفيديو. */
VideoRecord = {
  schema: 1, videoId, title, durationSec,
  createdAt, updatedAt,
  english: EnglishTrack[], fingerprints: Fingerprint[],
  arabic: ArabicTrack | null,
  view: { displayOffsetMs: 0, displayMode: "ar" | "dual" | "off" }
}

/** تقرير المقارنة: وصف فقط، لا يعدّل شيئًا. */
ComparisonReport = {
  matched: boolean, countSource, countTarget,
  missing: [n], extra: [n], drift: [{ n, startDeltaMs, endDeltaMs }],
  empty: [n], noArabic: [n], numbering: "same" | "different",
  restoreTimingAvailable: boolean,   // true فقط عند تطابق العدد والترقيم
  notes: [string]                    // مثل: «أُزيل سياج ``` حول الملف»
}

/** الإعدادات. */
Settings = {
  schema: 1, offsetStepMs: 500, displayModeDefault: "ar",
  appearance: { fontScale: 1, background: "soft" | "none" | "solid", position: "bottom" | "raised" | "top" },
  export: { modeDefault: "normal", splitThreshold: 200 },
  thresholds: { driftMs: 100, completeness: 0.85 }
}
```

## مفاتيح التخزين (مقترحة)

| المفتاح | القيمة |
| --- | --- |
| `settings` | `Settings` |
| `index` | قائمة مختصرة للمحفوظات: `[{ videoId, title, updatedAt, hasArabic, hasEnglish }]` |
| `video:<videoId>` | `VideoRecord` |

- لا يُخزَّن `json3` الخام ولا أي رابط أو رمز أو ملف ارتباط.
- كل تغيير في `video:*` يحدّث `index` في العملية نفسها.
- الترحيل بحقل `schema`، والسعة تُقاس بـ`getBytesInUse` مع تحذير عند 80%.
