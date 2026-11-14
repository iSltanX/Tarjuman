#!/usr/bin/env node
// الاختبار الحي في المتصفحات الأربعة (جولة النشر T3): Brave وChrome وEdge وFirefox بالخطوات نفسها، ببناء
// التطوير للهدف (chromium أو firefox)، بلا نافذة ومكتوم الصوت، وملف تعريف جديد خارج المستودع، وحساب يوتيوب غير مسجَّل:
//   التثبيت ← الجسر (غلافا fetch وXHR في عالم الصفحة، ورسالة الالتقاط إلى العالم المعزول) ← تنزيل SRT من شريط المشغّل (في Firefox
//   عبر رابط blob: من صفحة الخلفية، إذ يرفض روابط data:) ← نسخ التعليمات من نافذة الإضافة بزوج «من» و«إلى» (منذ 2.0.0، AA3 ق٨؛ وقائمة
//   المشغّل بلا نسخ) ← رفع العربية من الشريط ← العرض فوق الفيديو ← التوقيت (+ و−) ← خطوط الواجهة
//   والترجمة ← المحرّر ← الحفظ بعد إعادة التحميل ← النسخة الاحتياطية ← «الإبلاغ عن مشكلة» (المعاينة والنسخ ونسخ البريد، ولا إرسال
//   منذ و1 ولا طلب إلى مضيف البلاغات القديم) ← في Firefox منح إذن يوتيوب وسحبه ← الإزالة وقياس محو التخزين ← إعادة التثبيت فارغًا ← الاستعادة.
// تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُرسل جسم P1 الحقيقي للفيديو نفسه من عالم الصفحة برسالة الالتقاط نفسها.
// النصوص المتوقعة من الفهرس بلغة الواجهة التي تعرضها الإضافة فعلًا (lang في كل صفحة، وعنوان قائمة المشغّل)، كالدخان: يوتيوب تحت
// الأتمتة إنجليزي فتأتي الواجهة إنجليزية، وكان الفحص يبحث بنصوص عربية فيسقط والإضافة سليمة (تحقق Gemini، T1-أ، وFable ع-٤). ويخرج
// بالرمز 1 عند أي سقوط. وصفحات الإضافة تُغلق قبل الإزالة (T1-ب).
//   command node test/live/stores/t3.mjs --browser brave|chrome|edge|firefox [--headed] [--out test-results/live/T3/<browser>]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, human, sleep } from '../harness/browser.mjs';
import { BidiPage } from '../harness/bidi.mjs';
import { attach } from '../harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport, instructions } from '../../../src/core/export/index.js';
import { describeLang } from '../../../src/core/lang/index.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { LOCALES, catalogOf, isLocale } from '../../../src/i18n/index.js';
import { APPS, bridge, startBrowser } from './driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
if (!APPS[browser]) throw new Error(`متصفح غير معروف: ${browser}`);
const TARGET = browser === 'firefox' ? 'firefox' : 'chromium';
const HEADLESS = !argv.includes('--headed');
const OUT = path.resolve(ROOT, val('out', `test-results/live/T3/${browser}`));
const VIDEO = 'iG9CE55wbtY';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 't3-work', `${browser}-${RUN}`);
const EXT = path.join(WORK, 'ext');
const DL = path.join(WORK, 'downloads');
const AR_FILE = path.join(ROOT, 'test/e2e/fixtures/iG9CE55wbtY.en.manual.normal.ar.srt');
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const ISOLATES = new RegExp(`[${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}]`, 'g');
const clean = (s) => String(s ?? '').replace(ISOLATES, '').replace(/\s+/g, ' ').trim();
const rel = (f) => path.relative(ROOT, f);

const result = { browser: null, target: TARGET, at: new Date().toISOString(), headless: HEADLESS, video: VIDEO, extension: null, uiLocale: {}, checks: [], notes: [], screenshots: [], errors: [] };

/**
 * نصوص الفحص بلغة واجهة مدعومة، من الفهرس نفسه الذي ترسم منه الإضافة (كـuiText في الدخان). القوالب تُقطع عند متغيرها: «نُزّل {name}»
 * ← «نُزّل»، و«اكتملت الاستعادة.» بلا نقطتها.
 * @param {'ar' | 'en'} locale
 */
function uiText(locale) {
  const c = catalogOf(locale);
  const lead = (key) => String(c.get(key)).split('{')[0].trim();
  return {
    locale,
    downloadTitle: c.get('player.controls.downloadTitle'),
    downloaded: lead('player.controls.downloadedLine'),
    saveFailed: [c.get('errors.SV_FAILED'), c.get('errors.SV_FALLBACK_BLOB')],
    fallbackBlob: c.get('errors.SV_FALLBACK_BLOB'),
    // صف عنوان كتلة «تعليمات الترجمة»: العنوان وزر «الخطوات» بجانبه (ح-60)؛ ثم صف اللغتين: «من» واسم الإنجليزية ثم «إلى» واسم
    // العربية بلغة الواجهة. كلٌّ من عنصره، لا من نص الكتلة كلها (فيه الخطوات المطوية).
    pairHead: [c.get('popup.pair.title'), c.get('popup.steps.toggle')].join(''),
    pairLangs: [c.get('common.langPicker.from'), describeLang('en', locale).name, c.get('common.langPicker.to'), describeLang('ar', locale).name].join(''),
    save: c.get('editor.action.save'),
    backup: c.get('settings.data.create'),
    restore: c.get('settings.data.restore'),
    restoreDone: lead('errors.BK_RESTORE_DONE').replace(/[.。]$/, ''),
    report: c.get('settings.report.label'),
    copyReport: c.get('settings.report.copy'),
    copyEmail: c.get('settings.report.copyEmail'),
  };
}
/** لغة الواجهة التي يعرض بها نص معروف، بمفتاحه في الفهرس؛ أو null إن لم يطابق أي لغة. @param {string} key @param {unknown} shown */
const localeShowing = (key, shown) => LOCALES.find((l) => catalogOf(l).get(key) === shown) ?? null;
/** نصوص صفحة إضافة بلغتها هي (lang على جذرها)، وتُسجَّل في الأدلة. */
async function pageText(page, name) {
  const lang = await page.eval(() => document.documentElement.lang).catch(() => null);
  result.uiLocale[name] = lang;
  if (!isLocale(lang)) throw new Error(`لغة صفحة ${name} غير مدعومة: ${lang}`);
  return uiText(lang);
}
const squash = (s) => String(s ?? '').replace(ISOLATES, '').replace(/\s+/g, '');
/** ok: true نجح، false فشل، null لم يُختبر (والسبب في التفصيل). */
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok, detail });
  console.log(`${ok === null ? '·' : ok ? '✓' : '✗'} ${id}${detail !== null ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
};
async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    check(name, false, { error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
  }
}

function appVersion(app) {
  try {
    return String(execFileSync('/usr/bin/defaults', ['read', path.join(app, 'Contents/Info.plist'), 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}

// ---- المتوقع في Node من جسم P1 نفسه ----
const body = await readFile(path.join(ROOT, 'test/fixtures/json3/manual-ted-iG9CE55wbtY.json'), 'utf8');
const capture = { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VIDEO, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false };
const ex = createExtractor({ currentVideoId: () => VIDEO, durationMs: () => 1203421, isLive: () => false });
ex.handleMessage(capture);
const conv = ex.convert('en|manual', { mode: 'normal' });
const EXP = buildExport({ videoId: VIDEO, title: null, track: { key: 'en|manual', lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: 'normal', now: Date.now() });
const CUES = EXP.fingerprint.cues;
const AR = parseSrtLenient(await readFile(AR_FILE, 'utf8')).cues;
const CUE = CUES.find((c) => c.startMs >= 60000 && c.endMs - c.startMs >= 1500);
const CUE_AT = (CUE.startMs + CUE.endMs) / 2000;
const AR_TEXT = AR.find((c) => c.n === CUE.n)?.text ?? '';
const BRAND = { brave: 'Brave', chrome: 'Google Chrome', edge: 'Microsoft Edge', firefox: 'Firefox' }[browser];

// ---- صفحة الفيديو ----
const M = {
  mute: () => { const v = document.querySelector('#movie_player video.html5-main-video'); if (!v) return false; v.muted = true; v.pause(); return v.paused; },
  play: () => { const v = document.querySelector('#movie_player video.html5-main-video'); if (!v) return false; v.muted = true; v.play().catch(() => {}); return true; },
  skipBox: () => {
    const s = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
    const r = s?.getBoundingClientRect();
    return r && r.width > 0 && getComputedStyle(s).display !== 'none' ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
  },
  seek: (t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.pause(); v.currentTime = t; return true; },
  time: () => document.querySelector('#movie_player video.html5-main-video')?.currentTime ?? -1,
  isAd: () => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); },
  skipAd: () => { const s = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button'); if (s) { s.click(); return true; } return false; },
  wrapped: () => {
    const native = (f) => /\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(f));
    return { fetch: !native(window.fetch), xhrOpen: !native(XMLHttpRequest.prototype.open), webdriver: navigator.webdriver === true };
  },
};
const centerBox = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });

let s = null;
let yt = null;
const call = async (op, args = [], ms) => {
  const r = await bridge(yt, op, args, ms);
  if (!r.ok) throw new Error(`الجسر ${op}: ${r.error}`);
  return r.value;
};
const waitBridge = async (op, pred, { timeoutMs = 15000, args = [] } = {}) => {
  const end = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < end) {
    const r = await bridge(yt, op, args, 4000).catch(() => null);
    if (r?.ok) {
      last = r.value;
      if (pred(last)) return last;
    }
    await sleep(300);
  }
  return null;
};
/** ما تحت النقطة من مضيفي ترجمان (tarjuman-controls أو طبقة القوائم)؛ فلا تقع ضغطة على إعلان أو رابط في الصفحة. */
const hostAt = (c) => yt.eval((x, y) => {
  const e = document.elementFromPoint(x, y);
  return e?.closest?.('[id^="tarjuman-"]')?.id ?? (e ? `${e.tagName}#${e.id}.${String(e.className).slice(0, 80)}` : null);
}, { args: [c.x, c.y] });
/** نافذة ترويج يوتيوب (yt-mealbar-promo-renderer) تغطي زاوية المشغّل: تُغلق بزرها نقرة حقيقية كما في جولة الهوية. */
async function dismissPromo() {
  const c = await yt.eval(() => {
    const promo = document.querySelector('yt-mealbar-promo-renderer');
    if (!promo || !promo.getClientRects().length) return null;
    const btn = promo.querySelector('#dismiss-button button, #dismiss-button, yt-button-renderer#dismiss-button');
    const r = btn?.getBoundingClientRect();
    return r && r.width ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
  });
  if (!c) return false;
  await yt.click(c.x, c.y);
  await sleep(700);
  result.notes.push('أُغلقت نافذة ترويج يوتيوب فوق المشغّل');
  return true;
}
async function safeClick(c, label) {
  let at = await hostAt(c);
  if (!String(at).startsWith('tarjuman-')) {
    // غطاء من يوتيوب فوق الشريط (نافذة ترويج، أو بقايا إعلان): يُغلق الترويج، ويُحرَّك المؤشر، ثم مرة أخرى.
    await dismissPromo();
    await revealControls(yt);
    await sleep(1500);
    at = await hostAt(c);
  }
  if (!String(at).startsWith('tarjuman-')) throw new Error(`تحت ${label} ليس من أدوات ترجمان: ${at}`);
  await yt.click(c.x, c.y);
  await sleep(500);
}
/** حال الصفحة حين يغيب الشريط: العنوان والمشغّل ولقطة، لتسمية السبب (تنقل، أو صفحة تحقق من يوتيوب) لا تخمينه. */
async function pageState(label) {
  const st = await yt.eval(() => ({ path: location.pathname, v: new URLSearchParams(location.search).get('v'), title: document.title.slice(0, 80), player: !!document.querySelector('#movie_player'), video: !!document.querySelector('#movie_player video.html5-main-video'), host: !!document.getElementById('tarjuman-controls') })).catch((e) => ({ error: e.message.slice(0, 80) }));
  await shot(yt, `lost-${label}`);
  return st;
}
async function clickButton(kind, { menu: expectMenu = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await revealControls(yt);
    let p = await call('peek');
    if (!p) {
      // أعاد يوتيوب تحميل الصفحة: يُنتظر المشغّل والشريط مرة، وإلا يُسمّى الحال.
      const before = await pageState(kind);
      await ensureCapture(`bar-${kind}`);
      await revealControls(yt);
      p = await call('peek');
      if (!p) throw new Error(`الشريط غائب: ${JSON.stringify(before)}`);
    }
    const box = p.buttons[kind]?.box;
    if (!box) throw new Error(`زر ${kind} غير ظاهر`);
    await safeClick(centerBox(box), `زر ${kind}`);
    // الزر يفتح قائمته: إن لم تُفتح (ضغطة وقعت والشريط يختفي) تُعاد مرة.
    if (!expectMenu || (await waitBridge('peek', (x) => !!x?.layer.menu, { timeoutMs: 3000 }))) return;
  }
}
const MARK_PAGE = () => { window.__t3marker = Date.now(); return true; };
/** العنوان نفسه والتحميل مكتمل أربع ثوانٍ متتالية (حتى 25 ثانية). */
async function settlePage() {
  const end = Date.now() + 25000;
  let last = null;
  let since = Date.now();
  let changes = 0;
  while (Date.now() < end) {
    const now = await yt.eval(() => (document.readyState === 'complete' ? location.href.replace(/^https:\/\/www\.youtube\.com/, '') : null)).catch(() => null);
    if (now !== last) {
      if (last !== null) changes += 1;
      last = now;
      since = Date.now();
    } else if (now && Date.now() - since >= 4000) {
      return { url: now, changes };
    }
    await sleep(500);
  }
  return { url: last, changes, timeout: true };
}
/**
 * الالتقاط قائم قبل ما يحتاجه: إن غاب لأن يوتيوب أعاد تحميل الصفحة (يزول العلَم) يُرسل كما يجلبه المشغّل عند التحميل، ويُسجَّل؛
 * وإن غاب في المستند نفسه فذاك خلل يُحسب فشلًا.
 */
async function ensureCapture(label) {
  // صفحة يعيد يوتيوب تحميلها: يُنتظر المشغّل والجسر أولًا.
  await waitForPlayer(yt, VIDEO, 45000);
  await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
  await waitBridge('state', (v) => v.mounted.controls === 'mounted', { timeoutMs: 15000 });
  const st = await call('state');
  if (st.english?.count === CUES.length) return;
  const reloaded = !(await yt.eval(() => window.__t3marker ?? null));
  if (reloaded) {
    await waitAdEnd();
    await yt.eval(M.mute).catch(() => false);
  }
  result.notes.push(`${label}: الالتقاط غائب، ${reloaded ? 'أعاد يوتيوب تحميل الصفحة فأُرسل من جديد' : 'في المستند نفسه'}`);
  if (!reloaded) check(`capture-kept-${label}`, false, { english: st.english, captured: st.captured });
  await yt.eval((msg) => { window.postMessage(msg, location.origin); return true; }, { args: [capture] });
  await waitBridge('state', (v) => v.english?.count === CUES.length, { timeoutMs: 15000 });
  await yt.eval(MARK_PAGE);
}
const menu = async () => (await call('peek')).layer.menu;
async function clickItem(fid) {
  const m = await menu();
  const it = m?.items.find((x) => x.fid === fid);
  if (!it) throw new Error(`لا بند ${fid} — ${m?.items.map((x) => x.fid).join(',') ?? 'لا قائمة'}`);
  await safeClick(centerBox(it.box), `بند ${fid}`);
}
async function closeMenu() {
  if (await menu()) {
    await yt.press('Escape');
    await sleep(300);
  }
}
/** الإعلان يعمل مكتومًا حتى ينتهي (الإيقاف يجمّده)، ويُنقر «تخطٍّ» نقرة حقيقية إن ظهر. */
async function waitAdEnd(timeoutMs = 150000) {
  const end = Date.now() + timeoutMs;
  let seen = false;
  let skipped = 0;
  while (Date.now() < end) {
    if (!(await yt.eval(M.isAd))) {
      if (seen) await yt.eval(M.mute);
      return { seen, skipped };
    }
    seen = true;
    await yt.eval(M.play);
    const c = await yt.eval(M.skipBox);
    if (c) {
      await yt.click(c.x, c.y);
      skipped += 1;
    }
    await sleep(1500);
  }
  return { seen, skipped, stuck: true };
}
async function stableSeek(t) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await yt.eval(M.seek, { args: [t] });
    let ok = true;
    for (let i = 0; i < 5; i++) {
      await sleep(400);
      if (Math.abs((await yt.eval(M.time)) - t) > 0.05) {
        ok = false;
        break;
      }
    }
    if (ok) return attempt + 1;
  }
  return 0;
}

// ---- الملفات ----
const listDl = async () => {
  try {
    return (await readdir(DL)).filter((n) => !/\.(?:crdownload|part)$/.test(n)).sort();
  } catch {
    return [];
  }
};
async function waitFile(match, { timeoutMs = 25000, except = new Set() } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const f = (await listDl()).find((n) => match(n) && !except.has(n));
    if (f) {
      await sleep(400);
      return { name: f, path: path.join(DL, f) };
    }
    await sleep(300);
  }
  return null;
}
async function dirSize(dir) {
  try {
    let total = 0;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      total += e.isDirectory() ? await dirSize(p) : (await stat(p)).size;
    }
    return total;
  } catch {
    return null;
  }
}

// ---- صفحات الإضافة: ضغطة حقيقية في مركز عنصر يعيده تعبير JS ----
async function clickOn(page, expr, label) {
  const ok = await page.eval(`(() => { for (const e of document.querySelectorAll('[data-t3]')) e.removeAttribute('data-t3'); const el = (${expr}); if (!el) return false; el.setAttribute('data-t3', '1'); return true; })()`);
  if (!ok) throw new Error(`لم يوجد: ${label}`);
  const c = await page.centerOf('[data-t3="1"]');
  if (!c) throw new Error(`غير ظاهر: ${label}`);
  await page.click(c.x, c.y);
  await human(250, 450);
}
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(text)}))`;
/**
 * مركز عنصر بعد ثبات التخطيط (ص-٢٦، ST1)، أو null. الصفحة المفتوحة في الخلفية لا تُخطَّط ولا تطلب خطوطها حتى يُقاس فيها شيء،
 * فـdocument.fonts.status «loaded» والخطوط كلها «unloaded». فكان أول قياس في Firefox بالخط الاحتياطي (بطاقة الفيديو 221 بدل 179،
 * والزر عند 427)، ثم تحمّلت الخطوط قبل الضغطة فصعد الزر 42 بكسلًا ووقعت الضغطة على «الصق الترجمة هنا»: لا نسخ. فهنا يُفرض
 * التخطيط وتُنتظر الخطوط، ثم قراءتان متساويتان بينهما 250ms، وما تحت المركز هو العنصر نفسه.
 */
async function stableCenter(page, selector, timeoutMs = 10000) {
  return page.waitFor(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.getBoundingClientRect();
    await document.fonts.ready;
    const read = () => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height };
    };
    const a = read();
    await new Promise((done) => setTimeout(done, 250));
    const b = read();
    if (!b.w || !b.h || a.x !== b.x || a.y !== b.y || document.fonts.status !== 'loaded') return null;
    return el.contains(document.elementFromPoint(b.x, b.y)) ? { x: b.x, y: b.y } : null;
  }, { args: [selector], timeoutMs, intervalMs: 200 });
}
async function shot(page, name) {
  const f = path.join(OUT, `${name}.png`);
  try {
    await page.screenshot(f);
    result.screenshots.push(rel(f));
  } catch (err) {
    result.notes.push(`لقطة ${name}: ${err.message.slice(0, 100)}`);
  }
}

/**
 * نافذة الإضافة كما تُفتح من شريط المتصفح: تبويب في الخلفية ويوتيوب التبويب النشط في آخر نافذة، فتقرأ حاله بـ
 * tabs.query({ active, lastFocusedWindow }) كما في الاستعمال الحقيقي (test/live/aa4/site-shots.mjs). بعرضها 340.
 */
async function openPopupBehindYoutube() {
  const url = `${s.base}pages/popup/index.html`;
  if (s.kind === 'firefox') {
    await yt.conn.send('browsingContext.activate', { context: yt.context }).catch(() => null);
    const page = await BidiPage.open(yt.conn, url, { background: true });
    await yt.conn.send('browsingContext.setViewport', { context: page.context, viewport: { width: 340, height: 720 } }).catch(() => null);
    return page;
  }
  await yt.conn.send('Target.activateTarget', { targetId: yt.targetId }).catch(() => null);
  const { targetId } = await yt.conn.send('Target.createTarget', { url: 'about:blank', background: true });
  const page = await attach(yt.conn, targetId);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 340, height: 720, deviceScaleFactor: 1, mobile: false });
  await page.goto(url);
  return page;
}

// ================================================================ التشغيل
await mkdir(OUT, { recursive: true });
await mkdir(WORK, { recursive: true });
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--target', TARGET, '--out', EXT], { stdio: 'ignore' });
let backupFile = null;
try {
  s = await startBrowser(browser, { profile: `${browser}-t3-${RUN}`, ext: EXT, downloadDir: DL, headless: HEADLESS });
  result.browser = `${APPS[browser].name} ${appVersion(APPS[browser].app ?? APPS[browser].bin.slice(0, APPS[browser].bin.indexOf('.app/') + 4)) ?? '?'} (${s.version})`;
  check('install', !!s.extensionId, { extension: s.extensionId, version: s.version });

  // ---- يوتيوب: الجسر والالتقاط ----
  await step('youtube-open', async () => {
    yt = await s.youtube(WATCH);
    // يوتيوب في ملف Firefox جديد يعيد التنقل مرة إلى ‎&themeRefresh=1 بعد ثانيتين تقريبًا، بالإضافة وبدونها (ثبت بالمقارنة في
    // T3): يُنتظر استقرار العنوان والتحميل قبل أي خطوة، فلا يقع الالتقاط على صفحة ستُستبدل.
    const settled = await settlePage();
    result.notes.push(`استقرار صفحة يوتيوب: ${JSON.stringify(settled)}`);
    await dismissConsent(yt).catch(() => false);
    const player = await waitForPlayer(yt, VIDEO, 45000);
    // الإعلان قبل أي ضغطة في الشريط: يعمل مكتومًا حتى ينتهي (الإيقاف يجمّده فوق المشغّل وتقع الضغطات على رابطه).
    result.notes.push(`إعلان عند الفتح: ${JSON.stringify(await waitAdEnd())}`);
    await yt.eval(M.mute);
    const ready = await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
    if (s.kind === 'firefox') await s.learnBase(yt);
    const mounted = await waitBridge('state', (v) => v.mounted.controls === 'mounted' && v.mounted.overlay === 'mounted', { timeoutMs: 20000 });
    check('content-script-mounted', !!player && ready === true && !!mounted, { player: !!player, mounted: mounted?.mounted ?? null, base: s.base ? 'معروف' : null });
  });
  await step('bridge-wrappers', async () => {
    const w = await yt.eval(M.wrapped);
    check('bridge-main-world-wrappers', w.fetch && w.xhrOpen, w);
  });
  await step('capture', async () => {
    await yt.eval((msg) => { window.postMessage(msg, location.origin); return true; }, { args: [capture] });
    const st = await waitBridge('state', (v) => v.english?.count === CUES.length, { timeoutMs: 15000 });
    await yt.eval(MARK_PAGE);
    check('capture-via-bridge', !!st && st.captured.some((t) => t.key === 'en|manual' && t.ok), { captured: st?.captured ?? null, english: st?.english ?? null, expected: CUES.length });
  });
  await step('ui-fonts', async () => {
    const fonts = await waitBridge('fonts', (f) => f.some((x) => /Tarjuman UI/.test(x.family) && x.status === 'loaded'), { timeoutMs: 10000 });
    check('ui-fonts-loaded', !!fonts, { fonts: (fonts ?? []).filter((x) => /Tarjuman/.test(x.family)).map((x) => `${x.family}:${x.weight}:${x.status}`) });
  });

  // ---- تنزيل SRT ونسخ التعليمات من الشريط ----
  await step('srt-download', async () => {
    await ensureCapture('srt-download');
    await call('stubClipboard');
    await clickButton('download', { menu: true });
    // منذ 2.0.0 (AA3، ق٨) نسخ التعليمات في نافذة الإضافة وحدها: قائمة «تحميل الأصل» بلا بند نسخ. تُقرأ عند فتحها، لأن Edge قد
    // يغلقها بعد بدء التنزيل.
    const opened = await menu();
    const items = opened?.items.map((x) => x.fid) ?? null;
    // لغة واجهة المشغّل من عنوان القائمة نفسها («تنزيل الأصل» أو «Download original»)، فتُقرأ نصوصه بها.
    const playerLocale = localeShowing('player.controls.downloadTitle', opened?.label);
    result.uiLocale.player = playerLocale ?? `غير معروفة: ${opened?.label ?? 'لا قائمة'}`;
    const tx = uiText(playerLocale ?? 'en');
    check('player-menu-without-copy', !!items && items.includes('download') && !items.includes('copy'), { items });
    await clickItem('download');
    const file = await waitFile((n) => n.endsWith('.srt'));
    const text = file ? await readFile(file.path, 'utf8') : null;
    // سطر الحالة في القائمة بعد التنزيل (كما في P12): «نُزّل …» أو رسالة تعذّر الحفظ، بلغة المشغّل.
    const shownLine = (p) => [tx.downloaded, ...tx.saveFailed].some((s) => clean(p.layer.menu?.text).includes(clean(s)));
    const line = await waitBridge('peek', shownLine, { timeoutMs: 10000 });
    // بالعامل الخلفي وواجهة التنزيلات (المكان المختار)، لا ببديل Blob من الصفحة (SV_FALLBACK_BLOB).
    const fallback = clean(line?.layer.menu?.text).includes(clean(tx.fallbackBlob));
    check('srt-download', !!playerLocale && !!file && text === EXP.files[0].text && !fallback, { locale: playerLocale, file: file?.name ?? null, bytes: text?.length ?? null, expectedSha: sha(EXP.files[0].text), sha: text ? sha(text) : null, line: line ? (clean(line.layer.menu?.text).includes(clean(tx.downloaded)) ? 'downloaded' : 'failed') : null, fallback });
  });
  await step('copy-instructions', async () => {
    await closeMenu();
    await ensureCapture('copy-instructions');
    const st = await call('state');
    const pop = await openPopupBehindYoutube();
    try {
      await pop.waitFor(() => !!document.querySelector('#app[data-ready]') && document.fonts.status === 'loaded', { timeoutMs: 15000 });
      // «من» تُعبّأ من رد الصفحة حين يستقر، والزر فعّال حين يكتمل الزوج.
      const info = await pop.waitFor(() => {
        const btn = document.querySelector('.tj-popup__copy');
        const t = (sel) => document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
        return btn && btn.getAttribute('aria-disabled') !== 'true' ? { status: t('.tj-popup__status'), head: t('.tj-popup__pair-head'), langs: t('.tj-popup__pair .tj-lang-row') } : null;
      }, { timeoutMs: 15000 });
      // ما يكتبه المنتج إلى الحافظة: navigator.clipboard.writeText نفسها بعد الضغطة، تُستبدل لتُقرأ (الصفحة في الخلفية بلا تركيز).
      await pop.eval(() => {
        window.__t3copied = [];
        Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { window.__t3copied.push(t); } });
        return true;
      });
      const c = await stableCenter(pop, '.tj-popup__copy');
      if (!c) throw new Error('زر «نسخ التعليمات» غير ظاهر أو لم يثبت موضعه في النافذة');
      await pop.click(c.x, c.y);
      const copied = await pop.waitFor(() => window.__t3copied?.at(-1) ?? null, { timeoutMs: 6000 });
      const state = await pop.eval(() => document.querySelector('.tj-popup__copy')?.getAttribute('data-state') ?? null);
      const tx = await pageText(pop, 'popup');
      // التعليمات من الإنجليزية (لغة المسار الملتقط) إلى العربية (الافتراضي)، بلغة الواجهة (نص التعليمات بها)، بالقاموس المرفق أو بدونه.
      const accepted = [null, []].map((glossary) => sha(instructions({ videoId: VIDEO, title: st.title, source: 'en', target: 'ar', glossary, locale: tx.locale })));
      check('copy-instructions-from-popup', !!info && squash(info.head) === squash(tx.pairHead) && squash(info.langs) === squash(tx.pairLangs) && !!copied && accepted.includes(sha(copied)) && state === 'success',
        { locale: tx.locale, status: info?.status?.slice(0, 80) ?? null, head: info?.head ?? null, expectedHead: tx.pairHead, langs: info?.langs ?? null, expectedLangs: tx.pairLangs, at: c, copied: copied ? { chars: copied.length, sha: sha(copied) } : null, accepted, state, title: st.title ? 'معروف' : null });
      await shot(pop, 'popup');
    } finally {
      await pop.close().catch(() => {});
    }
  });

  // ---- رفع العربية، والعرض، والتوقيت ----
  await step('arabic-upload', async () => {
    const armed = yt.armChooser([AR_FILE]);
    await clickButton('upload');
    const filled = await armed;
    const st = await waitBridge('state', (v) => v.arabic?.count === AR.length, { timeoutMs: 20000 });
    check('arabic-upload-from-player', filled && !!st, { chooser: filled, arabic: st?.arabic ?? null, expected: AR.length });
  });
  await step('display', async () => {
    const ad = await waitAdEnd();
    const seeks = await stableSeek(CUE_AT);
    const lines = await waitBridge('overlay', (l) => clean(l.join(' ')).includes(clean(AR_TEXT).slice(0, 20)), { timeoutMs: 12000 });
    check('display-arabic-over-video', !!lines, { ad, seeks, at: CUE_AT, cue: CUE.n, shown: lines?.map(clean) ?? null });
    await shot(yt, 'youtube-display');
  });
  await step('fonts-subtitle', async () => {
    const fonts = await waitBridge('fonts', (f) => f.some((x) => /Tarjuman Subtitle/.test(x.family) && x.status === 'loaded'), { timeoutMs: 10000 });
    check('subtitle-fonts-read-from-package', !!fonts, { fonts: (fonts ?? []).filter((x) => /Subtitle/.test(x.family)).map((x) => `${x.family}:${x.weight}:${x.status}`) });
  });
  await step('timing', async () => {
    const before = (await call('state')).view.displayOffsetMs;
    // ت-١ (قرار سلطان 2026-11-13): في الشريط المطوي (fit folded) − و+ في قائمة الشارة حول القيمة لا في الشريط، فيُضغطان منها كما
    // يفعل المستخدم؛ وإلا من الشريط. ويُسجَّل المقاس والمساحة.
    const fits = [];
    const nudge = async (kind) => {
      await revealControls(yt);
      const p = await call('peek');
      fits.push({ fit: p?.fit ?? null, room: p?.room ?? null, size: p?.size ?? null });
      if (p?.buttons[kind]?.box) return clickButton(kind);
      await clickButton('badge', { menu: true });
      await clickItem(`nudge:${kind}`);
      await closeMenu();
      return undefined;
    };
    await nudge('plus');
    const plus = await waitBridge('state', (v) => v.view.displayOffsetMs > before, { timeoutMs: 6000 });
    await nudge('minus');
    const minus = await waitBridge('state', (v) => v.view.displayOffsetMs === before, { timeoutMs: 6000 });
    check('timing-plus-minus', !!plus && !!minus, { before, plus: plus?.view.displayOffsetMs ?? null, back: minus?.view.displayOffsetMs ?? null, bar: fits });
  });

  // ---- المحرّر والحفظ ----
  const MARK = ' — عدّلته في T3';
  await step('editor', async () => {
    const ed = await s.extPage(`pages/editor/index.html?v=${VIDEO}&t=1`);
    // يُغلق في كل حال: محرّر بقي مفتوحًا بتعديل غير محفوظ (سقوط قبل «حفظ») يعلّق الإزالة في Firefox بحوار المغادرة (T1-ب).
    try {
      await ed.waitFor(() => !!document.querySelector('.ed-row[data-index] [data-field="text"]'), { timeoutMs: 20000 });
      const tx = await pageText(ed, 'editor');
      await clickOn(ed, `document.querySelector('.ed-row[data-index="0"] [data-field="text"]')`, 'نص المقطع الأول');
      await ed.eval(() => { const ta = document.querySelector('.ed-row[data-index="0"] [data-field="text"]'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); return true; });
      await ed.typeText(MARK);
      await sleep(400);
      const typed = await ed.eval(() => document.querySelector('.ed-row[data-index="0"] [data-field="text"]').value);
      // الحفظ صريح في المحرّر (زر «حفظ» في الرأس، أو ⌘S).
      await clickOn(ed, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(tx.save)} && b.getClientRects().length && b.getAttribute('aria-disabled') !== 'true')`, tx.save);
      const cue = await waitBridge('cueText', (t) => typeof t === 'string' && t.endsWith(MARK), { args: [1], timeoutMs: 15000 });
      check('editor-edit-reaches-player', !!cue, { locale: tx.locale, typed: typed.endsWith(MARK), cue1: cue ? 'ينتهي بالتعديل' : null });
      await shot(ed, 'editor');
    } finally {
      await ed.close();
    }
  });
  await step('saved-restored', async () => {
    await yt.reload();
    await waitForPlayer(yt, VIDEO, 45000);
    await waitAdEnd();
    await yt.eval(M.mute).catch(() => false);
    await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
    const st = await waitBridge('state', (v) => v.arabic?.count === AR.length, { timeoutMs: 20000 });
    const cue = st ? await call('cueText', [1]) : null;
    check('saved-and-restored-after-reload', !!st && typeof cue === 'string' && cue.endsWith(MARK), { arabic: st?.arabic ?? null });
  });

  // ---- النسخة الاحتياطية والإبلاغ ----
  let st = null;
  await step('backup', async () => {
    st = await s.extPage('pages/settings/index.html#data');
    await st.waitFor(() => !!document.querySelector('#data') && !document.querySelector('#data').hidden, { timeoutMs: 15000 });
    const before = new Set(await listDl());
    const tx = await pageText(st, 'settings');
    await clickOn(st, byText('#data button', tx.backup), tx.backup);
    const file = await waitFile((n) => /^tarjuman-backup-.*\.json$/.test(n), { except: before });
    let parsed = null;
    if (file) {
      backupFile = file.path;
      parsed = JSON.parse(await readFile(file.path, 'utf8'));
    }
    check('backup-created', parsed?.format === 'tarjuman-backup' && JSON.stringify(parsed?.data ?? {}).includes(VIDEO), { file: file?.name ?? null, counts: parsed?.counts ?? null });
  });
  await step('report', async () => {
    if (!st) st = await s.extPage('pages/settings/index.html#about');
    await st.eval(() => { location.hash = 'about'; return true; });
    await st.waitFor(() => { const a = document.getElementById('about'); return a && !a.hidden; }, { timeoutMs: 8000 });
    const tx = await pageText(st, 'settings');
    await clickOn(st, byText('#about button', tx.report), tx.report);
    await st.waitFor(() => !document.getElementById('st-report')?.hidden && !!document.querySelector('[data-report-field="diagnostics.build_target"]'), { timeoutMs: 15000 });
    await clickOn(st, `document.getElementById('st-report-text')`, 'وصف البلاغ');
    await st.typeText('بلاغ آلي من T3 — لا يُرسل');
    const rows = await st.eval(() => Object.fromEntries([...document.querySelectorAll('[data-report-field]')].map((r) => [r.getAttribute('data-report-field'), r.querySelector('dd')?.textContent.trim()])));
    const json = await st.eval(() => document.querySelector('.st-report__json')?.textContent ?? '');
    const payload = (() => { try { return JSON.parse(json); } catch { return null; } })();
    check('report-preview', rows['diagnostics.build_target'] === TARGET && String(rows['diagnostics.browser · browser_version'] ?? '').startsWith(BRAND) && !!rows.test && payload?.test === true && payload?.product === 'tarjuman',
      { rows, payloadKeys: payload ? Object.keys(payload) : null });
    await st.eval(() => {
      window.__t3copied = [];
      Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { window.__t3copied.push(t); } });
      return true;
    });
    let copied = null;
    for (let attempt = 0; attempt < 2 && !copied; attempt++) {
      await clickOn(st, byText('#st-report button', tx.copyReport), tx.copyReport);
      copied = await st.waitFor(() => window.__t3copied?.at(-1) ?? null, { timeoutMs: 5000 });
    }
    const result1 = await st.eval(() => document.querySelector('.st-report__result')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
    check('report-copy-offline', copied === json && !!json, { same: copied === json, copiedLength: copied?.length ?? null, jsonLength: json.length, result: result1 });
    // بلا خادم منذ و1 (2.2.0): لا زر إرسال، و«نسخ البريد» ينسخ بريد الدعم، ولا طلب إلى مضيف البلاغات القديم.
    await s.blockReports(st);
    // لا زر إرسال بأي من اللغتين («إرسال البلاغ» قبل 2.2.0، ولا مفتاح له في الفهرس الآن).
    const noSend = await st.eval(() => ![...document.querySelectorAll('#st-report button')].some((x) => /إرسال|\bsend\b/i.test(x.textContent)));
    await clickOn(st, byText('#st-report button', tx.copyEmail), tx.copyEmail);
    const email = await st.waitFor(() => (window.__t3copied?.length ?? 0) >= 2 ? window.__t3copied.at(-1) : null, { timeoutMs: 5000 });
    await sleep(1500);
    check('report-no-send', noSend && /@/.test(email ?? '') && s.reportsBlocked.count === 0, { noSend, email: !!email, blockedRequests: s.reportsBlocked.count });
    await shot(st, 'settings-report');
  });

  // ---- Firefox: إذن يوتيوب المشتق من سكربتات المحتوى، سحبًا ثم منحًا ----
  if (browser === 'firefox') {
    await step('youtube-permission', async () => {
      const YT = ['https://www.youtube.com/*'];
      const removed = await st.eval((o) => chrome.permissions.remove({ origins: o }), { args: [YT] });
      const has1 = await st.eval((o) => chrome.permissions.contains({ origins: o }), { args: [YT] });
      await yt.reload();
      await sleep(4000);
      const off = await bridge(yt, 'ping', [], 3000);
      // Firefox يقبل permissions.request داخل معالج فعل مستخدم وحده: زر مؤقت في الصفحة يُضغط ضغطة حقيقية.
      await st.eval((o) => {
        const b = document.createElement('button');
        b.id = 't3-grant';
        b.textContent = 'منح';
        b.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99999;padding:8px';
        b.addEventListener('click', () => { chrome.permissions.request({ origins: o }).then((g) => { window.__t3grant = g; }, (e) => { window.__t3grant = String(e?.message ?? e); }); });
        document.body.append(b);
        return true;
      }, { args: [YT] });
      const c = await st.centerOf('#t3-grant', { scroll: false });
      await st.click(c.x, c.y);
      const granted = await st.waitFor(() => (window.__t3grant === undefined ? null : { v: window.__t3grant }), { timeoutMs: 10000 });
      await st.eval(() => { document.getElementById('t3-grant')?.remove(); return true; });
      await yt.reload();
      await waitForPlayer(yt, VIDEO, 45000);
      await waitAdEnd();
      await yt.eval(M.mute).catch(() => false);
      const on = await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
      check('youtube-permission-revoke-grant', removed === true && has1 === false && !off.ok && granted?.v === true && on === true,
        { removed, containsAfterRemove: has1, contentScriptWhileRevoked: off.ok, granted: granted?.v ?? null, contentScriptAfterGrant: on });
    });
  }

  // ---- الإزالة ومحو البيانات، ثم إعادة التثبيت والاستعادة ----
  await step('uninstall-wipe', async () => {
    const dirs = await s.storageDirs();
    const before = await Promise.all(dirs.map(async (d) => ({ dir: path.basename(d), bytes: await dirSize(d) })));
    if (st) await st.close().catch(() => {});
    st = null;
    // كل صفحة إضافة بقيت مفتوحة تُغلق قبل الإزالة بلا حوار مغادرة (T1-ب: تعلّقت webExtension.uninstall في Firefox حين بقي المحرّر
    // مفتوحًا بتعديل غير محفوظ بعد سقوط خطوته).
    const closedPages = await s.closeExtPages().catch((err) => ({ error: err.message.slice(0, 120) }));
    const startedAt = Date.now();
    const r = await s.uninstall();
    const uninstallMs = Date.now() - startedAt;
    await sleep(3000);
    const after = await Promise.all(dirs.map(async (d) => ({ dir: path.basename(d), bytes: await dirSize(d) })));
    check('uninstall-removes-storage', !r.error && before.length > 0 && before.every((x) => x.bytes > 0) && after.every((x) => x.bytes === null), { uninstall: r, uninstallMs, closedPages, before, after });
  });
  await step('reinstall-empty-restore', async () => {
    await s.install();
    if (s.kind === 'firefox') {
      await yt.reload();
      await yt.eval(M.mute).catch(() => false);
      await waitBridge('ping', (v) => v === true, { timeoutMs: 20000 });
      await s.learnBase(yt);
    }
    const page = await s.extPage('pages/settings/index.html#data');
    await page.waitFor(() => !!document.querySelector('#data') && !document.querySelector('#data').hidden, { timeoutMs: 15000 });
    const tx = await pageText(page, 'settings-after-reinstall');
    const keys = await page.eval(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => /^(?:video|bundle):/.test(k)).length);
    check('reinstall-starts-empty', keys === 0, { videoKeys: keys });
    if (!backupFile) {
      check('backup-restore', null, { note: 'لا نسخة احتياطية من الخطوة السابقة' });
      return;
    }
    let filled;
    if (s.kind === 'firefox') {
      // منتقي الاستعادة حقل يُنشأ ويُضغط دون إلحاقه بالمستند، وفي صفحات الإضافة (نطاق مميّز) لا يرسل BiDi له
      // input.fileDialogOpened ولا يقبل input.setFiles: يُحفظ الحقل عند ضغطه، ويُعطى الملف نفسه بـDataTransfer في عالم الصفحة
      // ثم change كما يفعل المنتقي. ما بعده (القراءة والتحقق والحوار والكتابة) مسار الاستعادة كما هو.
      await page.eval(() => {
        const orig = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function click() { if (this.type === 'file') { window.__t3file = this; return undefined; } return orig.call(this); };
        return true;
      });
      await clickOn(page, byText('#data button', tx.restore), tx.restore);
      filled = Boolean(await page.waitFor(() => !!window.__t3file, { timeoutMs: 5000 }));
      if (filled) {
        filled = await page.eval((name, text) => {
          const dt = new DataTransfer();
          dt.items.add(new File([text], name, { type: 'application/json' }));
          window.__t3file.files = dt.files;
          window.__t3file.dispatchEvent(new Event('change'));
          return window.__t3file.files.length === 1;
        }, { args: [path.basename(backupFile), await readFile(backupFile, 'utf8')] });
      }
      result.notes.push('الاستعادة في Firefox: الملف يُعطى للحقل بـDataTransfer في الصفحة (BiDi لا يملأ المنتقي في صفحات الإضافة)');
    } else {
      const armed = page.armChooser([backupFile]);
      await clickOn(page, byText('#data button', tx.restore), tx.restore);
      filled = await armed;
    }
    const dialog = await page.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .st-restore'), { timeoutMs: 30000 });
    if (!dialog) throw new Error(`لم يظهر حوار الاستعادة (المنتقي ${filled ? 'مُلئ' : 'لم يُملأ'})`);
    await clickOn(page, `[...document.querySelectorAll('dialog.tj-dialog[open]')].at(-1)?.querySelector('button[value="confirm"]')`, 'تأكيد الاستعادة');
    const report = await page.waitFor((done) => [...document.querySelectorAll('#data .tj-alert')].find((e) => e.textContent.includes(done))?.textContent.replace(/\s+/g, ' ').trim() ?? null, { args: [tx.restoreDone], timeoutMs: 30000, intervalMs: 200 });
    const restored = await page.eval(async (id) => !!(await chrome.storage.local.get(`video:${id}`))[`video:${id}`], { args: [VIDEO] });
    check('backup-restore-after-reinstall', filled && !!report && restored, { chooser: filled, report: clean(report).slice(0, 120), restored });
    await shot(page, 'settings-restore');
  });
} catch (err) {
  check('run', false, { error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
} finally {
  if (s) {
    result.notes.push(...(s.notes ?? []).map((n) => `السائق: ${n}`));
    result.errors = s.errors();
    const n = result.errors.reduce((a, e) => a + e.errors.length, 0);
    check('no-extension-errors', n === 0, n ? result.errors.filter((e) => e.errors.length) : null);
    await s.close().catch(() => {});
  }
  const counted = result.checks.filter((c) => c.ok !== null);
  const failed = counted.filter((c) => !c.ok).map((c) => c.id);
  result.summary = { passed: counted.length - failed.length, total: counted.length, failed, untested: result.checks.filter((c) => c.ok === null).map((c) => c.id) };
  await writeFile(path.join(OUT, 't3.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n${result.browser}: ${result.summary.passed}/${result.summary.total}${failed.length ? ` — سقط: ${failed.join('، ')}` : ''}${result.summary.untested.length ? ` · لم يُختبر: ${result.summary.untested.join('، ')}` : ''}`);
  // سقوط أي فحص يُسقط الجولة (Fable ع-٤: كانت تخرج بالرمز 0 مع خمسة ساقطة). وما لم يُختبر (null) لا يُحسب.
  if (failed.length) process.exitCode = 1;
}
