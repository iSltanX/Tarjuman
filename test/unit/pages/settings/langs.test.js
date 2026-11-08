// قسم «اللغات» في الإعدادات (AA3، لوحة 15) بـDOM وهمي فوق تخزين حقيقي بمحاكاة: الزوج الافتراضي بـ«تلقائي من ترجمة الفيديو»، و«تذكّر
// آخر زوج»، واللغات الأخيرة بأسمائها بلغاتها ومسحها، ولغة الواجهة عرضًا، وتعيين لغة الترجمات بلا لغة دفعة واحدة بتأكيد ودون مساس
// بنصها، و«استعادة الافتراضي»، واتّباع التغيّر من سياق آخر. لا تُمرَّر عقدة إلى assert.equal (انظر fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { LANGS_TEXT, undeterminedLine } from '../../../../src/pages/settings/langs.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { LANG_TEXT } from '../../../../src/ui/lang-picker.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, VIDEO_ID } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

async function mount({ bundles = [], answers = [] } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  for (const b of bundles) await seedBundle(store, b);
  await area.flush();
  const doc = newDocument();
  const confirms = [];
  const settings = createSettings({
    store, doc, version: '2.0.0', clipboardWrite: async () => {}, diagnosticsText: async () => '{}',
    confirm: async (o) => { confirms.push(o); return answers.shift() ?? false; },
    setTimer: () => 0, clearTimer: () => {},
    nav: { get: () => 'langs', set: () => {}, onChange: () => () => {} },
  });
  doc.body.append(settings.root);
  await settings.load();
  await settle(20);
  return { settings, store, area, doc, confirms, sec: settings.root.querySelector('section[data-section="langs"]') };
}

const rowOf = (sec, label) => findAll(sec, (e) => e.classList.contains('st-row') && textOf(e.querySelector('.tj-label') ?? { textContent: '' }) === label)[0];
const pick = (field, code) => {
  field.click();
  const opt = findAll(field.parentNode.parentNode, (e) => e.getAttribute('data-code') === code)[0] ?? findAll(field.ownerDocument.body, (e) => e.getAttribute('data-code') === code)[0];
  opt.click();
};

test('القسم بعد «العرض»: الزوج «تلقائي من ترجمة الفيديو ⇄ العربية»، والتذكّر مفعّل، والأخيرة فارغة، ولا صف لغة واجهة هنا (خيارها في «العرض»)', async () => {
  const m = await mount();
  assert.ok(m.sec, 'القسم موجود');
  assert.equal(m.sec.hidden, false, 'فُتح على القسم');
  const pair = rowOf(m.sec, LANGS_TEXT.pair);
  const values = findAll(pair, (e) => e.classList.contains('tj-lang__v')).map(textOf);
  assert.deepEqual(values, [LANG_TEXT.auto, 'العربية']);
  assert.equal(m.sec.querySelector('#st-lang-remember').checked, true);
  assert.ok(textOf(rowOf(m.sec, LANGS_TEXT.recent)).includes(LANGS_TEXT.recentEmpty));
  assert.equal(rowOf(m.sec, 'لغة الواجهة'), undefined, 'لغة الواجهة خيار مستقل في «العرض» لا صف عرض فقط هنا');
});

test('الزوج والتذكّر يُحفظان فورًا في تفضيلات اللغات، و«تلقائي» خيار «من» وحده', async () => {
  const m = await mount();
  const [from, to] = findAll(rowOf(m.sec, LANGS_TEXT.pair), (e) => e.classList.contains('tj-lang'));
  pick(to, 'en');
  await settle();
  assert.deepEqual((await m.store.getLangPrefs()).pair, { from: 'auto', to: 'en' });
  pick(from, 'ja');
  await settle();
  assert.deepEqual((await m.store.getLangPrefs()).pair, { from: 'ja', to: 'en' });
  from.click();
  assert.ok(findAll(m.sec, (e) => e.getAttribute('data-code') === 'auto').length === 1, 'خيار «تلقائي» في قائمة «من»');
  findAll(m.sec, (e) => e.getAttribute('data-code') === 'auto')[0].click();
  await settle();
  assert.equal((await m.store.getLangPrefs()).pair.from, 'auto');
  to.click();
  assert.equal(findAll(m.sec, (e) => e.getAttribute('data-code') === 'auto').length, 0, 'لا «تلقائي» في «إلى»');
  const sw = m.sec.querySelector('#st-lang-remember');
  sw.checked = false;
  sw.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal((await m.store.getLangPrefs()).remember, false);
});

test('اللغات الأخيرة بأسمائها بلغاتها من سياق آخر، و«مسح» يفرغها؛ و«استعادة الافتراضي» تعيد الزوج والتذكّر وحدهما', async () => {
  const m = await mount();
  const other = createStore({ area: m.area });
  await other.setLangPrefs({ use: ['ja', 'en'], pair: { to: 'fr' }, remember: false });
  await m.area.flush?.();
  await settle(20);
  const chips = findAll(rowOf(m.sec, LANGS_TEXT.recent), (e) => e.classList.contains('st-lang-chip'));
  assert.deepEqual(chips.map(textOf), ['日本語', 'English']);
  assert.equal(chips[0].getAttribute('title'), 'اليابانية (ja)');
  const clear = findAll(rowOf(m.sec, LANGS_TEXT.recent), (e) => e.tagName === 'button' && textOf(e) === LANGS_TEXT.clear)[0];
  clear.click();
  await settle();
  assert.deepEqual((await m.store.getLangPrefs()).recent, []);
  const reset = findAll(m.sec, (e) => e.tagName === 'button' && (e.getAttribute('aria-label') ?? '').startsWith('استعادة الافتراضي'))[0];
  assert.equal(reset.getAttribute('aria-disabled'), 'false');
  reset.click();
  await settle();
  const p = await m.store.getLangPrefs();
  assert.deepEqual([p.pair, p.remember], [{ from: 'auto', to: 'ar' }, true]);
});

test('الترجمات بلا لغة: عددها، وتعيين لغتها دفعة واحدة بتأكيد دون مساس بنصها، ثم «كل ترجماتك محددة اللغة»', async () => {
  const m = await mount({ bundles: [sampleBundle()], answers: [true] });
  const row = rowOf(m.sec, LANGS_TEXT.unknown);
  const before = await m.store.getBundle(VIDEO_ID);
  assert.ok(textOf(row).includes(undeterminedLine(2, 1)), textOf(row));
  const apply = findAll(row, (e) => e.tagName === 'button' && textOf(e) === LANGS_TEXT.apply)[0];
  assert.equal(apply.getAttribute('aria-disabled'), 'true', 'حتى تُختار اللغة');
  pick(findAll(row, (e) => e.classList.contains('tj-lang'))[0], 'ar');
  assert.equal(apply.getAttribute('aria-disabled'), null);
  apply.click();
  await settle(40);
  assert.equal(m.confirms.length, 1);
  assert.match(m.confirms[0].title, /^تعيين العربية لـترجمتان؟$/);
  const after = await m.store.getBundle(VIDEO_ID);
  assert.equal(after.record.arabic.lang, 'ar');
  assert.equal(after.slots[1].track.lang, 'ar');
  assert.deepEqual(after.record.arabic.original, before.record.arabic.original, 'النص كما هو');
  assert.ok(textOf(row).includes(LANGS_TEXT.unknownNone));
});

test('رفض التأكيد لا يكتب شيئًا', async () => {
  const m = await mount({ bundles: [sampleBundle()], answers: [false] });
  const row = rowOf(m.sec, LANGS_TEXT.unknown);
  pick(findAll(row, (e) => e.classList.contains('tj-lang'))[0], 'fr');
  findAll(row, (e) => e.tagName === 'button' && textOf(e) === LANGS_TEXT.apply)[0].click();
  await settle(20);
  assert.equal((await m.store.getBundle(VIDEO_ID)).record.arabic.lang ?? null, null);
});

test('التعيين الجماعي (مراجعة AA3): يتخطى ما لا يوافق نصه نص كتابة اللغة المختارة ويقول عدده، ولا يمس تاريخ التعديل', async () => {
  const m = await mount({ bundles: [sampleBundle()], answers: [true, true] });
  const row = rowOf(m.sec, LANGS_TEXT.unknown);
  const before = await m.store.getBundle(VIDEO_ID);
  // نصوص العيّنة عربية: الفرنسية لا توافقها، فلا يُوسم شيء.
  pick(findAll(row, (e) => e.classList.contains('tj-lang'))[0], 'fr');
  findAll(row, (e) => e.tagName === 'button' && textOf(e) === LANGS_TEXT.apply)[0].click();
  await settle(40);
  const skipped = await m.store.getBundle(VIDEO_ID);
  assert.equal(skipped.record.arabic.lang ?? null, null, 'لم تُوسم بالفرنسية');
  assert.ok(textOf(row).includes(undeterminedLine(2, 1)), 'ما زالت غير محددة');
  assert.ok(textOf(m.sec).includes('تُخطّيت ترجمتان'), textOf(m.sec));
  // العربية توافقها: تُوسم، وتاريخ التعديل وترتيب المحفوظات كما هما.
  pick(findAll(row, (e) => e.classList.contains('tj-lang'))[0], 'ar');
  findAll(row, (e) => e.tagName === 'button' && textOf(e) === LANGS_TEXT.apply)[0].click();
  await settle(40);
  const after = await m.store.getBundle(VIDEO_ID);
  assert.equal(after.record.arabic.lang, 'ar');
  assert.equal(after.record.updatedAt, before.record.updatedAt);
});
