// مسودة المحرّر (الفكرة ٩، ح-48؛ model/draft.js): الشكل والتحقق الصارم، والقراءة المتسامحة (الخانة التالفة تسقط وحدها، والقيمة التي
// لا تُقرأ كأنها بلا مسودات)، وبناء المسودة من الجلسة بالمحتوى وحده، وتصنيفها مقابل الخانة الحاضرة: الهوية بمحتوى الخانة (اسم الملف
// وتاريخ استيراده، ثم تاريخ تعديله أو بصمة مقاطعها cuesHash، تحقق 2.3.0 ص-٦؛ والمسودة بلا بصمة بتاريخ التعديل وحده)، والإزاحة وحدها
// تُتبنّى الحاضرة، والاختلاف «تنزيل أو تجاهل» بلا دمج.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_LIMITS, classifyDraft, draftCuesHash, draftOf, emptyDraftValue, isEmptyDraftValue, lastSavedAt, normalizeDraftValue, validateDraft, validateDraftValue,
} from '../../../src/core/model/draft.js';
import { NOW, VIDEO_ID } from '../../helpers/fixtures.js';
import { arabicTrack } from '../../helpers/fixtures-v2.js';

const LATER = '2026-11-02T08:00:00.000Z';
const track = (o = {}) => arabicTrack({ label: 'أولى', edited: true, ...o });
const slotOf = (t = track(), offsetMs = 500) => ({ track: t, offsetMs });
/** مسودة على الخانة كما هي، بتعديل نص المقطع الأول. */
const draftOn = (slot, { text = 'نص لم يُحفظ', offsetMs = slot.offsetMs, committedMs = 0, savedAt = LATER } = {}) => {
  const cues = (slot.track.current ?? slot.track.original).map((c, i) => (i === 0 ? { ...c, text } : { ...c }));
  return draftOf({ cues, offsetMs, committedMs }, slot, savedAt);
};

test('الشكل: draftOf يبني المسودة بالمحتوى وحده وهوية الخانة، ويجتاز المدقق؛ والحد خمس مسودات', () => {
  const slot = slotOf();
  const d = draftOn(slot);
  assert.deepEqual(Object.keys(d).sort(), ['base', 'committedMs', 'cues', 'offsetMs', 'savedAt']);
  assert.deepEqual(d.base, {
    fileName: slot.track.fileName, importedAt: slot.track.importedAt, editedAt: slot.track.editedAt, offsetMs: 500, cuesHash: draftCuesHash(slot.track.current),
  });
  assert.match(d.base.cuesHash, /^fnv1a64:[0-9a-f]{16}$/);
  assert.equal(d.cues[0].text, 'نص لم يُحفظ');
  assert.ok(d.cues[1] !== slot.track.current[1], 'نسخة لا مرجع');
  assert.equal(validateDraft(d).ok, true);
  const v = { ...emptyDraftValue(VIDEO_ID), slots: [d, null, null] };
  assert.equal(validateDraftValue(v).ok, true);
  assert.equal(isEmptyDraftValue(v), false);
  assert.equal(isEmptyDraftValue(emptyDraftValue(VIDEO_ID)), true);
  assert.deepEqual(DRAFT_LIMITS, { drafts: 5 });
});

test('الكتابة صارمة: المفتاح المجهول والناقص والمقاطع الفارغة والإزاحة خارج الشبكة والتاريخ غير الصالح فشل، والزمن السالب المكتوب خطأً يُقبل', () => {
  const d = draftOn(slotOf());
  for (const bad of [
    { ...d, extra: 1 },
    { ...d, history: [] },
    (({ committedMs, ...rest }) => rest)(d),
    { ...d, cues: [] },
    { ...d, offsetMs: 150 },
    { ...d, savedAt: 'أمس' },
    { ...d, base: { ...d.base, fileName: '' } },
    { ...d, base: { ...d.base, lang: 'ar' } },
    { ...d, cues: [{ ...d.cues[0], extra: true }] },
    { ...d, cues: [{ ...d.cues[0], text: 'x'.repeat(5001) }] },
  ]) assert.equal(validateDraft(bad).ok, false, JSON.stringify(Object.keys(bad)));
  assert.equal(validateDraft({ ...d, cues: [{ ...d.cues[0], startMs: -1000 }] }).ok, true, 'زمن سالب كتبه المستخدم يبقى في المسودة كما في الجلسة');
  assert.equal(validateDraftValue({ ...emptyDraftValue(VIDEO_ID), slots: [null, null] }).ok, false);
  assert.equal(validateDraftValue({ ...emptyDraftValue(VIDEO_ID), schema: 2 }).ok, false);
  assert.equal(validateDraftValue({ ...emptyDraftValue('bad') }).ok, false);
});

test('القراءة المتسامحة: الخانة التالفة تسقط وحدها، والقيمة التي لا تُقرأ أو لفيديو آخر كأنها بلا مسودات', () => {
  const d = draftOn(slotOf());
  const raw = { schema: 1, videoId: VIDEO_ID, slots: [d, { ...d, cues: 'تالف' }, null] };
  assert.deepEqual(normalizeDraftValue(raw, VIDEO_ID).slots, [d, null, null]);
  for (const bad of [undefined, null, 'نص', [], { schema: 2, videoId: VIDEO_ID, slots: [d, null, null] }, { ...raw, videoId: 'BBBBBBBBBBB' }, { schema: 1, videoId: VIDEO_ID }]) {
    assert.deepEqual(normalizeDraftValue(bad, VIDEO_ID), emptyDraftValue(VIDEO_ID));
  }
  assert.equal(lastSavedAt({ ...emptyDraftValue(VIDEO_ID), slots: [draftOn(slotOf(), { savedAt: NOW }), null, draftOn(slotOf(), { savedAt: LATER })] }), LATER);
  assert.equal(lastSavedAt(emptyDraftValue(VIDEO_ID)), '');
});

test('التصنيف: الهوية والإزاحة كما هما ← «same» بالمسودة كما هي، والإزاحة وحدها تغيّرت ← «offset» بالإزاحة الحاضرة', () => {
  const slot = slotOf();
  const d = draftOn(slot);
  const same = classifyDraft(d, slot);
  assert.equal(same.kind, 'same');
  assert.deepEqual(same.restore, { cues: d.cues, offsetMs: 500, committedMs: 0 });
  // ± من المشغّل بعد المسودة، والمسودة لم تمس الإزاحة: تُتبنّى الحاضرة.
  const moved = classifyDraft(d, slotOf(slot.track, 800));
  assert.equal(moved.kind, 'offset');
  assert.equal(moved.restore.offsetMs, 800);
  // ومسودة غيّرت الإزاحة نفسها والخانة كما هي: تُستعاد بإزاحتها وتثبيتها.
  const own = classifyDraft(draftOn(slot, { offsetMs: 0, committedMs: 500 }), slot);
  assert.equal(own.kind, 'same');
  assert.deepEqual([own.restore.offsetMs, own.restore.committedMs], [0, 500]);
});

test('التصنيف: تغيّر المحتوى (الاسم أو تاريخ الاستيراد، أو المقاطع بتاريخ تعديل جديد)، أو تغيّر الإزاحتين معًا ← «changed» بلا استعادة؛ ولا شيء جديد ← «equal»', () => {
  const slot = slotOf();
  const d = draftOn(slot);
  const edited = { ...track(), editedAt: LATER, current: track().current.map((c, i) => (i === 2 ? { ...c, text: 'حُفظ بعد المسودة' } : c)) };
  for (const t of [track({ importedAt: LATER }), { ...track(), fileName: 'آخر.srt' }, edited, track({ edited: false })]) {
    const c = classifyDraft(d, slotOf(t));
    assert.equal(c.kind, 'changed');
    assert.equal(c.restore, undefined, 'بلا دمج آلي');
  }
  assert.equal(classifyDraft(draftOn(slot, { offsetMs: 0 }), slotOf(slot.track, 800)).kind, 'changed', 'الإزاحتان تغيّرتا');
  assert.equal(classifyDraft(draftOn(slot, { text: slot.track.current[0].text }), slot).kind, 'equal');
  assert.equal(classifyDraft(null, slot).kind, 'none');
  assert.equal(classifyDraft(d, { track: null, offsetMs: 0 }).kind, 'none');
});

test('ص-٦: الهوية بالمحتوى: تاريخ تعديل جديد والمقاطع كما بُنيت عليها المسودة (تحرير ثم «تراجع») ← «same»، وتحرير حقيقي ولو في مقطع آخر ← «changed»', () => {
  const slot = slotOf();
  const d = draftOn(slot);
  // «تراجع» لوحة النص: المقاطع كما كانت بنسخ جديدة، وتاريخ تعديل جديد.
  const undone = slotOf({ ...track(), editedAt: LATER, current: structuredClone(slot.track.current) });
  const same = classifyDraft(d, undone);
  assert.equal(same.kind, 'same');
  assert.deepEqual(same.restore, { cues: d.cues, offsetMs: 500, committedMs: 0 });
  assert.equal(classifyDraft(d, slotOf(undone.track, 800)).kind, 'offset', 'والإزاحة وحدها تغيّرت بعدها ← الحاضرة');
  // تحرير حقيقي في مقطع لم تمسه المسودة: لا استعادة فوقه (قيد موثّق).
  const other = slotOf({ ...undone.track, current: undone.track.current.map((c, i) => (i === 3 ? { ...c, text: 'من لوحة النص' } : c)) });
  assert.equal(classifyDraft(d, other).kind, 'changed');
  // الرجوع إلى النسخة المرفوعة بعد مسودة على خانة معدّلة: محتوى آخر.
  assert.equal(classifyDraft(d, slotOf({ ...track(), current: null, editedAt: null })).kind, 'changed');
  // مسودة على النسخة المرفوعة (بلا تعديل) وخانة عادت إليها: الهوية بتاريخ التعديل null كما كانت، وبالبصمة.
  const plain = slotOf(track({ edited: false }));
  assert.equal(classifyDraft(draftOn(plain), plain).kind, 'same');
});

test('ص-٦: المسودة بلا cuesHash (كُتبت قبله) صالحة وتُقرأ، وهويتها بتاريخ التعديل وحده كما كانت؛ والبصمة التالفة تُسقط الخانة', () => {
  const slot = slotOf();
  const { cuesHash, ...base } = draftOn(slot).base;
  assert.ok(cuesHash);
  const old = { ...draftOn(slot), base };
  assert.equal(validateDraft(old).ok, true, 'الشكل السابق صالح');
  assert.deepEqual(normalizeDraftValue({ schema: 1, videoId: VIDEO_ID, slots: [old, null, null] }, VIDEO_ID).slots, [old, null, null]);
  assert.equal(classifyDraft(old, slot).kind, 'same', 'التاريخ نفسه');
  assert.equal(classifyDraft(old, slotOf({ ...track(), editedAt: LATER, current: structuredClone(slot.track.current) })).kind, 'changed', 'بلا بصمة لا تُعرف عودة المحتوى');
  for (const bad of ['', 'fnv1a64:XYZ', `fnv1a64:${'0'.repeat(15)}`, 'sha256:0123456789abcdef', 7, null]) {
    const d = { ...old, base: { ...base, cuesHash: bad } };
    assert.equal(validateDraft(d).ok, false, JSON.stringify(bad));
    assert.deepEqual(normalizeDraftValue({ schema: 1, videoId: VIDEO_ID, slots: [d, old, null] }, VIDEO_ID).slots, [null, old, null]);
  }
});

test('ص-٦: draftCuesHash دقيقة: الرقم والبداية والنهاية والنص كما هو (المسافات والأسطر والترتيب)، ولا تتأثر بالحقول الأخرى', () => {
  const cues = track().current;
  const h = draftCuesHash(cues);
  assert.equal(draftCuesHash(structuredClone(cues)), h, 'المحتوى نفسه بنسخة أخرى');
  assert.equal(draftCuesHash(cues.map((c) => ({ ...c, extra: true }))), h, 'المفاتيح الأربعة وحدها');
  const variants = [
    cues.map((c, i) => (i === 1 ? { ...c, text: `${c.text} ` } : c)),
    cues.map((c, i) => (i === 1 ? { ...c, text: c.text.replace(' ', '  ') } : c)),
    cues.map((c, i) => (i === 1 ? { ...c, text: c.text.replace(' ', '\n') } : c)),
    cues.map((c, i) => (i === 1 ? { ...c, startMs: c.startMs + 1 } : c)),
    cues.map((c, i) => (i === 1 ? { ...c, endMs: c.endMs - 1 } : c)),
    cues.map((c, i) => (i === 1 ? { ...c, n: 99 } : c)),
    [cues[1], cues[0], ...cues.slice(2)],
    cues.slice(1),
  ];
  for (const v of variants) assert.notEqual(draftCuesHash(v), h);
});
