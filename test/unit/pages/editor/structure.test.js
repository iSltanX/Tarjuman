// الدمج والشطر والانجراف والقفز في صفحة المحرّر (P14-AC3 وAC4): زمن المرساة صحيحًا أو فرقًا، وملخص المعاينة، ونصوص
// المعاينة والقفز والعلامة. المنطق الثقيل في الجلسة ومحرّكات P11 (test/unit/edit)؛ هنا ما تعرضه الصفحة قبل التطبيق.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driftCorrect } from '../../../../src/core/edit/drift.js';
import { mergeCues } from '../../../../src/core/edit/structure.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { formatTimecode } from '../../../../src/ui/format.js';
import { driftSummary, parseAnchorTime } from '../../../../src/pages/editor/drift-dialog.js';
import { markActionLabel, markBadge, mergePreview, nextMark, seekResult, splitPreview } from '../../../../src/pages/editor/text.js';
import { makeCues } from '../../../helpers/fixtures.js';

test('زمن المرساة: زمن صحيح بصيغة SRT، أو فرق بالثواني بإشارة، ولا سالب', () => {
  assert.deepEqual(parseAnchorTime('00:01:02,500', 60000), { ok: true, toMs: 62500, delta: 2500 });
  assert.deepEqual(parseAnchorTime('+1.2', 60000), { ok: true, toMs: 61200, delta: 1200 });
  assert.deepEqual(parseAnchorTime('−0.8', 60000), { ok: true, toMs: 59200, delta: -800 });
  assert.deepEqual(parseAnchorTime('٠٠:٠١:٠٢,٥٠٠', 0), { ok: true, toMs: 62500, delta: 62500 }, 'أرقام عربية');
  assert.equal(parseAnchorTime('-2', 1000).ok, false, 'يصير قبل بداية الفيديو');
  assert.equal(parseAnchorTime('', 1000).ok, false);
  assert.equal(parseAnchorTime('abc', 1000).ok, false);
});

test('ملخص الانجراف: عدد ما يتغير وأكبر تغيير وعيّنات مرتبة بلا تكرار', () => {
  const cues = makeCues(5, { startMs: 1000, durMs: 1000, gapMs: 1000 });
  const r = driftCorrect(cues, { a: { n: 1, toMs: 1000 }, b: { n: 5, toMs: 9800 } });
  assert.equal(r.ok, true);
  const s = driftSummary(cues, r.cues, [4, 0, 0, 4]);
  assert.equal(s.changed, 5, "الأول تتغير نهايته وإن ثبتت بدايته");
  assert.equal(s.max, 800);
  assert.equal(s.maxN, 5);
  assert.deepEqual(s.samples.map((x) => x.n), [1, 5]);
  assert.deepEqual(s.samples[1], { n: 5, from: 9000, to: 9800 });
});

test('نصوص المعاينة: الدمج بزمنيه، والشطر بقطعتيه مختصرتين، والقفز بطريقه أو سبب تعذّره', () => {
  const [a, b] = makeCues(2);
  const [merged] = mergeCues([a, b], 0);
  assert.match(mergePreview(a, b, merged, formatTimecode), /سيُدمج المقطع 1 مع 2: 00:00:01,000 ← 00:00:05,500/);
  const p = splitPreview(7, 'بداية\nطويلة جدًا جدًا جدًا جدًا جدًا جدًا', 'نهاية');
  assert.match(p, /المقطع 7/);
  assert.ok(!p.includes('\n'));
  assert.ok(p.includes('…'));
  assert.deepEqual(seekResult({ ok: true, via: 'open', tabId: 3 }, '00:01:00,000', messageFor).tone, 'success');
  assert.match(seekResult({ ok: true, via: 'new', tabId: 4 }, '00:01:00,000', messageFor).text, /تبويب جديد/);
  const bad = seekResult({ ok: false, code: 'TJ_WRONG_VIDEO' }, '00:01:00,000', messageFor);
  assert.equal(bad.tone, 'danger');
  assert.ok(bad.text.includes(messageFor('TJ_WRONG_VIDEO')));
});

test('العلامة: التبديل بلا ← أعود إليه ← راجعته ← بلا، والشارة تبيّن ما قد يكون انتقل', () => {
  assert.equal(nextMark(null), 'todo');
  assert.equal(nextMark('todo'), 'done');
  assert.equal(nextMark('done'), null);
  assert.equal(markActionLabel(12, null), 'علّم المقطع 12 «أعود إليه»');
  assert.equal(markActionLabel(12, { kind: 'todo' }), 'علّم المقطع 12 «راجعته»');
  assert.equal(markActionLabel(12, { kind: 'done' }), 'أزل علامة المقطع 12');
  assert.equal(markBadge({ kind: 'todo', state: 'linked' }), '⚑');
  assert.equal(markBadge({ kind: 'done', state: 'moved' }), '✓؟');
});
