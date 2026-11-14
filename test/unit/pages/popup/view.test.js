// نافذة الأيقونة: خطوات «بلا ترجمة عربية» من حالة الأصل الفعلية، وصف «زر النص المتزامن مخفي»
// يكتب prefs.ui.panelEntry ويزول حين يظهر الزر ويقول النتيجة كما حدثت، وبطاقة الفيديو بحالاتها، وسطر آخر الترجمات.
// الـDOM وهمي فوق تخزين حقيقي بمحاكاة. لا تُمرَّر عقدة إلى assert.equal (انظر fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { messageFor } from '../../../../src/core/errors/index.js';
import { DEFAULT_PREFS } from '../../../../src/core/model/prefs.js';
import { createStore } from '../../../../src/core/store/index.js';
import { ENTRY_TEXT, bindEntryRow } from '../../../../src/pages/popup/entry.js';
import { describeStatus, entryHidden, guideSteps, guideText, originDownloaded, recentLine, toolsStatus } from '../../../../src/pages/popup/status.js';
import { notVideoText, guideList, notVideoNote, skeletonCard, statusCard } from '../../../../src/pages/popup/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const reply = (over = {}) => ({
  v: 1, ok: true, watch: true, videoId: 'iG9CE55wbtY', title: 'How the Printing Press Changed Everything', loading: false,
  english: { captured: [], saved: [] }, arabic: null, view: { displayOffsetMs: 0, displayMode: 'ar' },
  mounted: { overlay: 'mounted', controls: 'mounted' }, ...over,
});
const withArabic = (over = {}) => reply({ arabic: { fileName: 'x.ar.srt', cueCount: 412, edited: false, matched: true }, view: { displayOffsetMs: 500, displayMode: 'dual' }, ...over });
const captured = { captured: [{ key: 'en|manual', kind: 'manual', cueCount: 5, ok: true }], saved: [] };
const savedOnly = { captured: [], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 5 }] };

function newStore() {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  return { area, store: createStore({ area, now: () => (t += 1000) }) };
}

test('ق-3: التنزيل يُعرف من مراجع المقارنة في سجل الفيديو، وتعذّر القراءة ليس تنزيلًا', async () => {
  const store = (record) => ({ getVideo: async () => record });
  const r = { videoId: 'aaaaaaaaaaa' };
  assert.equal(await originDownloaded(store({ fingerprints: [{ id: 'x' }] }), r), true);
  assert.equal(await originDownloaded(store({ fingerprints: [] }), r), false, 'سجل بلا تنزيل');
  assert.equal(await originDownloaded(store(null), r), false, 'لا سجل');
  assert.equal(await originDownloaded(store({ fingerprints: [{ id: 'x' }] }), { videoId: null }), false, 'لا فيديو');
  assert.equal(await originDownloaded({ getVideo: async () => { throw new Error('تعذر'); } }, r), false, 'فشل القراءة');
});

test('الخطوات: الأصل غير ملتقط فالأولى هي الحالية والباقيتان منتظرتان', () => {
  const steps = guideSteps(reply());
  assert.deepEqual(steps.map((s) => s.text), guideText());
  assert.deepEqual(steps.map((s) => s.state), ['now', 'pending', 'pending']);
  assert.deepEqual(guideText(), ['نزّل الأصل من زر التنزيل في الشريط', 'انسخ التعليمات وأرسلها مع الملف إلى نموذج الذكاء الاصطناعي ليترجمه', 'ارفع الملف المترجم من زر «رفع الترجمة (SRT)» في شريط المشغّل']);
  // بالزوج المختار يُذكر بلغتيه (AA3)، لا «الإنجليزي» و«العربية» الثابتان.
  assert.deepEqual(guideSteps(reply(), { from: 'ja', to: 'en' }).map((s) => s.text), ['نزّل الأصل (اليابانية) من زر التنزيل في الشريط', 'انسخ التعليمات وأرسلها مع الملف إلى نموذج الذكاء الاصطناعي ليترجمه إلى الإنجليزية', 'ارفع الملف المترجم من زر «رفع الترجمة (SRT)» في شريط المشغّل']);
});

test('ق-3: الأولى منجزة بتنزيل الأصل فعلًا، والتقاطه أو حفظه وحده يبقيها الحالية', () => {
  for (const english of [captured, savedOnly]) {
    assert.deepEqual(guideSteps(reply({ english })).map((s) => s.state), ['now', 'pending', 'pending'], 'بلا تنزيل');
    assert.deepEqual(guideSteps(reply({ english }), {}, true).map((s) => s.state), ['done', 'now', 'pending'], 'بعد التنزيل');
  }
  // مسار فاشل ليس ملتقطًا: تبقى الأولى هي الحالية.
  const failed = reply({ english: { captured: [{ key: 'en|asr', kind: 'asr', cueCount: 0, ok: false }], saved: [] } });
  assert.deepEqual(guideSteps(failed).map((s) => s.state), ['now', 'pending', 'pending']);
});

test('الخطوات: لا تظهر إلا لفيديو بلا ترجمة عربية (ليست صفحة فيديو، أو جارٍ، أو بترجمة)', () => {
  assert.equal(guideSteps(null), null);
  assert.equal(guideSteps(reply({ watch: false, videoId: null })), null);
  assert.equal(guideSteps(reply({ loading: true })), null);
  assert.equal(guideSteps(withArabic()), null);
});

test('قائمة الخطوات: منجزة بعلامة ✓، والحالية aria-current=step، وكل حالة بنص لقارئ الشاشة', () => {
  const doc = newDocument();
  const list = guideList(guideSteps(reply({ english: captured }), {}, true), doc);
  const items = findAll(list, (e) => e.tagName === 'li');
  assert.equal(items.length, 3);
  assert.deepEqual(items.map((li) => li.getAttribute('data-state')), ['done', 'now', 'pending']);
  assert.deepEqual(items.map((li) => li.getAttribute('aria-current')), [null, 'step', null]);
  assert.equal(findAll(items[0], (e) => e.tagName === 'svg').length, 1, 'علامة ✓ للمنجزة');
  assert.equal(findAll(items[1], (e) => e.tagName === 'svg').length, 0, 'الحالية برقمها');
  assert.equal(textOf(items[1].querySelector('.tj-popup__step-n')), '2');
  assert.ok(textOf(items[0]).includes('تمّت') && textOf(items[1]).includes('الخطوة الحالية') && textOf(items[2]).includes('لاحقًا'));
  assert.ok(textOf(items[0]).includes('نزّل الأصل من زر التنزيل في الشريط'));
});

test('صف «زر النص المتزامن مخفي»: لا يظهر والزر ظاهر، ويظهر حين panelEntry=false', async () => {
  const doc = newDocument();
  const { store } = newStore();
  const host = doc.createElement('div');
  const entry = bindEntryRow({ store, host, doc });
  await entry.ready;
  assert.equal(host.querySelector('.tj-popup__entry'), null, 'الافتراضي: الزر ظاهر فلا صف');
  assert.equal(entryHidden(DEFAULT_PREFS), false);

  await store.setPrefs({ ui: { panelEntry: false } });
  const host2 = doc.createElement('div');
  const entry2 = bindEntryRow({ store, host: host2, doc });
  await entry2.ready;
  const row = host2.querySelector('.tj-popup__entry');
  assert.ok(row, 'الصف ظاهر');
  assert.ok(textOf(row).includes(ENTRY_TEXT.hidden) && ENTRY_TEXT.hidden === 'زر النص المتزامن مخفي');
  assert.ok(buttonNamed(row, 'إظهار'), 'زر «إظهار»');
});

test('«إظهار» يكتب prefs.ui.panelEntry=true في التخزين ويزول الصف، ويقول النتيجة، ولا يمسّ بقية التفضيلات', async () => {
  const doc = newDocument();
  const { store } = newStore();
  await store.setPrefs({ ui: { panelEntry: false, thumbnails: false, panelOpen: true }, glossary: { attach: false } });
  const host = doc.createElement('div');
  const entry = bindEntryRow({ store, host, doc });
  await entry.ready;
  buttonNamed(host.querySelector('.tj-popup__entry'), 'إظهار').click();
  await settle();
  const prefs = await store.getPrefs();
  assert.equal(prefs.ui.panelEntry, true, 'كُتب في التخزين');
  assert.deepEqual([prefs.ui.thumbnails, prefs.ui.panelOpen, prefs.glossary.attach], [false, true, false], 'الدمج داخل المجموعة: غيره لم يتغير');
  assert.equal(host.querySelector('.tj-popup__entry'), null, 'الصف زال');
  assert.equal(host.querySelector('[data-action="show-entry"]'), null);
  assert.ok(textOf(host.querySelector('[role="status"]')).includes(ENTRY_TEXT.done), 'النتيجة في منطقة حيّة');
});

test('فشل الكتابة: يقال الفشل والصف باقٍ ليُعاد الضغط، ولا يُعلن إظهارٌ لم يحدث', async () => {
  const doc = newDocument();
  const { store, area } = newStore();
  await store.setPrefs({ ui: { panelEntry: false } });
  const host = doc.createElement('div');
  const entry = bindEntryRow({ store, host, doc });
  await entry.ready;
  area.failNext('set');
  buttonNamed(host.querySelector('.tj-popup__entry'), 'إظهار').click();
  await settle();
  assert.equal((await store.getPrefs()).ui.panelEntry, false, 'لم يُكتب');
  assert.ok(host.querySelector('.tj-popup__entry'), 'الصف باقٍ');
  const live = textOf(host.querySelector('[role="status"]'));
  assert.ok(live.includes(messageFor('PG_SAVE_FAILED')));
  assert.equal(live.includes(ENTRY_TEXT.done), false);
  // المحاولة الثانية تنجح.
  buttonNamed(host.querySelector('.tj-popup__entry'), 'إظهار').click();
  await settle();
  assert.equal((await store.getPrefs()).ui.panelEntry, true);
  assert.equal(host.querySelector('.tj-popup__entry'), null);
});

test('الصف يتبع التفضيلات من سياق آخر: يظهر إن أُخفي الزر من قائمة اللوحة، ويزول إن أُظهر من الإعدادات', async () => {
  const doc = newDocument();
  const { store, area } = newStore();
  const host = doc.createElement('div');
  const entry = bindEntryRow({ store, host, doc });
  await entry.ready;
  assert.equal(host.querySelector('.tj-popup__entry'), null);
  await store.setPrefs({ ui: { panelEntry: false } });
  await area.flush();
  await settle();
  assert.ok(host.querySelector('.tj-popup__entry'), 'أُخفي من مكان آخر');
  await store.setPrefs({ ui: { panelEntry: true } });
  await area.flush();
  await settle();
  assert.equal(host.querySelector('.tj-popup__entry'), null, 'أُظهر من مكان آخر');
  entry.dispose();
});

test('تفضيلات غير مقروءة: لا صف (لا إعلان إخفاء لا نعرفه) ولا استثناء', async () => {
  const doc = newDocument();
  const host = doc.createElement('div');
  const entry = bindEntryRow({
    store: { getPrefs: async () => { throw new Error('x'); }, setPrefs: async () => DEFAULT_PREFS, onChange: () => () => {} }, host, doc,
  });
  await entry.ready;
  assert.equal(host.querySelector('.tj-popup__entry'), null);
  assert.equal(entryHidden(null), false);
  assert.equal(entryHidden({ ui: {} }), false);
});

test('بطاقة فيديو بترجمة: العنوان والسطر والشارات (محفوظ والوضع ومعدّلة وتختلف عن الأصل) وحالة الأدوات', () => {
  const doc = newDocument();
  const r = withArabic({ arabic: { fileName: 'x', cueCount: 412, edited: true, matched: false } });
  const card = statusCard(describeStatus(r), toolsStatus(r), null, doc);
  assert.equal(textOf(card.querySelector('h2')), 'How the Printing Press Changed Everything');
  assert.equal(card.querySelector('h2').dir, 'ltr');
  assert.ok(textOf(card.querySelector('.tj-popup__line')).startsWith('ترجمة بلغة غير محددة · 412 مقطعًا'));
  const pills = findAll(card, (e) => e.classList.contains('tj-pill')).map(textOf);
  assert.deepEqual(pills, ['محفوظ', 'الترجمة فوق الأصل', 'معدّلة', 'تختلف عن الأصل']);
  assert.ok(textOf(card.querySelector('.tj-popup__tools')).includes('أدوات المشغّل تعمل'));
  assert.equal(findAll(card, (e) => e.classList.contains('tj-popup__tools--success')).length, 1);
});

test('بطاقة بلا ترجمة: سطر مسار الأصل بالوصف الواحد (ح-57) وأيقونة ✓ حين يتوفر، وبلاها حين لا', () => {
  const doc = newDocument();
  const ready = reply({ english: captured });
  const card = statusCard(describeStatus(ready), toolsStatus(ready), null, doc);
  assert.ok(textOf(card.querySelector('.tj-popup__line')) === 'لا ترجمة محفوظة بعد');
  const line = card.querySelector('.tj-popup__english');
  assert.equal(textOf(line), 'الإنجليزية · يدوية · 5 مقاطع · ملتقطة');
  assert.equal(findAll(line, (e) => e.tagName === 'svg').length, 1);
  const none = reply();
  const bare = statusCard(describeStatus(none), toolsStatus(none), null, doc);
  const bareLine = bare.querySelector('.tj-popup__english');
  assert.equal(textOf(bareLine), 'لم تُلتقط ترجمة الفيديو بعد');
  assert.equal(findAll(bareLine, (e) => e.tagName === 'svg').length, 0);
});

test('زرا البطاقة «أكمل الناقص (N)» و«تحرير الترجمة» في صف واحد يلتف بفجوة، فلا يخرج الثاني عن حدها بالإنجليزية (ST1)', async () => {
  const doc = newDocument();
  const r = withArabic();
  const b = (label) => Object.assign(doc.createElement('button'), { textContent: label });
  const card = statusCard(describeStatus(r), toolsStatus(r), null, doc, [b('Complete missing (3)'), null, b('Edit translation')]);
  const row = card.querySelector('.tj-popup__actions');
  assert.deepEqual([...row.children].map((x) => textOf(x)), ['Complete missing (3)', 'Edit translation'], 'الزران في صف واحد بترتيبهما');
  // في عرض النافذة 340 يتسع الزران بالعربية في سطر ويلتفان بالإنجليزية (popup-fit: «Edit translation» كان يخرج 17px).
  const css = await readFile(new URL('../../../../src/pages/popup/popup.css', import.meta.url), 'utf8');
  const rule = /\.tj-popup__actions \{[^}]*\}/.exec(css)?.[0] ?? '';
  assert.match(rule, /flex-wrap: wrap/);
  assert.match(rule, /gap: 8px/);
});

test('خطأ ربط الأدوات: النص والسبب في البطاقة، ورفض الالتقاط سطر تحذير بنصه', () => {
  const doc = newDocument();
  const r = withArabic({
    mounted: { overlay: 'mounted', controls: 'error' }, tools: { overlay: 'mounted', controls: 'error', code: 'CT_MOUNT_FAILED' },
    capture: { state: 'rejected', count: 0, code: 'EX_NOT_ENGLISH' },
  });
  const card = statusCard(describeStatus(r), toolsStatus(r), { tone: 'warning', text: messageFor('EX_NOT_ENGLISH') }, doc);
  const tools = card.querySelector('.tj-popup__tools');
  assert.ok(tools.classList.contains('tj-popup__tools--danger'));
  assert.ok(textOf(tools).includes('تعذّر تشغيل أدوات ترجمان في المشغّل'));
  assert.ok(textOf(tools.querySelector('.tj-popup__reason')).includes(messageFor('CT_MOUNT_FAILED')));
  assert.ok(textOf(card.querySelector('.tj-popup__capture')).includes(messageFor('EX_NOT_ENGLISH')));
});

test('هيكل القراءة منشغل بوصف، وملاحظة «ليست صفحة فيديو» بنص اللوحة', () => {
  const doc = newDocument();
  const sk = skeletonCard(doc);
  assert.equal(sk.getAttribute('aria-busy'), 'true');
  assert.equal(sk.getAttribute('aria-label'), 'جارٍ قراءة حالة الفيديو');
  assert.ok(findAll(sk, (e) => e.classList.contains('tj-skeleton')).length >= 4);
  const note = notVideoNote(doc);
  assert.equal(textOf(note), notVideoText());
  assert.equal(notVideoText(), 'افتح فيديو على يوتيوب لتبدأ.');
  assert.equal(note.getAttribute('role'), 'status');
});

test('سطر آخر ترجمة: عمرها وعدد مقاطعها، أو «بانتظار الترجمة» لفيديو بلا عربية', () => {
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  assert.equal(recentLine({ updatedAt: '2026-11-03T10:00:00.000Z', arabic: { cueCount: 412 } }, now), 'قبل ساعتين · 412 مقطعًا');
  assert.equal(recentLine({ updatedAt: '2026-11-02T10:00:00.000Z', arabic: { cueCount: 238 } }, now), 'أمس · 238 مقطعًا');
  assert.equal(recentLine({ updatedAt: '2026-11-03T11:59:00.000Z', arabic: null }, now), 'قبل دقيقة · بانتظار الترجمة');
});
