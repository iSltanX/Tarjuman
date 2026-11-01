#!/usr/bin/env node
// تشخيص ترتيب الأحداث عند التنقل الداخلي: متى يتغير عنوان الصفحة مقارنة بطلبات ترجمة الفيديو الجديد.
// يصلح تحت CDP رغم أن الأجسام فارغة، لأن قرار «الفيديو المعروض» يسبق فحص الجسم.
//   node test/live/p1/nav-race.mjs --browser brave --video <ID> [--hops 3]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, loadExtension, Page, sleep } from '../harness/browser.mjs';
import { waitForPlayer, ensureCC, relatedIds, clickRelated } from '../harness/youtube.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const video = val('video');
const b = await launch({ browser: val('browser', 'brave') });
try {
  const ext = await loadExtension(b.conn, path.join(ROOT, 'dist'));
  const page = await Page.open(b.conn);
  await page.goto(`https://www.youtube.com/watch?v=${video}`);
  await waitForPlayer(page, video);
  await page.eval(() => { for (const v of document.querySelectorAll('video')) v.muted = true; });
  await ensureCC(page, true);
  await sleep(4000);
  const visited = new Set([video]);
  for (let hop = 0; hop < Number(val('hops', 3)); hop++) {
    const to = (await relatedIds(page)).find((x) => !visited.has(x));
    if (!to) break;
    visited.add(to);
    console.log('hop', hop + 1, '→', to, 'clicked', await clickRelated(page, to));
    await sleep(9000);
  }
  const iso = page.isolatedContextId(ext.id);
  const snap = await page.eval('globalThis.__tarjumanPoc.snapshot()', { contextId: iso });
  const t0 = snap.log[0].at;
  for (const e of snap.log) {
    console.log(`${((e.at - t0) / 1000).toFixed(2)}s ${e.type}`, e.type === 'nav' ? `${e.from} → ${e.to}` : `v=${e.videoId ?? ''} current=${e.currentVideoId ?? e.to ?? ''} ${e.code ?? ''} ${e.trackKind ?? ''}`);
  }
} finally {
  await b.close();
}
