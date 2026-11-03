// أهداف البناء (جولة النشر T2، docs/store-release.md): chromium لـChrome وBrave وEdge، والبيان فيه src/manifest.json كما هو؛
// وfirefox بأصغر طبقة فوقه، والشيفرة والملفات واحدة في الهدفين. Edge لا فرع له إلا بفرق يثبته الاختبار.
//   الطبقة: العامل الخلفي سكربت خلفية (Firefox لا يدعم background.service_worker)، وbrowser_specific_settings.gecko بالمعرّف
//   وأدنى إصدار (140: موافقة جمع البيانات المدمجة) وdata_collection_permissions، وبلا gecko_android (سطح المكتب وحده).
export const TARGETS = Object.freeze(['chromium', 'firefox']);

/** مجلد البناء الافتراضي لكل هدف: dist/ لعائلة Chromium كما كان. */
export const DEFAULT_OUT = Object.freeze({ chromium: 'dist', firefox: 'dist-firefox' });

/**
 * إعدادات Gecko المعتمدة (قرار سلطان، store/README.md §٥). لا يُجمع شيء ولا يُرسل إلى ترجمان، فالمطلوب none؛ وحكم صور
 * المحفوظات بتعريفات Mozilla في T5، وقناة البلاغات تضيف فئتها الاختيارية في T2.1.
 */
export const GECKO = Object.freeze({
  id: 'tarjuman@bysltan.com',
  strict_min_version: '140.0',
  data_collection_permissions: Object.freeze({ required: Object.freeze(['none']) }),
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
