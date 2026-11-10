// ف1 (2026-11-10): «أكمل الناقص (N)» حيث يقول ترجمان إن مقاطع ناقصة: نافذة الإضافة (العدد الصريح والزر)، والمحفوظات (بجوار
// شارة الصف، وفي سطر نتيجة كل ترجمة)، وقائمة المشغّل سطر نصي يدل على النافذة بلا زر ولا رابط.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../src/core/store/index.js';
import { completeAction, describeStatus, toolsStatus } from '../../../src/pages/popup/status.js';
import { statusCard } from '../../../src/pages/popup/view.js';
import { createLibrary } from '../../../src/pages/library/view.js';
import { builder, displayMenu } from '../../../src/player/controls/menus.js';
import { completeHintLine } from '../../../src/player/controls/text.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { createSelectDom } from '../../helpers/select-dom.js';
import { NOW, comparison, makeCues, videoRecord } from '../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from './library/fake-dom.js';

const ID = 'AAAAAAAAAAA';
const reply = (arabic) => ({
  v: 1, ok: true, watch: true, videoId: ID, title: 'محاضرة', loading: false,
  english: { captured: [], saved: [] }, arabic, view: { displayOffsetMs: 0, displayMode: 'ar' },
  mounted: { overlay: 'mounted', controls: 'mounted' },
});
const withArabic = reply({ fileName: 'x.ar.srt', cueCount: 5, edited: false, matched: false });

test('النافذة: «أكمل الناقص (3)» حين تنقص مقاطع، ولا زر بلا نقص أو بلا ترجمة أو أثناء القراءة', () => {
  assert.deepEqual(completeAction(withArabic, 3), { id: 'complete', label: 'أكمل الناقص (3)', title: 'يفتح المحرّر على «الاستكمال» والمقاطع الناقصة مختارة', videoId: ID });
  assert.equal(completeAction(withArabic, 0), null);
  assert.equal(completeAction(reply(null), 3), null, 'بلا ترجمة');
  assert.equal(completeAction({ ...withArabic, loading: true }, 3), null, 'جارٍ القراءة');
});

test('النافذة: البطاقة تقول العدد الصريح بدل «تختلف عن الأصل»، وفيها الزران', () => {
  const doc = newDocument();
  const s = { ...describeStatus(withArabic), missing: 3 };
  const btn = doc.createElement('button');
  btn.textContent = 'أكمل الناقص (3)';
  const card = statusCard(s, toolsStatus(withArabic), null, doc, [btn, null]);
  const pills = findAll(card, (e) => e.classList.contains('tj-pill')).map(textOf);
  assert.ok(pills.includes('3 مقاطع ناقصة'));
  assert.ok(!pills.includes('تختلف عن الأصل'));
  assert.ok(Array.from(card.querySelector('.tj-popup__actions').children).some((c) => c === btn));
  const plain = statusCard({ ...describeStatus(withArabic), missing: 0 }, toolsStatus(withArabic), null, doc, null);
  assert.ok(findAll(plain, (e) => e.classList.contains('tj-pill')).map(textOf).includes('تختلف عن الأصل'), 'بلا نقص كما كان');
});

/** سجل مقتطع: 3 مقاطع من 5 في البصمة. */
function truncatedRecord() {
  const r = videoRecord({ videoId: ID, cues: makeCues(5) });
  const cues = makeCues(3);
  r.arabic = { ...r.arabic, original: cues, comparison: { ...comparison({ fingerprintId: r.fingerprints[0].id, count: 3 }), matched: false, countSource: 5, missing: [4, 5], restoreTimingAvailable: false } };
  return r;
}

async function library() {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await store.updateVideo(ID, () => ({ ...truncatedRecord(), title: 'محاضرة' }));
  await store.getSettings();
  await area.flush();
  const doc = newDocument();
  const pages = [];
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 60000,
    openTab: async () => {}, openPage: async (name, params) => { pages.push([name, params]); },
    saveFile: async () => ({ ok: true }), clipboardWrite: async () => {}, pickFiles: async () => null,
    diagnosticsText: async () => '{}', confirm: async () => false, setTimer: (fn) => setTimeout(fn, 0), clearTimer: (h) => clearTimeout(h),
  });
  doc.body.append(lib.root);
  await lib.load();
  await settle(5);
  return { lib, doc, pages, root: lib.root };
}

test('المحفوظات: «أكمل الناقص (2)» بجوار شارة الصف يفتح المحرّر على «الاستكمال»', async () => {
  const m = await library();
  const btn = buttonNamed(m.root, 'أكمل الناقص (2) في محاضرة');
  assert.ok(btn, 'الزر بجوار الشارة');
  assert.ok(btn.parentNode.classList.contains('lib-row__status'));
  btn.click();
  await settle(5);
  assert.deepEqual(m.pages.at(-1), ['editor', { v: ID, p: 'complete' }]);
});

test('المحفوظات: سطر نتيجة الترجمة الناقصة فيه الفعل نفسه على خانتها', async () => {
  const m = await library();
  buttonNamed(m.root, 'إظهار الترجمات: محاضرة')?.click();
  await settle(10);
  const result = findAll(m.root, (e) => e.classList?.contains('lib-result'))[0];
  assert.ok(result, 'سطر النتيجة');
  const btn = findAll(result, (e) => e.tagName === 'button')[0];
  assert.equal(textOf(btn), 'أكمل الناقص (2)');
  btn.click();
  await settle(5);
  assert.deepEqual(m.pages.at(-1), ['editor', { v: ID, t: 1, p: 'complete' }]);
});

test('المشغّل: سطر نصي يدل على النافذة حين تنقص مقاطع، بلا زر ولا رابط', () => {
  const cmp = { ...comparison({ fingerprintId: 'fp_test000001', count: 3 }), matched: false, countSource: 5, missing: [4, 5] };
  assert.match(completeHintLine(cmp), /«أكمل الناقص» في نافذة الإضافة/);
  assert.equal(completeHintLine({ ...cmp, missing: [] }), null);
  assert.equal(completeHintLine(null), null);
  const dom = createSelectDom();
  const h = builder(dom.doc);
  const items = displayMenu(h, () => {}, {
    fileName: 'x.srt', count: 3, edited: false, comparison: cmp, notes: [], slots: [], switching: false, uploadLabel: 'رفع', warnings: [], mode: 'ar',
    dualAvailable: false, originalLang: null, busy: false, error: null, ad: false, lang: 'ar', langSuggested: ['ar'],
  });
  const hint = items.find((n) => (n.textContent ?? '').includes('«أكمل الناقص»'));
  assert.ok(hint, 'السطر في القائمة');
  assert.equal(hint.className, 'note');
  assert.equal(dom.find(hint, (n) => n.tagName === 'BUTTON' || n.tagName === 'A') ?? null, null, 'نص لا زر ولا رابط');
});
