// تحقق Gemini، الدفعة د (البند 38): حراس أضيق من أسمائها، ثبتت بأشجار مؤقتة.
// - ع-٢١: check-secrets يكشف أسرار يوتيوب والرموز الطويلة وحدها، فكانت ثماني حالات عامة تمر (رمز GitHub وسرّ AMO وسرّ عميل OAuth
//   ورمز npm و.env ومفتاح PEM باسمه وداخل .md وكلمة مرور)؛ وحارس الكاتب الواحد يطابق اسم المتغير area وحده.
// - ع-٢٩: run-tests بلا مهلة (اختبار معلّق يعلّق التشغيل حتى مهلة CI)، واختبار todo فاشل كان يخرج 0.
// - ع-٣٠: الوثائق تقول «يتحقق منها» عن فحص نصي يكشف الخطأ لا التمويه.
// القيم الشبيهة بالأسرار تُبنى وقت التشغيل، فلا يحمل الملف نفسه نمطًا يكشفه فحص الأسرار.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const node = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', ...opts });
const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tj-gemini-guards-')));
test.after(() => rm(tmp, { recursive: true, force: true }));

// ---------------------------------------------------------------- ع-٢١: أسرار عامة

const j = (...parts) => parts.join('');
const b64 = (n) => Array.from({ length: n }, (_, i) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[(i * 11 + 5) % 62]).join('');
const hex = (n) => Array.from({ length: n }, (_, i) => '0123456789abcdef'[(i * 7 + 3) % 16]).join('');
const PEM = `${j('-----BEGIN', ' PRIVATE', ' KEY-----')}\n${b64(64)}\n${j('-----END', ' PRIVATE', ' KEY-----')}\n`;

/** حالات المجسّ الثماني (B-probes/secrets-probe.out.txt) وغيرها: [الاسم، المسار، النص، ما يُتوقع في الاكتشاف]. */
const SECRET_CASES = [
  ['رمز GitHub في سير عمل', '.github/workflows/release.yml', `env:\n  GH_TOKEN: ${j('gh', 'p_', b64(36))}\n`, /github-token/],
  ['رمز GitHub الدقيق', 'scripts/ci.mjs', `export const t = '${j('github', '_pat_', b64(40))}';\n`, /github-token/],
  ['سرّ AMO مسنَد بالاسم', 'scripts/sign.mjs', `export const AMO = { issuer: 'user:1234567:89', ${j('sec', 'ret')}: '${hex(64)}' };\n`, /secret-assignment/],
  ['سرّ عميل OAuth', 'store/cws.json', `{"client_id":"1234567890-abc.apps.example","${j('client', '_secret')}":"${j('GOC', 'SPX-', b64(28))}"}\n`, /oauth-client-secret/],
  ['كلمة مرور في إعداد', 'scripts/config.mjs', `export const smtp = { user: 'support', ${j('pass', 'word')}: 'Tr0ub4dor&3-horse-battery' };\n`, /secret-assignment/],
  ['مفتاح خاص داخل .md', 'docs/notes.md', `# ملاحظات\n\n${PEM}`, /private-key/],
  ['رمز npm في سكربت', 'scripts/publish.mjs', `const t = '${j('np', 'm_', b64(36))}';\n`, /npm-token/],
  ['مفتاح AWS', 'docs/aws.md', `المفتاح ${j('AK', 'IA', 'ABCDEFGHIJKLMNOP')}\n`, /aws-key/],
  ['رمز Slack', 'scripts/notify.mjs', `const hook = '${j('xo', 'xb-', '1234567890-', b64(24))}';\n`, /slack-token/],
];
/** ملفات أسرار بأسمائها: تُرفض أيًّا كان ما فيها. */
const SECRET_FILES = [
  ['.npmrc برمز', '.npmrc', `//registry.npmjs.org/:_authToken=${j('np', 'm_', b64(36))}\n`],
  ['.env', '.env', `WEB_EXT_API_KEY=user:1:2\nWEB_EXT_API_SECRET=${hex(64)}\n`],
  ['.env.production', 'config/.env.production', 'X=1\n'],
  ['مفتاح PEM باسمه', 'key.pem', PEM],
  ['مفتاح توقيع .key', 'signing/store.key', 'x\n'],
  ['مفتاح SSH', 'deploy/id_ed25519', 'x\n'],
];

/** شجرة بنطاقي العيّنات سليمة، ثم ملف واحد. بلا Git فيُمشى على الشجرة كلها. */
async function secretsTree(name, rel, text) {
  const t = path.join(tmp, name);
  for (const scope of ['test/fixtures', 'test/e2e/fixtures']) await mkdir(path.join(t, scope), { recursive: true });
  await writeFile(path.join(t, 'test/fixtures/a.json'), '{"events":[]}\n');
  await writeFile(path.join(t, 'test/e2e/fixtures/b.srt'), '1\n00:00:00,000 --> 00:00:01,000\nمرحبا\n');
  if (rel) {
    await mkdir(path.dirname(path.join(t, rel)), { recursive: true });
    await writeFile(path.join(t, rel), text);
  }
  return node([path.join(ROOT, 'scripts/check-secrets.mjs'), '--root', t]);
}

test('ع-٢١: check-secrets يكشف الأسرار العامة بصيغها في أي ملف نصي، ويطبع نوعها لا قيمتها', async () => {
  for (const [i, [label, rel, text, type]] of SECRET_CASES.entries()) {
    const r = await secretsTree(`secret-${i}`, rel, text);
    assert.equal(r.status, 1, `${label}: ${r.stdout}`);
    assert.match(r.stderr, new RegExp(`${rel.replace(/[.]/g, '\\.')}@\\d+: `), label);
    assert.match(r.stderr, type, label);
    assert.ok(!r.stderr.includes(b64(24)) && !r.stderr.includes(hex(64)), `${label}: القيمة لا تُطبع`);
  }
});

test('ع-٢١: ملف أسرار باسمه (.env و.npmrc ومفاتيح التوقيع وSSH) يُرفض أيًّا كان ما فيه', async () => {
  for (const [i, [label, rel, text]] of SECRET_FILES.entries()) {
    const r = await secretsTree(`secret-file-${i}`, rel, text);
    assert.equal(r.status, 1, `${label}: ${r.stdout}`);
    assert.match(r.stderr, new RegExp(`${rel.replace(/[.]/g, '\\.')}: ملف أسرار باسمه`), label);
  }
});

test('ع-٢١: ما يشبه السرّ ولا يكونه يمر: إسناد قصير أو متغير، ومفتاح عام، ومثال .env', async () => {
  const ok = [
    `const ${j('pass', 'word')} = input.value;`,
    `const cfg = { ${j('sec', 'ret')}: 'short' };`,
    `const ${j('api', 'Key')} = readKey();`,
    j('-----BEGIN', ' PUBLIC', ' KEY-----'),
    'const label = "Secret santa";',
  ].join('\n');
  const r = await secretsTree('not-secret', 'scripts/ok.mjs', `${ok}\n`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((await secretsTree('env-example', 'docs/env.example', 'X=\n')).status, 0, 'env.example بلا نقطة في أوله ليس ملف بيئة');
});

// ---------------------------------------------------------------- ع-٢١: محوّل التخزين

/** نسخة من src بلا الخطوط تُزرع فيها الملفات. */
async function srcCopy(name, plant) {
  const dir = path.join(tmp, name);
  await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
  for (const [rel, text] of Object.entries(plant)) await writeFile(path.join(dir, rel), text);
  return node([path.join(ROOT, 'scripts/check-static.mjs'), '--src', dir]);
}

test('ع-٢١: core/store/area.js لا يستورده إلا core/store/index.js والعامل الخلفي، ولو بمساحة اسمها غير area', async () => {
  const r = await srcCopy('src-area', {
    'pages/library/zz-wipe.js': "import { chromeLocalArea } from '../../core/store/area.js';\nexport const wipe = () => chromeLocalArea().clear();\n",
    'pages/settings/zz-multi.js': "import {\n  chromeLocalArea,\n} from '../../core/store/area.js';\nexport const put = (local = chromeLocalArea()) => local.set({});\n",
    'core/store/zz-side.js': "export { chromeLocalArea } from './area.js';\n",
    'content/zz-lazy.js': "export const lazy = () => import('../core/store/area.js');\n",
    // مرجع نوع في JSDoc ليس استيرادًا.
    'core/model/zz-type.js': "/** @param {import('../store/area.js').StorageArea} a */\nexport const keep = (a) => a;\n",
  });
  assert.equal(r.status, 1);
  const hits = r.stderr.split('\n').filter((l) => l.includes('محوّل التخزين'));
  assert.deepEqual(hits.map((l) => /- ([^:]+):/.exec(l)[1].split(path.sep).join('/')).sort(),
    ['content/zz-lazy.js', 'core/store/zz-side.js', 'pages/library/zz-wipe.js', 'pages/settings/zz-multi.js']);
  assert.equal(r.stderr.split('\n').filter((l) => l.startsWith('- ') && !l.includes('zz-')).length, 0, 'لا مخالفة في المصدر الحقيقي');
  assert.equal(node([path.join(ROOT, 'scripts/check-static.mjs')]).status, 0);
});

// ---------------------------------------------------------------- ع-٢٩: المشغّل

/** شجرة اختبار واحدة تحت مجلد مؤقت، ثم run-tests عليها. */
async function runTests(name, body, { env = {}, args = [] } = {}) {
  const dir = path.join(tmp, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'a.test.js'), `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n${body}\n`);
  // مهلة خارجية للحالة القديمة وحدها (كان المعلّق لا ينتهي)؛ والمتغير CI فارغ إلا إن طُلب. وبلا NODE_TEST_CONTEXT الموروث من
  // هذا الاختبار، وإلا عدّ node --test الابن نفسه داخل اختبار فلم يشغّل شيئًا.
  const childEnv = { ...process.env, CI: '', ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  return node([path.join(ROOT, 'scripts/run-tests.mjs'), ...args, dir], { env: childEnv, timeout: 60_000 });
}

test('ع-٢٩: اختبار todo فاشل يُفشل التشغيل ويُذكر باسمه (كان يخرج 0)، محليًا وفي CI', async () => {
  const body = "test('todo بتأكيد فاشل', { todo: 'لاحقًا' }, () => { assert.equal(1, 2); });\ntest('سليم', () => {});";
  for (const CI of ['', 'true']) {
    const r = await runTests(`todo-fail-${CI || 'local'}`, body, { env: { CI } });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /todo فاشل 1/);
    assert.match(r.stderr, /todo بتأكيد فاشل \(لاحقًا\)/);
  }
});

test('ع-٢٩: todo ناجح يُذكر باسمه وينجح محليًا، وأي todo في CI فشل', async () => {
  const body = "test('todo ناجح', { todo: 'لاحقًا' }, () => {});";
  const local = await runTests('todo-pass-local', body);
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stderr, /run-tests: todo 1:\n- todo ناجح \(لاحقًا\)/);
  const ci = await runTests('todo-pass-ci', body, { env: { CI: 'true' } });
  assert.equal(ci.status, 1);
  assert.match(ci.stderr, /todo ممنوع في CI/);
});

test('ع-٢٩: اختبار معلّق (بمؤقت حي) يفشل باسمه بعد المهلة، ولا يعلّق التشغيل', async () => {
  const body = "test('معلّق إلى الأبد', async () => { await new Promise(() => { setInterval(() => {}, 1000); }); });\ntest('سليم بعده', () => {});";
  const t0 = Date.now();
  // بلا --test-force-exit (ن-٧) يُبقي المؤقت الحي عملية الملف، فيُخرجها الحارس بعد المهلة الإضافية (300ms هنا).
  const r = await runTests('hang', body, { args: ['--timeout=500'], env: { TJ_TEST_EXIT_GRACE_MS: '300' } });
  assert.equal(r.error, undefined, 'التشغيل علّق حتى المهلة الخارجية');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /معلّق إلى الأبد/);
  assert.match(r.stdout, /timed out after 500ms/);
  assert.match(r.stdout + r.stderr, /بقي حيًّا 300ms بعد آخر اختباراته/);
  assert.ok(Date.now() - t0 < 30_000, `${Date.now() - t0}ms`);
});

test('ع-٢٩: اختبار معلّق بلا مؤقت حي يُلغى باسمه ويُفشل التشغيل', async () => {
  const r = await runTests('hang-no-timer', "test('معلّق بلا مؤقت', () => new Promise(() => {}));", { args: ['--timeout=500'] });
  assert.equal(r.error, undefined, 'التشغيل علّق حتى المهلة الخارجية');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /معلّق بلا مؤقت/);
});

// تحقق الجولة الثانية (ن-٧): --test-force-exit كان يُنهي عملية الملف فور آخر اختبار، فيُبتلع ما يقع بعده ويخرج التشغيل 0. وفي
// 2.2.0 كان node يذكره «asynchronous activity after the test ended» ويخرج 1. الحالات من مجسّ التحقق (forceexit/cases.mjs).
const LATE_CASES = [
  ['رمي في مؤقت 0', "test('ينجح ثم يرمي في مؤقت 0', () => { setTimeout(() => { throw new Error('late-0'); }, 0); });", /late-0/],
  ['رمي بعد 50', "test('ينجح ثم يرمي بعد 50', () => { setTimeout(() => { throw new Error('late-50'); }, 50); });", /late-50/],
  ['رفض وعد متأخر', "test('ينجح ثم رفض وعد بعد 300', () => { setTimeout(() => { Promise.reject(new Error('late-reject')); }, 300); });", /late-reject/],
  ['تأكيد متأخر', "test('تأكيد متأخر بعد 300', () => { setTimeout(() => assert.equal(1, 2), 300); });", /1 !== 2/],
  ['عمل غير منتظر', "test('عمل غير منتظر يفشل لاحقًا', () => { (async () => { await new Promise((r) => setTimeout(r, 200)); assert.equal('a', 'b'); })(); });", /'a' !== 'b'/],
];

test('ن-٧: اختبار ينجح ثم يرمي في مؤقت لاحق أو يرفض وعدًا متأخرًا يُخرج المشغّل بالرمز 1 ويُذكر خطؤه', async () => {
  for (const [i, [label, body, err]] of LATE_CASES.entries()) {
    const r = await runTests(`late-${i}`, body);
    assert.equal(r.error, undefined, `${label}: علّق`);
    assert.equal(r.status, 1, `${label}: ابتُلع الخطأ المتأخر\n${r.stdout}`);
    assert.match(r.stdout, err, label);
  }
  const control = await runTests('late-control', "test('ضابطة ناجحة', () => {});");
  assert.equal(control.status, 0, control.stdout + control.stderr);
});

test('ن-٧: ملف بقي حيًّا بعد آخر اختباراته (مقبض متسرّب) يفشل باسمه بعد المهلة الإضافية، فلا يعلّق التشغيل ولا ينجح صامتًا', async () => {
  const body = "test('ينجح ويترك مؤقتًا حيًّا', () => { setInterval(() => {}, 1000); });";
  const t0 = Date.now();
  const r = await runTests('leak', body, { env: { TJ_TEST_EXIT_GRACE_MS: '300' } });
  assert.equal(r.error, undefined, 'التشغيل علّق حتى المهلة الخارجية');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /leak\/a\.test\.js بقي حيًّا 300ms بعد آخر اختباراته \(المقابض الحية: [^)]*\bTimeout\b/);
  assert.match(r.stdout, /✔ ينجح ويترك مؤقتًا حيًّا/, 'الاختبار نفسه ناجح، والفشل للملف');
  assert.ok(Date.now() - t0 < 30_000, `${Date.now() - t0}ms`);
});

test('ع-٢٩ ون-٧: المهلة الافتراضية تُمرَّر إلى node --test بلا --test-force-exit، و--timeout بغير عدد خطأ استعمال', async () => {
  const src = await readFile(path.join(ROOT, 'scripts/run-tests.mjs'), 'utf8');
  assert.match(src, /`--test-timeout=\$\{timeoutMs\}`/);
  assert.doesNotMatch(src, /'--test-force-exit'/);
  const bad = await runTests('bad-timeout', "test('سليم', () => {});", { args: ['--timeout=abc'] });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--timeout=abc ليس عددًا صحيحًا موجبًا/);
});

// ---------------------------------------------------------------- ع-٣٠: صياغة الوعود

test('ع-٣٠: الوثائق تصف فحص الاتصال بأنه نصي يكشف الخطأ لا التمويه، لا تحققًا مطلقًا', async () => {
  const security = await readFile(path.join(ROOT, '.github/SECURITY.md'), 'utf8');
  assert.doesNotMatch(security, /هذه الوعود يتحقق منها/);
  assert.match(security, /بفحوص نصية[^\n]*التمويه/);
  const dev = (await readFile(path.join(ROOT, 'docs/development.md'), 'utf8')).split('\n').find((l) => l.startsWith('| `npm run check` |'));
  assert.match(dev, /اتصال غير معلن؛ وهو نصي يكشف الخطأ لا التمويه/);
  const contributing = await readFile(path.join(ROOT, '.github/CONTRIBUTING.md'), 'utf8');
  assert.match(contributing, /حارس من الخطأ لا من التمويه/);
});
