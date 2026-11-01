#!/usr/bin/env node
// الاختبار الحي للمحرّر (P8، بروتوكول «الاختبارات الحية»): ترجمة محفوظة حقيقية على فيديو TED (`iG9CE55wbtY`) تدخل
// المنتج من طريقه الفعلي (تصدير P3 ← استيراد P4 ← controller.loadArabic ← ± المشغّل يجعل الإزاحة +0.5)، ثم يُفتح
// المحرّر بعنوانه ويُختبر بنقرات وكتابة حقيقية عبر CDP: النطاق و±، والتراجع، والتصدير بالتوقيت المصدَّر، والأخطاء،
// والمقارنة والاستعادة، وتثبيت الإزاحة، وحارس المغادرة، والحفظ والأصل وانعكاسهما في المشغّل المفتوح، والتعارض؛
// ثم ملف كبير (2140 مقطعًا) للأداء. النص العربي اصطناعي والإنجليزي الحقيقي لا يظهر في اللقطات (العمود يُخفى).
//   npm run build:dev -- --out <مجلد خارج المستودع>
//   node test/live/editor/run.mjs --ext <مجلد> [--browser brave] [--profile brave-p8] [--headed] [--out docs/evidence/P8] [--dry]
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, emulateScheme, openTab } from '../harness/extension.mjs';
import { dismissConsent, waitForPlayer } from '../harness/youtube.mjs';
import { englishTrack, realTrack } from '../../helpers/fixtures.js';
import { buildExport } from '../../../src/core/export/index.js';
import { readImport } from '../../../src/core/import/index.js';
import { withArabicImport, withExport } from '../../../src/core/model/transitions.js';
import { parseSrtStrict } from '../../../src/core/srt/parser.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';
import { compare } from '../../../src/core/compare/index.js';
import { formatTimecode } from '../../../src/ui/format.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P8'), browser);
const DL = path.join(PROFILE_ROOT, 'downloads-p8');
const VIDEO = 'iG9CE55wbtY';
const BIG = 'TJp8big0001';
const BIG_COUNT = 2140;
const NOW = new Date().toISOString();

const result = { browser: null, at: NOW, headless: !argv.includes('--headed'), video: VIDEO, big: { videoId: BIG, cues: BIG_COUNT }, checks: [], perf: null, notes: [], screenshots: [], errors: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

// ---- الترجمة المحفوظة الحقيقية: تصدير P3 ثم ترجمة بأزمنته ثم استيراد P4 (كما في دخان W3) ----
const real = realTrack('manual');
const enTrack = englishTrack({ kind: 'manual', cues: real.cues, capturedAt: NOW });
const exp = buildExport({ videoId: VIDEO, track: { key: enTrack.key, lang: enTrack.lang, kind: enTrack.kind, cues: enTrack.cues }, mode: 'normal', now: NOW });
const fp = exp.fingerprint;
const srtText = (cues) => cues.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');
const arCues = parseSrtStrict(exp.files[0].text).map((c) => ({ ...c, text: c.text.split('\n').map((_, k) => `ترجمة المقطع ${c.n} سطر ${k + 1}`).join('\n') }));
const AR_NAME = `${VIDEO}.ar.srt`;
const imp = await readImport(new File([srtText(arCues)], AR_NAME, { type: 'application/x-subrip' }), { fingerprints: [fp] });
check('real-record-prepared', imp.ok && imp.comparison?.matched === true && imp.cues.length === real.cues.length, { cues: imp.cues?.length, matched: imp.comparison?.matched });
const seedTed = withExport(null, { videoId: VIDEO, title: 'P8 — فيديو TED حقيقي', durationMs: null, englishTrack: enTrack, fingerprint: fp, displayMode: 'ar' }, NOW);

// ---- الملف الكبير: 2140 مقطعًا (نحو 90 دقيقة)، أسطر من 1 إلى 3، بمسار إنجليزي اصطناعي وبصمته ----
const bigEn = Array.from({ length: BIG_COUNT }, (_, i) => ({ n: i + 1, startMs: 1000 + i * 2500, endMs: 3000 + i * 2500, text: `reference line ${i + 1}` }));
const bigTrack = englishTrack({ kind: 'asr', cues: bigEn, capturedAt: NOW });
const bigExp = buildExport({ videoId: BIG, track: { key: bigTrack.key, lang: 'en', kind: 'asr', cues: bigEn }, mode: 'normal', now: NOW });
const bigAr = bigEn.map((c) => ({ ...c, text: Array.from({ length: (c.n % 3) + 1 }, (_, k) => `سطر عربي ${k + 1} للمقطع ${c.n}`).join('\n') }));
const bigRec = withArabicImport(
  withExport(null, { videoId: BIG, title: 'P8 — ملف كبير (2140 مقطعًا)', durationMs: 5400000, englishTrack: bigTrack, fingerprint: bigExp.fingerprint }, NOW),
  { videoId: BIG, fileName: `${BIG}.ar.srt`, cues: bigAr, comparison: compare(bigAr, bigExp.fingerprint), fingerprintId: bigExp.fingerprint.id, notes: [] }, NOW,
).record;

check('large-record-prepared', bigRec.arabic.original.length === BIG_COUNT && bigRec.arabic.comparison.matched === true, { cues: bigRec.arabic.original.length });
if (argv.includes('--dry')) {
  console.log(`\nتجهيز فقط (--dry): ${result.checks.filter((c) => c.ok).length}/${result.checks.length}`);
  process.exit(result.checks.every((c) => c.ok) ? 0 : 1);
}

// ---- دوال تُنفَّذ داخل الصفحات (مستقلة بلا إغلاق خارجي) ----
const P = {
  seed: async (rec) => {
    await globalThis.__tarjuman.store.updateVideo(rec.videoId, () => rec);
    await globalThis.__tarjuman.controller.reload();
    return globalThis.__tarjuman.controller.getState().videoId;
  },
  put: async (rec) => {
    await globalThis.__tarjuman.store.updateVideo(rec.videoId, () => rec);
    return true;
  },
  load: async (input) => {
    const c = globalThis.__tarjuman.controller;
    await c.loadArabic(input, { replace: true });
    await c.setOffset(500);
    const s = c.getState();
    return { arabic: s.arabic?.cues.length ?? 0, offset: s.view.displayOffsetMs, edited: s.arabic?.edited ?? null };
  },
  player: () => {
    const s = globalThis.__tarjuman.controller.getState();
    return { videoId: s.videoId, edited: s.arabic?.edited ?? null, cue2: s.arabic?.cues[2] ?? null, cue0: s.arabic?.cues[0] ?? null, offset: s.view.displayOffsetMs, count: s.arabic?.cues.length ?? 0 };
  },
  stored: async (id) => {
    const r = await globalThis.__tarjuman.store.getVideo(id);
    return r && { rev: r.rev, current: r.arabic?.current ? r.arabic.current.slice(0, 12) : null, original: r.arabic?.original.slice(0, 12) ?? null, offset: r.view.displayOffsetMs, editedAt: r.arabic?.editedAt ?? null };
  },
  nudge: async (dir) => {
    await globalThis.__tarjuman.controller.nudgeOffset(dir);
    return globalThis.__tarjuman.controller.getState().view.displayOffsetMs;
  },
};
const E = {
  ready: () => Boolean(globalThis.__tarjumanEditor && document.querySelector('.ed-row[data-index]')),
  info: () => {
    const q = (s) => document.querySelector(s);
    const t = (s) => q(s)?.textContent.trim() ?? null;
    const visible = (s) => (q(s) && !q(s).hidden ? t(s) : null);
    const btns = [...document.querySelectorAll('.ed-head button, .ed-offset button, .ed-toolbar button')];
    const btn = (label) => btns.find((b) => b.textContent.trim().startsWith(label));
    const dis = (b) => (b ? { disabled: b.getAttribute('aria-disabled') === 'true', title: b.title || null } : null);
    const s = globalThis.__tarjumanEditor.state;
    const dlg = q('dialog[open]');
    return {
      rowsInDom: document.querySelectorAll('.ed-row').length,
      counter: t('.ed-counter'), status: t('.ed-status'), offset: t('.ed-offset__text'), offsetSub: t('.ed-offset__body .tj-caption'),
      preview: t('.ed-preview'), notice: visible('.ed-notice'), result: visible('.ed-result'), unsaved: visible('.ed-unsaved') && t('.ed-unsaved .tj-label'),
      scope: [...document.querySelectorAll('.ed-seg__opt')].map((b) => ({ label: b.textContent, checked: b.getAttribute('aria-checked') === 'true', disabled: b.getAttribute('aria-disabled') === 'true' })),
      issues: { pill: t('.ed-panel .tj-pill'), items: [...document.querySelectorAll('.ed-issue')].map((b) => b.textContent) },
      compare: [...document.querySelectorAll('.ed-cmp__line')].map((l) => l.textContent),
      restoreTiming: [...document.querySelectorAll('.ed-side button')].some((b) => b.textContent.startsWith('استعادة التوقيت الأصلي')),
      save: dis(btn('حفظ')), export: dis(btn('تصدير')), undo: dis(btn('تراجع')), redo: dis(btn('إعادة')), commit: dis(btn('تثبيت الإزاحة')),
      version: q('.ed-head select')?.value ?? null, versions: [...(q('.ed-head select')?.options ?? [])].map((o) => o.text),
      banner: visible('.ed-banner'), toast: q('.ed-toast.is-shown') ? t('.ed-toast') : null,
      dialog: dlg ? {
        title: dlg.querySelector('.tj-dialog__title')?.textContent ?? null, body: dlg.querySelector('.tj-dialog__body')?.textContent ?? null, text: dlg.textContent,
        buttons: [...dlg.querySelectorAll('.tj-dialog__footer button')].map((b) => ({ value: b.value, label: b.textContent.trim(), disabled: b.getAttribute('aria-disabled') === 'true' })),
        rows: dlg.querySelectorAll('tbody tr').length, checked: [...dlg.querySelectorAll('input[type=radio]:checked')].map((r) => r.value),
      } : null,
      dirty: s.session.dirty, changed: s.session.changedCount, offsetMs: s.session.offsetMs, view: s.view, external: s.external, scopeKind: s.scope,
      docTitle: document.title, enHidden: q('.ed-list').classList.contains('ed-list--no-en'),
      readOnlyRow: Boolean(q('.ed-row.is-readonly')),
      layout: {
        pageOverflow: document.scrollingElement.scrollHeight - innerHeight, pageScroll: document.scrollingElement.scrollTop,
        listHeight: q('.ed-list').clientHeight, issueDir: q('.ed-issue') ? getComputedStyle(q('.ed-issue')).direction : null,
      },
    };
  },
  cue: (i) => {
    const s = globalThis.__tarjumanEditor.state;
    const ses = s.view === 'original' ? s.original : s.session;
    const c = ses.cueAt(i);
    return { n: c.n, startMs: c.startMs, endMs: c.endMs, text: c.text, changed: ses.isChanged(i) };
  },
  starts: (from, to) => {
    const s = globalThis.__tarjumanEditor.state.session;
    return Array.from({ length: to - from }, (_, k) => s.cueAt(from + k).startMs);
  },
  field: (i, f) => document.querySelector(`.ed-row[data-index="${i}"] [data-field="${f}"]`)?.value ?? null,
  active: () => {
    const a = document.activeElement;
    const row = a?.closest?.('.ed-row');
    return { field: a?.dataset?.field ?? null, index: row ? Number(row.dataset.index) : null };
  },
  mark: (sel, label) => {
    document.querySelectorAll('[data-probe]').forEach((x) => x.removeAttribute('data-probe'));
    const list = [...document.querySelectorAll(sel)];
    const hit = label === null ? list[0] : list.find((x) => x.textContent.trim().startsWith(label));
    if (!hit) return false;
    hit.setAttribute('data-probe', '1');
    return true;
  },
  reveal: (i, f) => {
    globalThis.__tarjumanEditor.jumpTo(i, f);
    return true;
  },
  observe: () => {
    globalThis.__evt = [];
    new PerformanceObserver((list) => { for (const e of list.getEntries()) globalThis.__evt.push({ name: e.name, duration: e.duration }); })
      .observe({ type: 'event', durationThreshold: 16, buffered: false });
    return true;
  },
  events: () => {
    const list = globalThis.__evt ?? [];
    globalThis.__evt = [];
    const by = (re) => list.filter((e) => re.test(e.name)).map((e) => e.duration);
    const max = (a) => (a.length ? Math.round(Math.max(...a)) : 0);
    return { count: list.length, maxKey: max(by(/^key|input/)), maxClick: max(by(/click|pointer|mouse/)), over100: list.filter((e) => e.duration > 100).length };
  },
  /** تمرير على طول القائمة بخطوات، وقياس الإطارات والصفوف المرسومة. */
  /** كل خطوة: تمرير، ثم إطاران (رسم القائمة نفسها)، ثم عدّ الصفوف الظاهرة؛ والزمن بين الإطارين كلفة الرسم. */
  scrollSweep: async (steps) => {
    const sc = document.querySelector('.ed-list');
    const total = sc.scrollHeight - sc.clientHeight;
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
    const frames = [];
    let rowsMax = 0;
    let emptyFrames = 0;
    for (let k = 1; k <= steps; k++) {
      sc.scrollTop = Math.round((total * k) / steps);
      const a = await frame();
      const b = await frame();
      frames.push(b - a);
      const v = sc.getBoundingClientRect();
      const visible = [...document.querySelectorAll('.ed-row')].filter((r) => {
        const x = r.getBoundingClientRect();
        return x.bottom > v.top && x.top < v.bottom;
      }).length;
      if (visible === 0) emptyFrames++;
      rowsMax = Math.max(rowsMax, document.querySelectorAll('.ed-row').length);
    }
    const sorted = frames.sort((a, b) => a - b);
    return { steps, maxFrameMs: Math.round(sorted.at(-1) ?? 0), p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), longFrames: sorted.filter((f) => f > 50).length, rowsMax, emptyFrames, counter: document.querySelector('.ed-counter')?.textContent ?? null };
  },
  openedMs: () => Math.round(performance.now()),
};

const b = await launch({ browser, profile: val('profile', `${browser}-p8`), headless: !argv.includes('--headed') });
result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
console.log(`المتصفح: ${result.browser}`);
let yt;
let ed;
let isoId;
let extId;
const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
const run = (fn, ...args) => ed.eval(fn, { args });
const info = () => run(E.info);
const shoot = async (name) => {
  const f = path.join(OUT, `${name}.png`);
  await ed.screenshot(f);
  result.screenshots.push(path.relative(ROOT, f));
};
const settle = (ms = 350) => sleep(ms);
/** نقرة فأرة حقيقية على أول عنصر يطابق المحدد ويبدأ نصه بالتسمية (أو أول عنصر إن كانت null). */
async function clickOn(sel, label = null) {
  if (!(await run(E.mark, sel, label))) throw new Error(`لا عنصر: ${sel} ${label ?? ''}`);
  const c = await ed.centerOf('[data-probe="1"]');
  if (!c) throw new Error(`عنصر غير ظاهر: ${sel} ${label ?? ''}`);
  await ed.click(c.x, c.y);
  await settle();
}
async function hoverOn(sel, label = null) {
  await run(E.mark, sel, label);
  const c = await ed.centerOf('[data-probe="1"]');
  await ed.mouseMove(c.x, c.y);
  await settle(200);
}
/** يكتب في حقل: نقرة، ثم تحديد ما فيه، ثم كتابة بلوحة المفاتيح، ثم Enter اختياريًا. */
async function typeInto(sel, text, { enter = false, perChar = false } = {}) {
  await clickOn(sel);
  await ed.eval((s) => document.querySelector(s)?.select?.(), { args: [sel] });
  if (perChar) {
    for (const ch of text) {
      await ed.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      await ed.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      await sleep(40);
    }
  } else await ed.send('Input.insertText', { text });
  if (enter) await ed.key('Enter', 'Enter', 13);
  await settle();
}
const row = (i, f) => `.ed-row[data-index="${i}"] [data-field="${f}"]`;
const downloads = new Map();
b.conn.on('Browser.downloadWillBegin', (e) => downloads.set(e.guid, { name: e.suggestedFilename, state: 'started' }));
b.conn.on('Browser.downloadProgress', (e) => { if (downloads.has(e.guid)) downloads.get(e.guid).state = e.state; });
/** ينقر «تنزيل SRT» وينتظر الملف، ويعيد اسمه ومقاطعه. */
async function downloadFromDialog() {
  const before = new Set(downloads.keys());
  await clickOn('dialog[open] button', 'تنزيل SRT');
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    const guid = [...downloads.keys()].find((g) => !before.has(g) && downloads.get(g).state === 'completed');
    if (guid) {
      const text = await readFile(path.join(DL, guid), 'utf8');
      return { name: downloads.get(guid).name, cues: parseSrtStrict(text) };
    }
    await sleep(150);
  }
  return null;
}

try {
  if (!imp.ok) throw new Error('تجهيز الترجمة لم يكتمل');
  await rm(DL, { recursive: true, force: true });
  await mkdir(DL, { recursive: true });
  await b.conn.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: DL, eventsEnabled: true });
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  extId = ext.id;

  // ===== يوتيوب: الترجمة المحفوظة الحقيقية تدخل من طريق المنتج، والإزاحة +0.5 من المشغّل =====
  yt = await openTab(b.conn, 'about:blank');
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  await yt.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
  const ready = await waitForPlayer(yt, VIDEO, 30000);
  if (await yt.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  await sleep(1500);
  isoId = yt.isolatedContextId(extId);
  if (!ready || !isoId) throw new Error('المشغّل أو سياق الإضافة غير جاهز');
  await iso(P.seed, seedTed);
  const loaded = await iso(P.load, { fileName: imp.fileName, cues: imp.cues, comparison: imp.comparison, fingerprintId: imp.fingerprintId, notes: imp.notes });
  await iso(P.put, bigRec);
  check('saved-translation-through-player', loaded.arabic === imp.cues.length && loaded.offset === 500 && loaded.edited === false, loaded);

  // ===== المحرّر بعنوانه =====
  ed = await openTab(b.conn, 'about:blank');
  const errs = collectErrors(ed, { extId });
  const net = [];
  ed.on('Network.requestWillBeSent', (e) => { if (!/^(chrome-extension|data|blob):/.test(e.request.url)) net.push(1); });
  await ed.send('Network.enable');
  await ed.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await emulateScheme(ed, 'light');
  await ed.goto(`chrome-extension://${extId}/pages/editor/index.html?v=${VIDEO}`);
  await ed.send('Target.activateTarget', { targetId: ed.targetId }).catch(() => b.conn.send('Target.activateTarget', { targetId: ed.targetId }));
  check('editor-opens-by-url', await ed.waitFor(E.ready, { timeoutMs: 15000 }), null);
  await run(E.observe);
  let s = await info();
  check('editor-shows-saved-record', s.status === 'محفوظ ✓' && s.offset.includes('+0.5') && s.counter === `المقطع 1 من ${imp.cues.length}` && s.rowsInDom < 60
    && s.compare.includes('مطابق للأصل ✓') && s.save.disabled && s.versions.length === 1 && s.issues.pill === 'لا مشكلات ✓',
  { status: s.status, offset: s.offset, counter: s.counter, rowsInDom: s.rowsInDom, compare: s.compare, save: s.save, versions: s.versions, issues: s.issues.pill });
  const first = await run(E.cue, 0);
  const f0 = { start: await run(E.field, 0, 'start'), end: await run(E.field, 0, 'end') };
  check('rows-ordered-n-text-start-end', first.n === 1 && f0.start === formatTimecode(imp.cues[0].startMs) && f0.end === formatTimecode(imp.cues[0].endMs) && first.text === imp.cues[0].text,
    { n: first.n, ...f0 });
  await clickOn('label.ed-toggle');
  s = await info();
  check('english-reference-toggle', s.enHidden === true, { enHidden: s.enHidden });
  await shoot('p8-clean');

  // ===== AC2: النطاق ظاهر قبل التطبيق وبعده =====
  await clickOn(row(2, 'text'));
  await clickOn('.ed-seg__opt', 'المقطع 3');
  await hoverOn('.ed-toolbar button', '+');
  s = await info();
  const preCue = s.preview;
  await clickOn('.ed-toolbar button', '+');
  const c2 = await run(E.cue, 2);
  s = await info();
  check('nudge-one-cue-scope-visible', preCue === 'سيُؤخَّر المقطع 3 0.5 ث (تظهر لاحقًا).' && s.result === 'أُخِّر المقطع 3 0.5 ث.' && c2.startMs === imp.cues[2].startMs + 500
    && (await run(E.cue, 1)).startMs === imp.cues[1].startMs && (await run(E.cue, 3)).startMs === imp.cues[3].startMs && s.status === 'تغييرات غير محفوظة (1)',
  { preview: preCue, result: s.result, delta: c2.startMs - imp.cues[2].startMs, status: s.status });
  for (const i of [4, 5, 6]) await clickOn(`.ed-row[data-index="${i}"] .ed-row__check`);
  s = await info();
  const selScope = s.scope.find((x) => x.checked)?.label;
  await typeInto('.ed-amount', '-1.2');
  s = await info();
  const preSel = s.preview;
  await clickOn('.ed-toolbar button', 'تطبيق');
  s = await info();
  const st46 = await run(E.starts, 3, 8);
  check('shift-selection-with-seconds-field', selScope === 'المحددة (3)' && preSel === 'سيُقدَّم 3 مقاطع 1.2 ث (تظهر أبكر).' && s.result === 'قُدِّم 3 مقاطع 1.2 ث.'
    && st46[0] === imp.cues[3].startMs && st46[1] === imp.cues[4].startMs - 1200 && st46[3] === imp.cues[6].startMs - 1200 && st46[4] === imp.cues[7].startMs,
  { scope: selScope, preview: preSel, result: s.result, deltas: st46.map((x, k) => x - imp.cues[3 + k].startMs) });
  await clickOn('.ed-seg__opt', 'الملف كله');
  s = await info();
  check('offset-notice-before-whole-file-shift', s.notice === 'إزاحة العرض +0.5 ث مفعّلة؛ النقل هنا يُضاف إليها.' && s.preview.includes(`الملف كله (${imp.cues.length} مقطعًا)`), { notice: s.notice, preview: s.preview });
  check('unsaved-indicators', s.unsaved === 'لديك 4 تغييرات غير محفوظة' && s.docTitle.startsWith('● ') && !s.save.disabled, { unsaved: s.unsaved, docTitle: s.docTitle, save: s.save });
  await shoot('p8-unsaved');

  // ===== AC3: التراجع والإعادة =====
  await clickOn('.ed-head button', 'تراجع');
  const afterUndo = await run(E.starts, 4, 7);
  s = await info();
  const undone = afterUndo.every((x, k) => x === imp.cues[4 + k].startMs) && s.status === 'تغييرات غير محفوظة (1)';
  await clickOn('.ed-head button', 'إعادة');
  const afterRedo = await run(E.starts, 4, 7);
  s = await info();
  check('undo-redo-before-save', undone && afterRedo.every((x, k) => x === imp.cues[4 + k].startMs - 1200) && s.status === 'تغييرات غير محفوظة (4)', { undone, redoDeltas: afterRedo.map((x, k) => x - imp.cues[4 + k].startMs), status: s.status });

  // ===== التصدير مرفوض بالتداخل (نقل المحددة قبل الرابع)، والحفظ متاح =====
  await clickOn('.ed-head button', 'تصدير');
  s = await info();
  const blocked = s.dialog;
  await shoot('p8-export-blocked');
  await clickOn('dialog[open] button', 'إلغاء');
  check('export-blocked-by-overlap-save-allowed', blocked?.text.includes('لا يمكن التصدير') && blocked.text.includes('تداخل') && blocked.buttons[0].disabled && !s.save.disabled && s.issues.pill.includes('تحذير'),
    { pill: s.issues.pill, confirmDisabled: blocked?.buttons[0].disabled, save: s.save });

  // ===== AC5: حوار التصدير يحدد التوقيت المصدَّر (الإزاحة +0.5)، بعد تراجع يزيل التداخل =====
  await clickOn('.ed-head button', 'تراجع');
  await clickOn('.ed-head button', 'تصدير');
  s = await info();
  const dlgExport = s.dialog;
  await shoot('p8-export');
  const shownFile = await downloadFromDialog();
  await settle(500);
  await clickOn('.ed-head button', 'تصدير');
  await clickOn('dialog[open] label.ed-radio', 'المحفوظ فقط');
  const savedFile = await downloadFromDialog();
  const w2 = await run(E.cue, 2);
  await clickOn('.ed-head button', 'إعادة');
  check('export-dialog-timing-choice', dlgExport?.text.includes('التوقيت المصدَّر') && dlgExport.checked.includes('shown') && dlgExport.text.includes(`${VIDEO}.ar.srt`)
    && shownFile?.name === `${VIDEO}.ar.srt` && shownFile.cues[2].startMs === w2.startMs + 500 && savedFile?.cues[2].startMs === w2.startMs && shownFile.cues.length === imp.cues.length,
  { checked: dlgExport?.checked, shown: shownFile && shownFile.cues[2].startMs - w2.startMs, saved: savedFile && savedFile.cues[2].startMs - w2.startMs, name: shownFile?.name });

  // ===== AC4: أخطاء التوقيت تُعرض وتمنع، والتحذيرات لا تمنع، ولا إصلاح تلقائي =====
  await run(E.reveal, 9, 'end');
  await typeInto(row(9, 'end'), '00:00:00,500', { enter: true });
  await run(E.reveal, 10, 'start');
  await typeInto(row(10, 'start'), '00:01:xx', { enter: true });
  s = await info();
  const c9 = await run(E.cue, 9);
  check('timing-errors-listed-and-block', s.issues.pill.startsWith('خطآن') && s.issues.items.length >= 2 && s.save.disabled && s.save.title === 'صحّح خطأي التوقيت أولًا.'
    && s.export.disabled && c9.endMs === 500 && (await run(E.field, 10, 'start')) === '00:01:xx',
  { pill: s.issues.pill, items: s.issues.items.slice(0, 3), save: s.save, export: s.export, keptEnd: c9.endMs });
  await shoot('p8-errors');
  check('layout-fills-window-without-page-scroll', s.layout.pageOverflow <= 0 && s.layout.pageScroll === 0 && s.layout.listHeight > 300 && s.layout.listHeight < 900, s.layout);
  await clickOn('.ed-issue', '10');
  const act = await run(E.active);
  check('issue-jumps-to-cue', act.index === 9 && act.field === 'end', act);
  await ed.key('Escape', 'Escape', 27);
  await run(E.reveal, 10, 'start');
  await ed.key('Escape', 'Escape', 27);
  await clickOn('.ed-head button', 'تراجع');
  s = await info();
  check('errors-cleared-by-user-not-auto', !s.issues.pill.includes('خط') && !s.save.disabled, { pill: s.issues.pill, save: s.save });
  await run(E.reveal, 11, 'end');
  await typeInto(row(11, 'end'), formatSrtTime(imp.cues[12].startMs + 400), { enter: true });
  s = await info();
  check('warnings-do-not-block-save', s.issues.pill.includes('تحذير') && !s.save.disabled && s.export.disabled === false, { pill: s.issues.pill, save: s.save });
  await clickOn('.ed-head button', 'تراجع');

  // ===== AC6: المقارنة والاستعادة اليدوية للتوقيت بمعاينة وتأكيد =====
  await sleep(400);
  s = await info();
  const cmpBefore = s.compare;
  await clickOn('.ed-side button', 'استعادة التوقيت الأصلي');
  s = await info();
  const dlgRestore = s.dialog;
  await shoot('p8-compare');
  await clickOn('dialog[open] button', 'تطبيق على');
  await sleep(400);
  s = await info();
  const restored = (await run(E.starts, 0, 8)).every((x, k) => x === imp.cues[k].startMs);
  await clickOn('.ed-head button', 'تراجع');
  const undoRestore = (await run(E.cue, 2)).startMs - imp.cues[2].startMs;
  await clickOn('.ed-head button', 'إعادة');
  check('comparison-and-manual-restore', cmpBefore.some((t) => t.startsWith('توقيت مختلف في 4')) && dlgRestore?.rows === 4 && dlgRestore.buttons[0].label === 'تطبيق على 4 مقاطع'
    && restored && s.compare.includes('مطابق للأصل ✓') && undoRestore === 500 && (await run(E.cue, 2)).startMs === imp.cues[2].startMs,
  { before: cmpBefore, previewRows: dlgRestore?.rows, confirm: dlgRestore?.buttons[0].label, after: s.compare, restored, undoRestore });

  // ===== AC5: «تثبيت الإزاحة» يصفّرها في خطوة واحدة =====
  await clickOn(row(2, 'text'));
  await ed.send('Input.insertText', { text: ' — معدّل' });
  await settle();
  await clickOn('.ed-offset button', 'تثبيت الإزاحة');
  s = await info();
  const committed = await run(E.cue, 0);
  const commitOk = s.offset.includes('0.0') && s.offsetMs === 0 && committed.startMs === imp.cues[0].startMs + 500 && s.commit.disabled;
  await clickOn('.ed-head button', 'تراجع');
  const back = await info();
  await clickOn('.ed-head button', 'إعادة');
  s = await info();
  check('commit-offset-one-step', commitOk && back.offsetMs === 500 && (await run(E.cue, 0)).startMs === imp.cues[0].startMs + 500 && s.offsetMs === 0 && s.offsetSub.startsWith('ثُبّتت الإزاحة +0.5'),
    { commitOk, undoOffset: back.offsetMs, redoOffset: s.offsetMs, sub: s.offsetSub });

  // ===== AC3: حارس المغادرة (داخل الصفحة وعند الإغلاق) =====
  await clickOn('.ed-head button', '→ المحفوظات');
  s = await info();
  const leaveDlg = s.dialog;
  await clickOn('dialog[open] button', 'البقاء');
  const stayUrl = await ed.eval(() => location.pathname);
  const dialogSeen = ed.conn.waitFor('Page.javascriptDialogOpening', (p) => p.type === 'beforeunload', { sessionId: ed.sessionId, timeoutMs: 5000 }).catch(() => null);
  const nav = ed.send('Page.navigate', { url: 'about:blank' }).catch((e) => ({ error: e.message }));
  const bu = await dialogSeen;
  if (bu) await ed.send('Page.handleJavaScriptDialog', { accept: false });
  await nav;
  await settle(500);
  const stillHere = await ed.eval(() => location.pathname).catch(() => null);
  check('leave-guard', leaveDlg?.title === 'مغادرة دون حفظ؟' && leaveDlg.body === 'لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟' && stayUrl.endsWith('/editor/index.html')
    && !!bu && stillHere?.endsWith('/editor/index.html'), { inPage: leaveDlg?.title, beforeunload: bu?.type ?? null, stillHere });

  // ===== AC3: الحفظ يُبقي الأصل، وينعكس في المشغّل المفتوح =====
  const expectText = (await run(E.cue, 2)).text;
  await clickOn('.ed-head button', 'حفظ');
  await sleep(800);
  s = await info();
  const stored = await iso(P.stored, VIDEO);
  const pl = await yt.waitFor((t) => {
    const st = globalThis.__tarjuman?.controller.getState();
    return st && st.arabic?.edited === true && st.arabic.cues[2].text === t ? st.view.displayOffsetMs + 1 : null;
  }, { contextId: isoId, args: [expectText], timeoutMs: 5000, intervalMs: 150 });
  check('save-keeps-original', s.status === 'محفوظ ✓' && !s.dirty && stored.current?.[2].text === expectText && stored.original[2].text === imp.cues[2].text
    && stored.original[0].startMs === imp.cues[0].startMs && stored.current[0].startMs === imp.cues[0].startMs + 500 && stored.offset === 0 && s.versions.length === 2,
  { status: s.status, rev: stored.rev, offset: stored.offset, versions: s.versions });
  check('save-reflected-in-open-player', pl === 1, { playerOffset: pl === null ? null : pl - 1 });

  // ===== الأصل المستورد: للعرض والتصدير، ثم استعادته بتأكيد =====
  await ed.eval(() => { const sel = document.querySelector('.ed-head select'); sel.value = 'original'; sel.dispatchEvent(new Event('change')); });
  await settle();
  s = await info();
  const orig2 = await run(E.cue, 2);
  check('original-view-read-only', s.view === 'original' && s.readOnlyRow && orig2.text === imp.cues[2].text && s.preview === 'الأصل المستورد للعرض والتصدير فقط. اختر «النسخة المعدّلة» للتعديل.',
    { view: s.view, readOnly: s.readOnlyRow });
  await clickOn('.ed-head button', 'تصدير');
  const origFile = await downloadFromDialog();
  check('export-original', origFile?.name === `${VIDEO}.ar.original.srt` && origFile.cues[0].startMs === imp.cues[0].startMs && origFile.cues[2].text === imp.cues[2].text, { name: origFile?.name });
  await ed.eval(() => { const sel = document.querySelector('.ed-head select'); sel.value = 'edit'; sel.dispatchEvent(new Event('change')); });
  await settle();
  await clickOn('.ed-head button', 'استعادة الأصل');
  s = await info();
  const restoreDlg = s.dialog;
  await clickOn('dialog[open] button', 'استعادة الأصل');
  await sleep(800);
  s = await info();
  const stored2 = await iso(P.stored, VIDEO);
  const pl2 = await yt.waitFor(() => globalThis.__tarjuman?.controller.getState().arabic?.edited === false, { contextId: isoId, timeoutMs: 5000, intervalMs: 150 });
  check('restore-original-with-confirm', restoreDlg?.title === 'استعادة الأصل المستورد؟' && stored2.current === null && stored2.original[2].text === imp.cues[2].text && s.versions.length === 1 && !!pl2,
    { dialog: restoreDlg?.title, current: stored2.current, player: !!pl2 });

  // ===== التعارض: تعديل غير محفوظ ثم ± من المشغّل =====
  await clickOn(row(1, 'text'));
  await ed.send('Input.insertText', { text: ' — غير محفوظ' });
  await settle();
  const off1 = await iso(P.nudge, 1);
  const banner = await ed.waitFor(() => { const b = document.querySelector('.ed-banner'); return b && !b.hidden ? b.textContent : null; }, { timeoutMs: 5000, intervalMs: 150 });
  s = await info();
  check('external-change-while-dirty', !!banner && banner.includes('تغيّر السجل من مكان آخر') && s.save.disabled && s.dirty, { playerOffset: off1, save: s.save });
  await clickOn('.ed-banner button', 'إعادة الفتح');
  await clickOn('dialog[open] button', 'المغادرة دون حفظ');
  await sleep(700);
  s = await info();
  const reopened = !s.dirty && s.offsetMs === off1 && !s.banner;
  const off2 = await iso(P.nudge, -1);
  const silent = await ed.waitFor((o) => globalThis.__tarjumanEditor.state.session.offsetMs === o, { args: [off2], timeoutMs: 5000, intervalMs: 150 });
  s = await info();
  check('reopen-and-silent-reload', reopened && !!silent && !s.banner, { reopened, offsetAfter: s.offsetMs, toast: s.toast });

  // ===== AC1: ملف كبير (2140 مقطعًا) =====
  await ed.goto(`chrome-extension://${extId}/pages/editor/index.html?v=${BIG}`);
  const openOk = await ed.waitFor(E.ready, { timeoutMs: 20000, intervalMs: 50 });
  const openedMs = await run(E.openedMs);
  await run(E.observe);
  s = await info();
  const sweep = await run(E.scrollSweep, 80);
  await run(E.reveal, 1069, 'text');
  await settle();
  await ed.eval(() => { const a = document.activeElement; a.setSelectionRange(a.value.length, a.value.length); });
  for (const ch of ' كلمة جديدة') {
    await ed.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
    await ed.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    await sleep(60);
  }
  await settle();
  const typed = (await run(E.cue, 1069)).text.endsWith(' كلمة جديدة');
  const typing = await run(E.events);
  await clickOn('.ed-seg__opt', 'الملف كله');
  await clickOn('.ed-toolbar button', '+');
  await settle(600);
  const shiftAll = await run(E.events);
  const shiftedAll = (await run(E.cue, BIG_COUNT - 1)).startMs === bigAr.at(-1).startMs + 500;
  await clickOn('.ed-head button', 'تراجع');
  await settle(600);
  const undoAll = await run(E.events);
  s = await info();
  result.perf = { openedMs, sweep, typing, shiftAll, undoAll, rowsInDom: s.rowsInDom };
  check('large-file-virtual-list', !!openOk && s.rowsInDom < 80 && sweep.emptyFrames === 0 && sweep.rowsMax < 80 && sweep.counter?.endsWith(`من ${BIG_COUNT}`), { rowsInDom: s.rowsInDom, sweep });
  check('large-file-smooth-editing', openedMs < 3000 && typed && typing.maxKey < 100 && shiftedAll && shiftAll.maxClick < 250 && undoAll.maxClick < 250 && sweep.p95FrameMs < 50,
    { openedMs, typed, typingMaxMs: typing.maxKey, shiftAllMs: shiftAll.maxClick, undoAllMs: undoAll.maxClick, p95FrameMs: sweep.p95FrameMs });
  await run(E.reveal, 1069, 'text');
  await settle();
  await shoot('p8-large');
  await emulateScheme(ed, 'dark');
  await settle(300);
  await shoot('p8-dark');
  await emulateScheme(ed, 'light');

  await sleep(300);
  errs.stop();
  result.errors = errs.list;
  check('no-extension-errors', errs.list.length === 0, errs.list.slice(0, 5));
  check('no-network-from-editor', net.length === 0, { requests: net.length });
} catch (err) {
  check('run-aborted', false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
} finally {
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'editor-live.json'), `${JSON.stringify(result, null, 2)}\n`);
  await rm(DL, { recursive: true, force: true }).catch(() => {});
  await b.close();
}
const failed = result.checks.filter((c) => !c.ok);
console.log(`\nالنتيجة: ${result.checks.length - failed.length}/${result.checks.length}`);
process.exit(failed.length ? 1 : 0);
