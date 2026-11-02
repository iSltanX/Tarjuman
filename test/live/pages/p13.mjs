#!/usr/bin/env node
// الاختبار الحي لـP13 على الإضافة المبنية (dist) في ملف اختبار منفصل خارج المستودع، بلا نافذة، بضغطات Input حقيقية:
//   --phase create (Brave): مكتبة كبيرة مزروعة، والمحفوظات (1 2 3 والتراجع، والفرز بأعداده، ولوحة «الترجمات…» والسابقة،
//     وحوار الرفع والاستبدال بأعداد الفروق والإلغاء بلا أثر، والنص الدراسي، والنسخ بالقاموس)، والإعدادات (المصطلحات، وحد
//     القراءة، ومكان الحفظ بأوضاعه ويتبعه التصدير، والنسخة الاحتياطية)، ثم تُسلَّم النسخة إلى مرحلة الاستعادة.
//   --phase restore (Chrome): الاستعادة من ملف Brave بالمعاينة (الموجود يُتخطى افتراضيًا، والإعدادات غير مختارة) وتقدم
//     ظاهر وتقرير، ثم «استبدال كل الموجود» مع الإعدادات، والتالف يُرفض بلا كتابة، والمحفوظات بالأعداد نفسها.
// لا رابط ولا رمز ولا مسار جهاز في الأدلة (المسارات نسبةً إلى مجلد تنزيلات الاختبار، ويمر الناتج على المنقّي).
//   command node test/live/pages/p13.mjs --browser brave --phase create [--out docs/evidence/P13]
//   command node test/live/pages/p13.mjs --browser chrome --phase restore [--out docs/evidence/P13]
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffTranslations } from '../../../src/core/align/index.js';
import { findSecrets } from '../../../src/core/diagnostics/sanitize.js';
import { instructions } from '../../../src/core/export/instructions.js';
import { libraryEntries, filterCounts, diffCountLines } from '../../../src/pages/library/model.js';
import { BROWSERS, PROFILE_ROOT, human, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, emulateScheme, openTab } from '../harness/extension.mjs';
import { samplePrefs } from '../../helpers/fixtures-v2.js';
import { buildP13Seed, chunks, largeId, tedReplacement } from './p13-seed.mjs';
import { SEED_IDS } from './seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const PHASE = val('phase', browser === 'brave' ? 'create' : 'restore');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/P13'));
const PROFILE = `${browser}-p13`;
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const DL = path.join(PROFILE_ROOT, `downloads-${browser}-p13`, RUN);
const HANDOFF = path.join(PROFILE_ROOT, 'p13-handoff');
const TED = SEED_IDS.ted;

const result = { browser: null, phase: PHASE, at: new Date().toISOString(), extension: null, checks: [], timings: {}, observations: {}, screenshots: [], errors: {}, network: {} };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail !== null ? ` — ${JSON.stringify(detail)}` : ''}`);
};
const observe = (id, value) => {
  result.observations[id] = value;
  console.log(`• ${id} — ${JSON.stringify(value)}`);
};
/** المسار نسبةً إلى مجلد تنزيلات الاختبار، فلا يُكتب مسار الجهاز في الأدلة. */
const inDl = (p) => (typeof p === 'string' && p.startsWith(DL) ? `‹تنزيلات الاختبار›${p.slice(DL.length)}` : p ? '‹خارج تنزيلات الاختبار›' : null);
const stripIsolates = (s) => String(s ?? '').replace(new RegExp('[\\u2066-\\u2069]', 'g'), '');

function appVersion(bin) {
  try {
    const plist = path.join(bin.slice(0, bin.indexOf('.app/') + 4), 'Contents/Info.plist');
    return String(execFileSync('/usr/bin/defaults', ['read', plist, 'CFBundleShortVersionString'])).trim();
  } catch {
    return null;
  }
}

/** إعدادات التنزيل في ملف تعريف الاختبار وحده: مجلد تنزيلات الاختبار، وبلا «اسأل». */
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

const listDl = async (sub = '') => {
  try {
    return (await readdir(path.join(DL, sub))).sort();
  } catch {
    return [];
  }
};
const waitFile = async (sub, match, timeoutMs = 20000) => {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const f = (await listDl(sub)).find((n) => match(n) && !n.endsWith('.crdownload'));
    if (f) return path.join(DL, sub, f);
    await sleep(300);
  }
  return null;
};

// ---- أدوات الصفحة ----
let b = null;
let extId = null;
const pages = [];

async function openExt(rest) {
  const page = await openTab(b.conn, 'about:blank');
  const errs = collectErrors(page, { extId });
  const net = { external: 0, hosts: new Set(), total: 0 };
  await page.send('Network.enable');
  page.on('Network.requestWillBeSent', (p) => {
    net.total++;
    const u = p.request.url;
    if (!/^(chrome-extension|data|blob|about):/.test(u)) {
      net.external++;
      try { net.hosts.add(new URL(u).host); } catch { net.hosts.add('?'); }
    }
  });
  pages.push({ rest, errs, net });
  await page.goto(`chrome-extension://${extId}/${rest}`);
  return page;
}

/** يضغط عنصرًا تعيده عبارة JS (نص) بضغطة Input حقيقية في مركزه. */
async function clickOn(page, expr, label) {
  const ok = await page.eval(`(() => { for (const e of document.querySelectorAll('[data-p13]')) e.removeAttribute('data-p13'); const el = (${expr}); if (!el) return false; el.setAttribute('data-p13', '1'); return true; })()`);
  if (!ok) throw new Error(`لم يوجد: ${label}`);
  const c = await page.centerOf('[data-p13="1"]');
  if (!c) throw new Error(`غير ظاهر: ${label}`);
  await page.click(c.x, c.y);
  await human(250, 500);
}
const byText = (sel, text, root = 'document') => `[...${root}.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(text)}))`;
const topDialog = `[...document.querySelectorAll('dialog.tj-dialog[open]:not(.lib-panel)')].at(-1)`;
const confirmBtn = `${topDialog}?.querySelector('button[value="confirm"]')`;
const cancelBtn = `${topDialog}?.querySelector('button[value="cancel"]')`;
const textOf = (page, expr) => page.eval(`(() => { const e = (${expr}); return e ? e.textContent.replace(/\\s+/g, ' ').trim() : null; })()`);

async function typeInto(page, expr, text, label) {
  await clickOn(page, expr, label);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 4, windowsVirtualKeyCode: 65 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 4, windowsVirtualKeyCode: 65 });
  await page.eval(`(() => { const e = document.querySelector('[data-p13="1"]'); e.select?.(); })()`);
  await page.send('Input.insertText', { text });
  await sleep(150);
  await page.key('Tab', 'Tab', 9);
  await human(300, 600);
}

/** يفتح المنتقي بضغطة حقيقية ويسلّمه ملفًا (اعتراض حوار الملفات من CDP). */
async function chooseFile(page, expr, file, label) {
  await page.send('Page.setInterceptFileChooserDialog', { enabled: true });
  const opened = b.conn.waitFor('Page.fileChooserOpened', () => true, { sessionId: page.sessionId, timeoutMs: 15000 });
  await clickOn(page, expr, label);
  const ev = await opened;
  await page.send('DOM.setFileInputFiles', { files: [file], backendNodeId: ev.backendNodeId });
  await page.send('Page.setInterceptFileChooserDialog', { enabled: false });
}

/** قسم في الإعدادات بجزء العنوان (لا تحميل جديد للصفحة)، وانتظار ظهوره. */
async function navHash(page, id) {
  await page.eval((h) => { location.hash = h; }, { args: [id] });
  await page.waitFor((h) => { const s = document.getElementById(h); return s && !s.hidden; }, { args: [id], timeoutMs: 8000 });
  await human(200, 400);
}

/** بصمة التخزين كله (SHA-256 للمفاتيح المرتبة بقيمها) في صفحة الإضافة. */
const storageHash = (page) => page.eval(async () => {
  const all = await chrome.storage.local.get(null);
  const text = JSON.stringify(Object.keys(all).sort().map((k) => [k, all[k]]));
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
});
const getKeys = (page, keys) => page.eval(async (k) => chrome.storage.local.get(k), { args: [keys] });

async function shot(page, name, { dark = true } = {}) {
  for (const scheme of dark ? ['light', 'dark'] : ['light']) {
    await emulateScheme(page, scheme);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(350);
    const file = path.join(OUT, `${name}-${browser}-${scheme}.png`);
    await page.screenshot(file);
    result.screenshots.push(path.relative(ROOT, file));
  }
  await emulateScheme(page, 'light');
  await page.send('Emulation.clearDeviceMetricsOverride');
}

const chipLabels = (page) => page.eval(() => [...document.querySelectorAll('.tj-chip')].map((c) => c.getAttribute('aria-label')));
const chipText = (counts) => ['الكل', 'بانتظار الترجمة', 'مترجمة', 'معدّلة', 'تحذيرات آلية', 'تحتاج مراجعة'].map((l, i) => `${l} (${Object.values(counts)[i]})`);

async function start() {
  await setDownloadPrefs();
  b = await launch({ browser, profile: PROFILE, headless: true });
  result.browser = `${BROWSERS[browser].name} ${appVersion(BROWSERS[browser].bin) ?? '?'} (${b.version.product})`;
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  extId = ext.id;
  const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
  result.extension = { version: manifest.version, versionName: manifest.version_name ?? null };
}

async function seedInto(page, items) {
  await page.eval(async () => chrome.storage.local.clear());
  for (const part of chunks(items)) await page.eval(async (x) => chrome.storage.local.set(x), { args: [part] });
}

// ---- Brave: الإنشاء والمحفوظات والإعدادات ----
async function createPhase() {
  const seed = await buildP13Seed();
  const expected = filterCounts(libraryEntries(await seed.store.listLibrary()));
  observe('library-size', { videos: Object.keys(seed.items).filter((k) => k.startsWith('video:')).length, mb: +(JSON.stringify(seed.items).length / 1048576).toFixed(1) });
  const lib = await openExt('pages/library/index.html');
  await seedInto(lib, seed.items);

  // AC6: التحميل والفرز بأعداده.
  let t0 = Date.now();
  await lib.reload();
  const rowsShown = await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 50 && document.querySelectorAll('li.lib-row').length, { timeoutMs: 30000, intervalMs: 50 });
  result.timings.libraryLoadMs = Date.now() - t0;
  check('ac6-library-loaded', rowsShown === 50, { rows: rowsShown, ms: result.timings.libraryLoadMs });
  check('ac6-chip-counts', JSON.stringify(await chipLabels(lib)) === JSON.stringify(chipText(expected)), { shown: await chipLabels(lib), expected });
  await shot(lib, 'library');
  await clickOn(lib, byText('.tj-chip', 'تحتاج مراجعة'), 'رقاقة تحتاج مراجعة');
  const review = await lib.waitFor((n) => document.querySelectorAll('li.lib-row').length === Math.min(n, 50) && document.querySelectorAll('li.lib-row').length, { args: [expected.review], timeoutMs: 5000 });
  check('ac6-filter-review', review === Math.min(expected.review, 50), { rows: review, expected: expected.review });
  await clickOn(lib, byText('.tj-chip', 'تحذيرات آلية'), 'رقاقة تحذيرات آلية');
  const warned = await lib.waitFor(() => document.querySelectorAll('li.lib-row').length, { timeoutMs: 5000 });
  check('ac6-filter-warnings-separate', warned === Math.min(expected.warnings, 50) && expected.warnings !== expected.review, { rows: warned, warnings: expected.warnings, review: expected.review });
  await clickOn(lib, byText('.tj-chip', 'الكل'), 'رقاقة الكل');
  await typeInto(lib, `document.querySelector('.lib-search__input')`, 'رقم 12', 'البحث');
  const found = await lib.waitFor(() => document.querySelectorAll('li.lib-row').length, { timeoutMs: 5000 });
  check('ac6-search', found >= 1 && found <= 12, { rows: found });
  await clickOn(lib, `document.querySelector('.lib-search__clear')`, 'مسح البحث');

  // AC1: اختيار 1 2 3 في الصف يفعّل غيرها، و«تراجع».
  const row = `document.querySelector('li.lib-row[data-video="${TED}"]')`;
  await clickOn(lib, `${row}?.querySelectorAll('.tj-slots button')[1]`, 'الخانة 2 في صف TED');
  const toast = await lib.waitFor(() => [...document.querySelectorAll('.tj-toast')].map((t) => t.textContent).join('|') || null, { timeoutMs: 5000 });
  const head2 = (await getKeys(lib, [`bundle:${TED}`]))[`bundle:${TED}`];
  check('ac1-row-activate', head2?.active === 2 && /الترجمة 2/.test(toast ?? ''), { active: head2?.active, toast });
  await clickOn(lib, byText('.tj-toast__action', 'تراجع'), 'تراجع');
  await sleep(600);
  check('ac1-row-undo', (await getKeys(lib, [`bundle:${TED}`]))[`bundle:${TED}`]?.active === 1);
  const pickerState = await lib.eval((id) => [...document.querySelector(`li.lib-row[data-video="${id}"] .tj-slots`).querySelectorAll('button')].map((x) => ({ checked: x.getAttribute('aria-checked'), label: x.getAttribute('aria-label') })), { args: [TED] });
  check('ac1-picker-three', pickerState.length === 3 && pickerState[0].checked === 'true', pickerState);

  // AC1/AC3: لوحة «الترجمات…» والنسخة السابقة.
  await clickOn(lib, `${row}?.querySelector('button.lib-more')`, 'المزيد');
  await clickOn(lib, byText('.tj-menu__list:not([hidden]) [role=menuitem]', 'الترجمات'), 'الترجمات…');
  const panelOk = await lib.waitFor(() => document.querySelectorAll('dialog.lib-panel[open] section.lib-slot').length, { timeoutMs: 8000 });
  const panelText = await textOf(lib, `document.querySelector('dialog.lib-panel[open]')`);
  check('ac1-panel-cards', panelOk === 4 && /الترجمة 1/.test(panelText) && /الترجمة 3/.test(panelText) && /المرجع/.test(panelText) && /الإزاحة/.test(panelText), { sections: panelOk });
  const prevLine = await textOf(lib, `document.querySelector('dialog.lib-panel .lib-prev__line')`);
  check('ac3-previous-line', /^من الترجمة 2 · .+ · \d+(\.\d)? (ك|م)\.ب$/.test(prevLine ?? ''), { line: prevLine });
  await shot(lib, 'translations-panel');
  const before = await getKeys(lib, [`alts:${TED}`, `prev:${TED}`]);
  await clickOn(lib, byText('dialog.lib-panel .lib-prev button', 'استعادة'), 'استعادة السابقة');
  await clickOn(lib, confirmBtn, 'تأكيد الاستعادة');
  await sleep(900);
  const after = await getKeys(lib, [`alts:${TED}`, `prev:${TED}`]);
  const swapped = JSON.stringify(after[`alts:${TED}`].slots[1].track) === JSON.stringify(before[`prev:${TED}`].previous.track)
    && JSON.stringify(after[`prev:${TED}`].previous.track) === JSON.stringify(before[`alts:${TED}`].slots[1].track);
  check('ac3-restore-swap', swapped);
  await clickOn(lib, byText('dialog.lib-panel .lib-prev button', 'استعادة'), 'استعادة ثانية');
  await clickOn(lib, confirmBtn, 'تأكيد الاستعادة الثانية');
  await sleep(900);
  const back = await getKeys(lib, [`alts:${TED}`, `prev:${TED}`]);
  check('ac3-restore-reversible', JSON.stringify(back) === JSON.stringify(before));
  await typeInto(lib, `document.querySelector('dialog.lib-panel section[data-slot="3"] input')`, 'حرفية', 'اسم الخانة 3');
  await sleep(500);
  check('ac1-slot-rename', (await getKeys(lib, [`bundle:${TED}`]))[`bundle:${TED}`]?.names?.[2] === 'حرفية');
  await clickOn(lib, `document.querySelector('dialog.lib-panel .lib-panel__head button')`, 'إغلاق اللوحة');
  check('ac3-no-fourth-slot', (await lib.eval((id) => document.querySelector(`li.lib-row[data-video="${id}"] .tj-slots`).querySelectorAll('button').length, { args: [TED] })) === 3);

  // AC2: حوار الرفع والاستبدال الكامل.
  const bundle = await seed.store.getBundle(TED);
  const slot1 = bundle.slots[0].track;
  const rep = tedReplacement(slot1.original);
  const repFile = path.join(DL, '..', `ted-replacement-${RUN}.ar.srt`);
  await writeFile(repFile, rep.text);
  const expectedLines = diffCountLines(diffTranslations(slot1.current ?? slot1.original, rep.cues));
  const hashBefore = await storageHash(lib);
  await clickOn(lib, `${row}?.querySelector('button.lib-more')`, 'المزيد');
  await chooseFile(lib, byText('.tj-menu__list:not([hidden]) [role=menuitem]', 'رفع ترجمة'), repFile, 'رفع ترجمة…');
  await lib.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .lib-up'), { timeoutMs: 10000 });
  await clickOn(lib, `${topDialog}?.querySelector('.lib-up__targets input[value="1"]')`, 'الخانة 1 هدفًا');
  const counts = await lib.eval(() => [...document.querySelectorAll('dialog.tj-dialog[open] .lib-up__counts')].map((e) => e.textContent.trim()));
  check('ac2-diff-counts', JSON.stringify(counts) === JSON.stringify(expectedLines), { shown: counts, expected: expectedLines });
  const upText = await textOf(lib, topDialog);
  const keep = await lib.eval(() => {
    const box = document.querySelector('dialog.tj-dialog[open] .lib-up input[type="checkbox"]');
    return box ? { disabled: box.disabled } : null;
  });
  check('ac2-dialog-parts', /حفظ في/.test(upText) && /المرجع/.test(upText) && /سيُستبدل/.test(upText) && /جدول الفروق/.test(upText) && keep !== null, { keep, lost: /سيُستبدل [^.]+\./.exec(upText)?.[0] ?? null });
  await clickOn(lib, `${topDialog}?.querySelector('.lib-diff__summary')`, 'جدول الفروق');
  await shot(lib, 'upload-dialog');
  await clickOn(lib, cancelBtn, 'إلغاء الرفع');
  await sleep(600);
  check('ac2-cancel-no-write', (await storageHash(lib)) === hashBefore);
  await clickOn(lib, `${row}?.querySelector('button.lib-more')`, 'المزيد');
  await chooseFile(lib, byText('.tj-menu__list:not([hidden]) [role=menuitem]', 'رفع ترجمة'), repFile, 'رفع ترجمة… ثانية');
  await lib.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .lib-up'), { timeoutMs: 10000 });
  await clickOn(lib, `${topDialog}?.querySelector('.lib-up__targets input[value="1"]')`, 'الخانة 1 هدفًا');
  if (keep && !keep.disabled) await clickOn(lib, `${topDialog}?.querySelector('.lib-up input[type="checkbox"]')`, 'إبقاء تعديلاتي');
  await clickOn(lib, confirmBtn, 'تأكيد الاستبدال');
  await sleep(1200);
  const up = await getKeys(lib, [`video:${TED}`, `prev:${TED}`]);
  const ar = up[`video:${TED}`].arabic;
  check('ac2-replaced-with-previous', ar.original[2].text === 'ترجمة جديدة للمقطع 3' && up[`prev:${TED}`].previous.from === 1, { kept: Boolean(ar.current), cue1: ar.current?.[0]?.text ?? null });
  observe('ac2-keep-edits', { offered: keep ? !keep.disabled : false, keptEdit: Boolean(ar.current && /معدّلة/.test(ar.current[0].text)) });

  // AC7: النص الدراسي، والنسخ بالقاموس.
  await clickOn(lib, `${row}?.querySelector('button.lib-more')`, 'المزيد');
  await clickOn(lib, byText('.tj-menu__list:not([hidden]) [role=menuitem]', 'نص دراسي'), 'نص دراسي…');
  await lib.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .lib-study'), { timeoutMs: 8000 });
  await clickOn(lib, `${topDialog}?.querySelector('input[value="md"]')`, 'Markdown');
  await clickOn(lib, `${topDialog}?.querySelector('input[value="bi"]')`, 'ثنائي');
  await sleep(400);
  const studyName = await textOf(lib, `${topDialog}?.querySelector('.lib-study__name')`);
  await clickOn(lib, confirmBtn, 'تنزيل النص الدراسي');
  const studyFile = await waitFile('', (n) => n === `${TED}.ar-en.study.md`);
  check('ac7-study-saved', Boolean(studyFile) && stripIsolates(studyName).includes(`${TED}.ar-en.study.md`), { name: studyName, file: inDl(studyFile) });
  await lib.eval(() => { window.__copied = []; navigator.clipboard.writeText = async (t) => { window.__copied.push(t); }; });
  await clickOn(lib, `${row}?.querySelector('.lib-copy__button')`, 'نسخ التعليمات');
  await sleep(500);
  const copied = await lib.eval(() => window.__copied[0] ?? null);
  const title = up[`video:${TED}`].title;
  check('ac7-copy-with-glossary', copied === instructions({ videoId: TED, title, glossary: samplePrefs().glossary.terms }) && copied.includes('- prompt = موجِّه'), { length: copied?.length ?? 0 });

  // الإعدادات: المصطلحات، وحد القراءة، ومكان الحفظ.
  const st = await openExt('pages/settings/index.html#glossary');
  await st.waitFor(() => !!document.querySelector('.st-gl__count'), { timeoutMs: 8000 });
  await typeInto(st, `document.querySelector('.st-gl__field--source input')`, 'large language model', 'المصطلح');
  await typeInto(st, `document.querySelector('.st-gl__field--target input')`, 'نموذج لغوي كبير', 'المقابل');
  await clickOn(st, byText('.st-gl__add button', 'إضافة'), 'إضافة مصطلح');
  await sleep(600);
  const prefs1 = (await getKeys(st, ['prefs'])).prefs;
  check('ac7-glossary-add', prefs1.glossary.terms.length === 4 && (await textOf(st, `document.querySelector('.st-gl__count')`)) === '4 من 100');
  await shot(st, 'settings-glossary');
  await navHash(st, 'compare');
  await st.waitFor(() => !!document.querySelector('#compare'), { timeoutMs: 8000 });
  await typeInto(st, byText('#compare .tj-num', 'حد سرعة القراءة') + `?.querySelector('input')`, '17', 'حد القراءة');
  await sleep(500);
  check('ac7-reading-speed', (await getKeys(st, ['prefs'])).prefs.review.maxCps === 17);

  // AC8: مكان الحفظ بأوضاعه، والتصدير من المحفوظات يتبعه، و«آخر ملف حُفظ» من سجل المتصفح.
  await navHash(st, 'export');
  await st.waitFor(() => !!document.querySelector('.st-location'), { timeoutMs: 8000 });
  const firstLabel = await textOf(st, `document.querySelector('#export .st-row .tj-label')`);
  check('ac8-first-item', firstLabel === 'مكان حفظ ملفات الترجمة', { firstLabel });
  await clickOn(st, `document.querySelector('.st-location input[value="subfolder"]')`, 'مجلد فرعي');
  await sleep(500);
  const status = await textOf(st, `document.querySelector('.st-status')`);
  check('ac8-subfolder-mode', (await getKeys(st, ['prefs'])).prefs.saveLocation.mode === 'subfolder' && status === 'المكان المختار: مجلد التنزيلات/Tarjuman', { status });
  await shot(st, 'settings-save-location');
  await lib.eval(() => location.reload());
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 50, { timeoutMs: 30000 });
  await clickOn(lib, `document.querySelector('li.lib-row[data-video="${SEED_IDS.asr}"] button.lib-more')`, 'المزيد (asr)');
  await clickOn(lib, byText('.tj-menu__list:not([hidden]) [role=menuitem]', 'الإنجليزية'), 'تصدير الإنجليزية');
  const subFile = await waitFile('Tarjuman', (n) => n.startsWith(SEED_IDS.asr) && n.endsWith('.srt'));
  check('ac8-export-follows-subfolder', Boolean(subFile), { file: inDl(subFile) });
  await st.reload();
  const lastShown = await st.waitFor(() => { const e = document.querySelector('.st-last-save'); return e && !e.hidden ? e.textContent : null; }, { timeoutMs: 8000 });
  check('ac8-last-save-from-browser', Boolean(lastShown) && lastShown.includes('Tarjuman') && lastShown.includes(SEED_IDS.asr), { shown: lastShown ? inDl(lastShown.replace('آخر ملف حُفظ: ', '').trim()) : null });
  await clickOn(st, `document.querySelector('.st-location input[value="ask"]')`, 'اسأل');
  await sleep(400);
  await clickOn(lib, `document.querySelector('li.lib-row[data-video="${SEED_IDS.asr}"] button.lib-more')`, 'المزيد (asr)');
  await clickOn(lib, byText('.tj-menu__list:not([hidden]) [role=menuitem]', 'الإنجليزية'), 'تصدير الإنجليزية (اسأل)');
  const askToast = await lib.waitFor(() => [...document.querySelectorAll('.tj-toast')].map((t) => t.textContent).join('|') || null, { timeoutMs: 20000, intervalMs: 300 });
  observe('ac8-ask-headless', { toast: askToast, note: 'بلا نافذة لا يُظهر المتصفح حوار «اسأل» (W6)، فالنتيجة دليل أن التصدير طلب الحوار؛ والحوار نفسه أُثبت بنافذة في P10.' });
  await clickOn(st, `document.querySelector('.st-location__reset')`, 'استعادة الافتراضي');
  await sleep(500);
  check('ac8-reset-default', JSON.stringify((await getKeys(st, ['prefs'])).prefs.saveLocation) === JSON.stringify({ mode: 'downloads', folder: 'Tarjuman' }));

  // AC4: إنشاء النسخة الاحتياطية بتقدم ظاهر، وتسليمها إلى مرحلة الاستعادة.
  await navHash(st, 'data');
  await st.waitFor(() => !!document.querySelector('#data .st-data'), { timeoutMs: 8000 });
  const finalCounts = filterCounts(libraryEntries(await libraryFromPage(lib)));
  t0 = Date.now();
  await clickOn(st, byText('#data button', 'إنشاء نسخة احتياطية'), 'إنشاء نسخة احتياطية');
  const progress = new Set();
  let created = null;
  for (let i = 0; i < 200 && !created; i++) {
    const p = await textOf(st, `document.querySelector('#data .st-progress:not([hidden]) .st-progress__text')`);
    if (p) progress.add(p);
    created = await textOf(st, byText('#data .tj-alert', 'أُنشئت النسخة الاحتياطية'));
    await sleep(100);
  }
  result.timings.backupCreateMs = Date.now() - t0;
  const backupFile = await waitFile('', (n) => /^tarjuman-backup-\d{4}-\d{2}-\d{2}( \(\d+\))?\.json$/.test(n), 30000);
  const text = backupFile ? await readFile(backupFile, 'utf8') : '';
  const head = text ? JSON.parse(text) : null;
  check('ac4-backup-created', Boolean(created) && Boolean(backupFile) && head?.format === 'tarjuman-backup' && head.counts.videos === 304 && head.options.previous === true,
    { file: inDl(backupFile), counts: head?.counts ?? null, ms: result.timings.backupCreateMs, mb: +(text.length / 1048576).toFixed(1) });
  check('ac5-name-without-title', /^tarjuman-backup-\d{4}-\d{2}-\d{2}/.test(path.basename(backupFile ?? '')), { name: path.basename(backupFile ?? '') });
  observe('ac4-progress-samples', [...progress].slice(0, 6));
  await shot(st, 'settings-data');
  await mkdir(HANDOFF, { recursive: true });
  if (backupFile) await copyFile(backupFile, path.join(HANDOFF, 'from-brave.json'));
  await writeFile(path.join(HANDOFF, 'from-brave.meta.json'), JSON.stringify({ counts: finalCounts, glossary: 4, at: new Date().toISOString() }));

  // AC5: تقرير التشخيص لا يحمل شيئًا من محتوى النسخة.
  await st.eval(() => { window.__copied = []; navigator.clipboard.writeText = async (t) => { window.__copied.push(t); }; });
  await navHash(st, 'diagnostics');
  await st.eval(() => { window.__copied = []; navigator.clipboard.writeText = async (t) => { window.__copied.push(t); }; });
  await clickOn(st, byText('#diagnostics button', 'نسخ تقرير التشخيص'), 'نسخ التشخيص');
  await sleep(600);
  const diag = await st.eval(() => window.__copied[0] ?? '');
  const leaks = ['محاضرة تجريبية', 'هذا سطر من الترجمة', 'موجِّه', 'tarjuman-backup', TED].filter((p) => diag.includes(p));
  check('ac5-diagnostics-clean', diag.length > 0 && leaks.length === 0, { leaks, length: diag.length });
}

/** المحفوظات كما تقرؤها الصفحة: مُلخّص الفهرس ورؤوس الحزم، لحساب أعداد الفرز في Node. */
async function libraryFromPage(page) {
  const all = await page.eval(async () => {
    const x = await chrome.storage.local.get(null);
    return Object.fromEntries(Object.entries(x).filter(([k]) => k.startsWith('index:') || k.startsWith('bundle:')));
  });
  return Object.keys(all).filter((k) => k.startsWith('index:')).map((k) => {
    const entry = all[k];
    const head = all[`bundle:${entry.videoId}`];
    return { entry, summary: head?.summary ?? undefined, slots: [] };
  });
}

// ---- Chrome: الاستعادة ----
async function restorePhase() {
  const file = path.join(HANDOFF, 'from-brave.json');
  const meta = JSON.parse(await readFile(path.join(HANDOFF, 'from-brave.meta.json'), 'utf8'));
  const backup = JSON.parse(await readFile(file, 'utf8'));
  observe('backup-received', { counts: backup.counts, mb: +((await stat(file)).size / 1048576).toFixed(1), app: backup.app.version });
  const st = await openExt('pages/settings/index.html#data');
  await st.eval(async () => chrome.storage.local.clear());
  // فيديوهان من المكتبة نفسها بعمل أحدث في Chrome: يُتخطيان افتراضيًا.
  const local = await buildLocal([largeId(1), largeId(2)]);
  await seedInto(st, local.items);
  await st.reload();
  await st.waitFor(() => !!document.querySelector('#data .st-data'), { timeoutMs: 8000 });

  // المعاينة.
  let hashBefore = await storageHash(st);
  await chooseFile(st, byText('#data button', 'استعادة من ملف'), file, 'استعادة من ملف…');
  const opened = await st.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .st-restore'), { timeoutMs: 60000 });
  const pv = await textOf(st, topDialog);
  const boxes = await st.eval(() => [...document.querySelectorAll('dialog.tj-dialog[open] .st-restore input[type="checkbox"]')].map((x) => ({ video: x.getAttribute('data-video'), checked: x.checked, role: x.getAttribute('role') })));
  const settingsBox = boxes.find((x) => !x.video && x.role !== 'switch' && x.checked === false);
  check('ac4-preview', opened && /جديدة — ستُضاف \(302\)/.test(pv) && /موجودة — تُتخطى افتراضيًا \(2\)/.test(pv) && /الحالية أحدث/.test(pv)
    && boxes.filter((x) => x.video).every((x) => !x.checked) && Boolean(settingsBox) && /نزّل نسخة من بياناتك الحالية أولًا/.test(pv), { counts: /\d+ فيديو[^·]*·[^·]+·[^·]+/.exec(pv)?.[0] ?? null });
  check('ac4-no-write-before-confirm', (await storageHash(st)) === hashBefore);
  await shot(st, 'restore-preview');
  let t0 = Date.now();
  await clickOn(st, confirmBtn, 'استعادة');
  const progress = new Set();
  let report = null;
  for (let i = 0; i < 600 && !report; i++) {
    const p = await textOf(st, `document.querySelector('#data .st-progress:not([hidden]) .st-progress__text')`);
    if (p) progress.add(p);
    report = await textOf(st, byText('#data .tj-alert', 'اكتملت الاستعادة'));
    await sleep(100);
  }
  result.timings.restoreMs = Date.now() - t0;
  check('ac4-restore-report', /أضيف 302 · تُخطّي 2 · استُبدل 0 · تعذّر 0/.test(report ?? ''), { report, ms: result.timings.restoreMs });
  observe('ac4-restore-progress-samples', [...progress].slice(0, 8));
  check('ac4-progress-visible', progress.size >= 2, { samples: progress.size });
  await shot(st, 'restore-report');
  const kept = await getKeys(st, [`video:${largeId(1)}`, 'settings']);
  check('ac4-existing-skipped', kept[`video:${largeId(1)}`].title === 'عمل أحدث في Chrome' && kept.settings?.offsetStepMs !== 1000, { title: kept[`video:${largeId(1)}`].title });

  // المطابقة مع Brave: كل فيديو مستعاد يطابق مدخله في النسخة (عدا rev).
  const restored = await st.eval(async () => chrome.storage.local.get(null));
  let same = 0;
  const diffs = [];
  for (const e of backup.data.videos) {
    const id = e.record.videoId;
    if (id === largeId(1) || id === largeId(2)) continue;
    const rec = { ...restored[`video:${id}`], rev: 0 };
    const head = restored[`bundle:${id}`];
    const got = {
      record: rec, active: head ? head.active : rec.arabic ? 1 : null, names: head ? head.names : [null, null, null],
      alts: restored[`alts:${id}`]?.slots ?? [null, null, null], previous: restored[`prev:${id}`]?.previous ?? null,
      marks: restored[`marks:${id}`]?.slots ?? [0, 1, 2].map(() => ({ marks: [], position: null })),
    };
    const want = { ...e, record: { ...e.record, rev: 0 } };
    if (JSON.stringify(got) === JSON.stringify(want)) same++;
    else diffs.push(id);
  }
  check('ac4-brave-to-chrome-identical', same === 302, { same, diffs: diffs.slice(0, 5) });

  // «استبدال كل الموجود» مع الإعدادات والقاموس.
  await chooseFile(st, byText('#data button', 'استعادة من ملف'), file, 'استعادة ثانية');
  await st.waitFor(() => !!document.querySelector('dialog.tj-dialog[open] .st-restore'), { timeoutMs: 60000 });
  await clickOn(st, `${topDialog}?.querySelector('.st-restore input[role="switch"]')`, 'استبدال كل الموجود');
  await clickOn(st, byText('dialog.tj-dialog[open] .st-restore label.st-check', 'استعادة الإعدادات والقاموس') + `?.querySelector('input')`, 'استعادة الإعدادات');
  t0 = Date.now();
  await clickOn(st, confirmBtn, 'استعادة');
  report = null;
  for (let i = 0; i < 600 && !report; i++) {
    report = await textOf(st, byText('#data .tj-alert', 'اكتملت الاستعادة'));
    await sleep(100);
  }
  result.timings.replaceAllMs = Date.now() - t0;
  const s2 = await getKeys(st, ['settings', 'prefs', `video:${largeId(1)}`]);
  check('ac4-replace-all-with-settings', /أضيف 0 · تُخطّي 0 · استُبدل 304 · تعذّر 0/.test(report ?? '') && /استُعيدت الإعدادات والقاموس/.test(report ?? '')
    && s2.settings.offsetStepMs === 1000 && s2.prefs.glossary.terms.length === meta.glossary && s2[`video:${largeId(1)}`].title !== 'عمل أحدث في Chrome', { report, ms: result.timings.replaceAllMs });

  // التالف والأحدث إصدارًا: رفض قبل أي كتابة.
  hashBefore = await storageHash(st);
  const bad = path.join(HANDOFF, `tampered-${RUN}.json`);
  await writeFile(bad, (await readFile(file, 'utf8')).replace('"offsetStepMs":1000', '"offsetStepMs":2000'));
  await chooseFile(st, byText('#data button', 'استعادة من ملف'), bad, 'ملف تالف');
  const badMsg = await st.waitFor(() => [...document.querySelectorAll('#data .tj-alert')].map((a) => a.textContent).find((t) => /بصمة سلامة/.test(t)) ?? null, { timeoutMs: 60000 });
  check('ac4-tampered-rejected', Boolean(badMsg) && (await storageHash(st)) === hashBefore, { message: badMsg?.slice(0, 120) ?? null });
  const newer = path.join(HANDOFF, `newer-${RUN}.json`);
  await writeFile(newer, JSON.stringify({ ...backup, version: 2 }));
  await chooseFile(st, byText('#data button', 'استعادة من ملف'), newer, 'ملف أحدث');
  const newerMsg = await st.waitFor(() => [...document.querySelectorAll('#data .tj-alert')].map((a) => a.textContent).find((t) => /حدّث ترجمان أولًا/.test(t)) ?? null, { timeoutMs: 60000 });
  check('ac4-newer-rejected', Boolean(newerMsg) && (await storageHash(st)) === hashBefore);

  // المحفوظات في Chrome بالأعداد نفسها.
  const lib = await openExt('pages/library/index.html');
  t0 = Date.now();
  const rows = await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 50 && document.querySelectorAll('li.lib-row').length, { timeoutMs: 30000, intervalMs: 50 });
  result.timings.libraryLoadMs = Date.now() - t0;
  check('ac4-library-same-counts', rows === 50 && JSON.stringify(await chipLabels(lib)) === JSON.stringify(chipText(meta.counts)), { shown: await chipLabels(lib), ms: result.timings.libraryLoadMs });
  await shot(lib, 'library-restored');
  await clickOn(lib, `document.querySelector('li.lib-row[data-video="${TED}"] button.lib-more')`, 'المزيد');
  await clickOn(lib, byText('.tj-menu__list:not([hidden]) [role=menuitem]', 'الترجمات'), 'الترجمات…');
  await lib.waitFor(() => document.querySelectorAll('dialog.lib-panel[open] section.lib-slot').length === 4, { timeoutMs: 8000 });
  await shot(lib, 'translations-panel-restored');
}

/** فيديوهات محلية في Chrome بالمعرّفات نفسها وعمل أحدث. */
async function buildLocal(ids) {
  const { createMemoryArea } = await import('../../helpers/chrome-storage.js');
  const { createStore } = await import('../../../src/core/store/index.js');
  const { videoRecord } = await import('../../helpers/fixtures.js');
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => Date.now() + 86400000 });
  for (const id of ids) await store.updateVideo(id, () => ({ ...videoRecord({ videoId: id }), title: 'عمل أحدث في Chrome' }));
  await area.flush();
  return { items: area.dump() };
}

try {
  await start();
  if (PHASE === 'create') await createPhase();
  else await restorePhase();
} catch (err) {
  check('run-completed', false, { error: String(err?.message ?? err).slice(0, 300) });
} finally {
  for (const p of pages) {
    result.errors[p.rest] = p.errs.list;
    result.network[p.rest] = { external: p.net.external, hosts: [...p.net.hosts], total: p.net.total };
  }
  check('no-extension-errors', pages.every((p) => p.errs.list.length === 0), Object.fromEntries(pages.map((p) => [p.rest, p.errs.list.length])));
  check('no-network', pages.every((p) => p.net.external === 0));
  await b?.close().catch(() => {});
  await mkdir(OUT, { recursive: true });
  const json = JSON.stringify(result, null, 2);
  const secrets = findSecrets(json);
  if (secrets.length) result.notes = [`المنقّي وجد ${secrets.length} نمطًا حساسًا؛ لم يُكتب الملف.`];
  else await writeFile(path.join(OUT, `live-${browser}.json`), `${json}\n`);
  const failed = result.checks.filter((c) => !c.ok);
  console.log(`\n${result.checks.length - failed.length}/${result.checks.length} ناجح${failed.length ? ` · ساقط: ${failed.map((c) => c.id).join('، ')}` : ''}`);
  process.exit(failed.length ? 1 : 0);
}
