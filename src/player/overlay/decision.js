// قرار العرض (نقي): ماذا تعرض الطبقة الآن من حالة المتحكم وحالة الصفحة. هنا تُحسم قاعدتا الأمان:
// ١) لا يُعرض شيء إلا إن طابق معرّف الفيديو في الحالة معرّف الصفحة الفعلي ولا تنقّل جارٍ (لا خلط بين الفيديوهات)،
// ٢) الإخفاء مقدَّم على العرض أثناء الإعلان (isAdShowing يعدّ المشكوك فيه إعلانًا).

/**
 * @typedef {import('../../content/controller.js').ControllerState} ControllerState
 * @typedef {{ videoId: string | null, navigating: boolean, ad: boolean }} PageState
 * @typedef {{
 *   engaged: boolean, visible: boolean, hideNative: boolean,
 *   ar: import('../../core/model/cue.js').Cue[] | null, en: import('../../core/model/cue.js').Cue[] | null,
 *   offsetMs: number, appearance: ControllerState['settings']['appearance'],
 * }} Decision
 */

/**
 * @param {ControllerState} state
 * @param {PageState} page
 * @returns {Decision}
 */
export function decide(state, page) {
  const mode = state.view.displayMode;
  const sameVideo = !!state.videoId && state.videoId === page.videoId;
  // «منخرطة»: لها ما تعرضه لهذا الفيديو بالذات. وحدها تُخفي ترجمة يوتيوب الأصلية.
  const engaged = sameVideo && !state.loading && !page.navigating && !!state.arabic && mode !== 'off';
  const visible = engaged && !page.ad;
  const dual = mode === 'dual' && !!state.english;
  return {
    engaged,
    visible,
    hideNative: engaged,
    ar: visible ? state.arabic.cues : null,
    en: visible && dual ? state.english.cues : null,
    offsetMs: state.view.displayOffsetMs,
    appearance: state.settings.appearance,
  };
}
