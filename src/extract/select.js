// اختيار المسار عند تعدد المسارات الإنجليزية الملتقطة (يدوي، وتلقائي، وen-GB وما شابه). الترتيب يخدم
// القائمة (P6) والاختيار الافتراضي: الصالح أولًا، واليدوي قبل التلقائي لأنه أدق، و«en» قبل اللهجات،
// ثم الأحدث التقاطًا. الاختيار الصريح من المستخدم أقوى من الترتيب، لكنه لا يختار مسارًا غير صالح.

const KIND_RANK = { manual: 0, asr: 1 };
const PLAIN_ENGLISH = /^en$/i;

/** @param {{ ok: boolean, cueCount: number }} t */
const usable = (t) => (t.ok && t.cueCount > 0 ? 1 : 0);

/**
 * @template {{ key: string, lang: string, kind: 'manual' | 'asr', capturedAt: string, ok: boolean, cueCount: number }} T
 * @param {T[]} tracks
 * @returns {T[]} نسخة مرتبة؛ المدخل لا يتغير
 */
export function rankTracks(tracks) {
  return tracks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => usable(b.t) - usable(a.t)
      || KIND_RANK[a.t.kind] - KIND_RANK[b.t.kind]
      || Number(!PLAIN_ENGLISH.test(a.t.lang)) - Number(!PLAIN_ENGLISH.test(b.t.lang))
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
