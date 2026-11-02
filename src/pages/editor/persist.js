// ما يكتبه المحرّر في التخزين (عقد التخزين §١١): خانة التحرير وعلاماتها وآخر موضعها ومرجعها، كلها بـupdateBundle(id, fn,
// { expect: الحزمة المفتوحة }) فيُرفض الحفظ بـST_CONFLICT إن تغيّرت الحزمة (السجل أو أي تابع له) من المشغّل أو تبويب آخر
// بعد فتحها. والنشطة لا تتغير من هنا أبدًا: الحفظ في الخانة نفسها. ما يصل من onChange بنسخة الحزمة المفتوحة نفسها صدى
// كتابتنا فيُهمل؛ وتغيّرٌ لا يمس محتوى خانة التحرير (علامة من المشغّل، أو خانة أخرى) يُتبنّى دون تعارض.
import { TjError } from '../../core/errors/index.js';
import { slotEditTransition } from '../../core/edit/index.js';
import { withMarksReplaced, withPosition, withSlotOriginalRestored, withSlotReference } from '../../core/model/bundle.js';

/** @typedef {import('../../core/model/slots.js').Bundle} Bundle */
/** @typedef {import('../../core/model/video.js').VideoRecord} VideoRecord */
/** @typedef {ReturnType<typeof import('../../core/store/index.js').createStore>} Store */

const iso = (now) => new Date(now()).toISOString();

/** نسخة الحزمة كما يقارنها التخزين: نسخة سجلها (rev وupdatedAt معًا). @param {Bundle | VideoRecord | null | undefined} x */
export const versionOf = (x) => {
  const r = x && 'record' in x ? x.record : x;
  return r ? `${r.rev}@${r.updatedAt}` : 'none';
};

/**
 * خانة التحرير من معامل t في عنوان المحرّر (editor.html?v=ID&t=2)، أو null.
 * @param {string} search مثل location.search
 * @returns {1 | 2 | 3 | null}
 */
export function slotParam(search) {
  const t = new URLSearchParams(search).get('t');
  return t === '1' || t === '2' || t === '3' ? /** @type {1 | 2 | 3} */ (Number(t)) : null;
}

/**
 * الخانة التي تُفتح: المطلوبة إن كانت ممتلئة، وإلا النشطة (وfallback يبيّن أن المطلوبة لم تُفتح).
 * @param {Bundle | null} bundle @param {1 | 2 | 3 | null} requested
 * @returns {{ n: 1 | 2 | 3 | null, fallback: boolean }}
 */
export function pickSlot(bundle, requested) {
  if (!bundle || bundle.active === null) return { n: null, fallback: requested !== null };
  if (requested && bundle.slots[requested - 1].track) return { n: requested, fallback: false };
  return { n: bundle.active, fallback: requested !== null };
}

/**
 * ما يفتحه المحرّر من خانة: المقاطع الحالية (current ?? original) وإزاحتها وبصمتها المشار إليها وعلاماتها وموضعها.
 * @param {Bundle} bundle @param {1 | 2 | 3} n
 */
export function openedSlot(bundle, n) {
  const slot = bundle?.slots?.[n - 1];
  if (!slot?.track) throw new TjError(bundle ? 'ST_SLOT_EMPTY' : 'ST_NO_RECORD', { detail: `slot=${n}` });
  const t = slot.track;
  const fp = t.fingerprintId ? bundle.record.fingerprints.find((f) => f.id === t.fingerprintId) ?? null : null;
  return {
    n, track: t, cues: t.current ?? t.original, original: t.original, edited: t.current !== null, offsetMs: slot.offsetMs,
    fingerprint: fp, name: slot.name, marks: slot.marks, position: slot.position, active: bundle.active === n,
  };
}

/** كتابة على الحزمة المفتوحة وحدها: تغيّرها منذ الفتح ST_CONFLICT، وغيابها ST_NO_RECORD. */
function write(store, videoId, opened, fn) {
  return store.updateBundle(videoId, (b) => {
    if (!b) throw new TjError('ST_NO_RECORD');
    return fn(b);
  }, { expect: opened });
}

/**
 * «حفظ»: الخانة n بمقاطعها، والإزاحة إن ثُبّتت في الخطوة نفسها. النشطة لا تتغير.
 * @param {Store} store @param {string} videoId @param {Bundle} opened @param {1 | 2 | 3} n
 * @param {{ cues: import('../../core/model/cue.js').Cue[], offsetChanged: boolean, offsetMs: number }} edit
 * @param {{ now?: () => number }} [env]
 * @returns {Promise<Bundle>}
 */
export function saveSlot(store, videoId, opened, n, { cues, offsetChanged, offsetMs }, { now = Date.now } = {}) {
  const at = iso(now);
  return write(store, videoId, opened, (b) => slotEditTransition(b, n, { cues, displayOffsetMs: offsetChanged ? offsetMs : undefined }, at));
}

/** «استعادة الأصل» لخانة بعد تأكيد المستخدم. @param {Store} store @param {string} videoId @param {Bundle} opened @param {1 | 2 | 3} n */
export function restoreSlotOriginal(store, videoId, opened, n, { now = Date.now } = {}) {
  const at = iso(now);
  return write(store, videoId, opened, (b) => withSlotOriginalRestored(b, n, at));
}

/**
 * علامات الخانة: إزالة بمراسيها وإضافة كما هي (التبديل وتراجعه الدقيق، عقد data-model §١٣).
 * @param {Store} store @param {string} videoId @param {Bundle} opened @param {1 | 2 | 3} n
 * @param {{ remove: { n: number, startMs: number, textHash: string }[], add: import('../../core/model/marks.js').Mark[] }} change
 */
export function writeMarks(store, videoId, opened, n, change, { now = Date.now } = {}) {
  const at = iso(now);
  return write(store, videoId, opened, (b) => withMarksReplaced(b, n, change, at));
}

/**
 * آخر موضع للخانة بموضع مقطع في مقاطعها المحفوظة (أو null). يُكتب عند نقاط طبيعية لا مع كل تمرير.
 * @param {Store} store @param {string} videoId @param {Bundle} opened @param {1 | 2 | 3} n @param {number | null} index
 */
export function writePosition(store, videoId, opened, n, index, { now = Date.now } = {}) {
  const at = iso(now);
  return write(store, videoId, opened, (b) => withPosition(b, n, index, at));
}

/**
 * مرجع المقارنة للخانة (R50): بصمة محفوظة في السجل أو null، ومعها التقرير المحسوب بها. يُحفظ بفعل صريح.
 * @param {Store} store @param {string} videoId @param {Bundle} opened @param {1 | 2 | 3} n
 * @param {{ fingerprintId: string | null, comparison: import('../../core/model/tracks.js').ComparisonReport | null }} ref
 */
export function writeReference(store, videoId, opened, n, ref, { now = Date.now } = {}) {
  const at = iso(now);
  return write(store, videoId, opened, (b) => withSlotReference(b, n, ref, at));
}

/**
 * كيف يتعامل المحرّر مع تغيّر وصل من التخزين لسجل فيديوه.
 * @param {Bundle} opened @param {{ oldValue: VideoRecord | null, newValue: VideoRecord | null } | undefined} change
 * @returns {'none' | 'echo' | 'removed' | 'changed'}
 */
export function classifyChange(opened, change) {
  if (!change) return 'none';
  const next = change.newValue;
  if (!next || !next.arabic) return 'removed';
  return versionOf(next) === versionOf(opened) ? 'echo' : 'changed';
}

/**
 * هل تغيّر ما يحرّره المحرّر في الخانة n (نصها وأصلها وتعديلها المحفوظ وإزاحتها) بين حزمتين؟ وتغيّر غيره (العلامات،
 * والمرجع، والاسم، والنشطة، والخانات الأخرى) لا يعارض تعديلات غير محفوظة.
 * @param {Bundle} a @param {Bundle | null} b @param {1 | 2 | 3} n
 */
export function slotContentChanged(a, b, n) {
  const x = a?.slots?.[n - 1];
  const y = b?.slots?.[n - 1];
  if (!x?.track || !y?.track) return Boolean(x?.track) !== Boolean(y?.track);
  const content = (s) => JSON.stringify([s.offsetMs, s.track.fileName, s.track.importedAt, s.track.editedAt, s.track.original, s.track.current]);
  return content(x) !== content(y);
}
