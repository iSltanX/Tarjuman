# المصطلحات بالإنجليزية — `bysltan.com/tarjuman/en/glossary`

> النسخة الإنجليزية من `glossary.md`، بعلامات بنيته العربية. هذان السطران لا يُنشران.

## الرأس

- **مسار الصفحة:** Tarjuman · Glossary
- **العنوان (`h1`):** Glossary — Tarjuman
- **المقدمة:** Tarjuman’s names as they appear in its interface, each with its counterpart in the other language, defined from the Help pages and the user guide.

## SRT — `#term-srt`

**في الواجهة (زر):** Download original (SRT)

Saves a video’s subtitles as an SRT file so you can translate it yourself with any AI model, from any language to yours, then shows your translation over the video, where you can adjust its timing and edit it.

## track — `#term-track`

**المقابل:** المسار

**في الواجهة (تسمية):** Captured YouTube subtitles

Tarjuman accepts every track YouTube offers for the video, manual or auto-generated, and any SRT file in any language. YouTube alone decides which languages each video has, and Tarjuman doesn’t create or switch tracks.

## manual — `#term-manual`

**المقابل:** الترجمة اليدوية

**في الواجهة (نص):** Arabic · manual · 412 segments

A subtitle track the video’s owner added, not one YouTube generates automatically.

## auto-generated — `#term-auto-generated`

**المقابل:** الترجمة التلقائية

**في الواجهة (نص):** Arabic · auto-generated · 212 segments

A track YouTube generates automatically from the video’s speech, so it may contain transcription errors.

## YouTube’s auto-translation — `#term-auto-translate`

**المقابل:** ترجمة يوتيوب الآلية

**في الواجهة (نص):** English, auto-translated by YouTube from Arabic

Accepted, labeled “‹Language›, auto-translated by YouTube from ‹source language›”. It doesn’t take priority over the video’s original subtitles, and if it’s the only one captured, it’s selected with that label. It’s a machine translation rather than what’s said in the video, so its errors come on top of any transcription errors.

## segment — `#term-segment`

**المقابل:** المقطع

**في الواجهة (نص):** Segments: 11 of 12

The unit of a subtitle file: its number, its start and end times, and its text, shown over the video for that span.

## Translation timing — `#term-timing`

**المقابل:** التوقيت

**في الواجهة (نص):** Translation timing

If the translation runs ahead of the speech or behind it, adjust it with the − and + buttons on the player bar, or inside the timing menu when the bar is narrow.

## offset — `#term-offset`

**المقابل:** الإزاحة

**في الواجهة (نص):** +0.5

Tarjuman saves the offset with each translation, so it’s there when you come back.

## Button step — `#term-button-step`

**المقابل:** خطوة الأزرار

**في الواجهة (خيارات):** 0.5 · 1 · Custom

Each press moves it by a fixed step, 0.5 seconds by default, which you can change in Settings.

## Sync by sentence… — `#term-sync-by-sentence`

**المقابل:** مزامنة بجملة

**في الواجهة (زر):** Sync by sentence…

The timing menu also has “Sync by sentence…”: choose a sentence you hear and Tarjuman sets the timing from it, with “Undo” alongside.

## subtitle layer — `#term-overlay`

**المقابل:** الطبقة

**في الواجهة (فوق الفيديو):** Long before compasses, travelers crossed these dunes by the stars. · قبل البوصلة بزمن طويل، عبر المسافرون هذه الكثبان بهدي النجوم.

Your translation appears on its own or over the original, each line in the text direction of its language; a line with none of that language’s letters reads left to right, so its punctuation isn’t flipped.

## Display mode — `#term-display-mode`

**المقابل:** الترجمة وحدها / فوق الأصل

**في الواجهة (خيارات):** Translation only · Translation over original

Display mode: translation only, translation over the original (named after its language, from the file you downloaded), or hidden.

## theater mode — `#term-theater`

**المقابل:** الوضع المسرحي

It works in default view, theater mode and fullscreen, and hides during ads.

## Synced transcript — `#term-synced-transcript`

**المقابل:** النص المتزامن

**في الواجهة (نص):** Synced transcript

A panel beside the video shows the whole translation with the current segment highlighted, so you can read what came before and what’s coming, and fix a segment’s text right where it is. It stays closed until you open it from its button.

## Translation instructions — `#term-instructions`

**المقابل:** تعليمات الترجمة

**في الواجهة (زر):** Copy instructions

**The instructions** are copied from the extension popup with a “From” and “To” pair, for any two different languages. Their text is in the interface language at the time of copying, Arabic or English. They include the video’s title and link, and ask for a complete SRT file with the same numbers and timing, named with the requested language’s code.

## From / To — `#term-from-to`

**المقابل:** «من» و«إلى»

**في الواجهة (تسمية):** From · To

Open the Tarjuman popup from the browser toolbar. “From” is filled in with the file’s language as YouTube sent it. Choose “To”, then press “Copy instructions”.

## model — `#term-model`

**المقابل:** النموذج

Tarjuman doesn’t translate anything itself and doesn’t connect to any model. You choose the model and send it the file yourself.

## Segment style — `#term-segment-style`

**المقابل:** شكل المقاطع

**في الواجهة (خيارات):** Standard · Longer segments

“Standard” keeps short segments close to YouTube’s splitting, for the tightest sync with speech. “Longer segments” merges neighboring segments into longer sentences so the model gets more context, which changes the segment count, numbering and timing boundaries.

## Splitting long files — `#term-splitting`

**المقابل:** تقسيم الملفات الطويلة

**في الواجهة (تسمية):** Splitting long files

Under “Splitting long files” in the download menu, split the file into parts and send each part separately. The instructions you copy afterward include a paragraph about the parts.

## Comparison with the original — `#term-comparison`

**المقابل:** المقارنة بالأصل

**في الواجهة (نص):** Matches the original

When you upload your file, Tarjuman compares it with the original you downloaded: what’s missing, what’s extra, where the timing has drifted, and what’s left untranslated. It never changes anything in your file silently.

## Comparison reference — `#term-reference`

**المقابل:** مرجع الأصل

**Original subtitles:** The text, timing and language of the track you chose on YouTube, and its type (manual, auto-generated, or YouTube’s auto-translation and its source language), when you download its file, or when you upload a translation and the track is saved as a reference for it.

## Completion — `#term-completion`

**المقابل:** الاستكمال

**في الواجهة (نص):** Completion

It shows what’s missing from the file compared with the original, and prepares a file with the missing segments for you to send to the model and then merge what it returns.

## Review later — `#term-review-later`

**المقابل:** علّم للمراجعة

**في الواجهة (زر):** Review later

“Review later” marks the visible segment so you can come back to it in the Editor, with “Undo” alongside.

## Translation 1, 2, 3 — `#term-slots`

**المقابل:** الخانات 1 و2 و3

**في الواجهة (خانات):** 1 · 2 · 3

Each video holds up to three translations, one of which you make active. When you replace a translation, the previous one is saved so you can restore it.

## Backup — `#term-backup`

**المقابل:** النسخة الاحتياطية

**في الواجهة (زر):** Create a backup

**Backup:** A JSON file containing your entire Library, settings, glossary and language preferences. It includes your translations and video titles, so keep it somewhere safe.
