// تدقيق 7a66f91، U103 (T-01): حارس رخيص بلا تشغيل تغطية. يحلل استيرادات ملفات test/unit/**/*.test.js ومساعداتها (import ثابت،
// و`import('…')` بسلسلة حرفية، و`export … from`) ثم استيرادات src تعدّيًا، ويفشل إن وُجد ملف .js في src لا يبلغه أي اختبار. كان
// 13 ملفًا لا يحمّلها أحد، فيمرّ كسرها أخضر. ما يبقى بلا اختبار يُسمّى هنا بسببه؛ وأي ملف جديد بلا اختبار يُكشف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const posix = (p) => relative(ROOT, p).split(sep).join('/');

/**
 * ملفات تُقرأ نصًا أو تُنفَّذ في vm فلا يبلغها الاستيراد؛ يُثبت الحارس أن اختبارها المسمّى موجود ويذكر مسارها.
 * @type {Record<string, { by: string, why: string }>}
 */
const LOADED_OTHERWISE = {
  'src/main-world/capture.js': {
    by: 'test/unit/extract/c8-capture.test.js',
    why: 'سكربت عالم الصفحة (IIFE بعد البناء) لا يُستورد؛ يُشغَّل مصدره في node:vm مع حقن readTimedtextParams.',
  },
  'src/dev/harness-bridge.js': {
    by: 'test/unit/dev/c8-bridge.test.js',
    why: 'جسر الحزام يقرأ رمز البناء عند تحميله، فيُستورد بعنوان فيه استعلام لكل رمز (U65)، ولا يراه المحلل الحرفي.',
  },
};

/** ملفات بلا اختبار وحدة عن قصد، وسبب كل منها. أي إضافة هنا قرار صريح يُراجَع. */
const EXEMPT = {
  'src/dev/harness-background.js': 'حزام الاختبار الحي (test/live) في بناء التطوير وحده؛ يسجّل مستمعي خلفية للمتصفح الحقيقي، ولا يدخل الحزمة المنتجة.',
  'src/ui/gallery/gallery.js': 'معرض المكوّنات اليدوي (index.html) للمراجعة البصرية والتقاط اللقطات؛ ليس في الحزمة، ومكوّناته مختبرة في test/unit/ui.',
};

const IMPORT_RES = [
  /\bimport\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g, // import x from '…' | import '…'
  /\bexport\s+(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s+from\s+['"]([^'"]+)['"]/g, // export … from '…'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // import('…') بسلسلة حرفية
];

function specifiers(source) {
  // التعليقات تُحذف كي لا تُحسب أمثلة الاستيراد المكتوبة فيها.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const out = new Set();
  for (const re of IMPORT_RES) for (const m of code.matchAll(re)) out.add(m[1]);
  return [...out];
}

function walk(dir, filter, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, filter, acc);
    else if (filter(p)) acc.push(p);
  }
  return acc;
}

const isLive = (p) => /(^|\/)test\/(live|e2e)\//.test(posix(p));

/** الملفات المبلوغة من الاختبارات بالاستيراد التعدّي؛ لا يُدخل حزم الاختبار الحي (استيرادها يفتح متصفحًا فلا تُحلَّل). */
function reachable() {
  const seen = new Set();
  const queue = walk(join(ROOT, 'test/unit'), (p) => p.endsWith('.test.js'));
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || isLive(file)) continue;
    seen.add(file);
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (!spec.startsWith('.')) continue; // node: وحزم
      const target = resolve(dirname(file), spec);
      if (target.endsWith('.js') && existsSync(target)) queue.push(target);
    }
  }
  return seen;
}

test('المحلل: يلتقط الاستيراد الثابت وdynamic import وexport from ويتجاهل التعليقات', () => {
  const src = [
    "import a from './a.js';", "import { b } from '../b.js';", "import './side.js';",
    "export { c } from './c.js';", "export * from './d.js';", "const m = await import('./e.js');",
    "// import x from './commented.js';", "/* import('./block.js') */", "import fs from 'node:fs';",
  ].join('\n');
  assert.deepEqual(specifiers(src).sort(), ['../b.js', './a.js', './c.js', './d.js', './e.js', './side.js', 'node:fs'].sort());
});

test('كل ملف .js في src يبلغه اختبار وحدة، إلا المسمّى في القوائم بسببه', () => {
  const reached = new Set([...reachable()].map(posix));
  const all = walk(join(ROOT, 'src'), (p) => p.endsWith('.js')).map(posix).sort();
  assert.ok(all.length > 100, `عدد ملفات src غير معقول: ${all.length}`);
  const missing = all.filter((f) => !reached.has(f) && !(f in LOADED_OTHERWISE) && !(f in EXEMPT));
  assert.deepEqual(missing, [], `ملفات في src لا يبلغها أي اختبار وحدة. اختبرها أو أضفها إلى EXEMPT بسبب صريح:\n${missing.join('\n')}`);
});

test('القوائم لا تحوي ملفات ميتة ولا مستثناة وهي مختبرة فعلًا', () => {
  const reached = new Set([...reachable()].map(posix));
  for (const f of [...Object.keys(EXEMPT), ...Object.keys(LOADED_OTHERWISE)]) {
    assert.ok(existsSync(join(ROOT, f)), `ملف غير موجود في القائمة: ${f}`);
    assert.ok(typeof (EXEMPT[f] ?? LOADED_OTHERWISE[f].why) === 'string' && (EXEMPT[f] ?? LOADED_OTHERWISE[f].why).length > 10, `سبب ناقص: ${f}`);
  }
  for (const f of Object.keys(EXEMPT)) assert.ok(!reached.has(f), `${f} صار مختبرًا: احذفه من EXEMPT`);
  for (const [f, { by }] of Object.entries(LOADED_OTHERWISE)) {
    assert.ok(!reached.has(f), `${f} يبلغه الاستيراد الآن: احذفه من LOADED_OTHERWISE`);
    const testPath = join(ROOT, by);
    assert.ok(existsSync(testPath), `اختبار ${f} غير موجود: ${by}`);
    assert.ok(readFileSync(testPath, 'utf8').includes(f.replace(/^src\//, '')), `${by} لا يذكر مسار ${f}`);
  }
});
