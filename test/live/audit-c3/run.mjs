// الاختبار الحي لمرحلة C3 من خطة إصلاح تدقيق 7a66f91 (المحرّر، docs/audit-7a66f91/03-plan.md)، بلا نافذة، بملفات تعريف اختبار
// مؤقتة تُحذف بعده، وبلا شبكة ولا حساب (قرار سلطان Q05). يبني نسخة تطوير مؤقتة خارج المستودع ويحقن فيها صفحة الزرع
// (test/live/audit-c3/page.js في tests/c3.html)، ثم يفتح المحرّر الحقيقي ويقيس:
//   layout    الأبعاد والتكبيرات (U16): صفوف قابلة للتحرير في القائمة، أو تمرير الصفحة حتى أول صف، نظيفًا ومع تعديل، وتراكب
//             حقلي الزمن (CLA-X8)، والفائض الأفقي (CDX-N3)، والصف المركّز داخل النافذة. التكبير بنافذة CSS ونسبة بكسل الجهاز
//             المكافئتين (لا قائمة تكبير المتصفح نفسها). ولقطة لكل حالة.
//   keys      ⌘Z بأحداث لوحة مفاتيح حقيقية: في حقل البحث (U17)، وبعد الدمج والشطر (U18).
//   replace   المسارات الثلاثة (U23 وU74): حفظ خارجي والمعاينة مفتوحة، وتغيّر ثم «استبدال هنا» فورًا، وآخر مطابقة.
//   dialogs   عودة التركيز بعد كل حوار (I04)، وTab بعد التمرير للخلف (U20)، وارتفاع حقل النص بسطرين طويلين (I08).
// --before <commit> يلتقط لقطات القياس نفسها من بناء الالتزام المعطى (قبل C3) للمقارنة.
// الاستعمال (بإذن سلطان، وبعد إعلامه):
//   command node test/live/audit-c3/run.mjs --browser chrome|firefox|brave|edge --out <مجلد> [--scenarios layout,keys,replace,dialogs] [--before 1b76c95]
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PROFILE_ROOT, sleep } from '../harness/browser.mjs';
import { startBrowser } from '../stores/driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const BROWSER = arg('browser', 'chrome');
const SCENARIOS = String(arg('scenarios', 'layout,keys,replace,dialogs')).split(',');
const BEFORE = arg('before', null);
const OUT = path.resolve(arg('out', path.join(os.tmpdir(), 'tj-c3-live-out')));
const TMP = await mkdtemp(path.join(os.tmpdir(), 'tj-c3-live-'));
const TARGET = BROWSER === 'firefox' ? 'firefox' : 'chromium';
const ID = 'C3aaaaaaaaa';
const ID_REPLACE = 'C3bbbbbbbbb';
const profiles = [];
const result = { browser: BROWSER, startedAt: new Date().toISOString(), versions: {}, steps: {}, checks: [], layout: {}, notes: [] };
const check = (id, ok, detail = {}) => { result.checks.push({ id, ok: !!ok, ...detail }); console.log(`${ok ? '✓' : '✗'} ${id} ${JSON.stringify(detail).slice(0, 300)}`); };

async function step(name, fn) {
  const t0 = Date.now();
  try {
    result.steps[name] = { ok: true, value: await fn(), ms: Date.now() - t0 };
  } catch (err) {
    result.steps[name] = { ok: false, error: String(err?.stack ?? err).slice(0, 800), ms: Date.now() - t0 };
    console.log(`✗ خطوة ${name}: ${String(err?.message ?? err).slice(0, 300)}`);
  }
}

// أدوات البيانات الاختبارية تستورد node:fs وnode:path وnode:url لعيّنات json3 وحدها: بدائل دنيا في الحزمة.
const NODE_STUBS = {
  'node:fs': 'export const readFileSync = () => { throw new Error("no fs in page"); };',
  'node:path': 'const j = (...p) => p.join("/"); export const resolve = j; export const join = j; export const dirname = (p) => p; export default { resolve: j, join: j, dirname: (p) => p };',
  'node:url': 'export const fileURLToPath = (u) => String(u);',
};
const nodeStubs = {
  name: 'node-stubs',
  setup(b) {
    b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: 'node-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'node-stub' }, (a) => ({ contents: NODE_STUBS[a.path] ?? 'export default {};', loader: 'js' }));
  },
};

/** بناء تطوير لشجرة root، ومعه صفحة الزرع الحالية مجمّعة من شجرة root نفسها. */
async function prepare(root, tag) {
  const out = path.join(TMP, `${tag}-${TARGET}`);
  execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs'), '--dev', '--target', TARGET, '--out', out], { cwd: root, stdio: 'ignore' });
  await mkdir(path.join(out, 'tests'), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'test/live/audit-c3/page.js')], bundle: true, format: 'iife', target: 'es2022', outfile: path.join(out, 'tests/c3.js'),
    absWorkingDir: root, logLevel: 'silent', define: { __TJ_DEV__: 'false' }, plugins: [nodeStubs], nodePaths: [path.join(ROOT, 'node_modules')],
  });
  await writeFile(path.join(out, 'tests/c3.html'), '<!doctype html><meta charset="utf-8"><title>c3</title><script src="c3.js"></script>\n');
  return out;
}

/** شجرة الالتزام before (قبل C3) للقطات المقارنة. */
async function baseTree(commit) {
  const dir = path.join(TMP, 'base-src');
  await mkdir(dir, { recursive: true });
  const tar = path.join(TMP, 'base.tar');
  execFileSync('git', ['archive', '--format=tar', '-o', tar, commit], { cwd: ROOT });
  execFileSync('tar', ['-xf', tar, '-C', dir]);
  await symlink(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
  return dir;
}

async function session(ext, tag) {
  const profile = `c3-${BROWSER}-${tag}-${randomUUID().slice(0, 8)}`;
  profiles.push(profile);
  const s = await startBrowser(BROWSER, { profile, ext, downloadDir: path.join(TMP, `dl-${tag}`) });
  result.versions[tag] = s.version;
  const seeder = await s.openExt('tests/c3.html');
  for (let i = 0; i < 80 && !(await seeder.eval(() => Boolean(window.__c3?.ready)).catch(() => false)); i++) await sleep(250);
  return { s, seeder };
}

/**
 * نافذة العرض بأبعاد CSS ونسبة بكسل. Chromium بمحاكاة CDP. وFirefox يرفض browsingContext.setViewport في صفحات الإضافة
 * («privileged scope»)، فتُغيَّر نافذة المتصفح نفسها ثم يُصحَّح الفرق بين النافذة ونافذة العرض، بنسبة بكسل الشاشة (1).
 */
async function setViewport(s, page, w, h, dpr = 1) {
  if (s.kind === 'chromium') {
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
    await sleep(450);
    return;
  }
  const { contexts } = await page.conn.send('browsingContext.getTree', { root: page.context, maxDepth: 0 });
  const clientWindow = contexts[0].clientWindow;
  let size = [w, h];
  for (let i = 0; i < 3; i++) {
    await page.conn.send('browser.setClientWindowState', { clientWindow, state: 'normal', width: size[0], height: size[1] });
    await sleep(500);
    const [iw, ih] = await page.eval(() => [innerWidth, innerHeight]);
    if (iw === w && ih === h) break;
    const next = [Math.max(200, size[0] + (w - iw)), Math.max(200, size[1] + (h - ih))];
    if (next[0] === size[0] && next[1] === size[1]) break;
    size = next;
  }
}

/** ⌘/Ctrl مع مفتاح بأحداث لوحة مفاتيح حقيقية (Ctrl في الاثنين: المحرّر يقبل ⌘ وCtrl معًا). */
async function combo(s, page, { key = 'z', code = 'KeyZ', keyCode = 90, shift = false } = {}) {
  if (s.kind === 'chromium') {
    const modifiers = 2 | (shift ? 8 : 0);
    await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  } else {
    const CTRL = String.fromCharCode(0xE009);
    const SHIFT = String.fromCharCode(0xE008);
    const down = [{ type: 'keyDown', value: CTRL }, ...(shift ? [{ type: 'keyDown', value: SHIFT }] : [])];
    const up = [...(shift ? [{ type: 'keyUp', value: SHIFT }] : []), { type: 'keyUp', value: CTRL }];
    await page.conn.send('input.performActions', { context: page.context, actions: [{ type: 'key', id: 'kb', actions: [...down, { type: 'keyDown', value: key }, { type: 'keyUp', value: key }, ...up] }] });
    await page.conn.send('input.releaseActions', { context: page.context });
  }
  await sleep(250);
}

async function openEditor(s, videoId) {
  const ed = await s.openExt(`pages/editor/index.html?v=${videoId}`);
  const ok = await ed.waitFor(() => Boolean(globalThis.__tarjumanEditor && document.querySelector('.ed-row[data-index]')), { timeoutMs: 20000 });
  if (!ok) throw new Error('لم يجهز المحرّر');
  await ed.eval(() => document.fonts.ready.then(() => true));
  if (s.kind === 'chromium') await ed.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  return ed;
}

// ---------------------------------------------------------------- القياس (يُقيَّم في صفحة المحرّر)

function measure() {
  const q = (sel) => document.querySelector(sel);
  const list = q('.ed-list');
  const se = document.scrollingElement;
  const unsaved = q('.ed-unsaved');
  const shown = (el) => Boolean(el) && getComputedStyle(el).display !== 'none' && !el.hidden;
  const bottom = () => {
    if (!shown(unsaved)) return innerHeight;
    const r = unsaved.getBoundingClientRect();
    return r.top < innerHeight ? Math.min(innerHeight, r.top) : innerHeight;
  };
  const rows = () => {
    const lr = list.getBoundingClientRect();
    const lim = Math.min(lr.bottom, bottom());
    const top = Math.max(lr.top, 0);
    return [...document.querySelectorAll('.ed-row[data-index]')].filter((r) => { const b = r.getBoundingClientRect(); return b.height > 0 && b.top >= top - 1 && b.bottom <= lim + 1; }).length;
  };
  se.scrollTop = 0;
  const rowsAtTop = rows();
  const head = q('.ed-list__head');
  se.scrollTop = Math.max(0, se.scrollTop + (head ?? list).getBoundingClientRect().top - 8);
  const rowsAfterScroll = rows();
  se.scrollTop = 0;
  const s0 = q('.ed-row[data-index="0"] [data-field="start"]');
  const e0 = q('.ed-row[data-index="0"] [data-field="end"]');
  const sr = s0?.getBoundingClientRect();
  const er = e0?.getBoundingClientRect();
  const ta = q('.ed-row[data-index="0"] [data-field="text"]');
  ta?.focus();
  const tr = ta?.getBoundingClientRect();
  const focusedVisible = tr ? tr.top >= -1 && tr.bottom <= bottom() + 1 : null;
  ta?.blur();
  se.scrollTop = 0;
  const optsBtn = [...document.querySelectorAll('.ed-search button')].find((b) => b.textContent.trim() === 'الخيارات');
  const ob = optsBtn?.getBoundingClientRect();
  return {
    vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
    listH: list.clientHeight, rowsAtTop, rowsAfterScroll, focusedVisible,
    pageOverflowY: Math.round(se.scrollHeight - innerHeight), pageOverflowX: Math.round(se.scrollWidth - innerWidth),
    timeOverlap: sr && er ? Math.max(0, Math.round(Math.min(sr.right, er.right) - Math.max(sr.left, er.left))) : null,
    timeFits: s0 ? s0.scrollWidth <= s0.clientWidth + 1 : null,
    optsInView: ob ? ob.left >= -1 && ob.right <= innerWidth + 1 : null,
    toolsFolded: q('.ed-scope-row') ? !shown(q('.ed-scope-row')) : null,
    sideFolded: q('.ed-side .ed-pane:not([hidden])') ? !shown(q('.ed-side .ed-pane:not([hidden])')) : null,
    foldButtons: [...document.querySelectorAll('.ed-fold')].filter(shown).map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()),
    unsavedShown: shown(unsaved),
  };
}

const makeDirty = () => {
  const ta = document.querySelector('.ed-row[data-index="2"] [data-field="text"]');
  ta.value = `${ta.value} تعديل`;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  return globalThis.__tarjumanEditor.state.session.dirty;
};
const discard = () => {
  globalThis.__tarjumanEditor.state.session.discard();
  document.scrollingElement.scrollTop = 0;
  return true;
};

const SIZES = [
  ['1440x900', 1440, 900, 1], ['1280x800', 1280, 800, 1], ['1000x800', 1000, 800, 1], ['860x768', 860, 768, 1], ['768x700', 768, 700, 1],
  ['683x650', 683, 650, 1], ['960x475', 960, 475, 1], ['683x320', 683, 320, 1], ['360x740', 360, 740, 1],
  // التكبير: نافذة CSS ونسبة البكسل المكافئتان (1366×768 بنافذة 640، و1920×1080، و1280×1024 بـ400%).
  ['z100-1366x768', 1366, 640, 1], ['z125-1366x768', 1093, 512, 1.25], ['z150-1366x768', 911, 427, 1.5], ['z200-1366x768', 683, 320, 2],
  ['z200-1920x1080', 960, 475, 2], ['z400-1280x1024', 320, 224, 4],
];
const ROW_H = 82;

async function layoutScenario(ext, tag, { judge }) {
  const { s, seeder } = await session(ext, tag);
  try {
    await seeder.eval((id) => window.__c3.seed(id, { count: 150 }), { args: [ID] });
    const ed = await openEditor(s, ID);
    const out = {};
    for (const [name, w, h, dpr] of SIZES) {
      await setViewport(s, ed, w, h, dpr);
      const clean = await ed.eval(measure);
      await ed.screenshot(path.join(OUT, 'shots', `${tag}-${BROWSER}-${name}-clean.png`));
      await ed.eval(makeDirty);
      await sleep(350);
      const dirty = await ed.eval(measure);
      await ed.screenshot(path.join(OUT, 'shots', `${tag}-${BROWSER}-${name}-dirty.png`));
      await ed.eval(discard);
      await sleep(200);
      out[name] = { clean, dirty };
      const reached = Math.abs(clean.vw - w) <= 2 && Math.abs(clean.vh - h) <= 2;
      if (!reached) result.notes.push(`${name}: لم يُختبر في ${BROWSER}؛ نافذة العرض الفعلية ${clean.vw}×${clean.vh} لا ${w}×${h} (حد نافذة المتصفح)`);
      if (judge && reached) {
        // معيار القبول: صفّان قابلان للتحرير على الأقل، أو تمرير الصفحة حتى أول صف؛ والصف المركّز داخل النافذة في الحالين.
        for (const [state, m] of [['clean', clean], ['dirty', dirty]]) {
          const two = m.listH >= 2 * ROW_H && (m.rowsAtTop >= 2 || m.rowsAfterScroll >= 2);
          const scrollToFirst = m.pageOverflowY > 0 && m.rowsAfterScroll >= 1;
          check(`u16-${name}-${state}-two-rows-or-page-scroll`, (two || scrollToFirst) && m.focusedVisible, { two, scrollToFirst, listH: m.listH, rowsAtTop: m.rowsAtTop, rowsAfterScroll: m.rowsAfterScroll, focusedVisible: m.focusedVisible, pageOverflowY: m.pageOverflowY });
        }
        check(`u16-${name}-no-time-overlap-no-page-hscroll`, clean.timeOverlap === 0 && clean.timeFits && clean.pageOverflowX <= 0 && clean.optsInView, { timeOverlap: clean.timeOverlap, timeFits: clean.timeFits, pageOverflowX: clean.pageOverflowX, optsInView: clean.optsInView });
      }
    }
    if (judge) {
      const tall = out['1440x900'].clean;
      check('u16-tall-window-unchanged', tall.pageOverflowY <= 0 && tall.toolsFolded === false && tall.sideFolded === false && tall.foldButtons.length === 0, tall);
    }
    result.layout[tag] = out;
    out.errors = s.errors();
    if (judge) check(`${tag}-no-extension-errors`, out.errors.every((e) => e.errors.length === 0), { errors: out.errors.filter((e) => e.errors.length) });
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.clean ? { clean: v.clean.listH, dirty: v.dirty.listH } : v]));
  } finally {
    await s.close();
  }
}

// ---------------------------------------------------------------- لوحة المفاتيح والاستبدال والحوارات

const S = {
  count: () => globalThis.__tarjumanEditor.state.session.count,
  text: (i) => globalThis.__tarjumanEditor.state.session.cueAt(i).text,
  active: () => {
    const a = document.activeElement;
    return a ? { tag: a.tagName.toLowerCase(), field: a.dataset?.field ?? null, row: a.closest?.('.ed-row')?.dataset.index ?? null, label: a.getAttribute('aria-label') ?? a.textContent.trim().slice(0, 40), cls: a.className } : null;
  },
};

async function keysScenario(ext) {
  const { s, seeder } = await session(ext, 'keys');
  try {
    await seeder.eval((id) => window.__c3.seed(id, { count: 40 }), { args: [ID] });
    const ed = await openEditor(s, ID);
    await setViewport(s, ed, 1440, 900);
    const out = {};
    // U17: تعديل في نص مقطع، ثم ⌘Z في حقل البحث.
    await ed.eval(() => { const t = document.querySelector('.ed-row[data-index="1"] [data-field="text"]'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return true; });
    await ed.typeText(' تعديل');
    await sleep(300);
    const edited = await ed.eval(S.text, { args: [1] });
    await ed.eval(() => { document.querySelector('input[type=search]').focus(); return true; });
    await ed.typeText('سطر');
    await sleep(300);
    for (const k of [{}, { shift: true }, { key: 'y', code: 'KeyY', keyCode: 89 }]) await combo(s, ed, k);
    out.search = { edited, after: await ed.eval(S.text, { args: [1] }), canUndo: await ed.eval(() => globalThis.__tarjumanEditor.state.session.canUndo) };
    check('u17-cmdz-in-search-leaves-cues', out.search.after === edited && out.search.canUndo, out.search);
    // U18: الدمج بزر الصف ثم ⌘Z في الحقل الذي رُكّز.
    await ed.eval(() => { globalThis.__tarjumanEditor.state.session.discard(); return true; });
    await sleep(300);
    const n0 = await ed.eval(S.count);
    await ed.eval(() => { document.querySelector('.ed-row[data-index="0"] [data-act="merge"]').click(); return true; });
    await sleep(400);
    const merged = await ed.eval(S.count);
    const focusAfterMerge = await ed.eval(S.active);
    await combo(s, ed);
    const afterUndo = await ed.eval(S.count);
    out.merge = { n0, merged, focusAfterMerge, afterUndo };
    check('u18-merge-then-cmdz-undoes', merged === n0 - 1 && focusAfterMerge?.field === 'text' && afterUndo === n0, out.merge);
    // الشطر عند المؤشر ثم ⌘Z.
    const splitAtCaret = () => {
      const t = document.querySelector('.ed-row[data-index="2"] [data-field="text"]');
      t.focus();
      t.setSelectionRange(5, 5);
      t.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      document.querySelector('.ed-row[data-index="2"] [data-act="split"]').click();
      return true;
    };
    await ed.eval(splitAtCaret);
    await sleep(400);
    const split = await ed.eval(S.count);
    await combo(s, ed);
    const afterSplitUndo = await ed.eval(S.count);
    // بعد الكتابة في الحقل المركّز: ⌘Z للحقل لا للمحرّر.
    await ed.eval(splitAtCaret);
    await sleep(400);
    const split2 = await ed.eval(S.count);
    await ed.typeText('ب');
    await sleep(200);
    await combo(s, ed);
    out.split = { n0, split, afterSplitUndo, split2, afterTypingUndo: await ed.eval(S.count) };
    check('u18-split-then-cmdz-undoes', split === n0 + 1 && afterSplitUndo === n0, out.split);
    check('u18-after-typing-cmdz-is-the-fields', out.split.split2 === n0 + 1 && out.split.afterTypingUndo === n0 + 1, out.split);
    // U19: زمن مكتوب في حقل لم يُغادَر ثم محاولة إغلاق: الحوار يعتمده (التعديل يصير في الجلسة).
    await ed.eval(() => { globalThis.__tarjumanEditor.state.session.discard(); return true; });
    await sleep(300);
    await ed.eval(() => { const f = document.querySelector('.ed-row[data-index="0"] [data-field="end"]'); f.focus(); f.select(); return true; });
    await ed.typeText('00:00:03,250');
    const prevented = await ed.eval(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return { prevented: e.defaultPrevented, dirty: globalThis.__tarjumanEditor.state.session.dirty }; });
    out.unload = prevented;
    check('u19-unload-warns-for-focused-time', prevented.prevented && prevented.dirty, prevented);
    out.errors = s.errors();
    check('keys-no-extension-errors', out.errors.every((e) => e.errors.length === 0), { errors: out.errors.filter((e) => e.errors.length) });
    return out;
  } finally {
    await s.close();
  }
}

async function replaceScenario(ext) {
  const { s, seeder } = await session(ext, 'replace');
  try {
    const out = {};
    const setup = async (texts, query, replacement) => {
      await seeder.eval((id, t) => window.__c3.seed(id, { texts: t }), { args: [ID_REPLACE, texts] });
      const ed = await openEditor(s, ID_REPLACE);
      await setViewport(s, ed, 1440, 900);
      await ed.eval((qv, rv) => {
        const search = document.querySelector('input[type=search]');
        search.value = qv;
        search.dispatchEvent(new Event('input', { bubbles: true }));
        [...document.querySelectorAll('.ed-search button')].find((b) => b.textContent.trim() === 'استبدال').click();
        const r = document.querySelector('.ed-search__replace input');
        r.value = rv;
        r.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }, { args: [query, replacement] });
      await sleep(400);
      return ed;
    };
    const here = () => { document.querySelector('.ed-search__replace button').click(); return true; };
    // ١: المعاينة مفتوحة ثم حفظ من «تبويب آخر» ثم «استبدال N».
    let ed = await setup(['عفوًا؟', 'عفوًا يا سيدي؟', 'عفوًا؟', 'أوه، بربّك.', 'ألديك لحظة يا سيدي؟'], 'عفوًا', 'معذرة');
    await ed.eval(() => { [...document.querySelectorAll('.ed-search button')].find((b) => b.textContent.trim() === 'معاينة استبدال الكل…').click(); return true; });
    await sleep(500);
    await seeder.eval((id) => window.__c3.externalSave(id, 'حسنًا، عفوًا؟'), { args: [ID_REPLACE] });
    await ed.waitFor(() => globalThis.__tarjumanEditor.state.session.cueAt(0).text === 'حسنًا، عفوًا؟', { timeoutMs: 8000 });
    await ed.eval(() => { const d = document.querySelector('dialog[open]'); [...d.querySelectorAll('button')].find((b) => b.value === 'apply').click(); return true; });
    await sleep(500);
    out.stalePreview = { c1: await ed.eval(S.text, { args: [0] }), result: await ed.eval(() => document.querySelector('.ed-result')?.textContent ?? '') };
    check('u23-stale-preview-refused', out.stalePreview.c1 === 'حسنًا، عفوًا؟' && /تغيّرت المقاطع بعد البحث/.test(out.stalePreview.result), out.stalePreview);
    await ed.close();
    // ٢: «استبدال هنا» ثم «تراجع» ثم «استبدال هنا» في المهمة نفسها (قبل مهلة إعادة البحث).
    ed = await setup(['السلام أولًا ثم السلام ثانيًا'], 'السلام', 'سلم');
    await ed.eval(here);
    await sleep(300);
    out.fast = await ed.eval(() => {
      document.querySelector('.ed-undo').click();
      document.querySelector('.ed-search__replace button').click();
      return globalThis.__tarjumanEditor.state.session.cueAt(0).text;
    });
    check('u23-replace-before-timer-hits-current-text', !/سلملام/.test(out.fast) && out.fast.includes('سلم'), { text: out.fast });
    await ed.close();
    // ٣: آخر مطابقة: أربع نقرات لا تعشّش.
    ed = await setup(['عفوًا؟', 'عفوًا يا سيدي؟', 'عفوًا؟', 'أوه، بربّك.', 'ألديك لحظة يا سيدي؟'], 'سيدي', 'سيدي الكريم');
    for (let k = 0; k < 4; k++) {
      await ed.eval(here);
      await sleep(250);
    }
    out.nest = { c2: await ed.eval(S.text, { args: [1] }), c5: await ed.eval(S.text, { args: [4] }) };
    check('u74-no-nesting', out.nest.c2 === 'عفوًا يا سيدي الكريم؟' && out.nest.c5 === 'ألديك لحظة يا سيدي الكريم؟', out.nest);
    out.errors = s.errors();
    check('replace-no-extension-errors', out.errors.every((e) => e.errors.length === 0), { errors: out.errors.filter((e) => e.errors.length) });
    return out;
  } finally {
    await s.close();
  }
}

async function dialogsScenario(ext) {
  const { s, seeder } = await session(ext, 'dialogs');
  try {
    await seeder.eval((id) => window.__c3.seed(id, { count: 150 }), { args: [ID] });
    const ed = await openEditor(s, ID);
    await setViewport(s, ed, 1440, 900);
    const out = { focus: {} };
    // I04: الفتح بلوحة المفاتيح والإغلاق بـEsc: التركيز يعود إلى المُطلِق.
    const triggers = [
      ['restore-original', () => [...document.querySelectorAll('.ed-head button')].find((b) => b.textContent.trim() === 'استعادة الأصل…')],
      ['discard', () => [...document.querySelectorAll('.ed-unsaved button')].find((b) => b.textContent.trim() === 'تجاهل التغييرات')],
      ['switch-slot', () => document.querySelectorAll('.ed-head [role=radio]')[1]],
    ];
    for (const [name] of triggers) {
      if (name === 'discard' || name === 'switch-slot') await ed.eval(makeDirty);
      await sleep(250);
      const fn = triggers.find((t) => t[0] === name)[1];
      // التركيز على المُطلِق ثم تفعيله (click كما يفعله Enter على زر مركّز)، والإغلاق بـEsc حقيقي.
      const label = await ed.eval(`(${fn.toString()})()?.focus() ?? true`).then(() => ed.eval(S.active));
      await ed.eval(`(${fn.toString()})()?.click() ?? true`);
      await sleep(400);
      const opened = await ed.eval(() => Boolean(document.querySelector('dialog[open]')));
      await ed.press('Escape');
      await sleep(400);
      const back = await ed.eval(S.active);
      out.focus[name] = { trigger: label, opened, back };
      check(`i04-${name}-focus-returns`, opened && back && back.label === label?.label && back.cls === label?.cls, out.focus[name]);
      await ed.eval(discard);
    }
    // القائمتان: «تصدير ▾ ← الترجمة SRT…» و«أدوات التوقيت ← تصحيح الانجراف…»: التركيز إلى زر القائمة.
    for (const [name, menuLabel, item] of [['export-srt', 'تصدير', 'srt'], ['timing-drift', 'أدوات التوقيت', 'drift']]) {
      await ed.eval((m) => { [...document.querySelectorAll('.tj-menu__button')].find((b) => b.textContent.trim() === m).focus(); return true; }, { args: [menuLabel] });
      const trigger = await ed.eval(S.active);
      await ed.press('Enter');
      await sleep(300);
      await ed.eval((it) => { document.querySelector(`[data-item="${it}"]`).click(); return true; }, { args: [item] });
      await sleep(500);
      const opened = await ed.eval(() => Boolean(document.querySelector('dialog[open]')));
      await ed.press('Escape');
      await sleep(400);
      const back = await ed.eval(S.active);
      out.focus[name] = { trigger, opened, back };
      check(`i04-${name}-focus-returns`, opened && back?.label === trigger?.label, out.focus[name]);
    }
    // U20: Tab من آخر عنصر في الصف 29 بعد التمرير للأسفل ثم للخلف يصل إلى الصف 30.
    await ed.eval(() => { const l = document.querySelector('.ed-list'); l.scrollTop = 3000; return true; });
    await sleep(300);
    await ed.eval(() => { const l = document.querySelector('.ed-list'); l.scrollTop = 2200; return true; });
    await sleep(300);
    out.order = await ed.eval(() => {
      const rows = [...document.querySelectorAll('.ed-list__spacer > .ed-row')].map((r) => Number(r.dataset.row));
      document.querySelector('.ed-row[data-index="29"] [data-act="split"]').focus();
      return { rows, sorted: rows.every((r, i) => !i || r > rows[i - 1]), setsize: document.querySelector('.ed-row[data-index="29"]').getAttribute('aria-setsize'), posinset: document.querySelector('.ed-row[data-index="29"]').getAttribute('aria-posinset') };
    });
    await ed.press('Tab');
    await sleep(200);
    out.order.afterTab = await ed.eval(S.active);
    check('u20-dom-order-and-tab', out.order.sorted && out.order.afterTab?.row === '30' && out.order.setsize === '150' && out.order.posinset === '30', out.order);
    // I08: سطران بنحو 40 محرفًا في عمود العربية عند 1280×800 والإنجليزي ظاهر.
    await setViewport(s, ed, 1280, 800);
    out.i08 = await ed.eval(() => {
      const ed2 = globalThis.__tarjumanEditor;
      ed2.state.session.setText(0, 'هذا سطر عربي طويل نسبيًا يقارب أربعين محرفًا\nوهذا سطر ثانٍ طويل كذلك يقارب أربعين محرفًا');
      ed2.jumpTo(0, 'text');
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const t = document.querySelector('.ed-row[data-index="0"] [data-field="text"]');
        r({ scrollHeight: t.scrollHeight, clientHeight: t.clientHeight, width: Math.round(t.getBoundingClientRect().width) });
      })));
    });
    await ed.screenshot(path.join(OUT, 'shots', `i08-${BROWSER}-1280x800.png`));
    result.notes.push(`I08 (${BROWSER}): scrollHeight=${out.i08.scrollHeight} clientHeight=${out.i08.clientHeight} عرض الحقل ${out.i08.width}`);
    check('i08-two-long-lines-fully-visible', out.i08.scrollHeight <= out.i08.clientHeight + 1, out.i08);
    out.errors = s.errors();
    check('dialogs-no-extension-errors', out.errors.every((e) => e.errors.length === 0), { errors: out.errors.filter((e) => e.errors.length) });
    return out;
  } finally {
    await s.close();
  }
}

/** تشخيص: العناصر التي تخرج عن النافذة أفقيًا في بُعد معطى (--size 320x224x4)، خارج حاوية القائمة المتمررة أفقيًا. */
async function probeScenario(ext) {
  const { s, seeder } = await session(ext, 'probe');
  try {
    await seeder.eval((id) => window.__c3.seed(id, { count: 40 }), { args: [ID] });
    const ed = await openEditor(s, ID);
    const [w, h, dpr] = String(arg('size', '320x224x4')).split('x').map(Number);
    await setViewport(s, ed, w, h, dpr || 1);
    return await ed.eval(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('.ed-main')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < -1 || r.right > innerWidth + 1)) out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className?.baseVal ?? el.className).slice(0, 60), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
      }
      return { vw: innerWidth, sw: document.scrollingElement.scrollWidth, app: Math.round(document.querySelector('.ed-app').getBoundingClientRect().width), out: out.slice(0, 40) };
    });
  } finally {
    await s.close();
  }
}

await mkdir(path.join(OUT, 'shots'), { recursive: true });
try {
  const ext = await prepare(ROOT, 'current');
  if (SCENARIOS.includes('probe')) await step('probe', async () => { const r = await probeScenario(ext); console.log(JSON.stringify(r, null, 1)); return r; });
  if (SCENARIOS.includes('layout')) await step('layout', () => layoutScenario(ext, 'after', { judge: true }));
  if (BEFORE) {
    const baseExt = await prepare(await baseTree(BEFORE), 'before');
    await step('layout-before', () => layoutScenario(baseExt, 'before', { judge: false }));
  }
  if (SCENARIOS.includes('keys')) await step('keys', () => keysScenario(ext));
  if (SCENARIOS.includes('replace')) await step('replace', () => replaceScenario(ext));
  if (SCENARIOS.includes('dialogs')) await step('dialogs', () => dialogsScenario(ext));
} finally {
  for (const p of profiles) await rm(path.join(PROFILE_ROOT, p), { recursive: true, force: true }).catch(() => {});
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  result.finishedAt = new Date().toISOString();
  result.profilesRemoved = profiles.length;
  await writeFile(path.join(OUT, `c3-${BROWSER}.json`), `${JSON.stringify(result, null, 2)}\n`);
  const bad = result.checks.filter((c) => !c.ok).map((c) => c.id);
  const failedSteps = Object.entries(result.steps).filter(([, v]) => v && v.ok === false).map(([k]) => k);
  console.log(`C3 حي (${BROWSER}): ${result.checks.length} فحصًا، فشل ${bad.length} [${bad.join('، ')}]، وخطوات متعطلة [${failedSteps.join('، ')}]`);
  process.exit(0);
}
