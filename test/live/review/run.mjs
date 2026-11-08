#!/usr/bin/env node
// الاختبار الحي لإصلاحات المراجعة المستقلة على الفرع tj/review-apply (c346899 و37b2622)، على بناء الإنتاج (dist) في ملف
// اختبار منفصل خارج المستودع، بلا نافذة، بضغطات Input حقيقية وصفحات الإضافة وحدها (لا يوتيوب ولا تسجيل دخول):
//   ١) الحذف بما سُرد في التأكيد: تبويبا محفوظات حقيقيان على التخزين نفسه؛ التأكيد يُفتح في الأول، والثاني يغيّر الترجمات
//      بواجهته قبل الموافقة، فلا يُحذف شيء ويقول الأول ذلك ويعيد القائمة. أربع حالات: النشطة، والبطاقة، والسابقة، والكل.
//   ٢) النص الدراسي بإزاحة سالبة: إشعار في الحوار قبل التنزيل، والملف النازل روابطه بالإزاحة وما قبل الصفر وحده من 0:00؛
//      من المحفوظات ومن المحرّر، وبإزاحة موجبة بلا إشعار.
//   ٣) بصمة التصدير بأزمنتها: تصدير الإنجليزية بالنص نفسه وتوقيت آخر يحفظ بصمته، ورفع الترجمة يقارنها بها بلا انحراف.
//   ٤) «الإبلاغ عن مشكلة»: خادم البلاغات محاكى بـCDP Fetch في الصفحة نفسها (لا يخرج طلب ولا يُنشأ بلاغ حقيقي)؛ التركيز بعد
//      «أعد المحاولة» بمفتاح Enter، وفشل «نسخ الرقم» ونجاحه، والمفتاح نفسه في الإعادات وجديد للبلاغ التالي.
// نسخة الاختبار من dist تحمل إذن مضيف البلاغات في host_permissions (في ملف التعريف، لا في المستودع)، و«طلب الإذن» مستبدل
// في الصفحة بنعم: حوار الإذن ينتظر يدًا بلا نافذة (T3)، وليس مما تغيّر هنا. والحافظة مستبدلة لتُرفض أو تُقبل عمدًا.
//   command npm run build
//   command node test/live/review/run.mjs --browser brave [--out test-results/live/review-apply]
//   command node test/live/review/run.mjs --browser chrome
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { messageFor } from '../../../src/core/errors/index.js';
import { REPORTS_HOST_PATTERN } from '../../../src/core/report/client.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { makeStep } from '../../helpers/live-step.mjs';
import { BROWSERS, PROFILE_ROOT, human, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, openTab } from '../harness/extension.mjs';
import { FP_SHIFT, IDS, STUDY, arabicForNewTiming, buildReviewSeed, englishAt } from './seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const DIST = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'test-results/live/review-apply'), browser);
const PROFILE = val('profile', `${browser}-review`);
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const DL = path.join(PROFILE_ROOT, `downloads-${PROFILE}`, RUN);
const EXT = path.join(PROFILE_ROOT, `ext-${PROFILE}`, RUN);
const STALE = messageFor('PG_DELETE_STALE');
const REPORTS_HOST = new URL(REPORTS_HOST_PATTERN.replace('/*', '/')).host;

const result = { browser: null, at: new Date().toISOString(), commit: null, extension: null, checks: [], observations: {}, screenshots: [], errors: {}, network: {} };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail !== null ? ` — ${JSON.stringify(detail)}` : ''}`);
};
const observe = (id, value) => {
  result.observations[id] = value;
  console.log(`• ${id} — ${JSON.stringify(value)}`);
};
// الخطوة وفحوصها المتوقعة (U69): كل فحص لم يُنفّذ بسبب استثناء يُسجَّل باسمه فاشلًا (test/helpers/live-step.mjs).
const step = makeStep(result, check);

function appVersion(bin) {
  try {
    const plist = path.join(bin.slice(0, bin.indexOf('.app/') + 4), 'Contents/Info.plist');
    return String(execFileSync('/usr/bin/defaults', ['read', plist, 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}
const gitHead = () => {
  try {
    return String(execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT })).trim();
  } catch {
    return null;
  }
};

// ---- التنزيلات ----
async function setDownloadPrefs() {
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
  await mkdir(DL, { recursive: true });
}
const listDl = async () => {
  try {
    return (await readdir(DL)).sort();
  } catch {
    return [];
  }
};
/** أول ملف جديد مكتمل يطابق الاسم (ما لم يكن قبل الفعل). */
async function waitNewFile(before, match, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const f = (await listDl()).find((n) => !before.has(n) && match(n) && !n.endsWith('.crdownload'));
    if (f) {
      await sleep(300);
      return { name: f, text: await readFile(path.join(DL, f), 'utf8') };
    }
    await sleep(300);
  }
  return null;
}
const linksOf = (text) => [...String(text ?? '').matchAll(/&t=(\d+)s/g)].map((x) => Number(x[1]));

// ---- الصفحات ----
let b = null;
let extId = null;
const pages = [];

async function openExt(rest, label = rest) {
  const page = await openTab(b.conn, 'about:blank');
  const errs = collectErrors(page, { extId });
  const net = { external: 0, reports: 0, hosts: new Set() };
  await page.send('Network.enable');
  page.on('Network.requestWillBeSent', (p) => {
    const u = p.request.url;
    if (/^(chrome-extension|data|blob|about):/.test(u)) return;
    let host = '?';
    try { host = new URL(u).host; } catch { /* غير صالح */ }
    if (host === REPORTS_HOST) net.reports++;
    else {
      net.external++;
      net.hosts.add(host);
    }
  });
  pages.push({ label, errs, net });
  await page.goto(`chrome-extension://${extId}/${rest}`);
  return page;
}
const front = (page) => page.send('Page.bringToFront').catch(() => {});

/** يضغط عنصرًا تعيده عبارة JS بضغطة Input حقيقية في مركزه، بعد تقديم تبويبه. */
async function clickOn(page, expr, label) {
  await front(page);
  const ok = await page.eval(`(() => { for (const e of document.querySelectorAll('[data-rv]')) e.removeAttribute('data-rv'); const el = (${expr}); if (!el) return false; el.setAttribute('data-rv', '1'); return true; })()`);
  if (!ok) throw new Error(`لم يوجد: ${label}`);
  const c = await page.centerOf('[data-rv="1"]');
  if (!c) throw new Error(`غير ظاهر: ${label}`);
  await page.click(c.x, c.y);
  await human(250, 500);
}
const byText = (sel, text, root = 'document') => `[...${root}.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(text)}))`;
const topDialog = `[...document.querySelectorAll('dialog.tj-dialog[open]')].at(-1)`;
const confirmBtn = `${topDialog}?.querySelector('button[value="confirm"]')`;
const textOf = (page, expr) => page.eval(`(() => { const e = (${expr}); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);
const row = (id) => `document.querySelector('li.lib-row[data-video="${id}"]')`;
const menuItem = (label) => byText('.tj-menu__list:not([hidden]) [role=menuitem]', label);

async function typeInto(page, expr, text, label) {
  await clickOn(page, expr, label);
  await page.eval(`(() => { const e = document.querySelector('[data-rv="1"]'); e.select?.(); })()`);
  await page.send('Input.insertText', { text });
  await sleep(150);
  await page.key('Tab', 'Tab', 9);
  await human(300, 600);
}
/** Enter حقيقي على العنصر المركّز (keyDown بنص \r، كما تفعله لوحة المفاتيح). */
async function pressEnter(page) {
  await front(page);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
  await sleep(40);
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(150);
}
async function chooseFile(page, expr, file, label) {
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  const opened = b.conn.waitFor('Page.fileChooserOpened', () => true, { sessionId: page.sessionId, timeoutMs: 15000 });
  await clickOn(page, expr, label);
  const ev = await opened;
  await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: ev.backendNodeId });
  await page.send('Page.setInterceptFileChooserDialog', { enabled: false });
}
/** نص الإشعارات الظاهرة ومنطقتها الحية، يُقرأ مرارًا حتى يظهر المطلوب (الإشعار يزول بعد مهلة). */
const waitToast = (page, needle, timeoutMs = 8000) => page.waitFor((n) => {
  const t = [...document.querySelectorAll('.tj-toasts, .tj-sr-only[aria-live]')].map((e) => e.textContent).join(' | ');
  return t.includes(n) ? t.replace(/\s+/g, ' ').trim().slice(0, 300) : null;
}, { args: [needle], timeoutMs, intervalMs: 100 });

async function shot(page, name) {
  await front(page);
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot(file);
  result.screenshots.push(path.relative(ROOT, file));
  await page.send('Emulation.clearDeviceMetricsOverride');
}

// ---- التخزين ----
const getKeys = (page, keys) => page.eval(async (k) => chrome.storage.local.get(k), { args: [keys] });
/** حزمة الفيديو كما يقرؤها ترجمان: مفاتيحه من التخزين الحقيقي في مخزن Node بالقواعد نفسها. */
async function bundleOf(page, id) {
  const raw = await page.eval(async (vid) => {
    const all = await chrome.storage.local.get(null);
    return Object.fromEntries(Object.entries(all).filter(([k]) => k === 'meta' || k.endsWith(`:${vid}`)));
  }, { args: [id] });
  const store = createStore({ area: createMemoryArea({ unlimited: true, initial: raw }), now: () => Date.now() });
  return store.getBundle(id);
}
const filled = (bd) => bd ? bd.slots.map((s) => Boolean(s.track)) : null;

async function start() {
  await setDownloadPrefs();
  // نسخة الاختبار: dist كما بُني، وإذن مضيف البلاغات ممنوح عند التحميل (ملف التعريف وحده، لا المستودع).
  await cp(DIST, EXT, { recursive: true });
  const manifestFile = path.join(EXT, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.host_permissions = [...(manifest.host_permissions ?? []), REPORTS_HOST_PATTERN];
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  b = await launch({ browser, profile: PROFILE, headless: true });
  result.browser = `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].bin) ?? '?'} (${b.version.product})`;
  result.commit = gitHead();
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  extId = ext.id;
  result.extension = { version: manifest.version, testCopy: 'dist + host_permissions لمضيف البلاغات' };
}

// ---- ١) الحذف بما سُرد في التأكيد ----
async function deletions(A, B) {
  await step('delete-active-stale', async () => {
    const id = IDS.active;
    await clickOn(A, `${row(id)}?.querySelector('button.lib-more')`, 'المزيد (النشطة)');
    await clickOn(A, menuItem('حذف الترجمة النشطة'), 'حذف الترجمة النشطة…');
    const title = await A.waitFor((n) => { const d = [...document.querySelectorAll('dialog.tj-dialog[open]')].at(-1); return d && d.textContent.includes(n) ? true : null; }, { args: ['حذف الترجمة النشطة (1)؟'], timeoutMs: 8000 });
    // التبويب الآخر يفعّل الترجمة 2 بواجهته والتأكيد مفتوح في الأول.
    await clickOn(B, `${row(id)}?.querySelector('.lib-chips button[data-slot="2"]')`, 'شريحة الترجمة 2 في التبويب الآخر');
    const active2 = await B.waitFor((k) => new Promise((r) => chrome.storage.local.get(k).then((x) => r(x[k]?.active === 2))), { args: [`bundle:${id}`], timeoutMs: 8000 });
    const stillOpen = await A.eval(() => !!document.querySelector('dialog.tj-dialog[open]'));
    await clickOn(A, confirmBtn, 'تأكيد الحذف في التبويب الأول');
    const toast = await waitToast(A, STALE);
    await sleep(800);
    const after = await bundleOf(A, id);
    const pressed = await A.eval((v) => document.querySelector(`li.lib-row[data-video="${v}"] .lib-chips button[data-slot="2"]`)?.getAttribute('aria-pressed') ?? null, { args: [id] });
    check('delete-active-stale', !!title && active2 && stillOpen && !!toast && JSON.stringify(filled(after)) === '[true,true,true]' && after.active === 2 && pressed === 'true',
      { dialog: !!title, otherTabActivated2: !!active2, dialogStillOpen: stillOpen, toast, filled: filled(after), active: after?.active, listReloadedPressed2: pressed });
    await shot(A, 'delete-active-stale');
    // الموافقة على ما يُعرض الآن تحذف ما سُرد وحده (2 النشطة الآن).
    await clickOn(A, `${row(id)}?.querySelector('button.lib-more')`, 'المزيد (ثانية)');
    await clickOn(A, menuItem('حذف الترجمة النشطة'), 'حذف الترجمة النشطة… (ثانية)');
    const title2 = await A.waitFor((n) => { const d = [...document.querySelectorAll('dialog.tj-dialog[open]')].at(-1); return d && d.textContent.includes(n) ? true : null; }, { args: ['حذف الترجمة النشطة (2)؟'], timeoutMs: 8000 });
    await clickOn(A, confirmBtn, 'تأكيد حذف 2');
    await sleep(1000);
    const final = await bundleOf(A, id);
    check('delete-active-after-refresh', !!title2 && JSON.stringify(filled(final)) === '[true,false,true]', { dialog2: !!title2, filled: filled(final), active: final?.active });
  }, ['delete-active-stale', 'delete-active-after-refresh']);

  await step('delete-card-stale', async () => {
    const id = IDS.card;
    await clickOn(A, `${row(id)}?.querySelector('.lib-toggle')`, 'إظهار الترجمات (الأول)');
    await A.waitFor((v) => document.querySelectorAll(`li.lib-row[data-video="${v}"] .lib-card[data-slot]`).length === 3, { args: [id], timeoutMs: 8000 });
    await clickOn(A, `${row(id)}?.querySelector('.lib-card[data-slot="2"] .lib-card__delete')`, 'حذف… في بطاقة 2');
    const open = await A.waitFor(() => !!document.querySelector('dialog.tj-dialog[open]'), { timeoutMs: 8000 });
    await clickOn(B, `${row(id)}?.querySelector('.lib-toggle')`, 'إظهار الترجمات (الآخر)');
    await B.waitFor((v) => document.querySelectorAll(`li.lib-row[data-video="${v}"] .lib-card[data-slot]`).length === 3, { args: [id], timeoutMs: 8000 });
    await clickOn(B, `${row(id)}?.querySelector('.lib-card[data-slot="2"] .lib-card__rename')`, 'تسمية 2 في الآخر');
    await typeInto(B, `${row(id)}?.querySelector('.lib-card[data-slot="2"] .lib-card__name')`, 'محتوى آخر', 'اسم 2');
    const renamed = await B.waitFor((k) => new Promise((r) => chrome.storage.local.get(k).then((x) => r(x[k]?.names?.[1] === 'محتوى آخر'))), { args: [`bundle:${id}`], timeoutMs: 8000 });
    await clickOn(A, confirmBtn, 'تأكيد حذف البطاقة');
    const toast = await waitToast(A, STALE);
    await sleep(600);
    const after = await bundleOf(A, id);
    check('delete-card-stale', !!open && renamed && !!toast && after.slots[1].track !== null && after.slots[1].name === 'محتوى آخر',
      { dialog: !!open, otherTabRenamed: !!renamed, toast, slot2Kept: after?.slots[1].track !== null, name: after?.slots[1].name });
  });

  await step('delete-previous-stale', async () => {
    const id = IDS.previous;
    const before = await bundleOf(A, id);
    await clickOn(A, `${row(id)}?.querySelector('.lib-toggle')`, 'إظهار الترجمات (السابقة)');
    await A.waitFor((v) => !!document.querySelector(`li.lib-row[data-video="${v}"] .lib-prevl__delete`), { args: [id], timeoutMs: 8000 });
    await clickOn(A, `${row(id)}?.querySelector('.lib-prevl__delete')`, 'حذف النسخة السابقة');
    const open = await A.waitFor(() => !!document.querySelector('dialog.tj-dialog[open]'), { timeoutMs: 8000 });
    await clickOn(B, `${row(id)}?.querySelector('.lib-toggle')`, 'إظهار الترجمات (السابقة، الآخر)');
    await B.waitFor((v) => !!document.querySelector(`li.lib-row[data-video="${v}"] .lib-prevl__restore`), { args: [id], timeoutMs: 8000 });
    await clickOn(B, `${row(id)}?.querySelector('.lib-prevl__restore')`, 'استعادة السابقة في الآخر');
    await clickOn(B, confirmBtn, 'تأكيد الاستعادة في الآخر');
    await sleep(900);
    const swapped = await bundleOf(B, id);
    const restoredOther = JSON.stringify(swapped.previous?.track) === JSON.stringify(before.slots[1].track);
    await clickOn(A, confirmBtn, 'تأكيد حذف السابقة');
    const toast = await waitToast(A, STALE);
    await sleep(600);
    const after = await bundleOf(A, id);
    check('delete-previous-stale', !!open && restoredOther && !!toast && after.previous !== null && JSON.stringify(after.previous.track) === JSON.stringify(before.slots[1].track),
      { dialog: !!open, otherTabRestored: restoredOther, toast, previousKept: after?.previous !== null });
  });

  await step('delete-all-stale', async () => {
    const id = IDS.all;
    await clickOn(A, `${row(id)}?.querySelector('button.lib-more')`, 'المزيد (الكل)');
    await clickOn(A, menuItem('حذف بيانات الفيديو'), 'حذف بيانات الفيديو…');
    const open = await A.waitFor(() => !!document.querySelector('dialog.tj-dialog[open]'), { timeoutMs: 8000 });
    await clickOn(B, `${row(id)}?.querySelector('.lib-toggle')`, 'إظهار الترجمات (الكل، الآخر)');
    await B.waitFor((v) => document.querySelectorAll(`li.lib-row[data-video="${v}"] .lib-card[data-slot]`).length === 3, { args: [id], timeoutMs: 8000 });
    await clickOn(B, `${row(id)}?.querySelector('.lib-card[data-slot="3"] .lib-card__rename')`, 'تسمية 3 في الآخر');
    await typeInto(B, `${row(id)}?.querySelector('.lib-card[data-slot="3"] .lib-card__name')`, 'من تبويب آخر', 'اسم 3');
    const renamed = await B.waitFor((k) => new Promise((r) => chrome.storage.local.get(k).then((x) => r(x[k]?.names?.[2] === 'من تبويب آخر'))), { args: [`bundle:${id}`], timeoutMs: 8000 });
    await clickOn(A, confirmBtn, 'تأكيد حذف الكل');
    const toast = await waitToast(A, STALE);
    await sleep(600);
    const kept = await bundleOf(A, id);
    check('delete-all-stale', !!open && renamed && !!toast && kept !== null && kept.slots[2].name === 'من تبويب آخر',{ dialog: !!open, otherTabRenamed: !!renamed, toast, videoKept: kept !== null });
    await clickOn(A, `${row(id)}?.querySelector('button.lib-more')`, 'المزيد (الكل، ثانية)');
    await clickOn(A, menuItem('حذف بيانات الفيديو'), 'حذف بيانات الفيديو… (ثانية)');
    await A.waitFor(() => !!document.querySelector('dialog.tj-dialog[open]'), { timeoutMs: 8000 });
    await clickOn(A, confirmBtn, 'تأكيد حذف الكل (ثانية)');
    await sleep(1000);
    const gone = await getKeys(A, [`video:${id}`, `bundle:${id}`]);
    check('delete-all-after-refresh', Object.keys(gone).length === 0, { keysLeft: Object.keys(gone) });
  }, ['delete-all-stale', 'delete-all-after-refresh']);
}

// ---- ٢) النص الدراسي ----
async function study(A) {
  for (const [id, offset, wantNote, wantLinks, label] of [
    [IDS.studyNeg, STUDY.negOffset, true, STUDY.negLinks, 'study-library-negative-offset'],
    [IDS.studyPos, STUDY.posOffset, false, STUDY.posLinks, 'study-library-positive-offset'],
  ]) {
    await step(label, async () => {
      await clickOn(A, `${row(id)}?.querySelector('button.lib-more')`, `المزيد (${id})`);
      await clickOn(A, menuItem('نص دراسي'), 'نص دراسي…');
      await A.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .lib-study'), { timeoutMs: 8000 });
      await clickOn(A, `${topDialog}?.querySelector('input[value="md"]')`, 'Markdown');
      const note = await textOf(A, `${topDialog}?.querySelector('.lib-study__note')`);
      const role = await A.eval(() => document.querySelector('dialog.tj-dialog[open] .lib-study__note')?.getAttribute('role') ?? null);
      if (wantNote) await shot(A, 'study-library-note');
      const before = new Set(await listDl());
      await clickOn(A, confirmBtn, 'تنزيل النص الدراسي');
      const file = await waitNewFile(before, (n) => n.startsWith(id) && n.endsWith('.study.md'));
      const links = linksOf(file?.text);
      const noteOk = wantNote ? Boolean(note) && note.includes('ما رقمه 1،') && note.includes('0:00') && role === 'note' : note === null;
      check(label, noteOk && JSON.stringify(links) === JSON.stringify(wantLinks), { offsetMs: offset, note, role, file: file?.name ?? null, links, expected: wantLinks, beforeFix: wantNote ? STUDY.negLinksBefore : undefined });
    });
  }

  await step('study-editor-negative-offset', async () => {
    const ed = await openExt(`pages/editor/index.html?v=${IDS.studyNeg}`, 'editor');
    const exportBtn = `[...document.querySelectorAll('button')].find((x) => x.textContent.replace(/\\s+/g, ' ').trim() === 'تصدير')`;
    await ed.waitFor(`!!(${exportBtn})`, { timeoutMs: 15000 });
    await clickOn(ed, exportBtn, 'تصدير ▾');
    await clickOn(ed, `[...document.querySelectorAll('[role=menuitem]')].find((e) => e.textContent.includes('نص دراسي'))`, 'نص دراسي… (المحرّر)');
    const note = await ed.waitFor(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); return d && d.textContent.includes('ما رقمه 1،') ? d.textContent.replace(/\s+/g, ' ').trim().slice(0, 400) : null; }, { timeoutMs: 8000 });
    await shot(ed, 'study-editor-note');
    const before = new Set(await listDl());
    await clickOn(ed, `[...document.querySelectorAll('dialog[open]')].at(-1)?.querySelector('button[value="save"]')`, 'تنزيل (المحرّر)');
    // الاسم نفسه نزل من المحفوظات قبله، فيضيف المتصفح « (1)» قبل الامتداد.
    const file = await waitNewFile(before, (n) => n.startsWith(IDS.studyNeg) && /\.study( \(\d+\))?\.(md|txt)$/.test(n));
    const links = linksOf(file?.text);
    check('study-editor-negative-offset', !!note && (file?.name.endsWith('.txt') || JSON.stringify(links) === JSON.stringify(STUDY.negLinks)), { note: !!note, file: file?.name ?? null, links });
  });
}
// ---- ٣) بصمة التصدير بأزمنتها ----
async function fingerprint(A, oldId) {
  await step('fingerprint-new-timing-saved', async () => {
    const id = IDS.fingerprint;
    const before = new Set(await listDl());
    await clickOn(A, `${row(id)}?.querySelector('button.lib-more')`, 'المزيد (البصمة)');
    await clickOn(A, menuItem('الإنجليزية'), 'تصدير الإنجليزية');
    const file = await waitNewFile(before, (n) => n.startsWith(id) && n.endsWith('.srt'));
    await sleep(800);
    const rec = (await getKeys(A, [`video:${id}`]))[`video:${id}`];
    const fresh = rec?.fingerprints?.find((f) => f.id !== oldId) ?? null;
    const starts = fresh?.cues?.map((c) => c.startMs) ?? null;
    check('fingerprint-new-timing-saved', !!file && rec?.fingerprints?.length === 2 && JSON.stringify(starts) === JSON.stringify(englishAt(FP_SHIFT).cues.map((c) => c.startMs)) && file.text.includes('00:00:02,500'),
      { file: file?.name ?? null, fingerprints: rec?.fingerprints?.length ?? null, freshStarts: starts });

    // الترجمة العائدة بتوقيت الملف الذي نزل: تُقارن بالبصمة الجديدة بلا انحراف.
    const arFile = path.join(DL, '..', `${id}-${RUN}.ar.srt`);
    await writeFile(arFile, arabicForNewTiming());
    await clickOn(A, `${row(id)}?.querySelector('button.lib-more')`, 'المزيد (رفع)');
    await chooseFile(A, menuItem('رفع ترجمة'), arFile, 'رفع ترجمة…');
    await A.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .lib-up'), { timeoutMs: 10000 });
    const t1 = await A.eval(() => document.querySelector('dialog.tj-dialog[open] .lib-up__targets input[value="1"]'));
    if (t1 !== null) await clickOn(A, `${topDialog}?.querySelector('.lib-up__targets input[value="1"]')`, 'الخانة 1 هدفًا').catch(() => {});
    const dialogText = await textOf(A, topDialog);
    await shot(A, 'fingerprint-upload-dialog');
    await clickOn(A, confirmBtn, 'تأكيد الرفع');
    await sleep(1200);
    const after = (await getKeys(A, [`video:${id}`]))[`video:${id}`];
    const ar = after?.arabic;
    check('fingerprint-upload-no-false-drift', ar?.fingerprintId === fresh?.id && ar?.comparison?.matched === true && (ar?.comparison?.drift?.length ?? -1) === 0,
      { fingerprintId: ar?.fingerprintId === fresh?.id ? 'الجديدة' : ar?.fingerprintId === oldId ? 'القديمة' : ar?.fingerprintId ?? null, matched: ar?.comparison?.matched ?? null, drift: ar?.comparison?.drift?.length ?? null, dialog: dialogText?.slice(0, 200) });
  }, ['fingerprint-new-timing-saved', 'fingerprint-upload-no-false-drift']);
}

// ---- ٤) «الإبلاغ عن مشكلة» بخادم محاكى ----
async function report() {
  await step('report-flow', async () => {
    const st = await openExt('pages/settings/index.html#about', 'settings');
    await st.waitFor(() => { const a = document.getElementById('about'); return a && !a.hidden; }, { timeoutMs: 10000 });
    // خادم البلاغات محاكى في الصفحة نفسها: كل طلب إليه يُوقف هنا ويُرد عليه من الحزام، فلا يخرج شيء.
    const paused = [];
    await st.send('Fetch.enable', { patterns: [{ urlPattern: `https://${REPORTS_HOST}/*`, requestStage: 'Request' }] });
    st.on('Fetch.requestPaused', (e) => paused.push(e));
    const waitPaused = async (n, timeoutMs = 15000) => {
      const end = Date.now() + timeoutMs;
      while (Date.now() < end && paused.length < n) await sleep(100);
      return paused[n - 1] ?? null;
    };
    const keyOf = (e) => e ? Object.entries(e.request.headers).find(([k]) => k.toLowerCase() === 'idempotency-key')?.[1] ?? null : null;
    const fulfill = (e, status, body = null) => st.send('Fetch.fulfillRequest', {
      requestId: e.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body ?? {})).toString('base64'),
    });
    const stub = await st.eval(() => {
      try {
        Object.defineProperty(chrome.permissions, 'request', { configurable: true, value: async () => true });
        return chrome.permissions.request.toString().includes('true');
      } catch (err) {
        return String(err?.message ?? err);
      }
    });
    observe('report-permission-stub', stub);
    const focus = () => st.eval(() => {
      const a = document.activeElement;
      return { tag: a?.tagName ?? null, action: a?.getAttribute?.('data-report-action') ?? null, isResult: a === document.querySelector('.st-report__result'), body: a === document.body };
    });

    await clickOn(st, byText('#about button', 'الإبلاغ عن مشكلة'), 'الإبلاغ عن مشكلة');
    await st.waitFor(() => !document.getElementById('st-report')?.hidden && !!document.querySelector('[data-report-field="diagnostics.build_target"]'), { timeoutMs: 15000 });
    await clickOn(st, `document.getElementById('st-report-text')`, 'وصف البلاغ');
    const DESC = 'بلاغ آلي من الاختبار الحي لإصلاحات المراجعة — خادم محاكى';
    await st.send('Input.insertText', { text: DESC });
    await sleep(300);

    // المحاولة 1: انقطاع الشبكة.
    await clickOn(st, byText('#st-report button', 'إرسال البلاغ'), 'إرسال البلاغ');
    const r1 = await waitPaused(1);
    if (!r1) throw new Error('لم يصل طلب البلاغ إلى المحاكاة (الإذن؟)');
    await st.send('Fetch.failRequest', { requestId: r1.requestId, errorReason: 'InternetDisconnected' });
    await st.waitFor(() => !!document.querySelector('[data-report-result="failed"] [data-report-action="retry"]'), { timeoutMs: 10000 });

    // المحاولة 2: «أعد المحاولة» مركّزًا وEnter، والطلب معلّق: التركيز على منطقة النتيجة لا على الصفحة.
    await st.eval(() => document.querySelector('[data-report-action="retry"]').focus());
    await pressEnter(st);
    const r2 = await waitPaused(2);
    const duringSend = await focus();
    const tabindex = await st.eval(() => document.querySelector('.st-report__result')?.getAttribute('tabindex') ?? null);
    await fulfill(r2, 503, { error: 'unavailable' });
    await st.waitFor(() => document.querySelector('[data-report-result="failed"]')?.textContent.includes('العطل من جهته') ?? null, { timeoutMs: 10000 });
    await sleep(200);
    const afterFail = await focus();
    await shot(st, 'report-failed-focus');

    // المحاولة 3: Enter على «أعد المحاولة» الجديد، ثم نجاح.
    await pressEnter(st);
    const r3 = await waitPaused(3);
    const duringSend2 = await focus();
    await fulfill(r3, 201, { id: 9001 });
    await st.waitFor(() => !!document.querySelector('[data-report-result="sent"]'), { timeoutMs: 10000 });
    await sleep(200);
    const afterSent = await focus();
    const sentText = await textOf(st, `document.querySelector('[data-report-result="sent"]')`);
    check('report-focus-keyboard-retry', !!r2 && duringSend.isResult && tabindex === '-1' && afterFail.action === 'retry' && duringSend2.isResult && afterSent.isResult && /#9001/.test(sentText ?? ''),
      { duringSend, tabindex, afterFail, duringSend2, afterSent });
    check('report-same-key-across-retries', !!keyOf(r1) && keyOf(r1) === keyOf(r2) && keyOf(r2) === keyOf(r3), { attempts: 3, sameKey: keyOf(r1) === keyOf(r2) && keyOf(r2) === keyOf(r3) });

    // «نسخ الرقم»: الحافظة ترفض ثم تقبل.
    await st.eval(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new DOMException('denied', 'NotAllowedError'); } }); return true; });
    await st.eval(() => document.querySelector('[data-report-action="copy-id"]').focus());
    await pressEnter(st);
    const failedNote = await st.waitFor(() => { const n = document.querySelector('[data-report-copy="failed"]'); return n ? { role: n.getAttribute('role'), text: n.textContent.trim() } : null; }, { timeoutMs: 5000 });
    const stillShown = /#9001/.test((await textOf(st, `document.querySelector('[data-report-result="sent"]')`)) ?? '');
    const focusAfterCopyFail = await focus();
    await shot(st, 'report-copy-id-failed');
    check('report-copy-id-failure-visible', failedNote?.role === 'alert' && /تعذّر نسخ الرقم/.test(failedNote?.text ?? '') && stillShown && focusAfterCopyFail.action === 'copy-id',
      { note: failedNote, idStillShown: stillShown, focus: focusAfterCopyFail });
    await st.eval(() => { window.__rvCopied = []; Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (t) => { window.__rvCopied.push(t); } }); return true; });
    await pressEnter(st);
    const done = await st.waitFor(() => document.querySelector('[data-report-copy="done"]')?.textContent.trim() ?? null, { timeoutMs: 5000 });
    const copied = await st.eval(() => window.__rvCopied.at(-1) ?? null);
    check('report-copy-id-success', done === 'نُسخ الرقم.' && copied === '#9001', { done, copied });

    // بلاغ ثانٍ بالوصف نفسه بعد النجاح: مفتاح جديد (T8، 0cf63a0) فيُنشأ لا يُعاد الأول.
    await clickOn(st, `document.getElementById('st-report-text')`, 'وصف البلاغ (ثانٍ)');
    await st.send('Input.insertText', { text: DESC });
    await sleep(300);
    await clickOn(st, byText('#st-report button', 'إرسال البلاغ'), 'أرسل البلاغ (ثانٍ)');
    const r4 = await waitPaused(4);
    if (r4) await fulfill(r4, 201, { id: 9002 });
    const second = await st.waitFor(() => /#9002/.test(document.querySelector('[data-report-result="sent"]')?.textContent ?? '') || null, { timeoutMs: 10000 });
    check('report-next-report-new-key', !!r4 && keyOf(r4) !== keyOf(r1) && !!second, { newKey: !!r4 && keyOf(r4) !== keyOf(r1), shown9002: !!second });
    observe('report-requests', { paused: paused.length, allIntercepted: true, note: 'كل طلب إلى مضيف البلاغات أُوقف ورُدّ عليه من الحزام؛ لم يُتابَع أي طلب إلى الشبكة' });
    await st.send('Fetch.disable').catch(() => {});
  }, ['report-focus-keyboard-retry', 'report-same-key-across-retries', 'report-copy-id-failure-visible', 'report-copy-id-success', 'report-next-report-new-key']);
}

try {
  await start();
  const seed = await buildReviewSeed();
  observe('seed', { videos: Object.values(IDS), bytes: JSON.stringify(seed.items).length });
  const A = await openExt('pages/library/index.html', 'library-A');
  await A.eval(async () => chrome.storage.local.clear());
  await A.eval(async (x) => chrome.storage.local.set(x), { args: [seed.items] });
  await A.reload();
  await A.waitFor((n) => document.querySelectorAll('li.lib-row').length === n, { args: [Object.keys(IDS).length], timeoutMs: 15000 });
  const B = await openExt('pages/library/index.html', 'library-B');
  await B.waitFor((n) => document.querySelectorAll('li.lib-row').length === n, { args: [Object.keys(IDS).length], timeoutMs: 15000 });
  await deletions(A, B);
  await study(A);
  await fingerprint(A, seed.oldFingerprintId);
  await report();
} catch (err) {
  check('run-completed', false, { error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '[رابط]').slice(0, 300) });
} finally {
  // أخطاء متوقعة وحدها: سجل الشبكة لطلبي البلاغ الفاشلين عمدًا (الانقطاع و503) في صفحة الإعدادات.
  const expected = { settings: 2 };
  const real = (p) => {
    let skip = expected[p.label] ?? 0;
    return p.errs.list.filter((x) => !(x.kind === 'log.network' && skip-- > 0));
  };
  for (const p of pages) {
    result.errors[p.label] = p.errs.list;
    result.network[p.label] = { external: p.net.external, hosts: [...p.net.hosts], reportsIntercepted: p.net.reports };
  }
  check('no-extension-errors', pages.every((p) => real(p).length === 0), Object.fromEntries(pages.map((p) => [p.label, { errors: real(p).length, expectedReportFailures: expected[p.label] ?? 0 }])));
  check('no-external-network', pages.every((p) => p.net.external === 0), Object.fromEntries(pages.map((p) => [p.label, p.net.external])));
  await b?.close().catch(() => {});
  await mkdir(OUT, { recursive: true });
  const json = JSON.stringify(result, null, 2).replaceAll(DL, '‹تنزيلات الاختبار›').replaceAll(EXT, '‹نسخة الاختبار›');
  const secrets = findSecrets(json);
  if (secrets.length) console.log(`المنقّي وجد ${secrets.length} نمطًا حساسًا؛ لم يُكتب ملف النتائج.`);
  else await writeFile(path.join(OUT, 'result.json'), `${json}\n`);
  const failed = result.checks.filter((c) => !c.ok);
  console.log(`\n${result.checks.length - failed.length}/${result.checks.length} ناجح${failed.length ? ` · ساقط: ${failed.map((c) => c.id).join('، ')}` : ''}`);
  process.exit(failed.length ? 1 : 0);
}
