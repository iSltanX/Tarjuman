// أهداف البناء (جولة النشر T2): طبقة Firefox أصغر ما يمكن فوق البيان، والشيفرة واحدة في الهدفين، والفحص الثابت والتدقيق
// يغطيانهما بالقواعد نفسها ويكشفان المخالفة في كل منهما.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GECKO, TARGETS, targetManifest } from '../../../scripts/targets.mjs';
import { auditPackage } from '../../../scripts/release/audit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const base = JSON.parse(await readFile(path.join(ROOT, 'src/manifest.json'), 'utf8'));
const node = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

async function walk(dir, at = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, at)));
    else out.push(path.relative(at, p));
  }
  return out.sort();
}

const tmp = await mkdtemp(path.join(os.tmpdir(), 'tj-targets-'));
test.after(() => rm(tmp, { recursive: true, force: true }));
const built = {};
for (const target of TARGETS) {
  built[target] = path.join(tmp, target);
  const r = node([path.join(ROOT, 'scripts/build.mjs'), '--target', target, '--out', built[target]]);
  assert.equal(r.status, 0, r.stderr);
}

test('chromium هو البيان الأساسي كما هو، نسخة لا الأصل نفسه', () => {
  const m = targetManifest(base, 'chromium');
  assert.deepEqual(m, base);
  assert.ok(m !== base);
});

test('طبقة Firefox: الخلفية سكربت بالملف نفسه، وإعدادات Gecko المعتمدة، ولا غيرهما، ولا يُمس الأصل', () => {
  const before = JSON.stringify(base);
  const m = targetManifest(base, 'firefox');
  assert.equal(JSON.stringify(base), before, 'البيان الأساسي لم يتغير');
  assert.deepEqual(m.background, { scripts: [base.background.service_worker] });
  assert.deepEqual(m.browser_specific_settings, {
    gecko: { id: 'tarjuman@bysltan.com', strict_min_version: '144.0', data_collection_permissions: { required: ['none'], optional: ['technicalAndInteraction', 'browsingActivity'] } },
  });
  assert.deepEqual(m.optional_host_permissions, ['https://app-reports.isultantf.workers.dev/*'], 'إذن البلاغ الاختياري من البيان الأساسي نفسه');
  assert.equal('gecko_android' in m.browser_specific_settings, false, 'سطح المكتب وحده');
  const changed = Object.keys(m).filter((k) => JSON.stringify(m[k]) !== JSON.stringify(base[k]));
  assert.deepEqual(changed.sort(), ['background', 'browser_specific_settings']);
  m.browser_specific_settings.gecko.id = 'x';
  assert.equal(GECKO.id, 'tarjuman@bysltan.com', 'الطبقة نسخة لا مرجع إلى الثابت');
});

test('هدف غير معروف مرفوض في الطبقة والبناء', () => {
  assert.throws(() => targetManifest(base, 'safari'), /هدف بناء غير معروف/);
  const r = node([path.join(ROOT, 'scripts/build.mjs'), '--target', 'safari', '--out', path.join(tmp, 'safari')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /هدف غير معروف safari/);
});

test('اسم المتاجر (قرار سلطان، store/README.md §٥، ولوحة الهوية 18 منذ 2.0.0): الاسم بعبارته، و«ترجمان» اسمًا مختصرًا وتلميحًا', () => {
  assert.equal(base.name, 'ترجمان — ترجمتك فوق الفيديو', 'منذ 2.0.0 نص لوحة الهوية 18');
  assert.equal(base.short_name, 'ترجمان');
  assert.equal(base.action.default_title, 'ترجمان');
});

test('البناءان: الملفات نفسها بالبايت عدا البيان، وكلاهما يجتاز التدقيق بهدفه', async () => {
  const files = await walk(built.chromium);
  assert.deepEqual(await walk(built.firefox), files);
  for (const f of files.filter((x) => x !== 'manifest.json')) {
    assert.equal(Buffer.compare(await readFile(path.join(built.chromium, f)), await readFile(path.join(built.firefox, f))), 0, f);
  }
  for (const target of TARGETS) {
    const r = await auditPackage(built[target], { target });
    assert.deepEqual(r.checks.filter((c) => !c.ok).map((c) => c.id), [], target);
  }
});

test('التدقيق يرفض الحزمة بهدف غيرها، وطبقة Firefox المعدّلة (عامل خدمة، أو أندرويد، أو جمع بيانات، أو معرّف آخر)', async () => {
  assert.equal((await auditPackage(built.firefox, { target: 'chromium' })).ok, false);
  assert.equal((await auditPackage(built.chromium, { target: 'firefox' })).ok, false);
  await assert.rejects(auditPackage(built.firefox, { target: 'safari' }), /هدف غير معروف/);
  const cases = [
    [(m) => { m.background = { service_worker: 'background/worker.js' }; }, 'save-worker-only-and-no-externally-connectable'],
    [(m) => { m.browser_specific_settings.gecko_android = { strict_min_version: '142.0' }; }, 'target-browser-settings'],
    [(m) => { m.browser_specific_settings.gecko.data_collection_permissions = { required: ['browsingActivity'] }; }, 'target-browser-settings'],
    [(m) => { m.browser_specific_settings.gecko.id = 'other@example.com'; }, 'target-browser-settings'],
  ];
  for (const [mutate, id] of cases) {
    const bad = await mkdtemp(path.join(os.tmpdir(), 'tj-targets-bad-'));
    try {
      await cp(built.firefox, bad, { recursive: true });
      const p = path.join(bad, 'manifest.json');
      const m = JSON.parse(await readFile(p, 'utf8'));
      mutate(m);
      await writeFile(p, JSON.stringify(m));
      const r = await auditPackage(bad, { target: 'firefox' });
      assert.equal(r.checks.find((c) => c.id === id).ok, false, id);
    } finally {
      await rm(bad, { recursive: true, force: true });
    }
  }
});

test('الفحص الثابت يفحص بياني الهدفين: المخالفة تُكشف في كليهما، وإعدادات Gecko في البيان الأساسي مرفوضة، واسم المتاجر بحدوده', async () => {
  const withManifest = async (fn) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-targets-static-'));
    try {
      await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
      const p = path.join(dir, 'manifest.json');
      const m = JSON.parse(await readFile(p, 'utf8'));
      fn(m);
      await writeFile(p, JSON.stringify(m));
      return node([path.join(ROOT, 'scripts/check-static.mjs'), '--src', dir]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  const tabs = await withManifest((m) => { m.permissions.push('tabs'); });
  assert.match(tabs.stderr, /- manifest: الأذونات/);
  assert.match(tabs.stderr, /- manifest \(firefox\): الأذونات/);
  const bss = await withManifest((m) => { m.browser_specific_settings = { gecko: { id: 'x@y' } }; });
  assert.match(bss.stderr, /browser_specific_settings لطبقة Firefox وحدها/);
  const named = await withManifest((m) => { m.name = 'ترجمان لـChrome'; });
  assert.match(named.stderr, /- manifest: name يذكر متصفحًا/);
  assert.match(named.stderr, /- manifest \(firefox\): name يذكر متصفحًا/);
  const long = await withManifest((m) => { m.name = 'ت'.repeat(51); m.short_name = 'ترجمان ترجمان'; });
  assert.match(long.stderr, /name فارغ أو أطول من 50/);
  assert.match(long.stderr, /short_name فارغ أو أطول من 12/);
  const noBg = await withManifest((m) => { delete m.background; });
  assert.match(noBg.stderr, /manifest \(firefox\): تعذّر توليده/);
});
