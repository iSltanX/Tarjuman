// تدقيق 7a66f91، C8: الوثائق الحاكمة والصيانة تطابق المستودع.
// - U64: AGENTS.md (ومعه GEMINI.md) كان يوجّه إلى release/tarjuman-1.0.0 فيفشل بـENOENT، ويقول «Chrome وBrave» و«لا اتصال خارجي».
// - U67: دليل الصيانة ووثيقة النشر كانا يوصيان بـsurfaces.mjs المنجرف (25/36). فلا توصية بسكربت موسوم «مستبدَل» أو «تاريخي».
// - U103: لا يستورد اختبار وحدة ملفًا تحت test/live أو test/e2e/live (استيرادها قد يفتح متصفحًا).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8');
const { version } = JSON.parse(await read('src/manifest.json'));
async function walk(dir) {
  const out = [];
  for (const e of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(rel)));
    else out.push(rel);
  }
  return out;
}

test('U64: AGENTS.md لا يذكر حزمة برقم غير رقم البيان، ويذكر المتصفحات الأربعة والاستثناءين في PRIVACY.md وحزم المتاجر', async () => {
  const agents = await read('AGENTS.md');
  const stale = [...agents.matchAll(/release\/tarjuman-(\d+\.\d+\.\d+)/g)].map((m) => m[1]).filter((v) => v !== version);
  assert.deepEqual(stale, [], `حزم بأرقام غير ${version}`);
  for (const b of ['Chrome', 'Edge', 'Brave', 'Firefox']) assert.ok(agents.includes(b), b);
  assert.match(agents, /PRIVACY\.md/);
  assert.match(agents, /release\/store\//);
  assert.match(agents, /SHA256SUMS/);
  assert.doesNotMatch(agents, /\*\*الخصوصية والأمان:\*\* لا اتصال خارجي،/, 'لا «لا اتصال خارجي» مطلقًا');
  // أمر التدقيق في AGENTS.md يشتق المجلد من البيان.
  assert.match(agents, /release\/tarjuman-\$\(command node -p "require\('\.\/src\/manifest\.json'\)\.version"\)/);
  assert.match(await read('GEMINI.md'), /^@\.\/AGENTS\.md$/m);
});

/** رأس السكربت (أسطره الأولى) يسمه مستبدَلًا أو تاريخيًا. */
const RETIRED = /^\/\/ (?:مستبدَل|مستبدل|تاريخي)[\s:(]/m;

test('U67: وثائق الصيانة والتشغيل لا توصي بسكربت موسوم مستبدَلًا أو تاريخيًا، إلا في سطر يقول ذلك', async () => {
  const scripts = (await walk('test')).filter((f) => f.endsWith('.mjs'));
  const retired = [];
  for (const f of scripts) if (RETIRED.test((await read(f)).split('\n').slice(0, 6).join('\n'))) retired.push(f);
  // الحارس يتعرّف رأس السكربت المستبدَل (حُذفت السكربتات المستبدَلة نفسها في تنظيف المستودع).
  assert.ok(RETIRED.test('// مستبدَل (سبب): بديله سكربت آخر') && RETIRED.test('// تاريخي: واجهة قديمة') && !RETIRED.test('// اختبار حي دائم'));
  const problems = [];
  for (const doc of ['docs/maintenance.md', 'docs/development.md', 'AGENTS.md', 'CLAUDE.md', 'test/e2e/README.md', 'test/live/harness/README.md']) {
    (await read(doc)).split('\n').forEach((line, i) => {
      for (const f of retired) {
        // بالمسار، أو بالاسم وحده إن لم يشاركه سكربت آخر (فـv2.mjs لا يُنسب إلى غير صاحبه).
        const base = path.posix.basename(f);
        const unique = scripts.filter((x) => path.posix.basename(x) === base).length === 1;
        if ((line.includes(f) || (unique && line.includes(base))) && !/مستبدَل|مستبدل|تاريخي/.test(line)) problems.push(`${doc}:${i + 1}: ${f}`);
      }
    });
  }
  assert.deepEqual(problems, []);
});

test('U103: لا يستورد اختبار وحدة ولا مساعد ملفًا تحت test/live أو test/e2e/live', async () => {
  const files = [...(await walk('test/unit')), ...(await walk('test/helpers'))].filter((f) => /\.(?:m?js)$/.test(f));
  const bad = [];
  for (const f of files) {
    const text = await read(f);
    // from '…'، وimport('…')، والاستيراد لأثره وحده import '…'.
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"`]([^'"`]+)['"`]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      if (m[1].startsWith('.') && /^test\/(?:live|e2e\/live)\//.test(target)) bad.push(`${f} ← ${m[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});
