// إنقاذ المسودة (P14-AC7، R57): تعديلاتي تبقى، وتُقارن بالأحدث، وغير المتعارض يُعاد تطبيقه، والمتعارض يأخذ الأحدث حتى
// أختار، والإزاحة بالقاعدة نفسها؛ ثم الحفظ على الأحدث بنسخته فلا يُكتب فوقه. بالتخزين الحقيقي وتبويبين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEditSession } from '../../../src/core/edit/index.js';
import { planRescue } from '../../../src/core/edit/rescue.js';

// التعارضات المسرودة في أول تمرير (قبل أي اختيار)، كما يحسبها حوار الإنقاذ من planRescue بلا resolve.
const rescueConflicts = (o) => {
  const r = planRescue({ ...o, resolve: {} });
  return r.ok ? r.conflicts : [];
};
import { withSlotEdit } from '../../../src/core/model/bundle.js';
import { createStore } from '../../../src/core/store/index.js';
import { openedSlot, saveSlot } from '../../../src/pages/editor/persist.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID, makeCues } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const texts = (cues) => cues.map((c) => c.text);

test('غير المتعارض يُدمج من الطرفين، والمتعارض يأخذ الأحدث حتى يُختار تعديلي', () => {
  const base = makeCues(5);
  const mine = base.map((c, i) => (i === 0 ? { ...c, text: 'تعديلي 1' } : i === 2 ? { ...c, text: 'تعديلي 3' } : c));
  const theirs = base.map((c, i) => (i === 2 ? { ...c, text: 'الأحدث 3' } : i === 4 ? { ...c, text: 'الأحدث 5' } : c));
  const offsets = { base: 0, mine: 0, theirs: 0 };
  const r = planRescue({ base, mine, theirs, offsets });
  assert.equal(r.ok, true);
  assert.deepEqual(texts(r.cues), ['تعديلي 1', 'سطر 2', 'الأحدث 3', 'سطر 4', 'الأحدث 5'], 'لا كتابة فوق الأحدث في المتعارض');
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].n, 3);
  assert.equal(r.kept.length, 1, 'تعديل واحد غير متعارض أُبقي');
  assert.deepEqual(r.counts, { mine: 2, theirs: 2 });
  const chosen = planRescue({ base, mine, theirs, offsets, resolve: { 3: 'mine' } });
  assert.equal(chosen.cues[2].text, 'تعديلي 3');
  assert.equal(chosen.conflicts.length, 0);
  assert.equal(rescueConflicts({ base, mine, theirs, offsets }).length, 1, 'التعارضات تُعرض كلها قبل الاختيار');
});

test('الإزاحة: تغييري وحدي يُبقى، وتغيير الطرفين تعارض يأخذ الأحدث افتراضيًا', () => {
  const base = makeCues(3);
  const o = (mine, theirs) => planRescue({ base, mine: base, theirs: base, offsets: { base: 0, mine, theirs } });
  assert.deepEqual([o(500, 0).offsetMs, o(500, 0).offsetConflict], [500, false]);
  assert.deepEqual([o(0, 700).offsetMs, o(0, 700).offsetConflict], [700, false]);
  assert.deepEqual([o(500, 700).offsetMs, o(500, 700).offsetConflict], [700, true]);
  assert.equal(planRescue({ base, mine: base, theirs: base, offsets: { base: 0, mine: 500, theirs: 700 }, offsetChoice: 'mine' }).offsetMs, 500);
});

test('ضعف الثقة يرفض الدمج بسبب مكتوب، فيبقى «تصدير نسختي» وحده', () => {
  const base = makeCues(20);
  const theirs = makeCues(7, { startMs: 900000, text: (i) => `ملف آخر ${i}` });
  const r = planRescue({ base, mine: base, theirs, offsets: { base: 0, mine: 0, theirs: 0 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /\S/);
});

test('التعارض في التخزين: الحفظ يُرفض، والإنقاذ فوق الأحدث ثم الحفظ بنسخته يبقي تغيير التبويب الآخر وتعديلي', async () => {
  const area = createMemoryArea();
  const mk = (ms) => createStore({ area, now: () => Date.parse(NOW) + ms });
  await seedBundle(mk(0), sampleBundle({ third: true }));
  await area.flush();
  const editor = mk(1000);
  const other = mk(2000);
  const opened = await editor.getBundle(VIDEO_ID);
  const s = createEditSession({ cues: openedSlot(opened, 2).cues, offsetMs: openedSlot(opened, 2).offsetMs });
  s.setText(0, 'تعديلي في المحرّر');
  // تبويب محرّر آخر يحفظ الخانة نفسها قبلنا.
  await other.updateBundle(VIDEO_ID, (b) => {
    const cues = b.slots[1].track.original.map((c, i) => (i === 3 ? { ...c, text: 'من التبويب الآخر' } : c));
    return withSlotEdit(b, 2, { cues }, NOW);
  });
  await area.flush();
  await assert.rejects(saveSlot(editor, VIDEO_ID, opened, 2, { cues: s.snapshot(), offsetChanged: false, offsetMs: s.offsetMs }), (e) => e.code === 'ST_CONFLICT');
  assert.equal(s.dirty, true, 'تعديلاتي باقية بعد الرفض');

  const latest = await editor.getBundle(VIDEO_ID);
  const theirs = openedSlot(latest, 2);
  const plan = planRescue({ base: s.baseSnapshot(), mine: s.snapshot(), theirs: theirs.cues, offsets: { base: s.baseOffsetMs, mine: s.offsetMs, theirs: theirs.offsetMs } });
  assert.equal(plan.ok, true);
  assert.equal(plan.conflicts.length, 0);
  s.rebaseMerged({ cues: theirs.cues, offsetMs: theirs.offsetMs }, { cues: plan.cues, offsetMs: plan.offsetMs });
  const saved = await saveSlot(editor, VIDEO_ID, latest, 2, { cues: s.snapshot(), offsetChanged: s.offsetChanged, offsetMs: s.offsetMs });
  const cur = saved.slots[1].track.current;
  assert.equal(cur[0].text, 'تعديلي في المحرّر');
  assert.equal(cur[3].text, 'من التبويب الآخر', 'تغيير الأحدث لم يُكتب فوقه');
});

test('تدقيق 5fedcb9 (CX-001): قطعتا شطر محفوظ برقم واحد لكلٍّ تعارضها واختيارها، فاختيار الأولى لا يحسم الثانية', async () => {
  const { splitCue } = await import('../../../src/core/edit/structure.js');
  const { validateCues } = await import('../../../src/core/model/cue.js');
  const base = splitCue([{ n: 1, startMs: 1000, endMs: 5000, text: 'الأول الثاني' }], 0, 5);
  assert.equal(validateCues(base).ok, true, 'القطعتان صالحتان برقم واحد');
  const mine = base.map((c, i) => ({ ...c, text: `تعديلي ${i + 1}` }));
  const theirs = base.map((c, i) => ({ ...c, text: `الأحدث ${i + 1}` }));
  const ctx = { base, mine, theirs, offsets: { base: 0, mine: 0, theirs: 0 } };
  const first = rescueConflicts(ctx);
  assert.deepEqual(first.map((c) => c.n), [1, 1], 'الرقم للعرض كما هو');
  assert.equal(new Set(first.map((c) => c.key)).size, 2, 'مفتاحان مختلفان');
  // «تعديلي» للأولى، والثانية على «الأحدث» الافتراضي (كما يبني حوار الإنقاذ resolve بمفتاح كل صف).
  const chosen = planRescue({ ...ctx, resolve: { [first[0].key]: 'mine' } });
  assert.deepEqual(texts(chosen.cues), ['تعديلي 1', 'الأحدث 2']);
  assert.deepEqual(chosen.conflicts.map((c) => c.key), [first[1].key], 'الثانية ما زالت تنتظر اختيارها');
  const both = planRescue({ ...ctx, resolve: { [first[0].key]: 'theirs', [first[1].key]: 'mine' } });
  assert.deepEqual([texts(both.cues), both.conflicts.length], [['الأحدث 1', 'تعديلي 2'], 0]);
  // ملف مستورد بأرقام مكررة (لا شطر): المفتاح يميّز الظهورين كذلك، والرقم الفريد يبقى مفتاحه نفسه.
  const dup = [{ n: 1, startMs: 0, endMs: 900, text: 'أ' }, { n: 2, startMs: 1000, endMs: 1900, text: 'ب' }, { n: 2, startMs: 2000, endMs: 2900, text: 'ج' }];
  const r = rescueConflicts({ base: dup, mine: dup.map((c) => ({ ...c, text: `${c.text} م` })), theirs: dup.map((c) => ({ ...c, text: `${c.text} ث` })), offsets: ctx.offsets });
  assert.deepEqual(r.map((c) => c.key), [1, '2.1', '2.2']);
});

test('تدقيق 5fedcb9 (GM-014.1): «تثبيت الإزاحة» ثم ± من المشغّل: الإنقاذ يطبّق إزاحة الأحدث فوق التوقيت المثبّت مرة واحدة', () => {
  const base = makeCues(3);
  const session = createEditSession({ cues: base, offsetMs: 1000 });
  assert.equal(session.commitOffset().ok, true);
  assert.deepEqual([session.offsetMs, session.committedMs], [0, 1000]);
  const mine = session.snapshot();
  assert.equal(mine[0].startMs, base[0].startMs + 1000, 'التوقيت يحمل الإزاحة');
  const shown = (r) => r.cues[0].startMs + r.offsetMs;
  // المشغّل غيّر الإزاحة من +1.0 إلى +1.5 (لا توقيتًا): الظاهر المقصود +1.5، لا +2.5.
  const offsets = { base: 1000, mine: session.offsetMs, theirs: 1500, committed: session.committedMs };
  const r = planRescue({ base, mine, theirs: base, offsets });
  assert.equal(r.ok, true);
  assert.equal(r.offsetConflict, false, 'التثبيت لا يحرّك الظاهر فلا تعارض');
  assert.equal(shown(r), base[0].startMs + 1500);
  // الأحدث لم يحرّك الإزاحة: يبقى ظاهر التثبيت (+1.0).
  assert.equal(shown(planRescue({ base, mine, theirs: base, offsets: { ...offsets, theirs: 1000 } })), base[0].startMs + 1000);
  // وبعد التراجع عن التثبيت لا شيء مثبّت.
  session.undo();
  assert.equal(session.committedMs, 0);
});
