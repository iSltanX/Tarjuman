// لوحة المراجعة والاستكمال (P14-AC5 وAC6، R52 وR53 وR58): الفحص الآلي منفصل عن العلامات البشرية، والعلامة مرتبطة بمقطعها لا
// برقمه وحده (فتعديل نص غير محفوظ لا يفصلها، والدمج والشطر يبيّنان مصيرها، واليتيمة منفصلة)، وتبديلها بخطة تُعكس بدقة، وإعادة
// ربطها عند الحفظ، وبنود تقرير المراجعة بالشكل المثبت، ومجموعات الاستكمال بأرقام الملف الكامل («بلا حروف عربية» اختياري).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../../../src/core/compare/index.js';
import {
  COMPLETION_DEFAULTS, completionGroups, completionNumbers, createEditSession, findIssues, planMarkToggle, reanchorMarks, resolveSlotMarks,
  reviewGroups, reviewItems,
} from '../../../src/core/edit/index.js';
import { buildReviewReport } from '../../../src/core/export/index.js';
import { withMarksReplaced } from '../../../src/core/model/bundle.js';
import { englishTrack, fingerprint, makeCues } from '../../helpers/fixtures.js';
import { markOn, sampleBundle } from '../../helpers/fixtures-v2.js';
import { longTrack, arabicTwin } from '../../fixtures/v2/index.js';

const NOW = '2026-11-02T10:00:00.000Z';

test('العلامات على المعروض: تعديل نص غير محفوظ لا يفصلها ما دامت البنية كما هي، وبعد الدمج تبيّن مصيرها', () => {
  const cues = makeCues(6);
  const marks = [markOn(cues[1], 'todo'), markOn(cues[3], 'done'), markOn(cues[5], 'todo')];
  const s = createEditSession({ cues });
  s.setText(1, 'نص عُدّل ولم يُحفظ');
  const opened = () => Array.from({ length: s.count }, (_, i) => s.baseAt(i));
  const shown = () => s.snapshot();
  let r = resolveSlotMarks(marks, shown(), { opened: opened() });
  assert.equal(r.byIndex.get(1).state, 'linked', 'على المفتوح بالموضع نفسه');
  assert.equal(resolveSlotMarks(marks, shown()).byIndex.get(1).state, 'moved', 'على المعروض وحده قد تكون انتقلت');
  s.merge(2);
  assert.equal(s.reshaped, true);
  r = resolveSlotMarks(marks, shown(), { opened: null });
  assert.equal(r.byIndex.get(2).kind, 'done', 'علامة المقطع 4 على المدموج 3+4');
  assert.equal(r.byIndex.get(2).state, 'moved');
  assert.equal(r.orphans.length, 0);
  // حذف المقطع الأخير بملف بلا نهايته: يتيمة منفصلة.
  const short = cues.slice(0, 4);
  assert.deepEqual(resolveSlotMarks(marks, short).orphans.map((m) => m.n), [6]);
});

test('تبديل العلامة: خطة إزالة وإضافة، وعكسها تراجع دقيق في الحزمة', () => {
  const b = sampleBundle();
  const slot = b.slots[0];
  const cues = slot.track.current;
  const resolved = resolveSlotMarks(slot.marks, cues);
  assert.equal(resolved.byIndex.get(0).kind, 'todo');
  const plan = planMarkToggle(resolved, cues, 0, 'done', NOW);
  assert.equal(plan.remove.length, 1);
  assert.equal(plan.add[0].kind, 'done');
  const after = withMarksReplaced(b, 1, plan, NOW);
  assert.equal(resolveSlotMarks(after.slots[0].marks, cues).byIndex.get(0).kind, 'done');
  const back = withMarksReplaced(after, 1, { remove: plan.add, add: plan.remove }, NOW);
  assert.deepEqual(back.slots[0].marks, b.slots[0].marks);
  const none = planMarkToggle(resolved, cues, 0, null, NOW);
  assert.deepEqual(none.add, []);
  assert.throws(() => planMarkToggle(resolved, cues, 99, 'todo', NOW), RangeError);
});

test('إعادة الربط عند الحفظ: المعدَّل نصه أو زمنه يبقى مرتبطًا، والبنية المتغيرة لا يُعاد ربطها', () => {
  const opened = makeCues(4);
  const marks = [markOn(opened[0], 'todo'), markOn(opened[2], 'done')];
  const saved = opened.map((c, i) => (i === 0 ? { ...c, text: 'صُحّح' } : i === 2 ? { ...c, startMs: c.startMs + 300 } : c));
  const plan = reanchorMarks(marks, opened, saved);
  assert.equal(plan.remove.length, 2);
  const next = [...marks.filter((m) => !plan.remove.includes(m)), ...plan.add];
  const r = resolveSlotMarks(next, saved);
  assert.equal(r.byIndex.get(0).state, 'linked');
  assert.equal(r.byIndex.get(2).state, 'linked');
  assert.equal(r.byIndex.get(2).kind, 'done');
  assert.deepEqual(reanchorMarks(marks, opened, saved.slice(1)), { remove: [], add: [] });
  assert.deepEqual(reanchorMarks(marks, opened, opened), { remove: [], add: [] }, 'لا شيء تغيّر');
});

test('مجموعات المراجعة: التوقيت والكثافة والمقارنة منفصلة عن العلامات (أعود إليه وراجعته وتحتاج تحقق ويتيمة)', () => {
  const en = englishTrack({ cues: makeCues(6, { text: (i) => `line ${i}` }) });
  const fp = fingerprint({ track: en });
  const cues = makeCues(6, { text: (i) => `ترجمة ${i}` }).filter((c) => c.n !== 4);
  cues[0] = { ...cues[0], endMs: cues[0].startMs - 1 };
  cues[1] = { ...cues[1], endMs: cues[1].startMs + 600, text: 'نص عربي طويل لا يُقرأ في أقل من ثانية أبدًا' };
  const issues = findIssues(cues, { density: {} });
  const comparison = compare(cues, fp, { driftMs: 100 });
  const marks = resolveSlotMarks([markOn(cues[2], 'todo'), markOn(cues[3], 'done'), { ...markOn(cues[4], 'todo'), textHash: '00000000' }, markOn({ n: 9, startMs: 99000, text: 'x' })], cues);
  const g = reviewGroups({ issues, comparison, marks });
  assert.ok(g.auto.timing.some((x) => x.code === 'ED_END_BEFORE_START'));
  assert.deepEqual(g.auto.density.map((x) => x.code), ['ED_READING_FAST']);
  assert.deepEqual(g.auto.comparison.missing, [4]);
  assert.deepEqual([g.marks.todo.length, g.marks.done.length, g.marks.check.length, g.marks.orphan.length], [1, 1, 1, 1]);
  assert.equal(g.counts.todo, 1);
});

test('بنود تقرير المراجعة: المشكلات والعلامة والمقتطف باختيار المستخدم والناقص بزمن البصمة، ويكتبها التقرير كما هي', () => {
  const en = englishTrack({ cues: makeCues(5, { text: (i) => `line ${i}` }) });
  const fp = fingerprint({ track: en });
  const cues = makeCues(5, { text: (i) => `ترجمة ${i}` }).filter((c) => c.n !== 3);
  cues[0] = { ...cues[0], text: '' };
  const issues = findIssues(cues, { density: {} });
  const comparison = compare(cues, fp, { driftMs: 100 });
  const marks = resolveSlotMarks([markOn(cues[1], 'todo')], cues);
  const items = reviewItems({ cues, issues, comparison, fingerprint: fp, marks, english: cues.map((c) => `en ${c.n}`), includeText: true });
  assert.deepEqual(items.map((x) => x.n), [1, 2, 3]);
  assert.deepEqual(items[0].problems, ['ED_TEXT_EMPTY']);
  assert.equal(items[1].mark, 'todo');
  assert.equal(items[1].text, 'ترجمة 2');
  assert.equal(items[1].english, 'en 2');
  assert.deepEqual(items[2], { n: 3, startMs: fp.cues[2].startMs, endMs: fp.cues[2].endMs, problems: ['ED_REVIEW_MISSING'], mark: null, text: null, english: null });
  const noText = reviewItems({ cues, issues, comparison, fingerprint: fp, marks, includeText: false, include: { marks: false } });
  assert.deepEqual(noText.map((x) => x.n), [1, 3], 'بلا العلامات');
  assert.ok(noText.every((x) => x.text === null));
  const report = buildReviewReport({ videoId: 'AAAAAAAAAAA', title: 'عنوان', items, includeText: true, format: 'md' });
  assert.match(report.text, /ناقص في الترجمة/);
  assert.match(report.text, /أعود إليه/);
});

test('مجموعات الاستكمال على 900 مقطع ينقصها 12: الناقص والفارغ تلقائيًا، و«بلا حروف عربية» اختياري، والمعلّمة والمحددة', () => {
  const en = longTrack(900);
  const fp = fingerprint({ track: englishTrack({ cues: en }) });
  const full = arabicTwin(en);
  const drop = new Set([10, 11, 12, 200, 201, 333, 450, 451, 452, 700, 899, 900]);
  const cues = full.filter((c) => !drop.has(c.n)).map((c) => (c.n === 50 ? { ...c, text: '   ' } : c.n === 60 ? { ...c, text: 'not translated' } : c));
  const comparison = compare(cues, fp, { driftMs: 100 });
  assert.equal(comparison.missing.length, 12);
  const marks = resolveSlotMarks([markOn(cues[100], 'todo'), markOn(cues[101], 'done')], cues);
  const groups = completionGroups({ cues, comparison, fingerprint: fp, marks, selection: [5] });
  assert.deepEqual(groups.missing, [...drop].sort((a, b) => a - b));
  assert.deepEqual(groups.empty, [50]);
  assert.deepEqual(groups.noArabic, [60]);
  assert.deepEqual(groups.marked, [cues[100].n], 'المعلّمة «أعود إليه» وحدها');
  assert.deepEqual(groups.selected, [cues[5].n]);
  const auto = completionNumbers(groups, COMPLETION_DEFAULTS);
  assert.equal(auto.length, 13, 'الناقص والفارغ');
  assert.ok(!auto.includes(60), '«بلا حروف عربية» ليس تلقائيًا');
  assert.equal(completionNumbers(groups, { ...COMPLETION_DEFAULTS, noArabic: true, marked: true, selected: true }).length, 16);
  const noRef = completionGroups({ cues, comparison: null, fingerprint: null, marks, selection: [] });
  assert.deepEqual(noRef.missing, []);
  assert.deepEqual(noRef.empty, [], 'بلا بصمة لا أرقام في الملف الكامل');
});
