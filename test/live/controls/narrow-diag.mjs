#!/usr/bin/env node
// قياس المشغّل الضيق (P6-AC1، «تُقاس الحالة وتُعرض على سلطان»): في كل عرض، أي أزرار يوتيوب الأصلية ظاهرة في الشريط
// مع مجموعة ترجمان، وأيها ظاهر لو أُخفيت المجموعة مؤقتًا (display:none على عنصرها في الصفحة، ثم تُعاد). الفرق هو ما
// يطويه يوتيوب بسبب عرض المجموعة. لا تغيير في الإضافة؛ ملف اختبار جديد بلا نافذة.
//   node test/live/controls/narrow-diag.mjs --browser brave|chrome --ext <مجلد بناء التطوير> [--out test-results/live/P6]
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { openTab } from '../harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const OUT = path.resolve(ROOT, val('out', 'test-results/live/P6'), browser, 'narrow.json');
const WIDTHS = [1000, 900, 800, 720, 640, 600, 560, 520, 480, 440, 400];

/** أزرار يوتيوب الظاهرة في الأدوات اليمنى (بأصنافها) وحدود الشريط. */
const visible = () => {
  const p = document.querySelector('#movie_player');
  const right = p.querySelector('.ytp-right-controls');
  const chrome = p.querySelector('.ytp-chrome-bottom').getBoundingClientRect();
  const btns = [...right.querySelectorAll('button, .ytp-button')].filter((b) => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && r.right <= chrome.right + 1 && r.left >= chrome.left - 1;
  });
  const names = [...new Set(btns.map((b) => [...b.classList].find((c) => c.startsWith('ytp-') && c !== 'ytp-button') || b.getAttribute('aria-label') || 'button'))];
  return { player: Math.round(p.getBoundingClientRect().width), names };
};

const b = await launch({ browser, profile: `${browser}-p6-narrow-${Date.now()}`, headless: true });
const rows = [];
try {
  const ext = await loadExtension(b.conn, path.resolve(val('ext')));
  const page = await openTab(b.conn, 'about:blank');
  await page.goto('https://www.youtube.com/watch?v=iG9CE55wbtY');
  await dismissConsent(page).catch(() => false);
  await page.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; v.pause(); }));
  await waitForPlayer(page, 'iG9CE55wbtY', 25000);
  await page.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 15000 });
  for (const w of WIDTHS) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(1500);
    await revealControls(page);
    await sleep(400);
    const withGroup = await page.eval(visible);
    await page.eval(() => document.querySelector('#tarjuman-controls').style.setProperty('display', 'none'));
    await sleep(900);
    await revealControls(page);
    await sleep(300);
    const without = await page.eval(visible);
    await page.eval(() => document.querySelector('#tarjuman-controls').style.removeProperty('display'));
    await sleep(600);
    const folded = without.names.filter((n) => !withGroup.names.includes(n));
    rows.push({ viewport: w, player: withGroup.player, withGroup: withGroup.names, withoutGroup: without.names, foldedBecauseOfGroup: folded });
    console.log(w, withGroup.player, folded.length ? `يطوي: ${folded.join('، ')}` : 'لا طيّ', JSON.stringify(withGroup.names));
  }
  await writeFile(OUT, `${JSON.stringify({ browser: `${BROWSERS[browser].name} (${b.version.product})`, at: new Date().toISOString(), extension: ext.method ?? ext.error, rows }, null, 2)}\n`);
} finally {
  await b.close();
}
