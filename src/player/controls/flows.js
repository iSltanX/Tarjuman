// تدفقا الشريط فوق وحدات W3 وW6 (عقد interfaces §٥ و§٦ و§١٣) دون منطق تصدير أو استيراد هنا:
// التحميل: controller.convertCaptured ← buildExport (والتقسيم عند الجمل أو الصمت) ← saveFile لكل ملف (مكان الحفظ من
// الإعدادات) ← controller.recordExport (البصمة). تعليمات الترجمة (من ← إلى) تُنسخ من نافذة الإضافة وحدها منذ AA3.
// الرفع: readImport (فحص ومقارنة) ← reviewIncoming (المرجع الأقرب) وvideoIdFromName (قرينة الاسم) ← controller.loadArabicInto إلى الخانة المختارة (بتأكيد
// مضغوط إن وُجدت ترجمة أو دل الاسم على فيديو آخر)، ولغة الملف من رمز صريح في اسمه، وإلا «إلى» في نافذة الإضافة إن وافق نصها.
// كل تدفق يثبّت معرّف الفيديو عند بدئه، فنتيجة تأخرت حتى تبدّل الفيديو لا تُطبَّق على الجديد أبدًا.
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { previewComparison, videoIdFromName, withSuggestedReference } from '../../core/import/index.js';
import { textFitsLang } from '../../core/lang/index.js';

export { textFitsLang };

const infoOf = (code, params) => ({ code, message: messageFor(code, params) });

/**
 * التصدير لمسار ملتقط بوضعه: المقاطع كما يعطيها المتحكم (لا إزاحة فيها أبدًا)، والملفات والبصمة. لا تعليمات هنا (AA3).
 * @param {{ controller: object, exportFlow: { buildExport: Function }, key: string, mode: 'normal' | 'long', split: { size: number, by?: string } | null, now: number }} p
 * @returns {{ ok: true, built: { files: { name: string, text: string, part: object | null }[], fingerprint: object, warnings: string[] }, videoId: string }
 *   | { ok: false, error: { code: string, message: string } }}
 */
export function prepareExport({ controller, exportFlow, key, mode, split, now }) {
  const s = controller.getState();
  const conv = controller.convertCaptured(key, { mode });
  if (!conv.ok) return { ok: false, error: infoOf(conv.code ?? 'EX_NO_TRACK') };
  try {
    const built = exportFlow.buildExport({
      videoId: s.videoId, title: s.title,
      track: { key, lang: conv.lang, kind: conv.kind, via: conv.via ?? null, cues: conv.cues, warnings: conv.warnings },
      mode, split, now, target: null,
    });
    return { ok: true, built, videoId: s.videoId };
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
}

/**
 * تصدير مسار الأصل المحفوظ (تدقيق Fable، FA-17 = B2، بقرار سلطان 2026-11-07): حين لا التقاط حي في هذه الزيارة والمسار محفوظ من
 * تنزيل سابق، يُصدَّر المحفوظ بالوضع العادي كما تفعل المحفوظات (exportEnglish). المقاطع المحفوظة تحويل الوضع العادي نفسه، فلا وضع
 * طويل ولا تقسيم هنا (يحتاجان التقاطًا حيًا).
 * @param {{ controller: object, exportFlow: { buildExport: Function }, now: number }} p
 */
export function prepareSavedExport({ controller, exportFlow, now }) {
  const s = controller.getState();
  const t = s.english?.source === 'saved' && s.english.cues?.length ? s.english : null;
  if (!t) return { ok: false, error: infoOf('EX_NO_TRACK') };
  try {
    const built = exportFlow.buildExport({
      videoId: s.videoId, title: s.title,
      track: { key: t.key, lang: t.lang, kind: t.kind, via: t.via ?? null, cues: t.cues },
      mode: 'normal', split: null, now, target: null,
    });
    return { ok: true, built, videoId: s.videoId, key: t.key };
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

/** بصمة تنزيل المحفوظ بعد نزول ملفه، للفيديو نفسه وحده، بلا تكرار (FA-17). */
export async function recordSavedFor({ controller, key, built, videoId }) {
  if (controller.getState().videoId !== videoId) return { saved: false, error: infoOf('CT_VIDEO_CHANGED') };
  try {
    await controller.recordSavedExport({ trackKey: key, fingerprint: built.fingerprint });
    return { saved: true, error: null };
  } catch (err) {
    return { saved: false, error: toErrorInfo(err) };
  }
}

/**
 * أحجام أجزاء التقسيم الاحتياطي قبل التنزيل (R60): لكل جزء رقمه ومداه وعدد محارف ملفه، وraised إن رُفع حجم الجزء ليبقى عدد
 * الأجزاء ضمن حد الرفع (تدقيق 7a66f91، U31)، فيُقال قبل التنزيل. null إن لم يلزم تقسيم أو تعذّر.
 * @returns {{ rows: { index: number, from: number, to: number, chars: number }[], raised: boolean } | null}
 */
export function partSizes(p) {
  const r = prepareExport(p);
  if (!r.ok) return null;
  const parts = r.built.files.filter((f) => f.part);
  if (parts.length <= 1) return null;
  const rows = parts.map((f) => ({ index: f.part.index, from: f.part.from, to: f.part.to, chars: f.text.length }));
  return { rows, raised: r.built.warnings.includes('EX_SPLIT_SIZE_RAISED') };
}

/**
 * قراءة ملف أو أجزاء وفحصها ومقارنتها بالبصمات المحفوظة لهذا الفيديو. لا كتابة في التخزين هنا.
 * preview ملخص المعاينة بالمحاذاة كما يُعرض بعد الحفظ (FA-04)، وinput.comparison تقرير الحفظ بالرقم كما كان.
 * fallbackLang: «إلى» في نافذة الإضافة لهذا الفيديو (AA3)، تُستعمل بلا رمز في الاسم إن وافق نص الملف نصها. fileLang: الرمز الصريح في الاسم.
 * @returns {Promise<
 *   { ok: true, videoId: string, input: { fileName: string, cues: object[], comparison: object | null, fingerprintId: string | null, notes: string[], lang: string | null }, fileLang: string | null, preview: object | null, warnings: string[] }
 *   | { ok: false, error: { code: string, message: string } }>}
 */
export async function readFor({ controller, importFlow, files, fallbackLang = null }) {
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
  // المرجع الأقرب كما في المحفوظات (R50): لا البصمة الأحدث أو المطابقة عددًا وحدها حين تعددت التصديرات (GM-011).
  const fingerprints = s.saved?.fingerprints ?? [];
  if (fingerprints.length > 1 && typeof importFlow.reviewIncoming === 'function') {
    try {
      const review = importFlow.reviewIncoming({ fileName: res.fileName, cues: res.cues, videoId, fingerprints, knownVideoIds: [] });
      res = withSuggestedReference(res, review?.suggested, fingerprints, s.settings);
    } catch {
      // فحص المرجع تحسين: تعذّره يُبقي اختيار readImport.
    }
  }
  const { fileName, cues, comparison, fingerprintId, notes } = res;
  // لغة الملف من رمز صريح في اسمه (AA1)، وإلا «إلى» في نافذة الإضافة إن وافق نص الملف نص كتابتها، وإلا «غير محددة»؛ وتُغيَّر في
  // التأكيد وفي قائمة الترجمة (AA3).
  const fileLang = res.lang ?? null;
  const lang = fileLang ?? (fallbackLang && textFitsLang(cues, fallbackLang) ? fallbackLang : null);
  // المعاينة بالمحاذاة بمرجع الحفظ نفسه؛ وبلا مرجع محفوظ أو بتعذّرها يبقى تقرير الرقم كما هو.
  let preview = comparison;
  const fp = fingerprintId ? fingerprints.find((f) => f.id === fingerprintId) ?? null : null;
  if (fp) {
    try {
      preview = previewComparison(cues, fp, { settings: s.settings, notes, target: lang });
    } catch {
      preview = comparison;
    }
  }
  return {
    ok: true,
    videoId,
    input: { fileName, cues, comparison, fingerprintId, notes, lang },
    fileLang,
    preview,
    warnings: (res.warnings ?? []).map((w) => messageFor(w.code, w.params)),
  };
}

/**
 * قرينة اسم الملف (R48): يدل على فيديو آخر؟ ومعها عنوانه إن كان في المحفوظات. تنبيه لا رفض؛ وتعذّر قراءة المحفوظات
 * يسقط العنوان وحده. قراءة فقط: لا كتابة في التخزين. من الاسم وحده (videoIdFromName، أو importFlow.videoIdFromName إن
 * حُقن)، فلا يُعاد ترتيب المراجع بعد readFor (تدقيق 7a66f91، القرار Q24: 670 م.ث لخمسة وعشرين ألف مقطع بعشر بصمات).
 * @param {{ controller: object, importFlow: { videoIdFromName?: typeof videoIdFromName, knownVideos?: () => Promise<{ videoId: string, title: string | null }[]> }, read: { videoId: string, input: { fileName: string, cues: object[] } } }} p
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
    const fromName = importFlow.videoIdFromName ?? videoIdFromName;
    const hint = fromName(read.input.fileName, { videoId: read.videoId, knownVideoIds: known.map((e) => e.videoId) });
    if (!hint || !hint.differs) return null;
    return { videoId: hint.videoId, title: known.find((e) => e.videoId === hint.videoId)?.title ?? null };
  } catch {
    return null;
  }
}

/**
 * تحميل نتيجة القراءة إلى خانة للفيديو نفسه الذي قُرئت له وحده. current مقاطع «إبقاء تعديلاتي» بعد الدمج إن اختيرت.
 * @param {{ controller: object, read: { videoId: string, input: object }, n: 1 | 2 | 3, replace: boolean, current?: object[] | null, lang?: string | null }} p
 * @returns {Promise<{ ok: true } | { ok: false, error: { code: string, message: string } }>}
 */
export async function loadIntoFor({ controller, read, n, replace, current = null, lang }) {
  if (controller.getState().videoId !== read.videoId) return { ok: false, error: infoOf('CT_VIDEO_CHANGED') };
  // لغة اختارها المستخدم في التأكيد تحل محل المقترحة (AA3).
  const input = lang === undefined ? read.input : { ...read.input, lang };
  try {
    await controller.loadArabicInto(n, current ? { ...input, current } : input, { replace });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
}
