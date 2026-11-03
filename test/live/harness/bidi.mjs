// Firefox عبر WebDriver BiDi (جولة النشر T3): ملف تعريف اختبار منفصل خارج المستودع، والإضافة تثبيتًا مؤقتًا بـwebExtension.install
// (غير موقّعة، فتُزال عند الإغلاق)، ومعرّف صفحاتها moz-extension ثابت بتفضيل extensions.webextensions.uuids. والصفحة بواجهة صفحة
// حزام CDP نفسها (eval وclick وkey وgoto وscreenshot وwaitFor) لتعمل السكربتات على العائلتين. لا يُمسّ ملف التعريف الافتراضي.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { PROFILE_ROOT, sleep } from './browser.mjs';

export const FIREFOX = { name: 'Firefox', bin: '/Applications/Firefox.app/Contents/MacOS/firefox', app: '/Applications/Firefox.app' };

/** منفذ محلي حر. */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** تفضيلات ملف الاختبار: بلا شاشات أول تشغيل ولا تحديث ولا قياس، والتنزيل إلى مجلد معلوم بلا سؤال، ومعرّف صفحات الإضافة ثابت. */
export function testPrefs({ downloadDir, extensionId, uuid, extra = {} }) {
  return {
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage_override.mstone': 'ignore',
    'browser.aboutwelcome.enabled': false,
    'browser.newtabpage.enabled': false,
    'browser.tabs.warnOnClose': false,
    'datareporting.policy.dataSubmissionEnabled': false,
    'toolkit.telemetry.reportingpolicy.firstRun': false,
    'app.update.disabledForTesting': true,
    'intl.accept_languages': 'en-US, en',
    'intl.locale.requested': 'en-US',
    'media.autoplay.default': 0,
    'media.autoplay.blocking_policy': 0,
    // كتم نسخة الاختبار كلها كـ--mute-audio في Chromium: لا صوت يخرج من الجهاز في أي تشغيل.
    'media.volume_scale': '0.0',
    'browser.download.dir': downloadDir,
    'browser.download.folderList': 2,
    'browser.download.useDownloadDir': true,
    'browser.download.always_ask_before_handling_new_types': false,
    'browser.download.start_downloads_in_tmp_dir': false,
    'browser.download.manager.showWhenStarting': false,
    'extensions.webextensions.uuids': JSON.stringify({ [extensionId]: uuid }),
    ...extra,
  };
}

/** اتصال BiDi: أوامر بمعرّفات، وأحداث بأسمائها. */
export class BidiConnection {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', (e) => this.#dispatch(String(e.data)));
  }

  #dispatch(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.type === 'error') p.reject(new Error(`${p.method}: ${msg.error} — ${msg.message}`));
      else p.resolve(msg.result);
      return;
    }
    if (msg.type === 'event') for (const l of this.listeners) if (l.method === msg.method) l.cb(msg.params);
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: انتهت المهلة`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, cb) {
    const l = { method, cb };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  waitFor(method, predicate = () => true, { timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const off = this.on(method, (params) => {
        if (!predicate(params)) return;
        clearTimeout(timer);
        off();
        resolve(params);
      });
      const timer = setTimeout(() => {
        off();
        reject(new Error(`انتظار ${method}: انتهت المهلة`));
      }, timeoutMs);
    });
  }

  close() {
    for (const p of this.pending.values()) p.reject(new Error('أُغلق الاتصال'));
    this.pending.clear();
    try {
      this.ws.close();
    } catch {
      // مغلق.
    }
  }
}

/**
 * يشغّل Firefox بملف اختبار ويفتح جلسة BiDi.
 * @param {{ profile: string, prefs: Record<string, unknown>, headless?: boolean }} o
 */
export async function launchFirefox({ profile, prefs, headless = true }) {
  const profileDir = path.join(PROFILE_ROOT, profile);
  await mkdir(profileDir, { recursive: true });
  await writeFile(path.join(profileDir, 'user.js'), `${Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n')}\n`);
  const port = await freePort();
  const args = ['-profile', profileDir, '-no-remote', '--remote-debugging-port', String(port), ...(headless ? ['-headless'] : []), 'about:blank'];
  // صفحات الإضافة (moz-extension) سياقات مميّزة لا يبلغها BiDi إلا بهذا المفتاح الذي يوثّقه Firefox للأتمتة، لنسخة الاختبار وحدها.
  const child = spawn(FIREFOX.bin, args, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' } });
  let stderrTail = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { stderrTail = (stderrTail + d).slice(-4000); });
  let ws = null;
  const end = Date.now() + 30000;
  while (!ws && Date.now() < end) {
    try {
      const sock = new WebSocket(`ws://127.0.0.1:${port}/session`);
      await new Promise((resolve, reject) => {
        sock.addEventListener('open', resolve, { once: true });
        sock.addEventListener('error', () => reject(new Error('ws')), { once: true });
      });
      ws = sock;
    } catch {
      await sleep(300);
    }
  }
  if (!ws) {
    child.kill('SIGTERM');
    throw new Error(`تعذّر الاتصال بـFirefox: ${stderrTail.slice(-400)}`);
  }
  const conn = new BidiConnection(ws);
  const session = await conn.send('session.new', { capabilities: { alwaysMatch: { acceptInsecureCerts: false, unhandledPromptBehavior: { default: 'ignore' } } } });
  const close = async () => {
    try {
      await conn.send('browser.close', {}, 5000);
    } catch {
      child.kill('SIGTERM');
    }
    conn.close();
    await new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));
  };
  return { conn, child, profileDir, version: { product: `Firefox/${session.capabilities.browserVersion}`, ...session.capabilities }, close, stderrTail: () => stderrTail };
}

/** يحوّل قيمة BiDi البعيدة إلى قيمة JavaScript (ما يلزم الحزام). */
export function deserialize(v) {
  if (!v) return undefined;
  switch (v.type) {
    case 'undefined': return undefined;
    case 'null': return null;
    case 'string': case 'boolean': return v.value;
    case 'number': return typeof v.value === 'string' ? Number(v.value === '-0' ? -0 : v.value) : v.value;
    case 'array': return (v.value ?? []).map(deserialize);
    case 'object': return Object.fromEntries((v.value ?? []).map(([k, x]) => [typeof k === 'string' ? k : deserialize(k), deserialize(x)]));
    default: return v;
  }
}

/** صفحة BiDi بواجهة صفحة الحزام: تقييم في العالم الرئيسي، ونقرات ومفاتيح بأحداث إدخال موثوقة. */
export class BidiPage {
  constructor(conn, context) {
    this.conn = conn;
    this.context = context;
    this.mouse = null;
  }

  static async open(conn, url = 'about:blank', { background = false } = {}) {
    const { context } = await conn.send('browsingContext.create', { type: 'tab', background });
    const page = new BidiPage(conn, context);
    if (url !== 'about:blank') await page.goto(url);
    return page;
  }

  async goto(url, { waitMs = 45000 } = {}) {
    await this.conn.send('browsingContext.navigate', { context: this.context, url, wait: 'complete' }, waitMs);
  }

  async reload({ waitMs = 45000 } = {}) {
    await this.conn.send('browsingContext.reload', { context: this.context, wait: 'complete' }, waitMs);
  }

  async url() {
    const { contexts } = await this.conn.send('browsingContext.getTree', { root: this.context, maxDepth: 0 });
    return contexts[0]?.url ?? null;
  }

  /** تقييم في العالم الرئيسي؛ الدالة بلا إغلاق خارجي، والمعاملات والنتيجة JSON. userActivation يمنح الاستدعاء فعل مستخدم. */
  async eval(fnOrExpr, { args = [], userActivation = false, timeoutMs = 30000 } = {}) {
    const fn = typeof fnOrExpr === 'function' ? fnOrExpr.toString() : `() => (${fnOrExpr})`;
    const r = await this.conn.send('script.callFunction', {
      functionDeclaration: `async (json) => { const v = await (${fn})(...JSON.parse(json)); return v === undefined ? '__undefined__' : JSON.stringify(v); }`,
      arguments: [{ type: 'string', value: JSON.stringify(args) }],
      target: { context: this.context },
      awaitPromise: true,
      resultOwnership: 'none',
      userActivation,
    }, timeoutMs);
    if (r.type === 'exception') throw new Error(`تقييم فشل: ${r.exceptionDetails?.text ?? 'استثناء'}`);
    const s = deserialize(r.result);
    return s === '__undefined__' ? undefined : JSON.parse(s);
  }

  async waitFor(fn, { timeoutMs = 20000, intervalMs = 300, args = [] } = {}) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try {
        const v = await this.eval(fn, { args });
        if (v) return v;
      } catch {
        // السياق قد يتغير أثناء التنقل.
      }
      await sleep(intervalMs);
    }
    return null;
  }

  async mouseMove(x, y) {
    await this.conn.send('input.performActions', {
      context: this.context,
      actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', x: Math.round(x), y: Math.round(y), duration: 150 }] }],
    });
    this.mouse = { x, y };
  }

  async click(x, y) {
    const from = this.mouse ?? { x: Math.max(0, x - 120), y: Math.max(0, y - 60) };
    await this.conn.send('input.performActions', {
      context: this.context,
      actions: [{
        type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', x: Math.round(from.x), y: Math.round(from.y), duration: 0 },
          { type: 'pointerMove', x: Math.round(x), y: Math.round(y), duration: 150 + Math.round(Math.random() * 100) },
          { type: 'pause', duration: 80 + Math.round(Math.random() * 100) },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 60 + Math.round(Math.random() * 60) },
          { type: 'pointerUp', button: 0 },
        ],
      }],
    });
    await this.conn.send('input.releaseActions', { context: this.context });
    this.mouse = { x, y };
  }

  /** مفتاح واحد بقيمته في WebDriver (مثل '' لـEnter) أو محرف. */
  async key(value) {
    await this.conn.send('input.performActions', {
      context: this.context,
      actions: [{ type: 'key', id: 'keyboard', actions: [{ type: 'keyDown', value }, { type: 'pause', duration: 40 }, { type: 'keyUp', value }] }],
    });
    await this.conn.send('input.releaseActions', { context: this.context });
  }

  /** كتابة نص محرفًا محرفًا بأحداث إدخال حقيقية. */
  async type(text) {
    const actions = [];
    for (const ch of text) actions.push({ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch });
    await this.conn.send('input.performActions', { context: this.context, actions: [{ type: 'key', id: 'keyboard', actions }] });
    await this.conn.send('input.releaseActions', { context: this.context });
  }

  async centerOf(selector, { scroll = true } = {}) {
    return this.eval((sel, doScroll) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      if (doScroll) el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    }, { args: [selector, scroll] });
  }

  /** يملأ حقل ملف بمسارات محلية (عنصر في هذه الصفحة بمحدده). */
  async setFiles(selector, files) {
    const r = await this.conn.send('script.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})`, target: { context: this.context }, awaitPromise: false, resultOwnership: 'root',
    });
    if (r.result?.type !== 'node') throw new Error(`لا عنصر ${selector}`);
    await this.conn.send('input.setFiles', { context: this.context, element: { sharedId: r.result.sharedId }, files });
  }

  async screenshot(file) {
    const { data } = await this.conn.send('browsingContext.captureScreenshot', { context: this.context });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(data, 'base64'));
    return file;
  }

  async close() {
    try {
      await this.conn.send('browsingContext.close', { context: this.context });
    } catch {
      // مغلق.
    }
  }
}
