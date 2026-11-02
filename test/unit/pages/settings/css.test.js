// حارس عيوب بصرية كشفها الاختبار الحي (لقطات P7) وقرارات إعادة التصميم: flex-basis بالبكسل على عنصر يصير في حاوية
// عمودية ارتفاعًا فيترك فراغًا كبيرًا؛ وعلامة «حُفظ» بمساحة محجوزة فلا تدفع ما تحتها؛ والصف الشبكي يتحوّل إلى عمود في
// العرض الضيق. الحارس يقرأ الأنماط نفسها؛ ومظهر الصفحة الفعلي في test/live/pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const css = (f) => readFileSync(path.join(ROOT, 'src/pages', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** نص قاعدة محددها كما هو (أول ظهور خارج media إن لم يُحدَّد). */
const rule = (text, selector) => new RegExp(`(?:^|\\n)${selector.replace(/[.>]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(text)?.[1] ?? null;
const media = (text, query) => new RegExp(`@media \\(${query}\\) \\{([\\s\\S]*?)\\n\\}`).exec(text)?.[1] ?? '';

test('الإعدادات: .st-num بلا flex-basis (يصير ارتفاعًا داخل بطاقة عمودية)، والتمدد داخل .st-fields وحده', () => {
  const s = css('settings/settings.css');
  assert.ok(rule(s, '.st-num'), 'قاعدة .st-num موجودة');
  assert.equal(/flex\s*:/.test(rule(s, '.st-num')), false);
  assert.match(rule(s, '.st-fields > .st-num'), /flex\s*:\s*1 1 240px/);
});

test('الإعدادات: الصف شبكة من عمودين (التسمية ثم العنصر) تصير عمودًا واحدًا في العرض الضيق، وعلامة «حُفظ» بمساحة محجوزة', () => {
  const s = css('settings/settings.css');
  assert.match(rule(s, '.st-row'), /display:\s*grid/);
  assert.match(rule(s, '.st-row'), /grid-template-columns:\s*\d+px minmax\(0, 1fr\)/);
  assert.match(rule(s, '.st-saved'), /min-height:\s*18px/, 'العلامة تحجز سطرها فلا يقفز التخطيط عند ظهورها');
  const narrow = media(s, 'max-width: 760px');
  assert.match(narrow, /\.st-row\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(narrow, /\.st-nav\s*\{[^}]*flex-direction:\s*row/, 'التنقّل الجانبي يصير شريطًا أفقيًا');
});

test('المحفوظات: الصف شبكة (البيانات ثم الإجراءات) تصير عمودًا واحدًا في العرض الضيق', () => {
  const l = css('library/library.css');
  assert.match(rule(l, '.lib-row'), /display:\s*grid/);
  assert.match(rule(l, '.lib-row'), /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  const narrow = media(l, 'max-width: 760px');
  assert.match(narrow, /\.lib-row\s*\{[^}]*grid-template-columns:\s*1fr/);
});
