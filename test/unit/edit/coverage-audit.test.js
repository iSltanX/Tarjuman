// انحدارات المحاذاة في المحرّر (تدقيق 5fedcb9: GM-002 وGM-005 وCX-H1): ملف حُذف من وسطه مقطعان وأُعيد ترقيمه، ودمج وشطر
// مقصودان. التقرير الحاضر والمرجع الإنجليزي وأرقام الاستكمال وصفوف الناقص بالمحاذاة الزمنية، والمقارن compare يبقى وصفًا بالرقم
// (عقد data-model §٥)، والاستعادة الشاملة بشرطها كما هي (R54).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, canRestore, currentComparison, fingerprintCoverage } from '../../../src/core/compare/index.js';
import { buildRows, englishReference } from '../../../src/core/edit/reference.js';
import { completionGroups } from '../../../src/core/edit/review.js';
import { mergeCues, splitCue } from '../../../src/core/edit/structure.js';
import { readPatch } from '../../../src/core/import/patch.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';

const TEN = Array.from({ length: 10 }, (_, i) => ({ n: i + 1, startMs: i * 4000 + 1000, endMs: i * 4000 + 3500 }));
const FP = { id: 'fp_test000001', videoId: 'AAAAAAAAAAA', trackKey: 'en|manual', mode: 'normal', count: 10, cues: TEN, parts: null };
const EN = TEN.map((c) => ({ ...c, text: `English sentence ${c.n}` }));
const AR = TEN.map((c) => ({ ...c, text: `ترجمة الجملة ${c.n}` }));
const noMarks = { entries: [], byIndex: new Map(), orphans: [], all: [] };
// النموذج أسقط 5 و6 ثم رقّم الباقي 1..8 بأزمنته الأصلية.
const RENUMBERED = AR.filter((c) => c.n !== 5 && c.n !== 6).map((c, i) => ({ ...c, n: i + 1 }));

test('GM-002 وCX-H1: بعد إعادة الترقيم الناقص الحقيقي 5 و6 لا 9 و10، ولا انحراف زائف، والمقارن بالرقم وصفٌ كما هو', () => {
  const cov = fingerprintCoverage(FP, RENUMBERED);
  assert.equal(cov.ok, true);
  const now = currentComparison(RENUMBERED, FP, { coverage: cov });
  assert.deepEqual([now.missing, now.extra, now.drift], [[5, 6], [], []]);
  const asImported = compare(RENUMBERED, FP);
  assert.deepEqual(asImported.missing, [9, 10], 'compare نفسه لم يتغير (العقد)');
  assert.equal(now.restoreTimingAvailable, false);
});

test('GM-002: المرجع الإنجليزي أمام كل مقطع بموضعه لا برقمه المكتوب', () => {
  const cov = fingerprintCoverage(FP, RENUMBERED);
  const refs = englishReference(RENUMBERED, EN, FP, { coverage: cov });
  assert.equal(RENUMBERED[4].text, 'ترجمة الجملة 7');
  assert.equal(refs[4], 'English sentence 7');
  assert.deepEqual(refs, RENUMBERED.map((c) => c.text.replace('ترجمة الجملة', 'English sentence')));
  // بلا تغطية: الرقم كما كان (لا انحدار لمن لا يمرّرها).
  assert.equal(englishReference(RENUMBERED, EN, FP)[4], 'English sentence 5');
});

test('GM-002: ملف الاستكمال يطلب 5 و6، وتطبيقه يدرجهما في موضعهما ولا يستبدل ترجمة 9 و10', async () => {
  const cov = fingerprintCoverage(FP, RENUMBERED);
  const comparison = currentComparison(RENUMBERED, FP, { coverage: cov });
  const groups = completionGroups({ cues: RENUMBERED, comparison, fingerprint: FP, marks: noMarks, selection: [4], numbersOf: cov.numbersOf });
  assert.deepEqual(groups.missing, [5, 6]);
  assert.deepEqual(groups.selected, [7], 'المحدد برقم البصمة الذي يغطيه');
  const patch = [5, 6].map((n) => `${n}\n${formatSrtTime(TEN[n - 1].startMs)} --> ${formatSrtTime(TEN[n - 1].endMs)}\nاستكمال ${n}\n`).join('\n');
  const r = await readPatch([new File([patch], 'AAAAAAAAAAA.en.manual.normal.patch.srt')], { fingerprint: FP, cues: RENUMBERED });
  assert.equal(r.ok, true);
  assert.deepEqual(r.plan.items.map((x) => [x.n, x.action, x.index]), [[5, 'insert', 4], [6, 'insert', 4]]);
  // صفوف «ناقص» قبل المقطع الذي يلي موضعها زمنًا.
  const rows = buildRows(RENUMBERED, comparison.missing, { numbersOf: cov.numbersOf });
  assert.deepEqual(rows.slice(3, 7), [{ type: 'cue', index: 3 }, { type: 'missing', n: 5 }, { type: 'missing', n: 6 }, { type: 'cue', index: 4 }]);
});

test('GM-005: الدمج المقصود لا نقص ولا انحراف، ومرجع المدموج جملتاه؛ والشطر لا زيادة؛ والاستعادة الشاملة بشرطها', () => {
  const merged = mergeCues(AR, 1);
  const mc = currentComparison(merged, FP);
  assert.deepEqual([mc.missing, mc.extra, mc.drift], [[], [], []], 'كان: ناقص 3 وانحراف 2');
  assert.deepEqual(compare(merged, FP).missing, [3], 'الوصف بالرقم كما هو');
  const refs = englishReference(merged, EN, FP, { coverage: fingerprintCoverage(FP, merged) });
  assert.equal(refs[1], 'English sentence 2 English sentence 3');
  const split = splitCue(AR, 1, 6);
  const sc = currentComparison(split, FP);
  assert.deepEqual([sc.missing, sc.extra, sc.drift], [[], [], []], 'كان: زائد 2');
  // دمج وشطر يعيدان العدد: لا استعادة شاملة (P14-AC3).
  const both = splitCue(mergeCues(AR, 1), 5, 6);
  assert.equal(both.length, 10);
  assert.equal(canRestore(both, FP), false);
  assert.equal(currentComparison(both, FP).restoreTimingAvailable, false);
});

test('GM-005: تصحيح الانجراف بمرساة على القطعة الثانية من شطر يقرأ تلك القطعة لا الأولى', async () => {
  const { driftCorrect } = await import('../../../src/core/edit/drift.js');
  const split = splitCue(AR, 0, 6); // القطعتان برقم 1 في الموضعين 0 و1
  assert.deepEqual([split[0].n, split[1].n], [1, 1]);
  // الأولى على الموضع 0 والثانية على الموضع 1 بالرقم نفسه: كانت ED_DRIFT_ANCHORS (المرساتان مقطع واحد).
  const r = driftCorrect(split, { a: { n: 1, toMs: split[0].startMs, index: 0 }, b: { n: 1, toMs: split[1].startMs + 1000, index: 1 } });
  assert.equal(r.ok, true);
  assert.equal(r.cues[1].startMs, split[1].startMs + 1000);
  // بلا موضع: أول ظهور كما كان.
  assert.throws(() => driftCorrect(split, { a: { n: 1, toMs: 0 }, b: { n: 1, toMs: 5000 } }), (e) => e.code === 'ED_DRIFT_ANCHORS');
  // موضع لا يحمل الرقم المكتوب يُتجاهل (لا يُختار مقطع آخر بالموضع وحده).
  const wrong = driftCorrect(split, { a: { n: 1, toMs: split[0].startMs, index: 0 }, b: { n: 4, toMs: split[4].startMs + 500, index: 1 } });
  assert.equal(wrong.ok, true);
  assert.equal(wrong.cues[4].startMs, split[4].startMs + 500, 'الرقم 4 بموضعه الحقيقي');
});
