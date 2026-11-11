# المساعدة بالإنجليزية — `bysltan.com/tarjuman/en/support`

> النسخة الإنجليزية من `help.md`، بعلامات بنيته العربية. هذان السطران لا يُنشران.

## الرأس

- **مسار الصفحة:** Tarjuman · Help
- **العنوان (`h1`):** Help — Tarjuman
- **المقدمة:** How to install Tarjuman and get started from any language to yours, adjust your translation’s timing and edit it, move your Library, and report a problem.
- **فهرس «في هذه الصفحة»:** Install · First use · Translating with a model you choose · Timing · Editor · Library · Moving your Library · Reporting a problem · Troubleshooting · Contact

## Install — `#install`

Tarjuman is for desktop computers and works on YouTube watch pages.

| Browser | Where to get it |
| --- | --- |
| Chrome (130 or later) | [Chrome Web Store](https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj) |
| Brave (on Chromium 130 or later) | [Chrome Web Store](https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj) |
| Edge (130 or later) | [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi) |
| Firefox (144 or later) | Firefox Add-ons — coming soon |

After installing, pin Tarjuman’s icon to the browser toolbar: click the extensions icon (the puzzle piece), then the pin next to “Tarjuman”. You’ll copy the translation instructions from its popup.

On install, Tarjuman asks for three permissions: storage, downloads, and access to `www.youtube.com` pages only. Since 2.2.0, there’s no other, optional permission (through 2.1.2, an optional permission to connect to the reports server, requested on the first report you send). In Firefox there’s one optional consent, for Library thumbnails, requested when you turn them on. Each is explained in [Privacy](/tarjuman/en/privacy#permissions).

## First use — `#first-use`

1. Open a YouTube video, turn on subtitles (CC), and from ⚙ › Subtitles/CC choose the language you want to translate from. Tarjuman doesn’t send a request or switch tracks: it captures what the player loads for you as soon as you choose.
2. From Tarjuman’s buttons on the player bar, open “Download original (SRT)”. It lists every captured track with its language, type and number of segments. Then press “Download file”.
3. Open the Tarjuman popup from the browser toolbar. “From” is filled in with the file’s language as YouTube sent it. Choose “To”, then press “Copy instructions”.
4. Send the file and the instructions to the AI model you choose, and save its output as an SRT file.
5. Upload it with the “Upload translation (SRT)” button on the player bar, and the translation appears over the video. Its language comes from a code in the file name (such as `talk.ja.srt`) or from “To”, and you can change it before saving.
6. When you come back to the video, you’ll find your translation and its timing as you left them.

If the menu says “Turn on YouTube subtitles (CC) and choose the language you want, then open this menu.”, the player hasn’t loaded any subtitles yet. Turn on CC or choose the language, then open the menu again.

### Interface language — `#language`

- Tarjuman’s interface is in Arabic or English. Change it under Settings › “Display” › “Interface language”, and every open Tarjuman interface switches.
- On first run, Tarjuman picks YouTube’s interface language if it can read it, otherwise the browser’s language. Any other language starts in English.
- It doesn’t affect video or translation languages, or your files and Library. The translation instructions you copy follow the interface language.

## Translating with a model you choose — `#translate`

- Tarjuman doesn’t translate anything itself and doesn’t connect to any model. You choose the model and send it the file yourself.
- **Languages:** Tarjuman accepts every track YouTube offers for the video, manual or auto-generated, and any SRT file in any language. YouTube alone decides which languages each video has, and Tarjuman doesn’t create or switch tracks.
- **YouTube’s auto-translation** (⚙ › Subtitles/CC › Auto-translate › the language): Accepted, labeled “auto-translated by YouTube from ‹source language›”. It doesn’t take priority over the video’s original subtitles, and if it’s the only one captured, it’s selected with that label. It’s a machine translation rather than what’s said in the video, so its errors come on top of any transcription errors.
- **The instructions** are copied from the extension popup with a “From” and “To” pair, for any two different languages. Their text is in the interface language at the time of copying, Arabic or English. They include the video’s title and link, and ask for a complete SRT file with the same numbers and timing, named with the requested language’s code. Your glossary terms are added if you’ve turned that on. Copying works only on a YouTube video page, because the instructions carry its title and link.
- **Segment style:** “Standard” keeps short segments close to YouTube’s splitting, for the tightest sync with speech. “Longer segments” merges neighboring segments into longer sentences so the model gets more context, which changes the segment count, numbering and timing boundaries.
- **Very long files:** Under “Splitting long files” in the download menu, split the file into parts and send each part separately. The instructions you copy afterward include a paragraph about the parts.
- If the model returns text in the chat, copy it and paste it into “Paste the translation here” in the extension’s popup (or “Paste a translation…” in Library), or save it as a file and upload it: Tarjuman accepts SRT, or timestamped plain text or Markdown.
- On upload, Tarjuman compares the file with the original: “Matches the original”, or a summary of what’s missing, extra, drifted or left untranslated. It never changes anything in your file silently.

## Timing — `#timing`

- If the translation runs ahead of the speech or behind it, adjust it with the − and + buttons on the player bar. Each press moves it by a fixed step, 0.5 seconds by default, which you can change in Settings.
- Tarjuman saves the offset with each translation, so it’s there when you come back.
- The timing menu also has “Sync by sentence…”: choose a sentence you hear and Tarjuman sets the timing from it, with “Undo” alongside.

## Editor — `#editor`

- Open it from “Edit translation” in the icon’s popup, or from “Library”.
- Edit each segment’s text and timing, merge and split segments, search and replace, and mark what you want to review.
- It shows what’s missing from the file compared with the original, and prepares a file with the missing segments for you to send to the model and then merge what it returns.
- Saving is explicit, and edits can be undone. The file as you uploaded it stays saved.

## Library — `#library`

- From Tarjuman’s icon › “Library”: every video you’ve saved a translation for, with its thumbnail, title and duration, and the language pair of each translation.
- Each video holds up to three translations, one of which you make active. When you replace a translation, the previous one is saved so you can restore it.
- From there you can export the translation, copy the instructions with the video’s language pair, or delete a translation or all of the video’s data.
- Translations saved before 2.0.0 without a language show “Unknown language”. Set it from “Translation language” in the “Translation” menu, or for all of them under Settings › “Languages”.
- Video thumbnails stay off until you turn them on under Settings › “Display” › “Video thumbnails in Library”, so a Tarjuman tile appears instead and nothing is requested. Once on, they’re requested from YouTube’s servers. If you upgraded in Chrome, Edge or Brave, your thumbnails stay as they were. Through 2.1.2, they’re on by default in these browsers.
- In Firefox, thumbnails stay off until you turn on that same switch, and Firefox then asks for your “Browsing activity” consent. You can withdraw it from Firefox’s add-ons page.

## Moving your Library — `#move`

- Tarjuman’s Library lives in the browser where you installed it, and isn’t synced.
- **A backup** moves it to another browser, or to a new copy of Tarjuman:
  1. In the copy that has your Library: Settings › “Backup” › “Create a backup”. A JSON file is saved.
  2. At the destination: Settings › “Backup” › “Restore from a file…”, choose the file, and review the preview.
- **If you tried Tarjuman from a folder before it was published**, the store version is a separate extension that starts with an empty Library. Move your Library over with a backup, then remove the old copy once you’ve confirmed it arrived. Removing it before that deletes its Library.
- **Before removing Tarjuman**, make a backup if you want to keep your Library, because removal deletes it.

## Reporting a problem — `#report`

- **Where:** Settings › “About” › “Report a problem”.
- **How:** Choose the type (bug, suggestion or other), write what happened, review the whole report, then press “Copy report” to copy it as text. Paste it into an email from your own address to the support email under [“Contact”](#contact), which is shown in the form with a “Copy email” button.
- **Not sent by the extension:** Since 2.2.0, Tarjuman has no server and asks for no permission, and no email app or link opens from the extension.
- **What it contains:**
  - Your description as you wrote it, up to 2000 characters.
  - The Tarjuman version, the browser and its version, the build package, the operating system, and the interface language.
  - You see all of this before copying.
- **Not attached automatically:** Translation text, a video’s ID, title or link, or anything from your Library. Your description is copied as you wrote it.
- **The reply:** It reaches your email if you write to us from it.
- **Through 2.1.2:** A “Send report” button sends it, after you allow it, to the reports server, and shows you its number as a reference. This goes away when you update to 2.2.0.
- Details are in [Privacy](/tarjuman/en/privacy#report).

## Troubleshooting — `#troubleshooting`

| What you see | What to do |
| --- | --- |
| “Turn on YouTube subtitles (CC) and choose the language you want…” | Turn on CC, choose the language from ⚙ › Subtitles/CC, then open the menu again. If the message stays, turn CC off and on again. |
| The language you want isn’t in YouTube’s menu | YouTube doesn’t offer it for this video. Choose another track and translate it with your model, or use YouTube’s auto-translation, which is labeled as such. |
| “Copy instructions” is disabled in the popup | The reason appears below it: choose two different languages for “From” and “To”, or open a YouTube video. |
| An old translation shows “Unknown language” or “Language not set” | It was saved before 2.0.0 without a language. Set it from “Translation language” in the “Translation” menu, or for all of them under Settings › “Languages”. |
| “Couldn’t extract the subtitles (empty response)…” | Turn CC off and on again. If it happens again, reload the page. |
| “This is a live stream in progress…” | Wait for the stream to end, then open the recorded video. |
| Tarjuman’s buttons don’t appear on the bar | Move the pointer over the player so the bar appears. If they still don’t appear, reload the page and make sure the extension is enabled. |
| “Couldn’t copy to the clipboard…” | Click inside the popup to focus it, then press “Copy instructions” again. |
| Library is empty after a new install | The new copy is a separate extension with new storage. Move your Library over with a backup ([“Moving your Library”](#move)). |

**Where Tarjuman doesn’t work:** Shorts, players embedded in other sites, YouTube Music, phones, and picture-in-picture windows. On live streams in progress, only subtitle extraction is blocked; uploading and showing an SRT file still work.

## Contact — `#contact`

- **Support email:** iSultanBy@gmail.com
- **Privacy:** [Privacy policy](/tarjuman/en/privacy)
- **Publisher:** BySultan — [bysltan.com](https://bysltan.com)
