// اختيار المسار عند تعدد المسارات الملتقطة (لغات ولهجات، ويدوي وتلقائي، ومترجم آليًا من يوتيوب). الترتيب يخدم القائمة
// والاختيار الافتراضي: الصالح أولًا، والأصلي قبل المترجم آليًا (لا يُختار افتراضيًا، قرار سلطان ق٢)، واليدوي قبل التلقائي
// لأنه أدق، ثم الأحدث التقاطًا. ولا تفضيل للغة (AA1): المستخدم اختار لغته من يوتيوب. الاختيار الصريح من المستخدم أقوى من
// الترتيب، لكنه لا يختار مسارًا غير صالح.

const KIND_RANK = { manual: 0, asr: 1 };

/** @param {{ ok: boolean, cueCount: number }} t */
const usable = (t) => (t.ok && t.cueCount > 0 ? 1 : 0);

/**
 * @template {{ key: string, lang: string, kind: 'manual' | 'asr', via?: string | null, capturedAt: string, ok: boolean, cueCount: number }} T
 * @param {T[]} tracks
 * @returns {T[]} نسخة مرتبة؛ المدخل لا يتغير
 */
export function rankTracks(tracks) {
  return tracks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => usable(b.t) - usable(a.t)
      || Number(Boolean(a.t.via)) - Number(Boolean(b.t.via))
      || KIND_RANK[a.t.kind] - KIND_RANK[b.t.kind]
      || Date.parse(b.t.capturedAt) - Date.parse(a.t.capturedAt)
      || a.i - b.i)
    .map((x) => x.t);
}

/**
 * المسار الذي يُنزَّل: اختيار المستخدم إن كان صالحًا، وإلا الأعلى ترتيبًا، وإلا لا شيء.
 * @template {Parameters<typeof rankTracks>[0][number]} T
 * @param {T[]} tracks
 * @param {string | null} [preferredKey]
 * @returns {T | null}
 */
export function chooseTrack(tracks, preferredKey = null) {
  const preferred = preferredKey ? tracks.find((t) => t.key === preferredKey) : null;
  if (preferred && usable(preferred)) return preferred;
  const best = rankTracks(tracks)[0];
  return best && usable(best) ? best : null;
}
