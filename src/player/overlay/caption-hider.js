// إخفاء ترجمة يوتيوب الأصلية ما دامت الطبقة منخرطة (عقد interfaces §٣): ورقة أنماط على مستوى المستند يحقنها
// المكوّن نفسه ويسحبها حين تنتهي حاجته. لا يلمس عناصر يوتيوب، والاستخراج لا يتأثر (الجلب والتحليل مستمران).
import { hideNativeCss } from './styles.js';
import { createSheet } from './sheet.js';

/** @param {{ doc: Document, win: Window }} env */
export function createCaptionHider(env) {
  const sheet = createSheet(env, hideNativeCss());
  let on = false;
  return {
    /** @param {boolean} next */
    set(next) {
      if (next === on) return;
      on = next;
      if (on) sheet.adopt(env.doc);
      else sheet.release();
    },
    isOn: () => on,
    destroy() {
      on = false;
      sheet.release();
    },
  };
}
