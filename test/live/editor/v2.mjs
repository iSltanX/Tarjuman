#!/usr/bin/env node
// الاختبار الحي للمحرّر في الإصدار الثاني (P14، بروتوكول «الاختبارات الحية»): بناء التطوير في ملف اختبار منفصل ومجلد تنزيلات
// داخله، وتبويب يوتيوب حقيقي (TED `iG9CE55wbtY`) تُزرع فيه حزم الترجمات عبر تخزين الإضافة نفسه، ثم يُفتح المحرّر بعنوانه
// ويُختبر بنقرات وكتابة حقيقية عبر CDP: الخانات 1 2 3 والعمود المرجعي، والبحث والاستبدال، والدمج والشطر والانجراف
// والكثافة، والقفز إلى الفيديو (تبويب مفتوح، وغائب، وأكثر من تبويب)، ولوحة المراجعة والعلامات وآخر موضع، والاستكمال على
// 900 مقطع ينقصها 12 بجزأين، وإنقاذ المسودة عند التعارض، واختيار المرجع، والتقرير والنص الدراسي، ومكان الحفظ؛ ثم الأداء
// على 2400 مقطع. النص العربي اصطناعي، والإنجليزي الحقيقي يُخفى من اللقطات.
//   node test/live/editor/v2.mjs [--browser brave] [--headed] [--out docs/evidence/P14] [--dry]
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { attach, collectErrors, emulateScheme, openTab, waitForTarget } from '../harness/extension.mjs';
import { dismissConsent, waitForPlayer } from '../harness/youtube.mjs';
import { englishTrack, realTrack } from '../../helpers/fixtures.js';
import { arabicTwin, longTrack } from '../../fixtures/v2/index.js';
import { compare } from '../../../src/core/compare/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { cueTextHash } from '../../../src/core/model/marks.js';
import { validateBundle } from '../../../src/core/model/slots.js';
import { parseSrtLenient } from '../../../src/core/srt/lenient.js';
import { formatSrtTime } from '../../../src/core/srt/time.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const HEADED = argv.includes('--headed');
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P14'));
const PROFILE = `${browser}-p14`;
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const DL = path.join(PROFILE_ROOT, `downloads-${browser}-p14`, RUN);
const EXT = path.join(PROFILE_ROOT, 'ext-p14-dev');
const VIDEO = 'iG9CE55wbtY';
const GAP = 'TJp14gap001';
const BIG = 'TJp14big001';
const NOW = new Date().toISOString();
const GAP_DROP = [7, 8, 9, 150, 299, 300, 301, 520, 521, 777, 899, 900];

const result = { browser: null, at: NOW, headless: !HEADED, videos: { ted: VIDEO, gap: GAP, big: BIG }, checks: [], perf: {}, screenshots: [], errors: {} };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};

// ---- البيانات: حزم بثلاث خانات تُزرع عبر تخزين الإضافة ----
const real = realTrack('manual');
const ted = englishTrack({ kind: 'manual', cues: real.cues, capturedAt: NOW });
const tedKey = { key: ted.key, lang: ted.lang, kind: ted.kind, cues: ted.cues };
const fp1 = buildExport({ videoId: VIDEO, track: tedKey, mode: 'normal', now: NOW }).fingerprint;
const fp2 = buildExport({ videoId: VIDEO, track: tedKey, mode: 'normal', split: { size: 200 }, now: Date.parse(NOW) + 1000 }).fingerprint;
const arOf = (label) => fp1.cues.map((c) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: `${label} للمقطع ${c.n}` }));
const track = (label, cues, fpId) => ({
  fileName: `${VIDEO}.${label}.ar.srt`, importedAt: NOW, original: cues, current: null, editedAt: null,
  fingerprintId: fpId, comparison: fpId ? compare(cues, fpId === fp1.id ? fp1 : fp2, { driftMs: 100 }) : null, notes: [],
});
const mark = (c, kind) => ({ n: c.n, startMs: c.startMs, textHash: cueTextHash(c.text), kind, at: NOW });
const t1 = track('أولى', arOf('ترجمة'), fp1.id);
const t2 = track('ثانية', arOf('ترجمة ثانية'), fp1.id);
const tedBundle = {
  videoId: VIDEO, active: 1, previous: null,
  record: {
    schema: 1, videoId: VIDEO, title: 'P14 — فيديو TED حقيقي', durationMs: null, createdAt: NOW, updatedAt: NOW, rev: 1,
    english: [ted], fingerprints: [fp1, fp2], arabic: structuredClone(t1), view: { displayOffsetMs: 500, displayMode: 'ar' },
  },
  slots: [
    { n: 1, name: null, track: t1, offsetMs: 500, marks: [mark(t1.original[3], 'todo')], position: null },
    { n: 2, name: 'مراجعة', track: t2, offsetMs: 0, marks: [mark(t2.original[20], 'todo'), { n: 999, startMs: 359000000, textHash: '0badc0de', kind: 'done', at: NOW }], position: { n: 100, startMs: t2.original[99].startMs, at: NOW } },
    { n: 3, name: null, track: null, offsetMs: 0, marks: [], position: null },
  ],
};

const gapEn = englishTrack({ kind: 'asr', cues: longTrack(900), capturedAt: NOW });
const gapFp = buildExport({ videoId: GAP, track: { key: gapEn.key, lang: 'en', kind: 'asr', cues: gapEn.cues }, mode: 'normal', split: { size: 300 }, now: NOW }).fingerprint;
const gapAr = arabicTwin(gapEn.cues).filter((c) => !GAP_DROP.includes(c.n));
const gapTrack = { fileName: `${GAP}.ar.srt`, importedAt: NOW, original: gapAr, current: null, editedAt: null, fingerprintId: gapFp.id, comparison: compare(gapAr, gapFp, { driftMs: 100 }), notes: [] };
const gapBundle = {
  videoId: GAP, active: 1, previous: null,
  record: { schema: 1, videoId: GAP, title: 'P14 — 900 مقطع ينقصها 12', durationMs: null, createdAt: NOW, updatedAt: NOW, rev: 1, english: [gapEn], fingerprints: [gapFp], arabic: structuredClone(gapTrack), view: { displayOffsetMs: 0, displayMode: 'ar' } },
  slots: [{ n: 1, name: null, track: gapTrack, offsetMs: 0, marks: [], position: null }, { n: 2, name: null, track: null, offsetMs: 0, marks: [], position: null }, { n: 3, name: null, track: null, offsetMs: 0, marks: [], position: null }],
};

const bigEn = englishTrack({ kind: 'asr', cues: longTrack(2400, { seed: 41 }), capturedAt: NOW });
const bigFp = buildExport({ videoId: BIG, track: { key: bigEn.key, lang: 'en', kind: 'asr', cues: bigEn.cues }, mode: 'normal', now: NOW }).fingerprint;
const bigAr = arabicTwin(bigEn.cues, { seed: 43 });
const bigTrack = { fileName: `${BIG}.ar.srt`, importedAt: NOW, original: bigAr, current: null, editedAt: null, fingerprintId: bigFp.id, comparison: compare(bigAr, bigFp, { driftMs: 100 }), notes: [] };
const bigBundle = {
  videoId: BIG, active: 1, previous: null,
  record: { schema: 1, videoId: BIG, title: 'P14 — ملف كبير (2400 مقطع)', durationMs: null, createdAt: NOW, updatedAt: NOW, rev: 1, english: [bigEn], fingerprints: [bigFp], arabic: structuredClone(bigTrack), view: { displayOffsetMs: 0, displayMode: 'ar' } },
  slots: [{ n: 1, name: null, track: bigTrack, offsetMs: 0, marks: [], position: null }, { n: 2, name: null, track: null, offsetMs: 0, marks: [], position: null }, { n: 3, name: null, track: null, offsetMs: 0, marks: [], position: null }],
};
check('data-prepared', gapTrack.comparison.missing.length === 12 && t1.comparison.matched && bigAr.length === 2400 && fp2.parts?.length > 1,
  { gapMissing: gapTrack.comparison.missing.length, ted: t1.original.length, big: bigAr.length });
const valid = [tedBundle, gapBundle, bigBundle].map((x) => validateBundle(x));
check('bundles-valid', valid.every((r) => r.ok), valid.filter((r) => !r.ok));
if (argv.includes('--dry')) {
  console.log(`\nتجهيز فقط (--dry): ${result.checks.filter((c) => c.ok).length}/${result.checks.length}`);
  process.exit(result.checks.every((c) => c.ok) ? 0 : 1);
}

// ---- دوال تُنفَّذ داخل الصفحات (مستقلة بلا إغلاق خارجي) ----
const P = {
  seed: async (bundles) => {
    const t = globalThis.__tarjuman;
    for (const b of bundles) await t.store.updateBundle(b.videoId, () => b);
    await t.store.setPrefs({ saveLocation: { mode: 'downloads', folder: 'Tarjuman' }, review: { maxCps: null } });
    await t.controller.reload();
    return t.controller.getState().activeSlot;
  },
  player: () => {
    const s = globalThis.__tarjuman.controller.getState();
    return { activeSlot: s.activeSlot, cue0: s.arabic?.cues[0]?.text ?? null, count: s.arabic?.cues.length ?? 0, marks: s.marks?.items.length ?? 0 };
  },
  markCue: async (index) => {
    await globalThis.__tarjuman.controller.markCue({ index }, 'todo');
    return globalThis.__tarjuman.controller.getState().marks?.items.length ?? 0;
  },
  /** كتابة من مكان آخر في محتوى الخانة النشطة: نص مقطع في النسخة الحالية. */
  editActive: async (videoId, index, text) => {
    const t = globalThis.__tarjuman;
    await t.store.updateBundle(videoId, (b) => {
      const a = b.record.arabic;
      const cues = (a.current ?? a.original).map((c) => ({ ...c }));
      cues[index].text = text;
      a.current = cues;
      a.editedAt = new Date().toISOString();
      return b;
    });
    return true;
  },
  slot: async (videoId, n) => {
    const b = await globalThis.__tarjuman.store.getBundle(videoId);
    const s = b.slots[n - 1];
    return s.track && { current: s.track.current ? s.track.current.length : null, text: (s.track.current ?? s.track.original).slice(0, 8).map((c) => c.text), fp: s.track.fingerprintId, marks: s.marks.length, position: s.position, active: b.active, rev: b.record.rev };
  },
  slotCues: async (videoId, n) => {
    const b = await globalThis.__tarjuman.store.getBundle(videoId);
    const t = b.slots[n - 1].track;
    return (t.current ?? t.original).map((c) => [c.n, c.startMs, c.endMs, c.text]);
  },
  prefs: async (patch) => {
    await globalThis.__tarjuman.store.setPrefs(patch);
    return true;
  },
  time: () => Math.round((document.querySelector('video')?.currentTime ?? -1) * 1000),
  pause: () => { document.querySelectorAll('video').forEach((v) => { v.muted = true; v.pause(); }); return true; },
};
const E = {
  ready: () => Boolean(globalThis.__tarjumanEditor && document.querySelector('.ed-row[data-index]')),
  info: () => {
    const q = (s) => document.querySelector(s);
    const t = (s) => q(s)?.textContent.trim() ?? null;
    const s = globalThis.__tarjumanEditor.state;
    const dlg = q('dialog[open]');
    return {
      slot: s.slot, active: s.opened.active, view: s.view, count: s.session.count, dirty: s.session.dirty, changed: s.session.changedCount,
      history: s.session.historySize, external: s.external, activeIndex: s.activeIndex,
      picker: [...document.querySelectorAll('.ed-head .tj-slots__slot')].map((b) => ({ n: b.textContent, checked: b.getAttribute('aria-checked'), label: b.getAttribute('aria-label') })),
      note: t('.ed-slot-note'), counter: t('.ed-counter'), status: t('.ed-status'), result: q('.ed-result') && !q('.ed-result').hidden ? t('.ed-result') : null,
      preview: t('.ed-preview'), toast: q('.ed-toast.is-shown') ? t('.ed-toast') : null, banner: q('.ed-banner') && !q('.ed-banner').hidden ? t('.ed-banner') : null,
      refCol: q('.ed-ref-select')?.value ?? null, refOptions: [...(q('.ed-ref-select')?.options ?? [])].map((o) => o.text),
      search: { count: t('.ed-search__count'), where: q('.ed-search__where') && !q('.ed-search__where').hidden ? t('.ed-search__where') : null, focus: document.activeElement?.classList.contains('ed-search__input') ?? false },
      matchRows: document.querySelectorAll('.ed-row.has-match, .ed-row.is-match-current').length,
      tabs: [...document.querySelectorAll('.ed-tab')].map((b) => `${b.textContent}:${b.getAttribute('aria-selected')}`),
      marks: [...document.querySelectorAll('.ed-markgroup h3')].map((h) => h.textContent),
      density: t('[aria-label="الكثافة"] .tj-pill'), issues: t('[aria-label="المشكلات"] .tj-pill'),
      compare: [...document.querySelectorAll('.ed-cmp__line')].map((l) => l.textContent), restoreBtn: [...document.querySelectorAll('.ed-side button')].some((b) => b.textContent.startsWith('استعادة التوقيت الأصلي')),
      refPanel: t('[aria-label="المرجع الإنجليزي"]'), refChoice: q('.ed-ref-choice')?.value ?? null,
      complete: t('[aria-label="الاستكمال"]'), resumeChip: q('.ed-resume-chip') && !q('.ed-resume-chip').hidden ? t('.ed-resume-chip') : null,
      resume: [...document.querySelectorAll('.ed-resume__item')].map((r) => r.textContent),
      comparison: s.comparison ? { missing: s.comparison.missing.length, restore: s.comparison.restoreTimingAvailable, fp: s.comparison.fingerprintId } : null,
      parts: s.parts ? s.parts.map((p) => `${p.index}:${p.received}/${p.total}`) : null,
      fp: s.fp?.id ?? null, url: location.search, lastSeek: s.lastSeek,
      dialog: dlg ? {
        title: dlg.querySelector('.tj-dialog__title')?.textContent ?? null, text: dlg.textContent.slice(0, 600),
        buttons: [...dlg.querySelectorAll('.tj-dialog__footer button')].map((b) => ({ value: b.value, label: b.textContent.trim(), disabled: b.getAttribute('aria-disabled') === 'true' })),
        checks: dlg.querySelectorAll('input[type=checkbox]').length, checked: dlg.querySelectorAll('input[type=checkbox]:checked').length,
      } : null,
      layout: { pageOverflow: document.scrollingElement.scrollHeight - innerHeight },
    };
  },
  cue: (i) => {
    const c = globalThis.__tarjumanEditor.state.session.cueAt(i);
    return { n: c.n, startMs: c.startMs, endMs: c.endMs, text: c.text };
  },
  times: () => {
    const s = globalThis.__tarjumanEditor.state.session;
    return Array.from({ length: s.count }, (_, i) => `${s.cueAt(i).n}|${s.cueAt(i).startMs}|${s.cueAt(i).endMs}`).join(',');
  },
  probe: (sel, label) => {
    document.querySelectorAll('[data-probe]').forEach((x) => x.removeAttribute('data-probe'));
    const list = [...document.querySelectorAll(sel)];
    const hit = label === null ? list[0] : list.find((x) => (x.textContent.trim() || x.getAttribute('aria-label') || '').startsWith(label) || (x.getAttribute('aria-label') ?? '').startsWith(label));
    if (!hit) return false;
    hit.setAttribute('data-probe', '1');
    return true;
  },
  reveal: (i) => {
    globalThis.__tarjumanEditor.jumpTo(i, 'text');
    return true;
  },
  caret: (i, at) => {
    const ta = document.querySelector(`.ed-row[data-index="${i}"] [data-field="text"]`);
    ta.focus();
    ta.setSelectionRange(at, at);
    ta.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    return ta.value.length;
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
  scrollSweep: async (steps) => {
    const sc = document.querySelector('.ed-list');
    const total = sc.scrollHeight - sc.clientHeight;
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(performance.now())));
    const frames = [];
    let rowsMax = 0;
    for (let k = 1; k <= steps; k++) {
      sc.scrollTop = Math.round((total * k) / steps);
      const a = await frame();
      const b = await frame();
      frames.push(b - a);
      rowsMax = Math.max(rowsMax, document.querySelectorAll('.ed-row').length);
    }
    const sorted = frames.sort((a, b) => a - b);
    return { steps, maxFrameMs: Math.round(sorted.at(-1) ?? 0), p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), rowsMax };
  },
  hideEnglish: () => {
    document.querySelectorAll('.ed-row__en').forEach((p) => { if (p.dir === 'ltr') p.textContent = '…'; });
    return true;
  },
};

execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', EXT], { stdio: 'ignore' });
await rm(DL, { recursive: true, force: true });
await mkdir(DL, { recursive: true });
await mkdir(OUT, { recursive: true });
// إعدادات التنزيل في ملف تعريف الاختبار وحده: مجلده، وبلا سؤال.
{
  const file = path.join(PROFILE_ROOT, PROFILE, 'Default', 'Preferences');
  await mkdir(path.dirname(file), { recursive: true });
  let prefs = {};
  try {
    prefs = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // ملف تعريف جديد.
  }
  prefs.download = { ...(prefs.download ?? {}), default_directory: DL, prompt_for_download: false, directory_upgrade: true };
  prefs.savefile = { ...(prefs.savefile ?? {}), default_directory: DL };
  await writeFile(file, JSON.stringify(prefs));
}

const b = await launch({ browser, profile: PROFILE, headless: !HEADED });
result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
console.log(`P14 المحرّر — ${result.browser}`);
let yt;
let ed;
let extId;
let isoId;
const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
const run = (fn, ...args) => ed.eval(fn, { args });
const info = () => run(E.info);
const settle = (ms = 350) => sleep(ms);
const shoot = async (name) => {
  await run(E.hideEnglish).catch(() => {});
  const f = path.join(OUT, `${name}-${browser}.png`);
  await ed.screenshot(f);
  result.screenshots.push(path.relative(ROOT, f));
};
async function clickOn(sel, label = null) {
  // صف خارج المدى المرسوم (القائمة افتراضية): يُمرَّر إليه أولًا.
  const rowIndex = /^\.ed-row\[data-index="(\d+)"\]/.exec(sel)?.[1];
  if (rowIndex !== undefined) await run(E.reveal, Number(rowIndex));
  if (!(await run(E.probe, sel, label))) throw new Error(`لا عنصر: ${sel} ${label ?? ''}`);
  const c = await ed.centerOf('[data-probe="1"]');
  if (!c) throw new Error(`عنصر غير ظاهر: ${sel} ${label ?? ''}`);
  await ed.click(c.x, c.y);
  await settle();
}
async function hoverOn(sel, label = null) {
  if (!(await run(E.probe, sel, label))) throw new Error(`لا عنصر: ${sel} ${label ?? ''}`);
  const c = await ed.centerOf('[data-probe="1"]');
  await ed.mouseMove(c.x, c.y);
  await settle(250);
}
async function typeText(text) {
  await ed.send('Input.insertText', { text });
  await settle();
}
async function cmd(code, key, keyCode, { shift = false } = {}) {
  const modifiers = 4 | (shift ? 8 : 0);
  await ed.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  await ed.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  await settle();
}
const rowSel = (i, f) => `.ed-row[data-index="${i}"] [data-field="${f}"]`;
const actSel = (i, a) => `.ed-row[data-index="${i}"] [data-act="${a}"]`;
async function rowAction(i, a) {
  await run(E.reveal, i);
  await hoverOn(`.ed-row[data-index="${i}"] .ed-row__n`);
  await clickOn(actSel(i, a));
}
async function openEditor(query) {
  await ed.goto(`chrome-extension://${extId}/pages/editor/index.html?${query}`);
  return ed.waitFor(E.ready, { timeoutMs: 20000 });
}
async function menu(label, item) {
  await clickOn('.ed-head .tj-menu__button, .ed-toolbar .tj-menu__button', label);
  await clickOn('.tj-menu__item', item);
}
/** الملفات الجديدة في مجلد تنزيلات الاختبار (ومجلده الفرعي) بعد نقطة زمنية. */
async function newFiles(before, sub = '') {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    let names = [];
    try {
      names = (await readdir(path.join(DL, sub))).filter((n) => !n.endsWith('.crdownload'));
    } catch {
      names = [];
    }
    const fresh = names.filter((n) => !before.has(path.join(sub, n)));
    if (fresh.length) return Promise.all(fresh.map(async (n) => ({ name: n, path: path.join(DL, sub, n), text: await readFile(path.join(DL, sub, n), 'utf8') })));
    await sleep(200);
  }
  return [];
}
async function snapshotDl() {
  const out = new Set();
  for (const sub of ['', 'Tarjuman']) {
    try {
      for (const n of await readdir(path.join(DL, sub))) out.add(path.join(sub, n));
    } catch {
      // لا مجلد بعد.
    }
  }
  return out;
}
async function setFiles(selector, files) {
  const { root } = await ed.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await ed.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  await ed.send('DOM.setFileInputFiles', { nodeId, files });
  await settle(800);
}
const ONLY = val('only')?.split(',') ?? null;
async function step(id, fn) {
  if (ONLY && !ONLY.some((p) => id.startsWith(p))) return;
  try {
    await fn();
  } catch (err) {
    check(id, false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
    await ed?.eval(() => document.querySelector('dialog[open]')?.close()).catch(() => {});
  }
}

try {
  // تبويبات يستعيدها المتصفح من جولة سابقة في ملف الاختبار (محرّر أو فيديو) تُغلق، فلا تُحسب «مفتوحة» في القفز.
  for (const x of (await b.conn.send('Target.getTargets')).targetInfos) {
    if (x.type === 'page' && x.url !== 'about:blank') await b.conn.send('Target.closeTarget', { targetId: x.targetId }).catch(() => {});
  }
  const ext = await loadExtension(b.conn, EXT);
  check('load-unpacked', !ext.error, ext.error ? { error: ext.error } : { method: ext.method });
  if (ext.error) throw new Error('تعذّر تحميل الإضافة');
  extId = ext.id;

  yt = await openTab(b.conn, 'about:blank');
  result.errors.player = collectErrors(yt, { extId, onlyExtension: true }).list;
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  const ready = await waitForPlayer(yt, VIDEO, 30000);
  await yt.eval(P.pause).catch(() => {});
  if (await yt.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  await sleep(1500);
  isoId = yt.isolatedContextId(extId);
  if (!ready || !isoId) throw new Error('المشغّل أو سياق الإضافة غير جاهز');
  const active = await iso(P.seed, [tedBundle, gapBundle, bigBundle]);
  check('bundles-seeded-through-extension-store', active === 1, { active });

  ed = await openTab(b.conn, 'about:blank');
  const edErrors = collectErrors(ed, { extId });
  const net = [];
  ed.on('Network.requestWillBeSent', (e) => { if (!/^(chrome-extension|data|blob):/.test(e.request.url)) net.push(1); });
  await ed.send('Network.enable');
  await ed.send('DOM.enable');
  await ed.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await emulateScheme(ed, 'light');

  // ===== AC1: الخانة النشطة أو المحددة، والتبديل بتنبيه، والحفظ في الخانة نفسها، والعمود المرجعي =====
  await step('ac1-slots', async () => {
    check('ac1-opens-active', await openEditor(`v=${VIDEO}`), null);
    let s = await info();
    check('ac1-active-slot-1', s.slot === 1 && s.picker[0].checked === 'true' && s.note.includes('وهي النشطة في المشغّل') && s.url.includes('t=1'), { slot: s.slot, note: s.note, picker: s.picker });
    await openEditor(`v=${VIDEO}&t=2`);
    s = await info();
    check('ac1-opens-slot-2', s.slot === 2 && s.active === 1 && s.note.includes('«مراجعة»') && s.note.includes('النشطة في المشغّل الترجمة 1'), { slot: s.slot, note: s.note });
    check('ac5-resume-chip', s.resumeChip === 'تابع من المقطع 100', { chip: s.resumeChip });
    await clickOn('.ed-resume-chip');
    s = await info();
    check('ac5-resume-jumps', s.activeIndex === 99, { activeIndex: s.activeIndex });
    check('ac1-reference-options', s.refOptions.includes('الإنجليزية') && s.refOptions.includes('الترجمة 1'), { options: s.refOptions });
    await ed.eval(() => { const sel = document.querySelector('.ed-ref-select'); sel.value = '1'; sel.dispatchEvent(new Event('change')); });
    await settle();
    await run(E.reveal, 0);
    await settle();
    const refText = await ed.eval(() => document.querySelector('.ed-row[data-index="0"] .ed-row__en')?.textContent ?? '');
    const refDir = await ed.eval(() => document.querySelector('.ed-row[data-index="0"] .ed-row__en')?.dir ?? '');
    check('ac1-reference-other-translation', refText.startsWith('ترجمة للمقطع') && refDir === 'rtl', { refText: refText.slice(0, 40), refDir });
    await shoot('ac1-slot2-reference');
    await clickOn(rowSel(0, 'text'));
    await ed.eval(() => { const ta = document.querySelector('.ed-row[data-index="0"] [data-field="text"]'); ta.setSelectionRange(ta.value.length, ta.value.length); });
    await typeText(' — عُدّل في الخانة 2');
    await clickOn('.ed-head .tj-slots__slot', '1');
    s = await info();
    check('ac1-switch-guard', s.dialog?.title === 'التبديل إلى الترجمة 1؟' && s.dialog.buttons.map((x) => x.value).join(',') === 'stay,save,switch', s.dialog);
    await shoot('ac1-switch-guard');
    await clickOn('dialog[open] button', 'البقاء');
    await cmd('KeyS', 'س', 83);
    await settle(800);
    const stored = await iso(P.slot, VIDEO, 2);
    const player = await iso(P.player);
    check('ac1-save-in-same-slot-active-unchanged', stored.current === t2.original.length && stored.text[0].endsWith('عُدّل في الخانة 2') && stored.active === 1 && player.activeSlot === 1 && player.cue0 === t1.original[0].text,
      { stored: stored.text[0], active: stored.active, player });
    await clickOn('.ed-head .tj-slots__slot', '1');
    s = await info();
    check('ac1-switch-clean', s.slot === 1 && !s.dialog && s.url.includes('t=1'), { slot: s.slot, url: s.url });
  });

  // ===== AC2: البحث والاستبدال بمعاينة واختيار، خطوة واحدة، بلا تغيير توقيت =====
  await step('ac2-search', async () => {
    const before = await run(E.times);
    await clickOn(rowSel(2, 'text'));
    await cmd('KeyF', 'ب', 70);
    let s = await info();
    check('ac2-cmd-f-focuses-search', s.search.focus, null);
    await typeText('للمقطع 1');
    await settle(400);
    s = await info();
    const [k0, total] = (s.search.count ?? '').split(' من ').map(Number);
    check('ac2-results-counter', k0 >= 1 && total > 10 && s.matchRows > 0 && (s.search.where ?? '').startsWith('المقطع'), { count: s.search.count, rows: s.matchRows, where: s.search.where });
    await ed.key('Enter', 'Enter', 13);
    await settle();
    s = await info();
    check('ac2-next-result', s.search.count === `${k0 + 1} من ${total}` && (s.search.where ?? '').startsWith('المقطع'), { count: s.search.count, where: s.search.where });
    await clickOn('.ed-search button', 'استبدال');
    await clickOn('.ed-search__replace input');
    await typeText('للبند 1');
    await clickOn('.ed-search__replace button', 'استبدال هنا');
    s = await info();
    check('ac2-replace-here', s.history === 1 && s.changed === 1, { history: s.history, changed: s.changed, result: s.result });
    await clickOn('.ed-search__replace button', 'معاينة استبدال الكل');
    s = await info();
    check('ac2-preview-all-with-checkboxes', s.dialog?.title === 'معاينة استبدال الكل' && s.dialog.checks === total - 1 && s.dialog.checked === total - 1, { checks: s.dialog?.checks, total });
    await shoot('ac2-replace-preview');
    await clickOn('dialog[open] .ed-replace-item input');
    s = await info();
    await clickOn('dialog[open] button', 'استبدال');
    s = await info();
    check('ac2-replace-all-one-step', s.history === 2 && s.changed === total - 1, { history: s.history, changed: s.changed });
    await clickOn('.ed-head button', 'تراجع');
    s = await info();
    check('ac2-undo-one-step', s.history === 1 && s.changed === 1, { history: s.history, changed: s.changed });
    await clickOn('.ed-head button', 'تراجع');
    const after = await run(E.times);
    check('ac2-timing-and-numbers-unchanged', after === before, null);
    await clickOn('.ed-search button', 'الخيارات');
    await ed.eval(() => { const sel = document.querySelector('.ed-search__opts select'); sel.value = 'en'; sel.dispatchEvent(new Event('change')); });
    await settle(400);
    s = await info();
    const hereDisabled = await ed.eval(() => [...document.querySelectorAll('.ed-search__replace button')].find((x) => x.textContent.startsWith('استبدال هنا'))?.getAttribute('aria-disabled'));
    check('ac2-english-read-only-search', s.search.count === 'لا نتائج' || hereDisabled === 'true', { count: s.search.count, hereDisabled });
    await ed.eval(() => {
      const sel = document.querySelector('.ed-search__opts select'); sel.value = 'ar'; sel.dispatchEvent(new Event('change'));
      const i = document.querySelector('.ed-search__input'); i.value = ''; i.dispatchEvent(new Event('input'));
    });
    await ed.key('Escape', 'Escape', 27);
    await settle(400);
  });

  // «استبدال هنا» ببديل يحوي ما يُبحث عنه يتقدم إلى التالية ولا يعشّش في النص المُدرَج (مراجعة مستقلة).
  await step('ac2-replace-here-advances', async () => {
    await clickOn(rowSel(2, 'text'));
    await cmd('KeyF', 'ب', 70);
    await ed.eval(() => { const i = document.querySelector('.ed-search__input'); i.value = ''; });
    await typeText('للمقطع 2');
    await settle(400);
    await ed.eval(() => { const i = document.querySelector('.ed-search__replace input'); i.value = ''; });
    await clickOn('.ed-search__replace input');
    await typeText('للمقطع 2 مكرر');
    await clickOn('.ed-search__replace button', 'استبدال هنا');
    await clickOn('.ed-search__replace button', 'استبدال هنا');
    const texts = await ed.eval(() => {
      const s = globalThis.__tarjumanEditor.state.session;
      return Array.from({ length: s.count }, (_, i) => s.cueAt(i).text).filter((t) => t.includes('مكرر'));
    });
    const s = await info();
    check('ac2-replace-here-advances', texts.length === 2 && texts.every((t) => !t.includes('مكرر مكرر')) && s.history === 2, { texts, history: s.history });
    await clickOn('.ed-head button', 'تراجع');
    await clickOn('.ed-head button', 'تراجع');
    await ed.eval(() => {
      const i = document.querySelector('.ed-search__input'); i.value = ''; i.dispatchEvent(new Event('input'));
    });
    await settle(400);
  });

  // ===== AC3: الدمج والشطر والانجراف بمعاينة وتراجع، والكثافة غير مانعة =====
  await step('ac3-structure', async () => {
    let s = await info();
    const count = s.count;
    await rowAction(4, 'merge');
    s = await info();
    check('ac3-merge', s.count === count - 1 && s.history >= 1, { count: s.count, result: s.result });
    await run(E.reveal, 6);
    await hoverOn(actSel(6, 'merge'));
    const pv = (await info()).preview;
    check('ac3-merge-preview-on-hover', pv.startsWith('سيُدمج المقطع'), { preview: pv });
    const at = 'ترجمة للمقطع'.length;
    await run(E.reveal, 8);
    await run(E.caret, 8, at);
    await clickOn(actSel(8, 'split'));
    s = await info();
    check('ac3-split-at-caret', s.count === count, { count: s.count, result: s.result });
    check('ac3-no-blanket-restore-after-merge-split', s.comparison?.restore === false && !s.restoreBtn, { comparison: s.comparison });
    await shoot('ac3-merge-split');
    await clickOn('.ed-head button', 'تراجع');
    await clickOn('.ed-head button', 'تراجع');
    s = await info();
    check('ac3-undo-structure', s.count === count && s.comparison?.restore === true, { count: s.count, comparison: s.comparison });
    const lastBefore = await run(E.cue, count - 1);
    await menu('أدوات التوقيت', 'تصحيح الانجراف');
    s = await info();
    check('ac3-drift-dialog', s.dialog?.title === 'تصحيح الانجراف', null);
    await ed.eval((n) => {
      const ns = document.querySelectorAll('dialog[open] fieldset input.ed-amount');
      ns[1].value = String(n);
      ns[1].dispatchEvent(new Event('input', { bubbles: true }));
      const inputs = document.querySelectorAll('dialog[open] fieldset input.ed-time');
      inputs[1].value = '+1.5';
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    }, { args: [lastBefore.n] });
    await settle();
    s = await info();
    check('ac3-drift-preview', s.dialog?.text.includes('يتغير توقيت') && !s.dialog.buttons[0].disabled, { text: s.dialog?.text.slice(0, 200) });
    await shoot('ac3-drift-preview');
    await clickOn('dialog[open] button', 'تطبيق التصحيح');
    const lastAfter = await run(E.cue, count - 1);
    check('ac3-drift-applied', lastAfter.startMs - lastBefore.startMs === 1500, { delta: lastAfter.startMs - lastBefore.startMs });
    await clickOn('.ed-head button', 'تراجع');
    check('ac3-drift-undo', (await run(E.cue, count - 1)).startMs === lastBefore.startMs, null);
    await iso(P.prefs, { review: { maxCps: 6 } });
    await settle(800);
    s = await info();
    check('ac3-density-threshold-from-settings-not-blocking', /\d/.test(s.density ?? '') && !s.density.includes('لا تنبيهات') && !s.dirty, { density: s.density });
    await iso(P.prefs, { review: { maxCps: null } });
    await settle(600);
  });

  // ===== AC5: لوحة المراجعة: الآلي منفصل عن العلامات، وتبديل العلامة، وعلامة المشغّل، واليتيمة =====
  await step('ac5-review', async () => {
    let s = await info();
    check('ac5-tabs-and-groups', s.tabs.length === 2 && s.marks.some((m) => m.startsWith('أعود إليه (1)')), { tabs: s.tabs, marks: s.marks });
    await rowAction(10, 'mark');
    s = await info();
    check('ac5-toggle-mark-todo', s.marks.some((m) => m.startsWith('أعود إليه (2)')) && (s.toast ?? '').includes('أعود إليه'), { marks: s.marks, toast: s.toast });
    await clickOn('.ed-toast__action');
    await settle(600);
    s = await info();
    check('ac5-mark-undo', s.marks.some((m) => m.startsWith('أعود إليه (1)')), { marks: s.marks });
    await clickOn(rowSel(1, 'text'));
    await typeText(' تعديل غير محفوظ');
    const marksInPlayer = await iso(P.markCue, 12);
    await settle(1200);
    s = await info();
    check('ac5-player-mark-appears-no-conflict', s.marks.some((m) => m.startsWith('أعود إليه (2)')) && !s.banner && s.dirty && marksInPlayer === 2, { marks: s.marks, banner: s.banner, marksInPlayer });
    await shoot('ac5-review-panel');
    await cmd('KeyS', 'س', 83);
    await settle(800);
    await openEditor(`v=${VIDEO}&t=2`);
    s = await info();
    check('ac5-orphan-separate', s.marks.some((m) => m.startsWith('فقدت مقطعها (1)')) && s.resume.length === 2, { marks: s.marks, resume: s.resume });
  });

  // ===== AC7: التعارض: التعديلات تبقى، وتُقارن بالأحدث، ويُعاد تطبيق غير المتعارض، ولا كتابة فوق الأحدث =====
  await step('ac7-rescue', async () => {
    await openEditor(`v=${VIDEO}&t=1`);
    await clickOn(rowSel(2, 'text'));
    await typeText(' — تعديلي');
    await iso(P.editActive, VIDEO, 6, 'من المشغّل أثناء التحرير');
    await settle(1200);
    let s = await info();
    check('ac7-banner-with-rescue', s.external === 'changed' && (s.banner ?? '').includes('مقارنة وإعادة التطبيق') && s.dirty, { banner: s.banner });
    await shoot('ac7-conflict-banner');
    await clickOn('.ed-banner button', 'مقارنة وإعادة التطبيق');
    s = await info();
    check('ac7-rescue-dialog', s.dialog?.title === 'مقارنة تغييراتي بالنسخة الأحدث' && s.dialog.buttons[0].label.startsWith('تطبيق غير المتعارض'), s.dialog);
    await shoot('ac7-rescue-dialog');
    await clickOn('dialog[open] button', 'تطبيق غير المتعارض');
    s = await info();
    check('ac7-reapplied-unsaved', s.external === null && s.dirty, { external: s.external, result: s.result });
    await cmd('KeyS', 'س', 83);
    await settle(900);
    const stored = await iso(P.slot, VIDEO, 1);
    check('ac7-save-keeps-both', stored.text[2].endsWith('— تعديلي') && stored.text[6] === 'من المشغّل أثناء التحرير', { t2: stored.text[2], t6: stored.text[6] });
  });

  // ===== AC8: المرجع من لوحة المقارنة، والتقرير والنص الدراسي =====
  await step('ac8-reference-report-study', async () => {
    await openEditor(`v=${VIDEO}&t=1`);
    await ed.eval((id) => { const sel = document.querySelector('.ed-ref-choice'); sel.value = id; sel.dispatchEvent(new Event('change')); }, { args: [fp2.id] });
    await settle(600);
    let s = await info();
    check('ac8-reference-preview', s.fp === fp2.id && s.comparison?.fp === fp2.id && (s.refPanel ?? '').includes('معاينة غير محفوظة'), { fp: s.fp, cmp: s.comparison });
    await shoot('ac8-reference-preview');
    await clickOn('[aria-label="المرجع الإنجليزي"] button', 'اعتماد هذا المرجع');
    await settle(700);
    const stored = await iso(P.slot, VIDEO, 1);
    s = await info();
    check('ac8-reference-saved-explicitly', stored.fp === fp2.id && !(s.refPanel ?? '').includes('معاينة'), { stored: stored.fp });
    let before = await snapshotDl();
    await menu('تصدير', 'تقرير مراجعة');
    await ed.eval(() => { const box = [...document.querySelectorAll('dialog[open] input[type=checkbox]')][2]; box.click(); });
    await settle();
    await clickOn('dialog[open] button', 'تنزيل');
    const report = (await newFiles(before))[0];
    check('ac8-review-report', !!report && report.name.endsWith('.md') && report.text.includes('أعود إليه'), { name: report?.name });
    before = await snapshotDl();
    await menu('تصدير', 'نص دراسي');
    await ed.eval(() => document.querySelector('dialog[open] input[type=checkbox]').click());
    await settle();
    await clickOn('dialog[open] button', 'تنزيل');
    const study = (await newFiles(before))[0];
    check('ac8-study-text-bilingual', !!study && study.text.includes('ترجمة') && /[A-Za-z]{3,}/.test(study.text), { name: study?.name });
  });

  // ===== AC6 وAC9: الاستكمال على 900 مقطع ينقصها 12 بجزأين، وكل ما يُصدَّر في المجلد الفرعي المختار =====
  await step('ac6-complete', async () => {
    await iso(P.prefs, { saveLocation: { mode: 'subfolder', folder: 'Tarjuman' } });
    await openEditor(`v=${GAP}`);
    await clickOn('.ed-tab', 'الاستكمال');
    let s = await info();
    check('ac6-groups', (s.complete ?? '').includes('الناقص (12)') && (s.complete ?? '').includes('12 مقطعًا'), { complete: s.complete?.slice(0, 200) });
    const noArabicUnchecked = await ed.eval(() => document.querySelector('[data-group="noArabic"]')?.checked === false);
    check('ac6-no-arabic-optional', noArabicUnchecked, null);
    await shoot('ac6-complete-panel');
    let before = await snapshotDl();
    await clickOn('[aria-label="الاستكمال"] button', 'تنزيل ملف الاستكمال');
    const patch = (await newFiles(before, 'Tarjuman'))[0];
    const patchCues = patch ? parseSrtLenient(patch.text).cues : [];
    check('ac9-patch-in-subfolder', !!patch && patch.name.endsWith('.patch.srt') && patchCues.length === 12, { name: patch?.name, cues: patchCues.length });
    const reply = (pick) => patchCues.filter((c) => pick(c.n)).map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\nمكمَّل ${c.n}\n`).join('\n');
    const f1 = path.join(DL, `${GAP}.ar.asr.normal.patch.part1.srt`);
    const f2 = path.join(DL, `${GAP}.ar.asr.normal.patch.part2.srt`);
    await writeFile(f1, reply((n) => n <= 300));
    await writeFile(f2, reply((n) => n > 300));
    await setFiles('[aria-label="الاستكمال"] input[type=file]', [f1]);
    s = await info();
    check('ac6-patch-preview', s.dialog?.title === 'معاينة ملف التصحيح' && s.dialog.checks === 6, { checks: s.dialog?.checks });
    await shoot('ac6-patch-preview');
    await clickOn('dialog[open] button', 'تطبيق');
    await settle(700);
    s = await info();
    check('ac6-part1-received', s.count === 894 && JSON.stringify(s.parts) === JSON.stringify(['1:300/300', '2:297/300', '3:297/300']), { count: s.count, parts: s.parts });
    await setFiles('[aria-label="الاستكمال"] input[type=file]', [f2]);
    await clickOn('dialog[open] button', 'تطبيق');
    await settle(700);
    s = await info();
    check('ac6-all-parts-received', s.count === 900 && s.parts?.every((p) => p.endsWith('300/300')) && s.dirty, { count: s.count, parts: s.parts });
    await clickOn('.ed-head button', 'تراجع');
    s = await info();
    check('ac6-undo-patch', s.count === 894, { count: s.count });
    await clickOn('.ed-head button', 'إعادة');
    await cmd('KeyS', 'س', 83);
    await settle(900);
    const cues = await iso(P.slotCues, GAP, 1);
    check('ac6-explicit-save', cues.length === 900 && cues.find((c) => c[0] === 300)?.[3] === 'مكمَّل 300', { count: cues.length });
    before = await snapshotDl();
    await menu('تصدير', 'الترجمة SRT');
    await clickOn('dialog[open] button', 'تنزيل SRT');
    const srt = (await newFiles(before, 'Tarjuman'))[0];
    check('ac9-srt-in-subfolder', !!srt && srt.name.endsWith('.ar.srt') && parseSrtLenient(srt.text).cues.length === 900, { name: srt?.name });
    await iso(P.prefs, { saveLocation: { mode: 'downloads', folder: 'Tarjuman' } });
  });

  // ===== AC4: القفز إلى زمن المقطع: تبويب مفتوح، وأكثر من تبويب، وغائب =====
  await step('ac4-seek', async () => {
    await openEditor(`v=${VIDEO}&t=1`);
    const target = await run(E.cue, 30);
    await rowAction(30, 'seek');
    await settle(1200);
    const at = await yt.eval(P.time);
    const expect = target.startMs + 500;
    await b.conn.send('Target.activateTarget', { targetId: ed.targetId });
    await settle(400);
    check('ac4-seek-open-tab', Math.abs(at - expect) < 400, { at, expect, toast: (await info()).toast });
    const yt2 = await openTab(b.conn, `https://www.youtube.com/watch?v=${VIDEO}`);
    await waitForPlayer(yt2, VIDEO, 30000);
    await yt2.eval(P.pause).catch(() => {});
    await sleep(1500);
    await b.conn.send('Target.activateTarget', { targetId: ed.targetId });
    const c2 = await run(E.cue, 60);
    await rowAction(60, 'seek');
    await settle(1200);
    const [a1, a2] = [await yt.eval(P.time), await yt2.eval(P.time)];
    check('ac4-seek-most-recent-of-many', Math.abs(a2 - (c2.startMs + 500)) < 400 && Math.abs(a1 - (c2.startMs + 500)) > 400, { first: a1, second: a2, expect: c2.startMs + 500 });
    await yt2.close();
    await yt.close();
    // «غائب» حقًا: كل تبويب للفيديو يُغلق (ومنها ما استعاده المتصفح)، ولا يُنقر حتى يغيب من القائمة.
    for (let k = 0; k < 40; k++) {
      const { targetInfos } = await b.conn.send('Target.getTargets');
      const left = targetInfos.filter((x) => x.type === 'page' && x.url.includes(`youtube.com/watch?v=${VIDEO}`));
      if (!left.length) break;
      for (const x of left) await b.conn.send('Target.closeTarget', { targetId: x.targetId }).catch(() => {});
      await sleep(250);
    }
    await sleep(800);
    await b.conn.send('Target.activateTarget', { targetId: ed.targetId });
    const known = new Set((await b.conn.send('Target.getTargets')).targetInfos.map((x) => x.targetId));
    const c3 = await run(E.cue, 90);
    await rowAction(90, 'seek');
    const fresh = await waitForTarget(b.conn, (u) => u.includes(`youtube.com/watch?v=${VIDEO}`), { timeoutMs: 8000, exclude: known });
    const t = Math.floor((c3.startMs + 500) / 1000);
    const after = await info();
    const pages = (await b.conn.send('Target.getTargets')).targetInfos.filter((x) => x.type === 'page').map((x) => x.url.replace(/^https?:\/\/[^/?]+/, '').slice(0, 60));
    check('ac4-seek-new-tab-when-absent', !!fresh && fresh.url.includes(`&t=${t}s`), { url: fresh ? fresh.url.replace(/^https?:\/\/[^/]+/, '') : null, lastSeek: after.lastSeek, pages });
    if (fresh) {
      yt = await attach(b.conn, fresh.targetId);
      await sleep(3000);
      isoId = yt.isolatedContextId(extId);
    }
    // القفز يجلب تبويب الفيديو إلى الأمام؛ والمحرّر في الخلفية لا يرسم إطارات (requestAnimationFrame).
    await b.conn.send('Target.activateTarget', { targetId: ed.targetId });
    await settle(600);
  });

  // ===== الأداء على 2400 مقطع: البحث والاستبدال والدمج والتمرير =====
  await step('perf-2400', async () => {
    const t0 = Date.now();
    await openEditor(`v=${BIG}`);
    const openedMs = Date.now() - t0;
    await run(E.observe);
    await cmd('KeyF', 'ب', 70);
    for (const ch of 'القرية') {
      await ed.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      await ed.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      await sleep(60);
    }
    await settle(500);
    const typing = await run(E.events);
    const s1 = await info();
    await clickOn('.ed-search button', 'استبدال');
    await clickOn('.ed-search__replace input');
    await typeText('البلدة');
    await run(E.events);
    await clickOn('.ed-search__replace button', 'معاينة استبدال الكل');
    await clickOn('dialog[open] button', 'استبدال');
    const replaceEv = await run(E.events);
    await clickOn('.ed-head button', 'تراجع');
    await rowAction(1200, 'merge');
    const mergeEv = await run(E.events);
    await clickOn('.ed-head button', 'تراجع');
    const sweep = await run(E.scrollSweep, 60);
    result.perf = { openedMs, typing, results: s1.search.count, replaceEv, mergeEv, sweep };
    check('perf-2400-search-and-edit-smooth', openedMs < 4000 && typing.maxKey < 100 && replaceEv.maxClick < 300 && mergeEv.maxClick < 300 && sweep.p95FrameMs < 50 && sweep.rowsMax < 90, result.perf);
  });

  // لقطة الوضع الداكن.
  await step('dark', async () => {
    await emulateScheme(ed, 'dark');
    await openEditor(`v=${VIDEO}&t=2`);
    await shoot('dark-slot2');
    await emulateScheme(ed, 'light');
  });

  const s = await info().catch(() => null);
  check('layout-fills-window', s && s.layout.pageOverflow <= 0, s?.layout);
  result.errors.editor = edErrors.list;
  check('no-extension-errors', edErrors.list.length === 0, edErrors.list.slice(0, 5));
  check('no-network-from-editor', net.length === 0, { requests: net.length });
} catch (err) {
  check('run-aborted', false, { error: String(err.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
} finally {
  await b.close();
  const passed = result.checks.filter((c) => c.ok).length;
  result.summary = `${passed}/${result.checks.length}`;
  await writeFile(path.join(OUT, `live-${browser}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nالنتيجة: ${result.summary} — ${path.relative(ROOT, path.join(OUT, `live-${browser}.json`))}`);
  process.exitCode = passed === result.checks.length ? 0 : 1;
}
