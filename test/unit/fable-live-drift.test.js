// تدقيق Fable (FA-06): سكربتات حية يحيل إليها إجراء الصيانة كانت تنتظر محددات لم تعد في src (test/e2e/live/cycle.mjs بـ.st-card
// و.st-saved--success و.st-diag__button)، فيفشل الإجراء عند خطوة الإعدادات. الحارس: كل فئة من فئات ترجمان (tj- وlib- وst- وed-)
// داخل سلسلة محدِّد في سكربت حي غير موسوم «مستبدَل» موجودة في src؛ والمستبدَل يُذكر في رأسه ولا يُشغَّل. وكل سكربت يذكره إجراء
// الصيانة موجود وغير مستبدَل.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const walk = async (dir, pred) => (await readdir(dir, { withFileTypes: true, recursive: true }))
  .filter((e) => e.isFile() && pred(e.name))
  .map((e) => path.join(e.parentPath ?? e.path, e.name));
const SUPERSEDED = /مستبدَل/;
const head = (text) => text.split('\n').slice(0, 8).join('\n');
// سكربتات تقرأ صفحات الموقع (iSltanX/WebSiteSultan) لا الإضافة: فئاتها (tj-skip وtj-btn--primary…) في مستودع الموقع وتحرسها
// اختباراته (tests/e2e/tarjuman.spec.ts هناك)، فلا تُطلب في src.
const SITE_SCRIPTS = new Set(['test/live/aa4/site-pages.mjs']);

test('FA-06: فئات ترجمان في محدِّدات السكربتات الحية غير المستبدَلة موجودة في src', async () => {
  const src = (await Promise.all((await walk(path.join(ROOT, 'src'), (n) => /\.(?:js|css|html)$/.test(n))).map((f) => readFile(f, 'utf8')))).join('\n');
  const scripts = [...await walk(path.join(ROOT, 'test/live'), (n) => n.endsWith('.mjs')), ...await walk(path.join(ROOT, 'test/e2e/live'), (n) => n.endsWith('.mjs'))]
    .filter((f) => !f.includes(`${path.sep}harness${path.sep}`) && !SITE_SCRIPTS.has(path.relative(ROOT, f).split(path.sep).join('/')));
  const SEL = /['"`]([^'"`\n]*\.(?:tj|lib|st|ed)-[\w-]+[^'"`\n]*)['"`]/g;
  const missing = [];
  let checked = 0;
  for (const f of scripts) {
    const text = await readFile(f, 'utf8');
    if (SUPERSEDED.test(head(text))) continue;
    for (const m of text.matchAll(SEL)) {
      // :not(.x) نفي لا ينتظر شيئًا، فلا يُعدّ.
      for (const [, cls] of m[1].replace(/:not\([^)]*\)/g, '').matchAll(/\.((?:tj|lib|st|ed)-[\w-]+)/g)) {
        checked++;
        const literal = new RegExp(`(?<![\\w-])${cls}(?![\\w-])`).test(src);
        // فئة مبنية بقالب في المصدر (st-gl__field--${key}): أصلها ثم «--${».
        const built = cls.includes('--') && src.includes(`${cls.split('--')[0]}--\${`);
        if (!literal && !built) missing.push(`${path.relative(ROOT, f)}: .${cls}`);
      }
    }
  }
  assert.ok(checked > 100, `فُحص ${checked}`);
  assert.deepEqual([...new Set(missing)], []);
});

test('FA-06: كل سكربت حي يذكره إجراء الصيانة موجود وغير مستبدَل', async () => {
  const doc = await readFile(path.join(ROOT, 'docs/maintenance.md'), 'utf8');
  const refs = [...new Set([...doc.matchAll(/node (test\/[\w/.-]+\.mjs)/g)].map((m) => m[1]))];
  assert.ok(refs.length >= 4, refs.join());
  for (const rel of refs) {
    const text = await readFile(path.join(ROOT, rel), 'utf8');
    assert.equal(SUPERSEDED.test(head(text)), false, `${rel} مستبدَل ويذكره الإجراء`);
  }
});
