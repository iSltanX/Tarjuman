#!/usr/bin/env node
// تشخيص (P6-AC9): رسالة المتصفح «Unsafe attempt to load URL chrome-extension://…» عند قراءة سكربت المحتوى ملف خط من
// حزمة الإضافة. يقيس: هل يعيد runtime.getURL العنوان المتغير لملفات الخطوط، وهل تنجح القراءة به، وهل تُرفض بالمعرّف
// الثابت، وهل تظهر الرسالة نفسها دون use_dynamic_url (نسخة من البناء في مجلد مجاور خارج المستودع).
//   node test/live/controls/font-fetch-diag.mjs <brave|chrome> <مجلد بناء التطوير> <وسم> [--nodyn]
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, openTab } from '../harness/extension.mjs';

const [browser, src, label, flag] = process.argv.slice(2);
if (path.resolve(src).startsWith(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'))) throw new Error('مجلد بناء خارج المستودع فقط');
let ext = src;
if (flag === '--nodyn') {
  ext = `${src}-nodyn`;
  await rm(ext, { recursive: true, force: true });
  await cp(src, ext, { recursive: true });
  const m = JSON.parse(await readFile(`${ext}/manifest.json`, 'utf8'));
  m.web_accessible_resources[0].use_dynamic_url = false;
  await writeFile(`${ext}/manifest.json`, JSON.stringify(m, null, 2));
}
const b = await launch({ browser, profile: `${browser}-p6-diag-${Date.now()}`, headless: true });
try {
  const e = await loadExtension(b.conn, ext);
  const page = await openTab(b.conn, 'about:blank');
  const errs = collectErrors(page, { extId: e.id, onlyExtension: false });
  await page.goto('https://www.youtube.com/watch?v=iG9CE55wbtY');
  await sleep(4000);
  const iso = page.isolatedContextId(e.id);
  // نص الرسالة مقصوص ومعرّفات الإضافة مختصرة؛ لا روابط يوتيوب (collectErrors يستبدلها).
  const out = {};
  const probes = {
    getURL: "new URL(chrome.runtime.getURL('x')).host === chrome.runtime.id ? 'static-id' : 'dynamic-id'",
    dynamic: "fetch(chrome.runtime.getURL('ui/fonts/subtitle/almarai-400.woff2')).then(r=>r.arrayBuffer().then(a=>({ok:r.ok,bytes:a.byteLength})),e=>({err:String(e).slice(0,80)}))",
    staticId: "fetch('chrome-extension://'+chrome.runtime.id+'/ui/fonts/subtitle/almarai-400.woff2').then(r=>({ok:r.ok,status:r.status}),e=>({err:String(e).slice(0,80)}))",
  };
  for (const [k, expr] of Object.entries(probes)) {
    const before = errs.list.length;
    out[k] = await page.eval(expr, { contextId: iso });
    await sleep(700);
    out[`${k}Logs`] = errs.list.slice(before).map((x) => `${x.kind}: ${x.text.slice(0, 50)}`);
  }
  console.log(label, b.version.product, JSON.stringify(out));
} finally {
  await b.close();
}
