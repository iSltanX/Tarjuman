// تدقيق 7a66f91، المرحلة C5: المحلّل المتسامح وقراءة الملفات ورسائل الاستيراد. U35 (سطر نص يشبه الزمن داخل مقطع)، وU38
// (السياج والعنوان حدّان للمقطع، وتطبيع «٫» و«،» والأسهم، والإشارة السالبة، واسم الأجزاء بعد الدمج، وUTF-16 بلا BOM)،
// وU41 (عزل مثال الزمن في الرسائل). كل اختبار سلوكي هنا فشل على الشيفرة السابقة للسبب المقصود، إلا ما وُسم «حارس».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { readImport } from '../../../src/core/import/index.js';
import { readFileText } from '../../../src/core/import/read-file.js';
import { TjError, messageFor } from '../../../src/core/errors/index.js';
import { fileOf } from '../../fixtures/srt/index.js';

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
const T2 = '00:00:04,000 --> 00:00:06,000';
const T3 = '00:00:07,000 --> 00:00:09,000';
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const MINUS = String.fromCodePoint(0x2212);

// ---- U35: سطر نص يشبه الزمن داخل مقطع نصٌّ لا رأس ----

test('U35: «1 --> 2» و«١ --> ٢» و«10:30 --> 11:00» سطور نص داخل المقطع تُقبل كما هي، في الوسط والآخر', () => {
  for (const line of ['1 --> 2', '١ --> ٢', '10:30 --> 11:00 الاجتماع', '2020 --> 2025']) {
    const mid = parseSrtLenient(`${block(1, T1, `أ\n${line}`)}\n${block(2, T2, 'ب')}`);
    assert.deepEqual(mid.cues.map((c) => c.text), [`أ\n${line}`, 'ب'], line);
    assert.deepEqual(mid.notes, [], `${line}: لا ملاحظة، فالنص كما هو`);
    const first = parseSrtLenient(`${block(1, T1, line)}\n${block(2, T2, `ب\n${line}`)}`);
    assert.deepEqual(first.cues.map((c) => c.text), [line, `ب\n${line}`], `${line}: أول سطر نص وآخر مقطع`);
  }
});

test('U35 حارس: رأس معيب بعد سطر رقم، وسطر زمن خارج أي مقطع، وزمن كامل بلا رقم، تبقى أخطاء برقم السطر', () => {
  const bad = fail(`${block(1, T1, 'أ')}\n2\n00:00:04.5 --> 00:00:06,000\nب\n`);
  assert.equal(bad.code, 'IM_BAD_TIME');
  assert.equal(bad.params.line, 6);
  const glued = fail(`${block(1, T1, 'أ\n2\n0:00:04 --> 0:00:06')}`);
  assert.equal(glued.code, 'IM_BAD_TIME', 'رقم ثم سطر يشبه الزمن: رأس مقطع معيب لا نص');
  assert.equal(glued.params.line, 5);
  const stray = fail(`${block(1, T1, 'أ')}\n1 --> 2\n\n${block(2, T2, 'ب')}`);
  assert.equal(stray.code, 'IM_BAD_TIME', 'بعد سطر فارغ لا يُعدّ من نص المقطع');
  const missing = fail(`${block(1, T1, `أ\n${T2}`)}`);
  assert.equal(missing.code, 'IM_MISSING_NUMBER');
  assert.equal(missing.params.line, 4);
});

// ---- U38: السياج والعنوان حدّان لنص أي مقطع ----

test('U38: كتلتان مسيّجتان متلاصقتان، وسياج ختامي بعد مقطع وسطي: النص نظيف والملاحظة صادقة', () => {
  const glued = parseSrtLenient(`\`\`\`srt\n${block(1, T1, 'أ')}\`\`\`\n\`\`\`srt\n${block(2, T2, 'ب')}\`\`\`\n`);
  assert.deepEqual(glued.cues.map((c) => c.text), ['أ', 'ب']);
  assert.deepEqual(glued.notes, [messageFor('IM_NOTE_FENCE')]);
  const closing = parseSrtLenient(`\`\`\`\n${block(1, T1, 'أ')}\`\`\`\n${block(2, T2, 'ب')}`);
  assert.deepEqual(closing.cues.map((c) => c.text), ['أ', 'ب']);
  assert.deepEqual(closing.notes, [messageFor('IM_NOTE_FENCE')]);
  const spaced = parseSrtLenient(`\`\`\`srt\n${block(1, T1, 'أ')}\n\`\`\`\n\n\`\`\`srt\n${block(2, T2, 'ب')}\`\`\`\n`);
  assert.deepEqual(spaced.cues.map((c) => c.text), ['أ', 'ب'], 'السياج بين مقطعين بأسطر فارغة يُزال كذلك');
});

test('U38: عنوان ملاصق بين مقطعين خطأ برقم سطره كالمفصول بسطر فارغ، وبعد آخر مقطع يُزال بملاحظة', () => {
  const between = fail(`${block(1, T1, 'أ\n## الجزء الثاني')}${block(2, T2, 'ب')}`);
  assert.equal(between.code, 'IM_STRAY_TEXT');
  assert.equal(between.params.line, 4);
  const spaced = fail(`${block(1, T1, 'أ')}\n## الجزء الثاني\n\n${block(2, T2, 'ب')}`);
  assert.deepEqual([spaced.code, spaced.params.line], ['IM_STRAY_TEXT', 5], 'حارس: المفصول كما كان');
  const after = parseSrtLenient(`${block(1, T1, 'أ')}\n${block(2, T2, 'ب\n## ملاحظات')}المقطع 2 غامض.\n`);
  assert.deepEqual(after.cues.map((c) => c.text), ['أ', 'ب']);
  assert.deepEqual(after.notes, [messageFor('IM_NOTE_CHATTER_AFTER', { count: 2, first: '## ملاحظات' })]);
});

test('U38 حارس: «#ترجمان» بلا مسافة نص، وعنوان قبل أول رقم يُزال بملاحظة', () => {
  const tag = parseSrtLenient(block(1, T1, 'أ\n#ترجمان'));
  assert.equal(tag.cues[0].text, 'أ\n#ترجمان');
  const before = parseSrtLenient(`# الترجمة\n${block(1, T1, 'أ')}`);
  assert.equal(before.cues[0].text, 'أ');
  assert.deepEqual(before.notes, [messageFor('IM_NOTE_CHATTER_BEFORE', { count: 1, first: '# الترجمة' })]);
});

// ---- U38: «٫» و«،» والأسهم في سطور الزمن، والإشارة السالبة ----

test('U38: الفاصلة العربية «٫» و«،» بأرقام لاتينية أو هندية تُطبَّع في سطر الزمن بملاحظة، والأزمنة كما هي', () => {
  for (const time of ['00:00:01٫000 --> 00:00:03٫000', '00:00:01،000 --> 00:00:03،000', '٠٠:٠٠:٠١٫٠٠٠ --> ٠٠:٠٠:٠٣٫٠٠٠']) {
    const r = parseSrtLenient(`${block(1, time, 'أ')}\n${block(2, T2, 'ب')}`);
    assert.deepEqual(r.cues.map((c) => [c.startMs, c.endMs]), [[1000, 3000], [4000, 6000]], time);
    assert.ok(r.notes.includes(messageFor('IM_NOTE_TIME_MARKS', { count: 1 })), `${time}: ${r.notes}`);
  }
});

test('U38: الأسهم «→» و«->» و«—>» تُطبَّع إلى «-->» بملاحظة بدل IM_NO_TIMING المضللة', () => {
  for (const arrow of ['→', '->', '—>']) {
    const r = parseSrtLenient(`${block(1, `00:00:01,000 ${arrow} 00:00:03,000`, 'أ')}\n${block(2, `00:00:04,000 ${arrow} 00:00:06,000`, 'ب')}`);
    assert.deepEqual(r.cues.map((c) => [c.n, c.startMs, c.endMs, c.text]), [[1, 1000, 3000, 'أ'], [2, 4000, 6000, 'ب']], arrow);
    assert.ok(r.notes.includes(messageFor('IM_NOTE_TIME_MARKS', { count: 2 })), `${arrow}: ${r.notes}`);
  }
});

test('U38 حارس: سهم في سطر نثر قبل الملف يبقى شرحًا يُزال، لا نص مقطع ولا خطأ', () => {
  const r = parseSrtLenient(`الترجمة → العربية\n${block(1, T1, 'أ')}`);
  assert.equal(r.cues[0].text, 'أ');
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_CHATTER_BEFORE', { count: 1, first: 'الترجمة → العربية' })]);
});

test('U38: زمن سالب (بالشرطة أو U+2212) في أول مقطع أو ما بعده: IM_BAD_TIME على سطر الزمن', () => {
  for (const sign of ['-', MINUS]) {
    const only = fail(block(1, `${sign}00:00:01,000 --> 00:00:03,000`, 'أ'));
    assert.deepEqual([only.code, only.params.line], ['IM_BAD_TIME', 2], `مقطع وحيد ${sign}`);
    const second = fail(`${block(1, T1, 'أ')}\n${block(2, `${sign}00:00:04,000 --> 00:00:06,000`, 'ب')}\n${block(3, T3, 'ج')}`);
    assert.deepEqual([second.code, second.params.line], ['IM_BAD_TIME', 6], `الثاني من ثلاثة ${sign}`);
  }
});

// ---- U38: اسم الأجزاء بعد الدمج، وUTF-16 بلا BOM ----

test('U38: دمج جزأين بنمط أسماء ترجمان يعطي اسمًا بلا «of02»', async () => {
  const one = fileOf(block(1, T1, 'أ'), 'iG9CE55wbtY.en.manual.normal.part01of02.ar.srt');
  const two = fileOf(block(2, T2, 'ب'), 'iG9CE55wbtY.en.manual.normal.part02of02.ar.srt');
  const r = await readImport([one, two]);
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.fileName, 'iG9CE55wbtY.en.manual.normal.ar.srt');
  const tail = await readImport([fileOf(block(1, T1, 'أ'), 'x.ar.manual.normal.part01of02.srt'), fileOf(block(2, T2, 'ب'), 'x.ar.manual.normal.part02of02.srt')]);
  assert.equal(tail.fileName, 'x.ar.manual.normal.srt');
  const plain = await readImport([fileOf(block(1, T1, 'أ'), 'translation_part1.srt'), fileOf(block(2, T2, 'ب'), 'translation_part2.srt')]);
  assert.equal(plain.fileName, 'translation.srt', 'حارس: النمط القديم كما هو');
});

test('U38: UTF-16LE وUTF-16BE بلا BOM، بعربي أو بلاتيني وحده: IM_NOT_UTF8 لا «بيانات ثنائية»', async () => {
  for (const text of ['1\n00:00:01,000 --> 00:00:02,000\nمرحبًا\n', '1\n00:00:01,000 --> 00:00:02,000\nHello\n']) {
    const le = Buffer.from(text, 'utf16le');
    const be = Buffer.from(le).swap16();
    for (const [label, bytes] of [['le', le], ['be', be]]) {
      await assert.rejects(readFileText(fileOf(bytes)), (e) => e instanceof TjError && e.code === 'IM_NOT_UTF8', `${label}: ${text.slice(-7)}`);
    }
  }
  const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x3e, 0x00]);
  await assert.rejects(readFileText(fileOf(elf)), (e) => e.code === 'IM_NOT_TEXT', 'حارس: الثنائي كما كان');
});

// ---- U41: مثال الزمن معزول الاتجاه في الرسائل ----

test('U41: مثال 00:00:01,000 --> 00:00:03,500 معزول LTR في IM_NO_CUES وIM_NO_TIMING وIM_BAD_TIME', () => {
  const example = `${LRI}00:00:01,000 --> 00:00:03,500${PDI}`;
  for (const code of ['IM_NO_CUES', 'IM_NO_TIMING', 'IM_BAD_TIME']) {
    const msg = messageFor(code, { line: 3 });
    assert.ok(msg.includes(example), `${code}: ${msg}`);
    assert.equal(msg.split('-->').length, 2, `${code}: مثال واحد`);
  }
});

// ---- ملاحظتا المراجعة المستقلة: التطبيع لسطور الزمن وحدها ----

test('مراجعة حارس: «10 -> 20» و«5 → 6» بعد سطر رقمي في نص مقطع نص، و«1 → 2» قبل الملف شرح، و«-5 --> 3» بين مقطعين نص ضائع كما كان', () => {
  const r = parseSrtLenient(`${block(1, T1, '2020\n10 -> 20')}\n${block(2, T2, '7\n5 → 6')}`);
  assert.deepEqual(r.cues.map((c) => c.text), ['2020\n10 -> 20', '7\n5 → 6']);
  assert.deepEqual(r.notes, []);
  const before = parseSrtLenient(`1 → 2\n${block(1, T1, 'أ')}`);
  assert.deepEqual(before.notes, [messageFor('IM_NOTE_CHATTER_BEFORE', { count: 1, first: '1 → 2' })]);
  const stray = fail(`${block(1, T1, 'أ')}\n-5 --> 3\n\n${block(2, T2, 'ب')}`);
  assert.deepEqual([stray.code, stray.params.line], ['IM_STRAY_TEXT', 5]);
});
