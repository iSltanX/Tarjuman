# ملاحظات المراجعين — ترجمان 2.0.0

> **المرحلة:** T6 من جولة النشر، 2026-11-04. بالإنجليزية لأن المراجعين يقرؤونها (قرار سلطان: «ملاحظات المراجعين بالإنجليزية»)، ولا يراها المستخدمون. تصف ما يحدث فعلًا فقط، ولا تدّعي أن التصدير مسموح ولا تخفيه (§١ من [`README.md`](README.md)).
> **الحقول:** Chrome «Test instructions» (اختياري ونوصي به)، وEdge «Notes for certification» (البند 1.3 يوجب خطوات الاختبار)، وAMO «Notes for Reviewers» (حتى 3,000 محرف). والكتل تُلصق كما هي، ويقيس `scripts/release/store-assets.mjs --check` أطوالها.
> **ملف التجربة:** مقاطع عربية قليلة داخل الملاحظة نفسها لأن الحقول نص فقط. والملف الكامل (60 مقطعًا بتوقيت الأصل) في [`test-files/Y-rmzh0PI3c.ar.srt`](test-files/Y-rmzh0PI3c.ar.srt)، ترجمه ترجمان في T6 عن الترجمة الإنجليزية للفيلم.

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

Network: only (a) video thumbnails in Library, loaded from i.ytimg.com by video ID (a setting turns them off), and (b) an optional problem report that the user writes and sends from Settings > About > "Report a problem", after a preview of every field. Its host, app-reports.isultantf.workers.dev, is an optional permission requested on the first send.

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

نص Chrome نفسه بحرفه، فالحزمة بايتاتها نفسها. ويُضاف إليه سطر لأن الحقل يسأل عن الفروق بحسب المنطقة والإعدادات، وفقرة عن سياسة الخصوصية لأن البند 1.5.2 يطلب أن تشير أساسًا إلى Edge (قرار سلطان 2026-11-05: سياسة واحدة، وتوضيح للمراجع). والنص كله نحو 3,360 محرفًا، وحد الحقل غير منشور، فيُطابَق بعدّاده وقت التقديم:

<!-- field: reviewer.edge -->
```text
Expected differences: none by region. Captions must exist for the video (the test video has English manual captions). Tarjuman does not run on Shorts, live streams in progress, or YouTube players embedded in other sites.

Privacy policy: https://bysltan.com/tarjuman/privacy. The same package is published for other browsers, so one policy covers it; where behavior differs by browser, it names Microsoft Edge explicitly (e.g. Library thumbnails are on by default in Microsoft Edge, with a switch in Settings). Nothing reaches the developer unless the user sends a problem report after previewing it.
```

## Firefox Add-ons — Notes for Reviewers

<!-- field: reviewer.amo -->
```text
No account, login or payment is needed. Desktop only. Interface: English or Arabic (Settings > Display); names below are English.

Source code: tarjuman-2.0.0-source.zip, with SOURCE-README.txt. Build: npm ci, then npm run build:firefox, which writes dist-firefox/ matching the submitted package byte for byte. esbuild bundles each entry with syntax-level minification only: no renamed identifiers, no source maps, no obfuscation.

Test video (Cosmos Laundromat, Blender Foundation, CC BY, English captions): https://www.youtube.com/watch?v=Y-rmzh0PI3c
1. Turn on captions (CC); any language works, English is used here. Tarjuman adds buttons to the player's control bar.
2. "Download original (SRT)" > "Download file" saves the English .srt (via a blob: URL in the background script). The toolbar popup copies translation instructions ("Copy instructions") for the chosen From and To languages.
3. Translation happens outside the extension. To skip it, save the Arabic sample below as test.ar.srt.
4. "Upload translation (SRT)" > choose the file. Arabic lines appear over the video from 3:00; the missing lines are reported, never changed silently. − and + shift the timing.
5. The popup opens Library, Settings and (Edit translation) the Editor.

How subtitles are read: a main-world content script at document_start wraps fetch and XMLHttpRequest and reads a copy of the /api/timedtext response the YouTube player requested. It sends no request and passes the page's call through unchanged.

Data (data_collection_permissions: required none; optional technicalAndInteraction, browsingActivity):
- Library thumbnails from i.ytimg.com by video ID: off in Firefox until the user turns them on in Settings, which requests browsingActivity.
- Problem report from Settings > About > "Report a problem": sent only when the user presses send after a full preview; requests the optional host permission app-reports.isultantf.workers.dev and, in Firefox, technicalAndInteraction if it was not already granted in the install prompt. Nothing is attached automatically beyond the shown diagnostics: no subtitle text, video ID or account. The description is sent verbatim. As with any extension request, the browser adds User-Agent, Accept-Language and an Origin header with the extension origin (in Firefox, the per-install moz-extension UUID).
- Why technicalAndInteraction and not personalCommunications: the report is a problem report about Tarjuman (the user's description of the problem plus the shown browser, OS and extension versions) sent only to the developer, which matches "crash and error reports"; it is not a message between people. The Chrome and Edge dashboards disclose the same field conservatively as personal communications.
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
| الصور والبلاغ وموافقتا Firefox | `docs/site/privacy.md` وجدول أدلته، و`scripts/targets.mjs` |
| إعادة البناء بايتًا | `scripts/release/store.mjs` (الطريقة)، و`release/store/tarjuman-2.0.0-store.json` (`source.reproduced`) |
| ما لا يعمل عليه | `docs/known-limitations.md` §١ |
| سياسة واحدة تسمّي Edge حيث يختلف السلوك، والصور مفعّلة افتراضيًا فيه بمفتاح في الإعدادات | `docs/site/privacy.md` (أسطر «في Chrome وEdge وBrave»)، و`src/core/model/prefs.js` (`ui.thumbnails: true`)، و`src/pages/settings/view.js`؛ والبند 1.5.2 من [سياسات مطوري Edge](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies) (قُرئ 2026-11-05) |
| البلاغ من «تقارير الأعطال والأخطاء» لا من الاتصالات الشخصية | تعريفا `technicalAndInteraction` و`personalCommunications` في [Built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) (قُرئ 2026-11-05)، و`src/core/report/payload.js`، و`submission.md` §٤ |
