// خدمة الحفظ في العامل الخلفي (عقد interfaces §١٣ وmessages §٧): للحفظ وحده. تقبل tj:save-file من سكربت ترجمان على
// يوتيوب أو من صفحة في الإضافة وحدهما، وتقرأ مكان الحفظ من التفضيلات لا من الرسالة، وتتحقق من الاسم والامتداد والحجم،
// ثم تنزّل النص بواجهة التنزيلات من رابط blob: حيث للخلفية URL.createObjectURL، وإلا من رابط data:، وتسجّل معرّف الملف.
// ومع رابط blob: تبقي صفحة الحدث حية ما دام التنزيل قد يقرؤه (تحقق Gemini، B4). لا منطق آخر.
import { isExtensionPage, isOwnContentScript, isSaveRequest, MESSAGE_VERSION } from '../core/model/messages.js';
import { PENDING_REVOKE_MS, SAVE_LIMITS, downloadTarget, keepsUrl, startDownload, validateSaveFile } from '../core/save/index.js';

/**
 * نص UTF-8 في رابط data: بترميز base64، على دفعات (String.fromCharCode لا يقبل مصفوفة ضخمة).
 * @param {string} text @param {string} mime
 */
export function dataUrl(text, mime) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

/**
 * رابط النص للتنزيل: blob: حيث للخلفية URL.createObjectURL (صفحة الخلفية في Firefox، الذي يرفض روابط data: في
 * downloads.download، جولة النشر T3)، وإلا data: (عامل الخدمة في Chromium بلا URL.createObjectURL). والشيفرة واحدة في الهدفين.
 * @param {string} text @param {string} mime @param {typeof globalThis} env
 * @returns {{ url: string, release: (pending: boolean) => void }}
 */
export function fileUrl(text, mime, env = globalThis) {
  if (typeof env.URL?.createObjectURL === 'function' && typeof env.Blob === 'function') {
    const url = env.URL.createObjectURL(new env.Blob([text], { type: mime }));
    // يبقى الرابط ما دام حوار الحفظ مفتوحًا (pending)، ثم يُلغى كما في صفحات الإضافة.
    return { url, release: (pending) => (pending ? env.setTimeout(() => env.URL.revokeObjectURL(url), PENDING_REVOKE_MS) : env.URL.revokeObjectURL(url)) };
  }
  return { url: dataUrl(text, mime), release: () => {} };
}

/**
 * إبقاء صفحة الحدث حية ما دام رابط blob: قد يُقرأ (تحقق Gemini، B4). صفحة الخلفية في Firefox تنام بعد نحو 30 ث بلا نشاط
 * فيتلف رابطها (قيس في Firefox 160: NetworkError عند 45 ث)، ومؤقتها لا يمنع ذلك، أما استدعاء واجهة الإضافة فيجدد مهلتها
 * (قيس: استطلاع downloads.search أبقاها حية). فيبدأ مع الرابط قبل downloads.download، لأن حوار «حفظ باسم» قد يُعرض قبل أن
 * يُنشأ التنزيل، ويستمر بعد مهلة انتظار النتيجة ما دام التنزيل «جاريًا»، ويتوقف بحسمه أو غياب عنصره أو بالسقف (نحو عشر
 * دقائق). الفاصل ثلث مهلة الخمول، فتأخّر دورة لا يُنيمها. والاستعلام بالمعرّف وحده، وقبل صدوره بمعرّف سالب لا يكون
 * لتنزيل، فلا يُقرأ شيء من تنزيلات المستخدم. وإلغاء الرابط كما كان (release). وقائي: الحوار المفتوح طويلًا لم يُختبر.
 */
export const KEEP_ALIVE = Object.freeze({ everyMs: 10 * 1000, capMs: PENDING_REVOKE_MS });
const NO_DOWNLOAD = -1;

/**
 * @param {{ search: (q: { id: number }) => Promise<object[]> }} downloads
 * @param {{ setTimeout: Function, clearTimeout: Function }} env
 * @param {{ everyMs: number, capMs: number }} [opts]
 * @returns {{ follow: (downloadId: number | null) => void }} follow عند انتهاء startDownload: معرّف تنزيل ربما ما زال يقرأ
 *   الرابط (pending أو unsettled) فيُتابَع حتى يُحسم، أو null فيتوقف الآن. ولكل حفظ إبقاؤه، فلا يوقف أحدهما الآخر.
 */
export function keepAlive(downloads, env, { everyMs, capMs } = KEEP_ALIVE) {
  let id = NO_DOWNLOAD;
  let waited = 0;
  let timer = null;
  let live = true;
  const stop = () => {
    live = false;
    if (timer !== null) env.clearTimeout(timer);
    timer = null;
  };
  const tick = async () => {
    timer = null;
    waited += everyMs;
    const asked = id;
    let items = null;
    try {
      items = await downloads.search({ id: asked });
    } catch {
      // الاستدعاء نفسه ما يجدد المهلة، وتعذّره لا يحسم شيئًا: يستمر حتى السقف.
    }
    if (!live) return;
    // حُسم التنزيل (اكتمل أو انقطع، ومنه الإلغاء) أو غاب عنصره: لا شيء يقرأ الرابط بعد.
    const settled = asked !== NO_DOWNLOAD && Array.isArray(items) && items[0]?.state !== 'in_progress';
    if (settled || waited >= capMs) stop();
    else timer = env.setTimeout(tick, everyMs);
  };
  timer = env.setTimeout(tick, everyMs);
  return {
    follow(downloadId) {
      if (live && Number.isInteger(downloadId)) id = downloadId;
      else stop();
    },
  };
}

/**
 * @param {{
 *   runtime: typeof chrome.runtime,
 *   downloads: { download: Function, search: Function },
 *   store: { getPrefs: () => Promise<{ saveLocation: object }>, setLastSave: (id: number) => Promise<void> },
 *   settle?: object, env?: typeof globalThis
 * }} deps env: ما فيه URL وBlob وsetTimeout (الخلفية نفسها افتراضيًا؛ والاختبار يمرّر بديلًا)
 * @returns {{ handle: (req: unknown, sender: object) => Promise<object> | null, install: () => () => void }}
 */
export function createSaveService({ runtime, downloads, store, settle, env = globalThis }) {
  /** يعيد وعد الرد، أو null لرسالة لا تخصه (فلا رد). */
  function handle(req, sender) {
    if (!(isOwnContentScript(sender, runtime) || isExtensionPage(sender, runtime)) || !isSaveRequest(req)) return null;
    return (async () => {
      const v = validateSaveFile(req.file, { maxChars: SAVE_LIMITS.maxMessageChars });
      if (!v.ok) return { v: MESSAGE_VERSION, ok: false, code: v.code };
      let prefs;
      try {
        prefs = await store.getPrefs();
      } catch {
        return { v: MESSAGE_VERSION, ok: false, code: 'SV_FAILED' };
      }
      const link = fileUrl(req.file.text, v.mime, env);
      // رابط blob: يتلف بنوم صفحة الحدث (Firefox)؛ أما data: (عامل Chromium) فالنص في الرابط نفسه، فلا إبقاء ولا تغيير هناك.
      const alive = link.url.startsWith('blob:') ? keepAlive(downloads, env) : null;
      let r;
      try {
        r = await startDownload(downloads, { url: link.url, ...downloadTarget(prefs.saveLocation, req.file.name) }, settle);
      } finally {
        alive?.follow(keepsUrl(r) ? r.downloadId : null);
        link.release(keepsUrl(r));
      }
      if (!r.ok) return { v: MESSAGE_VERSION, ok: false, code: r.code };
      await store.setLastSave(r.downloadId).catch(() => {});
      return { v: MESSAGE_VERSION, ok: true, mode: prefs.saveLocation.mode, downloadId: r.downloadId, ...(r.state === 'pending' ? { pending: true } : {}) };
    })().catch(() => ({ v: MESSAGE_VERSION, ok: false, code: 'SV_FAILED' }));
  }

  return {
    handle,
    install() {
      const listener = (req, sender, sendResponse) => {
        const p = handle(req, sender);
        if (!p) return undefined;
        p.then(sendResponse);
        return true; // الرد غير متزامن
      };
      runtime.onMessage.addListener(listener);
      return () => runtime.onMessage.removeListener(listener);
    },
  };
}
