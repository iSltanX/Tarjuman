// تدقيق 7a66f91، المرحلة C4 (U82): تنظيف العنوان في التعليمات يجرّد المحارف الخفية الباقية انتقائيًا، لا \p{Cf} كله،
// فتبقى العلامات العربية المرئية. المحارف تُبنى بأرقامها (لا محارف خفية حرفية في المصدر).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle } from '../../../src/core/export/instructions.js';

const ch = (...cps) => String.fromCodePoint(...cps);

test('U82: المحارف الخفية التي بقيت (تنسيق الهيروغليفية والاختزال ومحدد التنويع المنغولي والفراغ البرايلي ومحرف الكائن وغير المعيّنة) تُجرَّد', () => {
  const hidden = [0x13430, 0x13438, 0x1343f, 0x1bca0, 0x1bca3, 0x180f, 0x2800, 0xfffc, 0xfff0, 0xfff8, 0xe0080, 0xe00ff, 0xe01f0, 0xe0fff];
  for (const cp of hidden) {
    assert.equal(cleanTitle(`A${ch(cp)}B`), 'AB', cp.toString(16));
  }
  assert.equal(cleanTitle(ch(0x2800, 0x2800, 0xfffc)), 'غير متوفر', 'عنوان من محارف خفية وحدها');
});

test('U82: العلامات العربية المرئية من فئة Cf تبقى، وكذلك أنماط برايل المرئية', () => {
  const visible = [0x0600, 0x0601, 0x0605, 0x06dd, 0x070f, 0x0890, 0x08e2, 0x2801, 0x28ff];
  for (const cp of visible) {
    assert.equal(cleanTitle(`A${ch(cp)}B`), `A${ch(cp)}B`, cp.toString(16));
  }
  assert.equal(cleanTitle(`سورة ${ch(0x06dd)}١`), `سورة ${ch(0x06dd)}١`);
});
