// أوامر المحفوظات فوق التخزين والتدفقات المختبرة (عقد interfaces §٥ و§٦ و§١٣، وstorage §٦ و§١١): تصدير SRT (عربي بتوقيت
// التصدير وإنجليزي بالوضع «عادي» وحده) والنص الدراسي عبر saveFile، والاستبدال (استيراد ومقارنة ثم تأكيد)، والحذف (النشطة
// وحدها أو كل بيانات الفيديو)؛ وفي الإصدار الثاني: تبديل النشطة، والاسم المختصر، والمرجع، وحذف خانة، والنسخة السابقة
// (استعادة بتبديل قابل للعكس وحذف)، والرفع إلى خانة بفحص كامل. لا واجهة هنا: كل شيء بتبعيات تُحقن، فتُختبر بمحاكاة
// التخزين. الكتابة عبر انتقالات النموذج وupdateVideo وupdateBundle وحدها، كل تغيير كتابة ذرية واحدة.
import { diffTranslations, keepEditsMerge } from '../../core/align/index.js';
import { compare } from '../../core/compare/index.js';
import { TjError, messageFor } from '../../core/errors/index.js';
import { buildArabicExport, buildExport, buildStudyText, studyTiming, studyTimingNote } from '../../core/export/index.js';
import { readImport, reviewIncoming, sameExport } from '../../core/import/index.js';
import {
  applyRecordChange, referencedFingerprints, withActiveSlot, withPreviousRestored, withSlotName, withSlotReference, withSlotUpload, withoutPrevious,
  withoutSlot,
} from '../../core/model/bundle.js';
import { LIMITS } from '../../core/model/validate.js';
import { arabicCues } from '../../core/model/video.js';
import { exportTiming } from '../../core/model/timing.js';
import { withExport } from '../../core/model/transitions.js';
import { manualEdits } from './model.js';

const iso = (now) => new Date(now()).toISOString();

/** أول 8 أرقام ثم «…»: الإزاحة الكبيرة على ملف طويل تعطي مئات الأرقام لا تُقرأ في رسالة عابرة. */
const LIST_LIMIT = 8;
const listNumbers = (list) => (list.length > LIST_LIMIT ? `${list.slice(0, LIST_LIMIT).join('، ')}…` : list.join('، '));

async function requireRecord(store, videoId) {
  const record = await store.getVideo(videoId);
  if (!record) throw new TjError('PG_VIDEO_GONE');
  return record;
}

/**
 * @typedef {(file: { name: string, text: string }) => Promise<{ ok: true, mode: string, downloadId: number | null } | { ok: false, code: string }>} SaveFn
 *   saveFile (عقد interfaces §١٣): يتبع مكان الحفظ المختار.
 */

/**
 * تصدير العربية: المحفوظ كما هو إن كانت الإزاحة صفرًا، وإلا يسأل `askTiming` المستخدم (shown الافتراضي أو saved).
 * الإلغاء يعيد null. الزمن السالب يرفض التصدير برمز MD_NEGATIVE_TIME ومقاطعه. لا يغيّر شيئًا مخزَّنًا.
 * @param {{
 *   store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string,
 *   variant: 'current' | 'original', askTiming: (offsetMs: number) => Promise<'shown' | 'saved' | null>,
 *   save: SaveFn
 * }} o
 * @returns {Promise<{ name: string, timing: 'saved' | 'shown', cueCount: number, saved: Awaited<ReturnType<SaveFn>> } | null>}
 */
export async function exportArabic({ store, videoId, variant, askTiming, save }) {
  const record = await requireRecord(store, videoId);
  if (!record.arabic) throw new TjError('PG_NO_ARABIC');
  const source = variant === 'original' ? record.arabic.original : arabicCues(record);
  return exportCues({ videoId, source, offset: record.view.displayOffsetMs, variant, askTiming, save });
}

/**
 * «تصدير SRT» في بطاقة ترجمة: النسخة الحالية للخانة n (نشطة أو لا) بإزاحتها هي، وبسؤال التوقيت نفسه إن لم تكن صفرًا. اسم
 * الملف المتفق عليه VIDEOID.ar.srt كتصدير «المزيد». لا يغيّر شيئًا مخزَّنًا.
 * @param {{
 *   store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, n: 1 | 2 | 3,
 *   askTiming: (offsetMs: number) => Promise<'shown' | 'saved' | null>, save: SaveFn
 * }} o
 */
export async function exportSlot({ store, videoId, n, askTiming, save }) {
  const b = await store.getBundle(videoId);
  if (!b) throw new TjError('PG_VIDEO_GONE');
  const s = b.slots[n - 1];
  if (!s?.track) throw new TjError('PG_NO_ARABIC');
  const offset = b.active === n ? b.record.view.displayOffsetMs : s.offsetMs;
  return exportCues({ videoId, source: s.track.current ?? s.track.original, offset, variant: 'current', askTiming, save });
}

/** الجزء المشترك: توقيت التصدير (سؤال عند إزاحة غير صفر، والإلغاء null، والزمن السالب يرفض) ثم بناء الملف وحفظه. */
async function exportCues({ videoId, source, offset, variant, askTiming, save }) {
  let choice = 'shown';
  if (offset !== 0) {
    const picked = await askTiming(offset);
    if (picked === null) return null;
    choice = picked;
  }
  const timed = exportTiming(source, offset, choice);
  if (!timed.ok) throw new TjError('MD_NEGATIVE_TIME', { params: { list: listNumbers(timed.negative) } });
  const file = buildArabicExport({ videoId, cues: timed.cues, variant });
  const saved = await save(file);
  return { name: file.name, timing: timed.timing, cueCount: timed.cues.length, saved };
}

// التصدير نفسه بأزمنته (sameExport) وبلا أجزاء: كانت الأزمنة تُهمل فيُرفض تصدير بتوقيت جديد ونصه مطابق، ويبقى المرجع القديم.
const sameFingerprint = (a, b) => sameExport(a, b) && a.parts === null && b.parts === null;

/**
 * تصدير الإنجليزية المستخرجة من المسار المحفوظ بالوضع «عادي» وحده. البصمة تُحفظ لتصحّ مقارنة ما سيعود به المستخدم،
 * إلا إن وُجدت بصمة للتصدير نفسه (المسار والوضع والنص والعدد والأزمنة) فلا تتراكم نسخ متطابقة حتى حد البصمات.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, trackKey: string,
 *   save: SaveFn, now: () => number }} o
 * @returns {Promise<{ name: string, cueCount: number, fingerprintSaved: boolean, saveError: unknown, saved: Awaited<ReturnType<SaveFn>> }>}
 */
export async function exportEnglish({ store, videoId, trackKey, save, now }) {
  const record = await requireRecord(store, videoId);
  const track = record.english.find((t) => t.key === trackKey);
  if (!track) throw new TjError('PG_NO_ENGLISH');
  const built = buildExport({
    videoId, title: record.title, mode: 'normal', now: now(),
    track: { key: track.key, lang: track.lang, kind: track.kind, cues: track.cues },
  });
  const [file] = built.files;
  const result = await save(file);
  // لا ملف (أُلغي الحفظ أو تعذّر): لا بصمة تُحفظ لتصدير لم يحدث.
  if (!result.ok) return { name: file.name, cueCount: file.cueCount, fingerprintSaved: false, saveError: null, saved: result };
  // الكشف عن البصمة المعروفة داخل updateVideo على أحدث نسخة (لا قبله): تصديران متزامنان لا يخزّنان نسختين متطابقتين.
  // الملف نزل بالفعل، فإخفاق حفظ البصمة تنبيه (saveError) لا خطأ يُسقط التصدير.
  let stored = false;
  try {
    // على الحزمة لا السجل وحده: بصمات الخانات غير النشطة والسابقة لا يسقطها حد البصمات، كما في المشغّل
    // (referencedFingerprints؛ تدقيق 5fedcb9، GM-015.2: كانت تسقط فيُقرأ مرجع تلك الخانة null بصمت).
    await store.updateBundle(videoId, (b) => {
      const rec = b?.record;
      if (!rec || rec.fingerprints.some((f) => sameFingerprint(f, built.fingerprint))) return undefined;
      stored = true;
      const at = iso(now);
      const next = withExport(rec, { videoId, title: rec.title, durationMs: rec.durationMs, englishTrack: track, fingerprint: built.fingerprint }, at, { keep: referencedFingerprints(b) });
      return applyRecordChange(b, next, at);
    });
  } catch (saveError) {
    return { name: file.name, cueCount: file.cueCount, fingerprintSaved: false, saveError, saved: result };
  }
  return { name: file.name, cueCount: file.cueCount, fingerprintSaved: stored, saveError: null, saved: result };
}

/**
 * «نص دراسي…» (R58، buildStudyText في P11): الترجمة النشطة بأوقاتها، والإنجليزية للثنائي من مسار مرجعها إن حُفظ، وإلا
 * أول مسار يدوي، وإلا أي مسار محفوظ. لا يغيّر شيئًا مخزَّنًا.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string,
 *   format: 'txt' | 'md', bilingual: boolean, save: SaveFn }} o
 */
export async function exportStudy({ store, videoId, format, bilingual, save }) {
  const record = await requireRecord(store, videoId);
  // روابط التوقيت حيث يظهر المقطع في الفيديو (المحفوظ + إزاحة العرض) كالمحرّر، ومنه يُوزَّع الإنجليزي (تدقيق 5fedcb9، GM-016.1).
  const { cues, clamped } = studyCues(record);
  const english = bilingual ? studyEnglish(record) : null;
  const file = buildStudyText({ videoId, title: record.title, cues, english, format, bilingual });
  return { name: file.name, clamped, saved: await save(file) };
}

/** مقاطع النشطة بتوقيت النص الدراسي (studyTiming): الإزاحة لكلها، وما وقع قبل الصفر وحده من بداية الفيديو في `clamped`. */
function studyCues(record) {
  const stored = arabicCues(record);
  if (!stored) throw new TjError('PG_STUDY_NO_ARABIC');
  return studyTiming(stored, record.view.displayOffsetMs);
}

/** إشعار حوار «نص دراسي…» قبل التنزيل: ما ستبدأ روابطه من 0:00 بالإزاحة الحالية، أو '' (studyTimingNote). */
export async function studyNote({ store, videoId }) {
  return studyTimingNote(studyCues(await requireRecord(store, videoId)).clamped);
}

/** المسار الإنجليزي للنص الثنائي: مسار بصمة النشطة، ثم اليدوي، ثم أي مسار. @param {import('../../core/model/video.js').VideoRecord} record */
export function studyEnglish(record) {
  const fp = record.fingerprints.find((f) => f.id === record.arabic?.fingerprintId);
  const track = record.english.find((t) => t.key === fp?.trackKey) ?? record.english.find((t) => t.kind === 'manual') ?? record.english[0];
  return track ? track.cues : null;
}

/** اسم الملف الدراسي للمعاينة دون حفظ (الاسم من buildStudyText نفسه). */
export async function studyName({ store, videoId, format, bilingual }) {
  const record = await requireRecord(store, videoId);
  const cues = arabicCues(record);
  if (!cues) throw new TjError('PG_STUDY_NO_ARABIC');
  return buildStudyText({ videoId, title: record.title, cues, english: bilingual ? studyEnglish(record) : null, format, bilingual }).name;
}

/**
 * الحذف مقيّد بما وافق عليه المستخدم: `expect` الحزمة التي بُني عليها حوار التأكيد، فإن تغيّرت منذئذ (تفعيل ترجمة أخرى أو رفع
 * أو حذف من تبويب آخر) رُفض بـPG_DELETE_STALE ولم يُحذف شيء، ويعيد المستدعي قراءة ما يعرضه. بلا expect يُكتب على الأحدث.
 * @template T @param {() => Promise<T>} write @returns {Promise<T>}
 */
async function confirmedDelete(write) {
  return confirmedAs('PG_DELETE_STALE', write);
}

/**
 * فعل مقيّد بالحالة التي بُني عليها تأكيده (تدقيق 7a66f91، C2): تعارضها (ST_CONFLICT) يصير رمز الفعل نفسه، فيقول للمستخدم ما
 * لم يقع ولماذا، ويعيد المستدعي قراءة ما يعرضه.
 * @template T @param {string} code @param {() => Promise<T>} write @returns {Promise<T>}
 */
async function confirmedAs(code, write) {
  try {
    return await write();
  } catch (err) {
    if (err instanceof TjError && err.code === 'ST_CONFLICT') throw new TjError(code, { detail: err.detail, cause: err });
    throw err;
  }
}

/**
 * الحذف: «arabic» ترجمة واحدة بعينها هي الخانة n التي سُردت في التأكيد (لا «النشطة وقت الكتابة»)، فيبقى غيرها والمسار
 * الإنجليزي والبصمات والسابقة، وحذف النشطة يفعّل أصغر خانة ممتلئة غيرها؛ و«all» يزيل سجل الفيديو وتوابعه ومُلخّصه معًا.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, scope: 'arabic' | 'all',
 *   n?: 1 | 2 | 3, expect?: import('../../core/model/slots.js').Bundle, now: () => number }} o
 */
export async function deleteVideoData({ store, videoId, scope, n, expect, now }) {
  if (scope === 'all') {
    if (expect === undefined) await store.deleteVideo(videoId);
    else await confirmedDelete(() => store.updateBundle(videoId, () => null, { expect }));
    return;
  }
  if (scope !== 'arabic') throw new RangeError(`نطاق حذف غير معروف: ${scope}`);
  // تدقيق مستقل (2026-11-04): كان «arabic» يحذف النشطة لحظة الكتابة، فتفعيل الترجمة 2 من تبويب آخر بعد فتح تأكيد حذف 1 يحذف 2.
  if (n !== 1 && n !== 2 && n !== 3) throw new RangeError('حذف ترجمة واحدة يحتاج رقم خانتها كما سُردت في التأكيد');
  await confirmedDelete(() => store.updateBundle(videoId, (b) => (b?.slots[n - 1]?.track ? withoutSlot(b, n, iso(now)) : undefined), { expect }));
}

// ---- الإصدار الثاني: الخانات والنسخة السابقة والرفع (P13) ----

/** كتابة على الحزمة بانتقال؛ الفيديو المحذوف في الأثناء PG_VIDEO_GONE. */
async function onBundle(store, videoId, fn, opts) {
  let gone = false;
  const next = await store.updateBundle(videoId, (b) => {
    if (!b) {
      gone = true;
      return undefined;
    }
    return fn(b);
  }, opts);
  if (gone) throw new TjError('PG_VIDEO_GONE');
  return next;
}

/**
 * تبديل الترجمة النشطة (withActiveSlot). يعيد النشطة قبلها والحزمة بعده، للتراجع.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, n: 1 | 2 | 3, now: () => number }} o
 * @returns {Promise<{ before: 1 | 2 | 3 | null, after: import('../../core/model/slots.js').Bundle | null }>}
 */
export async function activateSlot({ store, videoId, n, now }) {
  let before = null;
  const after = await onBundle(store, videoId, (b) => {
    before = b.active;
    return b.active === n ? undefined : withActiveSlot(b, n, iso(now));
  });
  return { before, after };
}

/**
 * «تراجع» عن تفعيل: يعيد الخانة السابقة ما دامت الحزمة كما تركها التفعيل (`expect`)، كحارس syncUndoStale في المشغّل. وإن
 * تغيّرت من مكان آخر رُفض بـPG_UNDO_STALE ولم يُفرض شيء (تدقيق 7a66f91، U95).
 */
export const undoActivation = ({ store, videoId, n, expect, now }) => confirmedAs('PG_UNDO_STALE', () => onBundle(store, videoId, (b) => (b.active === n ? undefined : withActiveSlot(b, n, iso(now))), { expect }));

/** الاسم المختصر (≤ 24 محرفًا) أو إزالته بالفارغ. */
export const renameSlot = ({ store, videoId, n, name }) => onBundle(store, videoId, (b) => withSlotName(b, n, name));

/**
 * حذف ترجمة واحدة باسمها وعلاماتها؛ حذف النشطة يفعّل أصغر خانة ممتلئة غيرها. السابقة تبقى. `expect` الحزمة التي سُرد منها
 * التأكيد: إن تغيّرت (استُبدلت الخانة من تبويب آخر مثلًا) رُفض بـPG_DELETE_STALE ولم يُحذف شيء.
 */
export const deleteSlot = ({ store, videoId, n, now, expect }) => confirmedDelete(() => onBundle(store, videoId, (b) => withoutSlot(b, n, iso(now)), { expect }));

/**
 * استعادة النسخة السابقة: تبديل قابل للعكس مع خانتها. `expect` الحزمة التي عرضها الحوار: إن تغيّرت (استبدال من تبويب آخر
 * يغيّر السابقة أو خانتها) رُفض بـPG_RESTORE_STALE ولم يُستبدل شيء (تدقيق 7a66f91، U10).
 */
export const restorePrevious = ({ store, videoId, now, expect }) => confirmedAs('PG_RESTORE_STALE', () => onBundle(store, videoId, (b) => withPreviousRestored(b, iso(now)), { expect }));

/** حذف النسخة السابقة التي عُرضت (`expect`): إن صارت غيرها في الأثناء رُفض بـPG_DELETE_STALE. */
export const deletePrevious = ({ store, videoId, expect }) => confirmedDelete(() => onBundle(store, videoId, (b) => withoutPrevious(b), { expect }));

/**
 * مقارنة الملف أو الخانة ببصمة بعينها، بعتبة الانحراف من الإعدادات؛ وملاحظات الاستيراد أولًا كما في readImport.
 * @param {import('../../core/model/cue.js').Cue[]} cues @param {import('../../core/model/tracks.js').Fingerprint | null} fp
 * @param {import('../../core/model/settings.js').Settings} settings @param {string[]} [notes]
 */
export function compareWith(cues, fp, settings, notes = []) {
  const report = compare(cues, fp, { driftMs: settings.thresholds.driftMs });
  return { ...report, notes: [...notes, ...report.notes].slice(0, LIMITS.maxNotes) };
}

/**
 * تغيير مرجع المقارنة لخانة: المقارنة تُعاد بالبصمة المختارة (أو بلا مرجع)، وتُكتب مع المرجع كتابةً واحدة.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, n: 1 | 2 | 3,
 *   fingerprintId: string | null, now: () => number }} o
 */
export async function changeReference({ store, videoId, n, fingerprintId, now }) {
  const settings = await store.getSettings();
  return onBundle(store, videoId, (b) => {
    const s = b.slots[n - 1];
    if (!s.track) throw new TjError('ST_SLOT_EMPTY');
    const fp = fingerprintId ? b.record.fingerprints.find((f) => f.id === fingerprintId) ?? null : null;
    if (fingerprintId && !fp) throw new TjError('MD_INVALID', { detail: 'fingerprintId' });
    // التقرير وصف للملف المستورد كما في readImport وapplyUpload: الأصل لا النسخة المعدّلة، فلا يتغير بإعادة اختيار المرجع.
    return withSlotReference(b, n, { fingerprintId, comparison: fp ? compareWith(s.track.original, fp, settings, s.track.notes) : null }, iso(now));
  });
}

/**
 * الخطوة الأولى من الرفع إلى خانة: قراءة الملف أو أجزائه، والحزمة الحالية، وفحص الملف الوارد (المراجع مرتبة، والمقترح،
 * والتأكد، وقرينة الاسم). لا كتابة هنا.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, files: File[] | FileList,
 *   knownVideoIds?: string[] }} o
 */
export async function prepareUpload({ store, videoId, files, knownVideoIds = [] }) {
  const bundle = await store.getBundle(videoId);
  if (!bundle) throw new TjError('PG_VIDEO_GONE');
  const settings = await store.getSettings();
  const result = await readImport(files, { fingerprints: bundle.record.fingerprints, settings });
  if (!result.ok) return { bundle, settings, result, review: null };
  const review = reviewIncoming({ fileName: result.fileName, cues: result.cues, videoId, fingerprints: bundle.record.fingerprints, knownVideoIds });
  return { bundle, settings, result, review };
}

/**
 * ما يعرضه حوار الرفع لخانة هدف: هل هو استبدال، وأعداد الفروق مع الحالي (diffTranslations على المعروض في الخانة)، وعدد
 * التعديلات اليدوية التي ستُفقد، وهل يمكن «إبقاء تعديلاتي» (keepEditsMerge بثقة) وسببه إن لم يمكن. وصف فقط.
 * @param {import('../../core/model/slots.js').Bundle} bundle @param {1 | 2 | 3} n @param {import('../../core/model/cue.js').Cue[]} incoming
 */
export function uploadImpact(bundle, n, incoming) {
  const track = bundle.slots[n - 1].track;
  if (!track) return { replace: false, diff: null, edits: 0, keep: { ok: false, reason: null, cues: null } };
  const diff = diffTranslations(track.current ?? track.original, incoming);
  const edits = manualEdits(track);
  if (!edits) return { replace: true, diff, edits, keep: { ok: false, reason: messageFor('PG_KEEP_EDITS_NONE'), cues: null } };
  // المحرك نفسه في المشغّل (R49): تبقى التعديلات حيث لم يغيّر الملف الجديد موضعها، وما تعارض يأخذه الجديد.
  const merged = keepEditsMerge(track, incoming);
  return merged.ok
    ? { replace: true, diff, edits, keep: { ok: true, reason: null, cues: merged.current, conflicts: merged.conflicts } }
    : { replace: true, diff, edits, keep: { ok: false, reason: `${messageFor('PG_KEEP_EDITS_UNALIGNED')} ${merged.reason}`, cues: null } };
}

/**
 * الخطوة الثانية بعد التأكيد: الملف إلى الخانة n (withSlotUpload) بالمرجع المختار، واستبدال الممتلئة يحفظ السابقة في
 * الكتابة نفسها. `expect` الحزمة التي بُني عليها الحوار: إن تغيّرت منذئذ رُفض بـST_CONFLICT ولم يُكتب شيء.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, bundle: import('../../core/model/slots.js').Bundle,
 *   settings: import('../../core/model/settings.js').Settings, result: Extract<Awaited<ReturnType<typeof readImport>>, { ok: true }>,
 *   n: 1 | 2 | 3, fingerprintId: string | null, keepCues?: import('../../core/model/cue.js').Cue[] | null, now: () => number }} o
 * @returns {Promise<{ replaced: boolean, offsetWas: number, activated: boolean }>}
 */
export async function applyUpload({ store, bundle, settings, result, n, fingerprintId, keepCues = null, now }) {
  const fp = fingerprintId ? bundle.record.fingerprints.find((f) => f.id === fingerprintId) ?? null : null;
  const comparison = fingerprintId === result.fingerprintId ? result.comparison : compareWith(result.cues, fp, settings, result.notes);
  const filled = Boolean(bundle.slots[n - 1].track);
  let info = { replaced: false, offsetWas: 0, activated: false };
  await onBundle(store, bundle.videoId, (b) => {
    const out = withSlotUpload(b, n, {
      videoId: b.videoId, fileName: result.fileName, cues: result.cues, comparison, fingerprintId: fp ? fp.id : null,
      notes: result.notes, displayModeDefault: settings.displayModeDefault, current: keepCues,
    }, iso(now), { replace: filled });
    info = { replaced: out.replaced, offsetWas: out.offsetWas, activated: out.bundle.active === n };
    return out.bundle;
  }, { expect: bundle });
  return info;
}
