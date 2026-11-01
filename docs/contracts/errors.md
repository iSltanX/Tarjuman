# عقد الأخطاء والرسائل والتشخيص

> **مثبّت في P2 (2026-11-01) ومجمَّد.** الشيفرة `src/core/errors/` و`src/core/diagnostics/`، واختباراتها `test/unit/model/errors.test.js`.

## ١. البنية

كل خطأ أو إشعار **رمز ثابت** يقرؤه الرمز، و**رسالة عربية** للمستخدم تقول ما حدث وما يمكن فعله (R35)، و**تفاصيل تقنية منقّاة** للتشخيص فقط (بلا رابط ولا رمز، 500 محرف حدًا).

```js
import { TjError, messageFor, toErrorInfo, hasCode } from 'src/core/errors/index.js';

throw new TjError('MD_NEGATIVE_TIME', { params: { list: '1، 2' }, detail: 'تقني منقّى', cause });
err.code      // 'MD_NEGATIVE_TIME'
err.message   // «الإزاحة تجعل بعض المقاطع قبل بداية الفيديو: 1، 2. …»
err.toJSON()  // { code, message, detail }
toErrorInfo(anyError)   // TjError كما هو، وغيره TJ_UNEXPECTED بتفاصيل منقّاة
messageFor(code, params) // القوالب {name} تُملأ؛ الرمز المجهول يُعاد كما هو
```

صيغة الرمز `^[A-Z]+_[A-Z0-9_]+$`. والرسالة نص عادي بالعربية الواضحة، والأرقام لاتينية.

## ٢. المجالات والبادئات

كل مجال ملف واحد يصدّر `PREFIXES` و`MESSAGES`، ويجمعها `index.js`. **البادئة محجوزة لمجال واحد**، فلا تتصادم مرحلتان متوازيتان على رمز (اختبار).

| الملف | المالك | البادئات | المحتوى الآن |
| --- | --- | --- | --- |
| `base.js` | P2 | `TJ_` عامة، `ST_` تخزين، `MD_` نموذج | `TJ_UNEXPECTED`، `TJ_NOT_IMPLEMENTED`، `TJ_NOT_YOUTUBE`، `TJ_NO_VIDEO`، `TJ_BAD_MESSAGE`، `TJ_BAD_VIDEO_ID`؛ `ST_READ_FAILED`، `ST_WRITE_FAILED`، `ST_QUOTA_EXCEEDED`، `ST_CAPACITY_WARNING`، `ST_LARGE_LIBRARY`، `ST_CORRUPT_RECORD`، `ST_CONFLICT`، `ST_ARABIC_EXISTS`، `ST_NO_RECORD`، `ST_SCHEMA_NEWER`، `ST_MIGRATION_FAILED`، وإشعارات `ST_RESTORED` و`ST_OFFSET_RESET` و`ST_SAVED`؛ `MD_INVALID`، `MD_NEGATIVE_TIME` |
| `extract.js` | P3 | `EX_`، `KIND_` | مملوء في W3 (P3): رسائل الاستخراج (`EX_WRONG_VIDEO`…`EX_LIVE`، و`KIND_MISMATCH`، و`EX_NO_TRACK`) نُقلت من `src/extract/codes.js` المحذوف، ومعها رموز التحويل والتصدير (`EX_INVARIANT_FAILED`، و`EX_SPLIT_NOT_NEEDED`، و`EX_DOWNLOAD_FAILED`…). |
| `import.js` | P4 | `IM_` استيراد، `CMP_` مقارنة | مملوء في W3 (P4): أخطاء القراءة والتحليل والأجزاء (`IM_NO_FILE`…`IM_PARTS_GAP`)، وملاحظات التنظيف (`IM_NOTE_…`)، و`CMP_RESTORE_UNAVAILABLE`. |
| `overlay.js` | P5 | `PL_` | مملوء في W3 (P5): `PL_MOUNT_FAILED`، و`PL_RENDER_FAILED`، و`PL_FULLSCREEN_HOST`. |
| `controls.js` | P6 | `CT_` | مملوء في W4 (P6): التركيب والرسم (`CT_MOUNT_FAILED`، `CT_RENDER_FAILED`، `CT_BAR_OVERFLOW`)، والتحميل والنسخ (`CT_NOT_CAPTURED`…`CT_SPLIT_INVALID`)، والعرض والإزاحة (`CT_VIDEO_CHANGED`…`CT_STEP_INVALID`)، والخطوط (`CT_FONT_FALLBACK`، `CT_FONT_SYSTEM`). |
| `pages.js` | P7 | `PG_` | مملوء في W4 (P7): النسخ (`PG_COPY_DONE`…`PG_ID_COPIED`)، والمحفوظات وأوامر الصف (`PG_LIST_FAILED`…`PG_OPEN_FAILED`)، والإعدادات والتخزين والتشخيص (`PG_SAVED`…`PG_DIAGNOSTICS_FAILED`). |
| `editor.js` | P8 | `ED_` | مملوء في W4 (P8): أخطاء التوقيت والنص (`ED_END_BEFORE_START`…`ED_TEXT_INVALID`)، والتحذيرات (`ED_OVERLAP`…`ED_TEXT_BLANK_LINE`)، والإزاحة والتثبيت (`ED_SHIFT_NEGATIVE`…`ED_NO_OFFSET`)، والحفظ والتصدير وما حولهما (`ED_SAVE_HAS_ERRORS`…`ED_LEAVE_UNSAVED`). |

كل مرحلة تضيف رموزها في ملفها وحده، ولا تعدّل `index.js` (مشترك). رسالة رمز من مجال آخر تُقرأ بـ`messageFor` ولا تُنسخ.

## ٣. العرض

- داخل المشغّل: رسالة عابرة قصيرة غير حاجبة فوق الشريط (P6)، والتفاصيل الطويلة في المحرّر.
- في الصفحات: `alertBox` بعنوان «تعذّر…» والرسالة، و«نسخ التشخيص» عند اللزوم (مواصفة التصميم §١٢).
- الإشعار (`notice` في المتحكم) يحمل `tone`: `info` أو `success` أو `warning` أو `error`.
- لا معنى باللون وحده: كل حالة لها نص.

## ٤. تقرير التشخيص (R36)

```js
import { createDiagnosticReport, formatDiagnosticReport } from 'src/core/diagnostics/report.js';
createDiagnosticReport({ version: '0.2.0', browser: 'Brave 1.98', sections: { store: {...}, extract: extractor.diagnostics() } })
```

- **يتضمن:** الإصدار، والمتصفح، ورموز الأخطاء، والأحجام والأعداد.
- **لا يتضمن أبدًا:** روابط، أو رموز جلسة، أو ملفات ارتباط، أو نص ترجمة أو عنوان فيديو: المفاتيح `text` و`texts` و`cues` و`body` و`srt` و`original` و`current` و`title` و`fileName` و`lines` و`words` تُستبدل بـ«[مستبعد]»، ثم يمر الباقي بـ`sanitizeDeep` (اختبار).
- `src/core/diagnostics/sanitize.js` (من P1) هو المنقّي الوحيد، ويستعمله الفحص الآلي `check:secrets` على العينات والأدلة.
- لا `console.*` في `src` (فحص ثابت): الأخطاء رموز في الحالة وتقرير التشخيص.
