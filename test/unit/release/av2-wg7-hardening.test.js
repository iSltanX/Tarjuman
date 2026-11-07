// AV2 WG-7 (تدقيق V2): تحصين سلسلة التوريد والمستودع العام.
// - U-046: إجراءات CI مثبتة بمعرّف التزام كامل، وDependabot لـgithub-actions.
// - U-047: check-secrets يمتد إلى بقية الملفات النصية المتتبَّعة (وبديل بلا Git).
// - U-049: لا مسار جهاز محلي مطلق في الوثائق والشيفرة المتتبَّعة.
// الرموز والمسارات تُبنى وقت التشغيل بالوصل فلا يحمل الملف نمطًا يكشفه فحص ولا حماية GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tj-av2-wg7-')));
test.after(() => rm(tmp, { recursive: true, force: true }));

// ---------------------------------------------------------------- U-046

/** كل `uses:` خارجي (لا ./ محلي) في ملف: [{ line, ref }] */
const usesOf = (text) => text.split('\n').flatMap((l, i) => {
  const m = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(l);
  return m && !m[1].startsWith('./') ? [{ line: i + 1, ref: m[1] }] : [];
});
const PINNED = /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/;

test('AV2 U-046: كل uses: في سير العمل خارجي بمعرّف التزام من 40 خانة، والفحص يرفض الوسم المتحرك', async () => {
  const dir = path.join(ROOT, '.github/workflows');
  const files = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0);
  let seen = 0;
  for (const f of files) {
    for (const { line, ref } of usesOf(await readFile(path.join(dir, f), 'utf8'))) {
      seen++;
      assert.match(ref, PINNED, `${f}:${line} ${ref}`);
    }
  }
  assert.ok(seen >= 2, 'checkout وsetup-node على الأقل');
  assert.ok(!PINNED.test('actions/checkout@v7'), 'الوسم المتحرك مرفوض');
  assert.ok(!PINNED.test('actions/checkout@3d3c42e'), 'المعرّف المختصر مرفوض');
});

test('AV2 U-046: Dependabot يحدّث github-actions أسبوعيًا', async () => {
  const y = await readFile(path.join(ROOT, '.github/dependabot.yml'), 'utf8');
  assert.match(y, /package-ecosystem:\s*github-actions/);
  assert.match(y, /interval:\s*weekly/);
});

// ---------------------------------------------------------------- U-047

const TOKEN = ['po', 't=', 'Mn'.repeat(12)].join('');
const LOCAL = ['', 'Users', 'someone', 'Downloads', 'x.srt'].join('/');
const node = (args) => spawnSync(process.execPath, args, { encoding: 'utf8' });

/** شجرة بنطاقات الفحص الثلاثة وملفات خارجها، اختياريًا مستودع Git. */
async function tree(name, { git, files }) {
  const t = path.join(tmp, name);
  for (const scope of ['test/fixtures', 'test/e2e/fixtures', 'docs/evidence/P0']) await mkdir(path.join(t, scope), { recursive: true });
  await writeFile(path.join(t, 'test/fixtures/a.json'), '{"ok": true}\n');
  await writeFile(path.join(t, 'test/e2e/fixtures/b.srt'), '1\n00:00:01,000 --> 00:00:02,000\nمرحبًا\n');
  await writeFile(path.join(t, 'docs/evidence/P0/README.md'), 'مرجع عام: https://example.org/doc\n');
  await mkdir(path.join(t, 'src'), { recursive: true });
  await mkdir(path.join(t, 'docs'), { recursive: true });
  for (const [f, body] of Object.entries(files)) await writeFile(path.join(t, f), body);
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: t });
    execFileSync('git', ['add', '-A'], { cwd: t });
  }
  return t;
}
const secrets = (t) => node([path.join(ROOT, 'scripts/check-secrets.mjs'), '--root', t]);

for (const git of [true, false]) {
  const how = git ? 'عبر git ls-files' : 'بلا Git (مشي الشجرة)';
  test(`AV2 U-047: رمز مزروع في src ومسار جهاز في وثيقة خارج الأدلة يلتقطهما الفحص ${how}`, async () => {
    const t = await tree(git ? 'planted-git' : 'planted-walk', { git, files: { 'src/x.js': `export const q = "${TOKEN}";\n`, 'docs/notes.md': `saved to ${LOCAL}\n` } });
    const r = secrets(t);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /src\/x\.js@\d+: param/);
    assert.match(r.stderr, /docs\/notes\.md@\d+: local-path/);
  });

  test(`AV2 U-047: شجرة نظيفة خارج الأدلة تنجح وتعدّ الملفات الموسَّعة ${how}`, async () => {
    const t = await tree(git ? 'clean-git' : 'clean-walk', { git, files: { 'src/x.js': 'export const q = 1;\n', 'docs/notes.md': 'روابط عامة: https://example.org/a\n' } });
    const r = secrets(t);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ناجح \(5 ملف/);
    assert.match(r.stdout, /منها 2 خارج نطاقات الأدلة/);
  });
}

test('AV2 U-047: المستودع كله ينجح، ويفحص أكثر من النطاقات الثلاثة', () => {
  const r = node([path.join(ROOT, 'scripts/check-secrets.mjs')]);
  assert.equal(r.status, 0, r.stderr);
  const n = Number(/ناجح \((\d+) ملف/.exec(r.stdout)?.[1] ?? 0);
  assert.ok(n > 600, r.stdout);
});

// ---------------------------------------------------------------- U-049

test('AV2 U-049: خلو docs/aa-plan.md وtest/live/aa5/data.mjs من اسم القرص المحلي', async () => {
  const disk = ['', 'Volumes', ''].join('/');
  for (const f of ['docs/aa-plan.md', 'test/live/aa5/data.mjs']) assert.ok(!(await readFile(path.join(ROOT, f), 'utf8')).includes(disk), f);
  assert.match(await readFile(path.join(ROOT, 'test/live/aa5/data.mjs'), 'utf8'), /process\.env\.TJ_V11_DIR/);
});
