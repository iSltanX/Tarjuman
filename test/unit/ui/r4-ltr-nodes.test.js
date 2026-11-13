// الجولة الرابعة (بند سلطان): اسم الملف أو المعرّف داخل جملة عربية عنصرٌ ذري معزول LTR في الـDOM، لا نص LRI…PDI وحده. العزل النصي
// يصحّح ترتيب الاسم في سطر واحد، لكن الترتيب ثنائي الاتجاه يُطبَّق سطرًا سطرًا بعد الكسر: «نُزّل KA3zmDkEUQs.en.from-ar.asr.normal.srt»
// ظهر في Chrome «نُزّل -KA3zmDkEUQs.en.from» ثم «ar.asr.normal.srt». والعنصر الذري (inline-block) ينقل الاسم كله إلى سطره ويلتف داخله.
// هنا الأساس المشترك: ltrParts (نص نقي)، وltr({ wrap })، وltrNodes، والتنبيه والرسالة العابرة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { alertBox, ltr, ltrNodes } from '../../../src/ui/components.js';
import { isolate, ltrInline, ltrParts } from '../../../src/ui/format.js';
import { createToaster } from '../../../src/ui/toast.js';
import { findAll, newDocument } from '../pages/library/fake-dom.js';

const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
// أسماء طويلة تنكسر أسطرها في قائمة أو حوار ضيق، وأولها شرطة (معرّف يوتيوب قد يبدأ بها).
const NAMES = ['KA3zmDkEUQs.en.from-ar.asr.normal.srt', '-KA3zmDkEUQs.ar.dual-en-GB.from-ar.asr.normal.part12of12.srt', 'My_Translation_Final_Version_2026_11_14_without_any_breaks.srt'];
const bdis = (root) => findAll(root, (e) => e.tagName === 'bdi');

test('ltrParts: المقطع المعزول LTR جزء مستقل بعلامتيه، والوصل يعيد النص نفسه، والعزل FSI نص', () => {
  for (const name of NAMES) {
    const text = `نُزّل ${ltrInline(name)}`;
    const parts = ltrParts(text);
    assert.deepEqual(parts, [{ text: 'نُزّل ', ltr: false }, { text: `${LRI}${name}${PDI}`, ltr: true }]);
    assert.equal(parts.map((p) => p.text).join(''), text);
  }
  assert.deepEqual(ltrParts('بلا اسم'), [{ text: 'بلا اسم', ltr: false }]);
  assert.deepEqual(ltrParts(`عنوان ${isolate('Title?')}`), [{ text: `عنوان ${isolate('Title?')}`, ltr: false }], 'FSI…PDI نص حر يبقى نصًا');
  const two = ltrParts(`حُفظ ${ltrInline('a.srt')} و${ltrInline('b.srt')}.`);
  assert.deepEqual(two.map((p) => p.ltr), [false, true, false, true, false]);
});

test('ltr({ wrap }): صنف الالتفاف بلا تغيير للصنف القائم، وltrNodes عنصر bdi ذري يلتف لكل مقطع معزول وnull لما سواه', () => {
  const doc = newDocument();
  assert.equal(ltr('00:00:01,000', { doc }).className, 'tj-ltr tj-mono', 'الصنف القائم كما كان');
  assert.equal(ltr('x', { mono: false, doc }).className, 'tj-ltr');
  assert.equal(ltr('x', { mono: false, wrap: true, doc }).className, 'tj-ltr tj-ltr--wrap');
  for (const name of NAMES) {
    const nodes = ltrNodes(`حُفظ ${ltrInline(name)} في مجلد التنزيلات.`, { doc });
    assert.equal(nodes.length, 3);
    assert.equal(nodes[0], 'حُفظ ');
    assert.equal(nodes[2], ' في مجلد التنزيلات.');
    const b = nodes[1];
    assert.equal(b.tagName, 'bdi');
    assert.equal(b.dir, 'ltr');
    assert.equal(b.className, 'tj-ltr tj-ltr--wrap', 'ذري بخط النص نفسه، ويلتف داخله');
    assert.equal(b.textContent, `${LRI}${name}${PDI}`);
  }
  assert.equal(ltrNodes('نص بلا اسم', { doc }), null);
  assert.equal(ltrNodes(`عنوان ${isolate('Title')}`, { doc }), null);
  assert.equal(ltrNodes(undefined, { doc }), null);
});

test('التنبيه والرسالة العابرة: اسم الملف المعزول عنصر ذري خارجه الجملة وحدها، والنص المرئي كما هو', () => {
  for (const name of NAMES) {
    const doc = newDocument();
    const text = `أُنشئت النسخة الاحتياطية: 12 فيديو. ${ltrInline(name)}`;
    const box = alertBox({ tone: 'success', text, doc });
    const p = box.querySelector('.tj-alert__text');
    assert.equal(p.textContent, text, 'النص المرئي كما هو');
    const [b] = bdis(p);
    assert.ok(b && b.dir === 'ltr' && b.classList.contains('tj-ltr--wrap'), 'الاسم داخل عنصر معزول LTR');
    assert.equal(b.textContent, `${LRI}${name}${PDI}`);
    assert.equal(p.childNodes.filter((n) => n !== b).map((n) => n.textContent).join('').includes(name), false, 'لا شيء من الاسم خارج عنصره');

    const toaster = createToaster({ doc, setTimer: () => 0, clearTimer: () => {} });
    const node = toaster.show(`حُفظ ${ltrInline(name)} في مجلد التنزيلات.`, 'success');
    const span = findAll(node, (e) => e.tagName === 'span')[0];
    assert.equal(span.textContent, `حُفظ ${LRI}${name}${PDI} في مجلد التنزيلات.`);
    assert.equal(bdis(span)[0]?.textContent, `${LRI}${name}${PDI}`, 'الاسم داخل عنصر معزول في الرسالة العابرة');
  }
  // بلا مقطع معزول: نص كما كان، بلا عنصر.
  const doc = newDocument();
  assert.equal(bdis(alertBox({ tone: 'info', text: 'تنبيه عادي.', doc })).length, 0);
  assert.equal(bdis(createToaster({ doc, setTimer: () => 0, clearTimer: () => {} }).show('رسالة عادية')).length, 0);
});

test('base.css: صنف الالتفاف overflow-wrap: anywhere، والعنصر الذري inline-block بعرض حاويته', async () => {
  const css = await readFile(new URL('../../../src/ui/base.css', import.meta.url), 'utf8');
  assert.match(css, /\.tj-ltr \{ direction: ltr; unicode-bidi: isolate; display: inline-block; max-width: 100%; \}/);
  assert.match(css, /\.tj-ltr--wrap \{ overflow-wrap: anywhere; \}/);
});
