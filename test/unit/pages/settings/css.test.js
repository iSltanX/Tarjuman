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

const ui = readFileSync(path.join(ROOT, 'src/ui/components.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('الإعدادات: الحقل الرقمي (.tj-num من src/ui) بلا flex-basis (يصير ارتفاعًا داخل بطاقة عمودية)، والتمدد داخل .st-fields وحده', () => {
  const s = css('settings/settings.css');
  assert.ok(rule(ui, '.tj-num'), 'قاعدة .tj-num موجودة');
  assert.equal(/flex\s*:/.test(rule(ui, '.tj-num')), false);
  assert.equal(rule(s, '.tj-num'), null, 'لا تُعاد تعريف القاعدة المشتركة في الصفحة');
  assert.match(rule(s, '.st-fields > .tj-num'), /flex\s*:\s*1 1 240px/);
});

test('الإعدادات: الصف شبكة من عمودين (التسمية ثم العنصر) تصير عمودًا واحدًا في العرض الضيق، وعلامة «حُفظ» بمساحة محجوزة', () => {
  const s = css('settings/settings.css');
  assert.match(rule(s, '.st-row'), /display:\s*grid/);
  assert.match(rule(s, '.st-row'), /grid-template-columns:\s*\d+px minmax\(0, 1fr\)/);
  assert.match(rule(ui, '.tj-saved'), /min-height:\s*18px/, 'العلامة تحجز سطرها فلا يقفز التخطيط عند ظهورها');
  assert.match(rule(s, '.st-row__label .tj-saved'), /min-height:\s*18px/);
  const narrow = media(s, 'max-width: 760px');
  assert.match(narrow, /\.st-row\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(narrow, /\.st-nav\s*\{[^}]*flex-direction:\s*row/, 'التنقّل الجانبي يصير شريطًا أفقيًا');
  // تدقيق Fable (FA-12): يلتف ولا يُقص، فالأقسام التسعة ظاهرة.
  assert.match(narrow, /\.st-nav\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(narrow, /\.st-nav\s*\{[^}]*overflow-x:\s*auto/);
});

test('المحفوظات: شبكة الصف (الصورة، والبيانات، والترجمات، والإجراءات) تُعاد ترتيبًا في العرض الضيق فتنزل الإجراءات صفًّا وحدها', () => {
  const l = css('library/library.css');
  assert.match(rule(l, '.lib-row__grid'), /display:\s*grid/);
  assert.match(rule(l, '.lib-row__grid'), /grid-template-areas:\s*"thumb main trs acts"/);
  const narrow = media(l, 'max-width: 760px');
  assert.match(narrow, /\.lib-row__grid\s*\{[^}]*grid-template-areas:\s*"thumb main" "thumb trs" "acts acts"/, 'الإجراءات في صف مستقل تحت البيانات');
});

test('تدقيق 5fedcb9 (CL-008، CL-009) وFable (FA-13): القسم المفتوح بجزء العنوان لا يمرّر الصفحة فلا يختبئ عنوانها ولا عنوانه، وسطر «آخر الترجمات» يتسع للكسرات', () => {
  const settings = css('settings/settings.css');
  const all = [...settings.matchAll(/(?:^|\n)\.st-section\s*\{([^}]*)\}/g)].map((m) => m[1]).join(';');
  assert.match(all, /scroll-margin-top:\s*100vh/);
  const popup = css('popup/popup.css');
  assert.match(rule(popup, '.tj-popup__recent-title'), /14px\/22px/);
});
