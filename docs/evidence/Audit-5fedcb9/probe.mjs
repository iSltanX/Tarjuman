#!/usr/bin/env node
// قياس حي مخصص لمعالجة تدقيق 5fedcb9 (سكربت التحقق، لا اختبار دائم): بناء التطوير في ملف تعريف جديد بلا نافذة ومكتوم
// الصوت، وحساب يوتيوب غير مسجّل. يقيس ما لا تثبته اختبارات الوحدة وحدها:
//   GM-010: ترتيب مفاتيح chrome.storage الحقيقي، ومفاتيح الكتابة لتغيير الإزاحة وحده (لا التوابع ولا السابقة ولا العلامات).
//   CL-001: الإزاحة الموقّعة معزولة LTR (U+2066…U+2069) في المحفوظات والمحرّر.
//   CL-004: المحرّر بعروض 1024 و900 و768 بلا تجاوز أفقي ولا زر مقصوص.
//   GM-017.3: حفظ العامل الخلفي من رابط data: بأحجام متدرجة (حد Chromium لطول الرابط).
//   CL-003: رسالة المشغّل فوق سطر الترجمة الظاهر وداخل المشغّل.
//   GM-022: رسائل قراءة خطوط الإضافة (الترجمة والواجهة) تُعدّ وحدها ولا تبقى أخطاءً.
// التخزين يُزرع بحزمة العيّنة نفسها في اختبارات الوحدة (test/helpers/fixtures-v2.js) لفيديو TED. لا رابط ولا رمز في الأدلة.
//   command npm run build:dev -- --out <مجلد خارج المستودع>
//   command node docs/evidence/Audit-5fedcb9/probe.mjs --browser brave|chrome --ext <مجلد> [--out docs/evidence/Audit-5fedcb9/probe]
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, PROFILE_ROOT, launch, loadExtension, sleep } from '../../../test/live/harness/browser.mjs';
import { FONT_READ_LOG, collectErrors, openTab } from '../../../test/live/harness/extension.mjs';
import { dismissConsent, revealControls, waitForPlayer } from '../../../test/live/harness/youtube.mjs';
import { sampleBundle } from '../../../test/helpers/fixtures-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/Audit-5fedcb9/probe'), browser);
const VIDEO = 'iG9CE55wbtY';
const PROFILE = `${browser}-audit-${Date.now()}`;
const DL = path.join(PROFILE_ROOT, PROFILE, 'downloads');
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

const result = { browser: null, at: new Date().toISOString(), checks: [], measures: {}, screenshots: [], notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
};
const note = (t) => { result.notes.push(t); console.log(`· ${t}`); };
const rel = (f) => path.relative(ROOT, f);

async function shot(page, name, clip = null) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  const f = path.join(OUT, `${name}.png`);
  await writeFile(f, Buffer.from(data, 'base64'));
  result.screenshots.push(rel(f));
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push({ name: e.name, bytes: (await stat(p)).size });
  }
  return out;
}

let b = null;
const errors = [];
try {
  await mkdir(OUT, { recursive: true });
  await mkdir(path.join(PROFILE_ROOT, PROFILE, 'Default'), { recursive: true });
  await mkdir(DL, { recursive: true });
  await writeFile(path.join(PROFILE_ROOT, PROFILE, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: DL, prompt_for_download: false, directory_upgrade: true }, savefile: { default_directory: DL } }));
  b = await launch({ browser, profile: PROFILE, headless: true });
  result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
  // مجلد التنزيل من تفضيلات ملف التعريف وحدها: Browser.setDownloadBehavior يتجاهل الاسم الذي تمرّره الإضافة («download.txt»).
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  const extId = ext.id;
  console.log(`المتصفح: ${result.browser}`);
  const openExt = async (p) => {
    const page = await openTab(b.conn, `chrome-extension://${extId}/${p}`);
    errors.push({ where: p.split('?')[0], list: collectErrors(page, { extId }) });
    return page;
  };

  // ===== صفحة إضافة بخطاف التطوير: التخزين الحقيقي والعامل =====
  const g = await openExt('ui/gallery/index.html');
  await g.waitFor(() => !!globalThis.__tarjumanPage?.store, { timeoutMs: 10000 });

  // GM-010: ترتيب المفاتيح كما يعيده chrome.storage، ثم مفاتيح كتابة تغيير الإزاحة وحده.
  const order = await g.eval(async () => {
    await chrome.storage.local.set({ 'tj-probe': { b: 1, a: { z: 1, y: 2 } } });
    const got = (await chrome.storage.local.get('tj-probe'))['tj-probe'];
    await chrome.storage.local.remove('tj-probe');
    return { top: Object.keys(got), nested: Object.keys(got.a) };
  });
  result.measures.storageKeyOrder = order;
  check('gm010-chromium-sorts-keys', order.top.join() === 'a,b' && order.nested.join() === 'y,z', order);
  const bundle = sampleBundle({ videoId: VIDEO, third: true });
  await g.eval(async (bd) => globalThis.__tarjumanPage.store.updateBundle(bd.videoId, () => bd), { args: [bundle] });
  const sets = await g.eval(async (id) => {
    const area = chrome.storage.local;
    const orig = area.set.bind(area);
    const seen = [];
    area.set = (items, ...rest) => { seen.push(Object.keys(items).map((k) => k.split(':')[0]).sort()); return orig(items, ...rest); };
    try {
      await globalThis.__tarjumanPage.store.updateVideo(id, (r) => ({ ...r, view: { ...r.view, displayOffsetMs: 900 }, updatedAt: new Date().toISOString() }));
    } finally {
      area.set = orig;
    }
    return seen;
  }, { args: [VIDEO] });
  result.measures.offsetWriteKeys = sets;
  const written = new Set(sets.flat());
  check('gm010-offset-writes-no-alts-prev-marks', sets.length > 0 && !['alts', 'prev', 'marks'].some((k) => written.has(k)), sets);

  // GM-017.3: حفظ العامل من رابط data: بأحجام متدرجة (من صفحة إضافة، والعامل يقبلها كسكربت المحتوى).
  const sizes = [1.0, 1.4, 1.6, 2.0, 4.0];
  const saves = [];
  for (const mb of sizes) {
    const chars = Math.round(mb * 1024 * 1024);
    const name = `audit-datalimit-${String(mb).replace('.', '_')}mb.txt`;
    const reply = await g.eval(async (n, c) => chrome.runtime.sendMessage({ type: 'tj:save-file', v: 1, file: { name: n, text: 'a'.repeat(c) } }), { args: [name, chars] });
    // حالة التنزيل نفسه بمعرّفه (المرجع)، حتى يكتمل أو ينقطع.
    const dl = reply?.downloadId == null ? null : await g.waitFor(async (id) => {
      const [it] = await chrome.downloads.search({ id });
      return it && it.state !== 'in_progress' ? { state: it.state, error: it.error ?? null, bytes: it.fileSize, file: it.filename.split('/').pop() } : null;
    }, { args: [reply.downloadId], timeoutMs: 20000 });
    saves.push({ mb, chars, dataUrlChars: 'data:text/plain;charset=utf-8;base64,'.length + Math.ceil(chars / 3) * 4, name, reply, download: dl });
  }
  const files = await walk(DL);
  for (const s of saves) s.saved = files.find((f) => f.name === s.name)?.bytes ?? null;
  result.measures.dataUrlSaves = saves;
  const complete = (s) => s.reply?.ok && s.download?.state === 'complete' && s.download.bytes === s.chars && s.saved === s.chars;
  note(`حفظ العامل من رابط data:: مكتمل لـ${saves.filter(complete).map((s) => s.mb).join('، ') || 'لا شيء'} م.ب، وغير مكتمل لـ${saves.filter((s) => !complete(s)).map((s) => `${s.mb} (${s.reply?.code ?? s.download?.error ?? s.download?.state ?? 'بلا تنزيل'})`).join('، ') || 'لا شيء'}`);
  check('gm017-3-small-file-saves', complete(saves[0]), saves[0]);
  check('gm017-3-failure-is-reported-not-silent', saves.every((s) => complete(s) || (s.reply?.ok === false && typeof s.reply.code === 'string')), saves.map((s) => ({ mb: s.mb, reply: s.reply, download: s.download, saved: s.saved })));

  // ===== CL-001: الإزاحة معزولة في المحفوظات والمحرّر =====
  const isolatedOffsets = (page) => page.eval((lri, pdi) => {
    const out = [];
    const walkNodes = (root) => {
      for (const el of root.querySelectorAll('*')) {
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
        const label = el.getAttribute('aria-label') || '';
        for (const t of [own, label]) if (/إزاحة/.test(t) && /\d/.test(t)) out.push({ text: t.slice(0, 80), isolated: t.includes(lri) && t.includes(pdi) });
      }
    };
    walkNodes(document);
    return out;
  }, { args: [LRI, PDI] });
  const lib = await openExt('pages/library/index.html');
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length > 0, { timeoutMs: 10000 });
  const libOffsets = await isolatedOffsets(lib);
  result.measures.libraryOffsets = libOffsets;
  check('cl001-library-offset-isolated', libOffsets.length > 0 && libOffsets.every((x) => x.isolated), libOffsets.slice(0, 4));

  // ===== CL-004 ومعه CL-001 في المحرّر: ثلاثة عروض =====
  const ed = await openExt(`pages/editor/index.html?v=${VIDEO}`);
  await ed.waitFor(() => document.querySelectorAll('[role="tab"]').length > 0, { timeoutMs: 15000 });
  const edOffsets = await isolatedOffsets(ed);
  result.measures.editorOffsets = edOffsets;
  check('cl001-editor-offset-isolated', edOffsets.length > 0 && edOffsets.every((x) => x.isolated), edOffsets.slice(0, 4));
  for (const w of [1024, 900, 768]) {
    await ed.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const a = await ed.eval(() => {
      const w0 = document.documentElement.clientWidth;
      const off = [...document.querySelectorAll('body *')].filter((e) => {
        const r = e.getBoundingClientRect();
        if (!r.width || getComputedStyle(e).position === 'fixed' || e.closest('[hidden]')) return false;
        for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return false;
        return r.right > w0 + 1 || r.left < -1;
      }).map((e) => `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]}`).slice(0, 6);
      const clipped = [...document.querySelectorAll('button, .tj-btn, [role="tab"]')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map((e) => (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 30)).slice(0, 6);
      return { width: w0, scrollWidth: document.documentElement.scrollWidth, overflow: off, clipped };
    });
    result.measures[`editor-${w}`] = a;
    check(`cl004-editor-${w}-no-horizontal-clip`, a.scrollWidth <= a.width + 1 && a.overflow.length === 0 && a.clipped.length === 0, a);
    await shot(ed, `editor-${w}`);
  }
  await ed.send('Emulation.clearDeviceMetricsOverride');

  // ===== CL-003 وGM-022: المشغّل على يوتيوب =====
  const yt = await openTab(b.conn, 'about:blank');
  await yt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });
  const ytErr = collectErrors(yt, { extId, onlyExtension: true });
  await yt.goto(`https://www.youtube.com/watch?v=${VIDEO}`);
  await dismissConsent(yt).catch(() => false);
  const main = (fn, ...args) => yt.eval(fn, { args });
  await main(() => document.querySelectorAll('video').forEach((v) => { v.muted = true; }));
  const ready = await waitForPlayer(yt, VIDEO, 30000);
  if (await main(() => /confirm you.re not a bot|unusual traffic/i.test(document.body?.innerText || ''))) throw new Error('BOT_CHALLENGE: توقف دون تحايل');
  check('youtube-player-ready', !!ready);
  await sleep(1500);
  const isoId = yt.isolatedContextId(extId);
  const iso = (fn, ...args) => yt.eval(fn, { contextId: isoId, args });
  await yt.waitFor(() => !!document.querySelector('#tarjuman-controls'), { timeoutMs: 15000 });
  await yt.waitFor(() => !!globalThis.__tarjuman.controller.getState().arabic, { contextId: isoId, timeoutMs: 15000 });
  // المقطع الثاني من العيّنة 3.5–5.5 ث، والإزاحة المزروعة 0.9 ث: عند 5.0 ث يظهر سطر.
  await main(() => { const v = document.querySelector('#movie_player video'); v.muted = true; v.pause(); v.currentTime = 5.0; return true; });
  const stageOk = await yt.waitFor(() => {
    const h = document.querySelector('#tarjuman-overlay');
    return h && !h.hasAttribute('hidden') && h.getAttribute('data-stage-top') ? Number(h.getAttribute('data-stage-top')) : null;
  }, { timeoutMs: 8000 });
  check('cl003-subtitle-line-visible', !!stageOk, { stageTop: stageOk });
  const peek = () => iso(() => globalThis.__tarjuman.mounted.controls.peek());
  const center = (box) => ({ x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) });
  await revealControls(yt);
  let p = await peek();
  const up = center(p.buttons.upload.box);
  await yt.click(up.x, up.y);
  await sleep(600);
  p = await peek();
  const slot2 = p.layer.menu?.items.find((x) => x.fid === 'slot:2');
  if (!slot2) throw new Error(`لا بند slot:2: ${p.layer.menu?.items.map((x) => x.fid).join(',')}`);
  const s2 = center(slot2.box);
  await yt.click(s2.x, s2.y);
  await sleep(500);
  if ((await peek()).layer.menu) {
    await yt.key('Escape', 'Escape', 27);
    await sleep(300);
  }
  p = await peek();
  const geo = await main(() => {
    const r = document.querySelector('#movie_player').getBoundingClientRect();
    const h = document.querySelector('#tarjuman-overlay');
    return { player: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }, stageTop: h && !h.hasAttribute('hidden') ? Number(h.getAttribute('data-stage-top')) : null };
  });
  const toasts = p.layer.toasts;
  result.measures.cl003 = { ...geo, toasts };
  const lineTop = geo.stageTop != null ? geo.player.bottom - geo.stageTop : null;
  check('cl003-toast-shown', toasts.length > 0, toasts.map((t) => t.text));
  check('cl003-toast-above-subtitle-line', toasts.length > 0 && lineTop != null && toasts.every((t) => t.box.bottom <= lineTop + 2), { lineTop, toasts: toasts.map((t) => t.box) });
  check('cl003-toast-inside-player', toasts.length > 0 && toasts.every((t) => t.box.top >= geo.player.top && t.box.bottom <= geo.player.bottom), { player: geo.player });
  await shot(yt, 'player-toast-above-line', { x: geo.player.left, y: geo.player.top, width: geo.player.right - geo.player.left, height: geo.player.bottom - geo.player.top });

  // GM-022: رسائل قراءة الخطوط تُعدّ وحدها.
  const fontReads = ytErr.list.filter((x) => x.kind === 'log.security' && FONT_READ_LOG.test(x.text));
  const ytReal = ytErr.list.filter((x) => !fontReads.includes(x));
  result.measures.fontReadLogs = { total: fontReads.length, ui: fontReads.filter((x) => /\/ui\/fonts\/ui\//.test(x.text)).length, subtitle: fontReads.filter((x) => /\/ui\/fonts\/subtitle\//.test(x.text)).length };
  note(`رسائل قراءة الخطوط على يوتيوب: ${JSON.stringify(result.measures.fontReadLogs)}`);
  const pageErrs = errors.flatMap((e) => e.list.list.map((x) => ({ where: e.where, ...x })));
  check('no-extension-errors', ytReal.length === 0 && pageErrs.length === 0, { youtube: ytReal.slice(0, 3), pages: pageErrs.slice(0, 3) });
} catch (err) {
  check('run', false, { error: String(err.message).replace(/https?:\/\/\S+/g, '[رابط]') });
} finally {
  if (b) await b.close();
  result.passed = result.checks.every((c) => c.ok);
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'probe.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n${result.browser ?? browser}: ${result.checks.filter((c) => c.ok).length}/${result.checks.length}`);
}
