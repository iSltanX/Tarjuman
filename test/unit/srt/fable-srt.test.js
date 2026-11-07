// تدقيق Fable (FA-01): سطر يبدأ بما يشبه الزمن ثم مسافات كثيرة كان بحثًا تربيعيًا في تطبيع الأسهم (ARROW_RE في timeForm)،
// فملف واحد يجمّد تبويب يوتيوب أو صفحة المحفوظات: 80 ألف مسافة نحو 3.3 ث، والنمو أربعة أضعاف مع كل مضاعفة. الحراسة هنا
// زمنية بهامش واسع (200 ألف مسافة كانت نحو 20 ث وصارت أجزاء من ثانية)، ومعها حالات تثبت أن التطبيع والقبول والرفض كما كانت.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breaksSrtText, parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { TjError, messageFor } from '../../../src/core/errors/index.js';

const T1 = '00:00:01,000 --> 00:00:03,000';
const block = (n, time, text) => `${n}\n${time}\n${text}\n`;
const LIMIT_MS = 500;

/** الزمن بالملي ثانية، والنتيجة أو رمز الخطأ. */
function timed(fn) {
  const t0 = performance.now();
  let out;
  try {
    out = fn();
  } catch (e) {
    assert.ok(e instanceof TjError, `خطأ غير متوقع: ${e}`);
    out = e.code;
  }
  return { ms: performance.now() - t0, out };
}

test('FA-01: سطر «0:0» ثم 200 ألف مسافة يُحسم في زمن خطي، داخل نص مقطع وقبل الملف وفي breaksSrtText', () => {
  const line = `0:0${' '.repeat(200000)}x`;
  const inCue = timed(() => parseSrtLenient(block(1, T1, line)));
  assert.equal(inCue.out, 'IM_CUE_TOO_LONG');
  assert.ok(inCue.ms < LIMIT_MS, `داخل المقطع ${inCue.ms.toFixed(0)} م.ث`);
  const before = timed(() => parseSrtLenient(`${line}\n${block(1, T1, 'أ')}`));
  assert.equal(before.out.cues.length, 1, 'السطر قبل الملف شرح يُزال بملاحظة');
  assert.ok(before.ms < LIMIT_MS, `قبل الملف ${before.ms.toFixed(0)} م.ث`);
  const breaks = timed(() => breaksSrtText(line));
  assert.equal(breaks.out, false);
  assert.ok(breaks.ms < LIMIT_MS, `breaksSrtText ${breaks.ms.toFixed(0)} م.ث`);
});

test('FA-01: متتاليات مسافات وأسهم ناقصة متكررة (« ->-» و« -») لا تُبطئ التطبيع', () => {
  for (const unit of [' ->-', ' -', ' –', '\t ']) {
    const line = `12:3${unit.repeat(Math.floor(120000 / unit.length))}x`;
    const r = timed(() => parseSrtLenient(block(1, T1, line)));
    assert.equal(r.out, 'IM_CUE_TOO_LONG');
    assert.ok(r.ms < LIMIT_MS, `${JSON.stringify(unit)}: ${r.ms.toFixed(0)} م.ث`);
  }
});

test('FA-01: تطبيع الأسهم كما كان: كل سهم بمسافاته يصير « --> » بملاحظة، و«-->» بلا ملاحظة ولو بلا مسافات', () => {
  const variants = [
    ['00:00:01,000 -> 00:00:03,000', 1],
    ['00:00:01,000   →   00:00:03,000', 1],
    ['00:00:01,000—>00:00:03,000', 1],
    ['00:00:01,000 –-> 00:00:03,000', 1],
    ['00:00:01,000⟶00:00:03,000', 1],
    ['00:00:01,000-->00:00:03,000', 0],
    [`00:00:01,000${' '.repeat(3000)}-->${' '.repeat(3000)}00:00:03,000`, 0],
  ];
  for (const [time, marks] of variants) {
    const r = timed(() => parseSrtLenient(block(1, time, 'أ')));
    assert.ok(r.ms < LIMIT_MS, `${r.ms.toFixed(0)} م.ث`);
    assert.equal(typeof r.out, 'object', `${JSON.stringify(time).slice(0, 60)} رُفض: ${r.out}`);
    assert.deepEqual(r.out.cues, [{ n: 1, startMs: 1000, endMs: 3000, text: 'أ' }]);
    assert.deepEqual(r.out.notes, marks ? [messageFor('IM_NOTE_TIME_MARKS', { count: 1 })] : []);
  }
});

test('FA-01: سهمان في سطر رأس خطأ زمن كما كان، وسطر نص بسهمين داخل المقطع يبقى نصًا حرفيًا', () => {
  for (const time of ['00:00:01,000 --> --> 00:00:03,000', '00:00:01,000 -> -> 00:00:03,000']) {
    assert.equal(timed(() => parseSrtLenient(block(1, time, 'أ'))).out, 'IM_BAD_TIME');
  }
  const r = parseSrtLenient(block(1, T1, 'أ\n10:30 -> -> 11:00'));
  assert.equal(r.cues[0].text, 'أ\n10:30 -> -> 11:00');
});

test('FA-01: ملف بالحد الأعلى (50,000 مقطع) بأسهم مختلفة يُحلَّل كاملًا في أقل من ثانيتين', () => {
  const arrows = ['-->', '->', '→', ' --> '];
  const big = Array.from({ length: 50000 }, (_, i) => {
    const s = String(i % 60).padStart(2, '0');
    return block(i + 1, `00:${s}:01,000 ${arrows[i % arrows.length]} 00:${s}:02,500`, `سطر ${i + 1}`);
  }).join('\n');
  const r = timed(() => parseSrtLenient(big));
  assert.equal(typeof r.out, 'object', `رُفض: ${r.out}`);
  assert.equal(r.out.cues.length, 50000);
  const min = 49999 % 60;
  assert.deepEqual(r.out.cues[49999], { n: 50000, startMs: min * 60000 + 1000, endMs: min * 60000 + 2500, text: 'سطر 50000' });
  assert.ok(r.ms < 2000, `${r.ms.toFixed(0)} م.ث`);
});
