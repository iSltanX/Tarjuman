// جلسة التحرير: نسخة عمل من المقاطع وإزاحة العرض فوق ما فُتح، وتاريخ تراجع وإعادة قبل الحفظ (R27). كل فعل
// خطوة واحدة، والمرفوض لا يغيّر شيئًا ولا يُسجَّل. الأصل المفتوح لا يُمس، ولا حفظ هنا: الصفحة تحفظ ما تعطيه
// snapshot() بالانتقالات. عقد التوقيت: ± يغيّر المحفوظ لنطاق بـshiftCues، و«تثبيت الإزاحة» بـcommitOffset
// يغيّر المقاطع والإزاحة معًا في خطوة واحدة، فلا تُطبَّق الإزاحة مرتين.
//
// الذاكرة على قدر التغيير لا الملف: النص والزمن والاستعادة تحفظ المقاطع المتغيرة وحدها، والنقل والتثبيت يحفظان
// المقدار والنطاق (عكسهما نقل بالمقدار المعاكس، وهو دقيق لأن الأزمنة أعداد صحيحة).
import { applyRestoreTiming, canRestore } from '../compare/index.js';
import { commitOffset as commitOffsetCues, shiftCues } from '../model/timing.js';
import { findIssues } from './issues.js';

/** @typedef {{ n: number, startMs: number, endMs: number, text: string }} Cue */
/** @typedef {{ kind: 'cue', index: number } | { kind: 'selection', indices: number[] } | { kind: 'all' }} Scope */
/**
 * @typedef {'text' | 'time' | 'shift' | 'commit' | 'restore'} EditKind
 * @typedef {{ kind: EditKind, patch?: [number, Cue, Cue][], indices?: number[] | null, delta?: number, offset?: [number, number], group?: string }} Entry
 * @typedef {{ kind: EditKind, indices: number[] | null, offset: boolean, version: number, undo?: boolean, redo?: boolean }} ChangeEvent
 */

const freezeCue = ({ n, startMs, endMs, text }) => Object.freeze({ n, startMs, endMs, text });
const sameCue = (a, b) => a === b || (a.n === b.n && a.startMs === b.startMs && a.endMs === b.endMs && a.text === b.text);

/**
 * فهارس النطاق مرتبة بلا تكرار، أو null للملف كله.
 * @param {Scope} scope @param {number} count
 * @returns {number[] | null}
 */
export function resolveScope(scope, count) {
  const check = (i) => {
    if (!Number.isInteger(i) || i < 0 || i >= count) throw new RangeError(`موضع خارج الملف: ${i}`);
    return i;
  };
  if (scope?.kind === 'all') return null;
  if (scope?.kind === 'cue') return [check(scope.index)];
  if (scope?.kind === 'selection') {
    if (!Array.isArray(scope.indices) || !scope.indices.length) throw new RangeError('لا مقاطع محددة');
    return [...new Set(scope.indices.map(check))].sort((a, b) => a - b);
  }
  throw new RangeError('نطاق غير معروف');
}

/**
 * @param {{ cues: Cue[], offsetMs?: number, maxHistory?: number }} o
 */
export function createEditSession({ cues, offsetMs = 0, maxHistory = 200 }) {
  let base = Object.freeze(cues.map(freezeCue));
  let baseOffset = offsetMs;
  /** @type {Cue[]} */
  let work = base.slice();
  let offset = offsetMs;
  const changed = new Set();
  /** @type {Entry[]} */
  let undoStack = [];
  /** @type {Entry[]} */
  let redoStack = [];
  let openGroup = null;
  const drafts = new Map();
  let version = 0;
  let issuesCache = null;
  const listeners = new Set();

  const mark = (i) => {
    if (sameCue(work[i], base[i])) changed.delete(i);
    else changed.add(i);
  };
  const markAll = () => {
    changed.clear();
    for (let i = 0; i < work.length; i++) if (!sameCue(work[i], base[i])) changed.add(i);
  };
  const clearDrafts = (indices) => {
    if (indices === null) drafts.clear();
    else for (const i of indices) for (const f of ['start', 'end']) drafts.delete(`${i}:${f}`);
  };
  /** @param {Omit<ChangeEvent, 'version'>} e */
  const emit = (e) => {
    version++;
    issuesCache = null;
    const event = { ...e, version };
    for (const fn of listeners) fn(event);
  };
  const push = (entry) => {
    undoStack.push(entry);
    if (undoStack.length > maxHistory) undoStack.splice(0, undoStack.length - maxHistory);
    redoStack = [];
  };
  const checkIndex = (i) => {
    if (!Number.isInteger(i) || i < 0 || i >= work.length) throw new RangeError(`موضع خارج الملف: ${i}`);
  };

  /** يطبّق رقعة [موضع، قبل، بعد] في اتجاه. */
  const applyPatch = (patch, forward) => {
    for (const [i, before, after] of patch) {
      work[i] = forward ? after : before;
      mark(i);
    }
    return patch.map(([i]) => i);
  };

  /** ينقل فهارس (أو الملف كله) بمقدار؛ يرفض كله إن أنتج زمنًا سالبًا. */
  const moveBy = (indices, delta) => {
    const subset = indices === null ? work : indices.map((i) => work[i]);
    const r = shiftCues(subset, delta);
    if (!r.ok) return r;
    // shiftCues يعيد نسخًا جديدة بالمفاتيح الأربعة نفسها، فتُجمَّد كما هي دون نسخة ثانية.
    if (indices === null) work = r.cues.map(Object.freeze);
    else indices.forEach((i, k) => { work[i] = Object.freeze(r.cues[k]); });
    if (indices === null) markAll();
    else indices.forEach(mark);
    return r;
  };

  /** يعكس خطوة أو يعيدها. */
  const replay = (entry, forward) => {
    if (entry.patch) return applyPatch(entry.patch, forward);
    const r = moveBy(entry.indices, forward ? entry.delta : -entry.delta);
    if (!r.ok) throw new Error('تاريخ التحرير غير متسق');
    if (entry.offset) offset = forward ? entry.offset[1] : entry.offset[0];
    return entry.indices;
  };

  /** تعديل مقطع واحد برقعة؛ والكتابة المتتابعة في المجموعة نفسها تُدمج في خطوة واحدة. */
  const editOne = (kind, i, next, group) => {
    const before = work[i];
    if (sameCue(before, next)) return { ok: true, changed: false };
    const after = freezeCue(next);
    const top = undoStack[undoStack.length - 1];
    if (group && openGroup === group && top?.group === group && !redoStack.length) {
      top.patch[0][2] = after;
      // كتابة أعادت النص إلى ما كان قبل المجموعة: لا خطوة فارغة في التاريخ.
      if (sameCue(top.patch[0][1], after)) undoStack.pop();
    } else {
      push({ kind, patch: [[i, before, after]], group });
    }
    openGroup = group ?? null;
    work[i] = after;
    mark(i);
    emit({ kind, indices: [i], offset: false });
    return { ok: true, changed: true };
  };

  const session = {
    get count() { return work.length; },
    get offsetMs() { return offset; },
    get baseOffsetMs() { return baseOffset; },
    get offsetChanged() { return offset !== baseOffset; },
    get changedCount() { return changed.size; },
    get dirty() { return changed.size > 0 || offset !== baseOffset; },
    get canUndo() { return undoStack.length > 0; },
    get canRedo() { return redoStack.length > 0; },
    get undoKind() { return undoStack[undoStack.length - 1]?.kind ?? null; },
    get redoKind() { return redoStack[redoStack.length - 1]?.kind ?? null; },
    get historySize() { return undoStack.length; },
    get version() { return version; },
    get hasDrafts() { return drafts.size > 0; },
    /** @param {number} i */
    cueAt: (i) => work[i],
    /** المقطع كما فُتح (للمقارنة بالمعدَّل). @param {number} i */
    baseAt: (i) => base[i],
    /** @param {number} i */
    isChanged: (i) => changed.has(i),
    /** نص حقل زمن لم يُقرأ بعد. @param {number} i @param {'start' | 'end'} field */
    draftAt: (i, field) => drafts.get(`${i}:${field}`) ?? null,
    /** نسخة مستقلة للحفظ والتصدير. @returns {Cue[]} */
    snapshot: () => work.map(({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text })),
    issues: () => (issuesCache ??= findIssues(work, { drafts })),

    /** @param {(e: ChangeEvent) => void} fn */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** ينهي دمج الكتابة المتتابعة (عند مغادرة الحقل). */
    seal() {
      openGroup = null;
    },

    /** @param {number} i @param {string} text */
    setText(i, text) {
      checkIndex(i);
      if (typeof text !== 'string') throw new TypeError('النص ليس نصًا');
      return editOne('text', i, { ...work[i], text }, `text:${i}`);
    },

    /** @param {number} i @param {'start' | 'end'} field @param {number} ms */
    setTime(i, field, ms) {
      checkIndex(i);
      if (field !== 'start' && field !== 'end') throw new RangeError(`حقل غير معروف: ${field}`);
      if (!Number.isInteger(ms)) throw new RangeError('الزمن ليس عددًا صحيحًا');
      const hadDraft = drafts.delete(`${i}:${field}`);
      const r = editOne('time', i, { ...work[i], [field === 'start' ? 'startMs' : 'endMs']: ms }, null);
      if (hadDraft && !r.changed) emit({ kind: 'time', indices: [i], offset: false });
      return r;
    },

    /** نص لا يُقرأ زمنًا يبقى في حقله ويُعرض خطأً، ولا يغيّر المقطع ولا يُسجَّل. null يزيله. */
    setDraft(i, field, raw) {
      checkIndex(i);
      const key = `${i}:${field}`;
      if (raw === null) {
        if (!drafts.delete(key)) return;
      } else {
        if (drafts.get(key) === raw) return;
        drafts.set(key, String(raw));
      }
      emit({ kind: 'time', indices: [i], offset: false });
    },

    /**
     * ± على نطاق ظاهر (عقد التوقيت §٣): التوقيت المحفوظ وحده، ولا نقل جزئي.
     * @param {Scope} scope @param {number} deltaMs
     */
    shift(scope, deltaMs) {
      if (!Number.isInteger(deltaMs)) throw new RangeError('مقدار النقل ليس عددًا صحيحًا');
      const indices = resolveScope(scope, work.length);
      if (deltaMs === 0) return { ok: false, code: 'ED_SHIFT_ZERO' };
      const r = moveBy(indices, deltaMs);
      if (!r.ok) return { ok: false, code: 'ED_SHIFT_NEGATIVE', negative: r.negative };
      push({ kind: 'shift', indices, delta: deltaMs });
      openGroup = null;
      clearDrafts(indices);
      emit({ kind: 'shift', indices, offset: false });
      return { ok: true, count: indices ? indices.length : work.length, indices };
    },

    /**
     * التنبيه قبل النقل (عقد التوقيت §٣): الإزاحة الحالية إن كانت غير صفرية والنطاق «الملف كله»، وإلا 0.
     * @param {Scope} scope
     */
    shiftNotice(scope) {
      return scope?.kind === 'all' ? offset : 0;
    },

    /** «تثبيت الإزاحة في التوقيت» (§٤): المقاطع والإزاحة معًا، خطوة واحدة قابلة للتراجع. */
    commitOffset() {
      if (offset === 0) return { ok: false, code: 'ED_NO_OFFSET' };
      const r = commitOffsetCues(work, offset);
      if (!r.ok) return { ok: false, code: 'ED_COMMIT_NEGATIVE', negative: r.negative };
      push({ kind: 'commit', indices: null, delta: offset, offset: [offset, r.displayOffsetMs] });
      work = r.cues.map(Object.freeze);
      markAll();
      offset = r.displayOffsetMs;
      openGroup = null;
      clearDrafts(null);
      emit({ kind: 'commit', indices: null, offset: true });
      return { ok: true, count: work.length };
    },

    /**
     * الاستعادة اليدوية للتوقيت بعد معاينة وتأكيد (R14): أزمنة البصمة للمقاطع المختلفة وحدها، والنص كما هو.
     * @param {import('../model/tracks.js').Fingerprint} fingerprint
     */
    restoreTiming(fingerprint) {
      if (!canRestore(work, fingerprint)) return { ok: false, code: 'CMP_RESTORE_UNAVAILABLE' };
      const next = applyRestoreTiming(work, fingerprint);
      const patch = [];
      next.forEach((c, i) => {
        if (!sameCue(c, work[i])) patch.push([i, work[i], freezeCue(c)]);
      });
      if (!patch.length) return { ok: true, count: 0, indices: [] };
      push({ kind: 'restore', patch });
      const indices = applyPatch(patch, true);
      openGroup = null;
      clearDrafts(indices);
      emit({ kind: 'restore', indices, offset: false });
      return { ok: true, count: indices.length, indices };
    },

    undo() {
      const entry = undoStack.pop();
      if (!entry) return { ok: false };
      const indices = replay(entry, false);
      redoStack.push(entry);
      openGroup = null;
      clearDrafts(indices);
      emit({ kind: entry.kind, indices, offset: Boolean(entry.offset), undo: true });
      return { ok: true, kind: entry.kind };
    },

    redo() {
      const entry = redoStack.pop();
      if (!entry) return { ok: false };
      const indices = replay(entry, true);
      undoStack.push(entry);
      openGroup = null;
      clearDrafts(indices);
      emit({ kind: entry.kind, indices, offset: Boolean(entry.offset), redo: true });
      return { ok: true, kind: entry.kind };
    },

    /** «تجاهل التغييرات»: يعود ما فُتح كما هو، بلا تاريخ. */
    discard() {
      work = base.slice();
      offset = baseOffset;
      changed.clear();
      undoStack = [];
      redoStack = [];
      openGroup = null;
      drafts.clear();
      emit({ kind: 'text', indices: null, offset: true });
    },

    /**
     * بعد الحفظ أو إعادة الفتح: ما يُعطى يصبح الأساس، والتاريخ يبدأ من جديد.
     * @param {{ cues: Cue[], offsetMs: number }} o
     */
    rebase({ cues: next, offsetMs: nextOffset }) {
      base = Object.freeze(next.map(freezeCue));
      baseOffset = nextOffset;
      session.discard();
    },
  };
  return session;
}
