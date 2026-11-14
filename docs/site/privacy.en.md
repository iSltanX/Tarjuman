# سياسة الخصوصية بالإنجليزية — `bysltan.com/tarjuman/en/privacy`

> النسخة الإنجليزية من `privacy.md`، بعلامات بنيته العربية. هذان السطران لا يُنشران.

## الرأس

- **مسار الصفحة:** Tarjuman · Privacy Policy
- **العنوان (`h1`):** Privacy Policy — Tarjuman
- **تاريخ السريان:** ⟨تاريخ النشر⟩
- **المقدمة:** Tarjuman is a browser extension for YouTube watch pages, from BySultan (bysltan.com). This page describes what the extension stores on your device, what it sends, to whom, and when, as the code of version ⟨رقم الإصدار⟩ does it.

## Summary — `#summary`

- Tarjuman is injected into `www.youtube.com` pages and works on the watch page. It extracts the subtitles that YouTube’s player has fetched on its own, in whichever language you chose there, and shows your translation over the video, all inside your browser.
- What it stores, including your translations and settings, stays in the extension’s storage in this browser on this device. It isn’t synced with your browser account or with any service.
- No account, no API key, no AI model inside the extension, no usage tracking, and no ads.
- **Not everything is local.** Only one thing leaves the extension: video thumbnails in “Library”, from YouTube’s servers, which stay off until you turn on their switch. In Firefox they’re requested only with your consent.
- Tarjuman has no server. You copy a problem report from Settings after seeing everything in it, and send it from your own email.
- Translation happens outside the extension: you copy the file and the instructions to a model you choose, and the extension doesn’t connect to it.

## What’s stored on your device — `#stored`

The following is stored in the extension’s local storage within this browser’s profile. None of it is sent to the developer. Only the interface language goes into a report’s text, if you copy and send it yourself.

- **About each video you saved something for:** Its ID, title and duration.
- **Dates:** The first save and last change for each video, the capture of each track, the upload and editing of each translation, the date of each fingerprint, mark and last position, and the date the extension’s storage was initialized.
- **Original subtitles:** The text, timing and language of the track you chose on YouTube, and its type (manual, auto-generated, or YouTube’s auto-translation and its source language), when you download its file, or when you upload a translation and the track is saved as a reference for it. Anything Tarjuman captures before that stays in the memory of the open page and is gone when you close it.
- **A fingerprint of each file you export:** Its segment numbers and times, a digital fingerprint of its text, and the file’s name and date, which Tarjuman uses to compare your translation when you upload it. The fingerprint doesn’t contain the text itself.
- **Your translations:** Up to three per video. Each has the name of the file you uploaded, its short name if you gave it one, its text after the cleanup listed in the upload report (formatting tags and hidden characters are removed, and spaces at line edges are trimmed), its language if you set it or it came in the file name, your edits to it, the result of comparing it with the original, the offset, and the display mode. Alongside them is one previous version of what you last replaced.
- **A draft of edits you haven’t saved:** When you edit a translation in the Editor and haven’t saved it yet, Tarjuman writes its text and timing as they are in the Editor into a draft for that translation, a few seconds after you pause and when you hide or leave the tab, so you can restore it yourself if the Editor closes before you save. With it are the translation’s file name and its upload and edit dates, to tell which translation it belongs to, and the draft’s date. It’s deleted when you save or discard its edits, delete that video’s data (deleting a single translation doesn’t delete it), or clear all data. Drafts are kept for at most five videos; a sixth removes the oldest video’s drafts. They aren’t included in backups.
- **Review marks and last position:** The segment number, its time, and a short fingerprint of its text, without the text itself.
- **Your settings:** The timing step, display mode, translation appearance, export options, reading speed limit, the terms you write in the glossary, along with the term lists you create for language pairs and each list’s two languages, where files are saved and the subfolder name if you named one, and interface switches.
- **Language preferences:** The default “From” and “To” pair, remembering the last translation language, the languages you chose recently, and the pair you changed for each video, with its ID. A pair is stored by video ID when you change it, even before you save a translation for that video, and is removed when you delete that video’s data (deleting a single translation doesn’t remove it). A pair with no row in “Library” is removed by “Clear all data”, or when the pairs exceed 200 and the oldest are dropped.
- **Interface language:** Arabic or English, how it was chosen (your choice, or YouTube’s or the browser’s language on first run), and when it was set. It isn’t included in backups, and it remains after “Clear all data”.
- **The last file Tarjuman saved:** Its download ID in the browser and its date, not its path.
- **Not stored:** The subtitle links the player requested, YouTube session tokens, and YouTube cookies. There’s no log of everything you watch: only a video you saved something for, or changed the language pair of, is stored.

## Files and the clipboard — `#files`

- **Files you download:**
  - These are the original SRT file, export files, and the backup.
  - They’re saved to your Downloads folder, a subfolder inside it, or wherever you choose on each download, depending on your setting.
  - The file name carries the video’s ID and its language code, such as `iG9CE55wbtY.en.manual.normal.srt`.
  - They’re files on your device and remain after the extension is removed, until you delete them yourself.
- **Backup:** A JSON file containing your entire Library, settings, glossary and language preferences. It includes your translations and video titles, so keep it somewhere safe. If you turned off “Video thumbnails in Library”, the backup carries that, so they stay off wherever you restore it.
- **Downloads permission:** Tarjuman uses it to save its own files only, and to look them up by their IDs. It doesn’t read, open or delete your other downloads.
- **Clipboard:** Tarjuman writes to it only when you press a copy button. It doesn’t read from it programmatically; it reads only what you paste yourself into the “Paste the translation here” field (in the popup, or “Paste a translation…” in Library), with no clipboard-read permission.
- **Diagnostics reports** (“Copy page diagnostics” and “Copy diagnostics report”): These contain the version, browser, report time, sizes, counts, error codes, tool status, and the values of display and export settings. No titles, video IDs, text or links. They’re copied to the clipboard only and aren’t sent.

## What’s sent, to whom, and when — `#sent`

Tarjuman has no server, and it connects to none except for the “Library” thumbnails listed after the YouTube page below.

### The YouTube page you’re watching — `#youtube`

- Tarjuman works inside the watch page. When you turn on subtitles (CC), YouTube’s player requests them itself, and Tarjuman reads a copy of the response. You may turn them on by pressing “Turn on CC now” or “Restart CC” in the “Download original” menu. Tarjuman then presses the player’s CC button for you, and the request still comes from the player. Tarjuman doesn’t send YouTube any new request.
- From the player data already in the page, it also reads the list of subtitle tracks the video offers, with each one’s language, type and name, in order to show them to you. It doesn’t read their links or tokens, request them, or switch the track you chose. This list stays in the memory of the open page and isn’t stored.
- On first run, as long as the interface language isn’t set, it reads YouTube’s interface language from the same page (the `lang` attribute), or otherwise the browser’s interface language, to choose its own interface language. That code isn’t sent to anyone. What appears afterward is the resulting interface language: in a report if you copy one, and in the text of the instructions you copy.
- Tarjuman also adds its buttons in the player’s control bar, your translation over the video, the synced transcript panel, and its fonts to the YouTube page itself. To read a copy of the subtitles, it wraps the two page functions the player requests them with (`fetch` and `XMLHttpRequest`), and passes what it reads to the rest of the extension in messages within the page (`postMessage`) that carry only what the page already has: the copy of the subtitles the player requested, the video’s track list, its ID, and the number of subtitle requests. So the page can see all of this and know that Tarjuman is there, as it can with any extension that works inside a page. Tarjuman doesn’t send any of it over the network, to YouTube or anyone else.
- Other than that, Tarjuman doesn’t change what YouTube collects about you while you watch. That is governed by Google’s policy.

### Video thumbnails in “Library” — `#thumbnails`

- **When:** When you open the “Library” page while the “Video thumbnails in Library” switch is on. The switch is off by default since 2.2.0, so a Tarjuman tile appears instead of the thumbnail and nothing is requested until you turn it on.
  - In Chrome, Edge and Brave: If you upgraded to 2.2.0, your thumbnails stay as they were before the upgrade (shown unless you had turned them off).
  - In Firefox: Thumbnails are off until you turn on the switch, and Firefox then asks for your “Browsing activity” consent. If you decline, they stay off. You can withdraw consent at any time from Firefox’s add-ons page, and the thumbnails stop.
- **What’s sent, and to whom:**
  - The browser loads the thumbnail of each saved video shown to you in the list from `i.ytimg.com`, which is YouTube’s servers, using the video’s ID, as it loads any image on the web.
  - YouTube therefore sees the IDs of the videos in your Library, along with what reaches it with any image request, such as your IP address and browser type. The address of the page that requested them isn’t sent with them.
- **How to stop it:** Settings › “Display” › turn off “Video thumbnails in Library”. A Tarjuman tile then appears instead of the thumbnail, and nothing is requested. The switch stays off after “Clear all data”.
- Tarjuman doesn’t store the thumbnails. The browser keeps them in its cache like any other image.

### A problem report, with no server — `#report`

- **Not sent by the extension:** Settings › “About” › “Report a problem” shows the whole report, then copies it as text when you press “Copy report”. You send it yourself from your own email to the support address under [“Contact”](#contact), which is shown in the form with a “Copy email” button. There’s no reports server and no permission, and no email app or link opens from the extension.
- **What it contains:**
  - The report type (bug, suggestion or other), and your description as you wrote it, up to 2000 characters.
  - The Tarjuman version, the browser’s name and version, and the build package (Chromium or Firefox).
  - The operating system, its version and architecture, and the interface language (Arabic or English).
  - You see all of this before copying.
- **Not attached automatically:**
  - No translation text, no video ID, title or link, nothing from your Library, and no attachments.
  - No account, and no identifier Tarjuman assigns to you.
- **Your description as written:** The description is copied verbatim, so if you write a link, a video ID or an email address in it, that is copied with it. The page reminds you if it seems to contain a YouTube link, an email address or something resembling a video ID. It may miss some, so review it yourself. It also blocks copying until you remove anything that resembles a session token or cookie.
- **What reaches us:** Only what you paste into your email, along with what the email itself carries (your address, and your name if it shows). Your email provider and the support address’s provider govern the message.
- **Retention:** Your email stays in the support inbox until it’s deleted. To have it deleted, email the support address.

### What doesn’t use the network — `#offline`

- The tools on the YouTube page, the background worker, the extension icon’s popup, and the Editor: all of them work without a connection.
- The fonts are bundled with the extension, so they aren’t requested from the network.

## What you send to an AI model — `#ai`

- Tarjuman doesn’t translate and doesn’t connect to any model. You copy the file and the instructions, and send them yourself to the model you choose.
- What reaches it from you:
  - The text and timing of the original subtitles, in the file.
  - The instructions in Tarjuman’s interface language (Arabic or English), including the video’s title and link, and the two languages you chose as “From” and “To”.
  - Your glossary terms, if you included the glossary: the general glossary, and any language-pair lists you created that match the instructions’ two languages, up to 100 terms.
- What the model does with that is governed by its terms of service, not by this policy. So don’t send anything you don’t want to share.

## Permissions — `#permissions`

- **Storage** (along with unlimited storage size): To keep your Library and settings on your device.
- **Downloads:** To save Tarjuman’s files where you choose.
- **Pages on `www.youtube.com`:** So Tarjuman’s tools can work over the player. No other sites, and no tabs. If you revoke it in your browser, Tarjuman says so in its popup and settings, and asks for it again when you press “Allow” in Settings. It’s the same permission, not a new one.
- **In Firefox, one optional consent:** “Browsing activity” for Library thumbnails, requested only when you turn on the thumbnails switch. You can withdraw it from Firefox’s add-ons page.
- No permission for browsing history, cookies, or tabs.

## Third parties — `#third-parties`

| Party | When something reaches it | What governs it |
| --- | --- | --- |
| YouTube (Google) | “Library” thumbnails, and the YouTube page itself while you watch | [Google Privacy Policy](https://policies.google.com/privacy) |
| Google (Gmail, the support email) | When you email support, including a report you send from your own email | [Google Privacy Policy](https://policies.google.com/privacy) |
| The AI model you choose | When you send it the file yourself | Its terms of service |
| The browser’s store | Installation and updates | The store’s policy |

## No selling, no advertising — `#limited-use`

- Tarjuman doesn’t sell your data, and doesn’t transfer it for advertising, credit assessment or any other purpose.
- What arrives in report emails is used only to understand and fix the problem and to improve Tarjuman.

## Retention and deletion — `#retention`

- **What’s on your device** stays until you delete it:
  - For one video, from “Library”: “Delete active translation…” or “Delete video data…”.
  - Or all of it, from Settings › “Clear all data”.
- **Removing the extension** deletes all of its storage. This was measured in Chrome, Edge, Brave and Firefox. So make a backup first if you want to keep your Library.
- **Files you downloaded** stay in their folder until you delete them yourself.
- **A report email** stays in the support inbox until it’s deleted. To have it deleted, email the support address (see [“A problem report”](#report)).

## Changes — `#changes`

- When what the extension stores or sends changes, this page changes with it, its effective date changes, and the change is noted in the changelog.
- **Version 2.3.0, released on ⟨تاريخ النشر⟩:** Your device now also stores the term lists you create for language pairs, and a draft of your Editor edits until you save them; the draft is deleted when you save or discard its edits. If you include the glossary in the instructions you send to a model yourself, the lists that match their two languages go with it. And “Turn on CC now” and “Restart CC” in “Download original” press the player’s CC button on your click, so the player requests the subtitles itself; Tarjuman sends no request.

## Contact — `#contact`

- **Support email:** iSultanBy@gmail.com
- **Support page:** [Help](/tarjuman/en/support)
- **Publisher:** BySultan — [bysltan.com](https://bysltan.com)
