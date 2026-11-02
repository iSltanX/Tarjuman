// P9-AC4 وAC5 (آلي): حزمة التثبيت الشخصي تُبنى من الإنتاج وتجتاز تدقيق الملفات المشحونة (الأذونات المعتمدة وحدها، ولا
// اتصال خارجي، وخطوط الترجمة برخصها)، والأرشيف يطابق المجلد بايتًا ويتكرر بايتًا لمحتوى واحد، والتدقيق يكشف المخالفة.
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
  assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage']);
  assert.equal(manifest.version_name, undefined, 'لا اسم إصدار تطوير');
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
