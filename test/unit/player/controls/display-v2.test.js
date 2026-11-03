// قائمة العرض في الإصدار الثاني (P12-AC1 وP12-AC5 الجزء الآلي، وجولة الصقل): محدد الترجمات الموجودة أعلاها يبدّل النشطة فورًا
// برسالة «الترجمة 2» وتراجع، ولا يعرض إلا المحفوظة (ويختفي مع ترجمة واحدة)، وبلا تسميات؛ و«علّم للمراجعة» يعلّم المقطع الظاهر
// الآن في النشطة برسالة وتراجع، ولا يغيّر زمن الفيديو. والقائمة بصفوفها المضغوطة بلا أسطر شرح.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { TOAST_MS, UNDO_MS } from '../../../../src/player/controls/session.js';
import { prepareVideo } from '../overlay/harness.js';
import { AR_CUES, click, key, makeState, mountPage, settle, slotTrack, withSlots } from './harness.js';

const B_CUES = AR_CUES.map((c) => ({ ...c, text: `ب ${c.text}` }));
const three = () => withSlots([slotTrack(), slotTrack({ cues: B_CUES, fileName: 'b.srt' }), null], { offsets: [0, 1200, 0], names: [null, 'نسخة ب', null] });
const openDisplay = (page) => {
  click(page.ui.btn('upload'));
  assert.equal(page.ui.menuLabel(), 'الترجمة');
};
const slotButtons = (page) => page.ui.menu().querySelectorAll('button.slot');
const LABELS_SLOTS_FULL = 'الخانات الثلاث ممتلئة؛ الرفع استبدال.';

test('محدد الترجمات: ترجمتان تعرضان خيارين فقط (لا خانة فارغة)، والنشطة مميّزة، بلا تسميات ولا شرح', () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  const b = slotButtons(page);
  assert.deepEqual(b.map((x) => [x.textContent, x.getAttribute('aria-checked'), x.getAttribute('aria-disabled')]), [['1', 'true', null], ['2', 'false', null]]);
  assert.deepEqual(b.map((x) => x.getAttribute('aria-label')), ['الترجمة 1، نشطة', 'الترجمة 2']);
  assert.equal(b[1].getAttribute('title'), 'الترجمة 2 — نسخة ب', 'الاسم المختصر في التلميح وحده');
  assert.equal(page.ui.menuText().includes('نسخة ب'), false, 'بلا تسميات');
  assert.ok(page.ui.menu().querySelector('[data-fid="slot:3"]') === null, 'الخانة الفارغة غير معروضة');
  click(b[0]);
  assert.equal(page.controller.calls.some((c) => c[0] === 'activateSlot'), false, 'النشطة لا تُعاد');
});

test('محدد الترجمات: ترجمة واحدة تخفيه كله (لا «1» وحده)، وثلاث تعرض الثلاث، وخانتان غير متتاليتين برقميهما', () => {
  const one = mountPage({ state: makeState(withSlots([slotTrack(), null, null])) });
  openDisplay(one);
  assert.equal(slotButtons(one).length, 0);
  assert.ok(one.ui.menu().querySelector('.slots') === null, 'لا محدد مع ترجمة واحدة');
  assert.equal(one.ui.menu().children[0].className, 'head', 'العنوان وحده في الرأس');
  const all = mountPage({ state: makeState(withSlots([slotTrack(), slotTrack({ fileName: 'b.srt' }), slotTrack({ fileName: 'c.srt' })], { active: 3 })) });
  openDisplay(all);
  assert.deepEqual(slotButtons(all).map((x) => [x.textContent, x.getAttribute('aria-checked')]), [['1', 'false'], ['2', 'false'], ['3', 'true']]);
  const gap = mountPage({ state: makeState(withSlots([slotTrack(), null, slotTrack({ fileName: 'c.srt' })])) });
  openDisplay(gap);
  assert.deepEqual(slotButtons(gap).map((x) => x.textContent), ['1', '3'], 'الرقم هوية الخانة نفسها في المحفوظات والمحرّر');
});

test('محدد الترجمات يتحدث بعد الإضافة والحذف من مكان آخر والقائمة مفتوحة، دون فقد النشطة', async () => {
  const page = mountPage({ state: makeState(withSlots([slotTrack(), null, null])) });
  openDisplay(page);
  assert.equal(slotButtons(page).length, 0);
  page.controller.set({ ...withSlots([slotTrack(), slotTrack({ fileName: 'b.srt' }), null]), version: 2 });
  assert.deepEqual(slotButtons(page).map((x) => [x.textContent, x.getAttribute('aria-checked')]), [['1', 'true'], ['2', 'false']], 'أُضيفت الثانية');
  page.controller.set({ ...withSlots([null, slotTrack({ fileName: 'b.srt' }), slotTrack({ fileName: 'c.srt' })], { active: 2 }), version: 3 });
  assert.deepEqual(slotButtons(page).map((x) => [x.textContent, x.getAttribute('aria-checked')]), [['2', 'true'], ['3', 'false']], 'حُذفت الأولى وبقيت النشطة 2');
  click(slotButtons(page)[1]);
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'activateSlot'), [['activateSlot', 3]], 'الزر الثاني مربوط بالخانة 3 لا بموضعه');
});

test('تبديل الترجمة: فوري بإزاحتها، ورسالة «الترجمة 2» بتراجع يعيد السابقة', async () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  click(slotButtons(page)[1]);
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'activateSlot'), [['activateSlot', 2]]);
  const s = page.controller.getState();
  assert.equal(s.activeSlot, 2);
  assert.equal(s.view.displayOffsetMs, 1200, 'بإزاحتها');
  assert.equal(page.ui.btn('badge').textContent, '+1.2', 'الشارة تتبع النشطة');
  assert.match(page.ui.menuText(), /b\.srt/, 'القائمة للنشطة الجديدة');
  assert.deepEqual(slotButtons(page).map((x) => x.getAttribute('aria-checked')), ['false', 'true']);
  const [toast] = page.ui.toasts();
  assert.equal(toast.tone, 'success');
  assert.equal(toast.text, 'الترجمة 2تراجع');
  page.env.win.advance(TOAST_MS + 10);
  assert.equal(page.ui.toasts().length, 1, 'رسالة التراجع تبقى أطول من العابرة');
  click(page.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'activateSlot').map((c) => c[1]), [2, 1]);
  assert.equal(page.controller.getState().activeSlot, 1);
  assert.equal(page.ui.toasts().length, 0, 'تختفي بعد التراجع');
  assert.equal(page.handle.diagnostics().session.switches, 1);
  assert.equal(page.handle.diagnostics().session.undos, 1);
});

test('«الترجمة 2» لا تُعلن إلا إن صارت النشطة فعلًا: وعد عاد دون تبديل لا رسالة نجاح له', async () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  page.controller.activateSlot = async (n) => {
    page.controller.calls.push(['activateSlot', n]);
    return page.controller.getState();
  };
  click(slotButtons(page)[1]);
  await settle();
  assert.equal(page.controller.getState().activeSlot, 1);
  assert.deepEqual(page.ui.toasts(), [], 'لا «الترجمة 2» ولا تراجع');
  assert.equal(page.handle.diagnostics().session.switches, 0);
});

test('رسالة التراجع تختفي وحدها بعد مهلتها دون فعل', async () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  click(slotButtons(page)[1]);
  await settle();
  page.env.win.advance(UNDO_MS + 10);
  assert.deepEqual(page.ui.toasts(), []);
  assert.equal(page.controller.calls.filter((c) => c[0] === 'activateSlot').length, 1);
});

test('تعذّر التبديل: رسالة المتحكم كما هي، والمحدد على حاله؛ وأثناء القراءة لا أثر', async () => {
  const page = mountPage({ state: makeState(three()), controllerOpts: { activateFails: 'ST_WRITE_FAILED' } });
  openDisplay(page);
  click(slotButtons(page)[1]);
  await settle();
  assert.ok(page.ui.toasts().some((t) => t.tone === 'error' && t.text.includes(messageFor('ST_WRITE_FAILED'))));
  assert.equal(page.controller.getState().activeSlot, 1);

  const loading = mountPage({ state: makeState({ ...three(), loading: true }) });
  loading.controller.set({ loading: false });
  openDisplay(loading);
  loading.controller.set({ loading: true });
  assert.equal(loading.ui.menu().querySelector('.slots').getAttribute('aria-disabled'), 'true');
  click(slotButtons(loading)[1]);
  await settle();
  assert.equal(loading.controller.calls.some((c) => c[0] === 'activateSlot'), false);
});

test('المحدد بلوحة المفاتيح: التركيز على النشطة، والأسهم بين المحفوظة، وEnter تختار', async () => {
  const page = mountPage({ state: makeState(withSlots([slotTrack(), slotTrack({ fileName: 'b.srt' }), slotTrack({ fileName: 'c.srt' })])) });
  openDisplay(page);
  const b = slotButtons(page);
  assert.deepEqual(b.map((x) => x.getAttribute('tabindex')), ['0', '-1', '-1']);
  b[0].focus();
  key(b[0], 'ArrowRight');
  assert.ok(page.env.doc._focused === b[1]);
  key(b[1], 'ArrowLeft');
  key(b[0], 'ArrowLeft');
  assert.ok(page.env.doc._focused === b[2], 'يدور');
  click(b[2]);
  await settle();
  assert.equal(page.controller.getState().activeSlot, 3);
});

test('«علّم للمراجعة»: المقطع الظاهر الآن بزمن الفيديو والإزاحة، ورسالة بتراجع، ولا يُمس زمن الفيديو', async () => {
  // المقطع 3 من 6000 إلى 8000؛ والإزاحة +1.0 تجعله ظاهرًا من 7000 إلى 9000.
  const page = mountPage({ state: makeState({ ...three(), view: { displayOffsetMs: 1000, displayMode: 'ar' } }) });
  prepareVideo(page.video, { currentTime: 8.5 });
  openDisplay(page);
  click(page.ui.item('علّم للمراجعة'));
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'markCue'), [['markCue', 2, 'todo']]);
  assert.equal(page.video.writes, 0, 'لا قفز');
  const [toast] = page.ui.toasts();
  assert.equal(toast.text, 'عُلِّم المقطع 3 للمراجعةتراجع');
  click(page.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle();
  assert.deepEqual(page.controller.calls.at(-1), ['undoMark', 2]);
  assert.equal(page.handle.diagnostics().session.marks, 1);
});

test('بعد انتهاء المقطع بلحظة يبقى هو «الظاهر»؛ وبلا مقطع قريب رسالة مفهومة ولا علامة', async () => {
  const page = mountPage({ state: makeState(three()) });
  prepareVideo(page.video, { currentTime: 3.2 }); // المقطع 1 انتهى عند 3000
  openDisplay(page);
  click(page.ui.item('علّم للمراجعة'));
  await settle();
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'markCue').map((c) => c[1]), [0]);

  const none = mountPage({ state: makeState(three()) });
  prepareVideo(none.video, { currentTime: 400 });
  openDisplay(none);
  click(none.ui.item('علّم للمراجعة'));
  await settle();
  assert.equal(none.controller.calls.some((c) => c[0] === 'markCue'), false);
  assert.deepEqual(none.ui.toasts(), [{ tone: 'info', text: messageFor('CT_NO_VISIBLE_CUE') }]);
});

test('تعذّر التراجع: رسالة مفهومة باقية، ورمزه في التشخيص', async () => {
  const page = mountPage({ state: makeState(three()), controllerOpts: { undoFails: 'ST_WRITE_FAILED' } });
  prepareVideo(page.video, { currentTime: 1.5 });
  openDisplay(page);
  click(page.ui.item('علّم للمراجعة'));
  await settle();
  click(page.ui.layerHost().shadowRoot.querySelector('.toasts button.act'));
  await settle();
  assert.deepEqual(page.ui.toasts().map((t) => t.tone), ['error']);
  assert.match(page.ui.toasts()[0].text, /تعذّر التراجع/);
  assert.equal(page.handle.diagnostics().session.lastCode, 'CT_UNDO_FAILED');
});

test('قائمة العرض بأقسامها: الرأس بالمحدد، وسطر «العربية · N مقطعًا» والملف والملخص، ثم «وضع العرض» بأوضاعه الثلاثة، ثم العلامة والرفع في صف', () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  const menu = page.ui.menu();
  const rows = menu.children.filter((c) => !c.classList.contains('sep'));
  assert.deepEqual(rows.map((r) => r.className || r.tagName), ['head', 'row status', 'row file', 'row summary', 'label', 'seg', 'note', 'actions inline']);
  assert.equal(rows[1].textContent, 'العربية · 5 مقاطع', 'سطر الترجمة بعدد مقاطعها');
  assert.ok(rows[1].querySelector('svg.glyph'), 'برمز SVG');
  assert.equal(rows[2].textContent, 'talk.ar.srt', 'اسم الملف وحده في سطره');
  assert.equal(rows[4].textContent, 'وضع العرض');
  assert.equal(menu.querySelectorAll('.sep').length, 2, 'فاصلان: بين الملخص والأوضاع، وبين الأوضاع والإجراءات');
  const modes = rows[5].children.map((b) => [b.textContent, b.getAttribute('aria-label')]);
  assert.deepEqual(modes, [['العربية', 'العربية وحدها'], ['فوق الأصل', 'العربية فوق الأصل'], ['إخفاء', 'إخفاء الترجمة']], 'بلا أصل: «فوق الأصل» واسم وصول كامل');
  for (const [shown, name] of modes) assert.ok(name.includes(shown), `اسم الوصول يحوي النص الظاهر: ${shown}`);
  assert.equal(rows[5].getAttribute('role'), 'radiogroup');
  assert.deepEqual(rows[5].children.map((b) => b.getAttribute('tabindex')), ['0', '-1', '-1'], 'نقطة Tab واحدة للمجموعة (المختار)');
  assert.equal(rows[6].textContent, messageFor('CT_DUAL_UNAVAILABLE'), 'سبب تعطيل المزدوج ظاهر');
  assert.deepEqual(rows[7].children.map((b) => b.textContent), ['علّم للمراجعة', 'رفع ترجمة…']);
  assert.equal(menu.textContent.includes(LABELS_SLOTS_FULL), false, 'خانة فارغة موجودة: لا سطر امتلاء');
  const full = mountPage({ state: makeState(withSlots([slotTrack(), slotTrack(), slotTrack()])) });
  openDisplay(full);
  assert.ok(full.ui.item('استبدال…'), 'لا خانة فارغة: «استبدال…»');
  assert.ok(full.ui.menuText().includes(LABELS_SLOTS_FULL), 'ولسانه: الرفع استبدال');
});

test('سطر الترجمة في قائمتها: «العربية · N مقطعًا» ومعها «· معدّلة» حين عُدّلت', () => {
  const page = mountPage({ state: makeState(withSlots([slotTrack({ cues: AR_CUES, current: AR_CUES.slice(0, 4) })])) });
  openDisplay(page);
  assert.equal(page.ui.menu().querySelector('[data-fid="arabicLine"]').textContent, 'العربية · 4 مقاطع · معدّلة');
  const plain = mountPage({ state: makeState(withSlots([slotTrack()])) });
  openDisplay(plain);
  assert.equal(plain.ui.menu().querySelector('[data-fid="arabicLine"]').textContent, 'العربية · 5 مقاطع');
});

// اسم الوضع المزدوج من لغة الأصل الملتقط فعلًا لا من «الإنجليزية» ثابتة.
const arName = (code) => new Intl.DisplayNames(['ar'], { type: 'language' }).of(code);
const original = (lang) => ({ english: { key: `${lang}|manual`, kind: 'manual', lang, cues: [], source: 'captured' } });
const dualButton = (page) => page.ui.menu().querySelector('[data-fid="mode:dual"]');

test('الوضع المزدوج: «فوق ‹اسم لغة الأصل›» باسم لغة المسار الفعلية، واسم الوصول الكامل بها، وبلا أصل «فوق الأصل»', () => {
  const none = mountPage({ state: makeState(three()) });
  openDisplay(none);
  assert.equal(dualButton(none).textContent, 'فوق الأصل');
  assert.equal(dualButton(none).getAttribute('aria-label'), 'العربية فوق الأصل');
  assert.equal(dualButton(none).getAttribute('aria-disabled'), 'true');
  assert.match(dualButton(none).getAttribute('aria-description'), /استخرج الإنجليزية لهذا الفيديو أولًا/, 'السبب باقٍ بلا أصل');
  for (const lang of ['en', 'fr', 'de']) {
    const page = mountPage({ state: makeState({ ...three(), ...original(lang) }) });
    openDisplay(page);
    assert.equal(dualButton(page).textContent, `فوق ${arName(lang)}`, lang);
    assert.equal(dualButton(page).getAttribute('aria-label'), `العربية فوق ${arName(lang)}`);
    assert.equal(dualButton(page).getAttribute('aria-disabled'), null);
    assert.equal(page.ui.menu().querySelector('[data-fid="dualReason"]'), null, 'لا سبب تعطيل مع أصل');
    assert.equal(page.ui.menuText().includes('الإنجليزية'), lang === 'en', 'لا «الإنجليزية» لأصل بلغة أخرى');
  }
});

test('الوضع المزدوج بلهجة: الظاهر باللغة الأساسية (فوق الإنجليزية) والاسم الكامل في اسم الوصول والتلميح؛ ويتبع تبدّل الأصل والقائمة مفتوحة', () => {
  const page = mountPage({ state: makeState({ ...three(), ...original('en-GB') }) });
  openDisplay(page);
  assert.equal(dualButton(page).textContent, `فوق ${arName('en')}`);
  assert.equal(dualButton(page).getAttribute('aria-label'), `العربية فوق ${arName('en-GB')}`);
  assert.equal(dualButton(page).getAttribute('title'), `العربية فوق ${arName('en-GB')}`, 'الاسم الكامل في التلميح');
  assert.ok(dualButton(page).getAttribute('aria-label').includes(dualButton(page).textContent), 'اسم الوصول يحوي النص الظاهر');
  page.controller.set(original('fr'));
  assert.equal(dualButton(page).textContent, `فوق ${arName('fr')}`, 'تبدّل الأصل');
  page.controller.set({ english: null });
  assert.equal(dualButton(page).textContent, 'فوق الأصل');
  assert.equal(dualButton(page).getAttribute('aria-disabled'), 'true');
});

test('الأوضاع الثلاثة: الأسهم تنقل التركيز بين خياراتها داخل الجذر (الأيسر إلى التالي في RTL) دون تطبيق، وEnter يطبّق', () => {
  const page = mountPage({ state: makeState(three()) });
  openDisplay(page);
  const root = page.ui.layerHost().shadowRoot;
  const [ar, dual] = page.ui.menu().querySelector('.seg').children;
  ar.focus();
  key(ar, 'ArrowLeft');
  assert.ok(root.activeElement === dual, 'انتقل التركيز إلى الخيار التالي');
  assert.equal(page.controller.calls.some((c) => c[0] === 'setDisplayMode'), false, 'الأسهم لا تطبّق');
  key(dual, 'ArrowRight');
  assert.ok(root.activeElement === ar);
});
