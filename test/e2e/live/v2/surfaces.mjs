#!/usr/bin/env node
// مستبدَل (تدقيق 7a66f91، U67، قرار سلطان Q34 أ): محدِّداته على واجهة ما قبل إعادة تصميم الهوية بعد tj-v2، فيسقط 25/36 فحوصًا
// (docs/evidence/T3/README.md)، و.lib-copy__button و«الخانة 1 في الصف» غائبان من src. لا يُشغَّل دليلًا ولا في الصيانة. البديل الحي:
// test/live/identity/run.mjs (الأسطح بعد إعادة التصميم، Brave وChrome) وtest/live/stores/t3.mjs (الدورة كلها في المتصفحات الأربعة).
// اختبار دائم (P15): دخان بوابة W7 منقولًا كما هو من docs/evidence/W7/wave-smoke.mjs، بتغيير المسارات والمخرجات وحدها،
// ويعمل في Brave وChrome.
// دخان بوابة W7 (سكربت المنسّق): الأسطح الثلاثة معًا على رأس التكامل، بنقرات وكتابة حقيقية عبر CDP كما في سكربتات المراحل
// (test/live/controls/v2.mjs لـP12، وtest/live/pages/p13.mjs لـP13، وtest/live/editor/v2.mjs لـP14):
//   الإعدادات (P13): القاموس ومكان الحفظ «مجلد فرعي» ← المشغّل (P12): «تنزيل الملف» و«نسخ التعليمات» ثم رفع الترجمة 1 ← المحفوظات (P13):
//   رفع إلى خانة فارغة ← التفعيل بالاتجاهين خلال ثانية ← المحرّر (P14): تعديل الخانة 1 ← استبدال الخانة المعدّلة من المشغّل ومن
//   المحفوظات بالأعداد نفسها مع «إبقاء تعديلاتي» ← علامة من المشغّل في المحرّر وفي فرز المحفوظات ← المزامنة بالجملة ← المحرّر
//   على خانة غير نشطة (بحث واستبدال ودمج وشطر) لا يغيّر المعروض ← القفز إلى التبويب ← دورة استكمال قصيرة تظهر في المشغّل ←
//   التصدير والنسخة الاحتياطية في المجلد الفرعي، والنسخ بالقاموس بنص واحد ← النسخة تُستعاد في ملف تعريف جديد بافتراض التخطي.
// بناء تطوير لرأس التكامل في ملفي تعريف جديدين خارج المستودع، بلا نافذة ومكتوم الصوت، وحساب يوتيوب غير مسجَّل، ومجلد تنزيلات
// داخل ملف الاختبار. تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُمرَّر جسم P1 الحقيقي الملتقط للفيديو نفسه إلى المستخرج.
//   command node test/e2e/live/v2/surfaces.mjs [--browser brave|chrome] [--headed] [--out docs/evidence/P15/<browser>]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, human, launch, loadExtension, sleep } from '../../../live/harness/browser.mjs';
import { FONT_READ_LOG, attach, collectErrors, openTab } from '../../../live/harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../../../live/harness/youtube.mjs';
import { alignCues, diffTranslations } from '../../../../src/core/align/index.js';
import { compare } from '../../../../src/core/compare/index.js';
import { findSecrets } from '../../../../src/core/diagnostics/sanitize.js';
import { createExtractor } from '../../../../src/extract/index.js';
import { buildExport, instructions } from '../../../../src/core/export/index.js';
import { parseSrtLenient } from '../../../../src/core/srt/lenient.js';
import { formatSrtTime } from '../../../../src/core/srt/time.js';
import { writeSrt } from '../../../../src/core/srt/writer.js';
import { diffCountLines } from '../../../../src/pages/library/model.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const HEADLESS = !argv.includes('--headed');
const OUT = path.resolve(ROOT, val('out', `docs/evidence/P15/${browser}`));
const VIDEO = 'iG9CE55wbtY';
const FIXTURE = path.join(ROOT, 'test/fixtures/json3/manual-ted-iG9CE55wbtY.json');
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 'p15-work', 'surfaces', `${browser}-${RUN}`);
const EXT = path.join(WORK, 'ext');
const FILES = path.join(WORK, 'files');
const DL = path.join(WORK, 'downloads');
const PROFILE_A = `${browser}-w7-wave-${RUN}`;
const PROFILE_B = `${browser}-w7-restore-${RUN}`;
const SUB = 'Tarjuman';
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const ISOLATES = new RegExp(`[${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}]`, 'g');
const clean = (s) => String(s ?? '').replace(ISOLATES, '').replace(/\s+/g, ' ').trim();

const result = { browser: null, at: new Date().toISOString(), headless: HEADLESS, video: VIDEO, head: null, extension: null, checks: [], measures: {}, notes: [], screenshots: [], errors: {} };
const check = (id, test, ok, detail = null) => {
  result.checks.push({ id, test, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} [${test}] ${id}${detail !== null ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
};
const rel = (f) => path.relative(ROOT, f);

function appVersion(bin) {
  try {
    const plist = path.join(bin.slice(0, bin.indexOf('.app/') + 4), 'Contents/Info.plist');
    return String(execFileSync('/usr/bin/defaults', ['read', plist, 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}

// ---- المتوقع في Node من جسم P1 نفسه: التصدير، والبصمة، والملفات العربية (محاكاة ناتج النموذج) ----
const body = await readFile(FIXTURE, 'utf8');
const capture = { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VIDEO, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false };
const ex = createExtractor({ currentVideoId: () => VIDEO, durationMs: () => 1203421, isLive: () => false });
ex.handleMessage(capture);
const conv = ex.convert('en|manual', { mode: 'normal' });
const EXP = buildExport({ videoId: VIDEO, title: null, track: { key: 'en|manual', lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: 'normal', now: Date.now() });
const CUES = EXP.fingerprint.cues;
const arabic = (label, { shiftMs = 0, drop = [], edit = () => null } = {}) => CUES.filter((c) => !drop.includes(c.n))
  .map((c) => ({ n: c.n, startMs: c.startMs + shiftMs, endMs: c.endMs + shiftMs, text: edit(c) ?? `${label} — المقطع ${c.n}` }));
const MISSING = [20, 21, 22];
const A = arabic('أ');
const B = arabic('ب', { drop: MISSING });
const C = arabic('ج', { shiftMs: 3000 });
const A2 = arabic('أ', { edit: (c) => (c.n >= 50 && c.n <= 54 ? `أ — صُحّح المقطع ${c.n}` : null) });
const A3 = arabic('أ', { edit: (c) => (c.n >= 50 && c.n <= 54 ? `أ — صُحّح المقطع ${c.n}` : c.n >= 100 && c.n <= 102 ? `أ — نقّح المقطع ${c.n}` : null) });
const EDITED = ' — عدّلته في المحرّر';
// مقطع ظاهر بعد الدقيقة الأولى، طوله 1.5 ث فأكثر (كما في P12).
const CUE = CUES.find((c) => c.startMs >= 60000 && c.endMs - c.startMs >= 1500);
const CUE_AT = (CUE.startMs + CUE.endMs) / 2000;
const GLOSSARY = [{ source: 'creativity', target: 'الإبداع', note: null }, { source: 'education', target: 'التعليم', note: null }];
// chrome.storage يعيد مفاتيح الكائنات مرتبة أبجديًا، فالمقارنة بالحقول لا بالنص الحرفي.
const sameTerms = (terms) => Array.isArray(terms) && terms.length === GLOSSARY.length
  && terms.every((t, i) => t.source === GLOSSARY[i].source && t.target === GLOSSARY[i].target && (t.note ?? null) === GLOSSARY[i].note);

// ---- دوال في العالم المعزول للإضافة على صفحة الفيديو (بناء التطوير) ----
const I = {
  state: () => {
    const h = globalThis.__tarjuman;
    const s = h.controller.getState();
    return {
      title: s.title, loading: s.loading, captured: s.captured.map((t) => ({ key: t.key, ok: t.ok })), activeSlot: s.activeSlot, view: s.view,
      arabic: s.arabic ? { count: s.arabic.cues.length, fileName: s.arabic.fileName, edited: s.arabic.edited, first: s.arabic.cues[0]?.text ?? null } : null,
      mounted: { overlay: h.mounted.overlay.state, controls: h.mounted.controls.state },
    };
  },
  cueText: (n) => globalThis.__tarjuman.controller.getState().arabic?.cues.find((c) => c.n === n)?.text ?? null,
  /** الحزمة بواجهة التخزين (getBundle): الخانات الثلاث بترجماتها وإزاحاتها وعلاماتها، والسابقة. */
  bundle: async (id) => {
    const b = await globalThis.__tarjuman.store.getBundle(id);
    if (!b) return null;
    return {
      active: b.active,
      slots: b.slots.map((x) => (x.track ? {
        file: x.track.fileName, count: (x.track.current ?? x.track.original).length, edited: !!x.track.current, fp: x.track.fingerprintId,
        cues: (x.track.current ?? x.track.original).map((c) => [c.n, c.startMs, c.endMs, c.text]), original: x.track.original.map((c) => c.text),
        offset: x.offsetMs, marks: x.marks.map((m) => ({ n: m.n, kind: m.kind })),
      } : null)),
      previous: b.previous ? { from: b.previous.from, file: b.previous.track.fileName } : null,
    };
  },
  peek: () => globalThis.__tarjuman.mounted.controls.peek(),
  ov: () => (globalThis.__tarjuman.mounted.overlay.peek(true)?.lines ?? []).map((l) => l.text),
  inject: (msg) => globalThis.__tarjuman.extractor.handleMessage(msg),
  /** بصمة كل مفتاح في التخزين: الإلغاء بلا أثر يعني بصمات متطابقة، وإلا تُسمّى المفاتيح المتغيرة. */
  storagePrint: async () => {
    const all = await chrome.storage.local.get(null);
    const out = {};
    for (const k of Object.keys(all).sort()) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(all[k])));
      out[k] = [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }
    return out;
  },
  stub: () => {
    // حافظة بديلة في العالم المعزول وحده (لا تُمسّ حافظة الجهاز)، تحفظ بصمة النص المنسوخ.
    globalThis.__tjCopies = [];
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (t) => {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
        globalThis.__tjCopies.push({ len: t.length, sha: [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16) });
      },
    });
    return true;
  },
  copies: () => globalThis.__tjCopies ?? [],
};
// في صفحة الفيديو (العالم الرئيسي).
const M = {
  pause: () => { const v = document.querySelector('#movie_player video.html5-main-video'); if (!v) return false; v.muted = true; v.pause(); return v.paused; },
  play: () => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.play().catch(() => {}); return true; },
  seek: (t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); v.currentTime = t; return true; },
  time: () => document.querySelector('#movie_player video.html5-main-video')?.currentTime ?? -1,
  isAd: () => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); },
};
// في صفحات الإضافة: المفاتيح الخام.
const S = {
  active: async (id) => (await chrome.storage.local.get(`bundle:${id}`))[`bundle:${id}`]?.active ?? null,
  /** مدخل الفيديو بصيغة النسخة الاحتياطية (عقد backup §٣) من التخزين الحي، كما يقارنه P13. */
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
  stubClipboard: () => { window.__copied = []; navigator.clipboard.writeText = async (t) => { window.__copied.push(t); }; return true; },
  copied: () => window.__copied ?? [],
};
// في المحرّر.
const E = {
  ready: () => Boolean(globalThis.__tarjumanEditor && document.querySelector('.ed-row[data-index]')),
  info: () => {
    const q = (s) => document.querySelector(s);
    const t = (s) => q(s)?.textContent.trim() ?? null;
    const s = globalThis.__tarjumanEditor.state;
    const dlg = q('dialog[open]');
    return {
      slot: s.slot, active: s.opened.active, count: s.session.count, dirty: s.session.dirty, changed: s.session.changedCount, history: s.session.historySize,
      note: t('.ed-slot-note'), result: q('.ed-result') && !q('.ed-result').hidden ? t('.ed-result') : null, toast: q('.ed-toast.is-shown') ? t('.ed-toast') : null,
      banner: q('.ed-banner') && !q('.ed-banner').hidden ? t('.ed-banner') : null,
      search: { count: t('.ed-search__count'), focus: document.activeElement?.classList.contains('ed-search__input') ?? false },
      tabs: [...document.querySelectorAll('.ed-tab')].map((b) => `${b.textContent}:${b.getAttribute('aria-selected')}`),
      marks: [...document.querySelectorAll('.ed-markgroup h3')].map((h) => h.textContent),
      complete: t('[aria-label="الاستكمال"]'),
      comparison: s.comparison ? { missing: s.comparison.missing.length, fp: s.comparison.fingerprintId } : null,
      lastSeek: s.lastSeek,
      dialog: dlg ? {
        title: dlg.querySelector('.tj-dialog__title')?.textContent ?? null, text: dlg.textContent.slice(0, 400),
        checks: dlg.querySelectorAll('input[type=checkbox]').length, checked: dlg.querySelectorAll('input[type=checkbox]:checked').length,
      } : null,
    };
  },
  cue: (i) => {
    const c = globalThis.__tarjumanEditor.state.session.cueAt(i);
    return { n: c.n, startMs: c.startMs, endMs: c.endMs, text: c.text };
  },
  texts: () => {
    const s = globalThis.__tarjumanEditor.state.session;
    return Array.from({ length: s.count }, (_, i) => s.cueAt(i).text);
  },
  probe: (sel, label) => {
    document.querySelectorAll('[data-probe]').forEach((x) => x.removeAttribute('data-probe'));
    const list = [...document.querySelectorAll(sel)];
    const hit = label === null ? list[0] : list.find((x) => (x.textContent.trim() || x.getAttribute('aria-label') || '').startsWith(label) || (x.getAttribute('aria-label') ?? '').startsWith(label));
    if (!hit) return false;
    hit.setAttribute('data-probe', '1');
    return true;
  },
  reveal: (i) => { globalThis.__tarjumanEditor.jumpTo(i, 'text'); return true; },
  // النص الإنجليزي الحقيقي (TED) لا يدخل اللقطات، كما في P14.
  hideEnglish: () => { document.querySelectorAll('.ed-row__en').forEach((x) => { if (x.dir === 'ltr') x.textContent = '…'; }); return true; },
  caretEnd: (i) => { const ta = document.querySelector(`.ed-row[data-index="${i}"] [data-field="text"]`); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return ta.value.length; },
  caret: (i, at) => {
    const ta = document.querySelector(`.ed-row[data-index="${i}"] [data-field="text"]`);
    ta.focus();
    ta.setSelectionRange(at, at);
    ta.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    return ta.value.length;
  },
};

// ---- الملفات والتنزيلات ----
async function setDownloadPrefs(profile) {
  const file = path.join(PROFILE_ROOT, profile, 'Default', 'Preferences');
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
const waitFile = async (sub, match, { timeoutMs = 20000, except = new Set() } = {}) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const f = (await listDl(sub)).find((n) => match(n) && !except.has(n));
    if (f) return { name: f, path: path.join(DL, sub, f) };
    await sleep(300);
  }
  return null;
};
async function srtFile(name, cues) {
  const f = path.join(FILES, name);
  await writeFile(f, writeSrt(cues));
  return f;
}
/**
 * ملف ناقص بأرقامه الأصلية (ما تطلبه التعليمات من النموذج: «ولا تُعِد الترقيم متتاليًا»). writeSrt يرقّم تسلسليًا، فيُكتب
 * الرقم هنا من المقطع نفسه. وملف ناقص أُعيد ترقيمه يحكم عليه compare (P4، مجمّد منذ W3) بالرقم، فيُسجَّل في الأدلة ولا يُختبر هنا.
 */
async function srtFileKeepNumbers(name, cues) {
  const f = path.join(FILES, name);
  await writeFile(f, cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n'));
  return f;
}

// ---- المتصفح والصفحات ----
let b = null;
let extId = null;
let yt = null;
let isoId = null;
const tracked = [];
const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
const main = (fn, ...args) => yt.eval(fn, { args });
const front = (page) => b.conn.send('Target.activateTarget', { targetId: page.targetId });

async function start(profile) {
  await setDownloadPrefs(profile);
  b = await launch({ browser, profile, headless: HEADLESS });
  result.browser ??= `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].bin) ?? '?'} (${b.version.product})`;
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  extId = ext.id;
  return ext;
}
async function stop(label) {
  const fontReads = (l) => l.filter((x) => x.kind === 'log.security' && FONT_READ_LOG.test(x.text));
  result.errors[label] = tracked.map((t) => ({ where: t.where, errors: t.errs.list.filter((x) => !fontReads(t.errs.list).includes(x)), fontReadLogs: fontReads(t.errs.list).length }));
  tracked.forEach((t) => t.errs.stop());
  tracked.length = 0;
  const exited = new Promise((r) => (b.child.exitCode !== null ? r() : b.child.once('exit', r)));
  await b.close();
  await Promise.race([exited, sleep(15000)]);
  await sleep(500);
}
/** صفحة إضافة في تبويب، أو في نافذة خاصة (newWindow) فتبقى مرئية بجانب المشغّل كما يعمل مستخدم بنافذتين. */
async function extPage(rest, { newWindow = false } = {}) {
  const page = newWindow
    ? await attach(b.conn, (await b.conn.send('Target.createTarget', { url: 'about:blank', newWindow: true })).targetId)
    : await openTab(b.conn, 'about:blank');
  tracked.push({ where: rest.split(/[?#]/)[0], errs: collectErrors(page, { extId }) });
  await page.send('DOM.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.goto(`chrome-extension://${extId}/${rest}`);
  return page;
}
async function shot(page, name) {
  const f = path.join(OUT, `surfaces-${name}.png`);
  await page.screenshot(f);
  result.screenshots.push(rel(f));
}

/** ضغطة Input حقيقية في مركز عنصر تعيده عبارة JS (نص) في صفحة إضافة. */
async function clickOn(page, expr, label, { wait = true } = {}) {
  const ok = await page.eval(`(() => { for (const e of document.querySelectorAll('[data-w7]')) e.removeAttribute('data-w7'); const el = (${expr}); if (!el) return false; el.setAttribute('data-w7', '1'); return true; })()`);
  if (!ok) throw new Error(`لم يوجد: ${label}`);
  const c = await page.centerOf('[data-w7="1"]');
  if (!c) throw new Error(`غير ظاهر: ${label}`);
  const at = Date.now();
  await page.click(c.x, c.y);
  if (wait) await human(250, 450);
  return at;
}
const byText = (sel, text, root = 'document') => `[...${root}.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(text)}))`;
const topDialog = `[...document.querySelectorAll('dialog.tj-dialog[open]:not(.lib-panel)')].at(-1)`;
const confirmBtn = `${topDialog}?.querySelector('button[value="confirm"]')`;
const cancelBtn = `${topDialog}?.querySelector('button[value="cancel"]')`;
const textOf = (page, expr) => page.eval(`(() => { const e = (${expr}); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);
async function typeInto(page, expr, text, label) {
  await clickOn(page, expr, label);
  await page.eval(`(() => { const e = document.querySelector('[data-w7="1"]'); e.select?.(); })()`);
  await page.send('Input.insertText', { text });
  await sleep(150);
  await page.key('Tab', 'Tab', 9);
  await human(300, 500);
}
async function chooseFile(page, expr, file, label) {
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  const opened = b.conn.waitFor('Page.fileChooserOpened', () => true, { sessionId: page.sessionId, timeoutMs: 15000 });
  opened.catch(() => {});
  await clickOn(page, expr, label);
  const ev = await opened;
  await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: ev.backendNodeId });
  await page.send('Page.setInterceptFileChooserDialog', { enabled: false });
}
async function navHash(page, id) {
  await page.eval((h) => { location.hash = h; }, { args: [id] });
  await page.waitFor((h) => { const s = document.getElementById(h); return s && !s.hidden; }, { args: [id], timeoutMs: 8000 });
  await human(200, 400);
}
const chipLabels = (page) => page.eval(() => [...document.querySelectorAll('.tj-chip')].map((c) => c.getAttribute('aria-label')));
const row = `document.querySelector('li.lib-row[data-video="${VIDEO}"]')`;
// المحدد يعرض الترجمات الموجودة وحدها بأرقام خاناتها (جولة الصقل §٢)، فالقراءة برقم الخانة لا بالموضع: [1..3] ← aria-checked أو null.
const rowSlots = (page) => page.eval((id) => [1, 2, 3].map((n) => document.querySelector(`li.lib-row[data-video="${id}"] .tj-slots button[data-slot="${n}"]`)?.getAttribute('aria-checked') ?? null), { args: [VIDEO] });
const rowSlot = (n) => `${row}?.querySelector('.tj-slots button[data-slot="${n}"]')`;
async function rowMenu(page, item) {
  await clickOn(page, `${row}?.querySelector('button.lib-more')`, 'المزيد');
  return byText('.tj-menu__list:not([hidden]) [role=menuitem]', item);
}
/** «سيُستبدل 3 تعديلات يدوية» ← 3 (والمفرد والمثنى). */
const editsIn = (text) => {
  const m = /سيُستبدل (\d+|تعديل يدوي واحد|تعديلان)/.exec(clean(text));
  if (!m) return null;
  return m[1] === 'تعديل يدوي واحد' ? 1 : m[1] === 'تعديلان' ? 2 : Number(m[1]);
};

// ---- المشغّل: أدوات الشريط في جذر مغلق، فالنقر بإحداثيات ما يكشفه peek (كما في P12) ----
const centerBox = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
async function clickButton(kind) {
  await revealControls(yt);
  const p = await iso(I.peek);
  const c = centerBox(p.buttons[kind].box);
  await yt.click(c.x, c.y);
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
async function armChooser() {
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
/** رفع ملف كما يفعل المستخدم: زر الرفع، أو بند الرفع في قائمة العرض إن وُجدت ترجمة. */
async function playerUpload(file) {
  await front(yt);
  nextUpload = [file];
  if ((await iso(I.state)).arabic) {
    await openMenuOf('upload', 'الترجمة العربية');
    await clickItem('replace');
  } else {
    await clickButton('upload');
  }
  await sleep(1500);
}
const waitLine = (timeoutMs = 15000) => yt.waitFor(() => {
  const m = globalThis.__tarjuman.mounted.controls.peek()?.layer.menu;
  const t = m?.text ?? '';
  const busy = m?.items.some((x) => x.fid === 'download' && x.text.includes('جارٍ'));
  // رمز النجاح SVG بجانب السطر منذ جولة الصقل، فلا «✓» في النص.
  return !busy && /نُزّل|أُلغي الحفظ|تعذّر حفظ|اسم الملف أو نوعه/.test(t) && /نُسخت التعليمات|تعذّر النسخ/.test(t) ? t : null;
}, { contextId: isoId, timeoutMs });
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
async function openVideo() {
  yt = await openTab(b.conn, 'about:blank');
  tracked.push({ where: 'youtube', errs: collectErrors(yt, { extId, onlyExtension: true }) });
  await yt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  await armChooser();
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
  let ready = await waitForPlayer(yt, VIDEO, 20000);
  if (!ready) {
    await main(M.play);
    ready = await waitForPlayer(yt, VIDEO, 25000);
  }
  if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  await sleep(1500);
  isoId = yt.isolatedContextId(extId);
  if (!isoId) throw new Error('لا سياق معزول للإضافة');
  if (await main(M.isAd)) {
    result.notes.push('إعلان حقيقي صودف على الصفحة؛ انتُظر انتهاؤه.');
    await yt.waitFor(() => {
      const p = document.querySelector('#movie_player');
      const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
      if (skip && getComputedStyle(skip).display !== 'none') skip.click();
      return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
    }, { timeoutMs: 150000, intervalMs: 1000 });
  }
  await main(M.pause);
  await yt.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 10000 });
  await yt.waitFor(() => !globalThis.__tarjuman.controller.getState().loading, { contextId: isoId, timeoutMs: 10000 });
  await iso(I.stub);
  await iso(I.inject, capture);
  await sleep(500);
}
/** ينتظر شرطًا يُقاس بالاستطلاع كل 50 م.ث، ويعيد الزمن المنقضي منذ t0 أو null. */
async function within(t0, fn, timeoutMs = 3000) {
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return Date.now() - t0;
    await sleep(50);
  }
  return null;
}

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
async function edType(text) {
  await ed.send('Input.insertText', { text });
  await sleep(300);
}
async function edCmd(code, key, keyCode) {
  await ed.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers: 4 });
  await ed.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers: 4 });
  await sleep(350);
}
const edSave = async () => { await edCmd('KeyS', 'س', 83); await sleep(900); };
const rowSel = (i, f) => `.ed-row[data-index="${i}"] [data-field="${f}"]`;
const actSel = (i, a) => `.ed-row[data-index="${i}"] [data-act="${a}"]`;
async function rowAction(i, a) {
  await run(E.reveal, i);
  await edHover(`.ed-row[data-index="${i}"] .ed-row__n`);
  await edClick(actSel(i, a));
}
async function openEditor(query) {
  await front(ed);
  await ed.goto(`chrome-extension://${extId}/pages/editor/index.html?${query}`);
  return ed.waitFor(E.ready, { timeoutMs: 20000 });
}
async function edMenu(label, item) {
  await edClick('.ed-head .tj-menu__button, .ed-toolbar .tj-menu__button', label);
  await edClick('.tj-menu__item', item);
}

async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    check(`${name}: اكتمل`, 'تشغيل', false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
    if (yt) await closeMenus().catch(() => {});
    if (ed) await ed.eval(() => document.querySelector('dialog[open]')?.close()).catch(() => {});
  }
}

let lib = null;
let st = null;
let playerCopy = null;
let backupFile = null;
let sourceEntry = null;

try {
  result.head = String(execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT })).trim();
  await mkdir(OUT, { recursive: true });
  await mkdir(FILES, { recursive: true });
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', EXT], { stdio: 'ignore' });
  const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
  result.extension = manifest.version_name ?? manifest.version;
  const fileA = await srtFile(`${VIDEO}.a.ar.srt`, A);
  const fileB = await srtFileKeepNumbers(`${VIDEO}.b.ar.srt`, B);
  // ملاحظة للمنسّق (لا فحص): الملف نفسه بعد إعادة ترقيمه متتاليًا يُحكم عليه بالرقم في compare، والمحاذاة تجد الناقص الحقيقي.
  {
    const renumbered = B.map((c, i) => ({ ...c, n: i + 1 }));
    const cmp = compare(renumbered, EXP.fingerprint, { driftMs: 100 });
    const al = alignCues(EXP.fingerprint.cues, renumbered);
    result.measures.renumberedMissing = { compareMissing: cmp.missing, compareNumbering: cmp.numbering, compareDrift: cmp.drift.length, alignConfidence: al.confidence, alignMissing: al.pairs.filter((x) => x.b === null).map((x) => EXP.fingerprint.cues[x.a].n) };
  }
  const fileC = await srtFile(`${VIDEO}.c-late.ar.srt`, C);
  const fileA2 = await srtFile(`${VIDEO}.a2.ar.srt`, A2);
  const fileA3 = await srtFile(`${VIDEO}.a3.ar.srt`, A3);

  // ===================== ملف التعريف الأول: الأسطح الثلاثة =====================
  await start(PROFILE_A);
  console.log(`— ${result.browser} · الإضافة ${result.extension} · رأس التكامل ${result.head}`);

  // ١. الإعدادات (P13): مصطلحان في القاموس (الإرفاق مفعّل افتراضيًا)، ومكان الحفظ «مجلد فرعي».
  await step('settings', async () => {
    st = await extPage('pages/settings/index.html#glossary');
    await st.waitFor(() => !!document.querySelector('.st-gl__count'), { timeoutMs: 8000 });
    for (const t of GLOSSARY) {
      await typeInto(st, `document.querySelector('.st-gl__field--source input')`, t.source, 'المصطلح');
      await typeInto(st, `document.querySelector('.st-gl__field--target input')`, t.target, 'المقابل');
      await clickOn(st, byText('.st-gl__add button', 'إضافة'), 'إضافة مصطلح');
      await sleep(500);
    }
    await navHash(st, 'export');
    await st.waitFor(() => !!document.querySelector('.st-location'), { timeoutMs: 8000 });
    await clickOn(st, `document.querySelector('.st-location input[value="subfolder"]')`, 'مجلد فرعي');
    await sleep(500);
    const prefs = (await st.eval(async () => chrome.storage.local.get('prefs'))).prefs;
    check('settings-glossary-and-subfolder', '4 · 8', prefs?.glossary.attach === true && sameTerms(prefs.glossary.terms) && prefs.saveLocation.mode === 'subfolder' && prefs.saveLocation.folder === SUB,
      { attach: prefs?.glossary.attach, terms: prefs?.glossary.terms.length, saveLocation: prefs?.saveLocation });
  });

  // ٢. المشغّل (P12): «تنزيل الملف» يتبع المجلد الفرعي، و«نسخ التعليمات» (زر مستقل منذ جولة الصقل §٣) يرفق القاموس.
  let title = null;
  await step('player-download', async () => {
    await openVideo();
    const s0 = await iso(I.state);
    title = s0.title;
    check('player-captured-and-mounted', 'تحضير', s0.captured.some((t) => t.ok) && s0.mounted.controls === 'mounted' && s0.mounted.overlay === 'mounted', { captured: s0.captured, mounted: s0.mounted });
    await openMenuOf('download', 'تحميل الترجمة');
    const m = await menu();
    await clickItem('download');
    await clickItem('copy');
    const line = await waitLine();
    const file = await waitFile(SUB, (n) => n === `${VIDEO}.en.manual.normal.srt`);
    const text = file ? await readFile(file.path, 'utf8') : null;
    check('player-download-follows-subfolder', '8', !!file && text === EXP.files[0].text && (line ?? '').includes('نُزّل'), { file: file ? `${SUB}/${file.name}` : null, line: clean(line).slice(0, 160) });
    const copies = await iso(I.copies);
    playerCopy = copies.at(-1) ?? null;
    const expected = instructions({ videoId: VIDEO, title, glossary: GLOSSARY });
    check('player-copy-with-glossary', '4', clean(m?.text).includes('+ القاموس (2)') && playerCopy?.sha === sha(expected), { tag: clean(m?.text).includes('+ القاموس (2)'), got: playerCopy, expected: sha(expected), chars: expected.length });
    await closeMenus();
  });

  // ٣. المشغّل: أول رفع يُحفظ في الخانة 1 ويصير النشطة.
  await step('player-upload-first', async () => {
    await playerUpload(fileA);
    if ((await menu())?.label === 'رفع ترجمة') await clickItem('confirm');
    await sleep(1200);
    const s = await iso(I.state);
    check('player-upload-slot-1', 'تحضير', s.activeSlot === 1 && s.arabic?.fileName === `${VIDEO}.a.ar.srt`, { active: s.activeSlot, arabic: s.arabic });
    await closeMenus();
  });

  // ٤. المحفوظات (P13): رفع إلى خانة فارغة (2) من حوار الرفع.
  await step('library-upload-empty-slot', async () => {
    lib = await extPage('pages/library/index.html');
    await lib.waitFor((id) => !!document.querySelector(`li.lib-row[data-video="${id}"]`), { args: [VIDEO], timeoutMs: 10000 });
    await front(lib);
    await chooseFile(lib, await rowMenu(lib, 'رفع ترجمة'), fileB, 'رفع ترجمة…');
    await lib.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .lib-up'), { timeoutMs: 10000 });
    await clickOn(lib, `${topDialog}?.querySelector('.lib-up__targets input[value="2"]')`, 'الخانة 2 هدفًا');
    const dialogText = await textOf(lib, topDialog);
    await clickOn(lib, confirmBtn, 'حفظ');
    await sleep(1200);
    const bd = await iso(I.bundle, VIDEO);
    check('library-upload-to-empty-slot-2', 'الدخان', bd.slots[1]?.file === `${VIDEO}.b.ar.srt` && bd.slots[1].count === CUES.length - MISSING.length && bd.slots[0]?.file === `${VIDEO}.a.ar.srt` && !/سيُستبدل/.test(dialogText ?? ''),
      { active: bd.active, slot2: bd.slots[1] && { file: bd.slots[1].file, count: bd.slots[1].count, fp: !!bd.slots[1].fp } });
    result.measures.libraryUploadActivates = bd.active === 2;
  });

  // ٥. التفعيل بالاتجاهين خلال ثانية: من المحفوظات إلى المشغّل، ومن المشغّل إلى المحفوظات.
  await step('activation-both-ways', async () => {
    await front(yt);
    await stableSeek(CUE_AT);
    await sleep(600);
    let active = (await iso(I.state)).activeSlot;
    const other = active === 1 ? 2 : 1;
    await front(lib);
    await lib.waitFor((id) => document.querySelector(`li.lib-row[data-video="${id}"] .tj-slots button`), { args: [VIDEO], timeoutMs: 8000 });
    // الزمن من لحظة إرسال النقرة (لا من انتظار السكربت بعدها) حتى يُقرأ التغيير في الطرف الآخر.
    let t0 = await clickOn(lib, rowSlot(other), `الخانة ${other} في الصف`, { wait: false });
    const toPlayer = await within(t0, async () => (await iso(I.state)).activeSlot === other);
    await sleep(500);
    const lines = await iso(I.ov);
    const want = other === 1 ? 'أ —' : 'ب —';
    check('library-activation-reaches-player', '1', toPlayer !== null && toPlayer <= 1000 && lines.some((l) => l.startsWith(want)), { from: active, to: other, ms: toPlayer, lines });
    active = other;
    const back = active === 1 ? 2 : 1;
    // المحفوظات تُقدَّم فور النقرة في المشغّل (مستخدم ينقر ثم يلتفت إليها): بلا نافذة لا تظهر صفحتان معًا، والتبويب المخفي
    // يؤخّر المتصفح مؤقتاته إلى حدود الثانية (ومؤقت إعادة التحميل في المحفوظات 200 م.ث)، فقياسه مخفيًا لا يقيس ما يُرى.
    await front(yt);
    await openMenuOf('upload', 'الترجمة العربية');
    t0 = (await clickItem(`slot:${back}`, { wait: false })).at;
    await front(lib);
    const toLibrary = await within(t0, async () => (await rowSlots(lib))[back - 1] === 'true');
    const visibility = { library: await lib.eval(() => document.visibilityState), player: await main(() => document.visibilityState) };
    check('player-activation-reaches-library', '1', toLibrary !== null && toLibrary <= 1000, { from: active, to: back, ms: toLibrary, row: await rowSlots(lib), visibility });
    // للعلم لا للفحص: الاتجاه نفسه والمحفوظات مخفية، بالرجوع إلى الخانة السابقة ثم العودة.
    await front(yt);
    await openMenuOf('upload', 'الترجمة العربية');
    const t1 = (await clickItem(`slot:${active}`, { wait: false })).at;
    const hiddenTab = await within(t1, async () => (await rowSlots(lib))[active - 1] === 'true', 4000);
    await clickItem(`slot:${back}`);
    result.measures.activationMs = { libraryToPlayer: toPlayer, playerToLibraryShown: toLibrary, playerToLibraryHiddenTab: hiddenTab };
    await within(Date.now(), async () => (await rowSlots(lib))[back - 1] === 'true', 4000);
    await closeMenus();
    if (back !== 1) {
      await openMenuOf('upload', 'الترجمة العربية');
      await clickItem('slot:1');
      await closeMenus();
    }
    check('slot-1-active-for-editing', 'تحضير', (await iso(I.state)).activeSlot === 1, null);
  });

  // ٦. المحرّر (P14): تعديل ثلاثة مقاطع في الخانة 1 النشطة وحفظها، فيعرضها المشغّل.
  await step('editor-edits-active', async () => {
    ed = await extPage(`pages/editor/index.html?v=${VIDEO}&t=1`);
    await ed.waitFor(E.ready, { timeoutMs: 20000 });
    await front(ed);
    for (const i of [0, 1, 2]) {
      await edClick(rowSel(i, 'text'));
      await run(E.caretEnd, i);
      await edType(EDITED);
    }
    await edSave();
    const bd = await iso(I.bundle, VIDEO);
    const editedCount = bd.slots[0].cues.filter((c) => c[3].endsWith(EDITED)).length;
    await sleep(800);
    const s = await iso(I.state);
    check('editor-save-on-active-shows-in-player', 'الدخان', editedCount === 3 && bd.slots[0].edited && s.activeSlot === 1 && s.arabic?.edited && (s.arabic.first ?? '').endsWith(EDITED), { editedCount, player: s.arabic });
  });

  // ٧. استبدال الخانة المعدّلة: الأعداد نفسها في المشغّل والمحفوظات، و«إبقاء تعديلاتي» من الموضعين.
  /** حوار المشغّل حتى قبل التأكيد: عدد التعديلات المهددة وحالة «إبقاء تعديلاتي». */
  async function playerReplaceAsk(file) {
    await playerUpload(file);
    await clickItem('target:1');
    const m = await menu();
    return { label: m?.label, edits: editsIn(m?.text), keep: m?.items.find((x) => x.fid === 'keep') ?? null, text: clean(m?.text).slice(0, 260) };
  }
  async function libraryReplaceAsk(file) {
    await front(lib);
    await chooseFile(lib, await rowMenu(lib, 'رفع ترجمة'), file, 'رفع ترجمة…');
    await lib.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .lib-up'), { timeoutMs: 10000 });
    await clickOn(lib, `${topDialog}?.querySelector('.lib-up__targets input[value="1"]')`, 'الخانة 1 هدفًا');
    await sleep(500);
    const lost = await textOf(lib, `${topDialog}?.querySelector('.lib-up__lost')`);
    const counts = await lib.eval(() => [...document.querySelectorAll('dialog.tj-dialog[open] .lib-up__counts')].map((e) => e.textContent.trim()));
    const keep = await lib.eval(() => { const x = document.querySelector('dialog.tj-dialog[open] .lib-up input[type="checkbox"]'); return x ? { disabled: x.disabled } : null; });
    return { edits: editsIn(lost), lost, counts, keep };
  }
  await step('replace-edited-same-counts', async () => {
    let bd = await iso(I.bundle, VIDEO);
    const current = bd.slots[0].cues.map(([n, startMs, endMs, text]) => ({ n, startMs, endMs, text }));
    // A2 من المشغّل حتى التأكيد ثم الإلغاء بلا أثر، ثم من المحفوظات بالأعداد نفسها وتأكيد «إبقاء تعديلاتي».
    // البصمة بعد تقديم تبويب الفيديو واستقراره: المحرّر يكتب «آخر موضع» حين يصير في الخلفية (P14، visibilitychange).
    await front(yt);
    await sleep(1200);
    const print0 = await iso(I.storagePrint);
    const p = await playerReplaceAsk(fileA2);
    await clickItem('cancel');
    await sleep(500);
    const print1 = await iso(I.storagePrint);
    const changed = [...new Set([...Object.keys(print0), ...Object.keys(print1)])].filter((k) => print0[k] !== print1[k]);
    check('player-cancel-no-write', 'الدخان', changed.length === 0, changed.length ? { changed } : null);
    await closeMenus();
    const l = await libraryReplaceAsk(fileA2);
    const expectedLines = diffCountLines(diffTranslations(current, A2));
    check('replace-a2-same-edits-player-library', '2', p.label === 'استبدال الترجمة؟' && p.edits === 3 && l.edits === 3 && p.keep && !p.keep.disabled && l.keep && !l.keep.disabled,
      { player: { label: p.label, edits: p.edits, keep: p.keep && !p.keep.disabled }, library: { edits: l.edits, lost: l.lost, keep: l.keep } });
    check('library-diff-counts-from-engine', '2', JSON.stringify(l.counts) === JSON.stringify(expectedLines), { shown: l.counts, expected: expectedLines });
    await shot(lib, 'library-replace-dialog');
    await clickOn(lib, `${topDialog}?.querySelector('.lib-up input[type="checkbox"]')`, 'إبقاء تعديلاتي');
    await clickOn(lib, confirmBtn, 'تأكيد الاستبدال');
    await sleep(1500);
    bd = await iso(I.bundle, VIDEO);
    const keptA2 = bd.slots[0].original[49] === 'أ — صُحّح المقطع 50' && bd.slots[0].cues.filter((c) => c[3].endsWith(EDITED)).length === 3;
    check('library-replace-keeps-edits', '2', keptA2 && bd.previous?.from === 1 && bd.slots[0].file === `${VIDEO}.a2.ar.srt`, { file: bd.slots[0].file, previous: bd.previous, edited: bd.slots[0].edited });

    // A3 من المحفوظات حتى التأكيد ثم الإلغاء، ثم من المشغّل بالأعداد نفسها وتأكيد «إبقاء تعديلاتي».
    const l3 = await libraryReplaceAsk(fileA3);
    await clickOn(lib, cancelBtn, 'إلغاء');
    await sleep(500);
    const p3 = await playerReplaceAsk(fileA3);
    check('replace-a3-same-edits-library-player', '2', l3.edits === 3 && p3.edits === 3 && p3.keep && !p3.keep.disabled, { library: l3.edits, player: p3.edits });
    await clickItem('keep');
    await clickItem('confirm');
    await sleep(1500);
    bd = await iso(I.bundle, VIDEO);
    const s = await iso(I.state);
    const keptA3 = bd.slots[0].original[100] === 'أ — نقّح المقطع 101' && bd.slots[0].cues.filter((c) => c[3].endsWith(EDITED)).length === 3;
    check('player-replace-keeps-edits', '2', keptA3 && bd.slots[0].file === `${VIDEO}.a3.ar.srt` && bd.previous?.from === 1 && (s.arabic?.first ?? '').endsWith(EDITED), { file: bd.slots[0].file, previous: bd.previous, player: s.arabic?.first });
    await closeMenus();
  });

  // ٨. علامة من المشغّل: تظهر في لوحة مراجعة المحرّر، وتُحسب في فرز المحفوظات.
  await step('mark-across', async () => {
    await front(yt);
    await stableSeek(CUE_AT);
    await openMenuOf('upload', 'الترجمة العربية');
    await clickItem('mark');
    await sleep(800);
    await closeMenus();
    const bd = await iso(I.bundle, VIDEO);
    check('player-mark-stored', '3', bd.slots[0].marks.some((x) => x.n === CUE.n && x.kind === 'todo'), { marks: bd.slots[0].marks, cue: CUE.n });
    await openEditor(`v=${VIDEO}&t=1`);
    const tab = await run(E.probe, '.ed-tab', 'المراجعة');
    if (tab) await edClick('.ed-tab', 'المراجعة');
    const s = await info();
    check('player-mark-in-editor-review', '3', s.marks.some((m) => m.startsWith('أعود إليه (1)')), { marks: s.marks });
    await run(E.hideEnglish);
    await shot(ed, 'editor-review-mark');
    await front(lib);
    const chips = await lib.waitFor(() => {
      const l = [...document.querySelectorAll('.tj-chip')].map((c) => c.getAttribute('aria-label'));
      return l.some((x) => x === 'تحتاج مراجعة (1)') ? l : null;
    }, { timeoutMs: 5000 });
    await clickOn(lib, byText('.tj-chip', 'تحتاج مراجعة'), 'فرز «تحتاج مراجعة»');
    await sleep(500);
    const rows = await lib.eval(() => [...document.querySelectorAll('li.lib-row')].map((r) => r.dataset.video));
    check('player-mark-counted-in-library-filter', '3', !!chips && rows.length === 1 && rows[0] === VIDEO, { chips: chips ?? (await chipLabels(lib)), rows });
    await clickOn(lib, byText('.tj-chip', 'الكل'), 'فرز «الكل»');
  });

  // ٩. المزامنة بالجملة: ملف مؤخَّر 3 ث في الخانة 3 (أول فارغة)، واختيار جملة واحدة، والإزاحة تظهر في المحفوظات.
  await step('sync-by-sentence', async () => {
    await playerUpload(fileC);
    const m0 = await menu();
    const target3 = m0?.items.find((x) => x.fid === 'target:3');
    await clickItem('confirm');
    await sleep(1200);
    let s = await iso(I.state);
    check('player-upload-first-empty-slot-3', 'الدخان', !!target3 && s.activeSlot === 3 && s.view.displayOffsetMs === 0, { active: s.activeSlot });
    await stableSeek(CUE.startMs / 1000);
    await sleep(800);
    await closeMenus();
    await openMenuOf('badge', 'توقيت الترجمة');
    const at = await main(M.time);
    await clickItem('sync');
    const m = await menu();
    if (!m.items.find((x) => x.fid === `sentence:${CUE.n - 1}`)) throw new Error(`الجملة ${CUE.n} ليست في النافذة`);
    await clickItem(`sentence:${CUE.n - 1}`);
    s = await iso(I.state);
    const want = Math.round((at * 1000 - (CUE.startMs + 3000)) / 100) * 100;
    await closeMenus();
    check('sync-one-sentence-fixes-3s', 'الدخان', Math.abs(s.view.displayOffsetMs - want) <= 100 && s.view.displayOffsetMs <= -2500 && s.view.displayOffsetMs >= -3500, { offset: s.view.displayOffsetMs, want });
    await front(lib);
    await clickOn(lib, await rowMenu(lib, 'الترجمات'), 'الترجمات…');
    const offsetLine = await lib.waitFor(() => document.querySelector('dialog.lib-panel[open] section[data-slot="3"] .lib-slot__offset')?.textContent.trim() ?? null, { timeoutMs: 8000 });
    const bd = await iso(I.bundle, VIDEO);
    check('sync-offset-in-library', '1', bd.slots[2]?.offset === s.view.displayOffsetMs && clean(offsetLine).startsWith('الإزاحة −'), { stored: bd.slots[2]?.offset, line: clean(offsetLine) });
    await clickOn(lib, `document.querySelector('dialog.lib-panel .lib-panel__head button')`, 'إغلاق اللوحة');
  });

  // ١٠. المحرّر على خانة غير نشطة (1، والنشطة 3): بحث واستبدال بمعاينة، ودمج، وشطر، وحفظ؛ والمشغّل لا يتغير.
  await step('editor-non-active-slot', async () => {
    await front(yt);
    await stableSeek(CUE_AT);
    await sleep(600);
    const before = { state: await iso(I.state), lines: await iso(I.ov) };
    await openEditor(`v=${VIDEO}&t=1`);
    let s = await info();
    const count = s.count;
    check('editor-opens-non-active-slot', '1', s.slot === 1 && s.active === 3, { slot: s.slot, active: s.active, note: s.note });
    await edClick(rowSel(3, 'text'));
    await edCmd('KeyF', 'ب', 70);
    await edType('المقطع 1');
    await sleep(400);
    s = await info();
    const total = Number((s.search.count ?? '').split(' من ')[1]);
    await edClick('.ed-search button', 'استبدال');
    await edClick('.ed-search__replace input');
    await edType('البند 1');
    await edClick('.ed-search__replace button', 'معاينة استبدال الكل');
    s = await info();
    const previewOk = s.dialog?.title === 'معاينة استبدال الكل' && s.dialog.checks === total && s.dialog.checked === total;
    await edClick('dialog[open] button', 'استبدال');
    s = await info();
    const replaced = (await run(E.texts)).filter((t) => t.includes('البند 1')).length;
    check('editor-search-replace-all', 'الدخان', previewOk && total > 10 && replaced === total, { total, replaced, history: s.history });
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
    check('editor-merge-and-split', 'الدخان', merged && s.count === count && s.dirty, { count: s.count, was: count, history: s.history });
    await edSave();
    const bd = await iso(I.bundle, VIDEO);
    await sleep(800);
    const after = { state: await iso(I.state), lines: await iso(I.ov) };
    check('editor-save-stored-in-slot-1', 'الدخان', bd.slots[0].count === count && bd.slots[0].cues.filter((c) => c[3].includes('البند 1')).length === replaced && bd.active === 3, { count: bd.slots[0].count, active: bd.active });
    check('editor-non-active-save-keeps-player', '1', after.state.activeSlot === 3 && after.state.arabic?.fileName === before.state.arabic?.fileName && after.state.arabic?.first === before.state.arabic?.first
      && JSON.stringify(after.lines) === JSON.stringify(before.lines), { before: { active: before.state.activeSlot, lines: before.lines }, after: { active: after.state.activeSlot, lines: after.lines } });
  });

  // ١١. القفز من المحرّر إلى تبويب المشغّل المفتوح.
  await step('editor-jump', async () => {
    await front(ed);
    const target = await run(E.cue, 30);
    const bd = await iso(I.bundle, VIDEO);
    const expect = target.startMs + (bd.slots[0].offset ?? 0);
    await rowAction(30, 'seek');
    await sleep(1500);
    const at = Math.round((await main(M.time)) * 1000);
    check('editor-jump-reaches-player-tab', '7', Math.abs(at - expect) < 400, { at, expect, lastSeek: (await info()).lastSeek });
    await front(ed);
  });

  // ١٢. دورة استكمال قصيرة على الخانة 2 بعد تفعيلها من المحفوظات: الملف في المجلد الفرعي، والرد يُطبَّق ويُحفظ، ويظهر في المشغّل.
  await step('editor-complete-cycle', async () => {
    await front(lib);
    const t0 = await clickOn(lib, rowSlot(2), 'الخانة 2 في الصف', { wait: false });
    const ms = await within(t0, async () => (await iso(I.state)).activeSlot === 2);
    check('library-activates-slot-2', '1', ms !== null && ms <= 1000, { ms });
    await openEditor(`v=${VIDEO}&t=2`);
    await edClick('.ed-tab', 'الاستكمال');
    let s = await info();
    check('editor-complete-finds-missing', 'الدخان', (s.complete ?? '').includes(`الناقص (${MISSING.length})`), { complete: clean(s.complete).slice(0, 160), comparison: s.comparison });
    const before = new Set(await listDl(SUB));
    await edClick('[aria-label="الاستكمال"] button', 'تنزيل ملف الاستكمال');
    const patch = await waitFile(SUB, (n) => n.endsWith('.patch.srt'), { except: before, timeoutMs: 15000 });
    const patchCues = patch ? parseSrtLenient(await readFile(patch.path, 'utf8')).cues : [];
    check('editor-patch-in-subfolder', '8', !!patch && patchCues.map((c) => c.n).join(',') === MISSING.join(','), { file: patch ? `${SUB}/${patch.name}` : null, cues: patchCues.map((c) => c.n) });
    const reply = path.join(FILES, `${VIDEO}.patch.reply.srt`);
    await writeFile(reply, patchCues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\nمكمَّل ${c.n}\n`).join('\n'));
    const { root } = await ed.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await ed.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[aria-label="الاستكمال"] input[type=file]' });
    await ed.send('DOM.setFileInputFiles', { nodeId, files: [reply] });
    await sleep(900);
    s = await info();
    const preview = s.dialog?.title === 'معاينة ملف التصحيح' && s.dialog.checks === MISSING.length;
    await edClick('dialog[open] button', 'تطبيق');
    await sleep(700);
    s = await info();
    check('editor-patch-applied', 'الدخان', preview && s.count === CUES.length && s.dirty, { preview, count: s.count });
    await edSave();
    const n = MISSING[1];
    const seen = await within(Date.now(), async () => (await iso(I.cueText, n)) === `مكمَّل ${n}`, 4000);
    check('editor-patch-shows-in-player', '5', seen !== null && (await iso(I.state)).activeSlot === 2, { cue: n, text: await iso(I.cueText, n), ms: seen });
  });

  // ١٣. التصدير من المحرّر والمحفوظات يتبع المجلد الفرعي، والنسخ من المحفوظات بنص المشغّل نفسه.
  await step('exports-and-copy', async () => {
    await front(ed);
    let before = new Set(await listDl(SUB));
    await edMenu('تصدير', 'الترجمة SRT');
    await edClick('dialog[open] button', 'تنزيل SRT');
    const srt = await waitFile(SUB, (n) => n.endsWith('.ar.srt'), { except: before });
    check('editor-export-follows-subfolder', '8', !!srt && parseSrtLenient(await readFile(srt.path, 'utf8')).cues.length === CUES.length, { file: srt ? `${SUB}/${srt.name}` : null });
    await front(lib);
    before = new Set(await listDl(SUB));
    await clickOn(lib, await rowMenu(lib, 'الإنجليزية'), 'تصدير الإنجليزية');
    const en = await waitFile(SUB, (n) => n.startsWith(VIDEO) && n.endsWith('.srt'), { except: before });
    check('library-export-follows-subfolder', '8', !!en, { file: en ? `${SUB}/${en.name}` : null });
    await lib.eval(S.stubClipboard);
    await clickOn(lib, `${row}?.querySelector('.lib-copy__button')`, 'نسخ التعليمات');
    await sleep(600);
    const copied = (await lib.eval(S.copied))[0] ?? '';
    const expected = instructions({ videoId: VIDEO, title, glossary: GLOSSARY });
    check('library-copy-same-text-as-player', '4', copied === expected && sha(copied) === playerCopy?.sha && copied.includes('- education = التعليم'), { chars: copied.length, sha: sha(copied), player: playerCopy?.sha });
  });

  // ١٤. النسخة الاحتياطية من الإعدادات في المجلد الفرعي، وتشمل ما كتبته الأسطح الثلاثة.
  await step('backup-create', async () => {
    await front(st);
    await navHash(st, 'data');
    await st.waitFor(() => !!document.querySelector('#data .st-data'), { timeoutMs: 8000 });
    const before = new Set(await listDl(SUB));
    await clickOn(st, byText('#data button', 'إنشاء نسخة احتياطية'), 'إنشاء نسخة احتياطية');
    const created = await st.waitFor(() => [...document.querySelectorAll('#data .tj-alert')].find((e) => e.textContent.includes('أُنشئت النسخة الاحتياطية'))?.textContent ?? null, { timeoutMs: 30000, intervalMs: 200 });
    const file = await waitFile(SUB, (n) => /^tarjuman-backup-\d{4}-\d{2}-\d{2}( \(\d+\))?\.json$/.test(n), { except: before, timeoutMs: 20000 });
    backupFile = file?.path ?? null;
    const head = file ? JSON.parse(await readFile(file.path, 'utf8')) : null;
    const entry = head?.data.videos.find((v) => v.record.videoId === VIDEO) ?? null;
    sourceEntry = await st.eval(S.entry, { args: [VIDEO] });
    const canonical = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));
    const want = entry && { ...entry, record: { ...entry.record, rev: 0 } };
    // ترجمة النشطة في السجل وخانتها في alts فارغة (عقد backup §٣).
    const slot = (i) => (entry ? (entry.active === i + 1 ? { track: entry.record.arabic, offsetMs: entry.record.view.displayOffsetMs } : entry.alts[i]) : null);
    const [s1, s2, s3] = [0, 1, 2].map(slot);
    check('backup-in-subfolder', '8', !!created && !!file && head?.format === 'tarjuman-backup' && head.counts.videos === 1, { file: file ? `${SUB}/${file.name}` : null, counts: head?.counts });
    check('backup-includes-three-surfaces', '6', !!entry && canonical(want) === canonical(sourceEntry)
      && s1?.track.fileName === `${VIDEO}.a3.ar.srt` && (s1.track.current ?? []).some((c) => c.text.includes('البند 1')) && entry.marks[0].marks.some((x) => x.kind === 'todo')
      && s2?.track.fileName === `${VIDEO}.b.ar.srt` && (s2.track.current ?? []).some((c) => c.text === `مكمَّل ${MISSING[1]}`)
      && s3?.track.fileName === `${VIDEO}.c-late.ar.srt` && s3.offsetMs < 0 && entry.previous?.from === 1
      && sameTerms(head.data.prefs?.glossary?.terms) && head.data.prefs.saveLocation.mode === 'subfolder',
    { sameAsStorage: !!entry && canonical(want) === canonical(sourceEntry), active: entry?.active, files: [s1, s2, s3].map((x) => x?.track.fileName ?? null), offsets: [s1, s2, s3].map((x) => x?.offsetMs ?? null),
      previous: entry?.previous?.from ?? null, marks: entry?.marks.map((x) => x.marks.length), counts: head?.counts });
  });

  await stop('A');
  b = null;

  // ===================== ملف التعريف الثاني: الاستعادة بافتراض التخطي =====================
  await step('restore-new-profile', async () => {
    if (!backupFile) throw new Error('لا نسخة احتياطية');
    await start(PROFILE_B);
    st = await extPage('pages/settings/index.html#data');
    await st.waitFor(() => !!document.querySelector('#data .st-data'), { timeoutMs: 8000 });
    await front(st);
    const empty = await st.eval(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('video:')).length);
    await chooseFile(st, byText('#data button', 'استعادة من ملف'), backupFile, 'استعادة من ملف…');
    await st.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .st-restore'), { timeoutMs: 30000 });
    const pv = clean(await textOf(st, topDialog));
    await clickOn(st, confirmBtn, 'استعادة');
    const report = await st.waitFor(() => [...document.querySelectorAll('#data .tj-alert')].find((e) => e.textContent.includes('اكتملت الاستعادة'))?.textContent.replace(/\s+/g, ' ').trim() ?? null, { timeoutMs: 30000, intervalMs: 200 });
    const restored = await st.eval(S.entry, { args: [VIDEO] });
    const canonical = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));
    check('restore-new-profile-identical', '6', empty === 0 && /جديدة — ستُضاف \(1\)/.test(pv) && /أضيف 1 · تُخطّي 0 · استُبدل 0 · تعذّر 0/.test(clean(report)) && canonical(restored) === canonical(sourceEntry),
      { empty, preview: pv.slice(0, 160), report: clean(report), identical: canonical(restored) === canonical(sourceEntry) });
    await shot(st, 'restore-report');

    // عمل جديد في ملف التعريف الجديد (تفعيل الخانة 1 من المحفوظات)، ثم الاستعادة مرة ثانية: الموجود يُتخطى افتراضيًا.
    lib = await extPage('pages/library/index.html');
    await lib.waitFor((id) => !!document.querySelector(`li.lib-row[data-video="${id}"]`), { args: [VIDEO], timeoutMs: 10000 });
    await front(lib);
    const chips = await chipLabels(lib);
    check('restored-library-row-and-filter', '6', (await rowSlots(lib)).every((x) => x !== null) && chips.includes('تحتاج مراجعة (1)'), { chips, slots: await rowSlots(lib) });
    await clickOn(lib, rowSlot(1), 'الخانة 1 في الصف');
    await sleep(800);
    const activeNow = await lib.eval(S.active, { args: [VIDEO] });
    await front(st);
    await chooseFile(st, byText('#data button', 'استعادة من ملف'), backupFile, 'استعادة ثانية');
    await st.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .st-restore'), { timeoutMs: 30000 });
    const pv2 = clean(await textOf(st, topDialog));
    const boxes = await st.eval(() => [...document.querySelectorAll('dialog.tj-dialog[open] .st-restore input[type="checkbox"][data-video]')].map((x) => x.checked));
    await clickOn(st, confirmBtn, 'استعادة');
    const report2 = await st.waitFor(() => {
      const all = [...document.querySelectorAll('#data .tj-alert')].filter((e) => e.textContent.includes('اكتملت الاستعادة'));
      return all.length && /أضيف 0/.test(all.at(-1).textContent) ? all.at(-1).textContent.replace(/\s+/g, ' ').trim() : null;
    }, { timeoutMs: 30000, intervalMs: 200 });
    const kept = await st.eval(S.active, { args: [VIDEO] });
    check('restore-again-skips-existing-by-default', '6', activeNow === 1 && /موجودة — تُتخطى افتراضيًا \(1\)/.test(pv2) && boxes.every((x) => !x) && /أضيف 0 · تُخطّي 1 · استُبدل 0 · تعذّر 0/.test(clean(report2)) && kept === 1,
      { activeNow, preview: pv2.slice(0, 160), boxes, report: clean(report2), kept });
  });
  if (b) {
    await stop('B');
    b = null;
  }

  const errCount = Object.values(result.errors).flat().reduce((n, e) => n + e.errors.length, 0);
  check('no-extension-errors', 'عام', errCount === 0, errCount ? result.errors : null);
} catch (err) {
  check('run', 'تشغيل', false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
  if (b) await b.close().catch(() => {});
}

await mkdir(OUT, { recursive: true });
const json = JSON.stringify(result, null, 2).split(DL).join('‹تنزيلات الاختبار›').split(PROFILE_ROOT).join('‹ملفات الاختبار›');
const leaks = findSecrets(json);
if (leaks.length) throw new Error(`تسرب في الأدلة: ${leaks.join(', ')}`);
const file = path.join(OUT, 'surfaces.json');
await writeFile(file, `${json}\n`);
const failed = result.checks.filter((x) => !x.ok);
console.log(`${failed.length ? '✗' : '✓'} ${result.checks.length - failed.length}/${result.checks.length} — ${rel(file)}`);
process.exit(failed.length ? 1 : 0);
