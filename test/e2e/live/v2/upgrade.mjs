#!/usr/bin/env node
// الترقية ببيانات حقيقية (P15-AC2) قبل الجلسة اليدوية، على ملف P9 نفسه (مكتبة أنشأها الإصدار الأول بنقرات حقيقية):
//   ١. نسخة من ملف التعريف كله في مجلد العمل قبل أي شيء.
//   ٢. حزمة tj-v1 الحقيقية (من الوسم، بسكربت حزمتها) في مسار الإضافة: المحفوظات تعرض المكتبة، وبصمة كل مفتاح في التخزين.
//   ٣. بناء الإصدار الثاني في المسار نفسه (المعرّف نفسه): المحفوظات تعرض الفيديوهات نفسها، والقراءة لا تغيّر مفتاحًا.
//   ٤. الإعدادات بضغطات حقيقية: القاموس (4 مصطلحات، أحدها بملاحظة) ومكان الحفظ «مجلد فرعي»؛ ولا يتغير غير prefs.
// جلسات مؤتمتة بلا نافذة ومكتومة، بمنفذ تصحيح محلي، ولا يوتيوب.
//   command node test/e2e/live/v2/upgrade.mjs --browser brave|chrome [--headed]
import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { sleep } from '../../../live/harness/browser.mjs';
import { BROWSERS, Evidence, GLOSSARY, PROFILE_ROOT, ROOT, V2, WORK, buildV1, launchBrowser, pidsOf, setDownloadDir } from './lib.mjs';
import { FONT_READ_LOG, appVersion, byText, canonical, clickOn, extPage, navHash, noDiff, printDiff, storagePrint, typeInto } from './ui.mjs';

const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const HEADLESS = !argv.includes('--headed');
const { profile, ext } = V2[browser];
const profileDir = path.join(PROFILE_ROOT, profile);
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const DL = path.join(WORK, browser, 'downloads');
const ev = new Evidence(path.join(ROOT, 'docs/evidence/P15', browser), 'upgrade', {
  step: 'upgrade', browser: `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].app) ?? '?'}`, profile, headless: HEADLESS,
});

async function swapTo(dir, target = ext) {
  await rm(target, { recursive: true, force: true });
  await cp(dir, target, { recursive: true });
}

/** جلسة مؤتمتة بلا نافذة على ملف التعريف: صفحات الإضافة وأخطاؤها. */
async function session(label, run) {
  const b = await launchBrowser(browser, { profile, ext, debug: true, headless: HEADLESS });
  const tracked = [];
  try {
    await sleep(1500);
    const lib = await extPage(b.conn, b.extId, 'pages/library/index.html', tracked);
    const version = await lib.eval(() => chrome.runtime.getManifest().version_name ?? chrome.runtime.getManifest().version);
    ev.note(`${label}: الإضافة ${version} (${b.version.product})`);
    return await run({ b, lib, tracked, version });
  } finally {
    const errs = tracked.flatMap((t) => t.errs.list.filter((x) => !(x.kind === 'log.security' && FONT_READ_LOG.test(x.text))).map((x) => ({ where: t.where, ...x })));
    ev.check(`${label}-no-extension-errors`, errs.length === 0, errs.length ? errs.slice(0, 5) : null);
    tracked.forEach((t) => t.errs.stop());
    await b.close();
  }
}

// صف الأول بلا data-video، ومعرّفه في أول عنصر من .lib-row__id (معزولًا باتجاهه).
const rowsOf = (lib) => lib.eval(() => [...document.querySelectorAll('li.lib-row')]
  .map((r) => r.dataset.video ?? r.querySelector('.lib-row__id')?.firstElementChild?.textContent.replace(/[\u2066-\u2069]/g, '').trim()).sort());
const waitRows = (lib) => lib.waitFor(() => document.querySelectorAll('li.lib-row').length > 0 || !!document.querySelector('.tj-empty'), { timeoutMs: 15000 });
/** المفاتيح الخام لكل فيديو: هل له ترجمة عربية وعدد مقاطعها وعدد بصماته (للمقارنة بين الإصدارين). */
const libraryRaw = () => chrome.storage.local.get(null).then((all) => Object.keys(all).filter((k) => k.startsWith('video:')).sort()
  .map((k) => ({ id: k.slice(6), arabic: all[k].arabic ? (all[k].arabic.current ?? all[k].arabic.original).length : 0, fingerprints: (all[k].fingerprints ?? []).length })));

if (pidsOf(profileDir).length) throw new Error(`${BROWSERS[browser].name} يعمل بملف ${profile}؛ أغلقه أولًا`);
const work = path.join(WORK, browser, `upgrade-${RUN}`);
await mkdir(work, { recursive: true });

// ١. نسخة من ملف التعريف كله أولًا.
const backup = path.join(WORK, 'profile-backups', `${profile}-${RUN}`);
await cp(profileDir, backup, { recursive: true });
ev.check('profile-backed-up-before-upgrade', (await stat(path.join(backup, 'Default'))).isDirectory(), { backup: path.relative(PROFILE_ROOT, backup) });
await setDownloadDir(profileDir, DL);

// ٢. tj-v1.
const v1 = await buildV1(work);
await swapTo(v1.dir);
ev.note(`حزمة tj-v1 من الالتزام ${v1.commit}`);
const before = await session('v1', async ({ lib, version }) => {
  await waitRows(lib);
  const rows = await rowsOf(lib);
  const print = await lib.eval(storagePrint);
  const raw = await lib.eval(libraryRaw);
  ev.check('v1-library-shows-real-data', rows.length > 0 && rows.length === raw.length && raw.some((v) => v.arabic > 0), { version, rows: rows.length, videos: raw });
  return { rows, print, raw };
});

// ٣ و٤. الإصدار الثاني في المسار نفسه.
const v2 = path.join(work, 'v2dev');
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--out', v2], { cwd: ROOT, stdio: 'ignore' });
await swapTo(v2);
await session('v2', async ({ b, lib, tracked, version }) => {
  await waitRows(lib);
  await sleep(1500);
  const rows = await rowsOf(lib);
  const print = await lib.eval(storagePrint);
  const raw = await lib.eval(libraryRaw);
  const d = printDiff(before.print, print);
  ev.check('v2-reads-same-library', canonical(rows) === canonical(before.rows) && canonical(raw) === canonical(before.raw), { version, rows: rows.length, same: canonical(raw) === canonical(before.raw) });
  ev.check('v2-read-writes-nothing', noDiff(d), noDiff(d) ? { keys: Object.keys(print).length } : d);

  const st = await extPage(b.conn, b.extId, 'pages/settings/index.html#glossary', tracked);
  await st.waitFor(() => !!document.querySelector('.st-gl__count'), { timeoutMs: 8000 });
  await b.conn.send('Target.activateTarget', { targetId: st.targetId });
  for (const t of GLOSSARY) {
    await typeInto(st, `document.querySelector('.st-gl__field--source input')`, t.source, 'المصطلح');
    await typeInto(st, `document.querySelector('.st-gl__field--target input')`, t.target, 'المقابل');
    if (t.note) await typeInto(st, `document.querySelector('.st-gl__field--note input')`, t.note, 'الملاحظة');
    await clickOn(st, byText('.st-gl__add button', 'إضافة'), 'إضافة مصطلح');
    await sleep(500);
  }
  await navHash(st, 'export');
  await st.waitFor(() => !!document.querySelector('.st-location'), { timeoutMs: 8000 });
  await clickOn(st, `document.querySelector('.st-location input[value="subfolder"]')`, 'مجلد فرعي');
  await sleep(800);
  const prefs = (await st.eval(() => chrome.storage.local.get('prefs'))).prefs;
  const terms = prefs?.glossary?.terms ?? [];
  const same = terms.length === GLOSSARY.length && terms.every((t, i) => t.source === GLOSSARY[i].source && t.target === GLOSSARY[i].target && (t.note ?? null) === (GLOSSARY[i].note ?? null));
  ev.check('v2-settings-glossary-and-subfolder', prefs?.glossary.attach === true && same && prefs.saveLocation.mode === 'subfolder', { attach: prefs?.glossary.attach, terms: terms.length, saveLocation: prefs?.saveLocation });
  const after = await st.eval(storagePrint);
  const d2 = printDiff(before.print, after);
  ev.check('v2-settings-write-prefs-only', d2.changed.length === 0 && d2.removed.length === 0 && d2.added.every((k) => k === 'prefs'), d2);
});

await ev.write();
process.exit(ev.failed.length ? 1 : 0);
