#!/usr/bin/env node
// الجلسة اليدوية للاستخراج الحقيقي (P9-AC1 «استخراج»، وP9-AC2 لليدوي والتلقائي والطويل والبث المسجّل). المتصفح كما
// يشغّله المستخدم بلا أي علم تحكم ولا اتصال (navigator.webdriver=false)، ببناء الإنتاج نفسه، ونافذة أمامية بأربعة
// تبويبات بمعاملي يوتيوب الموثّقين (cc_load_policy وcc_lang_pref) كما في P1. النقرات بيد سلطان في شريط المشغّل:
// «تحميل الترجمة» ثم «تنزيل SRT» (و«مقاطع أطول» لفيديو ميدواي)، و«نسخ تعليمات الترجمة» في تبويب TED. السكربت يراقب
// مجلد التنزيل والحافظة فقط، ثم يغلق المتصفح ويقارن الملفات بايتًا بالمراجع. منفذ التصحيح يجعل webdriver=true فيعيد
// يوتيوب الجسم فارغًا (قيس في P9)، فلا بديل عن اليد هنا.
// والحافظة: لا يُلتفت إلا إلى نص تعليمات الترجمة (بسطره الأول)؛ ما ينسخه سلطان في عمله لا يُحفظ ولا يُقارن.
//   node test/e2e/live/hand.mjs --browser brave --live s6MmNDkSkSM [--minutes 25] [--monitor] [--only asr,long]
//   --monitor  يراقب جلسة يدوية مفتوحة بالفعل (لا بناء ولا تشغيل)، ويغلقها في النهاية.
//   --only     بنود بعينها لإكمال جلسة سابقة: لا يُمسح ما نُزّل قبلها، والأدلة في hand-<البنود>.json.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import {
  BROWSERS, Evidence, PROFILE_ROOT, ROOT, WORK, launchBrowser, loadState, pidsOf, quitProfile, readClipboard, saveState,
  sentinel, setDownloadDir, sha16, sleep, specInstructions,
} from './lib.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const LIVE = val('live');
const MINUTES = Number(val('minutes', 25));
const spec = BROWSERS[browser];
const profileDir = path.join(PROFILE_ROOT, spec.profile);
const DL = path.join(WORK, browser, 'hand-downloads');
const TED_TITLE = 'Do schools kill creativity? | Sir Ken Robinson | TED';

const ONLY = val('only') ? val('only').split(',') : null;
const ITEMS = [
  { slot: 'manual', id: 'iG9CE55wbtY', kind: 'manual', mode: 'normal', ref: { fixture: 'manual-ted-iG9CE55wbtY.json', durationMs: 1203421 } },
  { slot: 'asr', id: 'Y9rkKtK1b44', kind: 'asr', mode: 'long', ref: { fixture: 'asr-nwc-Y9rkKtK1b44.json', durationMs: 3600000 } },
  { slot: 'long', id: 'gBazR59SZXk', kind: 'manual', mode: 'normal', ref: { srt: 'docs/evidence/P1/srt/gBazR59SZXk.en.manual.srt' } },
  ...(LIVE ? [{ slot: 'live', id: LIVE, kind: null, mode: 'normal', ref: null }] : []),
].filter((it) => !ONLY || ONLY.includes(it.slot));
/** نسخ التعليمات من الشريط مطلوب في جلسة فيها فيديو TED وحدها. */
const WANT_COPY = ITEMS.some((it) => it.slot === 'manual');
const fileRe = (it) => new RegExp(`^${it.id.replace(/-/g, '\\-')}\\.en\\.(manual|asr)\\.${it.mode}\\.srt$`);

async function expected(it) {
  if (it.ref?.srt) return readFile(path.join(ROOT, it.ref.srt), 'utf8');
  const body = await readFile(path.join(ROOT, 'test/fixtures/json3', it.ref.fixture), 'utf8');
  const ex = createExtractor({ currentVideoId: () => it.id, durationMs: () => it.ref.durationMs, isLive: () => false });
  ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: it.id, lang: 'en', trackKind: it.kind, kindParam: it.kind === 'asr' ? 'asr' : null, capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false });
  const conv = ex.convert(`en|${it.kind}`, { mode: it.mode });
  return buildExport({ videoId: it.id, title: null, track: { key: `en|${it.kind}`, lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: it.mode, now: Date.now() }).files[0].text;
}

const version = execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(spec.app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
const ev = new Evidence(path.join(ROOT, 'docs/evidence/P9', browser), ONLY ? `hand-${ONLY.join('-')}` : 'hand', { step: 'hand', browser: `${spec.name} ${version}`, session: 'نافذة عادية بلا أي علم تحكم ولا اتصال؛ النقرات بيد سلطان' });
const state = await loadState(browser);

const MONITOR = argv.includes('--monitor');
let session;
if (MONITOR) {
  if (!pidsOf(profileDir).length) throw new Error(`لا جلسة يدوية مفتوحة بملف ${spec.profile}`);
  session = { quit: () => quitProfile(profileDir) };
  console.log(`مراقبة جلسة ${spec.name} ${version} اليدوية المفتوحة…`);
} else {
  if (pidsOf(profileDir).length) throw new Error(`${spec.name} يعمل بملف ${spec.profile}؛ أغلقه أولًا`);
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--out', spec.ext], { cwd: ROOT, stdio: 'ignore' });
  if (!ONLY) await rm(DL, { recursive: true, force: true });
  await mkdir(DL, { recursive: true });
  for (const n of await readdir(DL)) if (ITEMS.some((it) => fileRe(it).test(n))) await rm(path.join(DL, n));
  await setDownloadDir(profileDir, DL);
  sentinel();
  const urls = ITEMS.map((it) => `https://www.youtube.com/watch?v=${it.id}&cc_load_policy=1&cc_lang_pref=en`);
  session = await launchBrowser(browser, { debug: false, urls });
  console.log(`أُطلق ${spec.name} ${version} بلا تحكم، والإضافة ${session.extId} (بناء الإنتاج). بانتظار نقرات سلطان…`);
}
const HEADER = specInstructions('iG9CE55wbtY', null).split('\n')[0];
const ours = (t) => typeof t === 'string' && t.startsWith(HEADER);

const seen = new Map();
let copied = null;
let splitParts = [];
const end = Date.now() + MINUTES * 60000;
let doneAt = null;
let filesAt = null;
while (Date.now() < end) {
  if (!pidsOf(profileDir).length) {
    ev.note('أُغلق المتصفح قبل اكتمال الملفات.');
    break;
  }
  const names = (await readdir(DL)).filter((n) => !n.endsWith('.crdownload'));
  for (const it of ITEMS) {
    const n = names.find((x) => fileRe(it).test(x));
    if (n && !seen.has(it.slot)) {
      seen.set(it.slot, n);
      console.log(`  نُزّل ${n}`);
    }
  }
  splitParts = names.filter((x) => /\.part\d+/.test(x) || /-part-?\d+/.test(x) || /\.\d+of\d+\./.test(x));
  const clipNow = readClipboard();
  if (ours(clipNow) && clipNow !== copied) {
    copied = clipNow;
    console.log(`  نُسخت تعليمات الترجمة (${copied.length} محرفًا)`);
  }
  const files = ITEMS.every((it) => seen.has(it.slot));
  if (files && !filesAt) filesAt = Date.now();
  // النسخ ينتظر ثلاث دقائق بعد اكتمال الملفات، ثم يُسجَّل غيابه ولا يُعلَّق الاختبار.
  const ready = files && (!WANT_COPY || copied || Date.now() - filesAt > 180000);
  if (ready && !doneAt) doneAt = Date.now();
  // مهلة بعد اكتمال المطلوب لما هو اختياري (تقسيم Chrome الاحتياطي).
  if (doneAt && Date.now() - doneAt > (browser === 'chrome' ? 150000 : 8000)) break;
  await sleep(2000);
}
await session.quit();

for (const it of ITEMS) {
  const name = seen.get(it.slot);
  const got = name ? await readFile(path.join(DL, name), 'utf8') : null;
  const cues = got ? parseSrtStrict(got).length : null;
  const res = { name: name ?? null, bytes: got && Buffer.byteLength(got), sha: got && sha16(got), cues };
  if (it.ref) {
    const exp = await expected(it);
    res.expected = { bytes: Buffer.byteLength(exp), sha: sha16(exp) };
    ev.check(`hand-${it.slot}-real-extraction-matches-reference`, got === exp, res);
  } else {
    ev.check(`hand-${it.slot}-real-extraction-valid-srt`, !!got && cues > 0 && findSecrets(got, ['url']).length === 0, { ...res, kind: name?.split('.')[2] ?? null });
  }
  state.videos[it.id] = { ...(state.videos[it.id] ?? {}), slot: it.slot, srtName: name ?? null, srtSha: got ? sha16(got) : null, cues };
}
if (WANT_COPY) {
  const expInstr = specInstructions('iG9CE55wbtY', TED_TITLE);
  const sameButTitle = copied && copied.replace(/^- العنوان: .*$/m, '') === expInstr.replace(/^- العنوان: .*$/m, '');
  ev.check('hand-copy-from-player-bar-to-device-clipboard', copied === expInstr, { len: copied?.length ?? null, sha: copied && sha16(copied), expected: { len: expInstr.length, sha: sha16(expInstr) }, sameExceptTitle: sameButTitle });
}
if (splitParts.length) {
  const parts = await Promise.all(splitParts.sort().map(async (n) => parseSrtStrict(await readFile(path.join(DL, n), 'utf8'))));
  const flat = parts.flat();
  const continuous = flat.every((c, i) => c.n === i + 1);
  ev.check('hand-split-parts-downloaded-with-continuous-numbering', continuous && flat.length > 0, { parts: parts.length, cues: flat.length, continuous });
} else if (browser === 'chrome') {
  ev.note('التقسيم الاحتياطي في نافذة ظاهرة لم يُجرَّب (اختياري).');
}
await saveState(browser, state);
await ev.write();
process.exit(ev.failed.length ? 1 : 0);
