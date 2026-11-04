#!/usr/bin/env node
// لقطات المشغّل بيد سلطان (جولة النشر T6، بطلبه): تحت الأتمتة لا يحمّل يوتيوب الفيديو، فيلتقط سلطان من نافذة Chrome عادية بلا
// أي علم تحكم إطارًا حقيقيًا من الفيلم. يجهّز السكربت الحال أولًا في ملف chrome-manual (وفيه حزمة المتجر من t6-hand.mjs) بلا نافذة:
// رفع الملف العربي من زر الشريط، ووضع «فوق الأصل»، وفتح اللوحة؛ ثم يغلقه ويفتحه نافذة عادية على الفيديو قبل المقطع 12.
// ولا يكتب Preferences الملف (فيبقى تحميل الإضافة اليدوي كما هو).
//   command node test/live/stores/t6-hand-shots.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_ROOT, Page, human, launch, sleep } from '../harness/browser.mjs';
import { revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { pidsOf, quitProfile } from '../../e2e/live/lib.mjs';
import { unpackedIdOf } from '../p1/ext-id.mjs';
import { APPS } from './driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const VIDEO = 'Y-rmzh0PI3c';
const AR_SRT = path.join(ROOT, 'store/test-files', `${VIDEO}.ar.srt`);
const PROFILE = path.join(PROFILE_ROOT, 'chrome-manual');
const EXT_ID = unpackedIdOf(path.join(PROFILE_ROOT, 'extension-manual'));
const log = (s) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);
const appOf = (b) => APPS[b].app ?? APPS[b].bin.slice(0, APPS[b].bin.indexOf('.app/') + 4);

async function inShadow(page, hostId, selector) {
  const { root } = await page.send('DOM.getDocument', { depth: -1, pierce: true });
  const attrs = (n) => Object.fromEntries((n.attributes ?? []).reduce((acc, v, i, arr) => (i % 2 ? acc : [...acc, [v, arr[i + 1]]]), []));
  let host = null;
  (function find(n) {
    if (host) return;
    if (attrs(n).id === hostId) { host = n; return; }
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) find(c);
  })(root);
  const sr = host?.shadowRoots?.[0];
  if (!sr) return null;
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: sr.nodeId, selector });
  if (!nodeId) return null;
  try {
    const q = (await page.send('DOM.getBoxModel', { nodeId })).model.border;
    return { nodeId, x: (q[0] + q[4]) / 2, y: (q[1] + q[5]) / 2 };
  } catch {
    return null;
  }
}
async function waitShadow(page, hostId, selector, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const x = await inShadow(page, hostId, selector).catch(() => null);
    if (x) return x;
    await sleep(250);
  }
  return null;
}

// ---- التجهيز بلا نافذة ----
if (pidsOf(PROFILE).length) await quitProfile(PROFILE);
const b = await launch({ browser: 'chrome', profile: 'chrome-manual', headless: true });
let state = null;
try {
  const yt = await Page.open(b.conn, 'about:blank');
  await yt.send('DOM.enable');
  await yt.send('Network.enable');
  await yt.send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': 'ar' } });
  await yt.send('Network.setCookie', { name: 'PREF', value: 'hl=ar', domain: '.youtube.com', path: '/', secure: true });
  await yt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}&hl=ar&persist_hl=1`);
  await waitForPlayer(yt, VIDEO, 45000);
  await yt.eval(() => { const v = document.querySelector('#movie_player video'); v.muted = true; v.pause(); return true; });
  const up = await waitShadow(yt, 'tarjuman-controls', 'button[data-kind="upload"]', 20000);
  if (!up) throw new Error('أدوات ترجمان لم تُركّب');
  const ext = await Page.open(b.conn, `chrome-extension://${EXT_ID}/pages/popup/index.html`);
  const read = () => ext.eval(async (id) => {
    const rec = (await chrome.storage.local.get(`video:${id}`))[`video:${id}`] ?? null;
    const prefs = (await chrome.storage.local.get('prefs')).prefs ?? null;
    return { arabic: rec?.arabic?.original?.length ?? 0, english: rec?.english?.[0]?.cues?.length ?? 0, mode: rec?.view?.displayMode ?? null, panelOpen: prefs?.ui?.panelOpen ?? null };
  }, { args: [VIDEO] });
  state = await read();
  log(`قبل: ${JSON.stringify(state)}`);
  await b.conn.send('Target.activateTarget', { targetId: yt.targetId });
  await sleep(800);
  if (!state.arabic) {
    await yt.send('Page.setInterceptFileChooserDialog', { enabled: true });
    const opened = b.conn.waitFor('Page.fileChooserOpened', () => true, { sessionId: yt.sessionId, timeoutMs: 15000 });
    await revealControls(yt);
    const up2 = await inShadow(yt, 'tarjuman-controls', 'button[data-kind="upload"]');
    await yt.click(Math.round(up2.x), Math.round(up2.y));
    const { backendNodeId } = await opened;
    await yt.send('DOM.setFileInputFiles', { files: [AR_SRT], backendNodeId });
    await yt.send('Page.setInterceptFileChooserDialog', { enabled: false });
    await sleep(2500);
    const confirm = await waitShadow(yt, 'tarjuman-controls-layer', 'button[data-fid="confirm"]', 2500);
    if (confirm) { await yt.click(Math.round(confirm.x), Math.round(confirm.y)); await sleep(1500); }
  }
  for (let i = 0; i < 3; i++) {
    await revealControls(yt);
    const u = await inShadow(yt, 'tarjuman-controls', 'button[data-kind="upload"]');
    await yt.click(Math.round(u.x), Math.round(u.y));
    await human(500, 800);
    const dual = await waitShadow(yt, 'tarjuman-controls-layer', 'button[data-fid="mode:dual"]', 3000);
    if (dual) { await yt.click(Math.round(dual.x), Math.round(dual.y)); await sleep(700); break; }
    await yt.key('Escape', 'Escape', 27);
  }
  await yt.key('Escape', 'Escape', 27);
  await sleep(400);
  if (!(await read()).panelOpen) {
    await revealControls(yt);
    const p = await inShadow(yt, 'tarjuman-controls', 'button[data-kind="panel"]');
    await yt.click(Math.round(p.x), Math.round(p.y));
    await sleep(1000);
  }
  state = await read();
  log(`بعد: ${JSON.stringify(state)}`);
} finally {
  await b.close();
  await sleep(2000);
}
if (!(state?.arabic === 60 && state?.mode === 'dual' && state?.panelOpen === true)) {
  console.log('✗ التجهيز لم يكتمل، فلا تُفتح النافذة');
  process.exit(1);
}

// ---- النافذة العادية لسلطان ----
execFileSync('open', ['-n', '-a', appOf('chrome'), '--args', `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--window-size=1400,950', '--window-position=40,40', `https://www.youtube.com/watch?v=${VIDEO}&t=178s&hl=ar&persist_hl=1`]);
log('✓ النافذة مفتوحة على الفيديو عند 2:58: العربية فوق الإنجليزية واللوحة مفتوحة.');
