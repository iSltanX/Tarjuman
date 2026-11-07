// التحقق من رسالة MAIN → ISOLATED. كل ما يصل من الصفحة بيانات غير موثوقة: تُنسخ الحقول المعروفة
// بأنواعها فقط، ويُرفض ما عداها. لا أوامر من الصفحة إلى الإضافة.

export const MESSAGE_SOURCE = 'tarjuman';
export const MAX_BODY_CHARS = 20 * 1024 * 1024;
/**
 * سقف وسم اللغة (تدقيق Fable، FA-09): BCP 47 يكفيه 35 محرفًا (RFC 5646 §4.4.1) وأربعة مقاطع بعد اللغة (en-x-autogen وzh-Hans-CN)؛
 * كان وسم بطول 1,802 محرف يُقبل حتى يرفض الحفظُ اسمَ الملف برسالة مضلّلة. فوقه lang = null، فيُرفض المسار مبكرًا بـEX_BAD_LANG.
 */
export const MAX_LANG_CHARS = 35;
/** أكبر طول يُبلَّغ لجسم مقطوع (أطول سلسلة في المحركات دون 2^30). */
const MAX_REPORTED_LENGTH = 2 ** 30;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LANG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8}){0,4}$/;
const FORMATS = new Set(['json3', 'srv3', 'other', 'default']);

/**
 * @typedef {{
 *   videoId: string | null, lang: string | null, trackKind: 'manual' | 'asr', kindParam: string | null,
 *   capsAsr: boolean, hasTlang: boolean, tlang: string | null, format: string, hasPot: boolean, transport: 'fetch' | 'xhr',
 *   status: number, bodyLength: number, body: string, truncated: boolean
 * }} CaptureMessage
 */

/**
 * @param {unknown} d
 * @returns {CaptureMessage | null}
 */
export function validateCaptureMessage(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.source !== MESSAGE_SOURCE || d.v !== 1 || d.kind !== 'timedtext') return null;
  const str = (x, re) => (typeof x === 'string' && re.test(x) ? x : null);
  if (typeof d.body !== 'string' || d.body.length > MAX_BODY_CHARS) return null;
  if (!Number.isInteger(d.status) || d.status < 0 || d.status > 999) return null;
  if (!Number.isInteger(d.bodyLength) || d.bodyLength < 0) return null;
  return {
    videoId: str(d.videoId, VIDEO_ID),
    lang: typeof d.lang === 'string' && d.lang.length <= MAX_LANG_CHARS ? str(d.lang, LANG) : null,
    trackKind: d.trackKind === 'asr' ? 'asr' : 'manual',
    kindParam: str(d.kindParam, /^[a-z]{1,16}$/),
    capsAsr: d.capsAsr === true,
    hasTlang: d.hasTlang === true,
    tlang: typeof d.tlang === 'string' && d.tlang.length <= MAX_LANG_CHARS ? str(d.tlang, LANG) : null,
    format: FORMATS.has(d.format) ? d.format : 'other',
    hasPot: d.hasPot === true,
    transport: d.transport === 'xhr' ? 'xhr' : 'fetch',
    status: d.status,
    // الطول من الجسم نفسه، والمقطوع (فوق الحد يصل فارغًا بطوله الأصلي) بطوله المبلَّغ محدودًا بأطول سلسلة ممكنة: الرقم يدخل
    // التشخيص وحده، وكان 1e308 أو طول لا يطابق الجسم يُنقل كما أرسلته الصفحة (تدقيق Fable، FA-18).
    bodyLength: d.truncated === true ? Math.min(d.bodyLength, MAX_REPORTED_LENGTH) : d.body.length,
    body: d.body,
    truncated: d.truncated === true,
  };
}

/** حدود قائمة المسارات المتاحة (AA1): مسارات الفيديو قليلة عادة، والاسم كما يعرضه يوتيوب في قائمته. */
export const MAX_LISTED_TRACKS = 64;
export const MAX_TRACK_NAME_CHARS = 120;
// محارف التحكم والتنسيق وتجاوز الاتجاه لا تدخل اسم مسار يُعرض (كما في الاستيراد والاستعادة).
const NAME_STRIP = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * @typedef {{ lang: string, kind: 'manual' | 'asr', name: string | null }} ListedTrack
 * @typedef {{ videoId: string, tracks: ListedTrack[], translatable: boolean }} TrackList
 */

/**
 * قائمة مسارات الفيديو كما في بيانات المشغّل التي في الصفحة (MAIN → ISOLATED، AA1). بيانات غير موثوقة: لكل مسار رمز لغته
 * ونوعه واسمه المعروض وحدها (لا رابط ولا رمز)، والمكرر بلغته ونوعه يُسقط، والزائد عن الحد يُسقط.
 * @param {unknown} d
 * @returns {TrackList | null}
 */
export function validateTracklistMessage(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.source !== MESSAGE_SOURCE || d.v !== 1 || d.kind !== 'tracklist') return null;
  if (typeof d.videoId !== 'string' || !VIDEO_ID.test(d.videoId) || !Array.isArray(d.tracks)) return null;
  const seen = new Set();
  const tracks = [];
  for (const t of d.tracks.slice(0, MAX_LISTED_TRACKS)) {
    if (!t || typeof t !== 'object' || typeof t.lang !== 'string' || t.lang.length > MAX_LANG_CHARS || !LANG.test(t.lang)) continue;
    const kind = t.kind === 'asr' ? 'asr' : 'manual';
    const id = `${t.lang}|${kind}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = typeof t.name === 'string' ? t.name.replace(NAME_STRIP, '').trim().slice(0, MAX_TRACK_NAME_CHARS) : '';
    tracks.push({ lang: t.lang, kind, name: name || null });
  }
  return { videoId: d.videoId, tracks, translatable: d.translatable === true };
}
