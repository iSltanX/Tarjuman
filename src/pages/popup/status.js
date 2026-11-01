// منطق نافذة الأيقونة بلا DOM (P7-AC1): استعلام حالة الفيديو الحالي من سكربت المحتوى في التبويب النشط، ووصف الحالة
// الأربع للبطاقة، وشرط تفعيل «المحرّر». الاستعلام يعيد null لكل ما ليس رد صفحة فيديو صالحًا («افتح فيديو على يوتيوب»):
// تبويب ليس يوتيوب، أو سكربت لم يُحمَّل، أو نسخة أقدم، أو لا رد في المهلة.
import { COUNT_FORMS, formatCount, formatOffset } from '../../ui/format.js';
import { isVideoStateReply, videoStateRequest } from '../../core/model/messages.js';

/** مهلة الرد: سكربت لا يردّ لا يترك النافذة هيكلًا إلى الأبد. */
export const REPLY_TIMEOUT_MS = 1500;

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

/**
 * @param {{ tabs?: typeof chrome.tabs, timeoutMs?: number }} [env]
 * @returns {Promise<import('../../core/model/messages.js').VideoStateReply | null>}
 */
export async function queryVideoState({ tabs = globalThis.chrome?.tabs, timeoutMs = REPLY_TIMEOUT_MS } = {}) {
  try {
    const [tab] = await withTimeout(tabs.query({ active: true, lastFocusedWindow: true }), timeoutMs);
    if (!tab || tab.id === undefined) return null;
    const reply = await withTimeout(tabs.sendMessage(tab.id, videoStateRequest()), timeoutMs);
    return isVideoStateReply(reply) ? reply : null;
  } catch {
    return null;
  }
}

/**
 * وصف بطاقة الفيديو الحالي (figma-design-brief §٨): حالة واحدة من أربع.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ kind: 'not-video' }
 *   | { kind: 'loading', title: string }
 *   | { kind: 'no-subtitle', title: string, englishLine: string }
 *   | { kind: 'has-subtitle', title: string, line: string, edited: boolean }}
 */
export function describeStatus(reply) {
  if (!reply || !reply.watch) return { kind: 'not-video' };
  const title = reply.title ?? reply.videoId ?? '';
  if (reply.loading) return { kind: 'loading', title };
  if (!reply.arabic) {
    const captured = reply.english.captured.some((t) => t.ok);
    const saved = reply.english.saved.length > 0;
    return { kind: 'no-subtitle', title, englishLine: `المسار الإنجليزي: ${captured ? 'ملتقط ✓' : saved ? 'محفوظ ✓' : 'غير ملتقط'}` };
  }
  const a = reply.arabic;
  return {
    kind: 'has-subtitle',
    title,
    line: ['ترجمة عربية', formatCount(a.cueCount, COUNT_FORMS.cue), `الإزاحة ${formatOffset(reply.view.displayOffsetMs)} ث`].join(' · '),
    edited: a.edited,
  };
}

/**
 * «المحرّر» للفيديو الحالي إن كانت له ترجمة، وإلا معطّل بسبب ظاهر.
 * @param {import('../../core/model/messages.js').VideoStateReply | null} reply
 * @returns {{ enabled: true, videoId: string, reason: null } | { enabled: false, videoId: null, reason: string }}
 */
export function editorGate(reply) {
  if (!reply || !reply.watch || !reply.videoId) return { enabled: false, videoId: null, reason: 'افتح فيديو على يوتيوب أولًا' };
  if (reply.loading) return { enabled: false, videoId: null, reason: 'جارٍ قراءة ترجمة الفيديو…' };
  if (!reply.arabic) return { enabled: false, videoId: null, reason: 'لا ترجمة لهذا الفيديو بعد' };
  return { enabled: true, videoId: reply.videoId, reason: null };
}
