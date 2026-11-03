// سلوك اللوحة مع يوتيوب: عزل لوحة المفاتيح، والتركيز، وبقاء الصفوف في ملء الشاشة، واستبدال عنصر الفيديو، وصمود اللوحة أمام
// حالات ناقصة أو غريبة (لا ترمي ولا تعطّل المشغّل).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_MS } from '../../../../src/player/panel/index.js';
import { FOCUS_REQUEST_MS, createPanelLink } from '../../../../src/player/link.js';
import { arCues, click, english, hidden, key, layoutList, makeState, prepareVideo, ui, watchPage } from './harness.js';

const classesOf = (rows, cls) => rows.map((r, i) => (r.classList.contains(cls) ? i : -1)).filter((i) => i >= 0);

test('عزل لوحة المفاتيح: الضغطات داخل اللوحة لا تصل إلى مستمعي المستند (اختصارات يوتيوب)', () => {
  const page = watchPage();
  page.mount();
  const seen = [];
  for (const type of ['keydown', 'keyup', 'keypress']) page.doc.addEventListener(type, (ev) => seen.push(ev.key));
  const v = ui(page);
  for (const type of ['keydown', 'keyup', 'keypress']) {
    v.switchEl.dispatchEvent({ type, bubbles: true, key: ' ' });
    v.list.dispatchEvent({ type, bubbles: true, key: 'k' });
    v.q('.num')?.dispatchEvent({ type, bubbles: true, key: 'f' });
  }
  assert.deepEqual(seen, [], 'لا ضغطة وصلت');
  page.doc.dispatchEvent({ type: 'keydown', key: 'k' });
  assert.deepEqual(seen, ['k'], 'والمستند نفسه يعمل');
});

test('التركيز مع زر اللوحة في الشريط (صلة link): الفتح بلوحة المفاتيح يدخل زر الإغلاق، والإغلاق يعيده إلى زر الشريط', () => {
  const link = createPanelLink();
  const page = watchPage({ state: makeState({ prefs: { ...makeState().prefs, ui: { ...makeState().prefs.ui, panelOpen: false } } }) });
  page.mount({ link });
  const barButton = page.doc.createElement('button');
  page.doc.body.appendChild(barButton);
  link.register(() => barButton.focus());
  barButton.focus();
  // زر الشريط يطلب التركيز ثم يكتب التفضيل (كما في controls/session.js togglePanel).
  link.requestPanelFocus();
  page.controller.set({ prefs: { ...page.controller.getState().prefs, ui: { ...page.controller.getState().prefs.ui, panelOpen: true } } });
  const v = ui(page);
  assert.equal(page.handle.peek().mode, 'open');
  assert.ok(page.doc._focused === v.qa('.head .b')[1], 'زر الإغلاق');
  click(v.qa('.head .b')[1]);
  assert.equal(page.handle.peek().mode, 'none');
  assert.ok(page.doc._focused === barButton, 'عاد التركيز إلى زر اللوحة في الشريط');
});

test('صلة التركيز: طلب منتهي المهلة لا يخطف التركيز، والتسجيل الأقدم لا يلغي الأحدث', () => {
  let t = 0;
  const link = createPanelLink({ now: () => t });
  link.requestPanelFocus();
  t = FOCUS_REQUEST_MS + 1;
  assert.equal(link.takePanelFocus(), false);
  link.requestPanelFocus();
  assert.equal(link.takePanelFocus(), true);
  assert.equal(link.takePanelFocus(), false, 'يُستهلك مرة');
  const seen = [];
  const offA = link.register(() => seen.push('a'));
  link.register(() => seen.push('b'));
  offA();
  assert.equal(link.focusButton(), true);
  assert.deepEqual(seen, ['b']);
});

test('الفتح من مكان آخر (نافذة الأيقونة) لا يسرق التركيز', () => {
  const page = watchPage({ state: makeState({ prefs: { ...makeState().prefs, ui: { ...makeState().prefs.ui, panelOpen: false } } }) });
  page.mount();
  const other = page.doc.createElement('button');
  page.doc.body.appendChild(other);
  other.focus();
  page.controller.set({ prefs: { ...page.controller.getState().prefs, ui: { ...page.controller.getState().prefs.ui, panelOpen: true } } });
  assert.ok(page.doc._focused === other);
});

test('قائمة الخيارات: التركيز يدخل بندها عند الفتح، ويعود إلى زرها بـEscape، وخروجه منها يغلقها', () => {
  const page = watchPage();
  page.mount();
  const v = ui(page);
  const [opts] = v.qa('.head .b');
  click(opts);
  const item = v.q('.menu [role="menuitem"]');
  assert.ok(page.doc._focused === item);
  key(item, 'Escape');
  assert.ok(page.doc._focused === opts);
  assert.equal(hidden(v.q('.menu')), true);
  click(opts);
  const outside = page.doc.createElement('button');
  page.doc.body.appendChild(outside);
  item.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: outside });
  assert.equal(hidden(v.q('.menu')), true, 'Tab خارجها يغلقها');
  click(opts);
  item.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: opts });
  assert.equal(hidden(v.q('.menu')), false, 'الانتقال إلى زرها لا يغلقها');
});

test('ملء الشاشة: الصفوف تبقى بأعيانها، ولا تتغير حالة التتبّع، ولا إعادة بناء عند الخروج', () => {
  const page = watchPage({ state: makeState({ arabic: { cues: arCues(40, { durMs: 1000, gapMs: 0, startMs: 0 }) } }) });
  page.video.silentTo(10.5);
  const handle = page.mount();
  const list = ui(page).list;
  const rows = layoutList(list);
  page.controller.set({});
  list.dispatchEvent({ type: 'wheel', bubbles: true });
  assert.equal(handle.peek().follow, false);
  const rebuilds = handle.diagnostics().session.rebuilds;
  page.player.classList.add('ytp-fullscreen');
  page.ev('fullscreenchange');
  assert.equal(handle.peek().hostHidden, true);
  assert.equal(ui(page).rows().length, 40, 'الصفوف باقية');
  page.video.tickTo(20.5);
  page.player.classList.remove('ytp-fullscreen');
  page.ev('fullscreenchange');
  assert.equal(handle.peek().hostHidden, false);
  assert.ok(ui(page).rows()[5] === rows[5], 'الصف نفسه');
  assert.equal(handle.diagnostics().session.rebuilds, rebuilds);
  assert.equal(handle.peek().follow, false, 'التتبّع المتوقف يبقى متوقفًا');
  assert.deepEqual(classesOf(ui(page).rows(), 'cur'), [20], 'والحالي تحدّث بما جرى أثناء ملء الشاشة');
  assert.equal(hidden(ui(page).resume), false);
});

test('ملء الشاشة بلوحة مغلقة: لا صفوف أصلًا، والمضيف مخفي قبله وبعده', () => {
  const page = watchPage({ state: makeState({ prefs: { ...makeState().prefs, ui: { ...makeState().prefs.ui, panelOpen: false } } }) });
  const handle = page.mount();
  page.doc.fullscreenElement = page.player;
  page.ev('fullscreenchange');
  assert.equal(handle.peek().hostHidden, true);
  page.doc.fullscreenElement = null;
  page.ev('fullscreenchange');
  assert.equal(handle.peek().hostHidden, true);
  assert.equal(handle.peek().mode, 'none');
  assert.equal(handle.peek().rows, 0);
});

test('يوتيوب يستبدل عنصر الفيديو: تُربط الأحداث بالجديد ويتبعه الصف الحالي، ويُفصل القديم', () => {
  const page = watchPage();
  page.video.silentTo(1.5);
  const handle = page.mount();
  const rows = ui(page).rows();
  assert.deepEqual(classesOf(rows, 'cur'), [0]);
  const old = page.video;
  assert.ok(old.listenerCount('timeupdate') > 0);
  old.remove();
  const next = page.doc.createElement('video');
  next.className = 'html5-main-video';
  prepareVideo(next, { currentTime: 4 });
  page.player.appendChild(next);
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(old.listenerCount('timeupdate'), 0, 'فُصل القديم');
  assert.ok(next.listenerCount('timeupdate') > 0);
  assert.deepEqual(classesOf(rows, 'cur'), [1], 'الجديد عند 4 ث');
  next.tickTo(7);
  assert.deepEqual(classesOf(rows, 'cur'), [2]);
  assert.equal(handle.state, 'mounted');
});

test('بلا عنصر فيديو بعد: الصفوف تُعرض بلا حالي ولا خطأ، ثم يتبع الفيديو إذا ظهر', () => {
  const page = watchPage();
  page.video.remove();
  const handle = page.mount();
  assert.equal(handle.peek().rows, 3);
  assert.deepEqual(classesOf(ui(page).rows(), 'cur'), []);
  assert.equal(handle.diagnostics().session.lastCode, null);
  const next = page.doc.createElement('video');
  next.className = 'html5-main-video';
  prepareVideo(next, { currentTime: 4 });
  page.player.appendChild(next);
  page.env.win.advance(HEALTH_MS + 10);
  assert.deepEqual(classesOf(ui(page).rows(), 'cur'), [1]);
});

test('الفيديو يبدّل زمنه بأحداث seeking وseeked وpause وغيرها فيتحدث الحالي بلا تشغيل', () => {
  const page = watchPage();
  page.mount();
  const rows = ui(page).rows();
  for (const [type, sec, expect] of [['seeking', 4, 1], ['seeked', 7, 2], ['pause', 1.5, 0], ['ratechange', 4, 1], ['loadedmetadata', 0.2, -1], ['emptied', 7, 2]]) {
    page.video.silentTo(sec);
    page.video.dispatchEvent({ type });
    assert.deepEqual(classesOf(rows, 'cur'), expect < 0 ? [] : [expect], type);
  }
});

test('حالة ناقصة أو غريبة لا ترمي: بلا view وsettings وslots، ولغة أصل غريبة', () => {
  const page = watchPage();
  const handle = page.mount();
  const base = page.controller.getState();
  const odd = { key: 'x', kind: 'manual', lang: '', cues: [{ n: 1, startMs: 0, endMs: 1000, text: 'x' }], source: 'captured' };
  assert.doesNotThrow(() => page.controller.set({ view: undefined, settings: undefined, slots: undefined, activeSlot: undefined, english: odd }));
  assert.equal(handle.diagnostics().session.lastCode, null, 'لا PL_RENDER_FAILED');
  assert.equal(handle.peek().mode, 'open');
  assert.equal(ui(page).status.textContent, 'متزامن · 3 مقاطع', 'بلا خانة ولا اسم');
  assert.equal(ui(page).segs()[1].textContent, 'مع الأصل', 'رمز لغة غير معروف ← «الأصل» لا لغة مكتوبة');
  assert.equal(ui(page).q('.off__val b').textContent, '0.0');
  assert.equal(ui(page).qa('.off .b')[1].getAttribute('aria-label'), 'تأخير الترجمة 0.5 ث (تظهر لاحقًا)', 'الخطوة الافتراضية');
  void base;
});

test('بلا prefs في الحالة: التفضيلات الافتراضية (مغلقة)، بلا رمي', () => {
  const page = watchPage();
  const handle = page.mount();
  assert.doesNotThrow(() => page.controller.set({ prefs: undefined }));
  assert.equal(handle.diagnostics().session.lastCode, null);
  assert.equal(handle.peek().mode, 'none');
});

test('مقطع بنص فارغ أو طويل جدًا لا يكسر الصف', () => {
  const long = 'كلمة '.repeat(2000);
  const cues = [{ n: 1, startMs: 0, endMs: 1000, text: '' }, { n: 2, startMs: 1000, endMs: 2000, text: long }, { n: 3, startMs: 2000, endMs: 3000, text: '\n\n' }];
  const page = watchPage({ state: makeState({ arabic: { cues } }) });
  const handle = page.mount();
  assert.equal(handle.peek().rows, 3);
  assert.equal(ui(page).rows()[1].children[1].children[0].textContent.length, long.trim().length);
  assert.equal(ui(page).rows()[0].children[1].children[0].textContent, '');
});

test('المتحكم بلا reload: إعادة المحاولة لا ترمي', () => {
  const page = watchPage({ state: makeState({ arabic: null, activeSlot: null, error: { code: 'ST_READ_FAILED', message: 'x', detail: null } }) });
  delete page.controller.reload;
  const handle = page.mount();
  assert.doesNotThrow(() => click(ui(page).qa('.err .b')[0]));
  assert.equal(handle.state, 'mounted');
});

test('المضيف بلا مشغّل في الصفحة: لا خطأ، والهندسة بديلة (ارتفاع احتياطي)', () => {
  const page = watchPage();
  page.player.remove();
  const handle = page.mount();
  assert.equal(handle.state, 'mounted');
  assert.equal(handle.peek().heightPx === null || handle.peek().heightPx === 480, true);
  assert.equal(handle.peek().place, 'below', 'لا هندسة معروفة ← تحت (الأحذر)');
});

test('الأصل المعروض في الصفوف يتبع تبديل الأصل (مسار آخر)', () => {
  const page = watchPage({ state: makeState({ english: english() }) });
  page.mount();
  assert.equal(ui(page).rows()[0].children[1].children[1].textContent, 'line 1');
  const next = english({ cues: arCues(3).map((c) => ({ ...c, text: `ligne ${c.n}` })), lang: 'fr' });
  page.controller.set({ english: next });
  assert.equal(ui(page).rows()[0].children[1].children[1].textContent, 'ligne 1');
  assert.equal(ui(page).segs()[1].textContent, `مع ${new Intl.DisplayNames(['ar'], { type: 'language' }).of('fr')}`);
});
