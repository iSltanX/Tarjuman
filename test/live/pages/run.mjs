#!/usr/bin/env node
// **مستبدَل — لا يُشغَّل على المنتج الحالي** (مواءمة الهوية 2026-11-03، docs/product-spec.md §٦.٦): اختبار P7 في W4، وكان
// قديمًا قبل جولة الهوية (`st-card` و`tj-popup__menu` و`tj-menuitem` و`lib-toast--*` غير موجودة منذ إعادة تصميم الواجهات)، ثم نقلت
// الهوية «نسخ التعليمات» من زر في كل صف (`lib-copy__button` بحالاته) إلى قائمة «المزيد» برسالة عابرة. تغطيته الآن في
// test/live/pages/p13.mjs (المحفوظات والإعدادات والنسخ بالقاموس من «المزيد» والنسخة الاحتياطية) وtest/live/identity/run.mjs.
// أدلته التاريخية في docs/evidence/P7.
// الاختبار الحي لصفحات P7 (نافذة الأيقونة والمحفوظات والإعدادات) على الإضافة المبنية في ملف اختبار منفصل: بيانات حقيقية
// محفوظة، وضغطات Input حقيقية، وقراءة الحافظة الفعلية بعد «نسخ» من صفّين لفيديوهين، وبقاء الخط والحجم بعد إعادة تشغيل
// المتصفح، وخطوط الواجهة الثابتة، وخلو الصفحات من الشبكة، والأخطاء، ولقطات الحالات بالوضعين والعرض الضيق.
// لا رابط ولا رمز في الأدلة (يمر الناتج على المنقّي). تُحفظ الحافظة السابقة وتُعاد في النهاية.
//   command node test/live/pages/run.mjs --browser brave|chrome [--ext dist] [--out docs/evidence/P7]
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, human, sleep } from '../harness/browser.mjs';
import { attach, collectErrors, emulateScheme, fullScreenshot, openTab, waitForTarget } from '../harness/extension.mjs';
import { dismissConsent, waitForPlayer } from '../harness/youtube.mjs';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { SEED_IDS, buildSeed, replacementSrt, storageItems } from './seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P7'), browser);
/** --only copy: يُعاد سيناريو «نسخ» وحده (الزرع والمحفوظات ثم النسخ والفشل) بعد إصلاح يخصه، لا السيناريو كله. */
const ONLY = val('only');
class Done extends Error {}
const DOWNLOADS = path.join(os.tmpdir(), `tj-p7-live-${browser}`);
const PROFILE = `${browser}-p7`;
const rel = (f) => path.relative(ROOT, f);
/** يسقط محارف العزل الاتجاهي (FSI…PDI) من عنوان حوار قبل مطابقته. */
const stripIsolates = (s) => String(s ?? '').replace(new RegExp('[\\u2066-\\u2069]', 'g'), '');

const result = { browser: null, at: new Date().toISOString(), checks: [], screenshots: [], notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

// ---- القالب المعتمد كما في المواصفة (مصدر مستقل عن الشيفرة) ----
const spec = await readFile(path.join(ROOT, 'docs/product-spec.md'), 'utf8');
const TEMPLATE = /```text\n([\s\S]*?)\n```/.exec(spec.slice(spec.indexOf('## ملحق أ')))[1];
const expectedInstructions = (id, title) => TEMPLATE.replace('{{video_title}}', () => title ?? 'غير متوفر').replace('{{video_url}}', () => `https://www.youtube.com/watch?v=${id}`);
const PROBES = ['ترجمة ملف ترجمة فيديو', 'أرفقتُ ملف ترجمة', 'بنية SRT: التزم بها', 'افهم قبل أن تترجم', '{{video_title}}'];

// ---- الحافظة الحقيقية (macOS): تُقرأ بعد النسخ وتُعاد كما كانت ----
const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
const readClipboard = () => execFileSync('/usr/bin/pbpaste', { env, encoding: 'utf8' });
const writeClipboard = (text) => execFileSync('/usr/bin/pbcopy', { env, input: text });
const clipboardBefore = readClipboard();

const seed = buildSeed();
const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
result.extension = { version: manifest.version, versionName: manifest.version_name ?? null };

const errors = [];
const nets = [];
let extId = null;
let b = null;

async function start() {
  b = await launch({ browser, profile: PROFILE, headless: false });
  result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  extId = ext.id;
  await mkdir(DOWNLOADS, { recursive: true });
  await b.conn.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });
}

/** يفتح صفحة من الإضافة بتبويب أمامي (أو خلفي) مع جمع الأخطاء وعدّ الطلبات الخارجية (مضيف فقط). */
async function openExt(rest, { background = false } = {}) {
  const page = await openTab(b.conn, 'about:blank', { background });
  errors.push(collectErrors(page, { extId }));
  const net = { external: 0, hosts: new Set(), total: 0 };
  nets.push(net);
  page.on('Network.requestWillBeSent', (p) => {
    net.total++;
    const u = p.request.url;
    if (!u.startsWith('chrome-extension://') && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) {
      net.external++;
      try { net.hosts.add(new URL(u).host); } catch { net.hosts.add('?'); }
    }
  });
  await page.send('Network.enable');
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.goto(`chrome-extension://${extId}/${rest}`);
  return page;
}

async function shoot(page, name, { width = 1440, schemes = ['light', 'dark'] } = {}) {
  await b.conn.send('Target.activateTarget', { targetId: page.targetId });
  for (const scheme of schemes) {
    await emulateScheme(page, scheme);
    await sleep(200);
    const f = await fullScreenshot(page, path.join(OUT, `${name}-${scheme}.png`), { width });
    result.screenshots.push(rel(f));
  }
  await emulateScheme(page, 'light');
}

async function snap(page, name) {
  await b.conn.send('Target.activateTarget', { targetId: page.targetId });
  const f = await page.screenshot(path.join(OUT, `${name}.png`));
  result.screenshots.push(rel(f));
}

/** ضغطة Input حقيقية على أول زر/رابط/ملخّص يبدأ نصه بالنص داخل الجذر. */
async function clickText(page, root, text) {
  const found = await page.eval((r, t) => {
    document.querySelectorAll('[data-live-click]').forEach((e) => e.removeAttribute('data-live-click'));
    const scope = document.querySelector(r);
    if (!scope) return false;
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const el = [...scope.querySelectorAll('button, a, summary, label')].find((e) => norm(e.textContent).startsWith(t) || e.getAttribute('aria-label')?.startsWith(t));
    if (!el) return false;
    el.setAttribute('data-live-click', '1');
    return true;
  }, { args: [root, text] });
  if (!found) throw new Error(`لا عنصر «${text}» في ${root}`);
  return clickSel(page, '[data-live-click]');
}

async function clickSel(page, selector) {
  const c = await page.centerOf(selector);
  if (!c) throw new Error(`عنصر غير موجود أو غير مرئي: ${selector}`);
  await page.click(c.x, c.y);
  await human(300, 600);
}

const rowSel = (i) => `ul.lib-list > li:nth-child(${i})`;
const rowOf = (page, id) => page.eval((i) => [...document.querySelectorAll('li.lib-row')].findIndex((r) => r.textContent.includes(i)) + 1, { args: [id] });

/** كل عنصر في الصفحة: نصه وسماته وقيمه لا تحوي أي جزء من نص التعليمات، ولا textarea ولا محرّر. */
const scanNoTemplate = (page) => page.eval((probes) => {
  const nodes = [document.documentElement, ...document.querySelectorAll('*')];
  const hits = [];
  for (const n of nodes) {
    const blob = [n.textContent, n.value, ...[...(n.attributes ?? [])].map((a) => a.value)].join('\n');
    for (const p of probes) if (blob.includes(p)) hits.push(p);
  }
  return {
    hits: [...new Set(hits)],
    textareas: document.querySelectorAll('textarea').length,
    textInputs: document.querySelectorAll('input[type="text"]').length,
    editable: document.querySelectorAll('[contenteditable]:not([contenteditable="false"])').length,
  };
}, { args: [PROBES] });

async function waitFile(name, ms = 8000) {
  const f = path.join(DOWNLOADS, name);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await stat(f)).size > 0) return f; } catch { /* لم يصل بعد */ }
    await sleep(250);
  }
  return null;
}

/** ينتظر حالة زر «نسخ» المحدد (لا أول زر في الصفحة). */
const STATE = (page, selector, state) => page.waitFor((sel, s) => document.querySelector(sel)?.getAttribute('data-state') === s, { args: [selector, state], timeoutMs: 4000, intervalMs: 80 });
const seedStorage = (page) => page.eval((items) => chrome.storage.local.set(items), { args: [storageItems(seed.items)] });
const settingsOf = (page) => page.eval(async () => (await chrome.storage.local.get('settings')).settings ?? null);

try {
  await start();
  console.log(`المتصفح: ${result.browser} · الإضافة ${manifest.version_name ?? manifest.version}`);

  // ===== ١. نافذة الأيقونة (P7-AC1) =====
  const settings0 = await openExt('pages/settings/index.html');
  await settings0.waitFor(() => document.querySelector('.st-card'), { timeoutMs: 8000 });
  // يبدأ كل تشغيل من تخزين فارغ (ملف الاختبار يبقى بين التشغيلات)، فلا تلوّث بيانات تشغيل سابق حالات النافذة.
  await settings0.eval(() => chrome.storage.local.clear());
  if (ONLY) await seedStorage(settings0);
  if (!ONLY) {

  const popupFg = await openExt('pages/popup/index.html');
  await popupFg.waitFor(() => document.querySelector('.tj-popup__menu'), { timeoutMs: 8000 });
  const notVideo = await popupFg.eval(() => ({ status: document.querySelector('.tj-popup__status')?.textContent.trim(), items: [...document.querySelectorAll('.tj-menuitem')].map((x) => ({ n: x.querySelector('.tj-menuitem__name')?.textContent, off: x.getAttribute('aria-disabled') === 'true' })) }));
  check('ac1-popup-not-video', notVideo.status === 'افتح فيديو على يوتيوب لتظهر حالته هنا.' && notVideo.items[0].off && !notVideo.items[1].off && !notVideo.items[2].off, notVideo);
  await shoot(popupFg, 'popup-not-video', { width: 320 });
  await popupFg.close();

  const yt = await openTab(b.conn, 'about:blank');
  errors.push(collectErrors(yt, { extId, onlyExtension: true }));
  await yt.goto(`https://www.youtube.com/watch?v=${SEED_IDS.ted}`);
  await dismissConsent(yt).catch(() => false);
  const ready = await waitForPlayer(yt, SEED_IDS.ted);
  if (await yt.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  check('ac1-watch-page-ready', !!ready);
  await yt.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; v.pause(); })).catch(() => {});
  await sleep(2000);

  /** نافذة الأيقونة في تبويب خلفي بعد تنشيط يوتيوب، فيكون هو «التبويب النشط» كما في المنتج. */
  const openPopupBg = async () => {
    await b.conn.send('Target.activateTarget', { targetId: yt.targetId });
    return openExt('pages/popup/index.html', { background: true });
  };
  const popupState = async (name) => {
    const p = await openPopupBg();
    await p.waitFor(() => document.querySelector('.tj-popup__menu') && !document.querySelector('[aria-busy="true"]'), { timeoutMs: 8000 });
    const s = await p.eval(() => ({
      status: document.querySelector('.tj-popup__status')?.textContent.replace(/\s+/g, ' ').trim(),
      pill: document.querySelector('.tj-popup__status .tj-pill')?.textContent ?? null,
      editorDisabled: document.querySelectorAll('.tj-menuitem')[0].getAttribute('aria-disabled') === 'true',
      editorDesc: document.querySelectorAll('.tj-menuitem')[0].querySelector('.tj-menuitem__desc')?.textContent,
    }));
    await shoot(p, name, { width: 320 });
    return { p, s };
  };

  const noSub = await popupState('popup-no-subtitle');
  check('ac1-popup-video-no-subtitle', /لا ترجمة عربية محفوظة/.test(noSub.s.status) && /المسار الإنجليزي/.test(noSub.s.status) && noSub.s.editorDisabled && noSub.s.editorDesc === 'لا ترجمة لهذا الفيديو بعد', noSub.s);
  await noSub.p.close();

  await seedStorage(settings0);
  await sleep(1500);
  const withSub = await popupState('popup-with-subtitle');
  check('ac1-popup-video-with-subtitle', /ترجمة عربية · 427 مقطعًا · الإزاحة \+0\.5 ث/.test(withSub.s.status) && withSub.s.pill === 'معدّلة' && !withSub.s.editorDisabled, withSub.s);

  // البنود تفتح صفحاتها في تبويبات.
  const opens = {};
  for (const [label, prefix] of [['المحرّر', `chrome-extension://${extId}/pages/editor/index.html?v=${SEED_IDS.ted}`], ['المحفوظات', `chrome-extension://${extId}/pages/library/index.html`], ['الإعدادات', `chrome-extension://${extId}/pages/settings/index.html`]]) {
    const pp = label === 'المحرّر' ? withSub.p : await openPopupBg();
    await pp.waitFor(() => document.querySelector('.tj-popup__menu'), { timeoutMs: 8000 });
    const exclude = new Set((await b.conn.send('Target.getTargets')).targetInfos.map((x) => x.targetId));
    await pp.eval((t) => [...document.querySelectorAll('.tj-menuitem')].find((x) => x.querySelector('.tj-menuitem__name')?.textContent === t).click(), { args: [label] });
    const t = await waitForTarget(b.conn, (u) => u === prefix || (label !== 'المحرّر' && u.startsWith(prefix)), { exclude });
    opens[label] = !!t;
    if (t) await b.conn.send('Target.closeTarget', { targetId: t.targetId });
    await pp.close().catch(() => {});
  }
  check('ac1-popup-items-open-tabs', Object.values(opens).every(Boolean), opens);
  }

  // ===== ٢. المحفوظات (P7-AC2/AC3/AC6/AC7) =====
  const lib = await openExt('pages/library/index.html');
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length === 4, { timeoutMs: 10000 });
  const rows = await lib.eval(() => [...document.querySelectorAll('li.lib-row')].map((r) => ({
    title: r.querySelector('h2').textContent,
    id: r.querySelector('bdi')?.textContent,
    badges: [...r.querySelectorAll('.tj-pill')].map((p) => p.textContent),
    text: r.textContent.replace(/\s+/g, ' '),
    idDir: getComputedStyle(r.querySelector('bdi')).direction,
    titleBidi: getComputedStyle(r.querySelector('h2')).unicodeBidi,
  })));
  check('ac2-library-grouped-by-video', rows.length === 4 && rows[0].id === SEED_IDS.ted && rows[0].badges.join('|') === 'EN يدوي|AR معدّلة' && rows[1].badges.join('|') === 'EN تلقائي' && /3 ناقصة/.test(rows[2].badges.join('|')) && rows[3].title === 'بلا عنوان محفوظ', rows.map((r) => [r.id, r.badges]));
  check('ac2-offset-and-relative-time', /الإزاحة \+0\.5 ث/.test(rows[0].text) && /قبل ساعتين/.test(rows[0].text) && /أمس/.test(rows[1].text) && /الإزاحة −1\.0 ث/.test(rows[2].text) && /قبل 3 أيام/.test(rows[2].text) && /قبل أسبوع/.test(rows[3].text), rows.map((r) => r.text.slice(-60)));
  check('ac5-mixed-direction', rows.every((r) => r.idDir === 'ltr' && r.titleBidi === 'plaintext'), { idDir: [...new Set(rows.map((r) => r.idDir))], titleBidi: [...new Set(rows.map((r) => r.titleBidi))] });
  const dirs = await lib.eval(() => ({ dir: getComputedStyle(document.documentElement).direction, lang: document.documentElement.lang }));
  check('ac5-rtl-arabic', dirs.dir === 'rtl' && dirs.lang === 'ar', dirs);
  await shoot(lib, 'library-full-1440', { width: 1440 });
  await shoot(lib, 'library-full-1024', { width: 1024, schemes: ['light'] });
  await shoot(lib, 'library-narrow-480', { width: 480, schemes: ['light'] });
  const capText = await lib.eval(() => document.querySelector('.lib-quota__text')?.textContent);
  check('ac2-quota-text', /^المستخدم \d+(?:\.\d)? (?:ك|م)\.ب$/.test(capText), { capText });

  // البحث والترتيب والحالات.
  await lib.eval(() => document.querySelector('.lib-search__input').focus());
  await lib.send('Input.insertText', { text: 'نترجم' });
  await sleep(300);
  const byTitle = await lib.eval(() => [...document.querySelectorAll('li.lib-row h2')].map((h) => h.textContent));
  await lib.eval(() => { const i = document.querySelector('.lib-search__input'); i.value = ''; i.dispatchEvent(new Event('input')); });
  await lib.send('Input.insertText', { text: 'zx81' });
  await sleep(300);
  const byId = await lib.eval(() => [...document.querySelectorAll('li.lib-row h2')].map((h) => h.textContent));
  check('ac2-search-by-title-and-id', byTitle.length === 1 && byTitle[0].includes('لماذا نترجم') && byId.length === 1 && byId[0].startsWith('Typography'), { byTitle: byTitle.length, byId: byId.length });
  await lib.eval(() => { const i = document.querySelector('.lib-search__input'); i.value = ''; i.dispatchEvent(new Event('input')); });
  await lib.send('Input.insertText', { text: 'محاضرة لا وجود لها' });
  await sleep(300);
  const none = await lib.eval(() => ({ title: document.querySelector('.tj-empty__title')?.textContent, clear: !!document.querySelector('.tj-empty button') }));
  check('ac3-search-no-results', /^لا نتائج لـ«محاضرة لا وجود لها»$/.test(stripIsolates(none.title)) && none.clear, { title: stripIsolates(none.title), clear: none.clear });
  await shoot(lib, 'library-search-no-results', { width: 1440 });
  await clickText(lib, '.tj-empty', 'مسح البحث');
  const sortedBefore = await lib.eval(() => document.querySelectorAll('li.lib-row').length);
  await lib.eval(() => { const s = document.querySelector('.lib-sort__select'); s.value = 'title'; s.dispatchEvent(new Event('change')); });
  const sorted = await lib.eval(() => [...document.querySelectorAll('li.lib-row h2')].map((h) => h.textContent));
  check('ac2-sort-by-title', sortedBefore === 4 && sorted.at(-1) === 'بلا عنوان محفوظ', { first: sorted[0].slice(0, 12), last: sorted.at(-1) });
  await lib.eval(() => { const s = document.querySelector('.lib-sort__select'); s.value = 'updated'; s.dispatchEvent(new Event('change')); });

  // «نسخ»: ضغطة حقيقية، ثم الحافظة الفعلية، من صفّين لفيديوهين مختلفين (P7-AC6) وثالث بلا عنوان.
  const copyFlow = async (id, title, shotName) => {
    const i = await rowOf(lib, id);
    const btn = `${rowSel(i)} .lib-copy__button`;
    const c = await lib.centerOf(btn);
    await lib.mouseMove(c.x, c.y);
    await sleep(500);
    if (shotName) await snap(lib, `${shotName}-hover`);
    writeClipboard('قيمة سابقة للتحقق');
    // الإحداثيات تُعاد قبل النقر مباشرة (بعد لقطة التلميح): التمرير أو التخطيط قد يتغيّر بينهما فتضيع النقرة.
    const at = await lib.centerOf(btn);
    const under = await lib.eval((x, y) => {
      const e = document.elementFromPoint(x, y);
      return { onCopyButton: !!e?.closest('.lib-copy__button'), scrollY: Math.round(scrollY), target: e ? `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).slice(0, 40)}` : null };
    }, { args: [at.x, at.y] });
    await lib.click(at.x, at.y);
    const ok = await STATE(lib, btn, 'success');
    if (shotName) await snap(lib, `${shotName}-success`);
    const label = await lib.eval((s) => document.querySelector(`${s}`).textContent.trim(), { args: [btn] });
    const clip = readClipboard();
    const expected = expectedInstructions(id, title);
    const scan = await scanNoTemplate(lib);
    await sleep(250);
    const liveAfter = await lib.eval(() => [...document.querySelectorAll('.lib > .tj-sr-only[role="status"]')].map((x) => x.textContent));
    return { ok: !!ok, label, equal: clip === expected, len: clip.length, scan, liveAfter, under };
  };
  const c1 = await copyFlow(SEED_IDS.ted, seed.expectTitles[SEED_IDS.ted], 'library-copy');
  const c2 = await copyFlow(SEED_IDS.typo, seed.expectTitles[SEED_IDS.typo], null);
  const c3 = await copyFlow(SEED_IDS.untitled, null, null);
  check('ac6-clipboard-row-1', c1.ok && c1.equal && c1.label === 'تم النسخ', { equal: c1.equal, label: c1.label, chars: c1.len, under: c1.under });
  check('ac7-copy-announced-to-screen-reader-after-each-copy', [c1, c2, c3].every((c) => /^نُسخت تعليمات الترجمة\. ‹.+›$/.test(c.liveAfter[1] ?? '') && c.liveAfter[0] === ''), [c1, c2, c3].map((c) => c.liveAfter));
  check('ac6-clipboard-row-2-different-video', c2.ok && c2.equal, { equal: c2.equal, chars: c2.len });
  check('ac6-clipboard-untitled-row-uses-unavailable', c3.ok && c3.equal, { equal: c3.equal });
  check('ac7-no-template-in-dom-after-copy', [c1, c2, c3].every((c) => c.scan.hits.length === 0 && c.scan.textareas === 0 && c.scan.textInputs === 0 && c.scan.editable === 0), c1.scan);
  await lib.waitFor(() => [...document.querySelectorAll('.lib-copy__button')].every((x) => x.getAttribute('data-state') === 'idle'), { timeoutMs: 5000, intervalMs: 100 });
  const reverted = await lib.eval(() => [...document.querySelectorAll('.lib-copy__button')].map((x) => x.getAttribute('data-state')));
  check('ac7-copy-success-reverts-to-idle', reverted.every((s) => s === 'idle'), reverted);
  const aria = await lib.eval(() => ({ name: document.querySelector('.lib-copy__button').getAttribute('aria-label'), tip: document.querySelector('.lib-copy__tip').textContent, live: [...document.querySelectorAll('.lib > .tj-sr-only[role="status"]')].map((x) => x.textContent).join('|') }));
  check('ac7-copy-accessibility', aria.name.startsWith('نسخ تعليمات ترجمة: Do schools kill creativity?') && aria.tip === 'ينسخ تعليمات الترجمة لترفقها مع ملف SRT.' && /نُسخت تعليمات الترجمة\./.test(aria.live ?? '') && !/لا نتائج/.test(aria.live ?? ''), aria);

  // فشل الحافظة: «أعد المحاولة» ورسالة عابرة (برفض مصطنع للكتابة).
  await lib.eval(() => { Object.defineProperty(Clipboard.prototype, 'writeText', { configurable: true, value: () => Promise.reject(new DOMException('رفض اختباري', 'NotAllowedError')) }); });
  const failBtn = `${rowSel(1)} .lib-copy__button`;
  await clickSel(lib, failBtn);
  const failed = await STATE(lib, failBtn, 'error');
  const failInfo = await lib.eval(() => ({ label: document.querySelector('.lib-copy__button[data-state="error"]')?.textContent.trim(), toast: document.querySelector('.lib-toast--danger')?.textContent.trim() }));
  await snap(lib, 'library-copy-error');
  const failScan = await scanNoTemplate(lib);
  check('ac7-copy-failure-state', !!failed && failInfo.label === 'أعد المحاولة' && failInfo.toast === 'تعذّر النسخ إلى الحافظة. أعد المحاولة.' && failScan.hits.length === 0 && failScan.textareas === 0, { ...failInfo, hits: failScan.hits.length });
  await lib.reload();
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length === 4, { timeoutMs: 10000 });
  if (ONLY === 'copy') throw new Done();

  // القائمة والتصدير: العربية بتوقيت التصدير (إزاحة +0.5 ← سؤال)، والإنجليزية المستخرجة.
  await clickText(lib, rowSel(1), 'تصدير SRT');
  await snap(lib, 'library-export-menu');
  await clickText(lib, `${rowSel(1)} .lib-menu__list:not([hidden])`, 'العربية — النسخة الحالية');
  await lib.waitFor(() => document.querySelector('dialog[open]'), { timeoutMs: 4000 });
  const timingTitle = await lib.eval(() => document.querySelector('dialog[open] h2')?.textContent);
  await snap(lib, 'library-export-timing-dialog');
  await clickSel(lib, 'dialog[open] button[value="confirm"]');
  const arFile = await waitFile(`${SEED_IDS.ted}.ar.srt`);
  const arCues = arFile ? parseSrtStrict(await readFile(arFile, 'utf8')) : [];
  const ted = seed.items[0].record;
  const tedCurrent = ted.arabic.current ?? ted.arabic.original;
  check('ac2-export-arabic-with-offset', timingTitle === 'توقيت الملف المصدَّر' && arCues.length === 427 && arCues[0].startMs === tedCurrent[0].startMs + 500 && arCues[0].text.endsWith('(معدّلة)'), { dialog: timingTitle, cues: arCues.length, shifted: arCues[0] && arCues[0].startMs - tedCurrent[0].startMs });
  const i2 = await rowOf(lib, SEED_IDS.asr);
  await clickText(lib, rowSel(i2), 'تصدير SRT');
  await clickText(lib, `${rowSel(i2)} .lib-menu__list:not([hidden])`, 'الإنجليزية — المستخرجة');
  const enFile = await waitFile(`${SEED_IDS.asr}.en.asr.normal.srt`);
  const enCues = enFile ? parseSrtStrict(await readFile(enFile, 'utf8')) : [];
  check('ac2-export-english-normal', enCues.length === seed.items[1].record.english[0].cues.length && enCues.length > 1000, { cues: enCues.length });

  // فتح الفيديو والتعديل.
  const before = new Set((await b.conn.send('Target.getTargets')).targetInfos.map((t) => t.targetId));
  await clickText(lib, rowSel(1), 'فتح الفيديو');
  const opened = await waitForTarget(b.conn, (u) => u.startsWith(`https://www.youtube.com/watch?v=${SEED_IDS.ted}`), { exclude: before });
  if (opened) await b.conn.send('Target.closeTarget', { targetId: opened.targetId });
  await clickText(lib, rowSel(1), 'تعديل');
  const editor = await waitForTarget(b.conn, (u) => u === `chrome-extension://${extId}/pages/editor/index.html?v=${SEED_IDS.ted}`, { exclude: before });
  if (editor) await b.conn.send('Target.closeTarget', { targetId: editor.targetId });
  check('ac2-open-video-and-edit', !!opened && !!editor, { video: !!opened, editor: !!editor });

  // الاستبدال: منتقي ملفات ← حوار مقارنة ← تأكيد.
  await lib.send('Page.setInterceptFileChooserDialog', { enabled: true });
  const replFile = path.join(DOWNLOADS, 'replacement.ar.srt');
  await writeFile(replFile, replacementSrt(ted.english[0].cues));
  const chooser = lib.conn.waitFor('Page.fileChooserOpened', () => true, { sessionId: lib.sessionId, timeoutMs: 8000 });
  await clickText(lib, rowSel(1), 'استبدال');
  const fc = await chooser;
  await lib.send('DOM.enable');
  await lib.send('DOM.setFileInputFiles', { files: [replFile], backendNodeId: fc.backendNodeId });
  await lib.waitFor(() => document.querySelector('dialog[open]'), { timeoutMs: 8000 });
  const replDialog = await lib.eval(() => ({ title: document.querySelector('dialog[open] h2').textContent, body: document.querySelector('dialog[open]').textContent.replace(/\s+/g, ' ') }));
  await snap(lib, 'library-replace-dialog');
  await clickSel(lib, 'dialog[open] button[value="confirm"]');
  await lib.waitFor(() => document.querySelector('.lib-toast--success'), { timeoutMs: 6000 });
  const stored = await lib.eval(async (id) => (await chrome.storage.local.get(`video:${id}`))[`video:${id}`], { args: [SEED_IDS.ted] });
  check('ac2-replace-with-compare-dialog', /^استبدال ترجمة /.test(replDialog.title) && /مطابق للأصل ✓/.test(replDialog.body) && /ستُصفَّر إزاحة العرض/.test(replDialog.body) && stored.arabic.original[0].text === 'ترجمة بديلة للمقطع 1' && stored.view.displayOffsetMs === 0 && stored.arabic.current === null, { title: replDialog.title.slice(0, 20), offset: stored.view.displayOffsetMs, first: stored.arabic.original[0].text });

  // الحذف بتأكيد يحدد ما يُحذف: العربية فقط ثم كل البيانات.
  const iT = await rowOf(lib, SEED_IDS.typo);
  await clickText(lib, rowSel(iT), 'المزيد');
  await clickText(lib, `${rowSel(iT)} .lib-menu__list:not([hidden])`, 'حذف');
  await lib.waitFor(() => document.querySelector('dialog[open]'), { timeoutMs: 4000 });
  const delDialog = await lib.eval(() => ({ title: document.querySelector('dialog[open] h2').textContent, options: [...document.querySelectorAll('dialog[open] .lib-choice__label')].map((x) => x.textContent), warn: document.querySelector('dialog[open] .tj-dialog__body')?.textContent, danger: document.querySelector('dialog[open] button[value="confirm"]').classList.contains('tj-btn--danger') }));
  await snap(lib, 'library-delete-dialog');
  await clickSel(lib, 'dialog[open] button[value="confirm"]');
  await lib.waitFor(() => !document.querySelector('dialog[open]') && document.querySelector('.lib-toast--success'), { timeoutMs: 6000 });
  const afterAr = await lib.eval(async (id) => (await chrome.storage.local.get(`video:${id}`))[`video:${id}`], { args: [SEED_IDS.typo] });
  const iU = await rowOf(lib, SEED_IDS.untitled);
  await clickText(lib, rowSel(iU), 'المزيد');
  await clickText(lib, `${rowSel(iU)} .lib-menu__list:not([hidden])`, 'حذف');
  await lib.waitFor(() => document.querySelector('dialog[open]'), { timeoutMs: 4000 });
  await clickText(lib, 'dialog[open]', 'كل بيانات هذا الفيديو');
  await clickSel(lib, 'dialog[open] button[value="confirm"]');
  await lib.waitFor(() => !document.querySelector('dialog[open]'), { timeoutMs: 6000 });
  await sleep(600);
  const afterAll = await lib.eval(async (id) => ({ rec: (await chrome.storage.local.get(`video:${id}`))[`video:${id}`] ?? null, idx: (await chrome.storage.local.get(`index:${id}`))[`index:${id}`] ?? null, rows: document.querySelectorAll('li.lib-row').length }), { args: [SEED_IDS.untitled] });
  check('ac2-delete-with-explicit-confirmation', /^حذف ترجمة /.test(delDialog.title) && delDialog.options.length === 2 && delDialog.warn === 'لا يمكن التراجع عن الحذف.' && delDialog.danger && afterAr.arabic === null && afterAr.english.length === 1 && afterAr.fingerprints.length === 1 && afterAll.rec === null && afterAll.idx === null && afterAll.rows === 3, { options: delDialog.options.length, arabicGone: afterAr.arabic === null, englishKept: afterAr.english.length, rows: afterAll.rows });

  // الحالات: تحميل وخطأ بتعطيل مصطنع للتخزين قبل تحميل الصفحة.
  const loadPage = await openTab(b.conn, 'about:blank');
  errors.push(collectErrors(loadPage, { extId }));
  await loadPage.send('Page.addScriptToEvaluateOnNewDocument', { source: 'chrome.storage.local.get = () => new Promise(() => {});' });
  await loadPage.goto(`chrome-extension://${extId}/pages/library/index.html`).catch(() => {});
  await sleep(800);
  const loading = await loadPage.eval(() => !!document.querySelector('.lib-skeleton[aria-busy="true"]'));
  check('ac3-loading-state', loading);
  await shoot(loadPage, 'library-loading', { width: 1440, schemes: ['light'] });
  await loadPage.close();
  const errPage = await openTab(b.conn, 'about:blank');
  errors.push(collectErrors(errPage, { extId }));
  await errPage.send('Page.addScriptToEvaluateOnNewDocument', { source: 'chrome.storage.local.get = () => Promise.reject(new Error("اختبار: فشل القراءة")); chrome.storage.local.getKeys = chrome.storage.local.get;' });
  await errPage.goto(`chrome-extension://${extId}/pages/library/index.html`).catch(() => {});
  await errPage.waitFor(() => document.querySelector('.tj-alert--danger'), { timeoutMs: 8000 });
  const errState = await errPage.eval(() => ({ text: document.querySelector('.tj-alert--danger').textContent.replace(/\s+/g, ' '), diag: !!document.querySelector('.tj-alert--danger button') }));
  check('ac3-error-state', /تعذّرت قراءة المحفوظات/.test(errState.text) && errState.diag, { diag: errState.diag });
  await shoot(errPage, 'library-error', { width: 1440, schemes: ['light'] });
  await errPage.close();

  // ===== ٣. الإعدادات (P7-AC4/AC8/AC9/AC10) =====
  const st = await openExt('pages/settings/index.html');
  await st.waitFor(() => document.querySelectorAll('.st-card').length >= 7, { timeoutMs: 10000 });
  await st.eval(() => document.fonts.ready.then(() => true));
  const uiFonts = () => st.eval(() => ['body', 'h1', 'h2', '.tj-label', '.tj-caption', '.tj-btn', '.st-seg__label', '.st-note', '.st-link', '.st-card'].map((s) => `${s}=${getComputedStyle(document.querySelector(s)).fontFamily}`));
  const fontsBefore = await uiFonts();
  await shoot(st, 'settings-1440', { width: 1440 });
  await shoot(st, 'settings-narrow-480', { width: 480, schemes: ['light'] });

  const sections = await st.eval(() => [...document.querySelectorAll('.st-card h2')].map((h) => h.textContent));
  check('ac4-settings-sections', sections.join('|') === 'العرض|التوقيت|التصدير|المقارنة|التخزين|التشخيص|حول', sections);
  const noToggle = await st.eval(() => !/أظهر تعليمات النموذج/.test(document.body.textContent) && !document.querySelector('textarea'));
  check('ac9-no-show-instructions-toggle', noToggle);

  // الخط: اختيار بضغطة، «حُفظ»، المعاينة، والخطوط المضمّنة محمّلة محليًا.
  await clickText(st, '.st-fonts', 'مركزي');
  await st.waitFor(() => document.querySelector('.st-saved--success'), { timeoutMs: 4000, intervalMs: 80 });
  const afterFont = await st.eval(async () => ({
    saved: document.querySelector('.st-saved--success')?.textContent,
    preview: getComputedStyle(document.querySelector('.st-preview__stage')).fontFamily,
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')).sort(),
    stored: (await chrome.storage.local.get('settings')).settings.appearance.font,
  }));
  await snap(st, 'settings-font-saved');
  check('ac8-font-choice-saved-and-preview', afterFont.saved === 'حُفظ' && afterFont.stored === 'markazi' && /^"?Tarjuman Subtitle Markazi Text/.test(afterFont.preview) && afterFont.loaded.length >= 4, { saved: afterFont.saved, stored: afterFont.stored, loadedFamilies: afterFont.loaded.length });
  const fontsAfter = await uiFonts();
  check('ac9-ui-fonts-unchanged-by-subtitle-font', JSON.stringify(fontsBefore) === JSON.stringify(fontsAfter), { before: fontsBefore.length, same: JSON.stringify(fontsBefore) === JSON.stringify(fontsAfter) });

  // المنزلق: لوحة المفاتيح.
  const sliderInfo = () => st.eval(() => { const s = document.querySelector('.st-scale__input'); return { v: Number(s.value), min: s.min, max: s.max, step: s.step, out: document.querySelector('.st-scale__value').textContent, size: getComputedStyle(document.querySelector('.st-preview__stage')).fontSize }; });
  await st.eval(() => document.querySelector('.st-scale__input').focus());
  const s0 = await sliderInfo();
  await st.key('ArrowRight', 'ArrowRight', 39);
  const s1 = await sliderInfo();
  await st.key('ArrowLeft', 'ArrowLeft', 37);
  const s2 = await sliderInfo();
  await st.key('End', 'End', 35);
  const sEnd = await sliderInfo();
  await st.key('Home', 'Home', 36);
  const sHome = await sliderInfo();
  await st.key('End', 'End', 35);
  await sleep(500);
  check('ac8-slider-keyboard', s0.v === 100 && s0.min === '70' && s0.max === '160' && s0.step === '5' && Math.abs(s1.v - s0.v) === 5 && s2.v === s0.v && sEnd.v === 160 && sHome.v === 70 && sEnd.out === '160%' && sHome.out === '70%' && parseFloat(sEnd.size) > parseFloat(sHome.size), { start: s0.v, right: s1.v, left: s2.v, end: sEnd.v, home: sHome.v, previewPx: [sHome.size, sEnd.size] });
  await st.waitFor(() => document.querySelector('.st-saved--success'), { timeoutMs: 3000, intervalMs: 80 });
  const savedScale = await settingsOf(st);
  check('ac8-slider-saved', savedScale.appearance.scale === 160, { scale: savedScale.appearance.scale });
  await snap(st, 'settings-scale-160');
  const resetState = await st.eval(() => document.querySelector('.st-reset').getAttribute('aria-disabled'));
  check('ac8-reset-enabled-after-change', resetState === 'false', { disabled: resetState });
  await clickText(st, '.st-reset-row', 'استعادة الخط والحجم الافتراضيين');
  await sleep(500);
  const afterReset = await st.eval(async () => ({ s: (await chrome.storage.local.get('settings')).settings.appearance, disabled: document.querySelector('.st-reset').getAttribute('aria-disabled'), reason: document.querySelector('.st-reset').title }));
  check('ac8-reset-restores-defaults-and-disables', afterReset.s.font === 'almarai' && afterReset.s.scale === 100 && afterReset.disabled === 'true' && afterReset.reason === 'الخط والحجم افتراضيان بالفعل.', afterReset);

  // بقية الخيارات: وضع العرض، الخلفية، الموضع، الخطوة، التصدير، المقارنة.
  await clickText(st, 'body', 'العربية فوق الإنجليزية');
  await clickText(st, 'body', 'صلبة');
  await clickText(st, 'body', 'مرتفع');
  await clickText(st, 'body', 'مخصص');
  await st.eval(() => { const i = document.querySelector('.st-custom input'); i.focus(); i.select(); });
  await st.send('Input.insertText', { text: '0.05' });
  await st.key('Tab', 'Tab', 9);
  const stepErr = await st.eval(() => document.querySelector('.st-custom .tj-field__error').textContent);
  await st.eval(() => { const i = document.querySelector('.st-custom input'); i.focus(); i.select(); });
  await st.send('Input.insertText', { text: '2' });
  await st.key('Tab', 'Tab', 9);
  await clickText(st, 'body', 'مقاطع أطول');
  const setField = async (label, text) => {
    await st.eval((l) => { const f = [...document.querySelectorAll('.st-num')].find((x) => x.querySelector('label').textContent === l); const i = f.querySelector('input'); i.focus(); i.select(); }, { args: [label] });
    await st.send('Input.insertText', { text });
    await st.key('Tab', 'Tab', 9);
  };
  await setField('عتبة اقتراح التقسيم الاحتياطي', '350');
  await setField('عتبة انحراف التوقيت', '250');
  await setField('نسبة الاكتمال', '90');
  await sleep(600);
  const all = await settingsOf(st);
  check('ac4-all-options-saved-instantly', all.displayModeDefault === 'dual' && all.appearance.background === 'solid' && all.appearance.position === 'raised' && all.offsetStepMs === 2000 && all.export.modeDefault === 'long' && all.export.splitThreshold === 350 && all.thresholds.driftMs === 250 && all.thresholds.completeness === 0.9 && stepErr === 'الخطوة من 0.1 إلى 10 ثوانٍ بمضاعفات 0.1.', { dual: all.displayModeDefault, step: all.offsetStepMs, split: all.export.splitThreshold, drift: all.thresholds.driftMs, completeness: all.thresholds.completeness, stepErr: !!stepErr });
  await shoot(st, 'settings-changed-1440', { width: 1440, schemes: ['light'] });

  // التخزين والتشخيص.
  const diagBefore = readClipboard();
  await clickText(st, 'body', 'نسخ تقرير التشخيص');
  await sleep(800);
  const diagText = readClipboard();
  let diag = null;
  try { diag = JSON.parse(diagText); } catch { /* يُسجَّل أدناه */ }
  const leak = findSecrets(diagText);
  check('ac4-diagnostics-sanitized', !!diag && diag.sections?.library?.videos === 3 && diagBefore !== diagText && !diagText.includes('Do schools') && !diagText.includes(SEED_IDS.ted) && !diagText.includes('youtube') && leak.length === 0, { keys: diag && Object.keys(diag.sections), videos: diag?.sections?.library?.videos, leaks: leak.length });

  const aboutInfo = await st.eval(() => {
    const about = document.querySelector('.st-about');
    const links = [...about.querySelectorAll('a')].map((a) => ({ text: a.textContent.trim(), target: a.target, rel: a.rel, external: /^https?:/.test(a.getAttribute('href')), host: /^https?:/.test(a.getAttribute('href')) ? new URL(a.href).host : null }));
    return { text: about.textContent.replace(/\s+/g, ' '), links, summaries: [...about.querySelectorAll('summary')].map((s) => s.textContent) };
  });
  const ext2 = aboutInfo.links.filter((l) => l.external);
  check('ac10-about-links-and-credits', /ترجمان — تطوير سلطان/.test(aboutInfo.text) && /خاص حاليًا/.test(aboutInfo.text) && ext2.length === 2 && ext2.every((l) => l.target === '_blank' && /noopener/.test(l.rel)) && ext2.map((l) => l.host).sort().join() === 'bysltan.com,github.com' && /المراعي، ونوتو سانس العربي، وتجوّل، ومركزي/.test(aboutInfo.text) && aboutInfo.links.filter((l) => !l.external).length === 4, { external: ext2.map((l) => l.host), licenses: aboutInfo.links.filter((l) => !l.external).length });
  await st.eval(() => document.querySelectorAll('.st-about details').forEach((d) => { d.open = true; }));
  await shoot(st, 'settings-about-open', { width: 1440 });
  // ضغطة على رابط الرخصة المحلي: تبويب جديد بملف الإضافة نفسه.
  const beforeT = new Set((await b.conn.send('Target.getTargets')).targetInfos.map((t) => t.targetId));
  await clickText(st, '.st-licenses', 'المراعي');
  const licTab = await waitForTarget(b.conn, (u) => u === `chrome-extension://${extId}/ui/fonts/subtitle/almarai-OFL.txt`, { exclude: beforeT });
  let licText = '';
  if (licTab) {
    const lp = await attach(b.conn, licTab.targetId);
    licText = await lp.eval(() => document.body.innerText).catch(() => '');
    await lp.close();
  }
  check('ac10-license-opens-local-in-new-tab', !!licTab && /SIL OPEN FONT LICENSE/i.test(licText), { opened: !!licTab });
  // ضغطة على bysltan.com: تبويب جديد بنطاقه (يُغلق فورًا).
  const beforeS = new Set((await b.conn.send('Target.getTargets')).targetInfos.map((t) => t.targetId));
  await clickText(st, '.st-about__links', 'bysltan.com');
  const siteTab = await waitForTarget(b.conn, (u) => /^https:\/\/(www\.)?bysltan\.com(\/|$)/.test(u), { exclude: beforeS, timeoutMs: 10000 });
  const siteOpener = siteTab ? await (async () => { const sp = await attach(b.conn, siteTab.targetId); const o = await sp.eval(() => window.opener === null).catch(() => null); await sp.close(); return o; })() : null;
  check('ac10-external-link-opens-new-tab-noopener', !!siteTab && siteOpener === true, { opened: !!siteTab, openerNull: siteOpener });

  // الشبكة والأخطاء عبر كل ما سبق.
  const external = nets.reduce((n, x) => n + x.external, 0);
  check('ac5-ac9-no-network-from-extension-pages', external === 0, { pages: nets.length, requests: nets.reduce((n, x) => n + x.total, 0), external, hosts: [...new Set(nets.flatMap((x) => [...x.hosts]))] });

  // ===== ٤. بقاء الخط والحجم بعد إعادة تشغيل المتصفح (P7-AC8) =====
  await clickText(st, '.st-fonts', 'تجوّل');
  await sleep(300);
  await st.eval(() => { const s = document.querySelector('.st-scale__input'); s.focus(); });
  await st.key('End', 'End', 35);
  await st.key('ArrowLeft', 'ArrowLeft', 37);
  await sleep(600);
  const beforeRestart = await settingsOf(st);
  const idBefore = extId;
  await b.close();
  await sleep(2500);
  await start();
  check('ac8-extension-id-stable-across-restart', extId === idBefore, { same: extId === idBefore });
  const st2 = await openExt('pages/settings/index.html');
  await st2.waitFor(() => document.querySelectorAll('.st-card').length >= 7, { timeoutMs: 10000 });
  const afterRestart = await st2.eval(async () => ({
    stored: (await chrome.storage.local.get('settings')).settings.appearance,
    radio: document.querySelector('.st-fonts input:checked')?.value,
    slider: document.querySelector('.st-scale__input').value,
    preview: [document.querySelector('.st-preview__stage').dataset.font ?? document.querySelector('.st-preview__stage').getAttribute('data-font'), document.querySelector('.st-preview__stage').getAttribute('data-scale')],
  }));
  check('ac8-font-and-scale-persist-after-browser-restart', beforeRestart.appearance.font === 'tajawal' && afterRestart.stored.font === 'tajawal' && afterRestart.stored.scale === beforeRestart.appearance.scale && afterRestart.radio === 'tajawal' && Number(afterRestart.slider) === afterRestart.stored.scale && afterRestart.preview[0] === 'tajawal', { before: beforeRestart.appearance, after: afterRestart.stored, radio: afterRestart.radio, slider: afterRestart.slider });

  // ===== ٥. مسح كل البيانات بكتابة «امسح» ثم المحفوظات الفارغة (P7-AC3) =====
  await clickText(st2, 'body', 'مسح كل البيانات');
  await st2.waitFor(() => document.querySelector('dialog[open]'), { timeoutMs: 4000 });
  const gateBefore = await st2.eval(() => ({ disabled: document.querySelector('dialog[open] button[value="confirm"]').getAttribute('aria-disabled'), label: document.querySelector('dialog[open] label')?.textContent }));
  await snap(st2, 'settings-clear-dialog');
  await clickSel(st2, 'dialog[open] button[value="confirm"]');
  const stillThere = await st2.eval(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('video:')).length);
  await st2.eval(() => document.querySelector('dialog[open] input').focus());
  await st2.send('Input.insertText', { text: 'امسح' });
  await sleep(200);
  const gateAfter = await st2.eval(() => document.querySelector('dialog[open] button[value="confirm"]').getAttribute('aria-disabled'));
  await clickSel(st2, 'dialog[open] button[value="confirm"]');
  await sleep(1000);
  const cleared = await st2.eval(async () => ({ videos: Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('video:')).length, font: document.querySelector('.st-fonts input:checked')?.value, reminder: document.querySelector('.tj-alert--info')?.textContent }));
  check('ac4-clear-all-requires-typed-word', gateBefore.disabled === 'true' && /امسح/.test(gateBefore.label) && stillThere === 3 && gateAfter === 'false' && cleared.videos === 0 && cleared.font === 'almarai' && /ثبّت أيقونة ترجمان/.test(cleared.reminder ?? ''), { gate: [gateBefore.disabled, gateAfter], before: stillThere, after: cleared.videos });
  const empty = await openExt('pages/library/index.html');
  await empty.waitFor(() => document.querySelector('.tj-empty'), { timeoutMs: 8000 });
  const emptyInfo = await empty.eval(() => ({ title: document.querySelector('.tj-empty__title').textContent, steps: [...document.querySelectorAll('.tj-empty__steps li')].map((x) => x.textContent) }));
  check('ac3-empty-state', emptyInfo.title === 'لا ترجمات محفوظة بعد' && emptyInfo.steps.join('|') === 'افتح فيديو|اضغط تحميل الترجمة|ارفع ملفك العربي', emptyInfo);
  await shoot(empty, 'library-empty', { width: 1440 });

  // الأخطاء كلها.
  await sleep(500);
  const all2 = errors.flatMap((e) => e.list);
  check('no-extension-errors', all2.length === 0, { count: all2.length, sample: all2.slice(0, 3) });
} catch (err) {
  if (!(err instanceof Done)) check('run', false, { error: String(err.message).replace(/https?:\/\/\S+/g, '[رابط]') });
} finally {
  try { writeClipboard(clipboardBefore); } catch { /* أفضل جهد */ }
  try { await b?.close(); } catch { /* مغلق */ }
  await rm(DOWNLOADS, { recursive: true, force: true });
  result.passed = result.checks.every((c) => c.ok);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  const leaks = findSecrets(text);
  await mkdir(OUT, { recursive: true });
  if (leaks.length) {
    console.error(`رُفضت كتابة الدليل: ${leaks.length} اكتشاف`);
    process.exitCode = 1;
  } else {
    const outName = ONLY ? `live-${ONLY}.json` : 'live.json';
    await writeFile(path.join(OUT, outName), text);
    console.log(`${result.passed ? 'ناجح' : 'فيه إخفاق'} — ${rel(path.join(OUT, outName))}`);
  }
  if (!result.passed) process.exitCode = 1;
}
