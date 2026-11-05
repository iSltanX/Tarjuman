# عقد الأخطاء والرسائل والتشخيص

> **مثبّت في P2 (2026-11-01)، ووسّعته P10 للإصدار الثاني (2026-11-02)، وأُضيفت رموز P11 عند دمج W6 (§٦)، ثم جُمِّد.** الشيفرة `src/core/errors/` و`src/core/diagnostics/`، واختباراتها `test/unit/model/errors.test.js`.

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
| `base.js` | P2 ثم P10 | `TJ_` عامة، `ST_` تخزين، `MD_` نموذج، `SV_` الحفظ (P10) | `TJ_UNEXPECTED`، `TJ_NOT_IMPLEMENTED`، `TJ_NOT_YOUTUBE`، `TJ_NO_VIDEO`، `TJ_BAD_MESSAGE`، `TJ_BAD_VIDEO_ID`؛ `ST_READ_FAILED`، `ST_WRITE_FAILED`، `ST_QUOTA_EXCEEDED`، `ST_CAPACITY_WARNING`، `ST_LARGE_LIBRARY`، `ST_CORRUPT_RECORD`، `ST_CONFLICT`، `ST_ARABIC_EXISTS`، `ST_NO_RECORD`، `ST_SCHEMA_NEWER`، `ST_MIGRATION_FAILED`، وإشعارات `ST_RESTORED` و`ST_OFFSET_RESET` و`ST_SAVED`؛ `MD_INVALID`، `MD_NEGATIVE_TIME` |
| `extract.js` | P3 ثم P11 | `EX_`، `KIND_` | مملوء في W3 (P3): رسائل الاستخراج (`EX_WRONG_VIDEO`…`EX_LIVE`، و`KIND_MISMATCH`، و`EX_NO_TRACK`) نُقلت من `src/extract/codes.js` المحذوف، ومعها رموز التحويل والتصدير (`EX_INVARIANT_FAILED`، و`EX_SPLIT_NOT_NEEDED`، و`EX_DOWNLOAD_FAILED`…). وفي W6 (P11) §٦. وأضاف تدقيق 7a66f91 (C4) `EX_BEYOND_DURATION`: فشل ثابت الحدود وحده (نص يبدأ بعد نهاية الفيديو). |
| `import.js` | P4 ثم P11 | `IM_` استيراد، `CMP_` مقارنة | مملوء في W3 (P4): أخطاء القراءة والتحليل والأجزاء (`IM_NO_FILE`…`IM_PARTS_GAP`)، وملاحظات التنظيف (`IM_NOTE_…`)، و`CMP_RESTORE_UNAVAILABLE`. وفي W6 (P11) §٦. |
| `overlay.js` | P5 | `PL_` | مملوء في W3 (P5): `PL_MOUNT_FAILED`، و`PL_RENDER_FAILED`، و`PL_FULLSCREEN_HOST`. |
| `controls.js` | P6 | `CT_` | مملوء في W4 (P6): التركيب والرسم (`CT_MOUNT_FAILED`، `CT_RENDER_FAILED`، `CT_BAR_OVERFLOW`)، والتحميل والنسخ (`CT_NOT_CAPTURED`…`CT_SPLIT_INVALID`)، والعرض والإزاحة (`CT_VIDEO_CHANGED`…`CT_STEP_INVALID`)، والخطوط (`CT_FONT_FALLBACK`، `CT_FONT_SYSTEM`). |
| `pages.js` | P7 | `PG_` | مملوء في W4 (P7): النسخ (`PG_COPY_DONE`…`PG_ID_COPIED`)، والمحفوظات وأوامر الصف (`PG_LIST_FAILED`…`PG_OPEN_FAILED`)، والإعدادات والتخزين والتشخيص (`PG_SAVED`…`PG_DIAGNOSTICS_FAILED`). |
| `editor.js` | P8 ثم P11 | `ED_` | مملوء في W4 (P8): أخطاء التوقيت والنص (`ED_END_BEFORE_START`…`ED_TEXT_INVALID`)، والتحذيرات (`ED_OVERLAP`…`ED_TEXT_BLANK_LINE`)، والإزاحة والتثبيت (`ED_SHIFT_NEGATIVE`…`ED_NO_OFFSET`)، والحفظ والتصدير وما حولهما (`ED_SAVE_HAS_ERRORS`…`ED_LEAVE_UNSAVED`). وفي W6 (P11) §٦. |
| `backup.js` | P10 (التسجيل) ثم P13 | `BK_` | مسجّل في الفهرس **بلا رسائل** في W6 (P10)؛ تملؤه P13 في W7 بأخطاء النسخة الاحتياطية والاستعادة (عقد [`backup.md`](backup.md) §٥). |

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

## ٥. الإصدار الثاني (P10)

- **الحفظ** (`SV_`، عقد الواجهات §١٣): `SV_SAVED` نجاح، و`SV_FALLBACK_BLOB` إشعار حين تعذّرت واجهة التنزيلات فنُزّل الملف بالطريقة الحالية (مجلد التنزيلات وإعداد المتصفح)، و`SV_BAD_FILE` اسم أو امتداد غير مقبول، و`SV_TOO_LARGE` فوق حد القناة، و`SV_BAD_FOLDER` اسم مجلد فرعي غير صالح، و`SV_CANCELLED` ألغى المستخدم حوار الحفظ، و`SV_FAILED` غير ذلك. و`SV_UNSETTLED` (تدقيق 7a66f91، C4): صدر معرّف التنزيل وتعذّر الاستعلام عن نتيجته أو غاب عنصره، فلا بديل Blob كي لا يتكرر الملف.
- **الخانات والسابقة** (`ST_`): `ST_SLOT_EMPTY` تفعيل خانة فارغة أو تعديلها، و`ST_NO_PREVIOUS` استعادة بلا سابقة، و`ST_PREVIOUS_SAVED` إشعار «حُفظت النسخة السابقة». والاستبدال بلا تأكيد يبقى `ST_ARABIC_EXISTS`.
- **القفز** (`TJ_`): `TJ_WRONG_VIDEO` التبويب يعرض فيديو غير المطلوب، و`TJ_SEEK_FAILED` تعذّر تغيير الزمن (لا مشغّل بعد).
- **النسخة الاحتياطية** (`BK_`): المجال مسجّل ببادئته وبلا رسائل حتى P13. محتوى النسخة لا يدخل التشخيص أبدًا: الأعداد والرموز وحدها.
- **تشخيص الصفحة** (عقد الرسائل §٦) يضيف قسم `page` من أعداد المتحكم والمستخرج وحالة التركيب ورموزها.

## ٦. محرّكات الإصدار الثاني (P11)

أضافتها P11 في ملفات مجالاتها (W6)، ووثّقها منسّق W6 عند الدمج. الرسائل نفسها في الشيفرة؛ وهنا مجموعاتها وما يعنيه كل منها.

- **التصدير** (`extract.js`): ملف الاستكمال `EX_PATCH_NO_SOURCE` (المسار الإنجليزي للبصمة غير محفوظ) و`EX_PATCH_SOURCE_MISMATCH` (المحفوظ لا يطابق البصمة عددًا أو أزمنة أو نصًا) و`EX_PATCH_BAD_NUMBERS`؛ والنص الدراسي `EX_STUDY_NO_ENGLISH` (ثنائي اللغة بلا مرجع إنجليزي).
- **الاستيراد** (`import.js`): `IM_NO_TIMING` نص بأرقام بلا سطور توقيت (لا تُخترع أزمنة)، و`IM_NOTE_MD_EMPHASIS` ملاحظة إزالة علامات التأكيد، ورسالتا `IM_NO_CUES` و`IM_NOTE_FENCE` و`IM_NOTE_CHATTER_BEFORE` و`IM_NOTE_CHATTER_AFTER` بصياغتها الموسّعة (السياج ``` أو ~~~، والعناوين). وملف التصحيح والأجزاء المستلمة تباعًا: أخطاء تمنع القراءة `IM_PATCH_NO_REFERENCE` و`IM_PATCH_OUT_OF_RANGE` و`IM_PATCH_TIME_MISMATCH` و`IM_PATCH_RENUMBERED` و`IM_PATCH_DUPLICATE` و`IM_PATCH_NOTHING` و`IM_PATCH_UNALIGNED` و`IM_PATCH_STALE`؛ وتحذيرات لا تمنع `IM_PATCH_SKIPPED_EMPTY` و`IM_PATCH_SKIPPED_WEAK` و`IM_PATCH_SKIPPED_STRUCTURE` و`IM_PATCH_NO_ARABIC` و`IM_PATCH_NAME_OTHER_VIDEO`.
- **المقارنة والمحاذاة** (`import.js`): `CMP_RESTORE_UNVERIFIED` (العدد والترقيم يطابقان والمحاذاة غير متحققة، والأسباب فيه)، و`CMP_RESTORE_UNAVAILABLE` بصياغته الموسّعة؛ وأسباب المحاذاة `CMP_ALIGN_EMPTY` و`CMP_ALIGN_TOO_DENSE` و`CMP_ALIGN_COVERAGE` و`CMP_ALIGN_WEAK` و`CMP_ALIGN_NUMBER_ONLY` و`CMP_ALIGN_OFFSET` و`CMP_ALIGN_DRIFTING` و`CMP_ALIGN_MERGED` و`CMP_ALIGN_SPLIT` و`CMP_ALIGN_SHIFTED` و`CMP_ALIGN_ONLY_A` و`CMP_ALIGN_ONLY_B` و`CMP_ALIGN_UNORDERED`، تُعرض كما هي في تقرير المقارنة ومعاينة الاستبدال؛ وسبب ترتيب المراجع `CMP_REF_MATCHED` و`CMP_REF_SUMMARY`؛ ورفض الدمج الثلاثي لضعف الثقة `CMP_MERGE_LOW_MINE` و`CMP_MERGE_LOW_THEIRS`.
- **المحرّر** (`editor.js`): `ED_MERGE_INVALID` و`ED_SPLIT_INVALID`، وتصحيح الانجراف `ED_DRIFT_ANCHORS` و`ED_DRIFT_RANGE` و`ED_DRIFT_NEGATIVE`، وتنبيها الكثافة `ED_READING_FAST` و`ED_LINE_LONG` (لا يمنعان الحفظ ولا التصدير؛ العتبة `READING_DEFAULTS` أو `prefs.review.maxCps`).

## ٧. إصلاحات المراجعة المستقلة (2026-11-04)

أضيفت بعد التجميد بقرار سلطان (2026-11-04) على الفرع `tj/review-apply` من `tj/store-release`، مع إصلاحات `tj/review-fixes` (`70026ae`). رمزان جديدان في ملفي مجاليهما، ولا رمز تغيّر معناه.

- **المحفوظات** (`pages.js`): `PG_DELETE_STALE` رفض الحذف حين تتغيّر ترجمات الفيديو من مكان آخر بعد فتح التأكيد، فلا يُحذف إلا ما سُرد فيه، وتُعاد القائمة.
- **التصدير** (`extract.js`): `EX_STUDY_CLAMPED` إشعار لا خطأ في حوار «نص دراسي…»: بالإزاحة الحالية تقع مقاطع قبل بداية الفيديو، فيبدأ رابطها من 0:00 وحدها وتبقى الإزاحة لبقية المقاطع. والأرقام في `{list}`، أول ثمانية ثم «…».

## ٨. تدقيق 7a66f91 — C2: سلامة التخزين بين السياقات (2026-11-05)

ستة رموز جديدة في ملفات مجالاتها بقرار سلطان (D3)، ولا رمز تغيّر معناه. كلها لتأكيد بُني على حالة تغيّرت من مكان آخر قبل الموافقة، فلا يقع الفعل ويقول ذلك:

- **المحفوظات** (`pages.js`): `PG_RESTORE_STALE` استعادة السابقة بتأكيد قديم (U10)، و`PG_SLOT_GONE` حذف خانة حذفها تبويب آخر والفيديو باقٍ (U14)، و`PG_UNDO_STALE` «تراجع» تفعيلٍ بعد تفعيل من مكان آخر (U95)، و`PG_UNREADABLE_DELETED` إشعار نجاح حذف السجل الذي لا يُقرأ من حواره الخاص (U08).
- **النسخة الاحتياطية** (`backup.js`): `BK_RESTORE_CHANGED` فيديو تغيّر بعد المعاينة فلم يُستبدل (U11)، والعدد في `{n}`.
- **المشغّل** (`controls.js`): `CT_ACTIVE_CHANGED` إشعار ± أو إزاحة على ترجمة صارت غير النشطة أو استُبدل ملفها من مكان آخر قبل وصول الإشعار، فلم تُطبَّق (U12).

ونص `ST_CORRUPT_RECORD` («ويمكنك حذفه من المحفوظات») صار صادقًا: «حذف بيانات الفيديو…» على السجل الذي لا يُقرأ يفتح تأكيدًا خاصًا به، وبنود الكتابة الأخرى تعرض رسالته ومعها «حذف السجل…».


## ٩. تدقيق 7a66f91 — C5: الاستيراد والتصدير وSRT (2026-11-05)

ثمانية رموز جديدة في `extract.js`، ورمز في `editor.js`، وملاحظة في `import.js` (القرار Q03 ب: يُعدَّل ما يلزم النطاق ويُذكر في تقرير المرحلة). ولا رمز تغيّر معناه.

- **ما يُكتب يُقرأ بالعدد نفسه** (`extract.js`، U78): `EX_TEXT_BREAKS_SRT` في نص مقاطع عربية سطر يُقرأ رأسَ مقطع (سطر زمن كامل، أو رقم يليه ما يشبه الزمن، أو سياج ``` أو عنوان #)، و`EX_TRACK_BREAKS_SRT` في مسار إنجليزي من يوتيوب لسطر زمن أو رقم يليه زمن وحدهما (فالسياج والعنوان فيه نص، ولا يقرؤه الاستيراد)، والأرقام في `{list}`. ومقابلهما في لوحة المحرّر `ED_TEXT_BREAKS_SRT` (`editor.js`)، تحذير يمنع التصدير لا الحفظ. والسطر الشبيه بالزمن بلا رقم قبله («1 --> 2») نص يُكتب ويُقرأ كما هو (U35).
- **ملف الاستكمال** (`extract.js`، U79): `EX_PATCH_SOURCE_UNWRITABLE` نص إنجليزي مختار يُقرأ رأسَ مقطع، بأرقامه في `{list}`؛ و`buildPatchPackage` يعيده `{ ok: false, code, params }` ولا يرمي.
- **حد الرفع في التقسيم** (`extract.js`، U31 والقرار Q23): `EX_SPLIT_SIZE_RAISED` تحذير: رُفع حجم الجزء ليبقى عدد الأجزاء 50 أو أقل؛ و`EX_SPLIT_PART_TOO_LARGE` جزء قد يتجاوز بعد ترجمته حجم ملف الرفع (`{max}`) وحجم أصغر يكفي؛ و`EX_SPLIT_IMPOSSIBLE` لا حجم ضمن حد الملفات (`{files}`) يكفي. والخطآن قبل أي تنزيل.
- **إشعاران قبل تنزيل SRT العربي** (`extract.js`، U99): `EX_NOTE_CONTROL_STRIPPED` جُرّدت عند الكتابة محارف تحكم أو تجاوز اتجاه من المقاطع `{list}`، و`EX_NOTE_REREAD_CHANGES` وسوم تنسيق يجرّدها الاستيراد من المقاطع `{list}`. يعيدهما `buildArabicExport` في `notes`.
- **الاستيراد** (`import.js`، U38): `IM_NOTE_TIME_MARKS` ملاحظة تطبيع الفاصلة العربية «٫» و«،» والأسهم «→» و«->» و«—>» في سطور الزمن. وصار مثال الزمن في `IM_NO_CUES` و`IM_NO_TIMING` و`IM_BAD_TIME` معزولًا LTR (U41)، و`IM_PARTS_STRAY_NUMBER` مع `IM_PARTS_OVERLAP` تحت «دمج الأجزاء» لأنه يوقف الاستيراد كما كان (D-06).
- **نصوص تغيّرت صياغتها بالمعنى نفسه:** `IM_NOTE_FENCE` «من الملف» بدل «حول الملف» (السياج حدّ لأي مقطع، U38)، و`EX_EMPTY_TEXT` و`ED_TEXT_EMPTY` «بلا نص ظاهر» (الفارغ بصريًا فارغ في العربي، U80)، و`ED_EXPORT_BLOCKED` يذكر السطر الذي يُقرأ رأسَ مقطع.
