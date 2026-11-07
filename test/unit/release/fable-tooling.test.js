// تدقيق Fable (FA-10، FA-11، FA-19): أدوات الفحص لا تبتلع أخطاءها.
// - run-tests: مجلد مطلوب غائب أو غير مقروء كان يُقرأ فارغًا، ومع --allow-empty على التكامل ينجح التشغيل بلا اختبار.
// - check-secrets: نطاق غائب كان «صفر ملفات ناجح»، والملف فوق 50 م.ب يُتخطى بصمت، ولا اختبار يشغّل السكربت نفسه.
// - notices: اعتمادية تطوير مقفلة غير مثبتة (web-ext) كانت تُسقط npm run check بمكدس ENOENT خام.
// - web-ext lint بلا --warnings-as-errors كان ينجح بتحذيرات.
// القيم الشبيهة بالأسرار والمسارات تُبنى وقت التشغيل، فلا يحمل الملف نفسه نمطًا يكشفه فحص.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const node = (args, cwd = ROOT) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tj-fable-tooling-')));
test.after(() => rm(tmp, { recursive: true, force: true }));

// ---------------------------------------------------------------- FA-10

test('FA-10: run-tests يفشل لمجلد غائب ولو مع --allow-empty، ولمجلد بلا اختبارات بدونه', async () => {
  const runner = path.join(ROOT, 'scripts/run-tests.mjs');
  const missing = node([runner, '--allow-empty', path.join(tmp, 'no-such-dir')]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /تعذّرت قراءة .*ENOENT/);
  const empty = path.join(tmp, 'empty-tests');
  await mkdir(empty);
  assert.equal(node([runner, empty]).status, 1);
  const allowed = node([runner, '--allow-empty', empty]);
  assert.equal(allowed.status, 0, 'المجلد الموجود بلا اختبارات ينجح بـ--allow-empty وحده');
  assert.match(allowed.stdout, /لا اختبارات بعد/);
});

test('FA-10 وFA-19: التكامل وبوابة الموجة بلا --allow-empty، وweb-ext lint يعامل التحذير خطأً', async () => {
  const { scripts } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  for (const [name, cmd] of Object.entries(scripts)) assert.doesNotMatch(cmd, /--allow-empty/, name);
  assert.match(scripts['test:integration'], /run-tests\.mjs test\/integration$/);
  assert.match(scripts['lint:firefox'], /web-ext lint .*--warnings-as-errors/);
});

// ---------------------------------------------------------------- FA-11: check-secrets

const POT = ['po', 't=', 'Mn'.repeat(12)].join('');
const LOCAL = ['', 'Users', 'someone', 'Downloads', 'x.srt'].join('/');
const YT = ['https://www.', 'youtube', '.com/watch?v=abcdefghijk'].join('');

/** شجرة بنطاقات الفحص الثلاثة وملف نصي سليم في كلٍّ، ثم mutate. */
async function secretsTree(name, mutate = async () => {}) {
  const t = path.join(tmp, name);
  for (const scope of ['test/fixtures', 'test/e2e/fixtures', 'docs/evidence/P0']) await mkdir(path.join(t, scope), { recursive: true });
  await writeFile(path.join(t, 'test/fixtures/a.json'), '{"ok": true}\n');
  await writeFile(path.join(t, 'test/e2e/fixtures/b.srt'), '1\n00:00:01,000 --> 00:00:02,000\nمرحبًا\n');
  await writeFile(path.join(t, 'docs/evidence/P0/README.md'), 'مرجع عام: https://example.org/doc\n');
  await mutate(t);
  return node([path.join(ROOT, 'scripts/check-secrets.mjs'), '--root', t]);
}

test('FA-11: check-secrets على شجرة سليمة ينجح بعدد الملفات المفحوصة، والرابط العام في .md مسموح', async () => {
  const r = await secretsTree('clean');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ناجح \(3 ملف/);
});

test('FA-11: check-secrets يكشف pot في عيّنة، ورابط يوتيوب في .md، ومسار الجهاز في دليل', async () => {
  const r = await secretsTree('dirty', async (t) => {
    await writeFile(path.join(t, 'test/fixtures/a.json'), `{"q": "${POT}"}\n`);
    await writeFile(path.join(t, 'docs/evidence/P0/README.md'), `انظر ${YT}\n`);
    await writeFile(path.join(t, 'docs/evidence/P0/run.log'), `saved to ${LOCAL}\n`);
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /test\/fixtures\/a\.json@\d+: param/);
  assert.match(r.stderr, /docs\/evidence\/P0\/README\.md@\d+: url/);
  assert.match(r.stderr, /docs\/evidence\/P0\/run\.log@\d+: local-path/);
});

test('FA-11: نطاق غائب، أو نطاقات بلا ملف نصي، فشلٌ لا «ناجح (0 ملف)»', async () => {
  const gone = await secretsTree('no-evidence', (t) => rm(path.join(t, 'docs'), { recursive: true }));
  assert.equal(gone.status, 1);
  assert.match(gone.stderr, /docs\/evidence: نطاق الفحص غائب/);
  const none = await secretsTree('no-text', async (t) => {
    for (const f of ['test/fixtures/a.json', 'test/e2e/fixtures/b.srt', 'docs/evidence/P0/README.md']) await rm(path.join(t, f));
    await writeFile(path.join(t, 'docs/evidence/P0/shot.png'), 'x');
  });
  assert.equal(none.status, 1);
  assert.match(none.stderr, /لا ملف نصيًا في نطاقات الفحص/);
});

test('FA-11: --root بلا مجلد خطأ استعمال برسالة لا TypeError خام (ملاحظة المراجعة المستقلة)', () => {
  const r = node([path.join(ROOT, 'scripts/check-secrets.mjs'), '--root']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--root يحتاج مجلدًا/);
  assert.doesNotMatch(r.stderr, /TypeError/);
});

test('FA-11: المستودع نفسه ينجح بأكثر من مئتي ملف مفحوص', () => {
  const r = node([path.join(ROOT, 'scripts/check-secrets.mjs')]);
  assert.equal(r.status, 0, r.stderr);
  const n = Number(/ناجح \((\d+) ملف/.exec(r.stdout)?.[1] ?? 0);
  assert.ok(n > 200, r.stdout);
});

// ---------------------------------------------------------------- FA-11: notices

test('FA-11: اعتمادية تطوير مقفلة غير مثبتة تُسقط notices --check برسالة تقول npm ci لا بـENOENT خام', async () => {
  const t = path.join(tmp, 'notices-tree');
  for (const p of ['src', 'scripts', 'package.json', 'package-lock.json', 'THIRD_PARTY_NOTICES.txt']) await cp(path.join(ROOT, p), path.join(t, p), { recursive: true });
  // esbuild وحده مثبت؛ web-ext في القفل وغائب عن node_modules.
  await mkdir(path.join(t, 'node_modules'));
  await symlink(path.join(ROOT, 'node_modules', 'esbuild'), path.join(t, 'node_modules', 'esbuild'), 'dir');
  const r = node([path.join(t, 'scripts/release/notices.mjs'), '--check'], t);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /notices: web-ext [\d.]+ في package-lock\.json وغير مثبت في node_modules؛ شغّل npm ci/);
  assert.doesNotMatch(r.stderr, /ENOENT|at \w+ \(/, 'لا مكدس خام');
});
