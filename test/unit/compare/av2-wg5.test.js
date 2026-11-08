// التدقيق الموحد V2، WG-5: الرجوع المبكر في trackComparison يتبع لغة الخانة الحاضرة (U-025).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, trackComparison } from '../../../src/core/compare/index.js';
import { makeCues, fingerprint } from '../../helpers/fixtures.js';

const en = { key: 'en|manual', lang: 'en', kind: 'manual', cues: makeCues(3) };
const fp = fingerprint({ track: en, id: 'fp_test000091' });
const withText = (texts) => makeCues(3, { text: (i) => texts[i - 1] });
const trackOf = (original, stored, lang) => ({
  fileName: 'x.srt', importedAt: '2026-11-01T12:00:00.000Z', original, current: null, editedAt: null,
  fingerprintId: fp.id, comparison: stored, notes: [], ...(lang ? { lang } : {}),
});

test('AV2 U-025: ترجمة غير معدّلة مطابقة بنيويًا: من غير محددة إلى ar يظهر المقطع غير المترجم', () => {
  const original = withText(['مرحبًا', 'ترجمة', 'Still English']);
  const stored = compare(original, fp, { target: null });
  assert.deepEqual(stored.noArabic, []);
  const report = trackComparison(trackOf(original, stored, 'ar'), [fp]);
  assert.deepEqual(report.noArabic, [3]);
  assert.deepEqual(stored.noArabic, [], 'تقرير الاستيراد المخزّن لا يُمس');
  assert.ok(report.matched, 'المطابقة البنيوية باقية');
});

test('AV2 U-025: من ar إلى fr على نص فرنسي يفرغ noArabic، وتبقى النتيجة محفوظة في الذاكرة', () => {
  const original = withText(['Bonjour à tous', 'Merci', 'Au revoir']);
  const stored = compare(original, fp, { target: 'ar' });
  assert.deepEqual(stored.noArabic, [1, 2, 3]);
  const track = trackOf(original, stored, 'fr');
  const report = trackComparison(track, [fp]);
  assert.deepEqual(report.noArabic, []);
  assert.ok(trackComparison(track, [fp]) === report, 'محفوظ بمفتاح اللغة');
});

test('AV2 U-025: اتفاق الحاضر مع المخزّن يعيد المخزّن نفسه، وبلا لغة لا فحص', () => {
  const original = withText(['مرحبًا', 'ترجمة', 'نص']);
  const stored = compare(original, fp, { target: 'ar' });
  assert.ok(trackComparison(trackOf(original, stored, 'ar'), [fp]) === stored);
  const blank = withText(['مرحبًا', '   ', 'Still English']);
  const s2 = compare(blank, fp, { target: 'ar' });
  const r2 = trackComparison(trackOf(blank, s2), [fp]);
  assert.deepEqual([r2.empty, r2.noArabic], [[2], []]);
});
