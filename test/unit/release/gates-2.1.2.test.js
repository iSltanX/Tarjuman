// F-07 وN-04: القواعد الثابتة الموسَّعة، وإبلاغ كل تخطٍّ وفشله في CI، واستثناءات فحص الأسرار بالسطر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeViolations } from '../../../scripts/code-rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const childEnv = (over = {}) => {
  const env = { ...process.env, ...over };
  delete env.NODE_TEST_CONTEXT;
  if (!('CI' in over)) delete env.CI;
  return env;
};
const node = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: childEnv(opts.env), ...opts.spawn });
const inTemp = (fn) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tj-gates-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// ---- القواعد ----

test('setHTML ممنوع كـsetHTMLUnsafe', () => {
  assert.deepEqual(codeViolations('el.setHTML(html);').map((r) => r.id), ['html-string']);
});

test('parseFromString ممنوع بأي نوع MIME', () => {
  for (const type of ['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml']) {
    assert.deepEqual(codeViolations(`new DOMParser().parseFromString(s, '${type}');`).map((r) => r.id), ['html-string'], type);
  }
  assert.deepEqual(codeViolations('p.parseFromString(s, mime);').map((r) => r.id), ['html-string'], 'والنوع متغير');
});

function staticOn(patch) {
  return inTemp((dir) => {
    const src = path.join(dir, 'src');
    cpSync(path.join(ROOT, 'src'), src, { recursive: true });
    patch(src);
    return node([path.join(ROOT, 'scripts/check-static.mjs'), '--src', src]);
  });
}

const addLine = (file, line, anchor) => (src) => {
  const p = path.join(src, file);
  const text = readFileSync(p, 'utf8');
  assert.ok(text.includes(anchor), anchor);
  writeFileSync(p, text.replace(anchor, `${line}\n${anchor}`));
};

test('الفحص الثابت: origFetch.call طلب زائد يُرفض', () => {
  const r = staticOn(addLine('main-world/capture.js', 'origFetch.call(window, location.href);', 'const XHR = window.XMLHttpRequest.prototype;'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /capture\.js.*اسم مستعار/);
});

test('الفحص الثابت: اسم مستعار جديد لـorigFetch أو تعديل سطر التمرير يُرفضان', () => {
  assert.equal(staticOn(addLine('main-world/capture.js', 'const g = origFetch;', 'const XHR = window.XMLHttpRequest.prototype;')).status, 1);
  const edited = staticOn((src) => {
    const p = path.join(src, 'main-world/capture.js');
    writeFileSync(p, readFileSync(p, 'utf8').replace('return origOpen.apply(this, arguments);', 'return origOpen.call(this, method, url);'));
  });
  assert.equal(edited.status, 1);
});

test('الفحص الثابت: origOpen وpageFetch خارج ملفيهما يُرفضان', () => {
  assert.equal(staticOn(addLine('pages/popup/status.js', 'pageFetch("/x");', 'export function pageReport')).status, 1);
});

test('الفحص الثابت: الشجرة الحالية ناجحة', () => {
  assert.equal(node(['scripts/check-static.mjs']).status, 0);
});

// ---- التخطي ----

function runTests(testBody, env) {
  return inTemp((dir) => {
    writeFileSync(path.join(dir, 'a.test.js'), `import { test } from 'node:test';\n${testBody}\n`);
    return node(['scripts/run-tests.mjs', dir], { env });
  });
}

test('run-tests: التخطي يُذكر باسمه وسببه، والمحلي ينجح', () => {
  const r = runTests("test('سليم', () => {});\ntest('يحتاج أداة', { skip: 'الأداة غائبة' }, () => {});");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /run-tests: مُتخطّى 1/);
  assert.match(r.stderr, /يحتاج أداة \(الأداة غائبة\)/);
});

test('run-tests: أي تخطٍّ يفشل في CI', () => {
  const r = runTests("test('يحتاج أداة', { skip: 'الأداة غائبة' }, () => {});", { CI: 'true' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /التخطي ممنوع في CI/);
});

test('run-tests: بلا تخطٍّ لا يذكره، وفي CI ينجح', () => {
  const r = runTests("test('سليم', () => {});", { CI: 'true' });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /مُتخطّى/);
});

// ---- استثناءات الأسرار بالسطر ----

/** شجرة صغيرة بنطاقي العيّنات وملف مستثنى بسطره. */
function secretsTree(dir, extraLine = '') {
  mkdirSync(path.join(dir, 'test/fixtures'), { recursive: true });
  mkdirSync(path.join(dir, 'test/e2e/fixtures'), { recursive: true });
  writeFileSync(path.join(dir, 'test/fixtures/ok.txt'), 'ok\n');
  writeFileSync(path.join(dir, 'test/e2e/fixtures/ok.txt'), 'ok\n');
  const rel = 'test/unit/save/save.test.js';
  mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), `${readFileSync(path.join(ROOT, rel), 'utf8')}${extraLine}`);
}

const secrets = (dir) => node(['scripts/check-secrets.mjs', '--root', dir]);
const PATH_LINE = ['/', 'Users/someone/leak.txt'].join('');

test('check-secrets: الملف المستثنى ناجح بأسطره المحددة', () => {
  inTemp((dir) => {
    secretsTree(dir);
    const r = secrets(dir);
    assert.equal(r.status, 0, r.stderr);
  });
});

test('check-secrets: اكتشاف جديد في ملف مستثنى يُرفض', () => {
  inTemp((dir) => {
    secretsTree(dir, `\nconst leaked = '${PATH_LINE}';\n`);
    const r = secrets(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /save\.test\.js@\d+: local-path/);
  });
});

test('check-secrets: استثناء لسطر زال يُرفض حتى لا تبقى القائمة أوسع مما تحتاج', () => {
  inTemp((dir) => {
    secretsTree(dir);
    const p = path.join(dir, 'test/unit/save/save.test.js');
    const pattern = new RegExp(['/', 'Users', '/'].join(''), 'g');
    writeFileSync(p, readFileSync(p, 'utf8').replace(pattern, '/home/'));
    const r = secrets(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /استثناء لسطر/);
  });
});
