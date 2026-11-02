#!/usr/bin/env node
// اختبار دائم (P15): دخان بوابة W6 منقولًا كما هو من docs/evidence/W6/wave-smoke.mjs، بتغيير المسارات والمخرجات وحدها،
// ويعمل في Brave وChrome. يبني حزمة tj-v1 من الوسم في كل تشغيل.
// دخان بوابة W6 (سكربت المنسّق): التوافق والرجوع حيًا على رأس التكامل، ونقاط الربط بين P10 وP11 على التخزين الحقيقي.
// مبني على test/live/compat/rollback.mjs (P10) بملف تعريف واحد ومسار إضافة واحد (فالمعرّف نفسه والتخزين نفسه):
//   ١. حزمة tj-v1 تُنشئ بيانات بشيفرتها (سجل وبصمة وترجمة وإعداد)، ويعرضها مشغّلها.
//   ٢. بناء W6 يضيف ترجمة ثانية ثم يستبدلها (فتُحفظ السابقة)، وعلامة، وتفضيلات (قاموس ومكان حفظ).
//   ٣. حزمة tj-v1 مرة أخرى تقرأ بمشغّلها ونافذتها ومحفوظاتها، وتكتب: استبدال الترجمة النشطة، وإزاحة، وإعدادًا بنقرة.
//   ٤. بناء W6 يقرأ ويصالح دون فقد (عقد التخزين §٩: لا سابقة لاستبدال الأول، والسابقة القائمة باقية)، ثم في صفحة
//      إضافة وعلى ما تقرؤه واجهة التخزين: القاموس المخزّن عبر instructions، وreviewIncoming على البصمات المخزنة،
//      وdiffTranslations على ترجمتي خانتين؛ والمشغّل يعرض الناتج؛ ورسالة القفز تصل التبويب المفتوح للفيديو.
// محرّكات P11 تُجمَّع من رأس التكامل وتُحقن في صفحة الإضافة (كشيفرة الأول المجمّدة في rollback.mjs). بلا نافذة افتراضيًا.
//   command node test/e2e/live/v2/rollback.mjs [--browser brave|chrome] [--headed] [--out docs/evidence/P15/<browser>]
import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, sleep } from '../../../live/harness/browser.mjs';
import { collectErrors, openTab } from '../../../live/harness/extension.mjs';
import { dismissConsent, waitForPlayer } from '../../../live/harness/youtube.mjs';
import { findSecrets } from '../../../../src/core/diagnostics/sanitize.js';
import { instructions as nodeInstructions } from '../../../../src/core/export/index.js';
import { englishTrack, fingerprint, makeCues } from '../../../helpers/fixtures.js';
import { NODE_MODULES } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const VIDEO = val('video', 'iG9CE55wbtY');
const OUT = path.resolve(ROOT, val('out', `docs/evidence/P15/${browser}`));
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 'p15-work', 'rollback', `${browser}-${RUN}`);
const EXT = path.join(WORK, 'ext');
const PROFILE = `${browser}-w6-wave-${RUN}`;

const result = { browser: null, at: new Date().toISOString(), video: VIDEO, head: null, sessions: [], checks: [], errors: {} };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
};
const rel = (f) => path.relative(ROOT, f);
const FONT_READ_LOG = /^Unsafe attempt to load URL chrome-extension:\/\/[^/]+\/ui\/fonts\/subtitle\/[a-z0-9-]+-(?:400|700)\.woff2 /;

function appVersion(bin) {
  try {
    const plist = path.join(bin.slice(0, bin.indexOf('.app/') + 4), 'Contents/Info.plist');
    return String(execFileSync('/usr/bin/defaults', ['read', plist, 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}

// ---- التجهيز: حزمة tj-v1 من الوسم، وبناء تطوير لرأس التكامل، وشيفرة الأول المجمّدة ومحرّكات P11 للحقن ----
async function prepare() {
  await mkdir(WORK, { recursive: true });
  const src = path.join(WORK, 'v1src');
  await mkdir(src, { recursive: true });
  const tar = path.join(WORK, 'v1.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, 'tj-v1'], { cwd: ROOT });
  execFileSync('tar', ['-xf', tar, '-C', src]);
  await symlink(NODE_MODULES, path.join(src, 'node_modules'));
  const v1out = path.join(WORK, 'v1pkg');
  execFileSync(process.execPath, [path.join(src, 'scripts/release/package.mjs'), '--out', v1out], { cwd: src, stdio: 'ignore' });
  const v2 = path.join(WORK, 'v2dev');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', v2], { stdio: 'ignore' });
  const iife = async (opts) => (await build({ ...opts, bundle: true, format: 'iife', write: false, target: 'chrome111', logLevel: 'silent' })).outputFiles[0].text;
  const v1inject = await iife({ entryPoints: [path.join(ROOT, 'test/live/compat/v1-entry.mjs')] });
  const engines = await iife({
    stdin: {
      contents: [
        "import { instructions, glossaryParagraph } from './src/core/export/index.js';",
        "import { reviewIncoming } from './src/core/import/index.js';",
        "import { diffTranslations } from './src/core/align/index.js';",
        'globalThis.__w6 = { instructions, glossaryParagraph, reviewIncoming, diffTranslations };',
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'js',
    },
  });
  return { v1: path.join(v1out, 'tarjuman-0.2.0'), v2, v1inject, engines };
}

async function swapTo(dir) {
  await rm(EXT, { recursive: true, force: true });
  await cp(dir, EXT, { recursive: true });
}

async function session(label, run) {
  const b = await launch({ browser, profile: PROFILE, headless: !argv.includes('--headed') });
  result.browser ??= `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].bin) ?? '?'} (${b.version.product})`;
  const errs = [];
  try {
    const ext = await loadExtension(b.conn, EXT);
    if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
    const version = await (async () => {
      const p = await openTab(b.conn, `chrome-extension://${ext.id}/pages/popup/index.html`, { background: true });
      const v = await p.eval(() => chrome.runtime.getManifest().version_name ?? chrome.runtime.getManifest().version);
      await p.close();
      return v;
    })();
    result.sessions.push({ label, extensionId: ext.id, version });
    console.log(`— ${label}: الإضافة ${version}`);
    const extPage = async (relPath, opts) => {
      const p = await openTab(b.conn, `chrome-extension://${ext.id}/${relPath}`, opts);
      errs.push({ where: relPath.split('?')[0], list: collectErrors(p, { extId: ext.id }) });
      return p;
    };
    const watch = async () => {
      const yt = await openTab(b.conn, 'about:blank');
      errs.push({ where: 'youtube', list: collectErrors(yt, { extId: ext.id, onlyExtension: true }) });
      await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
      await dismissConsent(yt).catch(() => false);
      const ready = await waitForPlayer(yt, VIDEO);
      await yt.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; v.pause(); })).catch(() => {});
      if (await yt.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
      await sleep(2500);
      return { yt, ready };
    };
    /** رد سكربت المحتوى على نافذة الأيقونة، والتبويب النشط يوتيوب. */
    const popupState = async (yt) => {
      await b.conn.send('Target.activateTarget', { targetId: yt.targetId });
      const p = await extPage('pages/popup/index.html', { background: true });
      const r = await p.eval(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        try {
          return await chrome.tabs.sendMessage(tab.id, { type: 'tj:get-video-state', v: 1 });
        } catch (e) {
          return { error: e.message };
        }
      });
      await sleep(1200);
      const text = await p.eval(() => document.body.innerText);
      await p.close();
      return { reply: r, text };
    };
    await run({ extPage, watch, popupState });
  } finally {
    // رسالة المتصفح مع كل قراءة ناجحة لملف خط الترجمة (معروفة من P6، في الإصدارين): تُعدّ وحدها ولا تُحسب خطأً.
    const fontReads = (l) => l.filter((x) => x.kind === 'log.security' && FONT_READ_LOG.test(x.text));
    result.errors[label] = errs.map((e) => ({ where: e.where, errors: e.list.list.filter((x) => !fontReads(e.list.list).includes(x)), fontReadLogs: fontReads(e.list.list).length }));
    errs.forEach((e) => e.list.stop());
    const exited = new Promise((r) => (b.child.exitCode !== null ? r() : b.child.once('exit', r)));
    await b.close();
    await Promise.race([exited, sleep(15000)]);
    await sleep(500);
  }
}

const TITLE = 'W6 — دخان الموجة';
const firstCues = makeCues(6, { startMs: 5000, text: (i) => `ترجمة الأول ${i}` });
const enTrack = englishTrack({ cues: firstCues.map((c) => ({ ...c, text: `line ${c.n}` })) });
const fp = fingerprint({ videoId: VIDEO, track: enTrack, id: 'fp_w6wave00001' });
const secondCues = makeCues(6, { startMs: 5000, text: (i) => `ترجمة الثاني ${i}` });
const secondBCues = makeCues(6, { startMs: 5000, text: (i) => `ترجمة الثاني المستبدلة ${i}` });
const replaceCues = makeCues(6, { startMs: 5000, text: (i) => `ترجمة الاستبدال ${i}` });
const GLOSSARY = [{ source: 'prompt', target: 'موجِّه', note: null }, { source: 'token', target: 'رمز', note: 'في سياق النماذج' }];

try {
  result.head = String(execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT })).trim();
  const built = await prepare();
  check('v1-package-built', true, { from: 'tj-v1 scripts/release/package.mjs', dir: path.basename(built.v1), v2From: result.head });

  // ١. الأول يُنشئ بيانات.
  await swapTo(built.v1);
  await session('1-v1-create', async ({ extPage, watch, popupState }) => {
    const p = await extPage('pages/settings/index.html');
    await p.eval(built.v1inject);
    const made = await p.eval(async (videoId, title, track, fingerprintObj, arCues) => {
      const { createStore, transitions: t, validateVideoRecord } = globalThis.__v1;
      const s = createStore();
      const now = () => new Date().toISOString();
      await s.updateVideo(videoId, (r) => t.withExport(r, { videoId, title, durationMs: 1203000, englishTrack: track, fingerprint: { ...fingerprintObj, createdAt: now() } }, now()));
      const rec = await s.updateVideo(videoId, (r) => t.withArabicImport(r, { videoId, fileName: 'v1-first.ar.srt', cues: arCues, comparison: null, fingerprintId: fingerprintObj.id, notes: [] }, now()).record);
      await s.setSettings({ displayModeDefault: 'dual' });
      return { rev: rec.rev, valid: validateVideoRecord(rec).ok, keys: await chrome.storage.local.getKeys() };
    }, { args: [VIDEO, TITLE, enTrack, fp, firstCues] });
    check('v1-creates-data', made.valid && made.rev === 2 && made.keys.every((k) => ['meta', 'settings', `video:${VIDEO}`, `index:${VIDEO}`].includes(k)), made);
    await p.close();
    const { yt } = await watch();
    const st = await popupState(yt);
    check('v1-player-shows-it', st.reply?.arabic?.fileName === 'v1-first.ar.srt' && st.reply.mounted?.overlay === 'mounted', { arabic: st.reply?.arabic, mounted: st.reply?.mounted });
  });

  // ٢. W6 يقرأ ويضيف ترجمة ثانية ثم يستبدلها (السابقة)، وعلامة، وتفضيلات.
  await swapTo(built.v2);
  await session('2-w6-extend', async ({ extPage, watch, popupState }) => {
    const g = await extPage('ui/gallery/index.html');
    await g.waitFor(() => !!globalThis.__tarjumanPage, { timeoutMs: 10000 });
    const read = await g.eval(async (id) => {
      const s = globalThis.__tarjumanPage.store;
      const b = await s.getBundle(id);
      return { active: b?.active, file: b?.record.arabic?.fileName, settings: (await s.getSettings()).displayModeDefault, schema: (await chrome.storage.local.get('meta')).meta.schema };
    }, { args: [VIDEO] });
    check('w6-reads-v1-data', read.active === 1 && read.file === 'v1-first.ar.srt' && read.settings === 'dual' && read.schema === 1, read);
    await g.close();
    const { yt } = await watch();
    const iso = yt.isolatedContextId(result.sessions.at(-1).extensionId);
    const done = await yt.eval(async (second, secondB, glossary) => {
      const c = globalThis.__tarjuman.controller;
      for (let i = 0; i < 40 && (c.getState().loading || !c.getState().saved); i++) await new Promise((r) => setTimeout(r, 250));
      const up = await c.loadArabicInto(2, { fileName: 'w6-second.ar.srt', cues: second });
      const re = await c.loadArabicInto(2, { fileName: 'w6-second-b.ar.srt', cues: secondB }, { replace: true });
      const m = await c.markCue({ index: 1 });
      await c.updatePrefs({ glossary: { terms: glossary }, saveLocation: { mode: 'subfolder', folder: 'Tarjuman' } });
      const s = c.getState();
      return { activated: up.activated, replaced: re.replaced, active: s.activeSlot, notice: s.notice?.code ?? null, mark: m.mark?.kind, terms: s.prefs.glossary.terms.length };
    }, { contextId: iso, args: [secondCues, secondBCues, GLOSSARY] });
    check('w6-adds-second-replaces-it-marks-prefs', done.activated && done.replaced && done.active === 2 && done.mark === 'todo' && done.terms === 2, done);
    const g2 = await extPage('ui/gallery/index.html');
    await g2.waitFor(() => !!globalThis.__tarjumanPage, { timeoutMs: 10000 });
    const prev = await g2.eval(async (id) => {
      const b = await globalThis.__tarjumanPage.store.getBundle(id);
      return { from: b.previous?.from ?? null, file: b.previous?.track.fileName ?? null, files: b.slots.map((x) => x.track?.fileName ?? null) };
    }, { args: [VIDEO] });
    check('w6-previous-saved', prev.from === 2 && prev.file === 'w6-second.ar.srt' && prev.files[0] === 'v1-first.ar.srt' && prev.files[1] === 'w6-second-b.ar.srt', prev);
    await g2.close();
    const st = await popupState(yt);
    check('w6-popup-reply-has-slots', Array.isArray(st.reply?.slots) && st.reply.slots[1].active === true && st.reply.capture && st.reply.tools, { slots: st.reply?.slots });
  });

  // ٣. الأول مرة أخرى: يقرأ بواجهاته ويكتب (استبدال، وإزاحة، ونقرة في الإعدادات).
  await swapTo(built.v1);
  await session('3-v1-again', async ({ extPage, watch, popupState }) => {
    const { yt } = await watch();
    const st = await popupState(yt);
    check('v1-reads-w6-active-translation', st.reply?.arabic?.fileName === 'w6-second-b.ar.srt' && st.reply.mounted?.overlay === 'mounted' && !('slots' in st.reply), { arabic: st.reply?.arabic, mounted: st.reply?.mounted });
    const lib = await extPage('pages/library/index.html');
    const listed = await lib.waitFor((id) => {
      const rows = [...document.querySelectorAll('.lib-row')];
      const row = rows.find((r) => r.querySelector('.lib-row__id')?.textContent.includes(id));
      return row ? { rows: rows.length, failed: !!document.querySelector('.tj-alert--danger') } : null;
    }, { args: [VIDEO], timeoutMs: 10000 });
    check('v1-library-lists-it', !!listed && listed.rows === 1 && !listed.failed, listed);
    await lib.close();
    const set = await extPage('pages/settings/index.html');
    await set.waitFor(() => !!document.querySelector('input[type=radio][value="1"]'), { timeoutMs: 10000 });
    await set.eval(() => document.querySelector('input[type=radio][value="1"]').click());
    await sleep(1200);
    await set.eval(built.v1inject);
    const wrote = await set.eval(async (videoId, repl) => {
      const { createStore, transitions: t, validateVideoRecord } = globalThis.__v1;
      const s = createStore();
      const now = () => new Date().toISOString();
      const before = (await s.getVideo(videoId)).arabic.fileName;
      await s.updateVideo(videoId, (r) => t.withArabicImport(r, { videoId, fileName: 'v1-replace.ar.srt', cues: repl, comparison: null, fingerprintId: null, notes: [] }, now(), { replace: true }).record);
      const rec = await s.updateVideo(videoId, (r) => t.withView(r, { displayOffsetMs: 1500 }, now()));
      const settings = await s.getSettings();
      return { before, valid: validateVideoRecord(rec).ok, file: rec.arabic.fileName, offset: rec.view.displayOffsetMs, step: settings.offsetStepMs, mode: settings.displayModeDefault, index: (await s.listIndex()).length };
    }, { args: [VIDEO, replaceCues] });
    check('v1-writes-replace-offset-setting', wrote.valid && wrote.before === 'w6-second-b.ar.srt' && wrote.file === 'v1-replace.ar.srt' && wrote.offset === 1500 && wrote.step === 1000 && wrote.mode === 'dual' && wrote.index === 1, wrote);
    await set.close();
  });

  // ٤. W6 يقرأ الناتج ويصالحه دون فقد، ثم نقاط الربط على التخزين الحقيقي، والمشغّل، والقفز.
  await swapTo(built.v2);
  await session('4-w6-reconciles', async ({ extPage, watch }) => {
    const g = await extPage('ui/gallery/index.html');
    await g.waitFor(() => !!globalThis.__tarjumanPage, { timeoutMs: 10000 });
    const r = await g.eval(async (id) => {
      const s = globalThis.__tarjumanPage.store;
      const b = await s.getBundle(id);
      const raw = await chrome.storage.local.get([`bundle:${id}`, `video:${id}`]);
      const prefs = await s.getPrefs();
      const settings = await s.getSettings();
      return {
        active: b.active, files: b.slots.map((x) => x.track?.fileName ?? null), offsets: b.slots.map((x) => x.offsetMs), marks: b.slots.map((x) => x.marks.length),
        previous: b.previous ? { from: b.previous.from, file: b.previous.track.fileName } : null,
        terms: prefs.glossary.terms.length, save: prefs.saveLocation.mode, step: settings.offsetStepMs, mode: settings.displayModeDefault,
        reconciled: raw[`bundle:${id}`].base.rev === raw[`video:${id}`].rev, schema: (await chrome.storage.local.get('meta')).meta.schema,
      };
    }, { args: [VIDEO] });
    check('w6-reconciles-without-loss', r.active === 2 && r.files[0] === 'v1-first.ar.srt' && r.files[1] === 'v1-replace.ar.srt' && r.files[2] === null
      && r.offsets[1] === 1500 && r.marks[1] === 1 && r.previous?.from === 2 && r.previous.file === 'w6-second.ar.srt'
      && r.terms === 2 && r.save === 'subfolder' && r.step === 1000 && r.mode === 'dual' && r.reconciled && r.schema === 1, r);

    // نقاط الربط: كل مدخل يُقرأ من واجهة التخزين في الصفحة نفسها، ومحرّكات P11 من رأس التكامل.
    await g.eval(built.engines);
    const link = await g.eval(async (id) => {
      const { instructions, glossaryParagraph, reviewIncoming, diffTranslations } = globalThis.__w6;
      const s = globalThis.__tarjumanPage.store;
      const b = await s.getBundle(id);
      const prefs = await s.getPrefs();
      const cuesOf = (slot) => slot.track.current ?? slot.track.original;
      const title = b.record.title ?? null;
      const glossary = prefs.glossary.attach ? prefs.glossary.terms : null;
      const withG = instructions({ videoId: id, title, glossary });
      const para = glossaryParagraph(prefs.glossary.terms);
      const review = reviewIncoming({ fileName: `${id}.ar.srt`, cues: cuesOf(b.slots[0]), videoId: id, fingerprints: b.record.fingerprints });
      const diff = diffTranslations(cuesOf(b.slots[0]), cuesOf(b.slots[1]));
      return {
        title, attach: prefs.glossary.attach, storedTerms: prefs.glossary.terms, instructions: withG, paragraphInside: !!para && withG.includes(para),
        review, diff: { aligned: diff.aligned, confidence: diff.confidence, counts: diff.counts, first: diff.changes[0] ?? null },
        storedFingerprints: b.record.fingerprints.map((f) => f.id),
      };
    }, { args: [VIDEO] });
    const expected = nodeInstructions({ videoId: VIDEO, title: link.title, glossary: GLOSSARY });
    check('link-glossary-from-stored-prefs-via-instructions', link.attach === true && JSON.stringify(link.storedTerms) === JSON.stringify(GLOSSARY)
      && link.paragraphInside && link.instructions === expected && expected.includes('- token = رمز (في سياق النماذج)'),
    { attach: link.attach, terms: link.storedTerms.length, paragraphInside: link.paragraphInside, sameAsNode: link.instructions === expected, chars: link.instructions.length });
    check('link-review-incoming-on-stored-fingerprints', link.storedFingerprints.includes(fp.id) && link.review.suggested === fp.id && link.review.certain === true
      && link.review.references[0]?.fingerprintId === fp.id && link.review.references[0].matched === true && link.review.nameHint?.videoId === VIDEO && link.review.nameHint.differs === false,
    { stored: link.storedFingerprints, review: link.review });
    const c = link.diff.counts;
    check('link-diff-translations-two-slots', link.diff.aligned && link.diff.confidence === 'high' && c.textChanged === 6 && c.timingChanged === 0 && c.added === 0 && c.removed === 0 && c.unchanged === 0
      && link.diff.first?.before.text === 'ترجمة الأول 1' && link.diff.first.after.text === 'ترجمة الاستبدال 1', link.diff);

    // المشغّل يعرض الناتج، ثم القفز من صفحة الإضافة إلى التبويب المفتوح.
    const { yt } = await watch();
    const iso = yt.isolatedContextId(result.sessions.at(-1).extensionId);
    const s = await yt.eval(async () => {
      const ctl = globalThis.__tarjuman.controller;
      for (let i = 0; i < 40 && ctl.getState().loading; i++) await new Promise((res) => setTimeout(res, 250));
      const st = ctl.getState();
      return { active: st.activeSlot, offset: st.view.displayOffsetMs, first: st.arabic?.cues[0]?.text ?? null };
    }, { contextId: iso });
    check('w6-player-shows-result', s.active === 2 && s.offset === 1500 && s.first === 'ترجمة الاستبدال 1', s);
    const before = await yt.eval(() => { const v = document.querySelector('#movie_player video'); return { t: v.currentTime, paused: v.paused }; });
    const jump = await g.eval(async (id) => globalThis.__tarjumanPage.jumpToVideo({ videoId: id, ms: 61000 }), { args: [VIDEO] });
    await sleep(800);
    const after = await yt.eval(() => { const v = document.querySelector('#movie_player video'); return { t: v.currentTime, paused: v.paused }; });
    check('jump-reaches-open-video-tab', jump.ok && jump.via === 'open' && Math.abs(after.t - 61) < 1.5 && after.paused === before.paused, { jump, before, after });
    await g.close();
  });

  check('same-extension-id-all-sessions', new Set(result.sessions.map((x) => x.extensionId)).size === 1, result.sessions);
  const errCount = Object.values(result.errors).flat().reduce((n, e) => n + e.errors.length, 0);
  check('no-extension-errors', errCount === 0, errCount ? result.errors : null);
} catch (err) {
  check('run', false, { error: String(err.message).slice(0, 300) });
}

await mkdir(OUT, { recursive: true });
const json = JSON.stringify(result, null, 2);
const leaks = findSecrets(json);
if (leaks.length) throw new Error(`تسرب في الأدلة: ${leaks.join(', ')}`);
const file = path.join(OUT, 'rollback.json');
await writeFile(file, `${json}\n`);
const failed = result.checks.filter((x) => !x.ok);
console.log(`${failed.length ? '✗' : '✓'} ${result.checks.length - failed.length}/${result.checks.length} — ${rel(file)}`);
process.exit(failed.length ? 1 : 0);
