// ما يكتبه المحرّر في التخزين (عقد التخزين §٦): حفظ النسخة الحالية وتثبيت الإزاحة واستعادة الأصل، كلها
// بـupdateVideo(id, fn, { expect: السجل المفتوح }) فيُرفض الحفظ بـST_CONFLICT إن تغيّر السجل من المشغّل أو
// تبويب آخر بعد فتحه. ما يصل من onChange بنسخة السجل المفتوح نفسها صدى كتابتنا فيُهمل.
import { TjError } from '../../core/errors/index.js';
import { editTransition } from '../../core/edit/index.js';
import { arabicCues } from '../../core/model/video.js';
import { withOriginalRestored } from '../../core/model/transitions.js';

/** @typedef {import('../../core/model/video.js').VideoRecord} VideoRecord */

const iso = (now) => new Date(now()).toISOString();

/** نسخة السجل كما يقارنها التخزين: rev وupdatedAt معًا. @param {VideoRecord | null | undefined} r */
export const versionOf = (r) => (r ? `${r.rev}@${r.updatedAt}` : 'none');

/**
 * ما يفتحه المحرّر من سجل: المقاطع الحالية (current ?? original) والإزاحة والبصمة المشار إليها.
 * @param {VideoRecord} record
 */
export function openedState(record) {
  if (!record?.arabic) throw new TjError('ST_NO_RECORD');
  const fp = record.arabic.fingerprintId ? record.fingerprints.find((f) => f.id === record.arabic.fingerprintId) ?? null : null;
  return {
    cues: arabicCues(record),
    original: record.arabic.original,
    edited: record.arabic.current !== null,
    offsetMs: record.view.displayOffsetMs,
    fingerprint: fp,
  };
}

/**
 * @param {ReturnType<import('../../core/store/index.js').createStore>} store
 * @param {string} videoId
 * @param {VideoRecord} opened السجل الذي فُتح عليه المحرّر
 * @param {{ cues: import('../../core/model/cue.js').Cue[], offsetChanged: boolean, offsetMs: number }} edit
 * @param {{ now?: () => number }} [env]
 * @returns {Promise<VideoRecord>}
 */
export function saveEdits(store, videoId, opened, { cues, offsetChanged, offsetMs }, { now = Date.now } = {}) {
  const at = iso(now);
  return store.updateVideo(videoId, (rec) => editTransition(rec, { cues, displayOffsetMs: offsetChanged ? offsetMs : undefined }, at), { expect: opened });
}

/**
 * «استعادة الأصل» بعد تأكيد المستخدم: تسقط النسخة المعدّلة المحفوظة ويبقى الأصل المستورد.
 * @param {ReturnType<import('../../core/store/index.js').createStore>} store @param {string} videoId @param {VideoRecord} opened
 * @param {{ now?: () => number }} [env]
 */
export function restoreOriginal(store, videoId, opened, { now = Date.now } = {}) {
  const at = iso(now);
  return store.updateVideo(videoId, (rec) => {
    if (!rec?.arabic) throw new TjError('ST_NO_RECORD');
    return withOriginalRestored(rec, at);
  }, { expect: opened });
}

/**
 * كيف يتعامل المحرّر مع تغيّر وصل من التخزين لسجل فيديوه.
 * @param {VideoRecord} opened @param {{ oldValue: VideoRecord | null, newValue: VideoRecord | null } | undefined} change
 * @returns {'none' | 'echo' | 'removed' | 'changed'}
 */
export function classifyChange(opened, change) {
  if (!change) return 'none';
  const next = change.newValue;
  if (!next || !next.arabic) return 'removed';
  return versionOf(next) === versionOf(opened) ? 'echo' : 'changed';
}
