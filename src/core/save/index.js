// مكان حفظ الملفات (عقد interfaces §١٣، R65). saveFile واحدة لكل البيئات: صفحات الإضافة تحفظ مباشرة بواجهة التنزيلات،
// وسكربت المحتوى (لا يصل إليها) يرسل الملف إلى العامل الخلفي، وعند التعذّر يرجع إلى التنزيل الحالي عبر Blob. الوضع من
// التفضيلات وحدها لا من المستدعي. الإذن محصور في ملفات ترجمان: download وsearch({ id }) لما نزّلته الإضافة نفسها، ولا
// شيء غيرهما (فحص ثابت). لا يُخزَّن مسار؛ والمكان الفعلي يُقرأ من سجل المتصفح لذلك الملف وحده بعد اكتماله ووجوده.
import { download as blobDownload } from '../export/download.js';
import { isSaveReply, saveRequest } from '../model/messages.js';
import { DEFAULT_PREFS, normalizePrefs } from '../model/prefs.js';
import { utf8Length } from '../model/validate.js';
import { createStore } from '../store/index.js';

// حد صفحات الإضافة بالبايت الفعلي، وهو حد قراءة النسخة الاحتياطية نفسه (BACKUP_LIMITS.maxBytes): ما يُنشأ ويُحفظ من هنا
// يُقرأ (تدقيق 7a66f91، U55، قرار Q28؛ كان 256 مليون وحدة UTF-16، فتُحفظ نسخة CJK فوق 512 م.ب ثم تُرفض). وقناة سكربت
// المحتوى بوحدات الرسالة كما هي.
export const SAVE_LIMITS = Object.freeze({ maxNameChars: 150, maxPageBytes: 512 * 1024 * 1024, maxMessageChars: 16 * 1024 * 1024 });
/** النوع من الامتداد وحده، لا من المستدعي. */
export const SAVE_TYPES = Object.freeze({
  srt: 'application/x-subrip;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  json: 'application/json;charset=utf-8',
});
/** انتظار انتهاء التنزيل (حوار الحفظ قد ينتظر المستخدم) قبل الرد بنتيجته. */
export const SETTLE = Object.freeze({ pollMs: 400, timeoutMs: 120000 });
export const PENDING_REVOKE_MS = 10 * 60 * 1000;

// حروف (ومنها العربية) وأرقام وعلامات التشكيل و. _ - ( ) والمسافة؛ يبدأ بحرف أو رقم أو _ أو - (معرّف يوتيوب قد يبدأ
// بهما، وأسماء ترجمان تبدأ به: تدقيق 5fedcb9، CX-005)، ولا يبدأ بنقطة ولا مسافة، ولا فواصل مسار ولا محارف تحكم.
const NAME_RE = /^[\p{L}\p{N}_-][\p{L}\p{M}\p{N} ._()-]*$/u;

/**
 * @typedef {{ name: string, text: string, mime?: string }} SaveFile
 * @typedef {{ ok: true, mode: 'downloads' | 'subfolder' | 'ask' | 'blob', downloadId: number | null, pending?: true } | { ok: false, code: string }} SaveResult
 *   pending: بدأ التنزيل وما زال بعد مهلة الانتظار «جارٍ» (حوار الحفظ مفتوح غالبًا)، فلا يُقال «حُفظ» بعد.
 *   SV_UNSETTLED: بدأ التنزيل (صدر معرّفه) وتعذّر معرفة نتيجته؛ فلا بديل Blob أبدًا كي لا يتكرر الملف (تدقيق 7a66f91، U34).
 */

/**
 * @param {unknown} file
 * @param {{ maxChars?: number, maxBytes?: number }} [opts] حد بوحدات النص (قناة الرسائل) أو بالبايت (صفحات الإضافة)
 * @returns {{ ok: true, ext: keyof typeof SAVE_TYPES, mime: string } | { ok: false, code: 'SV_BAD_FILE' | 'SV_TOO_LARGE' }}
 */
export function validateSaveFile(file, { maxChars = Infinity, maxBytes = SAVE_LIMITS.maxPageBytes } = {}) {
  if (!file || typeof file !== 'object' || typeof file.name !== 'string' || typeof file.text !== 'string') return { ok: false, code: 'SV_BAD_FILE' };
  const { name, text } = file;
  const ext = /\.([a-z]+)$/.exec(name)?.[1];
  if (name.length > SAVE_LIMITS.maxNameChars || !NAME_RE.test(name) || name.includes('..') || !ext || !Object.hasOwn(SAVE_TYPES, ext) || /[ .]\.[a-z]+$/.test(name)) {
    return { ok: false, code: 'SV_BAD_FILE' };
  }
  if (text.length > maxChars || text.length > maxBytes || (text.length * 3 > maxBytes && utf8Length(text) > maxBytes)) return { ok: false, code: 'SV_TOO_LARGE' };
  return { ok: true, ext: /** @type {keyof typeof SAVE_TYPES} */ (ext), mime: SAVE_TYPES[ext] };
}

/**
 * خيارات downloads.download لوضع الحفظ. الافتراضي بلا saveAs: يتبع إعداد المتصفح في السؤال كالتنزيل الحالي.
 * @param {unknown} saveLocation من التفضيلات (يُقرأ متسامحًا: التالف يعود إلى الافتراضي)
 * @param {string} name
 * @returns {{ filename: string, saveAs?: boolean }}
 */
export function downloadTarget(saveLocation, name) {
  const loc = normalizePrefs({ ...DEFAULT_PREFS, saveLocation }).saveLocation;
  if (loc.mode === 'subfolder') return { filename: `${loc.folder}/${name}`, saveAs: false };
  if (loc.mode === 'ask') return { filename: name, saveAs: true };
  return { filename: name };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ينتظر حتى يخرج تنزيل نزّلته الإضافة من «جارٍ»، بالاستعلام بمعرّفه وحده. غياب عنصره بعد صدور معرّفه لا يعني فشله
 * (قد يكون اكتمل ثم مُحي من السجل)، فهو «unsettled» لا «failed» (تدقيق 7a66f91، U34).
 * @param {{ search: (q: { id: number }) => Promise<object[]> }} downloads
 * @param {number} id
 * @returns {Promise<'complete' | 'cancelled' | 'failed' | 'pending' | 'unsettled'>}
 */
export async function settleDownload(downloads, id, { pollMs = SETTLE.pollMs, timeoutMs = SETTLE.timeoutMs, wait = sleep } = {}) {
  for (let waited = 0; waited <= timeoutMs; waited += pollMs) {
    const [item] = await downloads.search({ id });
    if (!item) return 'unsettled';
    if (item.state === 'complete') return 'complete';
    if (item.state === 'interrupted') return item.error === 'USER_CANCELED' ? 'cancelled' : 'failed';
    await wait(pollMs);
  }
  return 'pending';
}

/**
 * المكان الفعلي لملف نزّله ترجمان: من سجل المتصفح لذلك الملف وحده، إن اكتمل ووُجد ونزّلته هذه الإضافة؛ وإلا null. لا يُخزَّن.
 * المعرّف وحده لا يكفي (تدقيق 7a66f91، U04): Firefox يعيد ترقيم السجل كل جلسة، فقد يصير الرقم المحفوظ لتنزيل آخر لا علاقة
 * له بترجمان. فيُشترط byExtensionId مطابقًا لمعرّف الإضافة، ويغيب السطر إن غاب (Firefox يفقده بعد إعادة التشغيل).
 * @param {number} downloadId
 * @param {{ downloads?: { search: (q: { id: number }) => Promise<object[]> }, extensionId?: string | null }} [deps]
 * @returns {Promise<string | null>}
 */
export async function savedPath(downloadId, { downloads = globalThis.chrome?.downloads, extensionId = globalThis.chrome?.runtime?.id ?? null } = {}) {
  if (!Number.isInteger(downloadId) || downloadId < 0 || !downloads || typeof extensionId !== 'string' || !extensionId) return null;
  try {
    const [item] = await downloads.search({ id: downloadId });
    if (!item || item.byExtensionId !== extensionId) return null;
    return item.state === 'complete' && item.exists === true && typeof item.filename === 'string' && item.filename ? item.filename : null;
  } catch {
    return null;
  }
}

/**
 * تنزيل بواجهة التنزيلات ثم انتظار نتيجته. يُستعمل في الصفحات (رابط Blob) وفي العامل (رابط data:). متى صدر المعرّف فلا
 * يُعاد SV_FAILED (الذي يرجع إلى Blob) إلا بفشل يعلنه المتصفح نفسه؛ وتعذّر الاستعلام أو غياب العنصر SV_UNSETTLED، ولا
 * يهرب استثناء (تدقيق 7a66f91، U34).
 * @param {{ download: Function, search: Function }} downloads
 * @param {{ url: string, filename: string, saveAs?: boolean }} options
 * @returns {Promise<{ ok: true, downloadId: number, state: string } | { ok: false, code: 'SV_CANCELLED' | 'SV_FAILED' | 'SV_UNSETTLED', downloadId: number | null, state?: string }>}
 */
export async function startDownload(downloads, options, settleOpts) {
  let id;
  try {
    id = await downloads.download({ ...options, conflictAction: 'uniquify' });
  } catch (err) {
    return { ok: false, code: /cancel/i.test(String(err?.message ?? err)) ? 'SV_CANCELLED' : 'SV_FAILED', downloadId: null };
  }
  if (!Number.isInteger(id)) return { ok: false, code: 'SV_FAILED', downloadId: null };
  let state;
  try {
    state = await settleDownload(downloads, id, settleOpts);
  } catch {
    state = 'unsettled';
  }
  if (state === 'cancelled') return { ok: false, code: 'SV_CANCELLED', downloadId: id };
  if (state === 'failed') return { ok: false, code: 'SV_FAILED', downloadId: id };
  if (state === 'unsettled') return { ok: false, code: 'SV_UNSETTLED', downloadId: id, state };
  return { ok: true, downloadId: id, state };
}

/** التنزيل ربما ما زال يقرأ الرابط (حوار الحفظ مفتوح، أو نتيجته غير محسومة)، فلا يُلغى فورًا. @param {{ state?: string } | undefined} r */
export const keepsUrl = (r) => r?.state === 'pending' || r?.state === 'unsettled';

// القناة لم توصل الرسالة أصلًا: لا مستقبل، أو سياق الإضافة لم يعد صالحًا. غيرهما بعد الإرسال قد يكون والعامل بدأ التنزيل.
const NOT_DELIVERED = /Could not establish connection|Receiving end does not exist|Extension context invalidated/i;

function blobFallback(file, { fallback, doc }) {
  try {
    fallback(file, { doc });
    return { ok: true, mode: 'blob', downloadId: null };
  } catch {
    return { ok: false, code: 'SV_FAILED' };
  }
}

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

/**
 * يحفظ ملفًا نصيًا في المكان المختار في الإعدادات (عقد interfaces §١٣).
 * @param {SaveFile} file
 * @param {{
 *   api?: typeof chrome, store?: { getPrefs: () => Promise<object>, setLastSave: (id: number) => Promise<void> } | null,
 *   doc?: Document, fallback?: typeof blobDownload, settle?: object, replyTimeoutMs?: number
 * }} [deps]
 * @returns {Promise<SaveResult>}
 */
export async function saveFile(file, { api = globalThis.chrome, store = null, doc = globalThis.document, fallback = blobDownload, settle, replyTimeoutMs = SETTLE.timeoutMs + 10000 } = {}) {
  const downloads = api?.downloads;
  // صفحة إضافة: واجهة التنزيلات مباشرة، والوضع من التفضيلات في التخزين.
  if (downloads && typeof downloads.download === 'function') {
    const v = validateSaveFile(file, { maxBytes: SAVE_LIMITS.maxPageBytes });
    if (!v.ok) return { ok: false, code: v.code };
    const s = store ?? createStore();
    let prefs;
    try {
      prefs = await s.getPrefs();
    } catch {
      return blobFallback(file, { fallback, doc });
    }
    const win = doc?.defaultView ?? globalThis;
    const url = win.URL.createObjectURL(new win.Blob([file.text], { type: v.mime }));
    let r;
    try {
      r = await startDownload(downloads, { url, ...downloadTarget(prefs.saveLocation, file.name) }, settle);
    } finally {
      // الرابط يبقى ما دام التنزيل ربما يقرؤه (حوار مفتوح أو نتيجة غير محسومة)، ثم يُلغى.
      if (keepsUrl(r)) win.setTimeout(() => win.URL.revokeObjectURL(url), PENDING_REVOKE_MS);
      else win.URL.revokeObjectURL(url);
    }
    if (r.ok) {
      await s.setLastSave(r.downloadId).catch(() => {});
      return { ok: true, mode: prefs.saveLocation.mode, downloadId: r.downloadId, ...(r.state === 'pending' ? { pending: true } : {}) };
    }
    if (r.code === 'SV_CANCELLED' || r.code === 'SV_UNSETTLED') return { ok: false, code: r.code };
    return blobFallback(file, { fallback, doc });
  }
  // سكربت المحتوى: إلى العامل الخلفي، وما يتجاوز حد القناة أو لا يُرد عليه يرجع إلى Blob.
  if (api?.runtime && typeof api.runtime.sendMessage === 'function') {
    const v = validateSaveFile(file, { maxChars: Number.MAX_SAFE_INTEGER });
    if (!v.ok) return { ok: false, code: v.code };
    if (file.text.length > SAVE_LIMITS.maxMessageChars) return blobFallback(file, { fallback, doc });
    let sending;
    try {
      sending = Promise.resolve(api.runtime.sendMessage(saveRequest(file)));
    } catch {
      // رمي متزامن: لم تُرسل الرسالة أصلًا (سياق الإضافة لم يعد صالحًا)، فالرجوع إلى Blob لا يكرر شيئًا.
      return blobFallback(file, { fallback, doc });
    }
    let reply;
    try {
      reply = await withTimeout(sending, replyTimeoutMs);
    } catch (err) {
      // وصلت الرسالة ولم يصل ردها (انقضت المهلة، أو انغلقت القناة بعد الإرسال كتوقف العامل أثناء حوار الحفظ): قد يكون
      // العامل بدأ التنزيل، فلا يُنزَّل بديل Blob يكرر الملف (تدقيق 5fedcb9، CX-H6؛ وتدقيق 7a66f91، U34). وما لم يصل
      // أصلًا (لا مستقبل) يرجع إلى Blob كما كان.
      if (err?.message === 'timeout' || !NOT_DELIVERED.test(String(err?.message ?? err))) return { ok: false, code: 'SV_NO_REPLY' };
      reply = null;
    }
    if (isSaveReply(reply)) {
      if (reply.ok) return { ok: true, mode: reply.mode, downloadId: reply.downloadId, ...(reply.pending === true ? { pending: true } : {}) };
      if (reply.code !== 'SV_FAILED') return { ok: false, code: reply.code };
    }
    return blobFallback(file, { fallback, doc });
  }
  return blobFallback(file, { fallback, doc });
}
