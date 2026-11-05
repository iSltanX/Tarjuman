#!/usr/bin/env node
// مصفوفة P1 في متصفح غير مؤتمت ومخفي: إطلاق واحد بـopen -g -j (لا يتقدم أمام المستخدم ولا يأخذ التركيز)،
// وبلا --remote-debugging-* ولا --enable-automation. مشغّل صفحة الفحص يفتح روابط يوتيوب الموثّقة في
// تبويبات النافذة المخفية ويصدّر ملفًا واحدًا، ثم يُغلق المتصفح وتُتحقق النتائج.
//   node test/live/p1/hidden-run.mjs --browser chrome --profile chrome-manual --ext <مجلد> --label chrome-matrix
//     [--only manual,asr,long,nocap,tlang] [--positions 1-10] [--fixtures <مجلد>]
import { execFileSync, spawnSync } from 'node:child_process';
import { readdir, stat, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { randomPositions } from '../../helpers/positions.mjs';
import { unpackedIdOf } from './ext-id.mjs';
import { findSecrets, sanitizeDeep } from '../../../src/core/diagnostics/sanitize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = { brave: '/Applications/Brave Browser.app', chrome: '/Applications/Google Chrome.app' };
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'chrome');
const profileDir = path.join(PROFILE_ROOT, val('profile', `${browser}-manual`));
const ext = path.resolve(val('ext'));
const label = val('label', `${browser}-hidden`);
const only = (val('only') || 'manual,asr,long,nocap,tlang').split(',');
const [pFrom, pTo] = (val('positions') || '1-10').split('-').map(Number);
const SEED = Number(val('seed', 20261101));
const WAIT_MS = Number(val('wait', 25)) * 1000;
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`);

const VIDEOS = {
  manual: { id: 'iG9CE55wbtY', lengthSec: 1203 },
  asr: { id: 'Y9rkKtK1b44', lengthSec: 3000 },
  long: { id: 'gBazR59SZXk', lengthSec: 6668 },
  nocap: { id: 'aqz-KE-bpKQ', lengthSec: 635 },
};
const watch = (id, q) => `https://www.youtube.com/watch?v=${id}&${q}`;

const plan = [];
for (const kind of ['manual', 'asr']) {
  if (!only.includes(kind)) continue;
  const times = randomPositions(VIDEOS[kind].lengthSec, SEED + (kind === 'asr' ? 1 : 0));
  times.forEach((t, i) => {
    if (i + 1 >= pFrom && i + 1 <= pTo) plan.push({ name: `${kind}-p${i + 1}`, url: watch(VIDEOS[kind].id, `t=${Math.floor(t)}s&cc_load_policy=1&cc_lang_pref=en`), waitMs: WAIT_MS });
  });
}
// --warmup: خطوة أولى تُهمل نتيجتها؛ أول صفحة مشاهدة في جلسة جديدة اختار فيها المشغّل العربية رغم cc_lang_pref=en.
if (argv.includes('--warmup') && plan.length) plan.unshift({ ...plan[0], name: 'warmup' });
// قائمة تشغيل من فيديوهات قصيرة: يوتيوب تنتقل بنفسها إلى التالي تنقلًا داخليًا (SPA) بلا نقر ولا أتمتة.
// MinutePhysics «Quantum Mechanics»: أول 11 فيديو بين 1:04 و3:14 وكلها بمسار إنجليزي يدوي وتلقائي.
if (only.includes('playlist')) {
  plan.push({ name: 'warmup', url: watch('Q_h4IoPJXZw', 'cc_load_policy=1&cc_lang_pref=en'), waitMs: 15000 });
  plan.push({ name: 'playlist', url: watch('Q_h4IoPJXZw', 'list=PL0E2ABD1D84697428&cc_load_policy=1&cc_lang_pref=en'), waitMs: Number(val('playlist-min', 19)) * 60000 });
}
if (only.includes('long')) plan.push({ name: 'long', url: watch(VIDEOS.long.id, 't=1800s&cc_load_policy=1&cc_lang_pref=en'), waitMs: WAIT_MS + 5000 });
if (only.includes('nocap')) plan.push({ name: 'nocap', url: watch(VIDEOS.nocap.id, 'cc_load_policy=1&cc_lang_pref=en'), waitMs: 20000 });
if (only.includes('tlang')) plan.push({ name: 'tlang', url: watch(VIDEOS.asr.id, 't=600s&cc_load_policy=1&cc_lang_pref=ar'), waitMs: WAIT_MS });

function quit() {
  const r = spawnSync('pgrep', ['-f', '--', `user-data-dir=${profileDir} `]);
  for (const pid of String(r.stdout).split('\n').filter(Boolean).map(Number)) {
    if (String(spawnSync('ps', ['-o', 'command=', '-p', String(pid)]).stdout).includes('--type=')) continue;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // انتهت العملية قبل الإشارة.
    }
  }
}

quit();
await sleep(3000);
const planB64 = Buffer.from(JSON.stringify(plan)).toString('base64url');
const runUrl = `chrome-extension://${unpackedIdOf(ext)}/pages/poc/index.html#run=${label}&plan=${planB64}`;
const args = ['-g', '-j', '-na', APPS[browser], '--args', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--lang=en-US', '--mute-audio'];
if (browser === 'brave') args.push(`--load-extension=${ext}`);
const started = Date.now();
execFileSync('open', [...args, runUrl]);
log(`أُطلق ${browser} مخفيًا بخطة من ${plan.length} خطوة`);

const dl = path.join(os.homedir(), 'Downloads');
const budget = plan.reduce((s, p) => s + p.waitMs + 6000, 0) + 360000;
let file = null;
while (!file && Date.now() - started < budget) {
  await sleep(5000);
  for (const n of await readdir(dl)) {
    if (n.startsWith('tarjuman-p1-') && n.includes(`-${label}-`) && n.endsWith('.json') && (await stat(path.join(dl, n))).mtimeMs >= started) file = path.join(dl, n);
  }
}
quit();
if (!file) {
  log('لم يظهر ملف النتائج ضمن المهلة');
  process.exit(1);
}
log(`النتائج: ${file}`);
const head = JSON.parse(await readFile(file, 'utf8'));
if (head.blocked) {
  log(`أوقفت صفحة الإضافة التصدير: ${head.count} نمط (${head.types.join('، ')})`);
  process.exit(1);
}
const vArgs = [path.join(HERE, 'verify-export.mjs'), file, '--label', label];
if (val('fixtures')) vArgs.push('--fixtures', val('fixtures'));
console.log(execFileSync(process.execPath, vArgs, { encoding: 'utf8' }).split('\n')[0]);

// ملخص لكل خطوة من الأدلة المنقّاة.
const ev = JSON.parse(await readFile(path.join(ROOT, `docs/evidence/P1/manual/${label}.json`), 'utf8'));
const summary = { label, browser: ev.browser, storage: ev.storage, missing: ev.missing, seed: SEED, steps: [] };
for (const t of ev.tabs) {
  const kind = (t.step || '').split('-')[0];
  const vid = VIDEOS[kind] ? VIDEOS[kind].id : t.currentVideoId;
  const a = t.accepted.filter((x) => x.videoId === vid).pop();
  summary.steps.push({
    step: t.step, videoId: t.currentVideoId, webdriver: t.webdriverPage,
    accepted: a ? {
      lang: a.lang, trackKind: a.trackKind, format: a.format, transport: a.transport, bodyLength: a.bodyLength, bodySha256: a.bodySha256,
      invariants: a.invariants ? a.invariants.filter((r) => r.ok).length : 0, cues: a.report.cueCount, words: a.report.sourceWords,
      duplicatesRemoved: a.report.duplicatesRemoved, completeness: a.report.completeness, inferredKind: a.report.inferredKind,
      nodeReconvertSame: a.nodeReconvertSame, shown: a.shownChecks.map((c) => ({ timeSec: c.timeSec, verdict: c.verdict, match: c.match })),
    } : null,
    rejected: t.rejected.map((r) => ({ code: r.code, sameVideo: r.videoId === t.currentVideoId, lang: r.lang, trackKind: r.trackKind, hasTlang: r.hasTlang, bodyLength: r.bodyLength })),
  });
  const s = summary.steps[summary.steps.length - 1];
  log(`${s.step}: ${s.accepted ? `${s.accepted.trackKind} ${s.accepted.bodyLength} · ثوابت ${s.accepted.invariants}/6 · معروض ${s.accepted.shown.filter((x) => x.match).length}/${s.accepted.shown.length} (${s.accepted.shown.map((x) => x.verdict).join('،')})` : 'لا التقاط مقبول'} · مرفوض ${s.rejected.map((r) => r.code).join('،') || '—'}`);
}
const text = `${JSON.stringify(sanitizeDeep(summary), null, 2)}\n`;
if (findSecrets(text).length) throw new Error('الملخص فيه نمط حساس');
const rel = `docs/evidence/P1/manual/${label}-summary.json`;
await mkdir(path.dirname(path.join(ROOT, rel)), { recursive: true });
await writeFile(path.join(ROOT, rel), text);
log(`الملخص: ${rel} · ناقص: ${ev.missing.length}`);
