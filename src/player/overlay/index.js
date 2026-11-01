// نقطة تركيب طبقة العرض (عقد interfaces §٣). تملكها P5؛ هذا بديل P2 المؤقت: لا يرسم شيئًا ولا يلمس DOM.
// mountOverlay تُستدعى مرة عند document_start قبل وجود المشغّل، فالتنفيذ الحقيقي ينتظر #movie_player بنفسه.

/**
 * @typedef {{ state: 'stub' | 'waiting' | 'mounted' | 'error', unmount: () => void }} MountHandle
 */

/**
 * @param {import('../../content/controller.js').Controller} controller
 * @param {{ doc?: Document, win?: Window }} [env]
 * @returns {MountHandle}
 */
export function mountOverlay(controller, env = {}) {
  void controller;
  void env;
  return { state: 'stub', unmount() {} };
}
