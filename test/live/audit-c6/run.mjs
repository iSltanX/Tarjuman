#!/usr/bin/env node
// الاختبار الحي لمرحلة C6 من خطة إصلاح تدقيق 7a66f91 (أسطح المشغّل) على يوتيوب الحقيقي، بلا نافذة
// وبصوت مكتوم وملف تعريف مؤقت وحساب غير مسجَّل (قرار سلطان Q05)، في Brave وChrome وEdge (CDP) وFirefox (WebDriver BiDi). ببناء
// التطوير للهدف وجسر الحزام (src/dev/harness-bridge.js). كل فعل نقرة أو مفتاح حقيقي، والتركيز يدخل الشريط بلوحة المفاتيح من زر
// يوتيوب الذي يلي مجموعة ترجمان (Shift+Tab)، فلا حاجة إلى اختراق الجذور المغلقة. يقيس:
//   roles       النوافذ الأربع dialog وأزرارها aria-haspopup="dialog" (U44).
//   font        خط الرسالة العابرة وحجمها كخط القائمة المفتوحة كما يحسبهما المتصفح (U42).
//   undo        «تراجع» بلوحة المفاتيح، وبعد انقضاء مهلته التركيز على «الترجمة» في الشريط لا على الصفحة (U88).
//   tabout      Tab من آخر بند في قائمة التوقيت يغلقها ويبقى التركيز حيث ذهب (U46).
//   tip         Esc والمؤشر فوق الزر يُخفي التلميح، والمرور من الزر إلى التلميح لا يخفيه (U89).
//   panel       لوحة النص: نقطة Tab واحدة والأسهم بين الصفوف، والتركيز بلوحة المفاتيح يوقف المتابعة، وlang (U45، U48).
//   gap         فجوة أقصر من 80 م.ث بعد المقطع الظاهر لا تفرّغ الطبقة (U49، CL-X1).
//   timing      قائمة التوقيت لا تتراكب مع سطر الترجمة عند عرض 1280 و1920 (U49، P-11).
// --tree <commit> يبني ذلك الالتزام بدل الشجرة الحالية (لقطات «قبل» ومقارنة القياس؛ الفحوص فيه متوقعٌ سقوطها).
//   command node test/live/audit-c6/run.mjs --browser chrome|brave|edge|firefox --out <مجلد> [--tree 1396fcc] [--headed]
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { APPS, bridge, startBrowser } from '../stores/driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'chrome');
if (!APPS[browser]) throw new Error(`متصفح غير معروف: ${browser}`);
const TARGET = browser === 'firefox' ? 'firefox' : 'chromium';
const TREE = val('tree', null);
/** خطوات بعينها وحدها (للتشخيص)؛ ويوتيوب والرفع دائمًا. */
const ONLY = val('only', null)?.split(',') ?? null;
const HEADLESS = !argv.includes('--headed');
const OUT = path.resolve(val('out', path.join(os.tmpdir(), 'tj-c6-live')), `${browser}${TREE ? `-${TREE}` : ''}`);
const VIDEO = 'iG9CE55wbtY';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
const TMP = await mkdtemp(path.join(os.tmpdir(), 'tj-c6-live-'));
const EXT = path.join(TMP, 'ext');
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const AR_FILE = path.join(ROOT, 'test/e2e/fixtures/iG9CE55wbtY.en.manual.normal.ar.srt');
const AR = parseSrtLenient(await readFile(AR_FILE, 'utf8')).cues;
// مقطع بسطرين بعد الدقيقة الأولى، ومقطع يليه تالٍ بعد فجوة أقصر من 80 م.ث (CL-X1).
const TWO = AR.find((c) => c.text.includes('\n') && c.startMs > 60000 && c.endMs - c.startMs >= 2000);
const GAP = AR.find((c, i) => c.startMs > 60000 && AR[i + 1] && AR[i + 1].startMs - c.endMs > 20 && AR[i + 1].startMs - c.endMs < 80);
const GAP_NEXT = AR[AR.indexOf(GAP) + 1];
const ISOLATES = new RegExp(`[${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}]`, 'g');
const clean = (x) => String(x ?? '').replace(ISOLATES, '').replace(/\s+/g, ' ').trim();
const rel = (f) => path.relative(ROOT, f);

const result = { browser, tree: TREE ?? 'current', at: new Date().toISOString(), headless: HEADLESS, version: null, checks: [], measures: {}, notes: [], screenshots: [] };
/** ok: true نجح، false فشل، null لم يُقَس (والسبب في التفصيل). */
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok, detail });
  console.log(`${ok === null ? '·' : ok ? '✓' : '✗'} ${id}${detail !== null ? ` — ${JSON.stringify(detail).slice(0, 360)}` : ''}`);
};
async function step(name, fn) {
  if (ONLY && !['youtube', 'arabic'].includes(name) && !ONLY.some((o) => name.startsWith(o))) return;
  try {
    await fn();
  } catch (err) {
    check(name, false, { error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
  }
}

// ---- الشجرة المبنية: الحالية، أو التزام سابق (git archive) ----
async function treeRoot() {
  if (!TREE) return ROOT;
  const dir = path.join(TMP, 'tree');
  await mkdir(dir, { recursive: true });
  const tar = path.join(TMP, 'tree.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, TREE], { cwd: ROOT });
  execFileSync('tar', ['-xf', tar, '-C', dir]);
  await symlink(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  return dir;
}

let s = null;
let yt = null;
const call = async (op, args = [], ms) => {
  const r = await bridge(yt, op, args, ms);
  if (!r.ok) throw new Error(`الجسر ${op}: ${r.error}`);
  return r.value;
};
const waitBridge = async (op, pred, { timeoutMs = 12000, args = [] } = {}) => {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    const r = await bridge(yt, op, args, 4000).catch(() => null);
    if (r?.ok) {
      last = r.value;
      if (pred(last)) return last;
    }
    await sleep(250);
  }
  return null;
};
const peek = () => call('peek');
const centerBox = (b) => ({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) });
const activeId = () => yt.eval(() => document.activeElement?.id || document.activeElement?.tagName || null);

// ---- لوحة المفاتيح: Chromium بـInput.dispatchKeyEvent، وFirefox بـinput.performActions ----
const CDP_KEYS = { Tab: ['Tab', 9], Enter: ['Enter', 13, '\r'], Escape: ['Escape', 27], ArrowDown: ['ArrowDown', 40], ArrowUp: ['ArrowUp', 38], Home: ['Home', 36], End: ['End', 35] };
const WD = (n) => String.fromCharCode(n);
const BIDI_KEYS = { Tab: WD(0xE004), Enter: WD(0xE007), Escape: WD(0xE00C), ArrowDown: WD(0xE015), ArrowUp: WD(0xE013), Home: WD(0xE011), End: WD(0xE010) };
async function key(name, { shift = false } = {}) {
  if (s.kind === 'chromium') {
    const [k, code, text] = CDP_KEYS[name];
    const mod = shift ? 8 : 0;
    if (shift) await yt.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
    await yt.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, modifiers: mod, ...(text ? { text, unmodifiedText: text } : {}) });
    await yt.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code, modifiers: mod });
    if (shift) await yt.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
  } else {
    const v = BIDI_KEYS[name];
    const actions = shift
      ? [{ type: 'keyDown', value: WD(0xE008) }, { type: 'keyDown', value: v }, { type: 'keyUp', value: v }, { type: 'keyUp', value: WD(0xE008) }]
      : [{ type: 'keyDown', value: v }, { type: 'pause', duration: 30 }, { type: 'keyUp', value: v }];
    await yt.conn.send('input.performActions', { context: yt.context, actions: [{ type: 'key', id: 'keyboard', actions }] });
    await yt.conn.send('input.releaseActions', { context: yt.context });
  }
  await sleep(180);
}

/** نافذة العرض: CDP في Chromium، ونافذة المتصفح نفسها في Firefox مع تصحيح الفرق (كما في audit-c3). */
async function setViewport(w, h) {
  if (s.kind === 'chromium') {
    await yt.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(900);
    return;
  }
  const { contexts } = await yt.conn.send('browsingContext.getTree', { root: yt.context, maxDepth: 0 });
  const clientWindow = contexts[0].clientWindow;
  let size = [w, h];
  for (let i = 0; i < 3; i++) {
    await yt.conn.send('browser.setClientWindowState', { clientWindow, state: 'normal', width: size[0], height: size[1] });
    await sleep(700);
    const [iw, ih] = await yt.eval(() => [innerWidth, innerHeight]);
    if (iw === w && ih === h) break;
    const next = [Math.max(400, size[0] + (w - iw)), Math.max(300, size[1] + (h - ih))];
    if (next[0] === size[0] && next[1] === size[1]) break;
    size = next;
  }
}

// ---- يوتيوب: الإعلان والزمن والنقر ----
const M = {
  mute: () => { const v = document.querySelector('#movie_player video.html5-main-video'); if (!v) return false; v.muted = true; v.pause(); return v.paused; },
  play: () => { const v = document.querySelector('#movie_player video.html5-main-video'); if (!v) return false; v.muted = true; v.play().catch(() => {}); return true; },
  // يوتيوب بلا نافذة لا يحمّل الوسائط، فبعد دقائق يصير readyState صفرًا ولا يطلق تغيير currentTime حدث seeking (ثبت بتشخيص المحرّك:
  // نافذته باقية عند بداية الملف): يُطلق timeupdate كما يطلقه المتصفح بعد قفز في وسائط محمّلة، ويُعاد readyState ليُسجَّل.
  seek: (t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.pause(); v.currentTime = t; const rs = v.readyState; if (rs < 1) v.dispatchEvent(new Event('timeupdate')); return rs; },
  time: () => document.querySelector('#movie_player video.html5-main-video')?.currentTime ?? -1,
  isAd: () => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); },
  skipBox: () => {
    const b = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
    const r = b?.getBoundingClientRect();
    return r && r.width > 0 ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
  },
};
async function waitAdEnd(timeoutMs = 150000) {
  const end = Date.now() + timeoutMs;
  let seen = false;
  while (Date.now() < end) {
    if (!(await yt.eval(M.isAd))) {
      if (seen) await yt.eval(M.mute);
      return { seen };
    }
    seen = true;
    await yt.eval(M.play);
    const c = await yt.eval(M.skipBox);
    if (c) await yt.click(c.x, c.y);
    await sleep(1500);
  }
  return { seen, stuck: true };
}
const seeksUnloaded = { count: 0 };
async function stableSeek(t) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if ((await yt.eval(M.seek, { args: [t] })) < 1) seeksUnloaded.count += 1;
    let ok = true;
    for (let i = 0; i < 4; i++) {
      await sleep(350);
      if (Math.abs((await yt.eval(M.time)) - t) > 0.05) { ok = false; break; }
    }
    if (ok) return attempt + 1;
  }
  return 0;
}
const hostAt = (c) => yt.eval((x, y) => {
  const e = document.elementFromPoint(x, y);
  return e?.closest?.('[id^="tarjuman-"]')?.id ?? (e ? `${e.tagName}#${e.id}.${String(e.className).slice(0, 60)}` : null);
}, { args: [c.x, c.y] });
/** نافذة ترويج يوتيوب (yt-mealbar-promo-renderer) فوق زاوية المشغّل: تُغلق بزرها نقرة حقيقية (كما في t3). */
async function dismissPromo() {
  const c = await yt.eval(() => {
    const promo = document.querySelector('yt-mealbar-promo-renderer, tp-yt-paper-dialog');
    if (!promo || !promo.getClientRects().length) return null;
    const btn = promo.querySelector('#dismiss-button button, #dismiss-button, button[aria-label]');
    const r = btn?.getBoundingClientRect();
    return r && r.width ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
  });
  if (!c) return false;
  await yt.click(c.x, c.y);
  await sleep(700);
  result.notes.push('أُغلقت نافذة ترويج يوتيوب فوق المشغّل');
  return true;
}
async function clickBar(kind, { menu = false } = {}) {
  let under = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await dismissPromo();
    await revealControls(yt);
    await sleep(400);
    const p = await peek();
    const box = p?.buttons[kind]?.box;
    if (!box) throw new Error(`زر ${kind} غير ظاهر`);
    const c = centerBox(box);
    under = await hostAt(c);
    if (!String(under).startsWith('tarjuman-')) {
      // المؤشر يحرّك الشريط فيظهر فوق ما يغطيه: حركة قريبة ثم محاولة.
      await yt.mouseMove(c.x, c.y - 120);
      await sleep(600);
      continue;
    }
    await yt.click(c.x, c.y);
    await sleep(450);
    if (!menu || (await waitBridge('peek', (x) => !!x?.layer.menu, { timeoutMs: 2500 }))) return;
  }
  throw new Error(`تعذّرت نقرة ${kind}: تحت مركزه ${under}`);
}
async function clickItem(fid) {
  const m = (await peek()).layer.menu;
  const it = m?.items.find((x) => x.fid === fid);
  if (!it) throw new Error(`لا بند ${fid}`);
  const c = centerBox(it.box);
  await yt.click(c.x, c.y);
  await sleep(450);
}
async function closeAll() {
  for (let i = 0; i < 3 && (await peek())?.layer.menu; i++) await key('Escape');
  await yt.eval(() => { document.activeElement?.blur?.(); return true; });
}
/** التركيز إلى زر الشريط kind بلوحة المفاتيح: أول زر ليوتيوب بعد مجموعة ترجمان، ثم Shift+Tab حتى يصله. */
async function focusBar(kind) {
  await revealControls(yt);
  const ok = await yt.eval(() => {
    const g = document.getElementById('tarjuman-controls');
    for (let n = g?.nextElementSibling; n; n = n.nextElementSibling) {
      const b = n.matches('button') ? n : n.querySelector('button');
      if (b && b.getClientRects().length) { b.focus(); return document.activeElement === b; }
    }
    return false;
  });
  if (!ok) throw new Error('لا زر ليوتيوب بعد مجموعة ترجمان');
  for (let i = 0; i < 9; i++) {
    await key('Tab', { shift: true });
    if ((await peek())?.focusedKind === kind) return i + 1;
  }
  throw new Error(`لم يصل التركيز إلى ${kind}: ${(await peek())?.focusedKind}`);
}
async function shot(name) {
  const f = path.join(OUT, `${name}.png`);
  try {
    await yt.screenshot(f);
    result.screenshots.push(rel(f));
  } catch (err) {
    result.notes.push(`لقطة ${name}: ${String(err.message).slice(0, 100)}`);
  }
}
const overlaps = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// ================================================================ التشغيل
await mkdir(OUT, { recursive: true });
const tree = await treeRoot();
execFileSync(process.execPath, [path.join(tree, 'scripts/build.mjs'), '--dev', '--target', TARGET, '--out', EXT], { cwd: tree, stdio: 'ignore' });
const profile = `${browser}-c6-${RUN}`;
try {
  s = await startBrowser(browser, { profile, ext: EXT, downloadDir: path.join(TMP, 'dl'), headless: HEADLESS });
  result.version = s.version;
  check('install', !!s.extensionId, { version: s.version });

  await step('youtube', async () => {
    yt = await s.youtube(WATCH);
    await sleep(4000);
    await dismissConsent(yt).catch(() => false);
    const player = await waitForPlayer(yt, VIDEO, 45000);
    result.notes.push(`إعلان عند الفتح: ${JSON.stringify(await waitAdEnd())}`);
    await yt.eval(M.mute);
    await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
    if (s.kind === 'firefox') await s.learnBase(yt);
    const mounted = await waitBridge('state', (v) => v.mounted.controls === 'mounted' && v.mounted.overlay === 'mounted', { timeoutMs: 20000 });
    await setViewport(1280, 800);
    check('mounted', !!player && !!mounted, { mounted: mounted?.mounted ?? null });
  });

  await step('arabic', async () => {
    const armed = yt.armChooser([AR_FILE]);
    await clickBar('upload');
    const filled = await armed;
    const st = await waitBridge('state', (v) => v.arabic?.count === AR.length, { timeoutMs: 20000 });
    await stableSeek((TWO.startMs + TWO.endMs) / 2000);
    const lines = await waitBridge('overlay', (l) => l.length > 0, { timeoutMs: 10000 });
    check('arabic-shown', filled && !!st && !!lines, { arabic: st?.arabic?.count ?? null, lines: lines?.length ?? null });
  });

  // ---- U44 ----
  await step('roles', async () => {
    await waitAdEnd();
    const p = await peek();
    const popups = Object.fromEntries(['download', 'upload', 'badge'].map((k) => [k, p.buttons[k].popup]));
    const roles = {};
    for (const [kind, name] of [['download', 'download'], ['upload', 'display'], ['badge', 'timing']]) {
      await clickBar(kind, { menu: true });
      roles[name] = (await peek()).layer.role;
      await closeAll();
    }
    check('roles-dialog', Object.values(popups).every((x) => x === 'dialog') && Object.values(roles).every((x) => x === 'dialog'), { popups, roles });
  });

  // ---- U42 ----
  await step('font', async () => {
    await stableSeek((TWO.startMs + TWO.endMs) / 2000);
    await clickBar('upload', { menu: true });
    await clickItem('mark');
    const p = await waitBridge('peek', (x) => x.layer.toasts.length > 0 && !!x.layer.menu, { timeoutMs: 6000 });
    const f = p?.layer.fonts ?? null;
    result.measures.font = f;
    await shot('font-toast-and-menu');
    check('toast-font-matches-menu', !!f?.toast && !!f?.menu && f.toast.family === f.menu.family && f.toast.size === f.menu.size && /Tarjuman UI/.test(f.toast.family), f);
    await closeAll();
    await waitBridge('peek', (x) => x.layer.toasts.length === 0, { timeoutMs: 9000 });
  });

  // ---- U88 ----
  await step('undo', async () => {
    await waitAdEnd();
    await stableSeek((TWO.startMs + TWO.endMs) / 2000);
    const n = await focusBar('upload');
    await key('Enter');
    const open = await waitBridge('peek', (x) => !!x.layer.menu && !!x.layer.focused, { timeoutMs: 4000 });
    let fid = open?.layer.focusedFid ?? null;
    for (let i = 0; i < 12 && fid !== 'mark'; i++) {
      await key('Tab');
      fid = (await peek()).layer.focusedFid;
    }
    if (fid !== 'mark') throw new Error(`لم يصل Tab إلى «علّم»: ${fid}`);
    await key('Enter');
    await waitBridge('peek', (x) => x.layer.toasts.some((t) => /تراجع/.test(t.text)), { timeoutMs: 5000 });
    let onAct = false;
    for (let i = 0; i < 8 && !onAct; i++) {
      await key('Tab');
      onAct = (await peek()).layer.focused?.cls === 'act';
    }
    const menuStill = !!(await peek()).layer.menu;
    await sleep(7000);
    const after = await peek();
    const id = await activeId();
    result.measures.undo = { shiftTabs: n, onAct, menuStill, after: { focusedKind: after.focusedKind, active: id, toasts: after.layer.toasts.length } };
    check('undo-focus-returns-to-bar', onAct && after.layer.toasts.length === 0 && id === 'tarjuman-controls' && after.focusedKind === 'upload', result.measures.undo);
    await closeAll();
  });

  // ---- U46 ----
  await step('tabout', async () => {
    await waitAdEnd();
    await focusBar('badge');
    await key('Enter');
    const open = await waitBridge('peek', (x) => !!x.layer.menu && !!x.layer.focused, { timeoutMs: 4000 });
    let id = await activeId();
    let tabs = 0;
    for (; tabs < 30 && id === 'tarjuman-controls-layer'; tabs++) {
      await key('Tab');
      id = await activeId();
    }
    await sleep(400);
    const p = await peek();
    check('dialog-closes-when-focus-leaves', !!open && id !== 'tarjuman-controls-layer' && !p.layer.menu && p.buttons.badge.expanded === 'false', { opened: !!open, tabs, focusNow: id, menu: !!p.layer.menu });
    await closeAll();
  });

  // ---- U89 ----
  await step('tip', async () => {
    await closeAll();
    await revealControls(yt);
    const p = await peek();
    const c = centerBox(p.buttons.download.box);
    await yt.mouseMove(c.x, c.y);
    const shown = await waitBridge('peek', (x) => !!x.layer.tip, { timeoutMs: 6000 });
    await sleep(300);
    await key('Escape');
    const afterEsc = (await peek()).layer.tip;
    await yt.mouseMove(c.x, c.y - 200);
    await sleep(700);
    await revealControls(yt);
    await yt.mouseMove(c.x, c.y);
    const again = await waitBridge('peek', (x) => !!x.layer.tipBox, { timeoutMs: 3000 });
    const t = again ? centerBox(again.layer.tipBox) : null;
    // حركة واحدة مباشرة من الزر إلى التلميح (عبور الفجوة 12px في خطوة واحدة نحو 25–40 م.ث، كيد إنسان)؛ وكانت حركتان من ثماني
    // خطوات تعبرانها في أكثر من مهلة الإخفاء 300 م.ث مع تأخير CDP في Edge.
    if (t) await (s.kind === 'chromium' ? yt.mouseMove(t.x, t.y, 4) : yt.mouseMove(t.x, t.y));
    await sleep(900);
    const overTip = (await peek()).layer.tip;
    await yt.mouseMove(c.x, c.y - 260);
    await sleep(800);
    const away = (await peek()).layer.tip;
    check('tooltip-esc-and-hoverable', !!shown && afterEsc === null && !!overTip && away === null, { shown: !!shown, afterEsc, overTip: !!overTip, away });
  });

  // ---- U45 وU48 (اللوحة) ----
  await step('panel', async () => {
    await waitAdEnd();
    await stableSeek((TWO.startMs + TWO.endMs) / 2000);
    await focusBar('panel');
    await key('Enter');
    const open = await waitBridge('panel', (x) => x?.mode === 'open' && x?.kind === 'ready' && x.rows > 0, { timeoutMs: 8000 });
    const first = await call('panel');
    let pf = first?.focused ?? null;
    for (let i = 0; i < 8 && pf?.area !== 'list'; i++) {
      await key('Tab');
      pf = (await call('panel'))?.focused ?? null;
    }
    const inList = await call('panel');
    await key('ArrowDown');
    const down = await call('panel');
    await key('Tab');
    const out = await call('panel');
    result.measures.panel = { rows: open?.rows ?? null, tabStops: first?.tabStops, lang: first?.lang, startFocus: first?.focused, inList: inList?.focused, followAfterFocus: inList?.follow, down: down?.focused, afterTab: out?.focused };
    check('panel-one-tab-stop-arrows-and-lang', !!open && first.tabStops === 1 && first.lang === 'ar' && inList.focused?.area === 'list' && down.focused?.row === inList.focused?.row + 1 && out.focused?.area !== 'list', result.measures.panel);
    check('panel-keyboard-focus-stops-follow', inList?.follow === false, { follow: inList?.follow });
    await shot('panel');
  });

  // ---- U49 CL-X1 ----
  await step('gap', async () => {
    await waitAdEnd();
    await stableSeek((GAP.endMs - 300) / 1000);
    const before = await waitBridge('overlay', (l) => l.length > 0, { timeoutMs: 6000 });
    const gapAt = (GAP.endMs + GAP_NEXT.startMs) / 2000;
    if ((await yt.eval(M.seek, { args: [gapAt] })) < 1) seeksUnloaded.count += 1;
    await sleep(500);
    const inGap = await call('overlay');
    const t = await yt.eval(M.time);
    const d = await call('diagnostics');
    const o = await call('overlayBoxes');
    check('short-gap-keeps-line', !!before?.length && inGap.length > 0 && clean(inGap.join(' ')) === clean(before.join(' ')), { cue: GAP.n, gapMs: GAP_NEXT.startMs - GAP.endMs, at: Math.round(t * 1000), shown: inGap.length, overlay: { hidden: o?.hidden, empty: o?.empty, fading: o?.fading, diag: d?.overlay ?? null } });
  });

  // ---- U49 P-11 ----
  for (const [w, h] of [[1280, 800], [1920, 1080]]) {
    await step(`timing-${w}`, async () => {
      await closeAll();
      await setViewport(w, h);
      await waitAdEnd();
      await stableSeek((TWO.startMs + TWO.endMs) / 2000);
      const two = await waitBridge('overlay', (l) => l.length >= 2, { timeoutMs: 6000 });
      if (!two) result.notes.push(`timing-${w}: السطران لم يظهرا قبل فتح القائمة: ${JSON.stringify({ t: await yt.eval(M.time), d: (await call('diagnostics'))?.overlay?.engine?.ar ?? null, o: await call('overlayBoxes').then((x) => ({ hidden: x?.hidden, empty: x?.empty })) })}`);
      await clickBar('badge', { menu: true });
      await sleep(600);
      const p = await peek();
      const o = await call('overlayBoxes');
      const menu = p.layer.menu?.box ?? null;
      const lines = o?.lineBoxes ?? [];
      const hit = lines.some((l) => overlaps(menu, l));
      result.measures[`timing${w}`] = { menu, lines, player: o?.host ?? null };
      await shot(`timing-menu-${w}`);
      check(`timing-menu-clear-of-line-${w}`, !!menu && lines.length > 0 && !hit, { menu, lines: lines.length, overlap: hit });
      await closeAll();
    });
  }
} catch (err) {
  check('run', false, { error: String(err?.stack ?? err).slice(0, 400) });
} finally {
  result.measures.seeksWithoutMedia = seeksUnloaded.count;
  await s?.close?.().catch(() => {});
  await writeFile(path.join(OUT, 'c6-live.json'), `${JSON.stringify(result, null, 2)}\n`);
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  await rm(path.join(PROFILE_ROOT, profile), { recursive: true, force: true }).catch(() => {});
  const fails = result.checks.filter((c) => c.ok === false).length;
  console.log(`${result.checks.length - fails}/${result.checks.length} — ${rel(path.join(OUT, 'c6-live.json'))}`);
  process.exit(fails ? 1 : 0);
}
