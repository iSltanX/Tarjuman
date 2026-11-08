// انتقالات سجل الفيديو النقية (عقد interfaces §٥): يستعملها المتحكم في المشغّل، والمحفوظات، والمحرّر،
// فتبقى القواعد واحدة أينما حُفظ السجل. كل دالة تعيد سجلًا جديدًا ولا تغيّر مدخلها، والتخزين يتحقق ويضبط rev.
import { TjError } from '../errors/index.js';
import { cloneCues } from './cue.js';
import { fitLimits } from './lang-store.js';
import { LIMITS } from './validate.js';
import { createVideoRecord } from './video.js';

/**
 * @typedef {import('./video.js').VideoRecord} VideoRecord
 * @typedef {import('./tracks.js').EnglishTrack} EnglishTrack
 * @typedef {import('./tracks.js').Fingerprint} Fingerprint
 * @typedef {import('./tracks.js').ComparisonReport} ComparisonReport
 * @typedef {import('./cue.js').Cue} Cue
 */

const copy = (r) => structuredClone(r);

/**
 * يبقي آخر LIMITS.maxFingerprints بصمة، ولا يسقط البصمة التي تشير إليها الترجمة العربية، ولا ما في keep (مراجع
 * الترجمات غير النشطة والسابقة في الإصدار الثاني).
 */
function pruneFingerprints(list, keepId, keep = []) {
  const kept = new Set([keepId, ...keep].filter(Boolean));
  const out = list.slice();
  while (out.length > LIMITS.maxFingerprints) {
    const i = out.findIndex((f) => !kept.has(f.id));
    if (i === -1) break;
    out.splice(i, 1);
  }
  return out;
}

/**
 * يضيف مسارًا إنجليزيًا أو يستبدل مسار مفتاحه. عند امتلاء الحد يُسقط بقاعدة مرافق اللغة نفسها (fitLimits): أقدم مسار كل بصماته
 * غير مشار إليها (غير الإنجليزي أولًا) مع بصماته، فلا يُرفض التصدير التاسع بـMD_INVALID (تدقيق V2، U-013).
 * @param {EnglishTrack[]} list @param {EnglishTrack} track @param {Fingerprint[]} fingerprints @param {Set<string>} referenced
 * @returns {{ english: EnglishTrack[], fingerprints: Fingerprint[] }}
 */
function putEnglish(list, track, fingerprints, referenced) {
  const out = [...list.filter((x) => x.key !== track.key), { ...track, cues: cloneCues(track.cues) }];
  const fit = fitLimits(out, fingerprints, referenced, track.key);
  return { english: fit.english, fingerprints: fit.fingerprints };
}

function base(record, { videoId, title, durationMs, displayMode }, now) {
  const r = record ? copy(record) : createVideoRecord({ videoId, title, durationMs, now, displayMode });
  if (r.videoId !== videoId) throw new TjError('MD_INVALID', { detail: 'سجل فيديو آخر' });
  if (title) r.title = title;
  if (Number.isInteger(durationMs) && durationMs > 0) r.durationMs = durationMs;
  r.updatedAt = now;
  return r;
}

/**
 * بعد تنزيل SRT إنجليزي: يُحفظ المسار (أحدث التقاط لمفتاحه) والبصمة. لا يمس العربية ولا الإزاحة.
 * @param {VideoRecord | null} record
 * @param {{ videoId: string, title?: string | null, durationMs?: number | null, englishTrack: EnglishTrack, fingerprint: Fingerprint, displayMode?: 'ar' | 'dual' }} input
 * @param {string} now ISO
 * @param {{ keep?: string[] }} [opts] بصمات لا تسقط عند امتلاء الحد (مراجع الإصدار الثاني)
 * @returns {VideoRecord}
 */
export function withExport(record, input, now, { keep = [] } = {}) {
  const r = base(record, input, now);
  r.fingerprints = pruneFingerprints([...r.fingerprints.filter((f) => f.id !== input.fingerprint.id), copy(input.fingerprint)], r.arabic?.fingerprintId ?? null, keep);
  const fit = putEnglish(r.english, input.englishTrack, r.fingerprints, new Set([r.arabic?.fingerprintId ?? null, ...keep].filter(Boolean)));
  r.english = fit.english;
  r.fingerprints = fit.fingerprints;
  return r;
}

/**
 * إعادة تنزيل تصدير بصمته محفوظة (تدقيق V2، U-024): «آخر تنزيل» يُستنتج من أحدث البصمات (model/messages.js)، فتصير البصمة
 * المطابقة نفسها، بمعرّفها (فلا تنكسر مراجع الخانات ولا مقارناتها)، الأحدث: createdAt جديد لا يقل عن غيرها، وتنتقل إلى آخر القائمة
 * (الإسقاط عند الحد من الأقدم موضعًا). null إن لم توجد بصمة مطابقة أو كانت الأحدث أصلًا فلا كتابة.
 * @param {VideoRecord} record
 * @param {(f: Fingerprint) => boolean} matches
 * @param {string} now ISO
 * @returns {VideoRecord | null}
 */
export function withExportRefreshed(record, matches, now) {
  const i = record.fingerprints.findLastIndex(matches);
  if (i === -1) return null;
  const target = record.fingerprints[i];
  const others = record.fingerprints.filter((_, j) => j !== i);
  if (i === record.fingerprints.length - 1 && others.every((f) => f.createdAt <= target.createdAt)) return null;
  const newest = others.reduce((m, f) => (f.createdAt > m ? f.createdAt : m), now);
  const r = copy(record);
  r.fingerprints = [...others.map((f) => copy(f)), { ...copy(target), createdAt: newest }];
  r.updatedAt = now;
  return r;
}

/**
 * استيراد ملف عربي أو استبداله (عقد التوقيت §٦): يصبح الأصل المستورد، وتُصفَّر الإزاحة دائمًا.
 * وجود ترجمة سابقة دون replace=true يرمي ST_ARABIC_EXISTS (التأكيد شأن الواجهة).
 * @param {VideoRecord | null} record
 * @param {{
 *   videoId: string, title?: string | null, durationMs?: number | null, fileName: string, cues: Cue[],
 *   comparison?: ComparisonReport | null, fingerprintId?: string | null, notes?: string[],
 *   englishTrack?: EnglishTrack | null, displayModeDefault?: 'ar' | 'dual', lang?: string | null
 * }} input lang لغة الترجمة (AA1)
 * @param {string} now ISO
 * @param {{ replace?: boolean }} [opts]
 * @returns {{ record: VideoRecord, offsetWas: number, replaced: boolean }}
 */
export function withArabicImport(record, input, now, { replace = false } = {}) {
  if (record?.arabic && !replace) throw new TjError('ST_ARABIC_EXISTS');
  const fallbackMode = input.displayModeDefault ?? 'ar';
  const r = base(record, { ...input, displayMode: fallbackMode }, now);
  // المسار الملتقط مرجع اختياري للمحرّر: يُضاف إن لم يكن محفوظًا وكان في الحد متسع.
  const t = input.englishTrack;
  if (t && !r.english.some((x) => x.key === t.key) && r.english.length < LIMITS.maxEnglishTracks) {
    r.english = [...r.english, { ...t, cues: cloneCues(t.cues) }];
  }
  const offsetWas = r.view.displayOffsetMs;
  r.arabic = {
    fileName: input.fileName, importedAt: now, original: cloneCues(input.cues), current: null, editedAt: null,
    fingerprintId: input.fingerprintId ?? null, comparison: input.comparison ? copy(input.comparison) : null,
    notes: (input.notes ?? []).slice(),
  };
  // لغة الترجمة (AA1): رمزها أو null «غير محددة»؛ وغياب الحقل من المدخل (مستدعٍ قبل 2.0.0) لا يضيفه.
  if (input.lang !== undefined) r.arabic.lang = input.lang;
  r.view = { displayOffsetMs: 0, displayMode: r.view.displayMode === 'off' ? fallbackMode : r.view.displayMode };
  r.fingerprints = pruneFingerprints(r.fingerprints, r.arabic.fingerprintId);
  return { record: r, offsetWas, replaced: Boolean(record?.arabic) };
}

/**
 * الإزاحة ووضع العرض فقط (أزرار ± وقائمة العرض). لا يمس أي توقيت محفوظ.
 * @param {VideoRecord} record
 * @param {{ displayOffsetMs?: number, displayMode?: 'ar' | 'dual' | 'off' }} view
 * @param {string} now ISO
 */
export function withView(record, view, now) {
  const r = copy(record);
  r.view = { ...r.view, ...view };
  r.updatedAt = now;
  return r;
}

/**
 * حفظ المحرّر: المقاطع تصبح النسخة الحالية ويبقى الأصل. displayOffsetMs إن مُرِّر يُكتب في الخطوة نفسها
 * («تثبيت الإزاحة» يمرّر 0 مع المقاطع المنقولة، فلا يُحفظ أحدهما دون الآخر).
 * @param {VideoRecord} record
 * @param {{ cues: Cue[], displayOffsetMs?: number }} edit
 * @param {string} now ISO
 */
export function withArabicEdit(record, { cues, displayOffsetMs }, now) {
  if (!record?.arabic) throw new TjError('ST_NO_RECORD');
  const r = copy(record);
  r.arabic.current = cloneCues(cues);
  r.arabic.editedAt = now;
  if (displayOffsetMs !== undefined) r.view.displayOffsetMs = displayOffsetMs;
  r.updatedAt = now;
  return r;
}

/**
 * «استعادة الأصل»: تُسقط النسخة المعدّلة ويبقى الأصل المستورد.
 * @param {VideoRecord} record @param {string} now ISO
 */
export function withOriginalRestored(record, now) {
  if (!record?.arabic) throw new TjError('ST_NO_RECORD');
  const r = copy(record);
  r.arabic.current = null;
  r.arabic.editedAt = null;
  r.updatedAt = now;
  return r;
}

/**
 * حذف العربية وحدها: يبقى المسار الإنجليزي والبصمات، وتُصفَّر الإزاحة.
 * @param {VideoRecord} record @param {string} now ISO
 */
export function withoutArabic(record, now) {
  const r = copy(record);
  r.arabic = null;
  r.view = { ...r.view, displayOffsetMs: 0 };
  r.updatedAt = now;
  return r;
}
