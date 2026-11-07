// فحص «غير مترجم» بلغة الترجمة (AA1، حرية اللغات): حرف ليس من نص لغة الترجمة حين يختلف نصها عن نص لغة المسار، ولا فحص حين
// يتحد النصان أو لا تُعرف لغة الترجمة (لا تُفترض العربية)، والرموز والأرقام وحدها ليست ترجمة ناقصة. والحقل noArabic باسمه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, untranslatedTest } from '../../../src/core/compare/index.js';
import { trackComparison } from '../../../src/core/compare/current.js';
import { fingerprint, makeCues } from '../../helpers/fixtures.js';

const cues = (texts) => texts.map((text, i) => ({ n: i + 1, startMs: i * 1000, endMs: i * 1000 + 900, text }));

test('اليابانية هدفًا عن الإنجليزية: المقطع الباقي بالإنجليزية غير مترجم، والكانا والكانجي ترجمة، والرموز ليست نقصًا', () => {
  const t = untranslatedTest('ja', 'en');
  assert.equal(t('Hello there'), true);
  assert.equal(t('こんにちは'), false);
  assert.equal(t('漢字 OK'), false);
  assert.equal(t('♪ 123'), false);
});

test('لا فحص حين يتحد النصان (الإنجليزية ← الفرنسية) أو لا تُعرف لغة الترجمة', () => {
  assert.equal(untranslatedTest('fr', 'en'), null);
  assert.equal(untranslatedTest(null, 'en'), null);
  assert.equal(untranslatedTest('xx', 'en'), null);
  assert.ok(untranslatedTest('en', 'ja'), 'الإنجليزية عن اليابانية: نصان مختلفان');
  assert.equal(untranslatedTest('en', 'ja')('日本語'), true);
});

test('المقارن: لغة الترجمة تحكم noArabic، وبلا لغة لا فحص، والافتراضي العربية كما كان', () => {
  const list = cues(['مرحبًا', 'still English', 'こんにちは', '♪']);
  assert.deepEqual(compare(list, null).noArabic, [2, 3], 'الافتراضي العربية');
  assert.deepEqual(compare(list, null, { target: 'ar' }).noArabic, [2, 3]);
  assert.deepEqual(compare(list, null, { target: null }).noArabic, []);
  assert.deepEqual(compare(list, null, { target: 'ja' }).noArabic, [1, 2]);
});

test('لغة المسار من مفتاح البصمة: عربية ← إنجليزية لا تُعدّ الإنجليزية نقصًا، ونص المسار نفسه بلا فحص', () => {
  const arTrack = { key: 'ar|manual', lang: 'ar', kind: 'manual', cues: makeCues(3) };
  const fp = fingerprint({ track: arTrack, id: 'fp_test000077' });
  const list = cues(['Hello', 'مرحبًا', 'World']);
  assert.deepEqual(compare(list, fp, { target: 'en' }).noArabic, [2], 'العربي الباقي غير مترجم إلى الإنجليزية');
  assert.deepEqual(compare(list, fp, { target: 'fa' }).noArabic, [], 'الفارسية والعربية نص واحد: لا فحص');
});

test('المقارنة الحاضرة لترجمة بلا لغة (محفوظة قبل 2.0.0) لا تفحص «غير مترجم»، وبلغتها تفحص', () => {
  const en = { key: 'en|manual', lang: 'en', kind: 'manual', cues: makeCues(2) };
  const fp = fingerprint({ track: en, id: 'fp_test000078' });
  const original = cues(['still English', 'مرحبًا']);
  const track = { fileName: 'x.srt', importedAt: '2026-11-01T12:00:00.000Z', original, current: original.map((c) => ({ ...c })), editedAt: '2026-11-01T12:00:00.000Z', fingerprintId: fp.id, comparison: null, notes: [] };
  assert.deepEqual(trackComparison(track, [fp]).noArabic, []);
  assert.deepEqual(trackComparison({ ...track, current: original.map((c) => ({ ...c })), lang: 'ar' }, [fp]).noArabic, [1]);
});
