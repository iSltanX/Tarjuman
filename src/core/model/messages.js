// رسائل الإضافة الداخلية (عقد docs/contracts/messages.md). الصفحات لا تراسل المشغّل إلا بطلبات محددة (الحالة،
// والتشخيص، والقفز إلى زمن)، وتُعرف بمصدرها لا بمحتواها: لا يُقبل طلب إلا من صفحة في الإضافة نفسها. وسكربت المحتوى
// لا يراسل إلا العامل الخلفي برسالة الحفظ (§٧). كلها بالإصدار v: 1، ورد الحالة موسّع بحقول تتجاهلها النافذة القديمة.
import { trackComparison } from '../compare/current.js';
import { DISPLAY_MODES } from './video.js';
import { isVideoId, parseTrackKey } from './ids.js';
import { LIMITS, isPlainObject } from './validate.js';

export const MESSAGE_VERSION = 1;
export const MSG = Object.freeze({
  getVideoState: 'tj:get-video-state',
  getVideoId: 'tj:get-video-id',
  getPageDiagnostics: 'tj:get-page-diagnostics',
  seek: 'tj:seek',
  saveFile: 'tj:save-file',
  store: 'tj:store',
});
export const SAVE_REPLY_MODES = Object.freeze(['downloads', 'subfolder', 'ask']);

/**
 * @typedef {{ n: 1 | 2 | 3, filled: boolean, active: boolean, name: string | null }} SlotSummary
 * @typedef {{
 *   v: 1, ok: true, watch: boolean, videoId: string | null, title: string | null, loading: boolean,
 *   english: { captured: { key: string, kind: 'manual' | 'asr', cueCount: number, ok: boolean }[], saved: { key: string, kind: 'manual' | 'asr', cueCount: number }[] },
 *   arabic: null | { fileName: string, cueCount: number, edited: boolean, matched: boolean | null, lang?: string | null },
 *   view: { displayOffsetMs: number, displayMode: 'ar' | 'dual' | 'off' },
 *   mounted: { overlay: string, controls: string },
 *   slots?: SlotSummary[],
 *   capture?: { state: 'captured' | 'rejected' | 'none', count: number, code: string | null },
 *   tools?: { overlay: string, controls: string, code: string | null },
 *   source?: SourceRef | null, lastExport?: LastExport | null, available?: { lang: string, kind: 'manual' | 'asr', name: string | null }[] | null
 * }} VideoStateReply
 * source (AA3، ق٥): مسار الفيديو الذي تُعبّأ منه «من» في النافذة بلغته كما أرسلها يوتيوب: آخر ما نُزّل منه إن بقي ملتقطًا أو
 * محفوظًا، وإلا ما تختاره قائمة التحميل افتراضيًا (الملتقط ثم المحفوظ). lastExport: آخر تنزيل لهذا الفيديو بأجزائه إن قُسّم، لفقرة
 * الأجزاء في التعليمات المنسوخة من النافذة. available: مسارات الفيديو كما في بيانات المشغّل (لغة ونوع واسم، بلا رابط).
 * @typedef {{ key: string, lang: string, kind: 'manual' | 'asr', via: string | null, from: 'export' | 'captured' | 'saved' }} SourceRef
 * @typedef {{ key: string, lang: string, via: string | null, parts: { index: number, from: number, to: number }[] | null }} LastExport
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

/**
 * معرّف الفيديو المعروض وحده (§٥، تدقيق 7a66f91، U102): القفز من صفحات الإضافة يسأل كل تبويب عن معرّفه، فلا يُنقل عنوان
 * الفيديو ولا اسم ملفه ولا أسماء خاناته من كل تبويب يوتيوب مفتوح كما في رد الحالة الكامل.
 * @returns {{ type: string, v: 1 }}
 */
export const videoIdRequest = () => ({ type: MSG.getVideoId, v: MESSAGE_VERSION });
/** @param {unknown} req */
export const isVideoIdRequest = (req) => isTyped(req, MSG.getVideoId) && Object.keys(req).length === 2;
/** @param {unknown} r @returns {r is { v: 1, ok: true, videoId: string | null }} */
export const isVideoIdReply = (r) => isPlainObject(r) && r.v === MESSAGE_VERSION && r.ok === true && (r.videoId === null || isVideoId(r.videoId));

const SLOT_NUMBERS = [1, 2, 3];

/** ملخص الخانات من حالة المتحكم، أو من السجل وحده لحالة لا تحمل slots. */
function slotSummaries(s) {
  if (Array.isArray(s.slots) && s.slots.length === 3) return s.slots.map((x) => ({ n: x.n, filled: !!x.filled, active: !!x.active, name: x.name ?? null }));
  const has = !!s.saved?.arabic;
  return SLOT_NUMBERS.map((n) => ({ n, filled: has && n === 1, active: has && n === 1, name: null }));
}

/** البصمات من الأحدث؛ وعند تساوي الوقت الأحدث موضعًا (إعادة التنزيل تنقل البصمة إلى آخر القائمة، U-024). @param {{ createdAt: string }[]} prints */
const newestFirst = (prints) => prints.map((p, i) => ({ p, i }))
  .sort((a, b) => (a.p.createdAt < b.p.createdAt ? 1 : a.p.createdAt > b.p.createdAt ? -1 : b.i - a.i)).map((x) => x.p);

/**
 * مسار «من» (ق٥): آخر ما نُزّل إن بقي مساره في الزيارة أو المحفوظ، وإلا مسار المتحكم المختار (الملتقط ثم المحفوظ)، وإلا null.
 * @param {import('../../content/controller.js').ControllerState} s
 * @returns {SourceRef | null}
 */
export function sourceRef(s) {
  const present = new Set([...s.captured.filter((t) => t.ok && t.cueCount > 0).map((t) => t.key), ...(s.saved?.english ?? []).map((t) => t.key)]);
  for (const f of newestFirst(s.saved?.fingerprints ?? [])) {
    const t = present.has(f.trackKey) ? parseTrackKey(f.trackKey) : null;
    if (t) return { key: f.trackKey, lang: t.lang, kind: t.kind, via: t.via, from: 'export' };
  }
  const e = s.english;
  return e ? { key: e.key, lang: e.lang, kind: e.kind, via: e.via ?? null, from: e.source === 'saved' ? 'saved' : 'captured' } : null;
}

/** آخر تنزيل بأجزائه، أو null. @param {import('../../content/controller.js').ControllerState} s @returns {LastExport | null} */
export function lastExportOf(s) {
  const f = newestFirst(s.saved?.fingerprints ?? [])[0];
  const t = f ? parseTrackKey(f.trackKey) : null;
  return t ? { key: f.trackKey, lang: t.lang, via: t.via, parts: Array.isArray(f.parts) ? f.parts.map(({ index, from, to }) => ({ index, from, to })) : null } : null;
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
      matched: (() => {
        // للنسخة المعروضة الآن (GM-013): لا «تختلف عن الأصل» بعد استكمالها.
        const c = trackComparison(a, s.saved.fingerprints);
        return c && c.fingerprintId ? c.matched : null;
      })(),
      // لغة الترجمة (AA1)، وnull «غير محددة».
      lang: a.lang ?? null,
    } : null,
    view: { ...s.view },
    mounted: { overlay: String(mounted.overlay), controls: String(mounted.controls) },
    slots: slotSummaries(s),
    capture: { state: okTracks.length ? 'captured' : issue ? 'rejected' : 'none', count: okTracks.length, code: okTracks.length ? null : issue },
    tools: { overlay: String(mounted.overlay), controls: String(mounted.controls), code: mounted.code ?? null },
    source: isVideoId(s.videoId) ? sourceRef(s) : null,
    lastExport: isVideoId(s.videoId) ? lastExportOf(s) : null,
    available: Array.isArray(s.available?.tracks) ? s.available.tracks.map((t) => ({ lang: t.lang, kind: t.kind, name: t.name ?? null })) : null,
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

// ---- الكاتب الواحد (عقد messages §٨، storage §١٢؛ تدقيق 7a66f91، C2) ----

/** عمليات الكتابة التي يقبلها الكاتب في العامل الخلفي، ولا غيرها. */
export const STORE_OPS = Object.freeze(['ready', 'put', 'delete', 'orphan', 'index', 'settings', 'prefs', 'langPrefs', 'saves', 'clear', 'uiLocale', 'uiLocaleInit']);

/**
 * طلب كتابة: العملية ومعاملاتها بيانات لا شيفرة، ومعرّف عشوائي يجعل إعادة الإرسال بعد خطأ قناة لا تطبّق الكتابة مرتين.
 * @param {string} op @param {Record<string, unknown>} args @param {string} wid
 */
export const storeRequest = (op, args, wid) => ({ ...args, type: MSG.store, v: MESSAGE_VERSION, wid, op });

/** @param {unknown} req */
export const isStoreRequest = (req) => isTyped(req, MSG.store) && typeof req.wid === 'string' && req.wid.length >= 8 && req.wid.length <= 64
  && STORE_OPS.includes(req.op);

/** @param {unknown} r رد الكاتب: { v, ok: true, value? } أو { v, ok: false, code, detail? } */
export const isStoreReply = (r) => isPlainObject(r) && r.v === MESSAGE_VERSION && (r.ok === true || (r.ok === false && typeof r.code === 'string'));
