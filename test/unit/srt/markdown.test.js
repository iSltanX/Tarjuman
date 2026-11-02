// ملفات Markdown وTXT (P11-AC3، R48): تُزال الأغلفة المحددة الواضحة وحدها بملاحظات (الأسوار والتأكيد حول سطر الرقم أو الزمن
// والعناوين والفقرات قبل الملف وبعده)، وما داخل النص يبقى حرفيًا لا يُفسَّر؛ والنص بلا توقيت يُرفض برسالة تقول ما ينقص.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TjError, messageFor } from '../../../src/core/errors/index.js';
import { readImport } from '../../../src/core/import/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { fileOf } from '../../fixtures/srt/index.js';
import { readV2 } from '../../fixtures/v2/index.js';

const fail = (text) => {
  try {
    parseSrtLenient(text);
  } catch (e) {
    assert.ok(e instanceof TjError);
    return e;
  }
  return assert.fail('كان يجب أن يُرفض');
};

test('الأغلفة الواضحة تُزال بملاحظات: العنوان والفقرة قبل الملف، وسياج ~~~، وتأكيد الأرقام والأزمنة، والعناوين بعده', () => {
  const r = parseSrtLenient(readV2('wrapped.ar.md'));
  assert.deepEqual(r.cues.map((c) => [c.n, c.startMs, c.endMs]), [[1, 1000, 3000], [2, 3500, 5500], [3, 6000, 8000]]);
  assert.equal(r.cues[1].text, 'اليوم أريد أن أشارككم **قصة** قصيرة.', 'التأكيد داخل النص يبقى');
  assert.deepEqual(r.notes, [
    messageFor('IM_NOTE_FENCE'),
    messageFor('IM_NOTE_CHATTER_BEFORE', { count: 2, first: '# الترجمة العربية' }),
    messageFor('IM_NOTE_CHATTER_AFTER', { count: 2, first: '## ملاحظات' }),
    messageFor('IM_NOTE_MD_EMPHASIS', { count: 6 }),
  ]);
});

test('حقن Markdown: الوسوم والروابط والصور والكيانات تبقى نصًا حرفيًا (عدا وسوم التنسيق المعروفة)، ولا يُفسَّر شيء', () => {
  const r = parseSrtLenient(readV2('injection.ar.md'));
  assert.equal(r.cues.length, 3);
  assert.equal(r.cues[0].text, '<script>alert(1)</script> مرحبًا');
  assert.equal(r.cues[1].text, '[اضغط هنا](javascript:alert(1)) و![صورة](data:image/png;base64,AAAA)');
  assert.equal(r.cues[2].text, '<img src=x onerror=alert(1)> **غامق** و`شيفرة` و&lt;b&gt;');
  assert.deepEqual(r.notes, [messageFor('IM_NOTE_FENCE')]);
  assert.deepEqual(r.warnings.map((w) => w.code), ['IM_HTML_LITERAL']);
});

test('عنوان بين مقطعين ليس غلافًا: خطأ برقم السطر لا حذف صامت؛ وتأكيد رقم وحده قبل الملف خطأ لا شرح', () => {
  const e = fail(readV2('heading-between.ar.md'));
  assert.deepEqual([e.code, e.params.line], ['IM_STRAY_TEXT', 5]);
  const stray = fail('**12**\n\n1\n00:00:01,000 --> 00:00:02,000\nأ\n');
  assert.deepEqual([stray.code, stray.params.line], ['IM_STRAY_TEXT', 1]);
});

test('النص بلا توقيت يُرفض برسالة تقول ما ينقص ولا تُخترع أزمنة: أرقام بلا سطور زمن، أو نثر بلا مقاطع', () => {
  const numbered = fail(readV2('untimed-numbered.ar.txt'));
  assert.equal(numbered.code, 'IM_NO_TIMING');
  assert.match(numbered.message, /بلا سطور توقيت/);
  assert.match(numbered.message, /لا يخترع أزمنة/);
  const prose = fail(readV2('untimed-prose.ar.txt'));
  assert.equal(prose.code, 'IM_NO_CUES');
  assert.match(prose.message, /لا يخترع أزمنة/);
});

test('ملف TXT بمحتوى SRT يُقبل كما هو، وMarkdown عبر readImport بملاحظاته في النتيجة والتقرير', async () => {
  const txt = await readImport(fileOf(readV2('plain-srt.ar.txt'), 'translation.ar.txt'));
  assert.equal(txt.ok, true);
  assert.equal(txt.cues.length, 2);
  assert.deepEqual(txt.notes, []);
  const md = await readImport(fileOf(readV2('wrapped.ar.md'), 'translation.ar.md'));
  assert.equal(md.ok, true);
  assert.equal(md.notes.length, 4);
  assert.deepEqual(md.comparison.notes, md.notes);
  const none = await readImport(fileOf(readV2('untimed-numbered.ar.txt'), 'x.txt'));
  assert.deepEqual([none.ok, none.error.code], [false, 'IM_NO_TIMING']);
});
