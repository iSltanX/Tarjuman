// انتقالات الحزمة (P10-AC4 وAC6، عقد data-model §١٠–§١٥): التبديل يحفظ لكل ترجمة نصها وتعديلاتها وإزاحتها ومرجعها،
// والاستبدال من أي مسار يحفظ السابقة، والاستعادة تبديل قابل للعكس، والحذف يفعّل غيرها، والعلامات وتراجعها، والتعبئة
// والفك والمصالحة، والنسخة الاحتياطية ذهابًا وإيابًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRecordChange, bundleFromBackup, bundleFromRecord, bundleToBackup, isTrivialBundle, packBundle, referencedFingerprints,
  slotModels, summarizeBundle, unpackBundle, withActiveSlot, withMark, withMarksReplaced, withPosition, withPreviousRestored,
  withSlotEdit, withSlotName, withSlotOffset, withSlotOriginalRestored, withSlotReference, withSlotUpload, withoutPrevious, withoutSlot,
} from '../../../src/core/model/bundle.js';
import { resolveMark } from '../../../src/core/model/marks.js';
import { validateBundle } from '../../../src/core/model/slots.js';
import { withArabicEdit, withArabicImport, withView, withoutArabic } from '../../../src/core/model/transitions.js';
import { makeCues, NOW, videoRecord } from '../../helpers/fixtures.js';
import { arabicTrack, sampleBundle } from '../../helpers/fixtures-v2.js';

const LATER = '2026-11-02T09:00:00.000Z';
const ok = (b) => {
  const r = validateBundle(b);
  assert.equal(r.ok, true, JSON.stringify(r));
  return b;
};
const code = (c) => (e) => e.code === c;
const text0 = (t) => (t.current ?? t.original)[0].text;
const upload = (label, extra = {}) => ({ videoId: 'AAAAAAAAAAA', fileName: `${label}.srt`, cues: makeCues(4, { text: (i) => `${label} ${i}` }), comparison: null, fingerprintId: null, notes: [], ...extra });

test('العيّنة صالحة: النشطة في السجل نفسه وخانتها نسخة منه، والفارغة بلا تبعات', () => {
  const b = ok(sampleBundle());
  assert.equal(b.record.arabic.fileName, b.slots[0].track.fileName);
  assert.equal(validateBundle({ ...b, active: 2 }).ok, false, 'النشطة لا تطابق السجل');
  assert.equal(validateBundle({ ...b, active: null }).ok, false);
  const bad = structuredClone(b);
  bad.slots[2].name = 'اسم لفارغة';
  assert.equal(validateBundle(bad).ok, false);
  assert.deepEqual(slotModels(b).map((s) => [s.n, s.filled, s.active, s.name, s.edited]), [[1, true, true, null, true], [2, true, false, 'مراجعة', false], [3, false, false, null, false]]);
});

test('التبديل: كتابة واحدة تحفظ لكل ترجمة نصها وتعديلاتها وإزاحتها ومرجعها، والعودة تعيد ما كان', () => {
  const b = sampleBundle();
  const two = ok(withActiveSlot(b, 2, LATER));
  assert.equal(two.active, 2);
  assert.equal(text0(two.record.arabic), 'ثانية 1');
  assert.equal(two.record.view.displayOffsetMs, -1200, 'إزاحة الثانية معها');
  assert.equal(two.record.arabic.fingerprintId, 'fp_test000002', 'ومرجعها');
  assert.equal(two.slots[0].offsetMs, 500, 'الأولى تحتفظ بإزاحتها في خانتها');
  assert.equal(two.slots[0].track.current[0].text, 'أولى 1 (معدّل)', 'وبتعديلاتها');
  assert.equal(two.slots[0].marks.length, 2, 'وبعلاماتها');
  const back = ok(withActiveSlot(two, 1, LATER));
  assert.deepEqual(back.record.arabic, b.record.arabic);
  assert.equal(back.record.view.displayOffsetMs, 500);
  assert.throws(() => withActiveSlot(b, 3, LATER), code('ST_SLOT_EMPTY'));
  assert.throws(() => withActiveSlot(b, 4, LATER), code('MD_INVALID'));
  assert.deepEqual(withActiveSlot(b, 1, LATER).record, b.record, 'النشطة نفسها لا تغيير');
});

test('الرفع إلى خانة فارغة يجعلها النشطة (Q16) والسابقة في خانتها بإزاحتها؛ والإزاحة الجديدة صفر', () => {
  const b = sampleBundle();
  const r = withSlotUpload(b, 3, upload('ثالثة'), LATER);
  ok(r.bundle);
  assert.equal(r.replaced, false);
  assert.equal(r.bundle.active, 3);
  assert.equal(r.bundle.record.view.displayOffsetMs, 0);
  assert.equal(r.bundle.slots[0].offsetMs, 500, 'السابقة النشطة تبقى في خانتها بإزاحتها');
  assert.deepEqual(r.bundle.previous, b.previous, 'لا سابقة جديدة لخانة فارغة');
  const quiet = withSlotUpload(b, 3, upload('ثالثة'), LATER, { activate: false });
  assert.equal(quiet.bundle.active, 1, 'دون تفعيل');
  assert.equal(ok(quiet.bundle).slots[2].track.fileName, 'ثالثة.srt');
});

test('الاستبدال: الممتلئة تحتاج replace، وتُحفظ السابقة في الكتابة نفسها، وغير النشطة لا تُفعَّل افتراضيًا', () => {
  const b = sampleBundle({ previous: false });
  assert.throws(() => withSlotUpload(b, 2, upload('جديدة'), LATER), code('ST_ARABIC_EXISTS'));
  const r = withSlotUpload(b, 2, upload('جديدة'), LATER, { replace: true });
  ok(r.bundle);
  assert.equal(r.replaced, true);
  assert.equal(r.bundle.active, 1, 'المعروض لا يتغير');
  assert.deepEqual(r.bundle.previous, { from: 2, savedAt: LATER, track: b.slots[1].track, offsetMs: -1200 });
  assert.equal(r.bundle.slots[1].offsetMs, 0);
  assert.equal(r.bundle.slots[1].name, 'مراجعة', 'الاسم للخانة');
  const active = withSlotUpload(b, 1, upload('بديلة'), LATER, { replace: true });
  ok(active.bundle);
  assert.equal(active.offsetWas, 500);
  assert.equal(active.bundle.record.view.displayOffsetMs, 0);
  assert.equal(active.bundle.previous.from, 1);
  assert.deepEqual(active.bundle.previous.track, b.record.arabic);
  const keep = withSlotUpload(b, 2, upload('مدمجة', { current: makeCues(4, { text: (i) => `دمج ${i}` }) }), LATER, { replace: true });
  assert.equal(ok(keep.bundle).slots[1].track.current[0].text, 'دمج 1', '«إبقاء تعديلاتي» نسخة حالية فوق الأصل الجديد');
  assert.equal(keep.bundle.slots[1].track.editedAt, LATER);
});

test('الرفع بلا سجل يُنشئه بقواعد الإصدار الأول، وإلى الخانة المطلوبة', () => {
  const r = withSlotUpload(null, 2, { ...upload('أول'), title: 'عنوان', durationMs: 90000 }, NOW);
  const b = ok({ ...r.bundle, record: { ...r.bundle.record, rev: 1 } });
  assert.equal(b.active, 2);
  assert.equal(b.slots[0].track, null);
  assert.equal(b.record.title, 'عنوان');
});

test('جسر الإصدار الأول: استبدال النشطة من المتحكم أو الصفحات القائمة يحفظ السابقة؛ والتعديل والإزاحة لا', () => {
  const b = sampleBundle({ previous: false });
  const replaced = applyRecordChange(b, withArabicImport(b.record, upload('مستبدلة'), LATER, { replace: true }).record, LATER);
  ok(replaced);
  assert.equal(replaced.previous.from, 1);
  assert.deepEqual(replaced.previous.track, b.record.arabic);
  assert.equal(replaced.previous.offsetMs, 500);
  assert.equal(replaced.slots[1].track.fileName, b.slots[1].track.fileName, 'الأخرى لم تُمس');
  const edited = applyRecordChange(b, withArabicEdit(b.record, { cues: makeCues(5) }, LATER), LATER);
  assert.equal(ok(edited).previous, null);
  const moved = applyRecordChange(b, withView(b.record, { displayOffsetMs: 900 }, LATER), LATER);
  assert.equal(ok(moved).slots[0].offsetMs, 900);
  assert.equal(moved.slots[1].offsetMs, -1200);
});

test('حذف النشطة (من أي مسار) يفعّل أصغر خانة ممتلئة غيرها بإزاحتها، والأخيرة تترك الفيديو بلا ترجمة', () => {
  const b = sampleBundle({ third: true });
  const viaV1 = ok(applyRecordChange(b, withoutArabic(b.record, LATER), LATER));
  assert.equal(viaV1.active, 2);
  assert.equal(viaV1.record.view.displayOffsetMs, -1200);
  assert.deepEqual(viaV1.slots[0], { n: 1, name: null, track: null, offsetMs: 0, marks: [], position: null }, 'اسمها وعلاماتها معها');
  const direct = ok(withoutSlot(b, 1, LATER));
  assert.deepEqual(direct.record.arabic, viaV1.record.arabic);
  const one = ok(withoutSlot(withoutSlot(direct, 3, LATER), 2, LATER));
  assert.equal(one.active, null);
  assert.equal(one.record.arabic, null);
  assert.equal(one.record.view.displayOffsetMs, 0);
  assert.ok(one.previous, 'السابقة تبقى');
  assert.throws(() => withoutSlot(one, 1, LATER), code('ST_SLOT_EMPTY'));
});

test('السابقة: الاستعادة تبديل قابل للعكس، وإلى خانة فارغة تُفرغ السابقة، وتُحذف وحدها', () => {
  const b = sampleBundle();
  const once = ok(withPreviousRestored(b, LATER));
  assert.equal(once.slots[1].track.fileName, b.previous.track.fileName);
  assert.equal(once.previous.track.fileName, b.slots[1].track.fileName);
  assert.equal(once.previous.offsetMs, -1200);
  const twice = ok(withPreviousRestored(once, LATER));
  assert.deepEqual(twice.slots[1].track, b.slots[1].track);
  assert.equal(twice.slots[1].offsetMs, -1200);
  const empty = withoutSlot(b, 2, LATER);
  const into = ok(withPreviousRestored(empty, LATER));
  assert.equal(into.slots[1].track.fileName, b.previous.track.fileName);
  assert.equal(into.previous, null);
  assert.equal(ok(withoutPrevious(b)).previous, null);
  assert.throws(() => withPreviousRestored(withoutPrevious(b), LATER), code('ST_NO_PREVIOUS'));
  const activeFrom = sampleBundle({ active: 2 });
  const swapActive = ok(withPreviousRestored(activeFrom, LATER));
  assert.equal(swapActive.record.arabic.fileName, b.previous.track.fileName, 'سابقة النشطة تعود إلى السجل');
});

test('تعديل خانة غير نشطة وأصلها وإزاحتها ومرجعها واسمها لا يمس المعروض', () => {
  const b = sampleBundle();
  const e = ok(withSlotEdit(b, 2, { cues: makeCues(5, { text: () => 'محرّر' }), displayOffsetMs: 300 }, LATER));
  assert.deepEqual(e.record.arabic, b.record.arabic);
  assert.equal(e.slots[1].track.current[0].text, 'محرّر');
  assert.equal(e.slots[1].offsetMs, 300);
  assert.equal(ok(withSlotOriginalRestored(e, 2, LATER)).slots[1].track.current, null);
  assert.equal(ok(withSlotOffset(b, 2, 700, LATER)).slots[1].offsetMs, 700);
  assert.throws(() => withSlotOffset(b, 2, 750, LATER), code('MD_INVALID'));
  assert.equal(ok(withSlotOffset(b, 1, 700, LATER)).record.view.displayOffsetMs, 700);
  const ref = ok(withSlotReference(b, 2, { fingerprintId: 'fp_test000001', comparison: null }, LATER));
  assert.equal(ref.slots[1].track.fingerprintId, 'fp_test000001');
  assert.throws(() => withSlotReference(b, 2, { fingerprintId: 'fp_missing0001', comparison: null }), code('MD_INVALID'));
  assert.equal(ok(withSlotName(b, 1, '  ترجمتي   الأولى ')).slots[0].name, 'ترجمتي الأولى');
  assert.equal(withSlotName(b, 2, '').slots[1].name, null);
  assert.throws(() => withSlotName(b, 1, 'ا'.repeat(25)), code('MD_INVALID'));
  assert.throws(() => withSlotName(b, 3, 'فارغة'), code('ST_SLOT_EMPTY'));
});

test('العلامة: تعليم مقطع ثم التراجع بدقة، وإعادة التعليم تستبدل ما يُحل إليه، والموضع', () => {
  const b = sampleBundle();
  const { bundle: marked, before, mark } = withMark(b, 1, { index: 1, kind: 'todo' }, LATER);
  ok(marked);
  assert.equal(before.length, 0);
  assert.equal(marked.slots[0].marks.length, 3);
  assert.equal(resolveMark(mark, marked.slots[0].track.current).state, 'linked');
  const undone = ok(withMarksReplaced(marked, 1, { remove: [mark], add: before }, LATER));
  assert.deepEqual(undone.slots[0].marks, b.slots[0].marks);
  const { bundle: done, before: was } = withMark(b, 1, { index: 0, kind: 'done' }, LATER);
  assert.equal(was.length, 1);
  assert.equal(done.slots[0].marks.find((m) => m.startMs === b.slots[0].track.current[0].startMs).kind, 'done');
  assert.equal(withMark(b, 1, { index: 0, kind: null }, LATER).bundle.slots[0].marks.length, 1, 'null يزيل');
  assert.throws(() => withMark(b, 1, { index: 99, kind: 'todo' }, LATER), RangeError);
  assert.throws(() => withMark(b, 3, { index: 0, kind: 'todo' }, LATER), code('ST_SLOT_EMPTY'));
  const p = ok(withPosition(b, 2, 3, LATER));
  assert.deepEqual(p.slots[1].position, { n: 4, startMs: b.slots[1].track.original[3].startMs, at: LATER });
});

test('ملخص الفرز من البيانات نفسها، والحزمة البسيطة لا تحتاج مفاتيح جديدة', () => {
  assert.deepEqual(summarizeBundle(sampleBundle({ third: true })), { filled: 3, edited: 1, warned: 0, marks: { todo: 2, done: 1 } });
  const rec = videoRecord();
  // نقص فعلي في المقاطع يطابقه التقرير المحفوظ.
  rec.arabic.original = rec.arabic.original.filter((c) => c.n !== 3);
  rec.arabic.comparison = { ...rec.arabic.comparison, matched: false, missing: [3], countTarget: 4, restoreTimingAvailable: false };
  const plain = ok(bundleFromRecord(rec));
  assert.deepEqual(summarizeBundle(plain), { filled: 1, edited: 0, warned: 1, marks: { todo: 0, done: 0 } });
  // تدقيق 5fedcb9 (GM-013): بعد استكمال الناقص وحفظه لا يبقى تحذير التقرير المحفوظ (وصف الملف كما رُفع).
  const completed = structuredClone(plain);
  completed.slots[0].track.current = videoRecord().arabic.original;
  assert.equal(summarizeBundle(completed).warned, 0);
  assert.equal(isTrivialBundle(plain), true);
  assert.equal(isTrivialBundle(sampleBundle()), false);
  assert.equal(isTrivialBundle(withSlotName(plain, 1, 'اسم')), false);
  assert.equal(isTrivialBundle(ok(bundleFromRecord(videoRecord({ arabic: false })))), true);
  assert.deepEqual(referencedFingerprints(sampleBundle()), ['fp_test000002']);
});

const packed = (b) => {
  const p = packBundle(b);
  return { record: p.record, head: { ...p.head, base: { rev: p.record.rev, createdAt: p.record.createdAt, updatedAt: p.record.updatedAt } }, alts: p.alts, prev: p.prev, marks: p.marks };
};

test('التعبئة والفك ذهابًا وإيابًا بلا فقد؛ وخانة النشطة في السجل وحده', () => {
  const b = sampleBundle({ third: true });
  const raw = packed(b);
  assert.deepEqual(raw.alts.slots.map((x) => x && x.track.fileName), [null, b.slots[1].track.fileName, b.slots[2].track.fileName]);
  const r = unpackBundle(raw);
  assert.equal(r.changed, false);
  assert.deepEqual(r.bundle, b);
  assert.deepEqual(unpackBundle({ ...raw, head: null }).bundle, bundleFromRecord(b.record), 'بلا رأس: سجل الإصدار الأول');
  assert.equal(unpackBundle({ ...raw, record: null }).orphan, true);
});

test('المصالحة: ما يكتبه الإصدار الأول في السجل وحده يُفسَّر بقواعد مكتوبة', () => {
  const b = sampleBundle({ third: true });
  const raw = packed(b);
  const v1 = (record) => ({ ...raw, record: { ...record, rev: raw.record.rev + 1, updatedAt: LATER } });
  // إزاحة أو تحرير: تعديل للنشطة في خانتها.
  const offset = unpackBundle(v1(withView(b.record, { displayOffsetMs: 1500 }, LATER)));
  assert.equal(offset.changed, true);
  assert.equal(ok(offset.bundle).active, 1);
  assert.equal(offset.bundle.slots[0].offsetMs, 1500);
  assert.equal(offset.bundle.slots[1].offsetMs, -1200);
  // استبدال: يبقى في خانته باسمه وعلاماته، ولا سابقة.
  const rep = unpackBundle(v1(withArabicImport(b.record, upload('من الأول'), LATER, { replace: true }).record));
  assert.equal(ok(rep.bundle).slots[0].track.fileName, 'من الأول.srt');
  assert.equal(rep.bundle.slots[0].marks.length, 2);
  assert.deepEqual(rep.bundle.previous, b.previous, 'لا سابقة لاستبدال الأول');
  // حذف العربية: تُفعَّل الثانية بإزاحتها.
  const del = unpackBundle(v1(withoutArabic(b.record, LATER)));
  assert.equal(ok(del.bundle).active, 2);
  assert.equal(del.bundle.record.view.displayOffsetMs, -1200);
  // حذف ثم إنشاء: التوابع القديمة تُهمل.
  const recreated = unpackBundle({ ...raw, record: { ...videoRecord({ arabic: false }), createdAt: LATER, updatedAt: LATER, rev: 1 } });
  assert.equal(recreated.reason, 'recreated');
  assert.equal(ok(recreated.bundle).slots[1].track, null);
  // بصمة أسقطها الأول: مرجع الخانة غير النشطة يُقرأ null.
  const pruned = unpackBundle(v1({ ...b.record, fingerprints: b.record.fingerprints.filter((f) => f.id !== 'fp_test000002') }));
  assert.equal(ok(pruned.bundle).slots[1].track.fingerprintId, null);
  // استيراد الأول لفيديو بلا ترجمة في الثاني: الخانة 1 نشطة.
  const none = withoutSlot(withoutSlot(withoutSlot(b, 1, LATER), 2, LATER), 3, LATER);
  const rawNone = packed({ ...none, record: { ...none.record, rev: 5 } });
  const imp = unpackBundle({ ...rawNone, record: { ...withArabicImport(rawNone.record, upload('جديد'), LATER).record, rev: 6, updatedAt: LATER } });
  assert.equal(ok(imp.bundle).active, 1);
});

test('النسخة الاحتياطية: الحزمة إلى مدخل ومنه بلا فقد، واستبعاد السابقة، ورفض التالف بموضعه', () => {
  const b = sampleBundle({ third: true });
  const entry = bundleToBackup(b);
  assert.deepEqual(Object.keys(entry), ['record', 'active', 'names', 'alts', 'previous', 'marks']);
  const back = bundleFromBackup(structuredClone(entry));
  assert.equal(back.ok, true, JSON.stringify(back));
  assert.deepEqual(back.bundle, b);
  assert.equal(bundleToBackup(b, { includePrevious: false }).previous, null);
  assert.equal(bundleFromBackup({ ...entry, extra: 1 }).ok, false);
  const wrong = bundleFromBackup({ ...entry, alts: [entry.alts[1], null, null] });
  assert.equal(wrong.ok, false);
  const badMark = structuredClone(entry);
  badMark.marks[0].marks[0].kind = 'maybe';
  assert.match(bundleFromBackup(badMark).path, /marks/);
  assert.equal(bundleFromBackup({ ...entry, record: { ...entry.record, injected: 1 } }).ok, false);
  const t = arabicTrack({ label: 'x' });
  assert.equal(bundleFromBackup({ ...entry, previous: { from: 4, savedAt: NOW, track: t, offsetMs: 0 } }).ok, false);
});
