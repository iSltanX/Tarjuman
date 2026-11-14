# صفحة ترجمان بالإنجليزية — `bysltan.com/tarjuman/en`

> النسخة الإنجليزية من `tarjuman.md`، بعلامات بنيته العربية. هذان السطران لا يُنشران.

## البيانات الوصفية

- **العنوان (`<title>`):** Tarjuman — Your translation over the video
- **الوصف:** Saves a video’s subtitles as an SRT file so you can translate it yourself with any AI model, from any language to yours, then shows your translation over the video, where you can adjust its timing and edit it.
- **اللغة والاتجاه:** `lang="en" dir="ltr"`.

## الرأس

- الشعار «التاء» مع الاسم (`src/ui/logo.js`)، يقود إلى `/tarjuman/en`.
- روابط: How it works (`#how`) · Features (`#features`) · Privacy (`/tarjuman/en/privacy`) · Help (`/tarjuman/en/support`).
- **زر الرأس:** «Install» إلى `#install`.

## البطل

**الوسم:** A desktop browser extension · Works on YouTube

**العنوان (`h1`):** Your translation over the video, from any language to yours

**السطر التالي:** Tarjuman saves YouTube’s subtitles to a file in their own language. You translate that file with the model you choose, into the language you want. Tarjuman then shows your translation over the same video, where you can adjust its timing and edit it.

**الأزرار الرئيسية:** «Add Tarjuman to Chrome» إلى `https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj` · «Add Tarjuman to Edge» إلى `https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi` · «Add Tarjuman to Firefox» إلى `https://addons.mozilla.org/en-US/firefox/addon/tarjuman/`

**الرابط الثانوي:** «How it works» إلى `#how`.

**الحقائق:** Chrome, Brave, Edge and Firefox · Your translations stay on your device · No account or API key · You choose the model

**اللقطة:** ⟨لقطة: المشغّل ولوحة النص المتزامن⟩

**تعليق اللقطة:** The player with your translation over the original, and the synced transcript panel beside it. The scene was drawn for Tarjuman; its source is in [Credits](/tarjuman/en/credits#images).

## بالأرقام

- **0** Tarjuman servers: your translations and settings stay in the extension’s storage in your browser.
- **3** permissions on install: storage, downloads, and pages on `www.youtube.com`.
- **3** translations per video, plus a previous version of what you replaced.
- **0.5** seconds per press of − and + by default; change it in the timing menu.

## كيف يعمل — `#how`

**الوسم:** How it works

**العنوان:** Four steps, with the translation in your hands

**المقدمة:** Tarjuman doesn’t translate anything itself and doesn’t connect to any model. It prepares the file and the instructions for you, and shows what you bring back.

**الحاشية:** No account or API key needed; the model and both languages are your choice.

**بعد الخطوات في ترجمان:** It compares what you bring back with the original, and saves it in your Library.

**ما يخرج من جهازك:** Nothing leaves your device unless you move it: the file and the instructions to the model you choose, and a problem report from your own email. From the extension itself, only Library video thumbnails leave, and they stay off until you turn on their switch.

1. **Extract:** Open a YouTube video and choose the subtitle language from the CC button in the player. Then download its file with Tarjuman’s button on the player bar.
2. **Copy the instructions:** Open the Tarjuman popup from the browser toolbar. “From” is filled in with the file’s language as YouTube sent it. Choose “To”, then press “Copy instructions”. Since version 2.1.1, they’re copied in the extension’s interface language.
3. **Translate:** Send the file and the instructions to the AI model you choose. Tarjuman doesn’t connect to any model, so the choice is yours.
4. **Watch:** Upload the translated file and your translation appears over the video. It’s saved for whenever you come back.

**اللقطة:** ⟨لقطة: نافذة الإضافة وتعليمات الترجمة⟩

## المميزات — `#features`

**الوسم:** Features

**العنوان:** What Tarjuman does with your translation

**الحاشية:** From Tarjuman’s own interface; the scenes in them were drawn for it.

### From any language to yours

Tarjuman accepts every subtitle track YouTube offers for the video, manual or auto-generated, YouTube’s auto-translation labeled with its source language, and any SRT file in any language. YouTube alone decides which languages each video has: Tarjuman doesn’t create a track YouTube doesn’t offer, and doesn’t switch tracks for you, so you pick one yourself from YouTube’s menu.

⟨لقطة: قائمة تحميل الأصل⟩

### Over the video itself

Your translation appears on its own or over the original, each line in the text direction of its language; a line with none of that language’s letters reads left to right, so its punctuation isn’t flipped. It works in default view, theater mode and fullscreen, and hides during ads.

⟨لقطة: الترجمة فوق الفيديو⟩

### Timing from the player bar

The − and + buttons on the player bar, or inside the timing menu when the bar is narrow, move the translation earlier or later, and “Sync by sentence…” sets it from a sentence you hear. Timing is saved with each translation.

⟨لقطة: قائمة التوقيت⟩

### An editor for review

Edit text and timing, merge and split segments, search and replace, and mark what you want to come back to. It also prepares a file with the missing segments so you can complete them with your model.

⟨لقطة: المحرّر⟩

#### Comparison with the original

When you upload your file, Tarjuman compares it with the original you downloaded: what’s missing, what’s extra, where the timing has drifted, and what’s left untranslated. It never changes anything in your file silently.

### Your Library, all in one place

Every video you’ve translated, with up to three translations per video, the two languages of each translation, and a previous version of what you replaced. Plus export, and a backup you can move to another browser.

⟨لقطة: المحفوظات⟩

### Synced transcript

A panel beside the video shows the whole translation with the current segment highlighted, so you can read what came before and what’s coming, and fix a segment’s text right where it is. It stays closed until you open it from its button.

⟨لقطة: لوحة النص المتزامن⟩

### Style it your way

Display mode, font, size, background and position, all from Settings. The fonts are bundled with the extension, and any characters they don’t include are drawn with your device’s fonts. The extension’s interface is in Arabic or English, which you choose in the same Settings.

⟨لقطة: إعدادات العرض⟩

## أين تذهب بياناتك — `#privacy`

**الوسم:** Your data

**العنوان:** Where your data goes, and what Tarjuman doesn’t do

- **On your device:** Your translations and settings are in the extension’s storage in your browser. No server keeps them, and nothing is synced.
- **To YouTube:** Video thumbnails in “Library” are requested from YouTube’s servers using the video ID. They stay off until you turn on their switch, and in Firefox they’re requested only with your consent.
- **To the model you choose:** What you send it yourself: the file and the instructions. The extension doesn’t connect to it.
- **No Tarjuman server:** You write a problem report, see everything in it, then copy it and send it from your own email. No translation text or video ID is attached automatically.
- **Nothing else:** No usage tracking, no ads, and no selling of your data.
- **الرابط:** [Full privacy policy](/tarjuman/en/privacy).

## ما لا يفعله — `#limits`

- It doesn’t download video or audio, and doesn’t request subtitle files on its own: it reads a copy of the subtitles the player requested when you turned them on.
- It doesn’t create subtitles in a language YouTube doesn’t offer for the video, and doesn’t switch tracks for you.
- It doesn’t translate anything itself, and needs no account or API key.
- It doesn’t work on Shorts or on players embedded in other sites. On live streams in progress, only subtitle extraction is blocked; uploading and showing an SRT file still work.
- It’s for desktop computers only, not phones.

## المتصفحات — `#browsers`

**الوسم:** Browsers

**العنوان:** For desktop, in four browsers

**المقدمة:** Tarjuman is published on Chrome Web Store, which Brave also installs from, on Microsoft Edge Add-ons, and on Firefox Add-ons.

| Browser | Where to get it | Status |
| --- | --- | --- |
| Chrome | From [Chrome Web Store](https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj), version 130 or later | Available |
| Brave | From [Chrome Web Store](https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj), on Chromium 130 or later | Available |
| Edge | From [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi), version 130 or later | Available |
| Firefox | From [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tarjuman/), version 144 or later | Available |

## التثبيت — `#install`

**الوسم:** Install

**العنوان:** From the store to your first video

1. **Install Tarjuman from your browser’s store:** In Chrome and Brave, from [its Chrome Web Store page](https://chromewebstore.google.com/detail/oapjhdkejcohlhhanacplhneohancfpj). In Edge, from [its Microsoft Edge Add-ons page](https://microsoftedge.microsoft.com/addons/detail/iickeiclgbpdlkalhlofdpphhkohpkgi). In Firefox, from [its Firefox Add-ons page](https://addons.mozilla.org/en-US/firefox/addon/tarjuman/).
2. **Pin its icon to the browser toolbar:** Click the extensions icon (the puzzle piece), then the pin next to “Tarjuman”. That’s where you’ll copy the translation instructions.
3. **Open a YouTube video:** Then start with [First use](/tarjuman/en/support#first-use) on the Help page.

**Permissions on install:** Storage, downloads, and access to `www.youtube.com` pages only. There’s no other, optional permission. In Firefox there’s one optional consent, for Library thumbnails, requested when you turn them on. Details are under [Permissions](/tarjuman/en/privacy#permissions).

## الإصدار

**ما يرافق الإصدار:** with the new identity.

## التذييل

- Tarjuman — by BySultan ([bysltan.com](https://bysltan.com)). A desktop browser extension that works on YouTube: it saves a video’s subtitles to a file and shows your translation over the video, from any language to yours.
- How it works (`/tarjuman/en#how`) · Features (`/tarjuman/en#features`) · Browsers (`/tarjuman/en#browsers`) · Privacy policy (`/tarjuman/en/privacy`) · Help (`/tarjuman/en/support`) · Report a problem (`/tarjuman/en/support#report`) · Credits (`/tarjuman/en/credits`) · Support email: iSultanBy@gmail.com
- Tarjuman isn’t affiliated with YouTube or Google.
- © 2026 Sultan (BySultan). All rights reserved.
- YouTube is a trademark of Google LLC.
