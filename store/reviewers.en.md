# ملاحظات المراجعين — ترجمان 2.1.2

> **المرحلة:** T6 من جولة النشر، 2026-11-04. بالإنجليزية لأن المراجعين يقرؤونها (قرار سلطان: «ملاحظات المراجعين بالإنجليزية»)، ولا يراها المستخدمون. تصف ما يحدث فعلًا فقط، ولا تدّعي أن التصدير مسموح ولا تخفيه (§١ من [`README.md`](README.md)).
> **الحقول:** Chrome «Test instructions» (اختياري ونوصي به)، وEdge «Notes for certification» (البند 1.3 يوجب خطوات الاختبار)، وAMO «Notes for Reviewers» (حتى 3,000 محرف). والكتل تُلصق كما هي، ويقيس `scripts/release/store-assets.mjs --check` أطوالها.
> **ملف التجربة:** مقاطع عربية قليلة داخل الملاحظة نفسها لأن الحقول نص فقط. والملف الكامل (60 مقطعًا بتوقيت الأصل) في [`test-files/Y-rmzh0PI3c.ar.srt`](test-files/Y-rmzh0PI3c.ar.srt)، تُرجم خارج ترجمان بنموذج ذكاء اصطناعي عن الترجمة الإنجليزية للفيلم، لأن ترجمان لا يترجم.

## Chrome Web Store — Test instructions

<!-- field: reviewer.chrome -->
```text
No account, login or payment is needed. Tarjuman works only on www.youtube.com watch pages on desktop. The interface is in English or Arabic: on first use it follows YouTube's interface language (otherwise the browser's), any other language starts in English, and Settings > Display > Interface language changes it. The names below are the English ones.

Test video (Cosmos Laundromat, Blender Foundation, CC BY, English captions): https://www.youtube.com/watch?v=Y-rmzh0PI3c

1. Open the video and turn on captions (CC) in the YouTube player. Any caption language works; English is used here. Tarjuman adds its buttons to the player's control bar; hover shows each name.
2. "Download original (SRT)" > "Download file" saves Y-rmzh0PI3c.en.manual.normal.srt to the Downloads folder. Then the toolbar popup, under "Translation instructions", shows From (detected as English from the captured track) and To (Arabic by default, any language can be chosen); "Copy instructions" copies ready translation instructions to the clipboard.
3. The translation itself happens outside the extension: the user sends the file to any AI model or translates it by hand. To skip this step, save the Arabic sample at the end of these notes as test.ar.srt (UTF-8).
4. "Upload translation (SRT)" > choose the file. The Arabic lines appear over the video from 3:00. Because the sample has only 6 of the 60 lines, Tarjuman reports the missing lines; it never changes the file silently. The − and + buttons shift the timing.
5. The toolbar popup also opens Library (saved videos) and Settings; "Edit translation" opens the Editor for a video that has a translation.

What it does not do: it does not download video or audio, and it never requests subtitle files itself. A main-world script at document_start wraps fetch and XMLHttpRequest to read a copy of the /api/timedtext response that the YouTube player requested when captions were turned on; it makes no request of its own and passes the page's call through unchanged.

Network: only video thumbnails in Library, loaded from i.ytimg.com by video ID (off by default since 2.2.0; a setting turns them on). There is no Tarjuman server and no optional host permission: Settings > About > "Report a problem" shows every field, then copies the report as text for the user to email to the support address; the extension sends nothing.

Arabic sample (test.ar.srt):
12
00:03:00,500 --> 00:03:04,000
أنت أكثر بكثير من مجرد خروف، أليس كذلك؟

13
00:03:05,000 --> 00:03:08,000
حقًا؟ وكيف عرفت؟

14
00:03:10,000 --> 00:03:12,900
انظر إلى نفسك. أنت مغامر يا فرانك.

15
00:03:12,900 --> 00:03:17,000
مثلي تمامًا، أنت... ذئب وحيد.

16
00:03:18,000 --> 00:03:22,000
قل لي، أيختار المرء أن يكون وحيدًا؟

17
00:03:23,000 --> 00:03:25,000
لا، لا يختار.
```

## Microsoft Edge Add-ons — Notes for certification

نص Chrome نفسه بحرفه، فالحزمة بايتاتها نفسها. ويُضاف إليه سطر لأن الحقل يسأل عن الفروق بحسب المنطقة والإعدادات، وفقرة عن سياسة الخصوصية لأن البند 1.5.2 يطلب أن تشير أساسًا إلى Edge (قرار سلطان 2026-11-05: سياسة واحدة، وتوضيح للمراجع). والنص كله نحو 3,460 محرفًا. وحد الحقل الفعلي غير معروف (غير منشور، ولم يُتحقق منه في اللوحة)، فيُطابَق بعدّاده وقت التقديم، وإن ضاق عنه فالنسخة المختصرة `reviewer.edge.fallback` أدناه أقل من 2,000 محرف:

<!-- field: reviewer.edge -->
```text
Expected differences: none by region. Captions must exist for the video (the test video has English manual captions). Tarjuman's buttons do not appear on Shorts or in YouTube players embedded in other sites. On live streams in progress, only subtitle extraction is refused; uploading and showing an SRT file still work.

Privacy policy: https://bysltan.com/tarjuman/privacy. The same package is published for other browsers, so one policy covers it; where behavior differs by browser, it names Microsoft Edge explicitly (e.g. in Microsoft Edge, Library thumbnails stay as they were for users upgrading to 2.2.0, while new installs start with them off). Nothing reaches the developer from the extension: a problem report is copied as text for the user to email.
```

### نسخة مختصرة احتياطية (إن ضاق حد الحقل)

أقل من 2,000 محرف، وتغني عن `reviewer.chrome` و`reviewer.edge` معًا.

<!-- field: reviewer.edge.fallback -->
```text
No account, login or payment is needed. Tarjuman works on www.youtube.com watch pages on desktop. Interface: English or Arabic (Settings > Display); names below are English.

Test video (CC BY, English captions): https://www.youtube.com/watch?v=Y-rmzh0PI3c
1. Turn on captions (CC). Tarjuman adds buttons to the player's control bar.
2. "Download original (SRT)" > "Download file" saves the .srt to Downloads. The toolbar popup copies translation instructions ("Copy instructions").
3. Translation happens outside the extension. To skip it, save the sample below as test.ar.srt (UTF-8).
4. "Upload translation (SRT)" > choose the file. The line appears over the video at 3:00; missing lines are reported, never changed silently. The − and + buttons shift the timing.

It downloads no video or audio and never requests subtitle files itself: a main-world script wraps fetch and XMLHttpRequest to read a copy of the /api/timedtext response the player requested, and passes the page's call through unchanged.

Network: only Library thumbnails from i.ytimg.com by video ID (off by default since 2.2.0; a setting turns them on). There is no Tarjuman server and no optional host permission: "Report a problem" in Settings copies the report as text for the user to email; the extension sends nothing.

Privacy policy: https://bysltan.com/tarjuman/privacy. One policy covers every browser; where behavior differs it names Microsoft Edge. On Shorts and embedded players the buttons do not appear. On live streams in progress only extraction is refused.

Sample (test.ar.srt):
12
00:03:00,500 --> 00:03:04,000
أنت أكثر بكثير من مجرد خروف، أليس كذلك؟
```

## Firefox Add-ons — Notes for Reviewers

<!-- field: reviewer.amo -->
```text
No account, login or payment is needed. Desktop only. Interface: English or Arabic (Settings > Display); names below are English.

Source code: tarjuman-2.1.2-source.zip, with SOURCE-README.txt. Build: npm ci, then npm run build:firefox, which writes dist-firefox/ matching the submitted package byte for byte. esbuild bundles each entry with syntax-level minification only: no renamed identifiers, no source maps, no obfuscation.

Test video (CC BY, English captions): https://www.youtube.com/watch?v=Y-rmzh0PI3c
1. Turn on captions (CC); any language works, English is used here. Tarjuman adds buttons to the player's control bar.
2. "Download original (SRT)" > "Download file" saves the English .srt (via a blob: URL in the background script). The toolbar popup copies translation instructions ("Copy instructions") for the chosen From and To languages.
3. Translation happens outside the extension. To skip it, save the Arabic sample below as test.ar.srt.
4. "Upload translation (SRT)" > choose the file. Arabic lines appear over the video from 3:00; the missing lines are reported, never changed silently. − and + shift the timing.
5. The popup opens Library, Settings and (Edit translation) the Editor.

How subtitles are read: a main-world content script at document_start wraps fetch and XMLHttpRequest and reads a copy of the /api/timedtext response the YouTube player requested. It sends no request and passes the page's call through unchanged.

Data (data_collection_permissions: required none; optional browsingActivity):
- Library thumbnails from i.ytimg.com by video ID: off in Firefox until the user turns them on in Settings, which requests browsingActivity.
- Problem report from Settings > About > "Report a problem": copied as text after a full preview, for the user to email to the support address. The extension sends nothing and has no optional host permission. Since 2.2.0 technicalAndInteraction is no longer declared, because no report leaves the extension.
Everything else stays in storage.local.

Arabic sample (test.ar.srt):
12
00:03:00,500 --> 00:03:04,000
أنت أكثر بكثير من مجرد خروف، أليس كذلك؟

13
00:03:05,000 --> 00:03:08,000
حقًا؟ وكيف عرفت؟

14
00:03:10,000 --> 00:03:12,900
انظر إلى نفسك. أنت مغامر يا فرانك.
```

## ما تستند إليه

| الجملة | الدليل |
| --- | --- |
| لا حساب ولا دفع، ويُحقن في صفحات www.youtube.com ويعمل في صفحة المشاهدة | `src/manifest.json` (`content_scripts.matches`)، و`docs/product-spec.md` §١ |
| لغة الواجهة: اختيارها الأول وتغييرها من الإعدادات | `src/i18n/locale.js` (`resolveInitialLocale`)، و`src/pages/settings/view.js`، و`docs/contracts/storage.md` §١٤ |
| أسماء الأزرار والملف | `src/i18n/en/player.js` و`src/i18n/en/popup.js` و`src/i18n/en/settings.js`، و`src/core/export/names.js`؛ واسم الملف كما نزّلته الجلسة اليدوية (`store/test-files/README.md`) |
| المقارنة لا تعدّل بصمت | `docs/contracts/data-model.md` §٥ |
| غلافا fetch وXHR يقرآن الرد ولا يطلبان | `src/main-world/capture.js` |
| `blob:` في Firefox | `test/live/stores/t3.mjs` (`3d6a800`) |
| الصور وموافقة Firefox الواحدة، والبلاغ بلا إرسال | `docs/site/privacy.md` وجدول أدلته، و`scripts/targets.mjs`، و`src/pages/settings/report.js` |
| إعادة البناء بايتًا | `scripts/release/store.mjs` (الطريقة)، و`release/store/tarjuman-2.1.2-store.json` (`source.reproduced`) |
| ما لا يعمل عليه | `docs/known-limitations.md` §١ |
| سياسة واحدة تسمّي Edge حيث يختلف السلوك: الصور مطفأة افتراضيًا منذ 2.2.0، ومن رقّى تبقى صوره كما كانت | `docs/site/privacy.md` (أسطر «في Chrome وEdge وBrave»)، و`src/core/model/prefs.js` (`ui.thumbnails: false`)، و`src/background/thumbs-pin.js`، و`src/pages/settings/view.js`؛ والبند 1.5.2 من [سياسات مطوري Edge](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) (قُرئ 2026-11-05) |
