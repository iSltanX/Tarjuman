// سائق موحّد للمتصفحات الأربعة (جولة النشر T3): Brave وChrome وEdge بـCDP عبر الأنبوب (test/live/harness/browser.mjs)، وFirefox
// بـWebDriver BiDi (test/live/harness/bidi.mjs). يعطي السكربت جلسة واحدة الشكل: تثبيت الإضافة وإزالتها، وتبويب يوتيوب وصفحات
// الإضافة بصفحات لها eval وclick وtypeText وpress وsetFiles وarmChooser، وحجب طلبات خادم البلاغات، وأخطاء الإضافة، ومجلدات
// تخزينها في ملف التعريف (لقياس المحو عند الإزالة). ملفات التعريف خارج المستودع، والصوت مكتوم في الأربعة.
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { FONT_READ_LOG, collectErrors, openTab } from '../harness/extension.mjs';
import { BidiPage, FIREFOX, launchFirefox, testPrefs } from '../harness/bidi.mjs';

/** مضيف خادم البلاغات قبل و1 (2.2.0): يُحجب ويُعدّ كل طلب إليه حارسًا، والمنتظر صفر. */
export const REPORTS_HOST = 'app-reports.isultantf.workers.dev';
export const GECKO_ID = 'tarjuman@bysltan.com';
export const APPS = { ...BROWSERS, firefox: FIREFOX };

const CDP_KEYS = { Escape: ['Escape', 'Escape', 27], Tab: ['Tab', 'Tab', 9], Enter: ['Enter', 'Enter', 13], End: ['End', 'End', 35] };
const BIDI_KEYS = { Escape: '', Tab: '', Enter: '', End: '' };

/**
 * رمز جلسة الحزام لبناء التطوير (تدقيق 7a66f91، U65): يكتبه scripts/build.mjs في dev/harness-token.txt، والجسر لا يجيب بغيره.
 * وبلا الملف (حزمة المتجر، T8) لا جسر أصلًا. @param {string} ext مجلد الإضافة المبنية
 */
export async function harnessToken(ext) {
  try {
    return (await readFile(path.join(ext, 'dev', 'harness-token.txt'), 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

/** يرسل طلبًا إلى جسر الحزام (src/dev/harness-bridge.js) من العالم الرئيسي لصفحة يوتيوب برمز جلستها، وينتظر رده. */
export function bridge(page, op, args = [], timeoutMs = 8000) {
  return page.eval((o, a, ms, tok) => new Promise((resolve) => {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const t = setTimeout(() => { window.removeEventListener('message', h); resolve({ ok: false, error: 'timeout' }); }, ms);
    function h(e) {
      if (e.source === window && e.data && e.data.source === 'tarjuman-harness-reply' && e.data.id === id) {
        clearTimeout(t);
        window.removeEventListener('message', h);
        resolve(e.data);
      }
    }
    window.addEventListener('message', h);
    window.postMessage({ source: 'tarjuman-harness', id, op: o, args: a, token: tok }, '*');
  }), { args: [op, args, timeoutMs, page.harnessToken ?? null] });
}

// ---------------------------------------------------------------- Chromium (CDP)

async function writeChromiumPrefs(profile, downloadDir) {
  const file = path.join(PROFILE_ROOT, profile, 'Default', 'Preferences');
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(downloadDir, { recursive: true });
  await writeFile(file, JSON.stringify({ download: { default_directory: downloadDir, prompt_for_download: false, directory_upgrade: true }, savefile: { default_directory: downloadDir } }));
}

function cdpPage(b, page) {
  page.typeText = (text) => page.send('Input.insertText', { text });
  page.press = (k) => page.key(...CDP_KEYS[k]);
  page.setFiles = async (selector, files) => {
    const { root } = await page.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`لا عنصر ${selector}`);
    await page.send('DOM.setFileInputFiles', { nodeId, files });
  };
  /** يملأ منتقي الملفات التالي الذي تفتحه الصفحة (ولو في جذر مغلق) بالملفات المعطاة. */
  page.armChooser = async (files) => {
    await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
    const opened = b.conn.waitFor('Page.fileChooserOpened', () => true, { sessionId: page.sessionId, timeoutMs: 20000 });
    return opened.then(async ({ backendNodeId }) => {
      await page.send('DOM.setFileInputFiles', { files, backendNodeId });
      await page.send('Page.setInterceptFileChooserDialog', { enabled: false });
      return true;
    }, () => false);
  };
  return page;
}

async function chromium(browser, { profile, ext, downloadDir, headless, extraArgs = [] }) {
  await writeChromiumPrefs(profile, downloadDir);
  const token = await harnessToken(ext);
  const b = await launch({ browser, profile, headless, extraArgs });
  let loaded = await loadExtension(b.conn, ext);
  if (loaded.error) throw new Error(`تعذّر تحميل الإضافة: ${loaded.error}`);
  let id = loaded.id;
  const tracked = [];
  const reportsBlocked = { count: 0 };
  const open = async (url, where) => {
    const page = await openTab(b.conn, 'about:blank');
    await page.send('DOM.enable');
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
    tracked.push({ where, errs: collectErrors(page, { extId: id, onlyExtension: where === 'youtube' }) });
    await page.goto(url);
    const p = cdpPage(b, page);
    p.harnessToken = token;
    return p;
  };
  return {
    kind: 'chromium',
    version: b.version.product,
    profileDir: b.profileDir,
    get base() { return `chrome-extension://${id}/`; },
    get extensionId() { return id; },
    youtube: (url) => open(url, 'youtube'),
    extPage: (rel) => open(`chrome-extension://${id}/${rel}`, rel.split(/[?#]/)[0]),
    /** صفحة إضافة بلا جسر الحزام (حزمة المتجر، T8): في Chromium هي extPage نفسها. */
    openExt: (rel) => open(`chrome-extension://${id}/${rel}`, rel.split(/[?#]/)[0]),
    /** يغلق كل تبويب لصفحة من صفحات الإضافة بقي مفتوحًا (قبل الإزالة). يعيد عددها. */
    async closeExtPages() {
      const { targetInfos } = await b.conn.send('Target.getTargets');
      const open = targetInfos.filter((t) => t.type === 'page' && t.url.startsWith(`chrome-extension://${id}/`));
      for (const t of open) await b.conn.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
      return open.length;
    },
    async uninstall() {
      try {
        await b.conn.send('Extensions.uninstall', { id });
        return { method: 'Extensions.uninstall' };
      } catch (err) {
        return { error: err.message };
      }
    },
    async install() {
      loaded = await loadExtension(b.conn, ext);
      if (loaded.error) throw new Error(`تعذّر تحميل الإضافة: ${loaded.error}`);
      id = loaded.id;
      return id;
    },
    /** chrome.storage.local للإضافة في ملف التعريف. */
    storageDirs: async () => [path.join(b.profileDir, 'Default', 'Local Extension Settings', id)],
    async blockReports(page) {
      await page.send('Fetch.enable', { patterns: [{ urlPattern: `https://${REPORTS_HOST}/*` }] });
      page.on('Fetch.requestPaused', ({ requestId }) => {
        reportsBlocked.count += 1;
        page.send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' }).catch(() => {});
      });
    },
    reportsBlocked,
    /** يعترض طلبات صفحة إلى مضيفات بعينها: يسجّل عنوانها ثم يُفشلها قبل خروجها (تدقيق 7a66f91، C1). */
    async interceptPage(page, hosts, onRequest) {
      await page.send('Fetch.enable', { patterns: hosts.map((h) => ({ urlPattern: `*://${h}/*` })) });
      page.on('Fetch.requestPaused', ({ requestId, request }) => {
        try { onRequest(request.url, request); } catch { /* المسجّل لا يوقف الاعتراض */ }
        page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      });
    },
    errors() {
      return tracked.map((t) => {
        const list = t.errs.list;
        const fonts = list.filter((x) => x.kind === 'log.security' && FONT_READ_LOG.test(x.text));
        return { where: t.where, errors: list.filter((x) => !fonts.includes(x)).map((x) => ({ kind: x.kind, text: String(x.text).slice(0, 200) })), fontReadLogs: fonts.length };
      });
    },
    async close() {
      tracked.forEach((t) => t.errs.stop());
      const exited = new Promise((r) => (b.child.exitCode !== null ? r() : b.child.once('exit', r)));
      await b.close();
      await Promise.race([exited, sleep(15000)]);
    },
  };
}

// ---------------------------------------------------------------- Firefox (BiDi)

function bidiPage(conn, page, chooser) {
  page.typeText = (text) => page.type(text);
  page.press = (k) => page.key(BIDI_KEYS[k]);
  page.armChooser = (files) => chooser(page, files);
  return page;
}

async function firefox({ profile, ext, downloadDir, headless }) {
  await mkdir(downloadDir, { recursive: true });
  const token = await harnessToken(ext);
  // معرّف صفحات الإضافة ثابت بتفضيل extensions.webextensions.uuids (bidi.mjs)، فيُعرف أصلها بلا جسر (openExt لحزمة المتجر).
  const uuid = randomUUID();
  const ff = await launchFirefox({
    profile, headless,
    // الأذونات الاختيارية تُمنح بلا سؤال في نسخة الاختبار (لا نافذة تجيب)، والإذن نفسه وحواره في الجلسة اليدوية.
    prefs: testPrefs({ downloadDir, extensionId: GECKO_ID, uuid, extra: { 'extensions.webextOptionalPermissionPrompts': false } }),
  });
  const { conn } = ff;
  const logs = [];
  await conn.send('session.subscribe', { events: ['log.entryAdded'] });
  conn.on('log.entryAdded', (e) => logs.push(e));
  const notes = [];
  try {
    await conn.send('browser.setDownloadBehavior', { downloadBehavior: { type: 'allowed', destinationFolder: downloadDir } });
  } catch (err) {
    notes.push(`browser.setDownloadBehavior: ${err.message.slice(0, 120)}`);
  }
  let chooserSupported = true;
  try {
    await conn.send('session.subscribe', { events: ['input.fileDialogOpened'] });
  } catch (err) {
    chooserSupported = false;
    notes.push(`input.fileDialogOpened: ${err.message.slice(0, 120)}`);
  }
  const chooser = (page, files) => (!chooserSupported ? Promise.resolve(false)
    : conn.waitFor('input.fileDialogOpened', (p) => p.context === page.context, { timeoutMs: 20000 }).then(async (p) => {
      if (!p.element) {
        notes.push(`input.fileDialogOpened بلا عنصر (multiple=${p.multiple})`);
        return false;
      }
      try {
        await conn.send('input.setFiles', { context: p.context, element: p.element, files });
        return true;
      } catch (err) {
        notes.push(`input.setFiles: ${err.message.slice(0, 160)}`);
        return false;
      }
    }, (err) => {
      notes.push(`input.fileDialogOpened: ${err.message.slice(0, 120)}`);
      return false;
    }));
  const install = async () => (await conn.send('webExtension.install', { extensionData: { type: 'path', path: ext } })).extension;
  let extensionId = await install();
  let base = null;
  /** صفحة الإطلاق: تبويب يوتيوب بجسر الحزام، يفتح صفحات الإضافة عبر سكربت خلفية الحزام (ولا يُغلق قبل نهاية الجلسة). */
  let launcher = null;
  const reportsBlocked = { count: 0 };
  const extContexts = new Set();

  async function contextOf(url, timeoutMs = 15000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const { contexts } = await conn.send('browsingContext.getTree', {});
      const c = contexts.find((x) => x.url.startsWith(url));
      if (c) return c.context;
      await sleep(250);
    }
    return null;
  }

  return {
    kind: 'firefox',
    version: ff.version.product,
    profileDir: ff.profileDir,
    notes,
    get base() { return base; },
    get extensionId() { return extensionId; },
    async youtube(url) {
      const page = bidiPage(conn, await BidiPage.open(conn, url), chooser);
      page.harnessToken = token;
      launcher = launcher ?? { page };
      return page;
    },
    /** أصل صفحات الإضافة من الجسر (المعرّف عشوائي لكل تثبيت مؤقت). */
    async learnBase(ytPage) {
      const r = await bridge(ytPage, 'base');
      if (r.ok) base = r.value;
      launcher = { page: ytPage };
      return base;
    },
    async extPage(rel) {
      if (!base || !launcher) throw new Error('لا صفحة إطلاق ولا أصل لصفحات الإضافة بعد');
      const before = new Set((await conn.send('browsingContext.getTree', {})).contexts.map((c) => c.context));
      const r = await bridge(launcher.page, 'open', [rel]);
      if (!r.ok || !r.value?.ok) throw new Error(`تعذّر فتح ${rel}: ${JSON.stringify(r).slice(0, 160)}`);
      const end = Date.now() + 15000;
      let ctx = null;
      while (!ctx && Date.now() < end) {
        const { contexts } = await conn.send('browsingContext.getTree', {});
        ctx = contexts.find((c) => !before.has(c.context) && c.url.startsWith(base))?.context ?? null;
        if (!ctx) await sleep(250);
      }
      if (!ctx) throw new Error(`لم يظهر تبويب ${rel}`);
      extContexts.add(ctx);
      const page = bidiPage(conn, new BidiPage(conn, ctx), chooser);
      await page.waitFor(() => document.readyState === 'complete', { timeoutMs: 15000 });
      return page;
    },
    /** صفحة إضافة بلا جسر الحزام (حزمة المتجر، T8): تبويب جديد إلى أصلها المعروف من التفضيل. */
    async openExt(rel) {
      base = base ?? `moz-extension://${uuid}/`;
      const page = bidiPage(conn, await BidiPage.open(conn, `${base}${rel}`), chooser);
      extContexts.add(page.context);
      await page.waitFor(() => document.readyState === 'complete', { timeoutMs: 15000 });
      return page;
    },
    /**
     * يغلق كل سياق لصفحة من صفحات الإضافة بقي مفتوحًا، بلا حوار مغادرة (promptUnload: false)، قبل الإزالة: صفحة بتعديل غير محفوظ
     * يسأل حوارها عند إغلاقها بالإزالة، والجلسة تتجاهل الحوارات (unhandledPromptBehavior: ignore)، فتعلّقت webExtension.uninstall
     * حتى المهلة (تحقق Gemini، T1-ب). يعيد عددها.
     */
    async closeExtPages() {
      const prefix = base ?? `moz-extension://${uuid}/`;
      const { contexts } = await conn.send('browsingContext.getTree', {});
      const open = contexts.filter((c) => c.url.startsWith(prefix));
      for (const c of open) await conn.send('browsingContext.close', { context: c.context, promptUnload: false }).catch(() => {});
      return open.length;
    },
    async uninstall() {
      try {
        await conn.send('webExtension.uninstall', { extension: extensionId });
        return { method: 'webExtension.uninstall' };
      } catch (err) {
        return { error: err.message };
      }
    },
    async install() {
      extensionId = await install();
      base = null;
      return extensionId;
    },
    /** storage.local في Firefox قاعدة IndexedDB باسم أصل moz-extension+++<uuid>. */
    async storageDirs() {
      const uuid = base ? new URL(base).host : null;
      const root = path.join(ff.profileDir, 'storage', 'default');
      let names = [];
      try {
        names = await readdir(root);
      } catch {
        names = [];
      }
      return names.filter((n) => n.startsWith('moz-extension+++') && (!uuid || n.includes(uuid))).map((n) => path.join(root, n));
    },
    async blockReports() {
      await conn.send('session.subscribe', { events: ['network.beforeRequestSent'] });
      await conn.send('network.addIntercept', { phases: ['beforeRequestSent'], urlPatterns: [{ type: 'pattern', protocol: 'https', hostname: REPORTS_HOST }] });
      conn.on('network.beforeRequestSent', (p) => {
        if (!p.isBlocked) return;
        reportsBlocked.count += 1;
        conn.send('network.failRequest', { request: p.request.request }).catch(() => {});
      });
    },
    reportsBlocked,
    /**
     * يعترض كل طلب إلى مضيفات بعينها عند beforeRequestSent: يسلّم بياناته (الطريقة والعنوان والترويسات كما سيرسلها Firefox)
     * ثم failRequest فلا يخرج (تدقيق 7a66f91، C1: I14 وطلبات الصور).
     */
    async interceptHosts(hosts, onRequest) {
      await conn.send('session.subscribe', { events: ['network.beforeRequestSent'] });
      await conn.send('network.addIntercept', { phases: ['beforeRequestSent'], urlPatterns: hosts.map((h) => ({ type: 'pattern', protocol: 'https', hostname: h })) });
      conn.on('network.beforeRequestSent', (p) => {
        if (!p.isBlocked) return;
        let host = '';
        try { host = new URL(p.request.url).hostname; } catch { /* عنوان غير صالح */ }
        if (!hosts.includes(host)) return;
        try { onRequest(p.request); } catch { /* المسجّل لا يوقف الاعتراض */ }
        conn.send('network.failRequest', { request: p.request.request }).catch(() => {});
      });
    },
    errors() {
      const mine = logs.filter((e) => e.level === 'error' && ((base && (String(e.text).includes(base) || JSON.stringify(e.stackTrace ?? {}).includes(base))) || extContexts.has(e.source?.context)));
      return [{ where: 'firefox', errors: mine.map((e) => ({ kind: `log.${e.type}`, text: String(e.text).slice(0, 200) })), fontReadLogs: 0 }];
    },
    async close() {
      await ff.close();
    },
  };
}

/**
 * @param {'brave'|'chrome'|'edge'|'firefox'} browser
 * @param {{ profile: string, ext: string, downloadDir: string, headless?: boolean }} o
 */
export function startBrowser(browser, o) {
  return browser === 'firefox' ? firefox({ headless: true, ...o }) : chromium(browser, { headless: true, ...o });
}
