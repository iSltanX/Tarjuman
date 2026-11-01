// حارس عيبين بصريين كشفهما الاختبار الحي (لقطات P7): flex-basis بالبكسل على عنصر يصير في حاوية عمودية ارتفاعًا فيترك
// فراغًا كبيرًا. الحارس يقرأ الأنماط نفسها؛ ومظهر الصفحة الفعلي في test/live/pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const css = (f) => readFileSync(path.join(ROOT, 'src/pages', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** نص قاعدة محددها كما هو (أول ظهور خارج media إن لم يُحدَّد). */
const rule = (text, selector) => new RegExp(`(?:^|\\n)${selector.replace(/[.>]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(text)?.[1] ?? null;

test('الإعدادات: .st-num بلا flex-basis (يصير ارتفاعًا داخل بطاقة عمودية)، والتمدد داخل .st-fields وحده', () => {
  const s = css('settings/settings.css');
  assert.ok(rule(s, '.st-num'), 'قاعدة .st-num موجودة');
  assert.equal(/flex\s*:/.test(rule(s, '.st-num')), false);
  assert.match(rule(s, '.st-fields > .st-num'), /flex\s*:\s*1 1 240px/);
});

test('المحفوظات: عند تحوّل الصف إلى عمود يُلغى flex-basis للعمود المعلوماتي', () => {
  const l = css('library/library.css');
  assert.match(rule(l, '.lib-row__info'), /flex\s*:\s*1 1 320px/, 'في الصف الأفقي يتمدد عرضًا');
  const media = /@media \(max-width: 900px\) \{([\s\S]*?)\n\}/.exec(l)?.[1] ?? '';
  assert.match(media, /\.lib-row\s*\{[^}]*flex-direction:\s*column/);
  assert.match(media, /\.lib-row__info\s*\{[^}]*flex:\s*0 1 auto/);
});
