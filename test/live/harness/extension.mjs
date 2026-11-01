// أدوات الحزام للإضافة نفسها (تثبّتها P2 للمراحل اللاحقة): فتح صفحاتها في تبويب أمامي أو خلفي، وانتظار
// تبويب جديد تفتحه، وجمع أخطاء الإضافة وحدها (لا أخطاء يوتيوب)، والوضع الداكن، ولقطة الصفحة كاملة.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Page, sleep } from './browser.mjs';

/**
 * يفتح عنوانًا في تبويب جديد. background=true يبقي التبويب النشط كما هو (فتبقى صفحة يوتيوب «التبويب
 * النشط» لنافذة الأيقونة).
 * @param {import('./cdp.mjs').CdpConnection} conn
 * @param {string} url
 * @param {{ background?: boolean, waitMs?: number }} [opts]
 */
export async function openTab(conn, url, { background = false, waitMs = 30000 } = {}) {
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank', background });
  return attach(conn, targetId, { url, waitMs });
}

/** يلتحق بهدف موجود (تبويب فتحته الإضافة) ويفعّل Page وRuntime وLog. */
export async function attach(conn, targetId, { url, waitMs = 30000 } = {}) {
  const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
  const page = new Page(conn, targetId, sessionId);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Log.enable');
  const { frameTree } = await page.send('Page.getFrameTree');
  page.mainFrameId = frameTree.frame.id;
  if (url) await page.goto(url, { waitMs });
  return page;
}

/**
 * ينتظر هدفًا جديدًا يطابق العنوان (مثل تبويب فتحته نافذة الأيقونة بـchrome.tabs.create).
 * @param {import('./cdp.mjs').CdpConnection} conn @param {(url: string) => boolean} match
 */
export async function waitForTarget(conn, match, { timeoutMs = 10000, exclude = new Set() } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const { targetInfos } = await conn.send('Target.getTargets');
    const t = targetInfos.find((x) => x.type === 'page' && !exclude.has(x.targetId) && match(x.url));
    if (t) return t;
    await sleep(200);
  }
  return null;
}

/**
 * يجمع أخطاء الإضافة: الاستثناءات وأخطاء الكونسول وسجل المتصفح. في صفحة يوتيوب يُحسب ما وقع في العالم
 * المعزول للإضافة أو مصدره عنوان chrome-extension://<id> فقط؛ وفي صفحات الإضافة يُحسب كل شيء.
 * @param {Page} page @param {{ extId: string, onlyExtension?: boolean }} opts
 */
export function collectErrors(page, { extId, onlyExtension = false }) {
  const prefix = `chrome-extension://${extId}`;
  const list = [];
  const ours = (ctxId, url, stack) => {
    if (!onlyExtension) return true;
    const ctx = page.contexts.get(ctxId);
    if (ctx && ctx.origin === prefix) return true;
    if (url && url.startsWith(prefix)) return true;
    return (stack?.callFrames ?? []).some((f) => f.url?.startsWith(prefix));
  };
  const clip = (s) => String(s ?? '').replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300);
  const offs = [
    page.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
      if (ours(d.executionContextId, d.url, d.stackTrace)) list.push({ kind: 'exception', text: clip(d.exception?.description ?? d.text) });
    }),
    page.on('Runtime.consoleAPICalled', (e) => {
      if ((e.type === 'error' || e.type === 'assert') && ours(e.executionContextId, null, e.stackTrace)) {
        list.push({ kind: `console.${e.type}`, text: clip(e.args?.map((a) => a.value ?? a.description).join(' ')) });
      }
    }),
    page.on('Log.entryAdded', ({ entry }) => {
      if (entry.level === 'error' && (!onlyExtension || entry.url?.startsWith(prefix))) list.push({ kind: `log.${entry.source}`, text: clip(entry.text) });
    }),
  ];
  return { list, stop: () => offs.forEach((off) => off?.()) };
}

/** @param {Page} page @param {'light' | 'dark'} scheme */
export const emulateScheme = (page, scheme) => page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });

/**
 * لقطة الصفحة كاملة بعرض محدد: نافذة العرض تُضبط على العرض ثم على طول المحتوى، وتُلتقط النافذة نفسها.
 * (captureBeyondViewport يعيد التخطيط بعرض أكبر فتنزاح صفحات RTL خارج اللقطة.)
 * @param {Page} page @param {string} file
 */
export async function fullScreenshot(page, file, { width = 1280 } = {}) {
  const size = (height) => page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await size(800);
  await sleep(150);
  try {
    const content = await page.eval(() => Math.ceil(document.documentElement.scrollHeight));
    await size(Math.min(Math.max(content, 200), 6000));
    await sleep(150);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(data, 'base64'));
  } finally {
    await page.send('Emulation.clearDeviceMetricsOverride');
  }
  return file;
}
