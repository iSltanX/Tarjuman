// انتقالات سجل الفيديو النقية (عقد interfaces §٥): يستعملها المتحكم في المشغّل، والمحفوظات، والمحرّر،
// فتبقى القواعد واحدة أينما حُفظ السجل. كل دالة تعيد سجلًا جديدًا ولا تغيّر مدخلها، والتخزين يتحقق ويضبط rev.
import { TjError } from '../errors/index.js';
import { cloneCues } from './cue.js';
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

/** يبقي آخر LIMITS.maxFingerprints بصمة، ولا يسقط البصمة التي تشير إليها الترجمة العربية. */
function pruneFingerprints(list, keepId) {
  const out = list.slice();
  while (out.length > LIMITS.maxFingerprints) {
    const i = out.findIndex((f) => f.id !== keepId);
    out.splice(i, 1);
  }
  return out;
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
 * @returns {VideoRecord}
 */
export function withExport(record, input, now) {
  const r = base(record, input, now);
  const t = input.englishTrack;
  r.english = [...r.english.filter((x) => x.key !== t.key), { ...t, cues: cloneCues(t.cues) }];
  r.fingerprints = pruneFingerprints([...r.fingerprints.filter((f) => f.id !== input.fingerprint.id), copy(input.fingerprint)], r.arabic?.fingerprintId ?? null);
  return r;
}

/**
 * استيراد ملف عربي أو استبداله (عقد التوقيت §٦): يصبح الأصل المستورد، وتُصفَّر الإزاحة دائمًا.
 * وجود ترجمة سابقة دون replace=true يرمي ST_ARABIC_EXISTS (التأكيد شأن الواجهة).
 * @param {VideoRecord | null} record
 * @param {{
 *   videoId: string, title?: string | null, durationMs?: number | null, fileName: string, cues: Cue[],
 *   comparison?: ComparisonReport | null, fingerprintId?: string | null, notes?: string[],
 *   englishTrack?: EnglishTrack | null, displayModeDefault?: 'ar' | 'dual'
 * }} input
 * @param {string} now ISO
 * @param {{ replace?: boolean }} [opts]
 * @returns {{ record: VideoRecord, offsetWas: number, replaced: boolean }}
 */
export function withArabicImport(record, input, now, { replace = false } = {}) {
  if (record?.arabic && !replace) throw new TjError('ST_ARABIC_EXISTS');
  const fallbackMode = input.displayModeDefault ?? 'ar';
  const r = base(record, { ...input, displayMode: fallbackMode }, now);
  const t = input.englishTrack;
  if (t && !r.english.some((x) => x.key === t.key)) r.english = [...r.english, { ...t, cues: cloneCues(t.cues) }];
  const offsetWas = r.view.displayOffsetMs;
  r.arabic = {
    fileName: input.fileName, importedAt: now, original: cloneCues(input.cues), current: null, editedAt: null,
    fingerprintId: input.fingerprintId ?? null, comparison: input.comparison ? copy(input.comparison) : null,
    notes: (input.notes ?? []).slice(),
  };
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
