// تدقيق 7a66f91، C8: أدوات البناء والتغليف.
// - U60: البناء لا يمسح إلا مجلدًا يملكه (كان يمسح أي مجلد إلا الجذر وsrc، ومنه .git وأشجار العمل، وsrc/..foo يمر لأن المقارنة نصية).
// - U61: تدقيق الحزمة بقوة الفحص الثابت (رابط بلا بروتوكول وnew Image وlocalStorage والصيغ الديناميكية كانت تمر 15/15)،
//   والتغليف يفحص المصدر أولًا، ولا يكتب أرشيفًا ولا وصفًا قبل الحكم.
// - U62: بلا Git فالالتزام وحال الشجرة null، لا «نظيفة».
// - U63: وصف الحزمة يحمل بيئة البناء (Node وzlib والمعمارية والنظام) التي تتبعها بصمة الأرشيف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODE_RULES, codeViolations } from '../../../scripts/code-rules.mjs';
import { insidePath, outDirProblem } from '../../../scripts/targets.mjs';
import { auditPackage } from '../../../scripts/release/audit.mjs';
import { buildEnvironment, dirtyNote, sourceState } from '../../../scripts/release/provenance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BUILD = path.join(ROOT, 'scripts/build.mjs');
const node = (args, cwd = ROOT) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
// المسار الحقيقي: في macOS المجلد المؤقت رابط (/var ← /private/var)، وحارس «سكربت رئيسي» في السكربتات يقارن المسار الحقيقي.
const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tj-c8-tooling-')));
test.after(() => rm(tmp, { recursive: true, force: true }));
const exists = (p) => readdir(p).then(() => true, (e) => e.code !== 'ENOENT');

// ---------------------------------------------------------------- U60

test('U60: المقارنة بمقاطع المسار، فـsrc/..foo داخل src و..foo خارجها', () => {
  const src = path.join(ROOT, 'src');
  assert.equal(insidePath(path.join(src, '..foo'), src), true);
  assert.equal(insidePath(path.join(ROOT, '..foo'), src), false);
  assert.equal(insidePath(src, src), true);
  assert.equal(insidePath(ROOT, src), false);
});

test('U60: مجلد فيه ملف لا يملكه البناء يُرفض قبل أي مسح، ويبقى الشاهد ومجلده الفرعي', async () => {
  const dir = path.join(tmp, 'foreign');
  await mkdir(path.join(dir, 'sub'), { recursive: true });
  await writeFile(path.join(dir, 'sentinel'), 'keep');
  await writeFile(path.join(dir, 'sub', 'nested'), 'keep');
  const r = node([BUILD, '--out', dir]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ليس مجلد بناء يُمسح/);
  assert.equal(await readFile(path.join(dir, 'sentinel'), 'utf8'), 'keep');
  assert.equal(await readFile(path.join(dir, 'sub', 'nested'), 'utf8'), 'keep');
  assert.equal(await exists(path.join(dir, 'manifest.json')), false, 'لم يُكتب البيان');
});

test('U60: الجذر وأبوه وsrc وما تحتها (ومنه src/..foo) و.git والروابط الرمزية مرفوضة، والغائب والفارغ ومجلد البناء السابق مقبولة', async () => {
  const root = { root: ROOT };
  assert.match(await outDirProblem(ROOT, root), /جذر المستودع/);
  assert.match(await outDirProblem(path.dirname(ROOT), root), /جذر المستودع/);
  assert.match(await outDirProblem(path.join(ROOT, 'src'), root), /داخل src/);
  assert.match(await outDirProblem(path.join(ROOT, 'src', '..foo'), root), /داخل src/);
  assert.match(await outDirProblem(path.join(ROOT, '.git'), root), /داخل \.git/);
  assert.match(await outDirProblem(path.join(tmp, 'x', '.git', 'y'), root), /داخل \.git/);
  assert.match(await outDirProblem(path.join(ROOT, 'docs'), root), /ما لا يكتبه البناء/);
  // مجلد «منزل» وهمي فيه ملف غريب، لا os.homedir(): الاختبار لا يفترض أن منزل المستخدم الحقيقي مقروء (تدقيق V2، U-055).
  await mkdir(path.join(tmp, 'fake-home'));
  await writeFile(path.join(tmp, 'fake-home', 'notes.txt'), 'x');
  assert.match(await outDirProblem(path.join(tmp, 'fake-home'), root), /ما لا يكتبه البناء/);
  assert.equal(await outDirProblem(path.join(tmp, 'absent'), root), null);
  await mkdir(path.join(tmp, 'empty'));
  assert.equal(await outDirProblem(path.join(tmp, 'empty'), root), null);
  await writeFile(path.join(tmp, 'file'), 'x');
  assert.match(await outDirProblem(path.join(tmp, 'file'), root), /ليس مجلدًا/);
  // مجلد بشكل البناء وبيان غير بيان ترجمان: مرفوض.
  await mkdir(path.join(tmp, 'other-ext'));
  await writeFile(path.join(tmp, 'other-ext', 'manifest.json'), JSON.stringify({ name: 'غيره' }));
  assert.match(await outDirProblem(path.join(tmp, 'other-ext'), root), /ليس بيان ترجمان/);
  // بناء سابق بالاسم الكامل القديم (1.1.0) والاسم المختصر نفسه «ترجمان»: بناء ترجمان (AA5، تغيّر الاسم في 2.0.0)؛ ومختصر غيره مرفوض.
  await mkdir(path.join(tmp, 'old-name'));
  await writeFile(path.join(tmp, 'old-name', 'manifest.json'), JSON.stringify({ name: 'ترجمان - ترجمتك العربية فوق الفيديو', short_name: 'ترجمان' }));
  assert.equal(await outDirProblem(path.join(tmp, 'old-name'), root), null);
  // وبناءات 0.2.0 و1.0.0 بلا short_name واسمها «ترجمان» (الاسم المختصر الحالي): بناء ترجمان (التدقيق الموحد V2، U-067).
  await mkdir(path.join(tmp, 'v1-build', 'pages'), { recursive: true });
  await writeFile(path.join(tmp, 'v1-build', 'manifest.json'), JSON.stringify({ name: 'ترجمان', version: '1.0.0' }));
  assert.equal(await outDirProblem(path.join(tmp, 'v1-build'), root), null);
  await writeFile(path.join(tmp, 'other-ext', 'manifest.json'), JSON.stringify({ name: 'غيره', short_name: 'غيره' }));
  assert.match(await outDirProblem(path.join(tmp, 'other-ext'), root), /ليس بيان ترجمان/);
  await mkdir(path.join(tmp, 'no-manifest', 'pages'), { recursive: true });
  assert.match(await outDirProblem(path.join(tmp, 'no-manifest'), root), /لا بيان ترجمان/);
  // ملفات مدير الملفات وحدها كالفارغ (ملاحظة المراجعة المستقلة: كان مجلد فيه .DS_Store وحده يُرفض).
  await mkdir(path.join(tmp, 'junk-only'));
  for (const f of ['.DS_Store', 'Thumbs.db', 'desktop.ini']) await writeFile(path.join(tmp, 'junk-only', f), 'x');
  assert.equal(await outDirProblem(path.join(tmp, 'junk-only'), root), null);
  // ولا شيء من ذلك بنى شيئًا داخل src.
  assert.equal(await exists(path.join(ROOT, 'src', '..foo')), false);
});

test('U60: البناء في مجلد غائب ثم فوقه من جديد، وملف دخيل فيه يمنع المسح التالي، والرابط الرمزي إليه مرفوض', async () => {
  const dir = path.join(tmp, 'owned');
  assert.equal(node([BUILD, '--out', dir]).status, 0);
  await appendFile(path.join(dir, '.DS_Store'), '');
  const again = node([BUILD, '--out', dir]);
  assert.equal(again.status, 0, again.stderr);
  const link = path.join(tmp, 'owned-link');
  await symlink(dir, link, 'dir');
  const viaLink = node([BUILD, '--out', link]);
  assert.equal(viaLink.status, 1);
  assert.match(viaLink.stderr, /رابط رمزي/);
  // بناء انقطع بعد البيان (يُكتب أولًا الآن): يبقى مجلد بناء يُمسح في التالي.
  const cut = path.join(tmp, 'interrupted');
  await mkdir(path.join(cut, 'background'), { recursive: true });
  await cp(path.join(dir, 'manifest.json'), path.join(cut, 'manifest.json'));
  assert.equal(node([BUILD, '--out', cut]).status, 0);
  await writeFile(path.join(dir, 'notes.txt'), 'mine');
  const r = node([BUILD, '--out', dir]);
  assert.equal(r.status, 1);
  assert.equal(await readFile(path.join(dir, 'notes.txt'), 'utf8'), 'mine');
});

// ---------------------------------------------------------------- U61

/** الصيغ المحقونة: قائمة Gemini (GEM-018b، وما أضافه التحقق) وصيغ DeepSeek الديناميكية (DS-T-08). */
const VARIANTS = {
  'رابط بلا بروتوكول إلى img.src': "const img = document.createElement('img'); img.src = '//evil.example/p.gif';",
  'new Image': 'const i = new Image();',
  'localStorage': "localStorage.setItem('k', 'v');",
  'sessionStorage': "sessionStorage.getItem('k');",
  'indexedDB': "indexedDB.open('x');",
  'setHTMLUnsafe': "document.body.setHTMLUnsafe('<b>x</b>');",
  'createContextualFragment': "document.createRange().createContextualFragment('<b>x</b>');",
  'new Request بلا بروتوكول': "const req = new Request('//evil.example/r');",
  'RTCPeerConnection': 'const pc = new RTCPeerConnection();',
  'WebTransport': "const wt = new WebTransport('https://www.youtube.com/');",
  'Function بلا new': "const f = Function('return 1');",
  'eval غير مباشر': "(0, eval)('1');",
  'innerHTML +=': "document.body.innerHTML += '<b>x</b>';",
  'innerHTML بالأقواس الحرفية': "document.body['innerHTML'] = '<b>x</b>';",
  'downloads.search بنص': "globalThis.chrome.downloads.search({ query: ['x'] });",
  'fetch بأقواس حرفية': "globalThis['fetch']('/x');",
  'fetch بوصل نصين': "globalThis['fe' + 'tch']('/x');",
  'fetch بـReflect.get': "Reflect.get(globalThis, 'fetch')('/x');",
  'fetch بتفكيك globalThis': "const { fetch: f } = globalThis; f('/x');",
  'XMLHttpRequest بالوصل': "const X = globalThis['XMLHttp' + 'Request']; new X();",
  'sendBeacon بالوصل': "navigator['send' + 'Beacon']('/x', 'd');",
  'رابط مقسوم': "const u = 'ht' + 'tps:/' + '/evil.example/c'; document.createElement('img').src = u;",
  'chrome.downloads بالتفكيك': 'const { downloads: d } = chrome; d.erase({});',
  'chrome[downloads] بالوصل': "chrome['down' + 'loads'].removeFile(1);",
  'chrome.storage بالوصل': "chrome['stor' + 'age'].local.get(null);",
  'Function عبر constructor': "(() => {}).constructor('return 1')();",
  'innerHTML بالوصل': "document.body['inner' + 'HTML'] = '<b>x</b>';",
  'import بمتغير': 'const m = import(name);',
  // متغيرات Node العامة (تحقق Gemini، ع-٥، قاعدة node-global): تنجح بها الاختبارات في Node وتتعطل الشيفرة في المتصفح.
  'Buffer (Node)': "const n = Buffer.byteLength('x', 'utf8');",
  'setImmediate (Node)': 'new Promise((r) => setImmediate(r));',
  'clearImmediate (Node)': 'clearImmediate(t);',
  'process.env (Node)': 'const dev = process.env.NODE_ENV;',
  'require (Node)': "const fs = require('fs');",
  '__dirname (Node)': 'const d = __dirname;',
};

const built = path.join(tmp, 'pkg');
assert.equal(node([BUILD, '--out', built]).status, 0);

test('U61: الحزمة السليمة ناجحة 16/16 (و1: no-report-channel وpermissions-request-settings-only)، ولا قاعدة مشتركة تطابق شيئًا فيها', async () => {
  const r = await auditPackage(built);
  assert.deepEqual(r.checks.filter((c) => !c.ok).map((c) => c.id), []);
  assert.equal(r.checks.length, 16);
});

test('U61: تدقيق الحزمة يكشف كل صيغة محقونة في الحزمة المبنية', async () => {
  const missed = [];
  for (const [label, line] of Object.entries(VARIANTS)) {
    const copy = path.join(tmp, 'pkg-copy');
    await rm(copy, { recursive: true, force: true });
    await cp(built, copy, { recursive: true });
    await appendFile(path.join(copy, 'pages/library/main.js'), `\n${line}\n`);
    const r = await auditPackage(copy);
    const net = r.checks.find((c) => c.id === 'no-external-connection-or-forbidden-code');
    if (net.ok) missed.push(label);
  }
  assert.deepEqual(missed, [], 'صيغ أفلتت من التدقيق');
});

test('U61: الفحص الثابت يكشف كل صيغة محقونة في نسخة من المصدر، ولا يكشف شيئًا في المصدر نفسه', async () => {
  const copy = path.join(tmp, 'src-copy');
  await cp(path.join(ROOT, 'src'), copy, { recursive: true });
  const names = Object.keys(VARIANTS);
  for (const [i, label] of names.entries()) await writeFile(path.join(copy, 'pages', 'popup', `probe-${i}.js`), `${VARIANTS[label]}\n`);
  const r = node([path.join(ROOT, 'scripts/check-static.mjs'), '--src', copy]);
  assert.equal(r.status, 1);
  const missed = names.filter((_, i) => !r.stderr.includes(path.join('pages', 'popup', `probe-${i}.js`)));
  assert.deepEqual(missed, [], 'صيغ أفلتت من الفحص الثابت');
  // وكل ما يكشفه الفحص من المصدر خارج probe- هو لا شيء: المصدر الحقيقي ناجح.
  assert.equal(r.stderr.split('\n').filter((l) => l.startsWith('- ') && !l.includes('probe-')).length, 0);
  assert.equal(node([path.join(ROOT, 'scripts/check-static.mjs')]).status, 0);
});

test('U61: القواعد المشتركة لا تمنع تعابير مشروعة (ملاحظة المراجعة المستقلة): المسار النسبي والمصفوفة الحرفية والقالب وتفكيك document', () => {
  for (const ok of ["const p = '/' + id;", "const a = ['x' + n, 2];", 'const b = [n + \'px\'];', 'o[`${k}px`] = 1;', 'const u = `/${id}`;', 'const { body } = document;', "const s = 'https://www.youtube.com/watch?v=' + id;"]) {
    assert.deepEqual(codeViolations(ok).map((r) => r.id), [], ok);
  }
  // وما بقي ممنوعًا عمدًا (موثّق في docs/maintenance.md): الوصول المحسوب بوصل، وتفكيك chrome وglobalThis، وconstructor().
  assert.deepEqual(codeViolations("o[k + 'px'] = 1;").map((r) => r.id), ['concat-key']);
  assert.deepEqual(codeViolations('const { runtime } = chrome;').map((r) => r.id), ['destructure-global']);
  // node-global (ع-٥): الاسم معرّفًا وحده، لا ما يشبهه (ArrayBuffer وrequireVideo وprocessed، وجملة تنتهي بكلمة process).
  for (const ok of ['const ab = new ArrayBuffer(8);', 'requireVideo();', 'const processed = 1;', 'x.processing = 2;', "const t = 'the whole process. Then';", 'const myBuffer = 1;', 'this.requireAll(x);']) {
    assert.deepEqual(codeViolations(ok).map((r) => r.id), [], ok);
  }
  assert.deepEqual(codeViolations('const e = globalThis.process?.env;').map((r) => r.id), ['node-global']);
});

test('U61: القواعد المشتركة لا تطابق شيفرة src ولا الحزمتين (لا إيجابيات كاذبة في الطي)', async () => {
  const walk = async (dir) => (await readdir(dir, { withFileTypes: true, recursive: true })).filter((e) => e.isFile() && /\.(?:js|html|css|json)$/.test(e.name)).map((e) => path.join(e.parentPath ?? e.path, e.name));
  const hits = [];
  for (const f of await walk(built)) {
    const text = await readFile(f, 'utf8');
    for (const r of CODE_RULES) if (r.re.test(text)) hits.push(`${path.relative(built, f)}: ${r.id}`);
  }
  assert.deepEqual(hits, []);
});

/** شجرة مستودع مصغّرة بلا .git: المصدر والسكربتات والحزمة، واعتماديات القفل برابط (كإعادة البناء في store.mjs). */
async function miniTree(name) {
  const t = path.join(tmp, name);
  for (const p of ['src', 'scripts', 'package.json', 'THIRD_PARTY_NOTICES.txt', 'LICENSE']) await cp(path.join(ROOT, p), path.join(t, p), { recursive: true });
  await symlink(path.join(ROOT, 'node_modules'), path.join(t, 'node_modules'), 'dir');
  return t;
}

test('U61: التغليف يرفض مصدرًا يمنعه الفحص الثابت قبل البناء، ولا يكتب شيئًا في مجلد الإخراج', async () => {
  const t = await miniTree('tree-static');
  await appendFile(path.join(t, 'src/pages/popup/main.js'), "\nconst img = new Image();\n");
  const out = path.join(tmp, 'out-static');
  const r = node([path.join(t, 'scripts/release/package.mjs'), '--out', out], t);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /check-static/);
  const left = await readdir(out).catch(() => []);
  assert.deepEqual(left, [], 'لا أرشيف ولا وصف ولا مجلد ولا مجلد مرحلي');
});

test('U61: تدقيق فاشل (ملف دخيل في مجلد الخطوط يمر من الفحص الثابت) لا يترك أرشيفًا ولا وصفًا، ويبقى ما سبق كما هو', async () => {
  const t = await miniTree('tree-audit');
  await writeFile(path.join(t, 'src/ui/fonts/.DS_Store'), 'x');
  const out = path.join(tmp, 'out-audit');
  await mkdir(out);
  await writeFile(path.join(out, 'tarjuman-old.zip'), 'old');
  assert.equal(node([path.join(t, 'scripts/check-static.mjs')], t).status, 0, 'الفحص الثابت لا يرى جذر مجلد الخطوط');
  const r = node([path.join(t, 'scripts/release/package.mjs'), '--out', out], t);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /only-expected-files/);
  assert.deepEqual((await readdir(out)).sort(), ['tarjuman-old.zip']);
});

// ---------------------------------------------------------------- U62 وU63

test('U62: بلا Git (أو داخل مستودع آخر) فالالتزام وحال الشجرة null، والتغليف يكتبهما null ويقول ذلك', async () => {
  const t = await miniTree('tree-nogit');
  assert.deepEqual(sourceState(t, ['src']), { commit: null, dirty: null });
  // مجلد داخل هذا المستودع ليس جذره: لا يُنسب إليه التزام المستودع الخارجي.
  assert.deepEqual(sourceState(path.join(ROOT, 'src'), ['src']), { commit: null, dirty: null });
  const own = sourceState(ROOT, ['src']);
  assert.match(own.commit, /^[0-9a-f]{12}$/);
  assert.equal(typeof own.dirty, 'boolean');
  assert.match(dirtyNote(null), /غير معروفة/);
  assert.equal(dirtyNote(false), '');
  const out = path.join(tmp, 'out-nogit');
  const r = node([path.join(t, 'scripts/release/package.mjs'), '--out', out], t);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /حال الشجرة غير معروفة/);
  const meta = JSON.parse(await readFile(path.join(out, (await readdir(out)).find((f) => f.endsWith('.json'))), 'utf8'));
  assert.equal(meta.commit, null);
  assert.equal(meta.dirty, null);
});

test('U63: وصف الحزمة يحمل Node وzlib والمعمارية والنظام', async () => {
  const env = buildEnvironment();
  assert.deepEqual(Object.keys(env), ['node', 'zlib', 'arch', 'platform']);
  assert.equal(env.zlib, process.versions.zlib);
  const out = path.join(tmp, 'out-nogit');
  const meta = JSON.parse(await readFile(path.join(out, (await readdir(out)).find((f) => f.endsWith('.json'))), 'utf8'));
  assert.deepEqual(meta.build, env);
});

test('U61/U62: notices --check بلا node_modules يقول «شغّل npm ci» بدل ENOENT', async () => {
  const t = path.join(tmp, 'tree-nonm');
  for (const p of ['src', 'scripts', 'package.json', 'package-lock.json', 'THIRD_PARTY_NOTICES.txt']) await cp(path.join(ROOT, p), path.join(t, p), { recursive: true });
  const r = node([path.join(t, 'scripts/release/notices.mjs'), '--check'], t);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /npm ci/);
  assert.doesNotMatch(r.stderr, /ENOENT/);
});
