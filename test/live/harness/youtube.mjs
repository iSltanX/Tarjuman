// أدوات يوتيوب للحزام فقط: انتظار المشغّل، والضغط على CC كما يفعل المستخدم، وقراءة الترجمة المعروضة،
// والقفز، والتنقل عبر المقترحات. القراءة من getPlayerResponse هنا لاختيار فيديوهات الاختبار فقط، لا في المنتج.
import { sleep, human } from './browser.mjs';

/** @param {import('./browser.mjs').Page} page */
export async function waitForPlayer(page, videoId, timeoutMs = 30000) {
  return page.waitFor((id) => {
    const p = document.querySelector('#movie_player');
    const v = document.querySelector('#movie_player video.html5-main-video');
    const url = new URLSearchParams(location.search).get('v');
    if (!p || !v || (id && url !== id)) return null;
    if (v.readyState < 1 || !Number.isFinite(v.duration)) return null;
    return { duration: v.duration, ad: p.classList.contains('ad-showing') };
  }, { args: [videoId], timeoutMs });
}

/** حالة المشغّل ومسارات الترجمة المتاحة (للاختيار والتشخيص؛ بلا روابط). */
export async function playerInfo(page) {
  return page.eval(() => {
    const p = document.querySelector('#movie_player');
    const v = document.querySelector('#movie_player video.html5-main-video');
    const btn = document.querySelector('#movie_player .ytp-subtitles-button');
    let resp = null;
    try {
      resp = p && typeof p.getPlayerResponse === 'function' ? p.getPlayerResponse() : null;
    } catch {
      resp = null;
    }
    const tracks = resp?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const details = resp?.videoDetails || {};
    return {
      urlVideoId: new URLSearchParams(location.search).get('v'),
      responseVideoId: details.videoId || null,
      title: details.title || null,
      author: details.author || null,
      lengthSeconds: Number(details.lengthSeconds) || null,
      isLive: !!details.isLive,
      isLiveContent: !!details.isLiveContent,
      tracks: tracks.map((t) => ({ lang: t.languageCode, kind: t.kind || 'manual', translatable: !!t.isTranslatable, name: t.name?.simpleText || t.name?.runs?.[0]?.text || null })),
      duration: v ? v.duration : null,
      currentTime: v ? v.currentTime : null,
      paused: v ? v.paused : null,
      ad: !!p && p.classList.contains('ad-showing'),
      ccButton: btn ? { visible: getComputedStyle(btn).display !== 'none', pressed: btn.getAttribute('aria-pressed') } : null,
    };
  });
}

/** يُظهر شريط التحكم بتحريك المؤشر فوق المشغّل. */
export async function revealControls(page) {
  const c = await page.centerOf('#movie_player', { scroll: false });
  if (c) {
    await page.mouseMove(c.x + 40, c.y + 20);
    await sleep(250);
    await page.mouseMove(c.x - 30, c.y + 60);
    await sleep(400);
  }
}

/** ضغطة مستخدم حقيقية (Input) على زر CC. */
export async function clickCC(page) {
  await page.eval(() => window.scrollTo(0, 0));
  await revealControls(page);
  const c = await page.centerOf('#movie_player .ytp-subtitles-button', { scroll: false });
  if (!c) return false;
  await page.click(c.x, c.y);
  await human(500, 900);
  return true;
}

/** اختصار يوتيوب للترجمة (c): فعل مستخدم حقيقي عبر لوحة المفاتيح، لا يعتمد على ظهور شريط التحكم. */
export async function pressCaptionKey(page) {
  await page.eval(() => {
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) document.activeElement.blur();
  });
  await page.key('c', 'KeyC', 67);
  await human(500, 900);
}

export async function ccPressed(page) {
  return page.eval(() => document.querySelector('#movie_player .ytp-subtitles-button')?.getAttribute('aria-pressed') === 'true');
}

/** يضمن حالة CC بمفتاح c، ثم بالنقر إن لم يكفِ. */
export async function ensureCC(page, on = true) {
  if ((await ccPressed(page)) === on) return 'already';
  await pressCaptionKey(page);
  if ((await ccPressed(page)) === on) return 'key';
  await clickCC(page);
  return (await ccPressed(page)) === on ? 'clicked' : 'failed';
}

/** إيقاف ثم تشغيل بالمفتاح. */
export async function toggleCC(page) {
  await pressCaptionKey(page);
  await sleep(2000);
  await pressCaptionKey(page);
}

export async function captionText(page) {
  return page.eval(() => [...document.querySelectorAll('#movie_player .ytp-caption-segment')].map((e) => e.textContent).join(' ').replace(/\s+/g, ' ').trim());
}

/** يوقف الفيديو ويقفز إلى t ثانية ثم ينتظر عرض الترجمة. يعيد الزمن الفعلي والنص المعروض. */
export async function seekAndRead(page, t) {
  await page.eval((sec) => {
    const v = document.querySelector('#movie_player video.html5-main-video');
    v.pause();
    v.currentTime = sec;
  }, { args: [t] });
  await page.waitFor(() => {
    const v = document.querySelector('#movie_player video.html5-main-video');
    return v && !v.seeking && v.readyState >= 2;
  }, { timeoutMs: 15000, intervalMs: 200 });
  await sleep(900);
  let text = await captionText(page);
  if (!text) {
    // بعض الإصدارات لا تحدّث الطبقة والفيديو متوقف: تشغيل قصير ثم إيقاف.
    await page.eval(() => document.querySelector('#movie_player video.html5-main-video').play().catch(() => {}));
    await sleep(400);
    await page.eval(() => document.querySelector('#movie_player video.html5-main-video').pause());
    await sleep(500);
    text = await captionText(page);
  }
  const actual = await page.eval(() => document.querySelector('#movie_player video.html5-main-video').currentTime);
  return { requested: t, actual, text };
}

/**
 * روابط المقترحات في العمود الجانبي (معرّفات فقط)، بلا الفيديو الحالي ولا رابط مخفي: في العمود رابط للفيديو الحالي بلا أبعاد
 * (a#endpoint)، وكان أول ما يُعاد فتعجز النقرة عنه ولا يحدث تنقل (تحقق Gemini، Y2).
 */
export async function relatedIds(page) {
  return page.eval(() => {
    const current = new URLSearchParams(location.search).get('v');
    const shown = (a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== 'hidden';
    };
    const ids = [];
    for (const a of document.querySelectorAll('#secondary a[href^="/watch?v="], #related a[href^="/watch?v="]')) {
      const id = new URLSearchParams(a.getAttribute('href').split('?')[1]).get('v');
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id) && id !== current && !ids.includes(id) && shown(a)) ids.push(id);
    }
    return ids;
  });
}

/**
 * ينقر صورة مصغّرة لمقترح بمعرّفه نقرة حقيقية (تنقل SPA داخل يوتيوب)، ثم يتحقق أن الصفحة انتقلت إليه فعلًا (v في العنوان). يرمي إن
 * لم يجد له رابطًا ظاهرًا أو لم يحدث الانتقال في المهلة، فلا تمضي جولة على تنقل لم يقع (كان يعيد false بصمت، Y2).
 * @returns {Promise<true>}
 */
export async function clickRelated(page, id, { timeoutMs = 15000 } = {}) {
  const locate = (scroll) => page.eval((x, doScroll) => {
    const a = [...document.querySelectorAll(`#secondary a[href^="/watch?v=${x}"], #related a[href^="/watch?v=${x}"]`)]
      .find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!a) return null;
    if (doScroll) a.scrollIntoView({ block: 'center', inline: 'center' });
    const r = a.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }, { args: [id, scroll] });
  if (!(await locate(true))) throw new Error(`تعذّر التنقل: لا رابط ظاهر للمقترح ${id}`);
  await human(400, 800);
  const c = await locate(false);
  if (!c) throw new Error(`تعذّر التنقل: اختفى رابط المقترح ${id}`);
  await page.click(c.x, c.y);
  const arrived = await page.waitFor((x) => new URLSearchParams(location.search).get('v') === x, { args: [id], timeoutMs });
  if (!arrived) {
    const now = await currentUrlVideoId(page).catch(() => null);
    throw new Error(`تعذّر التنقل: نُقر المقترح ${id} وبقي العنوان على ${now ?? 'غير معروف'} بعد ${Math.round(timeoutMs / 1000)} ث`);
  }
  return true;
}

export async function currentUrlVideoId(page) {
  return page.eval(() => new URLSearchParams(location.search).get('v'));
}

/** يرفض ملفات الارتباط غير الضرورية إن ظهرت نافذة الموافقة (الخيار الأحفظ للخصوصية). */
export async function dismissConsent(page) {
  return page.eval(() => {
    const btn = [...document.querySelectorAll('button, tp-yt-paper-button, a')]
      .find((b) => /^(reject all|reject the use of cookies)/i.test((b.textContent || '').trim()) || /reject/i.test(b.getAttribute('aria-label') || ''));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
}
