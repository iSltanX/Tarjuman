#!/usr/bin/env node
// معاينة بصرية محلية للهوية (AA2، docs/identity-v4.md): صفحات الإضافة ومعرض المكوّنات بالوضعين، **بلا يوتيوب ولا شبكة**.
// تُحمَّل حزمة التطوير في ملف تعريف اختبار جديد بلا نافذة ومكتوم الصوت، وتُبذر بيانات عيّنة (صور المحفوظات مطفأة فلا طلب
// خارجي)، ثم تُلتقط: المعرض، والمحفوظات (والصف الموسّع)، والإعدادات (العرض والبيانات وحول)، والمحرّر، ونافذة الأيقونة بعرض
// 360. ويُعدّ كل طلب خارج الإضافة وكل خطأ منها (المتوقع صفر). لا رابط ولا نص مقاطع في الأدلة غير نصوص العيّنة.
// **يفتح متصفحًا عند تشغيله أو استيراده:** بإذن سلطان وحده (دليل التشغيل، «الاختبارات الحية»).
//   command npm run build:dev -- --out <مجلد خارج المستودع>
//   TJ_PROFILE_ROOT=<مجلد في المسودة> command node test/live/identity/preview.mjs --browser brave|chrome --ext <مجلد> [--out <مجلد>]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, emulateScheme, fullScreenshot, openTab } from '../harness/extension.mjs';
import { SEED_IDS, buildSeedFew, storageItems } from '../ui/seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/AA2'), browser);
const PROFILE = `${browser}-preview-${Date.now()}`;

const result = { browser: null, at: new Date().toISOString(), headless: true, extension: null, shots: [], external: [], errors: [], checks: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
};
let b = null;
let extId = null;
const errors = [];

async function openExt(rest) {
  const page = await openTab(b.conn, 'about:blank');
  errors.push({ page: rest.split(/[?#]/)[0], ...collectErrors(page, { extId }) });
  page.on('Network.requestWillBeSent', (p) => {
    const u = p.request.url;
    if (!/^(chrome-extension|data|blob|about):/.test(u)) result.external.push(u.split('?')[0]);
  });
  await page.send('Network.enable');
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await page.goto(`chrome-extension://${extId}/${rest}`);
  return page;
}
const front = (page) => b.conn.send('Target.activateTarget', { targetId: page.targetId });
async function shoot(page, name, { width = 1280 } = {}) {
  await front(page);
  for (const scheme of ['light', 'dark']) {
    await emulateScheme(page, scheme);
    await sleep(400);
    const file = await fullScreenshot(page, path.join(OUT, `${name}-${scheme}.png`), { width });
    result.shots.push(path.basename(file)); // اسم الملف وحده: لا مسار محلي في الأدلة
  }
  await emulateScheme(page, 'light');
}

try {
  await mkdir(OUT, { recursive: true });
  b = await launch({ browser, profile: PROFILE, headless: true });
  result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  extId = ext.id;
  const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
  result.extension = { version: manifest.version, versionName: manifest.version_name ?? null };
  console.log(`المتصفح: ${result.browser} · الإضافة ${manifest.version_name ?? manifest.version}`);

  // البذر من صفحة الإعدادات: ثلاثة فيديوهات عيّنة، ثم «صور الفيديو في المحفوظات» يُطفأ بمفتاحه الحقيقي قبل فتح المحفوظات (لا طلب
  // إلى i.ytimg.com).
  const seed = buildSeedFew(Date.now()).items;
  const st0 = await openExt('pages/settings/index.html#display');
  await st0.waitFor(() => !!document.querySelector('input[data-pref="ui.thumbnails"]'), { timeoutMs: 10000 });
  await st0.eval((obj) => chrome.storage.local.set(obj), { args: [storageItems(seed)] });
  if (await st0.eval(() => document.querySelector('input[data-pref="ui.thumbnails"]')?.checked)) {
    await st0.eval(() => document.querySelector('label[for="st-ui-thumbnails"]')?.click());
    await sleep(800);
  }
  check('thumbnails-off', (await st0.eval(() => document.querySelector('input[data-pref="ui.thumbnails"]')?.checked)) === false);
  await st0.close();
  const lib = await openExt('pages/library/index.html');
  await lib.reload();
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 3, { timeoutMs: 12000 });
  await sleep(600);
  await shoot(lib, 'library');
  await lib.eval((id) => document.querySelector(`li.lib-row[data-video="${id}"] .lib-toggle`)?.click(), { args: [SEED_IDS.ted] });
  await lib.waitFor(() => document.querySelectorAll('.lib-card').length > 0, { timeoutMs: 6000 });
  await sleep(500);
  await shoot(lib, 'library-expanded');

  for (const hash of ['display', 'data', 'about']) {
    const st = await openExt(`pages/settings/index.html#${hash}`);
    await st.waitFor(() => !!document.querySelector('.st-section'), { timeoutMs: 10000 });
    await sleep(600);
    await shoot(st, `settings-${hash}`);
    await st.close();
  }

  const ed = await openExt(`pages/editor/index.html?v=${SEED_IDS.ted}`);
  await ed.waitFor(() => !!document.querySelector('.ed-app') && !document.querySelector('[aria-busy="true"]'), { timeoutMs: 12000 });
  await sleep(800);
  await shoot(ed, 'editor', { width: 1440 });
  await ed.close();

  const pop = await openExt('pages/popup/index.html');
  await pop.send('Emulation.setDeviceMetricsOverride', { width: 340, height: 600, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);
  await shoot(pop, 'popup', { width: 340 });
  await pop.close();

  const gal = await openExt('ui/gallery/index.html');
  await gal.waitFor(() => !!document.querySelector('.g-icons'), { timeoutMs: 10000 });
  await sleep(600);
  await shoot(gal, 'gallery', { width: 1280 });

  const errs = errors.flatMap((e) => e.list.map((x) => ({ page: e.page, ...x })));
  result.errors = errs;
  check('no-external-requests', result.external.length === 0, result.external.slice(0, 5));
  check('no-extension-errors', errs.length === 0, errs.slice(0, 5));
  check('screenshots', result.shots.length === 16, { n: result.shots.length });
} catch (err) {
  check('run', false, { error: String(err?.message ?? err).slice(0, 300) });
} finally {
  await b?.close();
  await writeFile(path.join(OUT, 'preview.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`النتيجة: ${result.checks.filter((c) => c.ok).length}/${result.checks.length} · اللقطات ${result.shots.length} في ${path.relative(ROOT, OUT)}`);
}
process.exit(result.checks.every((c) => c.ok) ? 0 : 1);
