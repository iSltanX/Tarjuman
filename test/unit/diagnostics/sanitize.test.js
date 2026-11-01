import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSecrets, sanitizeText, sanitizeDeep } from '../../../src/core/diagnostics/sanitize.js';

// قيم وهمية بأشكال الأسرار الحقيقية.
const POT = 'Mn' + 'A'.repeat(110);
const samples = [
  `https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&pot=${POT}`,
  'GET /api/timedtext?lang=en',
  `signature=${'B'.repeat(40)}`,
  `"pot":"${'C'.repeat(30)}"`,
  'expire=1761234567',
  '?v=x&ei=AbCdEfGhIjKl',
  'Cookie: a=b',
  `SAPISID=${'d'.repeat(20)}`,
  `__Secure-3PSID=${'e'.repeat(30)}`,
  'VISITOR_INFO1_LIVE=abcdEFGH',
  'authorization: SAPISIDHASH 123_abc',
  'youtube.com/watch?v=AAAAAAAAAAA',
];

test('findSecrets يكشف كل شكل حساس', () => {
  for (const s of samples) assert.ok(findSecrets(s).length > 0, s);
});

test('findSecrets لا ينذر على النص العادي وأسماء الحقول', () => {
  const clean = [
    'وجود pot دون قيمته، و hasPot: true',
    '{"hasPot":true,"capsAsr":true,"kindParam":"asr","lang":"en","fmt":"json3"}',
    "{\"events\":[{\"tStartMs\":0,\"segs\":[{\"utf8\":\"we're going to sign the expire date\"}]}]}",
    '1\n00:00:00,000 --> 00:00:01,000\nThe signature move.\n',
    'videoId AAAAAAAAAAA',
  ];
  for (const s of clean) assert.deepEqual(findSecrets(s), [], s);
});

test('sanitizeText يزيل الأسرار، وsanitizeDeep يسقط المفاتيح الحساسة', () => {
  for (const s of samples) assert.deepEqual(findSecrets(sanitizeText(s)), [], s);
  const d = sanitizeDeep({ url: 'x', nested: [{ note: samples[0], headers: { a: 1 } }], n: 3 });
  assert.equal(d.url, '[محذوف]');
  assert.equal(d.nested[0].headers, '[محذوف]');
  assert.deepEqual(findSecrets(JSON.stringify(d)), []);
  assert.equal(d.n, 3);
});

test('findSecrets: تجاهل الروابط في نص الترجمة دون تجاهل الرموز', () => {
  const spoken = 'visit youtube.com/minutephysics for more';
  assert.ok(findSecrets(spoken).length > 0);
  assert.deepEqual(findSecrets(spoken, ['url']), []);
  assert.ok(findSecrets(`${spoken} signature=${'B'.repeat(40)}`, ['url']).length > 0, 'التوقيع يُكشف دائمًا');
});
