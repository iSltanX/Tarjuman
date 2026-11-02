#!/usr/bin/env node
// الاختبار الحي لإعادة تصميم الواجهات (الإعدادات، والمحفوظات، ونافذة الأيقونة، وقوائم المشغّل) على الإضافة المبنية
// في ملف تعريف اختبار منفصل: لقطات بالوضعين الفاتح والداكن والعرض الضيق، ومحفوظات فارغة وقليلة وكثيرة، وعناوين
// طويلة ونص مختلط، وتحققات بنيوية (التنقّل الجانبي وجزء العنوان، والرقائق والبحث، والمحدد 1 2 3، والاتجاه، والقائمة
// المنسدلة، وإغلاق قائمة المشغّل مع الشريط)، وخلو الصفحات من الأخطاء والشبكة. لا رابط ولا رمز في الأدلة.
//   command npm run build:dev -- --out <مجلد خارج المستودع>
//   command node test/live/ui/run.mjs --browser brave|chrome --ext <مجلد> [--out docs/evidence/UI] [--headed] [--skip-youtube]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, human, sleep } from '../harness/browser.mjs';
import { collectErrors, emulateScheme, fullScreenshot, openTab } from '../harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { SEED_IDS, buildSeedFew, buildSeedMany, storageItems } from './seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/UI'), browser);
const HEADED = argv.includes('--headed');
const SKIP_YT = argv.includes('--skip-youtube');
const PROFILE = val('profile', `${browser}-ui-${Date.now()}`);
const rel = (f) => path.relative(ROOT, f);

const result = { browser: null, at: new Date().toISOString(), headless: !HEADED, checks: [], screenshots: [], notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
};
const note = (t) => { result.notes.push(t); console.log(`· ${t}`); };

const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
result.extension = { version: manifest.version, versionName: manifest.version_name ?? null };
const errors = [];
const nets = [];
let extId = null;
let b = null;

async function start() {
  b = await launch({ browser, profile: PROFILE, headless: !HEADED });
  result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  extId = ext.id;
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
    await sleep(250);
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

/** ضغطة Input حقيقية على أول زر/رابط يبدأ نصه أو اسم وصوله بالنص داخل الجذر. */
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
  await human(250, 500);
}
const seedStorage = (page, items) => page.eval((obj) => chrome.storage.local.set(obj), { args: [storageItems(items)] });
const clearStorage = (page) => page.eval(() => chrome.storage.local.clear());

/** قياسات تخطيط: لا عنصر يتجاوز عرض الصفحة أفقيًا، ولا نص مقصوص في الأزرار. */
const layoutAudit = (page) => page.eval(() => {
  const w = document.documentElement.clientWidth;
  const overflow = [...document.querySelectorAll('body *')].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && (r.right > w + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed';
  }).map((e) => `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]}`).slice(0, 6);
  const clipped = [...document.querySelectorAll('.tj-btn, .tj-chip, .tj-menuitem')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow === 'hidden').length;
  return { pageWidth: w, scrollWidth: document.documentElement.scrollWidth, overflow, clipped };
});

try {
  await start();
  console.log(`المتصفح: ${result.browser} · الإضافة ${manifest.version_name ?? manifest.version}`);
  const now = Date.now();
  const few = buildSeedFew(now).items;
  const many = buildSeedMany(now).items;

  // ===== ١. الإعدادات: التنقّل الجانبي والأقسام وجزء العنوان ومكان الحفظ، بالوضعين والعرض الضيق =====
  const st = await openExt('pages/settings/index.html');
  await st.waitFor(() => document.querySelector('.st-nav') && document.querySelectorAll('.st-section').length >= 7, { timeoutMs: 10000 });
  await clearStorage(st);
  await st.eval(() => document.fonts.ready.then(() => true));
  const stInfo = await st.eval(() => ({
    nav: [...document.querySelectorAll('.st-nav__link')].map((a) => ({ t: a.textContent.trim(), cur: a.getAttribute('aria-current') })),
    visible: [...document.querySelectorAll('.st-section')].filter((s) => !s.hidden).map((s) => s.id),
    topbar: !!document.querySelector('.tj-topbar') && document.querySelector('.tj-topbar__link[aria-current="page"]')?.textContent.trim(),
    dir: getComputedStyle(document.documentElement).direction,
    fonts: ['h1', 'body', '.tj-btn'].map((s) => getComputedStyle(document.querySelector(s)).fontFamily.split(',')[0].replace(/"/g, '')),
  }));
  check('settings-side-nav-7-sections-display-active', stInfo.nav.length === 7 && stInfo.nav[0].cur === 'page' && stInfo.visible.join() === 'display' && stInfo.topbar === 'الإعدادات' && stInfo.dir === 'rtl', stInfo);
  await shoot(st, 'settings-display-1440');
  await clickText(st, '.st-nav', 'التصدير');
  const exp = await st.eval(() => ({
    hash: location.hash, visible: [...document.querySelectorAll('.st-section')].filter((s) => !s.hidden).map((s) => s.id),
    radios: [...document.querySelectorAll('#export input[type="radio"]')].filter((r) => ['downloads', 'subfolder', 'ask'].includes(r.value)).map((r) => ({ v: r.value, on: r.checked, off: r.disabled })),
    status: document.querySelector('.st-status')?.textContent.trim(), folder: document.querySelector('.st-subfolder')?.value,
  }));
  check('settings-export-hash-and-save-location', exp.hash === '#export' && exp.visible.join() === 'export' && exp.radios[0].on && exp.radios[1].off && exp.radios[2].off && exp.status === 'المكان الآن: مجلد التنزيلات' && exp.folder === 'Tarjuman', exp);
  await shoot(st, 'settings-export-1440');
  // فتح الصفحة على قسم من الرابط مباشرة.
  const st2 = await openExt('pages/settings/index.html#storage');
  await st2.waitFor(() => document.querySelector('.st-nav'), { timeoutMs: 8000 });
  const st2Info = await st2.eval(() => ({ visible: [...document.querySelectorAll('.st-section')].filter((s) => !s.hidden).map((s) => s.id), cur: document.querySelector('.st-nav__link[aria-current="page"]')?.textContent.trim() }));
  check('settings-opens-on-hash-section', st2Info.visible.join() === 'storage' && st2Info.cur === 'التخزين', st2Info);
  await st2.close();
  for (const [id, name] of [['timing', 'التوقيت'], ['compare', 'المقارنة'], ['storage', 'التخزين'], ['diagnostics', 'التشخيص'], ['about', 'حول']]) {
    await clickText(st, '.st-nav', name);
    await shoot(st, `settings-${id}-1440`, { schemes: ['light'] });
  }
  // الحفظ والعلامة و«استعادة الافتراضي».
  await clickText(st, '.st-nav', 'العرض');
  await clickText(st, '#display', 'العربية فوق الإنجليزية');
  await st.waitFor(() => document.querySelector('.st-saved--success'), { timeoutMs: 4000, intervalMs: 80 });
  const saved = await st.eval(async () => ({
    mark: document.querySelector('.st-saved--success')?.textContent, stored: (await chrome.storage.local.get('settings')).settings?.displayModeDefault,
    reset: document.querySelector('#display .st-section__reset')?.getAttribute('aria-disabled'),
  }));
  check('settings-save-mark-and-reset-enabled', saved.mark === 'حُفظ' && saved.stored === 'dual' && saved.reset === 'false', saved);
  await snap(st, 'settings-saved-mark');
  await clickText(st, '#display', 'استعادة الافتراضي');
  await sleep(600);
  const afterReset = await st.eval(async () => ({ stored: (await chrome.storage.local.get('settings')).settings?.displayModeDefault, reset: document.querySelector('#display .st-section__reset')?.getAttribute('aria-disabled') }));
  check('settings-reset-restores-section', afterReset.stored === 'ar' && afterReset.reset === 'true', afterReset);
  const stNarrow = await layoutAudit(st);
  await shoot(st, 'settings-narrow-480', { width: 480, schemes: ['light'] });
  const narrowInfo = await st.eval(() => ({ navRow: getComputedStyle(document.querySelector('.st-nav')).flexDirection, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('settings-layout-no-overflow', stNarrow.overflow.length === 0 && stNarrow.clipped === 0, stNarrow);
  note(`الإعدادات في 480: التنقّل ${narrowInfo.navRow} · عرض التمرير ${narrowInfo.sw} من ${narrowInfo.cw}`);
  await st.close();

  // ===== ٢. المحفوظات: فارغة، ثم قليلة (الصف والمحدد والإجراءات والقائمة)، ثم كثيرة (الرقائق والبحث والمزيد) =====
  const lib = await openExt('pages/library/index.html');
  await lib.waitFor(() => document.querySelector('.lib') && !document.querySelector('.lib-skeleton'), { timeoutMs: 10000 });
  const empty = await lib.eval(() => ({ title: document.querySelector('.tj-empty__title')?.textContent, steps: document.querySelectorAll('.tj-empty__steps li').length, toolbarHidden: document.querySelector('.lib-toolbar')?.hidden }));
  check('library-empty-state', empty.title === 'لا ترجمات محفوظة بعد' && empty.steps === 3 && empty.toolbarHidden === true, empty);
  await shoot(lib, 'library-empty-1440');

  await seedStorage(lib, few);
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length === 4, { timeoutMs: 10000 });
  const rows = await lib.eval(() => [...document.querySelectorAll('li.lib-row')].map((r) => ({
    title: r.querySelector('h2').textContent.slice(0, 40), id: r.querySelector('bdi')?.textContent,
    idDir: getComputedStyle(r.querySelector('bdi')).direction, titleBidi: getComputedStyle(r.querySelector('h2')).unicodeBidi,
    slots: [...r.querySelectorAll('.tj-slots__slot')].map((s) => `${s.textContent}:${s.getAttribute('aria-checked') === 'true' ? 'on' : s.getAttribute('data-filled') === 'true' ? 'filled' : 'empty'}`).join(' '),
    badges: [...r.querySelectorAll('.tj-pill')].map((p) => p.textContent),
    actions: [...r.querySelectorAll('.lib-row__actions button')].map((x) => x.getAttribute('aria-label') ?? x.textContent.trim()),
    height: Math.round(r.getBoundingClientRect().height),
  })));
  const counts = await lib.eval(() => [...document.querySelectorAll('.tj-chip')].map((c) => c.getAttribute('aria-label')));
  const okRows = rows.every((r) => r.idDir === 'ltr' && r.titleBidi === 'plaintext');
  const awaiting = rows.find((r) => r.id === 'Y9rkKtK1b44');
  const translated = rows.find((r) => r.id === 'iG9CE55wbtY');
  check('library-rows-slots-and-actions', okRows && translated.slots === '1:on 2:empty 3:empty' && awaiting.slots === '1:empty 2:empty 3:empty' && translated.actions[0].startsWith('تعديل') && awaiting.actions[0].startsWith('رفع') && translated.badges.includes('AR معدّلة'), { rows, counts });
  check('library-filter-counts', counts.join('|') === 'الكل (4)|مترجمة (3)|بانتظار الترجمة (1)|معدّلة (1)|تحذيرات المقارنة (1)', counts);
  await shoot(lib, 'library-few-1440');

  // قائمة «المزيد» مفتوحة: تصدير مجموعة ثم استبدال ثم حذف.
  await clickText(lib, 'ul.lib-list > li:nth-child(1)', 'المزيد');
  const more = await lib.eval(() => ({
    open: !!document.querySelector('.tj-menu__list:not([hidden])'),
    items: [...document.querySelectorAll('.tj-menu__list:not([hidden]) [role="menuitem"]')].map((i) => ({ t: i.querySelector('.tj-menu__label')?.textContent, off: i.getAttribute('aria-disabled') === 'true', danger: i.classList.contains('tj-menu__item--danger') })),
    group: document.querySelector('.tj-menu__list:not([hidden]) .tj-menu__group')?.textContent,
    inView: (() => { const r = document.querySelector('.tj-menu__list:not([hidden])').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })(),
  }));
  check('library-more-menu', more.open && more.group === 'تصدير SRT' && more.items.length === 5 && more.items.at(-1).danger && more.inView, more);
  await snap(lib, 'library-more-menu-open');
  await lib.key('Escape', 'Escape', 27);
  await sleep(200);
  check('library-more-menu-escape-closes', !(await lib.eval(() => !!document.querySelector('.tj-menu__list:not([hidden])'))));

  // «نسخ التعليمات»: الحالة تتحول ولا يظهر نص التعليمات.
  await clickSel(lib, 'ul.lib-list > li:nth-child(1) .lib-copy__button');
  await lib.waitFor(() => document.querySelector('ul.lib-list > li:nth-child(1) .lib-copy__button')?.getAttribute('data-state') === 'success', { timeoutMs: 4000, intervalMs: 80 });
  const noTemplate = await lib.eval(() => !document.body.textContent.includes('أرفقتُ ملف ترجمة') && !document.querySelector('textarea'));
  check('library-copy-state-no-template', noTemplate);
  await snap(lib, 'library-copy-success');

  // البحث ثم لا نتائج، والرقائق، وجزء العنوان.
  await lib.eval(() => { const i = document.querySelector('.lib-search__input'); i.focus(); i.value = 'what?'; i.dispatchEvent(new Event('input')); });
  await sleep(200);
  const noRes = await lib.eval(() => ({ title: document.querySelector('.tj-empty__title')?.textContent, hash: location.hash }));
  check('library-search-no-results-isolated-and-hash', /لا نتائج لـ«.*what\?.*»/.test(noRes.title ?? '') && noRes.hash.startsWith('#q='), noRes);
  await snap(lib, 'library-search-no-results');
  await clickText(lib, '.tj-empty', 'مسح البحث');
  await clickText(lib, '.tj-chips', 'بانتظار الترجمة');
  const filtered = await lib.eval(() => ({ n: document.querySelectorAll('li.lib-row').length, hash: location.hash, pressed: document.querySelector('.tj-chip[aria-pressed="true"]')?.getAttribute('aria-label') }));
  check('library-filter-awaiting', filtered.n === 1 && filtered.hash === '#f=awaiting' && filtered.pressed === 'بانتظار الترجمة (1)', filtered);
  await lib.reload();
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length === 1, { timeoutMs: 8000 });
  check('library-filter-survives-reload', (await lib.eval(() => document.querySelector('.tj-chip[aria-pressed="true"]')?.getAttribute('data-filter'))) === 'awaiting');
  await clickText(lib, '.tj-chips', 'الكل');

  // الرجوع من المحرّر: الصف المقصود مُبرَز.
  const lib2 = await openExt(`pages/library/index.html#v=${SEED_IDS.typo}`);
  await lib2.waitFor(() => document.querySelector('li.lib-row--target'), { timeoutMs: 8000 });
  const target = await lib2.eval(() => ({ id: document.querySelector('li.lib-row--target')?.getAttribute('data-video'), hash: location.hash }));
  check('library-return-row-highlighted', target.id === SEED_IDS.typo && target.hash === '', target);
  await snap(lib2, 'library-return-target');
  await lib2.close();

  // كثيرة: ستون فيديو بعناوين طويلة ومختلطة.
  await seedStorage(lib, many);
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length === 50, { timeoutMs: 10000 });
  const manyInfo = await lib.eval(() => ({
    rows: document.querySelectorAll('li.lib-row').length, more: !!document.querySelector('.lib-more-rows'), counts: [...document.querySelectorAll('.tj-chip')].map((c) => c.getAttribute('aria-label')),
    tallest: Math.max(...[...document.querySelectorAll('li.lib-row')].map((r) => Math.round(r.getBoundingClientRect().height))),
    clamped: [...document.querySelectorAll('li.lib-row h2')].filter((h) => h.scrollHeight > h.clientHeight + 2).length,
    titledFull: [...document.querySelectorAll('li.lib-row h2')].every((h) => h.title === h.textContent || h.classList.contains('lib-row__title--empty')),
  }));
  check('library-many-rows-clamped-with-full-title', manyInfo.rows === 50 && manyInfo.more && manyInfo.titledFull && manyInfo.tallest <= 120, manyInfo);
  await shoot(lib, 'library-many-1440', { schemes: ['light', 'dark'] });
  await clickText(lib, '.lib', 'عرض المزيد');
  check('library-show-more', (await lib.eval(() => document.querySelectorAll('li.lib-row').length)) === 60);
  const libAudit = await layoutAudit(lib);
  check('library-layout-no-overflow', libAudit.overflow.length === 0 && libAudit.clipped === 0, libAudit);
  await shoot(lib, 'library-narrow-480', { width: 480, schemes: ['light'] });
  await lib.close();

  // ===== ٣. نافذة الأيقونة: ليست صفحة فيديو (آخر الترجمات)، ثم على فيديو بلا ترجمة ثم بترجمة =====
  const popupFg = await openExt('pages/popup/index.html');
  await popupFg.waitFor(() => document.querySelector('.tj-popup__menu') && !document.querySelector('[aria-busy="true"]'), { timeoutMs: 8000 });
  const notVideo = await popupFg.eval(() => ({
    status: document.querySelector('.tj-popup__status')?.textContent.trim(), recent: document.querySelectorAll('.tj-popup__recent-row').length,
    menu: [...document.querySelectorAll('.tj-menuitem .tj-menuitem__name')].map((x) => x.textContent), actions: document.querySelectorAll('.tj-popup__actions [data-action]').length,
    h: Math.round(document.documentElement.scrollHeight), w: Math.round(document.documentElement.clientWidth),
  }));
  check('popup-not-video-recent', notVideo.status === 'افتح فيديو على يوتيوب لتظهر حالته هنا.' && notVideo.recent === 3 && notVideo.menu.join('|') === 'المحفوظات|الإعدادات' && notVideo.actions === 0 && notVideo.h <= 520, notVideo);
  await shoot(popupFg, 'popup-not-video', { width: 340 });
  await popupFg.close();

  if (!SKIP_YT) {
    const yt = await openTab(b.conn, 'about:blank');
    errors.push(collectErrors(yt, { extId, onlyExtension: true }));
    await yt.goto(`https://www.youtube.com/watch?v=${SEED_IDS.ted}`);
    await dismissConsent(yt).catch(() => false);
    const ready = await waitForPlayer(yt, SEED_IDS.ted);
    if (await yt.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
    check('youtube-watch-ready', !!ready);
    await yt.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; v.pause(); })).catch(() => {});
    await sleep(2500);
    const openPopupBg = async () => {
      await b.conn.send('Target.activateTarget', { targetId: yt.targetId });
      const p = await openExt('pages/popup/index.html', { background: true });
      await p.waitFor(() => document.querySelector('.tj-popup__menu') && !document.querySelector('[aria-busy="true"]'), { timeoutMs: 8000 });
      return p;
    };
    const popupInfo = (p) => p.eval(() => ({
      status: document.querySelector('.tj-popup__status')?.textContent.replace(/\s+/g, ' ').trim(),
      tools: document.querySelector('.tj-popup__tools')?.textContent.trim(),
      actions: [...document.querySelectorAll('.tj-popup__actions [data-action]')].map((x) => ({ a: x.getAttribute('data-action'), primary: x.classList.contains('tj-popup__primary'), off: x.getAttribute('aria-disabled') === 'true' })),
      pills: [...document.querySelectorAll('.tj-popup__pills .tj-pill')].map((x) => x.textContent),
      h: Math.round(document.documentElement.scrollHeight),
    }));
    // الفيديو المبذور له ترجمة معدّلة بإزاحة +0.5.
    const withSub = await openPopupBg();
    const ws = await popupInfo(withSub);
    check('popup-with-subtitle-actions', /ترجمة عربية · \d+ مقطعًا · الإزاحة \+0\.5 ث/.test(ws.status) && ws.actions.map((a) => a.a).join() === 'editor,copy,find' && ws.actions[0].primary && ws.pills.includes('معدّلة') && /أدوات المشغّل/.test(ws.tools ?? '') && ws.h <= 520, ws);
    await shoot(withSub, 'popup-with-subtitle', { width: 340 });
    // «نسخ تعليمات الترجمة» من النافذة: تتحول الحالة ولا نص للتعليمات في الصفحة.
    await withSub.eval(() => Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { globalThis.__tjLen = t.length; } }));
    await clickSel(withSub, '[data-action="copy"]');
    await withSub.waitFor(() => document.querySelector('[data-action="copy"]')?.getAttribute('data-state') === 'success', { timeoutMs: 4000, intervalMs: 80 });
    const copied = await withSub.eval(() => ({ len: globalThis.__tjLen ?? 0, leaked: document.body.textContent.includes('أرفقتُ ملف ترجمة') }));
    check('popup-copy-instructions', copied.len > 500 && !copied.leaked, copied);
    await snap(withSub, 'popup-copy-success');
    await withSub.close();
    // بلا ترجمة: حذف السجل ثم النافذة.
    const tmp = await openExt('pages/settings/index.html', { background: true });
    await tmp.eval((id) => chrome.storage.local.remove([`video:${id}`, `index:${id}`]), { args: [SEED_IDS.ted] });
    await tmp.close();
    await sleep(1500);
    const noSub = await openPopupBg();
    const ns = await popupInfo(noSub);
    check('popup-no-subtitle-actions', /لا ترجمة عربية محفوظة/.test(ns.status) && ns.actions[0]?.a === 'copy' && ns.actions[0].primary && ns.actions.find((a) => a.a === 'find')?.off === true, ns);
    await shoot(noSub, 'popup-no-subtitle', { width: 340 });
    await noSub.close();

    // ===== ٤. قوائم المشغّل: العرض بمحدد 1 2 3، والتوقيت بسطر واحد، والإغلاق مع اختفاء الشريط =====
    const seeder = await openExt('pages/settings/index.html', { background: true });
    await seedStorage(seeder, few);
    await seeder.close();
    await sleep(1500);
    await b.conn.send('Target.activateTarget', { targetId: yt.targetId });
    const isoId = yt.isolatedContextId(extId);
    const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
    const peek = () => iso(() => globalThis.__tarjuman.mounted.controls.peek());
    const center = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
    const clickButton = async (kind) => {
      await revealControls(yt);
      const p = await peek();
      const c = center(p.buttons[kind].box);
      await yt.click(c.x, c.y);
      await sleep(400);
    };
    await yt.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 15000 });
    await iso(() => new Promise((r) => { const t = setInterval(() => { const s = globalThis.__tarjuman.controller.getState(); if (s.arabic) { clearInterval(t); r(true); } }, 200); setTimeout(() => { clearInterval(t); r(false); }, 10000); }));
    await clickButton('upload');
    const dm = await peek();
    const slots = dm.layer.menu?.items.filter((i) => i.fid?.startsWith('slot:')) ?? [];
    check('player-display-menu-slots', dm.layer.menu?.label === 'الترجمة العربية' && slots.length === 3 && !dm.layer.menu.text.includes('التفاصيل الكاملة') && dm.layer.menu.box.height <= dm.layer.menu.box.width * 1.4, { label: dm.layer.menu?.label, slots: slots.map((s) => s.text), box: dm.layer.menu?.box });
    await snap(yt, 'player-display-menu');
    // اختفاء الشريط: القائمة المفتوحة بالفأرة تُغلق ولا تعود مع الشريط.
    await yt.mouseMove(40, 40);
    const hidden = await yt.waitFor(() => document.querySelector('#movie_player')?.classList.contains('ytp-autohide'), { timeoutMs: 8000, intervalMs: 250 });
    if (hidden) {
      await sleep(600);
      const afterHide = await peek();
      await revealControls(yt);
      await sleep(400);
      const afterShow = await peek();
      check('player-menu-closes-on-bar-hide', afterHide.layer.menu === null && afterShow.layer.menu === null, { afterHide: afterHide.layer.bar, menuAfterShow: !!afterShow.layer.menu });
    } else {
      note('لم يخفِ يوتيوب الشريط خلال 8 ثوانٍ (الفيديو موقوف)؛ لم يُقَس إغلاق القائمة مع الشريط هنا.');
    }
    await clickButton('badge');
    const tm = await peek();
    check('player-timing-menu-one-note', tm.layer.menu?.label === 'توقيت الترجمة' && tm.layer.menu.text.includes('تُحفظ لهذا الفيديو') && !tm.layer.menu.text.includes('الإزاحة لهذا الفيديو فقط'), { label: tm.layer.menu?.label });
    await snap(yt, 'player-timing-menu');
    await yt.key('Escape', 'Escape', 27);
    await yt.close();
  } else {
    note('تخطّي يوتيوب (--skip-youtube): لم تُلتقط نافذة الأيقونة على فيديو ولا قوائم المشغّل.');
  }

  // ===== ٥. الأخطاء والشبكة =====
  const errs = errors.flatMap((e) => e.list);
  check('no-extension-errors', errs.length === 0, errs.slice(0, 5));
  const external = nets.reduce((s, n) => s + n.external, 0);
  check('no-external-network-from-pages', external === 0, { external, hosts: [...new Set(nets.flatMap((n) => [...n.hosts]))] });
} catch (err) {
  result.error = String(err?.stack ?? err).split('\n').slice(0, 4).join('\n');
  console.error(`✗ توقف: ${err?.message ?? err}`);
} finally {
  await b?.close().catch(() => {});
}

const json = JSON.stringify(result, null, 2);
const secrets = findSecrets(json);
if (secrets.length) {
  console.error(`✗ الأدلة تحوي ما يشبه رابطًا أو رمزًا (${secrets.length})؛ لم تُكتب.`);
  process.exit(2);
}
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'live.json'), `${json}\n`);
const failed = result.checks.filter((c) => !c.ok);
console.log(`\nالنتيجة: ${result.checks.length - failed.length}/${result.checks.length} ناجح · ${result.screenshots.length} لقطة · ${rel(OUT)}/live.json`);
process.exit(failed.length || result.error ? 1 : 0);
