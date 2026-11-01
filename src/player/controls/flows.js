// تدفقا الشريط فوق وحدات W3 (عقد interfaces §٥ و§٦) دون منطق تصدير أو استيراد هنا:
// التحميل: controller.convertCaptured ← buildExport ← download لكل ملف ← controller.recordExport (البصمة).
// الرفع: readImport (فحص ومقارنة) ← controller.loadArabic (بتأكيد الاستبدال إن وُجدت ترجمة).
// كل تدفق يثبّت معرّف الفيديو عند بدئه، فنتيجة تأخرت حتى تبدّل الفيديو لا تُطبَّق على الجديد أبدًا.
import { messageFor, toErrorInfo } from '../../core/errors/index.js';

const infoOf = (code, params) => ({ code, message: messageFor(code, params) });

/**
 * مدخل البناء لمسار ملتقط بوضعه: المقاطع كما يعطيها المتحكم (لا إزاحة فيها أبدًا).
 * @param {import('../../content/controller.js').Controller} controller
 * @param {{ key: string, mode: 'normal' | 'long', split: { size: number } | null, now: number }} p
 */
function buildFor(controller, exportFlow, { key, mode, split, now }) {
  const s = controller.getState();
  const conv = controller.convertCaptured(key, { mode });
  if (!conv.ok) return { ok: false, error: infoOf(conv.code ?? 'EX_NO_TRACK') };
  try {
    const built = exportFlow.buildExport({
      videoId: s.videoId, title: s.title,
      track: { key, lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings },
      mode, split, now,
    });
    return { ok: true, built, videoId: s.videoId };
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
}

/**
 * تنزيل SRT الإنجليزي ثم حفظ بصمته. التنزيل يسبق الحفظ: إخفاق الحفظ لا يُسقط ملفًا نُزّل، ويُذكر وحده.
 * @returns {Promise<
 *   { ok: false, error: { code: string, message: string } }
 *   | { ok: true, names: string[], warnings: string[], saved: boolean, saveError: { code: string, message: string } | null }>}
 */
export async function runDownload({ controller, exportFlow, doc, key, mode, split, now }) {
  const r = buildFor(controller, exportFlow, { key, mode, split, now });
  if (!r.ok) return r;
  try {
    for (const file of r.built.files) exportFlow.download(file, { doc });
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
  const names = r.built.files.map((f) => f.name);
  const warnings = r.built.warnings;
  if (controller.getState().videoId !== r.videoId) {
    return { ok: true, names, warnings, saved: false, saveError: infoOf('CT_VIDEO_CHANGED') };
  }
  try {
    await controller.recordExport({ trackKey: key, fingerprint: r.built.fingerprint });
    return { ok: true, names, warnings, saved: true, saveError: null };
  } catch (err) {
    return { ok: true, names, warnings, saved: false, saveError: toErrorInfo(err) };
  }
}

/**
 * تعليمات الترجمة كما يعيدها buildExport للمسار والوضع المختارين (القالب الموحّد تبنيه P7). لا تُعرض أبدًا.
 * @returns {{ ok: true, text: string } | { ok: false, error: { code: string, message: string } }}
 */
export function instructionsFor({ controller, exportFlow, key, mode, split, now }) {
  const r = buildFor(controller, exportFlow, { key, mode, split, now });
  return r.ok ? { ok: true, text: r.built.instructions } : r;
}

/**
 * نسخ نص إلى الحافظة: واجهة الحافظة أولًا، ثم نسخ من حقل مؤقت غير ظاهر داخل الجذر المغلق. لا يُعرض النص.
 * @param {string} text
 * @param {{ doc: Document, win: Window, root: ShadowRoot | Element }} env
 * @returns {Promise<boolean>}
 */
export async function copyText(text, { doc, win, root }) {
  try {
    const clip = win.navigator?.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      await clip.writeText(text);
      return true;
    }
  } catch {
    // يسقط إلى البديل
  }
  let ta = null;
  const prev = root.activeElement ?? null;
  try {
    ta = doc.createElement('textarea');
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.setProperty('position', 'fixed');
    ta.style.setProperty('opacity', '0');
    ta.style.setProperty('pointer-events', 'none');
    ta.value = text;
    root.appendChild(ta);
    ta.select();
    return doc.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    if (ta) {
      ta.value = '';
      ta.remove();
      // التحديد نقل التركيز إلى الحقل المؤقت: يعود إلى حيث كان (بند القائمة) فلا يضيع موضع لوحة المفاتيح.
      if (prev && prev.isConnected) prev.focus();
    }
  }
}

/**
 * قراءة ملف أو أجزاء وفحصها ومقارنتها بالبصمات المحفوظة لهذا الفيديو. لا كتابة في التخزين هنا.
 * @returns {Promise<
 *   { ok: true, videoId: string, input: { fileName: string, cues: object[], comparison: object | null, fingerprintId: string | null, notes: string[] }, warnings: string[] }
 *   | { ok: false, error: { code: string, message: string } }>}
 */
export async function readFor({ controller, importFlow, files }) {
  const s = controller.getState();
  const videoId = s.videoId;
  let res;
  try {
    res = await importFlow.readImport(files, { fingerprints: s.saved?.fingerprints ?? [], settings: s.settings });
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
  if (controller.getState().videoId !== videoId) return { ok: false, error: infoOf('CT_VIDEO_CHANGED') };
  if (!res.ok) return { ok: false, error: { code: res.error.code, message: res.error.message } };
  const { fileName, cues, comparison, fingerprintId, notes } = res;
  return {
    ok: true,
    videoId,
    input: { fileName, cues, comparison, fingerprintId, notes },
    warnings: (res.warnings ?? []).map((w) => messageFor(w.code, w.params)),
  };
}

/**
 * تحميل نتيجة القراءة في المتحكم للفيديو نفسه الذي قُرئت له وحده.
 * @returns {Promise<{ ok: true } | { ok: false, error: { code: string, message: string } }>}
 */
export async function loadFor({ controller, read, replace }) {
  if (controller.getState().videoId !== read.videoId) return { ok: false, error: infoOf('CT_VIDEO_CHANGED') };
  try {
    await controller.loadArabic(read.input, { replace });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
}
