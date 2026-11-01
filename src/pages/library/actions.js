// أوامر المحفوظات فوق التخزين والتدفقات المختبرة (عقد interfaces §٥ و§٦، وstorage §٦): تصدير SRT (عربي بتوقيت التصدير
// وإنجليزي بالوضع «عادي» وحده)، والاستبدال (استيراد ومقارنة ثم تأكيد)، والحذف (العربية وحدها أو كل بيانات الفيديو).
// لا واجهة هنا: كل شيء بتبعيات تُحقن، فتُختبر بمحاكاة التخزين. الكتابة عبر انتقالات النموذج وupdateVideo وحدها.
import { TjError } from '../../core/errors/index.js';
import { buildArabicExport, buildExport } from '../../core/export/index.js';
import { readImport } from '../../core/import/index.js';
import { arabicCues } from '../../core/model/video.js';
import { exportTiming } from '../../core/model/timing.js';
import { withArabicImport, withExport, withoutArabic } from '../../core/model/transitions.js';

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
 * تصدير العربية: المحفوظ كما هو إن كانت الإزاحة صفرًا، وإلا يسأل `askTiming` المستخدم (shown الافتراضي أو saved).
 * الإلغاء يعيد null. الزمن السالب يرفض التصدير برمز MD_NEGATIVE_TIME ومقاطعه. لا يغيّر شيئًا مخزَّنًا.
 * @param {{
 *   store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string,
 *   variant: 'current' | 'original', askTiming: (offsetMs: number) => Promise<'shown' | 'saved' | null>,
 *   download: (file: { name: string, text: string }) => void
 * }} o
 * @returns {Promise<{ name: string, timing: 'saved' | 'shown', cueCount: number } | null>}
 */
export async function exportArabic({ store, videoId, variant, askTiming, download }) {
  const record = await requireRecord(store, videoId);
  if (!record.arabic) throw new TjError('PG_NO_ARABIC');
  const source = variant === 'original' ? record.arabic.original : arabicCues(record);
  const offset = record.view.displayOffsetMs;
  let choice = 'shown';
  if (offset !== 0) {
    const picked = await askTiming(offset);
    if (picked === null) return null;
    choice = picked;
  }
  const timed = exportTiming(source, offset, choice);
  if (!timed.ok) throw new TjError('MD_NEGATIVE_TIME', { params: { list: listNumbers(timed.negative) } });
  const file = buildArabicExport({ videoId, cues: timed.cues, variant });
  download(file);
  return { name: file.name, timing: timed.timing, cueCount: timed.cues.length };
}

const sameFingerprint = (a, b) => a.trackKey === b.trackKey && a.mode === b.mode && a.textHash === b.textHash && a.count === b.count && a.parts === null && b.parts === null;

/**
 * تصدير الإنجليزية المستخرجة من المسار المحفوظ بالوضع «عادي» وحده. البصمة تُحفظ لتصحّ مقارنة ما سيعود به المستخدم،
 * إلا إن وُجدت بصمة مطابقة (المسار والوضع والنص والعدد) فلا تتراكم نسخ متطابقة حتى حد البصمات.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, trackKey: string,
 *   download: (file: { name: string, text: string }) => void, now: () => number }} o
 * @returns {Promise<{ name: string, cueCount: number, fingerprintSaved: boolean, saveError: unknown }>}
 */
export async function exportEnglish({ store, videoId, trackKey, download, now }) {
  const record = await requireRecord(store, videoId);
  const track = record.english.find((t) => t.key === trackKey);
  if (!track) throw new TjError('PG_NO_ENGLISH');
  const built = buildExport({
    videoId, title: record.title, mode: 'normal', now: now(),
    track: { key: track.key, lang: track.lang, kind: track.kind, cues: track.cues },
  });
  const [file] = built.files;
  download(file);
  // الكشف عن البصمة المعروفة داخل updateVideo على أحدث نسخة (لا قبله): تصديران متزامنان لا يخزّنان نسختين متطابقتين.
  // الملف نزل بالفعل، فإخفاق حفظ البصمة تنبيه (saveError) لا خطأ يُسقط التصدير.
  let saved = false;
  try {
    await store.updateVideo(videoId, (rec) => {
      if (!rec || rec.fingerprints.some((f) => sameFingerprint(f, built.fingerprint))) return undefined;
      saved = true;
      return withExport(rec, { videoId, title: rec.title, durationMs: rec.durationMs, englishTrack: track, fingerprint: built.fingerprint }, iso(now));
    });
  } catch (saveError) {
    return { name: file.name, cueCount: file.cueCount, fingerprintSaved: false, saveError };
  }
  return { name: file.name, cueCount: file.cueCount, fingerprintSaved: saved, saveError: null };
}

/**
 * الخطوة الأولى من الاستبدال: قراءة الملف أو أجزائه ومقارنته ببصمات سجل الفيديو. لا كتابة هنا؛ التأكيد شأن الواجهة.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, files: File[] | FileList }} o
 */
export async function readReplacement({ store, videoId, files }) {
  const record = await requireRecord(store, videoId);
  const settings = await store.getSettings();
  const result = await readImport(files, { fingerprints: record.fingerprints, settings });
  return { record, settings, result };
}

/**
 * الخطوة الثانية بعد تأكيد المستخدم: الملف يصبح الأصل المستورد والإزاحة صفر. `expect` يرفض الكتابة بـST_CONFLICT إن تغيّر
 * السجل منذ قراءته (المقارنة بُنيت عليه).
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, record: import('../../core/model/video.js').VideoRecord,
 *   settings: import('../../core/model/settings.js').Settings, result: Extract<Awaited<ReturnType<typeof readImport>>, { ok: true }>, now: () => number }} o
 * @returns {Promise<{ replaced: boolean, offsetWas: number }>}
 */
export async function applyReplacement({ store, record, settings, result, now }) {
  let info = { replaced: false, offsetWas: 0 };
  await store.updateVideo(record.videoId, (rec) => {
    if (!rec) return undefined;
    const out = withArabicImport(rec, {
      videoId: record.videoId, fileName: result.fileName, cues: result.cues, comparison: result.comparison,
      fingerprintId: result.fingerprintId, notes: result.notes, displayModeDefault: settings.displayModeDefault,
    }, iso(now), { replace: true });
    info = { replaced: out.replaced, offsetWas: out.offsetWas };
    return out.record;
  }, { expect: record });
  return info;
}

/**
 * الحذف: «arabic» يبقي المسار الإنجليزي والبصمات ويصفّر الإزاحة، و«all» يزيل سجل الفيديو ومُلخّصه معًا.
 * @param {{ store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, scope: 'arabic' | 'all', now: () => number }} o
 */
export async function deleteVideoData({ store, videoId, scope, now }) {
  if (scope === 'all') {
    await store.deleteVideo(videoId);
    return;
  }
  if (scope !== 'arabic') throw new RangeError(`نطاق حذف غير معروف: ${scope}`);
  await store.updateVideo(videoId, (rec) => (rec && rec.arabic ? withoutArabic(rec, iso(now)) : undefined));
}
