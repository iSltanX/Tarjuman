// تعليمات النموذج (P3-AC4): بالعربية، وتطلب ترجمة النص فقط، وتحفظ الأرقام والتوقيتات حرفيًا، وتمنع الدمج
// والتقسيم، وتذكر عدد المقاطع والوضع.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '../../../src/core/export/index.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';

const ARABIC_LETTERS = /[؀-ۿ]/gu;

test('عربية، وتطلب ترجمة النص وحده، وتحفظ الأرقام والتوقيتات حرفيًا', () => {
  const t = instructions({ count: 427, mode: 'normal' });
  const arabic = t.match(ARABIC_LETTERS)?.length ?? 0;
  assert.ok(arabic > t.replace(/\s/g, '').length * 0.6, 'أغلب النص عربي');
  assert.match(t, /ترجم نص المقاطع وحده/);
  assert.match(t, /أرقام المقاطع وسطور التوقيت/);
  assert.match(t, /كما هي حرفيًا/);
  assert.match(t, /00:00:27,103 --> 00:00:29,678/, 'مثال على صيغة التوقيت');
  assert.match(t, /لا تدمج مقطعين/);
  assert.match(t, /لا تقسّم مقطعًا/);
  assert.match(t, /لا تحذف مقطعًا ولا تضف مقطعًا/);
  assert.match(t, /ملف SRT وحده، بلا شرح/);
  assert.deepEqual(findSecrets(t), []);
});

test('تذكر عدد المقاطع بصيغة العدّ العربية، وفي موضعين على الأقل', () => {
  const cases = [[1, 'مقطع واحد'], [2, 'مقطعان'], [3, '3 مقاطع'], [11, '11 مقطعًا'], [427, '427 مقطعًا'], [1056, '1056 مقطعًا'], [100, '100 مقطع']];
  for (const [n, words] of cases) {
    const t = instructions({ count: n, mode: 'normal' });
    assert.ok(t.includes(`عدد المقاطع في الملف: ${words}.`), `${n}: ${words}`);
    assert.ok(t.includes(`ناتجك ${words} بالترقيم نفسه`), `${n}: القاعدة الثالثة`);
  }
});

test('تذكر الوضع', () => {
  assert.match(instructions({ count: 10, mode: 'normal' }), /وضع الملف: عادي/);
  assert.match(instructions({ count: 10, mode: 'long' }), /وضع الملف: مقاطع أطول/);
  assert.notEqual(instructions({ count: 10, mode: 'normal' }), instructions({ count: 10, mode: 'long' }));
});

test('نص ثابت: المدخل نفسه يعطي النص نفسه حرفيًا', () => {
  assert.equal(instructions({ count: 427, mode: 'long' }), instructions({ count: 427, mode: 'long' }));
});

test('الأجزاء: الترقيم المستمر والنطاقات ولا إعادة ترقيم من 1', () => {
  const parts = [{ index: 1, from: 1, to: 134 }, { index: 2, from: 135, to: 268 }, { index: 3, from: 269, to: 401 }];
  const t = instructions({ count: 401, mode: 'normal', parts });
  assert.match(t, /عدد المقاطع الكلي: 401 مقطع، في 3 أجزاء\./);
  assert.match(t, /الجزء 1 \(المقاطع 1–134\)، الجزء 2 \(المقاطع 135–268\)، الجزء 3 \(المقاطع 269–401\)/);
  assert.match(t, /لا تبدأ الترقيم من 1 في الأجزاء اللاحقة/);
  assert.match(t, /مقاطع جزئه نفسها بالترقيم نفسه/);
  assert.equal(t.includes('ناتجك'), false, 'قاعدة الملف الكامل لا تظهر مع الأجزاء');
  assert.match(t, /لا تدمج مقطعين/);
  assert.equal(instructions({ count: 10, mode: 'normal', parts: null }).includes('الأجزاء'), false);
});

test('مدخلات غير صالحة ترمي RangeError', () => {
  assert.throws(() => instructions({ count: 0, mode: 'normal' }), RangeError);
  assert.throws(() => instructions({ count: 2.5, mode: 'normal' }), RangeError);
  assert.throws(() => instructions({ count: 5, mode: 'huge' }), RangeError);
});
