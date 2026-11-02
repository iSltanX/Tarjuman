// الفحص الثابت لإذن downloads (P10-AC8 وAC9): الأذونات المعتمدة وحدها، والعامل الخلفي بمدخل واحد، وواجهة التنزيلات في
// وحدتي الحفظ والعامل وحدهما بـdownload وsearch({ id }) لا غير. يُشغَّل الفحص على نسخة مؤقتة من src تُزرع فيها مخالفات.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const run = (src) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-static.mjs'), '--src', src], { encoding: 'utf8' });

async function withTree(mutate) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-static-'));
  try {
    await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
    await mutate(dir);
    return run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('الشجرة الحالية ناجحة: storage وunlimitedStorage وdownloads، والعامل الخلفي المعتمد', () => {
  const r = run(path.join(ROOT, 'src'));
  assert.equal(r.status, 0, r.stderr);
});

test('مخالفات التنزيلات تُكشف: خارج وحدتي الحفظ والعامل، ودوال غير download وsearch، وsearch بغير المعرّف، والمستمعات العامة', async () => {
  const r = await withTree(async (dir) => {
    await writeFile(path.join(dir, 'pages', 'library', 'evil.js'), 'export const x = () => chrome.downloads.download({ url: "data:," });\n');
    await writeFile(path.join(dir, 'core', 'save', 'evil.js'), [
      'export const a = (downloads) => downloads.erase({});',
      'export const b = (downloads) => downloads.search({ query: ["x"] });',
      'export const c = (downloads) => downloads.open(1);',
      'export const d = (downloads) => downloads.onChanged.addListener(() => {});',
      'export const e = () => chrome.downloads;',
      'export const f = (x) => x.onDeterminingFilename.addListener(() => {});',
      'export const g = (downloads, id) => downloads.search({ id });',
      '',
    ].join('\n'));
  });
  assert.equal(r.status, 1);
  const out = r.stderr;
  assert.match(out, /pages\/library\/evil\.js:1: واجهة التنزيلات خارج/);
  assert.match(out, /core\/save\/evil\.js:1: downloads\.erase غير مسموح/);
  assert.match(out, /core\/save\/evil\.js:2: downloads\.search بالمعرّف وحده/);
  assert.match(out, /core\/save\/evil\.js:3: downloads\.open غير مسموح/);
  assert.match(out, /core\/save\/evil\.js:4: downloads\.onChanged غير مسموح/);
  assert.match(out, /core\/save\/evil\.js:5: وصول غير مراجَع إلى كائن التنزيلات/);
  assert.match(out, /core\/save\/evil\.js:6: مستمع يمس كل تنزيلات المتصفح/);
  assert.doesNotMatch(out, /evil\.js:7:/, 'search({ id }) مسموح');
});

test('البيان: إذن غير معتمد، وعامل خلفي بمدخل آخر أو بنوع وحدة، مخالفات', async () => {
  const mutateManifest = (fn) => withTree(async (dir) => {
    const p = path.join(dir, 'manifest.json');
    const m = JSON.parse(await readFile(p, 'utf8'));
    fn(m);
    await writeFile(p, JSON.stringify(m));
  });
  const tabs = await mutateManifest((m) => { m.permissions.push('tabs'); });
  assert.match(tabs.stderr, /manifest: الأذونات/);
  const bg = await mutateManifest((m) => { m.background = { service_worker: 'background/worker.js', type: 'module' }; });
  assert.match(bg.stderr, /manifest: background غير المعتمد/);
  const host = await mutateManifest((m) => { m.host_permissions = ['<all_urls>']; });
  assert.match(host.stderr, /manifest: المفتاح host_permissions غير مسموح/);
});

test('تدقيق 5fedcb9 (GM-017.2): «/*» داخل سلسلة أو تعبير نمطي لا يفتح تعليقًا يُعمي الفحص عن بقية الملف، والتعليقات الحقيقية تُنزع', async () => {
  const r = await withTree(async (dir) => {
    await writeFile(path.join(dir, 'pages', 'library', 'blind.js'), [
      "export const match = ['https://www.youtube.com/*'];",
      'export const glob = /^a\\/*b$/;',
      'export const x = () => eval("1");',
      '/* تعليق حقيقي: eval( لا يُحسب */ export const y = 1;',
      'export const css = `a { color: red; } /* ملاحظة */`;',
      "export const z = () => fetch('https://collector.example/x');",
      '',
    ].join('\n'));
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /blind\.js:3: تنفيذ نص كشيفرة ممنوع/, 'السطر بعد السلسلة مفحوص');
  assert.doesNotMatch(r.stderr, /blind\.js:4: تنفيذ نص/, 'ما في التعليق لا يُحسب');
  assert.match(r.stderr, /blind\.js:6: طلب شبكة من الإضافة/);
  assert.match(r.stderr, /blind\.js:6: نطاق خارجي https:\/\/collector\.example/);
});
