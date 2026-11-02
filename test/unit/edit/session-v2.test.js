// جلسة التحرير في الإصدار الثاني (P14-AC2 وAC3 وAC6 وAC7): الاستبدال والدمج والشطر والانجراف وملف التصحيح وإعادة التطبيق
// بعد التعارض، كلٌّ خطوة واحدة قابلة للتراجع والإعادة، والمرفوض لا يغيّر شيئًا. «معدَّل» بالمحتوى لا بالموضع، فلا يصير كل ما
// بعد دمج معدَّلًا. وتنبيهات الكثافة في لوحة المشكلات لا تمنع الحفظ ولا التصدير.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../../../src/core/compare/index.js';
import { createEditSession, findIssues, planArabicExport, searchCues, slotEditTransition } from '../../../src/core/edit/index.js';
import { readingMetrics } from '../../../src/core/edit/density.js';
import { readPatch } from '../../../src/core/import/index.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { englishTrack, fingerprint, makeCues } from '../../helpers/fixtures.js';
import { sampleBundle } from '../../helpers/fixtures-v2.js';
import { fileOf } from '../../fixtures/srt/index.js';

const texts = (s) => s.snapshot().map((c) => c.text);
const ns = (s) => s.snapshot().map((c) => c.n);

test('الاستبدال من نتائج البحث خطوة واحدة، لا يمس التوقيت ولا الأرقام، والتراجع يعيده كله', () => {
  const s = createEditSession({ cues: makeCues(4, { text: (i) => (i % 2 ? `قال الرجل ${i}` : `سطر ${i}`) }) });
  const before = s.snapshot();
  const matches = searchCues(s.snapshot(), 'الرجل');
  assert.equal(matches.length, 2);
  const r = s.replaceMatches(matches, 'الشيخ');
  assert.deepEqual(r, { ok: true, count: 2, indices: [0, 2] });
  assert.deepEqual(texts(s), ['قال الشيخ 1', 'سطر 2', 'قال الشيخ 3', 'سطر 4']);
  assert.deepEqual(s.snapshot().map((c) => [c.n, c.startMs, c.endMs]), before.map((c) => [c.n, c.startMs, c.endMs]));
  assert.equal(s.historySize, 1);
  assert.equal(s.undoKind, 'replace');
  s.undo();
  assert.deepEqual(s.snapshot(), before);
  assert.equal(s.dirty, false);
  s.redo();
  assert.equal(s.changedCount, 2);
  // «استبدال هنا»: موضع واحد مختار.
  s.undo();
  s.replaceMatches(matches, 'الشيخ', { only: [1] });
  assert.deepEqual(texts(s), ['قال الرجل 1', 'سطر 2', 'قال الشيخ 3', 'سطر 4']);
  assert.deepEqual(s.replaceTexts([]), { ok: true, count: 0, indices: [] });
  assert.equal(s.historySize, 1, 'لا خطوة فارغة');
});

test('الدمج: خطوة واحدة بعدد أقل، والمعدَّل بالمحتوى (المدموج وحده)، والتراجع يعيد المقطعين', () => {
  const s = createEditSession({ cues: makeCues(5) });
  const seen = [];
  s.onChange((e) => seen.push(e));
  assert.deepEqual(s.merge(1), { ok: true, index: 1 });
  assert.equal(s.count, 4);
  assert.deepEqual(ns(s), [1, 2, 4, 5], 'المدموج برقم الأول، ولا إعادة ترقيم');
  assert.equal(s.cueAt(1).text, 'سطر 2\nسطر 3');
  assert.equal(s.changedCount, 2, 'مدموج واحد مقابل مقطعين غابا');
  assert.deepEqual([0, 1, 2, 3].map((i) => s.isChanged(i)), [false, true, false, false], 'ما بعده لم يُعدَّل وإن انزاح موضعه');
  assert.equal(seen.at(-1).structural, true);
  assert.equal(seen.at(-1).indices, null);
  s.undo();
  assert.deepEqual(s.snapshot(), makeCues(5));
  assert.equal(s.dirty, false);
  assert.deepEqual(s.merge(4), { ok: false, code: 'ED_MERGE_INVALID' }, 'لا تالي للأخير');
  assert.equal(s.canUndo, false, 'المرفوض لا يُسجَّل');
  assert.equal(s.canRedo, true, 'ولا يمسح الإعادة');
});

test('الشطر عند المؤشر: قطعتان برقم المقطع نفسه، والموضع غير الصالح مرفوض بلا تغيير', () => {
  const s = createEditSession({ cues: makeCues(3, { text: (i) => `كلمة أولى وكلمة ثانية ${i}` }) });
  const at = 'كلمة أولى'.length;
  assert.deepEqual(s.split(0, at), { ok: true, index: 0 });
  assert.equal(s.count, 4);
  assert.deepEqual(texts(s).slice(0, 2), ['كلمة أولى', 'وكلمة ثانية 1']);
  assert.deepEqual(ns(s), [1, 1, 2, 3]);
  assert.ok(s.cueAt(0).endMs === s.cueAt(1).startMs);
  assert.deepEqual(s.split(1, 0), { ok: false, code: 'ED_SPLIT_INVALID' });
  assert.equal(s.historySize, 1);
  s.undo();
  assert.equal(s.count, 3);
});

test('بعد الدمج والشطر يعود العدد ولا تُتاح الاستعادة الشاملة للتوقيت (P14-AC3، R54)', () => {
  const en = englishTrack({ cues: makeCues(6, { text: (i) => `line ${i}` }) });
  const fp = fingerprint({ track: en });
  const s = createEditSession({ cues: makeCues(6, { text: (i) => `كلمة أولى وكلمة ثانية ${i}` }) });
  assert.equal(compare(s.snapshot(), fp, { driftMs: 100 }).restoreTimingAvailable, true, 'قبلها متاحة');
  s.merge(1);
  s.split(3, 'كلمة أولى'.length);
  assert.equal(s.count, 6, 'العدد عاد كما كان');
  const r = compare(s.snapshot(), fp, { driftMs: 100 });
  assert.equal(r.restoreTimingAvailable, false, 'تساوي العدد لا يكفي');
  assert.deepEqual(s.restoreTiming(fp), { ok: false, code: 'CMP_RESTORE_UNAVAILABLE' });
});

test('تصحيح الانجراف بنقطتين خطوة واحدة، والزمن السالب يرفضه كله بأرقامه', () => {
  const s = createEditSession({ cues: makeCues(4, { startMs: 1000, durMs: 1000, gapMs: 1000 }) });
  // البدايات 1000 و3000 و5000 و7000؛ الصحيح أن الأول عند 1000 والأخير عند 7700 (انجراف 10%).
  const r = s.drift({ a: { n: 1, toMs: 1000 }, b: { n: 4, toMs: 7600 } });
  assert.deepEqual(r, { ok: true, count: 4 });
  assert.deepEqual(s.snapshot().map((c) => c.startMs), [1000, 3200, 5400, 7600]);
  assert.equal(s.historySize, 1);
  assert.equal(s.undoKind, 'drift');
  s.undo();
  assert.deepEqual(s.snapshot().map((c) => c.startMs), [1000, 3000, 5000, 7000]);
  const neg = s.drift({ a: { n: 2, toMs: 100 }, b: { n: 4, toMs: 5000 } });
  assert.deepEqual(neg, { ok: false, code: 'ED_DRIFT_NEGATIVE', negative: [1] });
  assert.deepEqual(s.drift({ a: { n: 1, toMs: 1000 }, b: { n: 1, toMs: 2000 } }), { ok: false, code: 'ED_DRIFT_ANCHORS' });
  assert.deepEqual(s.drift({ a: { n: 9, toMs: 1000 }, b: { n: 2, toMs: 2000 } }), { ok: false, code: 'ED_DRIFT_ANCHORS' });
  assert.equal(s.canUndo, false);
  assert.deepEqual(s.drift({ a: { n: 1, toMs: 1000 }, b: { n: 4, toMs: 7000 } }), { ok: true, count: 0 }, 'لا تغيير لا خطوة');
  assert.equal(s.canUndo, false);
});

test('ملف التصحيح: الناقص يُدرج في موضعه والفارغ يُستبدل، خطوة واحدة، والسليم لا يُمس', async () => {
  const en = englishTrack({ cues: makeCues(6, { text: (i) => `line ${i}` }) });
  const fp = fingerprint({ track: en });
  const full = makeCues(6, { text: (i) => `ترجمة ${i}` });
  const opened = [full[0], { ...full[1], text: '' }, full[2], full[4], full[5]];
  const s = createEditSession({ cues: opened });
  const patch = [2, 4].map((n) => `${n}\n${formatSrtTime(fp.cues[n - 1].startMs)} --> ${formatSrtTime(fp.cues[n - 1].endMs)}\nمكمّل ${n}\n`).join('\n');
  const read = await readPatch(fileOf(patch, 'AAAAAAAAAAA.ar.manual.normal.patch.srt'), { fingerprint: fp, cues: s.snapshot() });
  assert.equal(read.ok, true, JSON.stringify(read.error));
  const r = s.applyPatchPlan(read.plan);
  assert.deepEqual(r, { ok: true, applied: true, inserted: 1 });
  assert.deepEqual(texts(s), ['ترجمة 1', 'مكمّل 2', 'ترجمة 3', 'مكمّل 4', 'ترجمة 5', 'ترجمة 6']);
  assert.equal(s.historySize, 1);
  assert.equal(s.isChanged(0), false);
  assert.equal(s.isChanged(4), false, 'السليم بعد الإدراج غير معدَّل');
  s.undo();
  assert.deepEqual(s.snapshot(), opened);
  // خطة قُرئت على ترجمة تغيّرت بعدها لا تُطبَّق.
  s.setText(0, 'تغيّر');
  assert.deepEqual(s.applyPatchPlan(read.plan), { ok: false, code: 'IM_PATCH_STALE' });
});

test('إعادة التطبيق بعد التعارض: الأحدث أساس، والدمج فوقه خطوة واحدة، والتراجع يعيد الأحدث (R57)', () => {
  const s = createEditSession({ cues: makeCues(3), offsetMs: 0 });
  s.setText(0, 'تعديلي');
  const latest = { cues: makeCues(3, { text: (i) => (i === 3 ? 'من المشغّل' : `سطر ${i}`) }), offsetMs: 500 };
  const merged = { cues: [{ ...latest.cues[0], text: 'تعديلي' }, latest.cues[1], latest.cues[2]], offsetMs: 500 };
  s.rebaseMerged(latest, merged);
  assert.equal(s.baseOffsetMs, 500);
  assert.deepEqual(texts(s), ['تعديلي', 'سطر 2', 'من المشغّل']);
  assert.equal(s.changedCount, 1, 'تعديلي وحده غير محفوظ');
  assert.equal(s.undoKind, 'rescue');
  s.undo();
  assert.deepEqual(s.snapshot(), latest.cues);
  assert.equal(s.dirty, false);
  assert.deepEqual(s.baseSnapshot(), latest.cues);
});

test('بعد حفظٍ كُتب أثناءه: الدمج الذي دخل المحفوظ لا يعدّ تغييرًا في البنية، وما بعده يُعدّ (مراجعة)', () => {
  const s = createEditSession({ cues: makeCues(6) });
  s.merge(1);
  const saved = s.snapshot();
  const at = s.checkpoint();
  s.setText(0, 'كُتب أثناء الحفظ');
  s.markSaved({ cues: saved, offsetMs: 0 }, at);
  assert.equal(s.reshaped, false, 'المواضع تقابل المحفوظ');
  assert.equal(s.changedCount, 1);
  s.split(2, 'سطر'.length);
  assert.equal(s.reshaped, true, 'شطر بعد الحفظ');
  s.undo();
  assert.equal(s.reshaped, false);
  s.undo();
  s.undo();
  assert.equal(s.reshaped, true, 'التراجع عن دمج محفوظ يغيّر المواضع عن المحفوظ');
});

test('الكثافة: قراءة سريعة وسطر طويل تحذيران لا يمنعان الحفظ ولا التصدير، وبعتبة قابلة للضبط (P14-AC3، R55)', () => {
  const fast = { n: 1, startMs: 0, endMs: 1000, text: 'هذا سطر عربي طويل جدًا يُقرأ في ثانية واحدة' };
  const long = { n: 2, startMs: 2000, endMs: 9000, text: 'سطر واحد طويل جدًا يتجاوز اثنين وأربعين محرفًا بكثير هنا' };
  const cues = [fast, long, { n: 3, startMs: 10000, endMs: 12000, text: 'قصير' }];
  assert.equal(findIssues(cues).list.length, 0, 'بلا عتبة لا تنبيه (التصدير والحفظ كما كانا)');
  const r = findIssues(cues, { density: {} });
  assert.deepEqual(r.list.map((i) => `${i.n}:${i.code}`), ['1:ED_READING_FAST', '2:ED_LINE_LONG']);
  assert.ok(r.list.every((i) => i.tone === 'warning' && !i.blocksSave && !i.blocksExport && i.density));
  assert.equal(r.list[0].params.max, 20);
  assert.equal(r.exportBlockers.length, 0);
  const cps = readingMetrics(fast).cps;
  assert.equal(findIssues(cues, { density: { maxCps: Math.ceil(cps) } }).list.filter((i) => i.code === 'ED_READING_FAST').length, 0, 'عتبة الإعدادات');
  const s = createEditSession({ cues, density: {} });
  assert.equal(s.issues().warnings, 2);
  s.setDensity(null);
  assert.equal(s.issues().warnings, 0);
  assert.equal(planArabicExport({ videoId: 'AAAAAAAAAAA', cues, offsetMs: 0 }).ok, true, 'لا تمنع التصدير');
});

test('حفظ الخانة: يكتب في خانة التحرير ولا يغيّر النشطة، والمطابق للأصل يعني «الأصل المستورد»', () => {
  const b = sampleBundle({ third: true });
  const n = 2;
  const cues = b.slots[1].track.original.map((c) => ({ ...c }));
  cues[0] = { ...cues[0], text: 'معدّل في الخانة 2' };
  const next = slotEditTransition(b, n, { cues }, '2026-11-02T10:00:00.000Z');
  assert.equal(next.active, b.active, 'النشطة كما هي');
  assert.deepEqual(next.record.arabic, b.record.arabic, 'سجل النشطة لم يُمس');
  assert.equal(next.slots[1].track.current[0].text, 'معدّل في الخانة 2');
  const back = slotEditTransition(next, n, { cues: b.slots[1].track.original, displayOffsetMs: 300 }, '2026-11-02T10:01:00.000Z');
  assert.equal(back.slots[1].track.current, null);
  assert.equal(back.slots[1].offsetMs, 300);
  const bad = cues.map((c, i) => (i === 0 ? { ...c, endMs: c.startMs - 1 } : c));
  assert.throws(() => slotEditTransition(b, n, { cues: bad }, '2026-11-02T10:00:00.000Z'), (e) => e.code === 'ED_SAVE_HAS_ERRORS');
  const empty = sampleBundle();
  assert.throws(() => slotEditTransition(empty, 3, { cues }, '2026-11-02T10:00:00.000Z'), (e) => e.code === 'ST_SLOT_EMPTY');
});
