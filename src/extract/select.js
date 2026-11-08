// اختيار المسار عند تعدد المسارات الملتقطة (لغات ولهجات، ويدوي وتلقائي، ومترجم آليًا من يوتيوب). الترتيب يخدم القائمة
// والاختيار الافتراضي: الصالح أولًا، والأصلي قبل المترجم آليًا (لا يتقدّم على أصلي، قرار سلطان ق٢)، واليدوي قبل التلقائي
// لأنه أدق، ثم الأحدث التقاطًا. ولا تفضيل للغة (AA1): المستخدم اختار لغته من يوتيوب. الاختيار الصريح من المستخدم أقوى من
// الترتيب، لكنه لا يختار مسارًا غير صالح. والترتيب نفسه موضع واحد في src/core/model/track-order.js (تدقيق V2، U-033 وU-035).
import { isUsableTrack, rankTracks } from '../core/model/track-order.js';

export { rankTracks };

/**
 * المسار الذي يُنزَّل: اختيار المستخدم إن كان صالحًا، وإلا الأعلى ترتيبًا، وإلا لا شيء.
 * @template {Parameters<typeof rankTracks>[0][number]} T
 * @param {T[]} tracks
 * @param {string | null} [preferredKey]
 * @returns {T | null}
 */
export function chooseTrack(tracks, preferredKey = null) {
  const preferred = preferredKey ? tracks.find((t) => t.key === preferredKey) : null;
  if (preferred && isUsableTrack(preferred)) return preferred;
  const best = rankTracks(tracks)[0];
  return best && isUsableTrack(best) ? best : null;
}
