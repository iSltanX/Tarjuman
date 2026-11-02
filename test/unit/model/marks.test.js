// العلامات وآخر موضع (P10-AC6، عقد data-model §١٢): العلامة ترتبط برقم المقطع وزمنه وبصمة نصه، وتُحل إلى «مرتبطة» أو
// «قد تكون انتقلت» أو «يتيمة» دون إلصاق بالرقم وحده: بعد الاستبدال والدمج والشطر وإعادة الترقيم والانجراف والحذف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOVE_WINDOW_MS, cueTextHash, markAnchor, resolveMark, resolveMarks, resolvePosition, validateMark, validateMarks,
} from '../../../src/core/model/marks.js';
import { makeCues, NOW } from '../../helpers/fixtures.js';

const cues = () => makeCues(6, { text: (i) => `جملة رقم ${i}` });
const mark = (cue, kind = 'todo') => ({ ...markAnchor(cue), kind, at: NOW });
const renumber = (list) => list.map((c, i) => ({ ...c, n: i + 1 }));

test('بصمة النص: ثمانية محارف ست عشرية، ثابتة، ولا تتأثر بالمسافات الطرفية والمكررة', () => {
  assert.match(cueTextHash('سطر'), /^[0-9a-f]{8}$/);
  assert.equal(cueTextHash('  سطر   أول\nثانٍ '), cueTextHash('سطر أول ثانٍ'));
  assert.notEqual(cueTextHash('سطر أول'), cueTextHash('سطر ثانٍ'));
  assert.equal(validateMark(mark(cues()[0])).ok, true);
  assert.equal(validateMark({ ...mark(cues()[0]), text: 'x' }).ok, false, 'العلامة لا تحمل نصًا');
  assert.equal(validateMark({ ...mark(cues()[0]), kind: 'check' }).ok, false);
  assert.equal(validateMarks([mark(cues()[0]), mark(cues()[0], 'done')]).ok, false, 'علامة واحدة لكل مقطع');
});

test('مرتبطة: المقطع نفسه، وبعد إعادة ترقيم لا تغيّر نصه ولا زمنه (الرقم تلميح لا مرجع)', () => {
  const list = cues();
  const m = mark(list[3]);
  assert.deepEqual(resolveMark(m, list), { state: 'linked', index: 3 });
  const inserted = renumber([{ n: 1, startMs: 100, endMs: 900, text: 'مقطع جديد' }, ...list]);
  assert.deepEqual(resolveMark(m, inserted), { state: 'linked', index: 4 }, 'الرقم تغيّر من 4 إلى 5 والعلامة معه');
});

test('الاستبدال: الملف الجديد بالنص نفسه مرتبط، وبنص آخر عند الزمن نفسه «قد تكون انتقلت»، لا مرتبطة بالرقم وحده', () => {
  const list = cues();
  const m = mark(list[2]);
  const sameText = list.map((c) => ({ ...c }));
  assert.equal(resolveMark(m, sameText).state, 'linked');
  const otherText = list.map((c) => ({ ...c, text: `ترجمة أخرى ${c.n}` }));
  assert.deepEqual(resolveMark(m, otherText), { state: 'moved', index: 2 });
  const fewer = renumber(list.filter((_, i) => i !== 1).map((c) => ({ ...c, text: `أخرى ${c.startMs}` })));
  const r = resolveMark(m, fewer);
  assert.equal(r.state, 'moved', 'رقم 3 صار لمقطع آخر، فلا ارتباط بالرقم');
  assert.equal(fewer[r.index].startMs, list[2].startMs, 'المرشّح بالزمن لا بالرقم');
});

test('الدمج: علامتا المقطعين المدموجين «قد تكون انتقلت» إلى المقطع المدموج', () => {
  const list = cues();
  const merged = renumber([...list.slice(0, 2), { n: 3, startMs: list[2].startMs, endMs: list[3].endMs, text: `${list[2].text} ${list[3].text}` }, ...list.slice(4)]);
  assert.deepEqual(resolveMark(mark(list[2]), merged), { state: 'moved', index: 2 });
  assert.deepEqual(resolveMark(mark(list[3]), merged), { state: 'moved', index: 2 }, 'زمن الثانية داخل المدموج');
  assert.deepEqual(resolveMark(mark(list[5]), merged), { state: 'linked', index: 4 }, 'ما بعد الدمج مرتبط برقمه الجديد');
});

test('الشطر: علامة المقطع المشطور «قد تكون انتقلت» إلى نصفه الأول', () => {
  const list = cues();
  const c = list[1];
  const mid = c.startMs + 1000;
  const split = renumber([list[0], { n: 2, startMs: c.startMs, endMs: mid, text: 'جملة رقم' }, { n: 3, startMs: mid, endMs: c.endMs, text: '2' }, ...list.slice(2)]);
  assert.deepEqual(resolveMark(mark(c), split), { state: 'moved', index: 1 });
  assert.deepEqual(resolveMark(mark(list[4]), split), { state: 'linked', index: 5 });
});

test('الانجراف: النص نفسه بعد نقل زمنه ضمن ±10 ث «قد تكون انتقلت» إليه؛ والحذف في فجوة يتيمة', () => {
  const list = makeCues(4, { gapMs: 20000, text: (i) => `نص ${i}` });
  const m = mark(list[1]);
  const shifted = list.map((c) => ({ ...c, startMs: c.startMs + 3000, endMs: c.endMs + 3000 }));
  assert.deepEqual(resolveMark(m, shifted), { state: 'moved', index: 1 });
  const far = list.map((c) => ({ ...c, startMs: c.startMs + MOVE_WINDOW_MS + 1000, endMs: c.endMs + MOVE_WINDOW_MS + 1000 }));
  assert.equal(resolveMark(m, far).state, 'orphan', 'لا نص قريب ولا مقطع يحوي زمنها');
  const deleted = renumber(list.filter((_, i) => i !== 1));
  assert.deepEqual(resolveMark(m, deleted), { state: 'orphan', index: null });
  assert.deepEqual(resolveMark(m, []), { state: 'orphan', index: null });
});

test('حل علامات كثيرة مرة واحدة، وآخر موضع إلى أقرب مقطع', () => {
  const list = cues();
  const r = resolveMarks([mark(list[0]), mark(list[5], 'done')], list);
  assert.deepEqual(r.map((x) => [x.state, x.index, x.mark.kind]), [['linked', 0, 'todo'], ['linked', 5, 'done']]);
  assert.equal(resolvePosition({ n: 9, startMs: list[3].startMs + 200, at: NOW }, list), 3);
  assert.equal(resolvePosition(null, list), null);
  assert.equal(resolvePosition({ n: 1, startMs: 0, at: NOW }, []), null);
});
