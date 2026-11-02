// الترجمات الثلاث والنسخة السابقة ومفاتيح الحزمة (عقد data-model §١٠–§١١ و§١٥، وعقد storage §٧): مدققات صارمة للحزمة
// المنطقية ولكل قيمة مخزَّنة بجانب السجل. النشطة في السجل نفسه (record.arabic)، والسجل هو المرجع لخانتها.
import { isVideoId } from './ids.js';
import { validatePosition, validateMarks } from './marks.js';
import { isValidOffset } from './timing.js';
import { validateArabicTrack } from './tracks.js';
import { OK, exactKeys, fail, firstFailure, isIntIn, isIsoDate, isLine } from './validate.js';
import { RECORD_SCHEMA, validateVideoRecord } from './video.js';

export const SLOT_NUMBERS = Object.freeze([1, 2, 3]);
export const SLOT_NAME_MAX = 24;
export const COMPANION_SCHEMA = 1;

/**
 * @typedef {import('./tracks.js').ArabicTrack} ArabicTrack
 * @typedef {import('./video.js').VideoRecord} VideoRecord
 * @typedef {import('./marks.js').Mark} Mark
 * @typedef {import('./marks.js').Position} Position
 * @typedef {1 | 2 | 3} SlotNumber
 * @typedef {{ n: SlotNumber, name: string | null, track: ArabicTrack | null, offsetMs: number, marks: Mark[], position: Position | null }} SlotView
 * @typedef {{ from: SlotNumber, savedAt: string, track: ArabicTrack, offsetMs: number }} Previous
 * @typedef {{ videoId: string, record: VideoRecord, active: SlotNumber | null, slots: SlotView[], previous: Previous | null }} Bundle
 * @typedef {{ filled: number, edited: number, warned: number, marks: { todo: number, done: number } }} SortSummary
 * @typedef {{
 *   schema: 1, videoId: string, base: { rev: number, createdAt: string, updatedAt: string },
 *   active: SlotNumber | null, names: (string | null)[], summary: SortSummary
 * }} BundleHead
 * @typedef {{ track: ArabicTrack, offsetMs: number }} AltSlot
 */

/** @param {unknown} n */
export const isSlotNumber = (n) => n === 1 || n === 2 || n === 3;

/** @param {unknown} name @param {string} [path] */
export const validateSlotName = (name, path = 'name') => (name === null || isLine(name, SLOT_NAME_MAX) ? OK : fail(path, 'الاسم المختصر سطر من 1 إلى 24 محرفًا أو null'));

const triple = (list, path, each) => {
  if (!Array.isArray(list) || list.length !== 3) return fail(path, 'ليست ثلاثة عناصر');
  for (let i = 0; i < 3; i++) {
    const r = each(list[i], `${path}[${i}]`, i);
    if (!r.ok) return r;
  }
  return OK;
};

/** @param {unknown} a @param {string} [path] */
export function validateAltSlot(a, path = 'alt') {
  return firstFailure([
    () => exactKeys(a, ['track', 'offsetMs'], path),
    () => validateArabicTrack(a.track, `${path}.track`),
    () => (isValidOffset(a.offsetMs) ? OK : fail(`${path}.offsetMs`, 'إزاحة غير صالحة')),
  ]);
}

/** @param {unknown} p @param {string} [path] */
export function validatePrevious(p, path = 'previous') {
  if (p === null) return OK;
  return firstFailure([
    () => exactKeys(p, ['from', 'savedAt', 'track', 'offsetMs'], path),
    () => (isSlotNumber(p.from) ? OK : fail(`${path}.from`, 'رقم خانة غير صالح')),
    () => (isIsoDate(p.savedAt) ? OK : fail(`${path}.savedAt`, 'تاريخ غير صالح')),
    () => validateArabicTrack(p.track, `${path}.track`),
    () => (isValidOffset(p.offsetMs) ? OK : fail(`${path}.offsetMs`, 'إزاحة غير صالحة')),
  ]);
}

/** @param {unknown} s @param {string} [path] */
export function validateSummary(s, path = 'summary') {
  return firstFailure([
    () => exactKeys(s, ['filled', 'edited', 'warned', 'marks'], path),
    () => (isIntIn(s.filled, 0, 3) && isIntIn(s.edited, 0, 3) && isIntIn(s.warned, 0, 3) ? OK : fail(path, 'أعداد خانات غير صالحة')),
    () => exactKeys(s.marks, ['todo', 'done'], `${path}.marks`),
    () => (isIntIn(s.marks.todo, 0, 3 * 5000) && isIntIn(s.marks.done, 0, 3 * 5000) ? OK : fail(`${path}.marks`, 'أعداد علامات غير صالحة')),
  ]);
}

const companionHead = (v, keys, path) => firstFailure([
  () => exactKeys(v, ['schema', 'videoId', ...keys], path),
  () => (v.schema === COMPANION_SCHEMA ? OK : fail(`${path}.schema`, 'إصدار غير معروف')),
  () => (isVideoId(v.videoId) ? OK : fail(`${path}.videoId`, 'معرّف فيديو غير صالح')),
]);

/** رأس الحزمة `bundle:<id>`. @param {unknown} h */
export function validateHead(h, path = 'bundle') {
  return firstFailure([
    () => companionHead(h, ['base', 'active', 'names', 'summary'], path),
    () => exactKeys(h.base, ['rev', 'createdAt', 'updatedAt'], `${path}.base`),
    () => (isIntIn(h.base.rev, 1, Number.MAX_SAFE_INTEGER) && isIsoDate(h.base.createdAt) && isIsoDate(h.base.updatedAt) ? OK : fail(`${path}.base`, 'نسخة سجل غير صالحة')),
    () => (h.active === null || isSlotNumber(h.active) ? OK : fail(`${path}.active`, 'رقم خانة غير صالح')),
    () => triple(h.names, `${path}.names`, (x, p) => validateSlotName(x, p)),
    () => validateSummary(h.summary, `${path}.summary`),
  ]);
}

/** الترجمتان غير النشطتين `alts:<id>`. @param {unknown} v */
export function validateAltsValue(v, path = 'alts') {
  return firstFailure([
    () => companionHead(v, ['slots'], path),
    () => triple(v.slots, `${path}.slots`, (x, p) => (x === null ? OK : validateAltSlot(x, p))),
  ]);
}

/** النسخة السابقة `prev:<id>`. @param {unknown} v */
export function validatePrevValue(v, path = 'prev') {
  return firstFailure([() => companionHead(v, ['previous'], path), () => validatePrevious(v.previous, `${path}.previous`)]);
}

/** العلامات وآخر موضع `marks:<id>`. @param {unknown} v */
export function validateMarksValue(v, path = 'marks') {
  return firstFailure([
    () => companionHead(v, ['slots'], path),
    () => triple(v.slots, `${path}.slots`, (x, p) => firstFailure([
      () => exactKeys(x, ['marks', 'position'], p),
      () => validateMarks(x.marks, `${p}.marks`),
      () => validatePosition(x.position, `${p}.position`),
    ])),
  ]);
}

/** @param {unknown} s @param {number} n @param {string} path */
function validateSlotView(s, n, path) {
  return firstFailure([
    () => exactKeys(s, ['n', 'name', 'track', 'offsetMs', 'marks', 'position'], path),
    () => (s.n === n ? OK : fail(`${path}.n`, 'ترتيب الخانات غير صحيح')),
    () => validateSlotName(s.name, `${path}.name`),
    () => (s.track === null ? OK : validateArabicTrack(s.track, `${path}.track`)),
    () => (isValidOffset(s.offsetMs) ? OK : fail(`${path}.offsetMs`, 'إزاحة غير صالحة')),
    () => validateMarks(s.marks, `${path}.marks`),
    () => validatePosition(s.position, `${path}.position`),
    () => (s.track !== null || (s.name === null && s.offsetMs === 0 && !s.marks.length && s.position === null)
      ? OK : fail(path, 'الخانة الفارغة بلا اسم ولا إزاحة ولا علامات ولا موضع')),
  ]);
}

/**
 * الحزمة المنطقية وثوابتها (عقد data-model §١٠).
 * @param {unknown} b
 */
export function validateBundle(b) {
  const path = 'bundle';
  return firstFailure([
    () => exactKeys(b, ['videoId', 'record', 'active', 'slots', 'previous'], path),
    () => validateVideoRecord(b.record),
    () => (b.videoId === b.record.videoId ? OK : fail(`${path}.videoId`, 'لا يطابق السجل')),
    () => (b.active === null || isSlotNumber(b.active) ? OK : fail(`${path}.active`, 'رقم خانة غير صالح')),
    () => triple(b.slots, `${path}.slots`, (s, p, i) => validateSlotView(s, i + 1, p)),
    () => ((b.active === null) === (b.record.arabic === null) ? OK : fail(`${path}.active`, 'النشطة توجد مع ترجمة السجل وتغيب معها')),
    () => (b.active !== null || b.slots.every((s) => s.track === null) ? OK : fail(`${path}.slots`, 'لا نشطة وفي الخانات ترجمة')),
    () => (b.active === null || b.slots[b.active - 1].track !== null ? OK : fail(`${path}.active`, 'النشطة فارغة')),
    () => (b.active === null || JSON.stringify(b.slots[b.active - 1].track) === JSON.stringify(b.record.arabic) ? OK : fail(`${path}.active`, 'خانة النشطة لا تطابق السجل')),
    () => (b.active === null || b.slots[b.active - 1].offsetMs === b.record.view.displayOffsetMs ? OK : fail(`${path}.active`, 'إزاحة النشطة لا تطابق السجل')),
    () => validatePrevious(b.previous, `${path}.previous`),
    () => (b.record.schema === RECORD_SCHEMA ? OK : fail(`${path}.record.schema`, 'إصدار سجل غير معروف')),
  ]);
}
