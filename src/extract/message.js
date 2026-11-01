// التحقق من رسالة MAIN → ISOLATED. كل ما يصل من الصفحة بيانات غير موثوقة: تُنسخ الحقول المعروفة
// بأنواعها فقط، ويُرفض ما عداها. لا أوامر من الصفحة إلى الإضافة.

export const MESSAGE_SOURCE = 'tarjuman';
export const MAX_BODY_CHARS = 20 * 1024 * 1024;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LANG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*$/;
const FORMATS = new Set(['json3', 'srv3', 'other', 'default']);

/**
 * @typedef {{
 *   videoId: string | null, lang: string | null, trackKind: 'manual' | 'asr', kindParam: string | null,
 *   capsAsr: boolean, hasTlang: boolean, format: string, hasPot: boolean, transport: 'fetch' | 'xhr',
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
    lang: str(d.lang, LANG),
    trackKind: d.trackKind === 'asr' ? 'asr' : 'manual',
    kindParam: str(d.kindParam, /^[a-z]{1,16}$/),
    capsAsr: d.capsAsr === true,
    hasTlang: d.hasTlang === true,
    format: FORMATS.has(d.format) ? d.format : 'other',
    hasPot: d.hasPot === true,
    transport: d.transport === 'xhr' ? 'xhr' : 'fetch',
    status: d.status,
    bodyLength: d.bodyLength,
    body: d.body,
    truncated: d.truncated === true,
  };
}
