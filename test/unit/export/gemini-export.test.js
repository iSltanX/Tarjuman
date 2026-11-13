// تحقق Gemini، الجولة الثانية: ع-٧ جعل السطر الذي فيه محرف خفي وحده (RLM أو LRM أو ZWSP) فاصلًا عند الاستيراد كالسطر الفارغ.
// وترجمة حُفظت قبله قد تحمل هذا السطر وسط نص مقطع، فكان التصدير العربي يكتبه كما هو ثم تفشل إعادة قراءته (IM_STRAY_TEXT ←
// EX_INVARIANT_FAILED). التصدير يُسقطه من النص كما يُسقط ما فرغ بالتجريد، ويذكر المقطع في ملاحظة المحارف الخفية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArabicExport } from '../../../src/core/export/index.js';
import { readableText } from '../../../src/core/srt/lenient.js';
import { messageFor } from '../../../src/core/errors/index.js';

const VID = 'dQw4w9WgXcQ';
const cue = (n, text) => ({ n, startMs: n * 2000, endMs: n * 2000 + 1500, text });

test('ع-٧: سطر خفي وحده وسط نص مقطع محفوظ يُسقط من التصدير العربي بملاحظته، فيُقرأ الملف كما كُتب', () => {
  for (const code of [0x200f, 0x200e, 0x200b]) {
    const mark = String.fromCharCode(code);
    const name = `U+${code.toString(16).toUpperCase()}`;
    const r = buildArabicExport({ videoId: VID, cues: [cue(1, `سطر أول\n${mark}\nسطر ثانٍ`), cue(2, 'سليم')] });
    assert.ok(r.text.includes('سطر أول\nسطر ثانٍ\n'), name);
    assert.ok(!r.text.includes(mark), name);
    assert.deepEqual(r.notes, [messageFor('EX_NOTE_CONTROL_STRIPPED', { list: '1' })], name);
  }
});

test('ع-٧: readableText يُسقط السطر الخفي وحده ويبقي السطر الفارغ الخالص لفحص الفراغ، ولا يمس النص السليم', () => {
  assert.deepEqual(readableText('أ\n‏\nب'), { text: 'أ\nب', stripped: true });
  assert.deepEqual(readableText('أ\n ‏ \nب'), { text: 'أ\nب', stripped: true });
  assert.deepEqual(readableText('‏أ\nب'), { text: '‏أ\nب', stripped: false });
  assert.deepEqual(readableText('أ\n‏\n\nب'), { text: 'أ\n\nب', stripped: true });
  assert.deepEqual(readableText('أ\nب'), { text: 'أ\nب', stripped: false });
});
