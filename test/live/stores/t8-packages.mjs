#!/usr/bin/env node
// دخان حزم المتجر النهائية (جولة النشر T8): الحزمة نفسها التي تُرفع، بلا جسر تطوير، في متصفحها:
//   Brave وChrome من tarjuman-<الإصدار>-chrome.zip، وEdge من -edge.zip، وFirefox من -firefox.zip. بلا نافذة ومكتوم الصوت، وملف
//   تعريف جديد خارج المستودع، ويوتيوب بلا حساب. يكمّل t3.mjs (الدورة كلها ببناء التطوير من المصدر نفسه بجسره): هنا ما يخص الحزمة:
//   بصمتها في SHA256SUMS ← التثبيت ← البيان (الإصدار والاسم والأذونات) ← «حول» (الإصدار، وروابط الموقع والمستودع وصفحة الدعم، والإبلاغ،
//   وسطر الأيقونات وملف الإشعارات) ← في Firefox موافقة صور المحفوظات غير ممنوحة عند التثبيت ← سكربت المحتوى يركّب شريطه في يوتيوب
//   ← لا أخطاء من الإضافة ← الإزالة.
//   command npm run package
//   command node test/live/stores/t8-packages.mjs --browser brave|chrome|edge|firefox [--out test-results/live/T8/packages/<browser>]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { dismissConsent, waitForPlayer } from '../harness/youtube.mjs';
import { readZip } from '../../../scripts/release/zip.mjs';
import { APPS, startBrowser } from './driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'chrome');
if (!APPS[browser]) throw new Error(`متصفح غير معروف: ${browser}`);
const OUT = path.resolve(ROOT, val('out', `test-results/live/T8/packages/${browser}`));
const VERSION = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
/** الاسم من البيان المصدر نفسه (تغيّر في 2.0.0 إلى نص لوحة الهوية 18)، فلا يُثبَّت هنا نصٌّ ينجرف عنه. */
const NAME = JSON.parse(await readFile(path.join(ROOT, 'src/manifest.json'), 'utf8')).name;
const FLAVOR = browser === 'firefox' ? 'firefox' : browser === 'edge' ? 'edge' : 'chrome';
const ZIP_NAME = `tarjuman-${VERSION}-${FLAVOR}.zip`;
const ZIP = path.join(ROOT, 'release/store', ZIP_NAME);
const VIDEO = 'Y-rmzh0PI3c';
const WATCH = `https://www.youtube.com/watch?v=${VIDEO}`;
const SITE = 'https://bysltan.com';
const SUPPORT = 'https://bysltan.com/tarjuman/support';
const REPO = 'https://github.com/iSltanX/Tarjuman';
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 't8-work', `${browser}-${RUN}`);
const EXT = path.join(WORK, 'ext');
const DL = path.join(WORK, 'downloads');
/** نمط المضيف بلا مخطط: الأدلة بلا روابط (check-secrets). */
const host = (u) => String(u).replace(/^[a-z]+:\/\//i, '');

const result = { browser: null, package: ZIP_NAME, at: new Date().toISOString(), headless: true, extension: null, checks: [], notes: [], errors: [] };
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

// ---- الحزمة: بصمتها في SHA256SUMS، ثم فكّها كما هي ----
const zipBytes = await readFile(ZIP);
const digest = createHash('sha256').update(zipBytes).digest('hex');
const sums = await readFile(path.join(ROOT, 'release/store/SHA256SUMS'), 'utf8');
check('package-sha256-listed', sums.split('\n').some((l) => l.startsWith(digest) && l.trim().endsWith(ZIP_NAME)), { sha256: digest.slice(0, 16), bytes: zipBytes.length });
for (const e of readZip(zipBytes)) {
  const f = path.join(EXT, e.name);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, e.data);
}
const shipped = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
check('package-has-no-dev-bridge', !JSON.stringify(shipped.content_scripts ?? []).includes('dev/'), { contentScripts: (shipped.content_scripts ?? []).length });
await mkdir(DL, { recursive: true });
await mkdir(OUT, { recursive: true });

let s = null;
try {
  s = await startBrowser(browser, { profile: `${browser}-t8-${RUN}`, ext: EXT, downloadDir: DL, headless: true });
  const app = APPS[browser].app ?? APPS[browser].bin.slice(0, APPS[browser].bin.indexOf('.app/') + 4);
  result.browser = `${APPS[browser].name} ${appVersion(app) ?? '?'} (${s.version})`;
  result.extension = s.extensionId;
  check('install', !!s.extensionId, { version: s.version });

  // ---- «حول» في الإعدادات ----
  let st = null;
  await step('settings-open', async () => {
    st = await s.openExt('pages/settings/index.html#about');
    // قسم «حول» منذ AA2 (0bd902e) بغلاف الأقسام العام: section#about.st-section بلا الصنف st-about، فيُطلب بمعرّفه.
    const found = await st.waitFor(() => !!document.querySelector('section#about h2'), { timeoutMs: 15000 }).then((v) => !!v, () => false);
    check('settings-open', found);
  });
  if (st) {
    await step('manifest', async () => {
      const m = await st.eval(() => {
        const x = chrome.runtime.getManifest();
        return { version: x.version, name: x.name, short: x.short_name, perms: x.permissions ?? [], hosts: x.host_permissions ?? [], optional: x.optional_host_permissions ?? [] };
      });
      check('manifest-version', m.version === VERSION, { version: m.version });
      check('manifest-name', m.name === NAME && m.short === 'ترجمان', { name: m.name, short: m.short });
      check('manifest-permissions-as-shipped', JSON.stringify(m.perms) === JSON.stringify(shipped.permissions ?? []) && JSON.stringify(m.optional) === JSON.stringify(shipped.optional_host_permissions ?? []), { perms: m.perms, hosts: m.hosts, optional: m.optional.map(host) });
    });
    await step('about', async () => {
      await sleep(600);
      const a = await st.eval(() => {
        const sec = document.querySelector('section#about');
        const t = (sec?.textContent ?? '').replace(/\s+/g, ' ');
        const links = [...(sec?.querySelectorAll('a') ?? [])];
        return {
          version: [...(sec?.querySelectorAll('.st-about__row') ?? [])].map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
          external: links.filter((l) => /^https?:/.test(l.getAttribute('href') ?? '')).map((l) => ({ href: l.getAttribute('href'), text: l.textContent.trim(), target: l.getAttribute('target'), rel: l.getAttribute('rel') })),
          notices: links.filter((l) => /THIRD_PARTY_NOTICES\.txt$/.test(l.getAttribute('href') ?? '')).map((l) => l.textContent.trim()),
          report: [...(sec?.querySelectorAll('button, summary') ?? [])].some((b) => b.textContent.includes('الإبلاغ عن مشكلة')),
          lucide: t.includes('وأيقونات الواجهة رُسمت لهوية ترجمان؛ وترخيصا Lucide (ISC) وFeather (MIT) في ملف الإشعارات لأن الإصدارات السابقة استعملت أيقوناتهما.'),
          credits: t.includes('التصميم والتطوير') && t.includes('سلطان') && t.includes('© 2026 سلطان (BySultan). جميع الحقوق محفوظة.'),
        };
      });
      const hrefs = a.external.map((x) => x.href).sort();
      check('about-version', a.version.some((r) => r.includes(VERSION)), { rows: a.version });
      // روابط «حول» الثلاثة منذ 2.0.0 (الموقع والمستودع العام والدعم) وبطاقة الحقوق بطلب سلطان (2026-11-07).
      check('about-links-site-repo-and-support', JSON.stringify(hrefs) === JSON.stringify([SITE, REPO, SUPPORT].sort()) && a.external.every((x) => x.target === '_blank' && /noopener/.test(x.rel ?? '')) && a.credits,
        { links: a.external.map((x) => ({ text: x.text, target: x.target })), support: a.external.some((x) => x.href === SUPPORT && x.text === 'الدعم والخصوصية') });
      check('about-report-button', a.report);
      check('about-icons-line-and-notices-link', a.lucide && a.notices.length === 1, { notices: a.notices });
      const notices = await readFile(path.join(EXT, 'THIRD_PARTY_NOTICES.txt'), 'utf8').catch(() => '');
      check('notices-file-shipped', /Lucide/.test(notices) && /Feather/.test(notices), { bytes: notices.length });
    });
    if (s.kind === 'firefox') {
      await step('firefox-thumbnails-consent', async () => {
        const p = await st.eval(() => chrome.permissions.getAll().then((x) => ({ data: x.data_collection ?? null })));
        const m = shipped.browser_specific_settings?.gecko?.data_collection_permissions ?? null;
        check('firefox-thumbnails-consent-not-granted-on-install', Array.isArray(p.data) && !p.data.includes('browsingActivity'), { granted: p.data, declared: m });
      });
    }
  }

  // ---- يوتيوب: سكربت المحتوى يركّب شريطه ----
  await step('youtube', async () => {
    const yt = await s.youtube(WATCH);
    await sleep(2500);
    await dismissConsent(yt).catch(() => false);
    const player = await waitForPlayer(yt, VIDEO, 45000);
    const robot = await yt.eval(() => /unusual traffic|not a robot|لست روبوت|برنامج آلي/i.test(document.body?.innerText ?? ''));
    if (robot) {
      check('youtube-content-script-mounted', null, { reason: 'تحدّي الروبوت من يوتيوب: توقف دون تحايل' });
      return;
    }
    const mounted = await yt.waitFor(() => !!document.getElementById('tarjuman-controls'), { timeoutMs: 20000 }).then(() => true, () => false);
    check('youtube-content-script-mounted', !!player && mounted, { player: !!player, controlsHost: mounted });
  });

  await sleep(800);
  const errs = s.errors().flatMap((t) => t.errors.map((e) => ({ where: t.where, ...e })));
  result.errors = errs.map((e) => ({ ...e, text: String(e.text).replace(/[a-z-]+:\/\/\S+/gi, '[رابط]') }));
  check('no-extension-errors', errs.length === 0, { count: errs.length });

  await step('uninstall', async () => {
    const r = await s.uninstall();
    check('uninstall', !r.error, r);
  });
} finally {
  if (s) await s.close().catch(() => {});
  if (s?.notes?.length) result.notes.push(...s.notes);
  const passed = result.checks.filter((c) => c.ok === true).length;
  const failed = result.checks.filter((c) => c.ok === false).length;
  const skipped = result.checks.filter((c) => c.ok === null).length;
  result.summary = { passed, failed, skipped, total: result.checks.length };
  await writeFile(path.join(OUT, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n${result.browser ?? browser}: ${passed}/${result.checks.length}${failed ? `، ساقط ${failed}` : ''}${skipped ? `، لم يُختبر ${skipped}` : ''}`);
  process.exitCode = failed ? 1 : 0;
}
