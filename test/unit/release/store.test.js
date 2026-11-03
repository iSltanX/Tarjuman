// حزم المتاجر (جولة النشر T4): أمر واحد يبني حزم Chrome وEdge وFirefox وحزمة المصدر وSHA256SUMS؛ البيان في جذر كل حزمة،
// وتدقيق الهدف كامل، وEdge بايتات Chrome نفسها، وحزمة المصدر من قائمتها الصريحة وحدها (لا أدلة ولا تقارير ولا اختبارات)،
// وإعادة البناء منها تطابق الهدفين، والبصمات صحيحة، والفحص يكشف مسار الجهاز والرموز.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_PATHS, STORES, makeStorePackages, scanLeaks, sourceFiles, sourceReadme } from '../../../scripts/release/store.mjs';
import { readZip } from '../../../scripts/release/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(ROOT, 'src/manifest.json'), 'utf8'));
const out = await mkdtemp(path.join(os.tmpdir(), 'tj-t4-store-'));
const r = await makeStorePackages({ out });
test.after(() => rm(out, { recursive: true, force: true }));

test('رقم package.json يطابق البيان، والأمر الواحد ينجح ويكتب الحزم الأربع والبصمات', async () => {
  assert.equal(version, manifest.version);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.deepEqual(STORES.map((s) => s.store), ['chrome', 'edge', 'firefox']);
  const sums = (await readFile(path.join(out, 'SHA256SUMS'), 'utf8')).trim().split('\n').map((l) => l.split(/\s+/));
  assert.deepEqual(sums.map(([, f]) => f), ['chrome', 'edge', 'firefox', 'source'].map((s) => `tarjuman-${version}-${s}.zip`));
  for (const [hash, file] of sums) assert.equal(sha256(await readFile(path.join(out, file))), hash, file);
});

test('كل حزمة متجر: البيان في جذرها برقم الإصدار، وتدقيق هدفها كامل، والإشعارات معها، وEdge بايتات Chrome', async () => {
  const zips = {};
  for (const { store, target } of STORES) {
    const buf = await readFile(path.join(out, `tarjuman-${version}-${store}.zip`));
    zips[store] = buf;
    const entries = readZip(buf);
    const m = JSON.parse(entries.find((e) => e.name === 'manifest.json').data.toString('utf8'));
    assert.equal(m.version, version, store);
    assert.ok(entries.some((e) => e.name === 'THIRD_PARTY_NOTICES.txt'), store);
    assert.equal(target === 'firefox', Boolean(m.browser_specific_settings?.gecko), store);
    assert.deepEqual(r.meta.packages[store].audit.checks.filter((c) => !c.ok), [], store);
    assert.equal(entries.length, r.meta.packages[store].files.length);
  }
  assert.equal(Buffer.compare(zips.chrome, zips.edge), 0, 'Edge يستعمل بناء Chromium نفسه');
});

test('حزمة المصدر: قائمتها الصريحة وتعليمات البناء الإنجليزية وحدها، وإعادة البناء منها تطابق الهدفين', async () => {
  const entries = readZip(await readFile(path.join(out, `tarjuman-${version}-source.zip`)));
  const names = entries.map((e) => e.name);
  assert.ok(names.every((n) => n === 'SOURCE-README.txt' || SOURCE_PATHS.some((p) => n === p || n.startsWith(`${p}/`))), 'لا ملف خارج القائمة');
  for (const banned of [/^docs\//, /^test\//, /^tools\//, /^store\//, /^plan\//, /^dashboard\//, /node_modules/, /^dist/, /evidence/i, /\.md$/]) {
    assert.equal(names.some((n) => banned.test(n)), false, `${banned}`);
  }
  assert.deepEqual(names.filter((n) => n !== 'SOURCE-README.txt'), await sourceFiles());
  const readme = entries.find((e) => e.name === 'SOURCE-README.txt').data.toString('utf8');
  assert.equal(readme, sourceReadme(version));
  assert.match(readme, /npm ci\n {2}npm run build:firefox/);
  assert.equal(/[؀-ۿ]/.test(readme), false, 'تعليمات المراجع بالإنجليزية');
  assert.deepEqual(r.meta.source.reproduced, { chromium: true, firefox: true });
});

test('فحص التسريب يكشف مسار الجهاز والمفتاح الخاص والرمز، ولا يشتكي من الحزم النظيفة', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-t4-leak-'));
  try {
    await writeFile(path.join(dir, 'a.js'), 'const p = "/Users/someone/Projects/x";');
    await writeFile(path.join(dir, 'b.txt'), '-----BEGIN OPENSSH PRIVATE KEY-----');
    await writeFile(path.join(dir, 'c.json'), `{"t":"ghp_${'a'.repeat(36)}"}`);
    await writeFile(path.join(dir, 'd.js'), 'const ok = "https://app-reports.isultantf.workers.dev";');
    assert.deepEqual(await scanLeaks(dir, ['a.js', 'b.txt', 'c.json', 'd.js']), ['a.js: مسار من الجهاز', 'b.txt: مفتاح خاص', 'c.json: رمز GitHub']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
