#!/usr/bin/env node
// الرحلة الكاملة للإصدار الثاني (P15-AC1، وجزء AC3 حيًا) على ملف التعريف نفسه بعد الترقية (upgrade.mjs) والجلسة اليدوية
// (hand.mjs و ask.mjs): مكتبة الإصدار الأول الحقيقية، وبصمات الاستخراج الحقيقي، وترجمات نماذج حقيقية طويلة:
//   TED (427): ترجمة Sonnet من الإصدار الأول في الخانة 1، وترجمة Haiku تُرفع إلى الخانة 2، والتبديل بينهما؛ وملف لفيديو آخر
//     يُنبَّه إليه ويُلغى بلا أثر، وملف Markdown يُقبل في الخانة 3؛ ثم تعديل في المحرّر، واستبدال من المحفوظات مع «إبقاء
//     تعديلاتي» (وإلغاؤه أولًا بلا أثر)، واستعادة السابقة (وإلغاؤها أولًا بلا أثر).
//   ميدواي (1,056 تلقائي): رفع من المحفوظات إلى الخانة 2، وملف ناقص في الخانة 3 يُستكمل في المحرّر (وإلغاء المعاينة أولًا).
//   الطويل (2000 فأكثر): أول رفع من المشغّل، والمزامنة بالجملة لنسخة مؤخَّرة 3 ث، وعلامة تظهر في المحرّر وفرز المحفوظات، والمحرّر
//     على 2000 مقطع فأكثر (بحث واستبدال ودمج وشطر وحفظ على خانة غير نشطة لا يغيّر المعروض)، والقفز، وتعارض حفظ بين تبويبين.
//   التصدير من المحرّر والمحفوظات في المجلد الفرعي، والنسخة الاحتياطية؛ وفي Chrome تُستعاد نسخة Brave (وإلغاؤها أولًا بلا أثر).
// بناء التطوير في مسار الإضافة نفسه، بلا نافذة ومكتوم، بنقرات وكتابة حقيقية عبر CDP. تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا،
// والرحلة لا تحتاجه: البصمات والمسارات محفوظة من الاستخراج الحقيقي.
//   command node test/e2e/live/v2/journey.mjs --browser brave|chrome [--restore-from <نسخة Brave>] [--reset] [--only a,b] [--headed]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { human, sleep } from '../../../live/harness/browser.mjs';
import { collectErrors, openTab } from '../../../live/harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../../../live/harness/youtube.mjs';
import { diffTranslations } from '../../../../src/core/align/index.js';
import { findSecrets } from '../../../../src/core/diagnostics/sanitize.js';
import { parseSrtLenient } from '../../../../src/core/srt/lenient.js';
import { parseSrtStrict } from '../../../../src/core/srt/parser.js';
import { formatSrtTime } from '../../../../src/core/srt/time.js';
import { BROWSERS, PROFILE_ROOT, ROOT, V2, VIDEOS, WORK, launchBrowser, pidsOf, quitProfile } from './lib.mjs';
import {
  FONT_READ_LOG, appVersion, byText, canonical, chooseFile, clean, clickOn, confirmBtn, cancelBtn, extPage as openExtPage, listDl, navHash,
  noDiff, printDiff, storagePrint, textOf, topDialog, waitFile,
} from './ui.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const HEADLESS = !argv.includes('--headed');
const ONLY = val('only') ? new Set(val('only').split(',')) : null;
const RESTORE_FROM = val('restore-from');
const { profile, ext } = V2[browser];
const profileDir = path.join(PROFILE_ROOT, profile);
const OUT = path.join(ROOT, 'docs/evidence/P15', browser);
const DL = path.join(WORK, browser, 'downloads');
const SUBDIR = 'Tarjuman';
const SUB = path.join(DL, SUBDIR);
const FILES = path.join(WORK, browser, 'files');
const SNAP = path.join(WORK, 'snapshots', `${profile}-after-hand`);
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const rel = (f) => path.relative(ROOT, f);

const hand = JSON.parse(await readFile(path.join(WORK, browser, 'hand-state.json'), 'utf8'));
const TED = VIDEOS.manual.id;
const MID = VIDEOS.asr.id;
const LONG = hand.long;
const EN = (slot) => path.join(WORK, browser, 'en', hand.videos[slot].name);

const result = { browser: `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].app) ?? '?'}`, at: new Date().toISOString(), headless: HEADLESS, profile, long: LONG, head: null, extension: null, checks: [], measures: {}, notes: [], screenshots: [], errors: {} };
const check = (id, ac, ok, detail = null) => {
  result.checks.push({ id, ac, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} [${ac}] ${id}${detail !== null ? ` — ${JSON.stringify(detail).slice(0, 420)}` : ''}`);
};
const want = (name) => !ONLY || ONLY.has(name);

// ---- الملفات: ترجمات النماذج الحقيقية، ومشتقاتها التي يصنعها مستخدم (Markdown، ونسخة مؤخَّرة، وملف ناقص) ----
const TED_SONNET = path.join(ROOT, 'test/e2e/fixtures/iG9CE55wbtY.en.manual.normal.ar.srt');
const TED_HAIKU = path.join(ROOT, 'test/e2e/fixtures/iG9CE55wbtY.en.manual.normal.haiku.ar.srt');
const MID_AR = path.join(ROOT, 'test/e2e/fixtures/Y9rkKtK1b44.en.asr.normal.ar.srt');
const LONG_AR = path.join(WORK, 'translations', `${LONG}.en.asr.normal.ar.srt`);
const cuesOf = async (f) => parseSrtStrict(await readFile(f, 'utf8'));
const srtOf = (cues) => cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');
const DROP = [300, 301, 302];

// ---- دوال في العالم المعزول للإضافة على صفحة الفيديو (بناء التطوير) ----
const I = {
  state: () => {
    const s = globalThis.__tarjuman.controller.getState();
    return {
      loading: s.loading, activeSlot: s.activeSlot, view: s.view, videoId: s.videoId ?? null,
      arabic: s.arabic ? { count: s.arabic.cues.length, fileName: s.arabic.fileName, edited: s.arabic.edited, first: s.arabic.cues[0]?.text ?? null } : null,
    };
  },
  cueText: (n) => globalThis.__tarjuman.controller.getState().arabic?.cues.find((c) => c.n === n)?.text ?? null,
  /** زمن المقطع n في الترجمة النشطة كما خُزّنت (والنسخة المؤخَّرة غير الأصل)، وإزاحتها. */
  cueAt: (n) => {
    const s = globalThis.__tarjuman.controller.getState();
    const c = s.arabic?.cues.find((x) => x.n === n);
    return c ? { startMs: c.startMs, endMs: c.endMs, offsetMs: s.view?.displayOffsetMs ?? 0 } : null;
  },
  bundle: async (id) => {
    const b = await globalThis.__tarjuman.store.getBundle(id);
    if (!b) return null;
    return {
      active: b.active,
      slots: b.slots.map((x) => (x.track ? {
        file: x.track.fileName, count: (x.track.current ?? x.track.original).length, edited: !!x.track.current, fp: x.track.fingerprintId,
        texts: (x.track.current ?? x.track.original).map((c) => c.text), original: x.track.original.map((c) => c.text),
        offset: x.offsetMs, marks: x.marks.map((m) => ({ n: m.n, kind: m.kind })), missing: x.track.comparison?.missing?.length ?? null,
      } : null)),
      previous: b.previous ? { from: b.previous.from, file: b.previous.track.fileName } : null,
    };
  },
  peek: () => globalThis.__tarjuman.mounted.controls.peek(),
  ov: () => (globalThis.__tarjuman.mounted.overlay.peek(true)?.lines ?? []).map((l) => l.text),
  storagePrint,
};
const M = {
  pause: () => { const v = document.querySelector('#movie_player video.html5-main-video'); if (!v) return false; v.muted = true; v.pause(); return v.paused; },
  play: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.play().catch(() => {}); return true; },
  seek: (t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); v.currentTime = t; return true; },
  time: () => document.querySelector('#movie_player video.html5-main-video')?.currentTime ?? -1,
  isAd: () => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); },
};
const S = {
  entry: async (id) => {
    const all = await chrome.storage.local.get(null);
    const rec = { ...all[`video:${id}`], rev: 0 };
    const head = all[`bundle:${id}`];
    return {
      record: rec, active: head ? head.active : rec.arabic ? 1 : null, names: head ? head.names : [null, null, null],
      alts: all[`alts:${id}`]?.slots ?? [null, null, null], previous: all[`prev:${id}`]?.previous ?? null,
      marks: all[`marks:${id}`]?.slots ?? [0, 1, 2].map(() => ({ marks: [], position: null })),
    };
  },
  videos: async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('video:')).map((k) => k.slice(6)).sort(),
};
const E = {
  ready: () => Boolean(globalThis.__tarjumanEditor && document.querySelector('.ed-row[data-index]')),
  info: () => {
    const q = (s) => document.querySelector(s);
    const t = (s) => q(s)?.textContent.trim() ?? null;
    const s = globalThis.__tarjumanEditor.state;
    const dlg = q('dialog[open]');
    return {
      slot: s.slot, active: s.opened.active, count: s.session.count, dirty: s.session.dirty, history: s.session.historySize,
      banner: q('.ed-banner') && !q('.ed-banner').hidden ? t('.ed-banner') : null, toast: q('.ed-toast.is-shown') ? t('.ed-toast') : null,
      search: { count: t('.ed-search__count') }, marks: [...document.querySelectorAll('.ed-markgroup h3')].map((h) => h.textContent),
      complete: t('[aria-label="الاستكمال"]'), lastSeek: s.lastSeek,
      dialog: dlg ? { title: dlg.querySelector('.tj-dialog__title')?.textContent ?? null, checks: dlg.querySelectorAll('input[type=checkbox]').length, checked: dlg.querySelectorAll('input[type=checkbox]:checked').length } : null,
    };
  },
  cue: (i) => { const c = globalThis.__tarjumanEditor.state.session.cueAt(i); return { n: c.n, startMs: c.startMs, endMs: c.endMs, text: c.text }; },
  texts: () => { const s = globalThis.__tarjumanEditor.state.session; return Array.from({ length: s.count }, (_, i) => s.cueAt(i).text); },
  probe: (sel, label) => {
    document.querySelectorAll('[data-probe]').forEach((x) => x.removeAttribute('data-probe'));
    const list = [...document.querySelectorAll(sel)];
    const hit = label === null ? list[0] : list.find((x) => (x.textContent.trim() || x.getAttribute('aria-label') || '').startsWith(label) || (x.getAttribute('aria-label') ?? '').startsWith(label));
    if (!hit) return false;
    hit.setAttribute('data-probe', '1');
    return true;
  },
  reveal: (i) => { globalThis.__tarjumanEditor.jumpTo(i, 'text'); return true; },
  hideEnglish: () => { document.querySelectorAll('.ed-row__en').forEach((x) => { if (x.dir === 'ltr') x.textContent = '…'; }); return true; },
  caretEnd: (i) => { const ta = document.querySelector(`.ed-row[data-index="${i}"] [data-field="text"]`); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return ta.value.length; },
  caret: (i, at) => { const ta = document.querySelector(`.ed-row[data-index="${i}"] [data-field="text"]`); ta.focus(); ta.setSelectionRange(at, at); ta.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })); return ta.value.length; },
};

// ---- المتصفح والصفحات ----
let b = null;
let yt = null;
let isoId = null;
let ytVideo = null;
const tracked = [];
const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
const main = (fn, ...args) => yt.eval(fn, { args });
const front = (page) => b.conn.send('Target.activateTarget', { targetId: page.targetId });
const extPage = (rest) => openExtPage(b.conn, b.extId, rest, tracked);
async function shot(page, name) {
  const f = path.join(OUT, `journey-${name}.png`);
  await page.screenshot(f);
  result.screenshots.push(rel(f));
}

// المشغّل: أدوات الشريط في جذر مغلق، فالنقر بإحداثيات ما يكشفه peek (كما في P12 ودخان W7).
const centerBox = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
async function clickButton(kind) {
  await revealControls(yt);
  const p = await iso(I.peek);
  await yt.click(...Object.values(centerBox(p.buttons[kind].box)));
  await sleep(400);
}
const menu = async () => (await iso(I.peek)).layer.menu;
async function clickItem(match, { wait = true } = {}) {
  const m = await menu();
  const it = m?.items.find((x) => (typeof match === 'string' ? x.fid === match || x.text === match : match(x)));
  if (!it) throw new Error(`لا بند: ${String(match)} — ${m?.items.map((x) => x.fid).join(',')}`);
  const c = centerBox(it.box);
  it.at = Date.now();
  await yt.click(c.x, c.y);
  if (wait) await sleep(400);
  return it;
}
async function openMenuOf(kind, label) {
  if ((await menu())?.label === label) return;
  await clickButton(kind);
}
async function closeMenus() {
  if (await menu()) {
    await yt.key('Escape', 'Escape', 27);
    await sleep(300);
  }
}
let nextUpload = null;
async function playerUpload(file) {
  await front(yt);
  nextUpload = [file];
  if ((await iso(I.state)).arabic) {
    await openMenuOf('upload', 'الترجمة العربية');
    await clickItem('replace');
  } else {
    await clickButton('upload');
  }
  await sleep(2000);
}
async function stableSeek(t) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await main(M.seek, t);
    let ok = true;
    for (let i = 0; i < 5; i++) {
      await sleep(400);
      if (Math.abs((await main(M.time)) - t) > 0.05) {
        ok = false;
        break;
      }
    }
    if (ok) return attempt + 1;
  }
  result.notes.push(`زمن الفيديو لم يثبت بعد القفز إلى ${t} ث (مشغّل يوتيوب تحت الأتمتة).`);
  return 0;
}
/** هل ما زال التبويب حيًا؟ Chrome قد يُسقط التبويبات الخلفية لتوفير الذاكرة فتنقطع جلستها (ثبت في P15). */
const alive = (page) => page.eval('1').then(() => true, () => false);
const dropped = (what) => result.notes.push(`أسقط المتصفح تبويب ${what} في الخلفية فأُعيد فتحه.`);
async function openVideo(id) {
  if (yt && !(await alive(yt))) {
    dropped('الفيديو');
    yt = null;
    ytVideo = null;
  }
  if (yt && ytVideo === id) return;
  if (!yt) {
    yt = await openTab(b.conn, 'about:blank');
    tracked.push({ where: 'youtube', errs: collectErrors(yt, { extId: b.extId, onlyExtension: true }) });
    await yt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
    await yt.send('DOM.enable');
    await yt.send('Page.setInterceptFileChooserDialog', { enabled: true });
    yt.on('Page.fileChooserOpened', async ({ backendNodeId }) => {
      const files = nextUpload ?? [];
      nextUpload = null;
      try {
        await yt.send('DOM.setFileInputFiles', { files, backendNodeId });
      } catch (err) {
        result.notes.push(`منتقي الملفات: ${err.message.slice(0, 120)}`);
      }
    });
  }
  await yt.goto(`https://www.youtube.com/watch?v=${id}`);
  await dismissConsent(yt).catch(() => false);
  await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
  let ready = await waitForPlayer(yt, id, 20000);
  if (!ready) {
    await main(M.play);
    ready = await waitForPlayer(yt, id, 25000);
  }
  if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  await sleep(1500);
  isoId = yt.isolatedContextId(b.extId);
  if (!isoId) throw new Error('لا سياق معزول للإضافة');
  if (await main(M.isAd)) {
    result.notes.push(`إعلان حقيقي على ${id}؛ انتُظر انتهاؤه.`);
    await yt.waitFor(() => {
      const p = document.querySelector('#movie_player');
      const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
      if (skip && getComputedStyle(skip).display !== 'none') skip.click();
      return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
    }, { timeoutMs: 150000, intervalMs: 1000 });
  }
  await main(M.pause);
  await yt.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 10000 });
  await yt.waitFor(() => !globalThis.__tarjuman.controller.getState().loading, { contextId: isoId, timeoutMs: 15000 });
  ytVideo = id;
  await sleep(500);
}
async function within(t0, fn, timeoutMs = 3000) {
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return Date.now() - t0;
    await sleep(50);
  }
  return null;
}
/** مقطع n من الترجمة النشطة ظاهر في الطبقة: القفز إلى منتصفه بزمنه المخزّن في الخانة النشطة وإزاحتها. */
async function showCue(n) {
  const c = await iso(I.cueAt, n);
  await stableSeek((c.startMs + c.endMs) / 2000 + c.offsetMs / 1000);
  await sleep(700);
  return iso(I.ov);
}
/**
 * مثل showCue، وإن لم يظهر نص المقطع (مشغّل يوتيوب تعطّل تحت الأتمتة فعاد زمنه إلى 0، كما سجّلت P12) يُعاد تحميل الصفحة
 * مرتين على الأكثر، ويُسجَّل ذلك ملاحظةً لا فحصًا.
 */
async function showCueSure(id, n) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const want = (await iso(I.cueText, n))?.split('\n')[0];
    const lines = await showCue(n);
    if (want && lines.some((l) => l.includes(want))) return lines;
    result.notes.push(`المقطع ${n} لم يظهر (زمن الفيديو ${Math.round(await main(M.time))} ث)؛ أُعيد تحميل صفحة الفيديو.`);
    ytVideo = null;
    await openVideo(id);
  }
  return iso(I.ov);
}

// ---- المحفوظات ----
let lib = null;
const rowOf = (id) => `document.querySelector('li.lib-row[data-video="${id}"]')`;
// المحدد يعرض الترجمات الموجودة وحدها بأرقام خاناتها (جولة الصقل §٢): [1..3] ← aria-checked أو null.
const rowSlots = (page, id) => page.eval((v) => [1, 2, 3].map((n) => document.querySelector(`li.lib-row[data-video="${v}"] .tj-slots button[data-slot="${n}"]`)?.getAttribute('aria-checked') ?? null), { args: [id] });
async function rowMenu(id, item) {
  await clickOn(lib, `${rowOf(id)}?.querySelector('button.lib-more')`, 'المزيد');
  return byText('.tj-menu__list:not([hidden]) [role=menuitem]', item);
}
async function focusLib() {
  if (!lib || !(await alive(lib))) {
    if (lib) dropped('المحفوظات');
    lib = await extPage('pages/library/index.html');
    await lib.waitFor(() => document.querySelectorAll('li.lib-row').length > 0, { timeoutMs: 15000 });
  }
  await front(lib);
}
async function libReady(id) {
  await focusLib();
  await lib.waitFor((v) => !!document.querySelector(`li.lib-row[data-video="${v}"]`), { args: [id], timeoutMs: 15000 });
}
/** حوار رفع المحفوظات حتى ما قبل التأكيد: الخانة الهدف، ونص التعديلات المهددة. */
async function libraryUploadAsk(id, file, target) {
  await libReady(id);
  await chooseFile(b.conn, lib, await rowMenu(id, 'رفع ترجمة'), file, 'رفع ترجمة…');
  await lib.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .lib-up'), { timeoutMs: 20000 });
  await clickOn(lib, `${topDialog}?.querySelector('.lib-up__targets input[value="${target}"]')`, `الخانة ${target} هدفًا`);
  await sleep(500);
  return { text: clean(await textOf(lib, topDialog)), lost: clean(await textOf(lib, `${topDialog}?.querySelector('.lib-up__lost')`)) };
}
const editsIn = (text) => {
  const m = /سيُستبدل (\d+|تعديل يدوي واحد|تعديلان)/.exec(clean(text));
  if (!m) return null;
  return m[1] === 'تعديل يدوي واحد' ? 1 : m[1] === 'تعديلان' ? 2 : Number(m[1]);
};

// ---- المحرّر ----
let ed = null;
const run = (fn, ...args) => ed.eval(fn, { args });
const info = () => run(E.info);
async function edClick(sel, label = null) {
  const rowIndex = /^\.ed-row\[data-index="(\d+)"\]/.exec(sel)?.[1];
  if (rowIndex !== undefined) await run(E.reveal, Number(rowIndex));
  if (!(await run(E.probe, sel, label))) throw new Error(`لا عنصر: ${sel} ${label ?? ''}`);
  const c = await ed.centerOf('[data-probe="1"]');
  if (!c) throw new Error(`عنصر غير ظاهر: ${sel} ${label ?? ''}`);
  await ed.click(c.x, c.y);
  await sleep(350);
}
async function edHover(sel) {
  if (!(await run(E.probe, sel, null))) throw new Error(`لا عنصر: ${sel}`);
  const c = await ed.centerOf('[data-probe="1"]');
  await ed.mouseMove(c.x, c.y);
  await sleep(250);
}
const edType = async (text) => { await ed.send('Input.insertText', { text }); await sleep(300); };
async function edCmd(page, code, key, keyCode) {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers: 4 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers: 4 });
  await sleep(350);
}
const edSave = async (page = ed) => { await edCmd(page, 'KeyS', 'س', 83); await sleep(1200); };
const rowSel = (i, f) => `.ed-row[data-index="${i}"] [data-field="${f}"]`;
const actSel = (i, a) => `.ed-row[data-index="${i}"] [data-act="${a}"]`;
async function rowAction(i, a) {
  await run(E.reveal, i);
  await edHover(`.ed-row[data-index="${i}"] .ed-row__n`);
  await edClick(actSel(i, a));
}
async function openEditor(query) {
  if (ed && !(await alive(ed))) {
    dropped('المحرّر');
    ed = null;
  }
  if (!ed) ed = await extPage(`pages/editor/index.html?${query}`);
  else {
    await front(ed);
    await ed.goto(`chrome-extension://${b.extId}/pages/editor/index.html?${query}`);
  }
  await front(ed);
  const t0 = Date.now();
  const ok = await ed.waitFor(E.ready, { timeoutMs: 60000 });
  return ok ? Date.now() - t0 : null;
}
async function edMenu(label, item) {
  await edClick('.ed-head .tj-menu__button, .ed-toolbar .tj-menu__button', label);
  await edClick('.tj-menu__item', item);
}
async function editAppend(page, indices, suffix) {
  for (const i of indices) {
    await page.eval((x) => { globalThis.__tarjumanEditor.jumpTo(x, 'text'); }, { args: [i] });
    const c = await page.centerOf(`.ed-row[data-index="${i}"] [data-field="text"]`);
    await page.click(c.x, c.y);
    await page.eval((x) => { const ta = document.querySelector(`.ed-row[data-index="${x}"] [data-field="text"]`); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, { args: [i] });
    await page.send('Input.insertText', { text: suffix });
    await sleep(250);
  }
}

async function step(name, fn) {
  if (!want(name)) return;
  console.log(`— ${name}`);
  try {
    await fn();
  } catch (err) {
    check(`${name}: اكتمل`, 'تشغيل', false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
    if (yt) await closeMenus().catch(() => {});
    if (ed) await ed.eval(() => document.querySelector('dialog[open]')?.close()).catch(() => {});
  }
}

// ======================================================================================
try {
  result.head = String(execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT })).trim();
  if (pidsOf(profileDir).length) throw new Error(`${BROWSERS[browser].name} يعمل بملف ${profile}؛ أغلقه أولًا`);
  // لقطة ملف التعريف بعد الجلسة اليدوية (مرة واحدة)، و--reset يعيدها قبل التشغيل فتتكرر الرحلة من الحالة نفسها.
  if (!(await stat(SNAP).catch(() => null))) await cp(profileDir, SNAP, { recursive: true });
  else if (argv.includes('--reset')) {
    await rm(profileDir, { recursive: true, force: true });
    await cp(SNAP, profileDir, { recursive: true });
  }
  await mkdir(FILES, { recursive: true });
  await mkdir(OUT, { recursive: true });
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', ext], { cwd: ROOT, stdio: 'ignore' });
  result.extension = JSON.parse(await readFile(path.join(ext, 'manifest.json'), 'utf8')).version_name;

  const tedSonnet = await cuesOf(TED_SONNET);
  const tedHaiku = await cuesOf(TED_HAIKU);
  const midAr = await cuesOf(MID_AR);
  // ترجمة الطويل خارج المستودع؛ غيابها يُسقط هذا الفحص وحده، فتُجرَّب بقية الخطوات بـ--only قبل وصولها.
  const longAr = await cuesOf(LONG_AR).catch(() => []);
  check('real-long-translations-ready', 'تحضير', midAr.length >= 900 && longAr.length >= 2000 && tedHaiku.length === tedSonnet.length,
    { ted: [tedSonnet.length, tedHaiku.length], midway: midAr.length, long: longAr.length, englishLong: hand.videos.long.cues });
  // Markdown كما يعيده نموذج في محادثة: مقدمة، ثم الملف في سياج، ثم ملاحظة.
  const TED_MD = path.join(FILES, `${TED}.haiku.ar.md`);
  await writeFile(TED_MD, `# الترجمة العربية\n\nإليك الملف كاملًا:\n\n\`\`\`srt\n${await readFile(TED_HAIKU, 'utf8')}\`\`\`\n\nلا مواضع غامضة.\n`);
  // ملف ميدواي لفيديو آخر (يُرفع على صفحة TED)، وملف ميدواي ناقص بأرقامه الأصلية، ونسخة الطويل مؤخَّرة 3 ث.
  const MID_DROP = path.join(FILES, `${MID}.en.asr.normal.drop.ar.srt`);
  await writeFile(MID_DROP, srtOf(midAr.filter((c) => !DROP.includes(c.n))));
  const LONG_LATE = path.join(FILES, `${LONG}.late.ar.srt`);
  await writeFile(LONG_LATE, srtOf(longAr.map((c) => ({ ...c, startMs: c.startMs + 3000, endMs: c.endMs + 3000 }))));

  b = await launchBrowser(browser, { profile, ext, debug: true, headless: HEADLESS });
  console.log(`— ${result.browser} · الإضافة ${result.extension} · ${result.head} · الطويل ${LONG}`);
  await sleep(1500);
  lib = await extPage('pages/library/index.html');
  await libReady(TED);
  const videos = await lib.eval(S.videos);
  check('library-has-v1-and-hand-videos', 'تحضير', [TED, MID, LONG].every((v) => videos.includes(v)), { videos });

  // ١. TED: ترجمتان من نموذجين في خانتين، والتبديل بينهما يعرض نص كلٍّ منهما.
  await step('ted-two-models', async () => {
    await openVideo(TED);
    let bd = await iso(I.bundle, TED);
    const firstFile = bd.slots[0]?.file;
    await playerUpload(TED_HAIKU);
    const m = await menu();
    const target2 = m?.items.find((x) => x.fid === 'target:2');
    await clickItem('confirm');
    const t0 = Date.now();
    await yt.waitFor(() => globalThis.__tarjuman.controller.getState().activeSlot === 2, { contextId: isoId, timeoutMs: 15000 });
    result.measures.tedUploadMs = Date.now() - t0;
    bd = await iso(I.bundle, TED);
    check('ted-two-models-two-slots', '1', !!target2 && bd.slots[0]?.count === 427 && bd.slots[1]?.count === 427 && bd.slots[1].file === path.basename(TED_HAIKU) && bd.slots[0].file === firstFile
      && bd.slots[0].texts.join('\n') !== bd.slots[1].texts.join('\n'), { files: bd.slots.map((x) => x?.file ?? null), active: bd.active, missing: bd.slots.map((x) => x?.missing ?? null) });
    const n = tedHaiku.find((c) => c.startMs >= 120000 && c.endMs - c.startMs >= 1800 && !c.text.includes('\n')).n;
    const ov2 = await showCue(n);
    const txt2 = await iso(I.cueText, n);
    await closeMenus();
    await openMenuOf('upload', 'الترجمة العربية');
    const t1 = (await clickItem('slot:1', { wait: false })).at;
    const ms = await within(t1, async () => (await iso(I.state)).activeSlot === 1);
    await closeMenus();
    const ov1 = await showCue(n);
    const txt1 = await iso(I.cueText, n);
    const s1 = bd.slots[0].texts[n - 1];
    const s2 = bd.slots[1].texts[n - 1];
    check('ted-switch-shows-each-model', '1', ms !== null && txt2 === s2 && txt1 === s1 && ov2.some((l) => l.includes(s2.split('\n')[0])) && ov1.some((l) => l.includes(s1.split('\n')[0])),
      { cue: n, switchMs: ms, haiku: ov2, sonnet: ov1 });
    await shot(yt, 'ted-slot1');
  });

  // ٢. فحص الملف الوارد: ملف لفيديو آخر يُنبَّه إليه ويُلغى بلا أثر، وملف Markdown يُقبل في الخانة 3.
  await step('ted-incoming-checks', async () => {
    await openVideo(TED);
    await front(yt);
    await sleep(1000);
    const p0 = await iso(I.storagePrint);
    await playerUpload(MID_AR);
    const m = await menu();
    const warned = clean(m?.text).includes('الاسم يشير إلى فيديو آخر');
    await clickItem('cancel');
    await sleep(600);
    await closeMenus();
    const d = printDiff(p0, await iso(I.storagePrint));
    check('other-video-file-warned-then-cancel-no-write', '1 · 3', warned && noDiff(d), { warned, label: m?.label, line: clean(m?.text).slice(0, 200), diff: noDiff(d) ? null : d });
    await playerUpload(TED_MD);
    const m2 = await menu();
    const target3 = m2?.items.find((x) => x.fid === 'target:3');
    await clickItem(target3 ? 'target:3' : 'confirm');
    if ((await menu())?.items.some((x) => x.fid === 'confirm')) await clickItem('confirm');
    await yt.waitFor(() => globalThis.__tarjuman.controller.getState().activeSlot === 3, { contextId: isoId, timeoutMs: 15000 });
    const bd = await iso(I.bundle, TED);
    check('markdown-file-accepted-into-slot-3', '1', bd.slots[2]?.count === 427 && bd.slots[2].texts.join('\n') === tedHaiku.map((c) => c.text).join('\n') && bd.slots[2].missing === 0,
      { file: bd.slots[2]?.file, count: bd.slots[2]?.count, missing: bd.slots[2]?.missing, menu: clean(m2?.text).slice(0, 160) });
    await closeMenus();
    await openMenuOf('upload', 'الترجمة العربية');
    await clickItem('slot:1');
    await closeMenus();
  });

  // ٣. ميدواي: الترجمة الطويلة (1,056) من المحفوظات إلى الخانة 2، والملف الناقص إلى الخانة 3.
  await step('midway-library-uploads', async () => {
    let up = await libraryUploadAsk(MID, MID_AR, 2);
    const t0 = await clickOn(lib, confirmBtn, 'حفظ');
    await lib.waitFor(() => !document.querySelector('dialog.tj-dialog[open] .lib-up'), { timeoutMs: 30000 });
    result.measures.midwayLibraryUploadMs = Date.now() - t0;
    let bd = await lib.eval(async (id) => (await chrome.storage.local.get(`alts:${id}`))[`alts:${id}`], { args: [MID] });
    const entry = await lib.eval(S.entry, { args: [MID] });
    const slot2 = entry.active === 2 ? entry.record.arabic : entry.alts[1]?.track;
    check('midway-1056-into-slot-2', '1', (slot2?.current ?? slot2?.original)?.length === midAr.length && slot2.comparison?.missing?.length === 0 && !/سيُستبدل/.test(up.text),
      { active: entry.active, count: (slot2?.current ?? slot2?.original)?.length, missing: slot2?.comparison?.missing?.length, ms: result.measures.midwayLibraryUploadMs });
    up = await libraryUploadAsk(MID, MID_DROP, 3);
    await clickOn(lib, confirmBtn, 'حفظ');
    await lib.waitFor(() => !document.querySelector('dialog.tj-dialog[open] .lib-up'), { timeoutMs: 30000 });
    bd = await lib.eval(S.entry, { args: [MID] });
    const slot3 = bd.active === 3 ? bd.record.arabic : bd.alts[2]?.track;
    check('midway-dropped-into-slot-3', '1', (slot3?.current ?? slot3?.original)?.length === midAr.length - DROP.length && slot3.comparison?.missing?.length === DROP.length,
      { count: (slot3?.current ?? slot3?.original)?.length, missing: slot3?.comparison?.missing, text: up.text.slice(0, 160) });
  });

  // ٤. ميدواي: الاستكمال في المحرّر على الخانة 3 (إلغاء المعاينة أولًا بلا أثر)، والرد بنص الترجمة الحقيقية.
  await step('midway-complete', async () => {
    await openEditor(`v=${MID}&t=3`);
    await edClick('.ed-tab', 'الاستكمال');
    let s = await info();
    check('editor-complete-finds-missing', '1', (s.complete ?? '').includes(`الناقص (${DROP.length})`), { complete: clean(s.complete).slice(0, 160) });
    const before = new Set(await listDl(SUB));
    await edClick('[aria-label="الاستكمال"] button', 'تنزيل ملف الاستكمال');
    const patch = await waitFile(SUB, (n) => /\.patch( \(\d+\))?\.srt$/.test(n), { except: before, timeoutMs: 20000 });
    const patchCues = patch ? parseSrtLenient(await readFile(patch.path, 'utf8')).cues : [];
    check('editor-patch-file-in-subfolder', '1', !!patch && patchCues.map((c) => c.n).join(',') === DROP.join(','), { file: patch ? `${SUBDIR}/${patch.name}` : null, cues: patchCues.map((c) => c.n) });
    const reply = path.join(FILES, `${MID}.patch.reply.srt`);
    await writeFile(reply, srtOf(patchCues.map((c) => ({ ...c, text: midAr.find((x) => x.n === c.n).text }))));
    const setReply = async () => {
      const { root } = await ed.send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await ed.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[aria-label="الاستكمال"] input[type=file]' });
      await ed.send('DOM.setFileInputFiles', { nodeId, files: [reply] });
      await sleep(1200);
    };
    await front(ed);
    await sleep(800);
    const p0 = await run(storagePrint);
    const c0 = (await info()).count;
    await setReply();
    s = await info();
    const previewed = s.dialog?.title === 'معاينة ملف التصحيح';
    await edClick('dialog[open] button', 'إلغاء');
    await sleep(500);
    s = await info();
    const d = printDiff(p0, await run(storagePrint));
    check('editor-patch-preview-cancel-no-change', '3', previewed && s.count === c0 && !s.dirty && noDiff(d), { previewed, count: s.count, dirty: s.dirty, diff: noDiff(d) ? null : d });
    await setReply();
    s = await info();
    await edClick('dialog[open] button', 'تطبيق');
    await sleep(800);
    await edSave();
    const e = await lib.eval(S.entry, { args: [MID] });
    const slot3 = e.active === 3 ? e.record.arabic : e.alts[2]?.track;
    const texts = (slot3?.current ?? slot3?.original ?? []);
    check('editor-patch-applied-and-saved', '1', texts.length === midAr.length && DROP.every((n) => texts.find((c) => c.n === n)?.text === midAr.find((c) => c.n === n).text),
      { count: texts.length, missingNow: slot3?.comparison?.missing?.length ?? null });
  });

  // ٥. الطويل: أول رفع من المشغّل (2000 فأكثر)، ثم المزامنة بالجملة لنسخة مؤخَّرة 3 ث في الخانة 2.
  let CUE = null;
  await step('long-upload-and-sync', async () => {
    await openVideo(LONG);
    const t0 = Date.now();
    await playerUpload(LONG_AR);
    if ((await menu())?.items.some((x) => x.fid === 'confirm')) await clickItem('confirm');
    await yt.waitFor(() => globalThis.__tarjuman.controller.getState().arabic?.cues.length > 0, { contextId: isoId, timeoutMs: 30000 });
    result.measures.longFirstUploadMs = Date.now() - t0;
    let s = await iso(I.state);
    let bd = await iso(I.bundle, LONG);
    check('long-first-upload-2000-plus-slot-1', '1', s.activeSlot === 1 && s.arabic?.count === longAr.length && longAr.length >= 2000 && bd.slots[0]?.missing === 0,
      { count: s.arabic?.count, missing: bd.slots[0]?.missing, ms: result.measures.longFirstUploadMs });
    CUE = longAr.find((c) => c.startMs >= 600000 && c.endMs - c.startMs >= 1500 && !c.text.includes('\n'));
    const lines = await showCue(CUE.n);
    check('long-overlay-shows-cue', '1', lines.some((l) => l.includes(CUE.text)), { cue: CUE.n, lines });
    await shot(yt, 'long-player');
    await playerUpload(LONG_LATE);
    const m0 = await menu();
    const t2 = m0?.items.find((x) => x.fid === 'target:2');
    await clickItem('confirm');
    await yt.waitFor(() => globalThis.__tarjuman.controller.getState().activeSlot === 2, { contextId: isoId, timeoutMs: 30000 });
    await closeMenus();
    await stableSeek(CUE.startMs / 1000);
    await sleep(800);
    await openMenuOf('badge', 'توقيت الترجمة');
    const at = await main(M.time);
    await clickItem('sync');
    const m = await menu();
    const item = m.items.find((x) => x.fid === `sentence:${CUE.n - 1}`) ?? m.items.find((x) => x.fid?.startsWith('sentence:') && clean(x.text) === clean(CUE.text));
    if (!item) throw new Error(`الجملة ${CUE.n} ليست في النافذة`);
    await clickItem(item.fid);
    s = await iso(I.state);
    await closeMenus();
    const wantMs = Math.round((at * 1000 - (CUE.startMs + 3000)) / 100) * 100;
    bd = await iso(I.bundle, LONG);
    check('long-sync-one-sentence-fixes-3s', '1', !!t2 && Math.abs(s.view.displayOffsetMs - wantMs) <= 100 && s.view.displayOffsetMs <= -2500 && s.view.displayOffsetMs >= -3500 && bd.slots[1]?.offset === s.view.displayOffsetMs,
      { offset: s.view.displayOffsetMs, want: wantMs, stored: bd.slots[1]?.offset });
  });

  // ٦. علامة من المشغّل: تظهر في لوحة مراجعة المحرّر وفي فرز المحفوظات. على TED لا على الطويل: مشغّل يوتيوب لفيديو AWS
  // يتعطل تحت الأتمتة بلا نافذة («حدث خطأ») فيعيد زمنه إلى 0 لحظة فتح القائمة، فلا مقطع ظاهر يُعلَّم (يُسجَّل ملاحظةً).
  await step('mark-across', async () => {
    await openVideo(TED);
    await front(yt);
    const active = (await iso(I.state)).activeSlot;
    const n = (await iso(() => globalThis.__tarjuman.controller.getState().arabic.cues.find((c) => c.startMs >= 240000 && c.endMs - c.startMs >= 1800 && !c.text.includes('\n'))?.n));
    await showCueSure(TED, n);
    await openMenuOf('upload', 'الترجمة العربية');
    const tm = (await clickItem('mark', { wait: false })).at;
    result.measures.markWriteMs = await within(tm, async () => (await iso(I.bundle, TED)).slots[active - 1]?.marks.some((m) => m.n === n), 5000);
    await sleep(500);
    await closeMenus();
    const bd = await iso(I.bundle, TED);
    const pk = await iso(I.peek);
    check('player-mark-stored', '1', bd.slots[active - 1].marks.some((x) => x.n === n && x.kind === 'todo'),
      { marks: bd.slots.map((x) => x?.marks ?? null), cue: n, slot: active, ms: result.measures.markWriteMs, toasts: pk.layer.toasts.map((t) => t.text) });
    const ms = await openEditor(`v=${TED}&t=${active}`);
    if (await run(E.probe, '.ed-tab', 'المراجعة')) await edClick('.ed-tab', 'المراجعة');
    const s = await info();
    check('mark-in-editor-review', '1', s.marks.some((m) => m.startsWith('أعود إليه (1)')), { marks: s.marks, readyMs: ms });
    await focusLib();
    await lib.reload();
    const chips = await lib.waitFor(() => {
      const l = [...document.querySelectorAll('.tj-chip')].map((c) => c.getAttribute('aria-label'));
      return l.some((x) => /^تحتاج مراجعة \([1-9]\d*\)$/.test(x)) ? l : null;
    }, { timeoutMs: 8000 });
    await clickOn(lib, byText('.tj-chip', 'تحتاج مراجعة'), 'فرز «تحتاج مراجعة»');
    await sleep(500);
    const rows = await lib.eval(() => [...document.querySelectorAll('li.lib-row')].map((r) => r.dataset.video));
    check('mark-counted-in-library-filter', '1', !!chips && rows.includes(TED), { chips, rows });
    await clickOn(lib, byText('.tj-chip', 'الكل'), 'فرز «الكل»');
  });

  // ٧. المحرّر على 2000 مقطع فأكثر في خانة غير نشطة (1، والنشطة 2): بحث واستبدال بمعاينة، ودمج، وشطر، وحفظ؛ والمشغّل لا
  // يتغير؛ ثم القفز إلى تبويب المشغّل.
  await step('long-editor', async () => {
    await openVideo(LONG);
    await front(yt);
    await showCueSure(LONG, CUE.n);
    const before = { state: await iso(I.state), lines: await iso(I.ov) };
    const readyMs = await openEditor(`v=${LONG}&t=1`);
    let s = await info();
    const count = s.count;
    result.measures.longEditorReadyMs = readyMs;
    check('long-editor-opens-non-active-2000-plus', '1', s.slot === 1 && s.active === 2 && count === longAr.length && readyMs !== null, { slot: s.slot, active: s.active, count, readyMs });
    // كلمة تتكرر في الترجمة الحقيقية تُستبدل كلها بمعاينة.
    const word = 'الشبكة';
    const total = (await run(E.texts)).filter((t) => t.includes(word)).length;
    await edClick(rowSel(3, 'text'));
    await edCmd(ed, 'KeyF', 'ب', 70);
    await edType(word);
    await sleep(600);
    await edClick('.ed-search button', 'استبدال');
    await edClick('.ed-search__replace input');
    await edType('الشبكةُ');
    await edClick('.ed-search__replace button', 'معاينة استبدال الكل');
    s = await info();
    const previewOk = s.dialog?.title === 'معاينة استبدال الكل' && s.dialog.checks === total && s.dialog.checked === total;
    await edClick('dialog[open] button', 'استبدال');
    const replaced = (await run(E.texts)).filter((t) => t.includes('الشبكةُ')).length;
    check('long-editor-search-replace-all', '1', previewOk && total > 5 && replaced === total, { total, replaced, dialog: s.dialog });
    await ed.eval(() => { const i = document.querySelector('.ed-search__input'); i.value = ''; i.dispatchEvent(new Event('input')); });
    await ed.key('Escape', 'Escape', 27);
    await sleep(300);
    await rowAction(4, 'merge');
    s = await info();
    const merged = s.count === count - 1;
    await run(E.reveal, 8);
    await run(E.caret, 8, 3);
    await edClick(actSel(8, 'split'));
    s = await info();
    check('long-editor-merge-and-split', '1', merged && s.count === count && s.dirty, { count: s.count, was: count });
    const t0 = Date.now();
    await edSave();
    result.measures.longEditorSaveMs = Date.now() - t0;
    const bd = await iso(I.bundle, LONG);
    await sleep(800);
    const after = { state: await iso(I.state), lines: await iso(I.ov) };
    check('long-editor-save-non-active-keeps-player', '1', bd.slots[0].count === count && bd.slots[0].texts.filter((t) => t.includes('الشبكةُ')).length === replaced && bd.active === 2
      && after.state.activeSlot === 2 && JSON.stringify(after.lines) === JSON.stringify(before.lines), { stored: bd.slots[0].count, active: bd.active, before: before.lines, after: after.lines });
    await front(ed);
    const target = await run(E.cue, 40);
    await rowAction(40, 'seek');
    await sleep(1500);
    const at = Math.round((await main(M.time)) * 1000);
    const expect = target.startMs + (bd.slots[0].offset ?? 0);
    check('long-editor-jump-reaches-player-tab', '1', Math.abs(at - expect) < 400, { at, expect });
  });

  // ٧ب. مراجعة الواجهة بمبدأ «المشغّل للمشاهدة» (P15-AC5، §٦.٥) على بيانات حقيقية: الشريط وقوائمه بنصوصها المقيسة، وحوار
  // الاستبدال من المشغّل (يُلغى بلا أثر، AC3)، ونافذة الأيقونة، والصفحات بالوضعين. اللقطات للمراجعة البشرية في الأدلة.
  await step('ui-review', async () => {
    await openVideo(LONG);
    await front(yt);
    await closeMenus();
    const lines = (t) => clean(t).length;
    const menus = {};
    const grab = async (key) => {
      const m = await menu();
      menus[key] = { label: m?.label ?? null, items: m?.items.map((x) => x.fid) ?? [], chars: lines(m?.text), height: m?.box.height ?? null };
      await shot(yt, `ui-${key}`);
    };
    await revealControls(yt);
    const bar = await iso(I.peek);
    result.measures.bar = { buttons: Object.keys(bar.buttons), group: bar.group, size: bar.size };
    await shot(yt, 'ui-bar');
    await openMenuOf('upload', 'الترجمة العربية');
    await grab('menu-display');
    const p0 = await iso(I.storagePrint);
    nextUpload = [LONG_AR];
    await clickItem('replace');
    await sleep(2000);
    await clickItem('target:2').catch(() => null);
    await grab('menu-replace');
    await clickItem('cancel');
    await sleep(600);
    await closeMenus();
    const d = printDiff(p0, await iso(I.storagePrint));
    check('player-replace-cancel-no-write', '3', menus['menu-replace'].label === 'استبدال الترجمة؟' && noDiff(d), { label: menus['menu-replace'].label, diff: noDiff(d) ? null : d });
    await openMenuOf('badge', 'توقيت الترجمة');
    await grab('menu-timing');
    await clickItem('sync');
    await grab('menu-sync');
    await closeMenus();
    await openMenuOf('download', 'تحميل الترجمة');
    await grab('menu-download');
    await closeMenus();
    result.measures.menus = menus;
    // الشريط بعناصره الخمسة وحدها (§٦.١)، والقوائم بلا شرح طويل: أطول نص قائمة كاملة بالمحارف للمراجعة.
    check('ui-player-bar-five-elements-and-short-menus', 'مراجعة', result.measures.bar.buttons.length === 5 && Object.values(menus).every((m) => m.chars > 0 && m.chars < 600),
      { buttons: result.measures.bar.buttons, chars: Object.fromEntries(Object.entries(menus).map(([k, m]) => [k, m.chars])) });
    // نافذة الأيقونة في تبويب خلفي فيبقى تبويب الفيديو النشط، ثم «نسخ تشخيص الصفحة» بحافظة بديلة في الصفحة (P15-AC4).
    await front(yt);
    const pop = await openTab(b.conn, `chrome-extension://${b.extId}/pages/popup/index.html`, { background: true });
    tracked.push({ where: 'pages/popup/index.html', errs: collectErrors(pop, { extId: b.extId }) });
    await sleep(1500);
    const stub = () => { window.__copied = []; Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { window.__copied.push(t); } }); return true; };
    await pop.eval(stub);
    await pop.eval(() => document.querySelector('[data-action="diagnostics"]')?.click());
    await sleep(1200);
    const pageDiag = (await pop.eval(() => window.__copied ?? []))[0] ?? '';
    await shot(pop, 'ui-popup');
    await pop.close();
    const st = await extPage('pages/settings/index.html#diagnostics');
    await st.eval(stub);
    await clickOn(st, byText('button', 'نسخ تقرير التشخيص'), 'نسخ تقرير التشخيص');
    await sleep(1200);
    const settingsDiag = (await st.eval(() => window.__copied ?? []))[0] ?? '';
    await st.close();
    const titles = hand.videos ? Object.values(hand.videos).map((v) => v.title).filter(Boolean) : [];
    const leaks = (t) => ({ url: /https?:\/\//.test(t), secrets: findSecrets(t).length, title: titles.some((x) => t.includes(x)), cue: !!CUE && t.includes(CUE.text), file: /\.srt|\.md/.test(t) });
    const clean2 = (t) => Object.values(leaks(t)).every((x) => !x);
    check('diagnostics-page-and-settings-no-text-no-url', '4', pageDiag.length > 50 && settingsDiag.length > 50 && clean2(pageDiag) && clean2(settingsDiag),
      { page: { chars: pageDiag.length, ...leaks(pageDiag) }, settings: { chars: settingsDiag.length, ...leaks(settingsDiag) } });
    const pages = [['library', 'pages/library/index.html'], ['settings-data', 'pages/settings/index.html#data'], ['settings-glossary', 'pages/settings/index.html#glossary'], ['settings-export', 'pages/settings/index.html#export'],
      ['editor-review', `pages/editor/index.html?v=${LONG}&t=2`]];
    for (const [name, url] of pages) {
      const p = await extPage(url);
      await front(p);
      await sleep(1500);
      if (name === 'editor-review') {
        await p.waitFor(E.ready, { timeoutMs: 60000 });
        await p.eval(E.hideEnglish);
      }
      for (const scheme of ['light', 'dark']) {
        await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
        await sleep(500);
        await shot(p, `ui-${name}-${scheme}`);
      }
      await p.close();
    }
  });

  // ٨. تعارض الحفظ بين تبويبين على الخانة نفسها: كلاهما عدّل قبل أن يحفظ أحدهما؛ الأول يحفظ، والثاني يُنبَّه ولا يكتب فوقه.
  await step('save-conflict-two-tabs', async () => {
    await openEditor(`v=${LONG}&t=1`);
    const ed2 = await extPage(`pages/editor/index.html?v=${LONG}&t=1`);
    await ed2.waitFor(E.ready, { timeoutMs: 60000 });
    await front(ed);
    await editAppend(ed, [10], ' — من التبويب الأول');
    // التعديل يُسجَّل في الجلسة بعد الكتابة بقليل؛ ينتظر السكربت تسجيله في التبويبين قبل الحفظ (وإلا لا تعارض أصلًا).
    const dirtyA = await ed.waitFor(() => globalThis.__tarjumanEditor.state.session.dirty, { timeoutMs: 5000 });
    await front(ed2);
    await editAppend(ed2, [11], ' — من التبويب الثاني');
    const dirtyB = await ed2.waitFor(() => globalThis.__tarjumanEditor.state.session.dirty, { timeoutMs: 5000 });
    await front(ed);
    await edSave(ed);
    const savedA = await info();
    const content = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => /^(video|alts|bundle|prev):/.test(k)));
    const p1 = content(await ed.eval(storagePrint));
    await front(ed2);
    await sleep(800);
    const bannerBefore = await ed2.eval(() => { const x = document.querySelector('.ed-banner'); return x && !x.hidden ? x.textContent.trim() : null; });
    await edSave(ed2);
    await sleep(800);
    const banner = await ed2.eval(() => { const x = document.querySelector('.ed-banner'); return x && !x.hidden ? x.textContent.trim() : null; });
    const p2 = content(await ed2.eval(storagePrint));
    const entry = await ed2.eval(S.entry, { args: [LONG] });
    const slot1 = entry.active === 1 ? entry.record.arabic : entry.alts[0]?.track;
    const texts = (slot1?.current ?? slot1?.original ?? []).map((c) => c.text);
    const d = printDiff(p1, p2);
    check('save-conflict-second-tab-warned-no-overwrite', '3', !!(banner || bannerBefore) && texts.some((t) => t.endsWith('من التبويب الأول')) && !texts.some((t) => t.endsWith('من التبويب الثاني')) && noDiff(d),
      { bannerOnExternalChange: clean(bannerBefore).slice(0, 160), bannerOnSave: clean(banner).slice(0, 160), diff: noDiff(d) ? null : d,
        dirty: { a: dirtyA, b: dirtyB }, savedA: { dirty: savedA.dirty, toast: savedA.toast, banner: savedA.banner }, texts: { c11: texts[10]?.slice(-24), c12: texts[11]?.slice(-24) } });
    await shot(ed2, 'conflict-banner');
    await ed2.close();
  });

  // ٩. TED: تعديل الخانة 1 في المحرّر، ثم استبدالها من المحفوظات (إلغاء أولًا بلا أثر، ثم «إبقاء تعديلاتي»)، ثم استعادة السابقة
  // (إلغاء أولًا بلا أثر).
  const EDITED = ' — عدّلته في المحرّر';
  await step('ted-replace-and-restore', async () => {
    await openEditor(`v=${TED}&t=1`);
    await editAppend(ed, [5, 6, 7], EDITED);
    await edSave();
    await focusLib();
    await sleep(800);
    // العدد المتوقع بمحرّك P11 نفسه على الخانة كما خُزّنت (ترجمة P9 فيها تعديل سابق من الإصدار الأول).
    const e0 = await lib.eval(S.entry, { args: [TED] });
    const t0 = e0.active === 1 ? e0.record.arabic : e0.alts[0]?.track;
    const expectEdits = diffTranslations(t0.original, t0.current ?? t0.original).changes.length;
    let p0 = await lib.eval(storagePrint);
    let up = await libraryUploadAsk(TED, TED_HAIKU, 1);
    await clickOn(lib, cancelBtn, 'إلغاء');
    await sleep(600);
    let d = printDiff(p0, await lib.eval(storagePrint));
    check('library-replace-cancel-no-write', '3', editsIn(up.lost) === expectEdits && expectEdits >= 3 && noDiff(d), { edits: editsIn(up.lost), expected: expectEdits, diff: noDiff(d) ? null : d });
    up = await libraryUploadAsk(TED, TED_HAIKU, 1);
    await clickOn(lib, `${topDialog}?.querySelector('.lib-up input[type="checkbox"]')`, 'إبقاء تعديلاتي');
    await clickOn(lib, confirmBtn, 'تأكيد الاستبدال');
    await lib.waitFor(() => !document.querySelector('dialog.tj-dialog[open] .lib-up'), { timeoutMs: 30000 });
    await sleep(800);
    let e = await lib.eval(S.entry, { args: [TED] });
    let s1 = e.active === 1 ? e.record.arabic : e.alts[0]?.track;
    const cur = s1?.current ?? s1?.original ?? [];
    check('library-replace-keeps-edits', '1', s1?.fileName === path.basename(TED_HAIKU) && cur.filter((c) => c.text.endsWith(EDITED)).length === 3 && e.previous?.from === 1
      && cur.find((c) => c.n === 100)?.text === tedHaiku.find((c) => c.n === 100).text, { file: s1?.fileName, edited: cur.filter((c) => c.text.endsWith(EDITED)).length, previous: e.previous && { from: e.previous.from, file: e.previous.track.fileName } });
    const prevFile = e.previous?.track.fileName;
    // بعد إعادة تصميم الهوية: «الترجمات…» توسيع في الصف (زر .lib-toggle) وسطر النسخة السابقة .lib-prevl فيه، لا حوار .lib-panel
    // (تدقيق Fable، FA-06؛ كانت الخطوة تنتظر محددات الحوار القديم).
    if ((await lib.eval((sel) => document.querySelector(`${sel} .lib-toggle`)?.getAttribute('aria-expanded'), { args: [`li.lib-row[data-video="${TED}"]`] })) !== 'true') {
      await clickOn(lib, `${rowOf(TED)}?.querySelector('.lib-toggle')`, 'إظهار الترجمات');
    }
    await lib.waitFor(() => !!document.querySelector('.lib-prevl .lib-prevl__restore'), { timeoutMs: 8000 });
    await sleep(500);
    p0 = await lib.eval(storagePrint);
    await clickOn(lib, `document.querySelector('.lib-prevl .lib-prevl__restore')`, 'استعادة');
    await lib.waitFor(() => !!document.querySelector('dialog.tj-dialog[open]'), { timeoutMs: 8000 });
    await clickOn(lib, cancelBtn, 'إلغاء');
    await sleep(600);
    d = printDiff(p0, await lib.eval(storagePrint));
    check('restore-previous-cancel-no-write', '3', noDiff(d), noDiff(d) ? null : d);
    await clickOn(lib, `document.querySelector('.lib-prevl .lib-prevl__restore')`, 'استعادة');
    await lib.waitFor(() => !!document.querySelector('dialog.tj-dialog[open]'), { timeoutMs: 8000 });
    await clickOn(lib, confirmBtn, 'استعادة');
    await sleep(1200);
    e = await lib.eval(S.entry, { args: [TED] });
    s1 = e.active === 1 ? e.record.arabic : e.alts[0]?.track;
    const back = s1?.current ?? s1?.original ?? [];
    check('restore-previous-brings-back-edited', '1', s1?.fileName === prevFile && back.filter((c) => c.text.endsWith(EDITED)).length === 3 && e.previous?.track.fileName === path.basename(TED_HAIKU),
      { file: s1?.fileName, edited: back.filter((c) => c.text.endsWith(EDITED)).length, previous: e.previous?.track.fileName });
    // التوسيع في الصف يبقى مفتوحًا (لا لوحة تُغلق)؛ يُطوى بزره فيعود الصف كما كان.
    await clickOn(lib, `${rowOf(TED)}?.querySelector('.lib-toggle')`, 'إخفاء الترجمات');
    await openVideo(TED);
    await sleep(800);
    const st = await iso(I.state);
    check('player-shows-restored-translation', '1', st.activeSlot === 1 && st.arabic?.fileName === prevFile, { active: st.activeSlot, file: st.arabic?.fileName });
  });

  // ١٠. التصدير من المحرّر والمحفوظات في المجلد الفرعي، والنسخة الاحتياطية بكل المكتبة.
  await step('exports-and-backup', async () => {
    await openEditor(`v=${LONG}&t=1`);
    let before = new Set(await listDl(SUB));
    await edMenu('تصدير', 'الترجمة SRT');
    await edClick('dialog[open] button', 'تنزيل SRT');
    const srt = await waitFile(SUB, (n) => n.startsWith(LONG) && /\.ar( \(\d+\))?\.srt$/.test(n), { except: before, timeoutMs: 30000 });
    check('editor-export-2000-plus-in-subfolder', '1', !!srt && parseSrtLenient(await readFile(srt.path, 'utf8')).cues.length === longAr.length, { file: srt ? `${SUBDIR}/${srt.name}` : null });
    await libReady(MID);
    before = new Set(await listDl(SUB));
    await clickOn(lib, await rowMenu(MID, 'الإنجليزية'), 'تصدير الإنجليزية');
    const en = await waitFile(SUB, (n) => n.startsWith(MID) && n.endsWith('.srt'), { except: before });
    check('library-export-in-subfolder', '1', !!en, { file: en ? `${SUBDIR}/${en.name}` : null });
    const st = await extPage('pages/settings/index.html#data');
    await st.waitFor(() => !!document.querySelector('#data .st-data'), { timeoutMs: 8000 });
    await front(st);
    before = new Set(await listDl(SUB));
    const t0 = await clickOn(st, byText('#data button', 'إنشاء نسخة احتياطية'), 'إنشاء نسخة احتياطية');
    const created = await st.waitFor(() => [...document.querySelectorAll('#data .tj-alert')].find((e) => e.textContent.includes('أُنشئت النسخة الاحتياطية'))?.textContent ?? null, { timeoutMs: 60000, intervalMs: 200 });
    const file = await waitFile(SUB, (n) => /^tarjuman-backup-\d{4}-\d{2}-\d{2}( \(\d+\))?\.json$/.test(n), { except: before, timeoutMs: 30000 });
    result.measures.backupMs = Date.now() - t0;
    const text = file ? await readFile(file.path, 'utf8') : null;
    const head = text ? JSON.parse(text) : null;
    const ids = await st.eval(S.videos);
    let same = !!head;
    for (const id of ids) {
      const entry = head?.data.videos.find((v) => v.record.videoId === id);
      const live = await st.eval(S.entry, { args: [id] });
      if (!entry || canonical({ ...entry, record: { ...entry.record, rev: 0 } }) !== canonical(live)) same = false;
    }
    check('backup-whole-library-in-subfolder', '1', !!created && !!file && head?.counts.videos === ids.length && same,
      { file: file ? `${SUBDIR}/${file.name}` : null, counts: head?.counts, bytes: text?.length ?? null, ms: result.measures.backupMs, sameAsStorage: same });
    if (file) await cp(file.path, path.join(WORK, `backup-from-${browser}.json`));
  });

  // ١١. (Chrome) نسخة Brave تُستعاد هنا: إلغاء المعاينة أولًا بلا أثر، ثم استبدال كل الموجود، فيطابق كل فيديو نسخة Brave.
  if (RESTORE_FROM) {
    await step('restore-brave-backup', async () => {
      const st = await extPage('pages/settings/index.html#data');
      await st.waitFor(() => !!document.querySelector('#data .st-data'), { timeoutMs: 8000 });
      await front(st);
      await sleep(800);
      const p0 = await st.eval(storagePrint);
      await chooseFile(b.conn, st, byText('#data button', 'استعادة من ملف'), RESTORE_FROM, 'استعادة من ملف…');
      await st.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .st-restore'), { timeoutMs: 60000 });
      await clickOn(st, cancelBtn, 'إلغاء');
      await sleep(600);
      const d = printDiff(p0, await st.eval(storagePrint));
      check('restore-preview-cancel-no-write', '3', noDiff(d), noDiff(d) ? null : d);
      await chooseFile(b.conn, st, byText('#data button', 'استعادة من ملف'), RESTORE_FROM, 'استعادة من ملف…');
      await st.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .st-restore'), { timeoutMs: 60000 });
      const pv = clean(await textOf(st, topDialog));
      // الموجود يُتخطى افتراضيًا؛ يُختار كله للاستبدال هنا، فتطابق المكتبة نسخة Brave.
      await st.eval(() => document.querySelectorAll('dialog.tj-dialog[open] .st-restore input[type="checkbox"][data-video]').forEach((x) => { if (!x.checked) x.click(); }));
      await sleep(300);
      await clickOn(st, confirmBtn, 'استعادة');
      const report = await st.waitFor(() => [...document.querySelectorAll('#data .tj-alert')].find((e) => e.textContent.includes('اكتملت الاستعادة'))?.textContent.replace(/\s+/g, ' ').trim() ?? null, { timeoutMs: 120000, intervalMs: 250 });
      const backup = JSON.parse(await readFile(RESTORE_FROM, 'utf8'));
      const mismatched = [];
      for (const entry of backup.data.videos) {
        const live = await st.eval(S.entry, { args: [entry.record.videoId] });
        if (canonical({ ...entry, record: { ...entry.record, rev: 0 } }) !== canonical(live)) mismatched.push(entry.record.videoId);
      }
      check('brave-backup-restored-in-chrome-identical', '1', !!report && /تعذّر 0/.test(clean(report)) && mismatched.length === 0,
        { preview: pv.slice(0, 220), report: clean(report), videos: backup.data.videos.length, mismatched });
      await shot(st, 'restore-report');
      await openVideo(TED);
      const s = await iso(I.state);
      const want2 = backup.data.videos.find((v) => v.record.videoId === TED);
      check('restored-shows-in-player', '1', s.activeSlot === want2.active && s.arabic?.fileName === want2.record.arabic?.fileName, { active: s.activeSlot, file: s.arabic?.fileName });
    });
  }

  const fontReads = (l) => l.filter((x) => x.kind === 'log.security' && FONT_READ_LOG.test(x.text));
  result.errors = tracked.map((t) => ({ where: t.where, errors: t.errs.list.filter((x) => !fontReads(t.errs.list).includes(x)), fontReadLogs: fontReads(t.errs.list).length }));
  const errCount = result.errors.reduce((n, e) => n + e.errors.length, 0);
  check('no-extension-errors', 'عام', errCount === 0, errCount ? result.errors.filter((e) => e.errors.length) : null);
  tracked.forEach((t) => t.errs.stop());
} catch (err) {
  check('run', 'تشغيل', false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
} finally {
  if (b) await b.close().catch(() => {});
  // جولة متعثرة قد تترك المتصفح يعمل بملف الاختبار؛ يُغلق فلا تتعطل الجولة التالية.
  if (pidsOf(profileDir).length) await quitProfile(profileDir);
}

const json = JSON.stringify(result, null, 2).split(DL).join('‹تنزيلات الاختبار›').split(PROFILE_ROOT).join('‹ملفات الاختبار›');
const leaks = findSecrets(json);
if (leaks.length || /https?:\/\//.test(json)) throw new Error(`تسرب في الأدلة: ${leaks.join(', ')}`);
const file = path.join(OUT, ONLY ? `journey-${[...ONLY].join('-')}.json` : 'journey.json');
await writeFile(file, `${json}\n`);
const failed = result.checks.filter((x) => !x.ok);
console.log(`${failed.length ? '✗' : '✓'} ${result.checks.length - failed.length}/${result.checks.length} — ${rel(file)}`);
process.exit(failed.length ? 1 : 0);
