// الزوج اللغوي لترجمة محفوظة (AA3، لوحة 19 البند ٢): لغة الأصل الذي تُرجم عنه ولغة الترجمة، من السجل في الذاكرة (بعد دمج
// المرافق lang:، model/lang-store.js). الأصل مسار بصمة الترجمة إن وُجد (الملف الذي نُزّل وتُرجم)، وإلا أول مسار بترتيب قائمة
// التحميل (الأصلي قبل المترجم آليًا، واليدوي قبل التلقائي، ثم الأحدث؛ model/track-order.js)؛ والترجمة بلغتها أو null «غير محددة». لا تخمين من نص.
import { baseLang } from '../lang/index.js';
import { parseTrackKey } from './ids.js';
import { rankTracks } from './track-order.js';

/** اللغة الأساسية بعد التوحيد (en-GB ← en، وiw ← he)، أو null. @param {unknown} code */
function primaryLang(code) {
  const b = baseLang(code);
  if (!b) return null;
  try {
    return Intl.getCanonicalLocales(b)[0].split('-')[0];
  } catch {
    return b;
  }
}

/**
 * الفيديو المترجم إلى لغته (ح-58، الجولة الخامسة 2026-11-14): المسار ترجمة يوتيوب الآلية (tlang، له via) عن لغة هي نفسها لغة الهدف،
 * كفيديو عربي مساره إنجليزي مترجم آليًا عن العربية والترجمة إلى العربية؛ فترجمته تعيده إلى لغته بعد ترجمتين، ومساره الأصلي أولى.
 * المقارنة باللغة الأساسية (العربية بلهجاتها واحدة). ولا شيء لمسار أصلي (بلا via) ولا لهدف غير محدد. دالة نقية بلا نصوص.
 * @param {{ via?: string | null } | null | undefined} track
 * @param {string | null | undefined} target لغة «إلى»
 * @returns {boolean}
 */
export function roundTrip(track, target) {
  const from = primaryLang(track?.via ?? null);
  return from !== null && from === primaryLang(target);
}

/**
 * مسار الأصل لترجمة: مسار بصمتها، وإلا الأول بالترتيب، وإلا null.
 * @param {{ english: { key: string, lang: string, kind: 'manual' | 'asr', via?: string | null }[], fingerprints: { id: string, trackKey: string }[] }} record
 * @param {{ fingerprintId?: string | null } | null} [track]
 * @returns {{ key: string, lang: string, via: string | null } | null}
 */
export function sourceOf(record, track = null) {
  const fp = track?.fingerprintId ? record.fingerprints.find((f) => f.id === track.fingerprintId) ?? null : null;
  const t = fp ? parseTrackKey(fp.trackKey) : null;
  if (t) return { key: fp.trackKey, lang: t.lang, via: t.via };
  const first = rankTracks(record.english)[0];
  return first ? { key: first.key, lang: first.lang, via: first.via ?? null } : null;
}

/**
 * زوج الترجمة النشطة في السجل.
 * @param {import('./video.js').VideoRecord} record
 * @returns {{ from: string | null, to: string | null, via: string | null }}
 */
export function recordPair(record) {
  const src = sourceOf(record, record.arabic);
  return { from: src?.lang ?? null, to: record.arabic?.lang ?? null, via: src?.via ?? null };
}

/**
 * زوج كل خانة في الحزمة (null للفارغة)، والنشطة من السجل.
 * @param {import('./slots.js').Bundle} bundle
 * @returns {({ from: string | null, to: string | null, via: string | null } | null)[]}
 */
export function slotPairs(bundle) {
  return bundle.slots.map((s) => {
    const t = s.n === bundle.active ? bundle.record.arabic : s.track;
    if (!t) return null;
    const src = sourceOf(bundle.record, t);
    return { from: src?.lang ?? null, to: t.lang ?? null, via: src?.via ?? null };
  });
}
