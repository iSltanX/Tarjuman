// جلسة التحرير: نسخة عمل من المقاطع وإزاحة العرض فوق ما فُتح، وتاريخ تراجع وإعادة قبل الحفظ (R27). كل فعل
// خطوة واحدة، والمرفوض لا يغيّر شيئًا ولا يُسجَّل. الأصل المفتوح لا يُمس، ولا حفظ هنا: الصفحة تحفظ ما تعطيه
// snapshot() بالانتقالات. عقد التوقيت: ± يغيّر المحفوظ لنطاق بـshiftCues، و«تثبيت الإزاحة» بـcommitOffset
// يغيّر المقاطع والإزاحة معًا في خطوة واحدة، فلا تُطبَّق الإزاحة مرتين.
//
// الذاكرة على قدر التغيير لا الملف: النص والزمن والاستعادة والاستبدال تحفظ المقاطع المتغيرة وحدها، والنقل والتثبيت يحفظان
// المقدار والنطاق (عكسهما نقل بالمقدار المعاكس، وهو دقيق لأن الأزمنة أعداد صحيحة). وما يغيّر البنية (الدمج والشطر والانجراف
// وملف التصحيح وإعادة التطبيق بعد التعارض) يحفظ المصفوفتين قبله وبعده بمراجع مقاطعهما المجمّدة، لا نسخًا منها.
//
// «معدَّل» بالمحتوى لا بالموضع: المقطع معدَّل إن لم يوجد بمحتواه نفسه فيما فُتح، فلا يصير كل ما بعد دمج أو شطر معدَّلًا
// لأن مواضعه انزاحت. وعدد التغييرات أكبر العددين: ما في العمل وليس في المفتوح، وما في المفتوح وليس في العمل.
import { applyRestoreTiming, canRestore } from '../compare/index.js';
import { isTjError } from '../errors/index.js';
import { applyPatch as applyPatchPlan } from '../import/patch.js';
import { commitOffset as commitOffsetCues, shiftCues } from '../model/timing.js';
import { driftCorrect } from './drift.js';
import { findIssues } from './issues.js';
import { planReplace } from './search.js';
import { mergeCues, splitCue } from './structure.js';

/** @typedef {{ n: number, startMs: number, endMs: number, text: string }} Cue */
/** @typedef {{ kind: 'cue', index: number } | { kind: 'selection', indices: number[] } | { kind: 'all' }} Scope */
/**
 * @typedef {'text' | 'time' | 'shift' | 'commit' | 'restore' | 'replace' | 'merge' | 'split' | 'drift' | 'patch' | 'rescue'} EditKind
 * @typedef {{
 *   kind: EditKind, patch?: [number, Cue, Cue][], indices?: number[] | null, delta?: number, offset?: [number, number], group?: string,
 *   swap?: [Cue[], Cue[]]
 * }} Entry
 * @typedef {{ kind: EditKind, indices: number[] | null, offset: boolean, version: number, structural?: boolean, undo?: boolean, redo?: boolean }} ChangeEvent
 */

/** ما يغيّر عدد المقاطع أو مواضعها: الصفوف تُبنى من جديد بعده. */
export const STRUCTURAL_KINDS = Object.freeze(['merge', 'split', 'patch', 'rescue']);

const freezeCue = ({ n, startMs, endMs, text }) => Object.freeze({ n, startMs, endMs, text });
const sameCue = (a, b) => a === b || (a.n === b.n && a.startMs === b.startMs && a.endMs === b.endMs && a.text === b.text);
/** مفتاح المحتوى: ثلاثة أعداد صحيحة ثم النص، فلا لبس في الفاصل. */
const keyOf = (c) => `${c.n}|${c.startMs}|${c.endMs}|${c.text}`;
/** رفض محرّك برمزه (TjError) نتيجةً لا استثناء؛ وغيره خطأ برمجي يُرمى. */
const refusal = (err) => {
  if (!isTjError(err)) throw err;
  return { ok: false, code: err.code };
};

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
export function createEditSession({ cues, offsetMs = 0, maxHistory = 200, density = null }) {
  let base = Object.freeze(cues.map(freezeCue));
  let baseOffset = offsetMs;
  /** @type {Cue[]} */
  let work = base.slice();
  let offset = offsetMs;
  /** @type {Map<string, number>} */
  let baseCount = new Map();
  /** @type {Map<string, number>} */
  let workCount = new Map();
  let added = 0;
  let removed = 0;
  /** @type {Entry[]} */
  let undoStack = [];
  /** @type {Entry[]} */
  let redoStack = [];
  let openGroup = null;
  const drafts = new Map();
  let version = 0;
  let issuesCache = null;
  const listeners = new Set();

  /** يحدّث عدّ مفتاح في العمل بمقدار، ومعه الفرقين عن المفتوح. */
  const bump = (k, by) => {
    const w = workCount.get(k) ?? 0;
    const b = baseCount.get(k) ?? 0;
    const next = w + by;
    added += Math.max(0, next - b) - Math.max(0, w - b);
    removed += Math.max(0, b - next) - Math.max(0, b - w);
    if (next) workCount.set(k, next);
    else workCount.delete(k);
  };
  /** يضع مقطعًا في موضع ويحدّث العدّ. */
  const put = (i, cue) => {
    bump(keyOf(work[i]), -1);
    work[i] = cue;
    bump(keyOf(cue), 1);
  };
  /** يعيد العدّ كله (بعد تغيير المصفوفة أو الأساس). */
  const recount = () => {
    baseCount = new Map();
    for (const c of base) {
      const k = keyOf(c);
      baseCount.set(k, (baseCount.get(k) ?? 0) + 1);
    }
    workCount = new Map();
    for (const c of work) {
      const k = keyOf(c);
      workCount.set(k, (workCount.get(k) ?? 0) + 1);
    }
    added = 0;
    removed = 0;
    for (const [k, w] of workCount) added += Math.max(0, w - (baseCount.get(k) ?? 0));
    for (const [k, b] of baseCount) removed += Math.max(0, b - (workCount.get(k) ?? 0));
  };
  recount();
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
    for (const [i, before, after] of patch) put(i, forward ? after : before);
    return patch.map(([i]) => i);
  };

  /** ينقل فهارس (أو الملف كله) بمقدار؛ يرفض كله إن أنتج زمنًا سالبًا. */
  const moveBy = (indices, delta) => {
    const subset = indices === null ? work : indices.map((i) => work[i]);
    const r = shiftCues(subset, delta);
    if (!r.ok) return r;
    // shiftCues يعيد نسخًا جديدة بالمفاتيح الأربعة نفسها، فتُجمَّد كما هي دون نسخة ثانية.
    if (indices === null) {
      work = r.cues.map(Object.freeze);
      recount();
    } else indices.forEach((i, k) => put(i, Object.freeze(r.cues[k])));
    return r;
  };

  /**
   * يعكس خطوة أو يعيدها. النقل يُعاد بحساب خام لا بـshiftCues: الخطوة نفسها تحقّق منها الفعل الأصلي، والعكس دقيق
   * لأن الأزمنة أعداد صحيحة؛ فنقلٌ أصلح زمنًا سالبًا كتبه المستخدم يُتراجع عنه إلى ذلك الزمن كما كان.
   */
  const replay = (entry, forward) => {
    if (entry.patch) return applyPatch(entry.patch, forward);
    if (entry.swap) {
      work = (forward ? entry.swap[1] : entry.swap[0]).slice();
      recount();
      if (entry.offset) offset = forward ? entry.offset[1] : entry.offset[0];
      return null;
    }
    const d = forward ? entry.delta : -entry.delta;
    const move = (c) => Object.freeze({ n: c.n, startMs: c.startMs + d, endMs: c.endMs + d, text: c.text });
    if (entry.indices === null) {
      work = work.map(move);
      recount();
    } else {
      for (const i of entry.indices) put(i, move(work[i]));
    }
    if (entry.offset) offset = forward ? entry.offset[1] : entry.offset[0];
    return entry.indices;
  };

  /**
   * يستبدل المصفوفة كلها خطوةً واحدة (البنية والانجراف والتصحيح وإعادة التطبيق). المقاطع التي لم تتغير في موضعها تبقى
   * بمراجعها. يعيد false إن لم يتغير شيء (فلا خطوة فارغة).
   * @param {EditKind} kind @param {Cue[]} next @param {{ offsetMs?: number }} [o]
   */
  const swapAll = (kind, next, { offsetMs: nextOffset } = {}) => {
    const before = work.slice();
    const after = next.map((c, i) => (before[i] && sameCue(before[i], c) ? before[i] : freezeCue(c)));
    const offsetPair = nextOffset !== undefined && nextOffset !== offset ? [offset, nextOffset] : undefined;
    if (after.length === before.length && after.every((c, i) => c === before[i]) && !offsetPair) return false;
    push({ kind, swap: [before, after], ...(offsetPair ? { offset: offsetPair } : {}) });
    work = after.slice();
    if (offsetPair) offset = offsetPair[1];
    recount();
    openGroup = null;
    drafts.clear();
    emit({ kind, indices: null, offset: Boolean(offsetPair), structural: STRUCTURAL_KINDS.includes(kind) });
    return true;
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
      if (sameCue(top.patch[0][1], after)) {
        undoStack.pop();
        group = null;
      }
    } else {
      push({ kind, patch: [[i, before, after]], group });
    }
    openGroup = group ?? null;
    put(i, after);
    emit({ kind, indices: [i], offset: false });
    return { ok: true, changed: true };
  };

  const session = {
    get count() { return work.length; },
    get offsetMs() { return offset; },
    get baseOffsetMs() { return baseOffset; },
    get offsetChanged() { return offset !== baseOffset; },
    get changedCount() { return Math.max(added, removed); },
    get dirty() { return added > 0 || removed > 0 || offset !== baseOffset; },
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
    /** المقطع غير موجود بمحتواه فيما فُتح. @param {number} i */
    isChanged: (i) => !baseCount.has(keyOf(work[i])),
    /** المقاطع كما فُتحت (أساس الدمج الثلاثي عند التعارض). @returns {Cue[]} */
    baseSnapshot: () => base.map(({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text })),
    /** نص حقل زمن لم يُقرأ بعد. @param {number} i @param {'start' | 'end'} field */
    draftAt: (i, field) => drafts.get(`${i}:${field}`) ?? null,
    /** نسخة مستقلة للحفظ والتصدير. @returns {Cue[]} */
    snapshot: () => work.map(({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text })),
    issues: () => (issuesCache ??= findIssues(work, { drafts, density })),

    /** عتبة تنبيهات الكثافة (أو null لإطفائها) بعد تغيّر التفضيلات. @param {{ maxCps?: number, maxLineChars?: number } | null} limits */
    setDensity(limits) {
      density = limits;
      issuesCache = null;
    },

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
      recount();
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
      emit({ kind: entry.kind, indices, offset: Boolean(entry.offset), structural: STRUCTURAL_KINDS.includes(entry.kind), undo: true });
      return { ok: true, kind: entry.kind };
    },

    redo() {
      const entry = redoStack.pop();
      if (!entry) return { ok: false };
      const indices = replay(entry, true);
      undoStack.push(entry);
      openGroup = null;
      clearDrafts(indices);
      emit({ kind: entry.kind, indices, offset: Boolean(entry.offset), structural: STRUCTURAL_KINDS.includes(entry.kind), redo: true });
      return { ok: true, kind: entry.kind };
    },

    /** «تجاهل التغييرات»: يعود ما فُتح كما هو، بلا تاريخ. */
    discard() {
      work = base.slice();
      offset = baseOffset;
      recount();
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

    /**
     * حفظٌ انتهى والمستخدم عدّل أثناء انتظاره: المحفوظ يصبح الأساس، ونسخة العمل والتاريخ والمسودات تبقى كما هي،
     * فما كُتب بعد اللقطة يبقى «غير محفوظ» ولا يُكتب فوقه. ولا يُفترض العدد نفسه: دمج أو شطر أثناء الحفظ يبقى تغييرًا.
     * @param {{ cues: Cue[], offsetMs: number }} o
     */
    markSaved({ cues: saved, offsetMs: savedOffset }) {
      base = Object.freeze(saved.map(freezeCue));
      baseOffset = savedOffset;
      recount();
      emit({ kind: 'text', indices: [], offset: true });
    },

    /**
     * بعد التعارض (R57): الأحدث يصبح الأساس بلا تاريخ، ثم ناتج الدمج الثلاثي فوقه خطوةً واحدة «إعادة تطبيق تعديلاتي»؛
     * فالتراجع يعيد الأحدث كما هو، ولا يُكتب شيء حتى «حفظ».
     * @param {{ cues: Cue[], offsetMs: number }} latest @param {{ cues: Cue[], offsetMs: number }} merged
     */
    rebaseMerged(latest, merged) {
      session.rebase(latest);
      swapAll('rescue', merged.cues, { offsetMs: merged.offsetMs });
    },

    /**
     * استبدال نصوص في مواضعها خطوةً واحدة (البحث والاستبدال، R51): لا يمس التوقيت ولا الأرقام.
     * @param {{ index: number, after: string }[]} changes
     */
    replaceTexts(changes) {
      const patch = [];
      for (const { index, after } of changes) {
        checkIndex(index);
        if (typeof after !== 'string') throw new TypeError('النص ليس نصًا');
        if (work[index].text !== after) patch.push([index, work[index], freezeCue({ ...work[index], text: after })]);
      }
      if (!patch.length) return { ok: true, count: 0, indices: [] };
      push({ kind: 'replace', patch });
      const indices = applyPatch(patch, true);
      openGroup = null;
      emit({ kind: 'replace', indices, offset: false });
      return { ok: true, count: indices.length, indices };
    },

    /**
     * خطة استبدال من نتائج البحث (planReplace في P11) ثم تطبيقها خطوةً واحدة.
     * @param {{ index: number, start: number, end: number }[]} matches @param {string} replacement @param {{ only?: number[] }} [o]
     */
    replaceMatches(matches, replacement, { only } = {}) {
      const { changes } = planReplace(work, matches, replacement, { only });
      return session.replaceTexts(changes.map((c) => ({ index: c.index, after: c.after })));
    },

    /** دمج المقطع مع التالي (R54). @param {number} index */
    merge(index) {
      try {
        swapAll('merge', mergeCues(work, index));
        return { ok: true, index };
      } catch (err) {
        return refusal(err);
      }
    },

    /** شطر المقطع عند موضع في نصه (R54). @param {number} index @param {number} at */
    split(index, at) {
      try {
        swapAll('split', splitCue(work, index, at));
        return { ok: true, index };
      } catch (err) {
        return refusal(err);
      }
    },

    /**
     * تصحيح الانجراف بنقطتين (R54): تحويل خطي للتوقيت كله خطوةً واحدة؛ الزمن السالب يرفضه كله بأرقامه.
     * @param {{ a: { n: number, toMs: number }, b: { n: number, toMs: number } }} anchors
     */
    drift(anchors) {
      let r;
      try {
        r = driftCorrect(work, anchors);
      } catch (err) {
        return refusal(err);
      }
      if (!r.ok) return { ok: false, code: 'ED_DRIFT_NEGATIVE', negative: r.negative };
      const changedAny = swapAll('drift', r.cues);
      return { ok: true, count: changedAny ? work.length : 0 };
    },

    /**
     * ملف التصحيح بعد المعاينة (R52): الاستبدال والإدراج في المواضع المختارة، وما عداها كما هو، خطوةً واحدة.
     * @param {import('../import/patch.js').PatchPlan} plan @param {{ only?: number[] }} [o] أرقام مختارة من الخطة
     */
    applyPatchPlan(plan, { only } = {}) {
      let next;
      try {
        next = applyPatchPlan(work, plan, { only });
      } catch (err) {
        return refusal(err);
      }
      const before = work.length;
      const changedAny = swapAll('patch', next);
      return { ok: true, applied: changedAny, inserted: next.length - before };
    },
  };
  return session;
}
