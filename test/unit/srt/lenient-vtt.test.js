// WebVTT في الاستيراد (تحقق 2.3.0، ص-١٤، بقرار سلطان): ما يصدّره ترجمان WebVTT يعود إليه بلا فساد. الملف بترويسة «WEBVTT» قبل أول
// مقطع يُقرأ WebVTT: كياناته تُفك (&amp; و&lt; و&gt; وغيرها)، والساعات في الزمن اختيارية، وإعدادات الموضع بعد الزمن تُهمل بملاحظة،
// وكتل NOTE وSTYLE وREGION تُزال بملاحظة، ووسوم WebVTT تُجرَّد كوسوم التنسيق، والعنوان «# » نص لا حدّ. والمقطع بلا رقم والزمن
// المعيب برسالة تخص WebVTT. وما ليس WebVTT كما كان: SRT فيه «&amp;» يبقى نصًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { TjError, messageFor } from '../../../src/core/errors/index.js';
import { buildSubtitleExport } from '../../../src/core/export/index.js';
import { readImport, withoutOriginalLines } from '../../../src/core/import/index.js';
import { fileOf } from '../../fixtures/srt/index.js';

const VIDEO = 'iG9CE55wbtY';
const cue = (n, startMs, endMs, text) => ({ n, startMs, endMs, text });
const fail = (text) => {
  try {
    parseSrtLenient(text);
  } catch (e) {
    assert.ok(e instanceof TjError, `خطأ غير متوقع: ${e}`);
    return e;
  }
  return assert.fail('كان يجب أن يُرفض');
};
const texts = (r) => r.cues.map((c) => c.text);
const EN = [cue(1, 1000, 3500, 'Tom & Jerry <3'), cue(2, 4000, 6500, '# not a heading'), cue(3, 7000, 9500, 'Line 3'), cue(4, 10000, 12500, 'Line 4')];
// نص يمر بكل تهريب: &، و< و>، ووسم تنسيق حرفي يعرضه ترجمان نصًا، وكيان حرفي، وسطر يبدأ بـ«# »، وسطر يشبه الزمن بلا رقم قبله.
const AR = [
  cue(1, 1000, 3500, 'نص فيه & وعلامة < و>'),
  cue(2, 4000, 6500, '<i>مائل</i> و&amp; حرفيًا و&lt;'),
  cue(3, 7000, 9500, 'سطر أول\n# وسم'),
  cue(4, 10000, 12500, 'الساعة 10:30 حتى 11:00'),
];

test('ص-١٤: ما يصدّره ترجمان WebVTT وحده يعود إليه بنصه وأزمنته ولغته، بلا ملاحظة «شرح قبل الملف»', async () => {
  const out = buildSubtitleExport({ videoId: VIDEO, cues: AR, lang: 'ar', format: 'vtt', bilingual: false });
  assert.equal(out.name, `${VIDEO}.ar.vtt`);
  assert.ok(out.text.includes('&amp;amp;') && out.text.includes('&lt;i&gt;'), 'التصدير مهرَّب');
  const r = await readImport(fileOf(out.text, out.name));
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(r.cues, AR);
  assert.equal(r.lang, 'ar');
  assert.deepEqual(r.notes, []);
  // الوسم الحرفي يبقى نصًا كما في ترجمان، والتحذير يقول ذلك.
  assert.deepEqual(r.warnings.map((w) => w.code), ['IM_HTML_LITERAL']);
});

test('ص-١٤: ملف ترجمان الثنائي WebVTT يُحكم ثنائيًا، و«أزل سطر الأصل» يعيد الترجمة نفسها ولغتها', async () => {
  const out = buildSubtitleExport({ videoId: VIDEO, cues: AR, lang: 'ar', format: 'vtt', bilingual: true, original: EN, sourceLang: 'en' });
  assert.equal(out.name, `${VIDEO}.ar.dual-en.vtt`);
  const track = { key: 'en|manual', lang: 'en', kind: 'manual', cues: EN };
  const r = await readImport(fileOf(out.text, out.name), { originals: [track] });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.deepEqual(texts(r), AR.map((c, i) => `${c.text}\n${EN[i].text}`), 'سطر الأصل بكياناته مفكوكة و«# » نصًا');
  assert.equal(r.bilingual?.count, 4);
  const stripped = withoutOriginalLines(r);
  assert.deepEqual(stripped.cues, AR);
  assert.equal(stripped.lang, 'ar');
});

test('ص-١٤: الكيانات تُفك في WebVTT وحده، والرقمية تمر بالتنقية، والمجهول يبقى نصًا', () => {
  const vtt = (body) => `WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\n${body}\n`;
  assert.equal(parseSrtLenient(vtt('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')).cues[0].text, 'a & b <c> "d" \'e\'');
  assert.equal(parseSrtLenient(vtt('&#1605;&#x631;&#X62D;&#x628;&#1575;')).cues[0].text, 'مرحبا');
  assert.equal(parseSrtLenient(vtt('a&nbsp;b &lrm;c&rlm;')).cues[0].text, `a${String.fromCodePoint(0xa0)}b ${String.fromCodePoint(0x200e)}c${String.fromCodePoint(0x200f)}`);
  // &amp; أولًا لا آخرًا: «&amp;lt;» نصه «&lt;».
  assert.equal(parseSrtLenient(vtt('&amp;lt;')).cues[0].text, '&lt;');
  // محرف يقلب العرض من كيان رقمي تزيله التنقية بملاحظتها، كما لو جاء حرفيًا.
  const rlo = parseSrtLenient(vtt('&#x202E;نص'));
  assert.equal(rlo.cues[0].text, 'نص');
  assert.deepEqual(rlo.notes, [messageFor('IM_NOTE_HIDDEN_CHARS', { count: 1 })]);
  // ما لا يُعرف من الكيانات، والرمز خارج المدى، يبقيان نصًا.
  assert.equal(parseSrtLenient(vtt('&copy; &#0; &#x110000; &amp')).cues[0].text, '&copy; &#0; &#x110000; &amp');
  // وفي SRT لا كيانات: «&amp;» نص كما كان.
  assert.equal(parseSrtLenient('1\n00:00:01,000 --> 00:00:02,000\nTom &amp; Jerry\n').cues[0].text, 'Tom &amp; Jerry');
});

test('ص-١٤: زمن WebVTT بلا ساعات يُقبل، وإعدادات الموضع تُهمل بملاحظة، والترويسة وأسطرها ليست شرحًا', () => {
  const r = parseSrtLenient('WEBVTT - عنوان\nKind: captions\nLanguage: ar\n\n1\n00:01.000 --> 00:03.500\nمرحبًا\n\n2\n00:00:04.000 --> 00:00:06.500 align:start position:10%\nثانٍ\n\n3\n01:02:03.004 --> 01:02:04,000 line:0\nثالث\n');
  assert.deepEqual(r.cues, [cue(1, 1000, 3500, 'مرحبًا'), cue(2, 4000, 6500, 'ثانٍ'), cue(3, 3723004, 3724000, 'ثالث')]);
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_VTT_SETTINGS', { count: 2 })]);
  // وفي SRT الساعات لازمة كما كانت.
  assert.equal(fail('1\n00:01,000 --> 00:03,500\nمرحبًا\n').code, 'IM_BAD_TIME');
});

test('ص-١٤: كتل NOTE وSTYLE وREGION تُزال بملاحظة قبل المقاطع وبينها وبعدها، ووسوم WebVTT تُجرَّد', () => {
  const r = parseSrtLenient([
    'WEBVTT', '', 'STYLE', '::cue { color: red }', '', 'REGION', 'id:fred', '', 'NOTE أُنشئ 2026-11-14 10:00:00', '',
    '1', '00:00:01.000 --> 00:00:02.000', '<v أحمد>مرحبًا</v> <c.yellow>بكم</c>', '',
    'NOTE', 'تعليق بين مقطعين', '1', '',
    '2', '00:00:03.000 --> 00:00:04.000', '<i>كلمة</i> <00:00:03.500>تالية <ruby>漢<rt>かん</rt></ruby>', '',
    'NOTE في الآخر', '',
  ].join('\n'));
  assert.deepEqual(texts(r), ['مرحبًا بكم', 'كلمة تالية 漢かん']);
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_TAGS', { count: 2 }), messageFor('IM_NOTE_VTT_BLOCKS', { count: 5 })]);
  assert.deepEqual(r.warnings, []);
});

test('ص-١٤: «# » في نص مقطع WebVTT نص لا عنوان، والسياج حول الملف يُزال كما في SRT، والشرح قبل الترويسة شرح', () => {
  const r = parseSrtLenient('هذا الملف:\n\n```vtt\nWEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\n# وسم\nنص\n\n2\n00:00:03.000 --> 00:00:04.000\n# آخر\n```\n');
  assert.deepEqual(texts(r), ['# وسم\nنص', '# آخر']);
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_FENCE'), messageFor('IM_NOTE_CHATTER_BEFORE', { count: 1, first: 'هذا الملف:' })]);
  // وفي SRT «# » حدّ كما كان (U38).
  assert.equal(fail('1\n00:00:01,000 --> 00:00:02,000\n# وسم\nنص\n\n2\n00:00:03,000 --> 00:00:04,000\nب\n').code, 'IM_STRAY_TEXT');
});

test('ص-١٤: مقطع WebVTT بلا رقم والزمن المعيب فيه برسالتين تخصّانه', () => {
  const none = fail('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nمرحبًا\n');
  assert.equal(none.code, 'IM_VTT_MISSING_NUMBER');
  assert.equal(none.params.line, 3);
  const named = fail('WEBVTT\n\nintro\n00:00:01.000 --> 00:00:02.000\nمرحبًا\n');
  assert.equal(named.code, 'IM_VTT_MISSING_NUMBER');
  assert.equal(named.params.line, 4);
  const bad = fail('WEBVTT\n\n1\n00:00:01 --> 00:00:02.000\nمرحبًا\n');
  assert.equal(bad.code, 'IM_VTT_BAD_TIME');
  assert.equal(bad.params.line, 4);
  assert.match(messageFor('IM_VTT_BAD_TIME', { line: 4 }), /WebVTT/);
  assert.match(messageFor('IM_VTT_MISSING_NUMBER', { line: 3 }), /WebVTT/);
});
