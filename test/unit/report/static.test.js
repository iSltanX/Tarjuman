// أضيق استثناء لقناة البلاغات (جولة النشر T2.1): الفحص الثابت والتدقيق يقبلان طلبها وإذنها ومضيفها في ملفها وحده، ويكشفان أي طلب
// أو مضيف أو طلب إذن في غيره، وأي سطر معدَّل فيه، وأي إذن مضيف آخر. والأذونات الإلزامية كما هي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPackage } from '../../../scripts/release/audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const node = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

async function staticWith(mutate) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-report-static-'));
  try {
    await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
    await mutate(dir);
    return node([path.join(ROOT, 'scripts/check-static.mjs'), '--src', dir]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const append = async (file, text) => writeFile(file, `${await readFile(file, 'utf8')}\n${text}\n`);

test('الفحص الثابت: الشجرة الحالية ناجحة بالاستثناء المسمّى', () => {
  const r = node([path.join(ROOT, 'scripts/check-static.mjs')]);
  assert.equal(r.status, 0, r.stderr);
});

test('الفحص الثابت: طلب أو مضيف البلاغات أو طلب إذن خارج ملف القناة مكشوف', async () => {
  const r = await staticWith(async (dir) => {
    await append(path.join(dir, 'pages/settings/report.js'), 'export const x = () => globalThis.fetch("https://app-reports.isultantf.workers.dev/v1/reports");');
    await append(path.join(dir, 'background/worker.js'), 'export const y = (api) => api.permissions.request({ origins: [] });');
    await append(path.join(dir, 'content/main.js'), "export const z = 'https://app-reports.isultantf.workers.dev';");
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pages\/settings\/report\.js:\d+: طلب شبكة من الإضافة/);
  assert.match(r.stderr, /pages\/settings\/report\.js:\d+: نطاق خارجي https:\/\/app-reports/);
  assert.match(r.stderr, /background\/worker\.js:\d+: واجهة تحتاج إذنًا غير معتمد/);
  assert.match(r.stderr, /content\/main\.js:\d+: نطاق خارجي https:\/\/app-reports/);
});

test('الفحص الثابت: في ملف القناة نفسه، سطر طلب معدَّل أو مضيف آخر أو طلب إذن آخر مكشوف', async () => {
  const r = await staticWith(async (dir) => {
    const f = path.join(dir, 'core/report/client.js');
    let text = await readFile(f, 'utf8');
    text = text.replace('globalThis.fetch(url, init);', "globalThis.fetch(url, { ...init, credentials: 'include' });");
    await writeFile(f, `${text}\nexport const other = 'https://collector.example';\nexport const more = (api) => api.permissions.request({ origins: ['<all_urls>'] });\n`);
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /core\/report\/client\.js:\d+: طلب شبكة من الإضافة/);
  assert.match(r.stderr, /core\/report\/client\.js:\d+: نطاق خارجي https:\/\/collector\.example/);
  assert.match(r.stderr, /core\/report\/client\.js:\d+: واجهة تحتاج إذنًا غير معتمد/);
});

test('الفحص الثابت: إذن مضيف اختياري آخر أو إلزامي، أو غياب إذن البلاغ، مكشوف في الهدفين', async () => {
  const withManifest = (fn) => staticWith(async (dir) => {
    const p = path.join(dir, 'manifest.json');
    const m = JSON.parse(await readFile(p, 'utf8'));
    fn(m);
    await writeFile(p, JSON.stringify(m));
  });
  const extra = await withManifest((m) => { m.optional_host_permissions.push('https://api.example.com/*'); });
  assert.match(extra.stderr, /- manifest: optional_host_permissions غير المعتمد/);
  assert.match(extra.stderr, /- manifest \(firefox\): optional_host_permissions غير المعتمد/);
  const missing = await withManifest((m) => { delete m.optional_host_permissions; });
  assert.match(missing.stderr, /optional_host_permissions غير المعتمد null/);
  const host = await withManifest((m) => { m.host_permissions = ['https://app-reports.isultantf.workers.dev/*']; });
  assert.match(host.stderr, /manifest: المفتاح host_permissions غير مسموح/);
});

test('التدقيق: مضيف البلاغات خارج حزمة الإعدادات، أو طلب ثانٍ فيها، أو إذن مضيف زائد، مكشوف', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'tj-report-audit-'));
  try {
    const built = path.join(tmp, 'dist');
    assert.equal(node([path.join(ROOT, 'scripts/build.mjs'), '--out', built]).status, 0);
    assert.equal((await auditPackage(built)).ok, true);
    const variant = async (mutate) => {
      const bad = path.join(tmp, `bad-${Math.random().toString(16).slice(2)}`);
      await cp(built, bad, { recursive: true });
      await mutate(bad);
      return auditPackage(bad);
    };
    const failed = (r, id) => r.checks.find((c) => c.id === id).ok === false;
    let r = await variant((d) => append(path.join(d, 'background/worker.js'), 'var u = "https://app-reports.isultantf.workers.dev";'));
    assert.ok(failed(r, 'report-channel-settings-only'));
    r = await variant((d) => append(path.join(d, 'pages/settings/main.js'), 'globalThis.fetch(url, init);'));
    assert.ok(failed(r, 'report-channel-settings-only'));
    r = await variant(async (d) => {
      const p = path.join(d, 'manifest.json');
      const m = JSON.parse(await readFile(p, 'utf8'));
      await writeFile(p, JSON.stringify({ ...m, optional_host_permissions: [...m.optional_host_permissions, '<all_urls>'] }));
    });
    assert.ok(failed(r, 'no-host-or-optional-permissions'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
