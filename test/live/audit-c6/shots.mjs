#!/usr/bin/env node
// لقطات «قبل وبعد» للقرار Q26 (تدقيق 7a66f91، C6، U48): النص الخافت على صبغة المحدد الخفيفة في الوضع الداكن، في صفحتين من صفحات
// الإضافة: البطاقة النشطة في المحفوظات (تعليقها وسطر السابقة)، والصف المحدد في المحرّر (رقمه ومدته ومرجعه الإنجليزي). بلا نافذة، في
// Chrome، بملف تعريف مؤقت وبذرة المحفوظات القليلة (test/live/ui/seed.mjs)، بلا يوتيوب ولا شبكة إلا صور المحفوظات. ومعها اللون
// المحسوب لكل نص خافت ونسبة تباينه على خلفيته كما يرسمها المتصفح.
//   command node test/live/audit-c6/shots.mjs --out <مجلد> [--tree 1396fcc]
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { emulateScheme } from '../harness/extension.mjs';
import { SEED_IDS, buildSeedFew, storageItems } from '../ui/seed.mjs';
import { startBrowser } from '../stores/driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const TREE = val('tree', null);
const OUT = path.resolve(val('out', path.join(os.tmpdir(), 'tj-c6-shots')), TREE ? `before-${TREE}` : 'after');
const TMP = await mkdtemp(path.join(os.tmpdir(), 'tj-c6-shots-'));
const EXT = path.join(TMP, 'ext');
const profile = `chrome-c6-shots-${Date.now()}`;
const result = { tree: TREE ?? 'current', at: new Date().toISOString(), shots: [], colors: {} };

async function treeRoot() {
  if (!TREE) return ROOT;
  const dir = path.join(TMP, 'tree');
  await mkdir(dir, { recursive: true });
  const tar = path.join(TMP, 'tree.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, TREE], { cwd: ROOT });
  execFileSync('tar', ['-xf', tar, '-C', dir]);
  await symlink(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  return dir;
}

/** لقطة لمنطقة عنصر بضعف الدقة (Page.captureScreenshot بقصاصة)، بهامش حوله. */
async function clip(page, selector, name, pad = 12) {
  const r = await page.eval((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const b = e.getBoundingClientRect();
    return { x: b.left, y: b.top, width: b.width, height: b.height };
  }, { args: [selector] });
  if (!r) throw new Error(`لا عنصر ${selector}`);
  await sleep(300);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + 2 * pad, height: r.height + 2 * pad, scale: 2 }, captureBeyondViewport: true });
  const f = path.join(OUT, `${name}.png`);
  await writeFile(f, Buffer.from(data, 'base64'));
  result.shots.push(path.relative(ROOT, f));
}

/** لون النص الخافت وخلفيته الفعلية (أقرب سلف بخلفية غير شفافة) لكل محدد. */
const colors = (page, sels) => page.eval((list) => Object.fromEntries(list.map((sel) => {
  const e = document.querySelector(sel);
  if (!e) return [sel, null];
  let bg = 'rgba(0, 0, 0, 0)';
  for (let n = e; n && bg.replace(/\s/g, '').endsWith(',0)'); n = n.parentElement) bg = getComputedStyle(n).backgroundColor;
  return [sel, { color: getComputedStyle(e).color, bg }];
})), { args: [sels] });

await mkdir(OUT, { recursive: true });
const tree = await treeRoot();
execFileSync(process.execPath, [path.join(tree, 'scripts/build.mjs'), '--dev', '--target', 'chromium', '--out', EXT], { cwd: tree, stdio: 'ignore' });
let s = null;
try {
  s = await startBrowser('chrome', { profile, ext: EXT, downloadDir: path.join(TMP, 'dl'), headless: true });
  const lib = await s.openExt('pages/library/index.html');
  await lib.eval((obj) => chrome.storage.local.set(obj), { args: [storageItems(buildSeedFew(Date.now()).items)] });
  await emulateScheme(lib, 'dark');
  await lib.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await lib.reload();
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 4, { timeoutMs: 10000 });
  const toggle = await lib.centerOf(`li.lib-row[data-video="${SEED_IDS.ted}"] .lib-toggle`);
  await lib.click(toggle.x, toggle.y);
  await lib.waitFor(() => !!document.querySelector('.lib-card--active'), { timeoutMs: 5000 });
  await sleep(500);
  result.colors.library = await colors(lib, ['.lib-card--active .tj-caption', '.lib-card--active .lib-prevl', `li.lib-row[data-video="${SEED_IDS.ted}"] .lib-row__id`]);
  await clip(lib, '.lib-card--active', 'library-active-card-dark');

  const ed = await s.openExt(`pages/editor/index.html?v=${SEED_IDS.ted}`);
  await emulateScheme(ed, 'dark');
  await ed.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await ed.reload();
  await ed.waitFor(() => document.querySelectorAll('.ed-row').length > 3, { timeoutMs: 15000 });
  const box = await ed.centerOf('.ed-row[data-index="1"] .ed-row__check');
  await ed.click(box.x, box.y);
  await ed.waitFor(() => !!document.querySelector('.ed-row.is-selected'), { timeoutMs: 5000 });
  await sleep(400);
  result.colors.editor = await colors(ed, ['.ed-row.is-selected .ed-row__n', '.ed-row.is-selected .ed-row__dur', '.ed-row.is-selected .ed-row__en']);
  await clip(ed, '.ed-row.is-selected', 'editor-selected-row-dark');
} finally {
  await s?.close?.().catch(() => {});
  await writeFile(path.join(OUT, 'shots.json'), `${JSON.stringify(result, null, 2)}\n`);
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  await rm(path.join(PROFILE_ROOT, profile), { recursive: true, force: true }).catch(() => {});
  console.log(JSON.stringify(result, null, 1));
}
