#!/usr/bin/env node
// (١) أي اختبار وحدة يُتخطّى: test/unit/ui/logo.test.js (ادعاء Gemini: يُتخطّى بغياب @resvg/resvg-js) مقابل U78 في
//     test/unit/export/c5-export.test.js (يُتخطّى بغياب ffmpeg). يشغّل الملفين بـnode --test في نسخة المستودع المعطاة،
//     مرة بـPATH كامل ومرة بـPATH بلا مجلد ffmpeg.
// (٢) ادعاء HOME في c8-tooling: outDirProblem من scripts/targets.mjs على مجلد لا يُقرأ (mode 000) يرمي EACCES/EPERM.
//     المجلد مؤقت في os.tmpdir() ويُحذف بعد الفحص.
//   command node skip-and-home.mjs <مسار نسخة المستودع>
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(process.argv[2] ?? '.');
const nodeBin = process.execPath;
const ffmpeg = spawnSync('/usr/bin/which', ['ffmpeg'], { encoding: 'utf8' }).stdout.trim();
const pathNoFfmpeg = process.env.PATH.split(':').filter((d) => !ffmpeg || d !== path.dirname(ffmpeg)).join(':');

function run(file, envPath) {
  const r = spawnSync(nodeBin, ['--test', '--test-reporter=tap', file], { cwd: repo, encoding: 'utf8', env: { ...process.env, PATH: envPath } });
  const pick = (k) => Number((new RegExp(`^# ${k} (\\d+)`, 'm').exec(r.stdout) ?? [])[1] ?? NaN);
  const skipped = [...r.stdout.matchAll(/^\s*ok \d+ - (.*) # SKIP(.*)$/gm)].map((m) => `${m[1].slice(0, 80)} — SKIP${m[2]}`);
  return { file, status: r.status, tests: pick('tests'), pass: pick('pass'), skip: pick('skip'), fail: pick('fail'), skipped };
}

console.log(`repo: ${path.basename(repo)} | ffmpeg on PATH: ${ffmpeg ? 'yes' : 'no'}`);
for (const f of ['test/unit/ui/logo.test.js', 'test/unit/export/c5-export.test.js']) {
  console.log('full PATH       ', JSON.stringify(run(f, process.env.PATH)));
  console.log('PATH w/o ffmpeg ', JSON.stringify(run(f, pathNoFfmpeg)));
}

const { outDirProblem } = await import(path.join(repo, 'scripts/targets.mjs'));
const base = await mkdtemp(path.join(os.tmpdir(), 'a7-home-'));
const fakeHome = path.join(base, 'home');
await mkdir(fakeHome);
await writeFile(path.join(fakeHome, '.profile'), 'x');
const root = { root: repo };
console.log('readable fake HOME     ', JSON.stringify(await outDirProblem(fakeHome, root).then((v) => ({ value: v }), (e) => ({ threw: e.code }))));
await chmod(fakeHome, 0o000);
console.log('unreadable fake HOME   ', JSON.stringify(await outDirProblem(fakeHome, root).then((v) => ({ value: v }), (e) => ({ threw: e.code }))));
await chmod(fakeHome, 0o755);
await rm(base, { recursive: true, force: true });
