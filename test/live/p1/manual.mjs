#!/usr/bin/env node
// جلسة غير مؤتمتة: متصفح عادي بملف اختبار منفصل، بلا --remote-debugging-* ولا --enable-automation ولا أي
// إخفاء لعلامة. التفاعل الوحيد فتح روابط عادية من نظام التشغيل (كما يفتح المستخدم رابطًا)، والنتائج
// تصدّرها صفحة الإضافة إلى مجلد التنزيلات.
//   node test/live/p1/manual.mjs open   --browser brave --profile brave-manual [--ext <مجلد>] <رابط…>
//   node test/live/p1/manual.mjs export --browser brave --profile brave-manual --ext <مجلد> --label <اسم>
//   node test/live/p1/manual.mjs quit   --profile brave-manual
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';

const APPS = { brave: '/Applications/Brave Browser.app', chrome: '/Applications/Google Chrome.app' };
const argv = process.argv.slice(2);
const cmd = argv[0];
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const urls = argv.filter((a) => /^https?:\/\//.test(a));
const browser = val('browser', 'brave');
const profileDir = path.join(PROFILE_ROOT, val('profile', `${browser}-manual`));
const ext = val('ext');

/** معرّف الإضافة غير المعبأة من مسارها (sha256 ← أول 32 رقمًا ست عشريًا ← a…p). */
export function unpackedId(dir) {
  return createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 32)
    .split('').map((h) => String.fromCharCode(97 + parseInt(h, 16))).join('');
}

function openUrls(list) {
  const args = ['-g', '-na', APPS[browser], '--args', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--lang=en-US', '--mute-audio'];
  if (ext) args.push(`--load-extension=${path.resolve(ext)}`);
  execFileSync('open', [...args, ...list]);
}

async function newestExport(label, since) {
  const dir = path.join(os.homedir(), 'Downloads');
  const names = (await readdir(dir)).filter((n) => n.startsWith('tarjuman-p1-') && n.includes(`-${label}-`) && n.endsWith('.json'));
  let best = null;
  for (const n of names) {
    const s = await stat(path.join(dir, n));
    if (s.mtimeMs >= since && (!best || s.mtimeMs > best.t)) best = { file: path.join(dir, n), t: s.mtimeMs };
  }
  return best && best.file;
}

if (cmd === 'open') {
  openUrls(urls);
  console.log(`فُتح ${urls.length} رابط في ${browser} (${path.basename(profileDir)})`);
} else if (cmd === 'export' || cmd === 'cycle') {
  const label = val('label');
  // cycle: يفتح الروابط أولًا ثم يصدّر. --wait <ثوانٍ>: مهلة ليعمل المشغّل ويلتقط ويعرض الترجمة.
  if (cmd === 'cycle') openUrls(urls);
  await sleep(Number(val('wait', 0)) * 1000);
  const since = Date.now() - 1000;
  openUrls([`chrome-extension://${unpackedId(ext)}/pages/poc/index.html#export=${label}${argv.includes('--close') ? '&close' : ''}${argv.includes('--srt') ? '&srt' : ''}`]);
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    const f = await newestExport(label, since);
    if (f) {
      console.log(f);
      process.exit(0);
    }
  }
  console.error('لم يظهر ملف التصدير خلال 40 ثانية');
  process.exit(1);
} else if (cmd === 'quit') {
  const r = spawnSync('pgrep', ['-f', '--', `user-data-dir=${profileDir} `]);
  const pids = String(r.stdout).split('\n').filter(Boolean).map(Number);
  const main = [];
  for (const pid of pids) {
    const c = String(spawnSync('ps', ['-o', 'command=', '-p', String(pid)]).stdout);
    if (!c.includes('--type=')) main.push(pid);
  }
  for (const pid of main) process.kill(pid, 'SIGTERM');
  console.log(`أُغلقت ${main.length} عملية رئيسية`);
} else {
  console.error('الأوامر: open | export | quit');
  process.exit(2);
}
