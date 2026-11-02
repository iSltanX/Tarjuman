// رسائل الإضافة الداخلية (عقد docs/contracts/messages.md). الصفحات لا تراسل المشغّل إلا بهذا الطلب،
// وتُعرف بمصدرها لا بمحتواها: لا يُقبل طلب إلا من صفحة في الإضافة نفسها.
import { DISPLAY_MODES } from './video.js';
import { isVideoId } from './ids.js';

export const MESSAGE_VERSION = 1;
export const MSG = Object.freeze({ getVideoState: 'tj:get-video-state' });

/**
 * @typedef {{
 *   v: 1, ok: true, watch: boolean, videoId: string | null, title: string | null, loading: boolean,
 *   english: { captured: { key: string, kind: 'manual' | 'asr', cueCount: number, ok: boolean }[], saved: { key: string, kind: 'manual' | 'asr', cueCount: number }[] },
 *   arabic: null | { fileName: string, cueCount: number, edited: boolean, matched: boolean | null },
 *   view: { displayOffsetMs: number, displayMode: 'ar' | 'dual' | 'off' },
 *   mounted: { overlay: string, controls: string }
 * }} VideoStateReply
 */

/**
 * المرسِل صفحة من الإضافة نفسها (نافذة الأيقونة أو صفحاتها)، لا سكربت محتوى ولا موقع.
 * @param {{ id?: string, url?: string }} sender
 * @param {{ id: string, getURL: (p: string) => string }} runtime
 */
export function isExtensionPage(sender, runtime) {
  return !!sender && sender.id === runtime.id && typeof sender.url === 'string' && sender.url.startsWith(runtime.getURL(''));
}

/** @param {unknown} req */
export const isVideoStateRequest = (req) => !!req && typeof req === 'object' && req.type === MSG.getVideoState && req.v === MESSAGE_VERSION;

/** @returns {{ type: string, v: 1 }} */
export const videoStateRequest = () => ({ type: MSG.getVideoState, v: MESSAGE_VERSION });

/**
 * يبني الرد من حالة المتحكم: أعداد وملخصات فقط، بلا نص مقاطع.
 * @param {import('../../content/controller.js').ControllerState} s
 * @param {{ overlay: string, controls: string }} mounted
 * @returns {VideoStateReply}
 */
export function buildVideoStateReply(s, mounted) {
  const a = s.saved?.arabic ?? null;
  return {
    v: MESSAGE_VERSION, ok: true, watch: isVideoId(s.videoId), videoId: s.videoId, title: s.title, loading: s.loading,
    english: {
      captured: s.captured.map((t) => ({ key: t.key, kind: t.kind, cueCount: t.cueCount, ok: t.ok })),
      saved: (s.saved?.english ?? []).map((t) => ({ key: t.key, kind: t.kind, cueCount: t.cues.length })),
    },
    arabic: a ? {
      fileName: a.fileName, cueCount: (a.current ?? a.original).length, edited: a.current !== null,
      matched: a.comparison && a.comparison.fingerprintId ? a.comparison.matched : null,
    } : null,
    view: { ...s.view },
    mounted: { overlay: String(mounted.overlay), controls: String(mounted.controls) },
  };
}

/**
 * تحقق الصفحة من الرد قبل عرضه (الرد قد يأتي من نسخة أقدم أو لا يأتي).
 * @param {unknown} r
 * @returns {r is VideoStateReply}
 */
export function isVideoStateReply(r) {
  return !!r && typeof r === 'object' && r.v === MESSAGE_VERSION && r.ok === true && typeof r.watch === 'boolean'
    && (r.videoId === null || isVideoId(r.videoId)) && !!r.view && DISPLAY_MODES.includes(r.view.displayMode)
    && Number.isInteger(r.view.displayOffsetMs) && !!r.english && Array.isArray(r.english.captured);
}
