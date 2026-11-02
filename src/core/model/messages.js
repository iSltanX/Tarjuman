// رسائل الإضافة الداخلية (عقد docs/contracts/messages.md). الصفحات لا تراسل المشغّل إلا بطلبات محددة (الحالة،
// والتشخيص، والقفز إلى زمن)، وتُعرف بمصدرها لا بمحتواها: لا يُقبل طلب إلا من صفحة في الإضافة نفسها. وسكربت المحتوى
// لا يراسل إلا العامل الخلفي برسالة الحفظ (§٧). كلها بالإصدار v: 1، ورد الحالة موسّع بحقول تتجاهلها النافذة القديمة.
import { DISPLAY_MODES } from './video.js';
import { isVideoId } from './ids.js';
import { LIMITS, isPlainObject } from './validate.js';

export const MESSAGE_VERSION = 1;
export const MSG = Object.freeze({
  getVideoState: 'tj:get-video-state',
  getPageDiagnostics: 'tj:get-page-diagnostics',
  seek: 'tj:seek',
  saveFile: 'tj:save-file',
});
export const SAVE_REPLY_MODES = Object.freeze(['downloads', 'subfolder', 'ask']);

/**
 * @typedef {{ n: 1 | 2 | 3, filled: boolean, active: boolean, name: string | null }} SlotSummary
 * @typedef {{
 *   v: 1, ok: true, watch: boolean, videoId: string | null, title: string | null, loading: boolean,
 *   english: { captured: { key: string, kind: 'manual' | 'asr', cueCount: number, ok: boolean }[], saved: { key: string, kind: 'manual' | 'asr', cueCount: number }[] },
 *   arabic: null | { fileName: string, cueCount: number, edited: boolean, matched: boolean | null },
 *   view: { displayOffsetMs: number, displayMode: 'ar' | 'dual' | 'off' },
 *   mounted: { overlay: string, controls: string },
 *   slots?: SlotSummary[],
 *   capture?: { state: 'captured' | 'rejected' | 'none', count: number, code: string | null },
 *   tools?: { overlay: string, controls: string, code: string | null }
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

/**
 * المرسِل سكربت محتوى ترجمان على يوتيوب (للعامل الخلفي وحده).
 * @param {{ id?: string, url?: string, tab?: object }} sender
 * @param {{ id: string }} runtime
 */
export function isOwnContentScript(sender, runtime) {
  return !!sender && sender.id === runtime.id && !!sender.tab && typeof sender.url === 'string' && sender.url.startsWith('https://www.youtube.com/');
}

const isTyped = (req, type) => isPlainObject(req) && req.type === type && req.v === MESSAGE_VERSION;

/** @param {unknown} req */
export const isVideoStateRequest = (req) => !!req && typeof req === 'object' && req.type === MSG.getVideoState && req.v === MESSAGE_VERSION;

/** @returns {{ type: string, v: 1 }} */
export const videoStateRequest = () => ({ type: MSG.getVideoState, v: MESSAGE_VERSION });

const SLOT_NUMBERS = [1, 2, 3];

/** ملخص الخانات من حالة المتحكم، أو من السجل وحده لحالة لا تحمل slots. */
function slotSummaries(s) {
  if (Array.isArray(s.slots) && s.slots.length === 3) return s.slots.map((x) => ({ n: x.n, filled: !!x.filled, active: !!x.active, name: x.name ?? null }));
  const has = !!s.saved?.arabic;
  return SLOT_NUMBERS.map((n) => ({ n, filled: has && n === 1, active: has && n === 1, name: null }));
}

/**
 * يبني الرد من حالة المتحكم: أعداد وملخصات فقط، بلا نص مقاطع.
 * @param {import('../../content/controller.js').ControllerState} s
 * @param {{ overlay: string, controls: string, code?: string | null }} mounted
 * @returns {VideoStateReply}
 */
export function buildVideoStateReply(s, mounted) {
  const a = s.saved?.arabic ?? null;
  const okTracks = s.captured.filter((t) => t.ok);
  const issue = s.captureIssue?.code ?? null;
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
    slots: slotSummaries(s),
    capture: { state: okTracks.length ? 'captured' : issue ? 'rejected' : 'none', count: okTracks.length, code: okTracks.length ? null : issue },
    tools: { overlay: String(mounted.overlay), controls: String(mounted.controls), code: mounted.code ?? null },
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

/**
 * الحقول الجديدة في الرد (الإصدار الثاني)؛ الرد القديم بلاها يبقى صالحًا بـisVideoStateReply.
 * @param {unknown} r
 */
export function isVideoStateReplyV2(r) {
  return isVideoStateReply(r) && Array.isArray(r.slots) && r.slots.length === 3
    && r.slots.every((x, i) => x && x.n === i + 1 && typeof x.filled === 'boolean' && typeof x.active === 'boolean' && (x.name === null || typeof x.name === 'string'))
    && !!r.capture && ['captured', 'rejected', 'none'].includes(r.capture.state) && Number.isInteger(r.capture.count)
    && !!r.tools && typeof r.tools.overlay === 'string' && typeof r.tools.controls === 'string';
}

/** @returns {{ type: string, v: 1 }} */
export const pageDiagnosticsRequest = () => ({ type: MSG.getPageDiagnostics, v: MESSAGE_VERSION });
/** @param {unknown} req */
export const isPageDiagnosticsRequest = (req) => isTyped(req, MSG.getPageDiagnostics);

/**
 * @param {string} videoId @param {number} ms
 * @returns {{ type: string, v: 1, videoId: string, ms: number }}
 */
export const seekRequest = (videoId, ms) => ({ type: MSG.seek, v: MESSAGE_VERSION, videoId, ms });

/** @param {unknown} req */
export function isSeekRequest(req) {
  return isTyped(req, MSG.seek) && Object.keys(req).length === 4 && isVideoId(req.videoId)
    && Number.isInteger(req.ms) && req.ms >= 0 && req.ms <= LIMITS.maxTimeMs;
}

/** @param {unknown} r @returns {r is ({ v: 1, ok: true, ms: number } | { v: 1, ok: false, code: string })} */
export function isSeekReply(r) {
  return isPlainObject(r) && r.v === MESSAGE_VERSION && (r.ok === true ? Number.isInteger(r.ms) : r.ok === false && typeof r.code === 'string');
}

/**
 * رسالة الحفظ من سكربت المحتوى إلى العامل: الاسم والنص وحدهما (لا نوع ولا مسار ولا وضع).
 * @param {{ name: string, text: string }} file
 */
export const saveRequest = (file) => ({ type: MSG.saveFile, v: MESSAGE_VERSION, file: { name: file.name, text: file.text } });

/** @param {unknown} req */
export function isSaveRequest(req) {
  return isTyped(req, MSG.saveFile) && Object.keys(req).length === 3 && isPlainObject(req.file)
    && Object.keys(req.file).length === 2 && typeof req.file.name === 'string' && typeof req.file.text === 'string';
}

/** @param {unknown} r */
export function isSaveReply(r) {
  if (!isPlainObject(r) || r.v !== MESSAGE_VERSION) return false;
  if (r.ok === true) return SAVE_REPLY_MODES.includes(r.mode) && Number.isInteger(r.downloadId) && r.downloadId >= 0;
  return r.ok === false && typeof r.code === 'string' && /^SV_[A-Z_]+$/.test(r.code);
}
