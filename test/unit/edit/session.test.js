// جلسة التحرير (P8-AC2 وAC3 وAC5): النطاق، والتراجع والإعادة قبل الحفظ، والأصل لا يُمس، وعقد التوقيت
// بلا تطبيق مزدوج للإزاحة. كل فعل خطوة واحدة في التاريخ، والمرفوض لا يغيّر شيئًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEditSession, resolveScope } from '../../../src/core/edit/index.js';
import { exportTiming, shownTimes } from '../../../src/core/model/index.js';
import { fingerprint, englishTrack, makeCues } from '../../helpers/fixtures.js';
import { CONSTANT_MAX_EXPONENT, LINEAR_MAX_EXPONENT, growth } from '../../helpers/growth.js';

const times = (s) => s.snapshot().map((c) => [c.startMs, c.endMs]);
const shown = (s) => s.snapshot().map((c) => shownTimes(c, s.offsetMs));

test('الفتح: نسخة مستقلة، ولا تغييرات، ولا تاريخ', () => {
  const cues = makeCues(3);
  const s = createEditSession({ cues, offsetMs: 0 });
  assert.equal(s.count, 3);
  assert.equal(s.dirty, false);
  assert.equal(s.changedCount, 0);
  assert.equal(s.canUndo, false);
  assert.ok(Object.isFrozen(s.cueAt(0)), 'المقطع لا يُعدَّل من الخارج');
  s.setText(0, 'نص جديد');
  assert.equal(cues[0].text, 'سطر 1', 'المدخل لم يتغير');
  assert.deepEqual(s.snapshot()[0], { n: 1, startMs: 1000, endMs: 3000, text: 'نص جديد' });
});

test('النص: كتابة متتابعة في مقطع واحد خطوة واحدة في التاريخ، والختم يبدأ خطوة جديدة', () => {
  const s = createEditSession({ cues: makeCues(2) });
  s.setText(0, 'أ');
  s.setText(0, 'أب');
  s.setText(0, 'أبج');
  assert.equal(s.historySize, 1);
  s.seal();
  s.setText(0, 'أبجد');
  assert.equal(s.historySize, 2);
  s.setText(1, 'آخر');
  assert.equal(s.historySize, 3, 'مقطع آخر خطوة أخرى');
  s.undo();
  s.undo();
  assert.equal(s.cueAt(0).text, 'أبج');
  s.undo();
  assert.equal(s.cueAt(0).text, 'سطر 1');
  assert.equal(s.dirty, false);
  assert.equal(s.setText(0, 'سطر 1').changed, false, 'القيمة نفسها لا تُسجَّل');
  assert.equal(s.canUndo, false);
});

test('الزمن: تعديل البداية والنهاية، والمعدَّل يُعلَّم، والرجوع إلى القيمة الأصلية يزيل العلامة', () => {
  const s = createEditSession({ cues: makeCues(3) });
  s.setTime(1, 'start', 3600);
  s.setTime(1, 'end', 5600);
  assert.deepEqual(times(s)[1], [3600, 5600]);
  assert.equal(s.isChanged(1), true);
  assert.equal(s.changedCount, 1);
  assert.equal(s.historySize, 2);
  s.setTime(1, 'start', 3500);
  s.setTime(1, 'end', 5500);
  assert.equal(s.isChanged(1), false, 'مطابق للمفتوح');
  assert.equal(s.dirty, false);
  assert.throws(() => s.setTime(1, 'middle', 0), RangeError);
  assert.throws(() => s.setTime(1, 'start', 1.5), RangeError);
  assert.throws(() => s.setTime(9, 'start', 0), RangeError);
});

test('النطاق: مقطع، أو مقاطع محددة، أو الملف كله', () => {
  assert.deepEqual(resolveScope({ kind: 'cue', index: 2 }, 5), [2]);
  assert.deepEqual(resolveScope({ kind: 'selection', indices: [3, 1, 3] }, 5), [1, 3]);
  assert.equal(resolveScope({ kind: 'all' }, 5), null);
  assert.throws(() => resolveScope({ kind: 'cue', index: 5 }, 5), RangeError);
  assert.throws(() => resolveScope({ kind: 'selection', indices: [] }, 5), RangeError);
  assert.throws(() => resolveScope({ kind: 'other' }, 5), RangeError);
});

test('± لمقطع ولمقاطع محددة وللملف كله: الأثر على النطاق وحده، وخطوة واحدة لكل فعل', () => {
  const s = createEditSession({ cues: makeCues(4) });
  assert.deepEqual(s.shift({ kind: 'cue', index: 1 }, 500), { ok: true, count: 1, indices: [1] });
  assert.deepEqual(times(s).map((t) => t[0]), [1000, 4000, 6000, 8500]);
  assert.deepEqual(s.shift({ kind: 'selection', indices: [0, 3] }, -500).indices, [0, 3]);
  assert.deepEqual(times(s).map((t) => t[0]), [500, 4000, 6000, 8000]);
  const all = s.shift({ kind: 'all' }, 1000);
  assert.equal(all.count, 4);
  assert.equal(all.indices, null);
  assert.deepEqual(times(s).map((t) => t[0]), [1500, 5000, 7000, 9000]);
  assert.equal(s.historySize, 3);
  s.undo();
  assert.deepEqual(times(s).map((t) => t[0]), [500, 4000, 6000, 8000]);
  s.redo();
  assert.deepEqual(times(s).map((t) => t[0]), [1500, 5000, 7000, 9000]);
});

test('± المرفوض: زمن سالب يرفض النقل كله بأرقام المقاطع، ولا نقل جزئي ولا خطوة في التاريخ', () => {
  const s = createEditSession({ cues: makeCues(3, { startMs: 200 }) });
  const before = times(s);
  assert.deepEqual(s.shift({ kind: 'all' }, -500), { ok: false, code: 'ED_SHIFT_NEGATIVE', negative: [1] });
  assert.deepEqual(times(s), before);
  assert.equal(s.canUndo, false);
  assert.deepEqual(s.shift({ kind: 'all' }, 0), { ok: false, code: 'ED_SHIFT_ZERO' });
  assert.throws(() => s.shift({ kind: 'all' }, 0.5), RangeError);
});

test('التراجع والإعادة: فعل جديد بعد تراجع يمسح الإعادة، والحد يُسقط الأقدم دون مسّ التغييرات', () => {
  const s = createEditSession({ cues: makeCues(2), maxHistory: 3 });
  for (let i = 1; i <= 5; i++) {
    s.setTime(0, 'end', 3000 + i);
    s.seal();
  }
  assert.equal(s.historySize, 3);
  s.undo();
  s.undo();
  s.undo();
  assert.equal(s.canUndo, false);
  assert.equal(s.cueAt(0).endMs, 3002, 'الأقدم سقط، والباقي تغيّر حقيقي ما زال');
  assert.equal(s.dirty, true);
  s.redo();
  s.setText(1, 'جديد');
  assert.equal(s.canRedo, false);
  assert.deepEqual(s.undo(), { ok: true, kind: 'text' });
  assert.deepEqual(s.redo(), { ok: true, kind: 'text' });
  assert.deepEqual(s.redo(), { ok: false });
});

test('المسودة: صيغة غير صالحة خطأ ظاهر بلا تغيير المقطع، والقيمة الصالحة تزيلها', () => {
  const s = createEditSession({ cues: makeCues(2) });
  s.setDraft(0, 'start', '00:00:0x');
  assert.equal(s.issues().errors, 1);
  assert.equal(s.issues().list[0].code, 'ED_TIME_FORMAT');
  assert.equal(s.dirty, false, 'المسودة ليست تعديلًا');
  assert.equal(s.hasDrafts, true);
  s.setTime(0, 'start', 900);
  assert.equal(s.issues().errors, 0);
  assert.equal(s.hasDrafts, false);
  s.setDraft(1, 'end', 'xx');
  s.undo();
  assert.equal(s.hasDrafts, true, 'التراجع لا يمس مسودة مقطع لم يتغير');
  s.setDraft(1, 'end', null);
  assert.equal(s.issues().errors, 0);
});

test('التجاهل يعيد المفتوح، والتأسيس بعد الحفظ يجعل الحالي أساسًا جديدًا بلا تاريخ', () => {
  const s = createEditSession({ cues: makeCues(3), offsetMs: 500 });
  s.setText(0, 'أ');
  s.commitOffset();
  s.discard();
  assert.equal(s.dirty, false);
  assert.equal(s.offsetMs, 500);
  assert.deepEqual(s.snapshot(), makeCues(3));
  assert.equal(s.canUndo, false);
  s.shift({ kind: 'all' }, 100);
  s.rebase({ cues: s.snapshot(), offsetMs: s.offsetMs });
  assert.equal(s.dirty, false);
  assert.equal(s.canUndo, false);
  assert.equal(s.cueAt(0).startMs, 1100);
});

test('الإشعار: الفهارس المتأثرة أو null للملف كله، وتغيّر الإزاحة', () => {
  const s = createEditSession({ cues: makeCues(3), offsetMs: 500 });
  const seen = [];
  const off = s.onChange((e) => seen.push(e));
  s.setText(2, 'ج');
  s.shift({ kind: 'selection', indices: [0, 1] }, 100);
  s.commitOffset();
  s.undo();
  off();
  s.setText(0, 'لا يصل');
  assert.deepEqual(seen.map((e) => [e.kind, e.indices, e.offset]), [
    ['text', [2], false], ['shift', [0, 1], false], ['commit', null, true], ['commit', null, true],
  ]);
  assert.ok(seen.every((e) => e.version > 0));
});

test('الاستعادة اليدوية للتوقيت: خطوة واحدة على المقاطع المختلفة وحدها، والنص لا يُمس', () => {
  const track = englishTrack({ cues: makeCues(4, { text: (i) => `line ${i}` }) });
  const fp = fingerprint({ track });
  const s = createEditSession({ cues: makeCues(4) });
  s.shift({ kind: 'cue', index: 2 }, 700);
  s.setText(2, 'معدَّل');
  s.seal();
  const r = s.restoreTiming(fp);
  assert.deepEqual(r, { ok: true, count: 1, indices: [2] });
  assert.deepEqual(times(s), makeCues(4).map((c) => [c.startMs, c.endMs]));
  assert.equal(s.cueAt(2).text, 'معدَّل');
  s.undo();
  assert.equal(s.cueAt(2).startMs, 6700);
  const short = fingerprint({ track: englishTrack({ cues: makeCues(3) }) });
  assert.deepEqual(s.restoreTiming(short), { ok: false, code: 'CMP_RESTORE_UNAVAILABLE' });
});

// ---- عقد التوقيت: لا تطبيق مزدوج (docs/contracts/timing.md) ----

test('لا تطبيق مزدوج ١: تثبيت الإزاحة +0.5 يجعل المحفوظ +500 والإزاحة 0 والظاهر كما كان، في خطوة واحدة', () => {
  const s = createEditSession({ cues: makeCues(3), offsetMs: 500 });
  const before = shown(s);
  assert.deepEqual(s.commitOffset(), { ok: true, count: 3 });
  assert.equal(s.offsetMs, 0);
  assert.deepEqual(times(s)[0], [1500, 3500]);
  assert.deepEqual(shown(s), before);
  assert.equal(s.offsetChanged, true);
  assert.equal(s.historySize, 1);
  s.undo();
  assert.equal(s.offsetMs, 500, 'التراجع يعيد الاثنين معًا');
  assert.deepEqual(times(s)[0], [1000, 3000]);
  assert.equal(s.dirty, false);
});

test('لا تطبيق مزدوج: التثبيت مرة ثانية لا يضيف شيئًا (الإزاحة صارت صفرًا)', () => {
  const s = createEditSession({ cues: makeCues(2), offsetMs: 500 });
  s.commitOffset();
  const once = times(s);
  assert.deepEqual(s.commitOffset(), { ok: false, code: 'ED_NO_OFFSET' });
  assert.deepEqual(times(s), once);
  assert.equal(s.historySize, 1);
});

test('لا تطبيق مزدوج: التثبيت الذي ينتج زمنًا سالبًا مرفوض كله ولا يصفّر الإزاحة', () => {
  const s = createEditSession({ cues: makeCues(2, { startMs: 1000 }), offsetMs: -2000 });
  assert.deepEqual(s.commitOffset(), { ok: false, code: 'ED_COMMIT_NEGATIVE', negative: [1] });
  assert.equal(s.offsetMs, -2000);
  assert.equal(s.canUndo, false);
});

test('لا تطبيق مزدوج ٣: إزاحة +0.5 ثم نقل الملف كله +0.5 يجعل المحفوظ +500 والإزاحة +500 والظاهر +1000، مع تنبيه قبل التطبيق', () => {
  const s = createEditSession({ cues: makeCues(2), offsetMs: 500 });
  assert.equal(s.shiftNotice({ kind: 'all' }), 500, 'تنبيه: الإزاحة مفعّلة والنطاق الملف كله');
  assert.equal(s.shiftNotice({ kind: 'cue', index: 0 }), 0, 'لا تنبيه لنطاق أضيق');
  s.shift({ kind: 'all' }, 500);
  assert.deepEqual(times(s)[0], [1500, 3500]);
  assert.equal(s.offsetMs, 500, 'الإزاحة لا تتغير بنقل المحرّر');
  assert.equal(s.offsetChanged, false);
  assert.deepEqual(shown(s)[0], { startMs: 2000, endMs: 4000 });
});

test('لا تطبيق مزدوج: التصدير بعد التثبيت يطابق الظاهر قبله، والإزاحة لا تُضاف مرة ثانية', () => {
  const s = createEditSession({ cues: makeCues(3), offsetMs: 500 });
  const before = exportTiming(s.snapshot(), s.offsetMs, 'shown');
  s.commitOffset();
  const after = exportTiming(s.snapshot(), s.offsetMs, 'shown');
  assert.equal(after.askUser, false, 'الإزاحة صفر: المحفوظ دون سؤال');
  assert.deepEqual(after.cues, before.cues);
});

test('الأداء: نقل 50,000 مقطع والتراجع عنه، وتعديل نص فيها، سريعان ولا يحفظان نسخة كاملة لكل خطوة', () => {
  const s = createEditSession({ cues: makeCues(50000) });
  s.shift({ kind: 'all' }, 100);
  s.undo();
  s.redo();
  for (let i = 0; i < 200; i++) s.setText(i, `نص ${i}`);
  assert.equal(s.changedCount, 50000);
  // بالنمو لا بزمن مطلق (تحقق الجولة الثانية §١١): كان النقل والتراجع والإعادة دون 1000ms بزمن الساعة فسقط بـ1356ms تحت الحمل.
  // والآن الأس المقدّر بزمن المعالج بين 1,000 و50,000 مقطع (test/helpers/growth.js): النقل خطي، وتعديل النص لا يتعلق بحجم الملف
  // (نسخة كاملة لكل خطوة تجعله خطيًا). والحدود المطلقة سخية تكشف الانهيار وحده.
  const shift = growth({ small: 1000, large: 50000, prepare: (n) => {
    const x = createEditSession({ cues: makeCues(n) });
    return () => {
      x.shift({ kind: 'all' }, 100);
      x.undo();
      x.redo();
    };
  } });
  assert.ok(shift.exponent < LINEAR_MAX_EXPONENT, `النقل: ${shift.note}`);
  assert.ok(shift.large < 5000, `النقل: ${shift.note}`);
  const text = growth({ small: 1000, large: 50000, prepare: (n) => {
    const x = createEditSession({ cues: makeCues(n) });
    return () => {
      for (let i = 0; i < 2000; i++) x.setText(i % 500, `نص ${i}`);
    };
  } });
  assert.ok(text.exponent < CONSTANT_MAX_EXPONENT, `النص: ${text.note}`);
  assert.ok(text.large < 1000, `النص: ${text.note}`);
});

test('التراجع عن نقل أصلح زمنًا سالبًا كتبه المستخدم يعيده كما كان، ولا يرمي ولا يُسقط خطوة (مراجعة)', () => {
  const s = createEditSession({ cues: makeCues(3) });
  s.setTime(0, 'start', -500);
  assert.equal(s.issues().errors, 1);
  assert.equal(s.shift({ kind: 'all' }, 1000).ok, true, 'النتيجة كلها غير سالبة');
  assert.equal(s.issues().errors, 0);
  assert.deepEqual(s.undo(), { ok: true, kind: 'shift' });
  assert.equal(s.cueAt(0).startMs, -500, 'عاد الزمن الذي كتبه المستخدم بالضبط');
  assert.equal(s.historySize, 1);
  assert.deepEqual(s.redo(), { ok: true, kind: 'shift' });
  assert.equal(s.cueAt(0).startMs, 500);
  const c = createEditSession({ cues: makeCues(2), offsetMs: 2000 });
  c.setTime(0, 'start', -1000);
  assert.equal(c.commitOffset().ok, true);
  c.undo();
  assert.deepEqual([c.cueAt(0).startMs, c.offsetMs], [-1000, 2000]);
});

test('كتابة بعد سحب خطوة أعادت النص إلى ما قبلها خطوةٌ جديدة لا تنضم إلى خطوة أقدم مختومة (مراجعة)', () => {
  const s = createEditSession({ cues: makeCues(1) });
  s.setText(0, 'أ');
  s.setText(0, 'أب');
  s.seal();
  s.setText(0, 'أبج');
  s.setText(0, 'أب');
  assert.equal(s.historySize, 1, 'الخطوة الفارغة سُحبت');
  s.setText(0, 'أبد');
  assert.equal(s.historySize, 2);
  s.undo();
  assert.equal(s.cueAt(0).text, 'أب');
});

test('حفظ انتهى والمستخدم عدّل أثناءه: المحفوظ أساس جديد، وما كُتب بعده يبقى غير محفوظ بتاريخه', () => {
  const s = createEditSession({ cues: makeCues(3), offsetMs: 500 });
  s.setText(0, 'محفوظ');
  const saved = s.snapshot();
  s.setText(1, 'كُتب أثناء الحفظ');
  s.markSaved({ cues: saved, offsetMs: 500 });
  assert.equal(s.isChanged(0), false);
  assert.equal(s.isChanged(1), true);
  assert.equal(s.changedCount, 1);
  assert.equal(s.cueAt(1).text, 'كُتب أثناء الحفظ');
  s.undo();
  assert.equal(s.dirty, false, 'التراجع يعود إلى المحفوظ');
  // الإصدار الثاني: «معدَّل» بالمحتوى، فالمحفوظ بعدد آخر (دمج أثناء الحفظ) أساس صالح بلا افتراض المواضع.
  s.markSaved({ cues: saved.slice(1), offsetMs: 500 });
  assert.equal(s.changedCount, 1, 'المقطع الأول ليس في المحفوظ');
  assert.equal(s.isChanged(0), true);
  assert.equal(s.isChanged(1), false);
});

// ── استعادة مسودة المحرّر (الفكرة ٩، ح-48) ─────────────────────────────────

test('الفكرة ٩: restoreDraft = المحفوظ أساسًا ثم المسودة خطوةً واحدة «rescue» بإزاحتها وتثبيتها؛ والتراجع يعيد المحفوظ وتثبيته صفرًا، والإعادة تعيدها', () => {
  const saved = makeCues(4);
  const s = createEditSession({ cues: saved, offsetMs: 0 });
  // مسودة بُنيت على المحفوظ نفسه: نص المقطع 2 معدّل، ثم «تثبيت الإزاحة» +500 في التوقيت ولم يُحفظ.
  const draftSession = createEditSession({ cues: saved, offsetMs: 500 });
  draftSession.setText(1, 'من المسودة');
  draftSession.commitOffset();
  const draft = { cues: draftSession.snapshot(), offsetMs: draftSession.offsetMs, committedMs: draftSession.committedMs };
  assert.deepEqual([draft.offsetMs, draft.committedMs], [0, 500]);
  const events = [];
  s.onChange((e) => events.push(e));
  const r = s.restoreDraft({ cues: saved, offsetMs: 500 }, draft);
  assert.deepEqual(r, { ok: true, changed: true });
  assert.deepEqual(s.snapshot(), draft.cues);
  assert.deepEqual([s.offsetMs, s.baseOffsetMs, s.committedMs], [0, 500, 500]);
  assert.equal(s.dirty, true);
  assert.equal(s.historySize, 1, 'خطوة واحدة');
  assert.equal(s.undoKind, 'rescue');
  assert.equal(events.at(-1).structural, true, 'الصفوف تُبنى من جديد');
  // ± المشغّل لا يُتبنّى فوق تثبيت لم يُحفظ (U24)، كما في الجلسة التي كُتبت فيها المسودة.
  assert.equal(s.adoptOffset(800), false);
  s.undo();
  assert.deepEqual(s.snapshot(), saved, 'التراجع يعيد المحفوظ');
  assert.deepEqual([s.offsetMs, s.committedMs, s.dirty], [500, 0, false]);
  s.redo();
  assert.deepEqual(s.snapshot(), draft.cues);
  assert.deepEqual([s.offsetMs, s.committedMs], [0, 500]);
});

test('الفكرة ٩: restoreDraft يبدأ من المحفوظ الحاضر لا من تعديلات الجلسة، ومسودة تطابقه لا تضيف خطوة', () => {
  const saved = makeCues(3);
  const s = createEditSession({ cues: saved, offsetMs: 0 });
  s.setText(0, 'تعديل في الجلسة');
  const draft = { cues: saved.map((c, i) => (i === 2 ? { ...c, text: 'من المسودة' } : c)), offsetMs: 0, committedMs: 0 };
  s.restoreDraft({ cues: saved, offsetMs: 0 }, draft);
  assert.deepEqual(s.snapshot(), draft.cues, 'تعديل الجلسة لا يبقى فوق المسودة');
  assert.equal(s.historySize, 1);
  s.undo();
  assert.deepEqual(s.snapshot(), saved, 'والتراجع إلى المحفوظ لا إلى تعديل الجلسة');
  const same = createEditSession({ cues: saved, offsetMs: 0 });
  assert.deepEqual(same.restoreDraft({ cues: saved, offsetMs: 0 }, { cues: saved, offsetMs: 0 }), { ok: true, changed: false });
  assert.equal(same.canUndo, false);
});
