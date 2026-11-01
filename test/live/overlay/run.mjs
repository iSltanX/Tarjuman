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
import { clickRelated, dismissConsent, relatedIds, revealControls, waitForPlayer } from '../harness/youtube.mjs';
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
const recordFor = (videoId, cues, { offset = 0, mode = 'ar', durationSec } = {}) => ({ ...videoRecord({ videoId, cues, offset, mode }), title: 'P5 live', durationMs: Math.ceil(durationSec * 1000) + 5000 });

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
    Promise.resolve(v.play()).catch(() => {}).then(() => requestAnimationFrame(frame));
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

const b = await launch({ browser, profile: `${browser}-p5`, headless: !argv.includes('--headed') });
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
/** ينتقل إلى فيديو ويعيد تهيئة العالم المعزول. */
async function openVideo(id, { seedCues, durationHint = 600 } = {}) {
  await page.goto(`https://www.youtube.com/watch?v=${id}`);
  await dismissConsent(page).catch(() => false);
  const ready = await waitForPlayer(page, id);
  await page.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
  if (await page.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  await sleep(1500);
  isoId = page.isolatedContextId(extId);
  if (!isoId) throw new Error('لا سياق معزول للإضافة');
  if (seedCues) await iso(P.seed, recordFor(id, seedCues, { durationSec: ready?.duration ?? durationHint }));
  return ready;
}
const seekTo = async (sec) => {
  await page.eval((t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); v.currentTime = t; }, { args: [sec] });
  await wait(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return v && !v.seeking && v.readyState >= 2; }, { timeoutMs: 15000, intervalMs: 150 });
  await sleep(350);
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
    check('dual-ar-over-en-single-layer', 'P5-AC1', m2.lines.map((l) => l.kind).join() === 'ar,en' && m2.lines.filter((l) => l.kind === 'en').every((l) => /^line \d+$/.test(l.text)), { lines: m2.lines.map((l) => [l.kind, l.dir]) });
    await shoot('ac1-dual');
    await iso(P.call, 'setDisplayMode', 'off');
    await sleep(200);
    const m3 = await iso(P.diag);
    check('off-restores-native-captions', 'P5-AC1', m3.session.captionsHidden === false && (await iso(P.peek)).lines.length === 0, { captionsHidden: m3.session.captionsHidden });
    await iso(P.call, 'setDisplayMode', 'ar');
  }

  // ===== AC3: المزامنة =====
  if (want('ac3')) {
    for (const rate of [0.75, 1, 1.5, 2]) {
      await seekTo(30);
      const r = await iso(P.sample, 7000, cues, rate);
      check(`sync-rate-${rate}x`, 'P5-AC3', r.bad === 0 || r.maxRun <= 1, { ...r });
    }
    await seekTo(60);
    const before = (await page.eval(P.main)).currentTime;
    const a = await shownText();
    await iso(P.call, 'setOffset', 1000);
    await sleep(250);
    const b2 = await shownText();
    const afterT = (await page.eval(P.main)).currentTime;
    const expect = expectedAt(cues, before, 1000);
    check('offset-changes-lookup-only', 'P5-AC3', before === afterT && JSON.stringify(b2) === JSON.stringify(expect), { currentTimeBefore: before, currentTimeAfter: afterT, wasShown: a.length, nowShown: b2.length });
    await iso(P.call, 'setOffset', -1000);
    await sleep(250);
    check('offset-negative', 'P5-AC3', JSON.stringify(await shownText()) === JSON.stringify(expectedAt(cues, before, -1000)) && (await page.eval(P.main)).currentTime === before);
    await iso(P.call, 'resetOffset');
    await seekTo(100.2);
    const jump = JSON.stringify(await shownText()) === JSON.stringify(expectedAt(cues, 100.2));
    await seekTo(20.1);
    const back = JSON.stringify(await shownText()) === JSON.stringify(expectedAt(cues, 20.1));
    check('seek-forward-and-back', 'P5-AC3', jump && back, { jump, back });
    const idle = await iso(P.diag);
    check('loop-stops-when-paused', 'P5-AC3', idle.session.engine.running === false, { running: idle.session.engine.running });
  }

  // ===== AC4 + AC6: العادي والمسرح وملء الشاشة، والنقرات والارتفاع فوق الشريط =====
  if (want('ac4')) {
    await seekTo(10.5);
    const expect = expectedAt(cues, 10.5);
    const show = async (label) => {
      await sleep(900);
      const m = await page.eval(P.main);
      const p = await iso(P.peek);
      const inside = m.player && p.stage.top >= m.player.top - 2 && p.stage.bottom <= m.player.bottom + 2;
      return { m, p, ok: JSON.stringify(p.lines.map((l) => l.text)) === JSON.stringify(expect) && !p.hidden && inside && p.host.w !== 0, label };
    };
    const normal = await show('normal');
    check('visible-normal', 'P5-AC4', normal.ok, { player: normal.m.player, stage: normal.p.stage });
    await shoot('ac4-normal');
    await page.key('t', 'KeyT', 84);
    const theater = await show('theater');
    check('visible-theater', 'P5-AC4', theater.m.theater && theater.ok, { theater: theater.m.theater, player: theater.m.player });
    await shoot('ac4-theater');
    await page.key('t', 'KeyT', 84);
    await sleep(600);
    await page.key('f', 'KeyF', 70);
    const fs = await show('fullscreen');
    check('visible-fullscreen', 'P5-AC4', (fs.m.fsId !== null || fs.m.classes.includes('ytp-fullscreen')) && fs.ok, { fullscreenElement: fs.m.fsId, hostParent: fs.m.hostParentId, classes: fs.m.classes, player: fs.m.player, diag: (await iso(P.diag)).session.lastCode });
    await shoot('ac4-fullscreen');
    await page.key('f', 'KeyF', 70);
    await sleep(900);
    const back = await page.eval(P.main);
    check('back-from-fullscreen', 'P5-AC4', back.hostInPlayer && back.fsId === null, { hostParent: back.hostParentId, fsId: back.fsId });
  }

  if (want('ac6')) {
    await seekTo(10.5);
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

  // ===== الإعلان (AC4): إعلان حقيقي إن صودف، وإلا محاكاة بفئة المشغّل مع التصريح بذلك =====
  if (want('ad')) {
    let real = null;
    if (argv.includes('--ad')) {
      for (const id of ['dQw4w9WgXcQ', '9bZkp7q19f0', 'kJQP7kiw5Fk', 'JGwWNGJdvx8']) {
        await openVideo(id, { seedCues: cuesFor(120, 'إ'), durationHint: 200 }).catch(() => null);
        const found = await wait(() => document.querySelector('#movie_player')?.classList.contains('ad-showing') || document.querySelector('#movie_player')?.classList.contains('ad-interrupting'), { timeoutMs: 14000, intervalMs: 400 });
        if (found) { real = id; break; }
      }
    }
    if (real) {
      await sleep(1200);
      const during = await iso(P.peek);
      const mainDuring = await page.eval(P.main);
      check('real-ad-hides-overlay', 'P5-AC4', during.hidden === true && during.lines.length === 0, { classes: mainDuring.classes });
      await shoot('ad-real-during');
      // انتظار الانتهاء (وتخطٍّ بنقرة مستخدم عادية متى ظهر الزر).
      const ended = await wait(() => {
        const p = document.querySelector('#movie_player');
        const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
        if (skip && getComputedStyle(skip).display !== 'none') skip.click();
        return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
      }, { timeoutMs: 70000, intervalMs: 1000 });
      await sleep(1500);
      const after = await iso(P.peek);
      const t = (await page.eval(P.main)).currentTime;
      check('real-ad-overlay-returns', 'P5-AC4', !!ended && after.hidden === false, { ended: !!ended, hidden: after.hidden, timeAfter: t });
      await shoot('ad-real-after');
      result.notes.push(`إعلان حقيقي صودف على ${real}`);
    } else {
      await openVideo(VIDEO, { seedCues: cues });
      await seekTo(10.5);
      await page.eval(() => document.querySelector('#movie_player').classList.add('ad-showing'));
      await sleep(300);
      const during = await iso(P.peek);
      await page.eval(() => document.querySelector('#movie_player').classList.remove('ad-showing'));
      await sleep(300);
      const after = await iso(P.peek);
      check('simulated-ad-class-hides-and-restores', 'P5-AC4', during.hidden && during.lines.length === 0 && !after.hidden && after.lines.length > 0, { simulated: true });
      result.notes.push('لم يصادَف إعلان حقيقي؛ أُثبت الإخفاء بمحاكاة فئة ad-showing على المشغّل (غير كافٍ وحده لإثبات الإعلان الحقيقي).');
    }
  }

  // ===== AC5: التنقل بين الفيديوهات =====
  if (want('ac5')) {
    await openVideo(VIDEO, { seedCues: cuesFor(Math.min(dur, 1200), 'ألف') });
    const rel = await relatedIds(page);
    const target = rel.find((id) => id !== VIDEO);
    if (!target) check('navigation', 'P5-AC5', false, { reason: 'لا مقترحات' });
    else {
      await iso(P.seed, recordFor(target, cuesFor(900, 'باء'), { durationSec: 905 }));
      await seekTo(10.5);
      const startsWithA = (await shownText()).join(' ').startsWith('ألف');
      const tracking = iso(P.trackNav, 7000);
      await sleep(300);
      await clickRelated(page, target);
      const nav = await tracking;
      const urlChangedAt = nav.rows.find((r) => r.url === target)?.at ?? null;
      const staleAfterStart = nav.rows.filter((r) => nav.startAt !== null && r.at >= nav.startAt + 60 && r.text.includes('ألف'));
      const staleAfterUrl = nav.rows.filter((r) => urlChangedAt !== null && r.at >= urlChangedAt && r.text.includes('ألف'));
      check('overlay-cleared-immediately-on-navigation', 'P5-AC5', startsWithA && nav.startAt !== null && staleAfterStart.length === 0 && staleAfterUrl.length === 0, { startsWithA, navStartAtMs: nav.startAt, urlChangedAtMs: urlChangedAt, staleAfterStart: staleAfterStart.length, staleAfterUrl: staleAfterUrl.length });
      await sleep(1500);
      const s2 = await iso(P.state);
      await seekTo(8.6);
      const nowShown = await shownText();
      check('new-video-loads-its-own-saved-translation', 'P5-AC5', s2.videoId === target && s2.arabic > 0 && nowShown.length > 0 && nowShown.every((t) => t.startsWith('باء')), { stateVideoIsTarget: s2.videoId === target, arabicCount: s2.arabic, shown: nowShown.length });
      await shoot('ac5-after-navigation');
    }
  }

  // ===== AC7: الأداء على فيديو ساعتين فأكثر وملف 2400 مقطع =====
  if (want('ac7')) {
    const r0 = await openVideo(PERF_VIDEO).catch((e) => ({ error: e.message }));
    const durSec = r0?.duration ?? 0;
    if (!durSec) check('perf-video-ready', 'P5-AC7', false, { error: r0?.error ?? 'لم يجهز' });
    else {
      const big = cuesFor(durSec, 'ع', Math.max(2000, Math.floor((durSec * 1000) / 2400)));
      await iso(P.seed, recordFor(PERF_VIDEO, big, { durationSec: durSec }));
      check('perf-video-long-enough', 'P5-AC7', durSec >= 7200 && big.length >= 2000, { durationSec: Math.round(durSec), cues: big.length });
      await seekTo(3600);
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
