// الجولة الرابعة (بند سلطان): أسماء الملفات والمعرّفات داخل نصوص المحفوظات العربية معزولة LTR، وفي الـDOM عنصرٌ ذري يلتف داخله فلا
// ينكسر الاسم مع الجملة فتنقلب أجزاؤه (كما ظهر «نُزّل …» في المشغّل). واسم الخانة (يكتبه المستخدم) معزول اتجاهًا (FSI…PDI) كالمحرّر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { withoutSlot } from '../../../../src/core/model/bundle.js';
import { deleteContent } from '../../../../src/pages/library/delete.js';
import { chipLabel, deleteSummary, nameHintText } from '../../../../src/pages/library/model.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { buttonNamed, findAll, newDocument, settle } from './fake-dom.js';

const LRI = String.fromCodePoint(0x2066);
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const ID = 'AAAAAAAAAAA';
// أسماء طويلة تنكسر أسطرها في حوار، وأولها شرطة، واسم بلا فواصل.
const NAMES = ['KA3zmDkEUQs.en.from-ar.asr.normal.srt', '-KA3zmDkEUQs.ar.dual-en-GB.from-ar.asr.normal.part12of12.srt', 'My_Translation_Final_Version_2026_11_14_without_any_breaks.srt'];
const bdis = (root) => findAll(root, (e) => e.tagName === 'bdi');

test('حوار الحذف: «الترجمة 2 «…» — ملف …» واسم الملف الطويل عنصر bdi ذري معزول LTR يلتف داخله، والنص المرئي كما هو', () => {
  for (const name of NAMES) {
    const b = sampleBundle();
    b.slots[1].track = { ...b.slots[1].track, fileName: name };
    const summary = deleteSummary(b, { scope: 'slot', n: 2 });
    assert.equal(summary.items[0], `الترجمة 2 «${FSI}مراجعة${PDI}» — ملف ${LRI}${name}${PDI}`);
    const doc = newDocument();
    const li = deleteContent({ doc, summary, note: 'لا تراجع.' }).querySelector('ul.lib-del__list li');
    assert.equal(li.textContent, summary.items[0], 'النص المرئي كما هو');
    const [iso] = bdis(li);
    assert.ok(iso, 'الاسم داخل عنصر');
    assert.equal(iso.dir, 'ltr');
    assert.ok(iso.classList.contains('tj-ltr') && iso.classList.contains('tj-ltr--wrap'), 'ذري يلتف داخله');
    assert.equal(iso.textContent, `${LRI}${name}${PDI}`);
    assert.equal(li.childNodes.filter((n) => n !== iso).map((n) => n.textContent).join('').includes(name), false, 'لا شيء من الاسم خارج عنصره');
  }
});

test('تنبيه الاسم بلا عنوان محفوظ: المعرّف معزول LTR بين القوسين (شرطة أوله لا تنتقل إلى آخره)', () => {
  const text = nameHintText({ differs: true, videoId: '-KA3zmDkEUQ' });
  assert.equal(text, `الاسم يشير إلى فيديو آخر (${LRI}-KA3zmDkEUQ${PDI}).`);
});

test('شريحة الخانة باسم لاتيني: الاسم معزول اتجاهًا (FSI…PDI)', () => {
  assert.equal(chipLabel({ n: 2, name: 'Pro (v2).' }), `2 · ${FSI}Pro (v2).${PDI}`);
  assert.equal(chipLabel({ n: 3, name: null }), 'الترجمة 3');
});

test('حوار «رفع ترجمة»: اسم الملف المرفوع عنصر ذري يلتف داخله فلا يفيض خارج الحوار', async () => {
  for (const name of NAMES) {
    let t = Date.parse(NOW);
    const area = createMemoryArea({ unlimited: true });
    const store = createStore({ area, now: () => (t += 1000) });
    await store.updateVideo(ID, () => ({ ...videoRecord({ videoId: ID, cues: makeCues(3), arabic: false }), title: 'محاضرة' }));
    await store.getSettings();
    await area.flush();
    const doc = newDocument();
    const srt = makeCues(3).map((c) => `${c.n}\n00:00:0${c.n},000 --> 00:00:0${c.n},900\nترجمة ${c.n}\n`).join('\n');
    let seen = null;
    const lib = createLibrary({
      store, doc, now: () => Date.parse(NOW) + 60000,
      openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
      pickFiles: async () => [new File([srt], name)], diagnosticsText: async () => '{}',
      confirm: async (o) => { seen = o.content; return false; },
      setTimer: () => 0, clearTimer: () => {},
    });
    doc.body.append(lib.root);
    await lib.load();
    buttonNamed(lib.root, 'رفع ترجمة').click();
    await settle(20);
    assert.ok(seen, `حوار الرفع لـ${name}`);
    const iso = bdis(seen).find((e) => e.textContent === name);
    assert.ok(iso, 'اسم الملف في عنصر معزول');
    assert.equal(iso.dir, 'ltr');
    assert.ok(iso.classList.contains('tj-ltr--wrap'), 'يلتف داخل عنصره');
  }
});

test('سطر النسخة السابقة: اسم ملفها في التلميح معزول LTR (أوله لا يُقرأ اتجاهًا للتلميح كله)', async () => {
  const b = sampleBundle({ videoId: ID, third: true });
  b.previous = { ...b.previous, from: 3, track: { ...b.previous.track, fileName: NAMES[1] } };
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await seedBundle(store, b);
  await store.updateBundle(ID, (cur) => ({ ...withoutSlot(cur, 3, NOW), previous: cur.previous }));
  await store.updateBundle(ID, (cur) => ({ ...withoutSlot(cur, 2, NOW), previous: cur.previous }));
  await area.flush();
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3600 * 1000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => null, diagnosticsText: async () => '{}', confirm: async () => false, setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  buttonNamed(lib.root.querySelectorAll('li.lib-row').find((r) => r.getAttribute('data-video') === ID), 'إظهار الترجمات').click();
  await settle(10);
  const title = lib.root.querySelector('.lib-exp__extra .lib-prevl .lib-prevl__text').getAttribute('title');
  assert.ok(title.startsWith(`${LRI}${NAMES[1]}${PDI} · `), title);
});

test('تحقق 2.3.0 (ص-١٨): حوار الرفع بجزأين بينهما فجوة: اسما الجزأين في التحذير عنصران ذريان معزولان LTR', async () => {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await store.updateVideo(ID, () => ({ ...videoRecord({ videoId: ID, cues: makeCues(6), arabic: false }), title: 'محاضرة' }));
  await store.getSettings();
  await area.flush();
  const doc = newDocument();
  const srt = (ns) => ns.map((n) => `${n}\n00:00:0${n},000 --> 00:00:0${n},900\nترجمة ${n}\n`).join('\n');
  const [a, b] = [NAMES[1], NAMES[1].replace('part12of12', 'part13of12')];
  let seen = null;
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 60000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => [new File([srt([1, 2])], a), new File([srt([5, 6])], b)], diagnosticsText: async () => '{}',
    confirm: async (o) => { seen = o.content; return false; },
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  buttonNamed(lib.root, 'رفع ترجمة').click();
  await settle(20);
  assert.ok(seen, 'حوار الرفع');
  const warn = findAll(seen, (e) => e.tagName === 'p' && e.textContent.includes('فجوة في الترقيم'))[0];
  assert.ok(warn, 'تحذير الفجوة');
  assert.equal(warn.textContent, `بين «${LRI}${a}${PDI}» و«${LRI}${b}${PDI}» فجوة في الترقيم (3–4). قد يكون جزء ناقصًا.`);
  const iso = bdis(warn);
  assert.deepEqual(iso.map((e) => e.textContent), [`${LRI}${a}${PDI}`, `${LRI}${b}${PDI}`]);
  for (const e of iso) assert.ok(e.dir === 'ltr' && e.classList.contains('tj-ltr--wrap'), 'ذري يلتف داخله');
});
