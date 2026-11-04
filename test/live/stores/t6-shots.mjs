#!/usr/bin/env node
// اللقطات الخام لمواد المتاجر (جولة النشر T6) من حزمة المتجر نفسها (release/store/tarjuman-<الإصدار>-chrome.zip، بناء الإنتاج بلا
// جسر تطوير)، في Chrome بلا نافذة ومكتوم الصوت، بملف تعريف جديد خارج المستودع، ويوتيوب بواجهته العربية بلا حساب.
// فيديو اللقطات Cosmos Laundromat (CC) Blender Foundation | gooseberry.blender.org، برخصة CC BY 3.0 (store/listing.ar.md).
// تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُرسل جسم json3 مبني من ملف SRT الذي نزّله ترجمان في الجلسة اليدوية
// (t6-hand.mjs) برسالة الالتقاط نفسها من عالم الصفحة، أي عبر الجسر الحقيقي (كما في T3). ويُتحقق أن «تنزيل الملف» يعيد الملف
// اليدوي نفسه بايتًا، فما في اللقطة هو المسار الحقيقي. ثم الدورة كما يفعلها المستخدم: رفع الملف العربي (store/test-files) من زر
// الشريط، ووضع «فوق الأصل»، واللوحة، والتوقيت، ثم المحرّر والمحفوظات والإعدادات. كل فعل نقرة حقيقية (Input)، وعناصر جذور الظل
// المغلقة تُحدَّد بـDOM المخترق في CDP دون مساس بالمنتج. اللقطات بمعامل 2 لتُصغَّر بلا تشويش في الإطارات (t6-art.mjs).
// لا نص مقاطع في الأدلة: الفحوص والمقاسات والبصمات وحدها.
//   command npm run package
//   command node test/live/stores/t6-shots.mjs [--out docs/evidence/T6/shots] [--headed]
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, human, sleep } from '../harness/browser.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { readZip } from '../../../scripts/release/zip.mjs';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { startBrowser } from './driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const HEADED = argv.includes('--headed');
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/T6/shots'));
const VIDEO = 'Y-rmzh0PI3c';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}&t=182s&hl=ar&persist_hl=1`;
const VERSION = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
const ZIP = path.join(ROOT, 'release/store', `tarjuman-${VERSION}-chrome.zip`);
const EN_SRT = path.join(ROOT, 'store/test-files', `${VIDEO}.en.srt`);
const AR_SRT = path.join(ROOT, 'store/test-files', `${VIDEO}.ar.srt`);
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 't6-work', `shots-${RUN}`);
export const RAW = path.join(PROFILE_ROOT, 't6-work', 'raw');
const EXT = path.join(WORK, 'ext-chromium');
const DL = path.join(WORK, 'downloads');
const DSF = 2;
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const rel = (f) => path.relative(ROOT, f);

const result = { at: new Date().toISOString(), browser: null, package: path.basename(ZIP), video: VIDEO, headless: !HEADED, checks: [], raw: [], notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  return !!ok;
};
const note = (t) => { result.notes.push(t); console.log(`· ${t}`); };

// ---- جسم الالتقاط من الملف اليدوي، والتحقق أن ترجمان يعيده بايتًا ----
const enText = await readFile(EN_SRT, 'utf8');
const enCues = parseSrtStrict(enText);
const body = JSON.stringify({ wireMagic: 'pb3', events: enCues.map((c) => ({ tStartMs: c.startMs, dDurationMs: c.endMs - c.startMs, segs: [{ utf8: c.text }] })) });
const capture = { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VIDEO, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false };
{
  const ex = createExtractor({ currentVideoId: () => VIDEO, durationMs: () => 731000, isLive: () => false });
  ex.handleMessage(capture);
  const conv = ex.convert('en|manual', { mode: 'normal' });
  const again = buildExport({ videoId: VIDEO, title: null, track: { key: 'en|manual', lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: 'normal', now: Date.now() }).files[0].text;
  if (again !== enText) throw new Error('جسم الالتقاط المبني لا يعيد الملف اليدوي نفسه');
}
const manual = JSON.parse(await readFile(path.join(ROOT, 'docs/evidence/T6/manual/hand.json'), 'utf8'));
check('capture-body-rebuilds-manual-file', sha16(enText) === manual.file.sha16, { cues: enCues.length, sha16: sha16(enText) });

// ---- حزمة المتجر ----
for (const e of readZip(await readFile(ZIP))) {
  const f = path.join(EXT, e.name);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, e.data);
}
await mkdir(DL, { recursive: true });
await mkdir(RAW, { recursive: true });
await mkdir(OUT, { recursive: true });

let s = null;
let yt = null;
const main = (fn, ...args) => yt.eval(fn, { args });

// ---- DOM المخترق: عناصر جذور الظل المغلقة بالمعرّف والمحدِّد ----
async function inShadow(page, hostId, selector) {
  const { root } = await page.send('DOM.getDocument', { depth: -1, pierce: true });
  const attrs = (n) => Object.fromEntries((n.attributes ?? []).reduce((acc, v, i, arr) => (i % 2 ? acc : [...acc, [v, arr[i + 1]]]), []));
  let host = null;
  (function find(n) {
    if (host) return;
    if (attrs(n).id === hostId) { host = n; return; }
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? []), ...(n.contentDocument ? [n.contentDocument] : [])]) find(c);
  })(root);
  const sr = host?.shadowRoots?.[0];
  if (!sr) return null;
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: sr.nodeId, selector });
  if (!nodeId) return null;
  let box = null;
  try {
    const { model } = await page.send('DOM.getBoxModel', { nodeId });
    const q = model.border;
    const xs = [q[0], q[2], q[4], q[6]];
    const ys = [q[1], q[3], q[5], q[7]];
    box = { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  } catch {
    box = null;
  }
  const { outerHTML } = await page.send('DOM.getOuterHTML', { nodeId });
  return { nodeId, box, html: outerHTML };
}
const textOf = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
async function waitShadow(page, hostId, selector, { timeoutMs = 8000, pred = (x) => !!x?.box && x.box.width > 0 } = {}) {
  const end = Date.now() + timeoutMs;
  let x = null;
  while (Date.now() < end) {
    x = await inShadow(page, hostId, selector).catch(() => null);
    if (pred(x)) return x;
    await sleep(250);
  }
  return x;
}
async function clickBox(page, box, what) {
  if (!box || !box.width) throw new Error(`لا موضع لـ${what}`);
  await page.click(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2));
  await human(350, 600);
}
const bar = (kind) => inShadow(yt, 'tarjuman-controls', `button[data-kind="${kind}"]`);
async function clickBar(kind) {
  await revealControls(yt);
  const b = await bar(kind);
  await clickBox(yt, b?.box, `زر ${kind}`);
}
const layer = (selector) => waitShadow(yt, 'tarjuman-controls-layer', selector);
async function escape() {
  await yt.press('Escape');
  await sleep(350);
}

// ---- يوتيوب ----
const geo = () => main(() => {
  const r = (e) => { if (!e) return null; const x = e.getBoundingClientRect(); return { left: Math.round(x.left), top: Math.round(x.top), width: Math.round(x.width), height: Math.round(x.height), right: Math.round(x.right), bottom: Math.round(x.bottom) }; };
  return { player: r(document.querySelector('#movie_player')), panel: r(document.querySelector('#tarjuman-panel')), vw: innerWidth, vh: innerHeight, scrollY: Math.round(scrollY) };
});
async function waitNoAd(limitMs = 150000) {
  const isAd = () => main(() => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); });
  if (!(await isAd())) return 0;
  await main(() => { const v = document.querySelector('#movie_player video'); if (v) { v.muted = true; v.play().catch(() => {}); } return true; });
  const end = Date.now() + limitMs;
  while (Date.now() < end && (await isAd())) {
    const skip = await main(() => {
      const b = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
      if (!b || !b.offsetParent) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    if (skip) await yt.click(skip.x, skip.y);
    await sleep(1500);
  }
  if (await isAd()) throw new Error('بقي الإعلان بعد المهلة');
  await sleep(1500);
  return 1;
}
async function dismissPromo() {
  const c = await main(() => {
    const promo = document.querySelector('yt-mealbar-promo-renderer');
    if (!promo || !promo.getClientRects().length) return null;
    const btn = promo.querySelector('#dismiss-button button, #dismiss-button, yt-button-renderer#dismiss-button');
    const r = btn?.getBoundingClientRect();
    return r && r.width ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
  });
  if (!c) return false;
  await yt.click(c.x, c.y);
  await sleep(700);
  return true;
}
/**
 * الفيديو موقوفًا عند الزمن t بإطار مكتمل: إيقاف ثم قفز، وانتظار «seeked» واختفاء مؤشر التحميل وجاهزية الإطار. يوتيوب تحت الأتمتة
 * قد يعرض «حدث خطأ» أو يبقى يحمّل (ثبت في T6)، فيعاد فتح تبويب جديد حتى مرتين؛ وترجمان يستعيد حاله من التخزين.
 */
async function showFrame(t) {
  const once = () => main((x) => new Promise((resolve) => {
    const v = document.querySelector('#movie_player video');
    const vis = (sel) => { const e = document.querySelector(sel); return !!e && !!e.getClientRects().length && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden'; };
    v.muted = true;
    v.pause();
    if (Math.abs(v.currentTime - x) > 0.05) v.currentTime = x;
    const end = Date.now() + 12000;
    (function poll() {
      const done = !v.seeking && v.readyState >= 2 && !vis('.ytp-spinner');
      if (done || vis('.ytp-error') || Date.now() > end) {
        resolve({ t: +v.currentTime.toFixed(2), ready: v.readyState, spinner: vis('.ytp-spinner'), error: vis('.ytp-error'), large: vis('.ytp-large-play-button') });
      } else setTimeout(poll, 200);
    })();
  }), t);
  let f = await once();
  for (let attempt = 1; attempt <= 2 && (f.error || f.spinner); attempt++) {
    note(`الإطار عند ${t} لم يكتمل (${f.error ? 'خطأ يوتيوب' : 'مؤشر التحميل'})، فتُح تبويب جديد (${attempt})`);
    const old = yt;
    await openYoutube();
    await old.conn.send('Target.closeTarget', { targetId: old.targetId }).catch(() => null);
    f = await once();
  }
  await sleep(400);
  return f;
}
/** العلامة المائية لقناة الفيلم (شعار Blender، مستثنى من رخصة CC) وزر التشغيل الكبير (علامة يوتيوب) يُخفيان بنمط في صفحة الاختبار وحدها وقت اللقطات؛ لا مساس بالإضافة. */
const hideWatermark = () => main(() => {
  const st = document.createElement('style');
  st.id = 't6-hide-watermark';
  st.textContent = '.iv-branding, .ytp-watermark, .branding-img-container, .annotation-type-custom, .ytp-large-play-button { display: none !important; }';
  document.head.appendChild(st);
  return true;
});
/** صفحة يوتيوب بالواجهة العربية ومقاس اللقطات، والمشغّل جاهز وأدوات ترجمان مركّبة. */
async function openYoutube() {
  const page = await s.youtube('about:blank');
  await page.send('Network.enable');
  await page.send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': 'ar' } });
  await page.send('Network.setCookie', { name: 'PREF', value: 'hl=ar', domain: '.youtube.com', path: '/', secure: true });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: DSF, mobile: false });
  await page.goto(WATCH);
  yt = page;
  await dismissConsent(yt).catch(() => false);
  const ready = await waitForPlayer(yt, VIDEO, 45000);
  if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  const ads = await waitNoAd();
  if (ads) note('انتُظر إعلان يوتيوب حتى انتهى');
  await sleep(1500);
  await dismissPromo();
  await hideWatermark();
  await waitShadow(yt, 'tarjuman-controls', 'button[data-kind="download"]', { timeoutMs: 15000 });
  await sleep(800);
  return { ready: !!ready, ads };
}
const frontYt = () => yt.conn.send('Target.activateTarget', { targetId: yt.targetId }).catch(() => null);
/** نقرة حقيقية في مركز عنصر يعيده تعبير JS في صفحة إضافة. */
async function clickExpr(page, expr, what) {
  const ok = await page.eval(`(() => { for (const e of document.querySelectorAll('[data-t6]')) e.removeAttribute('data-t6'); const el = (${expr}); if (!el) return false; el.setAttribute('data-t6', '1'); return true; })()`);
  if (!ok) throw new Error(`لم يوجد: ${what}`);
  const c = await page.centerOf('[data-t6="1"]');
  if (!c) throw new Error(`غير ظاهر: ${what}`);
  await page.click(c.x, c.y);
  await human(300, 500);
}
const pauseAt = (t) => main((x) => { const v = document.querySelector('#movie_player video'); v.muted = true; v.pause(); v.currentTime = x; return true; }, t);

/** لقطة منطقة بمعامل العرض (DSF) إلى المجلد الخام، وتُسجَّل بمقاسها وبصمتها. */
async function rawShot(page, name, clip) {
  const params = { format: 'png', captureBeyondViewport: false };
  if (clip) params.clip = { x: clip.left, y: clip.top, width: clip.width, height: clip.height, scale: 1 };
  const { data } = await page.send('Page.captureScreenshot', params);
  const buf = Buffer.from(data, 'base64');
  const f = path.join(RAW, `${name}.png`);
  await writeFile(f, buf);
  result.raw.push({ name, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), sha16: createHash('sha256').update(buf).digest('hex').slice(0, 16) });
  console.log(`  ⤷ ${name}.png ${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}`);
}
const union = (a, b) => {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return { left, top, width: Math.max(a.right, b.right) - left, height: Math.max(a.bottom, b.bottom) - top };
};
const pad = (r, p) => ({ left: Math.max(0, r.left - p), top: Math.max(0, r.top - p), width: r.width + 2 * p, height: r.height + 2 * p });

async function waitFile(timeoutMs = 25000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const list = (await readdir(DL, { recursive: true }).catch(() => [])).filter((n) => n.endsWith('.srt'));
    if (list.length) {
      await sleep(600);
      return list[0];
    }
    await sleep(400);
  }
  return null;
}

// ---- صفحات الإضافة ----
async function extShot(relPath, name, { width, height, scheme = 'light', before = null } = {}) {
  const page = await s.extPage(relPath);
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: DSF, mobile: false });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await page.waitFor(() => document.readyState === 'complete' && document.fonts.status === 'loaded', { timeoutMs: 15000 }).catch(() => null);
  await sleep(1200);
  if (before) await before(page);
  await sleep(500);
  await rawShot(page, name, null);
  return page;
}

try {
  // لا تشغيل تلقائي في نسخة الاختبار: يوتيوب تحت الأتمتة لا يحمّل الفيديو (مؤشر تحميل ثم «حدث خطأ»)، فيبقى غلاف الفيلم عند 3:02
  // من الرابط (&t=182s) كما يراه من فتح الرابط ولم يشغّل بعد، وترجمان يعرض المقطع الحالي فوقه.
  s = await startBrowser('chrome', { profile: `chrome-t6-shots-${RUN}`, ext: EXT, downloadDir: DL, headless: !HEADED, extraArgs: ['--autoplay-policy=user-gesture-required'] });
  result.browser = s.version;
  check('install-store-package', !!s.extensionId, { version: s.version });

  // ===== ١. يوتيوب بالواجهة العربية، والالتقاط عبر الجسر =====
  const first = await openYoutube();
  check('youtube-player-ready', first.ready);
  note('أُخفيت العلامة المائية لقناة الفيلم (شعار Blender مستثنى من رخصة الفيلم) وزر التشغيل الكبير (علامة يوتيوب) بنمط في صفحة الاختبار وحدها؛ والإطار صورة غلاف الفيلم لأن التشغيل تحت الأتمتة يعطي خطأ يوتيوب');
  const f0 = await showFrame(182);
  check('frame-at-3-02-complete', !f0.error && !f0.spinner && Math.abs(f0.t - 182) < 1, f0);
  check('controls-mounted', !!(await waitShadow(yt, 'tarjuman-controls', 'button[data-kind="download"]', { timeoutMs: 15000 }))?.box);
  await yt.eval((msg) => { window.postMessage(msg, location.origin); return true; }, { args: [capture] });
  await sleep(1500);

  // ===== ٢. قائمة «تحميل الأصل»: اللقطة، ثم «تنزيل الملف» يعيد الملف اليدوي =====
  await clickBar('download');
  const dlItem = await layer('button[data-fid="download"]');
  const menuText = textOf((await inShadow(yt, 'tarjuman-controls-layer', '[role="menu"], .menu'))?.html);
  check('download-menu-open-with-track', !!dlItem?.box && /60/.test(menuText), { hasDownload: !!dlItem?.box, cueCount: /60/.test(menuText) });
  await revealControls(yt);
  await sleep(400);
  let g = await geo();
  await rawShot(yt, '02-download-menu', pad({ ...g.player, right: g.player.right, bottom: g.player.bottom }, 0));
  await clickBox(yt, dlItem.box, 'تنزيل الملف');
  const file = await waitFile();
  const got = file ? await readFile(path.join(DL, file), 'utf8') : null;
  check('download-equals-manual-file', got !== null && sha16(got) === manual.file.sha16, { file: file ? path.basename(file) : null, sha16: got ? sha16(got) : null });
  await escape();

  // ===== ٣. رفع الملف العربي من زر الشريط (لا عربية بعد ← منتقي الملفات مباشرة) =====
  const chosen = yt.armChooser([AR_SRT]);
  await clickBar('upload');
  await Promise.race([chosen, sleep(8000)]);
  const confirm = await waitShadow(yt, 'tarjuman-controls-layer', 'button[data-fid="confirm"]', { timeoutMs: 3000 });
  if (confirm?.box) {
    note('ظهر حوار الحفظ بعد اختيار الملف، فضُغط زره الرئيسي');
    await clickBox(yt, confirm.box, 'حفظ');
  }
  const stored = await s.extPage('pages/popup/index.html').then(async (p) => {
    await sleep(1500);
    return p.eval(async (id) => {
      const all = await chrome.storage.local.get(null);
      const rec = all[`video:${id}`] ?? null;
      return rec ? { arabic: rec.arabic?.original?.length ?? null, english: rec.english?.[0]?.cues?.length ?? null, matched: rec.arabic?.comparison?.matched ?? null } : { keys: Object.keys(all).slice(0, 12) };
    }, { args: [VIDEO] });
  });
  check('arabic-uploaded-and-saved', stored?.arabic === 60 && stored?.english === 60, stored);
  // بلا نافذة صفحة واحدة ظاهرة: يُعاد تقديم يوتيوب بعد صفحة الإضافة، وإلا أُبطئت مؤقّتاته.
  await frontYt();
  await sleep(1500);

  // ===== ٤. «فوق الأصل»، واللوحة، والمقطع 12 فوق الفيديو =====
  let dual = null;
  for (let attempt = 0; attempt < 3 && !dual?.box; attempt++) {
    await clickBar('upload');
    dual = await layer('button[data-fid="mode:dual"]');
    if (!dual?.box) {
      note(`قائمة الترجمة لم تظهر في المحاولة ${attempt + 1}`);
      await escape();
      await sleep(800);
    }
  }
  if (dual?.box) await clickBox(yt, dual.box, 'فوق الأصل');
  const dualOn = await waitShadow(yt, 'tarjuman-controls-layer', 'button[data-fid="mode:dual"][aria-checked="true"]', { timeoutMs: 3000 });
  check('display-mode-dual', !!dualOn);
  await escape();
  await clickBar('panel');
  const panelOpened = await yt.waitFor(() => { const h = document.querySelector('#tarjuman-panel'); return !!h && h.getBoundingClientRect().width > 300; }, { timeoutMs: 8000 }).catch(() => false);
  check('panel-opens-from-bar-button', !!panelOpened);
  // يوتيوب تحت الأتمتة يعرض «حدث خطأ» بعد ثوانٍ من القفز بعيدًا (يحاول تحميل الفيديو)، فتُلتقط لقطتا المشغّل متتاليتين فور القفز.
  const f1 = await showFrame(182);
  const panelOk = await yt.waitFor(() => { const h = document.querySelector('#tarjuman-panel'); return !!h && h.getBoundingClientRect().width > 300; }, { timeoutMs: 8000 }).catch(() => false);
  check('panel-open-and-frame-complete-at-3-02', !!panelOk && !f1.error && !f1.spinner && Math.abs(f1.t - 182) < 1, f1);
  await revealControls(yt);
  await sleep(300);
  const arLine = textOf((await inShadow(yt, 'tarjuman-overlay', '.line.ar'))?.html);
  const enLine = textOf((await inShadow(yt, 'tarjuman-overlay', '.line.en'))?.html);
  check('overlay-shows-arabic-over-english', /\p{Script=Arabic}/u.test(arLine) && /[A-Za-z]/.test(enLine));
  g = await geo();
  check('panel-right-of-player', g.panel && g.panel.left >= g.player.right - 4, { player: g.player, panel: g.panel });
  await rawShot(yt, '01-overlay-panel', pad(union(g.player, g.panel), 0));
  await rawShot(yt, '01b-overlay-player', g.player);

  // التوقيت: الإزاحة +0.5 ثم حوار التوقيت، في الصفحة نفسها فورًا.
  const plus = await bar('plus');
  await clickBox(yt, plus?.box, 'زر +');
  await clickBar('badge');
  const sync = await layer('button[data-fid="sync"]');
  check('timing-dialog-open', !!sync?.box);
  await revealControls(yt);
  await sleep(300);
  const f3 = await main(() => ({ error: !!document.querySelector('.ytp-error')?.getClientRects().length, spinner: !!document.querySelector('.ytp-spinner')?.getClientRects().length && getComputedStyle(document.querySelector('.ytp-spinner')).display !== 'none' }));
  check('timing-frame-complete', !f3.error && !f3.spinner, f3);
  g = await geo();
  await rawShot(yt, '03-timing', g.player);
  await escape();
  // الإزاحة تعود صفرًا قبل صفحات الإضافة (المحرّر يعرض تنبيه الإزاحة إن بقيت).
  const minus = await bar('minus');
  await clickBox(yt, minus?.box, 'زر −');

  // ===== ٥. صفحات الإضافة بمقاسين: إطار Chromium (1200×610) وإطار Firefox (1200×770)، والإزاحة صفر =====
  // القائمة افتراضية (virtual.js): تُمرَّر حاويتها خطوة خطوة حتى يُرسم صف المقطع 12، ثم يُجعل أول الظاهر.
  const toCue12 = async (page) => {
    const ok = await page.eval(async () => {
      const find = () => [...document.querySelectorAll('input')].find((i) => i.value === '00:03:00,500');
      // أقرب حاوية قابلة للتمرير تضم صفوف المقاطع نفسها (لا اللوحة الجانبية)، وإلا الصفحة.
      const anyRow = [...document.querySelectorAll('input')].find((i) => /^\d\d:\d\d:\d\d,\d{3}$/.test(i.value));
      let box = anyRow?.parentElement ?? null;
      while (box && !(box.scrollHeight > box.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
      box = box ?? document.scrollingElement;
      for (let i = 0; i < 60 && !find(); i++) {
        box.scrollTop += 120;
        await new Promise((r) => setTimeout(r, 120));
      }
      const inp = find();
      if (!inp) return false;
      (inp.closest('tr, [role="row"], li') ?? inp).scrollIntoView({ block: 'start' });
      await new Promise((r) => setTimeout(r, 300));
      return !!find();
    });
    check('editor-scrolled-to-cue-12', ok);
  };
  const expandRow = async (page) => {
    await clickExpr(page, `document.querySelector('.lib-row__actions button[aria-expanded="false"]')`, 'توسيع الصف');
    await sleep(600);
  };
  for (const [suffix, height] of [['wide', 732], ['tall', 924]]) {
    await extShot(`pages/editor/index.html?v=${VIDEO}`, `04-editor-${suffix}`, { width: 1440, height, before: toCue12 });
    await extShot(`pages/library/index.html#v=${VIDEO}`, `05-library-${suffix}`, { width: 1440, height, before: expandRow });
    await extShot('pages/settings/index.html#appearance', `06-settings-${suffix}`, { width: 1440, height });
  }

  const errs = s.errors();
  const extErrors = errs.flatMap((e) => e.errors);
  check('no-extension-errors', extErrors.length === 0, extErrors.slice(0, 5));
} catch (err) {
  check('run-completed', false, { error: err.message });
} finally {
  if (s) await s.close().catch(() => {});
}

const pass = result.checks.filter((c) => c.ok).length;
result.summary = `${pass}/${result.checks.length}`;
await writeFile(path.join(OUT, 'chrome.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\nChrome (${result.browser}): ${result.summary} — اللقطات الخام في ${RAW}`);
process.exit(pass === result.checks.length ? 0 : 1);
