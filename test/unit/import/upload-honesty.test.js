// أمانة تقرير الرفع (F-03): ملاحظة واحدة بعدد الأسطر التي قُصّت مسافات أطرافها، وتحذير لكل مقطع نهايته ليست بعد بدايته.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { readImport } from '../../../src/core/import/index.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { getLocale, setLocale } from '../../../src/i18n/index.js';
import { fileOf } from '../../fixtures/srt/index.js';

const cueBlock = (n, time, text) => `${n}\n${time}\n${text}\n`;
const OK_TIME = '00:00:01,000 --> 00:00:03,000';
const trimmedNote = (count) => messageFor('IM_NOTE_TRIMMED', { count });

test('قص مسافات الأطراف: ملاحظة واحدة بعدد الأسطر', () => {
  const r = parseSrtLenient(`${cueBlock(1, OK_TIME, '  أول  \n\tثانٍ\nثالث')}\n${cueBlock(2, '00:00:04,000 --> 00:00:05,000', 'رابع ')}`);
  assert.deepEqual(r.cues.map((c) => c.text), ['أول\nثانٍ\nثالث', 'رابع']);
  assert.deepEqual(r.notes, [trimmedNote(3)]);
});

test('بلا مسافات أطراف: لا ملاحظة', () => {
  const r = parseSrtLenient(cueBlock(1, OK_TIME, 'نص فيه  مسافتان في وسطه'));
  assert.deepEqual(r.notes, []);
  assert.equal(r.cues[0].text, 'نص فيه  مسافتان في وسطه');
});

test('نهاية قبل البداية: تحذير برقم المقطع وسطره، والتوقيت لا يُعدَّل', () => {
  const r = parseSrtLenient(`${cueBlock(7, '00:00:05,000 --> 00:00:02,000', 'أ')}\n${cueBlock(8, '00:00:06,000 --> 00:00:07,000', 'ب')}`);
  assert.deepEqual(r.warnings, [
    { code: 'IM_CUE_TIME_NOT_AFTER_START', params: { n: 7, line: 2 } },
  ]);
  assert.deepEqual([r.cues[0].startMs, r.cues[0].endMs], [5000, 2000]);
});

test('نهاية تساوي البداية: تحذير كذلك، وتحذير لكل مقطع', () => {
  const r = parseSrtLenient(`${cueBlock(1, '00:00:05,000 --> 00:00:05,000', 'أ')}\n${cueBlock(2, '00:00:09,000 --> 00:00:08,000', 'ب')}\n${cueBlock(3, '00:00:10,000 --> 00:00:11,000', 'ج')}`);
  assert.deepEqual(r.warnings, [
    { code: 'IM_CUE_TIME_NOT_AFTER_START', params: { n: 1, line: 2 } },
    { code: 'IM_CUE_TIME_NOT_AFTER_START', params: { n: 2, line: 6 } },
  ]);
});

test('تقرير الرفع يعرض التحذير برسالة كاملة بالعربية والإنجليزية', async () => {
  const r = await readImport(fileOf(cueBlock(1, '00:00:05,000 --> 00:00:02,000', 'أ'), 'iG9CE55wbtY.ar.srt'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, [{ code: 'IM_CUE_TIME_NOT_AFTER_START', params: { n: 1, line: 2 } }]);
  const before = getLocale();
  try {
    for (const locale of ['ar', 'en']) {
      setLocale(locale);
      const text = messageFor(r.warnings[0].code, r.warnings[0].params);
      assert.ok(!text.includes('{') && text.length > 10, `${locale}: ${text}`);
      assert.ok(!trimmedNote(2).includes('{'), locale);
    }
  } finally {
    setLocale(before);
  }
});

test('ملف مليء بالأزمنة المعكوسة: أول عشرين صفًا ثم تحذير جامع بالبقية، فلا يبني التقرير آلاف الصفوف', async () => {
  const text = Array.from({ length: 25 }, (_, i) => cueBlock(i + 1, '00:00:05,000 --> 00:00:02,000', `مقطع ${i + 1}`)).join('\n');
  const parsed = parseSrtLenient(text);
  assert.equal(parsed.warnings.length, 25, 'المحلّل يحذّر لكل مقطع');
  const r = await readImport(fileOf(text, 'iG9CE55wbtY.ar.srt'));
  assert.equal(r.warnings.length, 21);
  assert.equal(r.warnings[19].params.n, 20);
  assert.deepEqual(r.warnings[20], { code: 'IM_CUE_TIME_MORE', params: { count: 5 } });
});
