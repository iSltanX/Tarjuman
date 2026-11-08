// سياسة تحديد لغة الواجهة: الرموز الإقليمية، وأولوية المصادر، واللغة الأخرى، وتعذّر القراءة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCALE, baseLanguage, localeDir, resolveInitialLocale, supportedLocale } from '../../../src/i18n/locale.js';

test('الرموز الإقليمية تُطبَّع إلى لغتها', () => {
  for (const [tag, want] of [['ar', 'ar'], ['ar-SA', 'ar'], ['ar_EG', 'ar'], ['AR-sa', 'ar'], ['en', 'en'], ['en-US', 'en'], ['en_GB', 'en'], ['EN-gb', 'en']]) {
    assert.equal(supportedLocale(tag), want, tag);
  }
  assert.equal(baseLanguage('pt-BR'), 'pt');
  assert.equal(supportedLocale('pt-BR'), null);
});

test('القيم التي ليست رموزًا لا تُقرأ لغة', () => {
  for (const v of [null, undefined, '', '   ', 7, {}, 'ar SA', '<script>', 'x', 'ar-', `ar-${'a'.repeat(40)}`]) {
    assert.equal(baseLanguage(v), null, String(v));
    assert.equal(supportedLocale(v), null, String(v));
  }
});

test('التهيئة الأولى: يوتيوب أولًا، بالعربية والإنجليزية ورموزهما الإقليمية', () => {
  assert.deepEqual(resolveInitialLocale({ youtube: 'ar', browser: 'en-US' }), { locale: 'ar', source: 'youtube' });
  assert.deepEqual(resolveInitialLocale({ youtube: 'ar-SA', browser: 'en-US' }), { locale: 'ar', source: 'youtube' });
  assert.deepEqual(resolveInitialLocale({ youtube: 'en-GB', browser: 'ar' }), { locale: 'en', source: 'youtube' });
});

test('تعذّر قراءة لغة يوتيوب (خارج يوتيوب): لغة المتصفح', () => {
  assert.deepEqual(resolveInitialLocale({ youtube: null, browser: 'ar-EG' }), { locale: 'ar', source: 'browser' });
  assert.deepEqual(resolveInitialLocale({ browser: 'en-AU' }), { locale: 'en', source: 'browser' });
  assert.deepEqual(resolveInitialLocale({ youtube: '', browser: 'ar' }), { locale: 'ar', source: 'browser' });
});

test('لغة أخرى: الافتراضية، وأول مصدر مقروء يحسم فلا يُرجع إلى ما بعده', () => {
  assert.equal(DEFAULT_LOCALE, 'en');
  assert.deepEqual(resolveInitialLocale({ youtube: 'fr', browser: 'ar' }), { locale: 'en', source: 'default' });
  assert.deepEqual(resolveInitialLocale({ youtube: null, browser: 'tr-TR' }), { locale: 'en', source: 'default' });
});

test('تعذّر قراءة كل المصادر: الافتراضية', () => {
  assert.deepEqual(resolveInitialLocale({}), { locale: 'en', source: 'default' });
  assert.deepEqual(resolveInitialLocale(), { locale: 'en', source: 'default' });
  assert.deepEqual(resolveInitialLocale({ youtube: 'not a tag', browser: 12 }), { locale: 'en', source: 'default' });
});

test('الاتجاه', () => {
  assert.equal(localeDir('ar'), 'rtl');
  assert.equal(localeDir('en'), 'ltr');
});
