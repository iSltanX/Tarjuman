// إضافات الإصدار الثاني في الإعدادات (P13-AC4/AC5/AC7/AC8) بـDOM وهمي فوق تخزين حقيقي بمحاكاة: حد سرعة القراءة،
// والمصطلحات بحدودها ومفتاح إرفاقها ونصها في التعليمات، وبطاقة «البيانات»: الإنشاء عبر saveFile، والاستعادة بالمعاينة
// (التخطي افتراضيًا، والاستبدال الصريح، والإعدادات غير مختارة)، والتالف قبل أي كتابة، والإلغاء بلا أثر، والفشل الجزئي
// وإعادة المحاولة، وسعة الترجمات والسوابق في «التخزين».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup } from '../../../../src/core/backup/index.js';
import { messageFor, TjError } from '../../../../src/core/errors/index.js';
import { instructions } from '../../../../src/core/export/instructions.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import {
  glossaryCounter, parseFolder, parseReadingSpeed, readingText, saveLocationStatus, sectionReset, termDraft,
} from '../../../../src/pages/settings/model.js';
import { DEFAULT_PREFS } from '../../../../src/core/model/prefs.js';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, videoRecord } from '../../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC'];
const noPause = () => Promise.resolve();

function newStore() {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  return { area, store: createStore({ area, now: () => (t += 1000) }) };
}

async function mount({ store, area, env = {} } = {}) {
  if (!store) ({ store, area } = newStore());
  await area.flush();
  const doc = newDocument();
  const calls = { saves: [], confirms: [], picks: 0 };
  const answers = [];
  let picked = null;
  const settings = createSettings({
    store, doc, version: '0.3.0', now: () => Date.parse('2026-11-02T10:00:00.000Z'), pause: noPause,
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async (file) => { calls.saves.push(file); return { ok: true, mode: 'downloads', downloadId: calls.saves.length }; },
    savedPath: async () => null,
    pickFile: async () => { calls.picks += 1; return picked; },
    confirm: async (o) => { calls.confirms.push(o); const a = answers.shift(); if (typeof a === 'function') await a(o); return a !== undefined && a !== false; },
    setTimer: () => 0, clearTimer: () => {},
    ...env,
  });
  doc.body.append(settings.root);
  await settings.load();
  return { settings, store, area, doc, calls, answers, root: settings.root, pick: (f) => { picked = f; } };
}

const section = (m, title) => findAll(m.root, (e) => e.tagName === 'section' && textOf(e.querySelector('h2') ?? { textContent: '' }) === title)[0];
const asFile = (text) => ({ size: text.length, text: async () => text });

/** مكتبة مصدر: حزمة كاملة، وسجل بعنوان، وسجل بلا عربية؛ وإعدادات وتفضيلات معدّلة. */
async function sourceBackup() {
  const { area, store } = newStore();
  await seedBundle(store, sampleBundle({ videoId: IDS[0], third: true }));
  await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: 'محاضرة عن النماذج' }));
  await store.updateVideo(IDS[2], () => videoRecord({ videoId: IDS[2], arabic: false }));
  await store.setSettings({ offsetStepMs: 1000 });
  await store.setPrefs(samplePrefs());
  await area.flush();
  return { store, built: await createBackup({ store, appVersion: '0.3.0', pause: noPause }) };
}

test('النموذج: حد القراءة 5..40 أو فارغ للافتراضي، والمجلد بتحقق، والمصطلح بحدوده وتفرده، والاستعادة تشمل التفضيلات', () => {
  assert.deepEqual(parseReadingSpeed(''), { ok: true, value: null });
  assert.deepEqual(parseReadingSpeed('١٧'), { ok: true, value: 17 });
  assert.equal(parseReadingSpeed('4').ok, false);
  assert.equal(parseReadingSpeed('41').code, 'PG_READING_INVALID');
  assert.equal(parseReadingSpeed('17.5').ok, false);
  assert.equal(readingText(null), '');
  assert.equal(readingText(22), '22');
  assert.deepEqual(parseFolder('  Tarjuman 2 '), { ok: true, value: 'Tarjuman 2' });
  for (const bad of ['', 'a/b', 'a\\b', '..', 'CON', 'x'.repeat(61), 'a:b']) assert.equal(parseFolder(bad).code, 'SV_BAD_FOLDER', bad);
  assert.equal(saveLocationStatus('subfolder', 'ترجماتي'), 'المكان المختار: مجلد التنزيلات/ترجماتي');
  assert.equal(glossaryCounter(12), '12 من 100');

  const terms = samplePrefs().glossary.terms;
  assert.deepEqual(termDraft({ source: '  large   language model ', target: 'نموذج لغوي كبير', note: '' }, terms), { ok: true, term: { source: 'large language model', target: 'نموذج لغوي كبير', note: null } });
  assert.deepEqual(termDraft({ source: 'PROMPT', target: 'x', note: '' }, terms), { ok: false, code: 'PG_TERM_DUPLICATE', field: 'source' });
  assert.equal(termDraft({ source: '', target: 'x', note: '' }, terms).code, 'PG_TERM_SOURCE_INVALID');
  assert.equal(termDraft({ source: 'a', target: 'ب'.repeat(81), note: '' }, terms).code, 'PG_TERM_TARGET_INVALID');
  assert.equal(termDraft({ source: 'a', target: 'ب', note: 'ن'.repeat(121) }, terms).code, 'PG_TERM_NOTE_INVALID');
  const full = Array.from({ length: 100 }, (_, i) => ({ source: `t${i}`, target: 'م', note: null }));
  assert.equal(termDraft({ source: 'new', target: 'جديد', note: '' }, full).code, 'PG_TERM_LIMIT');

  const r = sectionReset(DEFAULT_SETTINGS, 'compare', { ...DEFAULT_PREFS, review: { maxCps: 17 } });
  assert.equal(r.isDefault, false);
  assert.deepEqual(r.prefsPatch, { review: { maxCps: null } });
  assert.equal(sectionReset(DEFAULT_SETTINGS, 'export', DEFAULT_PREFS).isDefault, true);
  assert.equal(sectionReset(DEFAULT_SETTINGS, 'glossary'), null, 'القاموس بيانات المستخدم لا افتراض له');
});

test('«المقارنة والمراجعة»: حد سرعة القراءة يُحفظ في التفضيلات، والفارغ يعيد الافتراضي بعلامته، والخاطئ يُرفض', async () => {
  const m = await mount();
  const sec = section(m, 'المقارنة والمراجعة');
  const field = findAll(sec, (e) => e.classList.contains('tj-num') && textOf(e.querySelector('label')) === 'حد سرعة القراءة (حرف/ث)')[0];
  const input = field.querySelector('input');
  const pill = findAll(sec, (e) => e.classList.contains('tj-pill') && textOf(e) === 'الافتراضي 20')[0];
  assert.equal(input.value, '');
  assert.equal(input.getAttribute('placeholder'), '20');
  assert.equal(pill.hidden, false);
  input.value = '17';
  input.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal((await m.store.getPrefs()).review.maxCps, 17);
  assert.equal(pill.hidden, true);
  input.value = '50';
  input.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal((await m.store.getPrefs()).review.maxCps, 17);
  assert.ok(textOf(field).includes(messageFor('PG_READING_INVALID')));
  input.value = '';
  input.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal((await m.store.getPrefs()).review.maxCps, null);
  assert.equal(pill.hidden, false);
});

test('«المصطلحات»: إضافة وحذف بتحقق، والعدّاد «N من 100»، ومفتاح الإرفاق؛ والتعليمات المنسوخة تحمل القاموس بالنص نفسه', async () => {
  const m = await mount();
  const sec = section(m, 'المصطلحات');
  const counter = findAll(sec, (e) => e.classList.contains('st-gl__count'))[0];
  assert.equal(textOf(counter), '0 من 100');
  const attach = findAll(sec, (e) => e.tagName === 'input' && e.getAttribute('role') === 'switch')[0];
  assert.equal(attach.checked, true, 'الإرفاق مفعّل افتراضيًا');
  const g = m.settings.glossary;
  const submit = () => g.form.dispatchEvent({ type: 'submit', preventDefault() {} });

  g.inputs.source.value = 'prompt';
  g.inputs.target.value = 'موجِّه';
  submit();
  await settle();
  g.inputs.source.value = 'token';
  g.inputs.target.value = 'رمز';
  g.inputs.note.value = 'في سياق النماذج';
  submit();
  await settle();
  assert.equal(textOf(counter), '2 من 100');
  assert.deepEqual((await m.store.getPrefs()).glossary.terms, [
    { source: 'prompt', target: 'موجِّه', note: null }, { source: 'token', target: 'رمز', note: 'في سياق النماذج' },
  ]);
  assert.equal(g.inputs.source.value, '', 'تُفرَّغ الحقول بعد الإضافة');
  const rows = findAll(sec, (e) => e.tagName === 'tr' && e.parentNode?.tagName === 'tbody');
  assert.deepEqual(rows.map((r) => textOf(r.querySelector('.st-gl__target'))), ['موجِّه', 'رمز']);

  // مكرر بلا اعتبار لحالة الأحرف: خطأ تحت الحقل ولا حفظ.
  g.inputs.source.value = 'Prompt';
  g.inputs.target.value = 'تلقين';
  submit();
  await settle();
  assert.equal((await m.store.getPrefs()).glossary.terms.length, 2);
  assert.ok(textOf(sec).includes(messageFor('PG_TERM_DUPLICATE')));
  assert.equal(g.inputs.source.getAttribute('aria-invalid'), 'true');

  // النص الذي تنسخه المحفوظات وقائمة التحميل: instructions بالقاموس المحفوظ.
  const prefs = await m.store.getPrefs();
  const text = instructions({ videoId: IDS[0], title: 'x', glossary: prefs.glossary.terms });
  assert.ok(text.includes('- prompt = موجِّه') && text.includes('- token = رمز (في سياق النماذج)'));

  buttonNamed(rows[0], 'حذف المصطلح prompt').click();
  await settle();
  assert.deepEqual((await m.store.getPrefs()).glossary.terms.map((t) => t.source), ['token']);
  attach.checked = false;
  attach.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal((await m.store.getPrefs()).glossary.attach, false);
});

test('«البيانات» — الإنشاء: ملف tarjuman-backup-YYYY-MM-DD.json عبر saveFile بخيار تضمين السوابق، ونتيجته سطر بلا محتوى', async () => {
  const { store } = await sourceBackup();
  const m = await mount({ store, area: createMemoryArea() });
  const sec = section(m, 'البيانات');
  const prev = findAll(sec, (e) => e.tagName === 'input' && e.getAttribute('type') === 'checkbox')[0];
  assert.equal(prev.checked, true, 'تضمين النسخ السابقة مفعّل افتراضيًا');
  buttonNamed(sec, 'إنشاء نسخة احتياطية').click();
  await settle(10);
  assert.equal(m.calls.saves.length, 1);
  const [file] = m.calls.saves;
  assert.equal(file.name, 'tarjuman-backup-2026-11-02.json');
  assert.equal(JSON.parse(file.text).options.previous, true);
  assert.ok(textOf(sec).includes('أُنشئت النسخة الاحتياطية: 3 فيديوهات.'));
  assert.ok(!textOf(sec).includes('محاضرة'), 'لا عنوان في النتيجة');
  prev.checked = false;
  buttonNamed(sec, 'إنشاء نسخة احتياطية').click();
  await settle(10);
  assert.equal(JSON.parse(m.calls.saves[1].text).options.previous, false);
});

test('«البيانات» — الاستعادة: المعاينة بالأعداد والجديدة والموجودة، والتخطي افتراضيًا، والإعدادات غير مختارة، ثم تقرير', async () => {
  const { built } = await sourceBackup();
  const { area, store } = newStore();
  await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: 'عمل أحدث' }));
  const m = await mount({ store, area });
  m.pick(asFile(built.text));
  let seen = null;
  m.answers.push((o) => { seen = o; });
  await m.settings.data.restoreFromFile();
  const text = textOf(seen.content);
  assert.equal(seen.title, 'استعادة من نسخة احتياطية');
  assert.ok(text.includes('3 فيديوهات · 4 ترجمات · 3 علامات · نسخة سابقة واحدة'));
  assert.ok(text.includes('جديدة — ستُضاف (2)'));
  assert.ok(text.includes('موجودة — تُتخطى افتراضيًا (1)'));
  assert.ok(text.includes('نزّل نسخة من بياناتك الحالية أولًا'));
  const boxes = findAll(seen.content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'checkbox');
  const settingsBox = boxes.find((b) => textOf(b.parentNode) === 'استعادة الإعدادات والقاموس');
  assert.equal(settingsBox.checked, false, 'الإعدادات غير مختارة افتراضيًا');
  assert.ok(boxes.filter((b) => b.getAttribute('data-video')).every((b) => !b.checked), 'الموجود غير مختار للاستبدال');
  await settle(10);
  const sec = section(m, 'البيانات');
  assert.ok(textOf(sec).includes(messageFor('BK_RESTORE_DONE')));
  assert.ok(textOf(sec).includes('أضيف 2 · تُخطّي 1 · استُبدل 0 · تعذّر 0'));
  assert.equal((await store.getVideo(IDS[1])).title, 'عمل أحدث', 'الموجود لم يُمس');
  assert.ok(await store.getBundle(IDS[0]));
  assert.equal((await store.getSettings()).offsetStepMs, 500, 'الإعدادات لم تُستعد');
});

test('«البيانات» — الاستبدال الصريح لصف والإعدادات باختيارها، و«نزّل نسخة من بياناتك الحالية أولًا» يحفظ ملفًا', async () => {
  const { built } = await sourceBackup();
  const { area, store } = newStore();
  await store.updateVideo(IDS[1], () => ({ ...videoRecord({ videoId: IDS[1] }), title: 'عمل أحدث' }));
  const m = await mount({ store, area });
  m.pick(asFile(built.text));
  m.answers.push(async (o) => {
    buttonNamed(o.content, 'نزّل نسخة من بياناتك الحالية أولًا').click();
    await settle(10);
    const boxes = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('type') === 'checkbox');
    const row = boxes.find((b) => b.getAttribute('data-video') === IDS[1]);
    row.checked = true;
    row.dispatchEvent({ type: 'change' });
    const s = boxes.find((b) => textOf(b.parentNode) === 'استعادة الإعدادات والقاموس');
    s.checked = true;
    assert.ok(textOf(o.content).includes('الاستبدال يكتب فوق الفيديو كاملًا ولا يحفظ له نسخة سابقة.'));
  });
  await m.settings.data.restoreFromFile();
  await settle(10);
  assert.equal(m.calls.saves.length, 1, 'نُزّلت نسخة من الحالي أولًا');
  assert.ok(m.calls.saves[0].name.startsWith('tarjuman-backup-'));
  assert.equal(JSON.parse(m.calls.saves[0].text).counts.videos, 1);
  assert.equal((await store.getVideo(IDS[1])).title, 'محاضرة عن النماذج', 'استُبدل الصف المختار');
  assert.equal((await store.getSettings()).offsetStepMs, 1000);
  assert.equal((await store.getPrefs()).glossary.terms.length, 3);
  assert.ok(textOf(section(m, 'البيانات')).includes('أضيف 2 · تُخطّي 0 · استُبدل 1 · تعذّر 0'));
  assert.ok(textOf(section(m, 'البيانات')).includes('استُعيدت الإعدادات والقاموس.'));
});

test('«البيانات» — «استبدال كل الموجود» يختار كل الصفوف', async () => {
  const { built } = await sourceBackup();
  const { area, store } = newStore();
  for (const id of IDS) await store.updateVideo(id, () => ({ ...videoRecord({ videoId: id }), title: 'محلي' }));
  const m = await mount({ store, area });
  m.pick(asFile(built.text));
  m.answers.push((o) => {
    const all = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('role') === 'switch')[0];
    assert.ok(textOf(all.parentNode).includes('استبدال كل الموجود'));
    all.checked = true;
    all.dispatchEvent({ type: 'change' });
  });
  await m.settings.data.restoreFromFile();
  await settle(10);
  assert.ok(textOf(section(m, 'البيانات')).includes('أضيف 0 · تُخطّي 0 · استُبدل 3 · تعذّر 0'));
  assert.equal((await store.getVideo(IDS[1])).title, 'محاضرة عن النماذج');
});

test('«البيانات» — الإلغاء لا يغيّر بصمة التخزين، والتالف يُرفض قبل أي حوار ولا يُكتب شيء', async () => {
  const { built } = await sourceBackup();
  const { area, store } = newStore();
  await store.updateVideo(IDS[1], () => videoRecord({ videoId: IDS[1] }));
  const m = await mount({ store, area });
  await area.flush();
  const before = JSON.stringify(area.dump());
  m.pick(asFile(built.text));
  m.answers.push(false);
  await m.settings.data.restoreFromFile();
  await settle(5);
  assert.equal(JSON.stringify(area.dump()), before, 'الإلغاء بلا أثر');

  m.pick(asFile(built.text.replace('"offsetStepMs":1000', '"offsetStepMs":2000')));
  const confirms = m.calls.confirms.length;
  await m.settings.data.restoreFromFile();
  assert.equal(m.calls.confirms.length, confirms, 'لا معاينة لملف تالف');
  assert.ok(textOf(section(m, 'البيانات')).includes(messageFor('BK_INTEGRITY')));
  m.pick(asFile(JSON.stringify({ ...JSON.parse(built.text), version: 9 })));
  await m.settings.data.restoreFromFile();
  assert.ok(textOf(section(m, 'البيانات')).includes('حدّث ترجمان أولًا'));
  assert.equal(JSON.stringify(area.dump()), before);
});

test('«البيانات» — فشل جزئي: التقرير يذكر ما تعذّر بسببه، و«أعد المحاولة» يكمل ما تعذّر وحده', async () => {
  const { built } = await sourceBackup();
  const { area, store } = newStore();
  let broken = true;
  const calls = [];
  const faulty = Object.create(store);
  faulty.restoreVideo = (entry, opts) => {
    calls.push(entry.record.videoId);
    if (broken && entry.record.videoId === IDS[1]) return Promise.reject(new TjError('ST_WRITE_FAILED'));
    return store.restoreVideo(entry, opts);
  };
  const m = await mount({ store: faulty, area });
  m.pick(asFile(built.text));
  m.answers.push(true);
  await m.settings.data.restoreFromFile();
  await settle(10);
  const sec = section(m, 'البيانات');
  assert.ok(textOf(sec).includes(messageFor('BK_RESTORE_PARTIAL')));
  assert.ok(textOf(sec).includes('أضيف 2 · تُخطّي 0 · استُبدل 0 · تعذّر 1'));
  assert.ok(textOf(sec).includes(`محاضرة عن النماذج: ${messageFor('ST_WRITE_FAILED')}`));
  broken = false;
  calls.length = 0;
  buttonNamed(sec, 'أعد المحاولة').click();
  await settle(10);
  assert.deepEqual(calls, [IDS[1]], 'إعادة المحاولة لما تعذّر وحده');
  assert.ok(textOf(sec).includes('أضيف 3 · تُخطّي 0 · استُبدل 0 · تعذّر 0'));
  assert.ok(textOf(sec).includes(messageFor('BK_RESTORE_DONE')));
});

test('«نزّل نسخة من بياناتك الحالية أولًا» تكتمل قبل أي كتابة ولو أُكّدت الاستعادة أثناءها (لا تدخلها بيانات مستبدلة)', async () => {
  const { built } = await sourceBackup();
  const { area, store } = newStore();
  for (const id of IDS) await store.updateVideo(id, () => ({ ...videoRecord({ videoId: id }), title: `محلي ${id}` }));
  // إيقاف مصطنع في قراءة النسخة الاحترازية بعد فيديوها الأول: التأكيد يحدث وهي لم تقرأ الباقي بعد.
  let release;
  const gate = new Promise((r) => { release = r; });
  let armed = false;
  let reads = 0;
  const slow = Object.create(store);
  slow.getBundle = async (id) => {
    if (armed && ++reads === 2) await gate;
    return store.getBundle(id);
  };
  const m = await mount({ store: slow, area });
  m.pick(asFile(built.text));
  m.answers.push(async (o) => {
    const all = findAll(o.content, (e) => e.tagName === 'input' && e.getAttribute('role') === 'switch')[0];
    all.checked = true;
    all.dispatchEvent({ type: 'change' });
    armed = true;
    buttonNamed(o.content, 'نزّل نسخة من بياناتك الحالية أولًا').click();
    await settle(3);
    setTimeout(release, 30);
  });
  await m.settings.data.restoreFromFile();
  await settle(20);
  assert.equal(m.calls.saves.length, 1);
  const safety = JSON.parse(m.calls.saves[0].text);
  assert.deepEqual(safety.data.videos.map((v) => v.record.title).sort(), IDS.map((id) => `محلي ${id}`).sort(), 'النسخة الاحترازية بالبيانات المحلية كلها');
  assert.equal((await store.getVideo(IDS[1])).title, 'محاضرة عن النماذج', 'ثم استُبدل الكل');
});

test('«أعد المحاولة» معطّل أثناء التشغيل، والنقر المزدوج لا يشغّل تشغيلين', async () => {
  const { built } = await sourceBackup();
  const { area, store } = newStore();
  let broken = true;
  const calls = [];
  const faulty = Object.create(store);
  faulty.restoreVideo = (entry, opts) => {
    calls.push(entry.record.videoId);
    if (broken && entry.record.videoId === IDS[1]) return Promise.reject(new TjError('ST_WRITE_FAILED'));
    return store.restoreVideo(entry, opts);
  };
  const m = await mount({ store: faulty, area });
  m.pick(asFile(built.text));
  m.answers.push(true);
  await m.settings.data.restoreFromFile();
  await settle(10);
  broken = false;
  calls.length = 0;
  const again = buttonNamed(section(m, 'البيانات'), 'أعد المحاولة');
  again.click();
  again.click();
  await settle(10);
  assert.deepEqual(calls, [IDS[1]], 'تشغيل واحد');
  assert.ok(textOf(section(m, 'البيانات')).includes('أضيف 3 · تُخطّي 0 · استُبدل 0 · تعذّر 0'));
});

test('«التخزين»: عدد الترجمات وأحجام الترجمات غير النشطة والنسخ السابقة', async () => {
  const { store } = await sourceBackup();
  const m = await mount({ store, area: createMemoryArea() });
  await settle(10);
  const sec = section(m, 'التخزين');
  assert.ok(textOf(sec).includes('الترجمات المحفوظة: 4 · الفيديوهات المترجمة: 2'), textOf(sec));
  assert.match(textOf(sec), /الترجمات غير النشطة \d+ ك\.ب · النسخ السابقة \d+ ك\.ب/);
});

test('تدقيق 7a66f91 (U05، Q10): نسخة أُطفئت فيها الصور تُظهر ذلك في المعاينة، وتُبقيها مطفأة بلا اختيار الإعدادات، وتذكره في التقرير', async () => {
  const src = newStore();
  await src.store.updateVideo(IDS[0], () => videoRecord({ videoId: IDS[0] }));
  await src.store.setPrefs({ ui: { thumbnails: false } });
  await src.area.flush();
  const built = await createBackup({ store: src.store, appVersion: '1.1.0', pause: noPause });
  const { area, store } = newStore();
  const m = await mount({ store, area });
  assert.equal((await store.getPrefs()).ui.thumbnails, true);
  m.pick(asFile(built.text));
  let seen = null;
  m.answers.push((o) => { seen = o; });
  await m.settings.data.restoreFromFile();
  assert.ok(textOf(seen.content).includes('صور الفيديو في المحفوظات مطفأة في هذه النسخة، فتبقى مطفأة على هذا الجهاز بعد الاستعادة.'));
  await settle(10);
  assert.equal((await store.getPrefs()).ui.thumbnails, false);
  const sec = section(m, 'البيانات');
  assert.ok(textOf(sec).includes('بقيت صور الفيديو في المحفوظات مطفأة كما في النسخة.'));
  assert.equal(textOf(sec).includes('استُعيدت الإعدادات والقاموس'), false, 'الإعدادات لم تُختر');
});
