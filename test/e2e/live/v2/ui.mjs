// أدوات الواجهة لسكربتات P15 المؤتمتة (من دخان W7، test/live/pages/p13.mjs وtest/live/editor/v2.mjs): ضغطات Input حقيقية
// في مركز عنصر تعيده عبارة JS، وكتابة، ومنتقي الملفات، وبصمة التخزين لكل مفتاح، وتنزيلات مجلد الاختبار.
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { human, sleep } from '../../../live/harness/browser.mjs';
import { attach, collectErrors } from '../../../live/harness/extension.mjs';

export const ISOLATES = new RegExp(`[${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}]`, 'g');
export const clean = (s) => String(s ?? '').replace(ISOLATES, '').replace(/\s+/g, ' ').trim();
/** سجل المتصفح لقراءة خط الترجمة من الحزمة (P6) ليس خطأ إضافة. */
export const FONT_READ_LOG = /^Unsafe attempt to load URL chrome-extension:\/\/[^/]+\/ui\/fonts\/subtitle\/[a-z0-9-]+-(?:400|700)\.woff2 /;

export function appVersion(app) {
  try {
    return String(execFileSync('/usr/bin/defaults', ['read', path.join(app, 'Contents/Info.plist'), 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}

/** JSON بمفاتيح مرتبة: chrome.storage يعيد مفاتيح الكائنات مرتبة، فالمقارنة بالمحتوى لا بالنص الحرفي. */
export const canonical = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v));

export const byText = (sel, text, root = 'document') => `[...${root}.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(text)}))`;
export const topDialog = `[...document.querySelectorAll('dialog.tj-dialog[open]:not(.lib-panel)')].at(-1)`;
export const confirmBtn = `${topDialog}?.querySelector('button[value="confirm"]')`;
export const cancelBtn = `${topDialog}?.querySelector('button[value="cancel"]')`;
export const textOf = (page, expr) => page.eval(`(() => { const e = (${expr}); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);

/** ضغطة Input حقيقية في مركز عنصر تعيده عبارة JS (نص) في صفحة؛ تعيد لحظة إرسال النقرة. */
export async function clickOn(page, expr, label, { wait = true } = {}) {
  const ok = await page.eval(`(() => { for (const e of document.querySelectorAll('[data-p15]')) e.removeAttribute('data-p15'); const el = (${expr}); if (!el) return false; el.setAttribute('data-p15', '1'); return true; })()`);
  if (!ok) throw new Error(`لم يوجد: ${label}`);
  const c = await page.centerOf('[data-p15="1"]');
  if (!c) throw new Error(`غير ظاهر: ${label}`);
  const at = Date.now();
  await page.click(c.x, c.y);
  if (wait) await human(250, 450);
  return at;
}

export async function typeInto(page, expr, text, label) {
  await clickOn(page, expr, label);
  await page.eval(`(() => { const e = document.querySelector('[data-p15="1"]'); e.select?.(); })()`);
  await page.send('Input.insertText', { text });
  await sleep(150);
  await page.key('Tab', 'Tab', 9);
  await human(300, 500);
}

/** منتقي الملفات: يُعترض فيُسلَّم الملف كما لو اختاره المستخدم. */
export async function chooseFile(conn, page, expr, file, label) {
  await page.send('DOM.enable');
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  const opened = conn.waitFor('Page.fileChooserOpened', () => true, { sessionId: page.sessionId, timeoutMs: 15000 });
  opened.catch(() => {});
  await clickOn(page, expr, label);
  const ev = await opened;
  await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: ev.backendNodeId });
  await page.send('Page.setInterceptFileChooserDialog', { enabled: false });
}

export async function navHash(page, id) {
  await page.eval((h) => { location.hash = h; }, { args: [id] });
  await page.waitFor((h) => { const s = document.getElementById(h); return s && !s.hidden; }, { args: [id], timeoutMs: 8000 });
  await human(200, 400);
}

/** بصمة كل مفتاح في التخزين (تُقيَّم في صفحة إضافة أو في عالمها المعزول): الإلغاء بلا أثر يعني بصمات متطابقة. */
export const storagePrint = async () => {
  const all = await chrome.storage.local.get(null);
  const out = {};
  for (const k of Object.keys(all).sort()) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(all[k])));
    out[k] = [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  return out;
};
/** المفاتيح التي تغيّرت أو أضيفت أو حُذفت بين بصمتين، بأسمائها. */
export function printDiff(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return {
    changed: keys.filter((k) => k in a && k in b && a[k] !== b[k]),
    added: keys.filter((k) => !(k in a)),
    removed: keys.filter((k) => !(k in b)),
  };
}
export const noDiff = (d) => !d.changed.length && !d.added.length && !d.removed.length;

/** صفحة إضافة في تبويب جديد (قياس 1360×900) مع جمع أخطائها. */
export async function extPage(conn, extId, rest, tracked) {
  const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
  const page = await attach(conn, targetId);
  tracked?.push({ where: rest.split(/[?#]/)[0], errs: collectErrors(page, { extId }) });
  await page.send('DOM.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.goto(`chrome-extension://${extId}/${rest}`);
  return page;
}

/** ملفات مجلد تنزيل (أو مجلده الفرعي) المكتملة. */
export async function listDl(dir) {
  try {
    return (await readdir(dir)).filter((n) => !n.endsWith('.crdownload')).sort();
  } catch {
    return [];
  }
}
export async function waitFile(dir, match, { timeoutMs = 20000, except = new Set() } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const f = (await listDl(dir)).find((n) => match(n) && !except.has(n));
    if (f) return { name: f, path: path.join(dir, f) };
    await sleep(300);
  }
  return null;
}
