# ملاحظات التشخيص الحي — P1

> مخرجات منسوخة كما طبعتها أدوات التشخيص (`test/live/p1/diag.mjs` و`nav-race.mjs`) في 2026-11-01، بلا روابط ولا رموز: كل طلب `timedtext` مختصر إلى `الزمن:النوع:الصيغة:الحالة:حجم الجسم`. الحساب غير مسجَّل.

## ١. الجسم الفارغ تحت الأتمتة (CDP بالأنبوب)

| التجربة | المتصفح | النتيجة المختصرة |
| --- | --- | --- |
| الإضافة محمّلة، CC بالمفتاح `c` | Brave | `afterC: 11.1s:manual:json3:200:0B` ثم `afterToggle: … 20.6s:manual:json3:200:0B` · المعروض على الشاشة: فارغ · رسائل MAIN: طولان `0` · لقطة الإضافة: `EX_EMPTY_BODY:طول الجسم 0` ×2 |
| **دون الإضافة** (ملف الاختبار نفسه) | Brave | `2.2s:manual:json3:200:0B`، `9.3s:…:200:0B`، `24.3s:…:200:0B` · المعروض: فارغ |
| **ملف نظيف دون الإضافة** | Brave | ظهر إعلان قبل التشغيل (قوائم Shields لم تُحمَّل بعد في الملف الجديد) · `2.3s:manual:json3:200` |
| الإضافة محمّلة **دون تفعيل `Runtime` و`Network`** | Brave | رسائل MAIN: `{"len":0,"transport":"xhr","kind":"manual"}` ×2 · المعروض: فارغ ← سقطت فرضية «كشف `Runtime.enable`» |
| `navigator.webdriver` في الصفحة | Brave | `true` (أثر `--remote-debugging-pipe`؛ لم يُخفَ) |
| الإضافة محمّلة | Chrome 156 | `4.9s:asr:json3:200:0B` (ترجمة **الإعلان**)، `17.1s:asr:json3:200:0B` (الإعلان)، `17.4s:manual:json3:200:0B` · لقطة الإضافة: `EX_WRONG_VIDEO` ×2 (الإعلان)، `EX_EMPTY_BODY` (الفيديو) |

**المقابل غير المؤتمت** (`navigator.webdriver=false`، متصفح عادي بملف اختبار): الطلب نفسه أعاد 59,007 محرفًا وعرضت يوتيوب الترجمة على الشاشة (القسم أ في [`live-results.md`](live-results.md)).

**الخلاصة:** السبب المرجّح أن يوتيوب تحجب محتوى الترجمة عن متصفح يعلن الأتمتة. **فرضية غير مثبتة**: لم يُعزل المتغير بإخفاء العلامة، ولن يُجرَّب ذلك لأنه تحايل على حماية يوتيوب.

## ٢. سباق التنقل الداخلي (Brave headless، الأجسام فارغة)

قبل الإصلاح (الأزمنة من بداية الجلسة):

```text
17.68s reject v=kFMZrEABdw4 current=iG9CE55wbtY EX_WRONG_VIDEO manual
18.01s nav iG9CE55wbtY → kFMZrEABdw4
18.61s reject v=kFMZrEABdw4 current=kFMZrEABdw4 EX_EMPTY_BODY manual
20.63s reject v=XSu38uFEVuI current=kFMZrEABdw4 EX_WRONG_VIDEO asr
21.26s reject v=XSu38uFEVuI current=kFMZrEABdw4 EX_WRONG_VIDEO asr
28.40s nav kFMZrEABdw4 → XSu38uFEVuI
28.40s reject v=XSu38uFEVuI current=XSu38uFEVuI EX_EMPTY_BODY asr
```

طلب ترجمة الفيديو الجديد وصل قبل تغيّر العنوان بنحو 330ms. وطلبات `XSu38uFEVuI` عند 20.6s و21.3s سبقت النقر بسبع ثوانٍ (معاينة أثناء مرور المؤشر قبل النقر).

بعد الإصلاح (`src/extract/pending.js`، نافذة 2000ms):

```text
17.71s reject v=FLbXrNGVXfE current=iG9CE55wbtY EX_WRONG_VIDEO manual
18.00s nav iG9CE55wbtY → FLbXrNGVXfE
18.00s reject v=FLbXrNGVXfE current=FLbXrNGVXfE EX_EMPTY_BODY manual   ← إعادة تقييم الالتقاط المعلّق (عمره 290ms)
20.51s reject v=cbiyPOn-__M current=FLbXrNGVXfE EX_WRONG_VIDEO manual
21.13s reject v=cbiyPOn-__M current=FLbXrNGVXfE EX_WRONG_VIDEO manual
28.00s nav FLbXrNGVXfE → cbiyPOn-__M                                    ← لا إعادة تقييم: عمرها أكبر من 2000ms
```

الالتقاط المعلّق أُعيد تقييمه بكل القواعد فور تغيّر العنوان (ورُفض هنا لأن الجسم فارغ تحت الأتمتة)، بينما بقيت طلبات المعاينات السابقة للنقر مرفوضة.
