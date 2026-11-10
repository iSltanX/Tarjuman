// واجهة الإعدادات بـDOM وهمي فوق تخزين حقيقي بمحاكاة (P7-AC4/AC8/AC9/AC10): كل خيار يُحفظ فورًا ويظهر «حُفظ»، والمعاينة
// تتحدث فورًا، و«استعادة الخط والحجم» معطّلة عند الافتراضي، والتحقق من الحقول، والمسح بكتابة «امسح»، و«حول».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { SUBTITLE_FONT_LIST } from '../../../../src/ui/subtitle-fonts.js';
import { BROWSERS_LINE, CREDITS, LINKS, privacyLine } from '../../../../src/pages/settings/about.js';
import { createSettings, installReminder, MODE_NOTES, scaleNote, subtitleNote } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, videoRecord } from '../../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

function timers() {
  let n = 0;
  const q = new Map();
  return {
    setTimer: (fn, ms) => { q.set(++n, { fn, ms }); return n; },
    clearTimer: (id) => q.delete(id),
    runAll() { const b = [...q.values()]; q.clear(); b.forEach((t) => t.fn()); },
  };
}

async function mount({ initial, videos = 0, env = {} } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  if (initial) await store.setSettings(initial);
  for (let i = 0; i < videos; i++) await store.updateVideo(`V${String(i).padStart(10, '0')}`, () => videoRecord({ videoId: `V${String(i).padStart(10, '0')}` }));
  await area.flush();
  const doc = newDocument();
  const clock = timers();
  const calls = { clipboard: [], confirms: [] };
  const answers = [];
  const settings = createSettings({
    store, doc, version: '0.2.0',
    clipboardWrite: async (x) => { calls.clipboard.push(x); },
    diagnosticsText: async () => '{"tarjuman":"0.2.0"}',
    confirm: async (o) => { calls.confirms.push(o); const a = answers.shift(); if (typeof a === 'function') a(o); return a !== undefined && a !== false; },
    setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    ...env,
  });
  doc.body.append(settings.root);
  await settings.load();
  return { settings, store, area, doc, clock, calls, answers, root: settings.root };
}

const section = (m, title) => findAll(m.root, (e) => e.tagName === 'section' && textOf(e.querySelector('h2') ?? { textContent: '' }) === title)[0];
const radios = (root, name) => findAll(root, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio' && (name ? e.getAttribute('name') === name : true));
const choose = (input) => { input.checked = true; input.dispatchEvent({ type: 'change' }); };
const radioByValue = (root, value) => radios(root).find((r) => r.getAttribute('value') === value);
const markText = (root) => findAll(root, (e) => e.classList.contains('tj-saved')).map(textOf).filter(Boolean);
const field = (m, label) => findAll(m.root, (e) => e.classList.contains('tj-num') && textOf(e.querySelector('label')) === label)[0];
const type = (f, text) => { const i = f.querySelector('input'); i.value = text; i.dispatchEvent({ type: 'change' }); };
const errorOf = (f) => { const e = f.querySelector('.tj-field__error'); return e.hidden ? '' : textOf(e); };

const SECTION_TITLES = ['العرض', 'اللغات', 'التوقيت', 'التصدير', 'المقارنة والمراجعة', 'المصطلحات', 'التخزين', 'النسخ الاحتياطي', 'التشخيص', 'حول'];

test('البنية: الرأس وعشرة أقسام بترتيبها («اللغات» بعد «العرض»، و«البيانات» بعد «التخزين»)، وكل خيار بتسمية', async () => {
  const m = await mount();
  assert.equal(textOf(m.root.querySelector('h1')), 'الإعدادات');
  assert.deepEqual(findAll(m.root, (e) => e.tagName === 'h2').map(textOf), SECTION_TITLES);
  assert.ok(textOf(m.root).includes('تُحفظ التغييرات فورًا'));
  assert.ok(textOf(m.root).includes(subtitleNote()));
  assert.ok(textOf(m.root).includes(scaleNote()));
  // ق-1: «معاينة حية» بعد «الموضع» مباشرة وقبل المفتاحين، بلا شرح تحتها (م-019). وح4 (2026-11-10): لا «لوحة النص المتزامن».
  const displayRows = findAll(m.root.querySelector('section[data-section="display"]'), (e) => e.classList?.contains('st-row__label')).map((e) => textOf(e.querySelector('.tj-label')));
  const previewAt = displayRows.indexOf('معاينة حية');
  assert.equal(displayRows[previewAt - 1], 'الموضع');
  assert.deepEqual(displayRows.slice(previewAt + 1), ['زر النص المتزامن', 'صور الفيديو في المحفوظات']);
  assert.equal(findAll(m.root, (e) => e.classList?.contains('st-note') && textOf(e).startsWith('الحجم نسبة')).length, 1, 'شرح الحجم مرة واحدة تحت «حجم الخط»');
  assert.ok(m.root.querySelector('.st-status') === null, 'لا سطر «المكان المختار» (م-044)');
  assert.ok(textOf(m.root).includes(MODE_NOTES.normal) && textOf(m.root).includes(MODE_NOTES.long));
  // حقل نصي واحد: وصف «الإبلاغ عن مشكلة» في «حول» (جولة النشر T2.1).
  assert.deepEqual(findAll(m.root, (e) => e.tagName === 'textarea').map((t) => t.id), ['st-report-text']);
});

test('القيم الأولية تعكس المحفوظ في كل عنصر', async () => {
  const m = await mount({ initial: { displayModeDefault: 'dual', appearance: { font: 'tajawal', scale: 130, background: 'solid', position: 'top' }, offsetStepMs: 1500, export: { modeDefault: 'long', splitThreshold: 300 }, thresholds: { driftMs: 200, completeness: 0.9 } } });
  assert.equal(radioByValue(m.root, 'dual').checked, true);
  assert.equal(radios(m.root, 'st-font').find((r) => r.checked).getAttribute('value'), 'tajawal');
  assert.equal(m.settings.slider.value, '130');
  assert.equal(textOf(m.root.querySelector('output')), '130%');
  assert.equal(radioByValue(m.root, 'solid').checked, true);
  assert.equal(radioByValue(m.root, 'top').checked, true);
  assert.equal(radioByValue(m.root, 'custom').checked, true);
  assert.equal(field(m, 'الخطوة المخصصة').querySelector('input').value, '1.5');
  assert.equal(radioByValue(m.root, 'long').checked, true);
  assert.equal(field(m, 'يُقترح التقسيم ابتداءً من').querySelector('input').value, '300');
  assert.equal(field(m, 'فرق التوقيت المقبول').querySelector('input').value, '200');
  assert.equal(field(m, 'حد التنبيه إلى نقص الأصل').querySelector('input').value, '90');
  assert.equal(m.settings.preview.stage.getAttribute('data-font'), 'tajawal');
  assert.equal(m.settings.preview.stage.getAttribute('data-bg'), 'solid');
});

test('وضع العرض الافتراضي: يُحفظ فورًا وتظهر «حُفظ» ثم تختفي', async () => {
  const m = await mount();
  choose(radioByValue(m.root, 'dual'));
  await settle();
  assert.equal((await m.store.getSettings()).displayModeDefault, 'dual');
  assert.deepEqual(markText(section(m, 'العرض')), ['حُفظ']);
  m.clock.runAll();
  assert.deepEqual(markText(section(m, 'العرض')), []);
});

test('خط الترجمة: أربعة خطوط كل اسم بخطه، والاختيار يُحفظ ويحدّث المعاينة، وبقية الإعدادات سليمة', async () => {
  const m = await mount();
  const names = findAll(m.root, (e) => e.classList.contains('st-font__name'));
  assert.deepEqual(names.map(textOf), SUBTITLE_FONT_LIST.map((f) => f.nameAr));
  names.forEach((n, i) => assert.ok(n.style.fontFamily.startsWith(`"${SUBTITLE_FONT_LIST[i].family}"`), `كل اسم بخطه: ${SUBTITLE_FONT_LIST[i].id}`));
  assert.equal(radios(m.root, 'st-font').find((r) => r.checked).getAttribute('value'), 'almarai', 'المراعي افتراضيًا');
  choose(radioByValue(m.root, 'markazi'));
  await settle();
  const saved = await m.store.getSettings();
  assert.equal(saved.appearance.font, 'markazi');
  assert.equal(saved.appearance.scale, 100);
  assert.equal(saved.appearance.background, 'soft');
  assert.match(m.settings.preview.stage.style.fontFamily, /^"Tarjuman Subtitle Markazi Text"/);
  assert.equal(m.settings.preview.stage.getAttribute('data-font'), 'markazi');
  assert.ok(markText(m.root).includes('حُفظ'));
});

test('منزلق الحجم: 70..160 بخطوة 5، يعرض قيمته، والمعاينة فورية والحفظ عند الإتمام بتقريب الشبكة', async () => {
  const m = await mount();
  const slider = m.settings.slider;
  assert.deepEqual(['min', 'max', 'step', 'type'].map((a) => slider.getAttribute(a)), ['70', '160', '5', 'range']);
  assert.equal(textOf(m.root.querySelector('output')), '100%');
  const size = () => m.settings.preview.stage.style.fontSize;
  const before = size();
  slider.value = '160';
  slider.dispatchEvent({ type: 'input' });
  assert.equal(textOf(m.root.querySelector('output')), '160%');
  assert.equal(slider.getAttribute('aria-valuetext'), '160%');
  assert.notEqual(size(), before, 'المعاينة فورية قبل الحفظ');
  assert.equal((await m.store.getSettings()).appearance.scale, 100, 'لا حفظ أثناء السحب');
  slider.value = '103';
  slider.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal((await m.store.getSettings()).appearance.scale, 105);
  assert.equal(slider.value, '105');
  assert.equal(textOf(m.root.querySelector('output')), '105%');
  assert.ok(markText(m.root).includes('حُفظ'));
});

test('«استعادة الافتراضي» لقسم العرض: معطّلة بسببها عند الافتراضي، ومفعّلة بعد التغيير، وتستعيد المراعي و100% ووضع العرض', async () => {
  const m = await mount();
  const reset = buttonNamed(section(m, 'العرض'), 'استعادة الافتراضي');
  assert.ok(reset, 'زر الاستعادة في رأس القسم');
  assert.equal(reset.getAttribute('aria-disabled'), 'true');
  assert.equal(reset.title, 'وضع العرض وخط الترجمة وحجمها وخلفيتها وموضعها على قيمها الافتراضية بالفعل.');
  reset.click();
  await settle();
  assert.equal(markText(m.root).length, 0, 'المعطّل لا يحفظ شيئًا');

  choose(radioByValue(m.root, 'noto-sans-arabic'));
  await settle();
  assert.equal(reset.getAttribute('aria-disabled'), 'false');
  m.settings.slider.value = '150';
  m.settings.slider.dispatchEvent({ type: 'change' });
  choose(radioByValue(m.root, 'dual'));
  await settle();
  reset.click();
  await settle();
  const s = await m.store.getSettings();
  assert.deepEqual([s.appearance.font, s.appearance.scale, s.displayModeDefault], ['almarai', 100, 'ar']);
  assert.equal(reset.getAttribute('aria-disabled'), 'true');
  assert.equal(radios(m.root, 'st-font').find((r) => r.checked).getAttribute('value'), 'almarai');
  assert.equal(m.settings.slider.value, '100');
  // الأقسام الأخرى لها استعادتها، وما لا افتراضيات له (التخزين والتشخيص وحول) بلا زر.
  assert.ok(buttonNamed(section(m, 'التوقيت'), 'استعادة الافتراضي'));
  assert.ok(buttonNamed(section(m, 'التصدير'), 'استعادة الافتراضي'));
  assert.ok(buttonNamed(section(m, 'التخزين'), 'استعادة الافتراضي') === null);
  assert.ok(buttonNamed(section(m, 'حول'), 'استعادة الافتراضي') === null);
});

test('التنقّل الجانبي: عشرة أقسام، المختار بـaria-current وقسمه وحده ظاهر، والاختيار يُحفظ في جزء العنوان ويُقرأ منه', async () => {
  let hash = 'export';
  const nav = { get: () => hash, set: (id) => { hash = id; }, onChange: () => () => {} };
  const m = await mount({ env: { nav } });
  const links = findAll(m.root, (e) => e.classList.contains('st-nav__link'));
  assert.deepEqual(links.map(textOf), SECTION_TITLES);
  assert.equal(m.settings.active, 'export', 'فُتحت على القسم المذكور في العنوان');
  assert.equal(section(m, 'التصدير').hidden, false);
  assert.equal(section(m, 'العرض').hidden, true);
  assert.equal(links[3].getAttribute('aria-current'), 'page');
  links[6].click();
  assert.equal(m.settings.active, 'storage');
  assert.equal(hash, 'storage', 'حُفظ في جزء العنوان');
  assert.equal(section(m, 'التخزين').hidden, false);
  assert.equal(section(m, 'التصدير').hidden, true);
  assert.equal(links[3].getAttribute('aria-current'), null);
  assert.equal(links[6].getAttribute('aria-current'), 'page');
});

test('مكان حفظ ملفات الترجمة (R65، P13-AC8) أول بند في التصدير: الأوضاع الثلاثة، والمجلد الفرعي بتحقق، و«استعادة الافتراضي»، وسطر المكان المختار وصفًا', async () => {
  const m = await mount();
  const exp = section(m, 'التصدير');
  const firstRowLabel = textOf(exp.querySelector('.st-row .tj-label'));
  assert.equal(firstRowLabel, 'مكان حفظ ملفات الترجمة', 'أول بند في البطاقة');
  const inputs = radios(exp).filter((r) => ['downloads', 'subfolder', 'ask'].includes(r.getAttribute('value')));
  assert.equal(inputs.length, 3);
  assert.equal(inputs[0].checked, true, 'الافتراضي مجلد التنزيلات');
  assert.ok(inputs.every((i) => !i.disabled), 'الأوضاع الثلاثة متاحة');
  assert.ok(textOf(exp).includes('مجلد التنزيلات (الافتراضي)'));
  assert.equal(textOf(exp).includes('المكان المختار'), false, 'لا سطر حالة يكرر الخيار (م-044)');
  assert.ok(textOf(exp).includes('للحفظ في مجلد آخر اختر «اسأل عن مكان الحفظ عند كل تنزيل»؛ فالمتصفحات لا تسمح للإضافات بالحفظ التلقائي خارج مجلد التنزيلات.'));
  const folder = findAll(exp, (e) => e.classList.contains('st-subfolder'))[0];
  assert.equal(folder.value, 'Tarjuman');
  assert.equal(folder.disabled, true, 'معطّل إلا في وضع المجلد الفرعي');
  const reset = findAll(exp, (e) => e.tagName === 'button' && e.classList.contains('st-location__reset'))[0];
  assert.equal(reset.getAttribute('aria-disabled'), 'true', 'معطّل حين يكون الافتراضي');
  const last = findAll(exp, (e) => e.classList.contains('st-last-save'))[0];
  assert.equal(last.hidden, true, 'لا مسار بلا ملف نزّله ترجمان');
  assert.ok(!/\/Users|C:\\|~\//.test(textOf(exp)), 'لا مسار فعلي يُدّعى');

  // المجلد الفرعي: يُفعَّل الحقل، والاسم غير الصالح يُرفض بلا حفظ، والصالح يُحفظ ويظهر في سطر المكان.
  choose(inputs[1]);
  await settle();
  assert.equal((await m.store.getPrefs()).saveLocation.mode, 'subfolder');
  assert.equal(folder.disabled, false);
  assert.equal(textOf(exp).includes('المكان المختار'), false);
  folder.value = 'a/b';
  folder.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal((await m.store.getPrefs()).saveLocation.folder, 'Tarjuman');
  assert.ok(textOf(exp).includes(messageFor('SV_BAD_FOLDER')));
  assert.equal(folder.getAttribute('aria-invalid'), 'true');
  folder.value = '  ترجماتي  ';
  folder.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal((await m.store.getPrefs()).saveLocation.folder, 'ترجماتي');
  assert.equal(textOf(exp).includes('المكان المختار'), false);
  assert.equal(reset.getAttribute('aria-disabled'), 'false');
  reset.click();
  await settle();
  assert.deepEqual((await m.store.getPrefs()).saveLocation, { mode: 'downloads', folder: 'Tarjuman' });
  assert.equal(folder.disabled, true);
  choose(inputs[2]);
  await settle();
  assert.equal(textOf(exp).includes('المكان المختار'), false);
});

test('«آخر ملف حُفظ» من سجل المتصفح وحده: يظهر المسار لملف نزّله ترجمان واكتمل ووُجد، وإلا لا يُعرض مسار', async () => {
  const asked = [];
  let answer = '/Users/test/Downloads/Tarjuman/AAAAAAAAAAA.ar.srt';
  const m = await mount({ env: { savedPath: async (id) => { asked.push(id); return answer; } } });
  const exp = section(m, 'التصدير');
  const last = findAll(exp, (e) => e.classList.contains('st-last-save'))[0];
  assert.equal(last.hidden, true, 'لا معرّف تنزيل محفوظ: لا سؤال ولا مسار');
  assert.deepEqual(asked, []);
  await m.store.setLastSave(42);
  await m.settings.location.refreshLast();
  assert.deepEqual(asked, [42]);
  assert.equal(last.hidden, false);
  assert.ok(textOf(last).includes('آخر ملف حُفظ: /Users/test/Downloads/Tarjuman/AAAAAAAAAAA.ar.srt'));
  answer = null; // حُذف الملف أو لم يكتمل
  await m.settings.location.refreshLast();
  assert.equal(last.hidden, true);
});

test('الخلفية والموضع: يُحفظان، والمعاينة تتبعهما', async () => {
  const m = await mount();
  const stage = m.settings.preview.stage;
  choose(radioByValue(m.root, 'solid'));
  choose(radioByValue(m.root, 'top'));
  await settle();
  const s = await m.store.getSettings();
  assert.deepEqual([s.appearance.background, s.appearance.position], ['solid', 'top']);
  assert.deepEqual([stage.getAttribute('data-bg'), stage.getAttribute('data-anchor'), stage.style.top, stage.style.bottom], ['solid', 'top', '8%', 'auto']);
  choose(radioByValue(m.root, 'raised'));
  await settle();
  assert.deepEqual([stage.style.bottom, stage.style.top], ['20%', 'auto']);
  choose(radioByValue(m.root, 'none'));
  await settle();
  assert.equal(stage.getAttribute('data-bg'), 'none');
});

test('المعاينة: سطران بالعربية معزولان اتجاهًا، وصندوق فيديو بنسبة 16:9', async () => {
  const m = await mount();
  const lines = findAll(m.settings.preview.root, (e) => e.classList.contains('st-preview__line'));
  assert.deepEqual(lines.map(textOf), ['هكذا تظهر الترجمة فوق الفيديو،', 'وهذا سطرها الثاني.']);
  assert.ok(lines.every((l) => l.getAttribute('dir') === 'rtl' && l.getAttribute('lang') === 'ar'));
  assert.equal(m.settings.preview.root.getAttribute('role'), 'img');
  assert.ok(m.settings.preview.root.getAttribute('aria-label'));
});

test('خطوة الأزرار: 0.5 و1 يُحفظان، و«مخصص» بحقل بتحقق: الخطأ لا يكتب، والصالح يكتب ويبقى «مخصص»', async () => {
  const m = await mount();
  const custom = m.root.querySelector('.st-custom');
  assert.equal(custom.hidden, true);
  choose(radioByValue(m.root, '1'));
  await settle();
  assert.equal((await m.store.getSettings()).offsetStepMs, 1000);
  choose(radioByValue(m.root, '0.5'));
  await settle();
  assert.equal((await m.store.getSettings()).offsetStepMs, 500);

  choose(radioByValue(m.root, 'custom'));
  assert.equal(custom.hidden, false);
  assert.equal((await m.store.getSettings()).offsetStepMs, 500, 'الاختيار وحده لا يكتب قبل قيمة صالحة');
  const f = field(m, 'الخطوة المخصصة');
  type(f, '0.05');
  await settle();
  assert.equal(errorOf(f), 'الخطوة من 0.1 إلى 10 ثوانٍ بمضاعفات 0.1.');
  assert.equal(f.querySelector('input').getAttribute('aria-invalid'), 'true');
  assert.equal((await m.store.getSettings()).offsetStepMs, 500);
  type(f, '٢٫٥');
  await settle();
  assert.equal(errorOf(f), '');
  assert.equal(f.querySelector('input').getAttribute('aria-invalid'), 'false');
  assert.equal((await m.store.getSettings()).offsetStepMs, 2500);
  assert.equal(radioByValue(m.root, 'custom').checked, true);
  assert.equal(custom.hidden, false);
});

test('التصدير: الوضع الافتراضي وعتبة التقسيم بتحقق', async () => {
  const m = await mount();
  choose(radioByValue(m.root, 'long'));
  await settle();
  assert.equal((await m.store.getSettings()).export.modeDefault, 'long');
  const f = field(m, 'يُقترح التقسيم ابتداءً من');
  assert.equal(textOf(f.querySelector('.tj-num__unit')), 'مقطع');
  type(f, '49');
  await settle();
  assert.equal(errorOf(f), 'حد التقسيم عدد صحيح من 50 إلى 2000 مقطع.');
  assert.equal((await m.store.getSettings()).export.splitThreshold, 200);
  type(f, '350');
  await settle();
  assert.equal(errorOf(f), '');
  assert.equal((await m.store.getSettings()).export.splitThreshold, 350);
  assert.equal((await m.store.getSettings()).export.modeDefault, 'long', 'دمج جزئي لا يمحو المجاور');
});

test('المقارنة: الانحراف بالملي ثانية والاكتمال بالمئة، بتحقق', async () => {
  const m = await mount();
  const drift = field(m, 'فرق التوقيت المقبول');
  const comp = field(m, 'حد التنبيه إلى نقص الأصل');
  assert.equal(textOf(drift.querySelector('.tj-num__unit')), 'ملي ثانية');
  assert.equal(textOf(comp.querySelector('.tj-num__unit')), '%');
  type(drift, '9');
  type(comp, '101');
  await settle();
  assert.equal(errorOf(drift), 'فرق التوقيت المقبول عدد صحيح من 10 إلى 5000 ملي ثانية.');
  assert.equal(errorOf(comp), 'حد التنبيه إلى نقص الأصل نسبة مئوية صحيحة من 50 إلى 100.');
  type(drift, '250');
  type(comp, '90');
  await settle();
  const s = await m.store.getSettings();
  assert.deepEqual([s.thresholds.driftMs, s.thresholds.completeness], [250, 0.9]);
});

test('فشل الحفظ: رسالة خطأ بجانب الخيار، وتعود الواجهة إلى المحفوظ', async () => {
  const m = await mount();
  m.area.failNext('set', new Error('boom'));
  choose(radioByValue(m.root, 'dual'));
  await settle();
  assert.deepEqual(markText(section(m, 'العرض')), [messageFor('PG_SAVE_FAILED')]);
  assert.equal(radioByValue(m.root, 'ar').checked, true, 'عاد إلى العربية وحدها');
  assert.equal(radioByValue(m.root, 'dual').checked, false);
  assert.equal((await m.store.getSettings()).displayModeDefault, 'ar');
});

test('تغيّر الإعدادات من سياق آخر (المشغّل مثلًا) يحدّث الواجهة', async () => {
  const m = await mount();
  const other = createStore({ area: m.area, now: () => Date.parse(NOW) + 99000 });
  await other.setSettings({ appearance: { font: 'tajawal', scale: 80 }, offsetStepMs: 1000 });
  await m.area.flush();
  await settle(10);
  assert.equal(radios(m.root, 'st-font').find((r) => r.checked).getAttribute('value'), 'tajawal');
  assert.equal(m.settings.slider.value, '80');
  assert.equal(radioByValue(m.root, '1').checked, true);
  m.settings.dispose();
});

test('التخزين: المستخدم بنص، والمسح بحوار يطلب «امسح» ولا يمسح دونها', async () => {
  const m = await mount({ videos: 2, initial: { appearance: { font: 'tajawal' } } });
  assert.match(textOf(section(m, 'التخزين')), /\d+ ك\.ب \(بلا حد ثابت\)/);
  const clear = buttonNamed(m.root, 'مسح كل البيانات');
  assert.ok(clear.classList.contains('tj-btn--danger'));

  m.answers.push(false);
  clear.click();
  await settle();
  const dialog = m.calls.confirms[0];
  assert.equal(dialog.tone, 'danger');
  assert.equal(dialog.title, 'مسح كل البيانات؟');
  assert.equal(dialog.confirmLabel, 'مسح كل البيانات');
  assert.ok(textOf(dialog.content).includes('اكتب «امسح» للتأكيد'));
  assert.equal((await m.store.listIndex()).length, 2, 'الإلغاء لا يمسح');

  m.answers.push(true);
  clear.click();
  await settle();
  assert.equal((await m.store.listIndex()).length, 2, 'التأكيد بلا كتابة الكلمة لا يمسح');

  m.answers.push((o) => { o.content.querySelector('input').value = 'امسح'; });
  clear.click();
  await settle(10);
  assert.deepEqual(await m.store.listIndex(), []);
  assert.equal((await m.store.getSettings()).appearance.font, 'almarai', 'الإعدادات عادت افتراضية');
  assert.equal(radios(m.root, 'st-font').find((r) => r.checked).getAttribute('value'), 'almarai');
  assert.ok(markText(section(m, 'التخزين')).includes('مُسحت كل البيانات والإعدادات.'));
  assert.ok(textOf(m.root).includes(installReminder()), 'فارغة بعد المسح: تذكير التثبيت');
});

test('التشخيص: زر النسخ ينسخ التقرير، وبيان ما يتضمنه وما لا يتضمنه، والفشل برسالة', async () => {
  let fail = false;
  const m = await mount({ env: { clipboardWrite: async (x) => { if (fail) throw new Error('رفض'); m.calls.clipboard.push(x); } } });
  const diag = section(m, 'التشخيص');
  assert.ok(textOf(diag).includes('الإصدار، والمتصفح، ونوع الخطأ، وأحجامًا وأعدادًا.'));
  assert.deepEqual(findAll(diag, (e) => e.classList.contains('st-panel__title')).map(textOf), ['يتضمن', 'لا يتضمن أبدًا']);
  assert.ok(textOf(diag).includes('روابط، أو رموز جلسة، أو ملفات ارتباط، أو نص الترجمة.'));
  buttonNamed(diag, 'نسخ تقرير التشخيص').click();
  await settle();
  assert.deepEqual(m.calls.clipboard, ['{"tarjuman":"0.2.0"}']);
  assert.deepEqual(markText(diag), ['نُسخ تقرير التشخيص.']);
  fail = true;
  buttonNamed(diag, 'نسخ تقرير التشخيص').click();
  await settle();
  assert.deepEqual(markText(diag), ['تعذّر نسخ تقرير التشخيص إلى الحافظة. أعد المحاولة.']);
});

test('تذكير التثبيت: يظهر ما دامت المحفوظات فارغة ويختفي بوجودها', async () => {
  assert.ok(textOf((await mount()).root).includes(installReminder()));
  assert.equal(textOf((await mount({ videos: 1 })).root).includes(installReminder()), false);
});

test('حول: الإصدار برمز الشعار والاسم، وسطر الخصوصية الصادق، وبطاقة الحقوق (سلطان والموقع والمستودع) بتبويب جديد وnoopener، والدعم، والخطوط ورخصها المحلية', async () => {
  const m = await mount();
  const about = section(m, 'حول');
  const labels = [...about.querySelectorAll('.st-about__row')].map((r) => textOf(r.querySelector('.st-row__label')));
  assert.deepEqual(labels, ['الإصدار', 'الحقوق', 'الدعم', 'الدليل', 'التراخيص'], 'صفوف بتسمياتها كبقية الإعدادات (لوحة 15)');
  const brand = about.querySelector('.st-about__brand');
  assert.ok(brand.querySelector('svg.tj-logo__mark'), 'رمز الشعار');
  assert.equal(textOf(brand.querySelector('.st-about__name')), 'ترجمان');
  assert.equal(textOf(brand.querySelector('.st-about__version')), 'v0.2.0');
  assert.equal(brand.querySelector('.st-about__version').dir, 'ltr', 'الرقم معزول LTR');
  assert.equal(textOf(brand.querySelector('.st-about__browsers')), BROWSERS_LINE);
  assert.ok(textOf(about).includes(privacyLine()));
  assert.equal(textOf(about).includes('كل شيء محلي على جهازك'), false, 'لا ادّعاء مطلق بأن كل شيء محلي: الصور من يوتيوب');
  // بطاقة الحقوق بطلب سلطان (2026-11-07): مفتاح وقيمة، والرابطان باسم النطاق LTR معزولًا.
  const credits = [...about.querySelectorAll('.st-credits__row')].map((r) => [textOf(r.querySelector('dt')), textOf(r.querySelector('dd'))]);
  assert.deepEqual(credits, [['التصميم والتطوير', 'سلطان'], ['الموقع', 'bysltan.com'], ['المستودع', 'github.com/iSltanX/Tarjuman']]);
  assert.ok(textOf(about).includes(CREDITS.copyright), 'سطر الحقوق كما في LICENSE');
  assert.equal(CREDITS.copyright, '© 2026 سلطان (BySultan). جميع الحقوق محفوظة.');
  const links = findAll(about, (e) => e.tagName === 'a');
  const byText = (t) => links.find((a) => textOf(a) === t);
  const site = byText('bysltan.com');
  const repo = byText('github.com/iSltanX/Tarjuman');
  const support = byText('الدعم والخصوصية');
  assert.equal(site.getAttribute('href'), LINKS.site);
  assert.equal(repo.getAttribute('href'), LINKS.repo);
  assert.equal(support.getAttribute('href'), LINKS.support);
  assert.deepEqual([LINKS.site, LINKS.repo, LINKS.support], ['https://bysltan.com', 'https://github.com/iSltanX/Tarjuman', 'https://bysltan.com/tarjuman/support']);
  for (const a of [site, repo]) assert.equal(a.querySelector('bdi').dir, 'ltr', 'اسم النطاق LTR معزول');
  for (const a of [site, repo, support]) {
    assert.equal(a.getAttribute('target'), '_blank');
    assert.match(a.getAttribute('rel'), /noopener/);
  }
  assert.equal(textOf(about).includes('خاص حاليًا'), false, 'النص المعروض بلا «خاص حاليًا»');
  assert.ok(textOf(about).includes('خطوط الترجمة المضمّنة لأصحابها، برخصة SIL Open Font License 1.1: المراعي، ونوتو سانس العربي، وتجوّل، ومركزي.'));
  assert.ok(buttonNamed(about, 'عرض التراخيص') === null, 'عرض التراخيص ملخّص details لا زر');
  assert.ok(findAll(about, (e) => e.tagName === 'summary').map(textOf).includes('عرض التراخيص'));
  assert.ok(findAll(about, (e) => e.tagName === 'summary').map(textOf).includes('دليل الاستخدام'));
  const licenses = links.filter((a) => /OFL/.test(textOf(a)));
  assert.equal(licenses.length, 5, 'خطوط الترجمة الأربعة وخط عناوين الواجهة');
  const want = [...SUBTITLE_FONT_LIST.map((f) => f.license), 'ui/fonts/ui/cairo-OFL.txt'];
  licenses.forEach((a, i) => {
    assert.equal(a.getAttribute('href'), `../../${want[i]}`, 'ملف رخصة محلي بمسار نسبي');
    assert.match(a.getAttribute('rel'), /noopener/);
  });
  assert.ok(textOf(about).includes('وعناوين الواجهة بخط القاهرة (Cairo) بالرخصة نفسها.'));
  // الأيقونات مرسومة لترجمان، وترخيص Lucide باقٍ للإسناد (جولة النشر T4 والهوية الرابعة): في الملاحظة، ورابطه ملف الإشعارات المحلي.
  assert.ok(textOf(about).includes('وأيقونات الواجهة رُسمت لهوية ترجمان؛ وترخيصا Lucide (ISC) وFeather (MIT) في ملف الإشعارات لأن الإصدارات السابقة استعملت أيقوناتهما.'));
  const icons = links.find((a) => textOf(a) === 'إشعارات الأطراف الأخرى · Lucide — ISC، وFeather — MIT');
  assert.equal(icons.getAttribute('href'), '../../THIRD_PARTY_NOTICES.txt', 'ملف الإشعارات المحلي بمسار نسبي');
  assert.match(icons.getAttribute('rel'), /noopener/);
  const external = links.filter((a) => /^https?:/.test(a.getAttribute('href'))).map((a) => a.getAttribute('href'));
  assert.deepEqual(external.sort(), [LINKS.site, LINKS.repo, LINKS.support].sort(), 'الروابط الخارجية الثلاثة الوحيدة');
});

test('خطوط الواجهة لا تتغير بتغيير خط الترجمة: الخط المضمّن على اسم كل خط وعلى المعاينة وحدهما', async () => {
  const m = await mount();
  const owners = () => findAll(m.root, (e) => Boolean(e.style.fontFamily)).map((e) => e.className).sort();
  const before = owners();
  assert.deepEqual(before, ['st-font__name', 'st-font__name', 'st-font__name', 'st-font__name', 'st-preview__stage']);
  choose(radioByValue(m.root, 'markazi'));
  await settle();
  assert.deepEqual(owners(), before, 'الخط يغيّر المعاينة وحدها، لا عنصرًا آخر');
  assert.equal(m.root.style.fontFamily ?? undefined, undefined);
  assert.equal(m.doc.body.style.fontFamily ?? undefined, undefined);
});

test('كل عنصر إدخال باسم وصول: منزلق الحجم بـaria-label، والحقول بـlabel، والـradio بـlabel ملفوف، والمجموعات بـlegend', async () => {
  const m = await mount();
  assert.equal(m.settings.slider.getAttribute('aria-label'), 'حجم خط الترجمة');
  const labelFor = (id) => findAll(m.root, (e) => e.tagName === 'label' && e.getAttribute('for') === id).length;
  const inputs = findAll(m.root, (e) => e.tagName === 'input');
  assert.ok(inputs.length > 20);
  for (const i of inputs) {
    const type = i.getAttribute('type');
    if (type === 'radio') {
      let wrapped = false;
      for (let n = i.parentNode; n; n = n.parentNode) if (n.tagName === 'label' && textOf(n)) wrapped = true;
      assert.ok(wrapped, `radio ${i.getAttribute('value')} بلا label ملفوف`);
    } else {
      assert.ok(i.getAttribute('aria-label') || labelFor(i.id) > 0, `إدخال ${type} (${i.id}) بلا اسم وصول`);
    }
  }
  const fieldsets = findAll(m.root, (e) => e.tagName === 'fieldset');
  assert.equal(fieldsets.length, 9, 'لغة الواجهة، ووضع العرض، وخط الترجمة، والخلفية، والموضع، والخطوة، ومكان الحفظ، ووضع التصدير، ونوع البلاغ');
  assert.ok(fieldsets.every((f) => textOf(f.querySelector('legend') ?? { textContent: '' })));
});

test('خطأ التحقق القديم يُمسح حين تُستبدل قيمة الحقل المعروضة بالمحفوظة', async () => {
  const m = await mount();
  const f = field(m, 'يُقترح التقسيم ابتداءً من');
  type(f, '5');
  await settle();
  assert.equal(errorOf(f), 'حد التقسيم عدد صحيح من 50 إلى 2000 مقطع.');
  choose(radioByValue(m.root, 'long'));
  await settle();
  assert.equal(f.querySelector('input').value, '200');
  assert.equal(errorOf(f), '');
  assert.equal(f.querySelector('input').getAttribute('aria-invalid'), 'false');
});

test('فشل حفظ ما كُتب في حقل مركَّز يعيد الحقل إلى المحفوظ (لا تناقض بين المعروض والمخزَّن)', async () => {
  const m = await mount();
  const f = field(m, 'يُقترح التقسيم ابتداءً من');
  const input = f.querySelector('input');
  input.focus();
  input.value = '300';
  m.area.failNext('set', new Error('boom'));
  input.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal(input.value, '200', 'عاد إلى المحفوظ ولو كان مركَّزًا');
  assert.equal((await m.store.getSettings()).export.splitThreshold, 200);
  assert.ok(markText(m.root).includes(messageFor('PG_SAVE_FAILED')));
});

test('تدقيق 5fedcb9 (GM-027.1): إحصاءات «الترجمات والنسخ السابقة» تتبع تغيّر المحفوظات من تبويب آخر، و«آخر ملف حُفظ» يتبع النسخة الاحتياطية', async () => {
  let answer = '/Users/test/Downloads/Tarjuman/tarjuman-backup.json';
  const m = await mount({ videos: 1, env: { savedPath: async () => answer, saveFile: async () => { await m.store.setLastSave(7); return { ok: true, mode: 'downloads', downloadId: 7 }; } } });
  const usage = () => textOf(findAll(m.root, (e) => e.classList.contains('st-library-usage'))[0]);
  assert.match(usage(), /الفيديوهات المترجمة: 1/);
  const other = createStore({ area: m.area, now: () => Date.parse(NOW) + 5e6 });
  await other.updateVideo('V0000000009', () => videoRecord({ videoId: 'V0000000009' }));
  await m.area.flush();
  await new Promise((r) => setTimeout(r, 350));
  await settle(10);
  assert.match(usage(), /الفيديوهات المترجمة: 2/, 'دون إعادة فتح الصفحة');
  const last = findAll(section(m, 'التصدير'), (e) => e.classList.contains('st-last-save'))[0];
  assert.equal(last.hidden, true);
  const createBtn = buttonNamed(m.root, 'إنشاء نسخة احتياطية');
  createBtn.click();
  await new Promise((r) => setTimeout(r, 50));
  await settle(20);
  assert.equal(last.hidden, false, 'السطر ظهر بعد الحفظ');
  assert.ok(textOf(last).includes(answer));
});

test('تدقيق Fable (UX-23): الصفحة مشغولة حتى تُقرأ الإعدادات، وبفشل القراءة تصير الأقسام inert تحت رسالة الخطأ', async () => {
  const ok = await mount();
  assert.equal(ok.root.getAttribute('aria-busy'), null, 'بعد القراءة');
  assert.equal(findAll(ok.root, (e) => e.tagName === 'section' && e.hasAttribute('inert')).length, 0);
  let t = Date.parse(NOW);
  const store = createStore({ area: createMemoryArea({ unlimited: true }), now: () => (t += 1000) });
  store.getSettings = () => Promise.reject(new Error('read failed'));
  const doc = newDocument();
  const settings = createSettings({ store, doc, version: '0.2.0', clipboardWrite: async () => {}, diagnosticsText: async () => '{}' });
  doc.body.append(settings.root);
  assert.equal(settings.root.getAttribute('aria-busy'), 'true', 'قبل القراءة');
  await settings.load();
  assert.equal(settings.root.getAttribute('aria-busy'), null);
  assert.ok(textOf(settings.root).includes('تعذّرت قراءة الإعدادات'));
  const sections = findAll(settings.root, (e) => e.tagName === 'section');
  assert.equal(sections.length, 10);
  assert.ok(sections.every((sec) => sec.hasAttribute('inert')), 'لا أدوات فعّالة فوق قيم افتراضية');
});
