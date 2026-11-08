// الاختبار الحي لمرحلة C1 من خطة إصلاح تدقيق 7a66f91، بلا نافذة، بملفات تعريف اختبار مؤقتة
// تُحذف بعده، وبلا بلاغ حقيقي ولا حساب (قرار سلطان Q05). السيناريوهات:
//   consent   Firefox: مكتبة من 60 فيديو بموافقة «نشاط التصفح»، ثم سحبها (permissions.remove، كصفحة الإضافات) والصفحة مفتوحة،
//             ثم «عرض المزيد» والتمرير والبحث: المقبول صفر طلبات i.ytimg.com جديدة. ثم المنح من جديد يعيدها (حساسية القياس).
//             طلبات الصور تُعترض بـBiDi وتُفشَل قبل خروجها، فلا يصل شيء إلى يوتيوب.
//   report    I14 (Q11): ترويسات طلب البلاغ كما يرسلها المتصفح. Firefox: اعتراض BiDi عند beforeRequestSent ثم failRequest
//             (لا يخرج الطلب). Chrome: خادم HTTPS وهمي على 127.0.0.1 يُوجَّه إليه مضيف البلاغات بـ--host-resolver-rules، فتُسجَّل
//             الترويسات كما وصلت. حدّه: يثبت ما يرسله المتصفح لهذا المضيف بالإذن نفسه، ولا يثبت ما يسجّله الخادم الحقيقي أو
//             بنيته الوسيطة (Cloudflare).
//   download  I12 (Q14، Chrome): ثلاثة تنزيلات من الإضافة، و«آخر ملف» = الأحدث، ثم حذفه من القائمة وإعادة التشغيل وتنزيل عادي
//             من صفحة ويب محلية: هل يأخذ الرقم نفسه؟ وماذا يعرض «آخر ملف»؟
//   pages     Chrome: المحفوظات والإعدادات بلا انحدار (الصفوف والسعة والأحجام والصور فورًا كما كانت).
// الاستعمال (بإذن سلطان، وبعد إعلامه):
//   command node test/live/audit-c1/run.mjs --browser firefox|chrome --scenarios consent,report,download,pages --ext <مجلد البناء> --out <مجلد>
// وفي Chrome لسيناريو report: --ext-reports <بناء فيه مضيف البلاغات في host_permissions> (بديل حوار الإذن الذي ينتظر يدًا بلا نافذة).
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer as createHttps } from 'node:https';
import { createServer as createHttp } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PROFILE_ROOT, human, sleep } from '../harness/browser.mjs';
import { REPORTS_HOST, startBrowser } from '../stores/driver.mjs';
import { buildSeedMany, storageItems } from '../ui/seed.mjs';

const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const BROWSER = arg('browser', 'firefox');
const SCENARIOS = String(arg('scenarios', 'consent,report')).split(',');
const EXT = path.resolve(arg('ext'));
const EXT_REPORTS = arg('ext-reports') ? path.resolve(arg('ext-reports')) : null;
const OUT = path.resolve(arg('out'));
const TMP = await mkdtemp(path.join(os.tmpdir(), 'tj-c1-live-'));
const profiles = [];
const result = { browser: BROWSER, startedAt: new Date().toISOString(), versions: {}, steps: {}, checks: [], notes: [] };
const check = (id, ok, detail = {}) => { result.checks.push({ id, ok: ok === true ? true : ok === null ? null : false, ...detail }); };
const profileName = (tag) => {
  const p = `c1-${BROWSER}-${tag}-${randomUUID().slice(0, 8)}`;
  profiles.push(p);
  return p;
};

async function clickOn(page, expr, label) {
  const ok = await page.eval(`(() => { for (const e of document.querySelectorAll('[data-c1]')) e.removeAttribute('data-c1'); const el = (${expr}); if (!el) return false; el.setAttribute('data-c1', '1'); return true; })()`);
  if (!ok) throw new Error(`لم يوجد: ${label}`);
  const c = await page.centerOf('[data-c1="1"]');
  if (!c) throw new Error(`غير ظاهر: ${label}`);
  await page.click(c.x, c.y);
  await human(250, 450);
}
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(text)}))`;

async function step(name, fn) {
  const t0 = Date.now();
  try {
    result.steps[name] = { ok: true, value: await fn(), ms: Date.now() - t0 };
  } catch (err) {
    result.steps[name] = { ok: false, error: String(err?.stack ?? err).slice(0, 600), ms: Date.now() - t0 };
  }
}

/**
 * Firefox يقبل permissions.request داخل معالج فعل مستخدم وحده: زر مؤقت في الصفحة يُضغط ضغطة حقيقية (كما في T3).
 * @returns {Promise<string>} 'true' أو 'false' أو نص الخطأ
 */
async function permissionByClick(page, perms) {
  await page.eval((p) => {
    document.getElementById('c1-grant')?.remove();
    delete window.__c1grant;
    const b = document.createElement('button');
    b.id = 'c1-grant';
    b.textContent = 'c1';
    b.style.cssText = 'position:fixed;top:8px;left:8px;z-index:2147483647;width:96px;height:36px';
    b.addEventListener('click', () => { browser.permissions.request(p).then((g) => { window.__c1grant = String(g); }, (e) => { window.__c1grant = String(e?.message ?? e); }); });
    document.body.append(b);
  }, { args: [perms] });
  const c = await page.centerOf('#c1-grant', { scroll: false });
  await page.click(c.x, c.y);
  const v = await page.waitFor(() => window.__c1grant ?? null, { timeoutMs: 10000 }).catch(() => 'timeout');
  await page.eval(() => document.getElementById('c1-grant')?.remove());
  return v;
}

async function shot(page, name) {
  try {
    await page.screenshot(path.join(OUT, `c1-${BROWSER}-${name}.png`));
  } catch (err) {
    result.notes.push(`لقطة ${name}: ${String(err?.message ?? err).slice(0, 100)}`);
  }
}

/** يقرأ ترويسات BiDi بصيغة { name, value: { type, value } } إلى كائن بأسماء صغيرة. */
const bidiHeaders = (list = []) => Object.fromEntries(list.map((h) => [h.name.toLowerCase(), h.value?.value ?? String(h.value ?? '')]));

// ================================================================ consent (Firefox)
async function consentScenario() {
  const s = await startBrowser('firefox', { profile: profileName('consent'), ext: EXT, downloadDir: path.join(TMP, 'dl-consent') });
  result.versions.firefox = s.version;
  const thumbs = [];
  try {
    const settings = await s.openExt('pages/settings/index.html');
    // اعتراض طلبات الصور قبل أي شيء: تُسجَّل وتُفشَل فلا تخرج.
    await s.interceptHosts(['i.ytimg.com'], (r) => thumbs.push({ t: Date.now(), path: new URL(r.url).pathname }));
    const now = Date.now();
    const many = buildSeedMany(now).items;
    await settings.eval((obj) => chrome.storage.local.set(obj), { args: [storageItems(many)] });
    const granted = (await permissionByClick(settings, { data_collection: ['browsingActivity'] })) === 'true';
    const prefsOn = await settings.eval(() => chrome.storage.local.get('prefs').then((x) => x.prefs?.ui?.thumbnails ?? 'default'));
    check('consent-granted', granted === true, { granted, prefsOn });

    const lib = await s.openExt('pages/library/index.html');
    await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 50, { timeoutMs: 20000 });
    await sleep(2500);
    const beforeRevoke = thumbs.length;
    const imgsBefore = await lib.eval(() => document.querySelectorAll('img.lib-thumb__img[src]').length);
    check('thumbs-requested-before-revoke', beforeRevoke > 0, { requests: beforeRevoke, imgsWithSrc: imgsBefore });

    // السحب كما تفعل صفحة الإضافات: permissions.remove من سياق آخر، بلا كتابة في التخزين.
    const storageBefore = await settings.eval(() => chrome.storage.local.get(null).then((x) => JSON.stringify(x).length));
    const removed = await settings.eval(() => browser.permissions.remove({ data_collection: ['browsingActivity'] }));
    await sleep(1500);
    const t0 = Date.now();
    const afterImgs = await lib.eval(() => ({ img: document.querySelectorAll('img.lib-thumb__img').length, fallback: document.querySelectorAll('.lib-thumb__fallback').length }));
    await clickOn(lib, byText('button', 'عرض المزيد'), 'عرض المزيد');
    await sleep(1000);
    for (let i = 0; i < 8; i++) {
      await lib.eval((k) => window.scrollTo(0, (document.body.scrollHeight / 8) * (k + 1)), { args: [i] });
      await sleep(400);
    }
    await lib.eval(() => { const s = document.querySelector('input.lib-search__input'); s.value = 'a'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(800);
    await lib.eval(() => { const s = document.querySelector('input.lib-search__input'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(2500);
    const after = thumbs.filter((x) => x.t >= t0).length;
    const duringRevoke = thumbs.length - beforeRevoke;
    const rowsShown = await lib.eval(() => document.querySelectorAll('li.lib-row').length);
    const storageAfter = await settings.eval(() => chrome.storage.local.get(null).then((x) => JSON.stringify(x).length));
    check('zero-thumb-requests-after-revoke', removed === true && duringRevoke === 0 && after === 0, { removed, requestsAfterRevoke: duringRevoke, rowsShown, afterImgs, storageUnchanged: storageBefore === storageAfter });

    // الحساسية: المنح من جديد يعيد الطلبات (فالقياس كان سيرى أي طلب).
    const regrant = (await permissionByClick(settings, { data_collection: ['browsingActivity'] })) === 'true';
    await lib.eval(() => window.scrollTo(0, 0));
    await sleep(3000);
    check('regrant-requests-again', regrant === true && thumbs.length > beforeRevoke, { regrant, requestsAfterRegrant: thumbs.length - beforeRevoke });
    result.steps.consentErrors = s.errors();
  } finally {
    await s.close();
  }
}

// ================================================================ report (I14)
async function selfSignedCert() {
  const key = path.join(TMP, 'key.pem');
  const cert = path.join(TMP, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', `/CN=${REPORTS_HOST}`, '-addext', `subjectAltName=DNS:${REPORTS_HOST}`], { stdio: 'ignore' });
  return { key: await readFile(key), cert: await readFile(cert) };
}

async function openReport(st) {
  await st.waitFor(() => !!document.getElementById('about'), { timeoutMs: 15000 });
  await clickOn(st, byText('#about button', 'الإبلاغ عن مشكلة'), 'الإبلاغ عن مشكلة');
  await st.waitFor(() => !document.getElementById('st-report')?.hidden && !!document.querySelector('[data-report-field="diagnostics.build_target"]'), { timeoutMs: 15000 });
  const box = await st.waitFor(() => {
    const t = document.getElementById('st-report-text');
    t?.scrollIntoView({ block: 'center' });
    const r = t?.getBoundingClientRect();
    return r && r.width > 0 && r.height > 0 ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
  }, { timeoutMs: 10000 }).catch(async () => {
    await shot(st, 'report-textarea');
    result.notes.push(`حقل الوصف: ${JSON.stringify(await st.eval(() => {
      const t = document.getElementById('st-report-text');
      const reg = document.getElementById('st-report');
      return { exists: !!t, regionHidden: reg?.hidden ?? null, display: t ? getComputedStyle(t).display : null, sectionHidden: t?.closest('section')?.hidden ?? null, active: location.hash, w: innerWidth, h: innerHeight };
    }))}`);
    return null;
  });
  if (!box) throw new Error('حقل الوصف بلا مساحة');
  await clickOn(st, `document.getElementById('st-report-text')`, 'وصف البلاغ');
  await st.typeText('C1 live test: header capture only, never delivered.');
  await sleep(500);
  await clickOn(st, byText('#st-report button', 'إرسال البلاغ'), 'إرسال البلاغ');
  return st.waitFor(() => document.querySelector('[data-report-result]')?.getAttribute('data-report-result') ?? null, { timeoutMs: 30000 }).catch(() => null);
}

async function reportScenario() {
  if (BROWSER === 'firefox') {
    const s = await startBrowser('firefox', { profile: profileName('report'), ext: EXT, downloadDir: path.join(TMP, 'dl-report') });
    result.versions.firefox = s.version;
    const seen = [];
    try {
      const st = await s.openExt('pages/settings/index.html#about');
      await s.interceptHosts([REPORTS_HOST], (r) => seen.push({ method: r.method, path: new URL(r.url).pathname, headers: bidiHeaders(r.headers) }));
      const outcome = await openReport(st);
      await sleep(1500);
      const uuid = new URL(s.base).host;
      const post = seen.find((r) => r.method === 'POST') ?? null;
      result.steps.reportRequests = seen;
      check('i14-firefox-captured', !!post, { outcome, requests: seen.map((r) => r.method), notDelivered: true });
      check('i14-firefox-origin', post ? null : false, {
        origin: post?.headers.origin ?? null, originHasInstallUuid: post ? String(post.headers.origin ?? '').includes(uuid) : null,
        referer: post?.headers.referer ?? null, userAgent: post?.headers['user-agent'] ?? null, acceptLanguage: post?.headers['accept-language'] ?? null,
        preflight: seen.some((r) => r.method === 'OPTIONS'), headerNames: post ? Object.keys(post.headers).sort() : [],
      });
    } finally {
      await s.close();
    }
    return;
  }
  // Chrome: خادم HTTPS وهمي على 127.0.0.1 بشهادة ذاتية لاسم مضيف البلاغات، والمتصفح يوجّه الاسم إليه.
  const tls = await selfSignedCert();
  const seen = [];
  const server = createHttps(tls, (req, res) => {
    seen.push({ method: req.method, path: req.url, headers: { ...req.headers }, httpVersion: req.httpVersion });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': req.headers.origin ?? '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type, idempotency-key' });
      res.end();
      return;
    }
    req.resume();
    req.on('end', () => {
      res.writeHead(503, { 'content-type': 'application/json', 'access-control-allow-origin': req.headers.origin ?? '*' });
      res.end('{"error":"c1-live-test"}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const s = await startBrowser('chrome', {
    profile: profileName('report'), ext: EXT_REPORTS ?? EXT, downloadDir: path.join(TMP, 'dl-report'),
    extraArgs: [`--host-resolver-rules=MAP ${REPORTS_HOST} 127.0.0.1:${port}`, '--ignore-certificate-errors'],
  });
  result.versions.chrome = s.version;
  try {
    const st = await s.extPage('pages/settings/index.html#about');
    const outcome = await openReport(st);
    await sleep(1500);
    const post = seen.find((r) => r.method === 'POST') ?? null;
    result.steps.reportRequests = seen.map((r) => ({ ...r, headers: Object.fromEntries(Object.entries(r.headers).filter(([k]) => k !== 'idempotency-key')) }));
    check('i14-chrome-captured', !!post, { outcome, requests: seen.map((r) => r.method), port: 'loopback' });
    check('i14-chrome-origin', post ? null : false, {
      origin: post?.headers.origin ?? null, originIsExtensionId: post ? String(post.headers.origin ?? '') === `chrome-extension://${s.extensionId}` : null,
      referer: post?.headers.referer ?? null, userAgent: post?.headers['user-agent'] ?? null, acceptLanguage: post?.headers['accept-language'] ?? null,
      secFetchSite: post?.headers['sec-fetch-site'] ?? null, preflight: seen.some((r) => r.method === 'OPTIONS'), headerNames: post ? Object.keys(post.headers).sort() : [],
      cookie: post?.headers.cookie ?? null,
    });
  } finally {
    await s.close();
    server.close();
  }
}

// ================================================================ download (I12، Chrome)
async function downloadScenario() {
  const profile = profileName('download');
  const dlDir = path.join(TMP, 'dl-download');
  // صفحة ويب محلية تنزّل ملفًا عاديًا لا يخص الإضافة.
  const web = createHttp((req, res) => {
    if (req.url.startsWith('/other')) {
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="personal-statement.pdf"' });
      res.end('%PDF-1.4 c1 live test');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>c1</title><p>c1</p>');
  });
  await new Promise((r) => web.listen(0, '127.0.0.1', r));
  const webBase = `http://127.0.0.1:${web.address().port}`;
  const first = {};
  let s = await startBrowser('chrome', { profile, ext: EXT, downloadDir: dlDir });
  result.versions.chrome = s.version;
  try {
    const st = await s.extPage('pages/settings/index.html');
    first.ids = await st.eval(async () => {
      const once = (n) => new Promise((resolve) => chrome.downloads.download({ url: `data:text/plain;charset=utf-8,c1-${n}`, filename: `tj-c1-${n}.srt`, conflictAction: 'uniquify' }, resolve));
      const settle = async (id) => { for (let i = 0; i < 50; i++) { const [x] = await chrome.downloads.search({ id }); if (x?.state === 'complete') return; await new Promise((r) => setTimeout(r, 200)); } };
      const ids = [];
      for (const n of [1, 2, 3]) { const id = await once(n); await settle(id); ids.push(id); }
      return ids;
    });
    const last = first.ids.at(-1);
    await st.eval((id) => chrome.storage.local.set({ saves: { schema: 1, last: { downloadId: id, at: new Date().toISOString() } } }), { args: [last] });
    const st2 = await s.extPage('pages/settings/index.html#export');
    await sleep(1500);
    first.lastLine = await st2.eval(() => { const p = document.querySelector('.st-last-save'); return p ? { hidden: p.hidden, text: p.textContent.trim() } : null; });
    first.items = await st2.eval(() => chrome.downloads.search({}).then((l) => l.map((x) => ({ id: x.id, mine: x.byExtensionId === chrome.runtime.id, name: x.filename.split(/[\\/]/).pop() }))));
    first.erased = await st2.eval((id) => chrome.downloads.erase({ id }), { args: [last] });
  } finally {
    await s.close();
  }
  await sleep(1500);
  const second = {};
  s = await startBrowser('chrome', { profile, ext: EXT, downloadDir: dlDir });
  try {
    const tab = await s.youtube(`${webBase}/`);
    await tab.eval((u) => { location.href = u; }, { args: [`${webBase}/other`] }).catch(() => {});
    await sleep(3000);
    const st = await s.extPage('pages/settings/index.html#export');
    await sleep(1500);
    second.items = await st.eval(() => chrome.downloads.search({}).then((l) => l.map((x) => ({ id: x.id, mine: x.byExtensionId === chrome.runtime.id, byExt: x.byExtensionId ?? null, name: x.filename.split(/[\\/]/).pop(), state: x.state, exists: x.exists }))));
    second.lastLine = await st.eval(() => { const p = document.querySelector('.st-last-save'); return p ? { hidden: p.hidden, text: p.textContent.trim() } : null; });
  } finally {
    await s.close();
    web.close();
  }
  const last = first.ids.at(-1);
  const reused = second.items.find((x) => x.id === last) ?? null;
  result.steps.download = { first, second };
  check('i12-baseline-shows-own-file', first.lastLine && !first.lastLine.hidden && /tj-c1-3/.test(first.lastLine.text), { lastLine: first.lastLine });
  check('i12-id-reused-after-erase-restart', reused ? (reused.mine === false) : false, { savedId: last, reusedBy: reused ? { name: reused.name, mine: reused.mine } : null, note: reused ? 'Chromium أعاد الرقم لتنزيل آخر' : 'لم يُعد الرقم' });
  check('i12-last-line-hidden-for-foreign', second.lastLine ? second.lastLine.hidden === true : null, { lastLine: second.lastLine });
}

// ================================================================ pages (Chrome)
async function pagesScenario() {
  const s = await startBrowser(BROWSER, { profile: profileName('pages'), ext: EXT, downloadDir: path.join(TMP, 'dl-pages') });
  result.versions[BROWSER] = s.version;
  const thumbs = [];
  try {
    const st = await s.extPage('pages/settings/index.html');
    await st.eval((obj) => chrome.storage.local.set(obj), { args: [storageItems(buildSeedMany(Date.now()).items)] });
    const lib = await s.extPage('pages/library/index.html');
    await s.interceptPage?.(lib, ['i.ytimg.com'], (u) => thumbs.push(u));
    await lib.reload?.();
    await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 50, { timeoutMs: 20000 });
    await sleep(2500);
    const libState = await lib.eval(() => ({
      rows: document.querySelectorAll('li.lib-row').length, more: !!document.querySelector('.lib-more-rows'), error: !!document.querySelector('.lib-state--error'),
      quota: document.querySelector('.lib-quota__text')?.textContent.trim() ?? null, imgsWithSrc: document.querySelectorAll('img.lib-thumb__img[src]').length,
    }));
    check('pages-library', libState.rows === 50 && libState.more && !libState.error && !!libState.quota && libState.imgsWithSrc > 0, { ...libState, thumbRequests: thumbs.length });
    const st2 = await s.extPage('pages/settings/index.html#storage');
    await sleep(2000);
    const stState = await st2.eval(() => ({
      usage: document.querySelector('.st-quota__text')?.textContent.trim() ?? null, library: document.querySelector('.st-library-usage')?.textContent.trim() ?? null,
      bytes: document.querySelector('.st-library-bytes')?.textContent.trim() ?? null,
    }));
    check('pages-settings-storage', /^المستخدم/.test(stState.usage ?? '') && /الترجمات المحفوظة/.test(stState.library ?? '') && /الترجمات غير النشطة/.test(stState.bytes ?? ''), stState);
    result.steps.pagesErrors = s.errors();
    // حجب طلبات الصور المتعمد (ERR_BLOCKED_BY_CLIENT) ليس خطأ إضافة.
    const real = s.errors().map((e) => ({ ...e, errors: e.errors.filter((x) => !/ERR_BLOCKED_BY_CLIENT/.test(x.text)) }));
    check('pages-no-extension-errors', real.every((e) => e.errors.length === 0), { errors: real.filter((e) => e.errors.length) });
  } finally {
    await s.close();
  }
}

// ================================================================ التشغيل
await mkdir(OUT, { recursive: true });
try {
  if (SCENARIOS.includes('consent') && BROWSER === 'firefox') await step('consent', consentScenario);
  if (SCENARIOS.includes('report')) await step('report', reportScenario);
  if (SCENARIOS.includes('download') && BROWSER === 'chrome') await step('download', downloadScenario);
  if (SCENARIOS.includes('pages') && BROWSER !== 'firefox') await step('pages', pagesScenario);
} finally {
  for (const p of profiles) await rm(path.join(PROFILE_ROOT, p), { recursive: true, force: true }).catch(() => {});
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  result.finishedAt = new Date().toISOString();
  result.profilesRemoved = profiles.length;
  await writeFile(path.join(OUT, `c1-${BROWSER}.json`), `${JSON.stringify(result, null, 2)}\n`);
  const bad = result.checks.filter((c) => c.ok === false).map((c) => c.id);
  const failedSteps = Object.entries(result.steps).filter(([, v]) => v && v.ok === false).map(([k]) => k);
  console.log(`C1 حي (${BROWSER}): ${result.checks.length} فحصًا، فشل ${bad.length} [${bad.join('، ')}]، وخطوات متعطلة [${failedSteps.join('، ')}]`);
  process.exit(0);
}
