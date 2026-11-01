// دمج الأجزاء الاحتياطية بحسب الأرقام (P4-AC5): فجوات وتكرار وتداخل. الدالة تصف ولا تقرّر؛ سياسة الرفض في readImport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeParts } from '../../../src/core/import/merge.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { readSrtFixture } from '../../fixtures/srt/index.js';

const clean = () => parseSrtLenient(readSrtFixture('clean.ar.srt')).cues;
const part = (name, from, to) => ({ name, cues: clean().filter((c) => c.n >= from && c.n <= to) });
const numbers = (r) => r.cues.map((c) => c.n);

test('جزآن متتابعان يندمجان بالأرقام مهما كان ترتيب اختيارهما', () => {
  const r = mergeParts([part('p2', 5, 8), part('p1', 1, 4)]);
  assert.deepEqual(numbers(r), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(r.cues, clean());
  assert.deepEqual(r.order, ['p1', 'p2']);
  assert.deepEqual([r.gaps, r.overlaps, r.duplicates], [[], [], []]);
});

test('ثلاثة أجزاء بلا فجوة ولا تكرار', () => {
  const r = mergeParts([part('c', 7, 8), part('a', 1, 3), part('b', 4, 6)]);
  assert.deepEqual(numbers(r), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(r.order, ['a', 'b', 'c']);
});

test('الفجوة: جزء ناقص بين جزأين يُبلَّغ بنطاق الأرقام الناقصة', () => {
  const r = mergeParts([part('p1', 1, 3), part('p3', 7, 8)]);
  assert.deepEqual(numbers(r), [1, 2, 3, 7, 8]);
  assert.deepEqual(r.gaps, [{ a: 'p1', b: 'p3', from: 4, to: 6 }]);
  assert.deepEqual([r.overlaps, r.duplicates], [[], []]);
  const two = mergeParts([part('a', 1, 2), part('b', 4, 5), part('c', 8, 8)]);
  assert.deepEqual(two.gaps, [{ a: 'a', b: 'b', from: 3, to: 3 }, { a: 'b', b: 'c', from: 6, to: 7 }]);
});

test('التداخل والتكرار: جزآن يتشاركان أرقامًا يُبلَّغ بنطاقها وأرقامها', () => {
  const r = mergeParts([part('p1', 1, 5), part('p2', 4, 8)]);
  assert.deepEqual(r.overlaps, [{ a: 'p1', b: 'p2', from: 4, to: 5 }]);
  assert.deepEqual(r.duplicates, [4, 5]);
  assert.deepEqual(r.gaps, []);
});

test('الملف نفسه مرتين تكرار كامل، والأجزاء المعاد ترقيمها من 1 تتداخل كلها', () => {
  const twice = mergeParts([part('a', 1, 8), part('a-again', 1, 8)]);
  assert.deepEqual(twice.overlaps, [{ a: 'a', b: 'a-again', from: 1, to: 8 }]);
  assert.deepEqual(twice.duplicates, [1, 2, 3, 4, 5, 6, 7, 8]);
  const renumbered = mergeParts([part('p1', 1, 4), { name: 'p2', cues: clean().slice(4).map((c, i) => ({ ...c, n: i + 1 })) }]);
  assert.deepEqual(renumbered.overlaps, [{ a: 'p1', b: 'p2', from: 1, to: 4 }]);
  assert.deepEqual(renumbered.duplicates, [1, 2, 3, 4]);
});

test('جزء داخل نطاق آخر أو متقاطع معه تداخل ولو بلا رقم مكرر', () => {
  const inner = { name: 'inner', cues: clean().filter((c) => c.n >= 4 && c.n <= 6) };
  const outer = { name: 'outer', cues: clean().filter((c) => c.n <= 3 || c.n >= 7) };
  const r = mergeParts([outer, inner]);
  assert.deepEqual(r.overlaps, [{ a: 'outer', b: 'inner', from: 4, to: 6 }]);
  assert.deepEqual(r.duplicates, []);
});

test('جزء واحد يمرّ كما هو، ولا أجزاء تعطي نتيجة فارغة', () => {
  const one = mergeParts([part('only', 1, 8)]);
  assert.deepEqual(one.cues, clean());
  assert.deepEqual([one.gaps, one.overlaps, one.duplicates, one.order], [[], [], [], ['only']]);
  assert.deepEqual(mergeParts([]), { cues: [], order: [], gaps: [], overlaps: [], duplicates: [] });
});

test('ترتيب المقاطع داخل الجزء يبقى كما ورد، ولا تعديل للأرقام ولا للمدخلات', () => {
  const shuffled = { name: 'a', cues: [clean()[1], clean()[0], clean()[2]] };
  const before = JSON.stringify(shuffled);
  const r = mergeParts([shuffled, part('b', 4, 8)]);
  assert.deepEqual(numbers(r), [2, 1, 3, 4, 5, 6, 7, 8]);
  assert.equal(JSON.stringify(shuffled), before);
  r.cues[0].text = 'تعديل';
  assert.equal(shuffled.cues[0].text, clean()[1].text, 'المقاطع المدموجة لا تشارك مراجعها');
});
