#!/usr/bin/env node
// قياس نافذة الإضافة في أطول حالاتها (ح-60 وص-٥، ST1): حد المتصفح للنافذة المنبثقة 600 بعرضها 340، والشرط ألا تحتاج تمريرًا ولا
// تصغير خط في أطول حالاتها بالعربية والإنجليزية. يبني حزمة الهدف (chromium أو firefox) ويقدّم ملفاتها من خادم محلي على 127.0.0.1،
// وصفحة النافذة نفسها بلا تغيير إلا سكربتًا قبل main.js يضع واجهة chrome وهمية: تبويب يوتيوب نشط يرد برد الفيديو للحالة المختارة،
// وتخزين في الذاكرة بلغة الواجهة وتفضيلاتها وسجلات الفيديو. فالمقيس الحزمة نفسها (HTML وCSS والخطوط والشيفرة) بمحرّك كل متصفح،
// بلا يوتيوب ولا تحكم بحالته. ثم إجراءات المستخدم في الحالة (النسخ، وفتح «الخطوات» و«كيف؟»، واللصق) بنقرات في الصفحة.
// يكتب لكل حالة ولغة: ارتفاع المحتوى، وهل يحتاج تمريرًا، وأول عنصر يُقطع، وعرض الصفحة، وما يخرج عن حد بطاقته أفقيًا، ولقطة 340×600.
//   command node test/live/stores/popup-fit.mjs --browser brave|chrome|edge|firefox [--out test-results/live/popup-fit/<browser>]
//     [--cases usual,translated] [--locales ar,en]
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, Page, launch, sleep } from '../harness/browser.mjs';
import { BidiPage, FIREFOX, launchFirefox, testPrefs } from '../harness/bidi.mjs';
import { build as seedVideo, buildSeedFew, storageItems as items } from '../ui/seed.mjs';
import { realTrack } from '../../helpers/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'chrome');
const APPS = { ...BROWSERS, firefox: FIREFOX };
if (!APPS[browser]) throw new Error(`متصفح غير معروف: ${browser}`);
const TARGET = browser === 'firefox' ? 'firefox' : 'chromium';
const OUT = path.resolve(ROOT, val('out', `test-results/live/popup-fit/${browser}`));
const LOCALES = val('locales', 'ar,en').split(',');
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 'popup-fit-work', `${browser}-${RUN}`);
const EXT = path.join(WORK, 'ext');
const WIDTH = 340;
const LIMIT = 600;

// ---- الحالات: رد الصفحة والتخزين وإجراءات المستخدم ----
const TED = 'iG9CE55wbtY';
const LONG_TITLE = {
  ar: 'محاضرة كاملة عن تصميم الواجهات التي تحترم القارئ العربي: من الشبكة الطباعية إلى اتجاه النص والمسافات والأيقونات',
  en: 'How Browsers Render Arabic Text — a deep dive into shaping, bidi, fallback fonts and why your UI breaks at 2am',
};
const now = Date.now();
const manual = realTrack('manual');
/** سجل الفيديو بلا ترجمة بعد تنزيل أصله (الخطوة الأولى منجزة، و«الأصل محفوظ»). */
const downloaded = seedVideo({ videoId: TED, title: null, kind: 'manual', cues: manual.cues, durationMs: manual.fixture.durationMs, arabic: 'none', agoMs: 60000, now });
/** سجل بترجمة معدّلة ناقصة ثلاثة مقاطع («أكمل الناقص (3)» و«3 مقاطع ناقصة»). */
const missing = seedVideo({ videoId: TED, title: null, kind: 'manual', cues: manual.cues, durationMs: manual.fixture.durationMs, arabic: 'missing', edited: true, agoMs: 60000, now });
const slots = [1, 2, 3].map((n) => ({ n, filled: n === 1, active: n === 1, name: null }));

function reply(over = {}) {
  return {
    v: 1, ok: true, watch: true, videoId: TED, title: 'Do schools kill creativity? | Sir Ken Robinson | TED', loading: false, arabic: null,
    english: { captured: [{ key: 'en|manual', kind: 'manual', cueCount: 427, ok: true }], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 427 }] },
    view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' },
    slots: slots.map((x) => ({ ...x, filled: false, active: false })), capture: { state: 'captured', count: 1 }, tools: { overlay: 'mounted', controls: 'mounted', code: null },
    source: { key: 'en|manual', lang: 'en', kind: 'manual', via: null, from: 'captured' },
    available: [{ lang: 'en', kind: 'manual', name: null }, { lang: 'ar', kind: 'manual', name: null }, { lang: 'fr', kind: 'manual', name: null }],
    ...over,
  };
}

/**
 * الحالات. «الشرط» (limit: true) ما تبلغه النافذة على صفحة فيديو بلا ترجمة دون أن يفتح المستخدم شيئًا مطويًا، وهي أطول حالاتها
 * المعتادة (ح-60): usual حالة جولة T3 (الأصل ملتقط ومنزّل، ولا ترجمة)، وlong ملف طويل تلقائي غير محفوظ، وmachine مسار مترجم آليًا عن
 * لغة ثالثة، وroundTrip الفيديو المترجم إلى لغته (ح-58)، كلٌّ هادئًا وبعد النسخ؛ وبعد لصق قُبل أو رُفض بأطول رسائله («busy»)، وتعذّر
 * النسخ بتنبيهه، وليست صفحة فيديو بآخر الترجمات. وفتح «كيف؟» (شرح اللصق، ص-٥) في الحالة المعتادة من الشرط كذلك.
 * والباقي يُقاس ويُسجَّل ولا يحكم: ما يفتحه المستخدم (steps «الخطوات» وحدها نحو 170 بكسلًا، وroundTripOpen «اختر مساره الأصلي»)،
 * وفيديو بترجمة (translated، وبصف «زر النص المتزامن مخفي»)، وتعذّر الأدوات ورفض الالتقاط (trouble).
 * الإجراءات: copy نجاح النسخ (والشرح تحت الزر يصير «ألصقها…»)، وcopyFail تعذّره، وdetails فتح «كيف؟»، وpaste لصقٌ يقبله المشغّل أو
 * يرفضه (paste في الحالة).
 */
const LONG = { english: { captured: [{ key: 'en|asr', kind: 'asr', cueCount: 1066, ok: true }], saved: [] }, source: { key: 'en|asr', lang: 'en', kind: 'asr', via: null, from: 'captured' } };
const MACHINE = { english: { captured: [{ key: 'en|asr|ja', kind: 'asr', cueCount: 812, ok: true }], saved: [] }, source: { key: 'en|asr|ja', lang: 'en', kind: 'asr', via: 'ja', from: 'captured' } };
const ROUND = (l) => ({ title: LONG_TITLE[l], english: { captured: [{ key: 'en|asr|ar', kind: 'asr', cueCount: 1066, ok: true }], saved: [] }, source: { key: 'en|asr|ar', lang: 'en', kind: 'asr', via: 'ar', from: 'captured' } });
const TRANSLATED = (l) => ({
  title: LONG_TITLE[l], arabic: { fileName: `${TED}.ar.srt`, cueCount: 424, edited: true, matched: false, lang: 'ar' },
  view: { displayOffsetMs: -1500, displayMode: 'dual' }, slots,
});
const TROUBLE = (l) => ({
  title: LONG_TITLE[l], english: { captured: [], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 427 }] },
  source: { key: 'en|manual', lang: 'en', kind: 'manual', via: null, from: 'saved' },
  capture: { state: 'rejected', count: 0, code: 'EX_UNSUPPORTED_FORMAT', format: 'srv3' },
  mounted: { overlay: 'error', controls: 'mounted' }, tools: { overlay: 'error', controls: 'mounted', code: 'PL_PLAYER_NOT_FOUND' },
});
const saved = () => items([downloaded]);
const hiddenEntry = (list) => () => ({ ...items(list), prefs: { ui: { panelEntry: false } } });
const CASES = {
  usual: { limit: true, reply: () => reply(), storage: saved },
  'usual-copied': { limit: true, reply: () => reply(), storage: saved, actions: ['copy'] },
  'usual-details': { limit: true, reply: () => reply(), storage: saved, actions: ['details'] },
  'usual-pasted': { limit: true, reply: () => reply(), storage: saved, paste: 'ok', actions: ['paste'] },
  'usual-paste-error': { limit: true, reply: () => reply(), storage: saved, paste: 'busy', actions: ['paste'] },
  'usual-copy-failed': { limit: true, reply: () => reply(), storage: saved, actions: ['copyFail'] },
  long: { limit: true, reply: () => reply(LONG), storage: () => ({}) },
  'long-copied': { limit: true, reply: () => reply(LONG), storage: () => ({}), actions: ['copy'] },
  machine: { limit: true, reply: () => reply(MACHINE), storage: () => ({}) },
  'machine-copied': { limit: true, reply: () => reply(MACHINE), storage: () => ({}), actions: ['copy'] },
  roundTrip: { limit: true, reply: (l) => reply(ROUND(l)), storage: () => ({}) },
  'roundTrip-copied': { limit: true, reply: (l) => reply(ROUND(l)), storage: () => ({}), actions: ['copy'] },
  notVideo: { limit: true, reply: () => null, tab: 'https://example.com/', storage: () => items(buildSeedFew(now).items) },
  // يُقاس ولا يحكم:
  'usual-steps': { reply: () => reply(), storage: saved, actions: ['steps'] },
  'usual-all': { reply: () => reply(), storage: saved, actions: ['steps', 'details', 'copy'] },
  'machine-details': { reply: () => reply(MACHINE), storage: () => ({}), actions: ['details', 'copy'] },
  'roundTrip-open': { reply: (l) => reply(ROUND(l)), storage: () => ({}), actions: ['roundTripOpen', 'details', 'copy'] },
  translated: { reply: (l) => reply(TRANSLATED(l)), storage: () => items([missing]), actions: ['copy'] },
  'translated-entry': { reply: (l) => reply(TRANSLATED(l)), storage: hiddenEntry([missing]), actions: ['copy'] },
  trouble: { reply: (l) => reply(TROUBLE(l)), storage: hiddenEntry([downloaded]), actions: ['copy'] },
};
const CASE_IDS = val('cases', Object.keys(CASES).join(',')).split(',');
for (const id of CASE_IDS) if (!CASES[id]) throw new Error(`حالة غير معروفة: ${id}`);

function caseData(id, locale) {
  const c = CASES[id];
  return {
    id, locale,
    reply: c.reply(locale),
    tab: c.tab ?? `https://www.youtube.com/watch?v=${TED}`,
    paste: c.paste ?? 'busy',
    storage: {
      meta: { schema: 1 },
      uiLocale: { schema: 1, locale, source: 'user', at: new Date(now).toISOString() },
      ...c.storage(locale),
    },
  };
}

/** يُحقن قبل main.js: واجهة chrome وهمية بالحالة في window.__FIT، وحافظة تنجح (أو ترفض حين يطلب الإجراء). لا شبكة. */
function stub() {
  const F = window.__FIT;
  const data = JSON.parse(JSON.stringify(F.storage));
  const pick = (k) => {
    if (k == null) return JSON.parse(JSON.stringify(data));
    const keys = typeof k === 'string' ? [k] : Array.isArray(k) ? k : Object.keys(k);
    const out = {};
    for (const x of keys) if (Object.hasOwn(data, x)) out[x] = JSON.parse(JSON.stringify(data[x]));
    return out;
  };
  const event = () => ({ addListener() {}, removeListener() {}, hasListener: () => false });
  const api = {
    runtime: {
      id: 'tarjuman-fit', onMessage: event(),
      getManifest: () => ({ manifest_version: 3, version: '0.0.0' }),
      getURL: (p) => `${location.origin}/${p}`,
      sendMessage: async () => ({ v: 1, ok: false, code: 'ST_WRITE_FAILED' }),
    },
    i18n: { getUILanguage: () => F.locale },
    storage: { local: { get: async (k) => pick(k), set: async () => {}, remove: async () => {}, getKeys: async () => Object.keys(data), getBytesInUse: async () => 0, QUOTA_BYTES: 10485760 }, onChanged: event() },
    tabs: {
      query: async () => [{ id: 7, url: F.tab }],
      sendMessage: async (id, msg) => {
        if (msg?.type === 'tj:get-video-state') return F.reply;
        if (msg?.type === 'tj:paste-import') return F.paste === 'ok' ? { v: 1, ok: true } : { v: 1, ok: false, code: F.paste };
        return undefined;
      },
      create: async () => ({ id: 8 }),
    },
    permissions: { contains: async () => true },
  };
  Object.defineProperty(window, 'chrome', { value: api, configurable: true, writable: true });
  window.__fitClipboard = 'ok';
  Object.defineProperty(navigator.clipboard, 'writeText', {
    configurable: true,
    value: async (text) => {
      const pending = await text;
      if (window.__fitClipboard !== 'ok') throw new Error('NotAllowedError');
      window.__fitCopied = String(pending).length;
    },
  });
}

// ---- الخادم ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.svg': 'image/svg+xml', '.png': 'image/png' };
function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/__fit/stub.js') {
        const body = `window.__FIT = ${JSON.stringify(caseData(url.searchParams.get('case'), url.searchParams.get('locale')))};\n(${stub.toString()})();\n`;
        res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' });
        res.end(body);
        return;
      }
      const file = path.join(EXT, path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, ''));
      if (!file.startsWith(EXT)) throw new Error('خارج الحزمة');
      let body = await readFile(file);
      if (url.pathname === '/pages/popup/index.html') {
        const html = body.toString('utf8');
        const tag = '<script src="main.js"></script>';
        if (!html.includes(tag)) throw new Error('لا main.js في صفحة النافذة');
        body = Buffer.from(html.replace(tag, `<script src="/__fit/stub.js${url.search}"></script>\n  ${tag}`));
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---- في الصفحة ----
/** ينتظر الخطوط وثبات الارتفاع (ثلاث قراءات متتالية متساوية). */
async function settle() {
  const app = document.getElementById('app');
  const end = Date.now() + 8000;
  while (!app?.hasAttribute('data-ready') && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  app.getBoundingClientRect();
  await document.fonts.ready;
  let last = -1;
  let same = 0;
  while (same < 3 && Date.now() < end) {
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    const h = Math.ceil(app.getBoundingClientRect().height);
    if (h === last) same += 1;
    else {
      same = 0;
      last = h;
    }
  }
  return { ready: app.hasAttribute('data-ready'), fonts: document.fonts.status, height: last };
}

/** إجراء مستخدم في النافذة. يعيد ما حدث (أو سبب تعذّره). */
async function act(name) {
  const q = (s) => document.querySelector(s);
  const click = (el) => {
    if (!el) return false;
    el.click();
    return true;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (name === 'copy' || name === 'copyFail') {
    window.__fitClipboard = name === 'copy' ? 'ok' : 'deny';
    const b = q('.tj-popup__copy');
    if (!b || b.getAttribute('aria-disabled') === 'true') return 'زر النسخ معطّل';
    b.click();
    for (let i = 0; i < 40 && b.getAttribute('data-state') === 'idle'; i++) await wait(50);
    return b.getAttribute('data-state');
  }
  if (name === 'steps') return click(q('[data-action="steps"]')) ? 'opened' : 'لا زر';
  if (name === 'roundTripOpen') return click(q('[data-action="round-trip"]')) ? 'opened' : 'لا زر';
  if (name === 'details') {
    const all = [...document.querySelectorAll('[data-action="paste-how"][aria-expanded="false"]')];
    for (const b of all) b.click();
    return all.length ? `opened ${all.length}` : 'لا شيء مطوي';
  }
  if (name === 'paste') {
    const ta = q('#tj-paste');
    if (!ta || ta.closest('[hidden]')) return 'لا حقل';
    const dt = new DataTransfer();
    dt.setData('text/plain', '1\n00:00:01,000 --> 00:00:02,000\nمرحبًا\n');
    // Firefox يتجاهل clipboardData في منشئ ClipboardEvent المصنوع (فيقرأ المنتج نصًا فارغًا ويقول «لا نص»)، فيُعرَّف على الحدث نفسه.
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    if (ev.clipboardData?.getData('text/plain') !== dt.getData('text/plain')) Object.defineProperty(ev, 'clipboardData', { value: dt });
    ta.dispatchEvent(ev);
    for (let i = 0; i < 40 && !q('#tj-paste-status')?.textContent; i++) await wait(50);
    const shown = q('#tj-paste-status')?.textContent ?? '';
    return shown ? `«${shown.slice(0, 40)}…»` : 'لا نتيجة';
  }
  return `إجراء غير معروف: ${name}`;
}

/** القياس: ارتفاع المحتوى الطبيعي وهل يتجاوز المتاح، وأول ما يُقطع منه، وعرض الصفحة، والنصوص الظاهرة الثلاثة (ص-٥). */
function measure(limit) {
  const app = document.getElementById('app');
  const se = document.scrollingElement;
  const height = Math.ceil(app.getBoundingClientRect().height);
  const cut = [...document.querySelectorAll('h2, label, button, textarea, p, li')].find((e) => e.getClientRects().length && e.getBoundingClientRect().bottom > limit && !e.closest('.tj-popup__nav'));
  const shown = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const hiddenUp = (() => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) if (n.hidden || n.classList.contains('tj-sr-only')) return true; return false; })();
    return { visible: !hiddenUp && r.width > 1 && r.height > 1, h: Math.round(r.height), text: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) };
  };
  // ما يخرج عن حد بطاقته أفقيًا (زرا «أكمل الناقص» و«تحرير الترجمة» بالإنجليزية كانا يخرجان، ST1): نصه وكم بكسلًا.
  const spill = [...document.querySelectorAll('.tj-popup__card')].flatMap((card) => {
    const c = card.getBoundingClientRect();
    return [...card.querySelectorAll('button, a, p, h2, li, span')].filter((e) => e.getClientRects().length).map((e) => {
      const r = e.getBoundingClientRect();
      return { text: (e.textContent || e.getAttribute('aria-label') || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 40), over: Math.ceil(Math.max(r.right - c.right, c.left - r.left)) };
    }).filter((x) => x.over > 0);
  }).slice(0, 6);
  const fontSizes = [...new Set([...document.querySelectorAll('#app *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => getComputedStyle(e).fontSize))].sort();
  return {
    height, limit, fits: height <= limit, scrolls: se.scrollHeight > se.clientHeight + 1,
    width: Math.ceil(document.documentElement.scrollWidth), bodyWidth: Math.round(document.body.getBoundingClientRect().width),
    spill,
    firstCut: cut ? (cut.textContent || cut.getAttribute('aria-label') || cut.tagName).replace(/\s+/g, ' ').trim().slice(0, 60) : null,
    lang: document.documentElement.lang, dir: document.documentElement.dir,
    sourceNote: shown('#tj-pair-source'), copyCaption: shown('#tj-pair-caption'), pasteHint: shown('#tj-paste-hint'),
    fontSizes,
    // ارتفاع كل قسم في عمود النافذة وأبنائه المباشرين (للمقارنة بين النسختين).
    parts: [...(document.querySelector('.tj-popup__main')?.children ?? [])].filter((e) => e.getClientRects().length && getComputedStyle(e).position !== 'absolute').map((e) => {
      const name = (n) => String(n.className || n.tagName).split(' ').find((k) => k.startsWith('tj-')) ?? n.tagName;
      return [name(e), Math.round(e.getBoundingClientRect().height), [...e.children].filter((k) => k.getClientRects().length && getComputedStyle(k).position !== 'absolute').map((k) => `${name(k)}:${Math.round(k.getBoundingClientRect().height)}`).join(' ')];
    }),
  };
}

// ---- المتصفح ----
async function openBrowser() {
  if (browser === 'firefox') {
    const ff = await launchFirefox({ profile: `popup-fit-${browser}-${RUN}`, headless: true, prefs: testPrefs({ downloadDir: path.join(WORK, 'downloads'), extensionId: 'popup-fit@tarjuman.invalid', uuid: randomUUID() }) });
    const page = await BidiPage.open(ff.conn);
    await ff.conn.send('browsingContext.setViewport', { context: page.context, viewport: { width: WIDTH, height: LIMIT } });
    const setHeight = (h) => ff.conn.send('browsingContext.setViewport', { context: page.context, viewport: { width: WIDTH, height: h } });
    return { version: ff.version.product, page, setHeight, close: () => ff.close() };
  }
  const b = await launch({ browser, profile: `popup-fit-${browser}-${RUN}`, headless: true });
  const page = await Page.open(b.conn);
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: LIMIT, deviceScaleFactor: 1, mobile: false });
  const setHeight = (h) => page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: h, deviceScaleFactor: 1, mobile: false });
  return { version: b.version.product, page, setHeight, close: () => b.close() };
}

await mkdir(OUT, { recursive: true });
await mkdir(WORK, { recursive: true });
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--target', TARGET, '--out', EXT], { stdio: 'ignore' });
const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const result = { browser, target: TARGET, at: new Date().toISOString(), version: null, width: WIDTH, limit: LIMIT, cases: [], notes: [] };
let session = null;
let worst = null;
try {
  session = await openBrowser();
  result.version = `${APPS[browser].name} (${session.version})`;
  for (const locale of LOCALES) {
    for (const id of CASE_IDS) {
      const { page } = session;
      await page.goto(`${origin}/pages/popup/index.html?case=${encodeURIComponent(id)}&locale=${locale}`);
      const before = await page.eval(settle);
      const actions = [];
      for (const a of CASES[id].actions ?? []) {
        actions.push(`${a}: ${await page.eval(act, { args: [a] })}`);
        await page.eval(settle);
      }
      const m = await page.eval(measure, { args: [LIMIT] });
      const file = path.join(OUT, `${id}-${locale}.png`);
      await page.eval(() => { window.scrollTo(0, 0); return true; });
      await sleep(100);
      await page.screenshot(file).catch((err) => result.notes.push(`لقطة ${id}-${locale}: ${err.message.slice(0, 80)}`));
      // لقطة المحتوى كله حين يتجاوز الحد، ثم يعود العرض 340×600.
      let full = null;
      if (m.height > LIMIT) {
        full = path.join(OUT, `${id}-${locale}-full.png`);
        await session.setHeight(m.height);
        await sleep(150);
        await page.screenshot(full).catch(() => { full = null; });
        await session.setHeight(LIMIT);
      }
      const row = { id, locale, ready: before.ready, fonts: before.fonts, actions, ...m, constrained: !!CASES[id].limit, shot: path.relative(ROOT, file), full: full ? path.relative(ROOT, full) : null };
      result.cases.push(row);
      if (row.constrained && (!worst || row.height > worst.height)) worst = row;
      const ok = row.fits && !row.scrolls && row.width <= WIDTH && !row.spill.length;
      console.log(`${ok ? '✓' : row.constrained ? '✗' : '·'} ${row.constrained ? '' : '[يُسجَّل] '}${id} ${locale}: ${row.height}/${LIMIT}${row.scrolls ? ' تمرير' : ''}${row.firstCut ? ` — يُقطع: ${row.firstCut}` : ''}${row.spill.length ? ` — يخرج عن البطاقة: ${row.spill.map((x) => `«${x.text}» ${x.over}px`).join('، ')}` : ''} · عرض ${row.width} · ${actions.join('، ')}`);
    }
  }
} catch (err) {
  result.notes.push(`تعذّر: ${String(err?.message ?? err).slice(0, 300)}`);
  console.error(err);
  process.exitCode = 1;
} finally {
  await session?.close().catch(() => {});
  server.close();
  // الشرط يحكم وحده؛ وما يُسجَّل يُطبع بأرقامه.
  const bad = (c) => !c.fits || c.scrolls || c.width > WIDTH || c.spill.length > 0;
  const limited = result.cases.filter((c) => c.constrained);
  const over = limited.filter(bad);
  const reported = result.cases.filter((c) => !c.constrained && bad(c));
  const tag = (c) => `${c.id}-${c.locale}:${c.height}${c.spill.length ? ` يخرج ${Math.max(...c.spill.map((x) => x.over))}px` : ''}`;
  result.summary = {
    limited: limited.length, over: over.map(tag), worst: worst ? { id: worst.id, locale: worst.locale, height: worst.height } : null,
    reportedOver: reported.map(tag),
  };
  await writeFile(path.join(OUT, 'popup-fit.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n${result.version ?? browser}: الشرط ${limited.length - over.length}/${limited.length} بلا تمرير؛ الأطول ${worst ? `${worst.id} ${worst.locale} ${worst.height}` : '—'}${over.length ? ` — تتجاوز: ${result.summary.over.join('، ')}` : ''}`);
  if (reported.length) console.log(`يُسجَّل ولا يحكم (فوق ${LIMIT} أو يخرج عن بطاقته): ${result.summary.reportedOver.join('، ')}`);
  if (over.length || !limited.length) process.exitCode = 1;
}
