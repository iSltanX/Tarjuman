# سياسة الخصوصية بالإنجليزية — `bysltan.com/tarjuman/en/privacy`

> النسخة الإنجليزية من `privacy.md`، بعلامات بنيته العربية. هذان السطران لا يُنشران.

## الرأس

- **مسار الصفحة:** Tarjuman · Privacy Policy
- **العنوان (`h1`):** Privacy Policy — Tarjuman
- **تاريخ السريان:** 2026-11-11
- **المقدمة:** Tarjuman is a browser extension for YouTube watch pages, from BySultan (bysltan.com). This page describes what the extension stores on your device, what it sends, to whom, and when, as the code of version ⟨رقم الإصدار⟩ does it.

## Summary — `#summary`

- Tarjuman is injected into `www.youtube.com` pages and works on the watch page. It extracts the subtitles that YouTube’s player has fetched on its own, in whichever language you chose there, and shows your translation over the video, all inside your browser.
- What it stores, including your translations and settings, stays in the extension’s storage in this browser on this device. It isn’t synced with your browser account or with any service.
- No account, no API key, no AI model inside the extension, no usage tracking, and no ads.
- **Not everything is local.** Since 2.2.0, only one thing leaves the extension: video thumbnails in “Library”, from YouTube’s servers, which stay off until you turn on their switch (through 2.1.2, they’re on by default in Chrome, Edge and Brave). In Firefox they’re requested only with your consent.
- Since 2.2.0, Tarjuman has no server. You copy a problem report from Settings after seeing everything in it, and send it from your own email. Through 2.1.2, a report is also sent, when you press “Send report” and allow it, to the reports server (see [“A problem report”](#report)).
- Translation happens outside the extension: you copy the file and the instructions to a model you choose, and the extension doesn’t connect to it.

## What’s stored on your device — `#stored`

The following is stored in the extension’s local storage within this browser’s profile. None of it is sent to the developer. Only the interface language goes into a report’s text, if you copy and send it yourself.

- **About each video you saved something for:** Its ID, title and duration.
- **Dates:** The first save and last change for each video, the capture of each track, the upload and editing of each translation, the date of each fingerprint, mark and last position, and the date the extension’s storage was initialized.
- **Original subtitles:** The text, timing and language of the track you chose on YouTube, and its type (manual, auto-generated, or YouTube’s auto-translation and its source language), when you download its file, or when you upload a translation and the track is saved as a reference for it. Anything Tarjuman captures before that stays in the memory of the open page and is gone when you close it.
- **A fingerprint of each file you export:** Its segment numbers and times, a digital fingerprint of its text, and the file’s name and date, which Tarjuman uses to compare your translation when you upload it. The fingerprint doesn’t contain the text itself.
- **Your translations:** Up to three per video. Each has the name of the file you uploaded, its short name if you gave it one, its text after the cleanup listed in the upload report (formatting tags and hidden characters are removed, and spaces at line edges are trimmed), its language if you set it or it came in the file name, your edits to it, the result of comparing it with the original, the offset, and the display mode. Alongside them is one previous version of what you last replaced.
- **Review marks and last position:** The segment number, its time, and a short fingerprint of its text, without the text itself.
- **Your settings:** The timing step, display mode, translation appearance, export options, reading speed limit, the terms you write in the glossary, where files are saved and the subfolder name if you named one, and interface switches.
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

Since 2.2.0, Tarjuman has no server, and it connects to none except for the “Library” thumbnails listed after the YouTube page below. Through 2.1.2, it also connects to the reports server when you send a report (see [“A problem report”](#report)).

### The YouTube page you’re watching — `#youtube`

- Tarjuman works inside the watch page. When you turn on subtitles (CC), YouTube’s player requests them itself, and Tarjuman reads a copy of the response. It doesn’t send YouTube any new request.
- From the player data already in the page, it also reads the list of subtitle tracks the video offers, with each one’s language, type and name, in order to show them to you. It doesn’t read their links or tokens, request them, or switch the track you chose. This list stays in the memory of the open page and isn’t stored.
- On first run, as long as the interface language isn’t set, it reads YouTube’s interface language from the same page (the `lang` attribute), or otherwise the browser’s interface language, to choose its own interface language. That code isn’t sent to anyone. What appears afterward is the resulting interface language: in a report if you copy one, and in the text of the instructions you copy.
- Tarjuman doesn’t change what YouTube collects about you while you watch. That is governed by Google’s policy.

### Video thumbnails in “Library” — `#thumbnails`

- **When:** When you open the “Library” page while the “Video thumbnails in Library” switch is on. The switch is off by default since 2.2.0, so a Tarjuman tile appears instead of the thumbnail and nothing is requested until you turn it on.
  - In Chrome, Edge and Brave: If you upgraded to 2.2.0, your thumbnails stay as they were before the upgrade (shown unless you had turned them off). Through 2.1.2, the switch is on by default there.
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
- **Through 2.1.2, with a reports server:** These versions have a “Send report” button that sends the same report. All of this, including the permission, goes away when you update to 2.2.0.
  - **Permission:** On the first send, the browser asks your permission to connect to the reports server only (`app-reports.isultantf.workers.dev`), and in Firefox this comes with the “Technical and interaction data” consent. If you decline, nothing is sent.
  - **Destination:** A Cloudflare worker receives it and opens it as an issue in a private GitHub repository that Tarjuman’s developer can view. It isn’t published. You see its number as your reference.
  - **What the browser adds to the request:** Its type, version and operating system, its preferred languages, and the `Origin` header with the extension’s address (in Firefox, a random ID for your installation). No cookies and no page address. The server limits the number of reports using a temporary salted fingerprint of your IP address, and your address doesn’t reach the report.
  - **Retention:** A sent report isn’t deleted automatically. To have it deleted, email the support address with its number.

### What doesn’t use the network — `#offline`

- The tools on the YouTube page, the background worker, the extension icon’s popup, and the Editor: all of them work without a connection.
- The fonts are bundled with the extension, so they aren’t requested from the network.

## What you send to an AI model — `#ai`

- Tarjuman doesn’t translate and doesn’t connect to any model. You copy the file and the instructions, and send them yourself to the model you choose.
- What reaches it from you:
  - The text and timing of the original subtitles, in the file.
  - The instructions in Tarjuman’s interface language (Arabic or English), including the video’s title and link, and the two languages you chose as “From” and “To”.
  - Your glossary terms, if you included the glossary.
- What the model does with that is governed by its terms of service, not by this policy. So don’t send anything you don’t want to share.

## Permissions — `#permissions`

- **Storage** (along with unlimited storage size): To keep your Library and settings on your device.
- **Downloads:** To save Tarjuman’s files where you choose.
- **Pages on `www.youtube.com`:** So Tarjuman’s tools can work over the player. No other sites, and no tabs.
- **In Firefox, one optional consent:** “Browsing activity” for Library thumbnails, requested only when you turn on the thumbnails switch. You can withdraw it from Firefox’s add-ons page.
- **Through 2.1.2, one optional permission:** Connecting to the reports server only, requested on the first report you send (in Firefox, with the “Technical and interaction data” consent). It goes away when you update to 2.2.0.
- No permission for browsing history, cookies, or tabs.

## Third parties — `#third-parties`

| Party | When something reaches it | What governs it |
| --- | --- | --- |
| YouTube (Google) | “Library” thumbnails, and the YouTube page itself while you watch | [Google Privacy Policy](https://policies.google.com/privacy) |
| Google (Gmail, the support email) | When you email support, including a report you send from your own email | [Google Privacy Policy](https://policies.google.com/privacy) |
| Cloudflare | Through 2.1.2, when you send a report, since the request passes through its worker | [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/) |
| GitHub | Through 2.1.2, when you send a report, since it’s stored as an issue in a private repository | [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) |
| The AI model you choose | When you send it the file yourself | Its terms of service |
| The browser’s store | Installation and updates | The store’s policy |

## No selling, no advertising — `#limited-use`

- Tarjuman doesn’t sell your data, and doesn’t transfer it for advertising, credit assessment or any other purpose.
- What arrives in report emails, and in reports sent through 2.1.2, is used only to understand and fix the problem and to improve Tarjuman.

## Retention and deletion — `#retention`

- **What’s on your device** stays until you delete it:
  - For one video, from “Library”: “Delete active translation…” or “Delete video data…”.
  - Or all of it, from Settings › “Clear all data”.
- **Removing the extension** deletes all of its storage. This was measured in Chrome, Edge, Brave and Firefox. So make a backup first if you want to keep your Library.
- **Files you downloaded** stay in their folder until you delete them yourself.
- **A report email** stays in the support inbox until it’s deleted. To have it deleted, email the support address (see [“A problem report”](#report)).
- **A report sent through 2.1.2** isn’t deleted automatically. To have it deleted, email the support address with its number.

## Changes — `#changes`

- When what the extension stores or sends changes, this page changes with it, its effective date changes, and the change is noted in the changelog.

## Contact — `#contact`

- **Support email:** iSultanBy@gmail.com
- **Support page:** [Help](/tarjuman/en/support)
- **Publisher:** BySultan — [bysltan.com](https://bysltan.com)
