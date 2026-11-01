// لوحة المشكلات (P8-AC4): الأخطاء تمنع الحفظ والتصدير، والتحذيرات لا تمنع الحفظ؛ ولا إصلاح تلقائي أبدًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISSUE_LIMITS, findIssues } from '../../../src/core/edit/index.js';
import { hasCode } from '../../../src/core/errors/index.js';
import { makeCues, realTrack } from '../../helpers/fixtures.js';

const cue = (n, startMs, endMs, text = `سطر ${n}`) => ({ n, startMs, endMs, text });
const codes = (r) => r.list.map((i) => `${i.n}:${i.code}`);

test('ملف سليم: لا أخطاء ولا تحذيرات، والعيّنتان الحقيقيتان كذلك', () => {
  assert.deepEqual(findIssues(makeCues(50)).list, []);
  for (const kind of ['manual', 'asr']) {
    const r = findIssues(realTrack(kind).cues);
    assert.equal(r.errors, 0, kind);
    assert.equal(r.warnings, 0, `${kind}: العتبات لا تُغرق ملفًا حقيقيًا بالتحذيرات`);
  }
});

test('الأخطاء: نهاية قبل البداية أو تساويها، وزمن سالب، وما فوق الحد', () => {
  const r = findIssues([cue(1, 1000, 900), cue(2, 2000, 2000), cue(3, -500, 2500), cue(4, 3000, 360000001)]);
  assert.deepEqual(codes(r), ['1:ED_END_BEFORE_START', '2:ED_END_BEFORE_START', '3:ED_NEGATIVE_TIME', '4:ED_TIME_RANGE']);
  assert.equal(r.errors, 4);
  assert.ok(r.list.every((i) => i.tone === 'error' && i.blocksSave && i.blocksExport));
  assert.equal(r.list[2].field, 'start');
  assert.equal(r.list[3].field, 'end');
});

test('صيغة غير صالحة في حقل تُحسب خطأً من المسودات، ولا تغيّر المقطع', () => {
  const cues = makeCues(3);
  const r = findIssues(cues, { drafts: new Map([['1:end', '00:00:0x']]) });
  assert.deepEqual(codes(r), ['2:ED_TIME_FORMAT']);
  assert.equal(r.list[0].field, 'end');
  assert.equal(r.list[0].index, 1);
  assert.equal(r.errors, 1);
  assert.deepEqual(cues, makeCues(3));
});

test('التحذيرات: التداخل والمدة القصيرة والفجوة الكبيرة لا تمنع الحفظ', () => {
  const gap = ISSUE_LIMITS.largeGapMs + 1;
  const r = findIssues([cue(1, 0, 1500), cue(2, 1400, 1600), cue(3, 1600 + gap, 5000 + gap)]);
  assert.deepEqual(codes(r), ['1:ED_OVERLAP', '2:ED_SHORT', '2:ED_GAP']);
  assert.equal(r.errors, 0);
  assert.equal(r.warnings, 3);
  assert.ok(r.list.every((i) => i.tone === 'warning' && !i.blocksSave));
  assert.equal(r.list[0].params.next, 2);
});

test('التداخل والنص الفارغ تحذيران يمنعان التصدير وحده (كاتب SRT يرفضهما)', () => {
  const r = findIssues([cue(1, 0, 1500, ''), cue(2, 1400, 3000, 'سطر\n'), cue(3, 4000, 5000, 'أ\n\nب')]);
  assert.deepEqual(codes(r), ['1:ED_TEXT_EMPTY', '1:ED_OVERLAP', '2:ED_TEXT_BLANK_LINE', '3:ED_TEXT_BLANK_LINE']);
  assert.deepEqual(r.exportBlockers.map((i) => i.n), [1, 1, 2, 3]);
  assert.equal(r.errors, 0);
});

test('لا تحذير تداخل أو فجوة بجوار مقطع فيه خطأ (لا ضجيج فوق الخطأ)', () => {
  const r = findIssues([cue(1, 1000, 900), cue(2, 950, 2000)]);
  assert.deepEqual(codes(r), ['1:ED_END_BEFORE_START']);
});

test('byIndex للصفوف، والقائمة مرتبة بالموضع، وكل رمز له رسالة', () => {
  const r = findIssues([cue(1, 0, 1500, ''), cue(2, 1400, 1450), cue(3, 3000, 2000)]);
  assert.deepEqual([...r.byIndex.keys()], [0, 1, 2]);
  assert.deepEqual(r.list.map((i) => i.index), [0, 0, 1, 2]);
  assert.deepEqual(r.byIndex.get(0).map((i) => i.code), ['ED_TEXT_EMPTY', 'ED_OVERLAP']);
  for (const i of r.list) assert.ok(hasCode(i.code), i.code);
});

test('الأداء: 50,000 مقطع تُفحص بسرعة تكفي لكل تعديل', () => {
  const cues = makeCues(50000);
  const t = performance.now();
  const r = findIssues(cues);
  const ms = performance.now() - t;
  assert.equal(r.list.length, 0);
  assert.ok(ms < 200, `${ms.toFixed(1)}ms`);
});
