#!/usr/bin/env node
// **مستبدَل — لا يُشغَّل على المنتج الحالي** (تدقيق Fable، FA-06): كُتب للهوية «بُنّ على ورق» قبل الهوية الثالثة (2026-11-04)، فينتظر
// .tj-mark و.tj-popup__gear واللون #D6B38F وغيرها مما لم يعد في src. تغطيته الآن في test/live/identity/run.mjs (الهوية الثالثة
// وصور المحفوظات ومفاتيحها) وtest/live/stores/t3.mjs. أدلته التاريخية في docs/evidence/UI-polish.
// الاختبار الحي لجولة صقل الواجهات (2026-11-02) على الإضافة المبنية، في ملف تعريف اختبار جديد، بلا نافذة ومكتوم الصوت،
// وحساب غير مسجَّل. يغطي البنود العشرة بأدلة: الخط المرسوم فعلًا (CSS.getPlatformFontsForNode) في أدوات المشغّل وصفحات
// الإضافة، والشعار المعتمد في الشريط العلوي والنافذة، ومحدد الترجمات بترجمة واحدة ثم اثنتين ثم ثلاث ثم الحذف والتبديل عبر
// المشغّل والمحفوظات معًا، والتنزيل والنسخ كلٌّ على حدة، ومدخلًا واحدًا لكل وجهة في النافذة ومؤشر «محفوظ»، وأبعاد قوائم
// المشغّل، و«حول» بلا «خاص حاليًا»، ولقطات بالوضعين وبعروض CSS مختلفة (zoom125 وzoom150 عرضان أضيق عند تكبير 100%، لا
// تكبير متصفح فعلي) مع تدقيق التجاوز الأفقي والتمرير. كل فعل على
// الأدوات نقرة مستخدم حقيقية (Input). تحت الأتمتة يعيد يوتيوب جسم الترجمة فارغًا (P1)، فيُمرَّر جسم P1 الحقيقي الملتقط
// للفيديو نفسه إلى المستخرج عبر خطاف التطوير. الحافظة تُستبدل في العالم المعزول فلا تُمس حافظة الجهاز. لا رابط ولا رمز في الأدلة.
// مواءمة الهوية «بُنّ على ورق» (2026-11-03، docs/product-spec.md §٦.٦ (وثيقة الهوية «بُنّ على ورق» حُذفت في AA2)): الشعار واللوحة وأيقونة الإضافة بقيمها الجديدة، وعنوانا
// قائمتي الشريط «تحميل الأصل» و«الترجمة»، وشرائح المحفوظات والحذف من التوسيع في الصف بدل لوحة «الترجمات…»، والشبكة من صفحات
// الإضافة صور i.ytimg.com وحدها بلا مُحيل (و404 صور المعرّفات الوهمية في البذرة متوقعة وتُعدّ وحدها).
//   command npm run build:dev -- --out <مجلد خارج المستودع>
//   command node test/live/polish/run.mjs --browser brave|chrome --ext <مجلد> [--out docs/evidence/UI-polish] [--headed]
//   [--measure-only]  قياس قوائم المشغّل ولقطاتها وحدها (للمقارنة مع بناء سابق)
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, human, sleep } from '../harness/browser.mjs';
import { attach, collectErrors, emulateScheme, fullScreenshot, openTab, waitForTarget } from '../harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { SEED_IDS, buildSeedFew, buildSeedMany, storageItems } from '../ui/seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/UI-polish'), browser);
const HEADED = argv.includes('--headed');
const MEASURE_ONLY = argv.includes('--measure-only');
const VIDEO = SEED_IDS.ted;
const FIXTURE = path.join(ROOT, 'test/fixtures/json3/manual-ted-iG9CE55wbtY.json');
const PROFILE = `${browser}-polish-${Date.now()}`;
const DL = path.join(PROFILE_ROOT, PROFILE, 'downloads');
const rel = (f) => path.relative(ROOT, f);

const result = { browser: null, at: new Date().toISOString(), headless: !HEADED, measureOnly: MEASURE_ONLY, checks: [], measures: {}, fonts: {}, screenshots: [], notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
};
const note = (t) => { result.notes.push(t); console.log(`· ${t}`); };

// ---- ملفات عربية من جسم P1 الحقيقي (الترقيم والتوقيت نفساهما، كناتج نموذج) ----
const body = await readFile(FIXTURE, 'utf8');
const capture = { source: 'tarjuman', v: 1, kind: 'timedtext', videoId: VIDEO, lang: 'en', trackKind: 'manual', kindParam: null, capsAsr: false, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false };
const ex = createExtractor({ currentVideoId: () => VIDEO, durationMs: () => 1203421, isLive: () => false });
ex.handleMessage(capture);
const conv = ex.convert('en|manual', { mode: 'normal' });
const CUES = buildExport({ videoId: VIDEO, title: null, track: { key: 'en|manual', lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: 'normal', split: null, now: Date.now() }).fingerprint.cues;
const arabicSrt = (label) => writeSrt(CUES.map((c) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: `${label} — المقطع ${c.n}` })));
const FILES = await mkdtemp(path.join(os.tmpdir(), 'tj-polish-files-'));
const srtFile = async (name, text) => {
  const f = path.join(FILES, name);
  await writeFile(f, text);
  return f;
};

const errors = [];
const nets = [];
/** صورة الفيديو المصغّرة بمعرّفه (الاستثناء المسمّى الوحيد للشبكة في صفحات الإضافة)، و404 لمعرّف غير موجود متوقعة. */
const THUMB_RE = /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/;
const thumb404 = { n: 0 };
let b = null;
let extId = null;

// ---- مساعدات الصفحات ----
async function openExt(restPath, { background = false } = {}) {
  const page = await openTab(b.conn, 'about:blank', { background });
  errors.push(collectErrors(page, { extId }));
  // صور الفيديو في المحفوظات (قرار سلطان، docs/product-spec.md §٦.٦) الطلب الخارجي الوحيد المسموح: تُعدّ وحدها، وبلا مُحيل.
  const net = { external: 0, thumbs: 0, referers: 0, hosts: new Set() };
  nets.push(net);
  page.on('Network.requestWillBeSent', (p) => {
    const u = p.request.url;
    if (/^(chrome-extension|data|blob|about):/.test(u)) return;
    if (THUMB_RE.test(u.split('?')[0])) {
      net.thumbs++;
      if (p.request.headers?.Referer || p.request.headers?.referer) net.referers++;
      return;
    }
    net.external++;
    try { net.hosts.add(new URL(u).host); } catch { net.hosts.add('?'); }
  });
  page.on('Log.entryAdded', ({ entry }) => {
    if (entry.level === 'error' && entry.source === 'network' && THUMB_RE.test(String(entry.url ?? '').split('?')[0]) && /404/.test(entry.text)) thumb404.n++;
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
    await sleep(300);
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
/** ضغطة على أول زر يبدأ نصه أو اسم وصوله بالنص داخل الجذر. */
async function clickText(page, root, text) {
  const ok = await page.eval((r, t) => {
    document.querySelectorAll('[data-live-click]').forEach((e) => e.removeAttribute('data-live-click'));
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const el = [...(document.querySelector(r)?.querySelectorAll('button, a, summary, label, [role="menuitem"]') ?? [])].find((e) => norm(e.textContent).startsWith(t) || e.getAttribute('aria-label')?.startsWith(t));
    if (!el) return false;
    el.setAttribute('data-live-click', '1');
    return true;
  }, { args: [root, text] });
  if (!ok) throw new Error(`لا عنصر «${text}» في ${root}`);
  return clickSel(page, '[data-live-click]');
}
const layoutAudit = (page) => page.eval(() => {
  const w = document.documentElement.clientWidth;
  const overflow = [...document.querySelectorAll('body *')].filter((e) => {
    const r = e.getBoundingClientRect();
    if (!r.width || getComputedStyle(e).position === 'fixed') return false;
    // داخل حاوية تمرير أفقي مقصودة (التنقّل الضيق، جدول) لا يُعدّ تجاوزًا للصفحة.
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return false;
    return r.right > w + 1 || r.left < -1;
  }).map((e) => `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]}`).slice(0, 6);
  const clipped = [...document.querySelectorAll('.tj-btn, .tj-chip, .tj-popup__nav-item, .st-nav__link')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).length;
  const scrollers = [...document.querySelectorAll('body *')].filter((e) => {
    const s = getComputedStyle(e);
    return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 0;
  }).map((e) => String(e.className?.baseVal ?? e.className).split(' ')[0]);
  return { pageWidth: w, scrollWidth: document.documentElement.scrollWidth, overflow, clipped, innerScrollers: scrollers };
});

/**
 * الخط المرسوم فعلًا لعقد نصية (بعد التصيير): يمشي DOM كله مخترقًا الجذور المغلقة، ويسأل المتصفح عن الخط الذي رسم كل نص.
 * @param {(attrs: Record<string, string>) => boolean} hostMatch مضيف الجذر المطلوب (أو null للمستند كله)
 */
async function renderedFonts(page, { hostIds = null, selectorText = null, limit = 24 } = {}) {
  await page.send('DOM.enable');
  await page.send('CSS.enable');
  const { root } = await page.send('DOM.getDocument', { depth: -1, pierce: true });
  const attrs = (n) => Object.fromEntries((n.attributes ?? []).reduce((acc, v, i, arr) => (i % 2 ? acc : [...acc, [v, arr[i + 1]]]), []));
  const roots = [];
  (function find(n) {
    const a = attrs(n);
    if (!hostIds ? n.nodeName === 'BODY' : hostIds.includes(a.id)) roots.push(n);
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) find(c);
  })(root);
  const texts = [];
  for (const r of roots) {
    (function walk(n) {
      if (n.nodeType === 3 && /\p{Script=Arabic}/u.test(n.nodeValue) && n.nodeValue.trim().length > 1) texts.push({ text: n.nodeValue.trim().slice(0, 28), parent: n.parentId });
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) walk(c);
    })(r);
  }
  const out = [];
  const seen = new Set();
  for (const t of texts) {
    if (seen.has(t.text) || out.length >= limit) continue;
    if (selectorText && !selectorText.some((s) => t.text.startsWith(s))) continue;
    seen.add(t.text);
    try {
      const { fonts } = await page.send('CSS.getPlatformFontsForNode', { nodeId: t.parent });
      const { computedStyle } = await page.send('CSS.getComputedStyleForNode', { nodeId: t.parent });
      const get = (p) => computedStyle.find((x) => x.name === p)?.value;
      out.push({ text: t.text, weight: get('font-weight'), family: get('font-family').split(',')[0], rendered: fonts.map((f) => ({ name: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount })) });
    } catch {
      // عقدة زالت أثناء القراءة.
    }
  }
  return out;
}
/**
 * كل نص عربي مرسوم رسمه خط مضمّن (Cairo أو Almarai)، لا خط النظام. النص غير المرسوم (قارئ الشاشة، وبنود القائمة المنسدلة
 * الأصلية) خارج الفحص؛ ورمز مفرد ليس في الخط (→ ✓) يُرسم بخط النظام مقبول ما دام النص نفسه بالمضمّن.
 */
const painted = (list) => list.filter((n) => n.rendered.length > 0);
const allBundled = (list) => painted(list).length > 0 && painted(list).every((n) => n.rendered.some((f) => f.custom && /Cairo|Almarai/i.test(f.name)) && n.rendered.every((f) => (f.custom && /Cairo|Almarai/i.test(f.name)) || f.glyphs <= 2));
const brief = (list) => list.slice(0, 8).map((n) => `«${n.text}» ${n.family} → ${n.rendered.map((f) => `${f.name}${f.custom ? '*' : ''}`).join('+')}`);

// ---- مساعدات المشغّل ----
let yt = null;
let isoId = null;
const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
const main = (fn, ...args) => yt.eval(fn, { args });
const I = {
  peek: () => globalThis.__tarjuman.mounted.controls.peek(),
  diag: () => globalThis.__tarjuman.mounted.controls.diagnostics(),
  inject: (msg) => globalThis.__tarjuman.extractor.handleMessage(msg),
  state: () => {
    const s = globalThis.__tarjuman.controller.getState();
    return { loading: s.loading, captured: s.captured.map((t) => t.ok), arabic: s.arabic?.fileName ?? null, activeSlot: s.activeSlot, slots: s.slots.map((x) => ({ n: x.n, filled: x.filled, active: x.active })) };
  },
  bundle: async (id) => {
    const bd = await globalThis.__tarjuman.store.getBundle(id);
    return bd ? { active: bd.active, filled: bd.slots.filter((x) => x.track).map((x) => x.n) } : null;
  },
  stub: () => {
    globalThis.__tjCopies = [];
    Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { globalThis.__tjCopies.push(t.length); } });
    globalThis.__tjSaves = [];
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (msg, ...rest) => {
      if (msg?.type === 'tj:save-file') globalThis.__tjSaves.push(msg.file.name);
      return send(msg, ...rest);
    };
    return true;
  },
  counts: () => ({ copies: globalThis.__tjCopies.length, saves: [...globalThis.__tjSaves] }),
};
const center = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
async function clickBar(kind) {
  await revealControls(yt);
  const p = await iso(I.peek);
  const c = center(p.buttons[kind].box);
  await yt.click(c.x, c.y);
  await sleep(500);
}
const menu = async () => (await iso(I.peek))?.layer.menu ?? null;
async function clickItem(fid) {
  const m = await menu();
  const it = m?.items.find((x) => x.fid === fid || x.text === fid);
  if (!it) throw new Error(`لا بند ${fid}: ${m?.items.map((x) => x.fid).join(',')}`);
  const c = center(it.box);
  await yt.click(c.x, c.y);
  await sleep(500);
}
async function closeMenus() {
  if (await menu()) {
    await yt.key('Escape', 'Escape', 27);
    await sleep(300);
  }
}
async function openMenu(kind, label) {
  if ((await menu())?.label === label) return menu();
  await closeMenus();
  await clickBar(kind);
  return menu();
}
const slotsIn = (m) => m.items.filter((x) => x.fid?.startsWith('slot:')).map((x) => x.text);
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
      note(`منتقي الملفات: ${err.message.slice(0, 100)}`);
    }
  });
}
async function upload(file) {
  nextUpload = [file];
  const s = await iso(I.state);
  if (s.arabic) {
    await openMenu('upload', 'الترجمة');
    await clickItem('replace');
  } else {
    await clickBar('upload');
  }
  await sleep(1800);
}
async function measureMenu(name) {
  const m = await menu();
  if (!m) return null;
  const rows = m.items.length;
  result.measures[name] = { width: m.box.width, height: m.box.height, items: rows, minItemH: Math.min(...m.items.filter((x) => x.box.height).map((x) => x.box.height)) };
  return result.measures[name];
}
async function snapPlayer(name) {
  await revealControls(yt);
  await sleep(250);
  await snap(yt, name);
}

async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    check(`${name}: اكتمل`, false, { error: err.message.slice(0, 300) });
    if (yt) await closeMenus().catch(() => {});
  }
}

try {
  await mkdir(OUT, { recursive: true });
  // مجلد التنزيل داخل ملف الاختبار وبلا «اسأل»، فيُحفظ ملف المشغّل فعلًا (لا حوار حفظ بلا نافذة).
  await mkdir(path.join(PROFILE_ROOT, PROFILE, 'Default'), { recursive: true });
  await mkdir(DL, { recursive: true });
  await writeFile(path.join(PROFILE_ROOT, PROFILE, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: DL, prompt_for_download: false, directory_upgrade: true }, savefile: { default_directory: DL } }));
  b = await launch({ browser, profile: PROFILE, headless: !HEADED });
  result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  extId = ext.id;
  const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
  result.extension = { version: manifest.version, versionName: manifest.version_name ?? null };
  console.log(`المتصفح: ${result.browser} · الإضافة ${manifest.version_name ?? manifest.version}`);
  const now = Date.now();
  const many = buildSeedMany(now).items;
  void buildSeedFew;

  // ===== ١. صفحات الإضافة: الشعار والخط المرسوم واللوحة والتجاوز بعروض وتكبير مختلفة =====
  const lib = await openExt('pages/library/index.html');
  await lib.eval((obj) => chrome.storage.local.set(obj), { args: [storageItems(many)] });
  if (!MEASURE_ONLY) await step('pages', async () => {
    await lib.reload();
    await lib.waitFor(() => document.querySelectorAll('li.lib-row').length > 3, { timeoutMs: 10000 });
    const logoOf = () => lib.eval(() => {
      const svg = document.querySelector('.tj-topbar__brand svg.tj-logo');
      // لون الهوية كما يحسبه المتصفح: لون زر رئيسي ولون النص، يُقارن بهما لونا الرمز والاسم.
      const probe = document.createElement('span');
      probe.style.color = 'var(--tj-brand)';
      document.body.append(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      const ink = getComputedStyle(document.body).color;
      return svg ? { paths: svg.querySelectorAll('path').length, w: Math.round(svg.getBoundingClientRect().width), h: Math.round(svg.getBoundingClientRect().height), glyph: getComputedStyle(svg.querySelector('.tj-logo__glyph path')).fill, word: getComputedStyle(svg.querySelector('.tj-logo__word path')).fill, brand, ink, mark: !!document.querySelector('.tj-mark'), textT: [...document.querySelectorAll('.tj-topbar__brand *')].some((e) => e.childNodes.length === 1 && e.textContent === 'ت') } : null;
    });
    const paletteOf = () => lib.eval(() => {
      const cs = getComputedStyle(document.documentElement);
      return { brand: cs.getPropertyValue('--tj-brand').trim(), bg: getComputedStyle(document.body).backgroundColor, chip: getComputedStyle(document.querySelector('.tj-chip[aria-pressed="true"]')).color };
    });
    await emulateScheme(lib, 'light');
    await sleep(200);
    const logoLight = await logoOf();
    const palLight = await paletteOf();
    await emulateScheme(lib, 'dark');
    await sleep(200);
    const logoDark = await logoOf();
    const palDark = await paletteOf();
    await emulateScheme(lib, 'light');
    check('logo-topbar-approved-shape-identity-color-both-schemes', logoLight && logoLight.paths === 9 && !logoLight.mark && !logoLight.textT && logoLight.h === 24
      && logoLight.glyph === logoLight.brand && logoLight.word === logoLight.ink && logoLight.glyph === 'rgb(92, 68, 52)'
      && logoDark.glyph === logoDark.brand && logoDark.word === logoDark.ink && logoDark.glyph === 'rgb(214, 179, 143)', { logoLight, logoDark });
    const libFonts = await renderedFonts(lib, { limit: 14 });
    result.fonts.library = brief(libFonts);
    check('pages-fonts-bundled-rendered', allBundled(libFonts), brief(libFonts));
    // الهوية «بُنّ على ورق» (docs/product-spec.md §٦.٦ (وثيقة الهوية «بُنّ على ورق» حُذفت في AA2)): الإبراز البُنّي على الورق الدافئ، والكراميل على الداكن.
    check('palette-coffee-on-paper-both-schemes', palLight.brand === '#5C4434' && palLight.bg === 'rgb(250, 248, 244)' && palDark.brand === '#D6B38F' && palDark.bg === 'rgb(31, 28, 26)', { palLight, palDark });
    // شرائح الصفوف (الهوية §٥): شريحة لكل ترجمة موجودة وحدها، والخانة الفارغة التالية إجراء رفع لا نسخة.
    const rowChips = await lib.eval(() => [...document.querySelectorAll('li.lib-row')].slice(0, 12).map((r) => ({ chips: r.querySelectorAll('.lib-chips button').length, add: r.querySelectorAll('.lib-chip--add').length, none: !!r.querySelector('.lib-trs--none') })));
    check('library-chips-existing-translations-only', rowChips.every((p) => (p.none ? p.chips === 0 && p.add === 0 : p.chips === 1 && p.add === 1)), rowChips.slice(0, 4));
    for (const [w, label] of [[1440, '1440'], [1024, 'zoom125'], [853, 'zoom150'], [480, 'narrow']]) {
      await lib.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(250);
      const a = await layoutAudit(lib);
      check(`library-layout-${label}`, a.scrollWidth <= a.pageWidth && !a.overflow.length && !a.clipped, a);
    }
    await lib.send('Emulation.clearDeviceMetricsOverride');
    await shoot(lib, 'library', { width: 1280 });
    await shoot(lib, 'library-narrow', { width: 480, schemes: ['light'] });

    const st = await openExt('pages/settings/index.html');
    await st.waitFor(() => !!document.querySelector('.st-nav__link'), { timeoutMs: 8000 });
    await st.eval(() => { location.hash = 'about'; });
    await sleep(500);
    const about = await st.eval(() => {
      const sec = [...document.querySelectorAll('.st-section')].find((s) => !s.hidden && s.offsetParent);
      const t = sec?.textContent ?? '';
      const repo = [...(sec?.querySelectorAll('a') ?? [])].find((a) => a.textContent.includes('الدعم والخصوصية'));
      // الرابط يُقارن داخل الصفحة ولا يُكتب في الأدلة (لا روابط فيها).
      return { privateText: t.includes('خاص حاليًا'), repoLink: repo?.getAttribute('href') === 'https://bysltan.com/tarjuman/support', target: repo?.getAttribute('target') ?? null };
    });
    check('about-no-private-label-link-kept', !about.privateText && about.repoLink && about.target === '_blank', about);
    await shoot(st, 'settings-about', { width: 1280 });
    await st.eval(() => { location.hash = 'display'; });
    await sleep(500);
    const stFonts = await renderedFonts(st, { limit: 14 });
    result.fonts.settings = brief(stFonts);
    // أسماء خطوط الترجمة في صف الاختيار تُرسم بخطوطها هي (اختيار المستخدم)، فتُستثنى من شرط خط الواجهة.
    const uiOnly = stFonts.filter((n) => !/^(المراعي|نوتو|تجوّل|مركزي|مرحبًا)/.test(n.text));
    check('settings-fonts-bundled-rendered', allBundled(uiOnly), brief(uiOnly));
    for (const [w, label] of [[1440, '1440'], [853, 'zoom150'], [480, 'narrow']]) {
      await st.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(250);
      const a = await layoutAudit(st);
      check(`settings-layout-${label}`, a.scrollWidth <= a.pageWidth && !a.overflow.length && !a.clipped && !a.innerScrollers.length, a);
    }
    await st.send('Emulation.clearDeviceMetricsOverride');
    await shoot(st, 'settings-display', { width: 1280 });
    await shoot(st, 'settings-narrow', { width: 480, schemes: ['dark'] });
    await st.close();

    const pop = await openExt('pages/popup/index.html');
    await pop.waitFor(() => !!document.querySelector('#app[data-ready]'), { timeoutMs: 8000 });
    const nv = await pop.eval(() => ({
      nav: [...document.querySelectorAll('.tj-popup__nav [data-action]')].map((x) => x.getAttribute('data-action')),
      all: [...document.querySelectorAll('[data-action]')].map((x) => x.getAttribute('data-action')).filter((a) => a === 'library' || a === 'settings' || a === 'find'),
      gear: !!document.querySelector('.tj-popup__gear'), logo: document.querySelector('.tj-popup__head svg.tj-logo')?.querySelectorAll('path').length ?? 0,
      h: document.documentElement.scrollHeight, w: document.documentElement.clientWidth, scroll: document.documentElement.scrollHeight > window.innerHeight,
    }));
    check('popup-not-video-one-entry-each', nv.nav.join() === 'library,settings' && nv.all.join() === 'library,settings' && !nv.gear && nv.logo === 9, nv);
    const icon = await pop.eval(async () => {
      const im = new Image();
      im.src = chrome.runtime.getURL('icons/tarjuman-icon-128.png');
      await im.decode();
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const x = c.getContext('2d');
      x.drawImage(im, 0, 0);
      const px = (a, b) => [...x.getImageData(a, b, 1, 1).data];
      return { corner: px(2, 2), tile: px(64, 24), size: [im.naturalWidth, im.naturalHeight] };
    });
    check('extension-icon-identity-color-transparent', icon.corner[3] === 0 && icon.tile.slice(0, 3).join() === '92,68,52' && icon.size.join() === '128,128', icon);
    await shoot(pop, 'popup-not-video', { width: 340 });
    await pop.close();
  });

  // ===== ٢. المشغّل على يوتيوب =====
  yt = await openTab(b.conn, 'about:blank');
  await yt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  errors.push(collectErrors(yt, { extId, onlyExtension: true }));
  await armChooser();
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
  const ready = await waitForPlayer(yt, VIDEO, 30000);
  if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  check('youtube-player-ready', !!ready);
  await sleep(1500);
  isoId = yt.isolatedContextId(extId);
  await yt.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 15000 });
  await yt.waitFor(() => !globalThis.__tarjuman.controller.getState().loading, { contextId: isoId, timeoutMs: 15000 });
  await main(() => { const v = document.querySelector('#movie_player video'); v.muted = true; v.pause(); return true; });
  await iso(I.stub);
  await iso(I.inject, capture);
  await sleep(800);

  await step('player-fonts-and-sizes', async () => {
    const dm = await openMenu('download', 'تحميل الأصل');
    await measureMenu('download');
    await snapPlayer('player-download');
    const dl = await renderedFonts(yt, { hostIds: ['tarjuman-controls-layer', 'tarjuman-controls'] });
    result.fonts.player = brief(dl);
    if (!MEASURE_ONLY) {
      const title = dl.find((n) => n.text.startsWith('تحميل الأصل'));
      check('player-title-rendered-in-bundled-cairo', title && title.rendered.every((f) => f.custom && /Cairo/i.test(f.name)), title);
      check('player-all-text-bundled-fonts', allBundled(dl), brief(dl));
      const diag = await iso(I.diag);
      check('player-ui-fonts-loaded', JSON.stringify(diag.uiFonts) === JSON.stringify({ loaded: ['cairo', 'almarai'], failed: [] }), diag.uiFonts);
    }
    void dm;
    await closeMenus();
    await openMenu('upload', 'الترجمة');
    await measureMenu('display-1');
    await snapPlayer('player-display-one');
    await closeMenus();
    await clickBar('badge');
    await measureMenu('timing');
    await snapPlayer('player-timing');
    await closeMenus();
  });

  if (!MEASURE_ONLY) {
    await step('download-and-copy-separate', async () => {
      const m = await openMenu('download', 'تحميل الأصل');
      const fids = m.items.map((x) => x.fid);
      check('download-menu-two-separate-buttons', fids.includes('download') && fids.includes('copy') && !m.items.some((x) => /تنزيل ونسخ/.test(x.text)), m.items.map((x) => `${x.fid}:${x.text}`).slice(0, 8));
      const before = await iso(I.counts);
      await clickItem('copy');
      await sleep(800);
      const afterCopy = await iso(I.counts);
      const t1 = (await menu()).text;
      check('copy-copies-only', afterCopy.copies === before.copies + 1 && afterCopy.saves.length === before.saves.length && /نُسخت التعليمات/.test(t1) && !/نُزّل/.test(t1), { afterCopy, before });
      await clickItem('download');
      await yt.waitFor(() => /نُزّل|تعذّر حفظ|أُلغي/.test(globalThis.__tarjuman.mounted.controls.peek()?.layer.menu?.text ?? ''), { contextId: isoId, timeoutMs: 15000 });
      const afterDl = await iso(I.counts);
      const t2 = (await menu()).text;
      check('download-saves-only', afterDl.saves.length === afterCopy.saves.length + 1 && afterDl.copies === afterCopy.copies && /نُزّل/.test(t2), { afterDl, line: t2.match(/نُزّل[^ ]* [^ ]+/)?.[0] ?? null });
      check('both-result-lines-kept', /نُسخت التعليمات/.test(t2) && /نُزّل/.test(t2));
      await snapPlayer('player-download-results');
      await closeMenus();
    });

    await step('slots-one-two-three', async () => {
      let m = await openMenu('upload', 'الترجمة');
      check('slots-one-translation-hidden', slotsIn(m).length === 0 && !m.items.some((x) => x.fid?.startsWith('slot:')), { items: m.items.map((x) => x.fid).slice(0, 6) });
      await closeMenus();
      // الثانية: تأكيد «حفظ في» بالمحفوظة و«جديدة»، ثم خياران.
      await upload(await srtFile('second.ar.srt', arabicSrt('الثانية')));
      m = await menu();
      const targets = m.items.filter((x) => x.fid?.startsWith('target:')).map((x) => `${x.fid}=${x.text}`);
      check('confirm-targets-filled-and-new', targets.join() === 'target:1=1,target:2=جديدة', targets);
      await snapPlayer('player-confirm-second');
      await clickItem('confirm');
      await sleep(1200);
      m = await menu();
      check('slots-two-translations-two-options', slotsIn(m).join() === '1,2', slotsIn(m));
      await measureMenu('display-2');
      await snapPlayer('player-display-two');
      await closeMenus();
      // الثالثة.
      await upload(await srtFile('third.ar.srt', arabicSrt('الثالثة')));
      m = await menu();
      check('confirm-targets-three', m.items.filter((x) => x.fid?.startsWith('target:')).map((x) => x.text).join() === '1,2,جديدة');
      await clickItem('confirm');
      await sleep(1200);
      m = await menu();
      const st = await iso(I.state);
      check('slots-three-translations-three-options', slotsIn(m).join() === '1,2,3' && st.activeSlot === 3, { slots: slotsIn(m), active: st.activeSlot });
      await measureMenu('display-3');
      await snapPlayer('player-display-three');
      // التبديل إلى 2.
      await clickItem('slot:2');
      await sleep(1000);
      const bd = await iso(I.bundle, VIDEO);
      m = await menu();
      const checked = m.items.filter((x) => x.fid?.startsWith('slot:'));
      check('switch-to-slot-2', bd.active === 2 && (await iso(I.state)).activeSlot === 2, { bd });
      void checked;
      await closeMenus();
    });

    await step('library-sync-and-delete', async () => {
      await lib.goto(`chrome-extension://${extId}/pages/library/index.html#v=${VIDEO}`);
      await front(lib);
      await lib.waitFor((id) => !!document.querySelector(`li.lib-row[data-video="${id}"] .lib-chips`), { args: [VIDEO], timeoutMs: 10000 });
      // شرائح الصف (الهوية §٥): رقم كل ترجمة موجودة، والنشطة بـaria-pressed؛ والخانة الفارغة التالية شريحة رفع منفصلة.
      const row = () => lib.eval((id) => {
        const r = document.querySelector(`li.lib-row[data-video="${id}"]`);
        return {
          slots: [...r.querySelectorAll('.lib-chips button')].map((x) => `${x.getAttribute('data-slot')}${x.getAttribute('aria-pressed') === 'true' ? '*' : ''}`),
          add: r.querySelector('.lib-chip--add')?.getAttribute('data-slot') ?? null,
        };
      }, { args: [VIDEO] });
      const r1 = await row();
      check('library-row-three-active-2', r1.slots.join() === '1,2*,3' && r1.add === null, r1);
      await shoot(lib, 'library-three-slots', { width: 1280, schemes: ['light'] });
      // حذف الخانة 3 من التوسيع في الصف (بدل لوحة «الترجمات…») كما يفعل المستخدم.
      await clickSel(lib, `li.lib-row[data-video="${VIDEO}"] .lib-toggle`);
      await lib.waitFor(() => document.querySelectorAll('.lib-card[data-slot]').length >= 3, { timeoutMs: 6000 });
      await shoot(lib, 'library-translations-expanded', { width: 1280, schemes: ['dark'] });
      const deleteSlot = async (n) => {
        const ok = await lib.eval((k) => {
          const btn = document.querySelector(`.lib-card[data-slot="${k}"] .lib-card__delete`);
          if (!btn) return false;
          document.querySelectorAll('[data-live-del]').forEach((e) => e.removeAttribute('data-live-del'));
          btn.setAttribute('data-live-del', '1');
          return true;
        }, { args: [n] });
        if (!ok) throw new Error(`لا زر حذف للخانة ${n}`);
        await clickSel(lib, '[data-live-del]');
        await lib.waitFor(() => !!document.querySelector('dialog.tj-dialog--danger[open]'), { timeoutMs: 5000 });
        await clickSel(lib, 'dialog.tj-dialog--danger[open] button[value="confirm"]');
        await sleep(1200);
      };
      await deleteSlot(3);
      await front(yt);
      await sleep(800);
      let m = await openMenu('upload', 'الترجمة');
      check('player-after-delete-3-two-options-active-2', slotsIn(m).join() === '1,2' && (await iso(I.state)).activeSlot === 2, slotsIn(m));
      await closeMenus();
      await front(lib);
      await deleteSlot(1);
      await front(yt);
      await sleep(800);
      m = await openMenu('upload', 'الترجمة');
      const st = await iso(I.state);
      check('player-after-delete-1-picker-hidden', slotsIn(m).length === 0 && st.activeSlot === 2 && st.arabic === 'second.ar.srt', { slots: slotsIn(m), active: st.activeSlot, file: st.arabic });
      await snapPlayer('player-display-after-delete');
      await closeMenus();
      await front(lib);
      await sleep(600);
      // ترجمة واحدة باقية (2) نشطة، والخانة الفارغة التالية (1) شريحة رفع.
      const r2 = await row();
      check('library-row-after-deletes-one-chip', r2.slots.join() === '2*' && r2.add === '1', r2);
    });

    await step('popup-on-video', async () => {
      await front(yt);
      const p = await openExt('pages/popup/index.html', { background: true });
      await p.waitFor(() => !!document.querySelector('#app[data-ready]'), { timeoutMs: 8000 });
      const info = await p.eval(() => ({
        actions: [...document.querySelectorAll('.tj-popup__actions [data-action]')].map((x) => x.getAttribute('data-action')),
        nav: [...document.querySelectorAll('.tj-popup__nav [data-action]')].map((x) => x.getAttribute('data-action')),
        libEntries: [...document.querySelectorAll('button, a')].filter((x) => /المحفوظات/.test(x.textContent)).length,
        settingsEntries: [...document.querySelectorAll('button, a')].filter((x) => /الإعدادات/.test(x.textContent) || x.getAttribute('aria-label') === 'الإعدادات').length,
        pills: [...document.querySelectorAll('.tj-popup__pills .tj-pill')].map((x) => x.textContent),
        savedIsLink: [...document.querySelectorAll('.tj-popup__pills .tj-pill')].some((x) => x.textContent === 'محفوظ' && (x.closest('button, a') !== null)),
        h: document.documentElement.scrollHeight, inner: window.innerHeight,
      }));
      check('popup-video-one-entry-per-destination', info.actions.join() === 'editor,copy' && info.nav.join() === 'library,settings' && info.libEntries === 1 && info.settingsEntries === 1, info);
      check('popup-saved-indicator-not-link', info.pills.includes('محفوظ') && !info.savedIsLink, info.pills);
      await p.send('Emulation.setDeviceMetricsOverride', { width: 340, height: 600, deviceScaleFactor: 1, mobile: false });
      await sleep(250);
      const pa = await layoutAudit(p);
      const contentH = await p.eval(() => Math.round(document.querySelector('.tj-container').getBoundingClientRect().height));
      check('popup-fits-without-scroll-340', pa.scrollWidth <= 340 && !pa.overflow.length && !pa.clipped && contentH <= 600, { ...pa, contentH });
      await p.send('Emulation.clearDeviceMetricsOverride');
      await shoot(p, 'popup-video', { width: 340 });
      const seen = new Set((await b.conn.send('Target.getTargets')).targetInfos.map((t) => t.targetId));
      await front(p);
      await clickSel(p, '.tj-popup__nav [data-action="library"]');
      const opened = await waitForTarget(b.conn, (u) => u.includes('/pages/library/index.html'), { timeoutMs: 6000, exclude: seen }).catch(() => null);
      // المحفوظات تُبرز الصف المقصود مرة ثم تمسح #v= من العنوان، فالدليل الصف المُبرَز في التبويب الجديد لا العنوان.
      let target = null;
      if (opened) {
        const nl = await attach(b.conn, opened.targetId);
        target = await nl.waitFor(() => document.querySelector('li.lib-row--target')?.getAttribute('data-video') ?? null, { timeoutMs: 6000 }).catch(() => null);
        const filtered = await nl.eval(() => document.querySelectorAll('li.lib-row').length);
        target = { row: target, rows: filtered };
        await nl.close();
      }
      check('popup-library-entry-opens-row', !!opened && target?.row === VIDEO && target.rows > 1, { opened: !!opened, target });
      await p.close().catch(() => {});
    });

    await step('editor', async () => {
      const ed = await openExt(`pages/editor/index.html?v=${VIDEO}`);
      await ed.waitFor(() => !!document.querySelector('.ed-app'), { timeoutMs: 10000 });
      await sleep(800);
      const info = await ed.eval(() => ({ picker: document.querySelector('.tj-slots')?.hidden ?? null, n: document.querySelectorAll('.tj-slots__slot').length }));
      check('editor-single-translation-no-picker', info.picker === true && info.n <= 1, info);
      const edFonts = await renderedFonts(ed, { limit: 12 });
      // نص الترجمة نفسه في المحرّر بخط الواجهة أيضًا (لا خط الترجمة)، فكله مضمّن.
      check('editor-fonts-bundled-rendered', allBundled(edFonts), brief(edFonts));
      await shoot(ed, 'editor', { width: 1280 });
      await ed.close();
    });

    await step('player-narrow', async () => {
      // تبويب جديد بعرض 480 من البداية (المشغّل المضغوط)، فلا يعتمد على إعادة تخطيط يوتيوب بعد تغيير الحجم.
      await closeMenus();
      const wide = yt;
      yt = await openTab(b.conn, 'about:blank');
      await yt.send('Emulation.setDeviceMetricsOverride', { width: 480, height: 760, deviceScaleFactor: 1, mobile: false });
      await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
      await waitForPlayer(yt, VIDEO, 30000);
      await yt.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 15000 });
      await sleep(2000);
      await main(() => { const v = document.querySelector('#movie_player video'); v.muted = true; v.pause(); return true; });
      isoId = yt.isolatedContextId(extId);
      await iso(I.inject, capture);
      await sleep(600);
      await clickBar('download');
      const mm = await measureMenu('download-narrow');
      const pr = await main(() => { const r = document.querySelector('#movie_player').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
      const size = (await iso(I.peek)).size ?? null;
      check('player-menu-fits-narrow-player', mm && mm.width <= pr.w - 16 && mm.height <= pr.h, { menu: mm, player: pr, size });
      await snapPlayer('player-download-narrow');
      await closeMenus();
      await yt.close();
      yt = wide;
      isoId = yt.isolatedContextId(extId);
    });
  }

  // 404 صورة المعرّف غير الموجود (معرّفات البذرة الوهمية) متوقعة وتُعدّ وحدها؛ وأي خطأ آخر يبقى خطأ.
  let skipped404 = 0;
  const extErrors = errors.flatMap((e) => e.list).filter((x) => !/favicon|ERR_BLOCKED_BY_CLIENT/i.test(x.text)).filter((x) => {
    if (x.kind === 'log.network' && /404/.test(x.text) && skipped404 < thumb404.n) { skipped404++; return false; }
    return true;
  });
  result.measures.expectedThumb404 = thumb404.n;
  check('no-extension-errors', extErrors.length === 0, extErrors.slice(0, 5).map((x) => `${x.kind}: ${x.text.slice(0, 120)}`));
  const ext2 = nets.reduce((n, x) => n + x.external, 0);
  const thumbs = nets.reduce((n, x) => n + x.thumbs, 0);
  const refs = nets.reduce((n, x) => n + x.referers, 0);
  check('no-network-from-extension-pages-except-thumbnails', ext2 === 0 && refs === 0, { external: ext2, thumbnails: thumbs, referers: refs });
} catch (err) {
  check('run: اكتمل', false, { error: err.message.slice(0, 300) });
} finally {
  await b?.close();
}
const failed = result.checks.filter((c) => !c.ok);
result.summary = { total: result.checks.length, passed: result.checks.length - failed.length, failed: failed.map((c) => c.id) };
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, MEASURE_ONLY ? 'measure.json' : 'live.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\n${result.browser}: ${result.summary.passed}/${result.summary.total}${failed.length ? ` — سقط: ${failed.map((c) => c.id).join('، ')}` : ''}`);
process.exitCode = failed.length ? 1 : 0;
