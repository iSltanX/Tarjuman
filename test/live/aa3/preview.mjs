#!/usr/bin/env node
// معاينة بصرية محلية لـAA3 (لوحتا 09 و15، ولوحة 19 البندان ١ و٢): نافذة الإضافة بحالاتها الثماني وحالات كتلة «تعليمات الترجمة» A–D،
// وقسم «اللغات» في الإعدادات، والزوج اللغوي في المحفوظات ورأس المحرّر، بالوضعين، **بلا يوتيوب ولا شبكة**. تُحمَّل حزمة التطوير في
// ملف تعريف اختبار جديد بلا نافذة، وتُبذر بيانات عيّنة، ويُحاكى رد صفحة الفيديو في النافذة بحقن chrome.tabs قبل تحميلها (عنوان
// تبويب ورد حالة مصنوعان، بلا أي طلب)، وتُحاكى الحافظة بنجاح أو فشل. ويُعدّ كل طلب خارج الإضافة وكل خطأ منها (المتوقع صفر).
// **يفتح متصفحًا عند تشغيله أو استيراده:** بإذن سلطان وحده (docs/development.md، «الاختبارات الحية»).
//   command npm run build:dev -- --out <مجلد خارج المستودع>
//   TJ_PROFILE_ROOT=<مجلد في المسودة> command node test/live/aa3/preview.mjs --browser brave|chrome --ext <مجلد> [--out <مجلد>]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launch, loadExtension, sleep } from '../harness/browser.mjs';
import { collectErrors, emulateScheme, fullScreenshot, openTab } from '../harness/extension.mjs';
import { SEED_IDS, buildSeedFew, storageItems } from '../ui/seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const val = (k, d = null) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const browser = val('browser', 'brave');
const EXT = path.resolve(ROOT, val('ext', 'dist'));
const OUT = path.resolve(ROOT, val('out', 'test-results/live/AA3'), browser);
const PROFILE = `${browser}-aa3-${Date.now()}`;

const result = { browser: null, at: new Date().toISOString(), headless: true, extension: null, shots: [], external: [], errors: [], checks: [] };
const check = (id, ok, detail = null) => {
  result.checks.push({ id, ok: !!ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
};
let b = null;
let extId = null;
const errors = [];

// ---- ردود صفحة الفيديو المصنوعة (بصيغة VideoStateReply، بلا رابط ولا نص مقاطع) ----
const VID = 'Y-rmzh0PI3c';
const tabOf = (watch) => ({ id: 7, url: watch ? `https://www.youtube.com/watch?v=${VID}` : 'https://example.org/' });
const base = (over = {}) => ({
  v: 1, ok: true, watch: true, videoId: VID, title: 'Cosmos Laundromat – First Cycle. Official Blender Foundation release.', loading: false,
  english: { captured: [], saved: [] }, arabic: null, view: { displayOffsetMs: 0, displayMode: 'ar' },
  mounted: { overlay: 'mounted', controls: 'mounted' },
  slots: [{ n: 1, filled: false, active: false, name: null }, { n: 2, filled: false, active: false, name: null }, { n: 3, filled: false, active: false, name: null }],
  capture: { state: 'none', count: 0, code: null }, tools: { overlay: 'mounted', controls: 'mounted', code: null },
  source: null, lastExport: null, available: null, ...over,
});
const EN = { key: 'en|manual', kind: 'manual', cueCount: 60, ok: true };
const JA = { key: 'ja|asr', kind: 'asr', cueCount: 212, ok: true };
const src = (key) => ({ key, lang: key.split('|')[0], kind: key.split('|')[1], via: null, from: 'captured' });
const withArabic = (lang) => base({
  english: { captured: [EN], saved: [EN] }, source: src('en|manual'),
  arabic: { fileName: `${VID}.ar.srt`, cueCount: 60, edited: true, matched: true, lang },
  view: { displayOffsetMs: 500, displayMode: 'dual' },
  slots: [{ n: 1, filled: true, active: true, name: null }, { n: 2, filled: false, active: false, name: null }, { n: 3, filled: false, active: false, name: null }],
  capture: { state: 'captured', count: 1, code: null },
});
const japanese = base({ title: '映画『風の谷』予告編', english: { captured: [JA], saved: [] }, source: src('ja|asr'), capture: { state: 'captured', count: 1, code: null } });
const LP = (pair, videos = {}) => ({ schema: 1, pair, remember: true, recent: ['ar', 'en'], videos });

/** الحالات: الاسم، والرد، والتبويب، وتفضيلات اللغات قبل الفتح، والحافظة، وفعل قبل كل لقطة، وفحص. */
const STATES = [
  { name: '1-active', reply: withArabic('ar'), langPrefs: LP({ from: 'auto', to: 'ar' }), expect: { from: 'الإنجليزية', to: 'العربية', copy: null } },
  { name: '2-target-empty', reply: japanese, langPrefs: LP({ from: 'auto', to: null }), expect: { from: 'اليابانية', to: 'اختر لغة', copy: 'true' } },
  { name: '3-picker-open', reply: japanese, langPrefs: LP({ from: 'auto', to: null }), act: () => { const f = document.querySelectorAll('.tj-popup__pair .tj-lang')[1]; if (f?.getAttribute('aria-expanded') !== 'true') f?.click(); }, expect: { from: 'اليابانية', to: 'اختر لغة', copy: 'true', picker: true } },
  { name: '4-copied', reply: japanese, langPrefs: LP({ from: 'auto', to: 'en' }), act: () => document.querySelector('[data-action="copy"]')?.click(), expect: { from: 'اليابانية', to: 'الإنجليزية', state: 'success' } },
  { name: '5-not-video', reply: null, tab: tabOf(false), langPrefs: LP({ from: 'auto', to: 'ar' }, { [VID]: { from: 'en', to: 'ar' } }), expect: { from: 'الإنجليزية', to: 'العربية', copy: 'true' } },
  { name: '6-loading', reply: base({ loading: true }), langPrefs: LP({ from: 'auto', to: 'ar' }), wait: () => !!document.querySelector('.tj-popup__pair-skel'), expect: { skeleton: true } },
  { name: '7-error', reply: { ...withArabic('ar'), mounted: { overlay: 'mounted', controls: 'error' }, tools: { overlay: 'mounted', controls: 'error', code: 'CT_MOUNT_FAILED' } }, clip: 'fail', langPrefs: LP({ from: 'auto', to: 'ar' }), act: () => document.querySelector('[data-action="copy"]')?.click(), expect: { state: 'error' } },
  { name: 'A-nothing', reply: base({ title: 'Untitled' }), langPrefs: LP({ from: 'auto', to: null }), expect: { from: 'اختر لغة', to: 'اختر لغة', copy: 'true' } },
  { name: 'D-rtl-source', reply: base({ english: { captured: [{ key: 'ar|manual', kind: 'manual', cueCount: 40, ok: true }], saved: [] }, source: src('ar|manual'), capture: { state: 'captured', count: 1, code: null } }), langPrefs: LP({ from: 'auto', to: 'en' }), expect: { from: 'العربية', to: 'الإنجليزية', copy: null } },
];

/** شيفرة تُحقن قبل تحميل النافذة: رد الصفحة والتبويب والحافظة المصنوعة. لا طلب ولا رسالة حقيقية. */
const mockSource = ({ reply, tab, clip }) => `(() => {
  const R = ${JSON.stringify(reply)}; const T = ${JSON.stringify(tab)};
  const define = (o, k, v) => { try { Object.defineProperty(o, k, { value: v, configurable: true, writable: true }); } catch { try { o[k] = v; } catch {} } };
  define(chrome.tabs, 'query', async () => [T]);
  define(chrome.tabs, 'sendMessage', async (_id, req) => (req && req.type === 'tj:get-video-state' ? (R ?? undefined) : req && req.type === 'tj:get-page-diagnostics' ? { v: 1, ok: true, sections: {} } : undefined));
  define(navigator.clipboard, 'writeText', ${clip === 'fail' ? "async () => { throw new Error('denied'); }" : 'async () => {}'});
})();`;

const front = (page) => b.conn.send('Target.activateTarget', { targetId: page.targetId });

/** صفحة إضافة بحقن قبل التحميل إن أُعطي. */
async function openExt(rest, { inject = null, width = null } = {}) {
  const page = await openTab(b.conn, 'about:blank');
  errors.push({ page: rest.split(/[?#]/)[0], ...collectErrors(page, { extId }) });
  page.on('Network.requestWillBeSent', (p) => {
    const u = p.request.url;
    if (!/^(chrome-extension|data|blob|about):/.test(u)) result.external.push(u.split('?')[0]);
  });
  await page.send('Network.enable');
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  if (width) await page.send('Emulation.setDeviceMetricsOverride', { width, height: 600, deviceScaleFactor: 1, mobile: false });
  if (inject) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: inject });
  await page.goto(`chrome-extension://${extId}/${rest}`);
  return page;
}

/** لقطة بالوضعين، وفعل قبل كل وضع (النسخ ينجح لثانيتين، فيُعاد قبل الثانية). */
async function shoot(page, name, { width = 1280, act = null } = {}) {
  await front(page);
  for (const scheme of ['light', 'dark']) {
    await emulateScheme(page, scheme);
    if (act) await page.eval(act);
    await sleep(act ? 250 : 400);
    const file = await fullScreenshot(page, path.join(OUT, `${name}-${scheme}.png`), { width });
    result.shots.push(path.basename(file)); // اسم الملف وحده: لا مسار محلي في الأدلة
  }
  await emulateScheme(page, 'light');
}

try {
  await mkdir(OUT, { recursive: true });
  b = await launch({ browser, profile: PROFILE, headless: true });
  result.browser = `${BROWSERS[browser].name} (${b.version.product})`;
  const ext = await loadExtension(b.conn, EXT);
  if (ext.error) throw new Error(`تعذّر تحميل الإضافة: ${ext.error}`);
  extId = ext.id;
  const manifest = JSON.parse(await readFile(path.join(EXT, 'manifest.json'), 'utf8'));
  result.extension = { version: manifest.version, versionName: manifest.version_name ?? null };
  console.log(`المتصفح: ${result.browser} · الإضافة ${manifest.version_name ?? manifest.version}`);

  // البذر من صفحة الإعدادات (تبقى مفتوحة لكتابة تفضيلات اللغات قبل كل حالة)، وصور المحفوظات مطفأة فلا طلب خارجي.
  const seed = buildSeedFew(Date.now()).items;
  const st0 = await openExt('pages/settings/index.html#display');
  await st0.waitFor(() => !!document.querySelector('input[data-pref="ui.thumbnails"]'), { timeoutMs: 10000 });
  await st0.eval((obj) => chrome.storage.local.set(obj), { args: [storageItems(seed)] });
  if (await st0.eval(() => document.querySelector('input[data-pref="ui.thumbnails"]')?.checked)) {
    await st0.eval(() => document.querySelector('label[for="st-ui-thumbnails"]')?.click());
    await sleep(800);
  }
  check('thumbnails-off', (await st0.eval(() => document.querySelector('input[data-pref="ui.thumbnails"]')?.checked)) === false);

  // ---- نافذة الإضافة بحالاتها ----
  for (const s of STATES) {
    await st0.eval((lp) => chrome.storage.local.set({ langPrefs: lp }), { args: [s.langPrefs] });
    const pop = await openExt('pages/popup/index.html', { inject: mockSource({ reply: s.reply, tab: s.tab ?? tabOf(true), clip: s.clip ?? 'ok' }), width: 340 });
    const ready = s.wait ?? (() => !!document.querySelector('.tj-popup__pair .tj-lang-row'));
    await pop.waitFor(ready, { timeoutMs: 8000 });
    await sleep(500);
    const before = await pop.eval(() => ({
      values: [...document.querySelectorAll('.tj-popup__pair .tj-lang__v')].map((v) => v.textContent),
      copy: document.querySelector('[data-action="copy"]')?.getAttribute('aria-disabled') ?? null,
      caption: document.querySelector('.tj-popup__pair-caption')?.textContent ?? null,
      note: document.querySelector('.tj-popup__pair-note')?.textContent ?? null,
      skeleton: !!document.querySelector('.tj-popup__pair-skel'),
      overflow: document.documentElement.scrollWidth > 340,
    }));
    await shoot(pop, `popup-${s.name}`, { width: 340, act: s.act ?? null });
    const after = await pop.eval(() => ({
      state: document.querySelector('[data-action="copy"]')?.getAttribute('data-state') ?? null,
      picker: !!document.querySelector('.tj-lang-pop:not([hidden])'),
    }));
    const e = s.expect;
    const ok = (e.from === undefined || before.values[0] === e.from) && (e.to === undefined || before.values[1] === e.to)
      && (e.copy === undefined || before.copy === e.copy) && (e.state === undefined || after.state === e.state)
      && (e.picker === undefined || after.picker === e.picker) && (e.skeleton === undefined || before.skeleton === e.skeleton) && !before.overflow;
    check(`popup-${s.name}`, ok, { ...before, ...after });
    await pop.close();
  }

  // ---- قسم «اللغات» في الإعدادات ----
  await st0.eval((lp) => chrome.storage.local.set({ langPrefs: lp }), { args: [LP({ from: 'auto', to: 'ar' })] });
  const st = await openExt('pages/settings/index.html#langs');
  await st.waitFor(() => !!document.querySelector('section[data-section="langs"] .tj-lang-row') && !/جارٍ عدّ/.test(document.querySelector('.st-lang-unknown__line')?.textContent ?? 'جارٍ عدّ'), { timeoutMs: 12000 });
  await sleep(500);
  const langs = await st.eval(() => ({
    pair: [...document.querySelectorAll('section[data-section="langs"] .tj-lang__v')].slice(0, 2).map((v) => v.textContent),
    unknown: document.querySelector('.st-lang-unknown__line')?.textContent ?? null,
    chips: [...document.querySelectorAll('.st-lang-chip')].map((c) => c.textContent),
  }));
  check('settings-langs', langs.pair[0] === 'تلقائي من مسار الفيديو' && langs.pair[1] === 'العربية' && langs.chips.length === 2, langs);
  await shoot(st, 'settings-langs');
  await st.close();

  // ---- الزوج اللغوي في المحفوظات ورأس المحرّر ----
  const lib = await openExt('pages/library/index.html');
  await lib.reload();
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length >= 3, { timeoutMs: 12000 });
  await sleep(600);
  const pairs = await lib.eval(() => [...document.querySelectorAll('.lib-row__pair')].map((p) => p.textContent));
  check('library-pairs', pairs.length >= 2 && pairs.every((p) => /←|^\p{L}/u.test(p)), pairs);
  await shoot(lib, 'library');
  await lib.close();
  const ed = await openExt(`pages/editor/index.html?v=${SEED_IDS.ted}`);
  await ed.waitFor(() => !!document.querySelector('.ed-app') && !document.querySelector('[aria-busy="true"]'), { timeoutMs: 12000 });
  await sleep(800);
  const head = await ed.eval(() => ({ pair: document.querySelector('.ed-pair')?.textContent ?? null, search: [...document.querySelectorAll('select option')].map((o) => o.textContent).filter((t) => /^في /.test(t)) }));
  check('editor-pair-search', !!head.pair && head.search.includes('في الترجمة') && head.search.some((t) => t.startsWith('في الأصل')), head);
  await shoot(ed, 'editor', { width: 1440 });
  await ed.close();
  await st0.close();

  const errs = errors.flatMap((e) => e.list.map((x) => ({ page: e.page, ...x })));
  result.errors = errs;
  check('no-external-requests', result.external.length === 0, result.external.slice(0, 5));
  check('no-extension-errors', errs.length === 0, errs.slice(0, 5));
  check('screenshots', result.shots.length === (STATES.length + 3) * 2, { n: result.shots.length });
} catch (err) {
  check('run', false, { error: String(err?.message ?? err).slice(0, 300) });
} finally {
  await b?.close();
  await writeFile(path.join(OUT, 'preview.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`النتيجة: ${result.checks.filter((c) => c.ok).length}/${result.checks.length} · اللقطات ${result.shots.length} في ${path.relative(ROOT, OUT)}`);
}
process.exit(result.checks.every((c) => c.ok) ? 0 : 1);
