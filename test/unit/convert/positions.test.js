// اختبار منطق مطابقة المواضع في الحزام الحي (بلا متصفح)، من مساعده خارج test/live (تدقيق 7a66f91، U103).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomPositions, judgePosition } from '../../helpers/positions.mjs';

test('randomPositions: عشرة أزمنة موزعة ومستقرة بالبذرة', () => {
  const a = randomPositions(600, 42);
  assert.equal(a.length, 10);
  assert.deepEqual(a, randomPositions(600, 42));
  assert.ok(a.every((t, i) => t >= 30 && t <= 570 && (i === 0 || t > a[i - 1])));
});

test('judgePosition: يدوي وتلقائي وصمت', () => {
  const cues = [
    { startMs: 0, endMs: 2000, text: 'Hello there\nfriend' },
    { startMs: 2000, endMs: 4000, text: 'how are you' },
    { startMs: 9000, endMs: 10000, text: 'later' },
  ];
  assert.equal(judgePosition(cues, 'manual', 1, 'Hello there friend').verdict, 'exact');
  assert.equal(judgePosition(cues, 'manual', 3, 'are you').verdict, 'contained');
  assert.equal(judgePosition(cues, 'manual', 3, 'something else').match, false);
  assert.equal(judgePosition(cues, 'manual', 6, '').verdict, 'silence');
  assert.equal(judgePosition(cues, 'manual', 1, '').verdict, 'not-rendered');
  assert.equal(judgePosition(cues, 'asr', 3.5, 'friend how are').match, true);
});
