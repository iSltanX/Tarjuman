#!/usr/bin/env node
// يختار قائمة تشغيل من فيديوهات قصيرة بترجمة إنجليزية لاختبار التنقل الداخلي بالتشغيل التلقائي ليوتيوب.
// بيانات وصفية فقط (العناوين والمدد ومسارات الترجمة المتاحة)، بمتصفح headless مؤتمت لا يظهر للمستخدم.
//   node test/live/p1/find-playlist.mjs --query "minutephysics"           (قوائم تشغيل من البحث)
//   node test/live/p1/find-playlist.mjs --list <PLAYLIST_ID> [--check 12] (مدد العناصر ومساراتها)
import { launch, Page, sleep } from '../harness/browser.mjs';
import { waitForPlayer, playerInfo } from '../harness/youtube.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const b = await launch({ browser: 'brave', headless: true });
try {
  const page = await Page.open(b.conn);
  if (val('query')) {
    await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(val('query'))}&sp=EgIQAw%253D%253D`);
    await sleep(3500);
    const r = await page.eval(() => [...document.querySelectorAll('a[href*="list="]')].map((a) => {
      const href = a.getAttribute('href') || '';
      const m = /[?&]list=([A-Za-z0-9_-]+)/.exec(href);
      return m ? { list: m[1], text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80) } : null;
    }).filter(Boolean));
    const seen = new Set();
    for (const x of r) if (!seen.has(x.list) && x.text) { seen.add(x.list); console.log(JSON.stringify(x)); }
  } else {
    const list = val('list');
    await page.goto(`https://www.youtube.com/playlist?list=${list}`);
    await sleep(4000);
    // من بيانات الصفحة الأولية (ytInitialData): معرّف العنصر ومدته بالثواني وعنوانه، بحثًا عن playlistVideoRenderer أينما كان.
    const items = await page.eval(() => {
      const out = [];
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (o.playlistVideoRenderer) {
          const r = o.playlistVideoRenderer;
          out.push({ id: r.videoId, time: Number(r.lengthSeconds) || null, title: (r.title?.runs?.[0]?.text || r.title?.simpleText || '').slice(0, 60) });
          return;
        }
        if (o.lockupViewModel && o.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
          const r = o.lockupViewModel;
          const s = JSON.stringify(r);
          const badge = /"thumbnailBadgeViewModel":\{[^}]*?"text":"([0-9:]+)"/.exec(s);
          out.push({ id: r.contentId, time: badge ? badge[1] : null, title: (r.metadata?.lockupMetadataViewModel?.title?.content || '').slice(0, 60) });
          return;
        }
        for (const v of Object.values(o)) walk(v);
      };
      walk(window.ytInitialData);
      return out;
    });
    console.log(`عناصر: ${items.length}`);
    const n = Number(val('check', 0));
    for (const [i, it] of items.entries()) {
      let en = '';
      if (i < n && it.id) {
        await page.goto(`https://www.youtube.com/watch?v=${it.id}&list=${list}`);
        await waitForPlayer(page, it.id, 20000);
        en = (await playerInfo(page)).tracks.filter((t) => /^en/.test(t.lang)).map((t) => t.kind).join('+') || 'لا إنجليزية';
        await sleep(800);
      }
      console.log(i + 1, it.id, it.time, en, it.title);
    }
  }
} finally {
  await b.close();
}
