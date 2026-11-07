// محوّل الالتقاط: يقرر قبول الرسالة أو رفضها بقواعد عقد الاستخراج، ثم يحوّل المقبول إلى SRT.
// معزول هنا ليُستبدل إن غيّر يوتيوب آلية الطلب. منذ 2.0.0 (AA1) يُقبل المسار بأي لغة يختارها المستخدم من يوتيوب، والمترجم آليًا
// من يوتيوب (tlang) يُقبل موسومًا بلغته ولغة أصله (قرار سلطان ق٢)؛ والمرفوض اللغة غير الصالحة وحدها.
import { convertTrack } from '../core/convert/index.js';

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
  if (!msg.lang) return { accepted: false, code: 'EX_BAD_LANG', detail: 'lang غير صالح' };
  if (msg.hasTlang && !msg.tlang) return { accepted: false, code: 'EX_BAD_LANG', detail: 'tlang غير صالح' };
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
 * لغة المسار ونوعه ومفتاحه من رسالة مقبولة: المترجم آليًا لغته tlang وأصله lang (via)، والأصلي لغته lang.
 * @param {import('./message.js').CaptureMessage} msg
 * @returns {{ lang: string, kind: 'manual' | 'asr', via: string | null }}
 */
export const trackOf = (msg) => (msg.hasTlang && msg.tlang
  ? { lang: msg.tlang, kind: msg.trackKind, via: msg.lang }
  : { lang: /** @type {string} */ (msg.lang), kind: msg.trackKind, via: null });

/**
 * @param {{ body: string, trackKind: 'manual' | 'asr', via?: string | null }} capture التقاط مقبول
 * @param {number | null} durationMs
 * @param {{ mode?: 'normal' | 'long', longOptions?: object, completenessRatio?: number }} [opts]
 */
export function convertCapture(capture, durationMs, { mode = 'normal', longOptions, completenessRatio } = {}) {
  // المترجم آليًا يُحوَّل ببنيته كما وصلت (inferKind): ترجمة يوتيوب قد لا تحمل توقيت كلمات مسار أصلها التلقائي.
  const trackKind = capture.via ? 'auto' : capture.trackKind;
  return convertTrack({ body: capture.body, trackKind, durationMs, mode, longOptions, completenessRatio });
}
