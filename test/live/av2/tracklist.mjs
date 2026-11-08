// تحقق حي لتدقيق V2 (U-031 وU-032، docs/Audit-V2/unified-audit.md): قائمة مسارات الفيديو من بيانات المشغّل («في هذا الفيديو» في
// «من» وسطر «لغات الفيديو الأخرى» في قائمة التحميل) كما تصل الإضافة المبنية، عبر رد سكربت المحتوى لنافذة الأيقونة (available):
//   ١. صفحة المشاهدة: القائمة تصل.
//   ٢. التنقل داخل يوتيوب إلى الصفحة الرئيسية ثم الرجوع إلى الفيديو نفسه: القائمة تصل من جديد (U-031).
//   ٣. صفحة /live/<id> لبث انتهى (إن مُرّر --live): القائمة تصل، ويُسجَّل هل بقي العنوان /live/ بعد التحميل (U-032).
// لا يعتمد على جسم الترجمة (قائمة المسارات من بيانات المشغّل)، فيصح تحت الأتمتة. بلا نافذة ومكتوم الصوت، وملف تعريف جديد
// تحت TJ_PROFILE_ROOT، وحساب غير مسجَّل. لا رابط ولا نص في الأدلة: المعرّفات وأعداد المسارات ولغاتها وأنواعها وحدها.
// **يفتح متصفحًا عند تشغيله أو استيراده:** بإذن سلطان وحده (دليل التشغيل، «الاختبارات الحية»).
//   TJ_PROFILE_ROOT=<مجلد في المسودة> command node test/live/av2/tracklist.mjs --ext <مجلد إضافة مبنية> --label fixed|base
//     [--browser brave|chrome] [--video Y-rmzh0PI3c] [--live <معرّف بث منتهٍ>] [--out <مجلد>]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launch, loadExtension, sleep } from '../harness/browser.mjs';
import { FONT_READ_LOG, collectErrors, openTab } from '../harness/extension.mjs';
import { dismissConsent, waitForPlayer } from '../harness/youtube.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = val('ext') ? path.resolve(val('ext')) : null;
const LABEL = val('label', 'fixed');
const VIDEO = val('video', 'Y-rmzh0PI3c');
const LIVE = val('live');
const OUT = val('out') ? path.resolve(val('out')) : null;
if (!EXT) {
  console.error('استعمال: --ext <مجلد إضافة مبنية>');
  process.exit(2);
}

const result = { label: LABEL, browser: null, at: new Date().toISOString(), video: VIDEO, live: LIVE, checks: [], steps: {} };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};
const brief = (reply) => (reply ? {
  watch: reply.watch, videoId: reply.videoId ?? null,
  available: Array.isArray(reply.available) ? reply.available.map((t) => `${t.lang}|${t.kind}`) : null,
} : null);

const b = await launch({ browser, headless: true, profile: `av2-tracklist-${LABEL}-${browser}` });
result.browser = b.version.product;
const errors = [];
try {
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', !ext.error, ext.error ? { error: ext.error } : null);
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  const extId = ext.id;
  const yt = await openTab(b.conn, 'about:blank');
  errors.push(collectErrors(yt, { extId, onlyExtension: true }));
  const botCheck = async () => {
    if (await yt.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  };
  const mute = () => yt.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; })).catch(() => {});
  const popup = await openTab(b.conn, 'about:blank', { background: true });
  await popup.goto(`chrome-extension://${extId}/pages/popup/index.html`);
  /** رد سكربت المحتوى للتبويب النشط كما تسأله نافذة الأيقونة، بعد تنشيط يوتيوب؛ ويُعاد حتى تصل القائمة أو تنقضي المهلة. */
  const state = async (want = (r) => Array.isArray(r?.available), timeoutMs = 12000) => {
    const end = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < end) {
      await b.conn.send('Target.activateTarget', { targetId: yt.targetId });
      last = await popup.eval(async () => {
        const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const tabs = active ? [active] : await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
        for (const t of tabs) {
          try {
            const r = await chrome.tabs.sendMessage(t.id, { type: 'tj:get-video-state', v: 1 });
            if (r) return r;
          } catch { /* التبويب التالي */ }
        }
        return null;
      });
      if (want(last)) return last;
      await sleep(700);
    }
    return last;
  };

  // ١. صفحة المشاهدة.
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  const ready = await waitForPlayer(yt, VIDEO);
  await mute();
  await botCheck();
  check('watch-page', !!ready);
  await sleep(3000);
  const s1 = brief(await state());
  result.steps.watch = s1;
  check('tracklist-on-watch', Array.isArray(s1?.available) && s1.available.length > 0, s1);

  // ٢. إلى الصفحة الرئيسية بالتنقل الداخلي، ثم الرجوع إلى الفيديو نفسه.
  const clicked = await yt.eval(() => {
    const a = document.querySelector('ytd-topbar-logo-renderer a, a#logo');
    if (!a) return false;
    a.click();
    return true;
  });
  const home = !!(await yt.waitFor(() => location.pathname === '/', { timeoutMs: 15000 }));
  check('spa-to-home', clicked && home, { clicked, home });
  await sleep(3000);
  await botCheck();
  const sHome = brief(await state((r) => r && r.watch === false, 6000));
  result.steps.home = sHome;
  await yt.eval(() => history.back());
  const back = !!(await yt.waitFor((id) => new URLSearchParams(location.search).get('v') === id, { args: [VIDEO], timeoutMs: 15000 }));
  await waitForPlayer(yt, VIDEO).catch(() => null);
  await mute();
  check('spa-back-to-same-video', back);
  await sleep(3000);
  const s2 = brief(await state());
  result.steps.back = s2;
  check('U-031 tracklist-after-return', Array.isArray(s2?.available) && s2.available.length > 0 && s2.videoId === VIDEO, s2);

  // ٣. صفحة /live/<id> لبث منتهٍ.
  if (LIVE) {
    await yt.goto(`https://www.youtube.com/live/${LIVE}`);
    await dismissConsent(yt).catch(() => false);
    const liveReady = await waitForPlayer(yt, LIVE).catch(() => null);
    await mute();
    await botCheck();
    const where = await yt.eval(() => ({ pathname: location.pathname.replace(/[A-Za-z0-9_-]{11}/, '<id>'), hasV: new URLSearchParams(location.search).has('v') }));
    result.steps.liveUrl = where;
    check('live-page', !!liveReady, where);
    await sleep(3000);
    const s3 = brief(await state());
    result.steps.live = s3;
    check('U-032 tracklist-on-live', Array.isArray(s3?.available) && s3.available.length > 0 && s3.videoId === LIVE, { ...s3, url: where });
  }
  const errs = errors.flatMap((e) => e.list).filter((e) => !FONT_READ_LOG.test(e.text));
  result.extensionErrors = errs;
  check('no-extension-errors', errs.length === 0, errs.length ? { count: errs.length } : null);
} catch (err) {
  result.error = String(err?.message ?? err);
  console.error(result.error);
} finally {
  await b.close();
}
result.ok = !result.error && result.checks.every((c) => c.ok);
if (OUT) {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, `tracklist-${LABEL}-${browser}.json`), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(`${result.ok ? 'ناجح' : 'فاشل'}: ${result.checks.filter((c) => c.ok).length}/${result.checks.length}`);
process.exitCode = result.ok ? 0 : 1;
