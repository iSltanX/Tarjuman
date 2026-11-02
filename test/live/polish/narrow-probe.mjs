#!/usr/bin/env node
// تشخيص (جولة الصقل): فتح قائمة التحميل في مشغّل ضيق بعد تغيير حجم النافذة، وتتبّع حالة القائمة والشريط كل 200 م.ث.
//   command node test/live/polish/narrow-probe.mjs --browser brave --ext <مجلد بناء تطوير> [--width 760]
import path from 'node:path';
import { launch, loadExtension, sleep } from '../harness/browser.mjs';
import { openTab } from '../harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const WIDTH = Number(val('width', 760));
const b = await launch({ browser, profile: `${browser}-narrow-${Date.now()}`, headless: true });
try {
  const ext = await loadExtension(b.conn, path.resolve(val('ext')));
  const page = await openTab(b.conn, 'about:blank');
  await page.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 700, deviceScaleFactor: 1, mobile: false });
  await page.goto('https://www.youtube.com/watch?v=iG9CE55wbtY');
  await dismissConsent(page).catch(() => false);
  await waitForPlayer(page, 'iG9CE55wbtY', 30000);
  await page.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 15000 });
  await sleep(2000);
  await page.eval(() => { const v = document.querySelector('video'); v.muted = true; v.pause(); return true; });
  const iso = page.isolatedContextId(ext.id);
  const peek = () => page.eval(() => globalThis.__tarjuman.mounted.controls.peek(), { contextId: iso });
  await revealControls(page);
  const p = await peek();
  const box = p.buttons.download.box;
  const player = await page.eval(() => { const r = document.querySelector('#movie_player').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; });
  console.log('player', JSON.stringify(player), 'download box', JSON.stringify(box), 'size', p.size ?? null);
  await page.click(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2));
  for (let i = 0; i < 10; i++) {
    await sleep(200);
    const q = await peek();
    console.log(i, 'bar', q.layer.bar, 'menu', q.layer.menu ? JSON.stringify(q.layer.menu.box) : null, 'expanded', q.buttons.download.expanded ?? null);
  }
} finally {
  await b.close();
}
