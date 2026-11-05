// أهداف البناء (جولة النشر T2، docs/store-release.md): chromium لـChrome وBrave وEdge، والبيان فيه src/manifest.json كما هو؛
// وfirefox بأصغر طبقة فوقه، والشيفرة والملفات واحدة في الهدفين. Edge لا فرع له إلا بفرق يثبته الاختبار.
//   الطبقة: العامل الخلفي سكربت خلفية (Firefox لا يدعم background.service_worker)، وbrowser_specific_settings.gecko بالمعرّف
//   وأدنى إصدار (140: موافقة جمع البيانات المدمجة) وdata_collection_permissions، وبلا gecko_android (سطح المكتب وحده).
export const TARGETS = Object.freeze(['chromium', 'firefox']);

/** مجلد البناء الافتراضي لكل هدف: dist/ لعائلة Chromium كما كان. */
export const DEFAULT_OUT = Object.freeze({ chromium: 'dist', firefox: 'dist-firefox' });

/**
 * إعدادات Gecko المعتمدة (قرار سلطان، store/README.md §٥). لا يُجمع شيء دون موافقة، فالمطلوب none؛ وقناة البلاغات (T2.1)
 * فئتها الاختيارية technicalAndInteraction (اسم المتصفح وإصداره والنظام في البلاغ)، تُطلب مع إذن مضيفها عند أول إرسال.
 * وصور المحفوظات تنقل معرّفات المحفوظات إلى i.ytimg.com (حكم T5 بتعريفات Mozilla، docs/site/README.md)، فتُعلن
 * browsingActivity اختيارية، ويطلبها مفتاح الصور عند تفعيله، والصور مطفأة حتى الموافقة (قرار سلطان 2026-11-04،
 * src/core/consent/thumbnails.js). فيبقى none صادقًا: لا يُجمع شيء دون موافقة.
 * والحد الأدنى 144 (تدقيق 7a66f91، U03 وU83، قرار سلطان Q08 في 2026-11-05): storage.local.getBytesInUse منذ 144 وgetKeys منذ 143،
 * و140–143 متقاعدة (ESR 140 انتهى دعمه في 2026-09-29). ويقابله minimum_chrome_version ‏130 في البيان (getKeys، قرار Q09).
 */
export const GECKO = Object.freeze({
  id: 'tarjuman@bysltan.com',
  strict_min_version: '144.0',
  data_collection_permissions: Object.freeze({ required: Object.freeze(['none']), optional: Object.freeze(['technicalAndInteraction', 'browsingActivity']) }),
});

/**
 * بيان الهدف من البيان الأساسي، دون مسّ الأصل.
 * @param {object} base src/manifest.json
 * @param {'chromium'|'firefox'} target
 */
export function targetManifest(base, target) {
  if (!TARGETS.includes(target)) throw new Error(`هدف بناء غير معروف: ${target}`);
  const m = structuredClone(base);
  if (target === 'chromium') return m;
  m.background = { scripts: [base.background.service_worker] };
  m.browser_specific_settings = { gecko: structuredClone(GECKO) };
  return m;
}
