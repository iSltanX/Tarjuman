// لوحة المراجعة واستكمال الناقص في المحرّر (R52، R53، R58): الفحص الآلي (التوقيت، والمقارنة، والكثافة) منفصلًا عن العلامات
// البشرية، وحلّ العلامات على المقاطع المعروضة («أعود إليه» و«راجعته»، و«تحتاج تحقق» لما قد يكون انتقل، واليتيمة منفصلة)،
// وتبديل علامة مقطع بخطة إزالة وإضافة قابلة للتراجع الدقيق، وإعادة ربط العلامات بمقاطعها عند الحفظ، وبنود تقرير المراجعة،
// ومجموعات الاستكمال بأرقام الملف الكامل. دوال نقية بلا DOM ولا تخزين.
import { isBlankText, lacksArabic } from '../compare/index.js';
import { cueTextHash, markAnchor, resolveMarks, sameAnchor } from '../model/marks.js';
import { DENSITY_CODES } from './issues.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/marks.js').Mark} Mark */
/** @typedef {{ index: number, n: number, kind: 'todo' | 'done', state: 'linked' | 'moved', mark: Mark, others?: number }} MarkEntry */

const RANK = Object.freeze({ linked: 2, moved: 1, orphan: 0 });

/**
 * العلامات على المقاطع المعروضة: لكل علامة أفضل حلٍّ (على المعروضة، أو على المفتوحة بالمواضع نفسها حين لم تتغير البنية،
 * فيبقى مقطعٌ عُدّل نصه ولم يُحفظ مرتبطًا)، ولصف كل مقطع علامة واحدة (المرتبطة قبل التي قد تكون انتقلت) بعدد ما معها،
 * واليتيمة منفصلة. وentries كل علامة على مقطع، فعلامتان على مقطعين دُمجا تظهران كلتاهما في اللوحة لا واحدة تختفي
 * (تدقيق 7a66f91، U100).
 * @param {Mark[]} marks
 * @param {Cue[]} shown المقاطع المعروضة
 * @param {{ opened?: Cue[] | null }} [o] المفتوحة بالمواضع نفسها، أو null بعد دمج أو شطر
 * @returns {{ byIndex: Map<number, MarkEntry>, entries: MarkEntry[], orphans: Mark[], all: { mark: Mark, state: string, index: number | null }[] }}
 */
export function resolveSlotMarks(marks, shown, { opened = null } = {}) {
  const onShown = resolveMarks(marks, shown);
  const onOpened = opened && opened.length === shown.length ? resolveMarks(marks, opened) : null;
  const all = onShown.map((r, k) => {
    const o = onOpened?.[k];
    return o && RANK[o.state] > RANK[r.state] ? o : r;
  });
  const byIndex = new Map();
  const orphans = [];
  const entries = [];
  for (const r of all) {
    if (r.state === 'orphan' || r.index === null || r.index >= shown.length) {
      orphans.push(r.mark);
      continue;
    }
    const entry = { index: r.index, n: shown[r.index].n, kind: r.mark.kind, state: r.state, mark: r.mark };
    entries.push(entry);
    const prev = byIndex.get(r.index);
    if (prev && !(prev.state === 'moved' && r.state === 'linked')) continue;
    byIndex.set(r.index, entry);
  }
  entries.sort((a, b) => a.index - b.index);
  for (const e of byIndex.values()) e.others = entries.filter((x) => x.index === e.index).length - 1;
  return { byIndex, entries, orphans, all };
}

/**
 * خطة تبديل علامة مقطع: إزالة كل علامة تُحل إليه، وإضافة علامة مرتبطة بالمقطع كما يُعرض (أو لا شيء لإزالتها). عكسها
 * { remove: add، add: remove } تراجع دقيق (withMarksReplaced).
 * @param {ReturnType<typeof resolveSlotMarks>} resolved @param {Cue[]} shown المقاطع المعروضة
 * @param {number} index @param {'todo' | 'done' | null} kind @param {string} now ISO
 * @returns {{ remove: Mark[], add: Mark[] }}
 * @throws {RangeError} لموضع خارج المقاطع أو مقطع بزمن سالب
 */
export function planMarkToggle(resolved, shown, index, kind, now) {
  const cue = shown[index];
  if (!cue) throw new RangeError(`لا مقطع بالموضع ${index}`);
  if (!(cue.startMs >= 0)) throw new RangeError('مقطع بزمن سالب لا يُعلَّم');
  const remove = resolved.all.filter((r) => r.index === index).map((r) => r.mark);
  const add = kind ? [{ ...markAnchor(cue), kind, at: now }] : [];
  return { remove, add };
}

/**
 * بعد حفظ تعديل لا يغيّر البنية (المواضع نفسها): العلامات المرتبطة بمقطع في المفتوح تُربط بنسخته المحفوظة، فلا تصير
 * «قد تكون انتقلت» لمجرد أن المستخدم صحّح نصه أو زمنه. وبعد دمج أو شطر يبقى الحلّ وحده يبيّن مصيرها.
 * @param {Mark[]} marks @param {Cue[]} opened @param {Cue[]} saved بطول opened
 * @returns {{ remove: Mark[], add: Mark[] }} فارغة إن لم يلزم شيء
 */
export function reanchorMarks(marks, opened, saved) {
  if (opened.length !== saved.length) return { remove: [], add: [] };
  const remove = [];
  const add = [];
  for (const r of resolveMarks(marks, opened)) {
    if (r.state !== 'linked') continue;
    const c = saved[r.index];
    const next = { n: c.n, startMs: c.startMs, textHash: cueTextHash(c.text) };
    if (sameAnchor(r.mark, next) || !(c.startMs >= 0)) continue;
    remove.push(r.mark);
    add.push({ ...next, kind: r.mark.kind, at: r.mark.at });
  }
  // علامتان صارتا للمقطع نفسه لا تُكتبان معًا (المدقق يرفض): تبقى الأولى.
  const seen = new Set(marks.filter((m) => !remove.includes(m)).map((m) => `${m.n}|${m.startMs}|${m.textHash}`));
  const unique = [];
  add.forEach((m) => {
    const k = `${m.n}|${m.startMs}|${m.textHash}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(m);
    }
  });
  return { remove, add: unique };
}

/**
 * مجموعات لوحة المراجعة (§١٩.٩): الفحص الآلي ثلاث مجموعات، والعلامات أربع (أعود إليه، وراجعته، وتحتاج تحقق، ويتيمة).
 * @param {{ issues: import('./issues.js').IssueReport, comparison: import('../model/tracks.js').ComparisonReport | null, marks: ReturnType<typeof resolveSlotMarks> }} o
 */
export function reviewGroups({ issues, comparison, marks }) {
  const timing = issues.list.filter((x) => !x.density);
  const density = issues.list.filter((x) => x.density);
  const cmp = comparison && comparison.fingerprintId !== null
    ? { missing: comparison.missing, extra: comparison.extra, drift: comparison.drift.map((d) => d.n), empty: comparison.empty, noArabic: comparison.noArabic }
    : null;
  const todo = marks.entries.filter((e) => e.state === 'linked' && e.kind === 'todo');
  const done = marks.entries.filter((e) => e.state === 'linked' && e.kind === 'done');
  const check = marks.entries.filter((e) => e.state === 'moved');
  return {
    auto: { timing, density, comparison: cmp },
    marks: { todo, done, check, orphan: marks.orphans },
    counts: {
      timing: timing.length, density: density.length,
      comparison: cmp ? cmp.missing.length + cmp.extra.length + cmp.drift.length + cmp.empty.length + cmp.noArabic.length : 0,
      todo: todo.length, done: done.length, check: check.length, orphan: marks.orphans.length,
    },
  };
}

/** رموز المشكلات المقارنة في تقرير المراجعة (أسماؤها في errors/editor.js). */
export const REVIEW_CODES = Object.freeze({ missing: 'ED_REVIEW_MISSING', drift: 'ED_REVIEW_DRIFT', noArabic: 'ED_REVIEW_NO_ARABIC' });

/**
 * بنود تقرير المراجعة (واجهة الربط المثبتة): كل مقطع فيه مشكلة آلية أو علامة، والناقص بزمن البصمة، بترتيب الزمن.
 * @param {{
 *   cues: Cue[], issues: import('./issues.js').IssueReport, comparison: import('../model/tracks.js').ComparisonReport | null,
 *   fingerprint: import('../model/tracks.js').Fingerprint | null, marks: ReturnType<typeof resolveSlotMarks>,
 *   english?: string[], includeText?: boolean, include?: { auto?: boolean, marks?: boolean }
 * }} o
 * @returns {import('../export/report.js').ReviewItem[]}
 */
export function reviewItems({ cues, issues, comparison, fingerprint, marks, english = [], includeText = false, include = {} }) {
  const auto = include.auto !== false;
  const withMarks = include.marks !== false;
  const cmp = comparison && comparison.fingerprintId !== null ? comparison : null;
  const driftN = new Set(cmp ? cmp.drift.map((d) => d.n) : []);
  const noArabicN = new Set(cmp ? cmp.noArabic : []);
  const items = [];
  const t = (ms) => Math.max(0, ms);
  cues.forEach((c, i) => {
    const problems = [];
    if (auto) {
      for (const x of issues.byIndex.get(i) ?? []) if (!problems.includes(x.code)) problems.push(x.code);
      if (driftN.has(c.n)) problems.push(REVIEW_CODES.drift);
      // «بلا حروف عربية» بنص القطعة نفسها لا برقمها: قطعتا شطر أو رقم مكرر لا تُنسب إحداهما بالأخرى (تدقيق 7a66f91، U25).
      if (noArabicN.has(c.n) && lacksArabic(c.text) && !problems.includes(REVIEW_CODES.noArabic)) problems.push(REVIEW_CODES.noArabic);
    }
    const m = withMarks ? marks.byIndex.get(i) : null;
    if (!problems.length && !m) return;
    items.push({
      n: c.n, startMs: t(c.startMs), endMs: t(Math.max(c.endMs, c.startMs)), problems, mark: m ? m.kind : null,
      text: includeText ? c.text : null, english: includeText ? english[i] || null : null,
    });
  });
  if (auto && cmp && fingerprint) {
    for (const n of cmp.missing) {
      const f = fingerprint.cues[n - 1];
      if (f) items.push({ n, startMs: f.startMs, endMs: f.endMs, problems: [REVIEW_CODES.missing], mark: null, text: null, english: null });
    }
  }
  return items.sort((a, b) => a.startMs - b.startMs || a.n - b.n);
}

/**
 * مجموعات الاستكمال (R52) بأرقام الملف الكامل (1..عدد البصمة): الناقص والفارغ تلقائيًا، و«بلا حروف عربية» اختياري،
 * والمعلّمة «أعود إليه» والمحددة. الرقم رقم البصمة الذي يغطيه المقطع بالمحاذاة (numbersOf من fingerprintCoverage: المدموج
 * أرقامه كلها، والقطعة رقم أصلها، وفي ملف أُعيد ترقيمه رقم موضعه لا رقمه المكتوب؛ تدقيق 5fedcb9، GM-002)، وإلا رقم المقطع.
 * @param {{
 *   cues: Cue[], comparison: import('../model/tracks.js').ComparisonReport | null, fingerprint: import('../model/tracks.js').Fingerprint | null,
 *   marks: ReturnType<typeof resolveSlotMarks>, selection: Iterable<number>, numbersOf?: number[][] | null
 * }} o
 */
export function completionGroups({ cues, comparison, fingerprint, marks, selection, numbersOf = null }) {
  const count = fingerprint?.count ?? 0;
  const inRange = (n) => Number.isInteger(n) && n >= 1 && n <= count;
  const uniq = (ns) => [...new Set(ns.filter(inRange))].sort((a, b) => a - b);
  const mapped = numbersOf && numbersOf.length === cues.length ? numbersOf : null;
  const numbers = (i) => (mapped ? mapped[i] : cues[i] ? [cues[i].n] : []);
  const indices = (pred) => cues.flatMap((c, i) => (pred(c) ? numbers(i) : []));
  return {
    missing: uniq(comparison && comparison.fingerprintId === fingerprint?.id ? comparison.missing : []),
    empty: uniq(indices((c) => isBlankText(c.text))),
    noArabic: uniq(indices((c) => lacksArabic(c.text))),
    marked: uniq(marks.entries.filter((e) => e.kind === 'todo').flatMap((e) => numbers(e.index))),
    selected: uniq([...selection].flatMap((i) => numbers(i))),
  };
}

/** الافتراضي: الناقص والفارغ تلقائيًا، والباقي باختيار المستخدم (Q: «بلا حروف عربية» اختياري لا تلقائي). */
export const COMPLETION_DEFAULTS = Object.freeze({ missing: true, empty: true, noArabic: false, marked: false, selected: false });

/**
 * أرقام ملف الاستكمال من المجموعات المختارة.
 * @param {ReturnType<typeof completionGroups>} groups @param {Partial<typeof COMPLETION_DEFAULTS>} picks
 * @returns {number[]}
 */
export function completionNumbers(groups, picks) {
  const out = new Set();
  for (const key of Object.keys(COMPLETION_DEFAULTS)) if (picks[key]) for (const n of groups[key]) out.add(n);
  return [...out].sort((a, b) => a - b);
}

export { DENSITY_CODES };
