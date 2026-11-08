// التدقيق الموحد V2، WG-5: ملخص المقارنة في المحفوظات يذكر الفارغ وغير المترجم ولو طابق البنية (U-027)،
// وملخص الحذف يذكر زوج اللغات (U-019).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonSummary, deleteSummary } from '../../../../src/pages/library/model.js';
import { sampleBundle } from '../../../helpers/fixtures-v2.js';

const report = (over = {}) => ({
  fingerprintId: 'fp_test000001', matched: true, countSource: 5, countTarget: 5, numbering: 'same',
  missing: [], extra: [], drift: [], empty: [], noArabic: [], restoreTimingAvailable: true, driftThresholdMs: 100, notes: [], ...over,
});

test('AV2 U-027: مطابق بنيويًا مع فارغ وغير مترجم: نبرة تحذير بسطرين بعد «مطابق للأصل»', () => {
  const s = comparisonSummary(report({ empty: [2], noArabic: [1] }));
  assert.equal(s.tone, 'warning');
  assert.deepEqual(s.lines, ['مطابق للأصل', 'مقطع واحد فارغ (لم يترجمها النموذج): 2', 'مقطع واحد بلا ترجمة: 1']);
});

test('AV2 U-027: الملف النظيف يبقى «مطابق للأصل» بنبرة نجاح، وغير المطابق يذكر غير المترجم', () => {
  assert.deepEqual(comparisonSummary(report()), { tone: 'success', lines: ['مطابق للأصل'] });
  const s = comparisonSummary(report({ matched: false, countTarget: 4, missing: [5], noArabic: [1, 3] }));
  assert.equal(s.tone, 'warning');
  assert.deepEqual(s.lines, ['عدد المقاطع: 4 من 5', 'مقطع واحد ناقص: 5', 'مقطعان بلا ترجمة: 1، 3']);
});

test('AV2 U-019: ملخص حذف بيانات الفيديو يذكر زوج اللغات حين يكون له زوج، وحذف ترجمة يُبقيه', () => {
  const b = sampleBundle({ videoId: 'AAAAAAAAAAA' });
  assert.ok(!deleteSummary(b, { scope: 'all' }).items.some((t) => t.includes('زوج')), 'بلا زوج: لا بند');
  const all = deleteSummary(b, { scope: 'all' }, { pair: true });
  assert.equal(all.items.at(-1), 'زوج لغات هذا الفيديو المحفوظ');
  const slot = deleteSummary(b, { scope: 'slot', n: 1 }, { pair: true });
  assert.ok(!slot.items.some((t) => t.includes('زوج')));
  assert.ok(slot.keeps.includes('زوج لغات الفيديو يبقى'));
  assert.ok(!deleteSummary(b, { scope: 'slot', n: 1 }).keeps.some((t) => t.includes('زوج')));
});
