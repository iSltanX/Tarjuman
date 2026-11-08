#!/usr/bin/env node
// دخان حي للإضافة المبنية (P2-AC4، ويعيد استعماله المنسّق وP9): تُحمَّل في ملف اختبار منفصل، وتُفتح صفحة
// مشاهدة، فيُتحقق من سكربت المحتوى ونقاط التركيب ورد نافذة الأيقونة وانعكاس التخزين في المشغّل وفتح
// الصفحات الأربع منها، ومن خلو كل ذلك من أخطاء الإضافة، ومن تحذيرات التثبيت وطلبات الشبكة.
// لا يعتمد على جسم الترجمة، فيصح تحت الأتمتة. لا يكتب رابطًا ولا رمزًا في الأدلة.
//   node test/live/harness/smoke.mjs --browser brave|chrome [--ext dist] [--gallery <بناء تطوير>]
//        [--video iG9CE55wbtY] [--out test-results/live/P2] [--headed]
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BROWSERS, launch, loadExtension, sleep } from './browser.mjs';
import { FONT_READ_LOG, attach, collectErrors, emulateScheme, fullScreenshot, openTab, waitForTarget } from './extension.mjs';
import { recordNetwork } from './netlog.mjs';
import { dismissConsent, waitForPlayer } from './youtube.mjs';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { summarizeVideo } from '../../../src/core/model/video.js';
import { videoRecord } from '../../helpers/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const GALLERY = val('gallery') ? path.resolve(val('gallery')) : null;
const VIDEO = val('video', 'iG9CE55wbtY');
const OUT = path.resolve(ROOT, val('out', 'test-results/live/P2'), browser);
const rel = (f) => path.relative(ROOT, f);
// صورة الفيديو المصغّرة في المحفوظات (قرار سلطان 2026-11-03، Q35: مفعّلة افتراضيًا في Chromium) الطلب الخارجي الوحيد المسموح
// من صفحات الإضافة: من صفحة المحفوظات وحدها، بمعرّف الفيديو، وبلا مُحيل؛ تُعدّ وحدها. كان
// الدخان يعدّها طلبًا خارجيًا فيسقط page-library على أي حزمة حالية (تدقيق Fable، FA-03).
const THUMB_RE = /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/;

const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
const result = { browser: null, at: new Date().toISOString(), extension: { version: manifest.version, versionName: manifest.version_name ?? null, permissions: manifest.permissions }, video: VIDEO, checks: [], errors: {}, screenshots: [], notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

/** حالة الفيديو من نافذة الأيقونة: التبويب النشط أولًا (كما في المنتج)، ثم أي تبويب يرد. */
const stateFromPopup = (page) => page.eval(async () => {
  const req = { type: 'tj:get-video-state', v: 1 };
  const ask = async (tab) => {
    try {
      return await chrome.tabs.sendMessage(tab.id, req);
    } catch {
      return null;
    }
  };
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const viaActive = active ? await ask(active) : null;
  if (viaActive) return { via: 'active-tab', reply: viaActive };
  for (const t of await chrome.tabs.query({})) {
    const r = await ask(t);
    if (r) return { via: 'any-tab', reply: r };
  }
  return { via: 'none', reply: null };
});

/** نافذة الأيقونة في تبويب خلفي بعد تنشيط تبويب يوتيوب، فيكون هو «التبويب النشط» كما في المنتج. */
async function openPopup(conn, extId, errors, activeTargetId) {
  if (activeTargetId) await conn.send('Target.activateTarget', { targetId: activeTargetId });
  const p = await openTab(conn, 'about:blank', { background: true });
  errors.push(collectErrors(p, { extId }));
  await p.goto(`chrome-extension://${extId}/pages/popup/index.html`);
  await p.waitFor(() => !!document.querySelector('.tj-popup__nav'), { timeoutMs: 8000 });
  return p;
}

async function shoot(page, name, { width } = {}) {
  // التبويب الخلفي لا يُرسم، فيُنشَّط للقطة.
  await page.conn.send('Target.activateTarget', { targetId: page.targetId });
  for (const scheme of ['light', 'dark']) {
    await emulateScheme(page, scheme);
    await sleep(150);
    const f = await fullScreenshot(page, path.join(OUT, `${name}-${scheme}.png`), { width });
    result.screenshots.push(rel(f));
  }
  await emulateScheme(page, 'light');
}

/** التحذيرات المتوقعة للأذونات المعتمدة: تحذير سكربتي المحتوى، ومعه تحذير التنزيلات إن كان downloads في البيان. */
const m2 = (w, perms) => (perms.includes('downloads') ? w.downloadsOnly : w.storageOnly);

/** إصدار التطبيق نفسه على macOS (Brave يعلن إصدار Chromium في CDP). */
function appVersion(bin) {
  try {
    const plist = path.join(bin.slice(0, bin.indexOf('.app/') + 4), 'Contents/Info.plist');
    return String(execFileSync('/usr/bin/defaults', ['read', plist, 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}

const b = await launch({ browser, profile: `${browser}-p2`, headless: !argv.includes('--headed') });
result.browser = `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].bin) ?? '?'} (${b.version.product})`;
console.log(`المتصفح: ${result.browser} · الإضافة ${manifest.version_name ?? manifest.version} من ${rel(EXT) || EXT}`);
const pageErrors = [];
try {
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  const extId = ext.id;

  // ١. صفحة مشاهدة: سكربت المحتوى يعمل في عالمه المعزول، ولا يلمس DOM يوتيوب، ولا أخطاء منه.
  const yt = await openTab(b.conn, 'about:blank');
  const ytErrors = collectErrors(yt, { extId, onlyExtension: true });
  const net = recordNetwork(yt);
  await yt.send('Network.enable');
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  const ready = await waitForPlayer(yt, VIDEO);
  await yt.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; })).catch(() => {});
  if (await yt.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  check('watch-page', !!ready, ready ? { durationSec: Math.round(ready.duration) } : null);
  await sleep(2500);
  const iso = yt.isolatedContextId(extId);
  const inIso = iso ? await yt.eval(() => ({ runtime: typeof chrome.runtime?.id, devHook: typeof globalThis.__tarjuman }), { contextId: iso }) : null;
  check('content-script-isolated-world', !!iso && inIso?.runtime === 'string', inIso);
  if (!manifest.version_name) check('no-dev-hook-in-production', inIso?.devHook === 'undefined');
  const touched = await yt.eval(() => document.querySelectorAll('[class^="tj-"], [class*=" tj-"], [id^="tj-"], [data-tarjuman]').length);
  check('stubs-touch-no-youtube-dom', touched === 0, { elements: touched });

  // ٢. نافذة الأيقونة (تبويب خلفي فيبقى يوتيوب نشطًا): رد سكربت المحتوى ونقطتا التركيب.
  const popup = await openPopup(b.conn, extId, pageErrors, yt.targetId);
  const s1 = await stateFromPopup(popup);
  const r1 = s1.reply;
  check('popup-video-state', r1?.watch === true && r1.videoId === VIDEO && r1.arabic === null, r1 && { via: s1.via, videoId: r1.videoId, loading: r1.loading, arabic: r1.arabic, view: r1.view });
  // الطبقة (P5) وأدوات الشريط (P6) ركّبتاهما مرحلتاهما: كل منهما تنتظر المشغّل أو مركّبة.
  check('mount-points-stub', ['waiting', 'mounted'].includes(r1?.mounted?.overlay) && ['waiting', 'mounted'].includes(r1?.mounted?.controls), r1?.mounted ?? null);
  // بعد جولة الصقل: مدخل واحد لكل صفحة في تذييل النافذة، والمحرّر إجراء سريع [data-action="editor"] حين تكون للفيديو ترجمة.
  // الأفعال تُرسم بعد رد سكربت المحتوى والتذييل لا ينتظره، فيُنتظر رسمها لا لحظة ظهور التذييل. أما رد يتجاوز مهلة النافذة
  // (REPLY_TIMEOUT_MS = 1.5 ث) فتعرض فيه النافذة «افتح فيديو…» بلا أفعال، ويسقط الفحص كما ينبغي: رُصد في Edge بلا نافذة، وأول
  // رد قيس هناك فوق المهلة في حزمة الأساس 67fa674 أيضًا (تدقيق Fable، FA-21 وFA-23).
  await popup.waitFor(() => document.querySelectorAll('.tj-popup__actions [data-action]').length > 0, { timeoutMs: 10000 }).catch(() => null);
  const items1 = await popup.eval(() => ({
    menu: [...document.querySelectorAll('.tj-popup__nav [data-action]')].map((x) => ({ name: x.textContent.trim(), disabled: x.getAttribute('aria-disabled') === 'true' })),
    actions: [...document.querySelectorAll('.tj-popup__actions [data-action]')].map((x) => x.getAttribute('data-action')),
  }));
  check('popup-items', items1.menu.length === 2 && items1.menu.map((i) => i.name).join('|') === 'المحفوظات|الإعدادات' && items1.actions.includes('copy'), items1);
  await shoot(popup, 'popup-no-arabic', { width: 320 });
  await b.conn.send('Target.activateTarget', { targetId: yt.targetId });

  // ٣. كتابة سجل من صفحة إضافة تنعكس في المشغّل عبر أحداث التخزين (مسار المحرّر والمحفوظات).
  const rec = { ...videoRecord({ videoId: VIDEO, offset: 500 }), title: 'Smoke test record' };
  await popup.eval((r, s) => chrome.storage.local.set({ [`video:${r.videoId}`]: r, [`index:${r.videoId}`]: s }), { args: [rec, summarizeVideo(rec)] });
  // الانعكاس يُنتظر حتى 15 ث ويُسجَّل زمنه (كان ثانية ثابتة، وفي Edge بلا نافذة قيس 1.3–6.2 ث في حزمة الأساس 67fa674
  // و0.9–21.7 ث بعد إصلاحات Fable)، فالفحص يقيس الوصول لا سرعة محرّك بعينه (تدقيق Fable، FA-21).
  const sentAt = Date.now();
  let r2 = null;
  for (;;) {
    await sleep(250);
    r2 = (await stateFromPopup(popup)).reply;
    if ((r2?.arabic?.cueCount === 5 && r2?.view?.displayOffsetMs === 500) || Date.now() - sentAt > 15000) break;
  }
  check('storage-change-reaches-player', r2?.arabic?.cueCount === 5 && r2?.view?.displayOffsetMs === 500, r2 && { arabic: r2.arabic, view: r2.view, reflectedMs: Date.now() - sentAt });
  await popup.close();

  // ٤. فتح الصفحات الأربع من نافذة الأيقونة، وكل صفحة بلا أخطاء وبمحتواها من التخزين.
  const seen = new Set();
  const expect = {
    library: (t) => t.includes(VIDEO) && t.includes('المحفوظات'),
    settings: (t) => t.includes('الإعدادات') && t.includes('بلا حد ثابت'),
    editor: (t) => t.includes('5 مقاطع') && t.includes('+0.5'),
  };
  const names = { library: 'المحفوظات', settings: 'الإعدادات', editor: 'المحرّر' };
  for (const name of ['library', 'settings', 'editor']) {
    const pop = await openPopup(b.conn, extId, pageErrors, yt.targetId);
    if (name === 'editor') await shoot(pop, 'popup-with-arabic', { width: 320 });
    const clicked = await pop.eval((label, action) => {
      const item = document.querySelector(`.tj-popup__actions [data-action="${action}"]`)
        ?? [...document.querySelectorAll('.tj-popup__nav [data-action]')].find((x) => x.textContent.trim() === label);
      if (!item || item.getAttribute('aria-disabled') === 'true') return item ? 'disabled' : 'missing';
      item.click();
      return 'clicked';
    }, { args: [names[name], name] });
    const prefix = `chrome-extension://${extId}/pages/${name}/index.html`;
    const target = clicked === 'clicked' ? await waitForTarget(b.conn, (u) => u.startsWith(prefix), { exclude: seen }) : null;
    const via = target ? 'popup' : `direct (${clicked})`;
    await pop.close();
    const page = target ? await attach(b.conn, target.targetId) : await openTab(b.conn, 'about:blank');
    seen.add(page.targetId);
    const errs = collectErrors(page, { extId });
    pageErrors.push(errs);
    const pnet = { other: 0, hosts: new Set(), thumbs: 0, referers: 0 };
    page.on('Network.requestWillBeSent', (p) => {
      const u = p.request.url;
      if (u.startsWith('chrome-extension://') || u.startsWith('data:')) return;
      if (name === 'library' && THUMB_RE.test(u.split('?')[0])) {
        pnet.thumbs++;
        if (p.request.headers?.Referer || p.request.headers?.referer) pnet.referers++;
        return;
      }
      pnet.other++;
      try { pnet.hosts.add(new URL(u).host); } catch { pnet.hosts.add('?'); }
    });
    await page.send('Network.enable');
    // إعادة التحميل بعد الالتحاق تلتقط أخطاء التحميل من أوله.
    if (target) await page.reload();
    else await page.goto(`${prefix}${name === 'editor' ? `?v=${VIDEO}` : ''}`);
    await page.waitFor(() => document.querySelector('#app')?.children.length > 0, { timeoutMs: 8000 });
    await sleep(400);
    // بعد إعادة التصميم تُظهر الإعدادات قسمًا واحدًا: السعة («بلا حد ثابت») في «التخزين»، ويُفتح بجزء العنوان.
    if (name === 'settings') {
      await page.eval(() => { location.hash = '#storage'; });
      await sleep(300);
    }
    const text = await page.eval(() => document.body.innerText);
    const dir = await page.eval(() => getComputedStyle(document.documentElement).direction);
    check(`page-${name}`, expect[name](text) && dir === 'rtl' && pnet.other === 0 && pnet.referers === 0, {
      openedVia: via, rtl: dir === 'rtl', externalRequests: pnet.other, externalHosts: [...pnet.hosts],
      ...(name === 'library' ? { thumbnails: pnet.thumbs, thumbnailReferers: pnet.referers } : {}),
    });
    await shoot(page, name);
    if (name === 'settings') {
      const warnings = await page.eval(async () => {
        const m = chrome.runtime.getManifest();
        const w = (perms) => chrome.management.getPermissionWarningsByManifest(JSON.stringify({ ...m, permissions: perms }));
        return {
          actual: await w(m.permissions), storageOnly: await w(['storage']), withUnlimited: await w(['storage', 'unlimitedStorage']),
          downloadsOnly: await w(['storage', 'downloads']), withTabsControl: await w(['storage', 'tabs']),
        };
      });
      result.installWarnings = warnings;
      check('unlimitedStorage-adds-no-install-warning', JSON.stringify(warnings.withUnlimited) === JSON.stringify(warnings.storageOnly) && warnings.withTabsControl.length > warnings.storageOnly.length, warnings);
      // الإصدار الثاني: لا تحذير غير ما يضيفه downloads المعتمد لمكان الحفظ («إدارة التنزيلات»).
      const expected = m2(warnings, manifest.permissions);
      check('install-warnings-approved-only', JSON.stringify(warnings.actual) === JSON.stringify(expected), { actual: warnings.actual, expected });
    }
    await page.close();
  }

  // ٥. الشبكة: لا طلب أصله الإضافة من صفحة يوتيوب.
  const ns = net.stats();
  net.stop();
  check('no-extension-network-requests', ns.extensionOnly === 0, { total: ns.total, extensionOnly: ns.extensionOnly, packageReads: ns.packageReads });

  // ٦. أخطاء الإضافة في يوتيوب والصفحات كلها. رسالة المتصفح عند قراءة سكربت المحتوى ملف خط من حزمة الإضافة (والقراءة
  // ناجحة) تُعدّ وحدها ولا تُحسب خطأً.
  const fontReadLogs = ytErrors.list.filter((x) => x.kind === 'log.security' && FONT_READ_LOG.test(x.text));
  if (fontReadLogs.length) result.notes.push(`رسائل قراءة خطوط الترجمة من حزمة الإضافة (معروفة، غير محسوبة أخطاءً): ${fontReadLogs.length}`);
  result.errors = { youtube: ytErrors.list.filter((x) => !fontReadLogs.includes(x)), pages: pageErrors.flatMap((e) => e.list) };
  check('no-extension-errors', !result.errors.youtube.length && !result.errors.pages.length, { youtube: result.errors.youtube.length, pages: result.errors.pages.length });

  // ٧. التنظيف: سجل الاختبار يُحذف من ملف الاختبار.
  const cleaner = await openTab(b.conn, `chrome-extension://${extId}/pages/settings/index.html`, { background: true });
  await cleaner.eval((id) => chrome.storage.local.remove([`video:${id}`, `index:${id}`]), { args: [VIDEO] });
  await cleaner.close();

  // ٨. معرض المكوّنات من بناء التطوير (لقطات P2-AC6).
  if (GALLERY) {
    const g = await openTab(b.conn, 'about:blank');
    const gErr = collectErrors(g, { extId: 'none' });
    await g.goto(pathToFileURL(path.join(GALLERY, 'ui/gallery/index.html')).href);
    await g.waitFor(() => document.querySelectorAll('.tj-card').length > 5, { timeoutMs: 8000 });
    await g.eval(() => document.fonts.ready.then(() => true));
    await shoot(g, 'ui-gallery', { width: 1200 });
    check('ui-gallery', gErr.list.length === 0, { errors: gErr.list.length });
    await g.close();
  }
} catch (err) {
  check('run', false, { error: String(err.message).replace(/https?:\/\/\S+/g, '[رابط]') });
} finally {
  await b.close();
  result.passed = result.checks.every((c) => c.ok);
  const text = `${JSON.stringify(result, null, 2)}\n`;
  const leaks = findSecrets(text);
  await mkdir(OUT, { recursive: true });
  if (leaks.length) {
    console.error(`رُفضت كتابة الدليل: ${leaks.length} اكتشاف`);
    process.exitCode = 1;
  } else {
    await writeFile(path.join(OUT, 'smoke.json'), text);
    console.log(`${result.passed ? 'ناجح' : 'فيه إخفاق'} — ${rel(path.join(OUT, 'smoke.json'))}`);
  }
  if (!result.passed) process.exitCode = 1;
}
