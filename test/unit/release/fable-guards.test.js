// تدقيق Fable (FA-02، وFA-19 لأدنى الإصدار): ثغرات في الحارسين الثابتين بصيغ بسيطة، ثبتت بشجرة وحزمة مصطنعتين.
// - check-static: window.eval( وglobalThis.eval( (النظر الخلفي كان يستثني النقطة)، والتخزين بالسلسلة الاختيارية
//   (api.storage?.local وchrome?.storage)، والكتابة area?.set(، وشيفرة داخل HTML (سكربت بلا src ومعالج on…= ورابط javascript:).
// - release/audit: ملف مشحون لا يشير إليه شيء (البناء ينسخ كل .html و.css تحت pages وui) كان يمر بنمط الاسم وحده، ومعه ملفان
//   مهملان يشير أحدهما إلى الآخر؛ وشيفرة داخل HTML الحزمة.
// - أدنى إصدار Chromium (قرار Q09 = 130) لم يكن محروسًا في الحارسين.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeViolations } from '../../../scripts/code-rules.mjs';
import { auditPackage } from '../../../scripts/release/audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const node = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
const staticCheck = (src) => node([path.join(ROOT, 'scripts/check-static.mjs'), '--src', src]);
const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tj-fable-guards-')));
test.after(() => rm(tmp, { recursive: true, force: true }));

/** نسخة من src بلا الخطوط (لا يحتاجها الفحص) تُزرع فيها المخالفات. */
async function srcCopy(name) {
  const dir = path.join(tmp, name);
  await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
  return dir;
}

const JS_BYPASSES = {
  'window.eval(': 'export const a = () => window.eval("1");',
  'globalThis.eval(': 'export const b = () => globalThis.eval("1");',
  'api.storage?.local': 'export const c = (api) => api.storage?.local.get(null);',
  'chrome?.storage?.local': 'export const d = () => globalThis.chrome?.storage?.local;',
  "storage?.['local']": "export const e = (api) => api.storage?.['local'];",
  'area?.set(': 'export const f = (area) => area?.set({});',
};

test('FA-02: الفحص الثابت يكشف eval بعد نقطة والتخزين والكتابة بالسلسلة الاختيارية، ولا يكشف شيئًا في المصدر نفسه', async () => {
  const dir = await srcCopy('src-js');
  const labels = Object.keys(JS_BYPASSES);
  for (const [i, label] of labels.entries()) await writeFile(path.join(dir, 'pages', 'library', `fable-${i}.js`), `${JS_BYPASSES[label]}\n`);
  const r = staticCheck(dir);
  assert.equal(r.status, 1);
  const missed = labels.filter((_, i) => !r.stderr.includes(path.join('pages', 'library', `fable-${i}.js`)));
  assert.deepEqual(missed, [], 'صيغ أفلتت من الفحص الثابت');
  assert.equal(r.stderr.split('\n').filter((l) => l.startsWith('- ') && !l.includes('fable-')).length, 0, 'لا مخالفة في المصدر الحقيقي');
  assert.equal(node([path.join(ROOT, 'scripts/check-static.mjs')]).status, 0);
});

test('FA-02: قاعدة eval المشتركة تمنع الاسم بعد نقطة، ولا تمنع ما يشبهه (evaluate وretrieval)', () => {
  for (const bad of ['window.eval("1")', 'globalThis.eval(x)', 'self . eval(x)']) assert.deepEqual(codeViolations(bad).map((r) => r.id), ['eval'], bad);
  for (const ok of ['page.evaluate(fn)', 'const retrieval = 1;', 'x.medieval = 2;']) assert.deepEqual(codeViolations(ok).map((r) => r.id), [], ok);
});

test('FA-02: الفحص الثابت يرفض شيفرة داخل HTML: سكربت بلا src، ومعالج حدث في سمة، ورابط javascript:', async () => {
  const cases = {
    'سكربت بلا src': '<script>alert(1)</script>',
    'معالج حدث': '<button type="button" onclick="go()">x</button>',
    'javascript:': '<a href="javascript:void(0)">x</a>',
  };
  for (const [label, snippet] of Object.entries(cases)) {
    const dir = await srcCopy(`src-html-${Object.keys(cases).indexOf(label)}`);
    const page = path.join(dir, 'pages', 'popup', 'index.html');
    await writeFile(page, (await readFile(page, 'utf8')).replace('</body>', `${snippet}\n</body>`));
    const r = staticCheck(dir);
    assert.equal(r.status, 1, label);
    assert.match(r.stderr, /pages\/popup\/index\.html: /, label);
  }
});

test('FA-19: أدنى إصدار Chromium في البيان محروس (130، Q09)', async () => {
  const dir = await srcCopy('src-min');
  const p = path.join(dir, 'manifest.json');
  const m = JSON.parse(await readFile(p, 'utf8'));
  m.minimum_chrome_version = '120';
  await writeFile(p, JSON.stringify(m, null, 2));
  const r = staticCheck(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /minimum_chrome_version "120"/);
});

// ---- تدقيق الحزمة ----
const built = path.join(tmp, 'pkg');
assert.equal(node([path.join(ROOT, 'scripts/build.mjs'), '--out', built]).status, 0);

async function pkgCopy(name, mutate) {
  const dir = path.join(tmp, name);
  await cp(built, dir, { recursive: true });
  await mutate(dir);
  return auditPackage(dir);
}
const failed = (r) => r.checks.filter((c) => !c.ok).map((c) => c.id);

test('FA-02: الحزمة السليمة ناجحة، وكل ملف فيها يشير إليه البيان أو صفحة أو نمط أو قائمة الخطوط', async () => {
  const r = await auditPackage(built);
  assert.deepEqual(failed(r), []);
  // 17 منذ تحقق 2.3.0 (ص-١٨): commands-known-without-keys.
  assert.equal(r.checks.length, 17);
});

test('FA-02: ملف مشحون لا يشير إليه شيء يُرفض ولو طابق نمط الاسم، ومثله ملفان مهملان يشير أحدهما إلى الآخر', async () => {
  const stray = await pkgCopy('pkg-stray', async (dir) => {
    await writeFile(path.join(dir, 'pages', 'library', 'scratch.css'), '.x { color: red; }\n');
    await writeFile(path.join(dir, 'pages', 'settings', 'draft.html'), '<!doctype html><title>x</title>\n');
    await writeFile(path.join(dir, 'pages', 'editor', 'old.js'), 'export {};\n');
    await writeFile(path.join(dir, 'ui', 'old-a.css'), '@import url("old-b.css");\n');
    await writeFile(path.join(dir, 'ui', 'old-b.css'), '.y { background: url("old-a.css"); }\n');
  });
  const c = stray.checks.find((x) => x.id === 'only-expected-files');
  assert.equal(c.ok, false);
  assert.deepEqual(c.detail.unexpected.sort(), ['pages/editor/old.js', 'pages/library/scratch.css', 'pages/settings/draft.html', 'ui/old-a.css', 'ui/old-b.css']);
});

test('FA-02: شيفرة داخل HTML الحزمة تُرفض في فحص الشيفرة المشحونة', async () => {
  const r = await pkgCopy('pkg-inline', async (dir) => {
    const page = path.join(dir, 'pages', 'library', 'index.html');
    await writeFile(page, (await readFile(page, 'utf8')).replace('</body>', '<img src="x.png" onerror="go()"><script>go()</script>\n</body>'));
  });
  const c = r.checks.find((x) => x.id === 'no-external-connection-or-forbidden-code');
  assert.equal(c.ok, false);
  const whys = c.detail.problems.filter((p) => p.file === 'pages/library/index.html').map((p) => p.why);
  assert.ok(whys.some((w) => /سكربت داخل HTML/.test(w)) && whys.some((w) => /معالج حدث/.test(w)), JSON.stringify(whys));
});

test('FA-19: أدنى إصدار Chromium في بيان الحزمة محروس في فحص إعدادات الهدف', async () => {
  const r = await pkgCopy('pkg-min', async (dir) => {
    const p = path.join(dir, 'manifest.json');
    const m = JSON.parse(await readFile(p, 'utf8'));
    delete m.minimum_chrome_version;
    await writeFile(p, JSON.stringify(m, null, 2));
  });
  assert.deepEqual(failed(r), ['target-browser-settings']);
});

test('تحقق 2.3.0 (ص-١٨): طلب الإذن بالأقواس أو بالسلسلة الاختيارية خارج حزمة الإعدادات يُرفض في التدقيق كالنقطة', async () => {
  for (const [i, call] of ["api.permissions['request']({ origins: ['https://*/*'] })", "api.permissions?.request({ origins: ['https://*/*'] })", "api.permissions.request({ origins: ['https://*/*'] })"].entries()) {
    const r = await pkgCopy(`pkg-perm-${i}`, async (dir) => {
      const main = path.join(dir, 'pages', 'popup', 'main.js');
      await writeFile(main, `${await readFile(main, 'utf8')}\nexport const _m = (api) => ${call};\n`);
    });
    const c = r.checks.find((x) => x.id === 'permissions-request-settings-only');
    assert.equal(c.ok, false, call);
    assert.deepEqual(c.detail.files, ['pages/popup/main.js', 'pages/settings/main.js'], call);
  }
});
