#!/usr/bin/env node
// سيناريوهات P5 الحية على يوتيوب الحقيقي (بروتوكول «الاختبارات الحية»): بناء التطوير من الإضافة في ملف اختبار
// منفصل، بلا نافذة ومكتوم الصوت، وحساب غير مسجَّل. السجلات العربية تُكتب في التخزين عبر خطاف التطوير (لا تعتمد
// على جسم الترجمة المحجوب تحت الأتمتة). كل سيناريو يقيس بما يراه المستخدم: النص الظاهر في الطبقة وأبعادها.
//   npm run build:dev -- --out <مجلد>
//   node test/live/overlay/run.mjs --browser brave|chrome --ext <مجلد> [--only ac1,ac3] [--ad] [--headed]
//        [--video iG9CE55wbtY] [--perf-video 7xTGNNLPyMI] [--out docs/evidence/P5]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, openTab } from '../harness/extension.mjs';
import { clickRelated, currentUrlVideoId, dismissConsent, relatedIds, revealControls, waitForPlayer } from '../harness/youtube.mjs';
import { SAMPLES } from '../../unit/player/overlay/samples.js';
import { videoRecord } from '../../helpers/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(val('ext', 'dist'));
const VIDEO = val('video', 'iG9CE55wbtY');
const PERF_VIDEO = val('perf-video', '7xTGNNLPyMI');
const ONLY = val('only') ? new Set(val('only').split(',')) : null;
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P5'), browser);
const want = (id) => !ONLY || ONLY.has(id);

const result = { browser: null, at: new Date().toISOString(), headless: !argv.includes('--headed'), video: VIDEO, checks: [], notes: [], screenshots: [], errors: [] };
const check = (id, ac, ok, detail = null) => {
  result.checks.push({ id, ac, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} [${ac}] ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

/** مقاطع عربية كل 4 ثوانٍ (2.8 ث لكل مقطع) بنص يعرّف رقمه وعيّنة من النص المختلط. */
function cuesFor(durationSec, prefix, stepMs = 4000) {
  const count = Math.max(1, Math.floor((durationSec * 1000) / stepMs) - 1);
  return Array.from({ length: count }, (_, i) => ({ n: i + 1, startMs: i * stepMs + 500, endMs: i * stepMs + 3300, text: `${prefix} ${i + 1}: ${SAMPLES[i % SAMPLES.length].text}` }));
}
// المتحكم يثبّت مرجع المقاطع بمفتاح (importedAt وeditedAt)، فكل بذر يحمل ختمًا فريدًا وإلا بقيت مقاطع السجل السابق.
let seedSeq = 0;
function recordFor(videoId, cues, { offset = 0, mode = 'ar', durationSec } = {}) {
  const rec = { ...videoRecord({ videoId, cues, offset, mode }), title: 'P5 live', durationMs: Math.ceil(durationSec * 1000) + 5000 };
  const stamp = new Date(Date.now() + seedSeq++).toISOString();
  rec.arabic = { ...rec.arabic, importedAt: stamp };
  rec.english = rec.english.map((t) => ({ ...t, capturedAt: stamp }));
  return rec;
}

// ---- دوال تُنفَّذ داخل الصفحة (مستقلة بلا إغلاق خارجي) ----
const P = {
  seed: async (rec) => {
    await globalThis.__tarjuman.store.updateVideo(rec.videoId, () => rec);
    await globalThis.__tarjuman.controller.reload();
    return globalThis.__tarjuman.controller.getState().arabic?.cues.length ?? 0;
  },
  state: () => {
    const h = globalThis.__tarjuman;
    const s = h.controller.getState();
    return { videoId: s.videoId, loading: s.loading, arabic: s.arabic?.cues.length ?? 0, view: s.view, overlay: h.mounted.overlay.state };
  },
  peek: () => globalThis.__tarjuman.mounted.overlay.peek(true),
  diag: () => globalThis.__tarjuman.mounted.overlay.diagnostics(),
  call: async (name, a) => {
    await globalThis.__tarjuman.controller[name](a);
    return globalThis.__tarjuman.controller.getState().view;
  },
  /** يأخذ عيّنة لكل إطار: ما ظهر في الطبقة مقابل ما يجب أن يظهر لزمن الفيديو، ويحسب أطول سلسلة انحراف. */
  sample: (ms, cues, rate) => new Promise((resolve) => {
    const h = globalThis.__tarjuman;
    const v = document.querySelector('#movie_player video.html5-main-video');
    v.muted = true;
    v.playbackRate = rate;
    const lines = (t) => String(t).split(/\r\n|\r|\n/).map((x) => x.trim()).filter(Boolean).join('\u0001');
    const off = h.controller.getState().view.displayOffsetMs;
    const at = (sec) => {
      const x = Math.round(sec * 1000) - off;
      const c = cues.find((q) => q.startMs <= x && x < q.endMs);
      return c ? lines(c.text) : '';
    };
    const rows = [];
    const t0 = performance.now();
    let prevExpected = null;
    let run = 0;
    let maxRun = 0;
    let bad = 0;
    let lag1 = 0;
    const play = v.play();
    const frame = () => {
      const t = v.currentTime;
      const exp = at(t);
      const shown = h.mounted.overlay.peek(false).lines.map((l) => l.text).join('\u0001');
      const ok = shown === exp;
      const okLag = ok || shown === prevExpected;
      if (!ok && okLag) lag1++;
      if (!okLag) {
        bad++;
        run++;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 0;
      }
      prevExpected = exp;
      rows.push(t);
      if (performance.now() - t0 < ms) requestAnimationFrame(frame);
      else {
        v.pause();
        v.playbackRate = 1;
        resolve({ frames: rows.length, advancedSec: +(rows.at(-1) - rows[0]).toFixed(2), bad, lag1, maxRun, engine: h.mounted.overlay.diagnostics().session?.engine ?? null });
      }
    };
    Promise.resolve(play).catch(() => {}).then(() => requestAnimationFrame(frame));
  }),
  /** أزمنة الإطارات أثناء التشغيل (أداء): نسب الإطارات الطويلة، والمهام الطويلة. */
  frames: (ms, rate) => new Promise((resolve) => {
    const v = document.querySelector('#movie_player video.html5-main-video');
    v.muted = true;
    v.playbackRate = rate;
    const dts = [];
    let longTasks = 0;
    let obs = null;
    try {
      obs = new PerformanceObserver((list) => { longTasks += list.getEntries().length; });
      obs.observe({ entryTypes: ['longtask'] });
    } catch {
      obs = null;
    }
    const t0 = performance.now();
    let prev = t0;
    const frame = () => {
      const now = performance.now();
      dts.push(now - prev);
      prev = now;
      if (now - t0 < ms) requestAnimationFrame(frame);
      else {
        v.pause();
        v.playbackRate = 1;
        obs?.disconnect();
        const s = dts.slice(2).sort((a, b) => a - b);
        const q = (p) => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2);
        resolve({ frames: s.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +s.at(-1).toFixed(2), over25: s.filter((x) => x > 25).length, over50: s.filter((x) => x > 50).length, longTasks });
      }
    };
    v.play().catch(() => {});
    requestAnimationFrame(frame);
  }),
  /** يتتبع الطبقة والعنوان كل 25ms حول تنقّل: متى بدأ، ومتى تغير المعرّف، وما ظهر في كل لحظة. */
  trackNav: (ms) => new Promise((resolve) => {
    const h = globalThis.__tarjuman;
    const rows = [];
    let startAt = null;
    const t0 = performance.now();
    document.addEventListener('yt-navigate-start', () => { startAt = performance.now() - t0; }, { once: true });
    const timer = setInterval(() => {
      const p = h.mounted.overlay.peek(false);
      rows.push({ at: Math.round(performance.now() - t0), url: new URLSearchParams(location.search).get('v'), state: h.controller.getState().videoId, text: p.lines.map((l) => l.text).join(' | '), hidden: p.hidden });
      if (performance.now() - t0 > ms) {
        clearInterval(timer);
        resolve({ startAt: startAt === null ? null : Math.round(startAt), rows });
      }
    }, 25);
  }),
  main: () => {
    const p = document.querySelector('#movie_player');
    const v = p?.querySelector('video.html5-main-video');
    const host = document.querySelector('#tarjuman-overlay');
    const pr = p?.getBoundingClientRect();
    const hr = host?.getBoundingClientRect();
    const ch = p?.querySelector('.ytp-chrome-bottom')?.getBoundingClientRect();
    const cap = p?.querySelector('.ytp-caption-window-container');
    return {
      hostInPlayer: !!host && host.parentElement === p,
      hostParentId: host?.parentElement?.id ?? null,
      fsId: document.fullscreenElement?.id || document.fullscreenElement?.tagName || null,
      classes: p ? [...p.classList].filter((c) => /^(ytp-(fullscreen|autohide|big-mode)|ad-showing|ad-interrupting|playing-mode|paused-mode)$/.test(c)) : [],
      theater: !!document.querySelector('ytd-watch-flexy')?.hasAttribute('theater'),
      player: pr && { w: Math.round(pr.width), h: Math.round(pr.height), top: Math.round(pr.top), bottom: Math.round(pr.bottom) },
      host: hr && { w: Math.round(hr.width), h: Math.round(hr.height) },
      chromeTop: ch ? Math.round(ch.top) : null,
      nativeCaptionDisplay: cap ? getComputedStyle(cap).display : 'غائبة',
      paused: v?.paused ?? null,
      currentTime: v ? +v.currentTime.toFixed(3) : null,
      duration: v ? v.duration : null,
      hostZ: host ? getComputedStyle(host).zIndex : null,
    };
  },
  hit: (x, y) => {
    const els = document.elementsFromPoint(x, y);
    return { top: els[0] ? `${els[0].tagName.toLowerCase()}${els[0].id ? `#${els[0].id}` : ''}${els[0].className && typeof els[0].className === 'string' ? `.${els[0].className.split(' ')[0]}` : ''}` : null, hasHost: els.some((e) => e.id === 'tarjuman-overlay') };
  },
};

// ملف الاختبار يتدهور بكثرة التشغيل (يتوقف تشغيل الوسائط): ملف جديد لكل تشغيل بـ--profile.
const b = await launch({ browser, profile: val('profile', `${browser}-p5`), headless: !argv.includes('--headed') });
result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
console.log(`المتصفح: ${result.browser}`);
let page;
let isoId;
const iso = (fn, ...args) => page.eval(fn, { contextId: isoId, args });
const wait = (fn, opts) => page.waitFor(fn, opts);
const shoot = async (name) => {
  const f = path.join(OUT, `${name}.png`);
  await page.screenshot(f);
  result.screenshots.push(path.relative(ROOT, f));
};
let realAds = 0;
let adReturned = false;
/**
 * إعلان حقيقي على الصفحة (يظهر أحيانًا في أي متصفح، وقد يتكرر مرتين أو أكثر ومدة كل منها نحو دقيقة): تُقاس الطبقة أثناءه
 * (يجب أن تكون مخفية فارغة)، ثم يُنتظر انتهاؤه (والتخطي بنقرة عادية متى ظهر الزر) وتُقاس عودتها.
 * يعيد 'none' بلا إعلان، و'ended' إن انتهى، و'stuck' إن طال أكثر من المهلة (فتُعاد الصفحة بعدها).
 */
async function settleAds(label, { record = true } = {}) {
  const isAd = () => page.eval(() => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); });
  if (!(await isAd())) return 'none';
  if (record) realAds++;
  await sleep(900);
  const during = await iso(P.peek);
  const mainDuring = await page.eval(P.main);
  if (record) check(`real-ad-hides-overlay (${label} #${realAds})`, 'P5-AC4', during.hidden === true && during.lines.length === 0, { classes: mainDuring.classes, hidden: during.hidden, lines: during.lines.length, videoDurationSec: mainDuring.duration && Math.round(mainDuring.duration) });
  if (record) await shoot(`ad-real-${realAds}-during`);
  const ended = await wait(() => {
    const p = document.querySelector('#movie_player');
    const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
    if (skip && getComputedStyle(skip).display !== 'none') skip.click();
    return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
  }, { timeoutMs: 150000, intervalMs: 1000 });
  if (!ended) {
    result.notes.push(`إعلان حقيقي على ${label} طال أكثر من 150 ثانية (سلسلة إعلانات)؛ بقيت الطبقة مخفية طوال ذلك كما يُراد، وأُعيد فتح الصفحة لمتابعة السيناريوهات.`);
    return 'stuck';
  }
  await sleep(1800);
  const after = await iso(P.peek);
  const m = await page.eval(P.main);
  // لفيديو TED تُقارن الأسطر بما يجب أن يظهر عند الزمن الحالي؛ ولغيره يكفي ظهور الطبقة (لا حصر لمقاطعه هنا).
  const expectNow = label === 'TED' && tedCues ? expectedAt(tedCues, m.currentTime ?? 0) : null;
  const back = after.hidden === false && (!expectNow || JSON.stringify(after.lines.map((l) => l.text)) === JSON.stringify(expectNow));
  if (record) check(`real-ad-overlay-returns (${label} #${realAds})`, 'P5-AC4', back, { hidden: after.hidden, timeAfter: m.currentTime, videoDurationSec: m.duration && Math.round(m.duration), classes: m.classes, shown: after.lines.length, expectedNow: expectNow ? expectNow.length : null });
  if (record) adReturned = adReturned || back;
  if (record) await shoot(`ad-real-${realAds}-after`);
  if (record) result.notes.push(`إعلان حقيقي صودف على صفحة ${label}`);
  return 'ended';
}
let tedCues = null;

/** ينتقل إلى فيديو ويعيد تهيئة العالم المعزول. */
async function openVideoOnce(id, { seedCues, durationHint = 600, start = 0 } = {}) {
  await page.goto(`https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`);
  await dismissConsent(page).catch(() => false);
  // الإقلاع التلقائي يختلف بين الجلسات: كتم الصوت ثم تشغيل مكتوم (مسموح) يضمن تحميل الوسائط، ثم إيقاف.
  await page.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
  let ready = await waitForPlayer(page, id, 12000);
  if (!ready) {
    await page.eval(() => { const v = document.querySelector('#movie_player video.html5-main-video'); if (v) { v.muted = true; v.play().catch(() => {}); } });
    ready = await waitForPlayer(page, id, 25000);
  }
  const lengthSec = await page.eval(() => { try { return Number(document.querySelector('#movie_player').getPlayerResponse().videoDetails.lengthSeconds) || null; } catch { return null; } });
  if (ready && lengthSec) ready = { ...ready, duration: lengthSec };
  if (await page.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  await sleep(1500);
  isoId = page.isolatedContextId(extId);
  if (!isoId) throw new Error('لا سياق معزول للإضافة');
  if (seedCues) await iso(P.seed, recordFor(id, seedCues, { durationSec: ready?.duration ?? durationHint }));
  return ready;
}

/** يفتح الفيديو ويتعامل مع الإعلان الحقيقي إن ظهر؛ وإن طالت سلسلة الإعلانات أُعيد فتح الصفحة (حتى 3 محاولات). */
async function openVideo(id, opts = {}) {
  let ready = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    ready = await openVideoOnce(id, opts);
    const r = await settleAds(id === VIDEO ? 'TED' : id, { record: !!opts.seedCues });
    if (r !== 'stuck') return ready;
  }
  return ready;
}
/** يقفز ويبقى متوقفًا (يوتيوب قد يستأنف التشغيل التلقائي بعد القفز، فيُعاد الإيقاف حتى يثبت). */
// أزمنة القفز قريبة من المخزَّن مؤقتًا: القفز البعيد قد يُفرغ عنصر الفيديو (emptied) في جلسة الأتمتة فلا تصله أحداث seeking،
// وهذا من يوتيوب لا من الطبقة. كلها داخل مقاطع (4 ثوانٍ لكل مقطع: بداية 0.5+4i ونهاية +2.8).
const T_VIEW = 17.5; // المقطع 5 (16.5–19.3)
const T_JUMP = 33.5; // المقطع 9 (32.5–35.3)
const T_BACK = 14.0; // المقطع 4 (12.5–15.3)
const seekTo = async (sec) => {
  for (let i = 0; i < 4; i++) {
    await page.eval((t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); v.currentTime = t; }, { args: [sec] });
    await wait(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return v && !v.seeking && v.readyState >= 2; }, { timeoutMs: 15000, intervalMs: 150 });
    await sleep(450);
    const st = await page.eval(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return { paused: v.paused, t: v.currentTime }; });
    if (st.paused && Math.abs(st.t - sec) < 0.05) return;
  }
};
const expectedAt = (cues, sec, off = 0) => {
  const x = Math.round(sec * 1000) - off;
  const c = cues.find((q) => q.startMs <= x && x < q.endMs);
  return c ? c.text.split(/\r\n|\r|\n/).map((t) => t.trim()).filter(Boolean) : [];
};
const shownText = async () => (await iso(P.peek)).lines.map((l) => l.text);

let extId;
try {
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', 'تحضير', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  extId = ext.id;
  page = await openTab(b.conn, 'about:blank');
  const errs = collectErrors(page, { extId, onlyExtension: true });
  const net = [];
  page.on('Network.requestWillBeSent', (e) => { if (String(e.initiator?.url ?? '').startsWith(`chrome-extension://${extId}`)) net.push(1); });
  await page.send('Network.enable');

  const ready = await openVideo(VIDEO);
  const dur = Math.floor(ready?.duration ?? 600);
  const cues = cuesFor(Math.min(dur, 1200), 'ع');
  tedCues = cues;
  const seeded = await iso(P.seed, recordFor(VIDEO, cues, { durationSec: dur }));
  const st = await iso(P.state);
  check('overlay-mounted-and-record-loaded', 'تحضير', st.overlay === 'mounted' && seeded === cues.length && st.videoId === VIDEO, { ...st, seeded, durationSec: dur });

  // ===== AC1: عربية وحدها، وفوق الإنجليزية، داخل #movie_player، وترجمة يوتيوب مخفية =====
  if (want('ac1')) {
    await page.eval(() => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); });
    await seekTo(10.5); // الثالث: بداية 8.5 ونهاية 11.3
    const m1 = await iso(P.peek);
    const expect1 = expectedAt(cues, 10.5);
    const main = await page.eval(P.main);
    check('ar-only-in-movie-player', 'P5-AC1', main.hostInPlayer && JSON.stringify(m1.lines.map((l) => l.text)) === JSON.stringify(expect1) && m1.lines.every((l) => l.kind === 'ar'), { host: main.hostParentId, shown: m1.lines.length, expected: expect1.length });
    const diag = await iso(P.diag);
    check('native-captions-hidden-while-active', 'P5-AC1', diag.session.captionsHidden === true && (main.nativeCaptionDisplay === 'none' || main.nativeCaptionDisplay === 'غائبة'), { display: main.nativeCaptionDisplay, captionsHidden: diag.session.captionsHidden });
    await shoot('ac1-ar-only');
    await iso(P.call, 'setDisplayMode', 'dual');
    await sleep(250);
    const m2 = await iso(P.peek);
    const dbg = await iso(() => { const s = globalThis.__tarjuman.controller.getState(); return { mode: s.view.displayMode, english: !!s.english, enCount: s.english?.cues.length ?? 0, enSource: s.english?.source ?? null, t: document.querySelector('#movie_player video').currentTime }; });
    check('dual-ar-over-en-single-layer', 'P5-AC1', m2.lines.map((l) => l.kind).join() === 'ar,en' && m2.lines.filter((l) => l.kind === 'en').every((l) => /^line \d+$/.test(l.text)), { lines: m2.lines.map((l) => [l.kind, l.dir]), hidden: m2.hidden, empty: m2.empty, dbg });
    await shoot('ac1-dual');
    await iso(P.call, 'setDisplayMode', 'off');
    await sleep(200);
    const m3 = await iso(P.diag);
    check('off-restores-native-captions', 'P5-AC1', m3.session.captionsHidden === false && (await iso(P.peek)).lines.length === 0, { captionsHidden: m3.session.captionsHidden });
    await iso(P.call, 'setDisplayMode', 'ar');
  }

  // ===== AC4 + AC6: العادي والمسرح وملء الشاشة، والنقرات والارتفاع فوق الشريط =====
  if (want('ac4')) {
    await seekTo(T_VIEW);
    const expect = expectedAt(cues, T_VIEW);
    const show = async (label) => {
      await seekTo(T_VIEW); // تبديل العرض قد يستأنف التشغيل: يُعاد التثبيت عند المقطع المقصود قبل القياس
      await sleep(600);
      const m = await page.eval(P.main);
      const p = await iso(P.peek);
      const inside = m.player && p.stage.top >= m.player.top - 2 && p.stage.bottom <= m.player.bottom + 2;
      const dg = await iso(P.diag);
      const stt = await iso(P.state);
      return { m, p, ok: JSON.stringify(p.lines.map((l) => l.text)) === JSON.stringify(expect) && !p.hidden && inside && p.host.width !== 0, label, why: { paused: m.paused, t: m.currentTime, shown: p.lines.length, expected: expect.length, hidden: p.hidden, empty: p.empty, inside, hostW: p.host.width, view: stt.view, eng: dg.session.engine, last: dg.session.lastCode } };
    };
    const normal = await show('normal');
    check('visible-normal', 'P5-AC4', normal.ok, { why: normal.why });
    await shoot('ac4-normal');
    await page.key('t', 'KeyT', 84);
    if (!(await wait(() => document.querySelector('ytd-watch-flexy')?.hasAttribute('theater'), { timeoutMs: 3000, intervalMs: 300 }))) {
      const c = await page.centerOf('#movie_player .ytp-size-button', { scroll: false });
      if (c) await page.click(c.x, c.y);
    }
    const theater = await show('theater');
    check('visible-theater', 'P5-AC4', theater.m.theater && theater.ok, { theater: theater.m.theater, why: theater.why });
    await shoot('ac4-theater');
    if (await page.eval(() => !!document.querySelector('ytd-watch-flexy')?.hasAttribute('theater'))) await page.key('t', 'KeyT', 84);
    await sleep(600);
    await page.key('f', 'KeyF', 70);
    const fs = await show('fullscreen');
    check('visible-fullscreen', 'P5-AC4', (fs.m.fsId !== null || fs.m.classes.includes('ytp-fullscreen')) && fs.ok, { fullscreenElement: fs.m.fsId, hostParent: fs.m.hostParentId, classes: fs.m.classes, player: fs.m.player, why: fs.why, lastCode: (await iso(P.diag)).session.lastCode });
    await shoot('ac4-fullscreen');
    await page.key('f', 'KeyF', 70);
    await sleep(900);
    const back = await page.eval(P.main);
    check('back-from-fullscreen', 'P5-AC4', back.hostInPlayer && back.fsId === null, { hostParent: back.hostParentId, fsId: back.fsId });
  }

  if (want('ac6')) {
    await seekTo(T_VIEW);
    await iso(P.call, 'setOffset', 0);
    const p = await iso(P.peek);
    const cx = Math.round((p.stage.left + p.stage.right) / 2);
    const cy = Math.round((p.stage.top + p.stage.bottom) / 2);
    const hit = await page.eval(P.hit, { args: [cx, cy] });
    check('pointer-passes-through-overlay', 'P5-AC6', !hit.hasHost, { under: hit.top, hasHost: hit.hasHost });
    const before = (await page.eval(P.main)).paused;
    await page.click(cx, cy);
    await sleep(700);
    const after = (await page.eval(P.main)).paused;
    check('click-on-subtitle-reaches-video', 'P5-AC6', before !== after, { pausedBefore: before, pausedAfter: after });
    await page.eval(() => { document.querySelector('#movie_player video.html5-main-video').pause(); });
    await sleep(300);
    const targets = await page.eval(() => ['.ytp-play-button', '.ytp-subtitles-button', '.ytp-settings-button', '.ytp-fullscreen-button', '.ytp-progress-bar'].map((s) => {
      const e = document.querySelector(`#movie_player ${s}`);
      if (!e) return { s, found: false };
      const r = e.getBoundingClientRect();
      const els = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { s, found: true, hasHost: els.some((x) => x.id === 'tarjuman-overlay') };
    }));
    check('youtube-controls-not-covered', 'P5-AC6', targets.every((t) => !t.found || !t.hasHost), targets);
    // الارتفاع فوق الشريط: يظهر الشريط بتحريك المؤشر، ثم يختفي بعد التشغيل وإبعاد المؤشر.
    await page.eval(() => { const v = document.querySelector('#movie_player video.html5-main-video'); v.play().catch(() => {}); });
    await revealControls(page);
    const shown = await page.eval(P.main);
    const pShown = await iso(P.peek);
    const above = shown.chromeTop !== null && pShown.stage.bottom <= shown.chromeTop;
    check('raised-above-controls-when-shown', 'P5-AC6', !shown.classes.includes('ytp-autohide') && above, { stageBottom: pShown.stage.bottom, chromeTop: shown.chromeTop });
    await shoot('ac6-controls-shown');
    await page.mouseMove(10, 10);
    await wait(() => document.querySelector('#movie_player')?.classList.contains('ytp-autohide'), { timeoutMs: 12000, intervalMs: 300 });
    await sleep(500);
    const hid = await page.eval(P.main);
    const pHid = await iso(P.peek);
    check('lowered-when-controls-hide', 'P5-AC6', hid.classes.includes('ytp-autohide') && pHid.stage.bottom > pShown.stage.bottom, { shownBottom: pShown.stage.bottom, hiddenBottom: pHid.stage.bottom });
    await shoot('ac6-controls-hidden');
    await page.eval(() => { document.querySelector('#movie_player video.html5-main-video').pause(); });
  }

  // ===== AC3: المزامنة (صفحة جديدة: المخزَّن مؤقتًا في بداية الفيديو، فلا قفز بعيد يُفرغ العنصر) =====
  if (want('ac3')) {
    await openVideo(VIDEO, { seedCues: cues });
    for (const rate of [0.75, 1, 1.5, 2]) {
      await seekTo(5);
      const r = await iso(P.sample, 7000, cues, rate);
      check(`sync-rate-${rate}x`, 'P5-AC3', r.bad === 0 || r.maxRun <= 1, r.bad === 0 || r.maxRun <= 1 ? { ...r } : { ...r, state: await iso(P.state), classes: (await page.eval(P.main)).classes, peek: await iso(P.peek) });
    }
    // الإزاحة +1.0: المقطع 6 (24.5–27.3) ظاهر عند 25.0، ومع +1.0 يصير وقت البحث 24.0 (فجوة): يتغير الظاهر وحده.
    await seekTo(25.0);
    const a = await shownText();
    await iso(P.call, 'setOffset', 1000);
    await sleep(250);
    const b2 = await shownText();
    const afterT = (await page.eval(P.main)).currentTime;
    check('offset-plus-lookup-only', 'P5-AC3', a.length > 0 && JSON.stringify(b2) === JSON.stringify(expectedAt(cues, 25.0, 1000)) && JSON.stringify(a) !== JSON.stringify(b2) && afterT === 25.0, { wasShown: a.length, nowShown: b2.length, currentTimeBefore: 25.0, currentTimeAfter: afterT });
    await iso(P.call, 'resetOffset');
    // الإزاحة −1.0: عند 27.6 فجوة (27.3–28.5)، ومع −1.0 يصير وقت البحث 28.6 فيظهر المقطع 7 قبل موعده بثانية.
    await seekTo(27.6);
    const c0 = await shownText();
    await iso(P.call, 'setOffset', -1000);
    await sleep(250);
    const c1 = await shownText();
    const t2 = (await page.eval(P.main)).currentTime;
    check('offset-minus-lookup-only', 'P5-AC3', c0.length === 0 && c1.length > 0 && JSON.stringify(c1) === JSON.stringify(expectedAt(cues, 27.6, -1000)) && t2 === 27.6, { before: c0.length, after: c1.length, currentTime: t2, state: await iso(P.state) });
    await iso(P.call, 'resetOffset');
    await seekTo(T_JUMP);
    const jumpShown = await shownText();
    const jump = jumpShown.length > 0 && JSON.stringify(jumpShown) === JSON.stringify(expectedAt(cues, T_JUMP));
    await seekTo(T_BACK);
    const backShown = await shownText();
    const back = backShown.length > 0 && JSON.stringify(backShown) === JSON.stringify(expectedAt(cues, T_BACK));
    check('seek-forward-and-back', 'P5-AC3', jump && back, { jump, back, readyState: await page.eval(() => document.querySelector('#movie_player video.html5-main-video').readyState) });
    const idle = await iso(P.diag);
    check('loop-stops-when-paused', 'P5-AC3', idle.session.engine.running === false, { running: idle.session.engine.running });
  }

  // ===== الإعلان (AC4): الإعلان الحقيقي يُقاس متى صودف (في أي سيناريو)، وإلا محاكاة بفئة المشغّل مع التصريح بذلك =====
  if (want('ad')) {
    if (!adReturned && argv.includes('--ad')) {
      for (const id of ['dQw4w9WgXcQ', '9bZkp7q19f0', 'kJQP7kiw5Fk', 'JGwWNGJdvx8']) {
        await openVideo(id, { seedCues: cuesFor(120, 'إ'), durationHint: 200 }).catch(() => null);
        const found = await wait(() => document.querySelector('#movie_player')?.classList.contains('ad-showing') || document.querySelector('#movie_player')?.classList.contains('ad-interrupting'), { timeoutMs: 14000, intervalMs: 400 });
        if (found && (await settleAds(id)) === 'ended' && adReturned) break;
      }
    }
    if (!adReturned) {
      await openVideo(VIDEO, { seedCues: cues });
      await seekTo(10.5);
      await page.eval(() => document.querySelector('#movie_player').classList.add('ad-showing'));
      await sleep(300);
      const during = await iso(P.peek);
      await page.eval(() => document.querySelector('#movie_player').classList.remove('ad-showing'));
      await sleep(300);
      const after = await iso(P.peek);
      check('simulated-ad-class-hides-and-restores', 'P5-AC4', during.hidden && during.lines.length === 0 && !after.hidden && after.lines.length > 0, { simulated: true });
      result.notes.push(realAds ? 'صودف إعلان حقيقي لكن عودة الطبقة بعده لم تُقَس (سلسلة طويلة)؛ أُثبتت العودة بمحاكاة فئة ad-showing.' : 'لم يصادَف إعلان حقيقي؛ أُثبت الإخفاء والعودة بمحاكاة فئة ad-showing على المشغّل (غير كافٍ وحده لإثبات الإعلان الحقيقي).');
    }
  }

  // ===== AC5: التنقل بين الفيديوهات =====
  if (want('ac5')) {
    await openVideo(VIDEO, { seedCues: cuesFor(Math.min(dur, 1200), 'ألف') });
    const rel = (await relatedIds(page)).filter((id) => id !== VIDEO).slice(0, 3);
    if (!rel.length) check('navigation', 'P5-AC5', false, { reason: 'لا مقترحات' });
    else {
      for (const id of rel) await iso(P.seed, recordFor(id, cuesFor(900, 'باء'), { durationSec: 905 }));
      await seekTo(10.5);
      const preShown = await shownText();
      const startsWithA = preShown.join(' ').startsWith('ألف');
      const tracking = iso(P.trackNav, 14000);
      await sleep(300);
      let target = null;
      for (const id of rel) {
        await clickRelated(page, id);
        await sleep(1800);
        if ((await currentUrlVideoId(page)) !== id) {
          result.notes.push('نقرة الفأرة على المقترح لم تنقل؛ استُعملت نقرة الرابط البرمجية (تنقّل SPA نفسه).');
          await page.eval((x) => document.querySelector(`#secondary a[href^="/watch?v=${x}"]`)?.click(), { args: [id] });
          await sleep(2200);
        }
        if ((await currentUrlVideoId(page)) === id) {
          target = id;
          break;
        }
      }
      const nav = await tracking;
      const urlChangedAt = target ? nav.rows.find((r) => r.url === target)?.at ?? null : null;
      const staleAfterStart = nav.rows.filter((r) => nav.startAt !== null && r.at >= nav.startAt + 60 && r.text.includes('ألف'));
      const staleAfterUrl = nav.rows.filter((r) => urlChangedAt !== null && r.at >= urlChangedAt && r.text.includes('ألف'));
      check('overlay-cleared-immediately-on-navigation', 'P5-AC5', !!target && startsWithA && nav.startAt !== null && staleAfterStart.length === 0 && staleAfterUrl.length === 0, { target: !!target, startsWithA, preShown: preShown.length, navStartAtMs: nav.startAt, urlChangedAtMs: urlChangedAt, staleAfterStart: staleAfterStart.length, staleAfterUrl: staleAfterUrl.length });
      await sleep(1500);
      const s2 = await iso(P.state);
      await seekTo(8.6);
      const nowShown = await shownText();
      check('new-video-loads-its-own-saved-translation', 'P5-AC5', !!target && s2.videoId === target && s2.arabic > 0 && nowShown.length > 0 && nowShown.every((t) => t.startsWith('باء')), { stateVideoIsTarget: s2.videoId === target, arabicCount: s2.arabic, shown: nowShown.length });
      await shoot('ac5-after-navigation');
    }
  }

  // ===== AC7: الأداء على فيديو ساعتين فأكثر وملف 2400 مقطع =====
  if (want('ac7')) {
    let r0 = null;
    for (let i = 0; i < 3 && !r0?.duration; i++) r0 = await openVideo(PERF_VIDEO, { start: 3600 }).catch((e) => ({ error: e.message }));
    const durSec = r0?.duration ?? 0;
    if (!durSec) check('perf-video-ready', 'P5-AC7', false, { error: r0?.error ?? 'لم يجهز', page: await page.eval(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return { rs: v?.readyState, paused: v?.paused, cls: [...(document.querySelector('#movie_player')?.classList ?? [])].filter((c) => /ad-|mode/.test(c)) }; }).catch(() => null) });
    else {
      const big = cuesFor(durSec, 'ع', Math.max(2000, Math.floor((durSec * 1000) / 2400)));
      await iso(P.seed, recordFor(PERF_VIDEO, big, { durationSec: durSec }));
      check('perf-video-long-enough', 'P5-AC7', durSec >= 7200 && big.length >= 2000, { durationSec: Math.round(durSec), cues: big.length });
      await iso(P.call, 'setDisplayMode', 'off');
      await sleep(400);
      const base = await iso(P.frames, 10000, 1);
      await iso(P.call, 'setDisplayMode', 'ar');
      await sleep(400);
      const on1 = await iso(P.frames, 10000, 1);
      await iso(P.call, 'setDisplayMode', 'dual');
      await sleep(400);
      const on2 = await iso(P.frames, 10000, 2);
      await iso(P.call, 'setDisplayMode', 'ar');
      const eng = (await iso(P.diag)).session.engine;
      const sync = await iso(P.sample, 8000, big, 1);
      check('frame-time-with-overlay-vs-baseline', 'P5-AC7', on1.p95 <= Math.max(base.p95 * 1.5, 20) && on1.over50 <= base.over50 + 2 && on2.over50 <= base.over50 + 4, { baseline: base, overlay1x: on1, overlayDual2x: on2 });
      check('sync-on-big-file', 'P5-AC7', sync.bad === 0 || sync.maxRun <= 1, { ...sync, engineLookups: eng.lookups, engineFrames: eng.frames });
      await shoot('ac7-long-video');
    }
  }

  await sleep(500);
  errs.stop();
  result.errors = errs.list;
  check('no-extension-errors', 'تحضير', errs.list.length === 0, errs.list.slice(0, 5));
  check('no-network-from-extension', 'تحضير', net.length === 0, { requests: net.length });
} catch (err) {
  check('run-aborted', 'تحضير', false, { error: String(err.message ?? err).slice(0, 300) });
} finally {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'live.json'), `${JSON.stringify(result, null, 2)}\n`);
  await b.close();
}
const failed = result.checks.filter((c) => !c.ok);
console.log(`\nالنتيجة: ${result.checks.length - failed.length}/${result.checks.length}`);
process.exit(failed.length ? 1 : 0);
