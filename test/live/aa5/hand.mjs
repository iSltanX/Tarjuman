#!/usr/bin/env node
// الجلسة اليدوية للاستخراج الحقيقي بلا حقن (AA5): مسار إنجليزي ومسار بغير الإنجليزية، من حزمة متجر 2.0.0
// نفسها، في Brave بنافذة عادية بلا أي علم تحكم (navigator.webdriver=false)، فيعيد يوتيوب جسم الترجمة كما للمستخدم. على طريقة جلسة
// Fable الناجحة: ملف تعريف اختبار جديد خارج المستودع، ومكتوم الصوت، والإضافة بـ--load-extension.
// لا ينقر السكربت شيئًا: يراقب مجلد التنزيل وحافظة الجهاز فقط (يقرؤها ولا يكتب فيها)، ثم يغلق المتصفح ويفحص كل ملف بالمحلل الصارم.
// والأدلة بلا نص مقاطع ولا رابط: الاسم والحجم والبصمة وعدد المقاطع ورمز اللغة وعلامات نصها.
// خطوات سلطان في النافذة (فيلم Cosmos Laundromat، وفيه ترجمات يدوية بلغات عدة):
//   ١. اضغط CC في المشغّل (الإنجليزية) ثم أول أيقونة ترجمان في يمين الشريط (تحميل الأصل) ← «تنزيل الملف».
//   ٢. من الترس ⚙ ← الترجمة ← Español (الإسبانية)، ثم أيقونة ترجمان نفسها ← اختر «الإسبانية» إن ظهرت قائمة ← «تنزيل الملف».
//   ٣. اختياريًا: أيقونة الإضافات (قطعة الأحجية) ← ترجمان ← «نسخ التعليمات».
// **يفتح متصفحًا بنافذة ظاهرة:** بإذن سلطان وحده، وبيده (docs/development.md، «الاختبارات الحية»).
//   command npm run package
//   TJ_PROFILE_ROOT=<مجلد في المسودة> command node test/live/aa5/hand.mjs [--minutes 15] [--out test-results/live/AA5/hand]
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { pidsOf, quitProfile, readClipboard, setDownloadDir, sha16 } from '../../e2e/live/lib.mjs';
import { APPS } from '../stores/driver.mjs';
import { readZip } from '../../../scripts/release/zip.mjs';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const MINUTES = Number(val('minutes', 15));
const OUT = path.resolve(ROOT, val('out', 'test-results/live/AA5/hand'));
const VERSION = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
const ZIP = path.join(ROOT, 'release/store', `tarjuman-${VERSION}-chrome.zip`);
const VIDEO = 'Y-rmzh0PI3c';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
const EN_SRT = path.join(ROOT, 'store/test-files', `${VIDEO}.en.srt`);
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 'aa5-work', `hand-${RUN}`);
const EXT = path.join(WORK, 'ext');
const DL = path.join(WORK, 'downloads');
const profileDir = path.join(PROFILE_ROOT, `hand-aa5-brave-${RUN}`);
const app = APPS.brave.app ?? APPS.brave.bin.slice(0, APPS.brave.bin.indexOf('.app/') + 4);
const log = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);

/** الملف الإنجليزي المتوقع: ما نزّلته جلسة T6 اليدوية من الفيلم نفسه (المسار اليدوي)، والتصدير حتمي. */
const EXPECTED_EN = await readFile(EN_SRT, 'utf8');
const result = { at: new Date().toISOString(), browser: null, package: path.basename(ZIP), video: VIDEO, mode: 'manual-window-no-automation', minutes: MINUTES, files: [], clipboard: null, notes: [], ended: null };

await mkdir(EXT, { recursive: true });
await mkdir(DL, { recursive: true });
await mkdir(OUT, { recursive: true });
for (const e of readZip(await readFile(ZIP))) {
  const f = path.join(EXT, e.name);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, e.data);
}
await mkdir(profileDir, { recursive: true });
await setDownloadDir(profileDir, DL);
execFileSync('open', ['-n', '-a', app, '--args', `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=1400,950', '--window-position=40,40', `--load-extension=${EXT}`, WATCH]);
result.browser = `Brave ${(() => { try { return String(execFileSync('/usr/bin/defaults', ['read', path.join(app, 'Contents/Info.plist'), 'CFBundleShortVersionString'])).trim(); } catch { return '?'; } })()}`;
log(`فُتح ${result.browser} بملف اختبار جديد مكتوم الصوت، وفيه حزمة متجر ${VERSION}، على فيلم Cosmos Laundromat.`);
log('الخطوات: CC (الإنجليزية) ← أيقونة ترجمان الأولى ← «تنزيل الملف»؛ ثم ⚙ ← الترجمة ← Español ← أيقونة ترجمان ← «تنزيل الملف».');
log(`المدة القصوى ${MINUTES} دقيقة؛ ينتهي السكربت بعد رصد الملفين أو بإغلاق النافذة.`);

// الحافظة تُقرأ ولا يُكتب فيها شيء (لا علامة في حافظة سلطان): أساس المقارنة محتواها لحظة البدء.
const mark = readClipboard();
const seen = new Set();
const listDl = async () => {
  try {
    return (await readdir(DL)).filter((n) => n.endsWith('.srt')).sort();
  } catch {
    return [];
  }
};
/** علامات نصٍّ إسباني (بلا نص في الأدلة): محارف وكلمات شائعة. */
const spanishSigns = (t) => ({ marks: /[ñáéíóú¿¡]/i.test(t), words: (t.match(/\b(que|de|la|el|no|es|y|en|un|una|por|pero)\b/gi) ?? []).length });
const end = Date.now() + MINUTES * 60000;
let lastClip = mark;
let doneAt = null;
while (Date.now() < end) {
  for (const f of await listDl()) {
    if (seen.has(f)) continue;
    await sleep(700);
    seen.add(f);
    const text = await readFile(path.join(DL, f), 'utf8');
    const lang = /^[\w-]+?\.([a-z]{2,3}(?:-[A-Za-z0-9]+)?)\./.exec(f)?.[1] ?? null;
    let cues = null;
    try {
      cues = parseSrtStrict(text).length;
    } catch (err) {
      cues = `خطأ: ${String(err?.code ?? err?.message ?? err).slice(0, 60)}`;
    }
    const entry = { name: f, lang, bytes: Buffer.byteLength(text), cues, sha16: sha16(text), at: new Date().toISOString() };
    if (lang === 'en') Object.assign(entry, { expectedSha16: sha16(EXPECTED_EN), matchesT6ManualFile: text === EXPECTED_EN });
    else Object.assign(entry, { spanish: spanishSigns(text) });
    result.files.push(entry);
    log(`نزل ${f}: ${entry.bytes} بايت، ${cues} مقطعًا${lang === 'en' ? `، ${entry.matchesT6ManualFile ? 'مطابق بايتًا لملف T6 اليدوي' : 'مختلف عن ملف T6 (يُفحص)'}` : `، لغة ${lang}`}`);
  }
  const clip = readClipboard();
  if (clip !== lastClip && clip !== mark) {
    lastClip = clip;
    if (clip.includes(VIDEO)) {
      result.clipboard = { chars: clip.length, sha16: sha16(clip), fromSpanish: /من الإسبانية/.test(clip), fromEnglish: /من الإنجليزية/.test(clip), toArabic: /إلى العربية/.test(clip), at: new Date().toISOString() };
      log(`نُسخت التعليمات: ${clip.length} محرفًا${result.clipboard.fromSpanish ? '، من الإسبانية' : result.clipboard.fromEnglish ? '، من الإنجليزية' : ''}`);
    }
  }
  const en = result.files.some((x) => x.lang === 'en');
  const other = result.files.some((x) => x.lang && x.lang !== 'en');
  if (en && other && !doneAt) {
    doneAt = Date.now();
    log('رُصد الملفان؛ تبقى النافذة دقيقة لنسخ التعليمات الاختياري ثم تُغلق.');
  }
  if (doneAt && (Date.now() - doneAt > 60000 || result.clipboard)) {
    result.ended = 'observed-both';
    break;
  }
  if (!pidsOf(profileDir).length) {
    result.ended = 'browser-closed';
    break;
  }
  await sleep(1000);
}
if (!result.ended) result.ended = 'timeout';
if (pidsOf(profileDir).length) await quitProfile(profileDir);
const enFile = result.files.find((x) => x.lang === 'en');
const otherFile = result.files.find((x) => x.lang && x.lang !== 'en');
result.checks = {
  englishRealExtraction: !!enFile && Number.isInteger(enFile.cues) && enFile.cues > 0,
  englishMatchesT6ManualFile: !!enFile?.matchesT6ManualFile,
  nonEnglishRealExtraction: !!otherFile && Number.isInteger(otherFile.cues) && otherFile.cues > 0,
  nonEnglishLooksSpanish: !!otherFile && otherFile.lang?.startsWith('es') && (otherFile.spanish?.marks || otherFile.spanish?.words > 10),
};
result.passed = Object.values(result.checks).every(Boolean);
const text = `${JSON.stringify(result, null, 2)}\n`;
const leaks = findSecrets(text);
if (leaks.length) {
  console.error(`رُفضت كتابة الدليل: ${leaks.length} اكتشاف`);
  process.exitCode = 1;
} else {
  await writeFile(path.join(OUT, 'hand.json'), text);
  log(`الدليل: ${path.relative(ROOT, path.join(OUT, 'hand.json'))} — ${result.passed ? 'الاستخراج الحقيقي ناجح للمسارين' : `غير مكتمل (${result.ended})`}`);
}
