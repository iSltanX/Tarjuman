#!/usr/bin/env node
// قائمة فيديوهات الاختبار الثابتة (P9-AC2) وفحصها الدوري: يدوي، وتلقائي، وطويل، وبإعلان، وبلا ترجمة، وبث مسجّل. لكل
// فيديو التقاط حقيقي بلا التحاق (كما في cycle.mjs) ثم قراءة الحالة وقائمة التحميل، وللثلاثة الأولى تنزيل SRT ومقارنته
// بايتًا بالمرجع (عيّنتا P1 الحقيقيتان، وملف P1 للطويل). البث المسجّل يُختار حيًا من نتائج البحث (المعرّف وحده في الأدلة).
// يُشغَّل بعد cycle.mjs (فيديو TED له ترجمة عربية محفوظة، فيُرى إخفاؤها أثناء الإعلان) أو وحده في الفحص الدوري.
//   node test/e2e/live/list.mjs --browser brave [--only manual,asr,long,ad,nocap,live]
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createExtractor } from '../../../src/extract/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { dismissConsent, playerInfo, waitForPlayer } from '../../live/harness/youtube.mjs';
import { BROWSERS, Evidence, ROOT, WORK, attachTab, clip, connectBrowser, launchBrowser, loadState, openUnattached, saveState, sha16, sleep } from './lib.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const only = (val('only') || 'manual,asr,long,nocap,ad,live').split(',');

/** القائمة الثابتة. النوع المتوقع والمرجع لكل فيديو؛ والبث المسجّل يُختار حيًا لأن بثوث يوتيوب تُحذف أو تُخفى. */
export const FIXED_LIST = [
  { slot: 'manual', id: 'iG9CE55wbtY', what: 'يدوي — محاضرة TED (20 دقيقة)', kind: 'manual', ref: { fixture: 'manual-ted-iG9CE55wbtY.json', durationMs: 1203421 } },
  { slot: 'asr', id: 'Y9rkKtK1b44', what: 'تلقائي فقط — U.S. Naval War College (50 دقيقة)', kind: 'asr', ref: { fixture: 'asr-nwc-Y9rkKtK1b44.json', durationMs: 3600000 } },
  { slot: 'long', id: 'gBazR59SZXk', what: 'طويل يدوي (ساعة و51 دقيقة)', kind: 'manual', ref: { srt: 'docs/evidence/P1/srt/gBazR59SZXk.en.manual.srt' } },
  { slot: 'nocap', id: 'aqz-KE-bpKQ', what: 'بلا ترجمة — Big Buck Bunny', kind: null },
  { slot: 'ad', id: 'iG9CE55wbtY', what: 'بإعلان — يُعاد فتح فيديو TED حتى يظهر إعلان (Chrome؛ Brave يحجبه افتراضيًا)', kind: 'manual' },
  { slot: 'live', id: null, what: 'بث مسجّل — يُختار من نتائج بحث «Streamed»', kind: null },
];
const LIVE_QUERIES = ['press conference full livestream', 'live stream replay lecture english', 'nasa live briefing'];

const DL = path.join(WORK, browser, 'downloads-list');
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}&cc_load_policy=1&cc_lang_pref=en`;
const center = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });

let b;
let tab;
let isoId;
const iso = (fn, ...args) => tab.eval(fn, { contextId: isoId, args });
const main = (fn, ...args) => tab.eval(fn, { args });
const STATE = () => {
  const s = globalThis.__tarjuman.controller.getState();
  const d = globalThis.__tarjuman.extractor.diagnostics();
  return {
    videoId: s.videoId, issue: s.captureIssue?.code ?? null, arabic: !!s.arabic,
    captured: s.captured.map((t) => ({ key: t.key, ok: t.ok, cueCount: t.cueCount, completeness: t.completeness })),
    rejected: d.rejected, recent: d.recentRejections.map((r) => r.code),
  };
};
const PEEK = () => globalThis.__tarjuman.mounted.controls.peek();
const OV = () => globalThis.__tarjuman.mounted.overlay.peek(false);
const AD = () => { const p = document.querySelector('#movie_player'); return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')); };

async function bindIso() {
  for (let i = 0; i < 50; i++) {
    isoId = tab.isolatedContextId(b.extId);
    if (isoId) {
      try {
        if (await iso(() => !!globalThis.__tarjuman?.mounted)) return true;
      } catch {
        // السياق يتغير.
      }
    }
    await sleep(300);
  }
  return false;
}

async function open(id, waitMs = 22000) {
  if (tab) await tab.close();
  const targetId = await openUnattached(b.conn, watchUrl(id));
  await sleep(waitMs);
  tab = await attachTab(b.conn, targetId);
  if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE');
  await dismissConsent(tab).catch(() => false);
  await waitForPlayer(tab, id, 30000);
  if (!(await bindIso())) throw new Error('لا سياق معزول للإضافة');
  await sleep(600);
}

async function menuText() {
  await tab.eval(() => window.scrollTo(0, 0));
  const pc = await tab.centerOf('#movie_player', { scroll: false });
  await tab.mouseMove(pc.x, pc.y + 40);
  await sleep(300);
  const p = await iso(PEEK);
  const c = center(p.buttons.download.box);
  await tab.click(c.x, c.y);
  await sleep(500);
  return (await iso(PEEK)).layer.menu;
}

async function expectedFor(item) {
  if (item.ref?.srt) return { text: await readFile(path.join(ROOT, item.ref.srt), 'utf8'), name: `${item.id}.en.${item.kind}.normal.srt` };
  const body = await readFile(path.join(ROOT, 'test/fixtures/json3', item.ref.fixture), 'utf8');
  const ex = createExtractor({ currentVideoId: () => item.id, durationMs: () => item.ref.durationMs, isLive: () => false });
  ex.handleMessage({ source: 'tarjuman', v: 1, kind: 'timedtext', videoId: item.id, lang: 'en', trackKind: item.kind, kindParam: item.kind === 'asr' ? 'asr' : null, capsAsr: true, hasTlang: false, format: 'json3', hasPot: true, transport: 'xhr', status: 200, bodyLength: body.length, body, truncated: false });
  const conv = ex.convert(`en|${item.kind}`, { mode: 'normal' });
  const built = buildExport({ videoId: item.id, title: null, track: { key: `en|${item.kind}`, lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings }, mode: 'normal', now: Date.now() });
  return { text: built.files[0].text, name: built.files[0].name };
}

async function downloadNormal(name) {
  const before = (await readdir(DL).catch(() => [])).length;
  const p = await iso(PEEK);
  const normal = p.layer.menu?.items.find((x) => x.fid === 'mode:normal');
  if (normal) await tab.click(center(normal.box).x, center(normal.box).y);
  await sleep(300);
  const dl = (await iso(PEEK)).layer.menu?.items.find((x) => x.fid === 'download');
  await tab.click(center(dl.box).x, center(dl.box).y);
  for (let i = 0; i < 80; i++) {
    const names = await readdir(DL).catch(() => []);
    if (names.length > before && names.includes(name)) return readFile(path.join(DL, name), 'utf8');
    await sleep(250);
  }
  return null;
}

const results = [];
const ev = new Evidence(path.join(ROOT, 'docs/evidence/P9', browser), 'list', { step: 'fixed-list' });
const state = await loadState(browser);
try {
  b = state.running ? await connectBrowser(browser).catch(() => null) : null;
  if (!b) b = await launchBrowser(browser);
  state.running = true;
  ev.data.browser = `${BROWSERS[browser].name} (${b.version.product})`;
  await b.conn.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });

  for (const item of FIXED_LIST.filter((x) => only.includes(x.slot))) {
    const r = { slot: item.slot, what: item.what, id: item.id, result: null };
    try {
      if (item.slot === 'nocap') {
        await open(item.id, 15000);
        const st = await iso(STATE);
        const menu = await menuText();
        r.result = { captured: st.captured.length, issue: st.issue, menu: clip(menu?.text, 120) };
        ev.check(`list-${item.slot}`, st.captured.length === 0 && /فعّل الترجمة/.test(menu?.text ?? ''), r.result);
      } else if (item.slot === 'ad') {
        let seen = null;
        for (let i = 0; i < 4 && !seen; i++) {
          await open(item.id, 3000);
          for (let k = 0; k < 20 && !seen; k++) {
            if (await main(AD)) seen = { attempt: i + 1, overlay: await iso(OV), state: await iso(STATE) };
            else await sleep(500);
          }
        }
        if (!seen) {
          r.result = { adSeen: false };
          ev.note(`${item.slot}: لم يظهر إعلان في أربع محاولات${browser === 'brave' ? ' (Shields يحجب الإعلانات افتراضيًا)' : ''}؛ مسجّل «لم يُصادف» لا نجاحًا ولا فشلًا.`);
        } else {
          const after = await tab.waitFor(() => { const p = document.querySelector('#movie_player'); return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting'); }, { timeoutMs: 150000, intervalMs: 1000 });
          await sleep(1500);
          const st = await iso(STATE);
          r.result = { adSeen: true, attempt: seen.attempt, overlayHiddenDuringAd: seen.overlay.hidden, arabicLoaded: seen.state.arabic, adEnded: !!after, rejectedDuringAd: seen.state.recent, capturedAfter: st.captured.map((t) => t.key) };
          ev.check(`list-${item.slot}`, (!seen.state.arabic || seen.overlay.hidden === true) && !!after && !st.captured.some((t) => !t.ok), r.result);
        }
      } else if (item.slot === 'live') {
        let found = null;
        for (const q of LIVE_QUERIES) {
          if (found) break;
          if (tab) await tab.close();
          tab = await attachTab(b.conn, await openUnattached(b.conn, `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`));
          await sleep(5000);
          const ids = await main(() => [...document.querySelectorAll('ytd-video-renderer')]
            .filter((v) => /streamed/i.test(v.querySelector('#metadata-line')?.textContent ?? ''))
            .map((v) => new URLSearchParams((v.querySelector('a#thumbnail')?.getAttribute('href') ?? '').split('?')[1] ?? '').get('v'))
            .filter((x) => x && /^[A-Za-z0-9_-]{11}$/.test(x)).slice(0, 4));
          for (const id of ids) {
            await open(id, 22000);
            const pi = await playerInfo(tab);
            const st = await iso(STATE);
            const en = pi.tracks.filter((t) => t.lang?.startsWith('en'));
            if (pi.isLiveContent && !pi.isLive && en.length) {
              found = { id, lengthSec: pi.lengthSeconds, tracks: en.map((t) => t.kind), captured: st.captured.map((t) => ({ key: t.key, ok: t.ok, cueCount: t.cueCount })), issue: st.issue };
              break;
            }
          }
        }
        r.id = found?.id ?? null;
        r.result = found;
        ev.check(`list-${item.slot}`, !!found && found.captured.some((t) => t.ok), found ?? { found: false });
      } else {
        await open(item.id);
        const st = await iso(STATE);
        const tr = st.captured.find((t) => t.key === `en|${item.kind}`);
        const menu = await menuText();
        const exp = await expectedFor(item);
        const got = tr?.ok ? await downloadNormal(exp.name) : null;
        r.result = { captured: tr ?? null, issue: st.issue, menuLabelOk: /English – (يدوي|تلقائي)، [0-9,]+ مقطعًا/.test(menu?.text ?? ''), bytes: got && Buffer.byteLength(got), expected: Buffer.byteLength(exp.text), sha: got && sha16(got), cues: got ? parseSrtStrict(got).length : null };
        ev.check(`list-${item.slot}`, !!tr?.ok && got === exp.text && r.result.menuLabelOk, r.result);
      }
    } catch (err) {
      r.result = { error: clip(err.message, 200) };
      ev.check(`list-${item.slot}`, false, r.result);
      if (/BOT_CHALLENGE/.test(err.message)) break;
    }
    results.push(r);
  }
} catch (err) {
  ev.check('run-aborted', false, { error: clip(err.message ?? err, 300) });
} finally {
  ev.data.list = results;
  await saveState(browser, state);
  await ev.write();
  b?.conn.close();
}
process.exit(ev.failed.length ? 1 : 0);
