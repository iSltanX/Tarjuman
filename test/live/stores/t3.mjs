#!/usr/bin/env node
// الاختبار الحي في المتصفحات الأربعة (جولة النشر T3، docs/store-release.md): Brave وChrome وEdge وFirefox بالخطوات نفسها، ببناء
// التطوير للهدف (chromium أو firefox)، بلا نافذة ومكتوم الصوت، وملف تعريف جديد خارج المستودع، وحساب يوتيوب غير مسجَّل:
//   التثبيت ← الجسر (غلافا fetch وXHR في عالم الصفحة، ورسالة الالتقاط إلى العالم المعزول) ← تنزيل SRT من شريط المشغّل (في Firefox
//   عبر رابط data: من سكربت الخلفية) ونسخ التعليمات ← رفع العربية من الشريط ← العرض فوق الفيديو ← التوقيت (+ و−) ← خطوط الواجهة
//   والترجمة ← المحرّر ← الحفظ بعد إعادة التحميل ← النسخة الاحتياطية ← «الإبلاغ عن مشكلة» (المعاينة والنسخ والخطأ، بحجب خادم
//   البلاغات فلا يُرسل بلاغ) ← في Firefox منح إذن يوتيوب وسحبه ← الإزالة وقياس محو التخزين ← إعادة التثبيت فارغًا ← الاستعادة.
// تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُرسل جسم P1 الحقيقي للفيديو نفسه من عالم الصفحة برسالة الالتقاط نفسها.
//   command node test/live/stores/t3.mjs --browser brave|chrome|edge|firefox [--headed] [--out docs/evidence/T3/<browser>]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, human, sleep } from '../harness/browser.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport, instructions } from '../../../src/core/export/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { APPS, bridge, startBrowser } from './driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
if (!APPS[browser]) throw new Error(`متصفح غير معروف: ${browser}`);
const TARGET = browser === 'firefox' ? 'firefox' : 'chromium';
const HEADLESS = !argv.includes('--headed');
const OUT = path.resolve(ROOT, val('out', `docs/evidence/T3/${browser}`));
const VIDEO = 'iG9CE55wbtY';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 't3-work', `${browser}-${RUN}`);
const EXT = path.join(WORK, 'ext');
const DL = path.join(WORK, 'downloads');
const AR_FILE = path.join(ROOT, 'test/e2e/fixtures/iG9CE55wbtY.en.manual.normal.ar.srt');
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const ISOLATES = new RegExp(`[${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}]`, 'g');
const clean = (s) => String(s ?? '').replace(ISOLATES, '').replace(/\s+/g, ' ').trim();
const rel = (f) => path.relative(ROOT, f);

const result = { browser: null, target: TARGET, at: new Date().toISOString(), headless: HEADLESS, video: VIDEO, extension: null, checks: [], notes: [], screenshots: [], errors: [] };
/** ok: true نجح، false فشل، null لم يُختبر (والسبب في التفصيل). */
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok, detail });
  console.log(`${ok === null ? '·' : ok ? '✓' : '✗'} ${id}${detail !== null ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
};
async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    check(name, false, { error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
  }
}

function appVersion(app) {
  try {
    return String(execFileSync('/usr/bin/defaults', ['read', path.join(app, 'Contents/Info.plist'), 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}

// ---- المتوقع في Node من جسم P1 نفسه ----
const body = await readFile(path.join(ROOT, 'test/fixtures/json3/manual-ted-iG9CE55wbtY.json'), 'utf8');
const capture = { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VIDEO, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false };
const ex = createExtractor({ currentVideoId: () => VIDEO, durationMs: () => 1203421, isLive: () => false });
ex.handleMessage(capture);
const conv = ex.convert('en|manual', { mode: 'normal' });
const EXP = buildExport({ videoId: VIDEO, title: null, track: { key: 'en|manual', lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: 'normal', now: Date.now() });
const CUES = EXP.fingerprint.cues;
const AR = parseSrtLenient(await readFile(AR_FILE, 'utf8')).cues;
const CUE = CUES.find((c) => c.startMs >= 60000 && c.endMs - c.startMs >= 1500);
const CUE_AT = (CUE.startMs + CUE.endMs) / 2000;
const AR_TEXT = AR.find((c) => c.n === CUE.n)?.text ?? '';
const BRAND = { brave: 'Brave', chrome: 'Google Chrome', edge: 'Microsoft Edge', firefox: 'Firefox' }[browser];

// ---- صفحة الفيديو ----
const M = {
  mute: () => { const v = document.querySelector('#movie_player video.html5-main-video'); if (!v) return false; v.muted = true; v.pause(); return v.paused; },
  seek: (t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.pause(); v.currentTime = t; return true; },
  time: () => document.querySelector('#movie_player video.html5-main-video')?.currentTime ?? -1,
  isAd: () => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); },
  skipAd: () => { const s = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button'); if (s) { s.click(); return true; } return false; },
  wrapped: () => {
    const native = (f) => /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(f));
    return { fetch: !native(window.fetch), xhrOpen: !native(XMLHttpRequest.prototype.open), webdriver: navigator.webdriver === true };
  },
};
const centerBox = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });

let s = null;
let yt = null;
const call = async (op, args = [], ms) => {
  const r = await bridge(yt, op, args, ms);
  if (!r.ok) throw new Error(`الجسر ${op}: ${r.error}`);
  return r.value;
};
const waitBridge = async (op, pred, { timeoutMs = 15000, args = [] } = {}) => {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    const r = await bridge(yt, op, args, 4000).catch(() => null);
    if (r?.ok) {
      last = r.value;
      if (pred(last)) return last;
    }
    await sleep(300);
  }
  return null;
};
async function clickButton(kind) {
  await revealControls(yt);
  const p = await call('peek');
  const box = p.buttons[kind]?.box;
  if (!box) throw new Error(`زر ${kind} غير ظاهر`);
  const c = centerBox(box);
  await yt.click(c.x, c.y);
  await sleep(500);
}
const menu = async () => (await call('peek')).layer.menu;
async function clickItem(fid) {
  const m = await menu();
  const it = m?.items.find((x) => x.fid === fid);
  if (!it) throw new Error(`لا بند ${fid} — ${m?.items.map((x) => x.fid).join(',') ?? 'لا قائمة'}`);
  const c = centerBox(it.box);
  await yt.click(c.x, c.y);
  await sleep(500);
}
async function closeMenu() {
  if (await menu()) {
    await yt.press('Escape');
    await sleep(300);
  }
}
async function waitAdEnd(timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  let seen = false;
  while (Date.now() < end) {
    if (!(await yt.eval(M.isAd))) return { seen };
    seen = true;
    await yt.eval(M.skipAd);
    await sleep(1000);
  }
  return { seen, stuck: true };
}
async function stableSeek(t) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await yt.eval(M.seek, { args: [t] });
    let ok = true;
    for (let i = 0; i < 5; i++) {
      await sleep(400);
      if (Math.abs((await yt.eval(M.time)) - t) > 0.05) {
        ok = false;
        break;
      }
    }
    if (ok) return attempt + 1;
  }
  return 0;
}

// ---- الملفات ----
const listDl = async () => {
  try {
    return (await readdir(DL)).filter((n) => !/\.(?:crdownload|part)$/.test(n)).sort();
  } catch {
    return [];
  }
};
async function waitFile(match, { timeoutMs = 25000, except = new Set() } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const f = (await listDl()).find((n) => match(n) && !except.has(n));
    if (f) {
      await sleep(400);
      return { name: f, path: path.join(DL, f) };
    }
    await sleep(300);
  }
  return null;
}
async function dirSize(dir) {
  try {
    let total = 0;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
    }
    return total;
  } catch {
    return null;
  }
}

// ---- صفحات الإضافة: ضغطة حقيقية في مركز عنصر يعيده تعبير JS ----
async function clickOn(page, expr, label) {
  const ok = await page.eval(`(() => { for (const e of document.querySelectorAll('[data-t3]')) e.removeAttribute('data-t3'); const el = (${expr}); if (!el) return false; el.setAttribute('data-t3', '1'); return true; })()`);
  if (!ok) throw new Error(`لم يوجد: ${label}`);
  const c = await page.centerOf('[data-t3="1"]');
  if (!c) throw new Error(`غير ظاهر: ${label}`);
  await page.click(c.x, c.y);
  await human(250, 450);
}
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(text)}))`;
async function shot(page, name) {
  const f = path.join(OUT, `${name}.png`);
  try {
    await page.screenshot(f);
    result.screenshots.push(rel(f));
  } catch (err) {
    result.notes.push(`لقطة ${name}: ${err.message.slice(0, 100)}`);
  }
}

// ================================================================ التشغيل
await mkdir(OUT, { recursive: true });
await mkdir(WORK, { recursive: true });
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--target', TARGET, '--out', EXT], { stdio: 'ignore' });
let backupFile = null;
try {
  s = await startBrowser(browser, { profile: `${browser}-t3-${RUN}`, ext: EXT, downloadDir: DL, headless: HEADLESS });
  result.browser = `${APPS[browser].name} ${appVersion(APPS[browser].app ?? APPS[browser].bin.slice(0, APPS[browser].bin.indexOf('.app/') + 4)) ?? '?'} (${s.version})`;
  result.notes.push(...(s.notes ?? []));
  check('install', !!s.extensionId, { extension: s.extensionId, version: s.version });

  // ---- يوتيوب: الجسر والالتقاط ----
  await step('youtube-open', async () => {
    yt = await s.youtube(WATCH);
    await dismissConsent(yt).catch(() => false);
    const player = await waitForPlayer(yt, VIDEO, 45000);
    await yt.eval(M.mute);
    const ready = await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
    if (s.kind === 'firefox') await s.learnBase(yt);
    const mounted = await waitBridge('state', (v) => v.mounted.controls === 'mounted' && v.mounted.overlay === 'mounted', { timeoutMs: 20000 });
    check('content-script-mounted', !!player && ready === true && !!mounted, { player: !!player, mounted: mounted?.mounted ?? null, base: s.base ? 'معروف' : null });
  });
  await step('bridge-wrappers', async () => {
    const w = await yt.eval(M.wrapped);
    check('bridge-main-world-wrappers', w.fetch && w.xhrOpen, w);
  });
  await step('capture', async () => {
    await yt.eval((msg) => { window.postMessage(msg, location.origin); return true; }, { args: [capture] });
    const st = await waitBridge('state', (v) => v.english?.count === CUES.length, { timeoutMs: 15000 });
    check('capture-via-bridge', !!st && st.captured.some((t) => t.key === 'en|manual' && t.ok), { captured: st?.captured ?? null, english: st?.english ?? null, expected: CUES.length });
  });
  await step('ui-fonts', async () => {
    const fonts = await waitBridge('fonts', (f) => f.some((x) => /Tarjuman UI/.test(x.family) && x.status === 'loaded'), { timeoutMs: 10000 });
    check('ui-fonts-loaded', !!fonts, { fonts: (fonts ?? []).filter((x) => /Tarjuman/.test(x.family)).map((x) => `${x.family}:${x.weight}:${x.status}`) });
  });

  // ---- تنزيل SRT ونسخ التعليمات من الشريط ----
  await step('srt-download', async () => {
    await call('stubClipboard');
    await clickButton('download');
    await clickItem('download');
    const file = await waitFile((n) => n.endsWith('.srt'));
    const text = file ? await readFile(file.path, 'utf8') : null;
    check('srt-download', !!file && text === EXP.files[0].text, { file: file?.name ?? null, bytes: text?.length ?? null, expectedSha: sha(EXP.files[0].text), sha: text ? sha(text) : null });
  });
  await step('copy-instructions', async () => {
    if (!(await menu())) await clickButton('download');
    await clickItem('copy');
    const copies = await waitBridge('copies', (c) => c.length >= 1, { timeoutMs: 8000 });
    const st = await call('state');
    const accepted = [instructions({ videoId: VIDEO, title: st.title }), instructions({ videoId: VIDEO, title: st.title, glossary: [] })].map(sha);
    check('copy-instructions', !!copies && accepted.includes(copies.at(-1).sha), { copies, title: st.title ? 'معروف' : null });
    await closeMenu();
  });

  // ---- رفع العربية، والعرض، والتوقيت ----
  await step('arabic-upload', async () => {
    const armed = yt.armChooser([AR_FILE]);
    await clickButton('upload');
    const filled = await armed;
    const st = await waitBridge('state', (v) => v.arabic?.count === AR.length, { timeoutMs: 20000 });
    check('arabic-upload-from-player', filled && !!st, { chooser: filled, arabic: st?.arabic ?? null, expected: AR.length });
  });
  await step('display', async () => {
    const ad = await waitAdEnd();
    const seeks = await stableSeek(CUE_AT);
    const lines = await waitBridge('overlay', (l) => clean(l.join(' ')).includes(clean(AR_TEXT).slice(0, 20)), { timeoutMs: 12000 });
    check('display-arabic-over-video', !!lines, { ad, seeks, at: CUE_AT, cue: CUE.n, shown: lines?.map(clean) ?? null });
    await shot(yt, 'youtube-display');
  });
  await step('fonts-subtitle', async () => {
    const fonts = await waitBridge('fonts', (f) => f.some((x) => /Tarjuman Subtitle/.test(x.family) && x.status === 'loaded'), { timeoutMs: 10000 });
    check('subtitle-fonts-read-from-package', !!fonts, { fonts: (fonts ?? []).filter((x) => /Subtitle/.test(x.family)).map((x) => `${x.family}:${x.weight}:${x.status}`) });
  });
  await step('timing', async () => {
    const before = (await call('state')).view.displayOffsetMs;
    await clickButton('plus');
    const plus = await waitBridge('state', (v) => v.view.displayOffsetMs > before, { timeoutMs: 6000 });
    await clickButton('minus');
    const minus = await waitBridge('state', (v) => v.view.displayOffsetMs === before, { timeoutMs: 6000 });
    check('timing-plus-minus', !!plus && !!minus, { before, plus: plus?.view.displayOffsetMs ?? null, back: minus?.view.displayOffsetMs ?? null });
  });

  // ---- المحرّر والحفظ ----
  const MARK = ' — عدّلته في T3';
  await step('editor', async () => {
    const ed = await s.extPage(`pages/editor/index.html?v=${VIDEO}&t=1`);
    await ed.waitFor(() => !!document.querySelector('.ed-row[data-index] [data-field="text"]'), { timeoutMs: 20000 });
    await clickOn(ed, `document.querySelector('.ed-row[data-index="0"] [data-field="text"]')`, 'نص المقطع الأول');
    await ed.press('End');
    await ed.typeText(MARK);
    await sleep(200);
    await ed.press('Tab');
    const cue = await waitBridge('cueText', (t) => typeof t === 'string' && t.endsWith(MARK), { args: [1], timeoutMs: 15000 });
    check('editor-edit-reaches-player', !!cue, { cue1: cue ? 'ينتهي بالتعديل' : null });
    await shot(ed, 'editor');
    await ed.close();
  });
  await step('saved-restored', async () => {
    await yt.reload();
    await yt.eval(M.mute).catch(() => false);
    await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
    const st = await waitBridge('state', (v) => v.arabic?.count === AR.length, { timeoutMs: 20000 });
    const cue = st ? await call('cueText', [1]) : null;
    check('saved-and-restored-after-reload', !!st && typeof cue === 'string' && cue.endsWith(MARK), { arabic: st?.arabic ?? null });
  });

  // ---- النسخة الاحتياطية والإبلاغ ----
  let st = null;
  await step('backup', async () => {
    st = await s.extPage('pages/settings/index.html#data');
    await st.waitFor(() => !!document.querySelector('#data') && !document.querySelector('#data').hidden, { timeoutMs: 15000 });
    const before = new Set(await listDl());
    await clickOn(st, byText('#data button', 'إنشاء نسخة احتياطية'), 'إنشاء نسخة احتياطية');
    const file = await waitFile((n) => /^tarjuman-backup-.*\.json$/.test(n), { except: before });
    let parsed = null;
    if (file) {
      backupFile = file.path;
      parsed = JSON.parse(await readFile(file.path, 'utf8'));
    }
    check('backup-created', parsed?.format === 'tarjuman-backup' && JSON.stringify(parsed?.data ?? {}).includes(VIDEO), { file: file?.name ?? null, counts: parsed?.counts ?? null });
  });
  await step('report', async () => {
    if (!st) st = await s.extPage('pages/settings/index.html#about');
    await st.eval(() => { location.hash = 'about'; return true; });
    await st.waitFor(() => { const a = document.getElementById('about'); return a && !a.hidden; }, { timeoutMs: 8000 });
    await clickOn(st, byText('#about button', 'الإبلاغ عن مشكلة'), 'الإبلاغ عن مشكلة');
    await st.waitFor(() => !document.getElementById('st-report')?.hidden && !!document.querySelector('[data-report-field="diagnostics.build_target"]'), { timeoutMs: 15000 });
    await clickOn(st, `document.getElementById('st-report-text')`, 'وصف البلاغ');
    await st.typeText('بلاغ آلي من T3 — لا يُرسل');
    const rows = await st.eval(() => Object.fromEntries([...document.querySelectorAll('[data-report-field]')].map((r) => [r.getAttribute('data-report-field'), r.querySelector('dd')?.textContent.trim()])));
    const json = await st.eval(() => document.querySelector('.st-report__json')?.textContent ?? '');
    const payload = (() => { try { return JSON.parse(json); } catch { return null; } })();
    check('report-preview', rows['diagnostics.build_target'] === TARGET && String(rows['diagnostics.browser · browser_version'] ?? '').startsWith(BRAND) && !!rows.test && payload?.test === true && payload?.product === 'tarjuman',
      { rows, payloadKeys: payload ? Object.keys(payload) : null });
    await st.eval(() => { window.__t3copied = []; navigator.clipboard.writeText = async (t) => { window.__t3copied.push(t); }; return true; });
    await clickOn(st, byText('#st-report button', 'انسخ البلاغ'), 'انسخ البلاغ');
    const copied = await st.waitFor(() => window.__t3copied?.at(-1) ?? null, { timeoutMs: 5000 });
    check('report-copy-offline', copied === json && !!json, { same: copied === json });
    await s.blockReports(st);
    await clickOn(st, byText('#st-report button', 'أرسل البلاغ'), 'أرسل البلاغ');
    const failed = await st.waitFor(() => {
      const r = document.querySelector('[data-report-result="failed"]');
      return r ? { failure: r.getAttribute('data-failure'), retry: [...r.querySelectorAll('button')].some((b) => b.textContent.includes('أعد المحاولة')), copy: [...r.querySelectorAll('button')].some((b) => b.textContent.includes('انسخ البلاغ')), text: r.textContent.replace(/\s+/g, ' ').trim() } : null;
    }, { timeoutMs: 25000 });
    const sent = await st.eval(() => !!document.querySelector('[data-report-result="sent"]'));
    if (!failed && !sent) {
      check('report-error-row', null, { note: 'لم يُرد الإذن ولا الطلب في 25 ثانية بلا نافذة (حوار الإذن ينتظر يدًا)؛ يُختبر في الجلسة اليدوية', blocked: s.reportsBlocked.count });
    } else {
      check('report-error-row', !!failed && !sent && failed.retry && failed.copy && (failed.failure !== 'network' || s.reportsBlocked.count >= 1),
        { failed, sent, blockedRequests: s.reportsBlocked.count });
    }
    await shot(st, 'settings-report');
  });

  // ---- Firefox: إذن يوتيوب المشتق من سكربتات المحتوى، سحبًا ثم منحًا ----
  if (browser === 'firefox') {
    await step('youtube-permission', async () => {
      const removed = await st.eval(() => chrome.permissions.remove({ origins: ['https://www.youtube.com/*'] }));
      const has1 = await st.eval(() => chrome.permissions.contains({ origins: ['https://www.youtube.com/*'] }));
      await yt.reload();
      await sleep(3000);
      const off = await bridge(yt, 'ping', [], 3000);
      const granted = await st.eval(() => chrome.permissions.request({ origins: ['https://www.youtube.com/*'] }), { userActivation: true });
      await yt.reload();
      await yt.eval(M.mute).catch(() => false);
      const on = await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
      check('youtube-permission-revoke-grant', removed === true && has1 === false && !off.ok && granted === true && on === true, { removed, containsAfterRemove: has1, contentScriptWhileRevoked: off.ok, granted, contentScriptAfterGrant: on });
    });
  }

  // ---- الإزالة ومحو البيانات، ثم إعادة التثبيت والاستعادة ----
  await step('uninstall-wipe', async () => {
    const dirs = await s.storageDirs();
    const before = await Promise.all(dirs.map(async (d) => ({ dir: path.basename(d), bytes: await dirSize(d) })));
    if (st) await st.close().catch(() => {});
    st = null;
    const r = await s.uninstall();
    await sleep(3000);
    const after = await Promise.all(dirs.map(async (d) => ({ dir: path.basename(d), bytes: await dirSize(d) })));
    check('uninstall-removes-storage', !r.error && before.length > 0 && before.every((x) => x.bytes > 0) && after.every((x) => x.bytes === null), { uninstall: r, before, after });
  });
  await step('reinstall-empty-restore', async () => {
    await s.install();
    if (s.kind === 'firefox') {
      await yt.reload();
      await yt.eval(M.mute).catch(() => false);
      await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
      await s.learnBase(yt);
    }
    const page = await s.extPage('pages/settings/index.html#data');
    await page.waitFor(() => !!document.querySelector('#data') && !document.querySelector('#data').hidden, { timeoutMs: 15000 });
    const keys = await page.eval(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => /^(?:video|bundle):/.test(k)).length);
    check('reinstall-starts-empty', keys === 0, { videoKeys: keys });
    if (!backupFile) {
      check('backup-restore', null, { note: 'لا نسخة احتياطية من الخطوة السابقة' });
      return;
    }
    const armed = page.armChooser([backupFile]);
    await clickOn(page, byText('#data button', 'استعادة من ملف'), 'استعادة من ملف…');
    const filled = await armed;
    await page.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .st-restore'), { timeoutMs: 30000 });
    await clickOn(page, `[...document.querySelectorAll('dialog.tj-dialog[open]')].at(-1)?.querySelector('button[value="confirm"]')`, 'استعادة');
    const report = await page.waitFor(() => [...document.querySelectorAll('#data .tj-alert')].find((e) => e.textContent.includes('اكتملت الاستعادة'))?.textContent.replace(/\s+/g, ' ').trim() ?? null, { timeoutMs: 30000, intervalMs: 200 });
    const restored = await page.eval(async (id) => !!(await chrome.storage.local.get(`video:${id}`))[`video:${id}`], { args: [VIDEO] });
    check('backup-restore-after-reinstall', filled && !!report && restored, { chooser: filled, report: clean(report).slice(0, 120), restored });
    await shot(page, 'settings-restore');
  });
} catch (err) {
  check('run', false, { error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
} finally {
  if (s) {
    result.errors = s.errors();
    const n = result.errors.reduce((a, e) => a + e.errors.length, 0);
    check('no-extension-errors', n === 0, n ? result.errors.filter((e) => e.errors.length) : null);
    await s.close().catch(() => {});
  }
  const counted = result.checks.filter((c) => c.ok !== null);
  result.summary = { passed: counted.filter((c) => c.ok).length, total: counted.length, untested: result.checks.filter((c) => c.ok === null).map((c) => c.id) };
  await writeFile(path.join(OUT, 't3.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n${result.browser}: ${result.summary.passed}/${result.summary.total}${result.summary.untested.length ? ` · لم يُختبر: ${result.summary.untested.join('، ')}` : ''}`);
}
