#!/usr/bin/env node
// الإثبات الحي للتوافق والرجوع (P10-AC3، R47) في ملف تعريف واحد ومسار إضافة واحد (فالمعرّف نفسه والتخزين نفسه):
//   ١. حزمة tj-v1 (scripts/release/package.mjs من الوسم) تُنشئ بيانات بشيفرتها، ويعرضها مشغّلها ونافذتها.
//   ٢. بناء الإصدار الثاني يقرؤها، ويضيف ترجمة ثانية (تصبح النشطة) وعلامة وتفضيلات عبر المتحكم نفسه.
//   ٣. حزمة tj-v1 مرة أخرى: مشغّلها ونافذتها ومحفوظاتها وإعداداتها تقرأ بلا خطأ، وتكتب إزاحة وإعدادًا (منه نقرة في صفحتها).
//   ٤. الإصدار الثاني يقرأ الناتج سليمًا: الخانات والعلامة والتفضيلات والإعدادات، ويصالح ما كتبه الأول.
// كتابات الأول بشيفرته المجمّدة (test/fixtures/v1 مجمّعة ومحقونة في صفحة من الحزمة) لأن أدوات مشغّله في Shadow DOM مغلق.
// ومعها لقطات معرض المكوّنات بالوضعين (P10-AC7). بلا نافذة افتراضيًا.
//   node test/live/compat/rollback.mjs --browser brave|chrome [--headed] [--out docs/evidence/P10]
import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, emulateScheme, fullScreenshot, openTab } from '../harness/extension.mjs';
import { dismissConsent, waitForPlayer } from '../harness/youtube.mjs';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { englishTrack, fingerprint, makeCues } from '../../helpers/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const VIDEO = val('video', 'iG9CE55wbtY');
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P10'));
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 'p10-work', `${browser}-${RUN}`);
const EXT = path.join(WORK, 'ext');
const PROFILE = `${browser}-p10-compat-${RUN}`;

const result = { browser: null, at: new Date().toISOString(), video: VIDEO, sessions: [], checks: [], errors: {}, screenshots: [] };
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

// ---- التجهيز: حزمة tj-v1 من الوسم، وبناء تطوير للثاني، وشيفرة الأول المجمّدة للحقن ----
async function prepare() {
  await mkdir(WORK, { recursive: true });
  const src = path.join(WORK, 'v1src');
  await mkdir(src, { recursive: true });
  const tar = path.join(WORK, 'v1.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, 'tj-v1'], { cwd: ROOT });
  execFileSync('tar', ['-xf', tar, '-C', src]);
  await symlink(path.join(ROOT, 'node_modules'), path.join(src, 'node_modules'));
  const v1out = path.join(WORK, 'v1pkg');
  execFileSync(process.execPath, [path.join(src, 'scripts/release/package.mjs'), '--out', v1out], { cwd: src, stdio: 'ignore' });
  const v2 = path.join(WORK, 'v2dev');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', v2], { stdio: 'ignore' });
  const bundle = await build({ entryPoints: [path.join(ROOT, 'test/live/compat/v1-entry.mjs')], bundle: true, format: 'iife', write: false, target: 'chrome111', logLevel: 'silent' });
  return { v1: path.join(v1out, 'tarjuman-0.2.0'), v2, inject: bundle.outputFiles[0].text };
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
    await run({ b, extId: ext.id, extPage, watch, popupState });
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

const cues = makeCues(6, { startMs: 5000, text: (i) => `ترجمة الأول ${i}` });
const enTrack = englishTrack({ cues: cues.map((c) => ({ ...c, text: `line ${c.n}` })) });
const fp = fingerprint({ videoId: VIDEO, track: enTrack, id: 'fp_p10live0001' });
const secondCues = makeCues(6, { startMs: 5000, text: (i) => `ترجمة الثاني ${i}` });
const GLOSSARY = [{ source: 'prompt', target: 'موجِّه', note: null }, { source: 'token', target: 'رمز', note: null }];

try {
  const built = await prepare();
  check('v1-package-built', true, { from: 'tj-v1 scripts/release/package.mjs', dir: path.basename(built.v1) });

  // ١. الأول يُنشئ بيانات.
  await swapTo(built.v1);
  await session('1-v1-create', async ({ extPage, watch, popupState }) => {
    const p = await extPage('pages/settings/index.html');
    await p.eval(built.inject);
    const made = await p.eval(async (videoId, track, fingerprintObj, arCues) => {
      const { createStore, transitions: t, validateVideoRecord } = globalThis.__v1;
      const s = createStore();
      const now = () => new Date().toISOString();
      await s.updateVideo(videoId, (r) => t.withExport(r, { videoId, title: 'P10 — اختبار الرجوع', durationMs: 1203000, englishTrack: track, fingerprint: { ...fingerprintObj, createdAt: now() } }, now()));
      const rec = await s.updateVideo(videoId, (r) => t.withArabicImport(r, { videoId, fileName: 'v1-first.ar.srt', cues: arCues, comparison: null, fingerprintId: fingerprintObj.id, notes: [] }, now()).record);
      await s.setSettings({ displayModeDefault: 'dual' });
      return { rev: rec.rev, valid: validateVideoRecord(rec).ok, keys: await chrome.storage.local.getKeys() };
    }, { args: [VIDEO, enTrack, fp, cues] });
    check('v1-creates-data', made.valid && made.rev === 2 && made.keys.every((k) => ['meta', 'settings', `video:${VIDEO}`, `index:${VIDEO}`].includes(k)), made);
    await p.close();
    const { yt } = await watch();
    const st = await popupState(yt);
    check('v1-player-shows-it', st.reply?.arabic?.fileName === 'v1-first.ar.srt' && st.reply.mounted?.overlay === 'mounted', { arabic: st.reply?.arabic, mounted: st.reply?.mounted });
  });

  // ٢. الثاني يقرأ ويضيف ترجمة ثانية وعلامة وتفضيلات.
  await swapTo(built.v2);
  await session('2-v2-extend', async ({ extPage, watch, popupState }) => {
    const g = await extPage('ui/gallery/index.html');
    await g.waitFor(() => !!globalThis.__tarjumanPage, { timeoutMs: 10000 });
    const read = await g.eval(async (id) => {
      const s = globalThis.__tarjumanPage.store;
      const b = await s.getBundle(id);
      return { active: b?.active, file: b?.record.arabic?.fileName, settings: (await s.getSettings()).displayModeDefault, schema: (await chrome.storage.local.get('meta')).meta.schema };
    }, { args: [VIDEO] });
    check('v2-reads-v1-data', read.active === 1 && read.file === 'v1-first.ar.srt' && read.settings === 'dual' && read.schema === 1, read);
    const warnings = await g.eval(async () => {
      const m = chrome.runtime.getManifest();
      const w = (perms) => chrome.management.getPermissionWarningsByManifest(JSON.stringify({ ...m, permissions: perms }));
      return { actual: await w(m.permissions), v1: await w(['storage', 'unlimitedStorage']), downloads: await w(['storage', 'downloads']) };
    });
    check('v2-install-warnings-only-downloads', JSON.stringify(warnings.actual) === JSON.stringify(warnings.downloads) && warnings.actual.length === warnings.v1.length + 1, warnings);
    // لقطات المعرض بالوضعين.
    await b2shots(g);
    await g.close();
    const { yt } = await watch();
    const iso = yt.isolatedContextId(result.sessions.at(-1).extensionId);
    const done = await yt.eval(async (arCues, glossary) => {
      const c = globalThis.__tarjuman.controller;
      for (let i = 0; i < 40 && (c.getState().loading || !c.getState().saved); i++) await new Promise((r) => setTimeout(r, 250));
      const up = await c.loadArabicInto(2, { fileName: 'v2-second.ar.srt', cues: arCues });
      const m = await c.markCue({ index: 1 });
      await c.updatePrefs({ glossary: { terms: glossary }, saveLocation: { mode: 'subfolder', folder: 'Tarjuman' } });
      const s = c.getState();
      return { activated: up.activated, active: s.activeSlot, slots: s.slots.map((x) => [x.n, x.filled, x.active]), mark: m.mark?.kind, terms: s.prefs.glossary.terms.length };
    }, { contextId: iso, args: [secondCues, GLOSSARY] });
    check('v2-adds-second-translation-mark-prefs', done.activated && done.active === 2 && done.mark === 'todo' && done.terms === 2, done);
    const st = await popupState(yt);
    check('v2-popup-reply-has-slots', Array.isArray(st.reply?.slots) && st.reply.slots[1].active === true && st.reply.capture && st.reply.tools, { slots: st.reply?.slots, capture: st.reply?.capture, tools: st.reply?.tools });
  });

  // ٣. الأول مرة أخرى: يقرأ بواجهاته ويكتب (نقرة في الإعدادات، وإزاحة بشيفرته).
  await swapTo(built.v1);
  await session('3-v1-again', async ({ extPage, watch, popupState }) => {
    const { yt } = await watch();
    const st = await popupState(yt);
    check('v1-reads-v2-active-translation', st.reply?.arabic?.fileName === 'v2-second.ar.srt' && st.reply.mounted?.overlay === 'mounted' && !('slots' in st.reply), { arabic: st.reply?.arabic, mounted: st.reply?.mounted, popupShowsVideo: st.text.includes('P10 — اختبار الرجوع') });
    const lib = await extPage('pages/library/index.html');
    // العنوان يحدّثه المتحكم من الصفحة؛ فالصف يُعرف بمعرّفه.
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
    await set.eval(built.inject);
    const wrote = await set.eval(async (videoId) => {
      const { createStore, transitions: t, validateVideoRecord } = globalThis.__v1;
      const s = createStore();
      const rec = await s.updateVideo(videoId, (r) => t.withView(r, { displayOffsetMs: 1500 }, new Date().toISOString()));
      const settings = await s.getSettings();
      return { valid: validateVideoRecord(rec).ok, offset: rec.view.displayOffsetMs, step: settings.offsetStepMs, mode: settings.displayModeDefault, index: (await s.listIndex()).length };
    }, { args: [VIDEO] });
    check('v1-writes-offset-and-setting', wrote.valid && wrote.offset === 1500 && wrote.step === 1000 && wrote.mode === 'dual' && wrote.index === 1, wrote);
    await set.close();
  });

  // ٤. الثاني يقرأ الناتج سليمًا ويصالحه.
  await swapTo(built.v2);
  await session('4-v2-reads-result', async ({ extPage, watch }) => {
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
        terms: prefs.glossary.terms.length, save: prefs.saveLocation.mode, step: settings.offsetStepMs, mode: settings.displayModeDefault,
        reconciled: raw[`bundle:${id}`].base.rev === raw[`video:${id}`].rev, schema: (await chrome.storage.local.get('meta')).meta.schema,
      };
    }, { args: [VIDEO] });
    check('v2-reads-result-intact', r.active === 2 && r.files[0] === 'v1-first.ar.srt' && r.files[1] === 'v2-second.ar.srt' && r.offsets[1] === 1500 && r.marks[1] === 1
      && r.terms === 2 && r.save === 'subfolder' && r.step === 1000 && r.mode === 'dual' && r.reconciled && r.schema === 1, r);
    await g.close();
    const { yt } = await watch();
    const iso = yt.isolatedContextId(result.sessions.at(-1).extensionId);
    const s = await yt.eval(async () => {
      const c = globalThis.__tarjuman.controller;
      for (let i = 0; i < 40 && c.getState().loading; i++) await new Promise((r) => setTimeout(r, 250));
      const st = c.getState();
      return { active: st.activeSlot, offset: st.view.displayOffsetMs, first: st.arabic?.cues[0]?.text ?? null };
    }, { contextId: iso });
    check('v2-player-shows-result', s.active === 2 && s.offset === 1500 && s.first === 'ترجمة الثاني 1', s);
  });

  check('same-extension-id-all-sessions', new Set(result.sessions.map((x) => x.extensionId)).size === 1, result.sessions);
  const errCount = Object.values(result.errors).flat().reduce((n, e) => n + e.errors.length, 0);
  check('no-extension-errors', errCount === 0, errCount ? result.errors : null);
} catch (err) {
  check('run', false, { error: String(err.message).slice(0, 300) });
}

async function b2shots(g) {
  await g.waitFor(() => !!document.querySelector('[data-gallery="slots-sm"]'), { timeoutMs: 8000 });
  await g.conn.send('Target.activateTarget', { targetId: g.targetId });
  for (const scheme of ['light', 'dark']) {
    await emulateScheme(g, scheme);
    await sleep(200);
    const f = await fullScreenshot(g, path.join(OUT, `gallery-${browser}-${scheme}.png`), { width: 1280 });
    result.screenshots.push(rel(f));
  }
  await emulateScheme(g, 'light');
}

await mkdir(OUT, { recursive: true });
const json = JSON.stringify(result, null, 2);
const leaks = findSecrets(json);
if (leaks.length) throw new Error(`تسرب في الأدلة: ${leaks.join(', ')}`);
const file = path.join(OUT, `rollback-${browser}.json`);
await writeFile(file, `${json}\n`);
const failed = result.checks.filter((c) => !c.ok);
console.log(`${failed.length ? '✗' : '✓'} ${result.checks.length - failed.length}/${result.checks.length} — ${rel(file)}`);
process.exit(failed.length ? 1 : 0);
