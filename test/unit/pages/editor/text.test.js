// نصوص المحرّر: النطاق ظاهر قبل الفعل وبعده (P8-AC2)، والعدّ بالعربية بمطابقة الصفة، والمقارنة سطورًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  comparisonLines, durationText, errorsToFix, issuesSummary, numberList, offsetLine, offsetNotice, restoreUnavailable,
  saveStatus, scopeOption, scopeTarget, seconds, shiftSentence, unsavedSentence,
} from '../../../../src/pages/editor/text.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { comparison } from '../../../helpers/fixtures.js';

test('الثواني والمدة: خانة عشرية على الأقل، ولا أصفار زائدة', () => {
  assert.deepEqual([500, 1000, 1250, 100, 1, -2500].map(seconds), ['0.5', '1.0', '1.25', '0.1', '0.001', '2.5']);
  assert.equal(durationText(2675), '2.7');
});

test('النطاق: تسمية الخيار تتغير مع التحديد، وموضوع الجملة بالعدد العربي', () => {
  assert.equal(scopeOption('cue', { activeN: 57 }), 'المقطع 57');
  assert.equal(scopeOption('cue'), 'المقطع');
  assert.equal(scopeOption('selection', { selected: 3 }), 'المحددة (3)');
  assert.equal(scopeOption('all'), 'الملف كله');
  assert.equal(scopeTarget('cue', { activeN: 57, total: 9 }), 'المقطع 57');
  assert.equal(scopeTarget('selection', { selected: 1, total: 9 }), 'المقطع المحدد');
  assert.equal(scopeTarget('selection', { selected: 2, total: 9 }), 'مقطعان');
  assert.equal(scopeTarget('selection', { selected: 3, total: 9 }), '3 مقاطع');
  assert.equal(scopeTarget('all', { total: 2140 }), 'الملف كله (2140 مقطعًا)');
});

test('سطر ما قبل التطبيق وما بعده (§١١.٢): «سيُؤخَّر 3 مقاطع 0.5 ث»', () => {
  assert.equal(shiftSentence('3 مقاطع', 500, 'before'), 'سيُؤخَّر 3 مقاطع 0.5 ث (تظهر لاحقًا).');
  assert.equal(shiftSentence('المقطع 57', -1000, 'before'), 'سيُقدَّم المقطع 57 1.0 ث (تظهر أبكر).');
  assert.equal(shiftSentence('3 مقاطع', 500, 'after'), 'أُخِّر 3 مقاطع 0.5 ث.');
  assert.equal(shiftSentence('الملف كله (5 مقاطع)', -250, 'after'), 'قُدِّم الملف كله (5 مقاطع) 0.25 ث.');
});

test('الإزاحة: سطر ثابت منفصل، وتنبيه قبل نقل الملف كله', () => {
  assert.equal(offsetLine(500), 'إزاحة العرض أثناء المشاهدة: +0.5 ث — منفصلة عن التوقيت المحفوظ');
  assert.equal(offsetNotice(500), 'إزاحة العرض +0.5 ث مفعّلة؛ النقل هنا يُضاف إليها.');
  assert.equal(offsetNotice(-1000), 'إزاحة العرض −1.0 ث مفعّلة؛ النقل هنا يُضاف إليها.');
});

test('العدّ: الأخطاء والتحذيرات والتغييرات بمطابقة الصفة', () => {
  assert.equal(issuesSummary({ errors: 3, warnings: 5 }), '3 أخطاء · 5 تحذيرات');
  assert.equal(issuesSummary({ errors: 1, warnings: 0 }), 'خطأ واحد');
  assert.equal(issuesSummary({ errors: 0, warnings: 2 }), 'تحذيران');
  assert.equal(issuesSummary({ errors: 0, warnings: 0 }), 'لا مشكلات');
  assert.equal(messageFor('ED_SAVE_HAS_ERRORS', { count: errorsToFix(3) }), 'صحّح 3 أخطاء توقيت أولًا.');
  assert.equal(errorsToFix(1), 'خطأ التوقيت');
  assert.equal(errorsToFix(2), 'خطأي التوقيت');
  assert.equal(errorsToFix(11), '11 خطأ توقيت');
  assert.equal(unsavedSentence(12), 'لديك 12 تغييرًا غير محفوظ');
  assert.equal(unsavedSentence(1), 'لديك تغيير واحد غير محفوظ');
  assert.equal(unsavedSentence(2), 'لديك تغييران غير محفوظين');
  assert.equal(unsavedSentence(3), 'لديك 3 تغييرات غير محفوظة');
  assert.equal(unsavedSentence(100), 'لديك 100 تغيير غير محفوظ');
  assert.equal(saveStatus(12, true), 'تغييرات غير محفوظة (12)');
  assert.equal(saveStatus(0, false), 'محفوظ ✓');
});

test('المقارنة: مطابق، وناقص بأرقامه، وانحراف، وبلا بصمة؛ وسبب منع الاستعادة', () => {
  assert.deepEqual(comparisonLines(comparison()).map((l) => l.text), ['مطابق للأصل ✓', 'العدد: 5 من 5']);
  assert.deepEqual(comparisonLines(null), [{ tone: 'info', text: 'لا بصمة للمقارنة؛ عُرض الملف كما هو.' }]);
  const r = { ...comparison(), matched: false, countTarget: 3, missing: [57, 58, 201], drift: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, startDeltaMs: 300, endDeltaMs: 0 })), restoreTimingAvailable: false };
  const texts = comparisonLines(r).map((l) => l.text);
  assert.ok(texts.includes('3 مقاطع ناقصة: 57، 58، 201'), texts.join(' | '));
  assert.ok(texts.includes('توقيت مختلف في 12 مقطعًا'));
  assert.equal(comparisonLines({ ...r, missing: [4, 5] }).map((l) => l.text).find((t) => t.includes('ناقص')), 'مقطعان ناقصان: 4، 5');
  assert.equal(restoreUnavailable(r), 'العدد مختلف (3 مقابل 5)، فلا يمكن مطابقة التوقيت بأمان.');
  assert.equal(restoreUnavailable(comparison()), null);
  assert.equal(restoreUnavailable({ ...comparison(), numbering: 'different', restoreTimingAvailable: false }), 'الترقيم مختلف عن الأصل، فلا يمكن مطابقة التوقيت بأمان.');
  assert.equal(numberList([1, 2, 3, 4, 5, 6, 7, 8, 9]), '1، 2، 3، 4، 5، 6، 7، 8…');
});
