#!/usr/bin/env node
// اللقطات الحقيقية لصفحات ترجمان في الموقع (AA4) ولإطارات مواد المتاجر (AA5، tools/store-art) من بناء الإنتاج على هذا الفرع (بلا جسر تطوير)، على طريقة T6 نفسها
// (test/live/stores/t6-shots.mjs): Chrome بلا نافذة ومكتوم الصوت، بملف تعريف جديد تحت TJ_PROFILE_ROOT، ويوتيوب بواجهته العربية بلا
// حساب. فيديو اللقطات Cosmos Laundromat (CC) Blender Foundation | gooseberry.blender.org، برخصة CC BY 3.0 (docs/site/credits.md).
// تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُرسل جسم json3 مبني من ملف SRT الذي نزّله ترجمان في جلسة T6 اليدوية برسالة
// الالتقاط نفسها من عالم الصفحة، أي عبر الجسر الحقيقي، ويُتحقق أن «تنزيل الملف» يعيد الملف اليدوي نفسه بايتًا. وقائمة مسارات الفيديو
// الأخرى (عددها في سطر قائمة التحميل) تقرؤها الإضافة من بيانات المشغّل في الصفحة كما هي (لا تُحقن). ثم الدورة كما يفعلها المستخدم في 2.0.0: قائمة التحميل،
// ونافذة الإضافة بكتلة «تعليمات الترجمة» (تُفتح في تبويب خلفي ويوتيوب هو التبويب النشط، فتقرأ حالته كما تقرؤها من شريط المتصفح)،
// ورفع الملف العربي من زر الشريط، ووضع «فوق الأصل»، واللوحة، والتوقيت، ثم المحرّر والمحفوظات والإعدادات. كل فعل نقرة حقيقية
// (Input)، وعناصر جذور الظل المغلقة تُحدَّد بـDOM المخترق في CDP دون مساس بالمنتج. اللقطات بمعامل 2.
// لا نص مقاطع في الأدلة: الفحوص والمقاسات والبصمات وحدها. والصور الخام خارج المستودع (--raw)، وتُنسخ منها لقطات الموقع بايتًا.
// **يفتح متصفحًا عند تشغيله أو استيراده:** بإذن سلطان وحده (docs/development.md، «الاختبارات الحية»).
//   command node scripts/build.mjs --out <مجلد في المسودة>
//   TJ_PROFILE_ROOT=<مجلد في المسودة> command node test/live/aa4/site-shots.mjs --ext <المجلد> [--out test-results/live/AA4] [--raw <مجلد>] [--headed]
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, human, sleep } from '../harness/browser.mjs';
import { attach } from '../harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { startBrowser } from '../stores/driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const HEADED = argv.includes('--headed');
const EXT = val('ext') ? path.resolve(val('ext')) : null;
const OUT = path.resolve(ROOT, val('out', 'test-results/live/AA4'));
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 'aa4-work', `shots-${RUN}`);
const RAW = path.resolve(val('raw', path.join(PROFILE_ROOT, 'aa4-work', 'raw')));
const DL = path.join(WORK, 'downloads');
const VIDEO = 'Y-rmzh0PI3c';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}&t=182s&hl=ar&persist_hl=1`;
const EN_SRT = path.join(ROOT, 'store/test-files', `${VIDEO}.en.srt`);
const AR_SRT = path.join(ROOT, 'store/test-files', `${VIDEO}.ar.srt`);
const DSF = 2;
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

if (!EXT || !existsSync(path.join(EXT, 'manifest.json'))) {
  console.error('استعمال: --ext <مجلد بناء الإنتاج> (command node scripts/build.mjs --out <مجلد>)');
  process.exit(2);
}
if (existsSync(path.join(EXT, 'dev'))) {
  console.error('هذا بناء تطوير (فيه dev/): اللقطات من بناء الإنتاج وحده');
  process.exit(2);
}
if (RAW.startsWith(ROOT + path.sep)) {
  console.error('--raw داخل المستودع: الصور الخام خارجه، وتُنسخ منها لقطات الموقع');
  process.exit(2);
}

const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
const result = { at: new Date().toISOString(), browser: null, build: { version: manifest.version, versionName: manifest.version_name ?? null }, video: VIDEO, headless: !HEADED, checks: [], raw: [], geometry: {}, notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  return !!ok;
};
const note = (t) => { result.notes.push(t); console.log(`· ${t}`); };

// ---- جسم الالتقاط من ملف T6 اليدوي، والتحقق أن ترجمان يعيده بايتًا ----
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
// مرجع الملف اليدوي: ملف الاختبار في store/test-files هو ما نزّله سلطان في الجلسة اليدوية بايتًا (البصمة نفسها).
const manual = { file: { sha16: sha16(await readFile(EN_SRT, 'utf8')) } };
check('capture-body-rebuilds-manual-file', sha16(enText) === manual.file.sha16, { cues: enCues.length, sha16: sha16(enText) });

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
/** الفيديو موقوفًا عند الزمن t بإطار مكتمل، وإعادة فتح تبويب جديد حتى مرتين إن عرض يوتيوب «حدث خطأ» أو بقي يحمّل (ثبت في T6). */
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
        resolve({ t: +v.currentTime.toFixed(2), ready: v.readyState, spinner: vis('.ytp-spinner'), error: vis('.ytp-error') });
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
/** العلامة المائية لقناة الفيلم (شعار Blender، مستثنى من رخصة CC) وزر التشغيل الكبير (علامة يوتيوب) يُخفيان بنمط في صفحة الاختبار وحدها؛ لا مساس بالإضافة. */
const hideWatermark = () => main(() => {
  const st = document.createElement('style');
  st.id = 'aa4-hide-watermark';
  st.textContent = '.iv-branding, .ytp-watermark, .branding-img-container, .annotation-type-custom, .ytp-large-play-button { display: none !important; }';
  document.head.appendChild(st);
  return true;
});
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
const isTheater = () => main(() => !!document.querySelector('ytd-watch-flexy')?.hasAttribute('theater'));
/** وضع المسرح بنقرة زر الحجم في المشغّل (كما في test/live/controls/run.mjs)، لمشغّل أطول تظهر فيه القائمة بطولها. */
async function setTheater(on) {
  if ((await isTheater()) === on) return true;
  await revealControls(yt);
  const c = await main(() => { const b = document.querySelector('#movie_player .ytp-size-button'); const r = b?.getBoundingClientRect(); return r && r.width ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null; });
  if (c) await yt.click(c.x, c.y);
  await sleep(1800);
  return (await isTheater()) === on;
}

async function clickExpr(page, expr, what) {
  const ok = await page.eval(`(() => { for (const e of document.querySelectorAll('[data-aa4]')) e.removeAttribute('data-aa4'); const el = (${expr}); if (!el) return false; el.setAttribute('data-aa4', '1'); return true; })()`);
  if (!ok) throw new Error(`لم يوجد: ${what}`);
  const c = await page.centerOf('[data-aa4="1"]');
  if (!c) throw new Error(`غير ظاهر: ${what}`);
  await page.click(c.x, c.y);
  await human(300, 500);
}

/** لقطة منطقة بمعامل العرض إلى المجلد الخام، وتُسجَّل بمقاسها وبصمتها ومنطقتها. */
async function rawShot(page, name, clip) {
  const params = { format: 'png', captureBeyondViewport: false };
  if (clip) params.clip = { x: clip.left, y: clip.top, width: clip.width, height: clip.height, scale: 1 };
  const { data } = await page.send('Page.captureScreenshot', params);
  const buf = Buffer.from(data, 'base64');
  await writeFile(path.join(RAW, `${name}.png`), buf);
  result.raw.push({ name, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), sha16: createHash('sha256').update(buf).digest('hex').slice(0, 16), clip: clip ?? null });
  console.log(`  ⤷ ${name}.png ${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}`);
}
const union = (a, b) => {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return { left, top, width: Math.max(a.right, b.right) - left, height: Math.max(a.bottom, b.bottom) - top };
};

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

/**
 * نافذة الإضافة كما تُفتح من شريط المتصفح: يوتيوب التبويب النشط في النافذة الأخيرة، والنافذة في تبويب خلفي، فتقرأ حالته بـ
 * tabs.query({ active, lastFocusedWindow }) كما في سكربت إعادة التصميم الأول. بعرضها الحقيقي 340 وطولها كما يرسمه المحتوى.
 */
async function popupShot(name, { scheme = 'light' } = {}) {
  await frontYt();
  await sleep(400);
  const { targetId } = await yt.conn.send('Target.createTarget', { url: 'about:blank', background: true });
  const page = await attach(yt.conn, targetId, { url: `${s.base}pages/popup/index.html` });
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 340, height: 640, deviceScaleFactor: DSF, mobile: false });
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await page.waitFor(() => !!document.querySelector('#app[data-ready]') && document.fonts.status === 'loaded', { timeoutMs: 12000 });
    await sleep(1500);
    const info = await page.eval(() => {
      const t = (sel) => document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
      const copy = [...document.querySelectorAll('button')].find((b) => /نسخ التعليمات/.test(b.textContent));
      return {
        status: t('.tj-popup__status'),
        block: t('.tj-popup__pair'),
        copyDisabled: copy ? copy.getAttribute('aria-disabled') === 'true' || copy.disabled : null,
        h: Math.ceil(document.documentElement.scrollHeight),
        w: document.documentElement.clientWidth,
      };
    });
    check('popup-reads-youtube-tab', !!info.status && !/افتح فيديو على يوتيوب/.test(info.status), { status: info.status?.slice(0, 120) });
    check('popup-from-detected-english', /^تعليمات الترجمةمنالإنجليزيةإلىالعربية/.test(info.block ?? ''), { block: info.block?.slice(0, 40) });
    check('popup-copy-enabled', info.copyDisabled === false, { copyDisabled: info.copyDisabled });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 340, height: Math.min(info.h, 1200), deviceScaleFactor: DSF, mobile: false });
    await sleep(500);
    result.geometry.popup = { width: info.w, height: info.h };
    await rawShot(page, `${name}-full`, null);
    // حتى نهاية كتلة «تعليمات الترجمة» وسطرها (الرأس والفيديو الحالي والكتلة)، فتجاور خطوات «كيف يعمل» في الموقع.
    const bottom = await page.eval(() => Math.ceil(Math.max(...[...document.querySelectorAll('.tj-popup__pair, .tj-popup__pair *')].map((e) => e.getBoundingClientRect().bottom))));
    check('popup-instructions-block-measured', bottom > 200 && bottom < info.h, { bottom });
    await rawShot(page, name, { left: 0, top: 0, width: 340, height: Math.min(bottom + 7, info.h) });
  } finally {
    await yt.conn.send('Target.closeTarget', { targetId }).catch(() => null);
    await frontYt();
    await sleep(1200);
  }
}

try {
  // لا تشغيل تلقائي في نسخة الاختبار (كما في T6): الفيديو موقوف عند 3:02 من الرابط (إطاره إن حمّله يوتيوب، وإلا غلافه)، وترجمان يعرض المقطع الحالي فوقه.
  s = await startBrowser('chrome', { profile: `chrome-aa4-shots-${RUN}`, ext: EXT, downloadDir: DL, headless: !HEADED, extraArgs: ['--autoplay-policy=user-gesture-required'] });
  result.browser = s.version;
  check('install-production-build', !!s.extensionId, { version: s.version, build: result.build });

  // ===== ١. يوتيوب بالواجهة العربية، والالتقاط عبر الجسر =====
  const first = await openYoutube();
  check('youtube-player-ready', first.ready);
  note('أُخفيت العلامة المائية لقناة الفيلم وزر التشغيل الكبير بنمط في صفحة الاختبار وحدها');
  const f0 = await showFrame(182);
  check('frame-at-3-02-complete', !f0.error && !f0.spinner && Math.abs(f0.t - 182) < 1, f0);
  note(f0.ready >= 2 ? 'الإطار عند 3:02 إطار من الفيلم نفسه (حمّله يوتيوب في هذا التشغيل)' : 'الإطار عند 3:02 صورة غلاف الفيلم (لم يحمّل يوتيوب الفيديو تحت الأتمتة)');
  await yt.eval((msg) => { window.postMessage(msg, location.origin); return true; }, { args: [capture] });
  await sleep(1500);

  // ===== ٢. قائمة «تحميل الأصل» بالمسار بلغته والمسارات الأخرى من بيانات المشغّل، ثم «تنزيل الملف» يعيد الملف اليدوي =====
  // في وضع المسرح: المشغّل أطول، فتظهر القائمة بطولها (والفيلم بنسبة عرضه، فالمشغّل العادي قصير).
  check('theater-for-download-menu', await setTheater(true));
  await showFrame(182);
  await clickBar('download');
  const dlItem = await layer('button[data-fid="download"]');
  const menuHtml = (await inShadow(yt, 'tarjuman-controls-layer', '[role="menu"], [role="dialog"], .menu'))?.html;
  const menuText = textOf(menuHtml);
  // سطر لغات الفيديو الأخرى (قرار سلطان 2026-11-07): عددها من قائمة مسارات الفيديو في بيانات المشغّل، لا صف لكل مسار.
  const countAttr = /data-fid="otherLangs"[^>]*data-count="(\d+)"/.exec(String(menuHtml ?? ''))?.[1];
  const others = countAttr === undefined ? null : Number(countAttr);
  check('download-menu-track-by-language', !!dlItem?.box && /الإنجليزية/.test(menuText) && /60/.test(menuText), { hasDownload: !!dlItem?.box });
  check('download-menu-no-copy-button', !/data-fid="copy"/.test(String(menuHtml ?? '')));
  check('download-menu-other-languages-line', /data-fid="otherLangs"/.test(String(menuHtml ?? '')) && !/data-fid="available:/.test(String(menuHtml ?? '')));
  result.geometry.otherLanguages = others;
  note(others !== null ? `قائمة التحميل تقول إن في الفيديو ${others} لغة أخرى، من قائمة مسارات الفيديو في بيانات المشغّل (لم تُحقن)` : 'سطر اللغات الأخرى بلا عدد: لم تُقرأ قائمة مسارات الفيديو من بيانات المشغّل في هذا التشغيل');
  await revealControls(yt);
  await sleep(400);
  let g = await geo();
  await rawShot(yt, '02-download-menu', g.player);
  result.geometry.theaterPlayer = g.player;
  await clickBox(yt, dlItem.box, 'تنزيل الملف');
  const file = await waitFile();
  const got = file ? await readFile(path.join(DL, file), 'utf8') : null;
  check('download-equals-manual-file', got !== null && sha16(got) === manual.file.sha16, { file: file ? path.basename(file) : null, sha16: got ? sha16(got) : null });
  await escape();
  check('back-to-default-view', await setTheater(false));

  // ===== ٣. نافذة الإضافة: «من» مكتشفة من المسار، و«إلى» الافتراضية، و«نسخ التعليمات» مفعّل (قبل الترجمة، خطوة «كيف يعمل» الثانية) =====
  await popupShot('07-popup');

  // ===== ٤. رفع الملف العربي من زر الشريط (لا ترجمة بعد ← منتقي الملفات مباشرة)، ولغته من رمز اسمه =====
  const chosen = yt.armChooser([AR_SRT]);
  await clickBar('upload');
  await Promise.race([chosen, sleep(8000)]);
  const confirm = await waitShadow(yt, 'tarjuman-controls-layer', 'button[data-fid="confirm"]', { timeoutMs: 3000 });
  if (confirm?.box) {
    note('ظهر حوار الحفظ بعد اختيار الملف، فضُغط زره الرئيسي');
    await clickBox(yt, confirm.box, 'حفظ');
  }
  const stored = await s.extPage('pages/settings/index.html').then(async (p) => {
    await sleep(1500);
    const r = await p.eval(async (id) => {
      const all = await chrome.storage.local.get(null);
      const rec = all[`video:${id}`] ?? null;
      const lang = all[`lang:${id}`] ?? null;
      return rec ? { arabic: rec.arabic?.original?.length ?? null, english: rec.english?.[0]?.cues?.length ?? null, slotLang: lang?.slots?.find(Boolean)?.lang ?? null } : { keys: Object.keys(all).slice(0, 12) };
    }, { args: [VIDEO] });
    await p.conn.send('Target.closeTarget', { targetId: p.targetId }).catch(() => null);
    return r;
  });
  check('translation-uploaded-and-saved', stored?.arabic === 60 && stored?.english === 60, stored);
  check('translation-lang-from-file-name', stored?.slotLang === 'ar', { slotLang: stored?.slotLang ?? null });
  await frontYt();
  await sleep(1500);

  // ===== ٥. «فوق الأصل»، واللوحة، والمقطع 12 فوق الفيديو =====
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
  check('display-mode-dual', !!(await waitShadow(yt, 'tarjuman-controls-layer', 'button[data-fid="mode:dual"][aria-checked="true"]', { timeoutMs: 3000 })));
  await escape();
  await clickBar('panel');
  check('panel-opens-from-bar-button', !!(await yt.waitFor(() => { const h = document.querySelector('#tarjuman-panel'); return !!h && h.getBoundingClientRect().width > 300; }, { timeoutMs: 8000 }).catch(() => false)));
  const f1 = await showFrame(182);
  const panelOk = await yt.waitFor(() => { const h = document.querySelector('#tarjuman-panel'); return !!h && h.getBoundingClientRect().width > 300; }, { timeoutMs: 8000 }).catch(() => false);
  check('panel-open-and-frame-complete-at-3-02', !!panelOk && !f1.error && !f1.spinner && Math.abs(f1.t - 182) < 1, f1);
  await revealControls(yt);
  await sleep(300);
  const arLine = await inShadow(yt, 'tarjuman-overlay', '.line.ar');
  const enLine = await inShadow(yt, 'tarjuman-overlay', '.line.en');
  check('overlay-translation-over-original', /\p{Script=Arabic}/u.test(textOf(arLine?.html)) && /[A-Za-z]/.test(textOf(enLine?.html)));
  const attrs = String(arLine?.html ?? '').match(/^<div[^>]*>/)?.[0] ?? null;
  check('overlay-line-lang-and-dir', /lang="ar"/.test(String(attrs)) && /dir="rtl"/.test(String(attrs)), { attrs });
  g = await geo();
  result.geometry.player = g.player;
  result.geometry.panel = g.panel;
  check('panel-right-of-player', g.panel && g.panel.left >= g.player.right - 4, { player: g.player, panel: g.panel });
  await rawShot(yt, '01-overlay-panel', union(g.player, g.panel));
  await rawShot(yt, '01b-overlay-player', g.player);
  await rawShot(yt, '01c-panel', g.panel);

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
  const minus = await bar('minus');
  await clickBox(yt, minus?.box, 'زر −');

  // ===== ٦. صفحات الإضافة بإطار الحاسوب (1440×732)، والإزاحة صفر =====
  const toCue12 = async (page) => {
    const ok = await page.eval(async () => {
      const find = () => [...document.querySelectorAll('input')].find((i) => i.value === '00:03:00,500');
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
    const pair = await page.eval(() => document.querySelector('.lib-row')?.textContent.replace(/\s+/g, ' ') ?? '');
    check('library-row-shows-pair', /الإنجليزية/.test(pair) && /العربية/.test(pair));
  };
  await extShot(`pages/editor/index.html?v=${VIDEO}`, '04-editor', { width: 1440, height: 732, before: toCue12 });
  // ولإطار المتاجر (لوحة 18، tools/store-art): المحرّر بمقاس منطقة الواجهة نفسها في 1280×800 و1280×960، فلا مطّ ولا قص.
  await extShot(`pages/editor/index.html?v=${VIDEO}`, '09-editor-800', { width: 1136, height: 608, before: toCue12 });
  await extShot(`pages/editor/index.html?v=${VIDEO}`, '09-editor-960', { width: 1136, height: 688, before: toCue12 });
  await extShot(`pages/library/index.html#v=${VIDEO}`, '05-library', { width: 1440, height: 732, before: expandRow });
  await extShot('pages/settings/index.html#display', '06-settings', { width: 1440, height: 732 });

  const extErrors = s.errors().flatMap((e) => e.errors);
  check('no-extension-errors', extErrors.length === 0, extErrors.slice(0, 5));
} catch (err) {
  check('run-completed', false, { error: err.message });
} finally {
  if (s) await s.close().catch(() => {});
}

const pass = result.checks.filter((c) => c.ok).length;
result.summary = `${pass}/${result.checks.length}`;
await writeFile(path.join(OUT, 'shots.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\nChrome (${result.browser}): ${result.summary} — الصور الخام في ${RAW}`);
process.exit(pass === result.checks.length ? 0 : 1);
