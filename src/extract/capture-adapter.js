// محوّل الالتقاط: يقرر قبول الرسالة أو رفضها بقواعد عقد الاستخراج، ثم يحوّل المقبول إلى SRT.
// معزول هنا ليُستبدل إن غيّر يوتيوب آلية الطلب.
import { convertTrack } from '../core/convert/index.js';

const ENGLISH = /^en(?:[-_]|$)/i;

/**
 * @param {import('./message.js').CaptureMessage} msg
 * @param {{ currentVideoId: string | null, isLive?: boolean }} ctx
 * @returns {{ accepted: true } | { accepted: false, code: string, detail: string }}
 */
export function checkAcceptance(msg, ctx) {
  if (!ctx.currentVideoId) return { accepted: false, code: 'EX_NO_VIDEO', detail: 'لا فيديو في عنوان الصفحة' };
  if (msg.videoId !== ctx.currentVideoId) {
    return { accepted: false, code: 'EX_WRONG_VIDEO', detail: msg.videoId ? 'v لا يطابق الفيديو المعروض' : 'لا v صالح في الطلب' };
  }
  if (msg.hasTlang) return { accepted: false, code: 'EX_TRANSLATED_TRACK', detail: 'الطلب يحمل tlang' };
  if (!msg.lang || !ENGLISH.test(msg.lang)) return { accepted: false, code: 'EX_NOT_ENGLISH', detail: `lang=${msg.lang ?? 'غير صالح'}` };
  if (msg.status !== 200) return { accepted: false, code: 'EX_EMPTY_BODY', detail: `الحالة ${msg.status}` };
  if (msg.truncated || msg.body.trim() === '') return { accepted: false, code: 'EX_EMPTY_BODY', detail: `طول الجسم ${msg.bodyLength}` };
  const looksJson = msg.body.trimStart().startsWith('{');
  if (msg.format !== 'json3' && !(msg.format === 'default' && looksJson)) {
    return { accepted: false, code: 'EX_UNSUPPORTED_FORMAT', detail: `fmt=${msg.format}` };
  }
  if (ctx.isLive) return { accepted: false, code: 'EX_LIVE', detail: 'بث جارٍ' };
  return { accepted: true };
}

/**
 * @param {{ body: string, trackKind: 'manual' | 'asr' }} capture التقاط مقبول
 * @param {number | null} durationMs
 * @param {{ mode?: 'normal' | 'long', longOptions?: object }} [opts]
 */
export function convertCapture(capture, durationMs, { mode = 'normal', longOptions } = {}) {
  return convertTrack({ body: capture.body, trackKind: capture.trackKind, durationMs, mode, longOptions });
}
