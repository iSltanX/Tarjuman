// تشغيل Brave أو Chrome بملف تعريف اختبار منفصل خارج المستودع، والتحكم بهما عبر CDP بالأنبوب.
// لا يُمسّ ملف التعريف الافتراضي. الإضافة تُحمَّل بـExtensions.loadUnpacked (يتطلب الأنبوب و
// --enable-unsafe-extension-debugging)، ثم --load-extension، وإلا فالتحميل اليدوي مرة واحدة.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CdpConnection, pipeTransport } from './cdp.mjs';

export const BROWSERS = {
  brave: { name: 'Brave', bin: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
  chrome: { name: 'Chrome', bin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
};

export const PROFILE_ROOT = path.join(os.homedir(), 'Library/Application Support/Tarjuman-test');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** وتيرة بشرية: انتظار بين min وmax. */
export const human = (min = 600, max = 1400) => sleep(min + Math.random() * (max - min));

/**
 * @param {{ browser: 'brave' | 'chrome', extensionPath?: string, flagLoad?: boolean }} opts
 */
export async function launch({ browser, extensionPath, flagLoad = false, profile = browser, headless = false }) {
  const spec = BROWSERS[browser];
  const profileDir = path.join(PROFILE_ROOT, profile);
  await mkdir(profileDir, { recursive: true });
  const args = [
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--lang=en-US',
    '--accept-lang=en-US,en',
    '--window-size=1400,950',
    '--window-position=40,40',
    // يكتم صوت نسخة الاختبار هذه وحدها طوال عمرها (مع التنقل وإعادة التحميل)، لا صوت الجهاز ولا متصفح المستخدم.
    '--mute-audio',
  ];
  if (flagLoad && extensionPath) args.push(`--load-extension=${extensionPath}`);
  // بلا نافذة ولا تركيز (للتشخيص الذي لا يعتمد على محتوى الجسم). علامة الأتمتة تبقى ظاهرة كما هي.
  if (headless) args.push('--headless=new');
  args.push('about:blank');
  const child = spawn(spec.bin, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let stderrTail = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { stderrTail = (stderrTail + d).slice(-4000); });
  const conn = new CdpConnection(pipeTransport(child));
  const version = await conn.send('Browser.getVersion', {}, undefined, 30000);
  const close = async () => {
    try {
      await conn.send('Browser.close', {}, undefined, 5000);
    } catch {
      child.kill('SIGTERM');
    }
    conn.close();
  };
  return { conn, child, version, profileDir, close, stderrTail: () => stderrTail };
}

/** @returns {Promise<{ id: string, method: string } | { error: string }>} */
export async function loadExtension(conn, extensionPath) {
  try {
    const r = await conn.send('Extensions.loadUnpacked', { path: extensionPath });
    return { id: r.id, method: 'Extensions.loadUnpacked' };
  } catch (err) {
    return { error: err.message };
  }
}

/** يبحث عن الإضافة المحمّلة بين الأهداف (صفحاتها أو عاملها) أو بين سياقات صفحة. */
export async function findExtensionTargets(conn) {
  const { targetInfos } = await conn.send('Target.getTargets');
  return targetInfos.filter((t) => t.url.startsWith('chrome-extension://'));
}

export class Page {
  constructor(conn, targetId, sessionId) {
    this.conn = conn;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.contexts = new Map();
    this.mainFrameId = null;
    conn.on('Runtime.executionContextCreated', ({ context }) => this.contexts.set(context.id, context), sessionId);
    conn.on('Runtime.executionContextDestroyed', ({ executionContextId }) => this.contexts.delete(executionContextId), sessionId);
    conn.on('Runtime.executionContextsCleared', () => this.contexts.clear(), sessionId);
  }

  /**
   * @param {{ runtime?: boolean }} [opts] runtime=false لا يفعّل مجال Runtime (تفعيله قابل للكشف من الصفحة)؛
   *   التقييم في العالم الرئيسي يعمل دونه، أما سياقات العوالم المعزولة فتحتاجه.
   */
  static async open(conn, url = 'about:blank', { runtime = true } = {}) {
    const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(conn, targetId, sessionId);
    await page.send('Page.enable');
    if (runtime) await page.send('Runtime.enable');
    const { frameTree } = await page.send('Page.getFrameTree');
    page.mainFrameId = frameTree.frame.id;
    if (url !== 'about:blank') await page.goto(url);
    return page;
  }

  send(method, params = {}, timeoutMs) {
    return this.conn.send(method, params, this.sessionId, timeoutMs);
  }

  on(method, cb) {
    return this.conn.on(method, cb, this.sessionId);
  }

  async goto(url, { waitMs = 30000 } = {}) {
    const loaded = this.conn.waitFor('Page.loadEventFired', () => true, { sessionId: this.sessionId, timeoutMs: waitMs }).catch(() => null);
    const r = await this.send('Page.navigate', { url });
    if (r.errorText) throw new Error(`التنقل فشل: ${r.errorText}`);
    await loaded;
  }

  async reload() {
    const loaded = this.conn.waitFor('Page.loadEventFired', () => true, { sessionId: this.sessionId, timeoutMs: 30000 }).catch(() => null);
    await this.send('Page.reload', { ignoreCache: false });
    await loaded;
  }

  /** تقييم في العالم الرئيسي (أو سياق محدد). الدالة تُمرَّر نصًا أو دالة بلا إغلاق خارجي. */
  async eval(fnOrExpr, { contextId, args = [] } = {}) {
    const expression = typeof fnOrExpr === 'function' ? `(${fnOrExpr.toString()})(...${JSON.stringify(args)})` : fnOrExpr;
    const params = { expression, awaitPromise: true, returnByValue: true, userGesture: false };
    if (contextId) params.contextId = contextId;
    const r = await this.send('Runtime.evaluate', params);
    if (r.exceptionDetails) {
      throw new Error(`تقييم فشل: ${r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text}`);
    }
    return r.result.value;
  }

  /** سياق العالم المعزول لإضافة معيّنة في الإطار الرئيسي. */
  isolatedContextId(extensionId) {
    for (const c of this.contexts.values()) {
      if (c.auxData?.frameId === this.mainFrameId && c.auxData?.type === 'isolated' && c.origin === `chrome-extension://${extensionId}`) return c.id;
    }
    return null;
  }

  async waitFor(fn, { timeoutMs = 20000, intervalMs = 300, args = [], contextId } = {}) {
    const end = Date.now() + timeoutMs;
    let last;
    while (Date.now() < end) {
      try {
        last = await this.eval(fn, { args, contextId });
        if (last) return last;
      } catch {
        // السياق قد يتغير أثناء التنقل.
      }
      await sleep(intervalMs);
    }
    return null;
  }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(data, 'base64'));
    return file;
  }

  async mouseMove(x, y, steps = 8) {
    const from = this.mouse || { x: x - 120, y: y - 60 };
    for (let i = 1; i <= steps; i++) {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + ((x - from.x) * i) / steps, y: from.y + ((y - from.y) * i) / steps });
      await sleep(15 + Math.random() * 25);
    }
    this.mouse = { x, y };
  }

  async click(x, y) {
    await this.mouseMove(x, y);
    await sleep(80 + Math.random() * 120);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60 + Math.random() * 60);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  /** مركز عنصر في إحداثيات النافذة بعد تمريره إلى العرض، أو null. */
  async centerOf(selector, { scroll = true } = {}) {
    return this.eval((sel, doScroll) => {
      const el = typeof sel === 'string' ? document.querySelector(sel) : null;
      if (!el) return null;
      if (doScroll) el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    }, { args: [selector, scroll] });
  }

  async key(key, code, keyCode) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text: key.length === 1 ? key : undefined });
    await sleep(50 + Math.random() * 50);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }

  async close() {
    try {
      await this.conn.send('Target.closeTarget', { targetId: this.targetId });
    } catch {
      // مغلق.
    }
  }
}
