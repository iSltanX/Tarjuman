#!/usr/bin/env node
// معاينة صفحات ترجمان الأربع في الموقع (AA4، docs/aa-plan.md) على خادم محلي لفرع الموقع feat/tarjuman-v2 (localhost وحده، بقاعدة
// ملفية جديدة في الـworktree هناك لا قاعدة الإنتاج)، في Chrome بلا نافذة بملف تعريف جديد تحت TJ_PROFILE_ROOT:
//   - كل صفحة بالعروض 360 و390 و768 و1024 و1280 و1440 و1920 وبالوضعين: لا فيض أفقي، وh1 واحد، والهوية الرابعة في الألوان المحسوبة.
//   - لقطة كاملة لكل صفحة بالوضعين على الحاسوب (1440) وعلى الجوال (390)، بصيغة JPEG (جودة 82) كي لا تثقل المستودع.
//   - لا طلب إلى غير الخادم المحلي، ولا خطأ في وحدة التحكم.
// **يفتح متصفحًا عند تشغيله أو استيراده:** بإذن سلطان وحده (دليل التشغيل، «الاختبارات الحية»).
//   TJ_PROFILE_ROOT=<مجلد في المسودة> command node test/live/aa4/site-pages.mjs --base http://localhost:<المنفذ> [--out docs/evidence/AA4/site]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from '../harness/browser.mjs';
import { openTab } from '../harness/extension.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const BASE = val('base');
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/AA4/site'));
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error('استعمال: --base http://localhost:<المنفذ> (الخادم المحلي وحده)');
  process.exit(2);
}

const PAGES = [
  { path: '/tarjuman', name: 'home' },
  { path: '/tarjuman/privacy', name: 'privacy' },
  { path: '/tarjuman/support', name: 'support' },
  { path: '/tarjuman/credits', name: 'credits' },
];
const WIDTHS = [360, 390, 768, 1024, 1280, 1440, 1920];
const SCHEMES = ['light', 'dark'];
/** القيم المحسوبة التي تثبت الهوية الرابعة في كل وضع (من src/design/tarjuman.ts في الموقع). */
const IDENTITY = {
  light: { bg: 'rgb(243, 239, 230)', text: 'rgb(24, 46, 43)', primary: 'rgb(30, 74, 68)' },
  dark: { bg: 'rgb(15, 25, 23)', text: 'rgb(237, 233, 224)', primary: 'rgb(237, 233, 224)' },
};

const result = { at: new Date().toISOString(), base: 'localhost', browser: null, checks: [], shots: [], external: [], console: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  if (!ok || process.env.TJ_VERBOSE) console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 240)}` : ''}`);
  return !!ok;
};

await mkdir(OUT, { recursive: true });
const b = await launch({ browser: 'chrome', profile: `chrome-aa4-site-${Date.now()}`, headless: true });
result.browser = b.version.product;
try {
  const page = await openTab(b.conn, 'about:blank');
  await page.send('Network.enable');
  page.on('Network.requestWillBeSent', (p) => {
    const u = p.request.url;
    if (!u.startsWith(BASE) && !/^(data|blob|about):/.test(u)) result.external.push(u.replace(/[?#].*$/, ''));
  });
  page.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') result.console.push(String(p.args?.[0]?.value ?? '').slice(0, 200)); });
  page.on('Runtime.exceptionThrown', (p) => result.console.push(String(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text).slice(0, 200)));

  const shoot = async (name) => {
    const content = await page.eval(() => Math.ceil(document.documentElement.scrollHeight));
    const metrics = await page.eval(() => ({ w: innerWidth }));
    await page.send('Emulation.setDeviceMetricsOverride', { width: metrics.w, height: Math.min(Math.max(content, 400), 12000), deviceScaleFactor: 1, mobile: metrics.w < 768 });
    await sleep(400);
    // الصور كسولة التحميل: بعد تكبير المنفذ إلى طول الصفحة تُنتظر كلها (وإلا التُقطت بطاقة فارغة).
    const loaded = await page.waitFor(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), { timeoutMs: 20000 }).then(() => true, () => false);
    check(`${name}-images-loaded`, loaded);
    await sleep(300);
    const { data } = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    const file = path.join(OUT, `${name}.jpg`);
    await writeFile(file, Buffer.from(data, 'base64'));
    result.shots.push(path.relative(ROOT, file));
  };

  for (const scheme of SCHEMES) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    for (const p of PAGES) {
      for (const width of WIDTHS) {
        await page.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
        await page.goto(`${BASE}${p.path}`);
        await page.waitFor(() => document.readyState === 'complete' && document.fonts.status === 'loaded', { timeoutMs: 20000 }).catch(() => null);
        await sleep(500);
        const m = await page.eval(() => {
          const doc = document.documentElement;
          const css = (el, prop) => (el ? getComputedStyle(el)[prop] : null);
          const wide = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 3).map((el) => el.className || el.tagName);
          return {
            overflow: doc.scrollWidth - doc.clientWidth,
            wide,
            h1: document.querySelectorAll('h1').length,
            bg: css(document.body, 'backgroundColor'),
            text: css(document.body, 'color'),
            primary: css(document.querySelector('.tj-btn--primary, .tj-skip'), 'backgroundColor'),
            logo: !!document.querySelector('.tj-logo__mark') && /ترجمان/.test(document.querySelector('.tj-logo__word')?.textContent ?? ''),
            logoWeight: css(document.querySelector('.tj-logo__word'), 'fontWeight'),
          };
        });
        const id = `${p.name}-${width}-${scheme}`;
        check(`${id}-no-horizontal-overflow`, m.overflow <= 0 && m.wide.length === 0, { overflow: m.overflow, wide: m.wide });
        check(`${id}-one-h1`, m.h1 === 1, { h1: m.h1 });
        check(`${id}-identity-v4`, m.bg === IDENTITY[scheme].bg && m.text === IDENTITY[scheme].text && m.logo && m.logoWeight === '800', { bg: m.bg, text: m.text, logo: m.logo, w: m.logoWeight });
        if (p.name === 'home') check(`${id}-primary-pine`, m.primary === IDENTITY[scheme].primary, { primary: m.primary });
        if (width === 1440 || width === 390) await shoot(`${id}`);
      }
    }
  }
  check('no-external-requests', result.external.length === 0, [...new Set(result.external)].slice(0, 5));
  check('no-console-errors', result.console.length === 0, result.console.slice(0, 5));
} catch (err) {
  check('run-completed', false, { error: err.message });
} finally {
  await b.close?.().catch?.(() => {});
}

const pass = result.checks.filter((c) => c.ok).length;
result.summary = `${pass}/${result.checks.length}`;
await writeFile(path.join(OUT, 'site-pages.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\nChrome (${result.browser}): ${result.summary} — ${result.shots.length} لقطة في ${path.relative(ROOT, OUT)}`);
process.exit(pass === result.checks.length ? 0 : 1);
