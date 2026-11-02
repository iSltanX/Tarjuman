#!/usr/bin/env node
// إثبات حي مبكر لمكان الحفظ والقفز (P10-AC9 وAC5، المهمة ٣): بناء التطوير في ملف اختبار منفصل، ومجلد تنزيلات الاختبار
// في ملف التعريف نفسه (لا مجلد تنزيلات المستخدم). من صفحة إضافة (المعرض) ومن المشغّل (العالم المعزول) بالأوضاع:
//   - downloads: يقارَن بالتنزيل الحالي عبر Blob في المجلد نفسه، ثم بإعداد المتصفح «اسأل» (يُلاحظ ولا يُفترض).
//   - subfolder: مجلد فرعي داخل التنزيلات تلقائيًا، ولا كتابة فوق ملف قائم.
//   - ask (بـ--ask ونافذة ظاهرة): حوار الحفظ من النظام، ونقرة «حفظ» من سلطان.
// ومعها: تحذيرات التثبيت، وقراءة عنوان التبويب بأذونات البيان، والقفز إلى التبويب المفتوح ثم إلى تبويب جديد.
//   node test/live/compat/save-location.mjs --browser brave|chrome [--headed] [--ask] [--out docs/evidence/P10]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, openTab } from '../harness/extension.mjs';
import { dismissConsent, waitForPlayer } from '../harness/youtube.mjs';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const ASK = argv.includes('--ask');
const HEADED = argv.includes('--headed') || ASK;
const VIDEO = val('video', 'iG9CE55wbtY');
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P10'));
const PROFILE = `${browser}-p10`;
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const DL = path.join(PROFILE_ROOT, `downloads-${browser}-p10`, RUN);
const EXT = path.join(PROFILE_ROOT, 'ext-p10-dev');

const result = { browser: null, at: new Date().toISOString(), mode: ASK ? 'ask' : 'auto', checks: [], observations: {}, errors: {} };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
};
const observe = (id, value) => {
  result.observations[id] = value;
  console.log(`• ${id} — ${JSON.stringify(value)}`);
};
/** المسار نسبةً إلى مجلد تنزيلات الاختبار، فلا يُكتب مسار الجهاز في الأدلة. */
const inDl = (p) => (typeof p === 'string' && p.startsWith(DL) ? `‹تنزيلات الاختبار›${p.slice(DL.length)}` : p ? '‹خارج تنزيلات الاختبار›' : null);

function appVersion(bin) {
  try {
    const plist = path.join(bin.slice(0, bin.indexOf('.app/') + 4), 'Contents/Info.plist');
    return String(execFileSync('/usr/bin/defaults', ['read', plist, 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}

/** إعدادات التنزيل في ملف تعريف الاختبار وحده: مجلده، و«اسأل» بحسب الجولة. */
async function setDownloadPrefs({ prompt }) {
  const file = path.join(PROFILE_ROOT, PROFILE, 'Default', 'Preferences');
  await mkdir(path.dirname(file), { recursive: true });
  let prefs = {};
  try {
    prefs = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // ملف تعريف جديد.
  }
  prefs.download = { ...(prefs.download ?? {}), default_directory: DL, prompt_for_download: prompt, directory_upgrade: true };
  prefs.savefile = { ...(prefs.savefile ?? {}), default_directory: DL };
  await writeFile(file, JSON.stringify(prefs));
}

const listDl = async (sub = '') => {
  try {
    return (await readdir(path.join(DL, sub))).sort();
  } catch {
    return [];
  }
};

async function session({ prompt, run }) {
  await setDownloadPrefs({ prompt });
  const b = await launch({ browser, profile: PROFILE, headless: !HEADED });
  result.browser ??= `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].bin) ?? '?'} (${b.version.product})`;
  try {
    const ext = await loadExtension(b.conn, EXT);
    if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
    const page = await openTab(b.conn, `chrome-extension://${ext.id}/ui/gallery/index.html`);
    const pageErrors = collectErrors(page, { extId: ext.id });
    if (!(await page.waitFor(() => !!globalThis.__tarjumanPage, { timeoutMs: 10000 }))) throw new Error('خطاف المعرض غير موجود (بناء التطوير؟)');
    const out = await run({ b, page, extId: ext.id });
    result.errors[`page-${prompt ? 'prompt' : 'auto'}`] = pageErrors;
    return out;
  } finally {
    // ينتظر خروج المتصفح: يكتب Preferences عند الخروج، فلا يطمس إعداد الجولة التالية.
    const exited = new Promise((r) => (b.child.exitCode !== null ? r() : b.child.once('exit', r)));
    await b.close();
    await Promise.race([exited, sleep(15000)]);
    await sleep(500);
  }
}

const saveFromPage = (page, mode, name, text = 'ترجمان — ملف اختبار P10\n') => page.eval(async (m, n, t) => {
  const p = globalThis.__tarjumanPage;
  await p.store.setPrefs({ saveLocation: { mode: m, folder: 'Tarjuman' } });
  const r = await p.saveFile({ name: n, text: t });
  return { r, path: r.ok && r.downloadId !== null ? await p.savedPath(r.downloadId) : null };
}, { args: [mode, name, text] });

async function openWatch(b, extId) {
  const yt = await openTab(b.conn, 'about:blank');
  const errors = collectErrors(yt, { extId, onlyExtension: true });
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  const ready = await waitForPlayer(yt, VIDEO);
  await yt.eval(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; v.pause(); })).catch(() => {});
  if (await yt.eval(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  await sleep(1500);
  return { yt, ready, errors };
}

const saveFromPlayer = async (yt, page, extId, mode, name) => {
  await page.eval(async (m) => globalThis.__tarjumanPage.store.setPrefs({ saveLocation: { mode: m, folder: 'Tarjuman' } }), { args: [mode] });
  const ctx = yt.isolatedContextId(extId);
  const r = await yt.eval(async (n) => globalThis.__tarjuman.saveFile({ name: n, text: 'ترجمان — من المشغّل\n' }), { contextId: ctx, args: [name] });
  const p = r.ok && r.downloadId !== null ? await page.eval(async (id) => globalThis.__tarjumanPage.savedPath(id), { args: [r.downloadId] }) : null;
  return { r, path: p };
};

execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', EXT], { stdio: 'ignore' });
await mkdir(DL, { recursive: true });
await mkdir(OUT, { recursive: true });
console.log(`P10 مكان الحفظ — ${browser}${ASK ? ' (اسأل، بنافذة ظاهرة)' : ''}`);

try {
  if (!ASK) {
    // ١. بلا سؤال من المتصفح: الأوضاع التلقائية والمقارنة بالتنزيل الحالي، وتحذيرات التثبيت، والقفز.
    await session({
      prompt: false,
      async run({ b, page, extId }) {
        const warnings = await page.eval(async () => {
          const m = chrome.runtime.getManifest();
          const w = (perms) => chrome.management.getPermissionWarningsByManifest(JSON.stringify({ ...m, permissions: perms }));
          return { actual: await w(m.permissions), v1: await w(['storage', 'unlimitedStorage']), storageOnly: await w(['storage']), downloadsOnly: await w(['downloads']) };
        });
        const added = warnings.actual.filter((x) => !warnings.v1.includes(x));
        const downloadsWarning = warnings.downloadsOnly.filter((x) => !warnings.storageOnly.includes(x));
        check('install-warnings-only-downloads-added', added.length === 1 && JSON.stringify(warnings.v1) === JSON.stringify(warnings.storageOnly) && downloadsWarning.length === 1 && added[0] === downloadsWarning[0], { added, v1: warnings.v1 });

        // التنزيل الحالي (Blob) والوضع الافتراضي في المجلد نفسه.
        await page.eval(async () => globalThis.__tarjumanPage.blobDownload({ name: 'p10-blob-current.srt', text: 'blob\n' }));
        await sleep(2500);
        const blobLanded = (await listDl()).includes('p10-blob-current.srt');
        const def = await saveFromPage(page, 'downloads', 'p10-page-downloads.srt');
        check('page-downloads-default-folder', def.r.ok && def.r.mode === 'downloads' && def.path === path.join(DL, 'p10-page-downloads.srt'), { result: def.r, path: inDl(def.path) });
        check('default-matches-current-blob-folder', blobLanded && def.path && path.dirname(def.path) === DL, { blobLanded, sameFolder: def.path ? path.dirname(def.path) === DL : false });
        const sub = await saveFromPage(page, 'subfolder', 'p10-page-subfolder.srt');
        check('page-subfolder-auto', sub.r.ok && sub.r.mode === 'subfolder' && sub.path === path.join(DL, 'Tarjuman', 'p10-page-subfolder.srt'), { result: sub.r, path: inDl(sub.path) });
        const again = await saveFromPage(page, 'subfolder', 'p10-page-subfolder.srt');
        check('no-overwrite-uniquify', again.r.ok && again.path && again.path !== sub.path && path.dirname(again.path) === path.join(DL, 'Tarjuman'), { path: inDl(again.path), files: await listDl('Tarjuman') });
        const bad = await page.eval(async () => globalThis.__tarjumanPage.saveFile({ name: '../escape.srt', text: 'x' }));
        check('page-rejects-bad-name', !bad.ok && bad.code === 'SV_BAD_FILE', bad);

        // المشغّل عبر العامل الخلفي.
        const { yt, ready, errors: ytErrors } = await openWatch(b, extId);
        check('watch-page', !!ready, ready ? { durationSec: Math.round(ready.duration) } : null);
        const pDef = await saveFromPlayer(yt, page, extId, 'downloads', 'p10-player-downloads.srt');
        check('player-downloads-default-folder', pDef.r.ok && pDef.r.mode === 'downloads' && pDef.path === path.join(DL, 'p10-player-downloads.srt'), { result: pDef.r, path: inDl(pDef.path) });
        const pSub = await saveFromPlayer(yt, page, extId, 'subfolder', 'p10-player-subfolder.srt');
        check('player-subfolder-auto', pSub.r.ok && pSub.r.mode === 'subfolder' && pSub.path === path.join(DL, 'Tarjuman', 'p10-player-subfolder.srt'), { result: pSub.r, path: inDl(pSub.path) });

        // قراءة عنوان التبويب بأذونات البيان الحالية (Q14): ملاحظة لا شرط؛ الأداة لا تعتمد عليها.
        const urlVisible = await page.eval(async () => {
          const tabs = await chrome.tabs.query({});
          const yt = tabs.filter((t) => typeof t.url === 'string' && t.url.startsWith('https://www.youtube.com/'));
          let filtered = null;
          try {
            filtered = (await chrome.tabs.query({ url: 'https://www.youtube.com/*' })).length;
          } catch (e) {
            filtered = `error: ${e.message}`;
          }
          return { tabs: tabs.length, withYoutubeUrl: yt.length, urlFilterResult: filtered };
        });
        observe('tab-url-readable-with-current-manifest', urlVisible);

        // القفز: التبويب المفتوح (يتغير الزمن وحده)، ثم بلا تبويب يُفتح جديد عند الزمن.
        const before = await yt.eval(() => { const v = document.querySelector('#movie_player video'); return { t: v.currentTime, paused: v.paused }; });
        const jump = await page.eval(async (id) => globalThis.__tarjumanPage.jumpToVideo({ videoId: id, ms: 61000 }), { args: [VIDEO] });
        await sleep(800);
        const after = await yt.eval(() => { const v = document.querySelector('#movie_player video'); return { t: v.currentTime, paused: v.paused }; });
        check('jump-open-tab', jump.ok && jump.via === 'open' && Math.abs(after.t - 61) < 1.5 && after.paused === before.paused, { jump, before: { paused: before.paused }, after });
        const wrong = await page.eval(async (id) => {
          const tabs = await chrome.tabs.query({});
          const replies = await Promise.all(tabs.map((t) => chrome.tabs.sendMessage(t.id, { type: 'tj:seek', v: 1, videoId: 'BBBBBBBBBBB', ms: 1000 }).catch(() => null)));
          return replies.filter(Boolean);
        }, { args: [VIDEO] });
        check('seek-wrong-video-refused', wrong.length >= 1 && wrong.every((r) => r.ok === false && r.code === 'TJ_WRONG_VIDEO'), wrong);
        result.errors.youtube = ytErrors;
        await yt.close();
        // كل تبويب آخر للفيديو (منها ما يستعيده المتصفح من جلسة سابقة) يُغلق، فلا يبقى تبويب مفتوح له.
        for (const t of (await b.conn.send('Target.getTargets')).targetInfos) {
          if (t.type === 'page' && t.url.includes(`v=${VIDEO}`)) await b.conn.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
        }
        await sleep(800);
        const fresh = await page.eval(async (id) => globalThis.__tarjumanPage.jumpToVideo({ videoId: id, ms: 125000 }), { args: [VIDEO] });
        await sleep(1500);
        const { targetInfos } = await b.conn.send('Target.getTargets');
        const opened = targetInfos.find((t) => t.type === 'page' && t.url.includes(`v=${VIDEO}`));
        check('jump-new-tab-at-time', fresh.ok && fresh.via === 'new' && !!opened && /[?&]t=125s/.test(opened.url), { jump: fresh, url: opened ? opened.url.replace(/^https:\/\/www\.youtube\.com/, '‹yt›') : null });
        return null;
      },
    });

    // ٢. المتصفح يطلب السؤال عند كل تنزيل: الافتراضي يتبعه كالتنزيل الحالي (ملاحظة بلا نقر: هل ينتظر الحوار؟).
    await session({
      prompt: true,
      async run({ page }) {
        const watch = async (mode) => page.eval(async (m) => {
          const p = globalThis.__tarjumanPage;
          await p.store.setPrefs({ saveLocation: { mode: m, folder: 'Tarjuman' } });
          const started = p.saveFile({ name: `p10-prompt-${m}.srt`, text: 'x\n' }, { settle: { pollMs: 300, timeoutMs: 2500 } });
          const r = await started;
          const [item] = r.downloadId != null ? await chrome.downloads.search({ id: r.downloadId }) : [];
          return { r, state: item?.state ?? null, hasFilename: !!item?.filename };
        }, { args: [mode] });
        observe('browser-asks-downloads-mode', await watch('downloads'));
        observe('browser-asks-subfolder-mode', await watch('subfolder'));
        return null;
      },
    });
    observe('files-in-test-downloads', { root: await listDl(), Tarjuman: await listDl('Tarjuman') });
  } else {
    // ٣. «اسأل عن مكان الحفظ»: حوار النظام من الصفحة ثم من المشغّل؛ النقر على «حفظ» من سلطان. --follow-only يتخطاه.
    if (!argv.includes('--follow-only')) await session({
      prompt: false,
      async run({ b, page, extId }) {
        console.log('⏳ سيظهر حوار حفظ: اضغط «حفظ» (من صفحة الإضافة).');
        const fromPage = await page.eval(async () => {
          const p = globalThis.__tarjumanPage;
          await p.store.setPrefs({ saveLocation: { mode: 'ask', folder: 'Tarjuman' } });
          const r = await p.saveFile({ name: 'p10-page-ask.srt', text: 'ask\n' });
          return { r, path: r.ok ? await p.savedPath(r.downloadId) : null };
        });
        check('page-ask-dialog-saved', fromPage.r.ok && fromPage.r.mode === 'ask' && !!fromPage.path, { result: fromPage.r, path: inDl(fromPage.path) });
        const { yt } = await openWatch(b, extId);
        console.log('⏳ سيظهر حوار حفظ: اضغط «حفظ» (من المشغّل).');
        const fromPlayer = await saveFromPlayer(yt, page, extId, 'ask', 'p10-player-ask.srt');
        check('player-ask-dialog-saved', fromPlayer.r.ok && fromPlayer.r.mode === 'ask' && !!fromPlayer.path, { result: fromPlayer.r, path: inDl(fromPlayer.path) });
        return null;
      },
    });
    if (!argv.includes('--no-follow')) {
      // ٤. إعداد المتصفح «اسأل عن مكان الحفظ» مفعّل: التنزيل الحالي (Blob) ثم الوضع الافتراضي، وكلاهما ينتظر الحوار نفسه.
      // الحزام (لا الإضافة) يستعلم عن التنزيل ليلاحظ الانتظار: «جارٍ» بلا اسم ملف قبل النقر.
      await session({
        prompt: true,
        async run({ page }) {
          const pendingThenDone = (start) => page.eval(async (code) => {
            const find = async () => (await chrome.downloads.search({ orderBy: ['-startTime'], limit: 1 }))[0] ?? null;
            const before = await find();
            const startedAt = Date.now();
            const p = globalThis.__tarjumanPage;
            const run = code === 'blob' ? p.blobDownload({ name: 'p10-follow-blob.srt', text: 'blob\n' }) : p.saveFile({ name: 'p10-follow-default.srt', text: 'default\n' });
            await new Promise((r) => setTimeout(r, 1500));
            const mid = await find();
            const waiting = !!mid && mid.id !== before?.id && mid.state === 'in_progress';
            await run;
            for (let i = 0; i < 300; i++) {
              const it = await find();
              if (it && it.state !== 'in_progress') return { waitingForDialog: waiting, finalState: it.state, seconds: Math.round((Date.now() - startedAt) / 1000) };
              await new Promise((r) => setTimeout(r, 500));
            }
            return { waitingForDialog: waiting, finalState: 'timeout' };
          }, { args: [start] });
          await page.eval(async () => globalThis.__tarjumanPage.store.setPrefs({ saveLocation: { mode: 'downloads', folder: 'Tarjuman' } }));
          console.log('⏳ إعداد المتصفح «اسأل»: سيظهر حوار حفظ للتنزيل الحالي، اضغط «حفظ».');
          const blob = await pendingThenDone('blob');
          console.log('⏳ ثم حوار للوضع الافتراضي في ترجمان، اضغط «حفظ».');
          const def = await pendingThenDone('default');
          check('default-follows-browser-ask-like-current', blob.waitingForDialog && def.waitingForDialog && blob.finalState === 'complete' && def.finalState === 'complete', { currentBlob: blob, v2Default: def });
          return null;
        },
      });
    }
  }
} catch (err) {
  check('run', false, { error: String(err.message).slice(0, 300) });
}

const json = JSON.stringify(result, null, 2);
const leaks = findSecrets(json);
if (leaks.length) throw new Error(`تسرب في الأدلة: ${leaks.join(', ')}`);
const file = path.join(OUT, `save-location-${browser}${ASK ? (argv.includes('--follow-only') ? '-follow' : '-ask') : ''}.json`);
await writeFile(file, `${json}\n`);
const failed = result.checks.filter((c) => !c.ok);
console.log(`${failed.length ? '✗' : '✓'} ${result.checks.length - failed.length}/${result.checks.length} — ${path.relative(ROOT, file)}${existsSync(DL) ? '' : ''}`);
process.exit(failed.length ? 1 : 0);
