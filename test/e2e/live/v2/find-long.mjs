#!/usr/bin/env node
// يختار «الفيديو الطويل» لرحلة الإصدار الثاني (P15-AC1، 2000 مقطع فأكثر): نتائج بحث يوتيوب بمرشح «أطول من 20 دقيقة»، ثم
// بيانات المشغّل: مسار إنجليزي يدوي بين ساعتين وثلث وأربع ساعات (اليدوي نحو 16 مقطعًا في الدقيقة، فـ140 دقيقة نحو 2,200)،
// وإلا فتلقائي بين 100 و125 دقيقة (الوضع العادي نحو 21 مقطعًا في الدقيقة كما قيس على ميدواي: 1,056 في 50 دقيقة). الطويل
// اليدوي نادر في نتائج البحث (أول جولة: 33 فيديو طويلًا، يدويها كلها دون 112 دقيقة). جلسة مؤتمتة بلا نافذة وبملف مستقل بلا
// الإضافة: لا تحتاج جسم الترجمة. قراءة getPlayerResponse هنا لاختيار فيديو الاختبار وحده (كما في find-live.mjs)، لا في
// المنتج. يكتب المعرّفات والمدد والعناوين وحدها.
//   command node test/e2e/live/v2/find-long.mjs [--headed]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Page, launch, sleep } from '../../../live/harness/browser.mjs';
import { dismissConsent, playerInfo, waitForPlayer } from '../../../live/harness/youtube.mjs';
import { WORK } from './lib.mjs';

const QUERIES = ['history lecture 2 hours', 'full lecture course 3 hours', 'podcast full episode 3 hours interview', 'documentary full 2 hours english'];
const fits = (kind, sec) => (kind === 'manual' ? sec >= 140 * 60 && sec <= 4 * 3600 : sec >= 100 * 60 && sec <= 125 * 60);
const b = await launch({ browser: 'brave', profile: 'brave-p15-probe', headless: !process.argv.includes('--headed') });
const found = [];
try {
  for (const q of QUERIES) {
    if (found.length >= 2) break;
    const page = await Page.open(b.conn);
    // sp=EgIYAg: مرشح المدة «أطول من 20 دقيقة».
    await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAg%253D%253D`);
    await dismissConsent(page).catch(() => false);
    await sleep(5000);
    const ids = await page.eval(() => [...document.querySelectorAll('ytd-video-renderer a#thumbnail')]
      .map((a) => new URLSearchParams((a.getAttribute('href') ?? '').split('?')[1] ?? '').get('v'))
      .filter((id) => id && /^[A-Za-z0-9_-]{11}$/.test(id)).slice(0, 8));
    await page.close();
    for (const id of ids) {
      if (found.length >= 2) break;
      const w = await Page.open(b.conn);
      await w.goto(`https://www.youtube.com/watch?v=${id}`);
      await waitForPlayer(w, id, 25000);
      const pi = await playerInfo(w);
      await w.close();
      const en = pi.tracks.filter((t) => t.lang === 'en' || t.lang?.startsWith('en-'));
      const kind = en.some((t) => t.kind !== 'asr') ? 'manual' : en.length ? 'asr' : null;
      console.log(`${id}: length=${pi.lengthSeconds} en=${en.map((t) => `${t.lang}:${t.kind}`).join(',') || '—'} live=${pi.isLive} — ${pi.title}`);
      if (kind && !pi.isLive && fits(kind, pi.lengthSeconds)) found.push({ id, kind, lengthSec: pi.lengthSeconds, title: pi.title, author: pi.author });
      await sleep(1500 + Math.random() * 1000);
    }
  }
} finally {
  await b.close();
}
await mkdir(WORK, { recursive: true });
await writeFile(path.join(WORK, 'long-candidates.json'), `${JSON.stringify(found, null, 2)}\n`);
console.log(found.length ? `المرشح: ${found[0].id} (${found[0].kind}، ${Math.round(found[0].lengthSec / 60)} دقيقة) — ${found[0].title}` : 'لم يُعثر على فيديو طويل مناسب');
process.exit(found.length ? 0 : 1);
