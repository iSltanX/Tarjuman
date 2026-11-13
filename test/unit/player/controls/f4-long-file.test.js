// ف4 (2026-11-10): قائمة «تنزيل الأصل» تنبّه قبل الإرسال أن الملف طويل حين يتجاوز عدد المقاطع «يُقترح التقسيم ابتداءً من» في الإعدادات.
// ومنذ ح-61 (الجولة الخامسة، 2026-11-14) التنبيه سطر واحد «ملف طويل: N مقطعًا.» وتفصيله (الطول بالأحرف، وأن يُقسَّم إن عجز النموذج) خلف
// «لماذا؟» داخل التنبيه نفسه، وقسم «تقسيم الملفات الطويلة» مطوي حتى يفتحه المستخدم (كان يُفتح للملف الطويل)، ويبقى على حاله بعد إعادة الرسم.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { setLocale } from '../../../../src/i18n/index.js';
import { click, makeState, mountPage, trackInfo } from './harness.js';

const withCount = (cueCount, threshold = 200) => mountPage({
  state: makeState({ captured: [trackInfo({ cueCount })], settings: { ...DEFAULT_SETTINGS, export: { ...DEFAULT_SETTINGS.export, splitThreshold: threshold } } }),
});
const open = (page) => click(page.ui.btn('download'));
const alertOf = (page) => page.ui.field('longFile');
/** نص سطر التنبيه الظاهر (بلا التفصيل المطوي). */
const lineOf = (page) => alertOf(page)?.querySelector('.stack').children[0].textContent ?? null;
const section = (page) => page.ui.item('تقسيم الملفات الطويلة');

test('ح-61: 427 مقطعًا (فوق 200): «ملف طويل» سطر واحد بالعدد، والتفصيل خلف «لماذا؟» في الـDOM مطويًا، والقسم مطوي والتقسيم غير مفعّل', () => {
  const page = withCount(427);
  open(page);
  assert.equal(lineOf(page), 'ملف طويل: 427 مقطعًا. لماذا؟');
  const why = page.ui.field('longWhy');
  const text = page.ui.field('longWhyText');
  assert.equal(why.getAttribute('aria-expanded'), 'false');
  assert.equal(why.getAttribute('aria-controls'), text.getAttribute('id'));
  assert.equal(text.hasAttribute('hidden'), true, 'مطوي');
  assert.match(text.textContent, /^طوله [\d,]+ (حرف|حرفًا|أحرف)\. إن عجز نموذجك عن ملف بهذا الطول فقسّمه من «تقسيم الملفات الطويلة» أدناه\.$/);
  assert.equal(section(page).getAttribute('aria-expanded'), 'false', 'القسم لا يُفتح وحده');
  assert.ok(page.ui.field('split') === null);
});

test('ح-61: «لماذا؟» تفتح التفصيل داخل التنبيه وتطويه، ويبقى على حاله بعد إعادة الرسم', () => {
  const page = withCount(427);
  open(page);
  click(page.ui.field('longWhy'));
  assert.equal(page.ui.field('longWhy').getAttribute('aria-expanded'), 'true');
  assert.equal(page.ui.field('longWhyText').hasAttribute('hidden'), false);
  assert.ok(alertOf(page).contains(page.ui.field('longWhyText')), 'داخل التنبيه');
  click(page.ui.item('مقاطع أطول'));
  assert.equal(page.ui.field('longWhyText').hasAttribute('hidden'), false, 'بعد إعادة الرسم');
  click(page.ui.field('longWhy'));
  assert.equal(page.ui.field('longWhyText').hasAttribute('hidden'), true);
});

test('8 مقاطع: لا سطر، والقسم مطوي كما كان', () => {
  const page = withCount(8);
  open(page);
  assert.ok(alertOf(page) === null);
  assert.equal(section(page).getAttribute('aria-expanded'), 'false');
});

test('الحد من الإعدادات: 427 مقطعًا بحد 500 بلا سطر، وبحد 400 بسطر', () => {
  const high = withCount(427, 500);
  open(high);
  assert.ok(alertOf(high) === null);
  const low = withCount(427, 400);
  open(low);
  assert.ok(alertOf(low));
});

test('فتح القسم يُحترم: لا يطويه الرسم التالي، ونقرة ثانية تطويه', () => {
  const page = withCount(427);
  open(page);
  click(section(page));
  assert.equal(section(page).getAttribute('aria-expanded'), 'true');
  assert.ok(page.ui.field('split'));
  click(page.ui.item('مقاطع أطول'));
  assert.equal(section(page).getAttribute('aria-expanded'), 'true', 'بعد إعادة الرسم');
  click(section(page));
  assert.equal(section(page).getAttribute('aria-expanded'), 'false');
});

test('ح-61 بالإنجليزية: «Long file: 427 segments. Why?» والتفصيل بلا حرف عربي', () => {
  setLocale('en');
  try {
    const page = withCount(427);
    open(page);
    assert.equal(lineOf(page), 'Long file: 427 segments. Why?');
    assert.match(page.ui.field('longWhyText').textContent, /^It has [\d,]+ characters?\. If your model can’t handle a file this long, split it under “Splitting long files” below\.$/);
  } finally {
    setLocale('ar');
  }
});
