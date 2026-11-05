# صور واجهة المستودع

يولّد `render.mjs` صور [`README.md`](../../README.md) وصورة المعاينة الاجتماعية في [`.github/assets/`](../../.github/assets/)، من قوالب HTML في هذا المجلد.

## المصادر

كل ما في الصور مأخوذ من الإضافة نفسها، فلا ينجرف عنها:

- **الألوان:** [`src/ui/tokens.css`](../../src/ui/tokens.css)، بالوضعين.
- **الخطوط:** [`src/ui/fonts.css`](../../src/ui/fonts.css)، وهي Cairo للعناوين وAlmarai للنص.
- **الشعار:** [`src/ui/logo.js`](../../src/ui/logo.js).
- **الأيقونات:** [`src/ui/icons.js`](../../src/ui/icons.js)، من Lucide برخصة ISC.
- **اللقطات:** [`store/screenshots/chromium/`](../../store/screenshots/chromium/)، وهي لقطات حقيقية من الإصدار 1.1.0.

## القوالب

| القالب | الناتج | المقاس |
| --- | --- | --- |
| `banner.html` | `banner-light.png` و`banner-dark.png` | 1280×400 بمعامل 2 |
| `how-it-works.html` | `how-it-works-light.png` و`how-it-works-dark.png` | 1280×340 بمعامل 2 |
| `social.html` | `social-preview.png` | 1280×640، مقاس «Social preview» في إعدادات GitHub |

## التوليد

```bash
command node tools/readme-assets/render.mjs
command node tools/readme-assets/render.mjs banner
```

- الأمر الأول يرسم الصور كلها، والثاني قالبًا واحدًا بالاسم.
- يحتاج Google Chrome، أو مساره في `TJ_CHROME`.
- يرسم بلا نافذة بملف تعريف مؤقت يُحذف بعده، ولا يطلب شيئًا من الشبكة.

**متى يُعاد التوليد:** إذا تغيّرت الهوية أو لقطات المتجر أو رقم الإصدار في الصور، ثم تُراجع الصور بالعين بالوضعين قبل الالتزام.

ولا يدخل شيء من هذا المجلد ولا من `.github/` في حزم الإضافة.
