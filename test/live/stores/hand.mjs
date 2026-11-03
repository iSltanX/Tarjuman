#!/usr/bin/env node
// الجلسة اليدوية (جولة النشر T3): الاستخراج الحقيقي في المتصفحات الأربعة، وبلاغان تجريبيان حقيقيان من Chrome وFirefox. نوافذ
// عادية بلا أي علم تحكم (navigator.webdriver=false)، فيعيد يوتيوب جسم الترجمة كما للمستخدم؛ ببناء التطوير (test: true في
// البلاغ). Brave وEdge بـ--load-extension، وChrome بملف chrome-manual الذي حُمّلت فيه الإضافة يدويًا مرة (P1) من مجلد
// extension-manual فيوضع فيه البناء، وFirefox بـweb-ext run (تثبيت مؤقت عبر خادم أدوات المطوّر، لا Marionette).
// نقرات سلطان: في كل متصفح ⤓ EN ← «تنزيل الملف» ثم «نسخ التعليمات»؛ وفي Chrome وFirefox الإعدادات ← «حول» ← «الإبلاغ عن مشكلة»
// ← «أرسل البلاغ» ← قبول الإذن. السكربت يراقب مجلدات التنزيل وحافظة الجهاز والبلاغات الجديدة في app-reports وحدها، ثم يغلق
// المتصفحات ويقارن، ويتحقق من كل بلاغ برقمه ووسومه (product:tarjuman وkind:* وtest) ثم يغلقه.
//   command node test/live/stores/hand.mjs [--minutes 30] [--out docs/evidence/T3/manual]
//   command node test/live/stores/hand.mjs --finalize <مجلد hand-…> --log <سجل الجلسة> [--out …]
//     إغلاق جلسة انتهت يدها ولم ينتهِ سكربتها: يُتحقق من الملفات (ومنها المجلد الفرعي لمكان الحفظ المختار) ومن أحداث الحافظة في
//     سجل الجلسة ومن البلاغات، وتُغلق البلاغات المتحقق منها.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { pidsOf, quitProfile, readClipboard, setDownloadDir, sentinel, sha16 } from '../../e2e/live/lib.mjs';
import { unpackedIdOf } from '../p1/ext-id.mjs';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport, instructions } from '../../../src/core/export/index.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { APPS } from './driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const MINUTES = Number(val('minutes', 30));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/T3/manual'));
const FINALIZE = val('finalize');
const SESSION_LOG = val('log');
const VIDEO = 'iG9CE55wbtY';
const TITLE = 'Do schools kill creativity? | Sir Ken Robinson | TED';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
const RUN = FINALIZE ? path.basename(FINALIZE).replace(/^hand-/, '') : new Date().toISOString().replace(/[:.]/g, '-');
const WORK = FINALIZE ? path.resolve(FINALIZE) : path.join(PROFILE_ROOT, 't3-work', `hand-${RUN}`);
const EXT_C = path.join(WORK, 'ext-chromium');
const EXT_F = path.join(WORK, 'ext-firefox');
const CHROME_EXT = path.join(PROFILE_ROOT, 'extension-manual');
const REPO = 'iSltanX/app-reports';
const BROWSERS = ['brave', 'chrome', 'edge', 'firefox'];
const dl = (b) => path.join(WORK, b, 'downloads');
// بداية الجلسة من اسم مجلدها في الإغلاق (2026-11-03T21-23-34-287Z ← ISO).
const started = FINALIZE ? new Date(RUN.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z')) : new Date();

// ---- المتوقع من عيّنة P1 نفسها (الجسم الحقيقي للفيديو، ملتقطًا في P1) ----
const body = await readFile(path.join(ROOT, 'test/fixtures/json3/manual-ted-iG9CE55wbtY.json'), 'utf8');
const ex = createExtractor({ currentVideoId: () => VIDEO, durationMs: () => 1203421, isLive: () => false });
ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VIDEO, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false });
const conv = ex.convert('en|manual', { mode: 'normal' });
const EXPECTED_SRT = buildExport({ videoId: VIDEO, title: null, track: { key: 'en|manual', lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: 'normal', now: Date.now() }).files[0].text;

const result = { at: started.toISOString(), video: VIDEO, browsers: {}, clipboard: [], reports: [], notes: [] };
const log = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);

// ---- البناء والملفات ----
await mkdir(WORK, { recursive: true });
if (!FINALIZE) {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', EXT_C], { stdio: 'ignore' });
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--target', 'firefox', '--out', EXT_F], { stdio: 'ignore' });
}
for (const b of BROWSERS) await mkdir(dl(b), { recursive: true });

const appVersion = (app) => {
  try {
    return String(execFileSync('/usr/bin/defaults', ['read', path.join(app, 'Contents/Info.plist'), 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
};
const appOf = (b) => APPS[b].app ?? APPS[b].bin.slice(0, APPS[b].bin.indexOf('.app/') + 4);

// ---- التشغيل: نوافذ عادية أمامية ----
const profiles = {
  brave: path.join(PROFILE_ROOT, `brave-t3-hand-${RUN}`),
  chrome: path.join(PROFILE_ROOT, 'chrome-manual'),
  edge: path.join(PROFILE_ROOT, `edge-t3-hand-${RUN}`),
  firefox: path.join(PROFILE_ROOT, `firefox-t3-hand-${RUN}`),
};
async function openChromium(b, { ext, loadFlag, urls }) {
  const profileDir = profiles[b];
  await mkdir(profileDir, { recursive: true });
  if (pidsOf(profileDir).length) await quitProfile(profileDir);
  await setDownloadDir(profileDir, dl(b));
  const args = ['-n', '-a', appOf(b), '--args', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=1400,950', '--window-position=40,40'];
  if (loadFlag) args.push(`--load-extension=${ext}`);
  args.push(...urls);
  execFileSync('open', args);
}
let webExt = null;
async function openFirefox() {
  const profileDir = profiles.firefox;
  await mkdir(profileDir, { recursive: true });
  const prefs = {
    'browser.shell.checkDefaultBrowser': false, 'browser.aboutwelcome.enabled': false, 'datareporting.policy.dataSubmissionEnabled': false,
    'browser.download.dir': dl('firefox'), 'browser.download.folderList': 2, 'browser.download.useDownloadDir': true,
    'browser.download.always_ask_before_handling_new_types': false, 'browser.download.start_downloads_in_tmp_dir': false,
    // كتم هذه النسخة وحدها.
    'media.volume_scale': '0.0',
  };
  await writeFile(path.join(profileDir, 'user.js'), `${Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n')}\n`);
  webExt = spawn(process.execPath, [path.join(ROOT, 'node_modules/web-ext/bin/web-ext.js'), 'run', '--source-dir', EXT_F, '--firefox', APPS.firefox.bin, '--firefox-profile', profileDir,
    '--keep-profile-changes', '--no-reload', '--no-input', '--start-url', WATCH], { stdio: ['ignore', 'pipe', 'pipe'] });
  let tail = '';
  webExt.stdout.setEncoding('utf8');
  webExt.stdout.on('data', (d) => { tail = (tail + d).slice(-2000); });
  webExt.stderr.on('data', () => {});
  return () => tail;
}

let ffTail = () => '';
if (!FINALIZE) {
  // Chrome: البناء في مجلد الإضافة المحمّلة يدويًا (يقرؤه Chrome عند التشغيل).
  if (pidsOf(profiles.chrome).length) await quitProfile(profiles.chrome);
  await rm(CHROME_EXT, { recursive: true, force: true });
  await cp(EXT_C, CHROME_EXT, { recursive: true });
  const chromeId = unpackedIdOf(CHROME_EXT);

  await openChromium('brave', { ext: EXT_C, loadFlag: true, urls: [WATCH] });
  await sleep(1500);
  await openChromium('edge', { ext: EXT_C, loadFlag: true, urls: [WATCH] });
  await sleep(1500);
  await openChromium('chrome', { ext: CHROME_EXT, loadFlag: false, urls: [WATCH, `chrome-extension://${chromeId}/pages/settings/index.html#about`] });
  await sleep(1500);
  ffTail = await openFirefox();
  log('النوافذ الأربع مفتوحة: الجلسة اليدوية تبدأ.');
}
for (const b of BROWSERS) result.browsers[b] = { browser: `${APPS[b].name} ${appVersion(appOf(b)) ?? '?'}`, profile: path.basename(profiles[b]) };

// ---- المراقبة ----
const seenFiles = new Map();
let lastDownloadBrowser = null;
const reportsSeen = new Map();
let lastGh = 0;
// بحث في المجلد وما تحته: Chrome يحفظ في مجلد فرعي (Tarjuman/) إن اختاره سلطان مكانًا للحفظ.
const listSrt = async (b) => {
  try {
    return (await readdir(dl(b), { recursive: true })).filter((n) => n.endsWith('.srt'));
  } catch {
    return [];
  }
};
function ghReports() {
  const r = spawnSync('gh', ['issue', 'list', '--repo', REPO, '--label', 'product:tarjuman', '--state', 'all', '--json', 'number,title,labels,createdAt,state,body', '--limit', '30'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout).filter((i) => Date.parse(i.createdAt) >= started.getTime() - 60000);
}
if (FINALIZE) {
  // الملفات بأوقات تعديلها، والحافظة من سطور سجل الجلسة، وكل نسخ يُنسب إلى آخر تنزيل قبله.
  for (const b of BROWSERS) {
    for (const f of await listSrt(b)) {
      const full = path.join(dl(b), f);
      seenFiles.set(`${b}/${f}`, { browser: b, file: f, text: await readFile(full, 'utf8'), at: (await stat(full)).mtimeMs });
    }
  }
  const day = started.toISOString().slice(0, 10);
  const lines = SESSION_LOG ? (await readFile(SESSION_LOG, 'utf8')).split('\n') : [];
  for (const line of lines) {
    const m = /^(\d\d:\d\d:\d\d) نسخ إلى الحافظة بعد تنزيل \S+ \((\d+) محرفًا\)/.exec(line);
    if (!m) continue;
    const at = Date.parse(`${day}T${m[1]}Z`);
    const before = [...seenFiles.values()].filter((x) => x.at <= at + 999).sort((x, y) => y.at - x.at)[0];
    result.clipboard.push({ after: before?.browser ?? null, afterFile: before?.file ?? null, length: Number(m[2]), sha: null, at: new Date(at).toISOString() });
  }
  // آخر نسخ ما زال في الحافظة: بصمته تُقارن بالمتوقع أدناه.
  const clip = readClipboard();
  const last = result.clipboard.at(-1);
  if (last && clip.length === last.length) last.sha = sha16(clip);
  for (const i of ghReports() ?? []) reportsSeen.set(i.number, i);
}
const guard = FINALIZE ? null : sentinel();
let lastClip = guard;
const end = FINALIZE ? 0 : Date.now() + MINUTES * 60000;
while (Date.now() < end) {
  for (const b of BROWSERS) {
    for (const f of await listSrt(b)) {
      const key = `${b}/${f}`;
      if (seenFiles.has(key)) continue;
      await sleep(500);
      const text = await readFile(path.join(dl(b), f), 'utf8');
      seenFiles.set(key, { browser: b, file: f, text });
      lastDownloadBrowser = b;
      log(`تنزيل في ${b}: ${f} (${text.length} محرفًا)`);
    }
  }
  const clip = readClipboard();
  if (clip !== lastClip) {
    lastClip = clip;
    if (clip.includes(VIDEO) || /SRT/.test(clip)) {
      result.clipboard.push({ after: lastDownloadBrowser, length: clip.length, sha: sha16(clip), at: new Date().toISOString() });
      log(`نسخ إلى الحافظة بعد تنزيل ${lastDownloadBrowser ?? '—'} (${clip.length} محرفًا)`);
    }
  }
  if (Date.now() - lastGh > 15000) {
    lastGh = Date.now();
    for (const i of ghReports() ?? []) {
      if (reportsSeen.has(i.number)) continue;
      reportsSeen.set(i.number, i);
      log(`بلاغ جديد #${i.number}: ${i.labels.map((l) => l.name).join(', ')}`);
    }
  }
  const browsersWithSrt = new Set([...seenFiles.values()].map((x) => x.browser));
  if (browsersWithSrt.size === BROWSERS.length && reportsSeen.size >= 2 && result.clipboard.length >= BROWSERS.length) break;
  await sleep(1000);
}

// ---- الإغلاق والتحقق ----
for (const b of ['brave', 'edge', 'chrome']) await quitProfile(profiles[b]).catch(() => false);
if (webExt) {
  webExt.kill('SIGINT');
  await sleep(3000);
  if (webExt.exitCode === null) webExt.kill('SIGTERM');
}
if (FINALIZE) {
  // Firefox الذي شغّله web-ext بقي بعد إيقاف السكربت: يُغلق بمسار ملفه.
  const r = spawnSync('pgrep', ['-f', '--', profiles.firefox]);
  for (const pid of String(r.stdout).split('\n').filter(Boolean).map(Number)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // انتهى.
    }
  }
} else {
  result.notes.push(`web-ext: ${ffTail().replace(/\s+/g, ' ').slice(-300)}`);
}
// parseSrtStrict يرمي عند أي خلل ويشترط الترقيم من 1؛ وجزء التقسيم ترقيمه مستمر من أول مقاطعه (first)، فيُعاد ترقيمه من 1
// بعد التحقق من تتابعه ثم يُحلَّل بالصرامة نفسها.
const strictCues = (text, first = 1) => {
  try {
    const blocks = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim().split(/\r?\n\r?\n/);
    if (!blocks.every((blk, i) => blk.split(/\r?\n/)[0] === String(first + i))) return null;
    const renumbered = first === 1 ? text : blocks.map((blk, i) => blk.replace(/^[^\r\n]*/, String(i + 1))).join('\n\n') + '\n';
    return parseSrtStrict(renumbered);
  } catch {
    return null;
  }
};
const expectedCues = strictCues(EXPECTED_SRT);
const plain = instructions({ videoId: VIDEO, title: TITLE });
const expectedInstr = { [sha16(plain)]: 'بلا قاموس', [sha16(instructions({ videoId: VIDEO, title: TITLE, glossary: [] }))]: 'بلا قاموس' };
result.expected = { srtChars: EXPECTED_SRT.length, cues: expectedCues?.length ?? null, instructionsChars: plain.length };
for (const b of BROWSERS) {
  const files = [...seenFiles.values()].filter((x) => x.browser === b);
  const f = files.find((x) => /\.normal\.srt$/.test(x.file)) ?? files[0];
  const cues = f ? strictCues(f.text) : null;
  // ملفات التقسيم (إن نُزّلت): كل جزء SRT صارم، ومجموع مقاطعها بالترتيب = مقاطع الملف الكامل نصًا وتوقيتًا.
  const parts = files.filter((x) => /\.part\d+of\d+\.srt$/.test(x.file)).sort((x, y) => x.file.localeCompare(y.file));
  let split = null;
  if (parts.length) {
    let next = 1;
    const each = parts.map((p) => {
      const c = strictCues(p.text, next);
      next += c?.length ?? 0;
      return { file: p.file, chars: p.text.length, cues: c };
    });
    const joined = each.flatMap((p) => p.cues ?? []);
    const same = !!expectedCues && joined.length === expectedCues.length
      && joined.every((c, i) => c.text === expectedCues[i].text && c.startMs === expectedCues[i].startMs && c.endMs === expectedCues[i].endMs);
    const ranges = [];
    let from = 1;
    each.forEach((p, i) => {
      const n = p.cues?.length ?? 0;
      ranges.push({ index: i + 1, from, to: from + n - 1 });
      from += n;
    });
    const partsInstr = instructions({ videoId: VIDEO, title: TITLE, parts: ranges });
    expectedInstr[sha16(partsInstr)] = 'تعليمات التقسيم';
    split = { files: each.map((p) => ({ file: p.file, chars: p.chars, cues: p.cues?.length ?? null, strict: !!p.cues })), joinedEqualsWhole: same, instructionsChars: partsInstr.length };
  }
  result.browsers[b] = {
    ...result.browsers[b],
    files: files.map((x) => x.file),
    srt: f ? { file: f.file, chars: f.text.length, sha: sha16(f.text), cues: cues?.length ?? null, strict: !!cues, sameAsP1: f.text === EXPECTED_SRT } : null,
    split,
    clipboard: result.clipboard.filter((c) => c.after === b).map((c) => ({
      at: c.at, afterFile: c.afterFile ?? null, length: c.length, sha: c.sha, matches: c.sha ? (expectedInstr[c.sha] ?? 'لا يطابق') : null,
    })),
  };
}
for (const i of reportsSeen.values()) {
  const labels = i.labels.map((l) => l.name);
  const browser = /Firefox/.test(i.body) ? 'firefox' : /Google Chrome/.test(i.body) ? 'chrome' : /Microsoft Edge/.test(i.body) ? 'edge' : /Brave/.test(i.body) ? 'brave' : null;
  const ok = labels.includes('product:tarjuman') && labels.includes('test') && labels.some((l) => l.startsWith('kind:'));
  let closed = i.state === 'CLOSED';
  if (ok && !closed) {
    closed = spawnSync('gh', ['issue', 'close', String(i.number), '--repo', REPO, '--reason', 'completed'], { encoding: 'utf8' }).status === 0;
  }
  result.reports.push({ number: i.number, labels, browser, buildTarget: /"build_target":\s*"(\w+)"/.exec(i.body)?.[1] ?? null, ok, closed });
}
result.done = { srt: new Set([...seenFiles.values()].map((x) => x.browser)).size, clipboard: result.clipboard.length, reports: result.reports.length };
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'hand.json'), `${JSON.stringify(result, null, 2)}\n`);
log(`انتهت الجلسة: ${JSON.stringify(result.done)}`);
