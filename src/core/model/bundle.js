// انتقالات الحزمة النقية (عقد data-model §١٣): الترجمات الثلاث والنسخة السابقة والعلامات وآخر موضع، وجسر انتقالات
// الإصدار الأول، والتعبئة إلى مفاتيح التخزين والفك منها مع مصالحة ما يكتبه الأول (عقد storage §٧–§٩)، والتحويل إلى مدخل
// النسخة الاحتياطية ومنه (backup.md §٣). كل دالة تعيد حزمة جديدة ولا تغيّر مدخلها؛ والسجل هو المرجع لخانة النشطة.
import { trackComparison } from '../compare/current.js';
import { TjError } from '../errors/index.js';
import { cloneCues } from './cue.js';
import { markAnchor, markCounts, prepareCues, resolveMark, sameAnchor, validateMarks } from './marks.js';
import { isValidOffset } from './timing.js';
import { withArabicEdit, withArabicImport, withOriginalRestored, withoutArabic } from './transitions.js';
import { LIMITS, OK, exactKeys, fail, firstFailure, isLine } from './validate.js';
import {
  COMPANION_SCHEMA, SLOT_NAME_MAX, SLOT_NUMBERS, isSlotNumber, validateAltsValue, validateBundle, validateHead,
  validateMarksValue, validatePrevValue,
} from './slots.js';

/**
 * @typedef {import('./slots.js').Bundle} Bundle
 * @typedef {import('./slots.js').SlotView} SlotView
 * @typedef {import('./slots.js').SlotNumber} SlotNumber
 * @typedef {import('./slots.js').SortSummary} SortSummary
 * @typedef {import('./video.js').VideoRecord} VideoRecord
 * @typedef {import('./cue.js').Cue} Cue
 */

const copy = (x) => structuredClone(x);
const emptySlot = (n) => ({ n, name: null, track: null, offsetMs: 0, marks: [], position: null });

function slotOf(b, n) {
  if (!isSlotNumber(n)) throw new TjError('MD_INVALID', { detail: `slot=${n}` });
  return b.slots[n - 1];
}
function filledSlot(b, n) {
  const s = slotOf(b, n);
  if (!s.track) throw new TjError('ST_SLOT_EMPTY', { detail: `slot=${n}` });
  return s;
}
const lowestFilled = (b, except) => b.slots.find((s) => s.n !== except && s.track) ?? null;
const lowestEmpty = (b) => b.slots.find((s) => !s.track) ?? null;
const cuesOf = (track) => track.current ?? track.original;
/** استبدال الملف: الأصل المستورد لا يتغير إلا به (عقد data-model §٦)، وتاريخ الاستيراد معه. */
const isReplacement = (before, after) => after.importedAt !== before.importedAt || after.fileName !== before.fileName
  || JSON.stringify(after.original) !== JSON.stringify(before.original);

/** يجعل خانة n النشطة بمحتوى معطى في السجل (أو لا نشطة إن كان null). */
function setActive(b, n, track, offsetMs) {
  b.active = track ? n : null;
  b.record.arabic = track ? copy(track) : null;
  b.record.view = { ...b.record.view, displayOffsetMs: track ? offsetMs : 0 };
}

/**
 * يعيد ملء خانة النشطة من السجل (المرجع)، ويطبّع مراجع البصمات التي لم تعد في السجل، ويفرّغ ما يتبع الخانة الفارغة.
 * @param {Bundle} b يُعدَّل في مكانه
 * @returns {Bundle}
 */
export function syncActive(b) {
  const ids = new Set(b.record.fingerprints.map((f) => f.id));
  const norm = (t) => {
    if (t && t.fingerprintId !== null && !ids.has(t.fingerprintId)) t.fingerprintId = null;
  };
  norm(b.record.arabic);
  for (const s of b.slots) {
    if (s.n === b.active) {
      s.track = b.record.arabic ? copy(b.record.arabic) : null;
      s.offsetMs = b.record.view.displayOffsetMs;
    }
    norm(s.track);
    if (!s.track) Object.assign(s, emptySlot(s.n));
  }
  if (b.previous) norm(b.previous.track);
  return b;
}

/**
 * حزمة سجل لم يمسه الإصدار الثاني: النشطة في 1 إن وُجدت ترجمة.
 * @param {VideoRecord} record
 * @returns {Bundle}
 */
export function bundleFromRecord(record) {
  const r = copy(record);
  return syncActive({ videoId: r.videoId, record: r, active: r.arabic ? 1 : null, slots: SLOT_NUMBERS.map(emptySlot), previous: null });
}

/**
 * جسر انتقالات الإصدار الأول (المتحكم والصفحات القائمة عبر updateVideo): سجل جديد يُطبَّق على الحزمة.
 * @param {Bundle | null} bundle @param {VideoRecord} next @param {string} now ISO
 * @returns {Bundle}
 */
export function applyRecordChange(bundle, next, now) {
  if (!bundle) return bundleFromRecord(next);
  const b = syncActive(copy(bundle));
  const before = b.record.arabic;
  const beforeOffset = b.record.view.displayOffsetMs;
  const active = b.active;
  b.record = copy(next);
  const after = b.record.arabic;
  if (before && after && isReplacement(before, after)) {
    // استبدال النشطة من أي مسار: السابقة في الكتابة نفسها.
    b.previous = { from: active, savedAt: now, track: copy(before), offsetMs: beforeOffset };
  } else if (before && !after) {
    // حذف النشطة: يزول اسمها وعلاماتها، وتُفعَّل أصغر خانة ممتلئة غيرها بإزاحتها.
    b.slots[active - 1] = emptySlot(active);
    const other = lowestFilled(b, active);
    if (other) setActive(b, other.n, other.track, other.offsetMs);
    else b.active = null;
  } else if (!before && after) {
    b.active = lowestEmpty(b)?.n ?? 1;
  }
  return syncActive(b);
}

/**
 * تبديل الترجمة النشطة: كل ترجمة تحتفظ بنصها وتعديلاتها وإزاحتها ومرجعها.
 * @param {Bundle} bundle @param {SlotNumber} n @param {string} now
 */
export function withActiveSlot(bundle, n, now) {
  const b = syncActive(copy(bundle));
  const target = filledSlot(b, n);
  if (b.active === n) return b;
  setActive(b, n, target.track, target.offsetMs);
  b.record.updatedAt = now;
  return syncActive(b);
}

function newTrack(input, now) {
  const current = input.current ? cloneCues(input.current) : null;
  return {
    fileName: input.fileName, importedAt: now, original: cloneCues(input.cues), current, editedAt: current ? now : null,
    fingerprintId: input.fingerprintId ?? null, comparison: input.comparison ? copy(input.comparison) : null, notes: (input.notes ?? []).slice(),
  };
}

/**
 * ملف إلى خانة (عقد data-model §١٣): الممتلئة تحتاج replace وتحفظ السابقة، والجديدة بإزاحة صفر.
 * activate افتراضيه «نعم» للفارغة (Q16) و«لا» للممتلئة غير النشطة.
 * @param {Bundle | null} bundle @param {SlotNumber} n
 * @param {Parameters<typeof withArabicImport>[1] & { current?: Cue[] | null }} input
 * @param {string} now
 * @param {{ replace?: boolean, activate?: boolean }} [opts]
 * @returns {{ bundle: Bundle, replaced: boolean, offsetWas: number }}
 */
export function withSlotUpload(bundle, n, input, now, { replace = false, activate } = {}) {
  if (!isSlotNumber(n)) throw new TjError('MD_INVALID', { detail: `slot=${n}` });
  if (!bundle) {
    const { record } = withArabicImport(null, input, now);
    if (input.current) Object.assign(record.arabic, { current: cloneCues(input.current), editedAt: now });
    const b = bundleFromRecord(record);
    if (n !== 1) {
      b.slots[n - 1] = { ...b.slots[0], n };
      b.slots[0] = emptySlot(1);
      b.active = n;
    }
    return { bundle: syncActive(b), replaced: false, offsetWas: 0 };
  }
  const b = syncActive(copy(bundle));
  const target = slotOf(b, n);
  const filled = !!target.track;
  if (filled && !replace) throw new TjError('ST_ARABIC_EXISTS');
  const act = activate ?? !filled;
  const previous = filled ? { from: n, savedAt: now, track: copy(target.track), offsetMs: target.offsetMs } : b.previous;
  if (b.active === n || b.active === null) {
    // الخانة النشطة (أو لا ترجمة أصلًا): بقواعد استيراد الإصدار الأول نفسها (الإزاحة صفر، والمرجع الإنجليزي، والوضع).
    const { record, offsetWas } = withArabicImport({ ...b.record, arabic: null }, input, now);
    if (input.current) Object.assign(record.arabic, { current: cloneCues(input.current), editedAt: now });
    const wasActive = b.active === n;
    b.record = record;
    b.active = n;
    b.previous = previous;
    return { bundle: syncActive(b), replaced: filled, offsetWas: wasActive ? offsetWas : 0 };
  }
  // خانة غير نشطة: النشطة لا تتغير إلا بـactivate.
  const draft = withArabicImport({ ...b.record, arabic: null, view: { ...b.record.view } }, input, now).record;
  b.record.english = draft.english;
  b.record.title = draft.title;
  b.record.durationMs = draft.durationMs;
  b.record.updatedAt = now;
  target.track = newTrack(input, now);
  target.offsetMs = 0;
  b.previous = previous;
  if (act) {
    setActive(b, n, target.track, 0);
    if (b.record.view.displayMode === 'off') b.record.view.displayMode = input.displayModeDefault ?? 'ar';
  }
  return { bundle: syncActive(b), replaced: filled, offsetWas: 0 };
}

/**
 * حفظ المحرّر في خانته.
 * @param {Bundle} bundle @param {SlotNumber} n @param {{ cues: Cue[], displayOffsetMs?: number }} edit @param {string} now
 */
export function withSlotEdit(bundle, n, { cues, displayOffsetMs }, now) {
  const b = syncActive(copy(bundle));
  const s = filledSlot(b, n);
  if (displayOffsetMs !== undefined && !isValidOffset(displayOffsetMs)) throw new TjError('MD_INVALID', { detail: 'displayOffsetMs' });
  if (b.active === n) {
    b.record = withArabicEdit(b.record, { cues, displayOffsetMs }, now);
  } else {
    s.track.current = cloneCues(cues);
    s.track.editedAt = now;
    if (displayOffsetMs !== undefined) s.offsetMs = displayOffsetMs;
    b.record.updatedAt = now;
  }
  return syncActive(b);
}

/** «استعادة الأصل» لخانة. @param {Bundle} bundle @param {SlotNumber} n @param {string} now */
export function withSlotOriginalRestored(bundle, n, now) {
  const b = syncActive(copy(bundle));
  const s = filledSlot(b, n);
  if (b.active === n) b.record = withOriginalRestored(b.record, now);
  else {
    s.track.current = null;
    s.track.editedAt = null;
    b.record.updatedAt = now;
  }
  return syncActive(b);
}

/** إزاحة خانة (والنشطة عبر view). @param {Bundle} bundle @param {SlotNumber} n @param {number} offsetMs @param {string} now */
export function withSlotOffset(bundle, n, offsetMs, now) {
  if (!isValidOffset(offsetMs)) throw new TjError('MD_INVALID', { detail: 'offsetMs' });
  const b = syncActive(copy(bundle));
  const s = filledSlot(b, n);
  if (b.active === n) b.record.view = { ...b.record.view, displayOffsetMs: offsetMs };
  else s.offsetMs = offsetMs;
  b.record.updatedAt = now;
  return syncActive(b);
}

/**
 * حذف ترجمة واحدة باسمها وعلاماتها وموضعها؛ وحذف النشطة يفعّل أصغر خانة ممتلئة غيرها. السابقة تبقى.
 * @param {Bundle} bundle @param {SlotNumber} n @param {string} now
 */
export function withoutSlot(bundle, n, now) {
  const b = syncActive(copy(bundle));
  filledSlot(b, n);
  const wasActive = b.active === n;
  b.slots[n - 1] = emptySlot(n);
  if (wasActive) {
    const other = lowestFilled(b, n);
    if (other) setActive(b, other.n, other.track, other.offsetMs);
    else {
      b.record = withoutArabic(b.record, now);
      b.active = null;
    }
  }
  b.record.updatedAt = now;
  return syncActive(b);
}

/**
 * استعادة السابقة بتبديل قابل للعكس: محتوى خانتها الحالي يصبح السابقة.
 * @param {Bundle} bundle @param {string} now
 */
export function withPreviousRestored(bundle, now) {
  const b = syncActive(copy(bundle));
  const p = b.previous;
  if (!p) throw new TjError('ST_NO_PREVIOUS');
  const s = b.slots[p.from - 1];
  const swapped = s.track ? { from: p.from, savedAt: now, track: copy(s.track), offsetMs: s.offsetMs } : null;
  if (b.active === p.from || b.active === null) setActive(b, p.from, p.track, p.offsetMs);
  else {
    s.track = copy(p.track);
    s.offsetMs = p.offsetMs;
  }
  b.previous = swapped;
  b.record.updatedAt = now;
  return syncActive(b);
}

/** حذف السابقة. @param {Bundle} bundle */
export function withoutPrevious(bundle) {
  const b = syncActive(copy(bundle));
  if (!b.previous) throw new TjError('ST_NO_PREVIOUS');
  b.previous = null;
  return b;
}

/**
 * مرجع المقارنة لخانة: بصمة محفوظة في السجل أو null.
 * @param {Bundle} bundle @param {SlotNumber} n
 * @param {{ fingerprintId: string | null, comparison: import('./tracks.js').ComparisonReport | null }} ref
 */
export function withSlotReference(bundle, n, { fingerprintId, comparison }, now) {
  const b = syncActive(copy(bundle));
  const s = filledSlot(b, n);
  if (fingerprintId !== null && !b.record.fingerprints.some((f) => f.id === fingerprintId)) throw new TjError('MD_INVALID', { detail: 'البصمة غير محفوظة' });
  const t = b.active === n ? b.record.arabic : s.track;
  t.fingerprintId = fingerprintId;
  t.comparison = comparison ? copy(comparison) : null;
  if (now) b.record.updatedAt = now;
  return syncActive(b);
}

/**
 * الاسم المختصر (يُشذَّب؛ الفارغ يزيله).
 * @param {Bundle} bundle @param {SlotNumber} n @param {string | null} name
 */
export function withSlotName(bundle, n, name) {
  const b = syncActive(copy(bundle));
  const s = filledSlot(b, n);
  const v = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : null;
  if (v && !isLine(v, SLOT_NAME_MAX)) throw new TjError('MD_INVALID', { detail: 'الاسم المختصر' });
  s.name = v || null;
  return b;
}

/**
 * يعلّم مقطعًا أو يزيل علامته (kind = null). العلامات التي تُحل إلى هذا المقطع تُستبدل بعلامة مرتبطة واحدة.
 * @param {Bundle} bundle @param {SlotNumber} n
 * @param {{ index: number, kind: 'todo' | 'done' | null }} target رقم المقطع في مقاطع الخانة المعروضة (current ?? original)
 * @param {string} now
 * @returns {{ bundle: Bundle, before: import('./marks.js').Mark[], mark: import('./marks.js').Mark | null }}
 */
export function withMark(bundle, n, { index, kind }, now) {
  const b = syncActive(copy(bundle));
  const s = filledSlot(b, n);
  const cues = cuesOf(s.track);
  const cue = cues[index];
  if (!cue) throw new RangeError(`لا مقطع بالرقم ${index}`);
  if (kind !== null && kind !== 'todo' && kind !== 'done') throw new TjError('MD_INVALID', { detail: `kind=${kind}` });
  const prep = prepareCues(cues);
  const before = s.marks.filter((m) => resolveMark(m, cues, prep).index === index);
  s.marks = s.marks.filter((m) => !before.includes(m));
  const mark = kind ? { ...markAnchor(cue), kind, at: now } : null;
  if (mark) {
    if (s.marks.length >= LIMITS.maxMarks) throw new TjError('MD_INVALID', { detail: 'حد العلامات' });
    s.marks.push(mark);
    s.marks.sort((x, y) => x.startMs - y.startMs || x.n - y.n);
  }
  b.record.updatedAt = now;
  return { bundle: b, before: copy(before), mark: mark ? copy(mark) : null };
}

/**
 * تراجع دقيق عن علامة: يزيل علامات بمراسيها ويضيف أخرى كما هي.
 * @param {Bundle} bundle @param {SlotNumber} n
 * @param {{ remove: { n: number, startMs: number, textHash: string }[], add: import('./marks.js').Mark[] }} change
 */
export function withMarksReplaced(bundle, n, { remove = [], add = [] }, now) {
  const b = syncActive(copy(bundle));
  const s = filledSlot(b, n);
  s.marks = s.marks.filter((m) => !remove.some((r) => sameAnchor(m, r)) && !add.some((a) => sameAnchor(m, a)));
  s.marks.push(...copy(add));
  s.marks.sort((x, y) => x.startMs - y.startMs || x.n - y.n);
  const r = validateMarks(s.marks, 'marks');
  if (!r.ok) throw new TjError('MD_INVALID', { detail: `${r.path} — ${r.reason}` });
  if (now) b.record.updatedAt = now;
  return b;
}

/**
 * آخر موضع لخانة (أو null لإزالته).
 * @param {Bundle} bundle @param {SlotNumber} n @param {number | null} index @param {string} now
 */
export function withPosition(bundle, n, index, now) {
  const b = syncActive(copy(bundle));
  const s = filledSlot(b, n);
  if (index === null) s.position = null;
  else {
    const cue = cuesOf(s.track)[index];
    if (!cue) throw new RangeError(`لا مقطع بالرقم ${index}`);
    s.position = { n: cue.n, startMs: cue.startMs, at: now };
  }
  b.record.updatedAt = now;
  return b;
}

/**
 * بصمات تشير إليها الترجمات غير النشطة والسابقة: تمرَّر keep إلى withExport فلا يسقطها حد البصمات.
 * @param {Bundle | null} b
 * @returns {string[]}
 */
export function referencedFingerprints(b) {
  if (!b) return [];
  const ids = b.slots.filter((s) => s.n !== b.active && s.track?.fingerprintId).map((s) => s.track.fingerprintId);
  if (b.previous?.track.fingerprintId) ids.push(b.previous.track.fingerprintId);
  return [...new Set(ids)];
}

// التحذير للنسخة المعروضة الآن (trackComparison)، لا لتقرير الاستيراد وحده (R46: لا حالة تتقادم؛ تدقيق 5fedcb9، GM-013).
const warnedTrack = (t, fingerprints) => {
  const c = trackComparison(t, fingerprints);
  return !!c && (c.missing.length > 0 || c.extra.length > 0 || c.drift.length > 0);
};

/** ملخص الفرز (عقد data-model §١٥). @param {Bundle} b @returns {SortSummary} */
export function summarizeBundle(b) {
  const filled = b.slots.filter((s) => s.track);
  const marks = filled.map((s) => markCounts(s.marks));
  return {
    filled: filled.length,
    edited: filled.filter((s) => s.track.current !== null).length,
    warned: filled.filter((s) => warnedTrack(s.track, b.record.fingerprints)).length,
    marks: { todo: marks.reduce((a, m) => a + m.todo, 0), done: marks.reduce((a, m) => a + m.done, 0) },
  };
}

/**
 * نماذج 1 2 3 للواجهة (SlotModel في src/ui/components.js) ومعها التعديل والعدد.
 * @param {Bundle | null} b
 */
export function slotModels(b) {
  if (!b) return SLOT_NUMBERS.map((n) => ({ n, filled: false, active: false, name: null, edited: false, cueCount: 0 }));
  return b.slots.map((s) => ({
    n: s.n, filled: !!s.track, active: b.active === s.n, name: s.name,
    edited: !!s.track && s.track.current !== null, cueCount: s.track ? cuesOf(s.track).length : 0,
  }));
}

/** حزمة يمثّلها الإصدار الأول كاملة: لا تحتاج مفاتيح جديدة. @param {Bundle} b */
export function isTrivialBundle(b) {
  return (b.active === null || b.active === 1) && !b.slots[1].track && !b.slots[2].track && b.previous === null
    && b.slots.every((s) => s.name === null && s.marks.length === 0 && s.position === null);
}

/**
 * تعبئة الحزمة إلى قيم مفاتيح التخزين (عقد storage §٧). base يضبطها التخزين بعد rev.
 * @param {Bundle} b
 */
export function packBundle(b) {
  const { videoId } = b;
  return {
    record: b.record,
    head: { schema: COMPANION_SCHEMA, videoId, base: null, active: b.active, names: b.slots.map((s) => s.name), summary: summarizeBundle(b) },
    alts: { schema: COMPANION_SCHEMA, videoId, slots: b.slots.map((s) => (s.n === b.active || !s.track ? null : { track: s.track, offsetMs: s.offsetMs })) },
    prev: { schema: COMPANION_SCHEMA, videoId, previous: b.previous },
    marks: { schema: COMPANION_SCHEMA, videoId, slots: b.slots.map((s) => ({ marks: s.marks, position: s.position })) },
  };
}

/** القيمة الفارغة لكل تابع: لا حاجة إلى كتابتها إن لم يكن مفتاحها موجودًا. */
export const isEmptyCompanion = (kind, v) => (kind === 'alts' ? v.slots.every((x) => x === null)
  : kind === 'prev' ? v.previous === null
    : v.slots.every((x) => !x.marks.length && x.position === null));

/**
 * الفك من قيم المفاتيح مع المصالحة (عقد storage §٩). القيم بعد تحقق التخزين منها.
 * @param {{ record: VideoRecord | null, head: object | null, alts: object | null, prev: object | null, marks: object | null }} raw
 * @returns {{ bundle: Bundle | null, changed: boolean, orphan: boolean, reason: string | null }}
 */
export function unpackBundle({ record, head, alts, prev, marks }) {
  if (!record) return { bundle: null, changed: false, orphan: !!(head || alts || prev || marks), reason: null };
  if (!head) return { bundle: bundleFromRecord(record), changed: false, orphan: false, reason: null };
  if (head.base.createdAt !== record.createdAt) return { bundle: bundleFromRecord(record), changed: true, orphan: false, reason: 'recreated' };
  const b = {
    videoId: record.videoId,
    record: copy(record),
    active: head.active,
    slots: SLOT_NUMBERS.map((n) => ({
      n,
      name: head.names[n - 1],
      track: alts?.slots[n - 1]?.track ? copy(alts.slots[n - 1].track) : null,
      offsetMs: alts?.slots[n - 1]?.offsetMs ?? 0,
      marks: copy(marks?.slots[n - 1]?.marks ?? []),
      position: copy(marks?.slots[n - 1]?.position ?? null),
    })),
    previous: prev?.previous ? copy(prev.previous) : null,
  };
  const matches = head.base.rev === record.rev && head.base.updatedAt === record.updatedAt;
  let changed = !matches;
  if (!record.arabic && b.active !== null) {
    // حذف الأول العربية: تزول النشطة، وتُفعَّل أصغر خانة ممتلئة غيرها بإزاحتها.
    const gone = b.active;
    b.slots[gone - 1] = emptySlot(gone);
    const other = lowestFilled(b, gone);
    if (other) setActive(b, other.n, other.track, other.offsetMs);
    else b.active = null;
    changed = true;
  } else if (record.arabic && b.active === null) {
    b.active = lowestEmpty(b)?.n ?? 1;
    changed = true;
  }
  return { bundle: syncActive(b), changed, orphan: false, reason: changed ? (matches ? 'repair' : 'v1-write') : null };
}

/** مدققات قيم المفاتيح الجديدة، بمفتاحها. */
export const COMPANION_VALIDATORS = Object.freeze({ head: validateHead, alts: validateAltsValue, prev: validatePrevValue, marks: validateMarksValue });

/**
 * مدخل النسخة الاحتياطية من الحزمة (backup.md §٣).
 * @param {Bundle} bundle @param {{ includePrevious?: boolean }} [opts]
 */
export function bundleToBackup(bundle, { includePrevious = true } = {}) {
  const p = packBundle(syncActive(copy(bundle)));
  return {
    record: p.record, active: p.head.active, names: p.head.names, alts: p.alts.slots,
    previous: includePrevious ? p.prev.previous : null, marks: p.marks.slots,
  };
}

/**
 * الحزمة من مدخل نسخة احتياطية، بمدققات النموذج وثوابت الحزمة.
 * @param {unknown} entry
 * @returns {{ ok: true, bundle: Bundle } | { ok: false, path: string, reason: string }}
 */
export function bundleFromBackup(entry) {
  const shape = firstFailure([
    () => exactKeys(entry, ['record', 'active', 'names', 'alts', 'previous', 'marks'], 'entry'),
    () => (entry.record && typeof entry.record === 'object' && typeof entry.record.videoId === 'string' ? OK : fail('entry.record', 'ليس سجلًا')),
  ]);
  if (!shape.ok) return shape;
  const videoId = entry.record.videoId;
  const head = { schema: COMPANION_SCHEMA, videoId, base: { rev: entry.record.rev, createdAt: entry.record.createdAt, updatedAt: entry.record.updatedAt }, active: entry.active, names: entry.names, summary: { filled: 0, edited: 0, warned: 0, marks: { todo: 0, done: 0 } } };
  const alts = { schema: COMPANION_SCHEMA, videoId, slots: entry.alts };
  const prev = { schema: COMPANION_SCHEMA, videoId, previous: entry.previous };
  const marks = { schema: COMPANION_SCHEMA, videoId, slots: entry.marks };
  for (const [k, v] of Object.entries({ head, alts, prev, marks })) {
    const r = COMPANION_VALIDATORS[k](v, `entry.${k}`);
    if (!r.ok) return r;
  }
  if (entry.active !== null && entry.alts[entry.active - 1] !== null) return fail('entry.alts', 'خانة النشطة في السجل وحده');
  const { bundle } = unpackBundle({ record: entry.record, head, alts, prev, marks });
  const r = validateBundle(bundle);
  if (!r.ok) return r;
  // ثوابت الحزمة بلا تطبيع صامت: ما لا يعود مدخلًا مطابقًا (اسم أو علامات لخانة فارغة، أو مرجع بصمة غائبة، أو نشطة بلا
  // ترجمة) تالفٌ يُعرض «تعذّر» بسببه، لا يُصلَح بإسقاط بعضه (backup.md §٥؛ تدقيق 5fedcb9، GM-015.4).
  const back = bundleToBackup(bundle, { includePrevious: entry.previous !== null });
  for (const k of ['record', 'active', 'names', 'alts', 'previous', 'marks']) {
    if (canonical(back[k]) !== canonical(entry[k])) return fail(`entry.${k}`, 'لا يطابق ثوابت الحزمة');
  }
  return { ok: true, bundle };
}

/** JSON بمفاتيح مرتبة: مقارنة بنيوية لا تتأثر بترتيب المفاتيح. */
const canonical = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
