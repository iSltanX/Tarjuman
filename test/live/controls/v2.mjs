#!/usr/bin/env node
// تاريخي: واجهة ما قبل جولة الصقل (زر «تنزيل ونسخ التعليمات» الموحّد، و«✓» في النص، وخانات 1 2 3 بفارغة معطّلة)، فيفشل على
// الشيفرة الحالية (تدقيق 5fedcb9، GM-019). البديل الحي: test/live/polish/run.mjs وtest/live/identity/run.mjs (وsurfaces.mjs مستبدَل، تدقيق 7a66f91).
// سيناريوهات P12 الحية على يوتيوب الحقيقي (بروتوكول «الاختبارات الحية»): بناء التطوير في ملف اختبار جديد خارج المستودع،
// بلا نافذة ومكتوم الصوت، وحساب غير مسجَّل، ومجلد تنزيلات داخل ملف الاختبار. كل فعل على الأدوات نقرة مستخدم حقيقية (Input)
// بإحداثيات الأزرار والبنود. تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُمرَّر جسم P1 الحقيقي الملتقط للفيديو نفسه
// إلى المستخرج عبر خطاف التطوير. الحافظة تُستبدل في العالمين (المشغّل ونافذة الأيقونة) فلا تُمسّ حافظة الجهاز.
//   npm run build:dev -- --out <مجلد خارج المستودع>
//   node test/live/controls/v2.mjs --browser brave|chrome --ext <مجلد> [--headed] [--out docs/evidence/P12] [--only upload-first,modes] [--narrow 480]
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, openTab } from '../harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport, instructions } from '../../../src/core/export/index.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { charsText } from '../../../src/player/controls/text.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(val('ext', 'dist'));
const VIDEO = 'iG9CE55wbtY';
const OTHER = 'Y9rkKtK1b44';
const FIXTURE = path.join(ROOT, 'test/fixtures/json3/manual-ted-iG9CE55wbtY.json');
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P12'), browser);
const ONLY = val('only') ? new Set(val('only').split(',')) : null;
const NARROW = Number(val('narrow', 560));
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const PROFILE = `${browser}-p12-${RUN}`;
const DL = path.join(PROFILE_ROOT, `downloads-${browser}-p12`, RUN);
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const result = { browser: null, at: new Date().toISOString(), headless: !argv.includes('--headed'), video: VIDEO, checks: [], notes: [], screenshots: [], measures: {}, errors: [] };
const check = (id, ac, ok, detail = null) => {
  result.checks.push({ id, ac, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} [${ac}] ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
};

// ---- المتوقع في Node من الجسم نفسه ----
const body = await readFile(FIXTURE, 'utf8');
const capture = (videoId, lang = 'en') => ({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId, lang, trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false });
const ex = createExtractor({ currentVideoId: () => VIDEO, durationMs: () => 1203421, isLive: () => false });
ex.handleMessage(capture(VIDEO));
const conv = ex.convert('en|manual', { mode: 'normal' });
const exportOf = (split = null) => buildExport({ videoId: VIDEO, title: null, track: { key: 'en|manual', lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: 'normal', split, now: Date.now() });
const EXP = exportOf();
const CUES = EXP.fingerprint.cues;
/** ملف عربي بالترقيم والتوقيت نفسيهما (محاكاة ناتج النموذج)، بنص ووسم وإزاحة اختيارية. */
const arabicSrt = (label, shiftMs = 0, edit = () => null) => writeSrt(CUES.map((c) => ({ n: c.n, startMs: c.startMs + shiftMs, endMs: c.endMs + shiftMs, text: edit(c) ?? `${label} — المقطع ${c.n}` })));
// مقطع ظاهر بعد الدقيقة الأولى، طوله 1.5 ث فأكثر.
const CUE = CUES.find((c) => c.startMs >= 60000 && c.endMs - c.startMs >= 1500);
const CUE_AT = (CUE.startMs + CUE.endMs) / 2000;

// ---- دوال في العالم المعزول للإضافة (بناء التطوير) ----
const I = {
  state: () => {
    const h = globalThis.__tarjuman;
    const s = h.controller.getState();
    return {
      videoId: s.videoId, title: s.title, loading: s.loading, captured: s.captured.map((t) => ({ key: t.key, ok: t.ok })), captureIssue: s.captureIssue?.code ?? null,
      arabic: s.arabic ? { n: s.arabic.cues.length, fileName: s.arabic.fileName, edited: s.arabic.edited } : null,
      activeSlot: s.activeSlot, slots: s.slots, view: s.view, marks: s.marks?.items.length ?? 0,
      mounted: { overlay: h.mounted.overlay.state, controls: h.mounted.controls.state },
    };
  },
  peek: () => globalThis.__tarjuman.mounted.controls.peek(),
  diag: () => globalThis.__tarjuman.mounted.controls.diagnostics(),
  ov: () => (globalThis.__tarjuman.mounted.overlay.peek(true)?.lines ?? []).map((l) => l.text),
  inject: (msg) => globalThis.__tarjuman.extractor.handleMessage(msg),
  bundle: async (id) => {
    const b = await globalThis.__tarjuman.store.getBundle(id);
    return b ? { active: b.active, slots: b.slots.map((x) => ({ n: x.n, file: x.track?.fileName ?? null, edited: !!x.track?.current, marks: x.marks.map((m) => ({ n: m.n, kind: m.kind })), offset: x.offsetMs, first: x.track ? (x.track.current ?? x.track.original)[0].text : null })), previous: b.previous ? { from: b.previous.from } : null } : null;
  },
  storagePrint: async () => {
    const all = await chrome.storage.local.get(null);
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(all)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  },
  setPrefs: async (patch) => {
    await globalThis.__tarjuman.store.setPrefs(patch);
    return true;
  },
  editActive: async (id, count) => {
    // تعديل يدوي كما يحفظه المحرّر (نسخة حالية فوق الأصل)، لمقاطع قليلة.
    await globalThis.__tarjuman.store.updateVideo(id, (rec) => {
      rec.arabic.current = rec.arabic.original.map((c, i) => (i < count ? { ...c, text: `${c.text} (عدّلته بيدي)` } : c));
      rec.arabic.editedAt = new Date().toISOString();
      return rec;
    });
    return true;
  },
  stub: () => {
    // حافظة بديلة في العالم المعزول وحده، وزمن أول رسالة حفظ إلى العامل: لإثبات أن النسخ يسبق الحفظ.
    globalThis.__tjCopies = [];
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (t) => {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
        globalThis.__tjCopies.push({ at: performance.now(), len: t.length, sha: [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16) });
      },
    });
    globalThis.__tjSaves = [];
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (msg, ...rest) => {
      if (msg?.type === 'tj:save-file') globalThis.__tjSaves.push({ at: performance.now(), name: msg.file.name });
      return send(msg, ...rest);
    };
    return true;
  },
  copies: () => globalThis.__tjCopies ?? [],
  saves: () => globalThis.__tjSaves ?? [],
};

const M = {
  main: () => {
    const p = document.querySelector('#movie_player');
    const v = p?.querySelector('video.html5-main-video');
    const r = (e) => {
      const b = e.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) };
    };
    const chrome = p?.querySelector('.ytp-chrome-bottom');
    return {
      theater: !!document.querySelector('ytd-watch-flexy')?.hasAttribute('theater'),
      fs: !!document.fullscreenElement,
      player: p ? r(p) : null, chrome: chrome ? r(chrome) : null,
      video: v ? { t: +v.currentTime.toFixed(3), paused: v.paused } : null,
      groupKids: document.querySelector('#tarjuman-controls') ? 5 : 0,
    };
  },
  pause: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.pause(); return v.paused; },
  // لا يُنتظر وعد play: قد لا يُحسم بلا نافذة (والمشغّل قد يعرض «Something went wrong» تحت الأتمتة).
  play: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.play().catch(() => {}); return true; },
  seek: (t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); v.currentTime = t; return true; },
  rectOf: (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; },
};

/** إعدادات التنزيل في ملف تعريف الاختبار وحده: مجلده داخل ملف الاختبار، وبلا «اسأل». */
async function setDownloadPrefs() {
  const file = path.join(PROFILE_ROOT, PROFILE, 'Default', 'Preferences');
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(DL, { recursive: true });
  await writeFile(file, JSON.stringify({ download: { default_directory: DL, prompt_for_download: false, directory_upgrade: true }, savefile: { default_directory: DL } }));
}
const listDl = async (sub = '') => {
  try {
    return (await readdir(path.join(DL, sub))).filter((n) => !n.endsWith('.crdownload')).sort();
  } catch {
    return [];
  }
};
const FILES = await mkdtemp(path.join(os.tmpdir(), 'tj-p12-files-'));
async function srtFile(name, text) {
  const f = path.join(FILES, name);
  await writeFile(f, text);
  return f;
}

await setDownloadPrefs();
const b = await launch({ browser, profile: PROFILE, headless: !argv.includes('--headed') });
result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
console.log(`المتصفح: ${result.browser}`);
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
  await sleep(400);
}
async function menu() {
  return (await iso(I.peek)).layer.menu;
}
async function clickItem(match) {
  const m = await menu();
  const it = m?.items.find((x) => (typeof match === 'string' ? x.fid === match || x.text === match : match(x)));
  if (!it) throw new Error(`لا بند: ${String(match)} — ${m?.items.map((x) => x.fid).join(',')}`);
  const c = center(it.box);
  await page.click(c.x, c.y);
  await sleep(400);
  return it;
}
async function openMenuOf(kind, label) {
  if ((await menu())?.label === label) return;
  await clickButton(kind);
}
async function closeMenus() {
  if (await menu()) {
    await page.key('Escape', 'Escape', 27);
    await sleep(300);
  }
}
/** زر «تراجع» في أحدث رسالة: يقع في طرف الرسالة الأيسر (RTL)، ولا زر إغلاق في رسائل النجاح. */
async function clickUndo() {
  const t = (await iso(I.peek)).layer.toasts.at(-1);
  if (!t) throw new Error('لا رسالة');
  await page.click(t.box.left + 30, Math.round(t.box.top + t.box.height / 2));
  await sleep(700);
}
/** ينتظر سطري النتيجة بعد «تنزيل ونسخ التعليمات» (الحفظ والنسخ) وخروج الزر من «جارٍ». */
const waitLine = (timeoutMs = 15000) => page.waitFor(() => {
  const m = globalThis.__tarjuman.mounted.controls.peek()?.layer.menu;
  const t = m?.text ?? '';
  const busy = m?.items.some((x) => x.fid === 'download' && x.text.includes('جارٍ'));
  return !busy && /✓ نُزّل|أُلغي الحفظ|تعذّر حفظ|اسم الملف أو نوعه/.test(t) && /✓ نُسخت التعليمات|تعذّر النسخ/.test(t) ? t : null;
}, { contextId: isoId, timeoutMs });

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
/** رفع ملف كما يفعل المستخدم: زر الرفع (أو بند الرفع في قائمة العرض) ثم المنتقي. */
async function upload(file) {
  nextUpload = [file];
  const s = await iso(I.state);
  if (s.arabic) {
    await openMenuOf('upload', 'الترجمة العربية');
    await clickItem('replace');
  } else {
    await clickButton('upload');
  }
  await sleep(1500);
}

async function settleAds() {
  const isAd = () => main(() => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); });
  if (!(await isAd())) return 'none';
  result.notes.push('إعلان حقيقي صودف على الصفحة؛ انتُظر انتهاؤه.');
  const ended = await page.waitFor(() => {
    const p = document.querySelector('#movie_player');
    const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
    if (skip && getComputedStyle(skip).display !== 'none') skip.click();
    return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
  }, { timeoutMs: 150000, intervalMs: 1000 });
  return ended ? 'ended' : 'stuck';
}
async function openVideo(id, { inject = 'en' } = {}) {
  await page.goto(`https://www.youtube.com/watch?v=${id}`);
  await dismissConsent(page).catch(() => false);
  await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
  let ready = await waitForPlayer(page, id, 20000);
  if (!ready) {
    await main(M.play);
    ready = await waitForPlayer(page, id, 25000);
  }
  if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  await sleep(1500);
  isoId = page.isolatedContextId(extId);
  if (!isoId) throw new Error('لا سياق معزول للإضافة');
  await settleAds();
  await main(M.pause);
  await page.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 10000 });
  await page.waitFor(() => !globalThis.__tarjuman.controller.getState().loading, { contextId: isoId, timeoutMs: 10000 });
  await iso(I.stub);
  if (inject) await iso(I.inject, capture(id, inject));
  await sleep(500);
}

/**
 * قفز ينتظر استقرار الزمن: تحت الأتمتة قد يعرض مشغّل يوتيوب «Something went wrong» فيعيد زمن الفيديو إلى 0 بعد القفز بلحظات
 * (لا علاقة لترجمان به: الإضافة لا تكتب الزمن أبدًا). يُعاد القفز حتى يثبت الزمن ثانيتين، أو يُسجَّل أنه لم يثبت.
 */
async function stableSeek(t) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await main(M.seek, t);
    let ok = true;
    for (let i = 0; i < 5; i++) {
      await sleep(400);
      if (Math.abs((await main(M.main)).video.t - t) > 0.05) {
        ok = false;
        break;
      }
    }
    if (ok) return attempt + 1;
  }
  result.notes.push(`زمن الفيديو لم يثبت بعد القفز إلى ${t} ث (مشغّل يوتيوب تحت الأتمتة).`);
  return 0;
}

async function step(name, fn) {
  if (ONLY && !ONLY.has(name)) return;
  try {
    await fn();
  } catch (err) {
    check(`${name}: اكتمل`, 'تشغيل', false, { error: err.message.slice(0, 300) });
    await closeMenus().catch(() => {});
  }
}

try {
  await mkdir(OUT, { recursive: true });
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', 'تحضير', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  extId = ext.id;
  page = await openTab(b.conn, 'about:blank');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  const errs = collectErrors(page, { extId, onlyExtension: true });
  await armChooser();
  await openVideo(VIDEO);
  const st0 = await iso(I.state);
  check('captured-and-mounted', 'تحضير', st0.captured.some((t) => t.ok) && st0.mounted.controls === 'mounted' && st0.mounted.overlay === 'mounted', st0);
  const expectedText = instructions({ videoId: VIDEO, title: st0.title });

  // ===== AC4/AC8: «تنزيل ونسخ التعليمات» بنتيجتين، والنسخ قبل الحفظ، ومكان الحفظ الافتراضي =====
  await step('download-copy', async () => {
    await openMenuOf('download', 'تحميل الترجمة');
    await shoot('ac4-download-menu');
    await clickItem('download');
    const text = await waitLine();
    const copies = await iso(I.copies);
    const saves = await iso(I.saves);
    check('two-separate-results', 'P12-AC4', text.includes(`✓ نُزّل ${VIDEO}.en.manual.normal.srt`) && text.includes('✓ نُسخت التعليمات'), { text: text.slice(0, 300) });
    check('instructions-copied-exactly', 'P12-AC4', copies.length === 1 && copies[0].sha === sha(expectedText), { copies, expected: sha(expectedText) });
    check('copy-before-save', 'P12-AC8', copies.length === 1 && saves.length === 1 && copies[0].at < saves[0].at, { copyAt: copies[0]?.at, saveAt: saves[0]?.at });
    await sleep(1500);
    const files = await listDl();
    const got = files.includes(`${VIDEO}.en.manual.normal.srt`) ? await readFile(path.join(DL, `${VIDEO}.en.manual.normal.srt`), 'utf8') : null;
    check('saved-to-downloads-default', 'P12-AC8', got === EXP.files[0].text, { files });
    await shoot('ac4-download-results');
    await closeMenus();
  });

  await step('save-location-subfolder', async () => {
    await iso(I.setPrefs, { saveLocation: { mode: 'subfolder', folder: 'Tarjuman' } });
    await openMenuOf('download', 'تحميل الترجمة');
    await clickItem('download');
    await waitLine();
    await sleep(1500);
    const sub = await listDl('Tarjuman');
    check('player-download-follows-subfolder', 'P12-AC8', sub.includes(`${VIDEO}.en.manual.normal.srt`), { sub });
    const p = await iso(I.peek);
    check('no-new-element-in-player', 'P12-AC8', Object.keys(p.buttons).length === 5 && !p.layer.menu.text.includes('Tarjuman') && !p.layer.menu.text.includes('مجلد'), { menu: p.layer.menu.text.slice(0, 200) });
    await closeMenus();
  });

  await step('save-location-ask', async () => {
    await iso(I.setPrefs, { saveLocation: { mode: 'ask', folder: 'Tarjuman' } });
    const before = (await iso(I.copies)).length;
    await openMenuOf('download', 'تحميل الترجمة');
    await clickItem('download');
    const text = await waitLine(40000);
    const copies = await iso(I.copies);
    const saves = await iso(I.saves);
    check('ask-mode: copy-before-dialog', 'P12-AC8', copies.length === before + 1 && copies.at(-1).at < saves.at(-1).at && (text ?? '').includes('✓ نُسخت التعليمات'), { line: (text ?? '').slice(0, 240) });
    result.notes.push(`وضع «اسأل» بلا نافذة: ${(text ?? '').includes('أُلغي الحفظ') ? 'أُلغي الحوار دون ظهوره (كما ثبت في P10)' : 'انتهى بغير الإلغاء'}؛ والنسخ تم قبله.`);
    await iso(I.setPrefs, { saveLocation: { mode: 'downloads', folder: 'Tarjuman' } });
    await closeMenus();
  });

  // ===== AC4: القاموس المرفق =====
  await step('glossary', async () => {
    const terms = [{ source: 'creativity', target: 'الإبداع', note: null }, { source: 'education', target: 'التعليم', note: 'المنظومة لا الدراسة' }];
    await iso(I.setPrefs, { glossary: { attach: true, terms } });
    await sleep(500);
    await openMenuOf('download', 'تحميل الترجمة');
    const m = await menu();
    check('glossary-tag', 'P12-AC4', m.text.includes('+ القاموس (2)'), { text: m.text.slice(0, 260) });
    const before = (await iso(I.copies)).length;
    await clickItem('copy');
    await sleep(600);
    const copies = await iso(I.copies);
    const expected = instructions({ videoId: VIDEO, title: st0.title, glossary: terms });
    check('glossary-instructions-same-text', 'P12-AC4', copies.length === before + 1 && copies.at(-1).sha === sha(expected), { got: copies.at(-1), expected: sha(expected) });
    await shoot('ac4-glossary-tag');
    await iso(I.setPrefs, { glossary: { attach: false, terms } });
    await closeMenus();
  });

  // ===== AC4/R60: أحجام الأجزاء والتقسيم عند الجمل أو الصمت =====
  await step('parts', async () => {
    await openMenuOf('download', 'تحميل الترجمة');
    await clickItem('fallback');
    await clickItem('split');
    await sleep(600);
    const m = await menu();
    const expected = exportOf({ size: 200, by: 'content' });
    const rows = expected.files.map((f) => `${f.part.index} · ${f.part.from}–${f.part.to} · ${charsText(f.text.length)}`);
    check('part-sizes-shown', 'P12-AC4', rows.every((r) => m.text.includes(r)), { rows, menu: m.text.slice(-300) });
    await shoot('ac4-parts');
    const before = new Set(await listDl());
    await clickItem('download');
    await waitLine();
    await sleep(2500);
    const fresh = (await listDl()).filter((n) => !before.has(n) && /part\d+of\d+/.test(n));
    const texts = await Promise.all(expected.files.map((f) => readFile(path.join(DL, f.name), 'utf8').catch(() => null)));
    check('parts-saved-and-join-to-full', 'P12-AC4', fresh.length === expected.files.length && texts.every((t, i) => t === expected.files[i].text) && texts.join('\n') === EXP.files[0].text, { fresh });
    await clickItem('split');
    await clickItem('fallback');
    await closeMenus();
  });

  // ===== AC2: الرفع إلى خانة، وقرينة الاسم، والإلغاء بلا أثر =====
  const first = await srtFile('ted.ar.srt', arabicSrt('الأولى'));
  await step('upload-first', async () => {
    await upload(first);
    const s = await iso(I.state);
    check('first-upload-direct-to-slot-1', 'P12-AC2', s.activeSlot === 1 && s.arabic?.fileName === 'ted.ar.srt' && (await menu())?.label === 'الترجمة العربية', { active: s.activeSlot, arabic: s.arabic });
    await shoot('ac1-display-one');
  });

  await step('upload-cancel-name-hint', async () => {
    const other = await srtFile(`${OTHER}.en.manual.normal.ar.srt`, arabicSrt('ملف فيديو آخر'));
    const print0 = await iso(I.storagePrint);
    await upload(other);
    let m = await menu();
    check('compact-confirm', 'P12-AC2', m?.label === 'رفع ترجمة' && m.text.includes('حفظ في') && m.text.includes('الاسم يشير إلى فيديو آخر') && m.items.some((x) => x.fid === 'target:2' && x.text === '2'), { label: m?.label, text: m?.text.slice(0, 300) });
    await shoot('ac2-confirm-name-hint');
    await clickItem('cancel');
    check('cancel-keeps-storage', 'P12-AC2', (await iso(I.storagePrint)) === print0, null);
    await upload(other);
    await page.key('Escape', 'Escape', 27);
    await sleep(400);
    check('escape-keeps-storage', 'P12-AC2', (await iso(I.storagePrint)) === print0, null);
    nextUpload = [];
    await openMenuOf('upload', 'الترجمة العربية');
    await clickItem('replace');
    await sleep(800);
    m = await menu();
    check('picker-cancel-keeps-storage', 'P12-AC2', (await iso(I.storagePrint)) === print0, { label: m?.label });
    await closeMenus();
  });

  const second = await srtFile('ted-v2.ar.srt', arabicSrt('الثانية'));
  await step('upload-second-slot', async () => {
    await upload(second);
    const m = await menu();
    check('default-first-empty-slot', 'P12-AC2', m?.items.find((x) => x.fid === 'target:2') && m.text.includes('ted-v2.ar.srt'), { text: m?.text.slice(0, 200) });
    await clickItem('confirm');
    await sleep(1200);
    const s = await iso(I.state);
    check('added-becomes-active', 'P12-AC2', s.activeSlot === 2 && s.arabic.fileName === 'ted-v2.ar.srt', { active: s.activeSlot });
  });

  // ===== AC1: التبديل من 1 2 3 ينعكس على الطبقة بلا إعادة تحميل =====
  await step('switch-slots', async () => {
    await stableSeek(CUE_AT);
    await sleep(800);
    const lines2 = await iso(I.ov);
    await openMenuOf('upload', 'الترجمة العربية');
    await shoot('ac1-display-two-slots');
    const nav0 = await main(() => performance.getEntriesByType('navigation').length + ':' + document.querySelectorAll('#tarjuman-controls').length);
    await clickItem('slot:1');
    await sleep(1200);
    const lines1 = await iso(I.ov);
    const s = await iso(I.state);
    const p = await iso(I.peek);
    check('switch-reflects-on-overlay', 'P12-AC1', lines2.some((l) => l.startsWith('الثانية')) && lines1.some((l) => l.startsWith('الأولى')) && s.activeSlot === 1, { lines2, lines1 });
    check('switch-no-reload', 'P12-AC1', nav0 === (await main(() => performance.getEntriesByType('navigation').length + ':' + document.querySelectorAll('#tarjuman-controls').length)), { nav0 });
    check('slot-toast-with-undo', 'P12-AC1', p.layer.toasts.some((t) => t.text.includes('الترجمة 1') && t.text.includes('تراجع')), { toasts: p.layer.toasts.map((t) => t.text) });
    const slotItems = p.layer.menu.items.filter((x) => /^slot:/.test(x.fid));
    check('picker-no-labels-empty-disabled', 'P12-AC1', slotItems.map((x) => x.text).join('') === '123' && slotItems[2].disabled, { slotItems: slotItems.map((x) => [x.text, x.disabled]) });
    await shoot('ac1-switched');
    await clickUndo();
    check('undo-switch', 'P12-AC1', (await iso(I.state)).activeSlot === 2, null);
    await closeMenus();
  });

  // ===== AC2: استبدال خانة معدّلة و«إبقاء تعديلاتي» =====
  await step('replace-edited-keep', async () => {
    await iso(I.editActive, VIDEO, 3);
    await sleep(800);
    const fixed = await srtFile('ted-v2-fixed.ar.srt', arabicSrt('الثانية', 0, (c) => (c.n === 10 ? 'الثانية — صُحّح المقطع العاشر' : null)));
    await upload(fixed);
    await clickItem('target:2');
    let m = await menu();
    check('replace-shows-edits-lost', 'P12-AC2', m.label === 'استبدال الترجمة؟' && m.text.includes('سيُستبدل 3 تعديلات يدوية'), { text: m.text.slice(0, 300) });
    const keep = m.items.find((x) => x.fid === 'keep');
    check('keep-available-when-aligned', 'P12-AC2', keep && !keep.disabled, { keep });
    await clickItem('keep');
    m = await menu();
    await shoot('ac2-replace-keep');
    await clickItem('confirm');
    await sleep(1500);
    const bd = await iso(I.bundle, VIDEO);
    const s2 = bd.slots[1];
    check('kept-edits-over-new-file', 'P12-AC2', s2.file === 'ted-v2-fixed.ar.srt' && s2.edited && s2.first.includes('عدّلته بيدي') && bd.previous?.from === 2, { s2, previous: bd.previous, line: m.text.includes('تُبقى تعديلاتك') });
    await closeMenus();
  });

  // ===== AC5: «علّم للمراجعة» =====
  await step('mark', async () => {
    const stable = await stableSeek(CUE_AT);
    await openMenuOf('upload', 'الترجمة العربية');
    const tBefore = (await main(M.main)).video.t;
    result.measures.markSeek = { stable, tBefore, ytError: await main(() => !!document.querySelector('#movie_player .ytp-error')) };
    await clickItem('mark');
    const tAfter = (await main(M.main)).video.t;
    await sleep(800);
    let bd = await iso(I.bundle, VIDEO);
    const p = await iso(I.peek);
    check('mark-visible-cue', 'P12-AC5', bd.slots[1].marks.some((x) => x.n === CUE.n && x.kind === 'todo'), { marks: bd.slots[1].marks, cue: CUE.n });
    check('mark-toast-undo', 'P12-AC5', p.layer.toasts.some((t) => t.text.includes(`عُلِّم المقطع ${CUE.n} للمراجعة`) && t.text.includes('تراجع')), { toasts: p.layer.toasts.map((t) => t.text) });
    const tLater = (await main(M.main)).video.t;
    check('mark-no-seek', 'P12-AC5', Math.abs(tAfter - tBefore) < 0.05, { seekTo: CUE_AT, tBefore, tAfter, tLater });
    await clickUndo();
    bd = await iso(I.bundle, VIDEO);
    check('mark-undo', 'P12-AC5', bd.slots[1].marks.length === 0, { marks: bd.slots[1].marks });
    await closeMenus();
  });

  // ===== AC3: «مزامنة بجملة» لملف مؤخَّر 3 ثوانٍ =====
  await step('sync', async () => {
    const late = await srtFile('ted-late.ar.srt', arabicSrt('مؤخّرة', 3000));
    await upload(late);
    await clickItem('target:3');
    await clickItem('confirm');
    await sleep(1200);
    const s = await iso(I.state);
    check('late-file-in-slot-3', 'P12-AC3', s.activeSlot === 3 && s.view.displayOffsetMs === 0, { active: s.activeSlot });
    // الجملة تُسمع عند بدايتها الحقيقية؛ والفيديو موقوف للقياس الدقيق (والتشغيل في الفحص التالي).
    await stableSeek(CUE.startMs / 1000);
    await sleep(800);
    await closeMenus();
    await openMenuOf('badge', 'توقيت الترجمة');
    const before = await main(M.main);
    await clickItem('sync');
    const m = await menu();
    check('sync-view', 'P12-AC3', /^عند \d+:\d\d/.test(m.text) && m.items.filter((x) => /^sentence:/.test(x.fid)).length === 7, { head: m.text.slice(0, 40) });
    await shoot('ac3-sync-view');
    const target = m.items.find((x) => x.fid === `sentence:${CUE.n - 1}`);
    if (!target) throw new Error(`الجملة ${CUE.n} ليست في النافذة`);
    const at = before.video.t;
    await clickItem(`sentence:${CUE.n - 1}`);
    const after = await iso(I.state);
    const want = Math.round((at * 1000 - (CUE.startMs + 3000)) / 100) * 100;
    check('one-sentence-fixes-3s-delay', 'P12-AC3', Math.abs(after.view.displayOffsetMs - want) <= 100 && after.view.displayOffsetMs <= -2500 && after.view.displayOffsetMs >= -3500, { offset: after.view.displayOffsetMs, want, openedAt: at });
    const p = await iso(I.peek);
    check('sync-toast-undo', 'P12-AC3', p.layer.toasts.some((t) => t.text.includes('الإزاحة −') && t.text.includes('تراجع')), { toasts: p.layer.toasts.map((t) => t.text) });
    const v = (await main(M.main)).video;
    check('sync-no-seek-no-file-change', 'P12-AC3', Math.abs(v.t - at) < 0.05 && (await iso(I.bundle, VIDEO)).slots[2].first === 'مؤخّرة — المقطع 1', { at, now: v.t });
    await shoot('ac3-synced');
    await clickUndo();
    check('sync-undo', 'P12-AC3', (await iso(I.state)).view.displayOffsetMs === 0, null);
    // أثناء التشغيل: الاختيار لا يوقف الفيديو.
    await main(M.play);
    await sleep(400);
    await clickItem('sync');
    const playing = await menu();
    const any = playing.items.find((x) => /^sentence:/.test(x.fid));
    await clickItem(any.fid);
    const pv = (await main(M.main)).video;
    check('sync-does-not-pause', 'P12-AC3', pv.paused === false, { video: pv });
    await main(M.pause);
    await clickUndo();
    await closeMenus();
  });

  // ===== AC7: الأوضاع الأربعة بقائمة العرض مفتوحة =====
  await step('modes', async () => {
    await main(M.seek, CUE_AT);
    const modeShot = async (name) => {
      await revealControls(page);
      await openMenuOf('upload', 'الترجمة العربية');
      await sleep(500);
      const m = await menu();
      const pk = await iso(I.peek);
      const mm = await main(M.main);
      const inBar = Object.values(pk.buttons).every((x) => x.box.top >= mm.chrome.top - 1 && x.box.bottom <= mm.chrome.bottom + 1 && x.box.width > 0);
      const inMode = { normal: !mm.theater && !mm.fs, theater: mm.theater && !mm.fs, fullscreen: mm.fs, narrow: !mm.fs && mm.player.width < 600 }[name];
      check(`${name}: five-in-bar-menu-no-paragraphs`, 'P12-AC7', inMode && Object.keys(pk.buttons).length === 5 && inBar && m && !/التفاصيل|اضغط|يمكنك/.test(m.text), { size: pk.size, theater: mm.theater, fs: mm.fs, player: mm.player.width, menuH: m?.box.height });
      result.measures[name] = { player: mm.player, menu: m?.box, size: pk.size };
      await shoot(`ac7-${name}`);
      await closeMenus();
    };
    await modeShot('normal');
    const size = await main(M.rectOf, '#movie_player .ytp-size-button');
    if (size) await page.click(size.x, size.y);
    await sleep(1500);
    await modeShot('theater');
    const fs = await main(M.rectOf, '#movie_player .ytp-fullscreen-button');
    await revealControls(page);
    if (fs) await page.click(fs.x, fs.y);
    await sleep(1800);
    await modeShot('fullscreen');
    // الخروج كما يفعل المستخدم: زر ملء الشاشة نفسه (Esc عبر CDP لا يصل إلى واجهة المتصفح).
    await revealControls(page);
    const fsOut = await main(M.rectOf, '#movie_player .ytp-fullscreen-button');
    if (fsOut) await page.click(fsOut.x, fsOut.y);
    await sleep(1500);
    if ((await main(M.main)).fs) await main(() => document.exitFullscreen().then(() => true, () => false));
    await sleep(800);
    if ((await main(M.main)).theater) {
      const back = await main(M.rectOf, '#movie_player .ytp-size-button');
      if (back) await page.click(back.x, back.y);
      await sleep(1200);
    }
    await page.send('Emulation.setDeviceMetricsOverride', { width: NARROW, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(1500);
    await modeShot('narrow');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
    await sleep(1000);
  });

  // ===== AC6: نافذة الأيقونة ونسخ تشخيص الصفحة =====
  const popupInfo = async () => {
    await b.conn.send('Target.activateTarget', { targetId: page.targetId });
    const p = await openTab(b.conn, `chrome-extension://${extId}/pages/popup/index.html`, { background: true });
    await p.waitFor(() => !!document.querySelector('#app[data-ready]'), { timeoutMs: 8000 });
    await p.eval(() => {
      globalThis.__copied = null;
      Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { globalThis.__copied = t; } });
      return true;
    });
    return p;
  };
  await step('popup', async () => {
    const p = await popupInfo();
    const info = await p.eval(() => ({ tools: document.querySelector('.tj-popup__tools')?.textContent.trim(), diag: !!document.querySelector('[data-action="diagnostics"]'), capture: document.querySelector('.tj-popup__capture')?.textContent ?? null }));
    check('popup-tools-line', 'P12-AC6', info.tools === 'أدوات المشغّل تعمل' && info.diag, info);
    const c = await p.centerOf('[data-action="diagnostics"]');
    await p.click(c.x, c.y);
    const copied = await p.waitFor(() => globalThis.__copied, { timeoutMs: 6000 });
    const line = await p.eval(() => document.querySelector('.tj-popup__diag-result')?.textContent ?? null);
    let parsed = null;
    try {
      parsed = JSON.parse(copied);
    } catch {
      parsed = null;
    }
    const leaks = ['iG9CE55wbtY', st0.title ?? '§', 'ted.ar.srt', 'youtube.com', 'الأولى —'].filter((x) => (copied ?? '').includes(x));
    check('page-diagnostics-sanitized', 'P12-AC6', !!parsed && !!parsed.sections?.page?.mounted?.controls && !!parsed.sections?.page?.mounted?.overlay && leaks.length === 0 && line === '✓ نُسخ التشخيص', { leaks, line, keys: parsed ? Object.keys(parsed.sections.page) : null });
    await writeFile(path.join(OUT, 'page-diagnostics.json'), copied ?? '');
    await p.send('Emulation.setDeviceMetricsOverride', { width: 340, height: 520, deviceScaleFactor: 1, mobile: false });
    const sh = path.join(OUT, 'ac6-popup.png');
    await p.screenshot(sh);
    result.screenshots.push(path.relative(ROOT, sh));
    await p.close();
  });

  // ===== AC4/AC6: مسار عربي ملتقط — خطوات اختيار English، وسطر الرفض في النافذة =====
  await step('arabic-track-guide', async () => {
    await openVideo(OTHER, { inject: 'ar' });
    const s = await iso(I.state);
    await openMenuOf('download', 'تحميل الترجمة');
    const m = await menu();
    const brave = m.text.includes('Brave قد يختار العربية أولًا؛ اختر English مرة');
    check('english-steps-line', 'P12-AC4', s.captureIssue === 'EX_NOT_ENGLISH' && m.text.includes('CC ← ⚙ ← الترجمة ← English'), { issue: s.captureIssue, text: m.text.slice(0, 260) });
    check('brave-note-only-in-brave', 'P12-AC4', browser === 'brave' ? brave : !brave, { brave });
    await shoot('ac4-english-guide');
    await closeMenus();
    const p = await popupInfo();
    const cap = await p.eval(() => document.querySelector('.tj-popup__capture')?.textContent ?? null);
    check('popup-capture-rejected-line', 'P12-AC6', cap === 'المسار الملتقط ليس إنجليزيًا. اختر English من قائمة الترجمة.', { cap });
    await p.close();
  });

  // سجل أمان معروف لقراءة ملفات الخطوط المعلنة (بياناتها لا رابطها؛ ثبت في P6) لا يُعدّ خطأً.
  const FONT_READ_LOG = /^Unsafe attempt to load URL chrome-extension:\/\/[^/]+\/ui\/fonts\/subtitle\/[a-z0-9-]+-(?:400|700)\.woff2 /;
  result.errors = errs.list.filter((x) => !(x.kind === 'log.security' && FONT_READ_LOG.test(x.text)));
  check('no-extension-errors', 'عام', result.errors.length === 0, { errors: result.errors });
} catch (err) {
  check('run', 'تشغيل', false, { error: err.message });
} finally {
  result.diag = page && isoId ? await iso(I.diag).catch(() => null) : null;
  await writeFile(path.join(OUT, 'live.json'), `${JSON.stringify(result, null, 2)}\n`).catch(() => {});
  await b.close();
  const failed = result.checks.filter((c) => !c.ok);
  console.log(`\nالنتيجة: ${result.checks.length - failed.length}/${result.checks.length}`);
  process.exitCode = failed.length ? 1 : 0;
}
