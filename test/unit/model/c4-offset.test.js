// تدقيق 7a66f91، المرحلة C4 (U97): تقريب الإزاحة إلى شبكة 100ms متناظر حول الصفر (النصف بعيدًا عن الصفر)، فإزاحة
// وعكسها تتقابلان. الموجب كما كان، والسالب كان يُقرَّب نحو الصفر عند النصف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOffset } from '../../../src/core/model/timing.js';
import { syncOffset } from '../../../src/player/controls/sentence.js';

test('U97: normalizeOffset متناظر: f(−x) = −f(x)، والنصف بعيدًا عن الصفر', () => {
  const cases = [[50, 100], [-50, -100], [150, 200], [-150, -200], [250, 300], [-250, -300], [49, 0], [-49, 0], [51, 100], [-51, -100], [-1250, -1300], [1250, 1300]];
  for (const [input, want] of cases) assert.equal(normalizeOffset(input), want, String(input));
  for (let x = -2000; x <= 2000; x += 7) assert.equal(normalizeOffset(-x), -normalizeOffset(x) || 0, String(x));
  assert.equal(Object.is(normalizeOffset(-40), -0), false, 'لا صفر سالب');
  assert.equal(normalizeOffset(-(10 ** 9)), -600000);
});

test('U97: مزامنة المقطع الحالي (syncOffset) تقرّب التقدّم والتأخر بالقدر نفسه', () => {
  const cue = { startMs: 10000 };
  assert.equal(syncOffset(10050, cue), 100);
  assert.equal(syncOffset(9950, cue), -100);
});
