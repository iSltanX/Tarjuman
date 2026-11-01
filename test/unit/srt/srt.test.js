import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSrtTime, parseSrtTime } from '../../../src/core/srt/time.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { parseSrtStrict, SrtParseError } from '../../../src/core/srt/parser.js';

test('أزمنة SRT ذهابًا وإيابًا', () => {
  for (const ms of [0, 1, 999, 1000, 59999, 3599999, 3600000, 36000000 + 123, 360000000]) {
    assert.equal(parseSrtTime(formatSrtTime(ms)), ms);
  }
  assert.equal(formatSrtTime(3723004), '01:02:03,004');
  assert.equal(formatSrtTime(360000000), '100:00:00,000');
  assert.throws(() => formatSrtTime(-1));
  assert.throws(() => formatSrtTime(1.5));
  assert.equal(parseSrtTime('1:02:03,004'), null);
  assert.equal(parseSrtTime('01:60:03,004'), null);
  assert.equal(parseSrtTime('01:02:03.004'), null);
});

test('الكاتب ينتج الصيغة المتوقعة ويُقرأ بالمحلّل الصارم', () => {
  const cues = [
    { startMs: 0, endMs: 1500, text: 'Hello there' },
    { startMs: 1500, endMs: 4000, text: 'line one\nline two' },
  ];
  const srt = writeSrt(cues);
  assert.equal(srt, '1\n00:00:00,000 --> 00:00:01,500\nHello there\n\n2\n00:00:01,500 --> 00:00:04,000\nline one\nline two\n');
  assert.equal(srt.charCodeAt(0), '1'.charCodeAt(0));
  const back = parseSrtStrict(srt);
  assert.deepEqual(back.map(({ startMs, endMs, text }) => ({ startMs, endMs, text })), cues);
  assert.deepEqual(parseSrtStrict(srt.replace(/\n/g, '\r\n')).length, 2);
  assert.deepEqual(parseSrtStrict(''), []);
});

test('الكاتب يرفض السطر الفارغ داخل المقطع', () => {
  assert.throws(() => writeSrt([{ startMs: 0, endMs: 1, text: 'a\n\nb' }]));
});

test('المحلّل الصارم يرفض المخالفات', () => {
  const ok = '1\n00:00:00,000 --> 00:00:01,000\nA\n';
  assert.throws(() => parseSrtStrict(`﻿${ok}`), SrtParseError);
  assert.throws(() => parseSrtStrict(ok.slice(0, -1)), SrtParseError);
  assert.throws(() => parseSrtStrict(ok.replace('1\n', '2\n')), SrtParseError);
  assert.throws(() => parseSrtStrict(ok.replace(' --> ', ' -> ')), SrtParseError);
  assert.throws(() => parseSrtStrict('1\n00:00:00,000 --> 00:00:01,000\n'), SrtParseError);
  assert.throws(() => parseSrtStrict(`${ok}\n\n`), SrtParseError);
});
