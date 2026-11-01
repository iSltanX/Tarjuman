// نقطة تركيب أدوات شريط المشغّل (عقد interfaces §٣). تملكها P6؛ هذا بديل P2 المؤقت: لا يحقن شيئًا.
// التنفيذ الحقيقي يستورد تدفقي التصدير (src/core/export، P3) والاستيراد (src/core/import، P4) بنفسه،
// وdeps للاختبار فقط، فلا يحتاج main.js المجمَّد إلى معرفتهما.

/**
 * @param {import('../../content/controller.js').Controller} controller
 * @param {{ doc?: Document, win?: Window, exportFlow?: object, importFlow?: object }} [deps]
 * @returns {import('../overlay/index.js').MountHandle}
 */
export function mountControls(controller, deps = {}) {
  void controller;
  void deps;
  return { state: 'stub', unmount() {} };
}
