// إعادة التقاط لقطة الإعدادات الخام لمواد المتجر (تدقيق 7a66f91، C7، قرار سلطان Q27؛ U57): كانت الصفحة تُفتح ممرَّرة إلى قسم
// «العرض» فيغيب عنوانها تحت الرأس. من بناء إنتاج مؤقت (بلا جسر تطوير) تُحقن فيه صفحة الزرع وحدها لتملأ المحفوظات (فلا يظهر
// تذكير «المحفوظات فارغة»، كما في لقطة T6) وتفعّل اللوحة وزرها، في Chrome بلا نافذة بملف تعريف مؤقت يُحذف بعده، بالمقاسين
// ومعامل 2 كما في t6-shots.mjs. تُكتب اللقطتان الخام فوق 06-settings-{wide,tall}.png في مجلد T6 الخام بعد نسخ السابقتين،
// ثم تُبنى الإطارات بـt6-art.mjs --only frames ويُبقى منها 06-settings.png وحده.
//   command node test/live/audit-c7/shots.mjs --backup <مجلد لنسخ الخامين السابقين>
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { startBrowser } from '../stores/driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const BACKUP = argv.includes('--backup') ? path.resolve(argv[argv.indexOf('--backup') + 1]) : null;
const RAW = path.join(PROFILE_ROOT, 't6-work', 'raw');
const TMP = await mkdtemp(path.join(os.tmpdir(), 'tj-c7-shots-'));
const profile = `c7-shots-${randomUUID().slice(0, 8)}`;
const out = [];

const ext = path.join(TMP, 'ext-chromium');
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--target', 'chromium', '--out', ext], { cwd: ROOT, stdio: 'ignore' });
await mkdir(path.join(ext, 'tests'), { recursive: true });
await build({
  entryPoints: [path.join(ROOT, 'test/live/audit-c7/page.js')], bundle: true, format: 'iife', target: 'es2022', outfile: path.join(ext, 'tests/c7.js'),
  absWorkingDir: ROOT, logLevel: 'silent', define: { __TJ_DEV__: 'false' },
  plugins: [{ name: 'node-stubs', setup(b) { b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: 's' })); b.onLoad({ filter: /.*/, namespace: 's' }, () => ({ contents: 'export const readFileSync = () => null; export const resolve = (...p) => p.join("/"); export const join = resolve; export const dirname = (p) => p; export const fileURLToPath = (u) => String(u); export default { readFileSync, resolve, join, dirname, fileURLToPath };', loader: 'js' })); } }],
});
await writeFile(path.join(ext, 'tests/c7.html'), '<!doctype html><meta charset="utf-8"><title>c7</title><script src="c7.js"></script>\n');

if (BACKUP) {
  await mkdir(BACKUP, { recursive: true });
  for (const sfx of ['wide', 'tall']) await copyFile(path.join(RAW, `06-settings-${sfx}.png`), path.join(BACKUP, `06-settings-${sfx}.png`)).catch(() => {});
}

let s;
try {
  s = await startBrowser('chrome', { profile, ext, downloadDir: path.join(TMP, 'dl') });
  const seeder = await s.openExt('tests/c7.html');
  for (let i = 0; i < 80 && !(await seeder.eval(() => Boolean(window.__c7?.ready)).catch(() => false)); i++) await sleep(250);
  await seeder.eval(() => window.__c7.seed({ settingsShot: true }));
  for (const [suffix, height] of [['wide', 732], ['tall', 924]]) {
    const page = await s.openExt('pages/settings/index.html#appearance');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height, deviceScaleFactor: 2, mobile: false });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await page.waitFor(() => document.readyState === 'complete' && document.fonts.status === 'loaded' && Boolean(document.querySelector('h1')), { timeoutMs: 15000 }).catch(() => null);
    await sleep(1500);
    const state = await page.eval(() => ({ scrollY: Math.round(scrollY), h1Top: Math.round(document.querySelector('h1').getBoundingClientRect().top), reminder: Boolean(document.querySelector('.st-reminder .tj-alert')) }));
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const buf = Buffer.from(data, 'base64');
    await writeFile(path.join(RAW, `06-settings-${suffix}.png`), buf);
    out.push({ name: `06-settings-${suffix}`, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), sha16: createHash('sha256').update(buf).digest('hex').slice(0, 16), ...state });
  }
  const errs = s.errors().flatMap((e) => e.errors);
  out.push({ extensionErrors: errs.length });
} finally {
  if (s) await s.close().catch(() => {});
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  await rm(path.join(PROFILE_ROOT, profile), { recursive: true, force: true }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
