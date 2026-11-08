// نواة التوطين: القوالب والصيغ والوجه الديناميكي والنص الكسول وسلوك الاسترجاع وتغطية الفهرسين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LazyText, catalogOf, getDir, getLocale, joinList, lt, missingKeys, onLocaleChange, setLocale, t, texts } from '../../../src/i18n/index.js';
import { formatCount, COUNT_FORMS, formatBytes } from '../../../src/ui/format.js';
import { TjError, messageFor } from '../../../src/core/errors/index.js';
import { compareCatalogs, scanSources } from '../../../scripts/check-i18n.mjs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src');

test('لغة الوحدة قبل التهيئة هي المرجعية', () => {
  assert.equal(getLocale(), 'ar');
  assert.equal(getDir(), 'rtl');
});

test('t: القوالب تُملأ باللغة الحالية، والتبديل يبلّغ مرة لكل تغيير فعلي', (ctx) => {
  ctx.after(() => setLocale('ar'));
  assert.equal(t('common.slot.label', { n: 2 }), 'الترجمة 2');
  const seen = [];
  const off = onLocaleChange((l) => seen.push(l));
  setLocale('en');
  setLocale('en');
  assert.equal(t('common.slot.label', { n: 2 }), 'Translation 2');
  assert.equal(getDir(), 'ltr');
  assert.deepEqual(seen, ['en']);
  off();
  setLocale('fr');
  assert.equal(getLocale(), 'en', 'لغة غير مدعومة لا تُقبل');
});

test('texts: وجه يقرأ باللغة الحالية عند كل قراءة، فلا تتجمد لغة عند تحميل الوحدة', (ctx) => {
  ctx.after(() => setLocale('ar'));
  const nav = texts('common.nav');
  assert.equal(nav.library, 'المحفوظات');
  assert.ok(Object.keys(nav).includes('settings'));
  setLocale('en');
  assert.equal(nav.library, 'Library');
});

test('LazyText يُحسب عند كل عرض', (ctx) => {
  ctx.after(() => setLocale('ar'));
  const x = lt('common.nav.settings');
  assert.ok(x instanceof LazyText);
  assert.equal(String(x), 'الإعدادات');
  setLocale('en');
  assert.equal(String(x), 'Settings');
});

test('صيغ العدّ باللغتين', (ctx) => {
  ctx.after(() => setLocale('ar'));
  assert.equal(formatCount(1, COUNT_FORMS.cue), 'مقطع واحد');
  assert.equal(formatCount(2, COUNT_FORMS.cue), 'مقطعان');
  assert.equal(formatCount(3, COUNT_FORMS.cue), '3 مقاطع');
  assert.equal(formatCount(11, COUNT_FORMS.cue), '11 مقطعًا');
  assert.equal(formatCount(100, COUNT_FORMS.cue), '100 مقطع');
  setLocale('en');
  assert.equal(formatCount(1, COUNT_FORMS.cue), '1 segment');
  assert.equal(formatCount(2, COUNT_FORMS.cue), '2 segments');
  assert.equal(formatCount(0, COUNT_FORMS.video), '0 videos');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(joinList(['a', 'b']), 'a, b');
});

test('الاسترجاع عند نقص مفتاح: لا مفتاح خام أبدًا، وعبارة مفهومة بلغة الواجهة، ويُسجَّل النقص', (ctx) => {
  ctx.after(() => setLocale('ar'));
  const k = 'common.definitelyMissing';
  assert.equal(t(k), 'نص غير متاح');
  setLocale('en');
  assert.equal(t(k), 'Text unavailable');
  assert.equal(texts('common').definitelyMissing, 'Text unavailable');
  assert.ok(missingKeys().includes(`en:${k}`));
  assert.ok(!String(t(k)).includes(k));
});

test('رسائل الأخطاء تتبع اللغة، والرمز ثابت', (ctx) => {
  ctx.after(() => setLocale('ar'));
  const ar = messageFor('ST_SAVED');
  setLocale('en');
  const en = messageFor('ST_SAVED');
  assert.notEqual(ar, en);
  assert.ok(!/[؀-ۿ]/.test(en));
  const err = new TjError('ST_SAVED');
  assert.equal(err.code, 'ST_SAVED');
  assert.equal(err.message, en);
});

test('compareCatalogs يكشف المفتاح الناقص والقالب المختلف والحرف العربي في الإنجليزية', () => {
  const ar = new Map([['a', 'س {n}'], ['b', 'ص'], ['c', 'ع']]);
  const en = new Map([['a', 'x {m}'], ['c', 'فيها عربي'], ['d', 'y']]);
  const out = compareCatalogs(ar, en);
  assert.ok(out.some((p) => p.includes('ناقص في en: b')));
  assert.ok(out.some((p) => p.includes('ناقص في ar: d')));
  assert.ok(out.some((p) => p.includes('قوالب مختلفة: a')));
  assert.ok(out.some((p) => p.includes('حرف عربي في نص إنجليزي: c')));
});

test('الفهرسان متطابقان، وكل مفتاح تستعمله الشيفرة موجود، ولا نص عربي خارج الفهرس في واجهات المنتج', async () => {
  const ar = catalogOf('ar');
  const en = catalogOf('en');
  assert.deepEqual(compareCatalogs(ar, en), []);
  assert.deepEqual(await scanSources(SRC, ar, en), []);
});

test('القيم الدالية في الإنجليزية لا تُخرج حرفًا عربيًا', () => {
  const en = catalogOf('en');
  const params = new Proxy({}, { get: (_, k) => (k === 'then' ? undefined : 2), has: () => true });
  for (const [k, v] of en) {
    if (typeof v !== 'function') continue;
    let out;
    try {
      out = v(params);
    } catch {
      continue; // دالة تتطلب معاملات بعينها: يغطيها اختبار مجالها.
    }
    assert.ok(!/[؀-ۿ]/.test(String(out)), k);
  }
});
