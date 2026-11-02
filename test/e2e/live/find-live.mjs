#!/usr/bin/env node
// يختار «بثًا مسجّلًا» لقائمة الفيديوهات الثابتة: نتائج بحث يوتيوب المعلَّمة «Streamed»، ثم بيانات المشغّل للتحقق أنه بث
// انتهى (isLiveContent ولا isLive) وله مسار إنجليزي. جلسة مؤتمتة بملف مستقل بلا الإضافة: لا تحتاج جسم الترجمة. قراءة
// getPlayerResponse هنا لاختيار فيديو الاختبار وحده (كما في حزام P2)، لا في المنتج. يكتب المعرّف وحده.
//   node test/e2e/live/find-live.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { playerInfo, waitForPlayer } from '../../live/harness/youtube.mjs';
import { WORK, attachTab, launchBrowser, openUnattached, sleep } from './lib.mjs';

const QUERIES = ['press briefing full livestream', 'live stream replay lecture', 'nasa live coverage'];
const b = await launchBrowser('brave', { profile: 'brave-p9-probe', loadExt: false });
const found = [];
try {
  for (const q of QUERIES) {
    if (found.length >= 2) break;
    const page = await attachTab(b.conn, await openUnattached(b.conn, `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`));
    await sleep(6000);
    // واجهة يوتيوب تتبع منطقة الجهاز (عربية هنا: «تم البث»)، فالترشيح بالنص للترتيب فقط، والحكم ببيانات المشغّل.
    const ids = await page.eval(() => [...document.querySelectorAll('ytd-video-renderer')]
      .map((v) => ({ streamed: /streamed|تم البث/i.test(v.textContent ?? ''), id: new URLSearchParams((v.querySelector('a#thumbnail')?.getAttribute('href') ?? '').split('?')[1] ?? '').get('v') }))
      .filter((x) => x.id && /^[A-Za-z0-9_-]{11}$/.test(x.id))
      .sort((a, b) => Number(b.streamed) - Number(a.streamed)).map((x) => x.id).slice(0, 6));
    await page.close();
    for (const id of ids) {
      if (found.length >= 2) break;
      const w = await attachTab(b.conn, await openUnattached(b.conn, `https://www.youtube.com/watch?v=${id}`));
      await waitForPlayer(w, id, 25000);
      const pi = await playerInfo(w);
      await w.close();
      const en = pi.tracks.filter((t) => t.lang === 'en' || t.lang?.startsWith('en-'));
      console.log(`${id}: liveContent=${pi.isLiveContent} live=${pi.isLive} length=${pi.lengthSeconds} en=${en.map((t) => t.kind).join(',') || '—'}`);
      if (pi.isLiveContent && !pi.isLive && en.length && pi.lengthSeconds && pi.lengthSeconds <= 4 * 3600) found.push({ id, lengthSec: pi.lengthSeconds, en: en.map((t) => t.kind) });
      await sleep(1500);
    }
  }
} finally {
  await b.close();
}
await mkdir(WORK, { recursive: true });
await writeFile(path.join(WORK, 'live-candidates.json'), `${JSON.stringify(found, null, 2)}\n`);
console.log(found.length ? `المرشح: ${found[0].id}` : 'لم يُعثر على بث مسجّل بمسار إنجليزي');
process.exit(found.length ? 0 : 1);
