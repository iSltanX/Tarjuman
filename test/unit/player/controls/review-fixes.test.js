// انحدارات المراجعة المستقلة لفرق P6: كل اختبار يثبت خللًا وُجد وأُصلح، بسيناريو الفشل نفسه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { createFontLoader } from '../../../../src/player/overlay/fonts.js';
import { morphChildren } from '../../../../src/player/controls/morph.js';
import { createFakeEnv } from '../overlay/fake-dom.js';
import { arabic, chooseFiles, click, key, makeState, mountPage, settle, trackInfo } from './harness.js';

test('منتقٍ فُتح لفيديو ثم تبدّل الفيديو قبل الاختيار: لا قراءة ولا تحميل على الجديد، ورسالة تحذير', async () => {
  const page = mountPage();
  click(page.ui.btn('upload'));
  page.controller.set({ videoId: 'BBBBBBBBBBB' });
  chooseFiles(page.ui, [{ name: 'for-A.ar.srt' }]);
  await settle();
  assert.equal(page.flows.reads.length, 0);
  assert.equal(page.controller.calls.some((c) => c[0] === 'loadArabic'), false);
  assert.deepEqual(page.ui.toasts().map((t) => t.tone), ['warning']);
  assert.ok(page.ui.toasts()[0].text.includes(messageFor('CT_VIDEO_CHANGED')));
});

test('change عند فقد التركيز ثم النقر على «إعادة الضبط»: العقدة تحت المؤشر هي نفسها فيصل النقر', () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  click(page.ui.btn('badge'));
  const reset = page.ui.field('reset');
  const input = page.ui.field('offset');
  input.value = '5';
  input.dispatchEvent({ type: 'input', target: input, bubbles: true });
  // mousedown على الزر ينقل التركيز فيطلق change قبل click
  input.dispatchEvent({ type: 'change', target: input });
  assert.equal(page.controller.getState().view.displayOffsetMs, 5000);
  assert.equal(reset.isConnected, true, 'العقدة باقية بعد تغيّر الحالة');
  assert.ok(page.ui.field('reset') === reset);
  click(reset);
  assert.equal(page.controller.getState().view.displayOffsetMs, 0);
});

test('قائمة العرض لا تُعاد بناؤها تحت المؤشر مع كل تغيّر في المتحكم', () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  click(page.ui.btn('upload'));
  const off = page.ui.menu().querySelector('[data-fid="mode:off"]');
  page.controller.set({ notice: null });
  page.controller.set({ error: null });
  assert.ok(page.ui.menu().querySelector('[data-fid="mode:off"]') === off);
  // وتعطيل يتغير على العقدة نفسها يُحترم لحظة النقر
  const dual = page.ui.menu().querySelector('[data-fid="mode:dual"]');
  page.controller.set({ english: { key: 'en|manual', kind: 'manual', lang: 'en', cues: [], source: 'saved' } });
  assert.ok(page.ui.menu().querySelector('[data-fid="mode:dual"]') === dual, 'العقدة نفسها');
  assert.equal(dual.getAttribute('aria-disabled'), null);
  click(dual);
  assert.deepEqual(page.controller.calls.at(-1), ['setDisplayMode', 'dual']);
  page.controller.set({ english: null });
  click(dual);
  assert.equal(page.controller.calls.filter((c) => c[0] === 'setDisplayMode').length, 1, 'صار معطّلًا فلا يُطبَّق');
});

test('نقرة فتح منتقي الملفات لا تصل إلى المشغّل (لا تبديل للتشغيل)', () => {
  const page = mountPage();
  let playerClicks = 0;
  page.player.addEventListener('click', () => playerClicks++);
  click(page.ui.btn('upload'));
  assert.equal(playerClicks, 0);
});

test('بعد نقرة الفأرة على − أو + لا يبقى التركيز على الزر؛ وبلوحة المفاتيح يبقى', () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  page.ui.btn('plus').focus();
  click(page.ui.btn('plus'), 1);
  assert.ok(page.env.doc._focused !== page.ui.btn('plus'));
  const seen = [];
  page.env.doc.addEventListener('keydown', (ev) => seen.push(ev.key));
  key(page.env.doc.body, ' ');
  assert.deepEqual(seen, [' '], 'المسافة بعدها ليوتيوب');
  page.ui.btn('minus').focus();
  key(page.ui.btn('minus'), 'Enter');
  click(page.ui.btn('minus'), 0);
  assert.ok(page.env.doc._focused === page.ui.btn('minus'));
});

test('إخفاق عابر في تحميل الخط لا يُحفظ: الطلب التالي يعيد المحاولة وينجح', async () => {
  const env = createFakeEnv();
  const added = [];
  env.win.FontFace = class {
    constructor(family, source, d) {
      Object.assign(this, { family, source, weight: d.weight });
    }

    load() {
      return Promise.resolve(this);
    }
  };
  env.doc.fonts = { add: (f) => added.push(f) };
  let fail = true;
  const read = async () => {
    if (fail) throw new Error('عابر');
    return new ArrayBuffer(4);
  };
  const fonts = createFontLoader({ doc: env.doc, win: env.win, read });
  assert.equal((await fonts.ensure('markazi')).code, 'CT_FONT_SYSTEM');
  fail = false;
  const st = await fonts.ensure('markazi');
  assert.equal(st.code, null);
  assert.equal(st.active, 'markazi');
  assert.deepEqual(st.failed, [], 'زال من قائمة الإخفاق');
  assert.equal(added.length, 4);
});

test('إغلاق تأكيد الاستبدال أثناء الحفظ: تُطبَّق النتيجة دون إعادة فتح القائمة ولا نقل التركيز', async () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  click(page.ui.btn('upload'));
  click(page.ui.item('رفع ترجمة…'));
  chooseFiles(page.ui, [{ name: 'new.ar.srt' }]);
  await settle();
  click(page.ui.menu().querySelector('[data-fid="target:1"]'));
  let release;
  const gate = new Promise((r) => (release = r));
  const load = page.controller.loadArabicInto;
  page.controller.loadArabicInto = async (...a) => {
    await gate;
    return load(...a);
  };
  click(page.ui.item('استبدال'));
  key(page.ui.menu().querySelector('button'), 'Escape');
  assert.equal(page.ui.menuOpen(), false);
  page.env.doc.body.focus?.();
  const outside = page.env.doc.createElement('input');
  page.env.doc.body.appendChild(outside);
  outside.focus();
  release();
  await settle();
  assert.equal(page.controller.getState().arabic.fileName, 'new.ar.srt', 'النتيجة طُبّقت');
  assert.equal(page.ui.menuOpen(), false, 'لم تُعد القائمة');
  assert.ok(page.env.doc._focused === outside, 'التركيز لم يُسرق');
});

test('إغلاق القائمة تلقائيًا والتركيز فيها (زالت الترجمة أو تبدّل الفيديو): يعود التركيز إلى زرها', () => {
  const page = mountPage({ state: makeState({ arabic: arabic() }) });
  click(page.ui.btn('badge'), 0);
  assert.ok(page.env.doc._focused === page.ui.field('offset'));
  page.controller.set({ arabic: null });
  assert.equal(page.ui.menuOpen(), false);
  assert.ok(page.env.doc._focused === page.ui.btn('badge'));
  page.controller.set({ arabic: arabic(), captured: [trackInfo()] });
  click(page.ui.btn('download'), 0);
  page.controller.set({ videoId: 'BBBBBBBBBBB' });
  assert.ok(page.env.doc._focused === page.ui.btn('download'));
});

test('بديل النسخ يعيد التركيز إلى بند القائمة بعد الحقل المؤقت', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }), clipboard: 'none' });
  page.env.doc.execCommand = () => true;
  click(page.ui.btn('download'), 0);
  const copy = page.ui.field('copy');
  copy.focus();
  click(copy, 0);
  await settle();
  assert.ok(page.env.doc._focused === copy);
});

test('المحدّث في المكان: يحفظ العقد المطابقة، ويدرج الجديد ويزيل الزائد، وينقل السمات والنص والقيمة', () => {
  const { doc } = createFakeEnv();
  const el = (tag, attrs = {}, text) => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const parent = el('div');
  const a = el('button', { 'data-fid': 'a', 'aria-checked': 'false' }, 'أ');
  const b = el('div', { class: 'note' }, 'قديم');
  const c = el('input', { 'data-fid': 'c', type: 'text' });
  c.value = 'x';
  parent.append(a, b, c);
  const n1 = el('button', { 'data-fid': 'a', 'aria-checked': 'true' }, 'أ');
  const n2 = el('div', { class: 'field-error' }, 'خطأ');
  const n3 = el('div', { class: 'note' }, 'جديد');
  const n4 = el('input', { 'data-fid': 'c', type: 'text' });
  n4.value = 'y';
  const inserted = morphChildren(parent, [n1, n2, n3, n4]);
  assert.equal(inserted, 1, 'الخطأ وحده جديد');
  // مواضع العقد في القائمة المتوقعة لا العقد نفسها: فشل deepEqual على عقدة يفحص الـDOM الوهمي كله (overlay/fake-dom.js).
  assert.deepEqual(parent.children.map((n) => [a, n2, b, c].indexOf(n)), [0, 1, 2, 3]);
  assert.equal(a.getAttribute('aria-checked'), 'true');
  assert.equal(b.textContent, 'جديد');
  assert.equal(c.value, 'y');
  morphChildren(parent, [el('button', { 'data-fid': 'a' }, 'أ')]);
  assert.deepEqual(parent.children.map((n) => [a].indexOf(n)), [0], 'الزائد أُزيل');
  assert.equal(a.hasAttribute('aria-checked'), false, 'السمة الغائبة أُزيلت');
});
