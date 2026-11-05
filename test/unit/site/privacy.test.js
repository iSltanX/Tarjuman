// نصوص الموقع والخصوصية (جولة النشر T5): PRIVACY.md مولَّد من مصدره الواحد docs/site/privacy.md بلا قسم الرأس ولا جدول
// الأدلة ولا مراسي المواصفة، ورقم الإصدار من package.json، و[قرار] يُبقيه مسودة يرفضها --strict، وتاريخ السريان يُثبَّت بصيغته.
// وكل مسار يستشهد به جدول أدلة في نصوص الموقع موجود في المستودع.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE, TARGET, effectiveDateOf, generate, withEffectiveDate } from '../../../scripts/site/privacy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = readFileSync(path.join(ROOT, SOURCE), 'utf8');
// نسخة من المصدر قبل تثبيت التاريخ، لاختبار سلوك المولّد مع ⟨تاريخ النشر⟩ بعد أن ثُبّت التاريخ المعتمد (2026-11-04، ثم 2026-11-05 في تدقيق 7a66f91، C9).
const undated = source.replace(/^- \*\*تاريخ السريان:\*\* .+$/m, '- **تاريخ السريان:** ⟨تاريخ النشر⟩');
const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('PRIVACY.md المتتبَّع هو ما يولّده المولّد من مصدره', () => {
  assert.ok(readFileSync(path.join(ROOT, TARGET), 'utf8') === generate().text, 'شغّل node scripts/site/privacy.mjs');
});

test('المولَّد بلا ما يخص المواصفة: لا رأس ولا تنبيهات المصدر ولا جدول أدلة ولا مراسٍ نصية، وبرقم الإصدار ومراسٍ ثابتة', () => {
  const { text } = generate();
  assert.ok(text.startsWith('<div dir="rtl">\n\n# سياسة الخصوصية — ترجمان\n'));
  assert.ok(text.includes(`كما تفعله شيفرة الإصدار ${version}.`));
  for (const banned of ['## الرأس', 'جدول الأدلة', 'المصدر الواحد لنص الخصوصية', '`#summary`', '⟨', '/tarjuman/support']) {
    assert.equal(text.includes(banned), false, banned);
  }
  const anchors = [...source.matchAll(/^#{2,3} .+? — `#([a-z-]+)`$/gm)].map((m) => m[1]);
  assert.ok(anchors.length >= 12);
  for (const a of anchors) assert.ok(text.includes(`<a id="${a}"></a>`), a);
  for (const a of ['summary', 'stored', 'files', 'sent', 'youtube', 'thumbnails', 'report', 'offline', 'ai', 'permissions', 'third-parties', 'limited-use', 'retention', 'changes', 'contact']) {
    assert.ok(anchors.includes(a), `المرساة ${a}`);
  }
  assert.ok(text.includes('](docs/site/help.md)'), 'رابط صفحة الدعم يصير ملفها في المستودع');
});

test('[قرار] يُبقي المولَّد مسودة بتنبيه، و--strict يرفضه ويرفض تاريخ سريان غير مثبت', () => {
  const draft = generate();
  const marks = (source.slice(0, source.indexOf('## جدول الأدلة')).match(/\*\*\[قرار\]\*\*/g) ?? []).length
    - (source.slice(0, source.indexOf('## الرأس')).match(/\*\*\[قرار\]\*\*/g) ?? []).length;
  assert.equal(draft.decisions, marks);
  if (draft.decisions) {
    assert.ok(draft.text.includes(`> **مسودة:** مواضع [قرار] لم يحسمها الناشر بعد: ${draft.decisions}.`));
    assert.throws(() => generate({ strict: true }), /\[قرار\]/);
  }
  const resolved = undated.replace(/\s*\*\*\[قرار\]\*\*/g, '');
  assert.throws(() => generate({ source: resolved, strict: true }), /تاريخ السريان غير مثبت/);
  const dated = withEffectiveDate(resolved, '2026-12-01');
  const ok = generate({ source: dated, strict: true });
  assert.equal(ok.decisions, 0);
  assert.equal(ok.effective, '2026-12-01');
  assert.ok(ok.text.includes('تسري هذه السياسة اعتبارًا من 2026-12-01.'));
  assert.equal(ok.text.includes('مسودة'), false);
});

test('تاريخ السريان: مثبَّت 2026-11-05 بقرار سلطان (C9)، و⟨تاريخ النشر⟩ يعني غير مثبت، وتاريخ غير صالح يُرفض', () => {
  assert.equal(effectiveDateOf(source), '2026-11-05', 'المصدر يحمل تاريخ السريان المعتمد');
  assert.equal(effectiveDateOf(undated), null);
  assert.equal(effectiveDateOf(withEffectiveDate(undated, '2026-11-04')), '2026-11-04');
  assert.throws(() => withEffectiveDate(undated, '2026-13-40'), /غير صالح/);
  assert.throws(() => withEffectiveDate(undated, '1 ديسمبر'), /غير صالح/);
  assert.throws(() => effectiveDateOf(undated.replace('- **تاريخ السريان:** ⟨تاريخ النشر⟩', '- **تاريخ السريان:** غدًا')), /غير صالح/);
  assert.throws(() => withEffectiveDate(undated, '2026-02-30'), /غير صالح/, 'تاريخ لا وجود له');
});

test('كل مسار في جداول أدلة نصوص الموقع موجود، وكل نص بقسم رأس وجدول أدلة', () => {
  for (const file of ['privacy.md', 'help.md', 'tarjuman.md', 'credits.md']) {
    const text = readFileSync(path.join(ROOT, 'docs/site', file), 'utf8');
    assert.ok(text.includes('\n## الرأس\n') || text.includes('\n## البيانات الوصفية\n'), `${file}: قسم الرأس`);
    const at = text.indexOf('## جدول الأدلة (للمراجعة، لا يُنشر)');
    assert.ok(at > 0, `${file}: جدول الأدلة`);
    const paths = [...new Set([...text.slice(at).matchAll(/`((?:src|docs|scripts|test|store)\/[^`\s]*?)`/g)].map((m) => m[1].replace(/\/$/, '')))];
    assert.ok(paths.length > 5, file);
    for (const p of paths) assert.ok(existsSync(path.join(ROOT, p)), `${file}: ${p}`);
  }
});
