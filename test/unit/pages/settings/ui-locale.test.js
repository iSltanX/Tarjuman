// خيار «لغة الواجهة» في الإعدادات: مقطّعة بخيارين حصريين («العربية» و«English» بصيغتيهما في اللغتين) أعلى «العرض»، قيمتها من
// store.getUiLocale() وكتابتها عبر store.setUiLocale وحده، لا في settings ولا prefs ولا langPrefs ولا النسخة الاحتياطية، ولا يمسّها
// «استعادة الافتراضي»، وفشل الكتابة يعيد القيمة السابقة بخطأ ظاهر. ثم الإعدادات بـsetLocale('en') بلا حرف عربي خارج البيانات والأسماء المعزولة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { setLocale } from '../../../../src/i18n/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const AR_NAME = 'العربية';
const EN_NAME = 'English';
const ARABIC = /[؀-ۿ]/;

async function mount({ prefsIn, settingsIn, uiLocale, env = {}, storeWrap } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const base = createStore({ area, now: () => (t += 1000) });
  if (settingsIn) await base.setSettings(settingsIn);
  if (prefsIn) await base.setPrefs(prefsIn);
  if (uiLocale) await base.setUiLocale(uiLocale);
  await area.flush();
  const store = storeWrap ? storeWrap(base) : base;
  const doc = newDocument();
  const settings = createSettings({
    store, doc, version: '2.0.0',
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    setTimer: () => 0, clearTimer: () => {},
    nav: { get: () => 'display', set: () => {}, onChange: () => () => {} },
    ...env,
  });
  doc.body.append(settings.root);
  await settings.load();
  await settle(20);
  return { settings, store: base, area, doc, root: settings.root, display: settings.root.querySelector('section[data-section="display"]') };
}

const seg = (m) => m.display.querySelector('.st-ui-locale');
const radios = (m) => findAll(seg(m), (e) => e.tagName === 'input');
const choose = (input) => { input.checked = true; input.dispatchEvent({ type: 'change' }); };
const allData = (area) => area.get(null);

test('الخيار أول صف في «العرض» بعنوان «لغة الواجهة» وخيارين حصريين: العربية وEnglish', async () => {
  const m = await mount();
  const first = findAll(m.display, (e) => e.classList.contains('st-row'))[0];
  assert.equal(textOf(first.querySelector('.tj-label')), 'لغة الواجهة');
  assert.equal(seg(m).getAttribute('data-tj-keep'), 'ui-locale', 'يعود التركيز إليه بعد إعادة التحميل');
  const options = radios(m);
  assert.deepEqual(options.map((r) => r.getAttribute('value')), ['ar', 'en'], 'لا «تلقائي» ولا غيره');
  assert.deepEqual(findAll(seg(m), (e) => e.classList.contains('tj-seg__label')).map(textOf), [AR_NAME, EN_NAME]);
  assert.deepEqual(findAll(seg(m), (e) => e.tagName === 'bdi').map((b) => b.dir), ['rtl', 'ltr'], 'اتجاه كل اسم معزول');
  assert.equal(options[0].checked, true, 'العربية هي المحفوظة/الحالية');
});

test('القيمة من store.getUiLocale()، لا من لغة الصفحة وحدها', async () => {
  const m = await mount({ uiLocale: 'en' });
  assert.equal(radios(m)[1].checked, true);
  assert.equal(radios(m)[0].checked, false);
});

test('الاختيار يستدعي setUiLocale وحده: لا شيء في settings ولا prefs ولا langPrefs، ولا يغيّر «من/إلى»', async () => {
  const calls = [];
  const m = await mount({ storeWrap: (s) => new Proxy(s, { get: (o, k) => (k === 'setUiLocale' ? (v) => { calls.push(v); return o.setUiLocale(v); } : o[k]) }) });
  const before = { settings: await m.store.getSettings(), prefs: await m.store.getPrefs(), langPrefs: await m.store.getLangPrefs() };
  choose(radios(m)[1]);
  await settle(20);
  assert.deepEqual(calls, ['en']);
  assert.equal((await m.store.getUiLocale()).locale, 'en');
  assert.deepEqual(await m.store.getSettings(), before.settings);
  assert.deepEqual(await m.store.getPrefs(), before.prefs);
  assert.deepEqual(await m.store.getLangPrefs(), before.langPrefs);
  const data = await allData(m.area);
  for (const key of ['settings', 'prefs', 'langPrefs']) {
    if (key in data) assert.equal(JSON.stringify(data[key]).includes('"locale":"en"'), false, `${key} بلا لغة واجهة`);
  }
  // الصفحة لا تعيد الرسم بيدها: إعادة التحميل من startPage عبر watchLocale، فالمقطّعة تبقى على اختيارها.
  assert.equal(radios(m)[1].checked, true);
});

test('إعادة اختيار القيمة نفسها لا تكتب', async () => {
  const calls = [];
  const m = await mount({ storeWrap: (s) => new Proxy(s, { get: (o, k) => (k === 'setUiLocale' ? (v) => { calls.push(v); return o.setUiLocale(v); } : o[k]) }) });
  choose(radios(m)[0]);
  await settle();
  assert.deepEqual(calls, []);
});

test('«استعادة الافتراضي» في «العرض» لا تمسّ لغة الواجهة', async () => {
  const m = await mount({ uiLocale: 'en', settingsIn: { displayModeDefault: 'dual', appearance: { font: 'tajawal' } } });
  const reset = buttonNamed(m.display, 'استعادة الافتراضي');
  assert.ok(reset && reset.getAttribute('aria-disabled') !== 'true', 'الزر مفعّل لأن العرض غير افتراضي');
  reset.click();
  await settle(20);
  assert.equal((await m.store.getSettings()).displayModeDefault, 'ar', 'استُعيد العرض');
  assert.equal((await m.store.getUiLocale()).locale, 'en', 'بقيت لغة الواجهة');
  assert.equal(radios(m)[1].checked, true);
});

test('فشل الكتابة: خطأ ظاهر وتعود المقطّعة إلى القيمة السابقة بلا onChange ثانٍ', async () => {
  let writes = 0;
  const m = await mount({
    storeWrap: (s) => new Proxy(s, { get: (o, k) => (k === 'setUiLocale' ? async () => { writes += 1; throw new Error('تعذّرت الكتابة'); } : o[k]) }),
  });
  choose(radios(m)[1]);
  await settle(20);
  assert.equal(writes, 1, 'محاولة واحدة، ولا onChange من إعادة القيمة');
  assert.equal(radios(m)[0].checked, true, 'عادت العربية');
  assert.equal(radios(m)[1].checked, false);
  const row = findAll(m.display, (e) => e.classList.contains('st-row'))[0];
  assert.ok(textOf(row).includes(messageFor('PG_SAVE_FAILED')), 'الخطأ بجوار الخيار');
  assert.equal((await m.store.getUiLocale())?.locale ?? null, null, 'لم يُكتب شيء');
});

test('الحقول التي يكتب فيها المستخدم نصًا عابرًا تحمل data-tj-keep: المصطلح ومقابله وملاحظته، ووصف البلاغ', async () => {
  const m = await mount();
  const kept = findAll(m.root, (e) => e.getAttribute('data-tj-keep') !== null).map((e) => e.getAttribute('data-tj-keep'));
  for (const k of ['ui-locale', 'settings.glossary.source', 'settings.glossary.target', 'settings.glossary.note', 'settings.report.text', 'settings.subfolder']) {
    assert.ok(kept.includes(k), k);
  }
});

test('اللغة الإنجليزية: كل الإعدادات بلا حرف عربي خارج أسماء اللغات المعزولة والبيانات، ولكل قسم عنوانه الإنجليزي', async () => {
  setLocale('en');
  try {
    const m = await mount();
    const titles = findAll(m.root, (e) => e.tagName === 'h2').map(textOf);
    assert.deepEqual(titles, ['Display', 'Languages', 'Export', 'Compare and review', 'Glossary', 'Storage', 'Backup', 'Diagnostics', 'About']);
    assert.equal(textOf(findAll(m.root, (e) => e.tagName === 'h1')[0]), 'Settings');
    // كل الأقسام مرسومة في الشجرة (المخفي منها بـhidden)، فيُفحص نصها كله.
    const text = textOf(m.root).replaceAll(AR_NAME, '').replaceAll(EN_NAME, '');
    assert.deepEqual(text.match(new RegExp(`.{0,20}${ARABIC.source}+.{0,20}`, 'g')) ?? [], [], 'حرف عربي في واجهة الإعدادات الإنجليزية');
    const attrs = findAll(m.root, () => true).flatMap((e) => ['aria-label', 'title', 'placeholder'].map((a) => e.getAttribute?.(a) ?? '')).join('\n');
    assert.deepEqual(attrs.replaceAll(AR_NAME, '').match(ARABIC) ?? [], [], 'حرف عربي في خصائص الوصول');
    const label = findAll(m.root, (e) => e.classList.contains('st-row'))[0].querySelector('.tj-label');
    assert.equal(textOf(label), 'Interface language');
    assert.deepEqual(findAll(seg(m), (e) => e.classList.contains('tj-seg__label')).map(textOf), [AR_NAME, EN_NAME], 'الاسمان بصيغتيهما في اللغتين');
    // معاينة الترجمة: سطرها بلغة الواجهة واتجاهها.
    const line = findAll(m.root, (e) => e.classList.contains('st-preview__line'))[0];
    assert.equal(line.getAttribute('dir'), 'ltr');
    assert.equal(line.getAttribute('lang'), 'en');
  } finally {
    setLocale('ar');
  }
});

test('اللغة الإنجليزية: كلمة تأكيد المسح، والتواريخ والعدّ، تتبع اللغة', async () => {
  setLocale('en');
  try {
    const m = await mount();
    const { confirmWordOk } = await import('../../../../src/pages/settings/model.js');
    assert.equal(confirmWordOk('clear'), true);
    assert.equal(confirmWordOk(' Clear '), true);
    assert.equal(confirmWordOk('امسح'), false);
    assert.ok(textOf(m.root).includes('No saved translations yet.'));
  } finally {
    setLocale('ar');
  }
});
