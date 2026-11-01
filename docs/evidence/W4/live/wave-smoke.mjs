#!/usr/bin/env node
// دخان بوابة W4 (المنسّق، بروتوكول «الاختبارات الحية»): الدورة كلها عبر واجهات الموجة المدمجة، بنقرات وضغطات Input حقيقية:
// زر التحميل في الشريط (P6) ← نسخ تعليمات الترجمة من القائمة (P6 بقالب P7) ← المحفوظات ونسخها من الصف (P7) ← زر الرفع
// (P6) بملف عربي بأزمنة الملف المنزَّل نفسه ← المشاهدة (P5) ← الخط والحجم من الإعدادات (P7) وانعكاسهما على الطبقة (P6) ←
// «تعديل» من المحفوظات (P7) ← المحرّر وتعديل نص مقطع وحفظه (P8) ← انعكاس الحفظ في المشغّل المفتوح.
// تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُمرَّر جسم P1 الحقيقي للفيديو نفسه إلى المستخرج عبر خطاف التطوير كما
// في P3 وP6. الحافظة تُستبدل في العالم المعزول وفي صفحة المحفوظات وحدهما (لا تُمسّ حافظة الجهاز)، والتنزيلات إلى مجلد مؤقت
// يُحذف في النهاية. النص العربي اصطناعي، والأدلة بلا رابط ولا نص إنجليزي.
//   npm run build:dev -- --out <مجلد خارج المستودع>
//   node docs/evidence/W4/live/wave-smoke.mjs --ext <مجلد> [--browser brave] [--profile brave-w4] [--headed]
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, sleep } from '../../../../test/live/harness/browser.mjs';
import { attach, collectErrors, openTab, waitForTarget } from '../../../../test/live/harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../../../../test/live/harness/youtube.mjs';
import { createExtractor } from '../../../../src/extract/index.js';
import { buildExport } from '../../../../src/core/export/index.js';
import { parseSrtStrict } from '../../../../src/core/srt/parser.js';
import { subtitleFont } from '../../../../src/ui/subtitle-fonts.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(val('ext', 'dist'));
const OUT = path.join(HERE, '..', browser);
const VIDEO = 'iG9CE55wbtY';
const FIXTURE = path.join(ROOT, 'test/fixtures/json3/manual-ted-iG9CE55wbtY.json');
const NORMAL_NAME = `${VIDEO}.en.manual.normal.srt`;
const AR_NAME = `${VIDEO}.ar.srt`;
const EDITED = 'نص عدّله المحرّر في دخان W4';
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const result = { browser: null, at: new Date().toISOString(), headless: !argv.includes('--headed'), video: VIDEO, checks: [], notes: [], screenshots: [], errors: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
};

// ---- المتوقع في Node: الملف من الجسم نفسه، والتعليمات من الملحق أ حرفيًا (مصدر مستقل عن الشيفرة) ----
const body = await readFile(FIXTURE, 'utf8');
const message = { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VIDEO, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false };
const expectedExport = (title) => {
  const ex = createExtractor({ currentVideoId: () => VIDEO, durationMs: () => 1203421, isLive: () => false });
  ex.handleMessage(message);
  const conv = ex.convert('en|manual', { mode: 'normal' });
  return buildExport({ videoId: VIDEO, title, track: { key: 'en|manual', lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: 'normal', now: Date.now() });
};
const spec = await readFile(path.join(ROOT, 'docs/product-spec.md'), 'utf8');
const TEMPLATE = /```text\n([\s\S]*?)\n```/.exec(spec.slice(spec.indexOf('## ملحق أ')))[1];
const specInstructions = (title) => TEMPLATE.replace('{{video_title}}', () => title ?? 'غير متوفر').replace('{{video_url}}', () => `https://www.youtube.com/watch?v=${VIDEO}`);
const EXP0 = expectedExport(null);
const enCues = parseSrtStrict(EXP0.files[0].text);
// مقاطع مفردة (لا تداخل، 1.5 ث فأكثر) بين الثانية 20 والدقيقة الأولى: الأول للمشاهدة والخط، والثاني للتحرير.
const singles = enCues.map((c, i) => ({ ...c, i })).filter((c) => c.startMs >= 20000 && c.endMs <= 60000 && c.endMs - c.startMs >= 1500
  && (c.i === 0 || enCues[c.i - 1].endMs <= c.startMs) && (c.i === enCues.length - 1 || c.endMs <= enCues[c.i + 1].startMs));
const VIEW = singles[0];
const EDIT = singles.find((c) => c.i >= VIEW.i + 2 && c.i <= 12) ?? singles[1];
const mid = (c) => (c.startMs + c.endMs) / 2000;
const arText = (n) => `هذه ترجمة المقطع ${n} إلى العربية`;

// ---- دوال في العالم المعزول للإضافة على يوتيوب (بناء التطوير) ----
const I = {
  state: () => {
    const h = globalThis.__tarjuman;
    const s = h.controller.getState();
    return {
      videoId: s.videoId, title: s.title ?? null, captured: s.captured.map((t) => ({ key: t.key, ok: t.ok, cueCount: t.cueCount })),
      arabic: s.arabic ? { n: s.arabic.cues.length, fileName: s.arabic.fileName, matched: s.arabic.comparison?.matched ?? null, edited: s.arabic.edited ?? null } : null,
      fingerprints: s.saved?.fingerprints?.length ?? 0, view: s.view, appearance: s.settings.appearance,
      mounted: { overlay: h.mounted.overlay.state, controls: h.mounted.controls.state },
    };
  },
  cueText: (i) => globalThis.__tarjuman.controller.getState().arabic?.cues[i]?.text ?? null,
  peek: () => globalThis.__tarjuman.mounted.controls.peek(),
  ov: () => globalThis.__tarjuman.mounted.overlay.peek(true),
  inject: (msg) => globalThis.__tarjuman.extractor.handleMessage(msg),
  stubClipboard: () => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (t) => {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
        globalThis.__tjCopied = { len: t.length, sha: [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16) };
      },
    });
    return true;
  },
  copied: () => globalThis.__tjCopied ?? null,
};
// ---- في العالم الرئيسي ليوتيوب (ما يراه المستخدم) ----
const M = {
  main: () => {
    const p = document.querySelector('#movie_player');
    const r = p?.getBoundingClientRect();
    return { player: r && { w: Math.round(r.width), h: Math.round(r.height) }, ad: !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')) };
  },
  pause: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.pause(); return v.paused; },
  play: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; return v.play().then(() => true, () => false); },
  bodyHas: (s) => (document.body?.innerText || '').includes(s),
};

const b = await launch({ browser, profile: val('profile', `${browser}-w4`), headless: !argv.includes('--headed') });
result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
console.log(`المتصفح: ${result.browser}`);
const DL = await mkdtemp(path.join(os.tmpdir(), 'tj-w4-dl-'));
const FILES = await mkdtemp(path.join(os.tmpdir(), 'tj-w4-files-'));
let yt;
let isoId;
let extId;
const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
const main = (fn, ...args) => yt.eval(fn, { args });
const front = (page) => b.conn.send('Target.activateTarget', { targetId: page.targetId });
const shoot = async (page, name) => {
  await front(page);
  await sleep(250);
  const f = path.join(OUT, `${name}.png`);
  await page.screenshot(f);
  result.screenshots.push(path.relative(ROOT, f));
};
const center = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
const errorLists = [];
const external = [];
const framesOf = (init) => {
  const out = [];
  if (init?.url) out.push(init.url);
  for (let st = init?.stack; st; st = st.parent) for (const f of st.callFrames ?? []) if (f.url) out.push(f.url);
  return out;
};
/** طلب «من الإضافة وحدها» بقاعدة P1: كل إطارات المستدعي من الإضافة؛ وقراءة ملف من حزمتها (chrome-extension://) ليست شبكة. */
function watchNetwork(page) {
  page.on('Network.requestWillBeSent', (e) => {
    const u = e.request.url;
    if (u.startsWith('chrome-extension://') || u.startsWith('data:') || u.startsWith('blob:')) return;
    const frames = framesOf(e.initiator);
    if (frames.length && frames.every((x) => x.startsWith('chrome-extension://'))) external.push(new URL(u).host);
  });
  return page.send('Network.enable');
}
async function extPage(rel, { targetId = null } = {}) {
  const page = targetId ? await attach(b.conn, targetId) : await openTab(b.conn, `chrome-extension://${extId}/${rel}`);
  errorLists.push({ where: rel, errs: collectErrors(page, { extId }) });
  await watchNetwork(page);
  return page;
}

// ---- أدوات الشريط على يوتيوب: نقرة فأرة حقيقية على الزر أو البند ----
async function clickButton(kind) {
  await front(yt);
  await revealControls(yt);
  const p = await iso(I.peek);
  const c = center(p.buttons[kind].box);
  await yt.click(c.x, c.y);
  await sleep(400);
}
async function clickItem(fid) {
  const p = await iso(I.peek);
  const it = p.layer.menu?.items.find((x) => x.fid === fid);
  if (!it) throw new Error(`لا بند في القائمة: ${fid}`);
  const c = center(it.box);
  await yt.click(c.x, c.y);
  await sleep(400);
}
/** يقفز ويبقى متوقفًا (يوتيوب قد يستأنف التشغيل بعد القفز، فيُعاد الإيقاف حتى يثبت). */
async function seekTo(sec) {
  await front(yt);
  for (let i = 0; i < 4; i++) {
    await main((t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); v.currentTime = t; }, sec);
    await yt.waitFor(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return v && !v.seeking && v.readyState >= 2; }, { timeoutMs: 15000, intervalMs: 150 });
    await sleep(450);
    const st = await main(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return { paused: v.paused, t: v.currentTime }; });
    if (st.paused && Math.abs(st.t - sec) < 0.05) return;
  }
}
// ---- صفحات الإضافة: نقرة فأرة حقيقية على عنصر بمحدده أو بنصه ----
async function clickSel(page, selector) {
  await front(page);
  const c = await page.centerOf(selector);
  if (!c) throw new Error(`عنصر غير ظاهر: ${selector}`);
  await page.click(c.x, c.y);
  await sleep(450);
}
async function clickText(page, root, text) {
  const found = await page.eval((r, t) => {
    document.querySelectorAll('[data-w4-click]').forEach((e) => e.removeAttribute('data-w4-click'));
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const el = [...(document.querySelector(r)?.querySelectorAll('button, a, summary, label') ?? [])]
      .find((e) => norm(e.textContent).startsWith(t) || e.getAttribute('aria-label')?.startsWith(t));
    if (!el) return false;
    el.setAttribute('data-w4-click', '1');
    return true;
  }, { args: [root, text] });
  if (!found) throw new Error(`لا عنصر «${text}» في ${root}`);
  await clickSel(page, '[data-w4-click]');
}

// ---- التنزيلات ومنتقي الملفات ----
const downloads = new Map();
b.conn.on('Browser.downloadProgress', (p) => downloads.set(p.guid, p.state));
b.conn.on('Browser.downloadWillBegin', (p) => downloads.set(p.guid, 'begin'));
async function waitDownloads(count, since) {
  for (let i = 0; i < 60; i++) {
    if ([...downloads.values()].filter((s) => s === 'completed').length >= since + count) break;
    await sleep(250);
  }
  return (await readdir(DL)).filter((n) => !n.endsWith('.crdownload')).sort();
}
let nextUpload = null;
async function armChooser(page) {
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
  if (!(await main(M.main)).ad) return 'none';
  result.notes.push('إعلان حقيقي صودف على الصفحة؛ انتُظر انتهاؤه (والتخطي بنقرة متى ظهر الزر).');
  const ended = await yt.waitFor(() => {
    const p = document.querySelector('#movie_player');
    const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
    if (skip && getComputedStyle(skip).display !== 'none') skip.click();
    return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
  }, { timeoutMs: 150000, intervalMs: 1000 });
  return ended ? 'ended' : 'stuck';
}
async function openVideo() {
  for (let attempt = 0; attempt < 3; attempt++) {
    await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
    await dismissConsent(yt).catch(() => false);
    await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
    let ready = await waitForPlayer(yt, VIDEO, 15000);
    if (!ready) {
      await main(M.play);
      ready = await waitForPlayer(yt, VIDEO, 25000);
    }
    if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
    await sleep(1500);
    isoId = yt.isolatedContextId(extId);
    if (!isoId) throw new Error('لا سياق معزول للإضافة');
    if ((await settleAds()) !== 'stuck') {
      await main(M.pause);
      await yt.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 10000 });
      return ready;
    }
  }
  throw new Error('سلسلة إعلانات لا تنتهي');
}

try {
  if (!VIEW || !EDIT) throw new Error('لا مقاطع مفردة للقياس');
  await mkdir(OUT, { recursive: true });
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  extId = ext.id;
  await b.conn.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });

  // تخزين فارغ وإعدادات افتراضية في كل تشغيل (ملف الاختبار يبقى بين التشغيلات).
  const blank = await extPage('pages/settings/index.html');
  await blank.waitFor(() => document.querySelector('.st-card'), { timeoutMs: 10000 });
  await blank.eval(() => chrome.storage.local.clear());
  await blank.close();

  yt = await openTab(b.conn, 'about:blank');
  await yt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  const ytErrs = collectErrors(yt, { extId, onlyExtension: true });
  await watchNetwork(yt);
  await armChooser(yt);
  const ready = await openVideo();
  const s0 = await iso(I.state);
  check('watch-page-tools-mounted', !!ready && s0.videoId === VIDEO && s0.mounted.controls === 'mounted' && ['waiting', 'mounted'].includes(s0.mounted.overlay), { mounted: s0.mounted });

  // ===== ١. التحميل من الزر (P6 ← P3) =====
  await clickButton('download');
  const acc = await iso(I.inject, message);
  await sleep(600);
  let pk = await iso(I.peek);
  check('download-menu-shows-captured-track', acc.accepted && /English – يدوي، 427 مقطعًا/.test(pk.layer.menu?.text ?? ''), { accepted: acc.accepted, label: pk.layer.menu?.label });
  await shoot(yt, 'w4-download-menu');
  const before = [...downloads.values()].filter((s) => s === 'completed').length;
  await clickItem('download');
  const names = await waitDownloads(1, before);
  const got = names.includes(NORMAL_NAME) ? await readFile(path.join(DL, NORMAL_NAME), 'utf8') : null;
  await sleep(600);
  const s1 = await iso(I.state);
  const EXP = expectedExport(s1.title);
  check('download-file-bytes-match-buildExport', got === EXP.files[0].text && s1.fingerprints === 1, { name: NORMAL_NAME, bytes: got && Buffer.byteLength(got), expected: Buffer.byteLength(EXP.files[0].text), fingerprints: s1.fingerprints });

  // ===== ٢. نسخ تعليمات الترجمة من القائمة (P6 بقالب P7) =====
  const expectInstr = specInstructions(s1.title);
  await iso(I.stubClipboard);
  await clickItem('copy');
  await sleep(500);
  const fromMenu = await iso(I.copied);
  pk = await iso(I.peek);
  const shown = [pk.layer.menu?.text ?? '', ...pk.layer.toasts.map((t) => t.text)].some((t) => t.includes(expectInstr.slice(0, 40))) || (await main(M.bodyHas, expectInstr.slice(0, 40)));
  check('copy-instructions-from-menu-is-appendix-a', fromMenu?.sha === sha(expectInstr) && fromMenu.len === expectInstr.length && EXP.instructions === expectInstr, { copied: fromMenu, expected: { len: expectInstr.length, sha: sha(expectInstr) }, title: s1.title ? 'محفوظ' : null });
  check('instructions-not-displayed-on-youtube', !shown && pk.layer.toasts.some((t) => t.text.includes('نُسخت تعليمات الترجمة')), { toasts: pk.layer.toasts.map((t) => t.text) });
  await clickButton('download');

  // ===== ٣. المحفوظات: الصف الجديد، ونسخ تعليماته من الصف (P7) =====
  const lib = await extPage('pages/library/index.html');
  await lib.waitFor(() => document.querySelector('li.lib-row'), { timeoutMs: 10000 });
  const row = await lib.eval((v) => [...document.querySelectorAll('li.lib-row')].findIndex((r) => r.textContent.includes(v)) + 1, { args: [VIDEO] });
  const rowSel = `ul.lib-list > li:nth-child(${row})`;
  await lib.eval(() => Object.defineProperty(navigator.clipboard, 'writeText', {
    configurable: true,
    value: async (t) => {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
      globalThis.__tjCopied = { len: t.length, sha: [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16) };
    },
  }));
  await clickSel(lib, `${rowSel} .lib-copy__button`);
  const okState = await lib.waitFor((s) => document.querySelector(s)?.getAttribute('data-state') === 'success', { args: [`${rowSel} .lib-copy__button`], timeoutMs: 4000, intervalMs: 80 });
  const fromLib = await lib.eval(() => globalThis.__tjCopied ?? null);
  check('library-row-for-downloaded-video', row > 0, { row });
  check('copy-instructions-from-library-same-as-menu', !!okState && fromLib?.sha === fromMenu?.sha && fromLib?.sha === sha(expectInstr), { library: fromLib, menu: fromMenu });
  await shoot(lib, 'w4-library-copied');

  // ===== ٤. الرفع من الزر بملف عربي بأزمنة الملف المنزَّل (P6 ← P4) =====
  const blocks = got.trim().split(/\n\n+/).map((blk) => {
    const [n, time] = blk.split('\n');
    return `${n}\n${time}\n${arText(n)}`;
  });
  const arFile = path.join(FILES, AR_NAME);
  await writeFile(arFile, `${blocks.join('\n\n')}\n`);
  nextUpload = [arFile];
  await clickButton('upload');
  await sleep(1500);
  const s2 = await iso(I.state);
  pk = await iso(I.peek);
  check('upload-loads-and-matches-fingerprint', s2.arabic?.n === 427 && s2.arabic.matched === true && s2.arabic.fileName === AR_NAME && /مطابق للأصل ✓/.test(pk.layer.menu?.text ?? ''), { arabic: s2.arabic, menu: pk.layer.menu?.label });
  if (pk.layer.menu) await clickButton('upload');

  // ===== ٥. المشاهدة: المقطع الظاهر هو مقطع الملف لزمنه (P5) =====
  await seekTo(mid(VIEW));
  await sleep(500);
  const ov0 = await iso(I.ov);
  const m0 = await main(M.main);
  const base = subtitleFont('almarai').family;
  const px = (scale) => Math.round(m0.player.h * 0.046 * (scale / 100));
  check('watch-shows-file-cue-rtl', !ov0.hidden && ov0.lines.length === 1 && ov0.lines[0].text === arText(VIEW.n) && ov0.lines[0].dir === 'rtl', { t: mid(VIEW), lines: ov0.lines.map((l) => ({ kind: l.kind, dir: l.dir, ok: l.text === arText(VIEW.n) })) });
  check('overlay-default-almarai-100', s2.appearance.font === 'almarai' && s2.appearance.scale === 100 && (ov0.font?.family ?? '').includes(base) && Math.abs(parseFloat(ov0.font?.size) - px(100)) <= 1, { appearance: s2.appearance, font: ov0.font, expectPx: px(100) });
  await shoot(yt, 'w4-watch-almarai-100');

  // ===== ٦. الخط والحجم من الإعدادات (P7) وانعكاسهما على المشغّل (P6) =====
  const st = await extPage('pages/settings/index.html');
  await st.waitFor(() => document.querySelectorAll('.st-card').length >= 7, { timeoutMs: 10000 });
  await clickText(st, '.st-fonts', 'مركزي');
  await st.waitFor(() => document.querySelector('.st-saved--success'), { timeoutMs: 4000, intervalMs: 80 });
  await clickSel(st, '.st-scale__input');
  await st.key('End', 'End', 35);
  await sleep(400);
  // في منزلق RTL يُنقص السهم الأيمن القيمة (الحد الأدنى على اليمين)، وفي LTR الأيسر.
  const rtl = await st.eval(() => getComputedStyle(document.querySelector('.st-scale__input')).direction === 'rtl');
  const [dk, dc] = rtl ? ['ArrowRight', 39] : ['ArrowLeft', 37];
  for (let i = 0; i < 6; i++) {
    await st.key(dk, dk, dc);
    await sleep(250);
  }
  await sleep(900);
  const stored = await st.eval(async () => ({ app: (await chrome.storage.local.get('settings')).settings.appearance, out: document.querySelector('.st-scale__value')?.textContent }));
  check('settings-font-and-scale-saved-from-ui', stored.app.font === 'markazi' && stored.app.scale === 130 && stored.out === '130%', stored);
  await shoot(st, 'w4-settings-markazi-130');
  await front(yt);
  const markazi = subtitleFont('markazi').family;
  const reflected = await yt.waitFor((fam) => {
    const f = globalThis.__tarjuman.mounted.overlay.peek(true)?.font;
    return f && (f.family ?? '').includes(fam) ? f : null;
  }, { contextId: isoId, args: [markazi], timeoutMs: 6000, intervalMs: 150 });
  await seekTo(mid(VIEW));
  const ov1 = await iso(I.ov);
  const s3 = await iso(I.state);
  check('font-and-scale-reflected-on-player-without-reload', !!reflected && (ov1.font?.family ?? '').includes(markazi) && Math.abs(parseFloat(ov1.font?.size) - px(130)) <= 1 && ov1.lines[0]?.text === arText(VIEW.n)
    && s3.appearance.font === 'markazi' && s3.appearance.scale === 130, { font: ov1.font, expectPx: px(130), appearance: s3.appearance });
  await shoot(yt, 'w4-watch-markazi-130');

  // ===== ٧. «تعديل» من المحفوظات (P7) ← المحرّر وحفظ (P8) =====
  await lib.reload();
  await lib.waitFor(() => document.querySelector('li.lib-row'), { timeoutMs: 10000 });
  const known = new Set((await b.conn.send('Target.getTargets')).targetInfos.map((t) => t.targetId));
  await clickText(lib, rowSel, 'تعديل');
  const edTarget = await waitForTarget(b.conn, (u) => u === `chrome-extension://${extId}/pages/editor/index.html?v=${VIDEO}`, { exclude: known });
  check('editor-opened-from-library', !!edTarget);
  if (!edTarget) throw new Error('لم يُفتح المحرّر من المحفوظات');
  const ed = await extPage('pages/editor/index.html', { targetId: edTarget.targetId });
  await ed.waitFor(() => Boolean(globalThis.__tarjumanEditor && document.querySelector('.ed-row[data-index]')), { timeoutMs: 15000 });
  const field = `.ed-row[data-index="${EDIT.i}"] [data-field="text"]`;
  const before1 = await ed.eval((s) => document.querySelector(s)?.value ?? null, { args: [field] });
  await clickSel(ed, field);
  await ed.eval((s) => document.querySelector(s)?.select?.(), { args: [field] });
  await ed.send('Input.insertText', { text: EDITED });
  await sleep(400);
  const dirty = await ed.eval(() => ({ status: document.querySelector('.ed-status')?.textContent.trim(), title: document.title }));
  await clickText(ed, '.ed-head', 'حفظ');
  const saved = await ed.waitFor(() => document.querySelector('.ed-status')?.textContent.trim() === 'محفوظ ✓', { timeoutMs: 6000, intervalMs: 150 });
  const rec = await iso(async (v, i) => {
    const r = await globalThis.__tarjuman.store.getVideo(v);
    return { current: r?.arabic?.current?.[i]?.text ?? null, original: r?.arabic?.original?.[i]?.text ?? null };
  }, VIDEO, EDIT.i);
  check('editor-edit-and-save', before1 === arText(EDIT.n) && /تغييرات غير محفوظة/.test(dirty.status ?? '') && !!saved && rec.current === EDITED && rec.original === arText(EDIT.n),
    { before: before1 === arText(EDIT.n), dirty: dirty.status, saved: !!saved, current: rec.current === EDITED, originalKept: rec.original === arText(EDIT.n) });
  // النص الإنجليزي الحقيقي لا يدخل الأدلة: عموده يُخفى بنقرة «إظهار الإنجليزي» قبل اللقطة (كما في P8).
  await clickSel(ed, 'label.ed-toggle');
  const enHidden = await ed.eval(() => document.querySelector('.ed-list').classList.contains('ed-list--no-en'));
  if (!enHidden) throw new Error('لم يُخفَ عمود الإنجليزي قبل اللقطة');
  await shoot(ed, 'w4-editor-saved');

  // ===== ٨. انعكاس الحفظ في المشغّل المفتوح =====
  await front(yt);
  const inState = await yt.waitFor((i, t) => globalThis.__tarjuman.controller.getState().arabic?.cues[i]?.text === t, { contextId: isoId, args: [EDIT.i, EDITED], timeoutMs: 6000, intervalMs: 150 });
  await seekTo(mid(EDIT));
  await sleep(400);
  const ov2 = await iso(I.ov);
  const s4 = await iso(I.state);
  check('save-reflected-in-player-overlay', !!inState && s4.arabic?.edited === true && ov2.lines.length === 1 && ov2.lines[0].text === EDITED && (ov2.font?.family ?? '').includes(markazi),
    { inState: !!inState, edited: s4.arabic?.edited, shown: ov2.lines.map((l) => l.text === EDITED), font: ov2.font?.family?.split(',')[0] ?? null });
  await shoot(yt, 'w4-player-after-save');

  // ===== الأخطاء والشبكة =====
  await sleep(500);
  ytErrs.stop();
  const FONT_READ_LOG = /^Unsafe attempt to load URL chrome-extension:\/\/[^/]+\/ui\/fonts\/subtitle\/[a-z0-9-]+-(?:400|700)\.woff2 /;
  const fontReads = ytErrs.list.filter((x) => x.kind === 'log.security' && FONT_READ_LOG.test(x.text));
  if (fontReads.length) result.notes.push(`رسائل قراءة خطوط الترجمة من حزمة الإضافة (معروفة من P6، غير محسوبة أخطاءً): ${fontReads.length}`);
  for (const e of errorLists) e.errs.stop();
  result.errors = { youtube: ytErrs.list.filter((x) => !fontReads.includes(x)), pages: errorLists.flatMap((e) => e.errs.list.map((x) => ({ where: e.where, ...x }))) };
  check('no-extension-errors', !result.errors.youtube.length && !result.errors.pages.length, { youtube: result.errors.youtube.length, pages: result.errors.pages.length });
  check('no-network-from-extension', external.length === 0, { external: external.length });
} catch (err) {
  check('run-aborted', false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
} finally {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'wave-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
  await b.close();
  await rm(DL, { recursive: true, force: true });
  await rm(FILES, { recursive: true, force: true });
}
const failed = result.checks.filter((c) => !c.ok);
console.log(`\nالنتيجة: ${result.checks.length - failed.length}/${result.checks.length}`);
process.exit(failed.length ? 1 : 0);
