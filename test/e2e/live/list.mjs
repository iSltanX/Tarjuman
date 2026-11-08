#!/usr/bin/env node
// قائمة فيديوهات الاختبار الثابتة (P9-AC2) وفحصها الدوري. أربعة بنود تحتاج جسم الترجمة فتُفحص في الجلسة اليدوية
// (hand.mjs: يدوي، وتلقائي، وطويل، وبث مسجّل؛ منفذ التصحيح يجعل webdriver=true فيعود الجسم فارغًا)، وبندان لا يحتاجانه
// فيُفحصان هنا في جلسة مؤتمتة: «بلا ترجمة» (لا التقاط ورسالة الإرشاد)، و«بإعلان» (إخفاء الترجمة العربية المحفوظة أثناء
// الإعلان ورفض ترجمته وعودتها بعده). يُشغَّل بعد cycle.mjs فلفيديو TED ترجمة عربية محفوظة.
//   node test/e2e/live/list.mjs --browser chrome [--only nocap,ad]
import path from 'node:path';
import { dismissConsent, waitForPlayer } from '../../live/harness/youtube.mjs';
import { BROWSERS, Evidence, ROOT, attachTab, clip, connectBrowser, launchBrowser, loadState, openUnattached, saveState, sleep } from './lib.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const only = (val('only') || 'nocap,ad').split(',');

/** القائمة الثابتة كاملة؛ how يقول أين يُفحص كل بند. */
export const FIXED_LIST = [
  { slot: 'manual', id: 'iG9CE55wbtY', how: 'hand', what: 'يدوي — محاضرة TED (20 دقيقة)' },
  { slot: 'asr', id: 'Y9rkKtK1b44', how: 'hand', what: 'تلقائي فقط — U.S. Naval War College (50 دقيقة)، مقاطع أطول' },
  { slot: 'long', id: 'gBazR59SZXk', how: 'hand', what: 'طويل يدوي (ساعة و51 دقيقة)' },
  { slot: 'live', id: null, how: 'hand', what: 'بث مسجّل — يُختار بـfind-live.mjs' },
  { slot: 'nocap', id: 'aqz-KE-bpKQ', how: 'auto', what: 'بلا ترجمة — Big Buck Bunny' },
  { slot: 'ad', id: 'iG9CE55wbtY', how: 'auto', what: 'بإعلان — يُعاد فتح فيديو TED حتى يظهر إعلان (Brave يحجبه افتراضيًا)' },
];

const center = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
let b;
let tab;
let isoId;
const iso = (fn, ...args) => tab.eval(fn, { contextId: isoId, args });
const main = (fn, ...args) => tab.eval(fn, { args });
const STATE = () => {
  const s = globalThis.__tarjuman.controller.getState();
  const d = globalThis.__tarjuman.extractor.diagnostics();
  return { videoId: s.videoId, arabic: !!s.arabic, captured: s.captured.map((t) => ({ key: t.key, ok: t.ok })), rejected: d.rejected };
};
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

async function open(id, waitMs) {
  if (tab) await tab.close();
  tab = await attachTab(b.conn, await openUnattached(b.conn, `https://www.youtube.com/watch?v=${id}&cc_load_policy=1&cc_lang_pref=en`));
  await sleep(waitMs);
  if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE');
  await dismissConsent(tab).catch(() => false);
  await waitForPlayer(tab, id, 30000);
  if (!(await bindIso())) throw new Error('لا سياق معزول للإضافة');
}

const ev = new Evidence(path.join(ROOT, 'test-results/live/P9', browser), 'list-auto', { step: 'fixed-list-auto' });
const state = await loadState(browser);
const results = [];
try {
  b = state.running ? await connectBrowser(browser).catch(() => null) : null;
  if (!b) b = await launchBrowser(browser);
  state.running = true;
  ev.data.browser = `${BROWSERS[browser].name} (${b.version.product})`;
  for (const item of FIXED_LIST.filter((x) => x.how === 'auto' && only.includes(x.slot))) {
    const r = { slot: item.slot, id: item.id, what: item.what };
    try {
      if (item.slot === 'nocap') {
        await open(item.id, 12000);
        await tab.eval(() => window.scrollTo(0, 0));
        const pc = await tab.centerOf('#movie_player', { scroll: false });
        await tab.mouseMove(pc.x, pc.y + 40);
        await sleep(300);
        const p = await iso(() => globalThis.__tarjuman.mounted.controls.peek());
        await tab.click(center(p.buttons.download.box).x, center(p.buttons.download.box).y);
        await sleep(600);
        const menu = (await iso(() => globalThis.__tarjuman.mounted.controls.peek())).layer.menu;
        const st = await iso(STATE);
        r.result = { captured: st.captured.length, menuGuides: /فعّل الترجمة \(CC\)/.test(menu?.text ?? '') };
        ev.check('list-nocap-no-capture-and-guidance', st.captured.length === 0 && r.result.menuGuides, r.result);
      } else if (item.slot === 'ad') {
        let seen = null;
        for (let i = 0; i < 5 && !seen; i++) {
          await open(item.id, 1500);
          for (let k = 0; k < 24 && !seen; k++) {
            if (await main(AD)) seen = { attempt: i + 1, overlay: await iso(OV), state: await iso(STATE) };
            else await sleep(500);
          }
        }
        if (!seen) {
          r.result = { adSeen: false };
          ev.note(`لم يظهر إعلان في خمس محاولات${browser === 'brave' ? ' (Shields يحجب الإعلانات افتراضيًا)' : ''}: «لم يُصادف»، لا نجاح ولا فشل.`);
        } else {
          const ended = await tab.waitFor(() => {
            const p = document.querySelector('#movie_player');
            const skip = p?.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
            if (skip && getComputedStyle(skip).display !== 'none') skip.click();
            return p && !p.classList.contains('ad-showing') && !p.classList.contains('ad-interrupting');
          }, { timeoutMs: 150000, intervalMs: 1000 });
          await sleep(1500);
          await main(() => { const v = document.querySelector('#movie_player video.html5-main-video'); v.muted = true; v.pause(); v.currentTime = 60; });
          await sleep(1500);
          const after = await iso(OV);
          const st = await iso(STATE);
          r.result = {
            attempt: seen.attempt, arabicSaved: seen.state.arabic, hiddenDuringAd: seen.overlay.hidden, adEnded: !!ended,
            shownAfterAd: !after.hidden && after.lines.length > 0, rejectedDuringVisit: st.rejected,
          };
          ev.check('list-ad-overlay-hidden-during-ad-and-back-after', seen.state.arabic && seen.overlay.hidden === true && !!ended && r.result.shownAfterAd, r.result);
        }
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
  if (tab) await tab.close().catch(() => null);
  await saveState(browser, state);
  await ev.write();
  b?.conn.close();
}
process.exit(ev.failed.length ? 1 : 0);
