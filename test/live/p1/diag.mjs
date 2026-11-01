#!/usr/bin/env node
// تشخيص سريع لمسار الالتقاط: السياقات، ورسائل MAIN، وطلبات timedtext وأحجام أجسامها (بلا روابط)،
// والترجمة المعروضة فعلًا في المشغّل بعد كل خطوة.
// التشغيل: node test/live/p1/diag.mjs --browser brave --video <ID> [--no-ext]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, loadExtension, Page, sleep } from '../harness/browser.mjs';
import { recordNetwork } from '../harness/netlog.mjs';
import { waitForPlayer, playerInfo, captionText, pressCaptionKey } from '../harness/youtube.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const val = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const video = val('video');

const b = await launch({ browser, profile: val('profile', browser) });
try {
  const ext = flag('no-ext') ? { id: null } : await loadExtension(b.conn, path.join(ROOT, 'dist'));
  console.log('version', b.version.product, 'extension', JSON.stringify(ext));
  const page = await Page.open(b.conn, 'about:blank', { runtime: !flag('no-runtime') });
  const net = recordNetwork(page);
  if (!flag('no-network')) await page.send('Network.enable');
  await page.goto(`https://www.youtube.com/watch?v=${video}`);
  await waitForPlayer(page, video);
  await page.eval(() => {
    window.__diagMsgs = [];
    window.addEventListener('message', (e) => {
      if (e.data && e.data.source === 'tarjuman') window.__diagMsgs.push({ len: e.data.bodyLength, transport: e.data.transport, kind: e.data.trackKind });
    });
    for (const v of document.querySelectorAll('video')) v.muted = true;
  });
  console.log('wrapped', await page.eval(() => !/\[native code\]/.test(window.fetch.toString())));
  const state = async (label) => {
    const i = await playerInfo(page);
    const tt = net.timedtext().map((r) => `${Math.round(r.t / 100) / 10}s:${r.kindParam || 'manual'}:${r.format}:${r.status}:${r.bodyBytes}B${r.fromCache ? ':cache' : ''}`);
    console.log(label, JSON.stringify({ cc: i.ccButton?.pressed, paused: i.paused, t: Math.round(i.currentTime), ad: i.ad, shown: (await captionText(page)).slice(0, 60), timedtext: tt }));
  };
  await state('loaded');
  await sleep(8000);
  await state('after8s');
  await pressCaptionKey(page);
  await sleep(6000);
  await state('afterC');
  await pressCaptionKey(page);
  await sleep(2000);
  await pressCaptionKey(page);
  await sleep(6000);
  await state('afterToggle');
  if (!flag('no-ext')) {
    console.log('msgs', JSON.stringify(await page.eval(() => window.__diagMsgs)));
    const iso = page.isolatedContextId(ext.id);
    if (iso) {
      console.log('snapshot', JSON.stringify(await page.eval(`(() => { const s = globalThis.__tarjumanPoc.snapshot(); return { current: s.currentVideoId, accepted: s.accepted.map((x) => ({ v: x.videoId, k: x.trackKind, ok: x.ok, code: x.code, len: x.bodyLength, inv: x.invariants && x.invariants.map((r) => r.ok).join(''), completeness: x.report.completeness })), rejected: s.rejected.map((r) => r.code + ':' + r.detail) }; })()`, { contextId: iso })));
    }
  }
  await page.screenshot(path.join(ROOT, `docs/evidence/P1/screenshots/${browser}-diag-${video}.png`));
} finally {
  await b.close();
}
