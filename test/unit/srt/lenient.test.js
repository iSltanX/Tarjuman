// المحلّل المتسامح (P4-AC1، P4-AC2): يقبل ما تنتجه النماذج والأدوات، ويجرّد وسوم التنسيق نصيًا وحدها، ولا يفسّر
// HTML، ويذكر كل تحويل للنص في notes، ويرفض ما لا يُحلَّل برقم السطر ورسالة عربية، ولا يلمس التوقيت.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { TjError, messageFor } from '../../../src/core/errors/index.js';
import { validateCue, validateCues } from '../../../src/core/model/cue.js';
import { ENGLISH_LINES, readSrtFixture } from '../../fixtures/srt/index.js';

const ARABIC = /[؀-ۿ]/;
const fail = (text) => {
  try {
    parseSrtLenient(text);
  } catch (e) {
    assert.ok(e instanceof TjError, `خطأ غير متوقع: ${e}`);
    return e;
  }
  return assert.fail('كان يجب أن يُرفض');
};
const block = (n, time, text) => `${n}\n${time}\n${text}\n`;
const T1 = '00:00:01,000 --> 00:00:03,000';

test('عينة نظيفة: ثمانية مقاطع بأزمنة الأصل، بلا ملاحظات ولا تحذيرات، وتجتاز مدقق النموذج', () => {
  const r = parseSrtLenient(readSrtFixture('clean.ar.srt'));
  assert.equal(r.cues.length, 8);
  assert.deepEqual(r.cues[0], { n: 1, startMs: 1000, endMs: 3000, text: 'مرحبًا بكم في هذا الحديث.' });
  assert.deepEqual(r.cues[7], { n: 8, startMs: 18500, endMs: 20500, text: 'شكرًا لكم.' });
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(validateCues(r.cues, 'cues', { min: 1 }), { ok: true });
  assert.equal(ENGLISH_LINES.length, 8);
});

test('يقبل BOM وCRLF والنقطة في الأزمنة والأسطر الزائدة ومسافات الأطراف، بالنتيجة نفسها وبلا ملاحظات', () => {
  const clean = parseSrtLenient(readSrtFixture('clean.ar.srt'));
  const messy = `\uFEFF\n\n${readSrtFixture('clean.ar.srt')
    .replace(/,(\d{3})/g, '.$1')
    .replace(/\n\n/g, '\n\n\n\n')
    .replace(/(\d)\n/g, '$1  \n')
    .replace(/\n/g, '\r\n')}\r\n\r\n   \r\n`;
  const r = parseSrtLenient(messy);
  assert.deepEqual(r.cues, clean.cues);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(r.warnings, []);
});

test('يقبل CR وحده فاصل أسطر، والساعة برقم واحد، وعلامات الاتجاه حول الرقم والزمن', () => {
  const text = `\u200F1\r0:00:01,000 --> 0:00:03,000\rسطر\r\r2\r\u200E00:00:03,500 --> 00:00:05,000\rسطر ثانٍ\r`;
  const r = parseSrtLenient(text);
  assert.deepEqual(r.cues, [
    { n: 1, startMs: 1000, endMs: 3000, text: 'سطر' },
    { n: 2, startMs: 3500, endMs: 5000, text: 'سطر ثانٍ' },
  ]);
});

test('الأرقام الهندية في الترقيم وسطور الزمن تُحوَّل مع ملاحظة، ولا تُمسّ أرقام النص', () => {
  const text = `١\n٠٠:٠٠:٠١,٠٠٠ --> ٠٠:٠٠:٠٣,٥٠٠\nفي عام ٢٠٢٤ بدأ كل شيء.\n\n٢\n۰۰:۰۰:۰۴,۰۰۰ --> ۰۰:۰۰:۰۵,۰۰۰\nنص.\n`;
  const r = parseSrtLenient(text);
  assert.deepEqual(r.cues.map((c) => [c.n, c.startMs, c.endMs]), [[1, 1000, 3500], [2, 4000, 5000]]);
  assert.equal(r.cues[0].text, 'في عام ٢٠٢٤ بدأ كل شيء.');
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_DIGITS')]);
});

test('الترقيم غير المتسلسل يُحفظ كما ورد ويُبلَّغ عنه ولا يُصلح', () => {
  const r = parseSrtLenient(readSrtFixture('missing.ar.srt'));
  assert.deepEqual(r.cues.map((c) => c.n), [1, 2, 3, 6, 7, 8]);
  assert.deepEqual(r.warnings, [{ code: 'IM_NUMBERING_IRREGULAR', params: { prev: 3, n: 6 } }]);
  assert.deepEqual(r.cues[3], { n: 6, startMs: 13500, endMs: 15500, text: 'لكن القصة لا تنتهي هنا.' });
  const dup = parseSrtLenient(`${block(1, T1, 'أ')}\n${block(1, '00:00:04,000 --> 00:00:05,000', 'ب')}`);
  assert.deepEqual(dup.cues.map((c) => c.n), [1, 1]);
  assert.deepEqual(dup.warnings, [{ code: 'IM_NUMBERING_IRREGULAR', params: { prev: 1, n: 1 } }]);
  const ok = parseSrtLenient(`${block(201, T1, 'أ')}\n${block(202, '00:00:04,000 --> 00:00:05,000', 'ب')}`);
  assert.deepEqual(ok.warnings, [], 'جزء احتياطي يبدأ من 201 متسلسل في ذاته');
});

test('سياج النموذج وأسطر الشرح تُزال بملاحظات تذكر ما أُزيل، والمقاطع سليمة', () => {
  const r = parseSrtLenient(readSrtFixture('fenced.ar.srt'));
  assert.deepEqual(r.cues, parseSrtLenient(readSrtFixture('clean.ar.srt')).cues);
  assert.equal(r.notes.length, 3);
  assert.equal(r.notes[0], messageFor('IM_NOTE_FENCE'));
  assert.match(r.notes[0], /```/);
  assert.match(r.notes[1], /قبل الملف/);
  assert.match(r.notes[1], /Here is the Arabic translation:/);
  assert.match(r.notes[2], /بعد الملف/);
  assert.match(r.notes[2], /هل تريد تعديلًا آخر على الترجمة؟/);
  assert.ok(r.notes.every((n) => n.length <= 500 && ARABIC.test(n)));
});

test('سياج بلا شرح: ملاحظة السياج وحدها؛ وشرح بلا سياج يُزال أيضًا بملاحظة', () => {
  const body = `${block(1, T1, 'أ')}\n${block(2, '00:00:04,000 --> 00:00:05,000', 'ب')}`;
  const fenced = parseSrtLenient(`\`\`\`\n${body}\`\`\`\n`);
  assert.equal(fenced.cues.length, 2);
  assert.equal(fenced.cues[1].text, 'ب', 'السياج الختامي بعد النص مباشرة لا يدخل نص المقطع');
  assert.deepEqual(fenced.notes, [messageFor('IM_NOTE_FENCE')]);
  const chatter = parseSrtLenient(`Sure! Here you go:\n\n${body}\nLet me know.\nBye.\n`);
  assert.equal(chatter.cues.length, 2);
  assert.equal(chatter.notes.length, 2);
  assert.match(chatter.notes[0], /Sure! Here you go:/);
  assert.match(chatter.notes[1], /Let me know\./);
  assert.match(chatter.notes[1], /عددها 2/);
});

test('حد معروف: شرح لاصق بآخر مقطع دون سطر فارغ ولا سياج لا يُميَّز عن نصه فيبقى فيه', () => {
  const r = parseSrtLenient(`${block(1, T1, 'سطر أخير')}Hope this helps!\n`);
  assert.equal(r.cues[0].text, 'سطر أخير\nHope this helps!');
  assert.deepEqual(r.notes, []);
  assert.deepEqual(parseSrtLenient(`${block(1, T1, 'سطر أخير')}\nHope this helps!\n`).cues[0].text, 'سطر أخير', 'بسطر فارغ قبله يُزال');
});

test('مقتطف الشرح في الملاحظة قصير حتى لو كان السطر طويلًا', () => {
  const long = 'x'.repeat(400);
  const r = parseSrtLenient(`${long}\n\n${block(1, T1, 'أ')}`);
  assert.ok(r.notes[0].length < 200, `${r.notes[0].length}`);
  assert.ok(r.notes[0].includes('…'));
});

test('وسوم التنسيق تُجرَّد نصيًا مع ملاحظة بعددها؛ والسطر الذي يفرغ بعد التجريد يسقط', () => {
  const text = [
    block(1, T1, '<i>مرحبًا</i> <b>بكم</b>'),
    block(2, '00:00:04,000 --> 00:00:05,000', '<font color="#ff0000" face="x">أحمر</font>'),
    block(3, '00:00:06,000 --> 00:00:07,000', '{\\an8}\nفي الأعلى {\\i1}مائل{\\i0}'),
    block(4, '00:00:08,000 --> 00:00:09,000', '<I>كبيرة</I> <U>تحته</U> <EM>و</EM><STRONG>أخرى</STRONG>'),
    block(5, '00:00:10,000 --> 00:00:11,000', '<i></i>'),
    block(6, '00:00:12,000 --> 00:00:13,000', 'سليم'),
  ].join('\n');
  const r = parseSrtLenient(text);
  assert.deepEqual(r.cues.map((c) => c.text), ['مرحبًا بكم', 'أحمر', 'في الأعلى مائل', 'كبيرة تحته وأخرى', '', 'سليم']);
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_TAGS', { count: 5 })]);
  assert.match(r.notes[0], /5/);
});

test('عينة الحقن: وسوم التنسيق وحدها تُجرَّد، وكل HTML آخر يبقى نصًا حرفيًا لا يُفسَّر (P4-AC2)', () => {
  const r = parseSrtLenient(readSrtFixture('injected.ar.srt'));
  assert.deepEqual(r.cues.map((c) => c.text), [
    'مرحبًا بكم في هذا الحديث.',
    '<script>alert(1)</script>أريد اليوم أن أشارككم قصة.',
    '<img src=x onerror=alert(1)>تبدأ في قرية صغيرة.',
    'لم يتوقع أحد ما حدث بعد ذلك.',
    '[موسيقى]',
    '&lt;b&gt;لكن&lt;/b&gt; القصة لا تنتهي هنا &amp; لن تنتهي.',
    'javascript:alert(3) دعوني أريكم السبب.',
    'شكرًا لكم.',
  ]);
  for (const c of r.cues) assert.equal(typeof c.text, 'string');
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_TAGS', { count: 3 })]);
  assert.deepEqual(r.warnings, [{ code: 'IM_HTML_LITERAL', params: { count: 2 } }]);
  assert.deepEqual(validateCues(r.cues, 'cues', { min: 1 }), { ok: true });
});

test('الكيانات لا تُفكّ، والأقواس الزاوية العادية تبقى كما هي دون تحذير', () => {
  const r = parseSrtLenient(block(1, T1, 'a &lt; b و 3 < 5 > 2 و &amp;nbsp;'));
  assert.equal(r.cues[0].text, 'a &lt; b و 3 < 5 > 2 و &amp;nbsp;');
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.notes, []);
});

test('محارف التحكم غير المرئية تُزال بملاحظة، وعلامات الاتجاه وZWNJ تبقى', () => {
  const r = parseSrtLenient(block(1, T1, 'سط\u0007ر\u001B[31m\u200F أول\u200C\nثانٍ'));
  assert.equal(r.cues[0].text, 'سطر[31m\u200F أول\u200C\nثانٍ');
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_CONTROL', { count: 1 })]);
});

test('المقطع الفارغ مقبول نصه فارغًا، وسطور النص تُقصّ وتُضمّ بـ\\n بلا أسطر فارغة', () => {
  const text = `${block(1, T1, '')}\n${block(2, '00:00:04,000 --> 00:00:05,000', '  سطر أول  \n\tسطر ثانٍ ')}`;
  const r = parseSrtLenient(text);
  assert.equal(r.cues[0].text, '');
  assert.equal(r.cues[1].text, 'سطر أول\nسطر ثانٍ');
  assert.deepEqual(r.notes, []);
});

test('لا يعدّل التوقيت: نهاية قبل بداية وتداخل مقبولان كما وردا (مشكلة توقيت لا خطأ نموذج)', () => {
  const r = parseSrtLenient(`${block(1, '00:00:05,000 --> 00:00:02,000', 'أ')}\n${block(2, '00:00:03,000 --> 00:00:09,000', 'ب')}`);
  assert.deepEqual(r.cues.map((c) => [c.startMs, c.endMs]), [[5000, 2000], [3000, 9000]]);
});

test('نص يحوي سهمًا أو رقمًا وحده في وسط المقطع لا يُحسب رأس مقطع', () => {
  const r = parseSrtLenient(block(1, T1, 'A --> B\n2024\nنهاية') + `\n${block(2, '00:00:04,000 --> 00:00:05,000', 'ب')}`);
  assert.equal(r.cues.length, 2);
  assert.equal(r.cues[0].text, 'A --> B\n2024\nنهاية');
});

test('الأخطاء: زمن تالف برقم السطر (عينة التلف: السطر 14) ورسالة عربية', () => {
  const e = fail(readSrtFixture('corrupt-time.ar.srt'));
  assert.equal(e.code, 'IM_BAD_TIME');
  assert.equal(e.params.line, 14);
  assert.match(e.message, /السطر 14/);
  assert.ok(ARABIC.test(e.message));
  assert.equal(e.message, messageFor('IM_BAD_TIME', { line: 14 }));
});

test('الأخطاء: رقم مفقود، ورقم غير صالح، ونص خارج المقطع، وزمن خارج الحد، وكسر ثوانٍ غير ثلاثي', () => {
  const missing = fail(`${block(1, T1, 'أ')}\n00:00:04,000 --> 00:00:05,000\nب\n`);
  assert.deepEqual([missing.code, missing.params.line], ['IM_MISSING_NUMBER', 5]);

  const zero = fail(block(0, T1, 'أ'));
  assert.deepEqual([zero.code, zero.params.line], ['IM_BAD_NUMBER', 1]);
  const huge = fail(block(9999999, T1, 'أ'));
  assert.deepEqual([huge.code, huge.params.line], ['IM_BAD_NUMBER', 1]);

  const stray = fail(`${block(1, T1, 'أ')}\nنص ضائع بين مقطعين\n\n${block(2, '00:00:04,000 --> 00:00:05,000', 'ب')}`);
  assert.deepEqual([stray.code, stray.params.line], ['IM_STRAY_TEXT', 5]);
  const afterBlank = fail(`1\n${T1}\n\nنص بعد سطر فارغ\n\n${block(2, '00:00:04,000 --> 00:00:05,000', 'ب')}`);
  assert.deepEqual([afterBlank.code, afterBlank.params.line], ['IM_STRAY_TEXT', 4]);

  const hours = fail(block(1, '101:00:00,000 --> 101:00:01,000', 'أ'));
  assert.deepEqual([hours.code, hours.params.line], ['IM_TIME_OUT_OF_RANGE', 2]);
  const minutes = fail(block(1, '00:75:00,000 --> 00:75:01,000', 'أ'));
  assert.deepEqual([minutes.code, minutes.params.line], ['IM_BAD_TIME', 2]);
  const frac = fail(block(1, '00:00:01,50 --> 00:00:02,000', 'أ'));
  assert.deepEqual([frac.code, frac.params.line], ['IM_BAD_TIME', 2]);
  const vtt = fail(block(1, '00:01.000 --> 00:02.000', 'أ'));
  assert.deepEqual([vtt.code, vtt.params.line], ['IM_BAD_TIME', 2]);
});

test('الأخطاء: ملف فارغ، وبلا مقاطع، ونص أطول من الحد، وعدد مقاطع فوق الحد', () => {
  for (const empty of ['', '   \n\n\t\r\n', '\uFEFF']) assert.equal(fail(empty).code, 'IM_EMPTY_FILE');
  const none = fail("I'm sorry, but I can't translate this text.\n");
  assert.equal(none.code, 'IM_NO_CUES');
  assert.equal(none.params?.line, undefined);
  const long = fail(block(1, T1, 'ب'.repeat(5001)));
  assert.deepEqual([long.code, long.params.line, long.params.max], ['IM_CUE_TOO_LONG', 1, 5000]);
  assert.equal(parseSrtLenient(block(1, T1, 'ب'.repeat(5000))).cues[0].text.length, 5000);
  const many = Array.from({ length: 50001 }, (_, i) => `${i + 1}\n00:00:00,000 --> 00:00:01,000\nx\n`).join('\n');
  assert.equal(fail(many).code, 'IM_TOO_MANY_CUES');
  assert.throws(() => parseSrtLenient(null), TypeError);
});

test('كل رمز خطأ للمحلّل له رسالة عربية تقول ما يُفعل، والتفاصيل التقنية بلا نص المستخدم', () => {
  for (const code of ['IM_BAD_TIME', 'IM_MISSING_NUMBER', 'IM_BAD_NUMBER', 'IM_STRAY_TEXT', 'IM_TIME_OUT_OF_RANGE', 'IM_CUE_TOO_LONG']) {
    const m = messageFor(code, { line: 7, max: 5000 });
    assert.ok(ARABIC.test(m) && m.includes('7'), `${code}: ${m}`);
    assert.ok(!m.includes('{'), `${code}: قالب غير مملوء`);
  }
  const e = fail(readSrtFixture('corrupt-time.ar.srt'));
  assert.equal(e.detail, null);
});

test('ملف كبير: 20,000 مقطع يُحلَّل في أقل من ثانيتين', () => {
  const big = Array.from({ length: 20000 }, (_, i) => `${i + 1}\n00:00:00,000 --> 00:00:01,000\nسطر ${i + 1}\n`).join('\n');
  const t0 = performance.now();
  const r = parseSrtLenient(big);
  assert.equal(r.cues.length, 20000);
  assert.ok(performance.now() - t0 < 2000, `${performance.now() - t0}ms`);
});

test('علامات غير مرئية (ALM وZWSP وZWNJ وZWJ وWJ وLRM وRLM) قبل رقم المقطع أو زمنه لا تُفسد الرأس', () => {
  for (const mark of ['\u061C', '\u200B', '\u200C', '\u200D', '\u2060', '\u200E', '\u200F']) {
    const r = parseSrtLenient(`${mark}1\n${mark}00:00:01,000 --> 00:00:03,000\nأ\n\n${mark}2\n${mark}00:00:04,000 --> 00:00:05,000\nب\n`);
    assert.deepEqual(r.cues.map((c) => [c.n, c.text]), [[1, 'أ'], [2, 'ب']], `U+${mark.codePointAt(0).toString(16)}`);
    assert.deepEqual([r.notes, r.warnings], [[], []]);
  }
});

test('رأس مبتور أو مكسور عند أطراف الملف خطأ برقم السطر، لا «شرح» يُحذف بصمت (كما في وسطه)', () => {
  const good = `${block(1, T1, 'أ')}\n${block(2, '00:00:04,000 --> 00:00:05,000', 'ب')}`;
  const cut = fail(`${good}\n3\n00:00:06,000\n`);
  assert.deepEqual([cut.code, cut.params.line], ['IM_STRAY_TEXT', 9], 'ناتج مبتور بعد رقم المقطع الأخير');
  const noArrow = fail(`${block(1, '00:00:01,000 -> 00:00:03,000', 'أ')}\n${block(2, '00:00:04,000 --> 00:00:05,000', 'ب')}`);
  assert.deepEqual([noArrow.code, noArrow.params.line], ['IM_STRAY_TEXT', 1], 'سهم مكسور في أول مقطع');
  const tail = fail(`${good}\n00:00:09,000 --> 00:00:10,000\nمقطع بلا رقم\n`);
  assert.equal(tail.code, 'IM_MISSING_NUMBER');
  const timeInChatter = fail(`Duration 00:20:30 in total\n\n${good}`);
  assert.deepEqual([timeInChatter.code, timeInChatter.params.line], ['IM_STRAY_TEXT', 1], 'سطر شرح يحوي زمنًا يُرفض بحذر');
  assert.equal(parseSrtLenient(`Sure, here it is:\n\n${good}\nEnjoy!\n`).cues.length, 2, 'الشرح العادي يُزال');
});

test('محارف تجاوز الاتجاه والعزل تُزال من النص بملاحظة، وتبقى LRM وRLM وALM وZWNJ وZWJ', () => {
  const r = parseSrtLenient(block(1, T1, 'a\u202Ebc\u202C \u2066x\u2069 \u200F\u061C\u200C\u200Dنص'));
  assert.equal(r.cues[0].text, 'abc x \u200F\u061C\u200C\u200Dنص');
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_CONTROL', { count: 1 })]);
  assert.match(r.notes[0], /تجاوز اتجاه/);
});

test('U+2028 وU+2029 فاصلا سطر مثل LF', () => {
  const r = parseSrtLenient(`1 ${T1} أ ب  ${block(2, '00:00:04,000 --> 00:00:05,000', 'ج')}`);
  assert.deepEqual(r.cues.map((c) => c.text), ['أ\nب', 'ج']);
});

test('حد رقم المقطع في المحلّل يطابق مدقق النموذج (500,000)', () => {
  const at = (n) => ({ n, startMs: 0, endMs: 1, text: 'x' });
  assert.deepEqual(validateCue(at(500000)), { ok: true });
  assert.equal(validateCue(at(500001)).ok, false);
  assert.equal(parseSrtLenient(block(500000, T1, 'x')).cues[0].n, 500000);
  const e = fail(block(500001, T1, 'x'));
  assert.equal(e.code, 'IM_BAD_NUMBER');
  assert.match(e.message, /500000/);
});
