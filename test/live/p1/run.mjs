#!/usr/bin/env node
// سيناريوهات P1 الحية. التشغيل:
//   node test/live/p1/run.mjs --browser brave --manual <ID> --asr <ID> --nocap <ID> [--steps a,b,…] [--seed N]
//   node test/live/p1/run.mjs --browser brave --inspect <ID,ID,…>        (اختيار الفيديوهات: المسارات المتاحة فقط)
//   node test/live/p1/run.mjs --browser brave --search "<عبارة>" [--cc]   (معرّفات نتائج البحث)
// الخطوات الافتراضية بالترتيب: measure,load,capture,positions,special,nav,hover,ad,download,storage,experiments
// النتائج منقّاة في test-results/live/P1/runs/، ولا يُكتب ملف فيه أي رابط أو رمز (يُفحص قبل الكتابة).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, loadExtension, Page, sleep, human } from '../harness/browser.mjs';
import { recordNetwork, sha256 } from '../harness/netlog.mjs';
import {
  waitForPlayer, playerInfo, clickCC, ccPressed, ensureCC, seekAndRead, relatedIds, clickRelated,
  currentUrlVideoId, dismissConsent, revealControls, toggleCC, pressCaptionKey,
} from '../harness/youtube.mjs';
import { randomPositions, judgePosition } from '../../helpers/positions.mjs';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { findSecrets, sanitizeDeep } from '../../../src/core/diagnostics/sanitize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EVIDENCE = path.join(ROOT, 'test-results/live/P1');
const DIST = path.join(ROOT, 'dist');
const ALL_STEPS = ['measure', 'load', 'capture', 'positions', 'special', 'nav', 'hover', 'ad', 'download', 'storage', 'experiments'];

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      o[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return o;
}

const opts = args(process.argv.slice(2));
const browser = opts.browser;
if (!['brave', 'chrome'].includes(browser)) {
  console.error('حدّد --browser brave أو chrome');
  process.exit(2);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${a.join(' ')}`);
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

/** يكتب JSON منقّى بعد التأكد من خلوه من الأسرار. */
async function writeEvidence(rel, data) {
  const clean = sanitizeDeep(data);
  const text = `${JSON.stringify(clean, null, 2)}\n`;
  const leaks = findSecrets(text);
  if (leaks.length) throw new Error(`رُفضت كتابة ${rel}: ${leaks.length} اكتشاف (${leaks.slice(0, 3).map((l) => l.type).join('، ')})`);
  const file = path.join(EVIDENCE, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  return path.relative(ROOT, file);
}

async function writeText(rel, text) {
  const leaks = findSecrets(text);
  if (leaks.length) throw new Error(`رُفضت كتابة ${rel}: ${leaks.length} اكتشاف`);
  const file = path.join(ROOT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  return rel;
}

async function botCheck(page) {
  return page.eval(() => /confirm you.re not a bot|unusual traffic|sign in to confirm/i.test(document.body?.innerText || ''));
}

async function muteAll(page) {
  await page.eval(() => {
    for (const v of document.querySelectorAll('video')) v.muted = true;
  }).catch(() => {});
}

async function openWatch(page, id) {
  await page.goto(watchUrl(id));
  await dismissConsent(page).catch(() => false);
  const ready = await waitForPlayer(page, id);
  await muteAll(page);
  if (await botCheck(page)) throw new Error('BOT_CHALLENGE: ظهر تحدي «لست روبوتًا» — توقف دون تحايل');
  return ready;
}

async function waitAdEnd(page, maxMs = 90000) {
  const end = Date.now() + maxMs;
  let sawAd = false;
  while (Date.now() < end) {
    const ad = await page.eval(() => document.querySelector('#movie_player')?.classList.contains('ad-showing'));
    if (!ad) return sawAd;
    sawAd = true;
    await sleep(1000);
  }
  return sawAd;
}

async function snapshot(page, extId, includeBody = false) {
  const ctx = page.isolatedContextId(extId);
  if (!ctx) return null;
  return page.eval(`globalThis.__tarjumanPoc ? globalThis.__tarjumanPoc.snapshot({ includeBody: ${includeBody} }) : null`, { contextId: ctx });
}

function summarizeSnapshot(s) {
  if (!s) return null;
  return {
    currentVideoId: s.currentVideoId, durationMs: s.durationMs, navigations: s.navigations,
    accepted: s.accepted.map((a) => ({
      videoId: a.videoId, lang: a.lang, trackKind: a.trackKind, format: a.format, transport: a.transport,
      bodyLength: a.bodyLength, acceptedFor: a.acceptedFor, meta: a.meta, ok: a.ok, code: a.code,
      invariants: a.invariants && a.invariants.map((r) => ({ id: r.id, key: r.key, ok: r.ok, detail: r.detail })),
      warnings: a.warnings.map((w) => w.code), report: a.report,
    })),
    rejected: s.rejected.map((r) => ({ code: r.code, detail: r.detail, videoId: r.videoId, lang: r.lang, trackKind: r.trackKind, hasTlang: r.hasTlang, format: r.format, bodyLength: r.bodyLength, status: r.status, currentVideoId: r.currentVideoId })),
  };
}

// ——— الخطوات ———

async function stepMeasure(ctx) {
  const out = [];
  for (const [label, id] of [['manual', ctx.ids.manual], ['asr', ctx.ids.asr]]) {
    if (!id) continue;
    const page = ctx.page;
    const net = recordNetwork(page);
    await page.send('Network.enable');
    await openWatch(page, id);
    await waitAdEnd(page);
    const info = await playerInfo(page);
    await sleep(3000);
    const beforeClick = net.timedtext().length;
    const ccBefore = await ccPressed(page);
    const r1 = await ensureCC(page, true);
    await sleep(4000);
    const afterOn = net.timedtext().length;
    // إيقاف ثم تشغيل: هل يُعاد الطلب أم يؤخذ من الذاكرة؟
    await toggleCC(page);
    await sleep(4000);
    const afterToggle = net.timedtext().length;
    const shot = await page.screenshot(path.join(EVIDENCE, `screenshots/${browser}-measure-${label}.png`));
    out.push({
      label, videoId: id, info: { title: info.title, author: info.author, lengthSeconds: info.lengthSeconds, tracks: info.tracks },
      ccWasOnBeforeClick: ccBefore, ensureCC: r1, requestsBeforeClick: beforeClick, requestsAfterOn: afterOn,
      requestsAfterToggle: afterToggle, toggleReRequested: afterToggle > afterOn,
      timedtext: net.timedtext(), stats: net.stats(), screenshot: path.relative(ROOT, shot),
    });
    net.stop();
    await page.send('Network.disable');
    log(`قياس ${label}: ${afterOn - beforeClick} طلب بعد CC، وإعادة بعد الإيقاف/التشغيل: ${afterToggle > afterOn}`);
  }
  return out;
}

async function stepLoad(ctx) {
  const r = await loadExtension(ctx.conn, DIST);
  if (r.error) {
    log(`تعذّر Extensions.loadUnpacked: ${r.error}`);
    return { method: null, error: r.error };
  }
  ctx.extId = r.id;
  log(`حُمّلت الإضافة ${r.id} بـ${r.method}`);
  return r;
}

async function captureOne(ctx, label, id) {
  const page = ctx.page;
  const net = recordNetwork(page);
  await page.send('Network.enable');
  await openWatch(page, id);
  const sawAd = await waitAdEnd(page);
  const info = await playerInfo(page);
  await sleep(1500);
  const cc = await ensureCC(page, true);
  let snap = null;
  for (let i = 0; i < 40; i++) {
    snap = await snapshot(page, ctx.extId, true);
    if (snap && snap.accepted.some((a) => a.videoId === id)) break;
    await sleep(500);
  }
  await sleep(1500);
  snap = await snapshot(page, ctx.extId, true);
  const shot = await page.screenshot(path.join(EVIDENCE, `screenshots/${browser}-capture-${label}.png`));
  const tt = net.timedtext();
  net.stop();
  await page.send('Network.disable');
  const acc = snap?.accepted.find((a) => a.videoId === id) || null;
  const result = {
    label, videoId: id, sawAd, ensureCC: cc,
    info: { title: info.title, author: info.author, lengthSeconds: info.lengthSeconds, duration: info.duration, tracks: info.tracks },
    timedtext: tt, snapshot: summarizeSnapshot(snap), extensionNetwork: null,
  };
  if (acc) {
    const bodyHash = sha256(acc.body);
    result.capturedBodySha256 = bodyHash;
    result.bodyMatchesNetwork = tt.some((r) => r.bodySha256 === bodyHash);
    if (acc.srt) {
      result.srtFile = await writeText(`test-results/live/P1/srt/${browser}-${id}.${acc.trackKind}.srt`, acc.srt);
      ctx.srt[id] = { srt: acc.srt, kind: acc.trackKind };
    }
    ctx.bodies[id] = { body: acc.body, kind: acc.trackKind, lang: acc.lang };
  }
  result.screenshot = path.relative(ROOT, shot);
  log(`التقاط ${label} (${id}): ${acc ? `مقبول ${acc.trackKind} · ثوابت ${acc.ok ? 'ناجحة' : `فاشلة ${acc.code}`}` : 'لا التقاط مقبول'}`);
  return result;
}

async function stepCapture(ctx) {
  const out = [];
  for (const label of ['manual', 'asr', 'long']) {
    if (ctx.ids[label]) out.push(await captureOne(ctx, label, ctx.ids[label]));
  }
  return out;
}

async function stepPositions(ctx) {
  const out = [];
  for (const label of ['manual', 'asr']) {
    const id = ctx.ids[label];
    const saved = ctx.srt[id];
    if (!id || !saved) {
      out.push({ label, videoId: id, skipped: 'لا SRT ملتقط' });
      continue;
    }
    const page = ctx.page;
    if ((await currentUrlVideoId(page)) !== id) await openWatch(page, id);
    await waitAdEnd(page);
    await ensureCC(page, true);
    const info = await playerInfo(page);
    const cues = parseSrtStrict(saved.srt);
    const seed = Number(opts.seed) || 20261101;
    const times = randomPositions(info.duration, seed + (label === 'asr' ? 1 : 0));
    const checks = [];
    for (const t of times) {
      const r = await seekAndRead(page, t);
      checks.push({ ...judgePosition(cues, saved.kind, r.actual, r.text), requested: t });
      await human(300, 700);
    }
    await page.screenshot(path.join(EVIDENCE, `screenshots/${browser}-positions-${label}.png`));
    const lastEnd = cues[cues.length - 1].endMs;
    const res = {
      label, videoId: id, kind: saved.kind, seed, durationSec: info.duration, lastEndMs: lastEnd,
      completeness: Math.round((lastEnd / (info.duration * 1000)) * 1000) / 1000,
      matched: checks.filter((c) => c.match).length, total: checks.length, checks,
    };
    log(`مواضع ${label}: ${res.matched}/${res.total} · اكتمال ${res.completeness}`);
    out.push(res);
  }
  return out;
}

async function openSettingsPath(page, labels) {
  await revealControls(page);
  const gear = await page.centerOf('#movie_player .ytp-settings-button', { scroll: false });
  if (!gear) return 'لا زر إعدادات';
  await page.click(gear.x, gear.y);
  await human(500, 800);
  for (const label of labels) {
    const pos = await page.eval((text) => {
      const items = [...document.querySelectorAll('#movie_player .ytp-settings-menu .ytp-menuitem, #movie_player .ytp-settings-menu .ytp-menuitem-label')];
      const el = items.find((e) => (e.textContent || '').trim().toLowerCase().startsWith(text.toLowerCase()));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    }, { args: [label] });
    if (!pos) return `لا عنصر «${label}»`;
    await page.click(pos.x, pos.y);
    await human(500, 900);
  }
  return 'ok';
}

async function stepSpecial(ctx) {
  const page = ctx.page;
  const out = {};
  // فيديو بلا ترجمة.
  if (ctx.ids.nocap) {
    const net = recordNetwork(page);
    await page.send('Network.enable');
    await openWatch(page, ctx.ids.nocap);
    await waitAdEnd(page);
    const info = await playerInfo(page);
    const clicked = info.ccButton?.visible ? await ensureCC(page, true) : false;
    await sleep(4000);
    const snap = await snapshot(page, ctx.extId);
    out.noCaptions = { videoId: ctx.ids.nocap, tracks: info.tracks, ccButton: info.ccButton, clicked, timedtext: net.timedtext(), snapshot: summarizeSnapshot(snap) };
    await page.screenshot(path.join(EVIDENCE, `screenshots/${browser}-special-nocap.png`));
    net.stop();
    await page.send('Network.disable');
    log(`بلا ترجمة: ${out.noCaptions.timedtext.length} طلب، ${snap?.accepted.length ?? '؟'} مقبول`);
  }
  // مسار مترجم آليًا (tlang): الترجمة التلقائية إلى العربية من قائمة المشغّل.
  if (ctx.ids.manual) {
    const net = recordNetwork(page);
    await page.send('Network.enable');
    await openWatch(page, ctx.ids.manual);
    await waitAdEnd(page);
    await ensureCC(page, true);
    await sleep(2500);
    const path1 = await openSettingsPath(page, ['Subtitles', 'Auto-translate', 'Arabic']);
    await sleep(4000);
    const snap = await snapshot(page, ctx.extId);
    await page.screenshot(path.join(EVIDENCE, `screenshots/${browser}-special-tlang.png`));
    // إعادة English الأصلية.
    const path2 = await openSettingsPath(page, ['Subtitles', 'English']);
    await sleep(2500);
    await page.key('Escape', 'Escape', 27);
    out.tlang = { videoId: ctx.ids.manual, menu: path1, restore: path2, timedtext: net.timedtext(), snapshot: summarizeSnapshot(snap) };
    net.stop();
    await page.send('Network.disable');
    const rej = snap?.rejected.filter((r) => r.code === 'EX_TRANSLATED_TRACK').length ?? 0;
    log(`tlang: القائمة ${path1} · مرفوض EX_TRANSLATED_TRACK: ${rej}`);
  }
  return out;
}

async function stepNav(ctx) {
  const page = ctx.page;
  const start = ctx.ids.manual;
  const net = recordNetwork(page);
  await page.send('Network.enable');
  await openWatch(page, start);
  await waitAdEnd(page);
  await ensureCC(page, true);
  await sleep(3000);
  const visited = new Set([start]);
  const steps = [];
  let wrong = 0;
  for (let i = 1; i <= 10; i++) {
    const from = await currentUrlVideoId(page);
    const candidates = (await relatedIds(page)).filter((x) => !visited.has(x));
    if (candidates.length === 0) {
      steps.push({ i, from, error: 'لا مقترحات' });
      break;
    }
    const to = candidates[0];
    visited.add(to);
    const clicked = await clickRelated(page, to);
    const arrived = await page.waitFor((id) => new URLSearchParams(location.search).get('v') === id, { args: [to], timeoutMs: 15000 });
    await muteAll(page);
    const sawAd = await waitAdEnd(page, 60000);
    await sleep(6000);
    const info = await playerInfo(page);
    const snap = await snapshot(page, ctx.extId);
    const urlId = await currentUrlVideoId(page);
    const wrongHere = (snap?.accepted || []).filter((a) => a.videoId !== urlId || a.acceptedFor !== a.videoId);
    wrong += wrongHere.length;
    let spot = null;
    const acc = snap?.accepted.find((a) => a.videoId === urlId && a.ok && a.srt);
    if (acc) {
      const r = await seekAndRead(page, Math.max(5, info.duration * 0.3));
      spot = judgePosition(parseSrtStrict(acc.srt), acc.trackKind, r.actual, r.text);
      await page.eval(() => document.querySelector('#movie_player video.html5-main-video').play().catch(() => {}));
    }
    steps.push({
      i, from, to, clicked, arrived: !!arrived, urlId, sawAd, hasTracks: info.tracks.map((t) => `${t.lang}:${t.kind}`), ccPressed: info.ccButton?.pressed,
      accepted: (snap?.accepted || []).map((a) => ({ videoId: a.videoId, trackKind: a.trackKind, ok: a.ok })),
      rejectedSoFar: (snap?.rejected || []).map((r) => r.code), wrongAccepted: wrongHere.length, spotCheck: spot,
    });
    log(`تنقل ${i}: ${from} ← ${to} · وصل ${!!arrived} · مقبول ${(snap?.accepted || []).length} · خاطئ ${wrongHere.length}`);
    await human(800, 1600);
  }
  await page.screenshot(path.join(EVIDENCE, `screenshots/${browser}-nav-final.png`));
  const res = { steps, wrongAcceptedTotal: wrong, timedtext: net.timedtext(), stats: net.stats() };
  net.stop();
  await page.send('Network.disable');
  return res;
}

async function hoverThumbs(page, selector, count) {
  const done = [];
  for (let i = 0; i < count; i++) {
    const c = await page.eval((sel, idx) => {
      const el = document.querySelectorAll(sel)[idx];
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const a = el.closest('a') || el.querySelector('a');
      const href = a?.getAttribute('href') || '';
      const id = href.includes('v=') ? new URLSearchParams(href.split('?')[1]).get('v') : null;
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), id };
    }, { args: [selector, i] });
    if (!c) break;
    await sleep(500);
    await page.mouseMove(c.x, c.y, 12);
    await sleep(4500);
    const preview = await page.eval(() => {
      const p = document.querySelector('#inline-preview-player, ytd-video-preview');
      const v = p?.querySelector('video');
      return { present: !!p, playing: !!v && !v.paused, captions: !!document.querySelector('#inline-preview-player .ytp-caption-segment') };
    });
    done.push({ i, id: c.id, preview });
  }
  return done;
}

async function stepHover(ctx) {
  const page = ctx.page;
  const out = {};
  const net = recordNetwork(page);
  await page.send('Network.enable');
  await page.goto('https://www.youtube.com/results?search_query=ted+talk+english+subtitles');
  await dismissConsent(page).catch(() => false);
  await sleep(3000);
  out.search = await hoverThumbs(page, 'ytd-video-renderer ytd-thumbnail, ytd-video-renderer a#thumbnail', 6);
  out.searchSnapshot = summarizeSnapshot(await snapshot(page, ctx.extId));
  await page.screenshot(path.join(EVIDENCE, `screenshots/${browser}-hover-search.png`));
  // صفحة مشاهدة: تمرير فوق المقترحات أثناء عرض فيديو بترجمة ملتقطة.
  await openWatch(page, ctx.ids.manual);
  await waitAdEnd(page);
  await ensureCC(page, true);
  await sleep(4000);
  out.watch = await hoverThumbs(page, '#secondary a[href^="/watch?v="]', 5);
  out.watchSnapshot = summarizeSnapshot(await snapshot(page, ctx.extId));
  out.timedtext = net.timedtext();
  const acceptedOther = [out.searchSnapshot, out.watchSnapshot].flatMap((s) => s?.accepted || []).filter((a) => a.videoId !== ctx.ids.manual);
  out.acceptedFromHover = acceptedOther.length;
  net.stop();
  await page.send('Network.disable');
  log(`تمرير: ${out.timedtext.length} طلب timedtext، مقبول من المعاينات ${out.acceptedFromHover}`);
  return out;
}

async function stepAd(ctx) {
  const page = ctx.page;
  const ids = String(opts.ads || '').split(',').filter(Boolean);
  const tries = [];
  for (const id of ids) {
    const net = recordNetwork(page);
    await page.send('Network.enable');
    await page.goto(watchUrl(id));
    await dismissConsent(page).catch(() => false);
    await sleep(2500);
    await muteAll(page);
    const ad = await page.eval(() => document.querySelector('#movie_player')?.classList.contains('ad-showing'));
    let duringAd = null;
    if (ad) {
      await ensureCC(page, true);
      await sleep(4000);
      await page.screenshot(path.join(EVIDENCE, `screenshots/${browser}-ad-${id}.png`));
      duringAd = summarizeSnapshot(await snapshot(page, ctx.extId));
      await waitAdEnd(page);
      await sleep(4000);
    }
    const after = summarizeSnapshot(await snapshot(page, ctx.extId));
    tries.push({ videoId: id, adShown: !!ad, duringAd, after, timedtext: net.timedtext() });
    net.stop();
    await page.send('Network.disable');
    log(`إعلان ${id}: ${ad ? 'ظهر' : 'لم يظهر'}`);
    if (ad) break;
    await human(1500, 3000);
  }
  return { tries };
}

async function stepDownload(ctx) {
  const id = ctx.ids.manual;
  if (!ctx.srt[id]) return { skipped: 'لا SRT' };
  const page = ctx.page;
  if ((await currentUrlVideoId(page)) !== id) {
    await openWatch(page, id);
    await ensureCC(page, true);
    await sleep(5000);
  }
  const dir = path.join(EVIDENCE, 'srt/downloads');
  await mkdir(dir, { recursive: true });
  await ctx.conn.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
  const poc = await Page.open(ctx.conn, `chrome-extension://${ctx.extId}/pages/poc/index.html`);
  await sleep(2500);
  const done = ctx.conn.waitFor('Browser.downloadProgress', (p) => p.state === 'completed' || p.state === 'canceled', { timeoutMs: 20000 }).catch((e) => ({ state: e.message }));
  const begin = ctx.conn.waitFor('Browser.downloadWillBegin', () => true, { timeoutMs: 20000 }).catch(() => null);
  const btn = await poc.centerOf('[data-testid="download"]');
  if (btn) await poc.click(btn.x, btn.y);
  const b = await begin;
  const p = await done;
  await poc.screenshot(path.join(EVIDENCE, `screenshots/${browser}-poc-page.png`));
  let identical = null;
  let file = null;
  if (b && p.state === 'completed') {
    file = path.join(dir, b.suggestedFilename);
    try {
      identical = (await readFile(file, 'utf8')) === ctx.srt[id].srt;
    } catch {
      identical = false;
    }
  }
  await poc.close();
  log(`تنزيل Blob: ${p.state} · مطابق ${identical}`);
  return { button: !!btn, state: p.state, suggestedFilename: b?.suggestedFilename || null, identical, file: file && path.relative(ROOT, file) };
}

async function stepStorage(ctx) {
  const poc = await Page.open(ctx.conn, `chrome-extension://${ctx.extId}/pages/poc/index.html`);
  await sleep(1500);
  const r = await poc.eval(async () => ({
    local: await chrome.storage.local.get(null),
    session: await chrome.storage.session.get(null),
  }));
  await poc.close();
  const text = JSON.stringify(r);
  return { localKeys: Object.keys(r.local), sessionKeys: Object.keys(r.session), bytes: text.length, secrets: findSecrets(text).length };
}

async function stepExperiments(ctx) {
  const page = ctx.page;
  const out = {};
  // (أ) الجلب المباشر لـbaseUrl: تجربة قياس فقط، تُسجَّل الحالة والطول، ولا يُحفظ الرابط.
  await openWatch(page, ctx.ids.manual);
  await waitAdEnd(page);
  out.baseUrl = await page.eval(async () => {
    const p = document.querySelector('#movie_player');
    const tracks = p?.getPlayerResponse?.()?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const t = tracks.find((x) => x.languageCode === 'en') || tracks[0];
    if (!t) return { error: 'لا مسارات' };
    const res = [];
    for (const suffix of ['', '&fmt=json3']) {
      try {
        const r = await fetch(t.baseUrl + suffix, { credentials: 'include' });
        const body = await r.text();
        res.push({ fmt: suffix ? 'json3' : 'default', status: r.status, length: body.length, hasPotInBaseUrl: /[?&]pot=/.test(t.baseUrl) });
      } catch (e) {
        res.push({ fmt: suffix ? 'json3' : 'default', error: String(e.message).slice(0, 60) });
      }
    }
    return { kind: t.kind || 'manual', results: res };
  });
  log(`baseUrl: ${JSON.stringify(out.baseUrl.results || out.baseUrl)}`);
  // (ب) لوحة «إظهار النص»: البنية والعدد ودقة التوقيت فقط.
  const expand = await page.centerOf('ytd-watch-metadata #description-inline-expander #expand, ytd-text-inline-expander #expand');
  if (expand) {
    await page.click(expand.x, expand.y);
    await human(800, 1200);
  }
  const tbtn = await page.eval(() => {
    const b = [...document.querySelectorAll('ytd-video-description-transcript-section-renderer button, button')].find((x) => /show transcript/i.test(x.textContent || x.getAttribute('aria-label') || ''));
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  if (tbtn) {
    await page.click(tbtn.x, tbtn.y);
    await sleep(4000);
  }
  out.transcriptPanel = await page.eval(() => {
    const oldSegs = document.querySelectorAll('ytd-transcript-segment-renderer');
    const newSegs = document.querySelectorAll('transcript-segment-view-model');
    const segs = newSegs.length ? newSegs : oldSegs;
    const stamps = [...segs].slice(0, 5).map((s) => (s.querySelector('.segment-timestamp, [class*="timestamp"]')?.textContent || '').trim());
    return { opened: segs.length > 0, element: newSegs.length ? 'transcript-segment-view-model' : oldSegs.length ? 'ytd-transcript-segment-renderer' : null, count: segs.length, sampleTimestamps: stamps };
  });
  await page.screenshot(path.join(EVIDENCE, `screenshots/${browser}-exp-transcript.png`));
  log(`لوحة النص: ${JSON.stringify(out.transcriptPanel)}`);
  // (ج) «الضغط المساعد»: نقرة برمجية من العالم المعزول على زر CC الأصلي (غير موثوقة isTrusted=false).
  if (ctx.ids.asr) {
    const net = recordNetwork(page);
    await page.send('Network.enable');
    await openWatch(page, ctx.ids.asr);
    await waitAdEnd(page);
    if (await ccPressed(page)) {
      await pressCaptionKey(page);
      await sleep(1500);
      await page.reload();
      await waitForPlayer(page, ctx.ids.asr);
      await muteAll(page);
    }
    await sleep(2000);
    const before = net.timedtext().length;
    const wasOn = await ccPressed(page);
    const iso = page.isolatedContextId(ctx.extId);
    const clicked = await page.eval(() => {
      const b = document.querySelector('#movie_player .ytp-subtitles-button');
      if (!b) return false;
      b.click();
      return true;
    }, { contextId: iso });
    await sleep(4000);
    out.assistedClick = { wasOn, clicked, pressedAfter: await ccPressed(page), newRequests: net.timedtext().length - before };
    net.stop();
    await page.send('Network.disable');
    log(`الضغط المساعد: ${JSON.stringify(out.assistedClick)}`);
  }
  return out;
}

async function inspect(ctx, ids) {
  const out = [];
  for (const id of ids) {
    await openWatch(ctx.page, id);
    const i = await playerInfo(ctx.page);
    out.push({
      id, title: i.title, author: i.author, lengthSeconds: i.lengthSeconds, isLive: i.isLive,
      trackCount: i.tracks.length, english: i.tracks.filter((t) => /^en/.test(t.lang)),
    });
    console.log(JSON.stringify(out[out.length - 1]));
    await human(1500, 2500);
  }
  return out;
}

async function search(ctx, query, cc) {
  const sp = cc ? '&sp=EgIwAQ%253D%253D' : '';
  await ctx.page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${sp}`);
  await dismissConsent(ctx.page).catch(() => false);
  await sleep(3500);
  const r = await ctx.page.eval(() => [...document.querySelectorAll('ytd-video-renderer')].slice(0, 20).map((v) => {
    const a = v.querySelector('a#thumbnail');
    const id = a ? new URLSearchParams((a.getAttribute('href') || '').split('?')[1]).get('v') : null;
    return { id, title: v.querySelector('#video-title')?.textContent?.trim(), time: v.querySelector('badge-shape, ytd-thumbnail-overlay-time-status-renderer')?.textContent?.trim(), badges: [...v.querySelectorAll('.badge, ytd-badge-supported-renderer')].map((b) => b.textContent.trim()).filter(Boolean) };
  }));
  for (const x of r) console.log(JSON.stringify(x));
  return r;
}

// ——— التشغيل ———

const ctx = {
  ids: { manual: opts.manual, asr: opts.asr, nocap: opts.nocap, long: opts.long },
  srt: {}, bodies: {}, extId: opts.ext || null,
};
const steps = opts.steps ? String(opts.steps).split(',') : ALL_STEPS;
const results = { browser, startedAt: new Date().toISOString(), account: opts.account || 'غير مسجَّل', ids: ctx.ids, steps: {}, errors: [] };

const b = await launch({ browser, extensionPath: DIST, flagLoad: !!opts['flag-load'], headless: !!opts.headless });
ctx.conn = b.conn;
results.version = { product: b.version.product, protocol: b.version.protocolVersion };
log(`${browser}: ${b.version.product}`);
try {
  ctx.page = await Page.open(b.conn);
  results.navigatorWebdriver = await ctx.page.eval(() => navigator.webdriver);
  if (opts.inspect) {
    await inspect(ctx, String(opts.inspect).split(','));
  } else if (opts.search) {
    await search(ctx, String(opts.search), !!opts.cc);
  } else {
    for (const step of steps) {
      const fn = { measure: stepMeasure, load: stepLoad, capture: stepCapture, positions: stepPositions, special: stepSpecial, nav: stepNav, hover: stepHover, ad: stepAd, download: stepDownload, storage: stepStorage, experiments: stepExperiments }[step];
      if (!fn) continue;
      if (step !== 'measure' && step !== 'load' && !ctx.extId) {
        results.errors.push({ step, error: 'الإضافة غير محمّلة' });
        log(`تخطٍّ ${step}: الإضافة غير محمّلة`);
        continue;
      }
      log(`— ${step}`);
      try {
        results.steps[step] = await fn(ctx);
      } catch (err) {
        results.errors.push({ step, error: err.message.slice(0, 300) });
        log(`خطأ في ${step}: ${err.message}`);
        if (err.message.startsWith('BOT_CHALLENGE')) break;
      }
    }
    // العينات الخام تُحفظ مؤقتًا خارج المستودع، ويُقرَّر حفظها في test/fixtures بعد الفحص.
    if (opts['save-bodies'] && Object.keys(ctx.bodies).length) {
      const dir = String(opts['save-bodies']);
      await mkdir(dir, { recursive: true });
      for (const [id, v] of Object.entries(ctx.bodies)) {
        await writeFile(path.join(dir, `${browser}-${id}.${v.kind}.json`), v.body);
      }
      log(`حُفظت ${Object.keys(ctx.bodies).length} عينة خام في ${dir}`);
    }
  }
} finally {
  results.finishedAt = new Date().toISOString();
  if (!opts.inspect && !opts.search) {
    try {
      const rel = await writeEvidence(`runs/${browser}-${stamp}.json`, results);
      log(`النتائج: ${rel}`);
    } catch (err) {
      log(`تعذّرت كتابة النتائج: ${err.message}`);
      await writeFile(path.join(process.env.TMPDIR || '/tmp', `tj-p1-${browser}-${stamp}.json`), JSON.stringify(results));
    }
  }
  if (!opts['keep-open']) await b.close();
}
