// الاختبار الحي لمرحلة C7 من خطة إصلاح تدقيق 7a66f91 (صفحات الإضافة والنسخ الاحتياطي)، بلا
// نافذة، بملفات تعريف اختبار مؤقتة تُحذف بعده، وبلا بلاغ ولا حساب (قرار سلطان Q05). يبني نسخة تطوير مؤقتة خارج المستودع ويحقن
// فيها صفحة الزرع (test/live/audit-c7/page.js في tests/c7.html وtests/c7-popup.html)، ثم يقيس في صفحات الإضافة الحقيقية:
//   keys     لوحة المفاتيح في المحفوظات بأحداث حقيقية (U50، U58): «تفعيل» والتسمية بـEnter في البطاقة، و«المزيد» مفتوحة وتحديث
//            في الخلفية، وTab من البحث الفارغ، و«تراجع» بلوحة المفاتيح وثبات الرسالة والتركيز فيها، و«عرض المزيد»، و«حذف بيانات
//            الفيديو…» بحوار حقيقي. والمقياس: العنصر المركّز ليس body وله المفتاح المتوقع.
//   blur     هل يطلق المتصفح blur وfocusout على العقدة المركّزة عند فصلها (I05)، وحقل الاسم مع تحديث في الخلفية.
//   narrow   عرض 320 و360 (U86، WCAG 1.4.10): scrollWidth ≤ clientWidth في المحفوظات والإعدادات، ولقطة.
//   top      الإعدادات بلا جزء في العنوان تُفتح من أولها وعنوانها ظاهر (U57، L-1).
//   widths   الإعدادات بعروض 770 و790 و810 و830 (I09): فيض مقطّعة «وضع العرض الافتراضي»، ولقطة؛ والنافذة في أسوأ حالة بأنماطها.
//   names    أسماء الوصول من شجرة الوصول (Chromium، CDP): حوار التأكيد (U51)، ومفاتيح «العرض» (U87)، والزر المعطّل (U91)، وh1.
//   picker   منتقي «استعادة من ملف…» مع جمع القمامة قبل ملئه، عشر مرات (I03؛ Chromium وحده: لا أمر جمع في BiDi).
//   tabs     هل يكشف المتصفح عنوان تبويب يوتيوب لصفحات الإضافة (Q31) بأذونات البيان الحالية.
// الاستعمال (بإذن سلطان، وبعد إعلامه):
//   command node test/live/audit-c7/run.mjs --browser chrome|firefox|brave|edge --out <مجلد النتائج> [--shots <مجلد اللقطات>] [--scenarios keys,blur,narrow,top,widths,names,picker,tabs]
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
const SCENARIOS = String(arg('scenarios', 'keys,blur,narrow,top,widths,names,picker,tabs')).split(',');
const OUT = path.resolve(arg('out', path.join(os.tmpdir(), 'tj-c7-live-out')));
// اللقطات خارج الأدلة الملتزمة (المستودع يحفظ النتائج وحدها)، إلا إن طُلب مجلدها.
const SHOTS = path.resolve(arg('shots', path.join(os.tmpdir(), 'tj-c7-live-shots')));
const TMP = await mkdtemp(path.join(os.tmpdir(), 'tj-c7-live-'));
const TARGET = BROWSER === 'firefox' ? 'firefox' : 'chromium';
const profiles = [];
const result = { browser: BROWSER, startedAt: new Date().toISOString(), version: null, steps: {}, checks: [], measures: {}, notes: [] };
const check = (id, ok, detail = {}) => { result.checks.push({ id, ok: !!ok, ...detail }); console.log(`${ok ? '✓' : '✗'} ${id} ${JSON.stringify(detail).slice(0, 300)}`); };
const note = (n) => { result.notes.push(n); console.log(`• ${n}`); };

async function step(name, fn) {
  const t0 = Date.now();
  try {
    result.steps[name] = { ok: true, value: await fn(), ms: Date.now() - t0 };
  } catch (err) {
    result.steps[name] = { ok: false, error: String(err?.stack ?? err).slice(0, 800), ms: Date.now() - t0 };
    console.log(`✗ خطوة ${name}: ${String(err?.message ?? err).slice(0, 300)}`);
  }
}

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

async function prepare() {
  const out = path.join(TMP, `ext-${TARGET}`);
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev', '--target', TARGET, '--out', out], { cwd: ROOT, stdio: 'ignore' });
  await mkdir(path.join(out, 'tests'), { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'test/live/audit-c7/page.js')], bundle: true, format: 'iife', target: 'es2022', outfile: path.join(out, 'tests/c7.js'),
    absWorkingDir: ROOT, logLevel: 'silent', define: { __TJ_DEV__: 'false' }, plugins: [nodeStubs],
  });
  await writeFile(path.join(out, 'tests/c7.html'), '<!doctype html><meta charset="utf-8"><title>c7</title><script src="c7.js"></script>\n');
  const css = ['ui/fonts.css', 'ui/tokens.css', 'ui/base.css', 'ui/components.css', 'pages/popup/popup.css'].map((h) => `<link rel="stylesheet" href="../${h}">`).join('');
  await writeFile(path.join(out, 'tests/c7-popup.html'), `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">${css}</head><body class="tj-popup"><script src="c7.js"></script></body></html>\n`);
  return out;
}

let s;
let seeder;
const ext = await prepare();
const profile = `c7-${BROWSER}-${randomUUID().slice(0, 8)}`;
profiles.push(profile);

/** مفتاح حقيقي: Enter بمحرفه في CDP (يفعّل الزر المركّز)، والأسهم وTab وEnd وEsc. */
const KEYS = {
  Enter: { cdp: ['Enter', 'Enter', 13, '\r'], bidi: '' },
  Tab: { cdp: ['Tab', 'Tab', 9], bidi: '' },
  ArrowDown: { cdp: ['ArrowDown', 'ArrowDown', 40], bidi: '' },
  End: { cdp: ['End', 'End', 35], bidi: '' },
  Escape: { cdp: ['Escape', 'Escape', 27], bidi: '' },
};
async function press(page, k) {
  const spec = KEYS[k];
  if (s.kind === 'chromium') {
    const [key, code, keyCode, text] = spec.cdp;
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, ...(text ? { text } : {}) });
    await sleep(40);
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  } else {
    await page.key(spec.bidi);
  }
  await sleep(150);
}

/** نافذة العرض: Chromium بمحاكاة CDP، وFirefox بحجم النافذة نفسها مصحّحًا بفرق نافذة العرض (كما في C3). */
async function setViewport(page, w, h) {
  if (s.kind === 'chromium') {
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
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

async function shot(page, name) {
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot(path.join(SHOTS, `${BROWSER}-${name}.png`)).catch((e) => note(`لقطة ${name}: ${e.message}`));
}

const focusInfo = () => {
  const a = document.activeElement;
  return { tag: a?.tagName?.toLowerCase() ?? null, fk: a?.getAttribute?.('data-fk') ?? null, cls: a?.className?.baseVal ?? a?.className ?? '', role: a?.getAttribute?.('role') ?? null, body: a === document.body || a === null, label: (a?.getAttribute?.('aria-label') ?? a?.textContent ?? '').trim().slice(0, 60) };
};

async function openLibrary() {
  const lib = await s.openExt('pages/library/index.html');
  await lib.waitFor(() => document.querySelectorAll('li.lib-row').length > 0, { timeoutMs: 20000 });
  await sleep(500);
  return lib;
}
const focusSel = (page, sel) => page.eval((q) => { const n = document.querySelector(q); n?.scrollIntoView({ block: 'center' }); n?.focus(); return document.activeElement === n; }, { args: [sel] });
const touch = (id) => seeder.eval((x) => window.__c7.touch(x), { args: [id] });

try {
  s = await startBrowser(BROWSER, { profile, ext, downloadDir: path.join(TMP, 'dl') });
  result.version = s.version;
  seeder = await s.openExt('tests/c7.html');
  for (let i = 0; i < 80 && !(await seeder.eval(() => Boolean(window.__c7?.ready)).catch(() => false)); i++) await sleep(250);
  const IDS = await seeder.eval(() => window.__c7.IDS);
  const count = await seeder.eval(() => window.__c7.seed({ extra: 52 }));
  check('seed', count >= 55, { count });

  if (SCENARIOS.includes('keys')) {
    await step('keys', async () => {
      const lib = await openLibrary();
      const A = IDS.A;
      // توسيع الصف ثم «تفعيل» الخانة 2 بـEnter.
      await focusSel(lib, `[data-fk="${A}:toggle"]`);
      await press(lib, 'Enter');
      await lib.waitFor((id) => Boolean(document.querySelector(`[data-fk="${id}:card-2:activate"]`)), { args: [A], timeoutMs: 8000 });
      await focusSel(lib, `[data-fk="${A}:card-2:activate"]`);
      await press(lib, 'Enter');
      await sleep(1500);
      const f1 = await lib.eval(focusInfo);
      check('U50-activate-keeps-focus', !f1.body && f1.fk === `${A}:card-2:export`, f1);
      // التسمية بـEnter.
      await focusSel(lib, `[data-fk="${A}:card-3:rename"]`);
      await press(lib, 'Enter');
      await sleep(300);
      const typing = await lib.eval(focusInfo);
      await lib.typeText('مراجعة');
      await press(lib, 'Enter');
      await sleep(1500);
      const f2 = await lib.eval(focusInfo);
      check('U50-rename-keeps-focus', typing.tag === 'input' && !f2.body && f2.fk === `${A}:card-3:rename`, { typing, after: f2 });
      // «المزيد» مفتوحة بالسهم، ثم تحديث في الخلفية.
      await focusSel(lib, `[data-fk="${A}:more"]`);
      await press(lib, 'ArrowDown');
      const opened = await lib.eval((id) => document.querySelector(`[data-fk="${id}:more"]`).getAttribute('aria-expanded'), { args: [A] });
      await touch(IDS.B);
      await sleep(1500);
      const f3 = await lib.eval((id) => ({ ...(() => { const a = document.activeElement; return { fk: a?.getAttribute?.('data-fk') ?? null, body: a === document.body }; })(), expanded: document.querySelector(`[data-fk="${id}:more"]`)?.getAttribute('aria-expanded') }), { args: [A] });
      check('U58-menu-background-update', opened === 'true' && !f3.body && f3.fk === `${A}:more` && f3.expanded === 'false', { opened, ...f3 });
      // Tab من البحث الفارغ لا يصل إلى «مسح البحث».
      await focusSel(lib, '.lib-search__input');
      await press(lib, 'Tab');
      const f4 = await lib.eval(focusInfo);
      check('U58-clear-search-not-in-tab-order', !String(f4.cls).includes('lib-search__clear') && !f4.body, f4);
      // «تراجع» بلوحة المفاتيح: تفعيل الشريحة 1 (النشطة الآن 2)، ثم التركيز في الرسالة يوقف مهلتها، ثم Enter.
      await focusSel(lib, `[data-fk="${A}:chip-1"]`);
      await press(lib, 'Enter');
      await lib.waitFor(() => Boolean(document.querySelector('.tj-toast--action .tj-toast__action')), { timeoutMs: 8000 });
      const live = await lib.eval(() => document.querySelector('.tj-toasts')?.nextElementSibling?.textContent ?? '');
      await focusSel(lib, '.tj-toast__action');
      await sleep(7500);
      const still = await lib.eval(() => Boolean(document.querySelector('.tj-toast--action')));
      await press(lib, 'Enter');
      await sleep(1500);
      const f5 = await lib.eval(focusInfo);
      check('U58-toast-held-while-focused', still, { live: live.slice(0, 120) });
      check('U58-undo-by-keyboard-focus', !f5.body && String(f5.cls).includes('lib-chip'), f5);
      check('U58-announce-undo-hint', /للتراجع/.test(live), { live: live.slice(0, 160) });
      // «عرض المزيد».
      const before = await lib.eval(() => document.querySelectorAll('li.lib-row').length);
      await focusSel(lib, '.lib-more-rows');
      await press(lib, 'Enter');
      await sleep(800);
      const f6 = await lib.eval((n) => ({ rows: document.querySelectorAll('li.lib-row').length, isRow: document.activeElement === document.querySelectorAll('li.lib-row')[n], body: document.activeElement === document.body }), { args: [before] });
      check('U58-show-more-focus-first-new-row', f6.rows > before && f6.isRow && !f6.body, { before, ...f6 });
      // «حذف بيانات الفيديو…» بحوار حقيقي: الصف يزول والتركيز إلى الصف المجاور.
      await focusSel(lib, `[data-fk="${IDS.B}:more"]`);
      await press(lib, 'ArrowDown');
      await press(lib, 'End');
      await press(lib, 'Enter');
      await lib.waitFor(() => Boolean(document.querySelector('dialog[open]')), { timeoutMs: 8000 });
      const dlg = await lib.eval(() => {
        const d = document.querySelector('dialog[open]');
        const t = d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'));
        const ds = d.getAttribute('aria-describedby') && document.getElementById(d.getAttribute('aria-describedby'));
        return { title: t?.textContent ?? null, describes: Boolean(ds), focus: document.activeElement?.textContent?.trim() ?? null };
      });
      check('U51-dialog-labelled', Boolean(dlg.title) && dlg.describes, dlg);
      await lib.eval(() => { document.querySelector('dialog[open] button[value="confirm"]').click(); return true; });
      await sleep(2000);
      const f7 = await lib.eval((id) => ({ gone: !document.querySelector(`li[data-video="${id}"]`), ...(() => { const a = document.activeElement; return { tag: a?.tagName?.toLowerCase(), fk: a?.getAttribute?.('data-fk'), body: a === document.body }; })() }), { args: [IDS.B] });
      check('U50-delete-video-focus-neighbour-row', f7.gone && !f7.body && f7.tag === 'li', f7);
      await shot(lib, 'library-keys');
      return true;
    });
  }

  if (SCENARIOS.includes('blur')) {
    await step('blur', async () => {
      const lib = await openLibrary();
      // هل يطلق المتصفح blur عند فصل المركّز؟ (I05)
      const probe = await lib.eval(async () => {
        const box = document.createElement('div');
        const b = document.createElement('button');
        b.textContent = 'x';
        box.append(b);
        document.body.append(box);
        b.focus();
        const seen = [];
        b.addEventListener('blur', () => seen.push(`blur(connected=${b.isConnected})`));
        b.addEventListener('focusout', () => seen.push('focusout'));
        box.remove();
        seen.push('after-remove');
        await new Promise((r) => setTimeout(r, 100));
        return { seen, active: document.activeElement === document.body ? 'body' : document.activeElement?.tagName };
      });
      result.measures.blurOnDetach = probe;
      note(`blur عند الفصل في ${BROWSER}: ${probe.seen.join(' ← ')} | المركّز بعده: ${probe.active}`);
      // حقل الاسم مفتوح بلا تغيير، ثم تحديث في الخلفية يعيد بناء القائمة.
      const A = IDS.A;
      await focusSel(lib, `[data-fk="${A}:toggle"]`);
      await press(lib, 'Enter');
      await lib.waitFor((id) => Boolean(document.querySelector(`[data-fk="${id}:card-1:rename"]`)), { args: [A], timeoutMs: 8000 });
      await focusSel(lib, `[data-fk="${A}:card-1:rename"]`);
      await press(lib, 'Enter');
      await sleep(300);
      const open1 = await lib.eval((id) => document.activeElement?.getAttribute('data-fk') === `${id}:card-1:name`, { args: [A] });
      await touch(IDS.C);
      await sleep(1500);
      const after = await lib.eval((id) => ({ field: Boolean(document.querySelector(`[data-fk="${id}:card-1:name"]`)), focused: document.activeElement?.getAttribute('data-fk') === `${id}:card-1:name` }), { args: [A] });
      check('I05-name-field-survives-background-rebuild', open1 && after.field && after.focused, { open1, ...after });
      return probe;
    });
  }

  if (SCENARIOS.includes('narrow')) {
    await step('narrow', async () => {
      for (const [page, rel] of [['library', 'pages/library/index.html'], ['settings', 'pages/settings/index.html']]) {
        const p = await s.openExt(rel);
        await p.waitFor(() => document.readyState === 'complete', { timeoutMs: 15000 });
        for (const w of [320, 360]) {
          await setViewport(p, w, 800);
          await sleep(400);
          const m = await p.eval(() => {
            const se = document.scrollingElement;
            const bar = document.querySelector('.tj-topbar__inner');
            return { vw: innerWidth, scrollW: se.scrollWidth, clientW: se.clientWidth, topbarH: Math.round(bar?.getBoundingClientRect().height ?? 0), barScrollW: bar?.scrollWidth ?? null, barClientW: bar?.clientWidth ?? null };
          });
          result.measures[`narrow-${page}-${w}`] = m;
          // نافذة Firefox لا تصغر تحت 500 (كما في C3): العرض لا يُبلغ، فلا يُقاس ولا يوصف بالناجح.
          if (m.vw !== w) {
            note(`U86: عرض ${w} لم يُبلغ في ${BROWSER} (نافذة العرض ${m.vw})، فلم يُقس ${page}`);
            continue;
          }
          check(`U86-${page}-${w}-no-horizontal-scroll`, m.scrollW <= m.clientW, m);
          await shot(p, `${page}-${w}`);
        }
      }
      return true;
    });
  }

  if (SCENARIOS.includes('top')) {
    await step('top', async () => {
      const p = await s.openExt('pages/settings/index.html');
      await setViewport(p, 1360, 760);
      await p.waitFor(() => document.readyState === 'complete' && Boolean(document.querySelector('h1')), { timeoutMs: 15000 });
      await sleep(1200);
      const m = await p.eval(() => {
        const h1 = document.querySelector('h1').getBoundingClientRect();
        const bar = document.querySelector('.tj-topbar').getBoundingClientRect();
        return { scrollY: Math.round(scrollY), hash: location.hash, h1Top: Math.round(h1.top), barBottom: Math.round(bar.bottom), h1Visible: h1.top >= bar.bottom - 1 };
      });
      result.measures.settingsTop = m;
      check('U57-settings-opens-at-top', m.scrollY === 0 && m.hash === '' && m.h1Visible, m);
      await shot(p, 'settings-top');
      return m;
    });
  }

  if (SCENARIOS.includes('widths')) {
    await step('widths', async () => {
      const p = await s.openExt('pages/settings/index.html');
      await p.waitFor(() => document.readyState === 'complete', { timeoutMs: 15000 });
      for (const w of [770, 790, 810, 830]) {
        await setViewport(p, w, 900);
        await sleep(500);
        const m = await p.eval(() => {
          const seg = document.querySelector('#display .tj-seg');
          const labels = [...(seg?.querySelectorAll('.tj-seg__label') ?? [])];
          const segR = seg?.getBoundingClientRect();
          const out = labels.filter((l) => { const r = l.getBoundingClientRect(); return r.left < segR.left - 1 || r.right > segR.right + 1 || l.scrollWidth > l.clientWidth + 1; }).map((l) => l.textContent.trim());
          return { vw: innerWidth, segScrollW: seg?.scrollWidth, segClientW: seg?.clientWidth, overflowing: out, pageScrollW: document.scrollingElement.scrollWidth, pageClientW: document.scrollingElement.clientWidth };
        });
        result.measures[`settings-${w}`] = m;
        check(`I09-settings-${w}-segmented-fits`, m.overflowing.length === 0 && m.segScrollW <= m.segClientW + 1 && m.pageScrollW <= m.pageClientW, m);
        await shot(p, `settings-${w}`);
      }
      const pop = await s.openExt('tests/c7-popup.html');
      await pop.waitFor(() => Boolean(document.querySelector('.tj-popup__nav')), { timeoutMs: 10000 });
      await pop.eval(() => document.fonts.ready.then(() => true));
      await setViewport(pop, 340, 600);
      await sleep(500);
      const pm = await pop.eval(() => ({ vh: innerHeight, docH: document.documentElement.scrollHeight, navBottom: Math.round(document.querySelector('.tj-popup__nav').getBoundingClientRect().bottom), cardH: Math.round(document.querySelector('.tj-popup__card').getBoundingClientRect().height) }));
      result.measures.popupWorst = pm;
      note(`النافذة في أسوأ حالة (I09): ارتفاع المستند ${pm.docH}px (حد المتصفح 600)، وأسفل التذييل ${pm.navBottom}px، والبطاقة ${pm.cardH}px`);
      check('I09-popup-footer-visible-at-600', pm.navBottom <= pm.vh + 1, pm);
      await shot(pop, 'popup-worst');
      return pm;
    });
  }

  if (SCENARIOS.includes('names') && s.kind === 'chromium') {
    await step('names', async () => {
      const axName = async (page, selector) => {
        const { root } = await page.send('DOM.getDocument', { depth: 0 });
        const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
        if (!nodeId) return null;
        await page.send('Accessibility.enable').catch(() => {});
        const { nodes } = await page.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
        const n = nodes[0];
        return { role: n?.role?.value ?? null, name: n?.name?.value ?? null, description: n?.description?.value ?? null };
      };
      const st = await s.openExt('pages/settings/index.html');
      await st.waitFor(() => document.querySelectorAll('[role="switch"]').length >= 3, { timeoutMs: 15000 });
      for (const key of ['panelOpen', 'panelEntry', 'thumbnails']) {
        const n = await axName(st, `#st-ui-${key}`);
        check(`U87-switch-${key}-name-starts-with-row`, Boolean(n?.name) && n.name.length > 12 && /^(لوحة النص المتزامن|زر النص المتزامن|صور الفيديو في المحفوظات)/.test(n.name), n);
      }
      await seeder.eval(() => window.__c7.disabledButton());
      const d = await axName(seeder, '#c7-disabled');
      check('U91-disabled-reason-not-in-name', d?.name === 'حفظ' && /لا تغييرات للحفظ/.test(d?.description ?? ''), d);
      const pop = await s.openExt('pages/popup/index.html');
      await pop.waitFor(() => Boolean(document.querySelector('h1')), { timeoutMs: 10000 });
      check('U92-popup-has-h1', await pop.eval(() => document.querySelectorAll('h1').length === 1 && document.querySelector('h1').textContent === 'ترجمان'));
      const lib = await openLibrary();
      await lib.eval(() => { document.querySelector('.lib-more').click(); return true; });
      const grp = await axName(lib, '.tj-menu__list [role="group"]');
      check('U58-menu-export-group-named', grp?.role === 'group' && grp?.name === 'تصدير', grp);
      return true;
    });
  } else if (SCENARIOS.includes('names')) note('أسماء الوصول من شجرة الوصول في Chromium وحده (CDP)؛ وفي Firefox لم تُقرأ.');

  if (SCENARIOS.includes('picker')) {
    await step('picker', async () => {
      if (s.kind !== 'chromium') {
        note('I03: لا أمر لجمع القمامة في WebDriver BiDi، فلم يُختبر المنتقي مع gc() في Firefox.');
        return null;
      }
      const text = await seeder.eval(() => window.__c7.backupText());
      const file = path.join(TMP, 'c7-backup.json');
      await writeFile(file, text);
      const st = await s.openExt('pages/settings/index.html#data');
      await st.waitFor(() => Boolean([...document.querySelectorAll('button')].find((b) => b.textContent.includes('استعادة من ملف'))), { timeoutMs: 15000 });
      await st.send('HeapProfiler.enable').catch(() => {});
      let ok = 0;
      for (let i = 0; i < 10; i++) {
        await st.send('Page.setInterceptFileChooserDialog', { enabled: true });
        const opened = s.kind === 'chromium' ? st.conn.waitFor('Page.fileChooserOpened', () => true, { sessionId: st.sessionId, timeoutMs: 15000 }) : null;
        // نقرة حقيقية: المنتقي لا يُفتح بلا فعل مستخدم.
        const c = await st.eval(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('استعادة من ملف')); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; });
        await st.click(c.x, c.y);
        const { backendNodeId } = await opened;
        await st.send('HeapProfiler.collectGarbage');
        await sleep(300);
        await st.send('HeapProfiler.collectGarbage');
        await st.send('DOM.setFileInputFiles', { files: [file], backendNodeId });
        await st.send('Page.setInterceptFileChooserDialog', { enabled: false });
        const shown = await st.waitFor(() => Boolean(document.querySelector('dialog[open]')), { timeoutMs: 8000 }).then(() => true, () => false);
        if (shown) ok++;
        await st.eval(() => { document.querySelector('dialog[open] button[value="cancel"]')?.click(); return true; });
        await sleep(400);
      }
      check('I03-file-picker-survives-gc-10x', ok === 10, { ok });
      return ok;
    });
  }

  if (SCENARIOS.includes('tabs')) {
    await step('tabs', async () => {
      const yt = await s.youtube('https://www.youtube.com/?hl=ar').catch((e) => { note(`فتح يوتيوب: ${e.message}`); return null; });
      await sleep(4000);
      const seen = await seeder.eval(async () => {
        const api = globalThis.browser ?? globalThis.chrome;
        const tabs = await api.tabs.query({});
        const y = tabs.filter((t) => /youtube/.test(String(t.url ?? t.pendingUrl ?? '')) || /YouTube/.test(String(t.title ?? '')));
        return { total: tabs.length, withUrl: tabs.filter((t) => typeof t.url === 'string' && t.url !== '').length, youtubeVisible: y.length, sample: tabs.map((t) => (t.url ? new URL(t.url).protocol : 'لا عنوان')) };
      });
      result.measures.tabsUrl = seen;
      note(`Q31: tabs.query من صفحة إضافة — تبويبات ${seen.total}، بعنوان مكشوف ${seen.withUrl}، ويوتيوب مكشوف ${seen.youtubeVisible} (${seen.sample.join('، ')})`);
      void yt;
      return seen;
    });
  }

  const errs = s.errors();
  const extErrors = errs.flatMap((e) => e.errors);
  check('no-extension-errors', extErrors.length === 0, { errors: extErrors.slice(0, 5) });
} catch (err) {
  check('run-completed', false, { error: String(err?.stack ?? err).slice(0, 600) });
} finally {
  if (s) await s.close().catch(() => {});
  await rm(TMP, { recursive: true, force: true }).catch(() => {});
  for (const p of profiles) await rm(path.join(PROFILE_ROOT, p), { recursive: true, force: true }).catch(() => {});
}

const pass = result.checks.filter((c) => c.ok).length;
result.summary = `${pass}/${result.checks.length}`;
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, `${BROWSER}.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(`\n${BROWSER} (${result.version}): ${result.summary}`);
process.exit(pass === result.checks.length ? 0 : 1);
