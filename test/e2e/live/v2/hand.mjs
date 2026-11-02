#!/usr/bin/env node
// الجلسة اليدوية للإصدار الثاني (P15-AC1: استخراج يدوي وتلقائي، وتنزيل ونسخ بالقاموس، وتقسيم فيديو طويل). المتصفح كما
// يشغّله المستخدم بلا أي علم تحكم ولا اتصال (navigator.webdriver=false)، ببناء الإنتاج في مسار الإضافة نفسه الذي رقّته
// upgrade.mjs (فالقاموس ومكان الحفظ «مجلد فرعي» مكتوبان)، ونافذة أمامية بثلاثة تبويبات. نقرات سلطان في شريط المشغّل:
//   TED وميدواي: ⤓ EN ← «تنزيل ونسخ التعليمات» (ميدواي بالوضع «عادي»).
//   الطويل: ⤓ EN ← «تنزيل ونسخ التعليمات»، ثم «خيارات احتياطية» ← «تقسيم الملف إلى أجزاء» ← «تنزيل ونسخ التعليمات».
// السكربت يراقب المجلد الفرعي في مجلد التنزيل وحافظة الجهاز فقط (لا يُلتفت إلا إلى نص تعليمات الترجمة)، ثم يغلق المتصفح
// ويقارن: TED وميدواي بايتًا بالمرجع المحسوب من عيّنتي P1، والطويل ملف صارم بـ2000 مقطع فأكثر وأجزاؤه تساويه، والمنسوخ هو
// تعليمات الإضافة نفسها بالقاموس (وبفقرة الأجزاء للمقسّم). منفذ التصحيح يجعل webdriver=true فيعيد يوتيوب الجسم فارغًا.
//   command node test/e2e/live/v2/hand.mjs --browser brave --long <معرّف> [--minutes 25] [--monitor]
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createExtractor } from '../../../../src/extract/index.js';
import { buildExport, instructions } from '../../../../src/core/export/index.js';
import { parseSrtStrict } from '../../../../src/core/srt/parser.js';
import { findSecrets } from '../../../../src/core/diagnostics/sanitize.js';
import {
  BROWSERS, Evidence, GLOSSARY, PROFILE_ROOT, ROOT, V2, VIDEOS, WORK, launchBrowser, parsePart, pidsOf, quitProfile, readClipboard,
  sentinel, setDownloadDir, sha16, sleep,
} from './lib.mjs';
import { appVersion } from './ui.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const LONG = val('long');
if (!LONG) throw new Error('--long <معرّف الفيديو الطويل> مطلوب (find-long.mjs)');
const MINUTES = Number(val('minutes', 25));
const MONITOR = argv.includes('--monitor');
const { profile, ext } = V2[browser];
const profileDir = path.join(PROFILE_ROOT, profile);
const DL = path.join(WORK, browser, 'downloads');
const SUB = path.join(DL, 'Tarjuman');
const EN = path.join(WORK, browser, 'en');

const FIXTURES = { [VIDEOS.manual.id]: { file: 'manual-ted-iG9CE55wbtY.json', durationMs: 1203421 }, [VIDEOS.asr.id]: { file: 'asr-nwc-Y9rkKtK1b44.json', durationMs: 3000000 } };
const ITEMS = [
  { slot: 'manual', ...VIDEOS.manual },
  { slot: 'asr', ...VIDEOS.asr },
  { slot: 'long', id: LONG, kind: null, mode: 'normal', title: null },
];
const fullRe = (it) => new RegExp(`^${it.id.replace(/-/g, '\\-')}\\.en\\.(manual|asr)\\.${it.mode}\\.srt$`);
const partRe = (it) => new RegExp(`^${it.id.replace(/-/g, '\\-')}\\.en\\.(manual|asr)\\.${it.mode}\\.part(\\d+)of(\\d+)\\.srt$`);

async function expected(it) {
  const fx = FIXTURES[it.id];
  const body = await readFile(path.join(ROOT, 'test/fixtures/json3', fx.file), 'utf8');
  const ex = createExtractor({ currentVideoId: () => it.id, durationMs: () => fx.durationMs, isLive: () => false });
  ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: it.id, lang: 'en', trackKind: it.kind, kindParam: it.kind === 'asr' ? 'asr' : null, capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false });
  const conv = ex.convert(`en|${it.kind}`, { mode: it.mode });
  return buildExport({ videoId: it.id, title: null, track: { key: `en|${it.kind}`, lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: it.mode, now: Date.now() }).files[0].text;
}

const version = appVersion(BROWSERS[browser].app);
const ev = new Evidence(path.join(ROOT, 'docs/evidence/P15', browser), 'hand', { step: 'hand', browser: `${BROWSERS[browser].name} ${version}`, session: 'نافذة عادية بلا أي علم تحكم ولا اتصال؛ النقرات بيد سلطان', long: LONG });

let session;
if (MONITOR) {
  if (!pidsOf(profileDir).length) throw new Error(`لا جلسة يدوية مفتوحة بملف ${profile}`);
  session = { quit: () => quitProfile(profileDir) };
} else {
  if (pidsOf(profileDir).length) throw new Error(`${BROWSERS[browser].name} يعمل بملف ${profile}؛ أغلقه أولًا`);
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--out', ext], { cwd: ROOT, stdio: 'ignore' });
  await mkdir(SUB, { recursive: true });
  await setDownloadDir(profileDir, DL);
  sentinel();
  const urls = ITEMS.map((it) => `https://www.youtube.com/watch?v=${it.id}&cc_load_policy=1&cc_lang_pref=en`);
  session = await launchBrowser(browser, { profile, ext, debug: false, urls });
  console.log(`أُطلق ${BROWSERS[browser].name} ${version} بلا تحكم، والإضافة ${session.extId} (بناء الإنتاج). بانتظار نقرات سلطان…`);
}
const before = new Set(await readdir(SUB));

// نصوص التعليمات المنسوخة، بمعرّف الفيديو من سطر الرابط (لا يُلتفت إلى غيرها في الحافظة).
const HEADER = 'ترجمة ملف ترجمة فيديو (SRT) من الإنجليزية إلى العربية';
const copies = new Map();
const end = Date.now() + MINUTES * 60000;
let doneAt = null;
while (Date.now() < end) {
  if (!pidsOf(profileDir).length) {
    ev.note('أُغلق المتصفح قبل اكتمال الملفات.');
    break;
  }
  const clip = readClipboard();
  if (clip.startsWith(HEADER)) {
    const id = /watch\?v=([A-Za-z0-9_-]{11})/.exec(clip)?.[1];
    const key = `${id}${/عدد المقاطع الكلي/.test(clip) ? ':parts' : ''}`;
    if (id && copies.get(key) !== clip) {
      copies.set(key, clip);
      console.log(`  نُسخت تعليمات ${key} (${clip.length} محرفًا)`);
    }
  }
  const names = (await readdir(SUB)).filter((n) => !n.endsWith('.crdownload') && !before.has(n));
  const full = ITEMS.every((it) => names.some((n) => fullRe(it).test(n)));
  const long = ITEMS.find((it) => it.slot === 'long');
  const parts = names.filter((n) => partRe(long).test(n));
  const total = parts.length ? Number(partRe(long).exec(parts[0])[3]) : 0;
  const ready = full && total >= 2 && parts.length === total && copies.has(VIDEOS.manual.id) && copies.has(`${LONG}:parts`);
  if (ready && !doneAt) {
    doneAt = Date.now();
    console.log('اكتملت الملفات والنسخ.');
  }
  if (doneAt && Date.now() - doneAt > 6000) break;
  await sleep(1500);
}
await session.quit();

const names = (await readdir(SUB)).filter((n) => !n.endsWith('.crdownload') && !before.has(n));
const state = { browser, long: LONG, videos: {} };
await mkdir(EN, { recursive: true });
for (const it of ITEMS) {
  const name = names.find((n) => fullRe(it).test(n)) ?? null;
  const got = name ? await readFile(path.join(SUB, name), 'utf8') : null;
  let cues = null;
  try {
    cues = got ? parseSrtStrict(got).length : null;
  } catch {
    cues = null;
  }
  const res = { name, bytes: got && Buffer.byteLength(got), sha: got && sha16(got), cues, kind: name?.split('.')[2] ?? null };
  if (FIXTURES[it.id]) {
    const exp = await expected(it);
    ev.check(`hand-${it.slot}-real-extraction-matches-reference`, got === exp, { ...res, expected: { bytes: Buffer.byteLength(exp), sha: sha16(exp) } });
  } else {
    ev.check(`hand-${it.slot}-real-extraction-2000-plus`, !!got && cues >= 2000 && findSecrets(got, ['url']).length === 0, res);
  }
  if (got) await copyFile(path.join(SUB, name), path.join(EN, name));
  state.videos[it.slot] = { id: it.id, name, sha: res.sha, cues, kind: res.kind };
}

// الأجزاء: ترقيم مستمر بلا فجوة ولا تكرار، ومجموعها هو الملف الكامل نفسه.
const long = ITEMS.find((it) => it.slot === 'long');
const partNames = names.filter((n) => partRe(long).test(n)).sort();
const fullName = state.videos.long.name;
let partsOk = false;
let plan = [];
if (partNames.length >= 2 && fullName) {
  const fullCues = parseSrtStrict(await readFile(path.join(SUB, fullName), 'utf8'));
  const all = [];
  for (const n of partNames) {
    const cues = parsePart(await readFile(path.join(SUB, n), 'utf8'));
    plan.push({ index: plan.length + 1, from: cues[0].n, to: cues.at(-1).n });
    all.push(...cues);
    await copyFile(path.join(SUB, n), path.join(EN, n));
  }
  partsOk = all.length === fullCues.length && all.every((c, i) => c.n === i + 1 && c.startMs === fullCues[i].startMs && c.endMs === fullCues[i].endMs && c.text === fullCues[i].text);
}
ev.check('hand-long-split-parts-equal-full-file', partsOk, { parts: partNames.length, plan });
state.videos.long.parts = partNames;

// النسخ من الشريط إلى حافظة الجهاز: تعليمات الإضافة نفسها بالقاموس (والعنوان كما التقطته الصفحة).
const titleOf = (t) => /^- العنوان: (.*)$/m.exec(t)?.[1] ?? null;
for (const it of ITEMS) {
  const got = copies.get(it.id) ?? null;
  const title = got ? titleOf(got) : null;
  const exp = instructions({ videoId: it.id, title, glossary: GLOSSARY });
  ev.check(`hand-${it.slot}-copy-to-device-clipboard-with-glossary`, got === exp && got.includes('- Naval War College = كلية الحرب البحرية (الأمريكية)'),
    { len: got?.length ?? null, sha: got && sha16(got), expected: { len: exp.length, sha: sha16(exp) }, titleMatches: it.title ? title === it.title : null });
  state.videos[it.slot].title = title;
}
const split = copies.get(`${LONG}:parts`) ?? null;
const expSplit = split && plan.length >= 2 ? instructions({ videoId: LONG, title: titleOf(split), glossary: GLOSSARY, parts: plan }) : null;
ev.check('hand-long-split-copy-has-parts-paragraph', !!split && split === expSplit, { len: split?.length ?? null, expected: expSplit?.length ?? null });

await writeFile(path.join(WORK, browser, 'hand-state.json'), `${JSON.stringify(state, null, 2)}\n`);
await ev.write();
process.exit(ev.failed.length ? 1 : 0);
