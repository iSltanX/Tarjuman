// التدقيق الموحد V2، U-068: README مجلد الإصدار (scripts/release/v2.mjs) كان يقول «الفحوص الآلية على الالتزام نفسه» بأرقام
// docs/evidence/AA5/checks.json (الالتزام e06f386) أيًّا كان التزام البناء، فنسخها إلى release/v2-198f51e وrelease/v2-b8f94c0.
// صار يذكر التزام الأدلة، ويقارنه بالتزام البناء في ملفات المصدر المبني، ويقول صراحةً إن لم تغطِّ الأدلة الشيفرة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedSince, evidenceScope } from '../../../scripts/release/evidence-scope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HEAD = 'cd82fd1fa59fae2ccf6deec304334b045bd79a3a';

test('U-068: أدلة على التزام البناء نفسه: «على التزام البناء نفسه» بلا تنبيه حي', () => {
  const s = evidenceScope({ head: HEAD, evidenceCommit: 'cd82fd1', changed: [] });
  assert.equal(s.current, true);
  assert.equal(s.checks, 'على التزام البناء نفسه');
  assert.equal(s.live, '');
});

test('U-068: أدلة سابقة تغيّر بعدها المصدر المبني: تُذكر بالتزامها ويُقال إنها لا تغطي البناء، بعدد الملفات', () => {
  const s = evidenceScope({ head: HEAD, evidenceCommit: 'e06f386', changed: Array.from({ length: 37 }, (_, i) => `src/f${i}.js`) });
  assert.equal(s.current, false);
  assert.match(s.checks, /على الالتزام `e06f386` \*\*لا على التزام البناء\*\*/);
  assert.match(s.checks, /37 ملفًا من ملفات المصدر المبني/);
  assert.match(s.checks, /فأعدها على التزام البناء قبل الرفع/);
  assert.match(s.live, /سُجّلت قبل هذا البناء/);
  assert.ok(!/الالتزام نفسه/.test(s.checks + s.live), 'لا «الالتزام نفسه» لأدلة سابقة');
  assert.match(evidenceScope({ head: HEAD, evidenceCommit: 'e06f386', changed: ['src/a.js'] }).checks, /ملف واحد من/);
  assert.match(evidenceScope({ head: HEAD, evidenceCommit: 'e06f386', changed: ['a', 'b'] }).checks, /ملفان من/);
  assert.match(evidenceScope({ head: HEAD, evidenceCommit: 'e06f386', changed: ['a', 'b', 'c'] }).checks, /3 ملفات من/);
});

test('U-068: أدلة سابقة لم يتغير بعدها المصدر المبني تُقبل بذكر التزامها', () => {
  const s = evidenceScope({ head: HEAD, evidenceCommit: 'e06f386', changed: [] });
  assert.equal(s.current, true);
  assert.match(s.checks, /على الالتزام `e06f386` قبل التزام البناء، وملفات المصدر المبني لم تتغير بعده/);
});

test('U-068: التزام أدلة غائب أو مجهول في المستودع لا يُعدّ تغطيةً', () => {
  const missing = evidenceScope({ head: HEAD, evidenceCommit: null, changed: null });
  assert.equal(missing.current, false);
  assert.match(missing.checks, /الأدلة لا تذكر التزامها/);
  const unknown = evidenceScope({ head: HEAD, evidenceCommit: 'deadbee', changed: null });
  assert.equal(unknown.current, false);
  assert.match(unknown.checks, /ولا يوجد في المستودع/);
});

test('U-068: changedSince يعدّ ملفات المسارات المعطاة وحدها، ويعيد null لالتزام مجهول', async () => {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tj-u068-')));
  try {
    const git = (...a) => String(execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd: dir })).trim();
    git('init', '-q');
    await mkdir(path.join(dir, 'src'));
    await writeFile(path.join(dir, 'src', 'a.js'), '1');
    await writeFile(path.join(dir, 'notes.md'), '1');
    git('add', '.');
    git('commit', '-q', '-m', 'أول');
    const first = git('rev-parse', 'HEAD');
    await writeFile(path.join(dir, 'src', 'a.js'), '2');
    await writeFile(path.join(dir, 'notes.md'), '2');
    git('commit', '-q', '-am', 'ثانٍ');
    const second = git('rev-parse', 'HEAD');
    assert.deepEqual(changedSince(dir, first, second, ['src']), ['src/a.js']);
    assert.deepEqual(changedSince(dir, first, second, ['LICENSE']), []);
    assert.deepEqual(changedSince(dir, second, second, ['src']), []);
    assert.equal(changedSince(dir, 'deadbeefdeadbeef', second, ['src']), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('U-068: القالب لا يقول «على الالتزام نفسه»، والمولِّد يملأ نطاق الأدلة ومجلدها', async () => {
  const tpl = await readFile(path.join(ROOT, 'scripts/release/v2-readme.md'), 'utf8');
  assert.ok(!tpl.includes('على الالتزام نفسه'));
  for (const k of ['EVIDENCE_DIR', 'CHECKS_SCOPE', 'LIVE_SCOPE']) assert.ok(tpl.includes(`{{${k}}}`), k);
  assert.ok(!tpl.includes('docs/evidence/AA5'), 'مجلد الأدلة من --evidence لا مكتوبًا في القالب');
  const gen = await readFile(path.join(ROOT, 'scripts/release/v2.mjs'), 'utf8');
  for (const k of ['EVIDENCE_DIR:', 'CHECKS_SCOPE:', 'LIVE_SCOPE:', 'evidenceScope(', 'changedSince(']) assert.ok(gen.includes(k), k);
  assert.ok(!/readJson\(['`]docs\/evidence\/AA5/.test(gen), 'كل قراءة أدلة من مجلد --evidence');
});
