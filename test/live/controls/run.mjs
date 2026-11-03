#!/usr/bin/env node
// سيناريوهات P6 الحية على يوتيوب الحقيقي (بروتوكول «الاختبارات الحية»): بناء التطوير في ملف اختبار جديد خارج
// المستودع، بلا نافذة ومكتوم الصوت، وحساب غير مسجَّل. كل فعل على الأدوات نقرة أو ضغطة مستخدم حقيقية (Input) بإحداثيات
// الأزرار والبنود؛ والقياس بما يراه المستخدم. تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُمرَّر جسم P1 الحقيقي
// الملتقط للفيديو نفسه (test/fixtures/json3) إلى المستخرج عبر خطاف التطوير، كما فعلت P3. الحافظة تُستبدل في العالم
// المعزول وحده (لا تُمسّ حافظة الجهاز)، والتنزيلات إلى مجلد مؤقت يُحذف بعد المقارنة.
//   npm run build:dev -- --out <مجلد>
//   node test/live/controls/run.mjs --browser brave|chrome --ext <مجلد> [--only hide,download,upload,nudge,timing,persist,modes]
//        [--break-font tajawal] [--headed] [--out docs/evidence/P6]
// --break-font يكتب بايتات غير صالحة في ملفي خط داخل مجلد البناء المؤقت (لا المستودع) لسيناريو البديل (P6-AC9).
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { FONT_READ_LOG, collectErrors, openTab } from '../harness/extension.mjs';
import { dismissConsent, relatedIds, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { subtitleFont } from '../../../src/ui/subtitle-fonts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(val('ext', 'dist'));
const VIDEO = 'iG9CE55wbtY';
const FIXTURE = path.join(ROOT, 'test/fixtures/json3/manual-ted-iG9CE55wbtY.json');
const ONLY = val('only') ? new Set(val('only').split(',')) : null;
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P6'), browser);
const want = (id) => !ONLY || ONLY.has(id);
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const result = { browser: null, at: new Date().toISOString(), headless: !argv.includes('--headed'), video: VIDEO, checks: [], notes: [], screenshots: [], measures: {}, errors: [] };
const check = (id, ac, ok, detail = null) => {
  result.checks.push({ id, ac, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} [${ac}] ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
};

// ---- المتوقع في Node من الجسم نفسه: الملف والتعليمات ----
const body = await readFile(FIXTURE, 'utf8');
const message = { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VIDEO, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false };
function expectedExport(mode, split = null) {
  const ex = createExtractor({ currentVideoId: () => VIDEO, durationMs: () => 1203421, isLive: () => false });
  ex.handleMessage(message);
  const conv = ex.convert('en|manual', { mode });
  return buildExport({ videoId: VIDEO, title: null, track: { key: 'en|manual', lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode, split, now: Date.now() });
}
const EXP_NORMAL = expectedExport('normal');
const EXP_LONG = expectedExport('long');
// زمن داخل مقطع ظاهر بعد الدقيقة الأولى (منتصف أول مقطع طوله 1.5 ث فأكثر): لقطات الخط والحجم تقيس سطرًا حقيقيًا.
const SHOT_CUE = EXP_NORMAL.fingerprint.cues.find((c) => c.startMs >= 50000 && c.endMs - c.startMs >= 1500);
const SHOT_AT = (SHOT_CUE.startMs + SHOT_CUE.endMs) / 2000;

// ---- دوال تُنفَّذ في العالم المعزول للإضافة (بناء التطوير) ----
const I = {
  state: () => {
    const h = globalThis.__tarjuman;
    const s = h.controller.getState();
    return {
      videoId: s.videoId, loading: s.loading, captured: s.captured.map((t) => ({ key: t.key, ok: t.ok, cueCount: t.cueCount })),
      arabic: s.arabic ? { n: s.arabic.cues.length, fileName: s.arabic.fileName, matched: s.arabic.comparison?.matched ?? null } : null,
      fingerprints: s.saved?.fingerprints?.length ?? 0, view: s.view, step: s.settings.offsetStepMs, appearance: s.settings.appearance,
      mounted: { overlay: h.mounted.overlay.state, controls: h.mounted.controls.state },
    };
  },
  peek: () => globalThis.__tarjuman.mounted.controls.peek(),
  diag: () => globalThis.__tarjuman.mounted.controls.diagnostics(),
  ov: () => globalThis.__tarjuman.mounted.overlay.peek(true),
  ovDiag: () => globalThis.__tarjuman.mounted.overlay.diagnostics(),
  inject: (msg) => globalThis.__tarjuman.extractor.handleMessage(msg),
  stubClipboard: () => {
    // حافظة بديلة في العالم المعزول وحده: يرى المحتوى الطولَ والبصمة فقط، ولا تُكتب حافظة الجهاز.
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (t) => {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
        globalThis.__tjCopied = { len: t.length, sha: [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16), head: t.slice(0, 24) };
      },
    });
    return true;
  },
  copied: () => globalThis.__tjCopied ?? null,
  setSettings: async (patch) => {
    await globalThis.__tarjuman.store.setSettings(patch);
    return true;
  },
  fonts: (fam) => [...document.fonts].filter((f) => f.family.replace(/"/g, '') === fam).map((f) => ({ weight: f.weight, status: f.status })),
};

// ---- دوال في العالم الرئيسي (ما يراه المستخدم في يوتيوب) ----
const M = {
  main: () => {
    const p = document.querySelector('#movie_player');
    const v = p?.querySelector('video.html5-main-video');
    const chrome = p?.querySelector('.ytp-chrome-bottom');
    const right = p?.querySelector('.ytp-right-controls');
    const r = (e) => {
      const b = e.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) };
    };
    return {
      classes: p ? [...p.classList].filter((c) => /^(ytp-(fullscreen|autohide|big-mode|small-mode)|ad-showing|ad-interrupting|playing-mode|paused-mode)$/.test(c)) : [],
      theater: !!document.querySelector('ytd-watch-flexy')?.hasAttribute('theater'),
      fs: document.fullscreenElement ? (document.fullscreenElement.id || document.fullscreenElement.tagName) : null,
      player: p ? r(p) : null,
      chrome: chrome ? { ...r(chrome), opacity: getComputedStyle(chrome).opacity } : null,
      right: right ? { ...r(right), first: right.firstElementChild?.id || right.firstElementChild?.className?.split(' ').slice(-1)[0] || null, children: [...right.children].map((c) => ({ id: c.id || null, cls: typeof c.className === 'string' ? c.className.split(' ').filter((x) => x.startsWith('ytp-') && x !== 'ytp-button').slice(0, 2).join('.') : '', box: r(c), shown: getComputedStyle(c).display !== 'none' })) } : null,
      leftRight: (() => { const l = p?.querySelector('.ytp-left-controls'); return l ? r(l) : null; })(),
      video: v ? { t: +v.currentTime.toFixed(3), paused: v.paused, muted: v.muted, duration: v.duration } : null,
      active: document.activeElement?.id || document.activeElement?.tagName || null,
      tjHosts: [...document.querySelectorAll('[id^="tarjuman"]')].map((e) => e.id),
    };
  },
  pause: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.pause(); return v.paused; },
  play: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; return v.play().then(() => true, () => false); },
  seek: (t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); v.currentTime = t; return true; },
  rectOf: (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: b.width }; },
  bodyHas: (s) => (document.body?.innerText || '').includes(s),
};

const BREAK = val('break-font');
if (BREAK) {
  if (path.resolve(EXT).startsWith(ROOT)) throw new Error('--break-font لمجلد بناء خارج المستودع فقط');
  for (const w of ['400', '700']) await writeFile(path.join(EXT, 'ui/fonts/subtitle', `${BREAK}-${w}.woff2`), Buffer.from('not a font'));
}

const b = await launch({ browser, profile: val('profile', `${browser}-p6-${Date.now()}`), headless: !argv.includes('--headed') });
result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
console.log(`المتصفح: ${result.browser}`);
const DL = await mkdtemp(path.join(os.tmpdir(), 'tj-p6-dl-'));
const FILES = await mkdtemp(path.join(os.tmpdir(), 'tj-p6-files-'));
let page;
let isoId;
let extId;
const iso = (fn, ...args) => page.eval(fn, { contextId: isoId, args });
const main = (fn, ...args) => page.eval(fn, { args });
const shoot = async (name) => {
  const f = path.join(OUT, `${name}.png`);
  await page.screenshot(f);
  result.screenshots.push(path.relative(ROOT, f));
};
const center = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
async function clickButton(kind) {
  await revealControls(page);
  const p = await iso(I.peek);
  const c = center(p.buttons[kind].box);
  await page.click(c.x, c.y);
  await sleep(350);
}
async function clickItem(match) {
  for (let tries = 0; tries < 5; tries++) {
    const p = await iso(I.peek);
    const it = p.layer.menu?.items.find((x) => (typeof match === 'string' ? x.fid === match || x.text.includes(match) : match(x)));
    if (!it) throw new Error(`لا بند: ${match}`);
    const mb = p.layer.menu.box;
    // بند خارج الجزء الظاهر من قائمة طويلة: تمرير بعجلة الفأرة كما يفعل المستخدم.
    if (it.box.top < mb.top || it.box.bottom > mb.bottom) {
      const c = center(mb);
      await page.mouseMove(c.x, c.y);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c.x, y: c.y, deltaX: 0, deltaY: it.box.bottom > mb.bottom ? it.box.bottom - mb.bottom + 24 : it.box.top - mb.top - 24 });
      await sleep(350);
      continue;
    }
    const c = center(it.box);
    await page.click(c.x, c.y);
    await sleep(350);
    return it;
  }
  throw new Error(`بند لا يظهر: ${match}`);
}
// رمز المفتاح الافتراضي لكل محرف (keyCode 46 هو Delete و45 Insert، فلا يصلحان للنقطة والشرطة).
const KEYS = { '.': ['Period', 190], '-': ['Minus', 189], '+': ['Equal', 187], ' ': ['Space', 32] };
const typeText = async (text) => {
  for (const ch of text) {
    const [code, kc] = KEYS[ch] ?? (/\d/.test(ch) ? [`Digit${ch}`, 48 + Number(ch)] : [`Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0)]);
    await page.key(ch, code, kc);
  }
};
/** يفتح قائمة زر إن لم تكن مفتوحة (الضغط على زر قائمة مفتوحة يغلقها). */
async function openMenuOf(kind, label) {
  const p = await iso(I.peek);
  if (p.layer.menu?.label === label) return;
  await clickButton(kind);
}
const pressKey = (key, code, keyCode) => page.key(key, code, keyCode);
async function clearField() {
  await pressKey('End', 'End', 35);
  for (let i = 0; i < 10; i++) await pressKey('Backspace', 'Backspace', 8);
}

// تنزيلات: إلى مجلد مؤقت، وتُنتظر حتى تكتمل.
const downloads = new Map();
b.conn.on('Browser.downloadProgress', (p) => downloads.set(p.guid, p.state));
b.conn.on('Browser.downloadWillBegin', (p) => downloads.set(p.guid, 'begin'));
async function waitDownloads(count, since) {
  for (let i = 0; i < 60; i++) {
    const done = [...downloads.values()].filter((s) => s === 'completed').length;
    if (done >= since + count) break;
    await sleep(250);
  }
  return (await readdir(DL)).filter((n) => !n.endsWith('.crdownload')).sort();
}

// منتقي الملفات: يُعترض ويُملأ بملف من المجلد المؤقت كما يختار المستخدم.
let nextUpload = null;
async function armChooser() {
  await page.send('DOM.enable');
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  page.on('Page.fileChooserOpened', async ({ backendNodeId }) => {
    const files = nextUpload ?? [];
    nextUpload = null;
    try {
      await page.send('DOM.setFileInputFiles', { files, backendNodeId });
    } catch (err) {
      result.notes.push(`منتقي الملفات: ${err.message.slice(0, 120)}`);
    }
  });
}

async function settleAds() {
  const isAd = () => main(() => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); });
  if (!(await isAd())) return 'none';
  result.notes.push('إعلان حقيقي صودف على الصفحة؛ انتُظر انتهاؤه (والتخطي بنقرة متى ظهر الزر).');
  const ended = await page.waitFor(() => {
    const p = document.querySelector('#movie_player');
    const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
    if (skip && getComputedStyle(skip).display !== 'none') skip.click();
    return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
  }, { timeoutMs: 150000, intervalMs: 1000 });
  return ended ? 'ended' : 'stuck';
}

async function openVideo(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`https://www.youtube.com/watch?v=${id}`);
    await dismissConsent(page).catch(() => false);
    await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
    let ready = await waitForPlayer(page, id, 15000);
    if (!ready) {
      await main(M.play);
      ready = await waitForPlayer(page, id, 25000);
    }
    if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
    await sleep(1500);
    isoId = page.isolatedContextId(extId);
    if (!isoId) throw new Error('لا سياق معزول للإضافة');
    if ((await settleAds()) !== 'stuck') {
      await main(M.pause);
      await page.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 10000 });
      return ready;
    }
  }
  throw new Error('سلسلة إعلانات لا تنتهي');
}

/** يكتب SRT عربيًا من ملف إنجليزي بالترقيم والتوقيت نفسيهما (محاكاة ناتج النموذج)؛ dropLast يحذف آخر مقطع. */
async function arabicFile(name, srt, { dropLast = false } = {}) {
  const blocks = srt.trim().split(/\n\n+/);
  const out = (dropLast ? blocks.slice(0, -1) : blocks).map((blk) => {
    const [n, time] = blk.split('\n');
    return `${n}\n${time}\nهذه ترجمة المقطع ${n} إلى العربية، بجملة أطول قليلًا لاختبار التفاف السطر داخل عرض المشغّل دون أي قص.`;
  });
  const f = path.join(FILES, name);
  await writeFile(f, `${out.join('\n\n')}\n`);
  return f;
}

try {
  await mkdir(OUT, { recursive: true });
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', 'تحضير', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  extId = ext.id;
  await b.conn.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
  page = await openTab(b.conn, 'about:blank');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  const errs = collectErrors(page, { extId, onlyExtension: true });
  const external = [];
  const extensionReads = [];
  // طلب «من الإضافة وحدها» بقاعدة P1 (netlog): كل إطارات مكدّس المستدعي من الإضافة. غلاف الالتقاط (MAIN) يقع في مكدّس
  // كل طلبات يوتيوب، فوجود إطار للإضافة وحده لا يجعل الطلب طلبها.
  const framesOf = (init) => {
    const out = [];
    if (init?.url) out.push(init.url);
    for (let st = init?.stack; st; st = st.parent) for (const f of st.callFrames ?? []) if (f.url) out.push(f.url);
    return out;
  };
  page.on('Network.requestWillBeSent', (e) => {
    if (e.request.url.startsWith(`chrome-extension://`)) {
      extensionReads.push(e.request.url.split('/').pop());
      return;
    }
    const frames = framesOf(e.initiator);
    if (frames.length && frames.every((u) => u.startsWith('chrome-extension://'))) external.push(new URL(e.request.url).host);
  });
  await page.send('Network.enable');
  await armChooser();
  await openVideo(VIDEO);

  // ===== AC1: الحقن في الشريط =====
  await revealControls(page);
  const st0 = await iso(I.state);
  const m0 = await main(M.main);
  const p0 = await iso(I.peek);
  const xs = ['download', 'upload', 'minus', 'badge', 'plus'].map((k) => p0.buttons[k].box.left);
  check('mounted-first-in-right-controls', 'P6-AC1', st0.mounted.controls === 'mounted' && p0.first && p0.inRightControls && m0.right.first === 'tarjuman-controls', { first: m0.right.first, ytAfter: m0.right.children.slice(1).map((c) => c.cls) });
  check('five-buttons-ltr-order', 'P6-AC1', xs.every((x, i) => i === 0 || x > xs[i - 1]), { xs });
  const inBar = Object.values(p0.buttons).every((x) => x.box.top >= m0.chrome.top - 1 && x.box.bottom <= m0.chrome.bottom + 1 && x.box.width > 0);
  check('buttons-inside-youtube-bar', 'P6-AC1', inBar, { chrome: m0.chrome, group: p0.group });
  check('layer-inside-movie-player', 'P6-AC1', m0.tjHosts.includes('tarjuman-controls-layer'), { hosts: m0.tjHosts });
  result.measures.normal = { player: m0.player, group: p0.group, size: p0.size };
  await shoot('ac7-normal-shown');

  // ===== AC1/AC7: الشريط يختفي فتختفي الأدوات معه =====
  if (want('hide')) {
    await main(M.play);
    await page.mouseMove(10, 10);
    const hidden = await page.waitFor(() => document.querySelector('#movie_player')?.classList.contains('ytp-autohide'), { timeoutMs: 9000, intervalMs: 200 });
    await sleep(600);
    const mh = await main(M.main);
    const ph = await iso(I.peek);
    check('tools-hide-with-bar', 'P6-AC1', !!hidden && mh.chrome.opacity === '0' && ph.layer.bar === 'hidden', { autohide: !!hidden, chromeOpacity: mh.chrome.opacity, layerBar: ph.layer.bar });
    await shoot('ac7-normal-hidden');
    await revealControls(page);
    await sleep(400);
    const ms = await main(M.main);
    check('tools-return-with-bar', 'P6-AC1', ms.chrome.opacity === '1' && (await iso(I.peek)).layer.bar === 'shown', { chromeOpacity: ms.chrome.opacity });
    await main(M.pause);
  }

  // ===== AC4: التحميل =====
  if (want('download')) {
    await clickButton('download');
    let pk = await iso(I.peek);
    check('download-menu-before-capture', 'P6-AC4', /فعّل الترجمة \(CC\) واختر English/.test(pk.layer.menu?.text ?? ''), { label: pk.layer.menu?.label });
    await shoot('ac4-menu-not-captured');
    const acc = await iso(I.inject, message);
    await sleep(500);
    pk = await iso(I.peek);
    check('capture-accepted-status-line', 'P6-AC4', acc.accepted && /English – يدوي، 427 مقطعًا/.test(pk.layer.menu?.text ?? ''), { accepted: acc.accepted, code: acc.code });
    await shoot('ac4-menu-captured');
    const before = downloads.size;
    await clickItem('download');
    let names = await waitDownloads(1, before);
    const normalName = `${VIDEO}.en.manual.normal.srt`;
    const got = names.includes(normalName) ? await readFile(path.join(DL, normalName), 'utf8') : null;
    check('download-normal-bytes-match', 'P6-AC4', got === EXP_NORMAL.files[0].text, { name: normalName, bytes: got ? Buffer.byteLength(got) : null, expected: Buffer.byteLength(EXP_NORMAL.files[0].text) });
    await sleep(600);
    const st = await iso(I.state);
    check('fingerprint-saved', 'P6-AC4', st.fingerprints === 1, { fingerprints: st.fingerprints });
    pk = await iso(I.peek);
    check('download-success-visible', 'P6-AC4', /✓ نُزّل/.test(pk.layer.menu?.text ?? ''));
    await shoot('ac4-download-done');
    // مقاطع أطول
    await clickItem('mode:long');
    const before2 = [...downloads.values()].filter((s) => s === 'completed').length;
    await sleep(2200);
    await clickItem('download');
    names = await waitDownloads(1, before2);
    const longName = `${VIDEO}.en.manual.long.srt`;
    const gotLong = names.includes(longName) ? await readFile(path.join(DL, longName), 'utf8') : null;
    check('download-long-bytes-match', 'P6-AC4', gotLong === EXP_LONG.files[0].text, { name: longName, bytes: gotLong ? Buffer.byteLength(gotLong) : null });
    await clickItem('mode:normal');
    // نسخ التعليمات
    await iso(I.stubClipboard);
    await clickItem('copy');
    await sleep(500);
    const copied = await iso(I.copied);
    const expectSha = sha(EXP_NORMAL.instructions);
    pk = await iso(I.peek);
    const shownSomewhere = [pk.layer.menu?.text ?? '', ...pk.layer.toasts.map((t) => t.text), pk.layer.tip ?? ''].some((t) => t.includes(EXP_NORMAL.instructions.slice(0, 40)))
      || (await main(M.bodyHas, EXP_NORMAL.instructions.slice(0, 40)));
    check('copy-instructions-from-buildExport', 'P6-AC4', copied?.sha === expectSha && copied?.len === EXP_NORMAL.instructions.length, { copied: copied && { len: copied.len, sha: copied.sha }, expectSha });
    check('instructions-never-displayed', 'P6-AC4', !shownSomewhere && pk.layer.toasts.some((t) => t.text.includes('نُسخت تعليمات الترجمة')), { toasts: pk.layer.toasts.map((t) => t.text) });
    // التقسيم الاحتياطي (معلومة)
    await clickItem('fallback');
    await clickItem('split');
    const before3 = [...downloads.values()].filter((s) => s === 'completed').length;
    await clickItem('download');
    names = await waitDownloads(3, before3);
    const parts = names.filter((n) => /part\d+of\d+/.test(n));
    check('split-parts-downloaded (معلومة)', 'P6-AC4', parts.length === 3, { parts });
    await shoot('ac4-menu-fallback');
    await clickButton('download');
  }

  // ===== AC5: الرفع والعرض =====
  if (want('upload')) {
    const normal = await readFile(path.join(DL, `${VIDEO}.en.manual.normal.srt`), 'utf8');
    const full = await arabicFile('talk.ar.srt', normal);
    const short = await arabicFile('talk-missing.ar.srt', normal, { dropLast: true });
    nextUpload = [full];
    await clickButton('upload');
    await sleep(1500);
    let st = await iso(I.state);
    let pk = await iso(I.peek);
    check('upload-first-file-loads-and-compares', 'P6-AC5', st.arabic?.n === 427 && st.arabic.matched === true && /مطابق للأصل ✓/.test(pk.layer.menu?.text ?? ''), { arabic: st.arabic, menu: pk.layer.menu?.label });
    await shoot('ac5-display-menu');
    await clickItem('mode:dual');
    await sleep(400);
    await main(M.seek, 28);
    await sleep(700);
    const ovDual = await iso(I.ov);
    st = await iso(I.state);
    check('display-mode-dual', 'P6-AC5', st.view.displayMode === 'dual' && ovDual.lines.length === 2 && ovDual.lines[0].kind === 'ar' && ovDual.lines[1].kind === 'en', { lines: ovDual.lines.map((l) => l.kind) });
    await shoot('ac5-dual');
    await clickItem('mode:ar');
    await clickButton('upload');
    await clickButton('plus');
    // استبدال بملف ينقصه آخر مقطع ثم إلغاء
    await clickButton('upload');
    nextUpload = [short];
    await clickItem('replace');
    await sleep(1500);
    pk = await iso(I.peek);
    check('replace-confirm-shows-new-summary', 'P6-AC5', pk.layer.menu?.label === 'استبدال الترجمة؟' && /مقطع واحد ناقص: 427/.test(pk.layer.menu.text) && /ستُصفَّر إزاحة العرض/.test(pk.layer.menu.text), { label: pk.layer.menu?.label });
    await shoot('ac5-confirm-replace');
    await clickItem('cancel');
    st = await iso(I.state);
    check('replace-cancel-changes-nothing', 'P6-AC5', st.arabic.fileName === 'talk.ar.srt' && st.view.displayOffsetMs === 500, { arabic: st.arabic, offset: st.view.displayOffsetMs });
    nextUpload = [short];
    await clickItem('replace');
    await sleep(1500);
    await clickItem('confirm');
    await sleep(800);
    st = await iso(I.state);
    pk = await iso(I.peek);
    check('replace-confirmed-resets-offset-with-notice', 'P6-AC5', st.arabic.fileName === 'talk-missing.ar.srt' && st.view.displayOffsetMs === 0 && pk.layer.toasts.some((t) => /صُفّرت إزاحة العرض/.test(t.text)), { arabic: st.arabic, offset: st.view.displayOffsetMs });
    nextUpload = [full];
    await clickItem('replace');
    await sleep(1500);
    await clickItem('confirm');
    await sleep(800);
    await clickButton('upload');
  }

  // ===== AC2 وAC10: − و+ والشارة =====
  if (want('nudge')) {
    await main(M.seek, 40);
    await sleep(600);
    const t0 = (await main(M.main)).video.t;
    const f0 = (await iso(I.ov)).font;
    await clickButton('plus');
    await clickButton('plus');
    await clickButton('minus');
    const st = await iso(I.state);
    const pk = await iso(I.peek);
    const m = await main(M.main);
    check('plus-minus-change-offset-by-step', 'P6-AC2', st.view.displayOffsetMs === 500 && pk.buttons.badge.text === '+0.5', { offset: st.view.displayOffsetMs, badge: pk.buttons.badge.text });
    check('video-time-untouched', 'P6-AC2', Math.abs(m.video.t - t0) < 0.01 && m.video.paused, { before: t0, after: m.video.t });
    check('tooltips-explain-sign', 'P6-AC2', pk.buttons.plus.label === 'تأخير الترجمة 0.5 ث (تظهر لاحقًا)' && pk.buttons.minus.label === 'تقديم الترجمة 0.5 ث (تظهر أبكر)' && /تظهر الترجمة لاحقًا/.test(pk.buttons.badge.label), { plus: pk.buttons.plus.label, minus: pk.buttons.minus.label, badge: pk.buttons.badge.label });
    const f1 = (await iso(I.ov)).font;
    check('nudge-changes-offset-only-not-font', 'P6-AC10', JSON.stringify(f0) === JSON.stringify(f1) && JSON.stringify(st.appearance) === JSON.stringify((await iso(I.state)).appearance), { before: f0, after: f1 });
    const kids = (await main(M.main)).right.children.filter((c) => c.id === 'tarjuman-controls');
    check('no-font-or-size-control-in-bar', 'P6-AC10', kids.length === 1 && Object.keys(pk.buttons).length === 5, { ours: kids.length, buttons: Object.keys(pk.buttons) });
    await page.mouseMove(center(pk.buttons.plus.box).x, center(pk.buttons.plus.box).y);
    await sleep(500);
    await shoot('ac2-tooltip-plus');
  }

  // ===== AC3: قائمة التوقيت والحقول =====
  if (want('timing')) {
    await clickButton('badge');
    let pk = await iso(I.peek);
    check('timing-menu-opens-from-badge', 'P6-AC3', pk.layer.menu?.label === 'توقيت الترجمة' && /\+ تأخير: تظهر لاحقًا · − تقديم: تظهر أبكر/.test(pk.layer.menu.text), { text: pk.layer.menu?.text.slice(0, 80) });
    await shoot('ac3-timing-menu');
    const before = (await main(M.main)).video;
    await clickItem('offset');
    await clearField();
    await typeText('-2.3');
    await pressKey('Enter', 'Enter', 13);
    await sleep(400);
    let st = await iso(I.state);
    check('precise-input-applies', 'P6-AC3', st.view.displayOffsetMs === -2300, { offset: st.view.displayOffsetMs });
    // ضغطات اختصارات يوتيوب داخل الحقل
    await clickItem('offset');
    for (const [k, c, kc] of [['5', 'Digit5', 53], ['0', 'Digit0', 48], [' ', 'Space', 32], ['ArrowLeft', 'ArrowLeft', 37], ['ArrowRight', 'ArrowRight', 39], ['k', 'KeyK', 75], ['j', 'KeyJ', 74], ['l', 'KeyL', 76], ['f', 'KeyF', 70], ['m', 'KeyM', 77], ['t', 'KeyT', 84]]) {
      await pressKey(k, c, kc);
      await sleep(120);
    }
    await sleep(500);
    const after = (await main(M.main));
    check('field-keys-do-not-reach-youtube', 'P6-AC3', Math.abs(after.video.t - before.t) < 0.01 && after.video.paused === before.paused && after.video.muted === before.muted && !after.fs && !after.theater, { before, after: after.video, fs: after.fs, theater: after.theater });
    await clearField();
    await typeText('abc');
    await pressKey('Enter', 'Enter', 13);
    await sleep(300);
    pk = await iso(I.peek);
    st = await iso(I.state);
    check('invalid-input-not-applied', 'P6-AC3', st.view.displayOffsetMs === -2300 && /أدخل الإزاحة بالثواني/.test(pk.layer.menu.text), { offset: st.view.displayOffsetMs });
    await shoot('ac3-invalid-input');
    await clickItem('step:1000');
    await sleep(500);
    st = await iso(I.state);
    await clickButton('plus');
    const st2 = await iso(I.state);
    check('step-choice-applies-to-buttons', 'P6-AC3', st.step === 1000 && st2.view.displayOffsetMs === -1300, { step: st.step, offset: st2.view.displayOffsetMs });
    await openMenuOf('badge', 'توقيت الترجمة');
    await clickItem('step:500');
    await clickItem('reset');
    await sleep(300);
    st = await iso(I.state);
    pk = await iso(I.peek);
    check('reset-to-zero', 'P6-AC3', st.view.displayOffsetMs === 0 && pk.buttons.badge.text === '0.0', { offset: st.view.displayOffsetMs });
    await pressKey('Escape', 'Escape', 27);
    await sleep(300);
    pk = await iso(I.peek);
    const m = await main(M.main);
    check('esc-closes-and-returns-focus', 'P6-AC3', !pk.layer.menu && m.active === 'tarjuman-controls', { menu: !!pk.layer.menu, active: m.active });
    // اختبار ضابط: الضغطة نفسها خارج الحقل تصل إلى يوتيوب (فالعزل أعلاه ذو معنى)
    // معلومة: الكتابة في الحقل والفيديو يعمل دون تحريك الفأرة — هل يُخفي يوتيوب الشريط (فتختفي القائمة معه)، وهل يبقى
    // التركيز في الحقل والضغطات معزولة؟ (بند من المراجعة المستقلة لا يُحسم إلا حيًا)
    await clickButton('badge');
    await clickItem('offset');
    await main(M.play);
    const tPlay = (await main(M.main)).video.t;
    for (let i = 0; i < 8; i++) {
      await pressKey('5', 'Digit5', 53);
      await sleep(700);
    }
    const typed = await main(M.main);
    const pkTyped = await iso(I.peek);
    check('typing-while-playing (معلومة)', 'P6-AC3', pkTyped.layer.focusedFid === 'offset', {
      autohide: typed.classes.includes('ytp-autohide'), layerBar: pkTyped.layer.bar, focusedFid: pkTyped.layer.focusedFid,
      videoAdvanced: +(typed.video.t - tPlay).toFixed(2), value: pkTyped.layer.menu?.items.find((x) => x.fid === 'offset')?.value ?? null,
    });
    await main(M.pause);
    await pressKey('Escape', 'Escape', 27);
    await sleep(300);
    await main(() => document.activeElement?.blur());
    const t1 = (await main(M.main)).video.t;
    await pressKey('l', 'KeyL', 76);
    await sleep(600);
    const t2 = (await main(M.main)).video.t;
    result.notes.push(`ضابط الاختصارات: «l» خارج الحقل نقل الفيديو من ${t1} إلى ${t2} (يوتيوب يستقبل الاختصارات خارج الحقول).`);
    await main(M.pause);
  }

  // ===== AC6: الحفظ والاستعادة بعد إعادة التحميل والتنقل =====
  if (want('persist')) {
    await clickButton('plus');
    await clickButton('plus');
    await clickButton('upload');
    await clickItem('mode:dual');
    await clickButton('upload');
    await sleep(800);
    await page.reload();
    // إشعار الاستعادة رسالة عابرة (3 ث): تُلتقط وهي ظاهرة.
    let restoredToast = null;
    for (let i = 0; i < 40 && !restoredToast; i++) {
      isoId = page.isolatedContextId(extId);
      if (isoId) {
        const t = await iso(() => globalThis.__tarjuman?.mounted.controls.peek()?.layer.toasts ?? []).catch(() => []);
        restoredToast = t.find((x) => /استُعيدت ترجمتك المحفوظة/.test(x.text)) ?? null;
      }
      if (!restoredToast) await sleep(200);
    }
    await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
    await waitForPlayer(page, VIDEO, 25000);
    await sleep(1500);
    isoId = page.isolatedContextId(extId);
    await settleAds();
    await main(M.pause);
    await page.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 10000 });
    await sleep(800);
    let st = await iso(I.state);
    let pk = await iso(I.peek);
    check('restored-after-reload', 'P6-AC6', st.view.displayOffsetMs === 1000 && st.view.displayMode === 'dual' && pk.buttons.badge.text === '+1.0' && st.arabic?.n === 427, { view: st.view, badge: pk.buttons.badge.text });
    check('restored-notice-shown', 'P6-AC6', !!restoredToast, { toast: restoredToast?.text ?? null });
    const ids = (await relatedIds(page)).filter((x) => x !== VIDEO);
    if (ids[0]) {
      await main((id) => { const a = document.querySelector(`#secondary a[href^="/watch?v=${id}"]`); a?.click(); return !!a; }, ids[0]);
      await waitForPlayer(page, ids[0], 25000);
      await settleAds();
      await main(M.pause);
      await sleep(1500);
      st = await iso(I.state);
      pk = await iso(I.peek);
      const mm = await main(M.main);
      check('other-video-starts-clean', 'P6-AC6', st.videoId === ids[0] && st.view.displayOffsetMs === 0 && pk.buttons.badge.text === '0.0' && pk.buttons.plus.disabled, { videoId: st.videoId, badge: pk.buttons.badge.text });
      check('reinjected-after-navigation', 'P6-AC1', pk.first && mm.right.first === 'tarjuman-controls', { first: mm.right.first });
      await main(() => history.back());
      await waitForPlayer(page, VIDEO, 25000);
      await settleAds();
      await main(M.pause);
      await sleep(1500);
      st = await iso(I.state);
      pk = await iso(I.peek);
      check('restored-after-navigating-back', 'P6-AC6', st.videoId === VIDEO && st.view.displayOffsetMs === 1000 && st.view.displayMode === 'dual' && pk.buttons.badge.text === '+1.0', { view: st.view });
      result.notes.push('التنقل بنقرة الرابط البرمجية على مقترح (تنقل SPA نفسه وحدثاه) ثم history.back، كما في P5.');
    } else {
      result.notes.push('لا مقترحات في الصفحة: تخطي سيناريو التنقل.');
    }
    await openMenuOf('badge', 'توقيت الترجمة');
    await clickItem('reset');
    await pressKey('Escape', 'Escape', 27);
    await clickButton('upload');
    await clickItem('mode:ar');
    await clickButton('upload');
  }

  // ===== AC1 وAC7 وAC8: الأوضاع الأربعة، والخط والحجم عند 160% =====
  async function modeShots(tag) {
    await main(M.seek, SHOT_AT);
    await sleep(700);
    await revealControls(page);
    await sleep(300);
    const m = await main(M.main);
    const pk = await iso(I.peek);
    const ov = await iso(I.ov);
    const inBar = Object.values(pk.buttons).every((x) => x.box.width > 0 && x.box.top >= m.chrome.top - 1 && x.box.bottom <= m.chrome.bottom + 1);
    const maxLine = Math.max(0, ...(ov.lineBoxes ?? []).map((x) => x.width));
    const lines = (ov.lineBoxes ?? []).length;
    return { m, pk, ov, inBar, maxLine, lines, wrapOk: lines > 0 && maxLine <= m.player.width * 0.92 + 1, aboveBar: ov.stage ? ov.stage.bottom <= m.chrome.top + 1 : null };
  }
  async function exitFullscreen() {
    if (!(await main(M.main)).fs) return;
    await revealControls(page);
    const btn = await main(M.rectOf, '#movie_player .ytp-fullscreen-button');
    if (btn) await page.click(btn.x, btn.y);
    await sleep(1000);
    if ((await main(M.main)).fs) await main(() => document.exitFullscreen().then(() => true, () => false));
    await sleep(800);
  }
  /** يوتيوب تحت الأتمتة قد يُفرغ الفيديو بعد قفزات بعيدة أو تغيير المقاس («Something went wrong»): صفحة جديدة عند
   * زمن البدء (t=) ثم قفزة قصيرة إلى المقطع المقيس، فيظهر سطر حقيقي. */
  async function freshShot() {
    await page.goto(`https://www.youtube.com/watch?v=${VIDEO}&t=${Math.max(0, Math.floor(SHOT_AT) - 3)}s`);
    await dismissConsent(page).catch(() => false);
    await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
    if (!(await waitForPlayer(page, VIDEO, 15000))) await main(M.play);
    await waitForPlayer(page, VIDEO, 25000);
    await sleep(1500);
    isoId = page.isolatedContextId(extId);
    await settleAds();
    await main(M.pause);
    await page.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 10000 });
    await sleep(800);
  }

  if (want('modes')) {
    const fam = (id) => subtitleFont(id).family;
    for (const scale of [100, 160]) {
      if (scale === 160) {
        await iso(I.setSettings, { appearance: { font: 'markazi', scale: 160 } });
        await sleep(1500);
      }
      await freshShot();
      const suffix = scale === 160 ? '-160' : '';
      // عادي
      let r = await modeShots('normal');
      check(`normal${suffix}: five-in-bar`, 'P6-AC7', r.inBar && r.pk.size === 'normal', { size: r.pk.size, overflow: r.pk.overflow });
      if (scale === 160) check('normal-160: wraps-within-92%-and-above-bar', 'P6-AC8', r.wrapOk && r.aboveBar, { lines: r.lines, maxLine: r.maxLine, player: r.m.player.width, stageBottom: r.ov.stage?.bottom, chromeTop: r.m.chrome.top, font: r.ov.font });
      await shoot(`ac7-normal${suffix}`);
      // مسرح
      const sizeBtn = await main(M.rectOf, '#movie_player .ytp-size-button');
      if (sizeBtn) await page.click(sizeBtn.x, sizeBtn.y);
      await sleep(1500);
      r = await modeShots('theater');
      check(`theater${suffix}: five-in-bar`, 'P6-AC7', r.m.theater && r.inBar && r.pk.first, { theater: r.m.theater, size: r.pk.size });
      if (scale === 160) check('theater-160: wraps-within-92%-and-above-bar', 'P6-AC8', r.wrapOk && r.aboveBar, { maxLine: r.maxLine, player: r.m.player.width, font: r.ov.font });
      await shoot(`ac7-theater${suffix}`);
      // ملء الشاشة
      const fsBtn = await main(M.rectOf, '#movie_player .ytp-fullscreen-button');
      if (fsBtn) await page.click(fsBtn.x, fsBtn.y);
      await sleep(1800);
      r = await modeShots('fullscreen');
      check(`fullscreen${suffix}: five-in-bar`, 'P6-AC7', !!r.m.fs && r.inBar && r.pk.size === 'fullscreen', { fs: r.m.fs, size: r.pk.size, classes: r.m.classes });
      if (scale === 160) check('fullscreen-160: wraps-within-92%-and-above-bar', 'P6-AC8', r.wrapOk && r.aboveBar, { maxLine: r.maxLine, player: r.m.player.width, font: r.ov.font });
      await shoot(`ac7-fullscreen${suffix}`);
      if (scale === 100) {
        // قائمة في ملء الشاشة فوق زرها
        await clickButton('badge');
        const pkm = await iso(I.peek);
        check('menu-visible-in-fullscreen', 'P6-AC1', !!pkm.layer.menu && pkm.layer.menu.box.width >= 300, { box: pkm.layer.menu?.box });
        await shoot('ac7-fullscreen-menu');
        await pressKey('Escape', 'Escape', 27);
        await sleep(300);
      }
      await exitFullscreen();
      const fsBack = await main(M.rectOf, '#movie_player .ytp-size-button');
      if ((await main(M.main)).theater && fsBack) await page.click(fsBack.x, fsBack.y);
      await sleep(1200);
      // مشغّل ضيق: أصغر عرض نافذة يتسع فيه الشريط
      const widths = scale === 100 ? [900, 760, 640, 600, 560, 520, 480, 440, 400] : [520];
      const narrow = [];
      for (const w of widths) {
        await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
        await sleep(1600);
        await revealControls(page);
        await sleep(400);
        const m = await main(M.main);
        const pk = await iso(I.peek);
        const ytOutside = m.right.children.filter((c) => c.shown && c.box.width > 0 && (c.box.right > m.chrome.right + 1 || c.box.left < m.chrome.left - 1 || c.box.top >= m.chrome.bottom - 1)).map((c) => c.cls || c.id);
        const overlapLeft = m.leftRight ? pk.group.left < m.leftRight.right - 1 : null;
        narrow.push({ viewport: w, player: m.player.width, size: pk.size, five: Object.values(pk.buttons).every((x) => x.box.width > 0), outside: ytOutside, overlapLeft, overflow: pk.overflow, group: pk.group.width });
        if (w === 520) {
          await freshShot();
          await main(M.seek, SHOT_AT);
          await sleep(700);
          await revealControls(page);
          await sleep(300);
          const ov = await iso(I.ov);
          const m2 = await main(M.main);
          const pk2 = await iso(I.peek);
          const maxLine = Math.max(0, ...(ov.lineBoxes ?? []).map((x) => x.width));
          if (scale === 160) check('compact-160: wraps-within-92%-and-above-bar', 'P6-AC8', (ov.lineBoxes ?? []).length > 0 && maxLine <= m2.player.width * 0.92 + 1 && ov.stage.bottom <= m2.chrome.top + 1, { lines: (ov.lineBoxes ?? []).length, maxLine, player: m2.player.width, lineHeights: (ov.lineBoxes ?? []).map((x) => x.height), font: ov.font });
          check(`compact${scale === 160 ? '-160' : ''}: five-in-bar`, 'P6-AC7', pk2.size === 'compact' && Object.values(pk2.buttons).every((x) => x.box.width > 0 && x.box.top >= m2.chrome.top - 1 && x.box.bottom <= m2.chrome.bottom + 1), { size: pk2.size, player: m2.player.width });
          await shoot(`ac7-compact${suffix}`);
        }
      }
      await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
      await sleep(1500);
      if (scale === 100) {
        result.measures.narrow = narrow;
        const compact = narrow.filter((n) => n.size === 'compact');
        check('compact-keeps-all-five', 'P6-AC1', compact.length > 0 && compact.every((n) => n.five), compact.map((n) => ({ player: n.player, five: n.five })));
        const fits = narrow.filter((n) => !n.outside.length && !n.overlapLeft);
        result.measures.smallestFittingPlayer = fits.length ? Math.min(...fits.map((n) => n.player)) : null;
        result.notes.push(`المشغّل الضيق: أصغر عرض مشغّل اتسع فيه الشريط لأدواتنا وأدوات يوتيوب ${result.measures.smallestFittingPlayer ?? 'لا شيء'}px؛ التفاصيل في measures.narrow.`);
      }
      if (scale === 160) {
        const loaded = await iso(I.fonts, fam('markazi'));
        const od = await iso(I.ovDiag);
        check('font-loaded-from-extension-files', 'P6-AC9', loaded.length === 2 && loaded.every((f) => f.status === 'loaded') && od.fonts.active === 'markazi', { faces: loaded, active: od.fonts.active, reads: extensionReads.slice(-6) });
        const ov = await iso(I.ov);
        check('overlay-uses-font-and-160%', 'P6-AC8', /Tarjuman Subtitle Markazi Text/.test(ov.font?.family ?? '') && Math.abs(parseFloat(ov.font?.size) - Math.round((await main(M.main)).player.height * 0.046 * 1.6)) <= 1, { font: ov.font });
      }
    }
    // التحديث دون إعادة تحميل، والبديل عند تعذّر الخط
    const attempts = (await iso(I.ovDiag)).attempts;
    await iso(I.setSettings, { appearance: { font: 'tajawal', scale: 100 } });
    await sleep(2000);
    const od = await iso(I.ovDiag);
    const ov = await iso(I.ov);
    const pk = await iso(I.peek);
    check('settings-change-applies-without-reload', 'P6-AC8', od.attempts === attempts && Math.abs(parseFloat(ov.font?.size) - Math.round((await main(M.main)).player.height * 0.046)) <= 1, { attempts: od.attempts, font: ov.font });
    if (BREAK === 'tajawal') check('broken-font-falls-back-to-embedded-almarai', 'P6-AC9', od.fonts.code === 'CT_FONT_FALLBACK' && od.fonts.active === 'almarai' && ov.lines.length > 0 && !pk.layer.toasts.length, { fonts: { code: od.fonts.code, active: od.fonts.active, failed: od.fonts.failed }, lines: ov.lines.length, toasts: pk.layer.toasts.length });
    await shoot('ac9-fallback-almarai');
    await iso(I.setSettings, { appearance: { font: 'almarai', scale: 100 } });
  }

  const d = await iso(I.diag);
  result.measures.diagnostics = { reinserts: d.session?.reinserts, renderFailures: d.session?.renderFailures, overflows: d.session?.overflows, lastCode: d.session?.lastCode };
  check('no-render-failures', 'P6-AC1', (d.session?.renderFailures ?? 0) === 0, result.measures.diagnostics);
  check('no-external-requests-from-extension', 'P6-AC9', external.length === 0, { external, fontReads: extensionReads.length });
  // رسالة المتصفح عند قراءة سكربت المحتوى ملف خط من حزمة الإضافة (والقراءة ناجحة): تظهر بـuse_dynamic_url ودونه
  // (test/live/controls/font-fetch-diag.mjs)، فتُعدّ وحدها ولا تُحسب خطأً من الإضافة.
  const known = errs.list.filter((x) => x.kind === 'log.security' && FONT_READ_LOG.test(x.text));
  const real = errs.list.filter((x) => !known.includes(x));
  result.errors = real;
  result.measures.fontReadSecurityLogs = { count: known.length, fontReads: extensionReads.length };
  check('no-extension-errors', 'تحضير', real.length === 0, real.slice(0, 3));
} catch (err) {
  result.notes.push(`توقف: ${err.message}`);
  console.error(err);
  try {
    if (page) await shoot('stopped');
  } catch {
    // لا شيء
  }
} finally {
  await b.close();
  await rm(DL, { recursive: true, force: true });
  await rm(FILES, { recursive: true, force: true });
  result.passed = result.checks.filter((c) => !c.ac.includes('معلومة') && !c.id.includes('معلومة')).every((c) => c.ok);
  await writeFile(path.join(OUT, 'live.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n${result.checks.filter((c) => c.ok).length}/${result.checks.length} — ${path.relative(ROOT, path.join(OUT, 'live.json'))}`);
}
