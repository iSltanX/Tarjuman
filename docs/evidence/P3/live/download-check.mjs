#!/usr/bin/env node
// اختبار حي لتنزيل التصدير (P3-AC3): هل ينزل الملف المسمّى بالمعرّف واللغة والنوع والوضع محليًا عبر Blob
// و<a download> من العالم المعزول لصفحة يوتيوب، في Brave وChrome، بأسماء وبايتات صحيحة؟
//
// الطريقة: الإضافة المبنية (npm run build) تُحمَّل بـExtensions.loadUnpacked في ملف اختبار منفصل بلا نافذة،
// وتُفتح صفحة مشاهدة واحدة ليعمل سكربت المحتوى، وتُحقن في عالمه المعزول حزمة من وحدات P3 الحقيقية
// (buildExport وbuildArabicExport وdownload) وتُستدعى بإيماءة مستخدم. التنزيلات تُلتقط بأحداث
// Browser.download* إلى مجلد مؤقت، وتُقارن بايتاتها ببايتات ما تحسبه Node من الوحدات نفسها.
// لا يعتمد على جسم ترجمة يوتيوب (تعيده فارغًا تحت الأتمتة، P1)؛ المقاطع من عينتي json3 الحقيقيتين.
// لا رابط ولا رمز في الأدلة: روابط Blob تُقرأ ولا تُسجَّل.
//   node docs/evidence/P3/live/download-check.mjs --browser brave|chrome [--ext dist] [--out docs/evidence/P3]
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, sleep } from '../../../../test/live/harness/browser.mjs';
import { collectErrors, openTab } from '../../../../test/live/harness/extension.mjs';
import { dismissConsent, waitForPlayer } from '../../../../test/live/harness/youtube.mjs';
import { findSecrets } from '../../../../src/core/diagnostics/sanitize.js';
import { convertTrack } from '../../../../src/core/convert/index.js';
import { buildArabicExport, buildExport } from '../../../../src/core/export/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P3'), browser);
const rel = (f) => path.relative(ROOT, f);
const NOW = '2026-11-01T12:00:00.000Z';
const WATCH_VIDEO = 'iG9CE55wbtY';

// — المقاطع الحقيقية كما يعطيها المحوّل لكل عينة ووضع
const FIX_DIR = path.join(ROOT, 'test/fixtures/json3');
const fixtures = JSON.parse(await readFile(path.join(FIX_DIR, 'index.json'), 'utf8')).fixtures;
async function realCues(kind, mode) {
  const f = fixtures.find((x) => x.trackKind === kind);
  const r = convertTrack({ body: await readFile(path.join(FIX_DIR, f.file), 'utf8'), trackKind: kind, durationMs: f.durationMs, mode });
  if (!r.ok) throw new Error(`تحويل ${kind}/${mode} فشل: ${r.code}`);
  return { videoId: f.videoId, track: { key: `en|${kind}`, lang: 'en', kind, cues: r.cues } };
}

const ARABIC_CUES = [
  { n: 1, startMs: 27103, endMs: 29678, text: 'مرحبًا بكم في هذا العرض' },
  { n: 2, startMs: 29678, endMs: 32000, text: 'سطر أول\nسطر ثانٍ، فيه «اقتباس» وأرقام 123' },
];

/** السيناريوهات: كل واحد يحسب Node ما يُنتظر منه، وتحسب الصفحة وتنزّل الشيء نفسه. */
async function scenarios() {
  const manual = await realCues('manual', 'normal');
  const asrLong = await realCues('asr', 'long');
  const asr = await realCues('asr', 'normal');
  const mk = (id, title, { spec, expected, strict = true, gapMs = 0 }) => ({ id, title, spec, expected, strict, gapMs });
  return [
    mk('manual-normal', 'يدوي، عادي — ملف واحد', {
      spec: { videoId: manual.videoId, track: manual.track, mode: 'normal' },
      expected: buildExport({ ...manual, mode: 'normal', now: NOW }).files,
    }),
    mk('asr-long', 'تلقائي، مقاطع أطول — ملف واحد', {
      spec: { videoId: asrLong.videoId, track: asrLong.track, mode: 'long' },
      expected: buildExport({ ...asrLong, mode: 'long', now: NOW }).files,
    }),
    mk('arabic', 'عربي بنص مختلط وأسطر — ملف واحد', {
      spec: { videoId: manual.videoId, arabic: true, cues: ARABIC_CUES },
      expected: [buildArabicExport({ videoId: manual.videoId, cues: ARABIC_CUES })],
    }),
    // الأجزاء المتعددة: نتيجة المتصفح (قد يطلب إذن «تنزيلات متعددة») تُسجَّل لا تُعدّ إخفاقًا للمعيار.
    mk('asr-split-one-gesture', 'تلقائي مقسَّم إلى أجزاء — كلها بإيماءة واحدة متتالية', {
      spec: { videoId: asr.videoId, track: asr.track, mode: 'normal', split: 300 },
      expected: buildExport({ ...asr, mode: 'normal', split: { size: 300 }, now: NOW }).files,
      strict: false,
    }),
    mk('asr-split-spaced', 'تلقائي مقسَّم إلى أجزاء — بفاصل 800ms', {
      spec: { videoId: asr.videoId, track: asr.track, mode: 'normal', split: 300 },
      expected: buildExport({ ...asr, mode: 'normal', split: { size: 300 }, now: NOW }).files,
      strict: false,
      gapMs: 800,
    }),
  ];
}

/** حزمة الوحدات الحقيقية تُحقن في العالم المعزول للإضافة (للاختبار فقط). */
async function pageBundle() {
  const out = await build({
    stdin: {
      contents: "import { buildExport, buildArabicExport, download } from './src/core/export/index.js';\nglobalThis.__tjP3 = { buildExport, buildArabicExport, download };",
      resolveDir: ROOT,
      sourcefile: 'p3-live-entry.js',
    },
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

const PAGE_RUN = `(async (spec) => {
  const { buildExport, buildArabicExport, download } = globalThis.__tjP3;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const files = spec.arabic
    ? [buildArabicExport({ videoId: spec.videoId, cues: spec.cues })]
    : buildExport({ videoId: spec.videoId, track: spec.track, mode: spec.mode, split: spec.split ? { size: spec.split } : null, now: spec.now }).files;
  const errors = [];
  for (let i = 0; i < files.length; i++) {
    try { download(files[i]); } catch (e) { errors.push({ code: e && e.code ? e.code : null, name: e && e.name ? e.name : null }); }
    if (spec.gapMs && i < files.length - 1) await wait(spec.gapMs);
  }
  return { names: files.map((f) => f.name), errors };
})`;

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

function appVersion(bin) {
  try {
    const plist = path.join(bin.slice(0, bin.indexOf('.app/') + 4), 'Contents/Info.plist');
    return String(execFileSync('/usr/bin/defaults', ['read', plist, 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}

const result = { browser: null, at: new Date().toISOString(), extension: null, watchPage: null, scenarios: [], checks: [], notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
result.extension = { version: manifest.version, versionName: manifest.version_name ?? null };
const plan = await scenarios();
const bundle = await pageBundle();
if (argv.includes('--dry')) {
  // تحقق بلا متصفح: خطة السيناريوهات وما يُنتظر منها وحجم الحزمة المحقونة.
  for (const sc of plan) console.log(`${sc.id}: ${sc.expected.map((e) => `${e.name} (${Buffer.byteLength(e.text, 'utf8')} بايت)`).join(' · ')}`);
  console.log(`الحزمة المحقونة: ${bundle.length} محرفًا`);
  process.exit(0);
}
const dlRoot = await mkdtemp(path.join(os.tmpdir(), 'tj-p3-dl-'));

const b = await launch({ browser, profile: `${browser}-p3`, headless: !argv.includes('--headed') });
result.browser = `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].bin) ?? '?'} (${b.version.product})`;
console.log(`المتصفح: ${result.browser} · الإضافة ${manifest.version_name ?? manifest.version}`);

/** @type {Map<string, { name: string, state: string, bytes: number | null }>} */
const downloads = new Map();
b.conn.on('Browser.downloadWillBegin', (p) => downloads.set(p.guid, { name: p.suggestedFilename, state: 'started', bytes: null }));
b.conn.on('Browser.downloadProgress', (p) => {
  const d = downloads.get(p.guid);
  if (d) Object.assign(d, { state: p.state, bytes: p.receivedBytes ?? d.bytes });
});

try {
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  const extId = ext.id;

  // صفحة مشاهدة واحدة بوتيرة بشرية ليعمل سكربت المحتوى في عالمه المعزول.
  const yt = await openTab(b.conn, 'about:blank');
  const errors = collectErrors(yt, { extId, onlyExtension: true });
  await yt.goto(`https://www.youtube.com/watch?v=${WATCH_VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  const ready = await waitForPlayer(yt, WATCH_VIDEO);
  if (await yt.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  check('watch-page', !!ready, ready ? { durationSec: Math.round(ready.duration) } : null);
  result.watchPage = { origin: 'youtube.com/watch', playerReady: !!ready };
  await sleep(2500);
  const iso = yt.isolatedContextId(extId);
  check('isolated-world-ready', !!iso);
  if (!iso) throw new Error('لا عالم معزول للإضافة في الصفحة');

  const inject = await yt.send('Runtime.evaluate', { expression: bundle, contextId: iso, returnByValue: true });
  check('inject-p3-modules', !inject.exceptionDetails, inject.exceptionDetails ? { error: String(inject.exceptionDetails.text).slice(0, 120) } : { bytes: bundle.length });

  for (const sc of plan) {
    const dir = path.join(dlRoot, sc.id);
    await mkdir(dir, { recursive: true });
    await b.conn.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
    downloads.clear();
    const spec = { ...sc.spec, now: NOW, gapMs: sc.gapMs };
    const run = await yt.send('Runtime.evaluate', {
      expression: `${PAGE_RUN}(${JSON.stringify(spec)})`,
      contextId: iso,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    const page = run.exceptionDetails ? { names: [], errors: [{ code: null, name: String(run.exceptionDetails.text).slice(0, 80) }] } : run.result.value;
    // ينتظر اكتمال كل التنزيلات أو انقضاء المهلة.
    const wanted = sc.expected.length;
    const end = Date.now() + 25000;
    while (Date.now() < end) {
      const done = [...downloads.values()].filter((d) => d.state === 'completed' || d.state === 'canceled').length;
      if (done >= wanted) break;
      await sleep(250);
    }
    await sleep(300);
    const onDisk = new Set(await readdir(dir));
    const files = [];
    for (const exp of sc.expected) {
      const want = Buffer.from(exp.text, 'utf8');
      let got = null;
      try {
        got = await readFile(path.join(dir, exp.name));
      } catch {
        got = null;
      }
      files.push({ name: exp.name, onDisk: onDisk.has(exp.name), bytes: got?.length ?? null, expectedBytes: want.length, identical: !!got && got.equals(want), sha256_16: got ? sha(got) : null });
    }
    const dls = [...downloads.values()].map((d) => ({ name: d.name, state: d.state, bytes: d.bytes }));
    const delivered = files.filter((f) => f.identical).length;
    const row = {
      id: sc.id, title: sc.title, expectedFiles: wanted, delivered, pageErrors: page.errors, pageNames: page.names,
      namesMatch: JSON.stringify(page.names) === JSON.stringify(sc.expected.map((e) => e.name)),
      downloads: dls, files, extraFilesOnDisk: [...onDisk].filter((n) => !sc.expected.some((e) => e.name === n)),
    };
    result.scenarios.push(row);
    const ok = row.namesMatch && delivered === wanted && !page.errors.length && !row.extraFilesOnDisk.length;
    if (sc.strict) check(`download:${sc.id}`, ok, { delivered: `${delivered}/${wanted}`, names: row.namesMatch, errors: page.errors.length });
    else {
      console.log(`ℹ download:${sc.id} — ${delivered}/${wanted} جزءًا نُزّل (معلومة لا شرط)`);
      result.notes.push(`${sc.id}: ${delivered} من ${wanted} أجزاء نُزّلت كاملة وبمطابقة بايتية`);
    }
  }

  result.extensionErrors = errors.list;
  check('no-extension-errors', errors.list.length === 0, { count: errors.list.length });
  await yt.send('Runtime.evaluate', { expression: 'delete globalThis.__tjP3', contextId: iso });
} catch (err) {
  check('run', false, { error: String(err.message).replace(/https?:\/\/\S+/g, '[رابط]') });
} finally {
  await b.close();
  await rm(dlRoot, { recursive: true, force: true });
  result.passed = result.checks.every((c) => c.ok);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  const leaks = findSecrets(text);
  await mkdir(OUT, { recursive: true });
  if (leaks.length) {
    console.error(`رُفضت كتابة الدليل: ${leaks.length} اكتشاف`);
    process.exitCode = 1;
  } else {
    await writeFile(path.join(OUT, 'download.json'), text);
    console.log(`${result.passed ? 'ناجح' : 'فيه إخفاق'} — ${rel(path.join(OUT, 'download.json'))}`);
  }
  if (!result.passed) process.exitCode = 1;
}
