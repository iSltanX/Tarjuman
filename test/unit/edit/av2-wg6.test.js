// التدقيق الموحد V2، المجموعة WG-6: الإنقاذ مع إزاحة مثبّتة (U-036)، وختم مجموعة التراجع عند الحفظ (U-038)، وreshaped بعد
// التراجع عن بنية محفوظة (U-039)، والتشكيل اللاحق في البحث (U-040).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEditSession } from '../../../src/core/edit/index.js';
import { planRescue } from '../../../src/core/edit/rescue.js';
import { planReplace, searchCues } from '../../../src/core/edit/search.js';
import { makeCues } from '../../helpers/fixtures.js';

const shift = (cues, d) => cues.map((c) => ({ ...c, startMs: c.startMs + d, endMs: c.endMs + d }));

/** الإعداد: 12 مقطعًا، إزاحة +2000، «تثبيت الإزاحة»، ثم تعديل نص المقطع 1. */
function committedSetup() {
  const base = makeCues(12);
  const s = createEditSession({ cues: base, offsetMs: 2000 });
  s.commitOffset();
  s.setText(0, 'مقطع أول معدّل');
  return { base, mine: s.snapshot(), offsets: { base: 2000, mine: s.offsetMs, committed: s.committedMs } };
}
const shownOf = (r) => r.cues.map((c) => c.startMs + r.offsetMs);

test('AV2 U-036 (أ): طرف آخر حرّك المقطع 6 بـ+100: لا تعارض، تعديل واحد، والظاهر الأساس + 2000 والمقطع 6 + 2100', () => {
  const { base, mine, offsets } = committedSetup();
  const theirs = structuredClone(base);
  theirs[5].startMs += 100;
  theirs[5].endMs += 100;
  const r = planRescue({ base, mine, theirs, offsets: { ...offsets, theirs: 2000 } });
  assert.equal(r.ok, true);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(r.counts, { mine: 1, theirs: 1 });
  assert.deepEqual(shownOf(r), base.map((c, i) => c.startMs + 2000 + (i === 5 ? 100 : 0)));
  assert.equal(r.cues[0].text, 'مقطع أول معدّل');
});

test('AV2 U-036 (ب): طرف آخر ثبّت الإزاحة نفسها: لا تعارض ولا تثبيت مضاعف، والظاهر الأساس + 2000', () => {
  const { base, mine, offsets } = committedSetup();
  const r = planRescue({ base, mine, theirs: shift(base, 2000), offsets: { ...offsets, theirs: 0 } });
  assert.equal(r.ok, true);
  assert.equal(r.conflicts.length, 0);
  assert.equal(r.offsetConflict, false);
  assert.deepEqual(shownOf(r), base.map((c) => c.startMs + 2000));
  assert.equal(r.offsetMs, 0, 'لا −2000 ولا +2000');
});

test('AV2 U-036 (ج): المشغّل غيّر الإزاحة إلى 2500: الظاهر الأساس + 2500 (كما في GM-014.1)، وتعديل واحد', () => {
  const { base, mine, offsets } = committedSetup();
  const r = planRescue({ base, mine, theirs: base, offsets: { ...offsets, theirs: 2500 } });
  assert.equal(r.ok, true);
  assert.equal(r.conflicts.length, 0);
  assert.equal(r.counts.mine, 1);
  assert.deepEqual(shownOf(r), base.map((c) => c.startMs + 2500));
});

test('AV2 U-036: المقطع الذي تغيّر نصه وتوقيته معًا يُعدّ مقطعًا واحدًا', () => {
  const base = makeCues(5);
  const mine = base.map((c, i) => (i === 1 ? { ...c, text: 'م', startMs: c.startMs + 50, endMs: c.endMs + 50 } : c));
  const r = planRescue({ base, mine, theirs: base, offsets: { base: 0, mine: 0, theirs: 0 } });
  assert.deepEqual(r.counts, { mine: 1, theirs: 0 });
});

test('AV2 U-038: الحفظ أثناء الكتابة يختم المجموعة، فتبقى «تراجع» ويعيد التراجع الواحد آخر ما كُتب لا ما قبل الحفظ', () => {
  const s = createEditSession({ cues: makeCues(3) });
  s.setText(0, 'مرحبا 1', 'text:0');
  const cp = s.checkpoint(); // بدء الحفظ
  s.setText(0, 'مرحبا 1x', 'text:0'); // كتابة أثناء انتظار الحفظ
  s.markSaved({ cues: shift(s.snapshot(), 0).map((c, i) => (i === 0 ? { ...c, text: 'مرحبا 1' } : c)), offsetMs: 0 }, cp);
  s.setText(0, 'سطر 1', 'text:0');
  assert.equal(s.dirty, true);
  assert.equal(s.canUndo, true);
  s.undo();
  assert.equal(s.cueAt(0).text, 'مرحبا 1x', 'آخر ما كُتب لا ما قبل الحفظ');
});

test('AV2 U-039: reshaped يبقى صحيحًا بعد التراجع عن بنية محفوظة ثم تعديل جديد', () => {
  const s = createEditSession({ cues: makeCues(6) });
  s.merge(0);
  s.split(s.count - 1, 3);
  const cp = s.checkpoint();
  const saved = s.snapshot();
  s.setText(4, 'كتابة أثناء الحفظ');
  s.markSaved({ cues: saved, offsetMs: 0 }, cp);
  s.undo(); s.undo(); s.undo();
  s.setText(0, 'سطر 1 تعديل');
  assert.equal(s.reshaped, true);
});

test('AV2 U-040: المطابقة تشمل التشكيل اللاحق، والاستبدال لا يكدّس علامتين', () => {
  const cues = [{ n: 1, startMs: 0, endMs: 1000, text: 'جاء محمدٌ اليوم' }, { n: 2, startMs: 1000, endMs: 2000, text: 'شكراً لك' }];
  const m1 = searchCues(cues.slice(0, 1), 'محمد', {});
  assert.equal(cues[0].text.slice(m1[0].start, m1[0].end), 'محمدٌ');
  assert.equal(planReplace(cues.slice(0, 1), m1, 'أحمدُ').changes[0].after, 'جاء أحمدُ اليوم');
  const m2 = searchCues(cues.slice(1), 'شكرا', {});
  assert.equal(planReplace(cues.slice(1), m2, 'شكرًا').changes[0].after, 'شكرًا لك');
});
