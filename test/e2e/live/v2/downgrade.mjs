#!/usr/bin/env node
// الرجوع ببيانات حقيقية (P15-AC2) بعد الرحلة، على ملف التعريف نفسه بمكتبته الحقيقية (ترجمات 427 و1,056 و2,266 في خانات،
// وسابقة، وعلامات، وقاموس، ومكان حفظ):
//   ١. نسخة من ملف التعريف كله أولًا.
//   ٢. الثاني يقرأ: مدخل كل فيديو بصيغة النسخة الاحتياطية، والتفضيلات والإعدادات (المرجع).
//   ٣. حزمة tj-v1 الحقيقية في المسار نفسه: محفوظاتها تعرض الفيديوهات نفسها، ونافذتها ومحفوظاتها بلا خطأ، وتكتب بشيفرتها:
//      إعدادًا بضغطة (خطوة الضبط 1 ث)، وإزاحة على الترجمة النشطة لـTED (+1.5 ث).
//   ٤. الثاني مرة أخرى: كل فيديو كما كان إلا ما كتبه الأول وحده، والخانات والسابقة والعلامات والقاموس باقية، والمصالحة تامة.
// شيفرة الأول للكتابة من اللقطة المجمّدة test/fixtures/v1 (كما في دخان W6)، وجلسات مؤتمتة بلا نافذة.
//   command node test/e2e/live/v2/downgrade.mjs --browser brave|chrome [--headed]
import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { sleep } from '../../../live/harness/browser.mjs';
import { BROWSERS, Evidence, PROFILE_ROOT, ROOT, V2, VIDEOS, WORK, buildV1, launchBrowser, pidsOf } from './lib.mjs';
import { FONT_READ_LOG, appVersion, canonical, extPage, storagePrint } from './ui.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const HEADLESS = !argv.includes('--headed');
const { profile, ext } = V2[browser];
const profileDir = path.join(PROFILE_ROOT, profile);
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const TED = VIDEOS.manual.id;
const ev = new Evidence(path.join(ROOT, 'docs/evidence/P15', browser), 'downgrade', {
  step: 'downgrade', browser: `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].app) ?? '?'}`, profile, headless: HEADLESS,
});

/** كل فيديو بصيغة مدخل النسخة الاحتياطية (عقد backup §٣) من المفاتيح الخام، والتفضيلات والإعدادات. */
const snapshot = async () => {
  const all = await chrome.storage.local.get(null);
  const ids = Object.keys(all).filter((k) => k.startsWith('video:')).map((k) => k.slice(6)).sort();
  const videos = {};
  for (const id of ids) {
    const head = all[`bundle:${id}`];
    videos[id] = {
      record: all[`video:${id}`], active: head ? head.active : all[`video:${id}`].arabic ? 1 : null, names: head ? head.names : [null, null, null],
      alts: all[`alts:${id}`]?.slots ?? [null, null, null], previous: all[`prev:${id}`]?.previous ?? null,
      marks: all[`marks:${id}`]?.slots ?? [0, 1, 2].map(() => ({ marks: [], position: null })), base: head?.base ?? null,
    };
  }
  return { ids, videos, prefs: all.prefs ?? null, settings: all.settings ?? null, meta: all.meta ?? null };
};

async function swapTo(dir) {
  await rm(ext, { recursive: true, force: true });
  await cp(dir, ext, { recursive: true });
}
async function session(label, run) {
  const b = await launchBrowser(browser, { profile, ext, debug: true, headless: HEADLESS });
  const tracked = [];
  try {
    await sleep(1500);
    const lib = await extPage(b.conn, b.extId, 'pages/library/index.html', tracked);
    await lib.waitFor(() => document.querySelectorAll('li.lib-row').length > 0, { timeoutMs: 15000 });
    const version = await lib.eval(() => chrome.runtime.getManifest().version_name ?? chrome.runtime.getManifest().version);
    ev.note(`${label}: الإضافة ${version}`);
    return await run({ b, lib, tracked });
  } finally {
    const errs = tracked.flatMap((t) => t.errs.list.filter((x) => !(x.kind === 'log.security' && FONT_READ_LOG.test(x.text))).map((x) => ({ where: t.where, ...x })));
    ev.check(`${label}-no-extension-errors`, errs.length === 0, errs.length ? errs.slice(0, 5) : null);
    tracked.forEach((t) => t.errs.stop());
    await b.close();
  }
}

if (pidsOf(profileDir).length) throw new Error(`${BROWSERS[browser].name} يعمل بملف ${profile}؛ أغلقه أولًا`);
const work = path.join(WORK, browser, `downgrade-${RUN}`);
await mkdir(work, { recursive: true });
const backup = path.join(WORK, 'profile-backups', `${profile}-before-downgrade-${RUN}`);
await cp(profileDir, backup, { recursive: true });
ev.check('profile-backed-up-before-downgrade', (await stat(path.join(backup, 'Default'))).isDirectory(), { backup: path.relative(PROFILE_ROOT, backup) });

const v2 = path.join(work, 'v2dev');
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', v2], { cwd: ROOT, stdio: 'ignore' });
const v1 = await buildV1(work);
const v1inject = (await build({ entryPoints: [path.join(ROOT, 'test/live/compat/v1-entry.mjs')], bundle: true, format: 'iife', write: false, target: 'chrome111', logLevel: 'silent' })).outputFiles[0].text;

// ٢. الثاني يقرأ (المرجع).
await swapTo(v2);
const before = await session('v2-before', async ({ lib }) => {
  const s = await lib.eval(snapshot);
  const slots = Object.fromEntries(s.ids.map((id) => [id, [s.videos[id].record.arabic ? 1 : 0, ...s.videos[id].alts.map((x) => (x ? 1 : 0))].join('')]));
  ev.check('v2-library-with-slots-previous-marks', s.ids.includes(TED) && Object.values(s.videos).some((v) => v.alts.some(Boolean)) && Object.values(s.videos).some((v) => v.previous)
    && Object.values(s.videos).some((v) => v.marks.some((m) => m.marks.length)) && (s.prefs?.glossary?.terms ?? []).length > 0,
  { videos: s.ids.length, slots, previous: s.ids.filter((id) => s.videos[id].previous).length, marks: s.ids.map((id) => s.videos[id].marks.reduce((n, m) => n + m.marks.length, 0)) });
  return s;
});

// ٣. الأول يقرأ ويكتب.
await swapTo(v1.dir);
ev.note(`حزمة tj-v1 من الالتزام ${v1.commit}`);
const wrote = await session('v1', async ({ b, lib, tracked }) => {
  const rows = await lib.eval(() => document.querySelectorAll('li.lib-row').length);
  const failed = await lib.eval(() => !!document.querySelector('.tj-alert--danger'));
  ev.check('v1-library-lists-all', rows === before.ids.length && !failed, { rows, expected: before.ids.length, failed });
  const pop = await extPage(b.conn, b.extId, 'pages/popup/index.html', tracked);
  await sleep(1200);
  await pop.close();
  const set = await extPage(b.conn, b.extId, 'pages/settings/index.html', tracked);
  await set.waitFor(() => !!document.querySelector('input[type=radio][value="1"]'), { timeoutMs: 10000 });
  await set.eval(() => document.querySelector('input[type=radio][value="1"]').click());
  await sleep(1200);
  await set.eval(v1inject);
  return set.eval(async (videoId) => {
    const { createStore, transitions: t, validateVideoRecord } = globalThis.__v1;
    const s = createStore();
    const rec0 = await s.getVideo(videoId);
    const rec = await s.updateVideo(videoId, (r) => t.withView(r, { displayOffsetMs: 1500 }, new Date().toISOString()));
    const settings = await s.getSettings();
    return { file: rec0.arabic?.fileName ?? null, valid: validateVideoRecord(rec).ok, offset: rec.view.displayOffsetMs, step: settings.offsetStepMs, index: (await s.listIndex()).length };
  }, { args: [TED] });
});
ev.check('v1-reads-active-and-writes-offset-and-setting', wrote.valid && wrote.file === before.videos[TED].record.arabic?.fileName && wrote.offset === 1500 && wrote.step === 1000 && wrote.index === before.ids.length, wrote);

// ٤. الثاني يصالح دون فقد.
await swapTo(v2);
await session('v2-after', async ({ lib }) => {
  const after = await lib.eval(snapshot);
  const changed = [];
  for (const id of before.ids) {
    const a = before.videos[id];
    const z = after.videos[id];
    if (!z) {
      changed.push({ id, lost: true });
      continue;
    }
    // ما يملكه الثاني وحده يبقى كما هو حرفيًا؛ والسجل لا يتغير فيه إلا ما كتبه الأول (إزاحة TED) ومراجعته وتاريخه.
    const same = (k) => canonical(a[k]) === canonical(z[k]);
    const strip = (r) => ({ ...r, rev: 0, updatedAt: null, view: id === TED ? { ...r.view, displayOffsetMs: 0 } : r.view });
    const diff = ['active', 'names', 'alts', 'previous', 'marks'].filter((k) => !same(k));
    if (canonical(strip(a.record)) !== canonical(strip(z.record))) diff.push('record');
    if (diff.length) changed.push({ id, diff });
  }
  const tedOffset = after.videos[TED]?.record.view.displayOffsetMs;
  const reconciled = after.ids.every((id) => !after.videos[id].base || after.videos[id].base.rev === after.videos[id].record.rev);
  ev.check('v2-reconciles-without-loss', changed.length === 0 && tedOffset === 1500 && reconciled && after.ids.length === before.ids.length,
    { changed, tedOffset, reconciled, videos: after.ids.length });
  ev.check('v2-prefs-kept-and-v1-setting-read', canonical(after.prefs) === canonical(before.prefs) && after.settings?.offsetStepMs === 1000 && after.meta?.schema === before.meta?.schema,
    { glossary: after.prefs?.glossary?.terms?.length, save: after.prefs?.saveLocation?.mode, step: after.settings?.offsetStepMs });
  ev.note(`بصمة التخزين بعد العودة: ${Object.keys(await lib.eval(storagePrint)).length} مفتاحًا`);
});

await ev.write();
process.exit(ev.failed.length ? 1 : 0);
