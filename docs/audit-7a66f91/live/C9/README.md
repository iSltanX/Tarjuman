# أدلة C9 — التكامل وإعادة التغليف والدخان الحي

المرحلة الأخيرة من خطة إصلاح تدقيق `7a66f91` ([`03-plan.md`](../../03-plan.md) §C9)، على `tj/audit-7a66f91-fixes` بعد C1–C8. كل اختبار حي هنا بلا نافذة، بملف تعريف اختبار مؤقت خارج المستودع، وصوت مكتوم، ويوتيوب بلا حساب، ولا بلاغ حقيقي (قرار سلطان Q05). والملفات هنا عدّادات وفحوص ولقطات، بلا نصوص مقاطع ولا روابط.

## ١. البوابة

| الفحص | النتيجة |
| --- | --- |
| `command npm run check:wave` | أخضر: الوحدة 1748/1748، والتكامل 42/42، و`web-ext lint` بلا خطأ ولا تحذير ولا ملاحظة، و`plan:check` سليم، و`check-static` و`check-secrets` و`notices --check` و`privacy.mjs --check` و`store-assets --check` |
| `command node scripts/run-tests.mjs test/e2e/regression test/e2e/static` | 31/31 |
| `command npm run package` مرتين من شجرة نظيفة | التدقيق 15/15 للهدفين، وإعادة البناء من حزمة المصدر تطابق الهدفين بايتًا، و`SHA256SUMS` متطابق في الجولتين |

## ٢. الحزم وبصماتها

البيئة: Node 24.18.1 من Homebrew، مربوط بـzlib النظام 1.2.12، على darwin-arm64. وبصمة الأرشيف تتبع zlib، وبصمات الملفات داخله لا تتبعها (`store/README.md` §٤، قرار Q33). والحزم مبنية من `0a54b43`، وما بعده في C9 وثائق وأدلة ولقطات متجر لا تدخل أي حزمة (`SOURCE_PATHS` في `scripts/release/store.mjs`).

| الحزمة | البايتات | الملفات | SHA-256 |
| --- | ---: | ---: | --- |
| `tarjuman-1.1.0-chrome.zip` (Chrome Web Store) | 1077145 | 41 | `1bf96f453d5c948fe410c68e9884fe9c0eb23a910ea7e1c12d697b749a55eb71` |
| `tarjuman-1.1.0-edge.zip` (Edge Add-ons، البايتات نفسها) | 1077145 | 41 | `1bf96f453d5c948fe410c68e9884fe9c0eb23a910ea7e1c12d697b749a55eb71` |
| `tarjuman-1.1.0-firefox.zip` (AMO) | 1077269 | 41 | `650f867bee46c45fcc9b1d69195007050ebc2df64f226565722446241641ed73` |
| `tarjuman-1.1.0-source.zip` (لمراجعي AMO) | 1183040 | 260 | `57c1c25ef1101164f564477e549bfd545933e5f19d3324bc97ad4b2c1b0596d5` |

وهي البصمات نفسها التي خرجت في C8، فلم يتغير شيء في الحزم بعدها.

## ٣. الدخان الحي

الإصدارات: Brave 156.1.98.63 (Chromium 156.0.8078.80)، وChrome 156.0.8078.80، وEdge 156.0.4314.58، وFirefox 159.0.1.

| الاختبار | Brave | Chrome | Edge | Firefox | الأدلة |
| --- | --- | --- | --- | --- | --- |
| حزم المتجر نفسها (`test/live/stores/t8-packages.mjs`) | 15/15 | 15/15 | 15/15 | 16/16 | `packages/<browser>/result.json` |
| الدورة الكاملة ببناء التطوير (`test/live/stores/t3.mjs`) | 20/20 | 20/20 | 20/20 | 22/22 | `t3/<browser>/t3.json` |
| المراجعة المستقلة (`test/live/review/run.mjs`) | 18/18 | 18/18 | 18/18 | — (CDP وحده) | `review/<browser>/result.json` |
| الرجوع إلى `tj-v1` (`test/live/compat/rollback.mjs`) | 14/14 | 14/14 | — | — | `rollback/<browser>/` |
| الهوية الثالثة (`test/live/identity/run.mjs`) | 79/79 | 79/79 | — | — | `identity/<browser>/live.json` |
| ما تأجّل من C1: المحفوظات والإعدادات (`test/live/audit-c1/run.mjs --scenarios pages`) | 3/3 | — (C1) | 3/3 | — | `c1/c1-<browser>.json` |
| ما تأجّل من C3: المحرّر (`test/live/audit-c3/run.mjs`) | — (C3) | — (C3) | 65/65 | — (C3) | `c3/c3-edge.json` |

- **صفر أخطاء ملتقطة من الإضافة** في كل ما سبق.
- **اللقطات:** لم تُحفظ هنا لقطات السكربتات (18 م.ب)، على نمط أدلة C1–C8: ملفات النتائج تسمّيها، وتُعاد بالأوامر في §٦. والمحفوظ لوحة اعتماد لقطة المتجر وحدها (§٤).
- **غير المقيس في `t3`:** `report-error-row` في Chromium الثلاثة، كما في خط أساس T3 وT8 وC8: حوار الإذن الاختياري ينتظر يدًا بلا نافذة. وفي Firefox يُقاس وينجح.
- **الرجوع:** الفحوص الأربعة عشر نفسها التي شُغّلت في P10 وC2. والرقم 18 في جدول T3 كان لنسخة أقدم من السكربت.
- **الهوية، الجولة الأولى:** Brave وChrome كلٌّ 58/73، وسقوطها كله يتتابع من `youtube-player-ready`: لم يجهز مشغّل يوتيوب في 30 ثانية، فقيست اللوحة قبل تحميل الترجمة. ولا تحدّي روبوت، وشريط ترجمان مركّب وفحوصه ناجحة، واللقطات تُظهر اللوحة بـ427 مقطعًا. وهو النمط نفسه في جولة C3 الأولى. والإعادة بلا أي تغيير 79/79 في الاثنين، والملفات هنا من الإعادة.
- **بعد انقطاع الجلسة:** انقطعت جلسة العمل أثناء `t3` في Chrome، فاستؤنفت الجولة من أول ما لم يكتمل (`t3` في Chrome وEdge وFirefox، ثم الرجوع والهوية). وما اكتمل قبل الانقطاع لم يُعد.

## ٤. لقطة المتجر `04-editor.png`

بقرار سلطان في C9 («أعد التقاطها»، 2026-11-05): التُقطت في T6 قبل إصلاحات المحرّر في C3.

- `test/live/stores/t6-shots.mjs` كاملًا من `release/store/tarjuman-1.1.0-chrome.zip` في Chrome 156 بلا نافذة: 18/18 بلا خطأ من الإضافة (`t6-shots/chrome.json`). ثم أُبقي من الخام `04-editor-{wide,tall}.png` وحده، وأُعيد الباقي من نسخته السابقة، ثم `t6-art.mjs --only frames`.
- تغيّرت `store/screenshots/chromium/04-editor.png` (1280×800، 4373 بكسلًا مختلفًا) و`store/screenshots/firefox/04-editor.png` (1280×960، 7111) وحدهما، والإطارات الأخرى خرجت مطابقة بايتًا. و`store-assets.mjs --check` سليم.
- الفرق كله داخل المحرّر: حدود حقول النص بعد C3، وتاريخ المرجع الإنجليزي في اللوحة الجانبية صار تاريخ جلسة الالتقاط الجديدة. والتخطيط والمقطع 12 والنصوص كما كانت.
- لوحة «قبل وبعد» للاعتماد: [`c9-editor-shot-before-after.jpg`](c9-editor-shot-before-after.jpg).

## ٥. لم يُختبر في C9

- Chromium ‏130–155 وFirefox ‏144–158: المختبر حيًا الإصدارات الحالية وحدها.
- `review/run.mjs` في Firefox: السكربت بـCDP وحده.
- صف خطأ الإبلاغ في Chromium (`report-error-row`)، ونافذة تثبيت AMO الحقيقية، وحوار «نشاط التصفح» الحقيقي، وقارئ الشاشة، والوضع القسري، وقائمة تكبير المتصفح، ومسارات Windows: كما في المراحل السابقة.
- الاستخراج الحقيقي تحت الأتمتة: يوتيوب يعيد جسم الترجمة فارغًا، فـ`t3` يرسل جسم P1 الحقيقي برسالة الالتقاط نفسها.
- النشر نفسه: لا رفع إلى أي متجر، ولا دمج لطلب الموقع.

## ٦. الإعادة

```bash
command npm run package
```

```bash
command node test/live/stores/t8-packages.mjs --browser brave --out docs/audit-7a66f91/live/C9/packages/brave
```

```bash
command node test/live/stores/t3.mjs --browser firefox --out docs/audit-7a66f91/live/C9/t3/firefox
```

```bash
command node test/live/compat/rollback.mjs --browser chrome --out docs/audit-7a66f91/live/C9/rollback/chrome
```

```bash
command npm run build:dev -- --out <مجلد خارج المستودع>
```

```bash
command node test/live/identity/run.mjs --browser brave --ext <مجلد البناء> --out docs/audit-7a66f91/live/C9/identity
```

والبقية بالصيغة نفسها، وأوامر كل سكربت في رأسه.
