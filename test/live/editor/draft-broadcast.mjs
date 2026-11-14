#!/usr/bin/env node
// مجسّ حي لكلفة بث مسودة المحرّر (تحقق 2.3.0 ص-٩؛ عقد storage §١٦). كل كتابة لـdraft:<id> يبثها المتصفح بقيمتيها القديمة والجديدة
// كاملتين إلى كل سياق فيه مستمع storage.onChanged: سكربت المحتوى في كل تبويب يوتيوب (مستمعان: المتحكم ولغة الواجهة)، والعامل
// الخلفي (تلميح الأيقونة)، وكل صفحة إضافة مفتوحة ومنها المحرّر نفسه. يقيس المجسّ ما يكلّفه ذلك فعلًا في كل سياق:
//   - انقطاع الخيط الرئيسي حول وصول الحدث (مِعيان بفاصل 4 م.ث يسجّل كل تأخر فوق 12 م.ث، ومراقب المهام الطويلة)؛
//   - زمن الكتابة ذهابًا وإيابًا من المحرّر (keeper.flush: بناء المسودة وإرسالها والكاتب والكتابة)، وزمن أحداث الإدخال إن كُتب أثناءها؛
//   - ومتى وصل الحدث كل سياق.
// السيناريوهات: خط أساس بلا كتابة، ثم مسودة خانة واحدة، ثم ثلاث خانات (الأسوأ: 3 × N مقطع)، ثم طلب بلا بث (مسودة مطابقة: كلفة
// الإرسال والكاتب وحدها)، ثم الكتابة أثناء الكتابة، ثم حجم معتاد. وكل انقطاع يُنسب إلى نافذة الكتابة أو إلى نافذة الحرف قبلها.
// الكتابات حقيقية: حرف في حقل نص مقطع، ثم بعد ثانية (تنتهي فيها معالجة المحرّر للحرف، والسكون لم يحن) «اكتب المسودة الآن» من
// واجهة المحرّر في بناء التطوير؛ ومسودتا الخانتين 2 و3 بطلب
// الكاتب نفسه من صفحة المحرّر. البيانات اصطناعية تُزرع عبر تخزين الإضافة (سكربت المحتوى) بعد مسح بيانات ملف الاختبار.
//
// بروتوكول «الاختبارات الحية»: لا يُشغَّل إلا بإذن صاحب المشروع، ومتصفح واحد في المرة بلا نافذة، وملف تعريف اختبار خارج المستودع
// (TJ_PROFILE_ROOT)، ويرفض البدء إن وجد متصفحًا آليًا آخر يعمل. تبويبات يوتيوب الخلفية بلا خنق مؤقتاتها (أعلام Chromium)، فيُقاس
// عملها لا خنقها، والمحرّر هو التبويب الظاهر طوال الجولة (إخفاؤه يكتب المسودة). والنتائج في test-results/live/st1-p9/<المتصفح>.
//   command node test/live/editor/draft-broadcast.mjs [--browser brave|chrome|edge] [--tabs 3] [--cues 5000] [--typical 1000]
//     [--writes 5] [--video iG9CE55wbtY] [--out test-results/live/st1-p9] [--profile <اسم>] [--ext-out <مجلد>] [--headed] [--dry]
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, openTab } from '../harness/extension.mjs';
import { dismissConsent, waitForPlayer } from '../harness/youtube.mjs';
import { longTrack } from '../../fixtures/v2/index.js';
import { compare } from '../../../src/core/compare/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { draftOf } from '../../../src/core/model/draft.js';
import { validateBundle } from '../../../src/core/model/slots.js';
import { storeRequest } from '../../../src/core/model/messages.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const num = (k, d) => {
  const n = Number(val(k, d));
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${k} عدد صحيح موجب`);
  return n;
};
const browser = val('browser', 'brave');
if (!BROWSERS[browser]) throw new Error(`متصفح غير معروف: ${browser} (Chromium وحده: ${Object.keys(BROWSERS).join('، ')})`);
const HEADED = argv.includes('--headed');
const TABS = num('tabs', 3);
const CUES = num('cues', 5000);
const TYPICAL = num('typical', 1000);
const WRITES = num('writes', 5);
const VIDEO = val('video', 'iG9CE55wbtY');
const OUT = path.resolve(ROOT, val('out', 'test-results/live/st1-p9'), browser);
const PROFILE = val('profile', `${browser}-st1-p9`);
const EXT = path.resolve(val('ext-out', path.join(PROFILE_ROOT, 'ext-st1-p9-dev')));
const BIG = 'TJp9big0001';
const SMALL = 'TJp9typ0001';
const NOW = new Date().toISOString();
// تبويبات الخلفية تعمل بلا خنق: المِعيان يقيس انشغال الخيط لا مؤقتًا مخنوقًا إلى ثانية.
const UNTHROTTLED = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

const result = {
  probe: 'st1-p9 draft-broadcast', at: NOW, browser: null, headless: !HEADED, flags: UNTHROTTLED,
  config: { tabs: TABS, cues: CUES, typical: TYPICAL, writes: WRITES }, payload: {}, scenarios: {}, raw: {}, checks: [], errors: {},
};
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

// ---- البيانات: فيديو بثلاث خانات من CUES مقطعًا، وفيديو معتاد بخانة من TYPICAL ----
const LINE = (n, tag) => `هذا نص عربي متوسط الطول للمقطع رقم ${n}، فيه كلمات تكفي لسطر واحد (${tag}).`;
function bundleOf(videoId, count, slots) {
  const en = { key: 'en|asr', lang: 'en', kind: 'asr', capturedAt: NOW, source: 'capture', cues: longTrack(count, { seed: 61 }) };
  const fp = buildExport({ videoId, track: { key: en.key, lang: 'en', kind: 'asr', cues: en.cues }, mode: 'normal', now: NOW }).fingerprint;
  const track = (tag) => {
    const original = en.cues.map((c) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: LINE(c.n, tag) }));
    return { fileName: `${videoId}.${tag}.ar.srt`, importedAt: NOW, original, current: null, editedAt: null, fingerprintId: fp.id, comparison: compare(original, fp, { driftMs: 100 }), notes: [] };
  };
  const tracks = ['أولى', 'ثانية', 'ثالثة'].slice(0, slots).map(track);
  return {
    videoId, active: 1, previous: null,
    record: { schema: 1, videoId, title: `ص-٩ — ${count} مقطع`, durationMs: null, createdAt: NOW, updatedAt: NOW, rev: 1, english: [en], fingerprints: [fp], arabic: structuredClone(tracks[0]), view: { displayOffsetMs: 0, displayMode: 'ar' } },
    slots: [1, 2, 3].map((n) => ({ n, name: null, track: tracks[n - 1] ?? null, offsetMs: 0, marks: [], position: null })),
  };
}
const big = bundleOf(BIG, CUES, 3);
const small = bundleOf(SMALL, TYPICAL, 1);
/** مسودة لخانة كما يبنيها المحرّر: المقاطع بتعديل في أولها. */
const draftFor = (b, n, tag) => {
  const s = b.slots[n - 1];
  return draftOf({ cues: s.track.original.map((c, i) => (i === 0 ? { ...c, text: `${c.text} ${tag}` } : c)), offsetMs: 0, committedMs: 0 }, s, NOW);
};
const bytes = (v) => Buffer.byteLength(JSON.stringify(v), 'utf8');
const MB = (b) => Math.round((b / 1048576) * 100) / 100;
{
  const one = draftFor(big, 1, 'x');
  const value = (slots) => ({ schema: 1, videoId: BIG, slots });
  const v1 = value([one, null, null]);
  const v3 = value([one, draftFor(big, 2, 'x'), draftFor(big, 3, 'x')]);
  const typ = { schema: 1, videoId: SMALL, slots: [draftFor(small, 1, 'x'), null, null] };
  // الحمولة الخام لكل كتابة: { [مفتاح]: { oldValue, newValue } }، كلتاهما بحجم القيمة تقريبًا.
  result.payload = {
    oneSlotMB: MB(bytes(v1)), oneSlotBroadcastMB: MB(bytes({ k: { oldValue: v1, newValue: v1 } })),
    threeSlotsMB: MB(bytes(v3)), threeSlotsBroadcastMB: MB(bytes({ k: { oldValue: v3, newValue: v3 } })),
    typicalMB: MB(bytes(typ)), typicalBroadcastMB: MB(bytes({ k: { oldValue: typ, newValue: typ } })),
    requestMB: MB(bytes(storeRequest('draft', { videoId: BIG, slot: 1, draft: one }, 'p9-size-000000'))),
  };
  const valid = [big, small].map(validateBundle);
  check('data-prepared', valid.every((r) => r.ok), { payload: result.payload, invalid: valid.filter((r) => !r.ok) });
}
if (argv.includes('--dry')) {
  console.log(`\nتجهيز فقط (--dry): ${result.checks.filter((c) => c.ok).length}/${result.checks.length}`);
  process.exit(result.checks.every((c) => c.ok) ? 0 : 1);
}

// ---- لا متصفح آلي آخر (قاعدة الجولات المتتابعة) ----
{
  const ps = execFileSync('ps', ['-axo', 'pid,command'], { encoding: 'utf8' }).split('\n')
    .filter((l) => /TarjumanClaude|Tarjuman-test|--headless/i.test(l) && !l.includes('draft-broadcast.mjs') && !/\bps -axo\b/.test(l));
  if (ps.length) {
    console.error(`متصفح آلي آخر يعمل؛ لا بدء حتى ينتهي (لا يُقتل):\n${ps.map((l) => `  ${l.trim().slice(0, 160)}`).join('\n')}`);
    process.exit(3);
  }
}

// ---- دوال تُنفَّذ داخل السياقات (مستقلة بلا إغلاق خارجي) ----
const IN = {
  /** المِعيان ومراقب المهام الطويلة؛ الأزمنة بالساعة المشتركة (timeOrigin + now) لتُقارن بين السياقات. */
  sampler: () => {
    const g = globalThis;
    if (g.__p9) return 'exists';
    const now = () => performance.timeOrigin + performance.now();
    const S = { gaps: [], long: [], marks: [], since: now() };
    let last = now();
    setInterval(() => {
      const t = now();
      if (t - last > 12) S.gaps.push([Math.round(last), Math.round(t - last)]);
      last = t;
    }, 4);
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) S.long.push([Math.round(performance.timeOrigin + e.startTime), Math.round(e.duration)]); })
        .observe({ type: 'longtask', buffered: false });
    } catch {
      // العامل الخلفي بلا مهام طويلة.
    }
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) S.marks.push([Math.round(performance.timeOrigin + e.startTime), e.name, Math.round(e.duration)]); })
        .observe({ type: 'event', durationThreshold: 16, buffered: false });
    } catch {
      // لا أحداث إدخال هنا.
    }
    g.__p9 = S;
    return 'installed';
  },
  /** وصول حدث المسودة إلى هذا السياق (بعد فك حمولته): الزمن والمفاتيح. يحتاج chrome.storage (العالم المعزول أو الإضافة). */
  receiver: () => {
    const g = globalThis;
    if (g.__p9r) return 'exists';
    g.__p9r = [];
    chrome.storage.onChanged.addListener((changes) => {
      const t = Math.round(performance.timeOrigin + performance.now());
      const keys = Object.keys(changes).filter((k) => k.startsWith('draft:'));
      if (keys.length) g.__p9r.push([t, keys.join(',')]);
    });
    return 'installed';
  },
  /** ما جُمع منذ الزمن from (ثم يبقى المِعيان يعمل). المِعيان في العالم الرئيسي والمستقبِل في المعزول في تبويب يوتيوب، فكلٌّ اختياري. */
  collect: (from) => {
    const S = globalThis.__p9;
    const R = globalThis.__p9r;
    if (!S && !R) return null;
    return {
      gaps: S ? S.gaps.filter((x) => x[0] + x[1] >= from) : null, long: S ? S.long.filter((x) => x[0] + x[1] >= from) : null,
      events: S ? S.marks.filter((x) => x[0] >= from) : null, received: R ? R.filter((x) => x[0] >= from) : null,
    };
  },
  clock: () => Math.round(performance.timeOrigin + performance.now()),
  pause: () => { document.querySelectorAll('video').forEach((v) => { v.muted = true; v.pause(); }); return true; },
  bot: () => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''),
  seed: async (bundles) => {
    const t = globalThis.__tarjuman;
    for (const b of bundles) await t.store.updateBundle(b.videoId, () => b);
    return (await Promise.all(bundles.map((b) => t.store.getBundle(b.videoId)))).map((b) => b?.slots.filter((s) => s.track).length ?? 0);
  },
  /** طلب الكاتب نفسه من صفحة إضافة (المسح، ومسودتا الخانتين 2 و3). */
  send: async (req) => {
    const t0 = performance.now();
    const r = await chrome.runtime.sendMessage(req);
    return { ok: !!r?.ok, code: r?.code ?? null, ms: Math.round(performance.now() - t0) };
  },
  editorReady: () => Boolean(globalThis.__tarjumanEditor && document.querySelector('.ed-row[data-index="0"] [data-field="text"]')),
  editorState: () => {
    const e = globalThis.__tarjumanEditor;
    return { offer: e?.draft.offer ?? null, held: e?.draft.held ?? null, hidden: document.hidden };
  },
  /** يضع المؤشر آخر نص المقطع i. */
  caret: (i) => {
    const ta = document.querySelector(`.ed-row[data-index="${i}"] [data-field="text"]`);
    if (!ta) return false;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return document.activeElement === ta;
  },
  /** «اكتب المسودة الآن» وزمنها ذهابًا وإيابًا؛ wait=false يعيد فور البدء (والزمن في __p9flush). */
  flush: async (wait) => {
    const g = globalThis;
    const t0 = performance.timeOrigin + performance.now();
    const p = g.__tarjumanEditor.draft.flush().then(() => {
      g.__p9flush = { start: Math.round(t0), ms: Math.round(performance.timeOrigin + performance.now() - t0) };
      return g.__p9flush;
    });
    if (wait) return p;
    g.__p9flush = null;
    return { start: Math.round(t0) };
  },
  lastFlush: () => globalThis.__p9flush ?? null,
  /**
   * طلب مسودة مطابقة للمخزَّنة (الخانة 1): الكاتب يقرأ ويقارن ولا يكتب، فلا بث. يفصل كلفة الإرسال والكاتب عن كلفة البث. القراءة
   * قبل نافذة القياس بنصف ثانية.
   */
  resend: async (videoId, wid) => {
    const key = `draft:${videoId}`;
    const draft = (await chrome.storage.local.get(key))[key]?.slots?.[0] ?? null;
    if (!draft) return { start: 0, ms: NaN, ok: false };
    await new Promise((r) => setTimeout(r, 500));
    const t0 = performance.timeOrigin + performance.now();
    const r = await chrome.runtime.sendMessage({ videoId, slot: 1, draft, type: 'tj:store', v: 1, wid, op: 'draft' });
    return { start: Math.round(t0), ms: Math.round(performance.timeOrigin + performance.now() - t0), ok: !!r?.ok };
  },
};

/** تقييم في عامل خدمة (لا مجال Page فيه). */
async function workerEval(conn, sessionId, fn, args = []) {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const r = await conn.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(`تقييم العامل فشل: ${r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text}`);
  return r.result.value;
}

// ---- التلخيص: لكل كتابة، أطول انقطاع يحيط بوصول حدثها في كل سياق ----
const stats = (a) => {
  if (!a.length) return { n: 0 };
  const s = [...a].sort((x, y) => x - y);
  return { n: s.length, median: s[Math.floor(s.length / 2)], p90: s[Math.min(s.length - 1, Math.floor(s.length * 0.9))], max: s.at(-1) };
};
/** أطول انقطاع يتقاطع مع [t-before، t+after]. */
const blockAround = (gaps, t, before = 60, after = 60) => gaps.filter(([s, d]) => s <= t + after && s + d >= t - before).reduce((m, [, d]) => Math.max(m, d), 0);
function summarize(name, data, { writes }) {
  const out = { writes: writes.length, contexts: {} };
  for (const [ctx, d] of Object.entries(data)) {
    if (!d || !d.gaps || !d.received) {
      out.contexts[ctx] = { missing: true };
      continue;
    }
    const around = d.received.map(([t]) => blockAround(d.gaps, t));
    // النسبة إلى سببها: نافذة الكتابة (من بدء «اكتب الآن» إلى ما بعد ردّها) ونافذة الكتابة في الحقل قبلها (المحرّر يعالج الحرف).
    const inWrite = writes.filter((w) => Number.isFinite(w.ms)).map((w) => blockAround(d.gaps, w.start + w.ms / 2, w.ms / 2, w.ms / 2 + 300));
    const inTyping = writes.filter((w) => Number.isFinite(w.typedAt) && w.typedAt + 900 <= w.start).map((w) => blockAround(d.gaps, w.typedAt + 450, 450, 450));
    const longIn = (from, to) => d.long.filter(([s, l]) => s <= to && s + l >= from).map((x) => x[1]);
    out.contexts[ctx] = {
      received: d.received.length,
      blockAroundEventMs: stats(around),
      blockInWriteWindowMs: stats(inWrite),
      ...(inTyping.length ? { blockInTypingWindowMs: stats(inTyping) } : {}),
      longTasksInWriteWindowMs: stats(writes.filter((w) => Number.isFinite(w.ms)).flatMap((w) => longIn(w.start, w.start + w.ms + 300))),
      longTasksMs: stats(d.long.map((x) => x[1])),
      gapsOver12: d.gaps.length,
      maxGapMs: d.gaps.reduce((m, x) => Math.max(m, x[1]), 0),
      inputEventsOver16: d.events.length ? d.events.map((x) => `${x[1]}:${x[2]}`) : [],
    };
  }
  out.flushMs = stats(writes.map((w) => w.ms).filter(Number.isFinite));
  result.scenarios[name] = out;
  // الخام للتحليل بعد الجولة: الكتابات، والانقطاعات والمهام الطويلة والوصول في كل سياق.
  result.raw[name] = { writes, contexts: data };
  console.log(`\n== ${name}: ${writes.length} كتابة`);
  console.log(`   المحرّر ذهابًا وإيابًا (م.ث): ${JSON.stringify(out.flushMs)}`);
  for (const [ctx, c] of Object.entries(out.contexts)) {
    console.log(`   ${ctx}: ${c.missing ? 'لا بيانات' : `وصل ${c.received}، حول الحدث ${JSON.stringify(c.blockAroundEventMs)}، في نافذة الكتابة ${JSON.stringify(c.blockInWriteWindowMs)}${c.blockInTypingWindowMs ? `، في نافذة الحرف ${JSON.stringify(c.blockInTypingWindowMs)}` : ''}، مهام طويلة في نافذة الكتابة ${JSON.stringify(c.longTasksInWriteWindowMs)} وكلها ${JSON.stringify(c.longTasksMs)}، أطول انقطاع ${c.maxGapMs}${c.inputEventsOver16.length ? `، إدخال فوق 16 م.ث ${c.inputEventsOver16.join(' ')}` : ''}`}`);
  }
}

execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', EXT], { stdio: 'ignore' });
await mkdir(OUT, { recursive: true });
const b = await launch({ browser, profile: PROFILE, headless: !HEADED, extraArgs: UNTHROTTLED });
result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
console.log(`ص-٩ بث المسودة — ${result.browser}، ${TABS} تبويبات يوتيوب، ${CUES} مقطعًا`);
const yts = [];
let ed;
let extId;
let sw = null;
try {
  for (const x of (await b.conn.send('Target.getTargets')).targetInfos) {
    if (x.type === 'page' && x.url !== 'about:blank') await b.conn.send('Target.closeTarget', { targetId: x.targetId }).catch(() => {});
  }
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  extId = ext.id;

  // صفحة إضافة أولًا: مسح بيانات ملف الاختبار عبر الكاتب، فلا تبقى مسودة من جولة سابقة تُمسك المحرّر.
  ed = await openTab(b.conn, `chrome-extension://${extId}/pages/editor/index.html`);
  result.errors.editor = collectErrors(ed, { extId }).list;
  // «غادِر دون حفظ» عند التنقل من محرّر فيه ما لم يُحفظ (إلى الفيديو المعتاد): يُقبل، فلا يعلّق التنقل.
  ed.on('Page.javascriptDialogOpening', () => { ed.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); });
  await ed.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const cleared = await ed.eval(IN.send, { args: [storeRequest('clear', { at: new Date().toISOString() }, `p9-clear-${Date.now()}`)] });
  check('cleared', cleared.ok, cleared);

  const players = [];
  for (let k = 0; k < TABS; k++) {
    const yt = await openTab(b.conn, 'about:blank');
    result.errors[`youtube${k + 1}`] = collectErrors(yt, { extId, onlyExtension: true }).list;
    await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
    await dismissConsent(yt).catch(() => false);
    // المشغّل قد لا يُحمّل الفيديو تحت الأتمتة؛ القياس يحتاج سكربت المحتوى وحده.
    players.push(!!(await waitForPlayer(yt, VIDEO, 20000)));
    await yt.eval(IN.pause).catch(() => {});
    if (await yt.eval(IN.bot).catch(() => false)) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
    await sleep(1500);
    const isoId = yt.isolatedContextId(extId);
    if (!isoId) throw new Error(`سياق الإضافة غير جاهز في التبويب ${k + 1}`);
    yts.push({ page: yt, isoId });
    await sleep(800 + Math.random() * 700);
  }
  check('youtube-tabs', yts.length === TABS, { players });
  const seeded = await yts[0].page.eval(IN.seed, { contextId: yts[0].isoId, args: [[big, small]] });
  check('seeded-through-extension-store', seeded[0] === 3 && seeded[1] === 1, { slots: seeded });

  // العامل الخلفي: هدف service_worker للإضافة.
  {
    const t = (await b.conn.send('Target.getTargets')).targetInfos.find((x) => x.type === 'service_worker' && x.url.startsWith(`chrome-extension://${extId}/`));
    if (t) {
      const { sessionId } = await b.conn.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
      sw = sessionId;
    }
    check('worker-attached', !!sw);
  }

  // المحرّر على الفيديو الكبير، الخانة 1، وهو التبويب الظاهر.
  await ed.goto(`chrome-extension://${extId}/pages/editor/index.html?v=${BIG}&t=1`);
  await b.conn.send('Target.activateTarget', { targetId: ed.targetId }).catch(() => {});
  await ed.send('Page.bringToFront').catch(() => {});
  check('editor-ready', !!(await ed.waitFor(IN.editorReady, { timeoutMs: 30000 })), await ed.eval(IN.editorState));

  // المجسّات في كل سياق.
  const installs = { editor: [await ed.eval(IN.sampler), await ed.eval(IN.receiver)] };
  for (const [k, y] of yts.entries()) installs[`youtube${k + 1}`] = [await y.page.eval(IN.sampler), await y.page.eval(IN.receiver, { contextId: y.isoId })];
  if (sw) installs.worker = [await workerEval(b.conn, sw, IN.sampler), await workerEval(b.conn, sw, IN.receiver)];
  check('probes-installed', Object.values(installs).every((x) => x.every((s) => s === 'installed')), installs);

  const gather = async (from) => {
    const data = { editor: await ed.eval(IN.collect, { args: [from] }) };
    for (const [k, y] of yts.entries()) {
      const main = await y.page.eval(IN.collect, { args: [from] });
      const iso = await y.page.eval(IN.collect, { contextId: y.isoId, args: [from] });
      data[`youtube${k + 1}`] = main && iso ? { ...main, received: iso.received } : null;
    }
    if (sw) data.worker = await workerEval(b.conn, sw, IN.collect, [from]).catch(() => null);
    return data;
  };
  /** كتابة حقيقية من المحرّر: حرف في مقطع ثم «اكتب الآن». duringTyping: ثلاثة أحرف أثناء الكتابة. */
  async function editorWrite(i, { duringTyping = false } = {}) {
    if (!(await ed.eval(IN.caret, { args: [i] }))) throw new Error(`لا حقل نص للمقطع ${i}`);
    const typedAt = await ed.eval(IN.clock);
    await ed.send('Input.insertText', { text: 'ث' });
    // معالجة الحرف في المحرّر تنتهي قبل الكتابة (وتُقاس وحدها)، والسكون (ثانيتان) لم يحن.
    await sleep(duringTyping ? 120 : 1000);
    if (!duringTyping) return { typedAt, ...(await ed.eval(IN.flush, { args: [true] })) };
    const started = await ed.eval(IN.flush, { args: [false] });
    for (const ch of 'جحخ') {
      await ed.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      await ed.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      await sleep(40);
    }
    const end = Date.now() + 20000;
    let done = null;
    while (!done && Date.now() < end) {
      done = await ed.eval(IN.lastFlush);
      if (!done) await sleep(100);
    }
    return { typedAt, ...(done ?? { start: started.start, ms: NaN }) };
  }
  async function scenario(name, run) {
    const from = await ed.eval(IN.clock);
    const writes = [];
    await run(writes);
    await sleep(2500);
    summarize(name, await gather(from), { writes });
  }

  await scenario('baseline-no-writes', async () => { await sleep(8000); });
  await scenario(`one-slot-${CUES}`, async (writes) => {
    for (let k = 0; k < WRITES; k++) {
      writes.push(await editorWrite(10 + k));
      await sleep(1500);
    }
  });
  check('editor-not-held', !(await ed.eval(IN.editorState)).held, await ed.eval(IN.editorState));
  await scenario(`three-slots-${CUES}`, async (writes) => {
    for (const n of [2, 3]) {
      const r = await ed.eval(IN.send, { args: [storeRequest('draft', { videoId: BIG, slot: n, draft: draftFor(big, n, `p9-${n}`) }, `p9-d${n}-${Date.now()}`)] });
      check(`draft-slot-${n}-written`, r.ok, r);
      await sleep(1500);
    }
    for (let k = 0; k < WRITES; k++) {
      writes.push(await editorWrite(20 + k));
      await sleep(1500);
    }
  });
  await scenario(`three-slots-${CUES}-request-without-broadcast`, async (writes) => {
    for (let k = 0; k < 3; k++) {
      writes.push(await ed.eval(IN.resend, { args: [BIG, `p9-resend-${k}-${Date.now()}`] }));
      await sleep(1200);
    }
  });
  await scenario(`three-slots-${CUES}-typing-during-write`, async (writes) => {
    for (let k = 0; k < Math.min(3, WRITES); k++) {
      writes.push(await editorWrite(30 + k, { duringTyping: true }));
      // الأحرف بعد البدء تُكتب بعد سكون ثانيتين: تُحسب في هذا السيناريو.
      await sleep(3200);
    }
  });
  // الحجم المعتاد: الفيديو الثاني بخانة من TYPICAL مقطعًا.
  await ed.goto(`chrome-extension://${extId}/pages/editor/index.html?v=${SMALL}&t=1`);
  await ed.send('Page.bringToFront').catch(() => {});
  check('editor-ready-typical', !!(await ed.waitFor(IN.editorReady, { timeoutMs: 30000 })), await ed.eval(IN.editorState));
  await ed.eval(IN.sampler);
  await ed.eval(IN.receiver);
  await sleep(2000);
  await scenario(`one-slot-${TYPICAL}`, async (writes) => {
    for (let k = 0; k < WRITES; k++) {
      writes.push(await editorWrite(10 + k));
      await sleep(1500);
    }
  });
  if (sw) check('worker-probes-survived', (await workerEval(b.conn, sw, () => !!globalThis.__p9).catch(() => false)) === true);
} catch (err) {
  check('run', false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
} finally {
  result.errors = Object.fromEntries(Object.entries(result.errors).map(([k, list]) => [k, list.slice(0, 20)]));
  await writeFile(path.join(OUT, 'draft-broadcast.json'), `${JSON.stringify(result, null, 2)}\n`);
  await b.close();
}
const failed = result.checks.filter((c) => !c.ok);
console.log(`\n${result.checks.length - failed.length}/${result.checks.length} فحصًا، والنتائج في ${path.relative(ROOT, path.join(OUT, 'draft-broadcast.json'))}`);
process.exit(failed.length ? 1 : 0);
