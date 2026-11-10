// مفاتيح الواجهة في «العرض» (product-spec §٦.٦): «زر النص المتزامن» في شريط المشغّل (prefs.ui.panelEntry)، وحده للوحة (ح4،
// 2026-11-10: حُذف مفتاح «مفتوحة في صفحات الفيديو» المكرر لزرها، وقيمة panelOpen المحفوظة كما هي)، و«صور الفيديو في المحفوظات» (prefs.ui.thumbnails). يقرآن التفضيلات ويكتبانها فورًا بعلامة «حُفظ» دون المساس بغيرهما، ويعود المفتاح إلى المحفوظ عند
// فشل الكتابة، ويتبعان تغيّر التفضيلات من سياق آخر (نافذة الأيقونة أو قائمة اللوحة)؛ ونص «حول» صادق في شأن الصور.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { DEFAULT_PREFS } from '../../../../src/core/model/prefs.js';
import { createStore } from '../../../../src/core/store/index.js';
import { privacyLine } from '../../../../src/pages/settings/about.js';
import { ENTRY_SWITCH, THUMBNAILS_SWITCH, createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

async function mount({ prefs, env = {} } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  if (prefs) await store.setPrefs(prefs);
  await area.flush();
  const doc = newDocument();
  const timers = [];
  const settings = createSettings({
    store, doc, version: '0.2.0',
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
    ...env,
  });
  doc.body.append(settings.root);
  await settings.load();
  return { settings, store, area, doc, root: settings.root, timers };
}

const section = (m, title) => findAll(m.root, (e) => e.tagName === 'section' && textOf(e.querySelector('h2') ?? { textContent: '' }) === title)[0];
const sw = (m, pref) => findAll(m.root, (e) => e.tagName === 'input' && e.getAttribute('data-pref') === pref)[0];
const rowOf = (m, label) => findAll(m.root, (e) => e.classList.contains('st-row') && textOf(e.querySelector('.tj-label')) === label)[0];
const toggle = (input, on) => { input.checked = on; input.dispatchEvent({ type: 'change' }); };
const marks = (root) => findAll(root, (e) => e.classList.contains('tj-saved')).map(textOf).filter(Boolean);

test('العرض يحوي مفتاحين بتسميتيهما وشرحيهما: «زر النص المتزامن» و«صور الفيديو في المحفوظات»', async () => {
  const m = await mount();
  const display = section(m, 'العرض');
  const entry = rowOf(m, 'زر النص المتزامن');
  const thumbs = rowOf(m, 'صور الفيديو في المحفوظات');
  assert.ok(entry && thumbs, 'الصفان في «العرض»');
  assert.ok(display.contains(entry) && display.contains(thumbs));
  assert.equal(ENTRY_SWITCH.text, 'يظهر في صفحات الفيديو');
  assert.ok(textOf(entry).includes('في شريط المشغّل'));
  assert.ok(textOf(entry).includes('يظهر في صفحات الفيديو'));
  assert.ok(textOf(entry).includes('اللوحة مغلقة افتراضيًا، وزرها يفتحها ويغلقها وتبقى على آخر حال في كل الفيديوهات. وإطفاء هذا المفتاح يخفي الزر ويغلق اللوحة معه، وتعيده من هنا أو من نافذة الإضافة.'));
  assert.ok(textOf(thumbs).includes('i.ytimg.com'));
  assert.ok(textOf(thumbs).includes('بمعرّف الفيديو'));
  assert.ok(textOf(thumbs).includes('أطفئها إن لم ترد هذا الاتصال'));
  assert.ok(THUMBNAILS_SWITCH.note.includes('خوادم يوتيوب'));
  for (const input of [sw(m, 'ui.panelEntry'), sw(m, 'ui.thumbnails')]) {
    assert.equal(input.getAttribute('role'), 'switch');
    assert.equal(findAll(m.root, (e) => e.tagName === 'label' && e.getAttribute('for') === input.id).length, 1, 'لكل مفتاح تسمية مربوطة');
  }
});

test('ح4: مفتاح واحد للوحة في الإعدادات («زر النص المتزامن»)، ولا «مفتوحة في صفحات الفيديو»، وقيمة panelOpen المحفوظة كما هي', async () => {
  const m = await mount({ prefs: { ui: { panelOpen: true } } });
  assert.equal(DEFAULT_PREFS.ui.panelOpen, false, 'مغلقة افتراضيًا');
  assert.equal(sw(m, 'ui.panelOpen') ?? null, null, 'لا مفتاح لفتح اللوحة');
  assert.equal(findAll(m.root, (e) => e.tagName === 'input' && /^ui\.panel/.test(e.getAttribute('data-pref') ?? '')).length, 1);
  assert.ok(!textOf(m.root).includes('مفتوحة في صفحات الفيديو'));
  // ما كان محفوظًا يبقى (اللوحة تُفتح وتُغلق من زرها وتتذكر حالها)، وتغيير غيره من الإعدادات لا يمسه.
  toggle(sw(m, 'ui.thumbnails'), false);
  await settle();
  assert.equal((await m.store.getPrefs()).ui.panelOpen, true);
});

test('القيم الأولية من prefs.ui: مفعّلان افتراضيًا، والمحفوظ المطفأ يظهر مطفأً', async () => {
  const fresh = await mount();
  assert.equal(sw(fresh, 'ui.panelEntry').checked, true);
  assert.equal(sw(fresh, 'ui.thumbnails').checked, true);
  assert.deepEqual([DEFAULT_PREFS.ui.panelEntry, DEFAULT_PREFS.ui.thumbnails], [true, true]);
  const off = await mount({ prefs: { ui: { panelEntry: false, thumbnails: false } } });
  assert.equal(sw(off, 'ui.panelEntry').checked, false);
  assert.equal(sw(off, 'ui.thumbnails').checked, false);
});

test('«زر النص المتزامن»: الإطفاء يكتب panelEntry=false ويغلق اللوحة معه (كإخفائه من قائمتها) بعلامة «حُفظ»، ولا يمسّ غيرهما', async () => {
  const m = await mount({ prefs: { ui: { panelOpen: true, panelDual: false }, glossary: { attach: false } } });
  toggle(sw(m, 'ui.panelEntry'), false);
  await settle();
  const p = await m.store.getPrefs();
  assert.deepEqual(p.ui, { thumbnails: true, panelEntry: false, panelOpen: false, panelDual: false }, 'لا تُفتح اللوحة وحدها حين يعود الزر');
  assert.equal(p.glossary.attach, false);
  assert.deepEqual(marks(rowOf(m, 'زر النص المتزامن')), ['حُفظ']);
  toggle(sw(m, 'ui.panelEntry'), true);
  await settle();
  assert.deepEqual((await m.store.getPrefs()).ui, { thumbnails: true, panelEntry: true, panelOpen: false, panelDual: false }, 'التشغيل يعيد الزر وحده واللوحة مغلقة');
});

test('«صور الفيديو في المحفوظات»: يكتب prefs.ui.thumbnails ويبقى panelEntry على حاله', async () => {
  const m = await mount();
  toggle(sw(m, 'ui.thumbnails'), false);
  await settle();
  const p = await m.store.getPrefs();
  assert.equal(p.ui.thumbnails, false);
  assert.equal(p.ui.panelEntry, true);
  assert.deepEqual(marks(rowOf(m, 'صور الفيديو في المحفوظات')), ['حُفظ']);
  assert.equal(m.settings.prefs.ui.thumbnails, false, 'حالة الصفحة تتبع المحفوظ');
});

/** موافقة Firefox بمحاكاة: answer ما يردّه طلب الموافقة، وcalls ترتيب الاستدعاءات. */
function firefoxConsent({ granted = false, answer = true } = {}) {
  const state = { granted, calls: [] };
  return {
    state,
    thumbsConsent: {
      needed: true,
      check: async () => { state.calls.push('check'); return state.granted; },
      request: () => { state.calls.push('request'); if (answer) state.granted = true; return Promise.resolve(answer); },
    },
  };
}

test('Firefox (قرار سلطان 2026-11-04): بلا موافقة يبدو المفتاح مطفأً وإن كان التفضيل مفعّلًا، وشرحه يذكر موافقة «نشاط التصفح»', async () => {
  const c = firefoxConsent();
  const m = await mount({ env: { thumbsConsent: c.thumbsConsent } });
  assert.equal(m.settings.prefs.ui.thumbnails, true, 'التفضيل الافتراضي لم يُمسّ');
  assert.equal(sw(m, 'ui.thumbnails').checked, false, 'المعروض = المفتاح والموافقة معًا');
  const row = rowOf(m, 'صور الفيديو في المحفوظات');
  assert.ok(textOf(row).includes('وفي Firefox يطلب تفعيلها موافقتك على «نشاط التصفح»'));
  assert.ok(textOf(row).includes('أطفئها إن لم ترد هذا الاتصال') && textOf(row).includes('نشاط التصفح'), 'نسخة Firefox بالجملتين (م-024)');
  assert.deepEqual(c.state.calls, ['check'], 'قراءة بلا طلب عند الفتح');
});

test('Firefox: تفعيل المفتاح يطلب الموافقة في الضغطة نفسها، فإن مُنحت حُفظ وظهر مفعّلًا', async () => {
  const c = firefoxConsent({ answer: true });
  const m = await mount({ env: { thumbsConsent: c.thumbsConsent }, prefs: { ui: { thumbnails: false } } });
  const input = sw(m, 'ui.thumbnails');
  toggle(input, true);
  assert.deepEqual(c.state.calls, ['check', 'request'], 'الطلب متزامن داخل الضغطة قبل أي انتظار');
  await settle();
  assert.equal((await m.store.getPrefs()).ui.thumbnails, true);
  assert.equal(input.checked, true);
  assert.deepEqual(marks(rowOf(m, 'صور الفيديو في المحفوظات')), ['حُفظ']);
});

test('Firefox: رفض الموافقة يبقي المفتاح مطفأً برسالة، ولا يكتب شيئًا؛ والإطفاء يكتب بلا طلب', async () => {
  const c = firefoxConsent({ answer: false });
  const m = await mount({ env: { thumbsConsent: c.thumbsConsent }, prefs: { ui: { thumbnails: false } } });
  const input = sw(m, 'ui.thumbnails');
  const before = await m.store.getPrefs();
  toggle(input, true);
  await settle();
  assert.equal(input.checked, false);
  assert.deepEqual(marks(rowOf(m, 'صور الفيديو في المحفوظات')), [THUMBNAILS_SWITCH.refused]);
  assert.deepEqual(await m.store.getPrefs(), before, 'لا كتابة');

  const on = firefoxConsent({ granted: true });
  const m2 = await mount({ env: { thumbsConsent: on.thumbsConsent } });
  assert.equal(sw(m2, 'ui.thumbnails').checked, true, 'الموافقة الممنوحة والمفتاح المفعّل: مفعّل');
  toggle(sw(m2, 'ui.thumbnails'), false);
  await settle();
  assert.equal((await m2.store.getPrefs()).ui.thumbnails, false);
  // الإطفاء لا يطلب موافقة؛ وتغيّر التفضيلات يعيد قراءتها فقط (تدقيق 7a66f91، U02).
  assert.equal(on.state.calls.includes('request'), false, 'الإطفاء لا يطلب شيئًا');
  assert.ok(on.state.calls.every((c) => c === 'check'));
});

test('فشل الكتابة: رسالة الخطأ بجانب المفتاح ويعود إلى المحفوظ فلا يناقض التخزين', async () => {
  const m = await mount();
  m.area.failNext('set', new Error('boom'));
  const input = sw(m, 'ui.panelEntry');
  toggle(input, false);
  await settle();
  assert.equal((await m.store.getPrefs()).ui.panelEntry, true, 'لم يُكتب');
  assert.equal(input.checked, true, 'عاد المفتاح إلى المحفوظ');
  assert.deepEqual(marks(rowOf(m, 'زر النص المتزامن')), [messageFor('PG_SAVE_FAILED')]);
});

test('تغيّر التفضيلات من سياق آخر (إظهار الزر من نافذة الأيقونة، أو إخفاؤه من قائمة اللوحة) يحدّث المفتاحين', async () => {
  const m = await mount({ prefs: { ui: { panelEntry: false } } });
  assert.equal(sw(m, 'ui.panelEntry').checked, false);
  await m.store.setPrefs({ ui: { panelEntry: true, thumbnails: false } });
  await m.area.flush();
  await settle();
  assert.equal(sw(m, 'ui.panelEntry').checked, true);
  assert.equal(sw(m, 'ui.thumbnails').checked, false);
  m.settings.dispose();
});

test('«استعادة الافتراضي» في العرض لإعدادات الترجمة وحدها: لا تُعيد مفتاحي الواجهة (تفضيلات الجهاز)', async () => {
  const m = await mount({ prefs: { ui: { panelEntry: false, thumbnails: false } } });
  const reset = buttonNamed(section(m, 'العرض'), 'استعادة الافتراضي');
  assert.equal(reset.getAttribute('aria-disabled'), 'true', 'قيم الترجمة افتراضية، والمفتاحان لا يحسبان');
  await m.store.setSettings({ displayModeDefault: 'dual' });
  await m.area.flush();
  await settle();
  reset.click();
  await settle();
  const p = await m.store.getPrefs();
  assert.deepEqual([p.ui.panelEntry, p.ui.thumbnails], [false, false]);
});

test('«حول»: سطر الخصوصية صادق في شأن الصور والبلاغ — البيانات محلية، والصور من خوادم يوتيوب ما دام مفتاحها مفعّلًا، والبلاغ يرسله المستخدم بنفسه', async () => {
  const m = await mount();
  const about = textOf(section(m, 'حول'));
  assert.ok(about.includes('ترجماتك وإعداداتك تبقى في متصفحك؛ لا حسابات ولا مفتاح API.'));
  assert.ok(about.includes('ولا يتصل ترجمان بالإنترنت إلا لجلب صور الفيديو في المحفوظات من خوادم يوتيوب ما دام مفتاحها مفعّلًا، وحين ترسل أنت بنفسك بلاغًا من «الإبلاغ عن مشكلة».'));
  assert.equal(privacyLine(), 'ترجماتك وإعداداتك تبقى في متصفحك؛ لا حسابات ولا مفتاح API. ولا يتصل ترجمان بالإنترنت إلا لجلب صور الفيديو في المحفوظات من خوادم يوتيوب ما دام مفتاحها مفعّلًا، وحين ترسل أنت بنفسك بلاغًا من «الإبلاغ عن مشكلة».');
  assert.equal(about.includes('لا خادم'), false, 'خادم البلاغات موجود، فلا يُنفى الخادم');
  assert.equal(about.includes('كل شيء محلي'), false, 'لا ادّعاء مطلق');
});
