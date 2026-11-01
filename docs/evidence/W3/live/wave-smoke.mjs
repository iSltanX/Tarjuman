#!/usr/bin/env node
// دخان بوابة W3 (المنسّق، بروتوكول «الاختبارات الحية»): ملف SRT عربي عيّنة فوق فيديو حقيقي، وقفز، وملء الشاشة،
// وتنقل واحد. السلسلة بوحدات الموجة المدمجة: مسار TED الإنجليزي الحقيقي (عيّنة P1) ← buildExport (P3) ملفًا وبصمة ←
// ترجمة عيّنة بأزمنة الملف نفسه ← readImport (P4) ← controller.loadArabic (P2) ← الطبقة والمزامنة (P5) فوق الفيديو نفسه.
// البصمة والمسار يُكتبان في السجل بـwithExport كما يكتبهما recordExport بعد التنزيل، لأن الالتقاط تحت الأتمتة يعيد
// جسمًا فارغًا (P1). لا يُحفظ النص الإنجليزي في الأدلة؛ الملف العيّنة أزمنة الأصل ونص عربي اصطناعي.
//   npm run build:dev -- --out <مجلد خارج المستودع>
//   node docs/evidence/W3/live/wave-smoke.mjs --ext <مجلد> [--browser brave] [--profile brave-w3] [--headed] [--dry]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, sleep } from '../../../../test/live/harness/browser.mjs';
import { collectErrors, openTab } from '../../../../test/live/harness/extension.mjs';
import { clickRelated, currentUrlVideoId, dismissConsent, relatedIds, waitForPlayer } from '../../../../test/live/harness/youtube.mjs';
import { englishTrack, realTrack } from '../../../../test/helpers/fixtures.js';
import { buildExport } from '../../../../src/core/export/index.js';
import { readImport } from '../../../../src/core/import/index.js';
import { withExport } from '../../../../src/core/model/transitions.js';
import { parseSrtLenient } from '../../../../src/core/srt/lenient.js';
import { formatSrtTime } from '../../../../src/core/srt/time.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(val('ext', 'dist'));
const OUT = path.join(HERE, '..', browser);
const VIDEO = 'iG9CE55wbtY';
const NOW = new Date().toISOString();

const result = { browser: null, at: NOW, headless: !argv.includes('--headed'), video: VIDEO, sample: null, times: null, checks: [], notes: [], screenshots: [], errors: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

// ---- الملف العيّنة: تصدير P3 الحقيقي ثم ترجمة بأزمنته ثم استيراد P4 ----
const real = realTrack('manual');
const enTrack = englishTrack({ kind: 'manual', cues: real.cues, capturedAt: NOW });
const exp = buildExport({ videoId: VIDEO, track: { key: enTrack.key, lang: enTrack.lang, kind: enTrack.kind, cues: enTrack.cues }, mode: 'normal', now: NOW });
const fp = exp.fingerprint;
const srtText = (cues) => cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');
const arCues = parseSrtLenient(exp.files[0].text).cues
  .map((c) => ({ ...c, text: c.text.split('\n').map((_, k) => `ترجمة المقطع ${c.n} سطر ${k + 1}`).join('\n') }));
const AR_NAME = `${VIDEO}.ar.srt`;
const arText = srtText(arCues);
await writeFile(path.join(HERE, AR_NAME), arText);
const imp = await readImport(new File([arText], AR_NAME, { type: 'application/x-subrip' }), { fingerprints: [fp] });
result.sample = { fixture: real.fixture.file, exportFile: exp.files[0].name, cues: arCues.length, importFile: imp.fileName ?? null, matched: imp.comparison?.matched ?? null };
check('sample-srt-exported-and-imported', real.fixture.file.includes(VIDEO) && exp.files.length === 1 && imp.ok && imp.comparison?.matched === true
  && imp.cues.length === real.cues.length && imp.fingerprintId === fp.id && imp.warnings.length === 0, result.sample);
const seedRecord = withExport(null, { videoId: VIDEO, title: 'W3 smoke', durationMs: null, englishTrack: enTrack, fingerprint: fp, displayMode: 'ar' }, NOW);

// أزمنة القياس: منتصف مقاطع مفردة (لا تداخل) في الدقيقة الأولى، قريبة من المخزَّن مؤقتًا (حدود إثبات P5).
const single = imp.cues.filter((c, i, a) => c.endMs - c.startMs >= 1200 && c.startMs >= 5000 && c.endMs <= 60000
  && (i === 0 || a[i - 1].endMs <= c.startMs) && (i === a.length - 1 || c.endMs <= a[i + 1].startMs));
const mid = (c) => +((c.startMs + c.endMs) / 2000).toFixed(2);
const T = single.length >= 6 ? { back: mid(single[0]), view: mid(single[2]), jump: mid(single.find((c) => mid(c) >= mid(single[2]) + 8) ?? single.at(-1)) } : null;
result.times = T;
check('measure-points', !!T && T.jump - T.view >= 8, { singles: single.length, ...T });
const expectedAt = (sec) => {
  const x = Math.round(sec * 1000);
  return imp.cues.filter((q) => q.startMs <= x && x < q.endMs).flatMap((q) => q.text.split(/\r\n|\r|\n/).map((t) => t.trim()).filter(Boolean));
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (argv.includes('--dry')) {
  console.log(`\nتجهيز فقط (--dry): ${result.checks.filter((c) => c.ok).length}/${result.checks.length}`);
  process.exit(result.checks.every((c) => c.ok) ? 0 : 1);
}

// ---- دوال تُنفَّذ داخل العالم المعزول للإضافة أو الصفحة (مستقلة بلا إغلاق خارجي) ----
const P = {
  seed: async (rec) => {
    await globalThis.__tarjuman.store.updateVideo(rec.videoId, () => rec);
    await globalThis.__tarjuman.controller.reload();
    return globalThis.__tarjuman.controller.getState().videoId;
  },
  load: async (input) => {
    const rec = await globalThis.__tarjuman.controller.loadArabic(input, { replace: true });
    const s = globalThis.__tarjuman.controller.getState();
    return { arabic: s.arabic?.cues.length ?? 0, fileName: rec.arabic.fileName, fingerprintId: rec.arabic.fingerprintId, matched: rec.arabic.comparison?.matched ?? null, mode: s.view.displayMode };
  },
  state: () => {
    const h = globalThis.__tarjuman;
    const s = h.controller.getState();
    return { videoId: s.videoId, loading: s.loading, arabic: s.arabic?.cues.length ?? 0, view: s.view, overlay: h.mounted.overlay.state };
  },
  peek: () => globalThis.__tarjuman.mounted.overlay.peek(true),
  /** يأخذ عيّنة لكل إطار أثناء التشغيل: الظاهر مقابل ما يجب أن يظهر لزمن الفيديو، وأطول سلسلة انحراف. */
  sample: (ms, cues) => new Promise((resolve) => {
    const h = globalThis.__tarjuman;
    const v = document.querySelector('#movie_player video.html5-main-video');
    v.muted = true;
    const lines = (t) => String(t).split(/\r\n|\r|\n/).map((x) => x.trim()).filter(Boolean).join(' | ');
    const at = (sec) => {
      const x = Math.round(sec * 1000);
      return cues.filter((q) => q.startMs <= x && x < q.endMs).map((q) => lines(q.text)).join(' | ');
    };
    let frames = 0;
    let bad = 0;
    let run = 0;
    let maxRun = 0;
    let prev = null;
    const t0 = performance.now();
    const start = v.currentTime;
    const frame = () => {
      const exp = at(v.currentTime);
      const p = h.mounted.overlay.peek(false);
      const shown = p ? p.lines.map((l) => l.text).join(' | ') : '';
      frames++;
      if (shown === exp || shown === prev) run = 0;
      else { bad++; run++; maxRun = Math.max(maxRun, run); }
      prev = exp;
      if (performance.now() - t0 < ms) requestAnimationFrame(frame);
      else { v.pause(); resolve({ frames, advancedSec: +(v.currentTime - start).toFixed(2), bad, maxRun }); }
    };
    Promise.resolve(v.play()).catch(() => {}).then(() => requestAnimationFrame(frame));
  }),
  /** يتتبع الطبقة والعنوان كل 25ms حول تنقّل. */
  trackNav: (ms) => new Promise((resolve) => {
    const h = globalThis.__tarjuman;
    const rows = [];
    let startAt = null;
    const t0 = performance.now();
    document.addEventListener('yt-navigate-start', () => { startAt = performance.now() - t0; }, { once: true });
    const timer = setInterval(() => {
      const p = h.mounted.overlay.peek(false);
      rows.push({ at: Math.round(performance.now() - t0), url: new URLSearchParams(location.search).get('v'), text: p ? p.lines.map((l) => l.text).join(' | ') : '' });
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
    return {
      hostInPlayer: !!host && host.parentElement === p,
      fsId: document.fullscreenElement?.id || document.fullscreenElement?.tagName || null,
      classes: p ? [...p.classList].filter((c) => /^(ytp-fullscreen|ad-showing|ad-interrupting)$/.test(c)) : [],
      player: pr && { w: Math.round(pr.width), h: Math.round(pr.height), top: Math.round(pr.top), bottom: Math.round(pr.bottom) },
      paused: v?.paused ?? null,
      currentTime: v ? +v.currentTime.toFixed(3) : null,
    };
  },
};

const b = await launch({ browser, profile: val('profile', `${browser}-w3`), headless: !argv.includes('--headed') });
result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
console.log(`المتصفح: ${result.browser}`);
let page;
let isoId;
let extId;
const iso = (fn, ...args) => page.eval(fn, { contextId: isoId, args });
const wait = (fn, opts) => page.waitFor(fn, opts);
const shownText = async () => (await iso(P.peek))?.lines.map((l) => l.text) ?? [];
const shoot = async (name) => {
  const f = path.join(OUT, `${name}.png`);
  await page.screenshot(f);
  result.screenshots.push(path.relative(ROOT, f));
};
/** يقفز ويبقى متوقفًا (يوتيوب قد يستأنف التشغيل بعد القفز، فيُعاد الإيقاف حتى يثبت). */
const seekTo = async (sec) => {
  for (let i = 0; i < 4; i++) {
    await page.eval((t) => { const v = document.querySelector('#movie_player video.html5-main-video'); v.pause(); v.currentTime = t; }, { args: [sec] });
    await wait(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return v && !v.seeking && v.readyState >= 2; }, { timeoutMs: 15000, intervalMs: 150 });
    await sleep(450);
    const st = await page.eval(() => { const v = document.querySelector('#movie_player video.html5-main-video'); return { paused: v.paused, t: v.currentTime }; });
    if (st.paused && Math.abs(st.t - sec) < 0.05) return;
  }
};
/** إعلان حقيقي: يُنتظر انتهاؤه (والتخطي بنقرة عادية متى ظهر الزر) حتى 150 ثانية. */
async function settleAd(label) {
  const isAd = await page.eval(() => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); });
  if (!isAd) return 'none';
  const ended = await wait(() => {
    const p = document.querySelector('#movie_player');
    const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
    if (skip && getComputedStyle(skip).display !== 'none') skip.click();
    return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
  }, { timeoutMs: 150000, intervalMs: 1000 });
  result.notes.push(ended ? `إعلان حقيقي على ${label} انتهى قبل القياس.` : `سلسلة إعلانات على ${label} طالت أكثر من 150 ثانية؛ أُعيد فتح الصفحة.`);
  await sleep(1500);
  return ended ? 'ended' : 'stuck';
}
async function openVideo(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`https://www.youtube.com/watch?v=${id}`);
    await dismissConsent(page).catch(() => false);
    await page.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
    let ready = await waitForPlayer(page, id, 12000);
    if (!ready) {
      await page.eval(() => { const v = document.querySelector('#movie_player video.html5-main-video'); if (v) { v.muted = true; v.play().catch(() => {}); } });
      ready = await waitForPlayer(page, id, 25000);
    }
    if (await page.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
    await sleep(1500);
    isoId = page.isolatedContextId(extId);
    if (!isoId) throw new Error('لا سياق معزول للإضافة');
    if ((await settleAd(id)) !== 'stuck') return ready;
  }
  return null;
}

try {
  if (!T || !imp.ok) throw new Error('تجهيز الملف العيّنة لم يكتمل');
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  extId = ext.id;
  page = await openTab(b.conn, 'about:blank');
  const errs = collectErrors(page, { extId, onlyExtension: true });
  const net = [];
  page.on('Network.requestWillBeSent', (e) => { if (String(e.initiator?.url ?? '').startsWith(`chrome-extension://${extId}`)) net.push(1); });
  await page.send('Network.enable');

  const ready = await openVideo(VIDEO);
  check('player-ready', !!ready, ready ? { duration: ready.duration ?? null } : null);
  await iso(P.seed, seedRecord);
  const loaded = await iso(P.load, { fileName: imp.fileName, cues: imp.cues, comparison: imp.comparison, fingerprintId: imp.fingerprintId, notes: imp.notes });
  await sleep(500);
  const st = await iso(P.state);
  check('srt-file-loaded-through-controller', st.overlay === 'mounted' && st.videoId === VIDEO && loaded.arabic === imp.cues.length
    && loaded.fingerprintId === fp.id && loaded.matched === true && loaded.fileName === AR_NAME && loaded.mode === 'ar', { ...loaded, overlay: st.overlay, fingerprintIsExport: loaded.fingerprintId === fp.id });

  // ===== ملف SRT فوق الفيديو: المقطع الظاهر هو مقطع الملف لزمن الفيديو، داخل #movie_player =====
  await seekTo(T.view);
  const m0 = await page.eval(P.main);
  const p0 = await iso(P.peek);
  check('file-cue-shown-at-its-time', m0.hostInPlayer && !p0.hidden && same(p0.lines.map((l) => l.text), expectedAt(T.view)) && p0.lines.every((l) => l.kind === 'ar' && l.dir === 'rtl'),
    { t: m0.currentTime, shown: p0.lines.length, expected: expectedAt(T.view).length, dirs: p0.lines.map((l) => l.dir) });
  await shoot('w3-normal');

  // ===== القفز للأمام والخلف =====
  await seekTo(T.jump);
  const j = await shownText();
  await seekTo(T.back);
  const k = await shownText();
  check('seek-forward-and-back', j.length > 0 && k.length > 0 && same(j, expectedAt(T.jump)) && same(k, expectedAt(T.back)) && !same(j, k), { jumpTo: T.jump, jumpOk: same(j, expectedAt(T.jump)), backTo: T.back, backOk: same(k, expectedAt(T.back)) });
  const sync = await iso(P.sample, 6000, imp.cues);
  check('sync-while-playing-1x', sync.frames > 100 && sync.advancedSec > 3 && (sync.bad === 0 || sync.maxRun <= 1), sync);

  // ===== ملء الشاشة =====
  await page.key('f', 'KeyF', 70);
  await seekTo(T.view);
  await sleep(600);
  const fm = await page.eval(P.main);
  const fpk = await iso(P.peek);
  const inside = !!fm.player && fpk.stage.top >= fm.player.top - 2 && fpk.stage.bottom <= fm.player.bottom + 2;
  check('visible-fullscreen', (fm.fsId !== null || fm.classes.includes('ytp-fullscreen')) && !fpk.hidden && inside && fpk.host.width > 0 && same(fpk.lines.map((l) => l.text), expectedAt(T.view)),
    { fullscreenElement: fm.fsId, classes: fm.classes, player: fm.player, inside, shown: fpk.lines.length });
  await shoot('w3-fullscreen');
  await page.key('f', 'KeyF', 70);
  await sleep(900);
  const back = await page.eval(P.main);
  check('back-from-fullscreen', back.hostInPlayer && back.fsId === null, { fsId: back.fsId });

  // ===== تنقل واحد إلى فيديو مقترح بلا ترجمة محفوظة =====
  const rel = (await relatedIds(page)).filter((id) => id !== VIDEO).slice(0, 3);
  if (!rel.length) check('navigation', false, { reason: 'لا مقترحات' });
  else {
    await seekTo(T.view);
    const pre = await shownText();
    const tracking = iso(P.trackNav, 12000);
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
    const urlAt = target ? nav.rows.find((r) => r.url === target)?.at ?? null : null;
    const staleAfterStart = nav.rows.filter((r) => nav.startAt !== null && r.at >= nav.startAt + 60 && r.text.includes('ترجمة المقطع'));
    const staleAfterUrl = nav.rows.filter((r) => urlAt !== null && r.at >= urlAt && r.text.includes('ترجمة المقطع'));
    check('navigation-clears-overlay', !!target && pre.length > 0 && nav.startAt !== null && staleAfterStart.length === 0 && staleAfterUrl.length === 0,
      { target: !!target, preShown: pre.length, navStartAtMs: nav.startAt, urlChangedAtMs: urlAt, staleAfterStart: staleAfterStart.length, staleAfterUrl: staleAfterUrl.length });
    await sleep(2500);
    const s2 = await iso(P.state);
    const after = await shownText();
    check('new-video-without-stale-translation', !!target && s2.videoId === target && s2.arabic === 0 && after.length === 0, { stateIsTarget: s2.videoId === target, arabic: s2.arabic, shown: after.length, overlay: s2.overlay });
    await shoot('w3-after-navigation');
  }

  await sleep(500);
  errs.stop();
  result.errors = errs.list;
  check('no-extension-errors', errs.list.length === 0, errs.list.slice(0, 5));
  check('no-network-from-extension', net.length === 0, { requests: net.length });
} catch (err) {
  check('run-aborted', false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
} finally {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'wave-smoke.json'), `${JSON.stringify(result, null, 2)}\n`);
  await b.close();
}
const failed = result.checks.filter((c) => !c.ok);
console.log(`\nالنتيجة: ${result.checks.length - failed.length}/${result.checks.length}`);
process.exit(failed.length ? 1 : 0);
