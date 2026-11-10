// ف6 (2026-11-10): سطر «المواضع الغامضة» بعد الملف (آخر بند في التعليمات) يُعاد بأرقامه ولا يُعدّ شرحًا أُزيل، والتعليم بضغطة
// بالعلامات الموجودة («أعود إليه»). سطر فيه أرقام وليس قائمة مواضع لا يُفهم قائمةً.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ambiguousMarks, ambiguousNumbers } from '../../../src/core/import/ambiguous.js';
import { readImport } from '../../../src/core/import/index.js';
import { markAnchor } from '../../../src/core/model/marks.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { readSrtFixture } from '../../fixtures/srt/index.js';

const clean = readSrtFixture('clean.ar.srt');
const has = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

test('ambiguousNumbers: قائمة أرقام لمقاطع موجودة بوسم أو بلا وسم، بفواصل عربية ولاتينية و«و»', () => {
  assert.deepEqual(ambiguousNumbers('مواضع غامضة: 3، 6', has), [3, 6]);
  assert.deepEqual(ambiguousNumbers('Ambiguous segments: 6, 3.', has), [3, 6]);
  assert.deepEqual(ambiguousNumbers('مواضع غامضة: 3 و6', has), [3, 6]);
  assert.deepEqual(ambiguousNumbers('3، 3، 6', has), [3, 6], 'بلا تكرار');
  assert.equal(ambiguousNumbers('ترجمتُ 427 مقطعًا', has), null, 'جملة فيها رقم ليست قائمة');
  assert.equal(ambiguousNumbers('مواضع غامضة: 3، 60', has), null, 'رقم لا مقطع له');
  assert.equal(ambiguousNumbers('مواضع غامضة: لا يوجد', has), null);
  assert.equal(ambiguousNumbers('مواضع غامضة:', has), null);
  assert.equal(ambiguousNumbers('', has), null);
  // من مراجعة المرحلة 3: «نص: أرقام» لا يُفهم قائمة ما لم يسمِّ الوسم الغموض، ورقم وحيد بلا وسم ليس قائمة.
  for (const line of ['عدد المقاطع المترجمة: 8', 'Total cues: 4', 'Time 12:30', 'Note: 3', '3']) assert.equal(ambiguousNumbers(line, has), null, line);
  assert.deepEqual(ambiguousNumbers('Ambiguous: 6', has), [6], 'وسم صريح برقم واحد');
  assert.deepEqual(ambiguousNumbers('المقاطع الملتبسة: 4 و7', has), [4, 7]);
  assert.deepEqual(ambiguousNumbers('3، 6', has), [3, 6], 'بلا وسم رقمان فأكثر');
});

test('المحلل: السطر بعد الملف يُعاد بأرقامه وبملاحظته، ولا يُعدّ من أسطر الشرح المزالة', () => {
  const r = parseSrtLenient(`${clean}\nمواضع غامضة: 3، 6\n`);
  assert.deepEqual(r.ambiguous, { numbers: [3, 6], line: 'مواضع غامضة: 3، 6' });
  assert.equal(r.cues.length, 8, 'المقاطع كما هي');
  assert.deepEqual(r.notes, ['ذكر النموذج مواضع غامضة (عددها 2): 3، 6.']);
  const other = parseSrtLenient(`${clean}\nترجمتُ 8 مقاطع\n`);
  assert.equal(other.ambiguous, null);
  assert.match(other.notes[0], /أُزيلت أسطر شرح/, 'الجملة شرح كما كانت');
  assert.equal(parseSrtLenient(clean).ambiguous, null);
});

test('readImport: حقل ambiguous بأرقام موجودة في الملف، وnull بلاها', async () => {
  const r = await readImport(new File([`${clean}\nمواضع غامضة: 3، 6\n`], 'talk.ar.srt'), { fingerprints: [] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ambiguous, [3, 6]);
  const none = await readImport(new File([clean], 'talk.ar.srt'), { fingerprints: [] });
  assert.equal(none.ambiguous, null);
});

test('ambiguousMarks: «أعود إليه» للمذكورة وحدها، ولا يكرر ما عليه علامة', () => {
  const cues = parseSrtLenient(clean).cues;
  const marks = [{ ...markAnchor(cues[2]), kind: 'done', at: '2026-11-10T00:00:00.000Z' }];
  const added = ambiguousMarks(cues, marks, [3, 6], '2026-11-10T01:00:00.000Z');
  assert.deepEqual(added.map((m) => [m.n, m.kind]), [[6, 'todo']], 'المقطع 3 معلّم من قبل');
  assert.deepEqual(ambiguousMarks(cues, [], [3, 6], 'x').map((m) => m.n), [3, 6]);
});
