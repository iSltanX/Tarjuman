// الدوال النقية لإضافات P12: المقطع الظاهر ونافذة الجمل والإزاحة من الجملة (sentence.js)، والخانة الهدف والتعديلات
// اليدوية و«إبقاء تعديلاتي» (replace.js)، ونصوص الأسطر المختصرة بصيغ العدد العربية (text.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultTarget, keepEditsPlan, manualEdits, sameCues } from '../../../../src/player/controls/replace.js';
import { SENTENCE_PAGE, nearestCueIndex, oneLine, sentenceWindow, syncOffset, visibleCueIndex, windowAround } from '../../../../src/player/controls/sentence.js';
import { charsText, editsLine, keptLine, nameOtherLine, partRow } from '../../../../src/player/controls/text.js';
import { makeCues } from '../../../helpers/fixtures.js';

// 20 مقطعًا: البداية 1000 + 2500·i والمدة 2000.
const CUES = makeCues(20);

test('المقطع الظاهر: داخل مدته، ثم مهلة قصيرة بعد نهايته، وإلا null', () => {
  assert.equal(visibleCueIndex(CUES, 1000), 0);
  assert.equal(visibleCueIndex(CUES, 2999), 0);
  assert.equal(visibleCueIndex(CUES, 3200), 0, 'في الفجوة بعد نهايته بقليل');
  assert.equal(visibleCueIndex(CUES, 3600), 1);
  assert.equal(visibleCueIndex(CUES, 900), null, 'قبل أول مقطع');
  assert.equal(visibleCueIndex(CUES, 100000), null, 'بعد آخر مقطع بكثير');
  assert.equal(visibleCueIndex([], 1000), null);
  assert.equal(visibleCueIndex(CUES, NaN), null);
});

test('نافذة الجمل: سبع حول المحور داخل حدود الملف، وأبكر وأحدث', () => {
  assert.equal(SENTENCE_PAGE, 7);
  assert.equal(nearestCueIndex(CUES, 26200), 10);
  assert.equal(nearestCueIndex(CUES, 25700), 10, 'في الفجوة: الأقرب بداية');
  assert.equal(windowAround(20, 10), 7);
  assert.equal(windowAround(20, 1), 0);
  assert.equal(windowAround(20, 19), 13);
  assert.equal(windowAround(4, 2), 0, 'ملف أقصر من النافذة');
  const w = sentenceWindow(CUES, 7);
  assert.deepEqual(w.items.map((x) => x.index), [7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual([w.earlier, w.later], [true, true]);
  assert.deepEqual([sentenceWindow(CUES, 0).earlier, sentenceWindow(CUES, 13).later], [false, false]);
  assert.equal(sentenceWindow(CUES, 40).start, 13, 'تُقصر على آخر نافذة');
  assert.equal(oneLine('سطر أول\nوسطر ثانٍ  '), 'سطر أول وسطر ثانٍ');
});

test('الإزاحة من الجملة: تظهر بدايتها عند اللحظة المرجعية، على شبكة 100ms وضمن الحدود', () => {
  // ملف مؤخَّر 3 ثوانٍ: الجملة تُسمع عند 26.0 ث وبدايتها في الملف 29.0 ث.
  assert.equal(syncOffset(26000, { startMs: 29000 }), -3000);
  assert.equal(syncOffset(26040, { startMs: 23000 }), 3000, 'تقريب إلى الشبكة');
  assert.equal(syncOffset(26060, { startMs: 23000 }), 3100);
  assert.equal(syncOffset(900000, { startMs: 0 }), 600000, 'الحد الأعلى');
  assert.equal(syncOffset(0, { startMs: 900000 }), -600000);
});

test('الخانة الهدف: أول فارغة، وإلا النشطة', () => {
  const s = (f, a) => [1, 2, 3].map((n, i) => ({ n, filled: f[i], active: a === n, name: null }));
  assert.equal(defaultTarget(s([true, false, false], 1)), 2);
  assert.equal(defaultTarget(s([false, true, false], 2)), 1);
  assert.equal(defaultTarget(s([true, true, true], 2)), 2);
  assert.equal(defaultTarget(s([false, false, false], null)), 1);
});

test('التعديلات اليدوية: كل تغيير في المحاذاة بين الأصل والحالية تعديل واحد', () => {
  const original = makeCues(10);
  assert.equal(manualEdits(null), 0);
  assert.equal(manualEdits({ original, current: null }), 0);
  const text = original.map((c, i) => (i === 3 ? { ...c, text: 'غيّرته' } : c));
  assert.equal(manualEdits({ original, current: text }), 1);
  const timing = text.map((c, i) => (i === 6 ? { ...c, startMs: c.startMs + 300 } : c));
  assert.equal(manualEdits({ original, current: timing }), 2);
  const removed = timing.filter((_, i) => i !== 8);
  assert.equal(manualEdits({ original, current: removed }), 3);
});

test('«إبقاء تعديلاتي»: دمج ثلاثي فوق الجديد، والتعارض للجديد، والمحاذاة الضعيفة تمنعه بسبب', () => {
  const original = makeCues(8);
  const mine = original.map((c, i) => (i === 1 ? { ...c, text: 'تعديلي' } : i === 5 ? { ...c, text: 'تعديلي الآخر' } : c));
  const theirs = original.map((c, i) => (i === 5 ? { ...c, text: 'من الملف' } : i === 7 ? { ...c, text: 'جديد' } : c));
  const plan = keepEditsPlan({ original, current: mine }, theirs);
  assert.equal(plan.ok, true);
  assert.equal(plan.conflicts, 1, 'المقطع 6 عدّله الطرفان');
  assert.deepEqual(plan.current.map((c) => c.text), [original[0].text, 'تعديلي', ...original.slice(2, 5).map((c) => c.text), 'من الملف', original[6].text, 'جديد']);
  const same = keepEditsPlan({ original, current: original }, theirs);
  assert.equal(same.current, null, 'لا شيء يُبقى: الخانة غير معدّلة');
  const far = original.map((c, i) => ({ ...c, startMs: 900000 + i * 7000, endMs: 902000 + i * 7000 }));
  const weak = keepEditsPlan({ original, current: mine }, far);
  assert.equal(weak.ok, false);
  assert.equal(typeof weak.reason, 'string');
  assert.equal(sameCues(original, original.map((c) => ({ ...c }))), true);
});

test('أسطر مختصرة بصيغ العدد: التعديلات، والإبقاء، وقرينة الاسم، وحجم الجزء', () => {
  assert.deepEqual([1, 2, 3, 10, 11, 12, 100, 103].map(editsLine), [
    'سيُستبدل تعديل يدوي واحد', 'سيُستبدل تعديلان يدويان', 'سيُستبدل 3 تعديلات يدوية', 'سيُستبدل 10 تعديلات يدوية',
    'سيُستبدل 11 تعديلًا يدويًا', 'سيُستبدل 12 تعديلًا يدويًا', 'سيُستبدل 100 تعديل يدوي', 'سيُستبدل 103 تعديلات يدوية',
  ]);
  assert.equal(keptLine(0), 'تُبقى تعديلاتك اليدوية');
  assert.equal(keptLine(2), 'تُبقى تعديلاتك، ويأخذ الملف الجديد مواضع التعارض (2)');
  assert.equal(nameOtherLine(null), 'الاسم يشير إلى فيديو آخر');
  assert.equal(nameOtherLine('  قصير\n'), 'الاسم يشير إلى فيديو آخر · قصير');
  assert.equal(Array.from(nameOtherLine('ع'.repeat(60)).split(' · ')[1]).length, 40);
  assert.deepEqual([1, 2, 5, 12, 100, 18400].map(charsText), ['محرف واحد', 'محرفان', '5 محارف', '12 محرفًا', '100 محرف', '18,400 محرف']);
  assert.equal(partRow({ index: 1, from: 1, to: 200, chars: 18400 }), '1 · 1–200 · 18,400 محرف');
});
