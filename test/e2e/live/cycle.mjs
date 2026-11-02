#!/usr/bin/env node
// الدورة الكاملة الحية (P9-AC1) لفيديو يدوي وآخر تلقائي، على Brave ثم Chrome. الاستخراج الحقيقي في الجلسة اليدوية
// (hand.mjs: ببناء الإنتاج، بلا أي علم تحكم، ونقرات سلطان على «تحميل الترجمة» و«تنزيل SRT» و«نسخ تعليمات الترجمة»)؛ وما
// بعده هنا في جلسة مؤتمتة بمنفذ تصحيح، ببناء التطوير في مسار الإضافة نفسه (المعرّف والتخزين نفساهما، ويزيد خطاف القياس
// وحده)، بنقرات وضغطات Input حقيقية. الخطوات تفصلها الترجمة الخارجية وإعادة التشغيل:
//   library  المحفوظات بعد التنزيل: صف الفيديو وبصمته ومساره الإنجليزي محفوظة، ونسخ التعليمات من الصف (الحافظة الحقيقية)
//            وحفظ المنسوخ في مجلد العمل كما يلصقه المستخدم مع الملف في تطبيق الترجمة.
//   finish   رفع العربي ← مشاهدة ومزامنة ومزدوج ← ضبط ± وقائمة التوقيت والكتابة والشريط مخفي ← المحرّر وحفظ ← عودة ←
//            الخط والحجم ← نسخ التشخيص وفحصه.
//   restart  إغلاق المتصفح وتشغيله: الخط والحجم والترجمة والإزاحة باقية.
//   node test/e2e/live/cycle.mjs library --browser brave
//   node test/e2e/live/cycle.mjs finish --browser brave --video manual
//   node test/e2e/live/cycle.mjs restart --browser brave
//   node test/e2e/live/cycle.mjs close --browser brave
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { subtitleFont } from '../../../src/ui/subtitle-fonts.js';
import { splitLines } from '../../../src/player/overlay/text.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { collectErrors } from '../../live/harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../../live/harness/youtube.mjs';
import {
  BROWSERS, Evidence, ROOT, WORK, attachTab, clip, clipboardAfter, connectBrowser, launchBrowser, loadState,
  openAttached, saveState, sentinel, sha16, sleep, specInstructions, waitTarget,
} from './lib.mjs';

const argv = process.argv.slice(2);
const STEP = argv[0];
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const which = val('video', 'manual');

export const CYCLE = {
  manual: { id: 'iG9CE55wbtY', kind: 'manual', mode: 'normal' },
  asr: { id: 'Y9rkKtK1b44', kind: 'asr', mode: 'long' },
};
const NEUTRAL = 'aqz-KE-bpKQ'; // بلا ترجمة: وجهة «المغادرة» قبل العودة
const V = CYCLE[which];
const OUT = path.join(ROOT, 'docs/evidence/P9', browser);
const DIR = path.join(WORK, browser);
const watchUrl = (id, extra = 'cc_load_policy=1&cc_lang_pref=en') => `https://www.youtube.com/watch?v=${id}${extra ? `&${extra}` : ''}`;
const center = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
const mid = (c) => (c.startMs + c.endMs) / 2000;
// الطبقة تعرض كل سطر من نص المقطع عنصرًا مستقلًا (splitLines)، فالمقارنة بالأسطر لا بالنص كله.
const arLines = (ov) => ov.lines.filter((l) => l.kind === 'ar');
const shows = (ov, text) => !ov.hidden && JSON.stringify(arLines(ov).map((l) => l.text)) === JSON.stringify(splitLines(text));

// ---- العالم المعزول للإضافة على يوتيوب (بناء التطوير) ----
const I = {
  state: () => {
    const h = globalThis.__tarjuman;
    const s = h.controller.getState();
    return {
      videoId: s.videoId, title: s.title ?? null, captured: s.captured.map((t) => ({ key: t.key, ok: t.ok, code: t.code, cueCount: t.cueCount, capturedAt: t.capturedAt, completeness: t.completeness })),
      issue: s.captureIssue ? s.captureIssue.code : null,
      arabic: s.arabic ? { n: s.arabic.cues.length, fileName: s.arabic.fileName, matched: s.arabic.comparison?.matched ?? null, edited: s.arabic.edited } : null,
      english: s.english ? { key: s.english.key, source: s.english.source, n: s.english.cues.length } : null,
      fingerprints: s.saved?.fingerprints?.length ?? 0, view: s.view, appearance: s.settings.appearance, stepMs: s.settings.offsetStepMs,
      mounted: { overlay: h.mounted.overlay.state, controls: h.mounted.controls.state },
    };
  },
  diag: () => globalThis.__tarjuman.extractor.diagnostics(),
  cue: (i) => globalThis.__tarjuman.controller.getState().arabic?.cues[i] ?? null,
  peek: () => globalThis.__tarjuman.mounted.controls.peek(),
  ov: () => globalThis.__tarjuman.mounted.overlay.peek(true),
  record: async (v) => {
    const r = await globalThis.__tarjuman.store.getVideo(v);
    return r ? { view: r.view, edited: r.arabic?.current != null, arabic: r.arabic?.current?.length ?? r.arabic?.original?.length ?? 0, english: r.english.length, fingerprints: r.fingerprints.length } : null;
  },
};
// ---- العالم الرئيسي ليوتيوب: ما يراه المستخدم ----
const M = {
  info: () => {
    const p = document.querySelector('#movie_player');
    const v = document.querySelector('#movie_player video.html5-main-video');
    const r = p?.getBoundingClientRect();
    return {
      webdriver: navigator.webdriver, v: new URLSearchParams(location.search).get('v'),
      player: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      ad: !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')),
      t: v ? v.currentTime : null, paused: v ? v.paused : null, autohide: !!p && p.classList.contains('ytp-autohide'),
    };
  },
  pause: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.pause(); return v.paused; },
  play: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; return v.play().then(() => true, () => false); },
  bot: () => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''),
  bodyHas: (s) => (document.body?.innerText || '').includes(s),
};

let b;
let yt;
let isoId;
const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
const main = (fn, ...args) => yt.eval(fn, { args });
const front = (page) => b.conn.send('Target.activateTarget', { targetId: page.targetId });

async function bindIso(timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    isoId = yt.isolatedContextId(b.extId);
    if (isoId) {
      try {
        if (await iso(() => !!globalThis.__tarjuman?.mounted)) return true;
      } catch {
        // السياق يتغير.
      }
    }
    await sleep(300);
  }
  return false;
}

async function clickButton(kind) {
  await front(yt);
  await revealControls(yt);
  const p = await iso(I.peek);
  const c = center(p.buttons[kind].box);
  await yt.click(c.x, c.y);
  await sleep(450);
}
/** نقرة على الجزء الظاهر من البند؛ والقائمة الأطول من حدها تُمرَّر بعجلة الفأرة فوقها حتى يظهر (كما يفعل المستخدم). */
async function clickItem(fid) {
  for (let tries = 0; tries < 6; tries++) {
    const p = await iso(I.peek);
    const menu = p.layer.menu;
    const it = menu?.items.find((x) => x.fid === fid);
    if (!it) throw new Error(`لا بند في القائمة: ${fid}`);
    const top = Math.max(it.box.top, menu.box.top);
    const bottom = Math.min(it.box.bottom, menu.box.bottom);
    if (bottom - top >= Math.min(24, it.box.height)) {
      await yt.click(Math.round(it.box.left + it.box.width / 2), Math.round((top + bottom) / 2));
      await sleep(450);
      return;
    }
    const mc = center(menu.box);
    await yt.mouseMove(mc.x, mc.y);
    await yt.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mc.x, y: mc.y, deltaX: 0, deltaY: it.box.top > menu.box.top ? 160 : -160 });
    await sleep(300);
  }
  throw new Error(`البند لا يظهر في القائمة: ${fid}`);
}
async function seekTo(sec) {
  for (let i = 0; i < 4; i++) {
    await main((t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); v.currentTime = t; }, sec);
    await yt.waitFor(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return v && !v.seeking && v.readyState >= 2; }, { timeoutMs: 15000, intervalMs: 150 });
    await sleep(450);
    const st = await main(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return { paused: v.paused, t: v.currentTime }; });
    if (st.paused && Math.abs(st.t - sec) < 0.05) return;
  }
}
async function clickSel(page, selector) {
  await front(page);
  const c = await page.centerOf(selector);
  if (!c) throw new Error(`عنصر غير ظاهر: ${selector}`);
  await page.click(c.x, c.y);
  await sleep(450);
}
async function clickText(page, root, text) {
  const found = await page.eval((r, t) => {
    document.querySelectorAll('[data-p9-click]').forEach((e) => e.removeAttribute('data-p9-click'));
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const el = [...(document.querySelector(r)?.querySelectorAll('button, a, summary, label') ?? [])]
      .find((e) => norm(e.textContent).startsWith(t) || e.getAttribute('aria-label')?.startsWith(t));
    if (!el) return false;
    el.setAttribute('data-p9-click', '1');
    return true;
  }, { args: [root, text] });
  if (!found) throw new Error(`لا عنصر «${text}» في ${root}`);
  await clickSel(page, '[data-p9-click]');
}
async function selectAllAndType(page, text) {
  // ⌘A عبر CDP على macOS لا ينفّذ «تحديد الكل» إلا بأمر التحرير صريحًا.
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4, commands: ['selectAll'] });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 4 });
  await sleep(120);
  await page.send('Input.insertText', { text });
  await sleep(250);
}

// ---- الشبكة والأخطاء: طلب «من الإضافة وحدها» بقاعدة P1، وقراءة ملف من حزمتها ليست شبكة ----
const external = [];
const errorLists = [];
const framesOf = (init) => {
  const out = [];
  if (init?.url) out.push(init.url);
  for (let st = init?.stack; st; st = st.parent) for (const f of st.callFrames ?? []) if (f.url) out.push(f.url);
  return out;
};
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
  const page = targetId ? await attachTab(b.conn, targetId) : await openAttached(b.conn, `chrome-extension://${b.extId}/${rel}`);
  errorLists.push({ where: rel.split('?')[0], errs: collectErrors(page, { extId: b.extId }) });
  await watchNetwork(page);
  return page;
}

// ---- منتقي الملفات ----
let nextUpload = null;
async function armChooser(page, ev) {
  await page.send('DOM.enable');
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  page.on('Page.fileChooserOpened', async ({ backendNodeId }) => {
    const files = nextUpload ?? [];
    nextUpload = null;
    try {
      await page.send('DOM.setFileInputFiles', { files, backendNodeId });
    } catch (err) {
      ev.note(`منتقي الملفات: ${clip(err.message, 120)}`);
    }
  });
}

async function settleAds(ev) {
  if (!(await main(M.info)).ad) return 'none';
  ev.note('إعلان حقيقي صودف؛ انتُظر انتهاؤه (والتخطي بنقرة متى ظهر الزر).');
  const ended = await yt.waitFor(() => {
    const p = document.querySelector('#movie_player');
    const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
    if (skip && getComputedStyle(skip).display !== 'none') skip.click();
    return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
  }, { timeoutMs: 150000, intervalMs: 1000 });
  return ended ? 'ended' : 'stuck';
}

async function afterAttach(ev, id) {
  if (await main(M.bot)) throw new Error('BOT_CHALLENGE: ظهر تحدي «لست روبوتًا»؛ توقف دون تحايل');
  await dismissConsent(yt).catch(() => false);
  await waitForPlayer(yt, id, 30000);
  if (!(await bindIso())) throw new Error('لا سياق معزول للإضافة أو لم تُركَّب');
  await yt.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 15000 });
}

// ==================== library ====================
async function library() {
  const ev = new Evidence(OUT, 'library', { step: 'library' });
  const state = await loadState(browser);
  try {
    // بناء التطوير في مسار الإضافة نفسه (المتصفح مغلق بعد الجلسة اليدوية): المعرّف والتخزين نفساهما.
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', BROWSERS[browser].ext], { cwd: ROOT, stdio: 'ignore' });
    b = await launchBrowser(browser);
    state.running = true;
    ev.data.browser = `${BROWSERS[browser].name} (${b.version.product})`;
    const lib = await extPage('pages/library/index.html');
    await lib.waitFor(() => document.querySelector('li.lib-row'), { timeoutMs: 15000 });
    const ids = Object.entries(state.videos).filter(([, v]) => v.srtName).map(([id]) => id);
    const recs = await lib.eval(async (list) => {
      const all = await chrome.storage.local.get(list.map((i) => `video:${i}`));
      return list.map((i) => {
        const r = all[`video:${i}`];
        return { id: i, title: !!r?.title, english: (r?.english ?? []).map((e) => ({ kind: e.kind, cues: e.cues.length })), fingerprints: (r?.fingerprints ?? []).map((f) => ({ mode: f.mode, count: f.count, fileName: f.fileName })) };
      });
    }, { args: [ids] });
    for (const r of recs) {
      const sv = state.videos[r.id];
      // التنزيل بالأجزاء يحفظ بصمته باسم آخر وبأجزائها: يكفي تطابق العدد حينئذ.
      const fp = r.fingerprints.find((f) => f.fileName === sv.srtName) ?? (sv.fromParts ? r.fingerprints.find((f) => f.count === sv.cues) : null);
      ev.check(`saved-after-hand-download-${sv.slot}`, !!fp && fp.count === sv.cues && r.english.length >= 1 && r.title,
        { fingerprints: r.fingerprints.map((f) => ({ mode: f.mode, count: f.count })), english: r.english, title: r.title });
    }
    await ev.shot(lib, 'library-after-hand-downloads', { conn: b.conn });

    // نسخ التعليمات من صف كل فيديو في الدورة إلى حافظة الجهاز، وحفظ المنسوخ لتطبيق الترجمة.
    await mkdir(DIR, { recursive: true });
    for (const v of Object.values(CYCLE)) {
      const sv = state.videos[v.id];
      if (!sv?.srtName) continue;
      const row = await lib.eval((id) => [...document.querySelectorAll('li.lib-row')].findIndex((r) => r.textContent.includes(id)) + 1, { args: [v.id] });
      const rowSel = `ul.lib-list > li:nth-child(${row})`;
      const guard = sentinel();
      await clickSel(lib, `${rowSel} .lib-copy__button`);
      const okState = await lib.waitFor((s) => document.querySelector(s)?.getAttribute('data-state') === 'success', { args: [`${rowSel} .lib-copy__button`], timeoutMs: 5000, intervalMs: 80 });
      const fromLib = await clipboardAfter(guard);
      const title = await lib.eval(async (id) => (await chrome.storage.local.get(`video:${id}`))[`video:${id}`]?.title ?? null, { args: [v.id] });
      const expectInstr = specInstructions(v.id, title);
      ev.check(`copy-from-library-to-device-clipboard-${sv.slot}`, row > 0 && !!okState && fromLib === expectInstr,
        { row, state: okState ? 'success' : null, len: fromLib?.length ?? null, sha: fromLib && sha16(fromLib), expected: { len: expectInstr.length, sha: sha16(expectInstr) } });
      if (fromLib) await writeFile(path.join(DIR, `${v.id}.instructions.txt`), fromLib);
      sv.instructionsSha = fromLib ? sha16(fromLib) : null;
      if (v.id === CYCLE.manual.id) await ev.shot(lib, 'library-copied', { conn: b.conn });
    }
    await lib.close();
  } catch (err) {
    ev.check('run-aborted', false, { error: clip(err.message ?? err, 300) });
  } finally {
    await finishErrors(ev);
    await saveState(browser, state);
    await ev.write();
    b?.conn.close();
  }
  return ev.failed.length;
}


async function finishErrors(ev) {
  if (!errorLists.length && !yt) return;
  await sleep(300);
  const FONT_READ_LOG = /^Unsafe attempt to load URL chrome-extension:\/\/[^/]+\/ui\/fonts\/subtitle\/[a-z0-9-]+-(?:400|700)\.woff2 /;
  const lists = errorLists.map((e) => ({ where: e.where, list: e.errs.list }));
  if (ytErrs) lists.push({ where: 'youtube', list: ytErrs.list });
  const all = lists.flatMap((l) => l.list.map((x) => ({ where: l.where, ...x })));
  const fontReads = all.filter((x) => x.kind === 'log.security' && FONT_READ_LOG.test(x.text));
  if (fontReads.length) ev.note(`رسائل قراءة خطوط الترجمة من حزمة الإضافة (معروفة من P6، غير محسوبة أخطاءً): ${fontReads.length}`);
  const errors = all.filter((x) => !fontReads.includes(x));
  ev.data.errors = errors.map((x) => ({ where: x.where, kind: x.kind, text: clip(x.text, 160) }));
  ev.check('no-extension-errors', errors.length === 0, { count: errors.length });
  ev.check('no-network-from-extension', external.length === 0, { external: external.length });
}

// ==================== finish ====================
let ytErrs = null;
async function finish() {
  const ev = new Evidence(OUT, `finish-${which}`, { step: 'finish', video: V.id, kind: V.kind, mode: V.mode });
  const state = await loadState(browser);
  const sv = state.videos[V.id];
  try {
    if (!sv?.srtName || !sv.instructionsSha) throw new Error('لا تنزيل يدوي أو نسخ من المحفوظات مسجّل لهذا الفيديو');
    b = await connectBrowser(browser);
    ev.data.browser = `${BROWSERS[browser].name} (${b.version.product})`;
    // الترجمة الخارجية: الملف العربي من الملف الإنجليزي نفسه بايتًا (بصمة) وبالتعليمات المنسوخة نفسها (بصمة).
    const translatedFrom = await readFile(path.join(WORK, 'expected', sv.srtName), 'utf8');
    const usedInstr = await readFile(path.join(WORK, 'expected', `${V.id}.instructions.txt`), 'utf8');
    const arName = sv.srtName.replace(/\.srt$/, '.ar.srt');
    const arPath = path.join(WORK, 'translations', arName);
    const arText = await readFile(arPath, 'utf8');
    const arCues = parseSrtStrict(arText);
    // التعليمات المستعملة في الترجمة تطابق المنسوخة من المحفوظات إلا سطر العنوان حين تعرض يوتيوب عنوانًا مترجمًا آليًا
    // لواجهتها العربية (يُحفظ العنوان كما يظهر في الصفحة)؛ يُسجَّل ذلك صراحة.
    const copiedInstr = await readFile(path.join(DIR, `${V.id}.instructions.txt`), 'utf8');
    const noTitle = (t) => t.replace(/^- العنوان: .*$/m, '');
    const sameInstr = sha16(usedInstr) === sv.instructionsSha;
    ev.check('external-translation-matches-downloaded-file-and-copied-instructions',
      sha16(translatedFrom) === sv.srtSha && sha16(copiedInstr) === sv.instructionsSha && noTitle(usedInstr) === noTitle(copiedInstr) && arCues.length === sv.cues,
      { english: sv.srtSha, translatedFrom: sha16(translatedFrom), instructionsIdentical: sameInstr, onlyTitleLineDiffers: !sameInstr, arabicCues: arCues.length, name: arName });

    // صفحة المشاهدة في الجلسة المؤتمتة: لا يلزم جسم الترجمة بعد الآن (المسار الإنجليزي والبصمة محفوظان من التنزيل).
    yt = await openAttached(b.conn, 'about:blank');
    ytErrs = collectErrors(yt, { extId: b.extId, onlyExtension: true });
    await watchNetwork(yt);
    await armChooser(yt, ev);
    await yt.goto(watchUrl(V.id, ''));
    await afterAttach(ev, V.id);
    await settleAds(ev);
    await main(M.pause);

    // ===== ١. الرفع من الزر، أو الاستبدال بتأكيد إن كانت للفيديو ترجمة من جولة سابقة =====
    nextUpload = [arPath];
    const had = (await iso(I.state)).arabic;
    await clickButton('upload');
    if (had) {
      await clickItem('replace');
      const asked = await yt.waitFor(() => globalThis.__tarjuman.mounted.controls.peek()?.layer.menu?.items.some((x) => x.fid === 'confirm'), { contextId: isoId, timeoutMs: 10000, intervalMs: 200 });
      ev.check('replace-asks-confirmation', !!asked, null);
      await clickItem('confirm');
    }
    const up = await yt.waitFor(() => {
      const s = globalThis.__tarjuman.controller.getState();
      return s.arabic && !s.arabic.edited && s.view.displayOffsetMs === 0 ? true : null;
    }, { contextId: isoId, timeoutMs: 10000, intervalMs: 200 });
    await sleep(600);
    let s = await iso(I.state);
    let pk = await iso(I.peek);
    ev.check('upload-loads-and-matches-fingerprint', !!up && s.arabic?.n === sv.cues && s.arabic.matched === true && s.arabic.fileName === arName && /مطابق للأصل ✓/.test(pk.layer.menu?.text ?? ''),
      { arabic: s.arabic, menu: pk.layer.menu?.label ?? null });
    await ev.shot(yt, `${which}-upload-matched`, { conn: b.conn });
    if (pk.layer.menu) await clickButton('upload');

    // مقاطع مفردة (لا تداخل، 1.5 ث فأكثر) بعد الثانية 20: الأول للمشاهدة والضبط، والثاني للتحرير.
    const cuesAr = arCues;
    const singles = cuesAr.map((c, i) => ({ ...c, i })).filter((c) => c.startMs >= 20000 && c.endMs - c.startMs >= 1500
      && (c.i === 0 || cuesAr[c.i - 1].endMs <= c.startMs) && (c.i === cuesAr.length - 1 || c.endMs <= cuesAr[c.i + 1].startMs));
    const VIEW = singles[0];
    const EDIT = singles.find((c) => c.i >= VIEW.i + 2) ?? singles[1];
    if (!VIEW || !EDIT) throw new Error('لا مقاطع مفردة للقياس');

    // ===== ٢. المشاهدة: المقطع الظاهر مقطع الملف لزمنه، RTL =====
    await seekTo(mid(VIEW));
    await sleep(500);
    const ov0 = await iso(I.ov);
    ev.check('watch-shows-file-cue-rtl', shows(ov0, VIEW.text) && arLines(ov0).every((l) => l.dir === 'rtl'),
      { t: mid(VIEW), n: VIEW.n, lines: ov0.lines.map((l) => ({ kind: l.kind, dir: l.dir })) });
    await ev.shot(yt, `${which}-watch-ar`, { conn: b.conn });

    // ===== ٣. المزامنة أثناء التشغيل: الزمن والأسطر الظاهرة في قراءة واحدة داخل الصفحة (لا فاصل بينهما) =====
    await seekTo(Math.max(0, VIEW.startMs / 1000 - 1));
    await main(M.play);
    const samples = [];
    for (let i = 0; i < 20; i++) {
      await sleep(350);
      const o = await iso(() => {
        const v = document.querySelector('#movie_player video.html5-main-video');
        const p = globalThis.__tarjuman.mounted.overlay.peek(false);
        return { t: v.currentTime, paused: v.paused, lines: p.lines.filter((l) => l.kind === 'ar').map((l) => l.text) };
      });
      const ms = o.t * 1000;
      const want = cuesAr.filter((c) => c.startMs <= ms && ms < c.endMs).flatMap((c) => splitLines(c.text));
      const edge = Math.min(...cuesAr.map((c) => Math.min(Math.abs(c.startMs - ms), Math.abs(c.endMs - ms))));
      const same = JSON.stringify(want) === JSON.stringify(o.lines);
      samples.push({ ok: same || edge < 250, same, edgeMs: Math.round(edge), t: Math.round(ms), want: want.length, shown: o.lines.length, paused: o.paused });
    }
    await main(M.pause);
    const misses = samples.filter((x) => !x.ok);
    ev.check('sync-while-playing', misses.length === 0, { samples: samples.length, exact: samples.filter((x) => x.same).length, nearBoundary: samples.filter((x) => !x.same && x.ok).length, misses });

    // ===== ٤. العربية فوق الإنجليزية ثم العودة إلى العربية وحدها =====
    await seekTo(mid(VIEW));
    await clickButton('upload');
    await clickItem('mode:dual');
    await sleep(600);
    const ovD = await iso(I.ov);
    ev.check('dual-mode-ar-over-en', ovD.lines.length >= 2 && ovD.lines[0].kind === 'ar' && ovD.lines.some((l) => l.kind === 'en' && l.dir === 'ltr'), { lines: ovD.lines.map((l) => ({ kind: l.kind, dir: l.dir })) });
    await ev.shot(yt, `${which}-watch-dual`, { conn: b.conn });
    pk = await iso(I.peek);
    if (!pk.layer.menu) await clickButton('upload');
    await clickItem('mode:ar');
    await sleep(400);
    pk = await iso(I.peek);
    if (pk.layer.menu) await clickButton('upload');

    // ===== ٥. الضبط بزرّي ± (خطوة الإعداد 0.5) =====
    await clickButton('plus');
    await clickButton('plus');
    s = await iso(I.state);
    pk = await iso(I.peek);
    await seekTo(mid(VIEW) + 1);
    const ovP = await iso(I.ov);
    ev.check('plus-twice-delays-by-one-second', s.view.displayOffsetMs === 1000 && pk.buttons.badge.text.includes('+1.0') && shows(ovP, VIEW.text),
      { offsetMs: s.view.displayOffsetMs, badge: pk.buttons.badge.text, sameCueOneSecondLater: shows(ovP, VIEW.text) });
    await clickButton('minus');
    s = await iso(I.state);
    ev.check('minus-advances-by-step', s.view.displayOffsetMs === 500, { offsetMs: s.view.displayOffsetMs });

    // ===== ٦. قائمة التوقيت: الإدخال الدقيق، والقائمة ظاهرة والشريط مخفي ما دام التركيز في الحقل (إصلاح P9) =====
    await clickButton('badge');
    pk = await iso(I.peek);
    const field = pk.layer.menu?.items.find((x) => x.fid === 'offset');
    if (!field) throw new Error('لا حقل إدخال دقيق في قائمة التوقيت');
    await yt.click(center(field.box).x, center(field.box).y);
    await sleep(250);
    await selectAllAndType(yt, '0.8');
    await main(M.play);
    const hid = await yt.waitFor(() => globalThis.__tarjuman.mounted.controls.peek()?.layer.bar === 'hidden', { contextId: isoId, timeoutMs: 12000, intervalMs: 200 });
    await sleep(300);
    const pkH = await iso(I.peek);
    ev.check('typing-menu-stays-visible-while-bar-hidden', !!hid && pkH.layer.bar === 'hidden' && pkH.layer.typing === true && pkH.layer.opacity === '1' && !!pkH.layer.menu && pkH.layer.focusedFid === 'offset',
      { bar: pkH.layer.bar, typing: pkH.layer.typing, opacity: pkH.layer.opacity, focused: pkH.layer.focusedFid });
    await ev.shot(yt, `${which}-typing-bar-hidden`, { conn: b.conn });
    await yt.key('Tab', 'Tab', 9);
    await sleep(400);
    const pkL = await iso(I.peek);
    s = await iso(I.state);
    ev.check('leaving-field-returns-menu-to-bar-rule', pkL.layer.typing === false && (pkL.layer.bar !== 'hidden' || pkL.layer.opacity === '0'),
      { bar: pkL.layer.bar, typing: pkL.layer.typing, opacity: pkL.layer.opacity });
    ev.check('typed-value-applied-on-leaving-field', s.view.displayOffsetMs === 800, { offsetMs: s.view.displayOffsetMs });
    await main(M.pause);
    await yt.key('Escape', 'Escape', 27);
    await sleep(300);
    // الإدخال الدقيق بـEnter بقيمة مختلفة عن الحالية، ثم العودة إلى +0.5 لبقية الدورة.
    const typeOffset = async (value) => {
      await clickButton('badge');
      const p = await iso(I.peek);
      const f = p.layer.menu?.items.find((x) => x.fid === 'offset');
      await yt.click(center(f.box).x, center(f.box).y);
      await selectAllAndType(yt, value);
      await yt.key('Enter', 'Enter', 13);
      await sleep(400);
      const st = await iso(I.state);
      const pp = await iso(I.peek);
      if (pp.layer.menu) await yt.key('Escape', 'Escape', 27);
      return { offsetMs: st.view.displayOffsetMs, badge: pp.buttons.badge.text };
    };
    const p3 = await typeOffset('0.3');
    ev.check('precise-input-sets-offset', p3.offsetMs === 300 && p3.badge.includes('+0.3'), p3);
    const p5 = await typeOffset('0.5');
    ev.check('precise-input-back-to-half-second', p5.offsetMs === 500 && p5.badge.includes('+0.5'), p5);

    // ===== ٧. المحرّر من المحفوظات: تعديل نص مقطع وحفظه =====
    const EDITED = `نص عدّله المحرّر في دورة P9 (${which})`;
    const lib = await extPage('pages/library/index.html');
    await lib.waitFor(() => document.querySelector('li.lib-row'), { timeoutMs: 15000 });
    const row = await lib.eval((v) => [...document.querySelectorAll('li.lib-row')].findIndex((r) => r.textContent.includes(v)) + 1, { args: [V.id] });
    const known = new Set((await b.conn.send('Target.getTargets')).targetInfos.map((t) => t.targetId));
    await clickText(lib, `ul.lib-list > li:nth-child(${row})`, 'تعديل');
    const edT = await waitTarget(b.conn, (u) => u.endsWith(`/pages/editor/index.html?v=${V.id}`), { exclude: known });
    ev.check('editor-opened-from-library', !!edT);
    if (!edT) throw new Error('لم يُفتح المحرّر من المحفوظات');
    const ed = await extPage('pages/editor/index.html', { targetId: edT.targetId });
    await ed.waitFor(() => Boolean(globalThis.__tarjumanEditor && document.querySelector('.ed-row[data-index]')), { timeoutMs: 15000 });
    await ed.eval((i) => globalThis.__tarjumanEditor.jumpTo(i), { args: [EDIT.i] }).catch(() => null);
    await sleep(400);
    const fieldSel = `.ed-row[data-index="${EDIT.i}"] [data-field="text"]`;
    await ed.waitFor((sel) => !!document.querySelector(sel), { args: [fieldSel], timeoutMs: 8000 });
    await clickSel(ed, fieldSel);
    await ed.eval((sel) => document.querySelector(sel)?.select?.(), { args: [fieldSel] });
    await ed.send('Input.insertText', { text: EDITED });
    await sleep(400);
    const dirty = await ed.eval(() => document.querySelector('.ed-status')?.textContent.trim());
    await clickText(ed, '.ed-head', 'حفظ');
    const saved = await ed.waitFor(() => document.querySelector('.ed-status')?.textContent.trim() === 'محفوظ ✓', { timeoutMs: 6000, intervalMs: 120 });
    const overlap = await ed.eval(() => {
      const t = document.querySelector('.ed-toast.is-shown');
      const h = document.querySelector('.ed-title');
      if (!t || !h) return { toast: !!t };
      const a = t.getBoundingClientRect();
      const c = h.getBoundingClientRect();
      const head = document.querySelector('.ed-head').getBoundingClientRect();
      return { toast: true, text: t.textContent, overlapsTitle: !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom), belowHead: a.top >= head.bottom };
    });
    ev.check('editor-edit-and-save', /تغييرات غير محفوظة/.test(dirty ?? '') && !!saved, { dirty, saved: !!saved });
    ev.check('saved-toast-does-not-cover-title', overlap.toast && overlap.overlapsTitle === false && overlap.belowHead === true, overlap);
    await clickSel(ed, 'label.ed-toggle');
    const enHidden = await ed.eval(() => document.querySelector('.ed-list').classList.contains('ed-list--no-en'));
    if (enHidden) await ev.shot(ed, `${which}-editor-saved`, { conn: b.conn });
    await lib.close();

    // ===== ٨. انعكاس الحفظ في المشغّل المفتوح =====
    const inState = await yt.waitFor((i, t) => globalThis.__tarjuman.controller.getState().arabic?.cues[i]?.text === t, { contextId: isoId, args: [EDIT.i, EDITED], timeoutMs: 8000, intervalMs: 150 });
    await seekTo(mid(EDIT) + 0.5);
    const ovE = await iso(I.ov);
    ev.check('save-reflected-in-player-with-offset', !!inState && shows(ovE, EDITED), { inState: !!inState, shownEdited: shows(ovE, EDITED) });
    await ev.shot(yt, `${which}-player-after-save`, { conn: b.conn });
    await ed.close();

    // ===== ٩. المغادرة ثم العودة: الترجمة المعدّلة والإزاحة والوضع محفوظة =====
    await yt.goto(watchUrl(NEUTRAL, ''));
    await sleep(2500);
    await yt.goto(watchUrl(V.id, ''));
    await afterAttach(ev, V.id);
    await settleAds(ev);
    await yt.waitFor(() => globalThis.__tarjuman.controller.getState().arabic, { contextId: isoId, timeoutMs: 10000, intervalMs: 200 });
    s = await iso(I.state);
    pk = await iso(I.peek);
    const toastsBack = pk.layer.toasts.map((t) => t.text);
    await main(M.pause);
    await seekTo(mid(EDIT) + 0.5);
    const ovR = await iso(I.ov);
    ev.check('return-restores-translation-offset-and-mode', s.arabic?.edited === true && s.view.displayOffsetMs === 500 && s.view.displayMode === 'ar' && pk.buttons.badge.text.includes('+0.5') && shows(ovR, EDITED),
      { edited: s.arabic?.edited, offsetMs: s.view.displayOffsetMs, mode: s.view.displayMode, badge: pk.buttons.badge.text, toasts: toastsBack });

    // ===== ١٠. الخط والحجم من الإعدادات، منعكسين على المشغّل دون إعادة تحميل =====
    const stp = await extPage('pages/settings/index.html');
    await stp.waitFor(() => document.querySelectorAll('.st-card').length >= 7, { timeoutMs: 15000 });
    await clickText(stp, '.st-fonts', 'تجوّل');
    await stp.waitFor(() => document.querySelector('.st-saved--success'), { timeoutMs: 4000, intervalMs: 80 });
    await clickSel(stp, '.st-scale__input');
    await stp.key('End', 'End', 35);
    await sleep(300);
    const rtl = await stp.eval(() => getComputedStyle(document.querySelector('.st-scale__input')).direction === 'rtl');
    const [dk, dc] = rtl ? ['ArrowRight', 39] : ['ArrowLeft', 37];
    for (let i = 0; i < 6; i++) {
      await stp.key(dk, dk, dc);
      await sleep(220);
    }
    await sleep(900);
    const stored = await stp.eval(async () => ({ app: (await chrome.storage.local.get('settings')).settings.appearance, out: document.querySelector('.st-scale__value')?.textContent }));
    ev.check('settings-font-tajawal-and-scale-130-saved', stored.app.font === 'tajawal' && stored.app.scale === 130 && stored.out === '130%', stored);
    await ev.shot(stp, `${which}-settings-tajawal-130`, { conn: b.conn });
    const fam = subtitleFont('tajawal').family;
    const reflected = await yt.waitFor((f) => { const x = globalThis.__tarjuman.mounted.overlay.peek(true)?.font; return x && (x.family ?? '').includes(f) ? x : null; }, { contextId: isoId, args: [fam], timeoutMs: 6000, intervalMs: 150 });
    const m0 = await main(M.info);
    const expectPx = Math.round(m0.player.h * 0.046 * 1.3);
    ev.check('font-and-scale-reflected-on-player', !!reflected && Math.abs(parseFloat(reflected.size) - expectPx) <= 1, { family: reflected ? 'Tajawal' : null, size: reflected?.size, expectPx });
    await ev.shot(yt, `${which}-watch-tajawal-130`, { conn: b.conn });

    // ===== ١١. نسخ تقرير التشخيص بعد الدورة: لا رابط ولا رمز (P9-AC3 الجزء الحي) =====
    const guard = sentinel();
    await clickSel(stp, '.st-diag__button');
    const report = await clipboardAfter(guard);
    const leaks = report ? findSecrets(report) : null;
    ev.check('diagnostics-report-after-cycle-has-no-url-or-token', !!report && leaks.length === 0 && !/https?:\/\//.test(report) && !report.includes(V.id),
      { length: report?.length ?? null, leaks: leaks?.length ?? null, mentionsVideoId: report ? report.includes(V.id) : null });
    if (report) await writeFile(path.join(OUT, `${which}-diagnostics-report.json`), `${report.trim()}\n`);
    await stp.close();
    state.videos[V.id].finished = true;
    state.videos[V.id].edit = { i: EDIT.i, t: mid(EDIT), text: EDITED };
  } catch (err) {
    ev.check('run-aborted', false, { error: clip(err.message ?? err, 300) });
  } finally {
    await finishErrors(ev);
    await saveState(browser, state);
    await ev.write();
    b?.conn.close();
  }
  return ev.failed.length;
}

// ==================== restart ====================
async function restart() {
  const ev = new Evidence(OUT, 'restart', { step: 'restart' });
  const state = await loadState(browser);
  try {
    b = await connectBrowser(browser);
    const closed = await b.close();
    ev.check('browser-closed', closed);
    b = await launchBrowser(browser);
    ev.data.browser = `${BROWSERS[browser].name} (${b.version.product})`;
    const stp = await extPage('pages/settings/index.html');
    await stp.waitFor(() => document.querySelectorAll('.st-card').length >= 7, { timeoutMs: 15000 });
    const after = await stp.eval(async () => ({
      app: (await chrome.storage.local.get('settings')).settings.appearance,
      out: document.querySelector('.st-scale__value')?.textContent,
      checked: document.querySelector('.st-fonts [aria-checked="true"], .st-fonts input:checked')?.closest('label, button')?.textContent?.trim() ?? null,
    }));
    ev.check('font-and-scale-persist-after-browser-restart', after.app.font === 'tajawal' && after.app.scale === 130 && after.out === '130%', after);
    await ev.shot(stp, 'restart-settings', { conn: b.conn });
    await stp.close();
    const id = CYCLE.manual.id;
    const sv = state.videos[id];
    yt = await openAttached(b.conn, watchUrl(id, ''));
    ytErrs = collectErrors(yt, { extId: b.extId, onlyExtension: true });
    await afterAttach(ev, id);
    await settleAds(ev);
    await yt.waitFor(() => globalThis.__tarjuman.controller.getState().arabic, { contextId: isoId, timeoutMs: 10000, intervalMs: 200 });
    await main(M.pause);
    if (sv?.edit) await seekTo(sv.edit.t + 0.5);
    const s = await iso(I.state);
    const o = await iso(I.ov);
    const m0 = await main(M.info);
    const expectPx = Math.round(m0.player.h * 0.046 * 1.3);
    ev.check('player-after-restart-uses-saved-font-scale-translation-offset', (o.font?.family ?? '').includes(subtitleFont('tajawal').family) && Math.abs(parseFloat(o.font?.size) - expectPx) <= 1
      && s.arabic?.edited === true && s.view.displayOffsetMs === 500 && (!sv?.edit || shows(o, sv.edit.text)),
      { font: o.font?.size, expectPx, edited: s.arabic?.edited, offsetMs: s.view.displayOffsetMs, shownEdited: sv?.edit ? shows(o, sv.edit.text) : null });
    await ev.shot(yt, 'restart-watch', { conn: b.conn });
    state.running = true;
  } catch (err) {
    ev.check('run-aborted', false, { error: clip(err.message ?? err, 300) });
  } finally {
    await finishErrors(ev);
    await saveState(browser, state);
    await ev.write();
    b?.conn.close();
  }
  return ev.failed.length;
}

async function close() {
  const state = await loadState(browser);
  try {
    b = await connectBrowser(browser);
    console.log(`أُغلق: ${await b.close()}`);
  } catch (err) {
    console.log(`لا نسخة تعمل: ${clip(err.message)}`);
  }
  state.running = false;
  await saveState(browser, state);
  return 0;
}

const run = { library, finish, restart, close }[STEP];
if (!run) {
  console.error('الخطوة: library | finish | restart | close');
  process.exit(2);
}
process.exit((await run()) ? 1 : 0);
