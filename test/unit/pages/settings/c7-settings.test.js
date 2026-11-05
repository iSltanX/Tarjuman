// تدقيق 7a66f91، المرحلة C7 (صفحة الإعدادات): نموذج البلاغ لا يعيد عقد role=alert مع كل حرف (U52) ولا يضع فقرة ابنًا لـdl
// (U58) والنسخ يعمل أثناء الإرسال (U59)، والاستعادة تقول حال كل قسم وتعيد المتعذّر وحده (U54)، والمسح يُقال نجاحه وما تعذّر
// بعده (U56)، والنسخة الجزئية والكبيرة برسالتيهما (U94، U55)، والفتح الأول لا يكتب جزء العنوان (U57)، وزرّا «استعادة الافتراضي»
// باسمين، والقاموس لا يُعاد بناؤه بلا تغيير ويحفظ التركيز (U58)، و«مخصص» يزول بالاستعادة (U59)، وأسماء المفاتيح بتسمية صفها (U87).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup } from '../../../../src/core/backup/index.js';
import { TjError, messageFor } from '../../../../src/core/errors/index.js';
import { altsKey } from '../../../../src/core/store/keys.js';
import { createStore } from '../../../../src/core/store/index.js';
import { reportPanel } from '../../../../src/pages/settings/report.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { samplePrefs, sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const IDS = ['AAAAAAAAAAA', 'BBBBBBBBBBB'];
const noPause = () => Promise.resolve();
const DIAG = { appVersion: '1.1.0', os: 'macos', osVersion: '15.6.1', arch: 'arm64', browser: 'Google Chrome', browserVersion: '156.0.7650.10', buildTarget: 'chromium', test: false };

function newStore(area = createMemoryArea({ unlimited: true })) {
  let t = Date.parse(NOW);
  return { area, store: createStore({ area, now: () => (t += 1000) }) };
}

async function mount({ store, area, env = {} } = {}) {
  if (!store) ({ store, area } = newStore());
  await area?.flush?.();
  const doc = newDocument();
  const calls = { saves: [], confirms: [] };
  const answers = [];
  let picked = null;
  const settings = createSettings({
    store, doc, version: '1.1.0', now: () => Date.parse('2026-11-05T10:00:00.000Z'), pause: noPause,
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    saveFile: async (file) => { calls.saves.push(file); return { ok: true, mode: 'downloads', downloadId: calls.saves.length }; },
    savedPath: async () => null,
    pickFile: async () => picked,
    confirm: async (o) => { calls.confirms.push(o); const a = answers.shift(); if (typeof a === 'function') await a(o); return a !== undefined && a !== false; },
    setTimer: () => 0, clearTimer: () => {},
    ...env,
  });
  doc.body.append(settings.root);
  await settings.load();
  return { settings, store, area, doc, calls, answers, root: settings.root, pick: (f) => { picked = f; } };
}
const sectionOf = (m, id) => m.root.querySelector(`#${id}`);
const checkbox = (root, label) => findAll(root, (e) => e.tagName === 'input' && e.getAttribute('type') === 'checkbox').find((b) => textOf(b.parentNode) === label);
const asFile = (text) => ({ size: text.length, text: async () => text });
const markText = (root) => findAll(root, (e) => e.classList.contains('tj-saved')).map(textOf).filter(Boolean);

function reportHarness({ send } = {}) {
  const doc = newDocument();
  const copies = [];
  const panel = reportPanel({
    doc,
    env: {
      diagnostics: async () => DIAG, requestPermission: () => Promise.resolve(true),
      send: send ?? (async () => ({ ok: false, failure: 'server', status: 500 })),
      copy: async (t) => { copies.push(t); }, newKey: () => '00000001-0000-4000-8000-000000000000',
    },
  });
  doc.body.append(panel.root);
  const textarea = panel.root.querySelector('textarea');
  const type = (v) => { textarea.value = v; textarea.dispatchEvent({ type: 'input' }); };
  return { doc, panel, type, copies, root: panel.root };
}

test('U52: بعد فشل الإرسال لا تُدرج عقدة role=alert جديدة مع كل حرف، وسطر الأسرار لا يُعاد كتابته', async () => {
  const h = reportHarness();
  h.panel.open();
  await settle();
  h.type('وصف أول');
  buttonNamed(h.root, 'أرسل البلاغ').click();
  await settle(5);
  const failed = h.root.querySelector('.st-report__failed');
  assert.ok(failed);
  for (const v of ['وصف أول ث', 'وصف أول ثا', 'وصف أول ثان']) h.type(v);
  assert.ok(h.root.querySelector('.st-report__failed') === failed, 'العقدة نفسها');
  const secret = h.root.querySelector('.st-report__secret');
  h.type('sessionid=abcdef0123456789abcdef0123456789');
  const node = secret.childNodes[0];
  h.type('sessionid=abcdef0123456789abcdef0123456789 ');
  assert.ok(secret.childNodes[0] === node, 'النص لم يُعَد كتابته');
});

test('U58 (UI-03): قبل قراءة التشخيص وعند فشلها أبناء dl أزواجه وحدها، والحال فقرة خارجها', async () => {
  let release;
  const doc = newDocument();
  const panel = reportPanel({ doc, env: { diagnostics: () => new Promise((r) => { release = r; }), requestPermission: () => Promise.resolve(true), send: async () => ({ ok: true, id: 1 }), copy: async () => {}, newKey: () => '00000001-0000-4000-8000-000000000000' } });
  doc.body.append(panel.root);
  panel.open();
  await settle();
  const dl = panel.root.querySelector('dl');
  assert.equal(dl.children.length, 0);
  assert.equal(dl.hidden, true);
  assert.match(textOf(panel.root.querySelector('.st-report__rows-status')), /يُقرأ إصدار المتصفح/);
  release(DIAG);
  await settle(3);
  assert.ok([...dl.children].every((c) => c.tagName === 'div'));
  assert.equal(dl.hidden, false);
});

test('U59 (L-20): «انسخ البلاغ» يعمل أثناء الإرسال ويُقال، والانشغال على زر الإرسال وحده', async () => {
  let finish;
  const h = reportHarness({ send: () => new Promise((r) => { finish = r; }) });
  h.panel.open();
  await settle();
  h.type('وصف');
  buttonNamed(h.root, 'أرسل البلاغ').click();
  await settle(3);
  const copy = buttonNamed(h.root, 'انسخ البلاغ');
  assert.equal(copy.getAttribute('aria-busy'), 'false');
  assert.equal(copy.hasAttribute('aria-disabled'), false);
  copy.click();
  await settle(3);
  assert.equal(h.copies.length, 1, 'نُسخ والإرسال جارٍ');
  assert.match(textOf(h.root.querySelector('.st-report__result')), /يُرسل البلاغ…نُسخ البلاغ نصًّا\./);
  finish({ ok: true, id: 7, replayed: false });
  await settle(3);
  assert.match(textOf(h.root.querySelector('.st-report__result')), /#7/);
});

test('U54: الاستعادة عبر الصفحة — تعذّر القاموس بعد نجاح الإعدادات يُقال بعينه، و«أعد المحاولة» لا تكتب الإعدادات ثانية', async () => {
  const src = newStore();
  await seedBundle(src.store, sampleBundle({ videoId: IDS[0] }));
  await src.store.setSettings({ offsetStepMs: 1000 });
  await src.store.setPrefs(samplePrefs());
  const built = await createBackup({ store: src.store, appVersion: '1.1.0', pause: noPause });
  const dst = newStore();
  const calls = { settings: 0, prefs: 0 };
  let failPrefs = true;
  const faulty = Object.create(dst.store);
  faulty.setSettings = (p) => { calls.settings++; return dst.store.setSettings(p); };
  faulty.setPrefs = (p) => { calls.prefs++; if (failPrefs) { failPrefs = false; return Promise.reject(new TjError('ST_WRITE_FAILED')); } return dst.store.setPrefs(p); };
  const m = await mount({ store: faulty, area: dst.area });
  m.pick(asFile(built.text));
  m.answers.push((o) => { checkbox(o.content, 'استعادة الإعدادات والقاموس').checked = true; });
  await m.settings.data.restoreFromFile();
  await settle(10);
  const sec = sectionOf(m, 'data');
  assert.ok(textOf(sec).includes(messageFor('BK_RESTORE_PREFS_PART_FAILED')));
  assert.equal(textOf(sec).includes(messageFor('BK_RESTORE_SETTINGS_FAILED')), false, 'لا «بقيت الحالية كما هي» عن القسمين');
  await dst.store.setSettings({ offsetStepMs: 900 });
  buttonNamed(sec, 'أعد المحاولة').click();
  await settle(15);
  assert.equal(calls.settings, 1, 'الإعدادات لم تُكتب ثانية');
  assert.equal((await dst.store.getSettings()).offsetStepMs, 900, 'تغيير المستخدم باقٍ');
  assert.equal((await dst.store.getPrefs()).glossary.terms.length, samplePrefs().glossary.terms.length, 'القاموس استُعيد');
  assert.ok(textOf(sec).includes(messageFor('BK_RESTORE_DONE')));
});

test('U56: المسح الناجح ثم تعذّر التهيئة يُقال «مُسحت» مع تنبيه، لا «خطأ غير متوقع»', async () => {
  const base = createMemoryArea({ unlimited: true });
  let breakMeta = false;
  const area = { ...base, async set(items) { if (breakMeta && Object.hasOwn(items, 'meta')) { breakMeta = false; throw new Error('synthetic'); } return base.set(items); }, flush: base.flush };
  const { store } = newStore(area);
  await seedBundle(store, sampleBundle({ videoId: IDS[0] }));
  const m = await mount({ store, area });
  const clearBtn = buttonNamed(sectionOf(m, 'storage'), 'مسح كل البيانات');
  m.answers.push((o) => { o.content.querySelector('input').value = 'امسح'; });
  breakMeta = true;
  clearBtn.click();
  await settle(15);
  const sec = sectionOf(m, 'storage');
  assert.ok(markText(sec).some((x) => x.includes(messageFor('PG_CLEAR_DONE'))));
  assert.equal(markText(sec).some((x) => x.includes(messageFor('TJ_UNEXPECTED'))), false);
  assert.ok(textOf(sec).includes(messageFor('PG_CLEAR_REINIT_FAILED')));
});

test('U94 وU55 عبر الصفحة: نسخة بتابع تالف «جزئية» بما استُبعد ومعرّف معزول، و«الملف أكبر» برمز النسخة لا «صدّره من المحفوظات»', async () => {
  const { area, store } = newStore();
  await seedBundle(store, sampleBundle({ videoId: IDS[0], third: true }));
  await area.flush();
  area.rawSet(altsKey(IDS[0]), { schema: 1, videoId: IDS[0], slots: 'تالف' });
  const m = await mount({ store, area });
  await m.settings.data.makeBackup(sectionOf(m, 'data').querySelector('.st-data__result'), { includePrevious: true, meter: { show: () => () => {}, hide: () => {} } });
  const text = textOf(sectionOf(m, 'data'));
  assert.ok(text.includes(messageFor('BK_CREATED_PARTIAL', { videos: 'فيديو واحد' })));
  assert.ok(text.includes(`⁦${IDS[0]}⁩: استُبعد الترجمات غير النشطة`), 'المعرّف معزول LTR');
  assert.equal(m.calls.saves.length, 1, 'حُفظت النسخة');
  const big = await mount({ env: { saveFile: async () => ({ ok: false, code: 'SV_TOO_LARGE' }) } });
  await big.settings.data.makeBackup(sectionOf(big, 'data').querySelector('.st-data__result'), { includePrevious: true, meter: { show: () => () => {}, hide: () => {} } });
  const t2 = textOf(sectionOf(big, 'data'));
  assert.equal(t2.includes('صدّره من المحفوظات'), false);
  assert.match(t2, /أكبر من أن تُنسخ في ملف واحد/);
});

test('U59 (L-24): نسخة لا شيء فيها يُستعاد تذكر السبب لا الجملة وحدها', async () => {
  const src = newStore();
  await seedBundle(src.store, sampleBundle({ videoId: IDS[0] }));
  const built = await createBackup({ store: src.store, appVersion: '1.1.0', pause: noPause });
  const file = JSON.parse(built.text);
  file.data.settings = null;
  file.data.prefs = null;
  file.data.videos[0].record.rev = 'x';
  const { countData, sha256Hex } = await import('../../../../src/core/backup/index.js');
  file.counts = countData(file.data);
  file.integrity.hash = await sha256Hex(JSON.stringify(file.data));
  const m = await mount();
  m.pick(asFile(JSON.stringify(file)));
  await m.settings.data.restoreFromFile();
  const text = textOf(sectionOf(m, 'data'));
  assert.ok(text.includes(messageFor('BK_NOTHING')));
  assert.ok(text.includes(messageFor('BK_VIDEO_INVALID')), 'والسبب');
  assert.ok(text.includes(`⁦${IDS[0]}⁩`));
});

test('U57: الفتح الأول بلا جزء في العنوان لا يكتبه (كان يمرّر الصفحة إلى القسم)، والتنقل يكتبه', async () => {
  const writes = [];
  const nav = { get: () => null, set: (id) => writes.push(id), onChange: () => () => {} };
  const m = await mount({ env: { nav } });
  assert.deepEqual(writes, []);
  assert.equal(m.settings.active, 'display');
  m.root.querySelector('a[data-section="timing"]').click();
  assert.deepEqual(writes, ['timing']);
});

test('U58: زرّا «استعادة الافتراضي» في «التصدير» باسمين مختلفين، وكل زر قسم يسمّي قسمه', async () => {
  const m = await mount();
  const names = findAll(sectionOf(m, 'export'), (e) => e.tagName === 'button' && textOf(e).includes('استعادة الافتراضي')).map((b) => b.getAttribute('aria-label') ?? textOf(b));
  assert.equal(names.length, 2);
  assert.equal(new Set(names).size, 2, names.join(' | '));
  assert.ok(names.includes('استعادة افتراضي مكان الحفظ'));
  assert.ok(names.some((n) => n.startsWith('استعادة الافتراضي: ')));
});

test('U58: جدول القاموس لا يُعاد بناؤه بحفظ لا يمس المصطلحات، وحذف مصطلح ينقل التركيز إلى حذف التالي', async () => {
  const { area, store } = newStore();
  await store.setPrefs(samplePrefs());
  const m = await mount({ store, area });
  m.settings.select('glossary'); // القسم المخفي لا يُركَّز فيه (U72)
  const body = sectionOf(m, 'glossary').querySelector('tbody');
  const dels = () => body.querySelectorAll('button');
  const first = dels()[0];
  first.focus();
  await store.setSettings({ offsetStepMs: 1000 });
  await area.flush();
  await settle(5);
  assert.ok(dels()[0] === first, 'لم يُعد بناؤه');
  assert.ok(m.doc.activeElement === first);
  const n = dels().length;
  first.click();
  await settle(5);
  assert.equal(dels().length, n - 1);
  assert.ok(m.doc.activeElement === dels()[0], 'التركيز على حذف المصطلح الذي حلّ محله');
});

test('U59 (TJ-AUD-017a): «مخصص» لا يبقى محددًا بعد «استعادة الافتراضي» في التوقيت', async () => {
  const m = await mount();
  const sec = sectionOf(m, 'timing');
  const custom = findAll(sec, (e) => e.tagName === 'input' && e.getAttribute('value') === 'custom')[0];
  custom.checked = true;
  custom.dispatchEvent({ type: 'change' });
  const input = sec.querySelector('.st-custom input');
  input.value = '2';
  input.dispatchEvent({ type: 'change' });
  await settle(5);
  assert.equal(m.settings.settings.offsetStepMs, 2000);
  buttonNamed(sec, 'استعادة الافتراضي').click();
  await settle(5);
  assert.equal(m.settings.settings.offsetStepMs, 500);
  const checked = findAll(sec, (e) => e.tagName === 'input' && e.getAttribute('type') === 'radio' && e.checked).map((e) => e.getAttribute('value'));
  assert.deepEqual(checked, ['0.5']);
  assert.equal(sec.querySelector('.st-custom').hidden, true);
});

test('U87: اسم كل مفتاح في «العرض» يبدأ بتسمية صفه ثم نص حاله', async () => {
  const m = await mount();
  const sec = sectionOf(m, 'display');
  const switches = findAll(sec, (e) => e.getAttribute('role') === 'switch');
  assert.equal(switches.length, 3);
  for (const s of switches) {
    const ids = (s.getAttribute('aria-labelledby') ?? '').split(' ');
    assert.equal(ids.length, 2);
    const [rowLabel, stateText] = ids.map((id) => m.doc.getElementById(id));
    assert.ok(rowLabel?.classList.contains('tj-label'), `تسمية الصف لـ${s.getAttribute('id')}`);
    assert.ok(stateText?.classList.contains('st-switch__label'));
  }
  const names = switches.map((s) => s.getAttribute('aria-labelledby').split(' ').map((id) => textOf(m.doc.getElementById(id))).join('، '));
  assert.ok(names.some((n) => n.startsWith('لوحة النص المتزامن، ')), names.join(' | '));
});

test('U59 (المراجعة المستقلة): نسخٌ بدأ أثناء الإرسال وانتهى بعده لا يكتب فوق نتيجة الإرسال', async () => {
  let finishSend;
  let finishCopy;
  const doc = newDocument();
  const panel = reportPanel({
    doc,
    env: {
      diagnostics: async () => DIAG, requestPermission: () => Promise.resolve(true),
      send: () => new Promise((r) => { finishSend = r; }), copy: () => new Promise((r) => { finishCopy = r; }),
      newKey: () => '00000001-0000-4000-8000-000000000000',
    },
  });
  doc.body.append(panel.root);
  panel.open();
  await settle();
  const ta = panel.root.querySelector('textarea');
  ta.value = 'وصف';
  ta.dispatchEvent({ type: 'input' });
  buttonNamed(panel.root, 'أرسل البلاغ').click();
  await settle(3);
  buttonNamed(panel.root, 'انسخ البلاغ').click();
  await settle(3);
  finishSend({ ok: true, id: 9, replayed: false });
  await settle(3);
  finishCopy();
  await settle(3);
  assert.match(textOf(panel.root.querySelector('.st-report__result')), /#9/, 'رقم البلاغ باقٍ');
});
