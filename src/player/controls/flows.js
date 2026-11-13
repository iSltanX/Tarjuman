// تدفقا الشريط فوق وحدات W3 وW6 (عقد interfaces §٥ و§٦ و§١٣) دون منطق تصدير أو استيراد هنا:
// التحميل: controller.convertCaptured ← buildExport (والتقسيم عند الجمل أو الصمت) ← saveFile لكل ملف (مكان الحفظ من
// الإعدادات) ← controller.recordExport (البصمة). تعليمات الترجمة (من ← إلى) تُنسخ من نافذة الإضافة وحدها منذ AA3.
// الرفع: readImport (فحص ومقارنة) ← reviewIncoming (المرجع الأقرب) وvideoIdFromName (قرينة الاسم) ← controller.loadArabicInto إلى الخانة المختارة (بتأكيد
// مضغوط إن وُجدت ترجمة أو دل الاسم على فيديو آخر)، ولغة الملف من رمز صريح في اسمه، وإلا «إلى» في نافذة الإضافة إن وافق نصها.
// كل تدفق يثبّت معرّف الفيديو عند بدئه، فنتيجة تأخرت حتى تبدّل الفيديو لا تُطبَّق على الجديد أبدًا.
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { findContinuation, previewComparison, videoIdFromName, withSuggestedReference, withoutOriginalLines } from '../../core/import/index.js';
import { t } from '../../i18n/index.js';
import { COUNT_FORMS, formatCount } from '../../ui/format.js';
import { DEFAULT_DRIFT_MS, compare } from '../../core/compare/index.js';
import { textFitsLang } from '../../core/lang/index.js';
import { LIMITS } from '../../core/model/validate.js';

export { textFitsLang };

const infoOf = (code, params) => ({ code, message: messageFor(code, params) });

/**
 * تقرير الحفظ بالرقم بلغة الملف المقترحة أو المختارة (U-026)، كما يحسبه applyUpload في المحفوظات: readImport يحسبه بلغة الاسم وحدها،
 * فإذا اختلفت لغة الملف عنها (من «إلى» أو من التأكيد) أُعيد بـcompare(…، {target}) كي لا يُحفظ فحص «غير مترجم» غير ما عُرض.
 */
function reportForLang(input, fingerprints, settings, lang) {
  const fp = input.fingerprintId ? fingerprints.find((f) => f.id === input.fingerprintId) ?? null : null;
  const driftMs = settings?.thresholds?.driftMs ?? DEFAULT_DRIFT_MS;
  const report = compare(input.cues, fp, { driftMs, target: lang });
  return { ...report, notes: [...(input.notes ?? []), ...report.notes].slice(0, LIMITS.maxNotes) };
}

/**
 * معاينة نتيجة قراءة بلغة ملف أخرى (تغيير «لغة الملف» في التأكيد): المعاينة بالمحاذاة بالمرجع نفسه، واللغة هدفُ فحص «غير مترجم».
 * @param {{ controller: object, read: { input: object }, lang: string | null }} p
 */
export function previewFor({ controller, read, lang }) {
  const s = controller.getState();
  const { input } = read;
  const fingerprints = s.saved?.fingerprints ?? [];
  const fp = input.fingerprintId ? fingerprints.find((f) => f.id === input.fingerprintId) ?? null : null;
  if (!fp) return reportForLang(input, fingerprints, s.settings, lang);
  try {
    return previewComparison(input.cues, fp, { settings: s.settings, notes: input.notes, target: lang });
  } catch {
    return reportForLang(input, fingerprints, s.settings, lang);
  }
}

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
/**
 * طول نص المسار بالوضع المختار (محارف نصوص مقاطعه)، لسطر «ملف طويل» (ف4). null إن تعذّر تحويله.
 * @param {{ controller: object, key: string, mode: 'normal' | 'long' }} p
 */
export function fileChars({ controller, key, mode }) {
  const conv = controller.convertCaptured(key, { mode });
  return conv.ok ? conv.cues.reduce((n, c) => n + String(c.text).length, 0) : null;
}

export function partSizes(p) {
  const r = prepareExport(p);
  if (!r.ok) return null;
  const parts = r.built.files.filter((f) => f.part);
  if (parts.length <= 1) return null;
  const rows = parts.map((f) => ({ index: f.part.index, from: f.part.from, to: f.part.to, chars: f.text.length }));
  return { rows, raised: r.built.warnings.includes('EX_SPLIT_SIZE_RAISED') };
}

/**
 * قراءة ملف أو أجزاء وفحصها ومقارنتها بالبصمات المحفوظة لهذا الفيديو. لا كتابة في التخزين هنا. وbilingual حارس الملف الثنائي
 * (الفكرة ١١، ح-49) بمسارات الأصل المحفوظة.
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
    // مسارات الأصل المحفوظة لحارس الملف الثنائي (الفكرة ١١، ح-49).
    res = await importFlow.readImport(files, { fingerprints: s.saved?.fingerprints ?? [], settings: s.settings, originals: s.saved?.english ?? [] });
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
  const { fileName, cues, fingerprintId, notes } = res;
  // لغة الملف من رمز صريح في اسمه (AA1)، وإلا «إلى» في نافذة الإضافة إن وافق نص الملف نص كتابتها، وإلا «غير محددة»؛ وتُغيَّر في
  // التأكيد وفي قائمة الترجمة (AA3).
  const fileLang = res.lang ?? null;
  const lang = fileLang ?? (fallbackLang && textFitsLang(cues, fallbackLang) ? fallbackLang : null);
  // تقرير الحفظ بلغة الملف المقترحة (U-026): readImport حسبه بلغة الاسم وحدها.
  const comparison = lang === fileLang ? res.comparison : reportForLang({ cues, fingerprintId, notes }, fingerprints, s.settings, lang);
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
    // أرقام «المواضع الغامضة» (ف6) لزر «علّمها للمراجعة» بعد الحفظ.
    ambiguous: res.ambiguous ?? null,
    // الملف مصدَّر «مع الأصل» (ح-49): التأكيد يعرض التحذير وزر الإزالة، ولا يُحفظ مباشرة.
    bilingual: res.bilingual ?? null,
    fileLang,
    preview,
    warnings: (res.warnings ?? []).map((w) => messageFor(w.code, w.params)),
  };
}

/**
 * «أزل سطر الأصل من كل مقطع» في التأكيد (الفكرة ١١، ح-49): نتيجة القراءة بلا سطر الأصل حيث طابق (withoutOriginalLines)، بتقرير الحفظ
 * بلغة الملف المقترحة وملاحظة الإزالة، والمعاينة بلغة الملف المختارة. وما ليس ثنائيًا يعود كما هو. لا كتابة في التخزين هنا.
 * @param {{ controller: object, read: { input: object, bilingual: object | null, lang?: string | null }, lang?: string | null }} p
 */
export function stripFor({ controller, read, lang }) {
  if (!read?.bilingual) return read;
  const s = controller.getState();
  const res = withoutOriginalLines({ ok: true, ...read.input, bilingual: read.bilingual }, { fingerprints: s.saved?.fingerprints ?? [], settings: s.settings });
  const input = { fileName: res.fileName, cues: res.cues, comparison: res.comparison, fingerprintId: res.fingerprintId, notes: res.notes, lang: read.input.lang ?? null };
  const next = { ...read, input, bilingual: null, stripped: res.stripped };
  return { ...next, preview: previewFor({ controller, read: next, lang: lang === undefined ? input.lang : lang }) };
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
  let input = lang === undefined ? read.input : { ...read.input, lang };
  // تغيّرت لغة الملف في التأكيد: يُحسب تقرير الحفظ بها (U-026)، فيطابق ما عُرض ما يُحفظ.
  if (lang !== undefined && lang !== (read.input.lang ?? null)) {
    const s = controller.getState();
    input = { ...input, comparison: reportForLang(input, s.saved?.fingerprints ?? [], s.settings, lang) };
  }
  try {
    await controller.loadArabicInto(n, current ? { ...input, current } : input, { replace });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
}

/**
 * ف3: هل الملف المقروء تتمة لترجمة محفوظة لهذا الفيديو؟ ومعها المقارنة بعد الإكمال بمرجع خانتها، للحوار.
 * @param {{ controller: object, read: { videoId: string, input: { cues: object[] } } }} p
 * @returns {{ cont: import('../../core/import/continuation.js').Continuation, preview: object | null } | null}
 */
export function continuationFor({ controller, read }) {
  const s = controller.getState();
  if (s.videoId !== read.videoId || !s.bundle) return null;
  let cont = null;
  try {
    cont = findContinuation(s.bundle, read.input.cues);
  } catch {
    cont = null;
  }
  if (!cont) return null;
  const track = s.bundle.slots[cont.n - 1].track;
  const fp = (s.bundle.record.fingerprints ?? []).find((f) => f.id === track.fingerprintId) ?? null;
  let preview = null;
  try {
    preview = fp ? previewComparison(cont.cues, fp, { settings: s.settings, notes: [], target: track.lang ?? null }) : null;
  } catch {
    preview = null;
  }
  return { cont, preview };
}

/**
 * «إكمال الترجمة N» للفيديو نفسه الذي قُرئ له الملف وحده، بملاحظة بما أُكمل.
 * @param {{ controller: object, read: { videoId: string, input: { fileName: string } }, cont: import('../../core/import/continuation.js').Continuation }} p
 * @returns {Promise<{ ok: true } | { ok: false, error: { code: string, message: string } }>}
 */
export async function completeInto({ controller, read, cont }) {
  if (controller.getState().videoId !== read.videoId) return { ok: false, error: infoOf('CT_VIDEO_CHANGED') };
  try {
    const note = t('common.continuation.note', { file: read.input.fileName, count: formatCount(cont.adds, COUNT_FORMS.cue) });
    await controller.completeSlot(cont, note);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toErrorInfo(err) };
  }
}

