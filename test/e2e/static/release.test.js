// P9-AC4 وAC5، وP15-AC4 وAC6 للإصدار الثاني (آلي): حزمة التثبيت الشخصي تُبنى من الإنتاج وتجتاز تدقيق الملفات المشحونة
// (الأذونات المعتمدة وحدها ومنها downloads، والعامل الخلفي للحفظ وحده، ولا اتصال خارجي، وخطوط الترجمة برخصها)، والأرشيف
// يطابق المجلد بايتًا ويتكرر بايتًا لمحتوى واحد، والتدقيق يكشف المخالفة.
//   node scripts/run-tests.mjs test/e2e/static
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makePackage } from '../../../scripts/release/package.mjs';
import { auditPackage } from '../../../scripts/release/audit.mjs';
import { createZip, readZip } from '../../../scripts/release/zip.mjs';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'tj-p9-release-'));
const pkg = await makePackage({ out: tmp });
test.after(() => rm(tmp, { recursive: true, force: true }));

test('الحزمة: بناء الإنتاج باسم الإصدار، والتدقيق ناجح بكل فحوصه، والأرشيف يطابق المجلد', async () => {
  assert.equal(pkg.ok, true);
  assert.match(pkg.name, /^tarjuman-\d+\.\d+\.\d+$/);
  assert.deepEqual(pkg.meta.audit.checks.filter((c) => !c.ok), []);
  assert.equal(pkg.meta.zip.verified, true);
  const entries = readZip(await readFile(pkg.zip));
  assert.equal(entries.length, pkg.meta.files.length);
  assert.ok(entries.every((e) => e.name.startsWith(`${pkg.name}/`)), 'مجلد واحد باسم الإصدار داخل الأرشيف');
  const manifest = JSON.parse(entries.find((e) => e.name === `${pkg.name}/manifest.json`).data.toString('utf8'));
  assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage', 'downloads']);
  assert.deepEqual(manifest.background, { service_worker: 'background/worker.js' });
  // رفع رقم البيان للإصدار الثاني قرار للمنسّق أو لسلطان (known-limitations)، فلا يُثبَّت رقم بعينه هنا.
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version_name, undefined, 'لا اسم إصدار تطوير');
  assert.ok(pkg.meta.files.some((f) => f.path === 'background/worker.js'), 'العامل الخلفي في الحزمة');
});

test('الحزمة تضم ملف رخصة OFL لكل خط ترجمة مضمّن، ولا خطاف تطوير فيها', async () => {
  const names = pkg.meta.files.map((f) => f.path);
  for (const id of ['almarai', 'noto-sans-arabic', 'tajawal', 'markazi']) {
    assert.ok(names.includes(`ui/fonts/subtitle/${id}-OFL.txt`), id);
    assert.ok(names.includes(`ui/fonts/subtitle/${id}-400.woff2`) && names.includes(`ui/fonts/subtitle/${id}-700.woff2`), id);
  }
  const content = await readFile(path.join(pkg.dir, 'content/main.js'), 'utf8');
  assert.equal(content.includes('__tarjuman'), false);
});

test('الأرشيف حتمي: المحتوى نفسه يعطي البايتات نفسها', () => {
  const entries = [{ name: 'a/x.txt', data: Buffer.from('ترجمان') }, { name: 'a/y.bin', data: Buffer.from([0, 1, 2, 255]) }];
  const a = createZip(entries);
  const b = createZip(entries);
  assert.equal(Buffer.compare(a, b), 0);
  assert.deepEqual(readZip(a).map((e) => [e.name, e.data.toString('hex')]), entries.map((e) => [e.name, e.data.toString('hex')]));
});

test('التدقيق يكشف المخالفات: إذن زائد، وطلب شبكة إلى نطاق خارجي، ورابط غير مسموح، ورخصة خط ناقصة', async () => {
  const bad = await mkdtemp(path.join(os.tmpdir(), 'tj-p9-bad-'));
  try {
    await cp(pkg.dir, bad, { recursive: true });
    const mf = JSON.parse(await readFile(path.join(bad, 'manifest.json'), 'utf8'));
    await writeFile(path.join(bad, 'manifest.json'), JSON.stringify({ ...mf, permissions: [...mf.permissions, 'tabs'], host_permissions: ['<all_urls>'] }));
    const lib = path.join(bad, 'pages/library/main.js');
    await writeFile(lib, `${await readFile(lib, 'utf8')}\nfetch("https://collector.example/x");\n`);
    await rm(path.join(bad, 'ui/fonts/subtitle/tajawal-OFL.txt'));
    const r = await auditPackage(bad);
    const failed = r.checks.filter((c) => !c.ok).map((c) => c.id);
    assert.equal(r.ok, false);
    for (const id of ['permissions-approved-only', 'no-host-or-optional-permissions', 'no-external-connection-or-forbidden-code', 'subtitle-fonts-with-ofl-licenses']) {
      assert.ok(failed.includes(id), `لم يُكشف ${id}`);
    }
    const net = r.checks.find((c) => c.id === 'no-external-connection-or-forbidden-code').detail.problems.map((p) => p.why);
    assert.ok(net.includes('طلب شبكة') && net.includes('رابط خارجي غير مسموح'));
  } finally {
    await rm(bad, { recursive: true, force: true });
  }
});

test('التدقيق يحصر التنزيلات في الحفظ (عقد interfaces §١٣): download وsearch من الصفحات والعامل مسموحان، وغيرهما بالنقطة أو ?. مخالفة، ولا تنزيلات في عالم الصفحة، ولا عامل آخر', async () => {
  const bad = await mkdtemp(path.join(os.tmpdir(), 'tj-p15-bad-'));
  try {
    await cp(pkg.dir, bad, { recursive: true });
    const lib = path.join(bad, 'pages/library/main.js');
    // صفحة الإضافة تحفظ مباشرة (core/save): ليس مخالفة. والفتح والحذف بأي صيغة مخالفة (كان ?. يفلت قبل تدقيق 5fedcb9).
    await writeFile(lib, `${await readFile(lib, 'utf8')}\nchrome.downloads.download({ url: "blob:x" });\nglobalThis.chrome?.downloads?.show(1);\n`);
    const worker = path.join(bad, 'background/worker.js');
    await writeFile(worker, `${await readFile(worker, 'utf8')}\nchrome.downloads.open(1); chrome.downloads.removeFile(1);\n`);
    const capture = path.join(bad, 'main-world/capture.js');
    await writeFile(capture, `${await readFile(capture, 'utf8')}\nwindow.chrome?.downloads;\n`);
    let r = await auditPackage(bad);
    const why = r.checks.find((c) => c.id === 'no-external-connection-or-forbidden-code').detail.problems;
    assert.ok(why.some((p) => p.file === 'pages/library/main.js' && p.why === 'استعمال للتنزيلات خارج الحفظ'), 'show بـ?. مكشوف');
    assert.ok(why.some((p) => p.file === 'background/worker.js' && p.why === 'استعمال للتنزيلات خارج الحفظ'));
    assert.ok(why.some((p) => p.file === 'main-world/capture.js' && p.why === 'واجهة التنزيلات في عالم الصفحة'));
    assert.ok(!why.some((p) => p.why === 'واجهة التنزيلات خارج العامل'), 'لا قاعدة «العامل وحده» تخالف العقد');

    const mf = JSON.parse(await readFile(path.join(bad, 'manifest.json'), 'utf8'));
    await writeFile(path.join(bad, 'manifest.json'), JSON.stringify({ ...mf, background: { service_worker: 'background/other.js', type: 'module' } }));
    r = await auditPackage(bad);
    assert.equal(r.checks.find((c) => c.id === 'save-worker-only-and-no-externally-connectable').ok, false);
  } finally {
    await rm(bad, { recursive: true, force: true });
  }
});

test('تدقيق 5fedcb9 (CX-007، GM-028): حزمة ينقصها ملف يشير إليه البيان أو صفحة أو نمط، أو خط واجهة أو رخصته، تفشل', async () => {
  const cases = [
    ['content/main.js', 'required-assets-present'],
    ['background/worker.js', 'required-assets-present'],
    ['pages/editor/editor.css', 'required-assets-present'],
    ['pages/popup/index.html', 'required-assets-present'],
    ['icons/tarjuman-icon-48.png', 'required-assets-present'],
    ['ui/tokens.css', 'required-assets-present'],
    ['ui/fonts/ui/cairo-800.woff2', 'ui-fonts-with-ofl-licenses'],
    ['ui/fonts/ui/cairo-OFL.txt', 'ui-fonts-with-ofl-licenses'],
  ];
  for (const [file, id] of cases) {
    const bad = await mkdtemp(path.join(os.tmpdir(), 'tj-audit-missing-'));
    try {
      await cp(pkg.dir, bad, { recursive: true });
      await rm(path.join(bad, file));
      const r = await auditPackage(bad);
      assert.equal(r.ok, false, `${file}: التدقيق لا ينجح`);
      assert.equal(r.checks.find((c) => c.id === id).ok, false, `${file}: ${id}`);
    } finally {
      await rm(bad, { recursive: true, force: true });
    }
  }
  // ملف موجود فارغ كذلك.
  const empty = await mkdtemp(path.join(os.tmpdir(), 'tj-audit-empty-'));
  try {
    await cp(pkg.dir, empty, { recursive: true });
    await writeFile(path.join(empty, 'content/main.js'), '');
    const r = await auditPackage(empty);
    assert.deepEqual(r.checks.find((c) => c.id === 'required-assets-present').detail.missing, ['content/main.js (فارغ)']);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});
