// بلا خادم بلاغات (و1، 2.2.0، قرار سلطان ق3): لا قناة ولا استثناء لها. الفحص الثابت والتدقيق يكشفان أي طلب أو مضيف بلاغات أو
// طلب إذن في أي ملف، وأي إذن مضيف اختياري أو إلزامي في البيان بهدفيه. والأذونات الإلزامية كما هي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

test('الفحص الثابت: الشجرة الحالية ناجحة، ولا ملف لعميل الإرسال', () => {
  const r = node([path.join(ROOT, 'scripts/check-static.mjs')]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(path.join(ROOT, 'src/core/report/client.js')), false);
});

test('الفحص الثابت: طلب أو مضيف البلاغات أو طلب إذن في أي ملف، ومنه ملف البلاغ في الإعدادات، مكشوف', async () => {
  const r = await staticWith(async (dir) => {
    await append(path.join(dir, 'pages/settings/report.js'), 'export const x = () => globalThis.fetch("https://app-reports.isultantf.workers.dev/v1/reports");');
    await append(path.join(dir, 'core/report/messages.js'), 'export const y = (api) => api.permissions.request({ origins: [] });');
    await append(path.join(dir, 'content/main.js'), "export const z = 'https://app-reports.isultantf.workers.dev';");
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pages\/settings\/report\.js:\d+: طلب شبكة من الإضافة/);
  assert.match(r.stderr, /pages\/settings\/report\.js:\d+: نطاق خارجي https:\/\/app-reports/);
  assert.match(r.stderr, /core\/report\/messages\.js:\d+: واجهة تحتاج إذنًا غير معتمد/);
  assert.match(r.stderr, /content\/main\.js:\d+: نطاق خارجي https:\/\/app-reports/);
});

// الفكرة ٣-أ (ح-39): سطر طلب مراجَع ثانٍ في ملف موافقة ثانٍ، إعادة طلب إذن يوتيوب نفسه. كل سطر في ملفه وحده، حرفيًا.
test('الفحص الثابت: سطرا الطلب المراجَعان كلٌّ في ملفه وحده، وأي تغيير فيهما أو نقل مكشوف', async () => {
  const YT_LINE = 'return Promise.resolve(api.permissions.request({ origins: [...YOUTUBE_MATCHES] })).then((granted) => granted === true, () => false);';
  const THUMBS_LINE = 'return Promise.resolve(api.permissions.request({ data_collection: [THUMBS_DATA] })).then((granted) => granted === true, () => false);';
  const source = await readFile(path.join(ROOT, 'src/core/consent/youtube-access.js'), 'utf8');
  assert.equal(source.split('\n').filter((l) => l.trim() === YT_LINE).length, 1, 'السطر المراجَع في ملفه مرة واحدة');
  const r = await staticWith(async (dir) => {
    await append(path.join(dir, 'pages/popup/status.js'), `export const a = (api) => { ${YT_LINE} };`);
    await append(path.join(dir, 'core/consent/youtube-access.js'), `export const b = (api) => { ${THUMBS_LINE} };`);
    await append(path.join(dir, 'core/consent/thumbnails.js'), `export const c = (api) => { ${YT_LINE} };`);
    await append(path.join(dir, 'core/consent/youtube-access.js'), "export const d = (api) => api.permissions.request({ origins: ['<all_urls>'] });");
  });
  assert.equal(r.status, 1);
  const flagged = r.stderr.split('\n').filter((l) => l.includes('واجهة تحتاج إذنًا غير معتمد')).map((l) => l.replace(/:\d+:.*/, '').replace(/^- /, ''));
  assert.deepEqual(flagged.sort(), ['core/consent/thumbnails.js', 'core/consent/youtube-access.js', 'core/consent/youtube-access.js', 'pages/popup/status.js'].map((p) => p.split('/').join(path.sep)).sort());
});

test('الفحص الثابت: أي إذن مضيف اختياري أو إلزامي مكشوف في الهدفين', async () => {
  const withManifest = (fn) => staticWith(async (dir) => {
    const p = path.join(dir, 'manifest.json');
    const m = JSON.parse(await readFile(p, 'utf8'));
    fn(m);
    await writeFile(p, JSON.stringify(m));
  });
  const optional = await withManifest((m) => { m.optional_host_permissions = ['https://app-reports.isultantf.workers.dev/*']; });
  assert.match(optional.stderr, /- manifest: المفتاح optional_host_permissions غير مسموح/);
  assert.match(optional.stderr, /- manifest \(firefox\): المفتاح optional_host_permissions غير مسموح/);
  const host = await withManifest((m) => { m.host_permissions = ['https://app-reports.isultantf.workers.dev/*']; });
  assert.match(host.stderr, /manifest: المفتاح host_permissions غير مسموح/);
});

test('التدقيق: الحزمة بلا قناة بلاغات؛ ومضيفها في أي ملف، أو طلب في حزمة الإعدادات، أو إذن مضيف اختياري، مكشوف', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'tj-report-audit-'));
  try {
    const built = path.join(tmp, 'dist');
    assert.equal(node([path.join(ROOT, 'scripts/build.mjs'), '--out', built]).status, 0);
    const good = await auditPackage(built);
    assert.equal(good.ok, true);
    assert.ok(good.checks.find((c) => c.id === 'no-report-channel').ok);
    const variant = async (mutate) => {
      const bad = path.join(tmp, `bad-${Math.random().toString(16).slice(2)}`);
      await cp(built, bad, { recursive: true });
      await mutate(bad);
      return auditPackage(bad);
    };
    const failed = (r, id) => r.checks.find((c) => c.id === id).ok === false;
    let r = await variant((d) => append(path.join(d, 'background/worker.js'), 'var u = "https://app-reports.isultantf.workers.dev";'));
    assert.ok(failed(r, 'no-report-channel'));
    r = await variant((d) => append(path.join(d, 'pages/settings/main.js'), 'globalThis.fetch(url, init);'));
    assert.ok(failed(r, 'no-report-channel'));
    assert.ok(good.checks.find((c) => c.id === 'permissions-request-settings-only').ok);
    r = await variant((d) => append(path.join(d, 'background/worker.js'), 'var q = (api) => api.permissions.request({ origins: [] });'));
    assert.ok(failed(r, 'permissions-request-settings-only'));
    r = await variant(async (d) => {
      const p = path.join(d, 'manifest.json');
      const m = JSON.parse(await readFile(p, 'utf8'));
      await writeFile(p, JSON.stringify({ ...m, optional_host_permissions: ['https://app-reports.isultantf.workers.dev/*'] }));
    });
    assert.ok(failed(r, 'no-host-or-optional-permissions'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
