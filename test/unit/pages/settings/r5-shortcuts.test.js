// الفكرة ١٠، المسار (ب) (ح-55): صف «اختصارات لوحة المفاتيح» في قسم «العرض» بعد «زر النص المتزامن»: سطر بما تفعله الأوامر الخمسة وأنها
// بلا مفاتيح حتى يربطها المستخدم في صفحة اختصارات متصفحه. في Chromium زر «فتح صفحة الاختصارات» يفتح chrome://extensions/shortcuts
// بـtabs.create (بلا إذن)، وإن رفض المتصفح فتحها قيل ذلك وكُتب العنوان معزولًا ليُكتب في شريط العنوان. وفي Firefox لا تفتح إضافةٌ
// about:addons، فالنص يقول الطريق إليها بلا زر. لا تخزين ولا إذن.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from '../../../../src/core/store/index.js';
import { FIREFOX_ADDONS, SHORTCUTS_URL, openShortcuts } from '../../../../src/pages/settings/shortcuts.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

async function mount(env = {}) {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });
  const doc = newDocument();
  const settings = createSettings({
    store, doc, version: '2.2.0', clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (id) => clearTimeout(id), ...env,
  });
  doc.body.append(settings.root);
  await settings.load();
  await settle(5);
  const before = JSON.stringify(await area.get(null));
  return { settings, doc, area, before };
}

const display = (m) => m.settings.root.querySelector('#display');
const rowOf = (m) => findAll(display(m), (e) => e.getAttribute?.('data-row') === 'shortcuts')[0] ?? null;
const openBtn = (m) => findAll(display(m), (e) => e.tagName === 'button' && e.getAttribute('data-action') === 'shortcuts')[0] ?? null;
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
/** العنوان عنصر bdi ذري معزول LTR يلتف داخله (ltrNodes)، بعلامتي عزله كما في r4-ltr.test.js. */
const isolated = (node, value) => findAll(node, (e) => e.tagName === 'bdi').some((e) => e.dir === 'ltr' && e.classList.contains('tj-ltr--wrap') && e.textContent === `${LRI}${value}${PDI}`);

test('الصف في «العرض» بعد «زر النص المتزامن» وقبل صور المحفوظات، بالأوامر الخمسة وأنها بلا مفاتيح', async () => {
  const m = await mount({ shortcuts: { target: 'chromium', open: async () => {} } });
  const rows = findAll(display(m), (e) => String(e.className) === 'st-row');
  const i = rows.indexOf(rowOf(m));
  assert.ok(i > 0, 'الصف في قسم العرض');
  assert.match(textOf(rows[i - 1]), /زر النص المتزامن/);
  assert.match(textOf(rows[i + 1]), /صور الفيديو في المحفوظات/);
  const text = textOf(rowOf(m));
  assert.match(text, /اختصارات لوحة المفاتيح/);
  assert.match(text, /مطفأة حتى تربطها/);
  for (const what of ['تبديل وضع العرض', 'تقديم الترجمة وتأخيرها', 'تعليم الجملة الظاهرة للمراجعة', 'إعادة الجملة', 'صفحة اختصارات متصفحك']) assert.match(text, new RegExp(what), what);
});

test('Chromium: الزر يفتح صفحة اختصارات المتصفح بـtabs.create، ولا يكتب في التخزين', async () => {
  const opened = [];
  const m = await mount({ shortcuts: { target: 'chromium', open: async () => { opened.push(SHORTCUTS_URL); } } });
  const b = openBtn(m);
  assert.ok(b, 'زر ظاهر');
  assert.equal(textOf(b), 'فتح صفحة الاختصارات');
  b.dispatchEvent({ type: 'click' });
  await settle(5);
  assert.deepEqual(opened, ['chrome://extensions/shortcuts']);
  assert.doesNotMatch(textOf(rowOf(m)), /تعذّر فتحها/);
  assert.equal(JSON.stringify(await m.area.get(null)), m.before, 'لا تخزين');
  // openShortcuts نفسها: tabs.create بالعنوان وحده.
  const created = [];
  await openShortcuts({ create: async (o) => { created.push(o); return { id: 1 }; } });
  assert.deepEqual(created, [{ url: 'chrome://extensions/shortcuts' }]);
});

test('Chromium: إن رفض المتصفح فتحها يُقال ذلك ويُكتب العنوان عنصرًا معزولًا LTR', async () => {
  const m = await mount({ shortcuts: { target: 'chromium', open: async () => { throw new Error('Cannot navigate'); } } });
  openBtn(m).dispatchEvent({ type: 'click' });
  await settle(5);
  const text = textOf(rowOf(m));
  assert.match(text, /تعذّر فتحها من هنا/);
  assert.ok(isolated(rowOf(m), SHORTCUTS_URL), 'العنوان عنصر ذري معزول');
  await assert.rejects(openShortcuts(undefined));
});

test('Firefox: لا زر، ونص يقول الطريق من صفحة الإضافات بعنوانها معزولًا', async () => {
  const m = await mount({ shortcuts: { target: 'firefox', open: async () => { throw new Error('unused'); } } });
  assert.equal(openBtn(m), null);
  const text = textOf(rowOf(m));
  assert.match(text, /في Firefox/);
  assert.match(text, /«إدارة اختصارات الإضافات»/);
  assert.ok(isolated(rowOf(m), FIREFOX_ADDONS), 'about:addons عنصر ذري معزول');
  assert.equal(FIREFOX_ADDONS, 'about:addons');
});

test('الفحص الثابت: عنوان صفحة الاختصارات مسموح في ملفه وحده وبعينه، لا في ملف آخر ولا عنوانًا داخليًا آخر', async () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tj-r5-shortcuts-'));
  try {
    await cp(path.join(ROOT, 'src'), dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}fonts${path.sep}`) });
    const append = async (rel, text) => { const f = path.join(dir, rel); await writeFile(f, `${await readFile(f, 'utf8')}\n${text}\n`); };
    await append('pages/settings/view.js', "export const x = 'chrome://extensions/shortcuts';");
    await append('pages/settings/shortcuts.js', "export const y = 'chrome://settings/clearBrowserData';");
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-static.mjs'), '--src', dir], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /pages\/settings\/view\.js:\d+: نطاق خارجي \/\/extensions\/shortcuts/);
    assert.match(r.stderr, /pages\/settings\/shortcuts\.js:\d+: نطاق خارجي \/\/settings\/clearBrowserData/);
    assert.doesNotMatch(r.stderr, /pages\/settings\/shortcuts\.js:\d+: نطاق خارجي \/\/extensions\/shortcuts/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
