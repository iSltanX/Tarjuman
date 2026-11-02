// تدفقا الشريط فوق وحدات W3 وW6 (عقد interfaces §٥ و§٦ و§١٣) دون منطق تصدير أو استيراد هنا:
// التحميل: controller.convertCaptured ← buildExport (والتقسيم عند الجمل أو الصمت) ← تعليمات الترجمة بالقاموس إن أُرفق ←
// saveFile لكل ملف (مكان الحفظ من الإعدادات) ← controller.recordExport (البصمة).
// الرفع: readImport (فحص ومقارنة) ← reviewIncoming (قرينة الاسم) ← controller.loadArabicInto إلى الخانة المختارة (بتأكيد
// مضغوط إن وُجدت ترجمة أو دل الاسم على فيديو آخر).
// كل تدفق يثبّت معرّف الفيديو عند بدئه، فنتيجة تأخرت حتى تبدّل الفيديو لا تُطبَّق على الجديد أبدًا.
import { messageFor, toErrorInfo } from '../../core/errors/index.js';

const infoOf = (code, params) => ({ code, message: messageFor(code, params) });

/**
 * مصطلحات القاموس المرفقة بالتعليمات، أو null: «أرفق القاموس» مفعّل وفيه مصطلح (عقد data-model §١٤).
 * @param {import('../../core/model/prefs.js').Prefs | null | undefined} prefs
 */
export const attachedGlossary = (prefs) => (prefs?.glossary?.attach && prefs.glossary.terms?.length ? prefs.glossary.terms : null);

/**
 * التصدير لمسار ملتقط بوضعه: المقاطع كما يعطيها المتحكم (لا إزاحة فيها أبدًا)، والملفات والبصمة، ونص التعليمات بأجزائه
 * وبالقاموس إن أُرفق (instructions نفسها التي تنسخ بها المحفوظات ونافذة الأيقونة). لا يُعرض النص أبدًا.
 * @param {{ controller: object, exportFlow: { buildExport: Function, instructions?: Function }, key: string, mode: 'normal' | 'long', split: { size: number, by?: string } | null, now: number }} p
 * @returns {{ ok: true, built: { files: { name: string, text: string, part: object | null }[], fingerprint: object, instructions: string, warnings: string[] }, videoId: string, text: string }
 *   | { ok: false, error: { code: string, message: string } }}
 */
export function prepareExport({ controller, exportFlow, key, mode, split, now }) {
  const s = controller.getState();
  const conv = controller.convertCaptured(key, { mode });
  if (!conv.ok) return { ok: false, error: infoOf(conv.code ?? 'EX_NO_TRACK') };
  try {
    const built = exportFlow.buildExport({
      videoId: s.videoId, title: s.title,
      track: { key, lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings },
      mode, split, now,
    });
    const glossary = attachedGlossary(s.prefs);
    const text = glossary && exportFlow.instructions
      ? exportFlow.instructions({ videoId: s.videoId, title: s.title, parts: built.fingerprint.parts ?? null, glossary })
      : built.instructions;
    return { ok: true, built, videoId: s.videoId, text };
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
}

/**
 * حفظ ملفات التصدير بالترتيب عبر saveFile (مكان الحفظ من الإعدادات، لا من هنا). يتوقف عند أول إلغاء أو إخفاق: حوار حفظ
 * ألغاه المستخدم لا يتبعه حوار آخر.
 * @param {{ exportFlow: { saveFile: Function }, files: { name: string, text: string }[], doc: Document }} p
 * @returns {Promise<{ saved: string[], blob: boolean, stopped: { code: string, message: string } | null }>}
 */
export async function saveFiles({ exportFlow, files, doc }) {
  const saved = [];
  let blob = false;
  let pending = false;
  for (const file of files) {
    let r;
    try {
      r = await exportFlow.saveFile({ name: file.name, text: file.text }, { doc });
    } catch (err) {
      return { saved, blob, pending, stopped: toErrorInfo(err) };
    }
    if (!r?.ok) return { saved, blob, pending, stopped: infoOf(r?.code ?? 'SV_FAILED') };
    saved.push(file.name);
    if (r.mode === 'blob') blob = true;
    if (r.pending) pending = true;
  }
  return { saved, blob, pending, stopped: null };
}

/**
 * حفظ بصمة التصدير بعد نزول ملفاته، للفيديو الذي صُدِّر له وحده. إخفاقها لا يُسقط ملفًا نُزّل، ويُذكر وحده.
 * @returns {Promise<{ saved: true, error: null } | { saved: false, error: { code: string, message: string } }>}
 */
export async function recordFor({ controller, key, built, videoId }) {
  if (controller.getState().videoId !== videoId) return { saved: false, error: infoOf('CT_VIDEO_CHANGED') };
  try {
    await controller.recordExport({ trackKey: key, fingerprint: built.fingerprint });
    return { saved: true, error: null };
  } catch (err) {
    return { saved: false, error: toErrorInfo(err) };
  }
}

/**
 * أحجام أجزاء التقسيم الاحتياطي قبل التنزيل (R60): لكل جزء رقمه ومداه وعدد محارف ملفه. null إن لم يلزم تقسيم أو تعذّر.
 * @returns {{ index: number, from: number, to: number, chars: number }[] | null}
 */
export function partSizes(p) {
  const r = prepareExport(p);
  if (!r.ok) return null;
  const parts = r.built.files.filter((f) => f.part);
  return parts.length > 1 ? parts.map((f) => ({ index: f.part.index, from: f.part.from, to: f.part.to, chars: f.text.length })) : null;
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
 * قرينة اسم الملف (R48): يدل على فيديو آخر؟ ومعها عنوانه إن كان في المحفوظات. تنبيه لا رفض؛ وتعذّر قراءة المحفوظات
 * يسقط العنوان وحده. قراءة فقط: لا كتابة في التخزين.
 * @param {{ controller: object, importFlow: { reviewIncoming: Function, knownVideos?: () => Promise<{ videoId: string, title: string | null }[]> }, read: { videoId: string, input: { fileName: string, cues: object[] } } }} p
 * @returns {Promise<{ videoId: string, title: string | null } | null>}
 */
export async function nameHintFor({ controller, importFlow, read }) {
  let known = [];
  try {
    known = (await importFlow.knownVideos?.()) ?? [];
  } catch {
    known = [];
  }
  try {
    const r = importFlow.reviewIncoming({
      fileName: read.input.fileName, cues: read.input.cues, videoId: read.videoId,
      fingerprints: controller.getState().saved?.fingerprints ?? [], knownVideoIds: known.map((e) => e.videoId),
    });
    if (!r.nameHint || !r.nameHint.differs) return null;
    return { videoId: r.nameHint.videoId, title: known.find((e) => e.videoId === r.nameHint.videoId)?.title ?? null };
  } catch {
    return null;
  }
}

/**
 * تحميل نتيجة القراءة إلى خانة للفيديو نفسه الذي قُرئت له وحده. current مقاطع «إبقاء تعديلاتي» بعد الدمج إن اختيرت.
 * @param {{ controller: object, read: { videoId: string, input: object }, n: 1 | 2 | 3, replace: boolean, current?: object[] | null }} p
 * @returns {Promise<{ ok: true } | { ok: false, error: { code: string, message: string } }>}
 */
export async function loadIntoFor({ controller, read, n, replace, current = null }) {
  if (controller.getState().videoId !== read.videoId) return { ok: false, error: infoOf('CT_VIDEO_CHANGED') };
  try {
    await controller.loadArabicInto(n, current ? { ...read.input, current } : read.input, { replace });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
}
