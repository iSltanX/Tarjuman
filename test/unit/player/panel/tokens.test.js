// رموز اللوحة مطابقة لـsrc/ui/tokens.css بالوضعين (مصدر واحد للحقيقة يفرضه الاختبار): الفاتح من :root، والداكن من
// :root[data-theme="dark"]، وما لا يتبدل (الزوايا والحركة والخطوط) من :root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PANEL_TOKENS, panelTokensCss, tokenName } from '../../../../src/player/panel/tokens.js';
import { panelCss } from '../../../../src/player/panel/styles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const css = readFileSync(path.join(ROOT, 'src/ui/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** محتوى أول كتلة بهذا المحدد حرفيًا (بلا media). */
function block(selector) {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at >= 0, `الكتلة ${selector} في tokens.css`);
  const start = css.indexOf('{', at) + 1;
  return css.slice(start, css.indexOf('\n}', start));
}

function declarations(body) {
  const out = new Map();
  for (const m of body.matchAll(/(--tj-[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  return out;
}

const norm = (v) => v.trim().replace(/\s+/g, ' ');

test('الوضع الفاتح: كل قيمة في اللوحة تساوي رمزها في :root', () => {
  const root = declarations(block(':root'));
  for (const [key, value] of Object.entries(PANEL_TOKENS.light)) {
    assert.ok(root.has(tokenName(key)), `${tokenName(key)} غير موجود في tokens.css`);
    assert.equal(norm(value), root.get(tokenName(key)), tokenName(key));
  }
});

test('الوضع الداكن: كل قيمة في اللوحة تساوي رمزها في :root[data-theme="dark"]', () => {
  const dark = declarations(block(':root[data-theme="dark"]'));
  for (const [key, value] of Object.entries(PANEL_TOKENS.dark)) {
    assert.ok(dark.has(tokenName(key)), `${tokenName(key)} غير موجود في الكتلة الداكنة`);
    assert.equal(norm(value), dark.get(tokenName(key)), tokenName(key));
  }
});

test('المفاتيح نفسها بالوضعين، وبينهما اختلاف حقيقي في الأسطح والنص', () => {
  assert.deepEqual(Object.keys(PANEL_TOKENS.dark).sort(), Object.keys(PANEL_TOKENS.light).sort());
  for (const k of ['bg', 'surface', 'text', 'brand', 'border', 'control', 'selected', 'selectedInk']) assert.notEqual(PANEL_TOKENS.light[k], PANEL_TOKENS.dark[k], k);
});

test('ما لا يتبدل بالوضع (الزوايا والارتفاعات والحركة والخطوط) يساوي :root', () => {
  const root = declarations(block(':root'));
  for (const [key, value] of Object.entries(PANEL_TOKENS.shared)) {
    assert.ok(root.has(tokenName(key)), `${tokenName(key)} غير موجود في tokens.css`);
    assert.equal(norm(value), root.get(tokenName(key)), tokenName(key));
  }
});

test('الداكن يتجاوز في tokens.css ما يتجاوزه وحده، فلا قيمة فاتحة تتسرب إليه', () => {
  const dark = declarations(block(':root[data-theme="dark"]'));
  const root = declarations(block(':root'));
  // كل رمز مشترك في اللوحة غير مذكور في الداكن يجب أن يكون بالقيمة نفسها بالوضعين في tokens.css (لا تعارض صامت).
  for (const key of Object.keys(PANEL_TOKENS.shared)) assert.ok(!dark.has(tokenName(key)) || dark.get(tokenName(key)) === root.get(tokenName(key)), key);
});

test('ورقة اللوحة تحمل الوضعين بمحدد data-theme، ولا لون سداسي خارج الرموز (خرزة المفتاح بسطح الوضع منذ الهوية الخامسة، وكانت أبيض ثابتًا)', () => {
  const sheet = panelCss();
  assert.ok(sheet.includes(panelTokensCss('.root')));
  assert.ok(sheet.includes('.root[data-theme="dark"]'));
  const literal = sheet.replace(panelTokensCss('.root'), '').match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
  assert.deepEqual([...new Set(literal.map((c) => c.toUpperCase()))], []);
});
