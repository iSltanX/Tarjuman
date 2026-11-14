// سياسة ترتيب مسارات الفيديو في موضع واحد (تدقيق V2، U-033 وU-035): يستعملها الاختيار الافتراضي في المتحكم، وقائمة التحميل
// في المشغّل، ومسار «من» للزوج المحفوظ (pair.js)، ومنها select.js في المستخرج. الترتيب: الصالح أولًا، ثم الأصلي قبل المترجم آليًا
// من يوتيوب (via)، ثم اليدوي قبل التلقائي، ثم الأحدث التقاطًا (عقد extraction.md)، ثم ترتيب الورود. ولا تفضيل للغة (AA1).
// مسار بلا ok وcueCount (محفوظ في السجل) يُعدّ صالحًا.

const KIND_RANK = { manual: 0, asr: 1 };

/** @param {{ ok?: boolean, cueCount?: number }} t */
export const isUsableTrack = (t) => (t.ok === undefined || (t.ok && t.cueCount > 0) ? 1 : 0);

/**
 * @template {{ key: string, kind: 'manual' | 'asr', via?: string | null, capturedAt?: string, ok?: boolean, cueCount?: number }} T
 * @param {T[]} tracks
 * @returns {T[]} نسخة مرتبة؛ المدخل لا يتغير
 */
export function rankTracks(tracks) {
  return tracks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => isUsableTrack(b.t) - isUsableTrack(a.t)
      // قرار ق٢ في هذا السطر وحده، بتوضيح سلطان D-01 (2026-11-08، U-034): المترجم آليًا لا يتقدّم على أصلي، ويُختار موسومًا إن كان الوحيد.
      || Number(Boolean(a.t.via)) - Number(Boolean(b.t.via))
      || KIND_RANK[a.t.kind] - KIND_RANK[b.t.kind]
      || Date.parse(b.t.capturedAt) - Date.parse(a.t.capturedAt)
      || a.i - b.i)
    .map((x) => x.t);
}

/** الصالحة وحدها بالترتيب الموحد. @template {Parameters<typeof rankTracks>[0][number]} T @param {T[]} tracks @returns {T[]} */
export const rankUsable = (tracks) => rankTracks(tracks).filter((t) => isUsableTrack(t));
