// التدقيق الموحد V2، WG-5: الرفع من المشغّل يحسب تقرير الحفظ والمعاينة بلغة الملف المقترحة أو المختارة (U-026).
// العقد تُقارن بـassert.ok(a === b) لا assert.equal حين تكون عقدًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { createController } from '../../../../src/content/controller.js';
import * as importFlow from '../../../../src/core/import/index.js';
import { loadIntoFor, readFor } from '../../../../src/player/controls/flows.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { englishTrack, fingerprint, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { UNDO_MS } from '../../../../src/player/controls/session.js';
import { builder, displayMenu } from '../../../../src/player/controls/menus.js';
import { morphChildren } from '../../../../src/player/controls/morph.js';
import { createSelectDom } from '../../../helpers/select-dom.js';
import { AR_CUES, chooseFiles, click, makeState, mountPage, settle, slotTrack, withSlots } from './harness.js';

const MIXED = makeCues(3, { text: (i) => (i === 3 ? 'Still untranslated' : 'ترجمة عربية كاملة') });
const srtOf = (cues) => cues.map((c) => {
  const t = (ms) => `00:00:${String(Math.floor(ms / 1000)).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
  return `${c.n}\n${t(c.startMs)} --> ${t(c.endMs)}\n${c.text}\n`;
}).join('\n');

async function emptyVideo() {
  const rec = videoRecord({ cues: MIXED, arabic: false });
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  await store.updateVideo(rec.videoId, () => rec);
  const c = createController({ store });
  await c.start(rec.videoId);
  return c;
}

test('AV2 U-026: ملف بلا رمز لغة و«إلى» = ar: المعاينة وتقرير الحفظ وقائمة العرض بعد الحفظ تقول noArabic=[3] معًا', async () => {
  const c = await emptyVideo();
  const read = await readFor({ controller: c, importFlow, files: new File([srtOf(MIXED)], 'subtitle.srt'), fallbackLang: 'ar' });
  assert.equal(read.ok, true);
  assert.equal(read.input.lang, 'ar');
  assert.deepEqual(read.preview.noArabic, [3]);
  assert.deepEqual(read.input.comparison.noArabic, [3], 'تقرير الحفظ بلغة الملف المقترحة لا بلغة الاسم');
  const r = await loadIntoFor({ controller: c, read, n: 1, replace: false });
  assert.equal(r.ok, true);
  assert.deepEqual(c.getState().arabic.comparison.noArabic, [3]);
});

test('AV2 U-026: تغيير لغة الملف عند الحفظ يعيد تقرير الحفظ بها (ar ثم fr على نص فرنسي)', async () => {
  const c = await emptyVideo();
  const fr = makeCues(3, { text: (i) => ['Bonjour à tous', 'Merci beaucoup', 'Au revoir'][i - 1] });
  const read = await readFor({ controller: c, importFlow, files: new File([srtOf(fr)], 'subtitle.srt'), fallbackLang: 'ar' });
  assert.equal(read.input.lang, null, 'النص اللاتيني لا يوافق «إلى» العربية');
  assert.deepEqual(read.input.comparison.noArabic, []);
  const r = await loadIntoFor({ controller: c, read, n: 1, replace: false, lang: 'ar' });
  assert.equal(r.ok, true);
  assert.deepEqual(c.getState().arabic.comparison.noArabic, [1, 2, 3], 'اختار المستخدم ar: يُحفظ ما يوافق اختياره');
});

test('AV2 U-026: تغيير «لغة الملف» في التأكيد يحدّث ملخص المعاينة', async () => {
  const fp = fingerprint({ track: englishTrack({ cues: makeCues(3) }), id: 'fp_test000001' });
  const page = mountPage({ state: makeState({ ...withSlots([slotTrack()]), saved: { fingerprints: [fp] } }) });
  page.flows.readResult = () => ({ ok: true, fileName: 'subtitle.srt', cues: MIXED, comparison: importFlow.previewComparison(MIXED, fp, { target: null }), fingerprintId: fp.id, notes: [], warnings: [], lang: null });
  click(page.ui.btn('upload'));
  click(page.ui.item('رفع ترجمة…'));
  chooseFiles(page.ui, [{ name: 'subtitle.srt' }]);
  await settle();
  const sel = page.ui.menu().querySelector('select.lang');
  assert.ok(sel);
  assert.ok(!/بلا ترجمة|غير مترجم/.test(page.ui.menuText()), 'لغة غير محددة: لا فحص');
  sel.value = 'ar';
  sel.dispatchEvent({ type: 'change' });
  await settle();
  assert.match(page.ui.menuText(), /مقطع واحد بلا ترجمة/);
  click(page.ui.item('حفظ'));
  await settle();
  const call = page.controller.calls.filter((x) => x[0] === 'loadArabicInto').at(-1)[2];
  assert.deepEqual(call.comparison.noArabic, [3]);
  assert.equal(call.lang, 'ar');
});

// ———— U-029: منتقي لغة الخانة بعد morph ————

const SLOTS = [{ n: 1, filled: true, active: true, name: null, edited: false, cueCount: 5 }, { n: 2, filled: false, active: false, name: null, edited: false, cueCount: 0 }, { n: 3, filled: false, active: false, name: null, edited: false, cueCount: 0 }];
const dmodel = ({ lang, switching = false, targets = [] }) => ({
  fileName: 'talk.srt', count: 5, edited: false, comparison: null, notes: [], slots: SLOTS, switching, uploadLabel: 'رفع', warnings: [], mode: 'ar',
  dualAvailable: false, originalLang: null, busy: false, error: null, ad: false,
  lang, langSuggested: [lang, ...targets].filter(Boolean),
});

function menuIn() {
  const dom = createSelectDom();
  const h = builder(dom.doc);
  const menu = new dom.El('div');
  const draw = (m) => menu.replaceChildren(...displayMenu(h, () => {}, m));
  const patch = (m) => morphChildren(menu, displayMenu(h, () => {}, m));
  const sel = () => dom.find(menu, (n) => n.tagName === 'SELECT');
  return { draw, patch, sel };
}

test('AV2 U-029: morph من قيمة ar بمقترحات [ar] إلى de بمقترحات [de, ar] يعطي select.value === de', () => {
  const m = menuIn();
  m.draw(dmodel({ lang: 'ar', targets: ['ar'] }));
  assert.equal(m.sel().value, 'ar');
  m.patch(dmodel({ lang: 'de', targets: ['ar'] }));
  assert.equal(m.sel().value, 'de');
  m.patch({ ...dmodel({ lang: 'de', targets: ['ar'] }), warnings: ['x'] });
  assert.equal(m.sel().value, 'de', 'ورسم لاحق');
});

test('AV2 U-029: من «غير محددة» بلا مقترحات إلى de، ومن de إلى «غير محددة»', () => {
  const m = menuIn();
  m.draw(dmodel({ lang: null }));
  m.patch(dmodel({ lang: 'de' }));
  assert.equal(m.sel().value, 'de');
  m.patch(dmodel({ lang: null }));
  assert.equal(m.sel().value, '');
});

test('AV2 U-029: اختيار المستخدم ثم تسلسل الرسوم أثناء الحفظ وبعده بلا قيمة غير de', () => {
  const m = menuIn();
  m.draw(dmodel({ lang: 'ar', targets: ['ar'] }));
  m.sel().choose('de');
  const seen = [m.sel().value];
  // رسم أثناء الحفظ باللغة المطلوبة (pendingLang)، ثم رسم changed() باللغة الجديدة، ثم النهائي.
  for (const model of [dmodel({ lang: 'de', targets: ['ar'], switching: true }), dmodel({ lang: 'de', targets: ['ar'], switching: true }), dmodel({ lang: 'de', targets: ['ar'] })]) {
    m.patch(model);
    seen.push(m.sel().value);
  }
  assert.deepEqual(seen, ['de', 'de', 'de', 'de']);
});

test('AV2 U-029: أثناء حفظ لغة الخانة تُرسم القائمة باللغة المطلوبة لا القديمة', async () => {
  const page = mountPage({ state: makeState({ ...withSlots([slotTrack()]), arabic: { ...withSlots([slotTrack()]).arabic, lang: 'ar' } }) });
  let release;
  const gate = new Promise((r) => { release = r; });
  const real = page.controller.setSlotLang.bind(page.controller);
  page.controller.setSlotLang = async (n, lang) => { await gate; return real(n, lang); };
  click(page.ui.btn('upload'));
  const sel = page.ui.menu().querySelector('select.lang');
  sel.value = 'de';
  sel.dispatchEvent({ type: 'change' });
  await settle();
  assert.equal(page.ui.menu().querySelector('select.lang').value, 'de', 'أثناء الحفظ');
  release();
  await settle();
  assert.equal(page.ui.menu().querySelector('select.lang').value, 'de', 'بعد الحفظ');
});

// ———— U-042: رسالة «تراجع» في المشغّل (جذر Shadow DOM مغلق) تُمسك بالمؤشر والتركيز ————

const B_CUES = AR_CUES.map((c) => ({ ...c, text: `ب ${c.text}` }));
const threeSlots = () => withSlots([slotTrack(), slotTrack({ cues: B_CUES, fileName: 'b.srt' }), null], { offsets: [0, 1200, 0], names: [null, 'نسخة ب', null] });

async function undoToast() {
  const page = mountPage({ state: makeState(threeSlots()) });
  click(page.ui.btn('upload'));
  click(page.ui.menu().querySelectorAll('button.slot')[1]);
  await settle();
  assert.equal(page.ui.toasts().length, 1);
  return { page, box: page.ui.toastClose(0).parentNode };
}

test('AV2 U-042: المؤشر على رسالة التراجع يمسكها فوق 6 ث، وتزول بعد مدتها كاملة من مغادرته', async () => {
  const { page, box } = await undoToast();
  box.dispatchEvent({ type: 'mouseenter' });
  page.env.win.advance(UNDO_MS * 3);
  assert.equal(page.ui.toasts().length, 1, 'ما زالت والمؤشر فوقها');
  box.dispatchEvent({ type: 'mouseleave' });
  page.env.win.advance(UNDO_MS - 100);
  assert.equal(page.ui.toasts().length, 1, 'المدة كاملة من المغادرة');
  page.env.win.advance(200);
  assert.deepEqual(page.ui.toasts(), []);
});

test('AV2 U-042: التركيز في رسالة التراجع يمسكها، وخروجه إلى خارجها يستأنف العدّ؛ والتركيز المنتقل داخلها لا يستأنفه', async () => {
  const { page, box } = await undoToast();
  const inner = page.ui.toastClose(0);
  box.dispatchEvent({ type: 'focusin', bubbles: true });
  page.env.win.advance(UNDO_MS * 2);
  assert.equal(page.ui.toasts().length, 1);
  box.dispatchEvent({ type: 'focusout', relatedTarget: inner });
  page.env.win.advance(UNDO_MS * 2);
  assert.equal(page.ui.toasts().length, 1, 'انتقال داخلي: ما زال ممسوكًا');
  box.dispatchEvent({ type: 'focusout', relatedTarget: null });
  page.env.win.advance(UNDO_MS + 100);
  assert.deepEqual(page.ui.toasts(), []);
});
