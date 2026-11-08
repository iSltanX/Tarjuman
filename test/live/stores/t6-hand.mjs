#!/usr/bin/env node
// الجلسة اليدوية لمواد المتاجر (جولة النشر T6): تنزيل SRT الحقيقي لفيديو اللقطات من حزمة المتجر نفسها، في نافذة Chrome عادية
// بلا أي علم تحكم (navigator.webdriver=false)، فيعيد يوتيوب جسم الترجمة كما للمستخدم. Chrome بملف chrome-manual الذي حُمّلت فيه
// الإضافة يدويًا مرة (P1) من مجلد extension-manual، فتوضع فيه حزمة المتجر tarjuman-<الإصدار>-chrome.zip مفكوكة كما هي.
// نقرة سلطان الوحيدة: CC بالإنجليزية إن لم تكن مفعّلة، ثم «تحميل الأصل (SRT)» ← «تنزيل الملف».
// السكربت يراقب مجلد التنزيل وحده، ثم يغلق Chrome، ويفحص الملف بالمحلل الصارم، وينسخه إلى مجلد العمل خارج المستودع ليُبنى منه
// جسم الالتقاط للّقطات المؤتمتة (t6-shots.mjs). الأدلة بلا نص مقاطع: الاسم والحجم والبصمة وعدد المقاطع ومداها.
//   command npm run package
//   command node test/live/stores/t6-hand.mjs [--minutes 10] [--out test-results/live/T6/manual]
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { pidsOf, quitProfile, setDownloadDir, sha16 } from '../../e2e/live/lib.mjs';
import { unpackedIdOf } from '../p1/ext-id.mjs';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { readZip } from '../../../scripts/release/zip.mjs';
import { APPS } from './driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const MINUTES = Number(val('minutes', 10));
const OUT = path.resolve(ROOT, val('out', 'test-results/live/T6/manual'));
export const SHOTS_VIDEO = 'Y-rmzh0PI3c';
const WATCH = `https://www.youtube.com/watch?v=${SHOTS_VIDEO}`;
const VERSION = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
const ZIP = path.join(ROOT, 'release/store', `tarjuman-${VERSION}-chrome.zip`);
export const T6_WORK = path.join(PROFILE_ROOT, 't6-work');
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const DL = path.join(T6_WORK, `hand-${RUN}`, 'downloads');
const PROFILE = path.join(PROFILE_ROOT, 'chrome-manual');
const CHROME_EXT = path.join(PROFILE_ROOT, 'extension-manual');
const log = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);

const appOf = (b) => APPS[b].app ?? APPS[b].bin.slice(0, APPS[b].bin.indexOf('.app/') + 4);
const appVersion = (app) => {
  try {
    return String(execFileSync('/usr/bin/defaults', ['read', path.join(app, 'Contents/Info.plist'), 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
};

// ---- حزمة المتجر في مجلد الإضافة المحمّلة يدويًا ----
const zipBuf = await readFile(ZIP);
if (pidsOf(PROFILE).length) await quitProfile(PROFILE);
await rm(CHROME_EXT, { recursive: true, force: true });
for (const e of readZip(zipBuf)) {
  const f = path.join(CHROME_EXT, e.name);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, e.data);
}
const manifest = JSON.parse(await readFile(path.join(CHROME_EXT, 'manifest.json'), 'utf8'));
await mkdir(DL, { recursive: true });
await setDownloadDir(PROFILE, DL);
execFileSync('open', ['-n', '-a', appOf('chrome'), '--args', `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--window-size=1400,950', '--window-position=40,40', WATCH]);
log(`Chrome مفتوح على فيديو اللقطات بحزمة المتجر ${manifest.version} (${unpackedIdOf(CHROME_EXT)}). المنتظر: «تحميل الأصل (SRT)» ← «تنزيل الملف».`);

// ---- المراقبة ----
const listSrt = async () => (await readdir(DL, { recursive: true }).catch(() => [])).filter((n) => n.endsWith('.srt'));
let file = null;
const end = Date.now() + MINUTES * 60000;
while (!file && Date.now() < end) {
  const found = await listSrt();
  if (found.length) {
    await sleep(800);
    file = found[0];
  } else {
    await sleep(1000);
  }
}
await sleep(1500);
await quitProfile(PROFILE);

const result = { at: new Date().toISOString(), browser: `Chrome ${appVersion(appOf('chrome')) ?? '?'}`, package: path.basename(ZIP), manifestVersion: manifest.version, video: SHOTS_VIDEO, webdriver: false, file: null, notes: [] };
if (!file) {
  result.notes.push(`لم يصل ملف خلال ${MINUTES} دقيقة`);
} else {
  const text = await readFile(path.join(DL, file), 'utf8');
  let cues = [];
  let strict = true;
  try {
    cues = parseSrtStrict(text);
  } catch (err) {
    strict = false;
    result.notes.push(`المحلل الصارم: ${err.message}`);
  }
  result.file = {
    name: path.basename(file),
    bytes: Buffer.byteLength(text),
    sha16: sha16(text),
    strict,
    cues: cues.length,
    firstStartMs: cues[0]?.startMs ?? null,
    lastEndMs: cues.at(-1)?.endMs ?? null,
  };
  await copyFile(path.join(DL, file), path.join(T6_WORK, `${SHOTS_VIDEO}.en.srt`));
  log(`نُزّل ${result.file.name}: ${result.file.bytes} بايت، ${result.file.cues} مقطعًا، والمحلل الصارم ${result.file.strict ? 'يقبله' : 'يرفضه'}`);
}
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'hand.json'), `${JSON.stringify(result, null, 2)}\n`);
log(`النتيجة في ${path.relative(ROOT, path.join(OUT, 'hand.json'))}`);
process.exit(file ? 0 : 1);
