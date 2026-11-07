#!/usr/bin/env node
// الاختبار الحي للهوية الرابعة «كتابٌ مفتوح» (docs/identity-v4.md) والوضع العادي الكامل (docs/product-spec.md §٦.٦) على
// بناء التطوير، في ملف تعريف اختبار جديد خاص بهذه الجولة، بلا نافذة ومكتوم الصوت وبحساب غير
// مسجَّل. الهوية: الشعار والعاج بالوضعين، وأيقونة الإضافة، والأزرار بلا إطار والمختار صنوبرًا والقسم الحالي صبغته كما يحسبها المتصفح في الصفحات
// وداخل جذور الظل المغلقة للّوحة والشريط وقوائمه (CDP: DOM المخترق وCSS.getComputedStyleForNode، دون مساس بالمنتج). ويغطي:
//   المحفوظات: صورة الفيديو بالمعرّف الحقيقي (تُحمَّل بعرض 320) والبلاطة البديلة للمعرّف غير الموجود، والمدة الحقيقية، والطلب
//   الخارجي الوحيد (i.ytimg.com بلا مُحيل)، وشرائح الخانات وشريحة الرفع، والتوسيع في الصف؛ ومفتاح «صور الفيديو» يوقف الطلبات.
//   الإعدادات ونافذة الأيقونة: المفتاحان، ونص الخصوصية، وصف «زر النص المتزامن مخفي · إظهاره» يعيد الزر في يوتيوب.
//   يوتيوب: اللوحة مغلقة افتراضيًا (لا شيء في الصفحة) وزرها في الشريط يفتحها، ومضيفها أول عمود يوتيوب الثانوي بعرض لا يتجاوز
//   402 وموضعه من الفيديو بلا تداخل، والإغلاق والإخفاء والتراجع، وعدد الصفوف،
//   والمقطع الحالي بالإزاحة، والضغط للانتقال، وإيقاف المتابعة بالتمرير والعودة، والإزاحة المشتركة بين اللوحة والشريط،
//   والأصل مع الترجمة باسم لغته، والتنقل داخل الموقع والرجوع، والعرض الضيق، ووضع المسرح، وملء الشاشة؛ وأيقونات الشريط بلا
//   كلمات والتلميح بالتحويم والتركيز وعنوانا القائمتين؛ ولقطات بالوضعين. كل فعل نقرة أو عجلة أو مفتاح حقيقي (Input).
// لا رابط ولا نص مقاطع في الأدلة؛ والتوقف عند تحدّي البوت دون تحايل.
//   command npm run build:dev -- --out <مجلد خارج المستودع>
//   command node test/live/identity/run.mjs --browser brave|chrome --ext <مجلد> [--out docs/evidence/identity-v4] [--headed]
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, human, sleep } from '../harness/browser.mjs';
import { collectErrors, emulateScheme, fullScreenshot, openTab } from '../harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { SEED_IDS, buildSeedFew, storageItems } from '../ui/seed.mjs';
import { THUMB_BASE, THUMB_FILE, formatDuration } from '../../../src/pages/library/thumb.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { clockLabel } from '../../../src/player/panel/text.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/identity-v4'), browser);
const HEADED = argv.includes('--headed');
const VIDEO = SEED_IDS.ted;
const PROFILE = `${browser}-identity-${Date.now()}`;
const rel = (f) => path.relative(ROOT, f);

const result = { browser: null, at: new Date().toISOString(), headless: !HEADED, checks: [], measures: {}, screenshots: [], notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
};
/** ما تعذّر قياسه لسبب خارج المنتج: لا يُحسب نجاحًا ولا سقوطًا، ويُذكر سببه في الأدلة. */
const skip = (id, reason) => {
  result.checks.push({ id, ok: null, detail: { skipped: reason } });
  console.log(`− ${id} — لم يُقَس: ${reason}`);
};
const note = (t) => { result.notes.push(t); console.log(`· ${t}`); };

const errors = [];
/** أخطاء الشبكة في سجل صفحات الإضافة بعناوينها: 404 صورة الفيديو لمعرّف غير موجود متوقعة (يعيد يوتيوب البديلة الرمادية). */
const netLogs = [];
const MISSING_THUMB = new RegExp(`^${THUMB_BASE.replace(/[.]/g, '\\.')}(${SEED_IDS.typo}|${SEED_IDS.untitled})/${THUMB_FILE.replace('.', '\\.')}$`);
let b = null;
let extId = null;

// ---- صفحات الإضافة ----
/** كل طلب خارجي من صفحة إضافة: المضيف والعنوان (بلا استعلام) ورأس المُحيل إن وُجد. */
function watchNetwork(page) {
  const net = { list: [] };
  page.on('Network.requestWillBeSent', (p) => {
    const u = p.request.url;
    if (/^(chrome-extension|data|blob|about):/.test(u)) return;
    let host = '?';
    try { host = new URL(u).host; } catch { /* عنوان غير صالح */ }
    net.list.push({ host, path: u.split('?')[0], referer: p.request.headers?.Referer ?? p.request.headers?.referer ?? null });
  });
  return net;
}
async function openExt(restPath) {
  const page = await openTab(b.conn, 'about:blank');
  errors.push({ page: restPath.split(/[?#]/)[0], ...collectErrors(page, { extId }) });
  page.net = watchNetwork(page);
  page.on('Log.entryAdded', ({ entry }) => {
    if (entry.level === 'error' && entry.source === 'network') netLogs.push({ url: String(entry.url ?? '').split('?')[0], text: entry.text.slice(0, 80) });
  });
  await page.send('Network.enable');
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.goto(`chrome-extension://${extId}/${restPath}`);
  return page;
}
const front = (page) => b.conn.send('Target.activateTarget', { targetId: page.targetId });
async function shoot(page, name, { width = 1440, schemes = ['light', 'dark'] } = {}) {
  await front(page);
  for (const scheme of schemes) {
    await emulateScheme(page, scheme);
    await sleep(350);
    result.screenshots.push(rel(await fullScreenshot(page, path.join(OUT, `${name}-${scheme}.png`), { width })));
  }
  await emulateScheme(page, 'light');
}
async function snap(page, name) {
  await front(page);
  result.screenshots.push(rel(await page.screenshot(path.join(OUT, `${name}.png`))));
}
async function clickSel(page, selector) {
  const c = await page.centerOf(selector);
  if (!c) throw new Error(`عنصر غير موجود أو غير مرئي: ${selector}`);
  await page.click(c.x, c.y);
  await human(250, 500);
}
const prefsIn = (page) => page.eval(async () => (await chrome.storage.local.get('prefs')).prefs?.ui ?? null);

// ---- يوتيوب ----
let yt = null;
let isoId = null;
const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
const main = (fn, ...args) => yt.eval(fn, { args });
const P = {
  peek: (o) => globalThis.__tarjuman.mounted.panel.peek(o ?? { boxes: true }),
  diag: () => globalThis.__tarjuman.mounted.panel.diagnostics(),
  bar: () => globalThis.__tarjuman.mounted.controls.peek(),
  state: () => {
    const s = globalThis.__tarjuman.controller.getState();
    return {
      videoId: s.videoId, loading: s.loading, offset: s.view?.displayOffsetMs ?? null, step: s.settings?.offsetStepMs ?? null,
      arabic: s.arabic?.cues?.length ?? 0, english: s.english ? { lang: s.english.lang, kind: s.english.kind, n: s.english.cues.length, source: s.english.source } : null,
      ui: s.prefs?.ui ?? null,
    };
  },
  /** مقاطع العربية بأزمنتها (للحساب في Node؛ لا تُكتب في الأدلة). */
  cues: () => globalThis.__tarjuman.controller.getState().arabic?.cues.map((c) => [c.startMs, c.endMs]) ?? [],
  prefs: async () => (await globalThis.__tarjuman.store.getPrefs())?.ui ?? null,
};
const M = {
  video: () => {
    const v = document.querySelector('#movie_player video');
    return v ? { t: +v.currentTime.toFixed(3), paused: v.paused, duration: v.duration } : null;
  },
  seek: (t) => { const v = document.querySelector('#movie_player video'); v.pause(); v.currentTime = t; return true; },
  geo: () => {
    const r = (e) => { if (!e) return null; const x = e.getBoundingClientRect(); return { top: Math.round(x.top), bottom: Math.round(x.bottom), left: Math.round(x.left), right: Math.round(x.right), width: Math.round(x.width), height: Math.round(x.height) }; };
    const host = document.querySelector('#tarjuman-panel');
    const column = document.querySelector('ytd-watch-flexy #secondary-inner') ?? document.querySelector('ytd-watch-flexy #secondary');
    return {
      dir: [document.documentElement.dir, document.body?.dir, document.querySelector('ytd-app')?.getAttribute('dir'), getComputedStyle(document.querySelector('#columns') ?? document.documentElement).direction].includes('rtl') ? 'rtl' : 'ltr',
      lang: document.documentElement.lang,
      dark: document.documentElement.hasAttribute('dark'),
      theater: !!document.querySelector('ytd-watch-flexy')?.hasAttribute('theater'),
      fs: !!document.fullscreenElement,
      hosts: document.querySelectorAll('#tarjuman-panel').length,
      firstInColumn: !!host && !!column && column.firstElementChild === host,
      columnId: column?.id ?? null,
      player: r(document.querySelector('#movie_player')),
      host: r(host),
      title: r(document.querySelector('ytd-watch-flexy ytd-watch-metadata')),
      viewport: { w: innerWidth, h: innerHeight },
      scrollX: Math.round(scrollX),
      docWidth: document.documentElement.scrollWidth,
    };
  },
  rectOf: (sel) => { const e = document.querySelector(sel); if (!e) return null; const x = e.getBoundingClientRect(); return { x: Math.round(x.left + x.width / 2), y: Math.round(x.top + x.height / 2) }; },
};
/**
 * إعلان يوتيوب (Chrome لا يحجبه): يُترك يعمل مكتومًا حتى ينتهي، ويُضغط «تخطٍّ» بنقرة حقيقية إن ظهر. اللوحة لا تحدّث الحالي
 * ولا تقفز أثناء الإعلان (isAdShowing)، فالفحوص الزمنية بعده. يعيد عدد الإعلانات التي انتظرها.
 */
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
  result.measures.adsWaited = (result.measures.adsWaited ?? 0) + 1;
  await sleep(1500);
  await main(() => { const v = document.querySelector('#movie_player video'); if (v) { v.muted = true; v.pause(); } return true; });
  return 1;
}
const center = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
const overlaps = (a, c) => !!a && !!c && a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1;
async function clickBox(box, what) {
  if (!box) throw new Error(`لا موضع لـ${what} (مخفي أو غير موجود)`);
  const c = center(box);
  await yt.click(c.x, c.y);
  await human(300, 550);
}
const peek = (rows) => iso(P.peek, { boxes: true, rows: rows ?? [] });
async function waitPeek(pred, ms = 6000, rows) {
  const end = Date.now() + ms;
  let p = null;
  while (Date.now() < end) {
    p = await peek(rows);
    if (p && pred(p)) return p;
    await sleep(200);
  }
  return p;
}
/** المقطع الحالي كما يجب أن يكون: بداية المقطع + الإزاحة ≤ الزمن < نهايته + الإزاحة (آخر مطابق عند التداخل). */
function expectedRow(cues, tMs, off) {
  let found = -1;
  cues.forEach(([s, e], i) => { if (s + off <= tMs && tMs < e + off) found = i; });
  return found;
}
/** ثانية القيمة كما يكتبها الشريط واللوحة (+0.5، −1.0، 0.0). */
const fmtOff = (ms) => (Math.abs(ms) < 50 ? '0.0' : `${ms > 0 ? '+' : '−'}${(Math.abs(ms) / 1000).toFixed(1)}`);
const hasOff = (text, ms) => String(text ?? '').replace(/[⁦⁧⁨⁩]/g, '').includes(fmtOff(ms));

/** أزرار الشريط داخل جذره المغلق عبر DOM المخترق: النصوص المرئية وأيقوناتها وأي «نقطة». */
async function barDom() {
  await yt.send('DOM.enable');
  const { root } = await yt.send('DOM.getDocument', { depth: -1, pierce: true });
  const attrs = (n) => Object.fromEntries((n.attributes ?? []).reduce((acc, v, i, arr) => (i % 2 ? acc : [...acc, [v, arr[i + 1]]]), []));
  let host = null;
  (function find(n) {
    if (host) return;
    if (attrs(n).id === 'tarjuman-controls') { host = n; return; }
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) find(c);
  })(root);
  if (!host) return null;
  const buttons = [];
  let dots = 0;
  (function walk(n) {
    const a = attrs(n);
    if (/\bdot\b/.test(a.class ?? '')) dots++;
    if (n.nodeName === 'BUTTON') {
      const texts = [];
      let svgs = 0;
      (function inner(m) {
        if (m.nodeType === 3 && m.nodeValue.trim()) texts.push(m.nodeValue.trim());
        if (m.nodeName === 'svg') svgs++;
        for (const c of [...(m.children ?? []), ...(m.shadowRoots ?? [])]) inner(c);
      })(n);
      buttons.push({ nodeId: n.nodeId, label: a['aria-label'] ?? null, texts, svgs });
    }
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) walk(c);
  })(host);
  return { buttons, dots };
}
/** الألوان المحسوبة لأول عنصر يطابق المحدد داخل جذر الظل المغلق لمضيف بمعرّفه (اللوحة أو الشريط أو طبقة القوائم). */
async function shadowStyle(hostId, selector) {
  await yt.send('DOM.enable');
  await yt.send('CSS.enable');
  const { root } = await yt.send('DOM.getDocument', { depth: -1, pierce: true });
  const attrs = (n) => Object.fromEntries((n.attributes ?? []).reduce((acc, v, i, arr) => (i % 2 ? acc : [...acc, [v, arr[i + 1]]]), []));
  let host = null;
  (function find(n) {
    if (host) return;
    if (attrs(n).id === hostId) { host = n; return; }
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) find(c);
  })(root);
  const sr = host?.shadowRoots?.[0];
  if (!sr) return null;
  const { nodeId } = await yt.send('DOM.querySelector', { nodeId: sr.nodeId, selector });
  if (!nodeId) return null;
  const { computedStyle } = await yt.send('CSS.getComputedStyleForNode', { nodeId });
  const get = (k) => computedStyle.find((x) => x.name === k)?.value ?? null;
  return { bg: get('background-color'), color: get('color'), border: get('border-top-color'), fill: get('fill') };
}
/** قيم الهوية الرابعة كما يكتبها المتصفح (rgb)، من src/ui/tokens.css وplayer-tokens.js. */
const V4 = {
  light: { selected: 'rgb(30, 74, 68)', ink: 'rgb(255, 255, 255)', control: 'rgb(223, 217, 204)', brand: 'rgb(30, 74, 68)', accent: 'rgb(185, 112, 90)', section: 'rgb(230, 239, 236)', sectionInk: 'rgb(30, 74, 68)', soft: 'rgb(230, 239, 236)', text: 'rgb(24, 46, 43)', bg: 'rgb(243, 239, 230)', glyph: 'rgb(30, 74, 68)' },
  dark: { selected: 'rgb(237, 233, 224)', ink: 'rgb(15, 25, 23)', control: 'rgb(38, 52, 49)', brand: 'rgb(237, 233, 224)', accent: 'rgb(217, 147, 123)', section: 'rgb(31, 47, 43)', sectionInk: 'rgb(207, 224, 218)', soft: 'rgb(31, 47, 43)', text: 'rgb(237, 233, 224)', bg: 'rgb(15, 25, 23)', glyph: 'rgb(237, 233, 224)' },
  player: { selected: 'rgba(217, 147, 123, 0.18)', selectedInk: 'rgb(217, 147, 123)', accent: 'rgb(217, 147, 123)', accentInk: 'rgb(15, 25, 23)' },
};
const NONE = 'rgba(0, 0, 0, 0)';
const barMenu = async () => (await iso(P.bar))?.layer.menu ?? null;
async function closeBarMenus() {
  if (await barMenu()) {
    await yt.key('Escape', 'Escape', 27);
    await sleep(300);
  }
}
/**
 * نافذة ترويج يوتيوب Premium (للحساب غير المسجَّل) تظهر فوق طرف المشغّل وتغطي أزراره (ثبت في Chrome: تحت مركز «تحميل الأصل»).
 * تُغلق بزر رفضها بنقرة حقيقية كما يفعل المستخدم؛ وتُعدّ في measures.promosDismissed.
 */
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
  result.measures.promosDismissed = (result.measures.promosDismissed ?? 0) + 1;
  return true;
}
/** لماذا لم يصل المؤشر إلى زر في الشريط: ما تحت النقطة، ومقاس الشريط ومساحته قبل وبعد، وحال الإعلان. */
async function barWhy(pt, before, after) {
  const stack = await main((x, y) => document.elementsFromPoint(x, y).slice(0, 5).map((e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${String(e.className).split(' ')[0]}`), pt.x, pt.y);
  const ad = await main(() => document.querySelector('#movie_player')?.classList.contains('ad-showing') ?? null);
  return { stack, ad, fit: [before?.fit, after?.fit], room: [before?.room, after?.room], hidden: (await main(() => document.querySelector('#movie_player')?.classList.contains('ytp-autohide'))) };
}
async function clickBar(kind) {
  await revealControls(yt);
  const p = await iso(P.bar);
  await yt.click(center(p.buttons[kind].box).x, center(p.buttons[kind].box).y);
  await sleep(500);
}

async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    check(`${name}: اكتمل`, false, { error: err.message.slice(0, 300) });
    if (yt) await closeBarMenus().catch(() => {});
  }
}

try {
  await mkdir(OUT, { recursive: true });
  b = await launch({ browser, profile: PROFILE, headless: !HEADED });
  result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  extId = ext.id;
  const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
  result.extension = { version: manifest.version, versionName: manifest.version_name ?? null, permissions: manifest.permissions ?? [], hostPermissions: manifest.host_permissions ?? [] };
  console.log(`المتصفح: ${result.browser} · الإضافة ${manifest.version_name ?? manifest.version}`);
  const seed = buildSeedFew(Date.now()).items;
  const DUR = Object.fromEntries(seed.map((i) => [i.record.videoId, i.record.durationMs ?? null]));

  // ===== ١. المحفوظات: الصور والمدة والطلب الخارجي الوحيد والشرائح والتوسيع =====
  const lib = await openExt('pages/library/index.html');
  await lib.eval((obj) => chrome.storage.local.set(obj), { args: [storageItems(seed)] });
  lib.net.list.length = 0;
  await lib.reload();
  await step('library', async () => {
    await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 4, { timeoutMs: 10000 });
    await lib.waitFor(() => [...document.querySelectorAll('.lib-thumb')].every((t) => t.dataset.state === 'fallback' || t.querySelector('img')?.complete), { timeoutMs: 15000 });
    await sleep(800);
    const rows = await lib.eval(() => [...document.querySelectorAll('li.lib-row')].map((li) => {
      const t = li.querySelector('.lib-thumb');
      const img = t?.querySelector('img');
      return {
        id: li.dataset.video, state: t?.dataset.state ?? null, src: img?.getAttribute('src') ?? null, w: img?.naturalWidth ?? null,
        policy: img?.getAttribute('referrerpolicy') ?? null, fallbackIcon: !!t?.querySelector('.lib-thumb__fallback svg'),
        dur: t?.querySelector('.lib-thumb__dur')?.textContent.replace('المدة ', '').replace(/[⁦⁧⁨⁩]/g, '').trim() ?? null,
        chips: [...li.querySelectorAll('.lib-chip')].map((c) => ({ slot: c.dataset.slot, add: c.classList.contains('lib-chip--add'), active: c.getAttribute('aria-pressed') === 'true', text: c.textContent.trim() })),
        none: li.querySelector('.lib-trs--none')?.textContent.trim() ?? null,
      };
    }));
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    check('library-four-rows', rows.length === 4, rows.map((r) => r.id));
    const real = [SEED_IDS.ted, SEED_IDS.asr].map((id) => by[id]);
    check('library-thumbnail-real-video-id', real.every((r, i) => r && r.state === 'image' && r.src === `${THUMB_BASE}${[SEED_IDS.ted, SEED_IDS.asr][i]}/${THUMB_FILE}` && r.w >= 320 && r.policy === 'no-referrer'), real.map((r) => r && { state: r.state, w: r.w, policy: r.policy, exact: r.src === `${THUMB_BASE}${r.id}/${THUMB_FILE}` }));
    const fake = [SEED_IDS.typo, SEED_IDS.untitled].map((id) => by[id]);
    check('library-thumbnail-fallback-for-missing-video', fake.every((r) => r && r.state === 'fallback' && !r.src && r.fallbackIcon), fake.map((r) => r && { state: r.state, icon: r.fallbackIcon }));
    check('library-duration-is-real', rows.every((r) => r.dur === formatDuration(DUR[r.id])), rows.map((r) => ({ id: r.id, shown: r.dur, expected: formatDuration(DUR[r.id]) })));
    const hosts = [...new Set(lib.net.list.map((x) => x.host))];
    const exact = lib.net.list.every((x) => /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/.test(x.path));
    check('library-only-external-request-is-ytimg-thumbnail', hosts.join() === 'i.ytimg.com' && exact && lib.net.list.length === 4 && lib.net.list.every((x) => !x.referer), { hosts, requests: lib.net.list.length, exact, referers: lib.net.list.filter((x) => x.referer).length });
    const ted = by[SEED_IDS.ted];
    check('library-chips-real-slot-and-add-action', ted.chips.length === 2 && ted.chips[0].active && !ted.chips[0].add && ted.chips[1].add && ted.chips[1].slot === '2' && /فارغة/.test(ted.chips[1].text), ted.chips);
    check('library-no-translation-state-is-clear', !!by[SEED_IDS.asr].none && by[SEED_IDS.asr].chips.length === 0, { none: by[SEED_IDS.asr].none });
    await shoot(lib, 'library', { width: 1280 });

    // الهوية كما يحسبها المتصفح بالوضعين: الشعار (رمز «كتابٌ مفتوح» بالمصحّح تحت 32 بلون الصنوبر أو العاج، والاسم نصًّا بـCairo
    // 800 بلون الحبر) والعاج؛ ثم الأزرار بلا إطار والتحديد: الشريحة النشطة ورقيقة الفرز المضغوطة صنوبرًا بنص عاج، والثانوي بخلفية
    // الزر، والرئيسي صنوبر، والصفحة الحالية في الشريط العلوي صبغة صنوبرية بنصها.
    const identityOf = () => lib.eval(() => {
      const root = document.querySelector('.tj-topbar__brand .tj-logo');
      const svg = root?.querySelector('svg.tj-logo__mark');
      const word = root?.querySelector('.tj-logo__word');
      const cs = (sel, pseudo) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e, pseudo); return { bg: c.backgroundColor, color: c.color, border: c.borderTopColor }; };
      return {
        viewBox: svg?.getAttribute('viewBox') ?? null, paths: svg ? svg.querySelectorAll('path').length : 0,
        book: svg?.querySelector('.tj-logo__book')?.getAttribute('d')?.slice(0, 9) ?? null,
        glyph: svg ? getComputedStyle(svg.querySelector('.tj-logo__book')).fill : null, dots: svg ? getComputedStyle(svg.querySelector('.tj-logo__dots')).fill : null,
        word: word?.textContent ?? null, wordColor: word ? getComputedStyle(word).color : null, wordWeight: word ? getComputedStyle(word).fontWeight : null, wordFont: word ? getComputedStyle(word).fontFamily : null,
        ink: getComputedStyle(document.body).color, bg: getComputedStyle(document.body).backgroundColor, badge: document.querySelector('.tj-topbar__end')?.textContent.trim() ?? null,
        activeChip: cs('.lib-chip--active'), pressedFilter: cs('.tj-chip[aria-pressed="true"]'), secondary: cs('.tj-btn--secondary'), primary: cs('.tj-btn--primary'),
        current: cs('.tj-topbar__link[aria-current="page"]'),
      };
    });
    for (const scheme of ['light', 'dark']) {
      await emulateScheme(lib, scheme);
      await sleep(300);
      const got = await identityOf();
      const v = V4[scheme];
      check(`identity-v4-logo-and-ivory-${scheme}`, got.viewBox === '0 0 200 176.4' && got.paths === 3 && got.book === 'M0 123.6H' && got.glyph === v.glyph && got.dots === v.glyph
        && got.word === 'ترجمان' && got.wordColor === v.text && got.wordWeight === '800' && /Tarjuman UI Cairo/.test(got.wordFont ?? '') && got.ink === v.text && got.bg === v.bg, got);
      if (scheme === 'light') check('identity-badge-truthful', got.badge === 'بياناتك على جهازك', { badge: got.badge });
      check(`identity-v4-library-borderless-selection-${scheme}`,
        got.activeChip?.bg === v.selected && got.activeChip?.color === v.ink && got.activeChip?.border === NONE
        && got.pressedFilter?.bg === v.selected && got.pressedFilter?.color === v.ink && got.pressedFilter?.border === NONE
        && got.secondary?.bg === v.control && got.secondary?.border === NONE && got.primary?.bg === v.brand
        && got.current?.bg === v.section && got.current?.color === v.sectionInk,
        { activeChip: got.activeChip, pressedFilter: got.pressedFilter, secondary: got.secondary, primary: got.primary, current: got.current });
    }
    await emulateScheme(lib, 'light');

    // الشريحة المتقطّعة إجراء رفع حقيقي: تفتح منتقي الملفات فيُختار ملف عربي حقيقي، ويُحفظ في الخانة 2 من حوار الرفع.
    const tedRec = seed.find((i) => i.record.videoId === SEED_IDS.ted).record;
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-identity-files-'));
    const second = path.join(dir, `${SEED_IDS.ted}.ar.srt`);
    await writeFile(second, writeSrt(tedRec.arabic.current.map((c) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: `نسخة ثانية — المقطع ${c.n}` }))));
    await lib.send('DOM.enable');
    await lib.send('Page.setInterceptFileChooserDialog', { enabled: true });
    let chooser = 0;
    lib.on('Page.fileChooserOpened', async ({ backendNodeId }) => {
      chooser++;
      try {
        await lib.send('DOM.setFileInputFiles', { files: [second], backendNodeId });
      } catch (err) {
        note(`منتقي الملفات: ${err.message.slice(0, 100)}`);
      }
    });
    await clickSel(lib, `li.lib-row[data-video="${SEED_IDS.ted}"] .lib-chip--add`);
    await lib.waitFor(() => !!document.querySelector('dialog[open] button[value="confirm"]'), { timeoutMs: 8000 });
    const dlg = await lib.eval(() => ({ title: document.querySelector('dialog[open] h2, dialog[open] .tj-dialog__title')?.textContent.trim() ?? null, confirm: document.querySelector('dialog[open] button[value="confirm"]')?.textContent.trim() ?? null }));
    await shoot(lib, 'library-upload-dialog', { width: 1280, schemes: ['light'] });
    await clickSel(lib, 'dialog[open] button[value="confirm"]');
    const chips2 = await lib.waitFor((id) => {
      const cs = [...document.querySelectorAll(`li.lib-row[data-video="${id}"] .lib-chips button`)];
      return cs.length === 2 ? cs.map((c) => ({ slot: c.dataset.slot, pressed: c.getAttribute('aria-pressed') })) : null;
    }, { args: [SEED_IDS.ted], timeoutMs: 8000 });
    // المرفوعة تصير النشطة (كالرفع من الشريط).
    check('library-add-chip-uploads-real-file-into-empty-slot', chooser === 1 && !!chips2 && chips2[1].slot === '2' && chips2[1].pressed === 'true' && dlg.confirm === 'حفظ', { chooser, dialog: dlg, chips: chips2 });
    await lib.send('Page.setInterceptFileChooserDialog', { enabled: false });
    // تفعيل الترجمة 1 من شريحتها برسالة «تراجع»، والتراجع يعيد النشطة السابقة (2)، ثم تُفعَّل 1 ثانيةً (إزاحتها +0.5 لبقية الاختبار).
    const chipOn = (n) => lib.waitFor((id, k) => document.querySelector(`li.lib-row[data-video="${id}"] .lib-chips button[data-slot="${k}"]`)?.getAttribute('aria-pressed') === 'true', { args: [SEED_IDS.ted, String(n)], timeoutMs: 6000 });
    await clickSel(lib, `li.lib-row[data-video="${SEED_IDS.ted}"] .lib-chips button[data-slot="1"]`);
    const act = await chipOn(1);
    // رسالة التفعيل نفسها (لا رسالة الرفع السابقة): الأحدث التي تذكر «الترجمة 1» وفيها «تراجع».
    const toastText = await lib.waitFor(() => {
      const t = [...document.querySelectorAll('.tj-toast--success')].reverse().find((x) => /الترجمة 1/.test(x.textContent) && [...x.querySelectorAll('button')].some((b) => b.textContent.trim() === 'تراجع'));
      if (!t) return null;
      [...t.querySelectorAll('button')].find((b) => b.textContent.trim() === 'تراجع').setAttribute('data-live-undo', '1');
      return t.textContent.trim();
    }, { timeoutMs: 5000 });
    await clickSel(lib, '[data-live-undo]');
    const back = await chipOn(2);
    check('library-chip-activates-translation-with-undo', !!act && /الترجمة 1/.test(toastText ?? '') && !!back, { activated: !!act, toast: toastText, undone: !!back });
    await sleep(600);
    await clickSel(lib, `li.lib-row[data-video="${SEED_IDS.ted}"] .lib-chips button[data-slot="1"]`);
    if (!(await chipOn(1))) throw new Error('لم تعد الترجمة 1 النشطة');
    await sleep(800);

    await clickSel(lib, `li.lib-row[data-video="${SEED_IDS.ted}"] .lib-toggle`);
    await lib.waitFor(() => document.querySelectorAll('.lib-card').length > 0, { timeoutMs: 5000 });
    const cards = await lib.eval(() => [...document.querySelectorAll('.lib-card')].map((c) => ({ slot: c.dataset.slot, empty: c.classList.contains('lib-card--empty'), active: c.classList.contains('lib-card--active'), actions: [...c.querySelectorAll('button')].map((x) => x.textContent.trim() || x.getAttribute('aria-label')).filter(Boolean).slice(0, 8) })));
    check('library-expansion-one-card-per-translation-plus-one-empty', cards.length === 3 && !cards[0].empty && cards[0].active && !cards[1].empty && cards[1].slot === '2' && cards[2].empty && cards[2].slot === '3', cards);
    const cardStyle = await lib.eval(() => {
      const cs = (sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return { bg: c.backgroundColor, border: c.borderTopColor }; };
      return { active: cs('.lib-card--active'), empty: cs('.lib-card--empty'), toggle: cs('.lib-toggle[aria-expanded="true"]') };
    });
    check('identity-v4-library-active-card-soft-empty-card-control', cardStyle.active?.bg === V4.light.soft && cardStyle.active?.border === V4.light.selected && cardStyle.empty?.bg === V4.light.control && cardStyle.empty?.border === NONE && cardStyle.toggle?.bg === V4.light.soft, cardStyle);
    await shoot(lib, 'library-expanded', { width: 1280 });
  });

  // ===== ٢. الإعدادات: المفتاحان ونص الخصوصية، و«صور الفيديو» يوقف الطلبات =====
  await step('settings-thumbnails-switch', async () => {
    const st = await openExt('pages/settings/index.html#display');
    await st.waitFor(() => !!document.querySelector('input[data-pref="ui.thumbnails"]'), { timeoutMs: 10000 });
    const sw = await st.eval(() => Object.fromEntries(['panelEntry', 'thumbnails'].map((k) => [k, document.querySelector(`input[data-pref="ui.${k}"]`)?.checked ?? null])));
    check('settings-ui-switches-on-by-default', sw.panelEntry === true && sw.thumbnails === true, sw);
    // التحديد بدرجتين: القسم الحالي في التنقّل صبغة صنوبرية أهدأ من الإعداد المختار داخله (بطاقة الخط والمقطّعة صنوبرًا)، والكل بلا إطار.
    for (const scheme of ['light', 'dark']) {
      await emulateScheme(st, scheme);
      await sleep(300);
      const sel = await st.eval(() => {
        const cs = (q) => { const e = document.querySelector(q); if (!e) return null; const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, border: c.borderTopColor, shadow: c.boxShadow }; };
        return { section: cs('.st-nav__link[aria-current="page"]'), font: cs('.st-font:has(input:checked)'), seg: cs('.tj-seg__option input:checked + .tj-seg__label'), segTrack: cs('.tj-seg') };
      });
      const v = V4[scheme];
      check(`identity-v4-settings-section-calmer-than-selected-${scheme}`,
        sel.section?.bg === v.section && sel.section?.color === v.sectionInk && sel.section?.shadow === 'none'
        && sel.font?.bg === v.selected && sel.font?.color === v.ink && sel.font?.border === NONE
        && sel.seg?.bg === v.selected && sel.seg?.color === v.ink && sel.segTrack?.border === NONE, sel);
    }
    await emulateScheme(st, 'light');
    await shoot(st, 'settings-display', { width: 1280 });
    await clickSel(st, 'label[for="st-ui-thumbnails"]');
    await sleep(600);
    const ui = await prefsIn(st);
    check('settings-thumbnails-off-saved', ui?.thumbnails === false, ui);
    // المحفوظات المفتوحة تتبع التفضيل دون إعادة تحميل، ثم بعد إعادة التحميل لا طلب خارجي أصلًا.
    await lib.waitFor(() => [...document.querySelectorAll('.lib-thumb')].every((t) => t.dataset.state === 'fallback'), { timeoutMs: 5000 });
    const live = await lib.eval(() => [...document.querySelectorAll('.lib-thumb')].map((t) => t.dataset.state));
    lib.net.list.length = 0;
    await lib.reload();
    await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 4, { timeoutMs: 10000 });
    await sleep(1500);
    const after = await lib.eval(() => ({ states: [...document.querySelectorAll('.lib-thumb')].map((t) => t.dataset.state), imgs: document.querySelectorAll('.lib-thumb img').length }));
    check('library-thumbnails-off-no-requests-fallback-only', live.every((s) => s === 'fallback') && after.states.every((s) => s === 'fallback') && after.imgs === 0 && lib.net.list.length === 0, { live, after, requests: lib.net.list.length });
    await clickSel(st, 'label[for="st-ui-thumbnails"]');
    await sleep(600);
    check('settings-thumbnails-back-on', (await prefsIn(st))?.thumbnails === true);
    await st.goto(`chrome-extension://${extId}/pages/settings/index.html#about`);
    await st.waitFor(() => document.body.innerText.includes('خوادم يوتيوب'), { timeoutMs: 8000 });
    // سطر الخصوصية بعد قناة البلاغات (جولة النشر T2.1): الصور ما دام مفتاحها مفعّلًا، والبلاغ يرسله المستخدم بنفسه.
    const about = await st.eval(() => ({ privacy: [...document.querySelectorAll('p')].some((p) => /بياناتك كلها على جهازك/.test(p.textContent) && /صور الفيديو في المحفوظات من خوادم يوتيوب/.test(p.textContent) && /وبلاغ ترسله أنت بنفسك/.test(p.textContent)) }));
    check('settings-privacy-line-matches-behavior', about.privacy, about);
    result.measures.permissions = { permissions: result.extension.permissions, hostPermissions: result.extension.hostPermissions };
    await st.close();
  });

  // ===== المحرّر: الهوية، والحالة الفارغة و«فتح الفيديو» بلا قفز زمني =====
  await step('editor', async () => {
    const ed = await openExt(`pages/editor/index.html?v=${SEED_IDS.ted}`);
    await emulateScheme(ed, 'light');
    await ed.waitFor(() => !!document.querySelector('.ed-app') && !document.querySelector('[aria-busy="true"]'), { timeoutMs: 12000 });
    await sleep(800);
    const info = await ed.eval(() => {
      const cs = (q) => { const e = document.querySelector(q); if (!e) return null; const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, border: c.borderTopColor }; };
      return { title: !!document.querySelector('h1.ed-title'), bg: getComputedStyle(document.body).backgroundColor, empty: !!document.querySelector('.tj-empty'), seg: cs('.ed-seg__opt[aria-checked="true"]'), track: cs('.ed-seg'), tab: cs('.ed-tab[aria-selected="true"]') && getComputedStyle(document.querySelector('.ed-tab[aria-selected="true"]'), '::after').backgroundColor };
    });
    check('editor-opens-saved-translation-with-identity', info.title && !info.empty && info.bg === V4.light.bg, info);
    check('identity-v4-editor-seg-selected-borderless-tab-mark', info.seg?.bg === V4.light.selected && info.seg?.color === V4.light.ink && info.track?.border === NONE && info.tab === V4.light.accent, { seg: info.seg, track: info.track, tab: info.tab });
    await shoot(ed, 'editor', { width: 1280 });
    await ed.goto(`chrome-extension://${extId}/pages/editor/index.html?v=${SEED_IDS.asr}`);
    await ed.waitFor(() => !!document.querySelector('.tj-empty'), { timeoutMs: 10000 });
    const emptyBtns = await ed.eval(() => [...document.querySelectorAll('.tj-empty button')].map((x) => x.textContent.trim()));
    const ytTabs = async () => (await b.conn.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page' && t.url.startsWith('https://www.youtube.com/watch') && t.url.includes(`v=${SEED_IDS.asr}`));
    const before = (await ytTabs()).length;
    await ed.eval(() => { [...document.querySelectorAll('.tj-empty button')].find((x) => x.textContent.trim() === 'فتح الفيديو')?.setAttribute('data-live-open', '1'); });
    await clickSel(ed, '[data-live-open]');
    await sleep(2500);
    const opened = await ytTabs();
    const noTime = opened.every((t) => !/[?&]t=/.test(t.url));
    check('editor-empty-open-video-opens-tab-without-time', emptyBtns.includes('فتح الفيديو') && emptyBtns.includes('المحفوظات') && opened.length === before + 1 && noTime, { buttons: emptyBtns, opened: opened.length - before, noTime });
    for (const t of opened) await b.conn.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
    await shoot(ed, 'editor-empty', { width: 1280, schemes: ['light'] });
    await ed.close();
  });

  // ===== ٣. يوتيوب: اللوحة والشريط =====
  yt = await openTab(b.conn, 'about:blank');
  await yt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  errors.push({ page: 'youtube', ...collectErrors(yt, { extId, onlyExtension: true }) });
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
  const ready = await waitForPlayer(yt, VIDEO, 30000);
  if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  check('youtube-player-ready', !!ready);
  await sleep(1500);
  isoId = yt.isolatedContextId(extId);
  await yt.waitFor(() => !!document.querySelector('#tarjuman-controls') && !!document.querySelector('#tarjuman-panel'), { timeoutMs: 15000 });
  // اللوحة مغلقة افتراضيًا: يُنتظر المتحكم وترجمته (لا جاهزية اللوحة).
  await yt.waitFor(() => !globalThis.__tarjuman.controller.getState().loading && !!globalThis.__tarjuman.controller.getState().arabic, { contextId: isoId, timeoutMs: 15000 });
  await waitNoAd();
  await dismissPromo();
  await main(() => { const v = document.querySelector('#movie_player video'); v.muted = true; v.pause(); return true; });
  await sleep(600);
  const s0 = await iso(P.state);
  const CUES = await iso(P.cues);
  result.measures.video = { arabic: s0.arabic, english: s0.english, offset: s0.offset, step: s0.step };

  await step('panel-closed-by-default-and-bar-button', async () => {
    // قرار سلطان 2026-11-03: مغلقة افتراضيًا ولا شيء منها في صفحة يوتيوب، وزرها في شريط المشغّل.
    const g = await main(M.geo);
    const p = await peek();
    result.measures.geoWide = g;
    check('panel-closed-by-default-nothing-in-youtube-page', p.mode === 'none' && p.hostHidden && (!g.host || g.host.height === 0) && g.docWidth <= g.viewport.w, { mode: p.mode, host: g.host });
    await revealControls(yt);
    const bar0 = await iso(P.bar);
    check('player-bar-panel-button-shown-not-pressed', !!bar0.buttons.panel.box && bar0.buttons.panel.pressed === 'false' && bar0.buttons.panel.label === 'النص المتزامن', { panel: bar0.buttons.panel });
    await clickBar('panel');
    const o = await waitPeek((x) => x.mode === 'open' && x.kind === 'ready');
    const ui = await iso(P.prefs);
    const bar1 = await iso(P.bar);
    check('panel-opens-from-bar-button-and-saves', o.mode === 'open' && bar1.buttons.panel.pressed === 'true' && ui?.panelOpen === true, { mode: o.mode, kind: o.kind, ui, pressed: bar1.buttons.panel.pressed });
    // الهوية الرابعة داخل الجذور المغلقة: زر الشريط المضغوط بالطين الليلي (لوحة 10)، وأزرار اللوحة بلا إطار، ومقطّعتها صنوبرًا،
    // ورمز الشعار وحده رأسًا بالصنوبر.
    const pressed = await shadowStyle('tarjuman-controls', 'button[aria-pressed="true"]');
    const btn = await shadowStyle('tarjuman-panel', '.foot .b:not(.b--ghost)');
    const seg = await shadowStyle('tarjuman-panel', '.segs button[aria-checked="true"]');
    const glyph = await shadowStyle('tarjuman-panel', '.head .mark path');
    check('identity-v4-player-bar-pressed-uses-p-accent', pressed?.color === V4.player.accent, { pressed });
    check('identity-v4-panel-buttons-borderless-segs-selected-mark-light', btn?.bg === V4.light.control && btn?.border === NONE && seg?.bg === V4.light.selected && seg?.color === V4.light.ink && glyph?.fill === V4.light.glyph, { btn, seg, glyph });
    const g2 = await main(M.geo);
    result.measures.geoOpen = g2;
    check('panel-host-first-in-youtube-secondary-column', g2.hosts === 1 && g2.firstInColumn, { hosts: g2.hosts, first: g2.firstInColumn, column: g2.columnId });
    const side = g2.host && g2.player ? (g2.host.left >= g2.player.right - 4 ? 'right' : g2.host.right <= g2.player.left + 4 ? 'left' : 'below-or-overlap') : null;
    result.measures.sideWide = { side, dir: g2.dir, lang: g2.lang };
    // عرض مريح لا يأكل مساحة الفيديو (ملاحظة سلطان): عمود يوتيوب المعتاد 402 أو أضيق.
    check('panel-width-comfortable-not-wider-than-402', g2.host.width <= 402 && g2.host.width >= 300, { width: g2.host.width, fitted: o.fitted });
    check('panel-open-right-of-video-same-height-no-overlap', g2.host.left >= g2.player.right - 4 && !overlaps(g2.host, g2.player) && Math.abs(g2.host.height - g2.player.height) <= 24 && g2.docWidth <= g2.viewport.w, { host: g2.host, player: g2.player });
    check('panel-rows-equal-arabic-cues', o.rows === s0.arabic && o.rows > 0, { rows: o.rows, cues: s0.arabic });
    check('panel-status-line-real', /متزامن/.test(o.status) && o.status.includes(String(s0.arabic)), { status: o.status });
  });

  await step('panel-current-row-and-seek', async () => {
    await waitNoAd();
    const off = s0.offset ?? 0;
    const pick = CUES.findIndex(([s, e], i) => i > 8 && e - s > 900);
    const t = (CUES[pick][0] + off + 300) / 1000;
    await main(M.seek, t);
    const p = await waitPeek((x) => x.current === expectedRow(CUES, t * 1000, off), 5000);
    const exp = expectedRow(CUES, t * 1000, off);
    check('panel-current-row-follows-video-time-with-offset', p.current === exp && exp === pick, { current: p.current, expected: exp, offset: off });
    // صف لاحق ظاهر داخل القائمة: الضغط عليه ينقل الفيديو إلى بدايته + الإزاحة.
    // التمرير إلى الحالي ناعم: يُنتظر استقراره قبل قراءة مواضع الصفوف.
    await sleep(1500);
    const cand = [pick + 2, pick + 3, pick + 1, pick + 4, pick - 2];
    const q = await peek(cand);
    const target = q.boxes.rows.find((r) => r.box && q.boxes.list && r.box.top >= q.boxes.list.top && r.box.bottom <= q.boxes.list.bottom);
    if (!target) throw new Error(`لا صف ظاهر في القائمة غير الحالي: ${JSON.stringify({ list: q.boxes.list, rows: q.boxes.rows.map((r) => [r.i, r.box?.top, r.box?.bottom]), scrollTop: q.scrollTop })}`);
    await clickBox(target.time ?? target.box, 'زمن الصف');
    await sleep(700);
    const v = await main(M.video);
    const want = Math.max(0, CUES[target.i][0] + off) / 1000;
    const after = await waitPeek((x) => x.current === target.i, 4000);
    check('panel-click-row-seeks-video', Math.abs(v.t - want) < 0.25 && after.current === target.i, { t: v.t, want, current: after.current, row: target.i });
    await snap(yt, 'watch-panel-open');
  });

  await step('panel-follow-pause-and-resume', async () => {
    const p = await peek();
    const c = center(p.boxes.list);
    await yt.mouseMove(c.x, c.y);
    for (let i = 0; i < 3; i++) {
      await yt.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c.x, y: c.y, deltaX: 0, deltaY: 500 });
      await sleep(120);
    }
    const q = await waitPeek((x) => x.resume !== null, 3000);
    check('panel-user-scroll-pauses-follow-and-offers-return', q.resume !== null && q.scrollTop > p.scrollTop && !!q.boxes.resume, { resume: q.resume, scrolled: q.scrollTop - p.scrollTop });
    await snap(yt, 'watch-panel-resume');
    await clickBox(q.boxes.resume, 'العودة إلى الحالي');
    const r = await waitPeek((x) => x.resume === null, 3000, [x0(q)]);
    const cur = r.current;
    // التمرير إلى الحالي ناعم: يُنتظر استقراره (حتى ثانيتين) قبل قياس موضع الصف.
    const inside = (b) => { const box = b.boxes.rows[0]?.box; return !!box && box.top >= b.boxes.list.top - 2 && box.bottom <= b.boxes.list.bottom + 2; };
    let back = await peek([cur]);
    for (let i = 0; i < 10 && !inside(back); i++) {
      await sleep(200);
      back = await peek([cur]);
    }
    const curBox = back.boxes.rows[0]?.box;
    check('panel-return-to-current-resumes-follow', r.resume === null && !!curBox && curBox.top >= back.boxes.list.top - 2 && curBox.bottom <= back.boxes.list.bottom + 2, { resume: r.resume, current: cur, visible: !!curBox });
  });

  await step('panel-shared-offset', async () => {
    const before = (await iso(P.state)).offset;
    const step0 = (await iso(P.state)).step;
    const p = await peek([0]);
    await clickBox(p.boxes.later, 'أبطأ');
    await sleep(600);
    const s1 = await iso(P.state);
    const bar1 = await iso(P.bar);
    const p1 = await peek([0]);
    check('panel-offset-change-reaches-player-bar', s1.offset === before + step0 && hasOff(bar1.buttons.badge.text, s1.offset) && hasOff(p1.foot.value, s1.offset), { before, after: s1.offset, badge: bar1.buttons.badge.text, foot: p1.foot.value });
    check('panel-row-times-shift-with-offset', p.boxes.rows[0].label === clockLabel(CUES[0][0] + before) && p1.boxes.rows[0].label === clockLabel(CUES[0][0] + s1.offset), { before: p.boxes.rows[0].label, after: p1.boxes.rows[0].label, start: CUES[0][0], offsets: [before, s1.offset] });
    await clickBar('minus');
    await sleep(600);
    const s2 = await iso(P.state);
    const p2 = await peek();
    check('player-bar-offset-change-reaches-panel', s2.offset === before && hasOff(p2.foot.value, before), { offset: s2.offset, foot: p2.foot.value });
  });

  await step('panel-original-with-translation', async () => {
    const p = await peek();
    const dual = p.dual.find((x) => x.value !== 'ar');
    const arOnly = p.dual.find((x) => x.value === 'ar');
    result.measures.dual = p.dual.map((x) => ({ value: x.value, text: x.text, checked: x.checked, disabled: x.disabled }));
    if (!s0.english) {
      check('panel-dual-disabled-with-reason-when-no-original', dual?.disabled && !!(dual.title || dual.aria), dual);
      return;
    }
    check('panel-dual-names-real-original-language', !!dual && /الإنجليزية/.test(dual.text) && !dual.disabled, { dual, lang: s0.english.lang });
    const idx = p.dual.indexOf(dual.checked ? arOnly : dual);
    await clickBox(p.boxes.dual[idx], 'العرض');
    await sleep(700);
    const q = await peek();
    const idx2 = q.dual.findIndex((x) => x.value !== (dual.checked ? 'ar' : dual.value));
    await clickBox(q.boxes.dual[idx2], 'العرض');
    await sleep(700);
    const r = await peek();
    const withOrig = [q, r].find((x) => x.dual.find((d) => d.value !== 'ar').checked);
    const arabicOnly = [q, r].find((x) => x.dual.find((d) => d.value === 'ar').checked);
    check('panel-dual-shows-original-lines-and-hides-them', withOrig?.originals > 0 && arabicOnly?.originals === 0, { withOriginal: withOrig?.originals, arabicOnly: arabicOnly?.originals });
    const ui = await iso(P.prefs);
    check('panel-dual-choice-saved', typeof ui?.panelDual === 'boolean' && ui.panelDual === r.dual.find((d) => d.value !== 'ar').checked, ui);
    if (!r.dual.find((d) => d.value !== 'ar').checked) {
      const z = await peek();
      await clickBox(z.boxes.dual[z.dual.findIndex((d) => d.value !== 'ar')], 'مع الأصل');
      await sleep(600);
    }
    await snap(yt, 'watch-panel-dual');
  });

  await step('player-bar-icons', async () => {
    await dismissPromo();
    const dom = await barDom();
    const bar = await iso(P.bar);
    const iconBtns = dom.buttons.filter((x) => ['download', 'upload'].some((k) => x.label === bar.buttons[k].label));
    result.measures.bar = { buttons: dom.buttons.map(({ label, texts, svgs }) => ({ label, texts, svgs })), dots: dom.dots };
    check('player-bar-icons-only-no-words-no-dots', iconBtns.length === 2 && iconBtns.every((x) => x.svgs === 1 && x.texts.length === 0) && dom.dots === 0, result.measures.bar);
    const sizes = ['download', 'upload', 'minus', 'plus'].map((k) => [bar.buttons[k].box.width, bar.buttons[k].box.height]);
    check('player-bar-icon-buttons-same-size', sizes.every(([w, h]) => w === sizes[0][0] && h === sizes[0][1]), sizes);
    // المقاس يتبع المساحة الخالية في الشريط، فيُقرأ موضع الزر بعد إظهار الشريط لا قبله؛ وعند الإخفاق تُسجَّل أسبابه الممكنة.
    await revealControls(yt);
    const fresh = await iso(P.bar);
    const dl = center(fresh.buttons.download.box);
    await yt.mouseMove(dl.x, dl.y);
    await sleep(700);
    const after = await iso(P.bar);
    const hover = after.layer.tip;
    check('player-bar-tooltip-on-hover', !!hover && hover === fresh.buttons.download.tip, { tip: hover, label: fresh.buttons.download.label, ...(hover ? {} : await barWhy(dl, fresh, after)) });
    await yt.mouseMove(dl.x, dl.y - 260);
    await sleep(500);
    const up = dom.buttons.find((x) => x.label === bar.buttons.upload.label);
    await yt.send('DOM.focus', { nodeId: up.nodeId });
    await sleep(500);
    const focusTip = (await iso(P.bar)).layer.tip;
    check('player-bar-tooltip-on-focus', !!focusTip && focusTip === bar.buttons.upload.tip, { tip: focusTip, label: bar.buttons.upload.label });
    await main(() => document.activeElement?.blur?.());
    await clickBar('download');
    const m1 = await barMenu();
    const why1 = m1 ? {} : await barWhy(center((await iso(P.bar)).buttons.download.box), await iso(P.bar), null);
    await closeBarMenus();
    await clickBar('upload');
    const m2 = await barMenu();
    check('player-menu-titles', m1?.label === 'تحميل الأصل' && m2?.label === 'الترجمة', { download: m1?.label, upload: m2?.label, ...why1 });
    // قائمة «الترجمة» المفتوحة (لوحة 10): زرها المفتوح بالطين الليلي، والخانة المختارة في «حفظ في» والمقطّعة بالطين الليلي بحبر داكن،
    // والخيار المحدد في القائمة صبغة طين 18% بنص طيني، والرئيسي بالطين.
    const open = await shadowStyle('tarjuman-controls', 'button[aria-expanded="true"]');
    const slot = await shadowStyle('tarjuman-controls-layer', 'button.slot[aria-checked="true"], .seg button[aria-checked="true"]');
    const item = await shadowStyle('tarjuman-controls-layer', 'button.item[aria-checked="true"]');
    const primary = await shadowStyle('tarjuman-controls-layer', 'button.primary');
    check('identity-v4-player-menu-open-accent-and-selected', open?.color === V4.player.accent && (!slot || (slot.bg === V4.player.accent && slot.color === V4.player.accentInk))
      && (!item || (item.bg === V4.player.selected && item.color === V4.player.selectedInk)) && !!(slot || item) && (!primary || primary.bg === V4.player.accent), { open, slot, item, primary });
    await revealControls(yt);
    await snap(yt, 'watch-player-menu-translation');
    await closeBarMenus();
  });

  await step('panel-close-and-hide-entry', async () => {
    let p = await peek();
    await clickBox(p.boxes.close, 'إغلاق اللوحة');
    p = await waitPeek((x) => x.mode === 'none');
    let ui = await iso(P.prefs);
    await revealControls(yt);
    const bar = await iso(P.bar);
    check('panel-close-hides-panel-keeps-bar-button', p.mode === 'none' && p.hostHidden && !!bar.buttons.panel.box && bar.buttons.panel.pressed === 'false' && ui?.panelOpen === false && ui?.panelEntry === true, { mode: p.mode, ui, pressed: bar.buttons.panel.pressed });
    await clickBar('panel');
    p = await waitPeek((x) => x.mode === 'open');
    await clickBox(p.boxes.opts, 'خيارات اللوحة');
    p = await waitPeek((x) => x.menu === true);
    await clickBox(p.boxes.hide, 'إخفاء زر اللوحة');
    p = await waitPeek((x) => x.mode === 'toast');
    check('panel-hide-shows-undo-message', p.mode === 'toast' && !!p.toast && !!p.boxes.undo, { mode: p.mode, toast: p.toast });
    await snap(yt, 'watch-panel-hidden-toast');
    await clickBox(p.boxes.undo, 'تراجع');
    // التراجع يعيد الأمرين كما كانا قبل الإخفاء: الزر، واللوحة مفتوحة.
    p = await waitPeek((x) => x.mode === 'open');
    ui = await iso(P.prefs);
    check('panel-undo-restores-entry-and-open-panel', p.mode === 'open' && ui?.panelEntry === true && ui?.panelOpen === true, { mode: p.mode, ui });
    await clickBox(p.boxes.opts, 'خيارات اللوحة');
    p = await waitPeek((x) => x.menu === true);
    await clickBox(p.boxes.hide, 'إخفاء زر اللوحة');
    p = await waitPeek((x) => x.mode === 'none', 9000);
    ui = await iso(P.prefs);
    const g = await main(M.geo);
    await revealControls(yt);
    const barGone = await iso(P.bar);
    check('panel-hidden-entry-gone-after-message', p.mode === 'none' && p.hostHidden && ui?.panelEntry === false && (!g.host || g.host.height === 0) && !barGone.buttons.panel.box, { mode: p.mode, ui, barButton: barGone.buttons.panel.box });
  });

  await step('popup-restores-entry', async () => {
    const pop = await openExt('pages/popup/index.html');
    await pop.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 1, mobile: false });
    await pop.waitFor(() => !!document.querySelector('.tj-popup__entry [data-action="show-entry"]'), { timeoutMs: 8000 });
    const row = await pop.eval(() => document.querySelector('.tj-popup__entry')?.textContent.trim() ?? null);
    const icon = await pop.eval(async () => {
      const im = new Image();
      im.src = chrome.runtime.getURL('icons/tarjuman-icon-128.png');
      await im.decode();
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      const px = (a, b2) => [...x.getImageData(a, b2, 1, 1).data];
      return { corner: px(1, 1), tile: px(64, 120), dot: px(40, 45), gap: px(64, 72), book: px(20, 95), size: [im.naturalWidth, im.naturalHeight] };
    });
    // البلاطة صنوبر #1E4A44 وزواياها شفافة؛ والرمز عاج #F3EFE6 (النقطة والكتاب)، والفجوة بين النقطتين والكتاب بلون البلاطة.
    check('extension-icon-pine-tile-ivory-mark-transparent-corners', icon.corner[3] === 0 && icon.tile.slice(0, 3).join() === '30,74,68' && icon.dot.slice(0, 3).join() === '243,239,230' && icon.gap.slice(0, 3).join() === '30,74,68' && icon.book.slice(0, 3).join() === '243,239,230' && icon.size.join() === '128,128', icon);
    check('popup-shows-hidden-entry-row', !!row && row.includes('زر النص المتزامن مخفي') && row.includes('إظهاره'), { row });
    await shoot(pop, 'popup-entry-hidden', { width: 360 });
    await clickSel(pop, '.tj-popup__entry [data-action="show-entry"]');
    await pop.waitFor(() => /ظهر زر النص المتزامن/.test(document.querySelector('.tj-popup__entry-result')?.textContent ?? ''), { timeoutMs: 5000 });
    const res = await pop.eval(() => ({ result: document.querySelector('.tj-popup__entry-result')?.textContent.trim() ?? null, row: !!document.querySelector('.tj-popup__entry') }));
    const ui = await prefsIn(pop);
    check('popup-show-entry-saves-and-reports-real-result', ui?.panelEntry === true && /ظهر زر النص المتزامن/.test(res.result ?? '') && !res.row, { ...res, ui });
    await pop.close();
    await front(yt);
    // الزر يعود إلى شريط المشغّل، واللوحة مغلقة (أُخفي زرها وهي مفتوحة فأُغلقت معه): لا شيء في الصفحة حتى تُفتح.
    let back = null;
    for (let i = 0; i < 12 && !back?.buttons.panel.box; i++) {
      await revealControls(yt);
      back = await iso(P.bar);
      if (!back.buttons.panel.box) await sleep(500);
    }
    const p = await peek();
    check('youtube-entry-returns-after-popup', !!back.buttons.panel.box && p.mode === 'none', { box: back.buttons.panel.box, mode: p.mode });
    await clickBar('panel');
    const o = await waitPeek((x) => x.mode === 'open' && x.kind === 'ready', 5000);
    check('panel-reopens-from-returned-entry', o.mode === 'open' && o.kind === 'ready', { mode: o.mode, kind: o.kind });
  });

  await step('panel-site-navigation', async () => {
    const before = await main(M.geo);
    const rel = await main((self) => [...document.querySelectorAll('#secondary a[href^="/watch?v="]')].map((a) => new URLSearchParams(a.getAttribute('href').split('?')[1]).get('v')).filter((v) => v && v !== self).slice(0, 4), VIDEO);
    if (!rel.length) {
      skip('panel-survives-site-navigation-and-back', 'لم يعرض يوتيوب مقترحات في العمود تحت الأتمتة');
      return;
    }
    let target = null;
    for (const id of rel) {
      const c = await main((x) => { const a = document.querySelector(`#secondary a[href^="/watch?v=${x}"]`); if (!a) return null; a.scrollIntoView({ block: 'center' }); const r = a.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; }, id);
      if (!c) continue;
      await sleep(400);
      await yt.click(c.x, c.y);
      await sleep(2500);
      if ((await main(() => new URLSearchParams(location.search).get('v'))) === id) { target = id; break; }
    }
    if (!target) {
      skip('panel-survives-site-navigation-and-back', 'نقرة المقترح لم تنقل الصفحة');
      return;
    }
    await main(() => scrollTo(0, 0));
    await main(() => { const v = document.querySelector('#movie_player video'); if (v) { v.muted = true; v.pause(); } return true; });
    const pNew = await waitPeek((x) => x.mode === 'open' && x.kind !== 'ready' && x.kind !== 'loading', 10000);
    const sNew = await iso(P.state);
    const gNew = await main(M.geo);
    check('panel-follows-new-video-without-stale-rows', sNew.videoId === target && pNew.rows === 0 && gNew.hosts === 1 && gNew.firstInColumn, { video: sNew.videoId === target, kind: pNew.kind, rows: pNew.rows, steps: pNew.steps.length, hosts: gNew.hosts });
    await snap(yt, 'watch-panel-other-video');
    await main(() => history.back());
    await yt.waitFor(() => new URLSearchParams(location.search).get('v') === 'iG9CE55wbtY', { timeoutMs: 15000 });
    await sleep(2000);
    await main(() => { const v = document.querySelector('#movie_player video'); if (v) { v.muted = true; v.pause(); } return true; });
    const pBack = await waitPeek((x) => x.mode === 'open' && x.kind === 'ready' && x.rows > 0, 10000);
    const gBack = await main(M.geo);
    check('panel-back-restores-saved-translation', pBack.rows === s0.arabic && gBack.hosts === 1 && gBack.firstInColumn && (await iso(P.state)).offset === s0.offset, { rows: pBack.rows, cues: s0.arabic, hosts: gBack.hosts, placeBefore: !!before.host });
  });

  await step('panel-narrow-and-theater', async () => {
    await yt.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 950, deviceScaleFactor: 1, mobile: false });
    await sleep(2200);
    const g = await main(M.geo);
    const p = await peek();
    result.measures.geoNarrow = { player: g.player, host: g.host, place: p.place };
    const col = await main(() => document.querySelector('#tarjuman-panel')?.parentElement?.id ?? null);
    check('panel-narrow-goes-below-video-no-overlap', !!g.host && g.host.height > 0 && g.host.top >= g.player.bottom - 4 && !overlaps(g.host, g.player) && p.place === 'below' && g.docWidth <= g.viewport.w, { place: p.place, column: col, host: g.host, player: g.player });
    check('panel-narrow-after-video-title-as-designed', !!g.title && g.host.top >= g.title.bottom - 2, { title: g.title, host: g.host });
    await main(() => document.querySelector('#tarjuman-panel')?.scrollIntoView({ block: 'center' }));
    await sleep(500);
    await snap(yt, 'watch-panel-narrow');
    await main(() => scrollTo(0, 0));
    await yt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
    await sleep(2000);
    const size = await main(M.rectOf, '#movie_player .ytp-size-button');
    await revealControls(yt);
    if (!size) { skip('panel-theater-mode-below-video', 'زر وضع المسرح غير موجود'); return; }
    await yt.click(size.x, size.y);
    await sleep(1800);
    const gt = await main(M.geo);
    const pt = await peek();
    check('panel-theater-mode-below-video', gt.theater && !!gt.host && gt.host.top >= gt.player.bottom - 4 && !overlaps(gt.host, gt.player), { theater: gt.theater, place: pt.place, host: gt.host, player: gt.player });
    await revealControls(yt);
    const back = await main(M.rectOf, '#movie_player .ytp-size-button');
    if (back) await yt.click(back.x, back.y);
    await sleep(1800);
    const gw = await main(M.geo);
    const pw = await peek();
    check('panel-back-beside-video-after-resize-and-theater', !gw.theater && gw.host.left >= gw.player.right - 4 && pw.rows === s0.arabic, { theater: gw.theater, place: pw.place, rows: pw.rows });
  });

  await step('panel-fullscreen', async () => {
    const before = await peek();
    await revealControls(yt);
    const fs = await main(M.rectOf, '#movie_player .ytp-fullscreen-button');
    if (!fs) { skip('panel-hidden-in-fullscreen-and-restored', 'زر ملء الشاشة غير موجود'); return; }
    await yt.click(fs.x, fs.y);
    await sleep(1800);
    const g = await main(M.geo);
    const p = await peek();
    if (!g.fs) {
      skip('panel-hidden-in-fullscreen-and-restored', 'المتصفح بلا نافذة لم يدخل ملء الشاشة');
      return;
    }
    check('panel-hidden-in-fullscreen', p.hostHidden || !g.host || g.host.height === 0, { hostHidden: p.hostHidden, host: g.host });
    await snap(yt, 'watch-fullscreen');
    await revealControls(yt);
    const out = await main(M.rectOf, '#movie_player .ytp-fullscreen-button');
    if (out) await yt.click(out.x, out.y);
    await sleep(1500);
    if ((await main(M.geo)).fs) await main(() => document.exitFullscreen().then(() => true, () => false));
    await sleep(1000);
    const after = await waitPeek((x) => x.mode === 'open' && !x.hostHidden, 5000);
    const s = await iso(P.state);
    check('panel-restored-after-fullscreen-without-loss', after.mode === 'open' && after.rows === before.rows && s.offset === s0.offset && s.arabic === s0.arabic, { mode: after.mode, rows: after.rows, offset: s.offset });
  });

  await step('panel-dark-theme-follows-youtube', async () => {
    await emulateScheme(yt, 'dark');
    await sleep(1500);
    const g = await main(M.geo);
    const p = await peek();
    let simulated = false;
    if (!g.dark) {
      // يوتيوب غير المسجَّل لا يتبع وضع الجهاز هنا: تُضبط سمة وضعه الداكن نفسها (html[dark]) التي تقرؤها اللوحة.
      await main(() => document.documentElement.setAttribute('dark', ''));
      simulated = true;
      await sleep(1200);
    }
    const q = await peek();
    check('panel-dark-follows-youtube-theme', q.theme === 'dark', { youtubeDark: g.dark, simulatedAttr: simulated, theme: q.theme });
    const dBtn = await shadowStyle('tarjuman-panel', '.foot .b:not(.b--ghost)');
    const dSeg = await shadowStyle('tarjuman-panel', '.segs button[aria-checked="true"]');
    const dGlyph = await shadowStyle('tarjuman-panel', '.head .mark path');
    check('identity-v4-panel-buttons-borderless-segs-selected-mark-dark', dBtn?.bg === V4.dark.control && dBtn?.border === NONE && dSeg?.bg === V4.dark.selected && dSeg?.color === V4.dark.ink && dGlyph?.fill === V4.dark.glyph, { btn: dBtn, seg: dSeg, glyph: dGlyph });
    if (simulated) note('الوضع الداكن ليوتيوب: ضُبطت سمة html[dark] يدويًا (يوتيوب غير المسجَّل لم يتبع وضع الجهاز)، ثم أزيلت؛ وعادت اللوحة فاتحة.');
    await snap(yt, 'watch-panel-dark');
    if (simulated) await main(() => document.documentElement.removeAttribute('dark'));
    await sleep(800);
    check('panel-light-again-after-youtube-light', (await peek()).theme === 'light');
    await emulateScheme(yt, 'light');
    await sleep(800);
  });

  // واجهة يوتيوب العربية (RTL): يضع يوتيوب عموده الثانوي يسار الفيديو، وقرار سلطان (2026-11-03) أن تبقى اللوحة يمينه، فيُبدَّل
  // العمودان ما دامت ظاهرة: الفيديو يسارًا بعرضه في الواجهة الإنجليزية، والهامش الخارجي عند حافة الصفحة، وإخفاء الزر يعيد يوتيوب.
  await step('panel-arabic-youtube-interface', async () => {
    // لغة الواجهة: رأس اللغة وتفضيل يوتيوب hl في ملف الاختبار وحده (لا حساب).
    await yt.send('Network.enable');
    await yt.send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': 'ar' } });
    await yt.send('Network.setCookie', { name: 'PREF', value: 'hl=ar', domain: '.youtube.com', path: '/', secure: true });
    await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}&hl=ar&persist_hl=1`);
    await waitForPlayer(yt, VIDEO, 30000);
    await main(() => { const v = document.querySelector('#movie_player video'); if (v) { v.muted = true; v.pause(); } return true; });
    await sleep(2500);
    isoId = yt.isolatedContextId(extId);
    await yt.waitFor(() => globalThis.__tarjuman?.mounted.panel.peek()?.ready, { contextId: isoId, timeoutMs: 15000 });
    await sleep(800);
    const sideOf = (g) => (g.host && g.player ? (g.host.left >= g.player.right - 4 ? 'right' : g.host.right <= g.player.left + 4 ? 'left' : 'below-or-overlap') : null);
    // صفّا العمودين: المشغّل ومحتوى العمود الثانوي (#secondary-inner موجود في الحالين، لا مضيف اللوحة).
    const rowOf = () => main(() => {
      const r = (e) => { const x = e.getBoundingClientRect(); return { left: Math.round(x.left), right: Math.round(x.right), width: Math.round(x.width) }; };
      return { player: r(document.querySelector('#movie_player')), inner: r(document.querySelector('ytd-watch-flexy #secondary-inner')), vw: innerWidth };
    });
    const g = await main(M.geo);
    const p = await peek();
    const side = sideOf(g);
    const mirroredRow = await rowOf();
    result.measures.arabicInterface = { dir: g.dir, lang: g.lang, side, host: g.host, player: g.player, mode: p?.mode, rows: p?.rows, mirrored: p?.mirrored, mirroredRow };
    if (g.dir !== 'rtl') {
      skip('panel-right-of-video-in-arabic-youtube', `لم تتحول واجهة يوتيوب إلى RTL (lang=${g.lang})`);
      return;
    }
    check('panel-right-of-video-in-arabic-youtube', side === 'right' && p.mirrored === true && p.mode === 'open' && !overlaps(g.host, g.player) && p.rows === s0.arabic && g.docWidth <= g.viewport.w, { side, mirrored: p.mirrored, mode: p.mode, rows: p.rows, host: g.host, player: g.player });
    await snap(yt, 'watch-panel-arabic-interface');
    // إخفاء الزر من قائمة اللوحة: بعد الرسالة لا لوحة، فيعود تخطيط يوتيوب العربي كما كان (العمود يسار الفيديو).
    let q = await peek();
    await clickBox(q.boxes.opts, 'خيارات اللوحة');
    q = await waitPeek((x) => x.menu === true);
    await clickBox(q.boxes.hide, 'إخفاء زر اللوحة');
    q = await waitPeek((x) => x.mode === 'none', 9000);
    await sleep(800);
    const nativeRow = await rowOf();
    const inline = await main(() => ['#columns', '#primary', '#secondary'].map((sel) => document.querySelector(`ytd-watch-flexy ${sel}`).getAttribute('style') ?? ''));
    result.measures.arabicInterface.nativeRow = nativeRow;
    check('arabic-youtube-restored-when-entry-hidden', q.mode === 'none' && q.mirrored === false && nativeRow.inner.right <= nativeRow.player.left + 4 && inline.every((x) => !/flex-direction|overflow|width|padding|margin/.test(x)), { mode: q.mode, mirrored: q.mirrored, inline });
    // المعكوس صورة الأصل: المشغّل بعرضه، وهامش حافة كلٍّ منهما، والفاصل بينهما كما في تخطيط يوتيوب نفسه.
    const m = mirroredRow;
    const n = nativeRow;
    const same = (a, b2) => Math.abs(a - b2) <= 2;
    const geom = {
      playerWidth: [m.player.width, n.player.width],
      videoEdge: [m.player.left, n.vw - n.player.right],
      columnEdge: [m.vw - m.inner.right, n.inner.left],
      gap: [m.inner.left - m.player.right, n.player.left - n.inner.right],
    };
    // وإن ضُيّق عمود يوتيوب الأعرض من 402 (fitted) أخذ المشغّل ما فضل فاتسع (أو بقي إن قيّده ارتفاع النافذة): لا يضيق عن الأصل،
    // والحافتان والفاصل كما هي.
    const keys = p.fitted ? ['videoEdge', 'columnEdge', 'gap'] : Object.keys(geom);
    const widthOk = p.fitted ? m.player.width >= n.player.width - 2 : true;
    check('arabic-youtube-mirror-keeps-player-width-margins-and-gap', widthOk && keys.every((k) => same(...geom[k])), { ...geom, fitted: p.fitted });
    // إعادة الزر (للتنظيف) بفعل المتحكم نفسه الذي تكتبه نافذة الأيقونة.
    await iso(() => globalThis.__tarjuman.controller.updatePrefs({ ui: { panelEntry: true, panelOpen: true } }).then(() => true));
    await waitPeek((x) => x.mode === 'open' && x.mirrored === true, 6000);
  });

  await step('panel-diagnostics-clean', async () => {
    const d = await iso(P.diag);
    result.measures.diagnostics = d;
    check('panel-diagnostics-no-failure-codes', d.state === 'mounted' && !d.lastCode && d.failures === 0, { state: d.state, lastCode: d.lastCode, failures: d.failures });
    const bar = await iso(() => globalThis.__tarjuman.mounted.controls.diagnostics().uiFonts);
    const both = (f) => JSON.stringify(f) === JSON.stringify({ loaded: ['cairo', 'almarai'], failed: [] });
    check('panel-and-bar-bundled-fonts-loaded', both(d.fonts) && both(bar), { panel: d.fonts, bar });
  });

  // 404 صورة الفيديو لمعرّف غير موجود متوقعة (البلاطة البديلة هي السلوك)، وتُعدّ وحدها؛ وأي خطأ شبكة آخر يبقى خطأ.
  const expected404 = netLogs.filter((x) => MISSING_THUMB.test(x.url) && /404/.test(x.text)).length;
  const otherNet = netLogs.length - expected404;
  result.measures.extensionNetworkLog = { expectedMissingThumb404: expected404, other: otherNet };
  // رسالة المتصفح «Unsafe attempt to load URL …/ui/fonts/*.woff2» تصاحب كل قراءة ناجحة لخطوط الإضافة على يوتيوب
  // (معروفة من P6 بملف تشخيصها، وتُعدّ وحدها كما في P10)؛ والخطوط محمّلة فعلًا (تشخيص اللوحة والأدوات).
  const FONT_READ = /^Unsafe attempt to load URL chrome-extension:\/\/[^/]+\/ui\/fonts\/(subtitle|ui)\/[a-z0-9-]+\.woff2 from frame/;
  const fontReadLogs = errors.flatMap((e) => e.list).filter((x) => x.kind === 'log.security' && FONT_READ.test(x.text)).length;
  result.measures.fontReadLogs = fontReadLogs;
  let skipped404 = 0;
  const extErrors = errors.flatMap((e) => e.list.map((x) => ({ ...x, page: e.page }))).filter((x) => !/favicon|ERR_BLOCKED_BY_CLIENT/i.test(x.text)).filter((x) => {
    if (x.kind === 'log.network' && /404/.test(x.text) && skipped404 < expected404) { skipped404++; return false; }
    if (x.kind === 'log.security' && FONT_READ.test(x.text)) return false;
    return true;
  });
  check('no-extension-errors', extErrors.length === 0, extErrors.slice(0, 8).map((x) => `${x.page} · ${x.kind}: ${x.text.slice(0, 300)}`));
} catch (err) {
  check('run: اكتمل', false, { error: err.message.slice(0, 300) });
} finally {
  await b?.close();
}

/** أول صف ظاهر قبل العودة (لا يلزم؛ يُعاد الحالي بعدها). */
function x0(p) { return Math.max(0, p.current); }

const failed = result.checks.filter((c) => c.ok === false);
const skipped = result.checks.filter((c) => c.ok === null);
result.summary = { total: result.checks.length, passed: result.checks.filter((c) => c.ok).length, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) };
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'live.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\n${result.browser}: ${result.summary.passed}/${result.summary.total}${failed.length ? ` — سقط: ${failed.map((c) => c.id).join('، ')}` : ''}${skipped.length ? ` — لم يُقَس: ${skipped.map((c) => c.id).join('، ')}` : ''}`);
process.exitCode = failed.length ? 1 : 0;
