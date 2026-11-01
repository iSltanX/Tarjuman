// قراءة معاملات طلب /api/timedtext. تُستخرج القيم المسموح بها فقط ثم يُسقط الرابط؛ لا يُعاد الرابط
// ولا أي جزء منه، ولا قيمة pot أو التوقيع أو expire.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LANG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*$/;

/**
 * @typedef {{
 *   videoId: string | null, lang: string | null, trackKind: 'manual' | 'asr',
 *   kindParam: string | null, capsAsr: boolean, hasTlang: boolean,
 *   format: 'json3' | 'srv3' | 'other' | 'default', hasPot: boolean
 * }} TimedtextMeta
 */

/**
 * @param {string} rawUrl
 * @param {string} [base]
 * @returns {TimedtextMeta | null} null إن لم يكن الطلب timedtext على youtube.com
 */
export function readTimedtextParams(rawUrl, base) {
  let u;
  try {
    u = new URL(rawUrl, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !/(^|\.)youtube\.com$/.test(u.hostname) || u.pathname !== '/api/timedtext') return null;
  const p = u.searchParams;
  const v = p.get('v');
  const lang = p.get('lang');
  const kind = p.get('kind');
  const fmt = p.get('fmt');
  return {
    videoId: v && VIDEO_ID.test(v) ? v : null,
    lang: lang && LANG.test(lang) ? lang : null,
    trackKind: kind === 'asr' ? 'asr' : 'manual',
    kindParam: kind && /^[a-z]{1,16}$/.test(kind) ? kind : null,
    capsAsr: p.get('caps') === 'asr',
    hasTlang: p.has('tlang'),
    format: fmt === null ? 'default' : fmt === 'json3' ? 'json3' : fmt === 'srv3' ? 'srv3' : 'other',
    hasPot: p.has('pot'),
  };
}
