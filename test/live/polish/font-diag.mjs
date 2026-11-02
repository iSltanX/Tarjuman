#!/usr/bin/env node
// تشخيص الخط المصيَّر فعلًا في أدوات المشغّل (جولة الصقل): يفتح فيديو يوتيوب بالإضافة المبنية، ويفتح قائمة التحميل، ثم
// يسأل المتصفح نفسه عن الخط الذي رسم كل عقدة (CSS.getPlatformFontsForNode) داخل الجذر المغلق للأدوات، ومعه font-family
// المحسوبة، وما في document.fonts. الفرق بين «المطلوب» و«المرسوم» هو العطل. لا رابط ولا رمز في المخرجات.
//   command node test/live/polish/font-diag.mjs --browser brave|chrome --ext <مجلد بناء تطوير> [--out <ملف json>]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BROWSERS, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { openTab } from '../harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../harness/youtube.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(val('ext'));
const OUT = val('out');
const VIDEO = val('video', 'iG9CE55wbtY');

const b = await launch({ browser, profile: `${browser}-fontdiag-${Date.now()}`, headless: !argv.includes('--headed') });
const result = { browser: `${BROWSERS[browser].name} (${b.version.product})`, at: new Date().toISOString(), nodes: [], faces: null };
try {
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(ext.error);
  const page = await openTab(b.conn, 'about:blank');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  await page.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(page).catch(() => false);
  await waitForPlayer(page, VIDEO, 30000);
  await page.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 15000 });
  await sleep(1500);
  const iso = page.isolatedContextId(ext.id);
  await page.eval(() => { const v = document.querySelector('video'); if (v) { v.muted = true; v.pause(); } return true; });
  // قائمة التحميل: فيها عنوان (خط العناوين) وبنود ونص (خط النص).
  await revealControls(page);
  const peek = await page.eval(() => globalThis.__tarjuman.mounted.controls.peek(), { contextId: iso });
  const box = peek.buttons.download.box;
  await page.click(Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2));
  await sleep(1200);

  await page.send('DOM.enable');
  await page.send('CSS.enable');
  const { root } = await page.send('DOM.getDocument', { depth: -1, pierce: true });
  const hosts = [];
  (function walk(n) {
    if (n.attributes) {
      const a = Object.fromEntries(n.attributes.reduce((acc, v, i, arr) => (i % 2 ? acc : [...acc, [v, arr[i + 1]]]), []));
      if (a.id === 'tarjuman-controls' || a.id === 'tarjuman-controls-layer') hosts.push({ id: a.id, node: n });
    }
    for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? []), ...(n.contentDocument ? [n.contentDocument] : [])]) walk(c);
  })(root);
  const samples = [];
  for (const h of hosts) {
    (function walk(n, depth) {
      if (n.nodeType === 3 && n.nodeValue.trim() && samples.length < 40) samples.push({ host: h.id, text: n.nodeValue.trim().slice(0, 40), parent: n.parentId });
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) walk(c, depth + 1);
    })(h.node, 0);
  }
  // عقدة واحدة لكل نص مميز تكفي (العنوان، والبنود، والأزرار).
  const seen = new Set();
  for (const s of samples) {
    if (seen.has(s.text)) continue;
    seen.add(s.text);
    try {
      const { fonts } = await page.send('CSS.getPlatformFontsForNode', { nodeId: s.parent });
      const { computedStyle } = await page.send('CSS.getComputedStyleForNode', { nodeId: s.parent });
      const get = (p) => computedStyle.find((x) => x.name === p)?.value;
      result.nodes.push({ host: s.host, text: s.text, family: get('font-family'), weight: get('font-weight'), rendered: fonts.map((f) => `${f.familyName}${f.isCustomFont ? ' (مضمّن)' : ''} ×${f.glyphCount}`) });
    } catch (err) {
      result.nodes.push({ host: s.host, text: s.text, error: err.message.slice(0, 80) });
    }
  }
  result.faces = await page.eval(() => [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`));
  result.localCheck = await page.eval(() => ({ cairo: document.fonts.check('700 16px Cairo'), almarai: document.fonts.check('400 16px Almarai') }));
} finally {
  await b.close();
}
for (const n of result.nodes) console.log(`${n.host === 'tarjuman-controls' ? 'الشريط' : 'الطبقة'} · «${n.text}» · ${n.weight ?? ''} · مطلوب: ${n.family ?? n.error} · مرسوم: ${(n.rendered ?? []).join('، ')}`);
console.log('document.fonts:', JSON.stringify(result.faces));
if (OUT) {
  await mkdir(path.dirname(path.resolve(OUT)), { recursive: true });
  await writeFile(path.resolve(OUT), `${JSON.stringify(result, null, 2)}\n`);
}
