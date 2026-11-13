// كاتب WebVTT (الفكرة ١١، ح-50): الترويسة والأرقام وأزمنة HH:MM:SS.mmm، وتهريب & و< و>، ورفض «-->» في النص، والتحقق بقراءة
// تفكّ التهريب (verifyVtt على مثال verifyRoundTrip). وقراءة ffmpeg المستقلة بلا ffmpeg تخطٍّ يُبلّغه scripts/run-tests.mjs ويفشل في CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TjError } from '../../../src/core/errors/index.js';
import { assertVttWritable, escapeVtt, formatVttTime, unescapeVtt, verifyVtt, writeVtt } from '../../../src/core/export/vtt.js';

const cue = (n, text, startMs = n * 3000, endMs = startMs + 2000) => ({ n, startMs, endMs, text });
const tjCode = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof TjError, `خطأ غير متوقع: ${e?.stack ?? e}`);
    return e;
  }
  return assert.fail('كان يجب أن يُرفض');
};
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

test('writeVtt: ترويسة WEBVTT وسطر فارغ، ولكل مقطع رقمه وسطر زمن HH:MM:SS.mmm ونصه، وLF وبلا BOM', () => {
  const text = writeVtt([cue(1, 'مرحبًا', 1000, 2500), cue(2, 'سطر أول\nسطر ثانٍ', 3_723_004, 3_725_000)]);
  assert.equal(text, 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nمرحبًا\n\n2\n01:02:03.004 --> 01:02:05.000\nسطر أول\nسطر ثانٍ\n');
  assert.notEqual(text.charCodeAt(0), 0xfeff);
  assert.doesNotMatch(text, /\r/);
  assert.equal(writeVtt([]), 'WEBVTT\n');
});

test('formatVttTime: الساعات رقمان على الأقل، والنقطة قبل الملي ثانية، والسالب وغير الصحيح يُرفضان', () => {
  assert.equal(formatVttTime(0), '00:00:00.000');
  assert.equal(formatVttTime(359_999_999), '99:59:59.999');
  assert.equal(formatVttTime(360_000_000), '100:00:00.000');
  assert.throws(() => formatVttTime(-1), RangeError);
  assert.throws(() => formatVttTime(1.5), RangeError);
});

test('التهريب: & أولًا ثم < و>، فيُقرأ كل شيء نصًا (وسم التنسيق والكيان الحرفي يبقيان كما كُتبا)، وفكّه يعيد النص بالحرف', () => {
  const raw = 'Tom & Jerry <i>قط</i> a>b &amp; &lt;';
  const escaped = escapeVtt(raw);
  assert.equal(escaped, 'Tom &amp; Jerry &lt;i&gt;قط&lt;/i&gt; a&gt;b &amp;amp; &amp;lt;');
  assert.equal(unescapeVtt(escaped), raw);
  const text = writeVtt([cue(1, raw)]);
  assert.ok(text.includes(`\n${escaped}\n`));
  assert.doesNotMatch(text.split('\n')[4], /[<>]/, 'لا < ولا > حرفيان في نص المقطع');
  verifyVtt(text, [cue(1, raw)]);
});

test('«-->» داخل النص يُرفض برقم مقطعه (EX_TEXT_BREAKS_VTT)، ومعه السطر الفارغ والتوقيت المعيب برموزهما', () => {
  const arrow = tjCode(() => assertVttWritable([cue(1, 'أ'), cue(2, 'من A --> B'), cue(3, 'ج\nx-->y')]));
  assert.equal(arrow.code, 'EX_TEXT_BREAKS_VTT');
  assert.match(arrow.message, /2، 3/);
  assert.equal(tjCode(() => assertVttWritable([cue(1, 'أ\n\nب')])).code, 'EX_EMPTY_TEXT');
  assert.equal(tjCode(() => assertVttWritable([cue(1, 'أ', 5000, 4000)])).code, 'EX_TIMING_INVALID');
  assert.equal(tjCode(() => assertVttWritable([cue(1, 'أ', 0, 4000), cue(2, 'ب', 3000, 5000)])).code, 'EX_TIMING_INVALID', 'التداخل كما في SRT');
  // السهم بلا شرطتين، و«->» و«—>»، نص عادي: لا يقطع إشارة WebVTT.
  assertVttWritable([cue(1, 'A -> B'), cue(2, 'A —> B'), cue(3, '1 --  > 2')]);
  // والكاتب نفسه لا يكتب ما لا يُمثَّل ولو تجاوزه المستدعي.
  assert.throws(() => writeVtt([cue(1, 'a --> b')]), /-->/);
  assert.throws(() => writeVtt([cue(1, 'أ\n \nب')]), /سطر فارغ/);
});

test('verifyVtt: الملف الكامل يُعاد قراءته بفكّ التهريب فيعطي العدد والنص والأزمنة نفسها، وإلا EX_INVARIANT_FAILED', () => {
  const cues = [cue(1, 'أ & ب'), cue(2, '<b>ج</b>\nد'), cue(3, 'هـ')];
  const text = writeVtt(cues);
  verifyVtt(text, cues);
  const bad = (t, why) => assert.equal(tjCode(() => verifyVtt(t, cues)).code, 'EX_INVARIANT_FAILED', why);
  bad(text.replace('WEBVTT', 'WEBVT'), 'ترويسة ناقصة');
  bad(`\uFEFF${text}`, 'BOM');
  bad(text.replace('00:00:06.000', '00:00:06.001'), 'زمن مختلف');
  bad(text.replace('أ &amp; ب', 'أ & ب'), 'كيان غير مهرّب');
  bad(text.replace('\n\n3\n', '\n3\n'), 'مقطعان التحما');
  assert.equal(tjCode(() => verifyVtt(text, cues.slice(0, 2))).code, 'EX_INVARIANT_FAILED', 'عدد مختلف');
});

test('U+2028 وCR لا يصلان إلى الملف: الكاتب يقبل LF وحده فاصلًا، والمستدعي يوحّد الأسطر قبله (lfLines)', () => {
  assert.throws(() => writeVtt([cue(1, 'أ\rب')]), /CR|U\+2028/);
  assert.throws(() => writeVtt([cue(1, 'أ\u2028ب')]), /CR|U\+2028/);
});

test('قراءة ffmpeg المستقلة: ملف WebVTT من ترجمان يقرؤه ffmpeg بعدده، والتهريب يُفكّ نصًا', { skip: !hasFfmpeg && 'ffmpeg غير مثبت' }, () => {
  const cues = [cue(1, 'أ & ب'), cue(2, 'سطر\nثانٍ'), cue(3, '1 > 0 < 2'), cue(4, 'NOTE ليست تعليقًا داخل المقطع')];
  const dir = mkdtempSync(path.join(tmpdir(), 'tj-vtt-'));
  try {
    writeFileSync(path.join(dir, 'in.vtt'), writeVtt(cues));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(dir, 'in.vtt'), '-f', 'srt', path.join(dir, 'out.srt')]);
    const out = readFileSync(path.join(dir, 'out.srt'), 'utf8');
    assert.equal((out.match(/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?$/gm) ?? []).length, 4);
    assert.ok(out.includes('أ & ب'), out);
    assert.ok(out.includes('NOTE ليست تعليقًا'), out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
