// حارس أنماط الهوية الرابعة «كتابٌ مفتوح» (docs/identity.md) في نافذة الأيقونة والإعدادات والمحرّر: كل رمز --tj-* مستعمل معرَّف في tokens.css (خطأ في
// اسم رمز يسقط بصمت إلى قيمة موروثة ولا يظهر إلا في الوضع الداكن)، ولا لون صلب في أنماطها (فيكسر الوضع الداكن) إلا ما هو فيديو
// بطبيعته (معاينة الترجمة الحية، داكنة بالوضعين)، وكل نص بلون من الرموز لا بقيمة. المظهر الفعلي في الاختبار الحي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const PAGES = ['src/pages/popup/popup.css', 'src/pages/settings/settings.css', 'src/pages/editor/editor.css'];
const tokens = read('src/ui/tokens.css');
const defined = new Set([...tokens.matchAll(/(--tj-[\w-]+)\s*:/g)].map((m) => m[1]));

test('كل رمز --tj-* في أنماط الصفحات الثلاث معرَّف في tokens.css', () => {
  for (const f of PAGES) {
    const used = new Set([...strip(read(f)).matchAll(/var\((--tj-[\w-]+)/g)].map((m) => m[1]));
    assert.ok(used.size > 10, `${f}: تستعمل الرموز`);
    for (const name of used) assert.ok(defined.has(name), `${f}: الرمز ${name} غير معرَّف`);
  }
});

test('لا لون صلب في أنماط نافذة الأيقونة والمحرّر، وفي الإعدادات لا إلا معاينة الفيديو الداكن', () => {
  const HARD = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|(?<![\w-])(?:white|black)(?![\w-])/;
  for (const f of ['src/pages/popup/popup.css', 'src/pages/editor/editor.css']) assert.equal(HARD.test(strip(read(f))), false, f);
  const lines = strip(read('src/pages/settings/settings.css')).split('\n').filter((l) => HARD.test(l));
  assert.ok(lines.length > 0 && lines.length <= 4, 'المعاينة وحدها');
  for (const l of lines) assert.match(l, /--st-sub-|st-preview__screen|st-preview__stage|text-shadow|linear-gradient\(160deg/, `سطر غير المعاينة بلون صلب: ${l.trim()}`);
});

test('النص الأساسي بالمداد والثانوي والخافت من الرموز: كل color: في الصفحات الثلاث من الرموز (أو inherit أو currentColor، ولون ترجمة المعاينة وحده من متغيرها المحلي)', () => {
  for (const f of PAGES) {
    const decls = [...strip(read(f)).matchAll(/(?:^|[;{\s])color:\s*([^;}]+)/g)].map((m) => m[1].trim());
    assert.ok(decls.length > 5, f);
    for (const v of decls) assert.match(v, /^(?:var\(--(?:tj|st-sub)-[\w-]+\)|inherit|currentColor)(?: !important)?$/, `${f}: color: ${v}`);
  }
});

test('الشريط السفلي في المحرّر معكوس من الرموز: خلفيته المداد ونصه الورق بالوضعين (تتبادل القيمتان في الداكن تلقائيًا)', () => {
  const dark = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: dark)'));
  assert.match(dark, /--tj-text: #EDE9E0/, 'الحبر في الداكن عاج');
  assert.match(dark, /--tj-bg: #0F1917/, 'ليل الصنوبر');
  assert.match(strip(read('src/pages/editor/editor.css')), /\.ed-unsaved \{[^}]*background: var\(--tj-text\)[^}]*color: var\(--tj-bg\)/);
});
