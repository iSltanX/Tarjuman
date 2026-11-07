#!/usr/bin/env node
// المحافظة على البيانات عند الانتقال من 1.1.0 إلى 2.0.0 (AA5، قرار سلطان ق٦: «بلا افتراض لفقد البيانات أو سلامتها دون اختبار»)، في
// Chrome بلا نافذة بملفات تعريف جديدة تحت TJ_PROFILE_ROOT، بلا يوتيوب ولا شبكة:
//   ١. التحديث في المكان: حزمة 1.1.0 المنشورة نفسها (release/browsers/1.1.0/Chrome/manual-install، للقراءة) في مجلد اختبار، وبيانات
//      يكتبها 1.1.0 بشيفرته (test/fixtures/v1.1 مجمّعة ومحقونة في صفحة منها، عبر عاملها الخلفي): فيديو بثلاث ترجمات وسابقة وعلامات،
//      وفيديو بترجمة واحدة، وإعداد، وقاموس؛ ونسخة احتياطية بشيفرة 1.1.0. ثم ملفات حزمة متجر 2.0.0 (release/store) فوقها في المجلد نفسه
//      وإعادة التحميل بالملف نفسه، فالمعرّف نفسه والتخزين نفسه، كما يفعل تحديث المتجر. والمقارنة: كل مفتاح كتبه 1.1.0 باقٍ بقيمته،
//      والمحفوظات والإعدادات والقاموس والمحرّر في واجهات 2.0.0 تعرضه.
//   ٢. التثبيت المنفصل: حزمة 2.0.0 في ملف تعريف آخر ومجلد آخر (معرّف آخر وتخزين فارغ)، واستعادة نسخة 1.1.0 من الإعدادات بنقرات حقيقية
//      ومنتقي الملفات، ثم المقارنة نفسها على المحتوى.
// الحد: تحديث المتجر الحقيقي لا يُختبر قبل النشر؛ والمحاكاة بالمعرّف نفسه أقرب دليل. ولا نص مقاطع في الأدلة.
// **يفتح متصفحًا عند تشغيله أو استيراده:** بإذن سلطان وحده (دليل التشغيل، «الاختبارات الحية»).
//   command npm run package
//   TJ_PROFILE_ROOT=<مجلد في المسودة> command node test/live/aa5/data.mjs [--v11 <مجلد حزمة 1.1.0>] [--out docs/evidence/AA5/data] [--headed]
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PROFILE_ROOT, human, sleep } from '../harness/browser.mjs';
import { readZip } from '../../../scripts/release/zip.mjs';
import { startBrowser } from '../stores/driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const HEADED = argv.includes('--headed');
const V11 = path.resolve(val('v11', '/Volumes/iSltanXx/Projects/Tarjuman/release/browsers/1.1.0/Chrome/manual-install'));
const OUT = path.resolve(ROOT, val('out', 'docs/evidence/AA5/data'));
const VERSION = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
const ZIP = path.join(ROOT, 'release/store', `tarjuman-${VERSION}-chrome.zip`);
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const WORK = path.join(PROFILE_ROOT, 'aa5-work', `data-${RUN}`);
const EXT = path.join(WORK, 'ext');
const EXT2 = path.join(WORK, 'ext-separate');
const V2 = path.join(WORK, 'v2');
const DL = path.join(WORK, 'downloads');
const PROFILE = `chrome-aa5-update-${RUN}`;
const PROFILE2 = `chrome-aa5-separate-${RUN}`;
const A = 'Y-rmzh0PI3c';
const B = 'iG9CE55wbtY';

const result = { at: new Date().toISOString(), browser: null, v11: null, v2: VERSION, sessions: [], checks: [], notes: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  return !!ok;
};
const note = (t) => { result.notes.push(t); console.log(`· ${t}`); };

/** مفاتيح البيانات التي يكتبها 1.1.0 وقيمها، بلا نص مقاطع في الأدلة (البصمة وحدها). */
const sha = async (v) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
};
/** محتوى الحزمة كما يقارن بعد الاستعادة: النصوص والتوقيت والخانات والعلامات والسابقة، بلا المراجعة وتواريخ الكتابة. */
const content = (dump, id) => {
  const rec = dump[`video:${id}`];
  const alts = dump[`alts:${id}`];
  const prev = dump[`prev:${id}`];
  const marks = dump[`marks:${id}`];
  const head = dump[`bundle:${id}`];
  const cues = (t) => (t ? { original: t.original, current: t.current, fileName: t.fileName } : null);
  return {
    english: rec?.english?.map((t) => ({ key: t.key, cues: t.cues })) ?? null,
    arabic: cues(rec?.arabic),
    alts: alts?.slots?.map((x) => (x ? cues(x.track) : null)) ?? null,
    prev: prev?.previous ? cues(prev.previous.track) : null,
    marks: marks?.slots?.map((x) => x.marks.map((m) => ({ n: m.n, kind: m.kind }))) ?? null,
    names: head?.names ?? null,
    active: head?.active ?? null,
  };
};

async function prepare() {
  await mkdir(WORK, { recursive: true });
  await mkdir(DL, { recursive: true });
  await mkdir(OUT, { recursive: true });
  const v11manifest = JSON.parse(await readFile(path.join(V11, 'manifest.json'), 'utf8'));
  if (v11manifest.version !== '1.1.0') throw new Error(`حزمة 1.1.0 غير متوقعة: ${v11manifest.version}`);
  result.v11 = { version: v11manifest.version, name: v11manifest.name, from: 'release/browsers/1.1.0/Chrome/manual-install' };
  for (const e of readZip(await readFile(ZIP))) {
    const f = path.join(V2, e.name);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, e.data);
  }
  // مساعدات العيّنات (test/helpers/fixtures.js) تستورد node:fs وnode:path وnode:url في مستوى الوحدة لقراءة عيّنات json3 من القرص،
  // والدوال التي تحتاجها sampleBundle وsamplePrefs لا تقرأ ملفًا. فتُستبدل في التجميع للصفحة وحده ببديل: القراءة ترمي إن استُدعيت.
  const NODE_STUB = "const no = () => { throw new Error('node:fs غير متاح في الصفحة'); }; export const readFileSync = no; const p = { resolve: (...a) => a.join('/'), dirname: (s) => String(s), join: (...a) => a.join('/') }; export default p; export const fileURLToPath = (u) => String(u ?? '/');";
  const nodeStub = {
    name: 'node-stub',
    setup(b) {
      b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: 'node-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({ contents: NODE_STUB, loader: 'js' }));
    },
  };
  const bundle = await build({ entryPoints: [path.join(ROOT, 'test/live/aa5/v11-entry.mjs')], bundle: true, format: 'iife', write: false, target: 'chrome120', logLevel: 'silent', plugins: [nodeStub], define: { 'import.meta.url': '"file:///"' } });
  return bundle.outputFiles[0].text;
}

async function swapTo(dir, target = EXT) {
  await rm(target, { recursive: true, force: true });
  await cp(dir, target, { recursive: true });
}

/** جلسة متصفح بملف تعريف ومجلد إضافة، تُغلق دائمًا. */
async function session(label, { profile, ext }, run) {
  const s = await startBrowser('chrome', { profile, ext, downloadDir: DL, headless: !HEADED });
  result.browser ??= s.version;
  try {
    const p = await s.extPage('pages/popup/index.html');
    const version = await p.eval(() => chrome.runtime.getManifest().version);
    await p.conn.send('Target.closeTarget', { targetId: p.targetId }).catch(() => null);
    result.sessions.push({ label, extensionId: s.extensionId, version });
    console.log(`— ${label}: ${version} (${s.extensionId})`);
    await run(s);
    const errs = s.errors().flatMap((e) => e.errors);
    check(`${label}-no-extension-errors`, errs.length === 0, errs.slice(0, 4));
  } finally {
    await s.close().catch(() => {});
    await sleep(800);
  }
}
const dumpOf = (page) => page.eval(() => chrome.storage.local.get(null));
/** نقرة حقيقية على عنصر أول يطابق النص في صفحة إضافة. */
async function clickText(page, selector, text, what) {
  const ok = await page.eval((sel, t) => {
    for (const e of document.querySelectorAll('[data-aa5]')) e.removeAttribute('data-aa5');
    const el = [...document.querySelectorAll(sel)].find((x) => x.textContent.replace(/\s+/g, ' ').includes(t) && x.getClientRects().length);
    if (!el) return false;
    el.setAttribute('data-aa5', '1');
    el.scrollIntoView({ block: 'center' });
    return true;
  }, { args: [selector, text] });
  if (!ok) throw new Error(`لم يوجد: ${what}`);
  await sleep(200);
  const c = await page.centerOf('[data-aa5="1"]');
  if (!c) throw new Error(`غير ظاهر: ${what}`);
  await page.click(c.x, c.y);
  await human(300, 500);
}
/** ما تعرضه واجهات 2.0.0: صفوف المحفوظات، والوضع الافتراضي، والقاموس، وعدد مقاطع المحرّر. */
async function uiReadout(s) {
  const lib = await s.extPage('pages/library/index.html');
  await lib.waitFor(() => document.querySelectorAll('.lib-row').length >= 2, { timeoutMs: 15000 }).catch(() => null);
  await sleep(800);
  const rows = await lib.eval(() => [...document.querySelectorAll('.lib-row')].map((r) => ({ text: r.textContent.replace(/\s+/g, ' ').slice(0, 400) })));
  const st = await s.extPage('pages/settings/index.html#display');
  await st.waitFor(() => document.readyState === 'complete', { timeoutMs: 10000 }).catch(() => null);
  await sleep(1200);
  const display = await st.eval(() => [...document.querySelectorAll('[aria-checked="true"], input:checked')].map((e) => (e.closest('label') ?? e).textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
  const gl = await s.extPage('pages/settings/index.html#glossary');
  await sleep(1500);
  const glossary = await gl.eval(() => document.body.textContent.replace(/\s+/g, ' '));
  const ed = await s.extPage(`pages/editor/index.html?v=${A}`);
  await ed.waitFor(() => [...document.querySelectorAll('input')].some((i) => /^\d\d:\d\d:\d\d,\d{3}$/.test(i.value)), { timeoutMs: 15000 }).catch(() => null);
  await sleep(800);
  const editor = await ed.eval(() => ({ timeInputs: [...document.querySelectorAll('input')].filter((i) => /^\d\d:\d\d:\d\d,\d{3}$/.test(i.value)).length, text: document.body.textContent.replace(/\s+/g, ' ').slice(0, 200) }));
  return { rows, display, glossary: ['موجِّه', 'رمز', 'ضبط دقيق'].map((t) => glossary.includes(t)), editor };
}

try {
  const inject = await prepare();
  check('packages-ready', true, { v11: result.v11, v2: path.basename(ZIP) });

  // ===== ١أ. 1.1.0 يكتب بياناته وينشئ نسخة احتياطية =====
  await swapTo(V11);
  let written = null;
  await session('1-v11-write', { profile: PROFILE, ext: EXT }, async (s) => {
    const p = await s.extPage('pages/settings/index.html');
    await p.eval(inject);
    written = await p.eval(async (a, b) => {
      const { createStore, createBackup, sampleBundle, samplePrefs } = globalThis.__v11;
      const store = createStore();
      await store.updateBundle(a, () => sampleBundle({ videoId: a, third: true }));
      const one = sampleBundle({ videoId: b, previous: false });
      one.slots[1] = { ...one.slots[1], name: null, track: null, offsetMs: 0, marks: [], position: null };
      one.slots[0] = { ...one.slots[0], marks: [], position: null };
      one.record.arabic = structuredClone(one.slots[0].track);
      await store.updateBundle(b, () => one);
      await store.setSettings({ displayModeDefault: 'dual' });
      await store.setPrefs({ glossary: samplePrefs().glossary });
      const backup = await createBackup({ store, appVersion: '1.1.0' });
      return { backup: backup.text, backupName: backup.name, counts: backup.counts, dump: await chrome.storage.local.get(null) };
    }, { args: [A, B] });
    check('v11-wrote-data', !!written.dump[`video:${A}`] && !!written.dump[`video:${B}`] && !!written.dump[`alts:${A}`] && !!written.dump[`prev:${A}`] && written.dump.settings?.displayModeDefault === 'dual',
      { keys: Object.keys(written.dump).sort(), counts: written.counts });
  });
  const backupFile = path.join(WORK, written.backupName);
  await writeFile(backupFile, written.backup);
  result.backup = { name: written.backupName, bytes: Buffer.byteLength(written.backup), version: Number(/"version"\s*:\s*(\d+)/.exec(written.backup)?.[1] ?? NaN), counts: written.counts };
  const before = written.dump;
  const v11Keys = Object.keys(before).sort();
  result.v11Keys = await Promise.all(v11Keys.map(async (k) => ({ key: k.replace(/:.*/, ':‹id›'), sha: await sha(before[k]) })));

  // ===== ١ب. ملفات 2.0.0 فوق المجلد نفسه، وإعادة التحميل بالملف نفسه =====
  await swapTo(V2);
  await session('2-v2-update-in-place', { profile: PROFILE, ext: EXT }, async (s) => {
    check('same-extension-id', result.sessions[0].extensionId === s.extensionId, { before: result.sessions[0].extensionId, after: s.extensionId });
    const p = await s.extPage('pages/popup/index.html');
    await sleep(1500);
    const afterOpen = await dumpOf(p);
    const ui = await uiReadout(s);
    const afterUi = await dumpOf(p);
    const changed = v11Keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(afterUi[k]));
    const missing = v11Keys.filter((k) => !(k in afterUi));
    check('every-v11-key-kept', missing.length === 0, { missing });
    // الفهرس قد يُعاد بناؤه بالقيم نفسها؛ وما عداه من بيانات يبقى بقيمته حرفيًا.
    const dataChanged = changed.filter((k) => !/^index:/.test(k));
    check('v11-data-unchanged-after-reading', dataChanged.length === 0, { changed: changed.map((k) => k.replace(/:.*/, ':‹id›')) });
    result.newKeysAfterUpdate = Object.keys(afterUi).filter((k) => !(k in before)).map((k) => k.replace(/:.*/, ':‹id›'));
    check('v2-library-shows-both-videos', ui.rows.length === 2 && ui.rows.some((r) => r.text.includes(A)) && ui.rows.some((r) => r.text.includes(B)), { rows: ui.rows.length });
    check('v2-library-old-translations-language-unset', ui.rows.every((r) => r.text.includes('لغة غير محددة')), { sample: ui.rows.map((r) => r.text.match(/[^·]*←[^·]*/)?.[0]?.trim()) });
    check('v2-settings-display-default-dual', ui.display.some((t) => /فوق الأصل/.test(t)), { display: ui.display });
    check('v2-glossary-terms-shown', ui.glossary.every(Boolean), { glossary: ui.glossary });
    check('v2-editor-opens-old-translation', ui.editor.timeInputs >= 10, { timeInputs: ui.editor.timeInputs });
    void afterOpen;
  });

  // ===== ٢. تثبيت منفصل (معرّف آخر وتخزين فارغ) واستعادة نسخة 1.1.0 من الإعدادات =====
  await swapTo(V2, EXT2);
  await session('3-v2-separate-restore', { profile: PROFILE2, ext: EXT2 }, async (s) => {
    check('separate-install-other-id', s.extensionId !== result.sessions[0].extensionId, { id: s.extensionId });
    const st = await s.extPage('pages/settings/index.html#data');
    await sleep(1500);
    const empty = await dumpOf(st);
    check('separate-install-starts-empty', !Object.keys(empty).some((k) => k.startsWith('video:')), { keys: Object.keys(empty) });
    const chosen = st.armChooser([backupFile]);
    await clickText(st, 'button', 'استعادة من ملف', 'زر الاستعادة من ملف');
    await Promise.race([chosen, sleep(8000)]);
    await st.waitFor(() => !!document.querySelector('dialog[open]'), { timeoutMs: 15000 });
    await sleep(600);
    await clickText(st, 'dialog[open] label', 'استعادة الإعدادات والقاموس', 'خانة استعادة الإعدادات والقاموس');
    await clickText(st, 'dialog[open] button', 'استعادة', 'زر الاستعادة في الحوار');
    // في قسم «البيانات» أكثر من .st-data__result (نتيجة الإنشاء أولًا ثم نتيجة الاستعادة)، فيُقرأ ما فيه سطر التقرير منها.
    await st.waitFor(() => [...document.querySelectorAll('.st-data__result')].some((e) => /أضيف/.test(e.textContent)), { timeoutMs: 30000 }).catch(() => null);
    const report = await st.eval(() => [...document.querySelectorAll('.st-data__result')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).find((t) => /أضيف/.test(t)) ?? null);
    check('restore-report', /أضيف 2/.test(report ?? '') || /أضيف/.test(report ?? ''), { report });
    const after = await dumpOf(st);
    for (const id of [A, B]) {
      const x = await sha(content(before, id));
      const y = await sha(content(after, id));
      check(`restored-content-equal-${id === A ? 'three-slots' : 'single'}`, x === y, { before: x, after: y });
    }
    check('restored-settings-and-glossary', after.settings?.displayModeDefault === 'dual' && JSON.stringify(after.prefs?.glossary?.terms) === JSON.stringify(before.prefs?.glossary?.terms),
      { display: after.settings?.displayModeDefault, terms: after.prefs?.glossary?.terms?.length });
    const ui = await uiReadout(s);
    check('separate-library-shows-both-videos', ui.rows.length === 2, { rows: ui.rows.length });
    check('separate-editor-opens-restored-translation', ui.editor.timeInputs >= 10, { timeInputs: ui.editor.timeInputs });
  });
} catch (err) {
  check('run-completed', false, { error: String(err?.message ?? err).slice(0, 300) });
}

const pass = result.checks.filter((c) => c.ok).length;
result.summary = `${pass}/${result.checks.length}`;
await writeFile(path.join(OUT, 'data.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\nChrome (${result.browser}): ${result.summary}`);
process.exit(pass === result.checks.length ? 0 : 1);
