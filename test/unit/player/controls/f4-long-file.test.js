// ف4 (2026-11-10): قائمة «تنزيل الأصل» تنبّه قبل الإرسال أن الملف طويل: حين يتجاوز عدد المقاطع «يُقترح التقسيم ابتداءً من» في
// الإعدادات، سطر بعدد المقاطع وطول النص، وقسم «تقسيم الملفات الطويلة» مفتوح دون تفعيل التقسيم. ويطويه المستخدم فيبقى مطويًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { click, makeState, mountPage, trackInfo } from './harness.js';

const withCount = (cueCount, threshold = 200) => mountPage({
  state: makeState({ captured: [trackInfo({ cueCount })], settings: { ...DEFAULT_SETTINGS, export: { ...DEFAULT_SETTINGS.export, splitThreshold: threshold } } }),
});
const open = (page) => click(page.ui.btn('download'));
const longLine = (page) => page.ui.menu().querySelectorAll('.alert').map((a) => a.textContent).find((t) => t.startsWith('ملف طويل')) ?? null;
const section = (page) => page.ui.item('تقسيم الملفات الطويلة');

test('427 مقطعًا (فوق 200): سطر «ملف طويل» بالعدد والطول، والقسم مفتوح والتقسيم غير مفعّل', () => {
  const page = withCount(427);
  open(page);
  assert.match(longLine(page) ?? '', /^ملف طويل: 427 مقطعًا و[\d,]+ (حرف|حرفًا|أحرف)\. إن عجز نموذجك/);
  assert.equal(section(page).getAttribute('aria-expanded'), 'true');
  assert.equal(page.ui.field('split').checked, false);
});

test('8 مقاطع: لا سطر، والقسم مطوي كما كان', () => {
  const page = withCount(8);
  open(page);
  assert.equal(longLine(page), null);
  assert.equal(section(page).getAttribute('aria-expanded'), 'false');
});

test('الحد من الإعدادات: 427 مقطعًا بحد 500 بلا سطر، وبحد 400 بسطر', () => {
  const high = withCount(427, 500);
  open(high);
  assert.equal(longLine(high), null);
  const low = withCount(427, 400);
  open(low);
  assert.ok(longLine(low));
});

test('طي القسم يُحترم: لا يعيد فتحه الرسم التالي', () => {
  const page = withCount(427);
  open(page);
  click(section(page));
  assert.equal(section(page).getAttribute('aria-expanded'), 'false');
  click(page.ui.item('مقاطع أطول'));
  assert.equal(section(page).getAttribute('aria-expanded'), 'false', 'بعد إعادة الرسم');
  click(section(page));
  assert.equal(section(page).getAttribute('aria-expanded'), 'true');
});
