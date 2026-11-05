// تدقيق 7a66f91، C8 (U104، DS-T-05): محاكاة التخزين تقيس الحجم ببايتات UTF-8 كما يفعل Chrome (طول المفتاح والقيمة المسلسلة
// مرمّزين)، لا بوحدات UTF-16. كان العربي يُحسب نصف حجمه، فاختبارات الحصة تقبل ما يرفضه المتصفح.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryArea } from '../../helpers/chrome-storage.js';

test('البايتات لا الوحدات: المفتاح والقيمة المسلسلة بترميز UTF-8', async () => {
  const area = createMemoryArea();
  await area.set({ k: 'أ'.repeat(10), 'مفتاح': 'abc', e: '😀' });
  // k: ‏1 + ("" و20 بايتًا للعشرة) 22 = 23. «مفتاح» 10 بايتات + "abc" ‏5 = 15. e: ‏1 + ("" و4 بايتات) 6 = 7.
  assert.equal(await area.getBytesInUse(['k']), 23);
  assert.equal(await area.getBytesInUse(['مفتاح']), 15);
  assert.equal(await area.getBytesInUse(['e']), 7);
  assert.equal(await area.getBytesInUse(null), 45);
});

test('الحصة بالبايت: نص عربي فوقها يُرفض ولو كانت وحداته UTF-16 دونها', async () => {
  // 600 حرف عربي: 600 وحدة (602 بالمفتاح وعلامتي التنصيص) و1200 بايت. الحصة 1000.
  const area = createMemoryArea({ quotaBytes: 1000 });
  await assert.rejects(area.set({ k: 'ب'.repeat(600) }), /quota/i);
  assert.deepEqual(await area.get(null), {});
  await area.set({ k: 'ب'.repeat(490) }); // 1 + 2 + 980 = 983
  assert.equal(await area.getBytesInUse(null), 983);
});
