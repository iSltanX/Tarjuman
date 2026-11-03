// الصفوف والمزامنة والتتبّع: صف لكل مقطع عربي بزمنه (البداية + الإزاحة) ونصه والأصل تحته، والحالي بقاعدة الطبقة مع الإزاحة،
// والماضي والتقدم، والقفز بالضغط، وتتبّع الصف الحالي داخل القائمة وإيقافه بتمرير المستخدم و«العودة إلى»، وتبديل الفيديو
// والخانة، وكفاءة آلاف المقاطع (بناء مرة، وتحديث صفوف قليلة).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { A, B, arCues, click, english, hidden, key, layoutList, makeState, ui, watchPage } from './harness.js';

const cueList = (...spec) => spec.map(([startMs, endMs, text], i) => ({ n: i + 1, startMs, endMs, text }));
const classesOf = (rows, cls) => rows.map((r, i) => (r.classList.contains(cls) ? i : -1)).filter((i) => i >= 0);

/** صفحة مفتوحة بمقاطع معطاة وقائمة بتخطيط وهمي، والفيديو عند t ثانية. */
function open({ cues = arCues(5), t = 0, state = {}, view = { height: 400, row: 50 } } = {}) {
  const page = watchPage({ state: makeState({ arabic: { cues }, ...state }) });
  page.video.silentTo(t);
  const handle = page.mount();
  const v = ui(page);
  const rows = layoutList(v.list, { rowH: view.row, viewH: view.height });
  return { page, handle, v, rows, list: v.list };
}

test('صف لكل مقطع: زمن (بداية + إزاحة) وزر والنص العربي باتجاه حروفه', () => {
  const cues = cueList([1000, 3000, 'سطر عربي'], [3500, 5500, 'API هو الواجهة'], [6000, 8000, 'OK'], [3725000, 3730000, 'بعد ساعة']);
  const { rows, handle } = open({ cues });
  assert.equal(rows.length, 4);
  assert.equal(handle.peek().rows, 4);
  const t = (r) => r.children[0];
  assert.deepEqual(rows.map((r) => t(r).textContent), ['00:01', '00:03', '00:06', '1:02:05']);
  assert.ok(rows.every((r) => t(r).tagName === 'button' && t(r).getAttribute('type') === 'button'), 'زمن الصف زر (لوحة المفاتيح)');
  assert.equal(t(rows[0]).getAttribute('aria-label'), 'الانتقال إلى 00:01');
  const ar = (r) => r.children[1].children[0];
  assert.deepEqual(rows.map((r) => ar(r).textContent), ['سطر عربي', 'API هو الواجهة', 'OK', 'بعد ساعة']);
  assert.deepEqual(rows.map((r) => ar(r).getAttribute('dir')), ['rtl', 'rtl', 'ltr', 'rtl'], 'RTL إن احتوى حرفًا عربيًا ولو بدأ بلاتيني');
  assert.ok(rows.every((r) => r.getAttribute('role') === 'listitem'));
  assert.equal(rows[2].getAttribute('data-i'), '2');
});

test('المقطع متعدد الأسطر يُعرض متصلًا', () => {
  const { rows } = open({ cues: cueList([0, 1000, 'سطر أول\nسطر ثانٍ']) });
  assert.equal(rows[0].children[1].children[0].textContent, 'سطر أول سطر ثانٍ');
});

test('الأصل تحت العربي بتداخل الزمن مضمومًا، ويختفي بإطفاء المزدوج أو بغياب الأصل', () => {
  const cues = arCues(3); // 1000–3000، 3500–5500، 6000–8000
  const en = english({ cues: cueList([0, 2000, 'hello'], [2000, 4000, 'world'], [4000, 9000, 'again']) });
  const { rows, page } = open({ cues, state: { english: en } });
  const enOf = (r) => r.children[1].children[1]?.textContent ?? null;
  assert.deepEqual(rows.map(enOf), ['hello world', 'world again', 'again']);
  assert.equal(rows[0].children[1].children[1].className, 'en');
  page.controller.set({ prefs: { ...page.controller.getState().prefs, ui: { ...page.controller.getState().prefs.ui, panelDual: false } } });
  assert.deepEqual(ui(page).rows().map(enOf), [null, null, null]);
  page.controller.set({ prefs: { ...page.controller.getState().prefs, ui: { ...page.controller.getState().prefs.ui, panelDual: true } } });
  assert.deepEqual(ui(page).rows().map(enOf), ['hello world', 'world again', 'again']);
  page.controller.set({ english: null });
  assert.deepEqual(ui(page).rows().map(enOf), [null, null, null]);
});

test('الأصل بلا تداخل مع مقطع ← لا سطر أصل لذلك الصف', () => {
  const { rows } = open({ cues: arCues(2), state: { english: english({ cues: cueList([1000, 3000, 'only first']) }) } });
  assert.equal(rows[0].children[1].children.length, 2);
  assert.equal(rows[1].children[1].children.length, 1);
});

test('الحالي بقاعدة الطبقة: يتبع currentTime، وغير الحالي لا aria-current له، والماضي خافت', () => {
  const { page, rows } = open({ t: 7 }); // الثالث 6.0–8.0
  assert.deepEqual(classesOf(rows, 'cur'), [2]);
  assert.equal(rows[2].getAttribute('aria-current'), 'true');
  assert.deepEqual(classesOf(rows, 'past'), [0, 1]);
  assert.ok(rows.filter((_, i) => i !== 2).every((r) => !r.hasAttribute('aria-current')));
  page.video.tickTo(11.5); // الخامس 11.0–13.0
  assert.deepEqual(classesOf(rows, 'cur'), [4]);
  assert.deepEqual(classesOf(rows, 'past'), [0, 1, 2, 3]);
  page.video.tickTo(0.2); // قبل الأول
  assert.deepEqual(classesOf(rows, 'cur'), []);
  assert.deepEqual(classesOf(rows, 'past'), []);
  assert.equal(rows[0].hasAttribute('aria-current'), false);
});

test('الفجوة بين مقطعين: لا حالي، والماضي ما بدأ، والمرساة آخر ما بدأ', () => {
  const { page, rows, handle } = open({ t: 3.2 }); // بين الأول (ينتهي 3.0) والثاني (يبدأ 3.5)
  assert.deepEqual(classesOf(rows, 'cur'), []);
  assert.deepEqual(classesOf(rows, 'past'), [0]);
  assert.equal(handle.peek().anchor, 0);
  page.video.tickTo(3.6);
  assert.deepEqual(classesOf(rows, 'cur'), [1]);
});

test('الإزاحة تدخل قاعدة الحالي: مع +1 ث (تظهر لاحقًا) يتأخر الصف الحالي، ومع −1 ث يتقدم', () => {
  const { page, rows } = open({ t: 4 }); // بلا إزاحة: الثاني 3.5–5.5
  assert.deepEqual(classesOf(rows, 'cur'), [1]);
  page.controller.set({ view: { displayOffsetMs: 1000, displayMode: 'ar' } }); // يبحث عن 3.0 ← فجوة
  assert.deepEqual(classesOf(rows, 'cur'), []);
  page.controller.set({ view: { displayOffsetMs: 2000, displayMode: 'ar' } }); // 2.0 ← الأول
  assert.deepEqual(classesOf(rows, 'cur'), [0]);
  page.controller.set({ view: { displayOffsetMs: -2000, displayMode: 'ar' } }); // 6.0 ← الثالث
  assert.deepEqual(classesOf(rows, 'cur'), [2]);
});

test('تقدم الصف الحالي: نسبة المنقضي من مدى المقطع، ويُنقل مع الحالي ولا يبقى في غيره', () => {
  const { page, rows, v } = open({ t: 7 }); // 6.0–8.0 عند 7 ← 0.5
  const prog = () => v.q('.prog i').style.getPropertyValue('transform');
  assert.equal(prog(), 'scaleX(0.5)');
  assert.ok(rows[2].children[1].children.some((c) => c.className === 'prog'));
  page.video.tickTo(7.5);
  assert.equal(prog(), 'scaleX(0.75)');
  page.video.tickTo(9.5); // الرابع 8.5–10.5 ← 0.5
  assert.equal(prog(), 'scaleX(0.5)');
  assert.equal(v.qa('.prog').length, 1, 'شريط واحد فقط');
  assert.ok(rows[3].children[1].children.some((c) => c.className === 'prog'));
  assert.ok(!rows[2].children[1].children.some((c) => c.className === 'prog'));
  page.video.tickTo(0.1);
  assert.equal(v.qa('.prog').length, 0, 'لا حالي ← الشريط يخرج من DOM');
});

test('لا حالي ← لا شريط تقدم في أي صف', () => {
  const { page, rows } = open({ t: 7 });
  page.video.tickTo(0.1);
  assert.ok(rows.every((r) => !r.children[1].children.some((c) => c.className === 'prog')));
});

test('تغيّر الإزاحة يحدّث الأزمنة في مكانها: الصفوف نفسها (لا إعادة بناء)، والتسمية والاسم الوصولي', () => {
  const { page, rows, v, handle } = open();
  const generation = page.handle.diagnostics().session.rebuilds;
  const first = rows[0];
  assert.equal(first.children[0].textContent, '00:01');
  page.controller.set({ view: { displayOffsetMs: 2000, displayMode: 'ar' } });
  assert.ok(ui(page).rows()[0] === first, 'الصف نفسه');
  assert.equal(first.children[0].textContent, '00:03');
  assert.equal(first.children[0].getAttribute('aria-label'), 'الانتقال إلى 00:03');
  assert.equal(ui(page).rows()[4].children[0].textContent, '00:13');
  assert.equal(handle.diagnostics().session.rebuilds, generation, 'لا إعادة بناء');
  page.controller.set({ view: { displayOffsetMs: -500, displayMode: 'ar' } });
  assert.equal(first.children[0].textContent, '00:00', 'الزمن السالب يُقصر على صفر');
  assert.equal(v.list.children.length, 5);
});

test('تغيّر الإزاحة من المتحكم (أزرار المشغّل) يظهر في اللوحة، ومن اللوحة يصل المتحكم والعكس', () => {
  const { page, rows } = open();
  page.controller.setOffset(1500); // كما يفعل زر المشغّل
  assert.equal(rows[0].children[0].textContent, '00:02');
  assert.equal(ui(page).q('.off__val b').textContent, '+1.5');
  click(ui(page).qa('.off .b')[1]); // تأخير من اللوحة (+0.5)
  assert.equal(page.controller.getState().view.displayOffsetMs, 2000);
  assert.equal(rows[0].children[0].textContent, '00:03');
});

test('القفز: الضغط على زمن الصف ينقل الفيديو إلى (البداية + الإزاحة)/1000 ويحدّث الحالي فورًا', () => {
  const { page, rows } = open();
  click(rows[2].children[0]);
  assert.deepEqual(page.video.writes, [6]);
  assert.deepEqual(classesOf(rows, 'cur'), [2]);
  page.controller.set({ view: { displayOffsetMs: 500, displayMode: 'ar' } });
  click(rows[3].children[0]);
  assert.equal(page.video.writes.at(-1), 9, '8500 + 500 = 9000ms');
});

test('القفز: الضغط على نص الصف (لا الزمن) ينقل أيضًا؛ والضغط على حاشية القائمة لا ينقل', () => {
  const { page, rows, list } = open();
  click(rows[1].children[1].children[0]);
  assert.deepEqual(page.video.writes, [3.5]);
  click(rows[4]);
  assert.equal(page.video.writes.at(-1), 11);
  const n = page.video.writes.length;
  click(list);
  assert.equal(page.video.writes.length, n);
});

test('القفز: لا كتابة في currentTime أثناء إعلان، والزمن السالب يُقصر على صفر، وتبقى حالة التشغيل', () => {
  const { page, rows } = open();
  page.player.classList.add('ad-showing');
  click(rows[2].children[0]);
  assert.deepEqual(page.video.writes, []);
  page.player.classList.remove('ad-showing');
  page.controller.set({ view: { displayOffsetMs: -2000, displayMode: 'ar' } });
  click(rows[0].children[0]); // 1000 − 2000 = −1000 ← 0
  assert.deepEqual(page.video.writes, [0]);
  assert.equal(page.video.paused, true, 'لا تشغيل ولا إيقاف');
});

test('أثناء الإعلان لا يتبع الصف الحالي زمن الإعلان (يتجمد)', () => {
  const { page, rows } = open({ t: 7 });
  assert.deepEqual(classesOf(rows, 'cur'), [2]);
  page.player.classList.add('ad-showing');
  page.video.tickTo(0.5); // زمن الإعلان
  assert.deepEqual(classesOf(rows, 'cur'), [2]);
  page.player.classList.remove('ad-showing');
  page.video.tickTo(0.5);
  assert.deepEqual(classesOf(rows, 'cur'), []);
});

test('التشغيل: حلقة rAF تعمل أثناء التشغيل وتتوقف بالإيقاف، وتبدّل الصف عند حدّ المقطع', () => {
  const { page, rows } = open({ t: 1.5 });
  page.video.setPlaying(true);
  assert.equal(page.env.win._raf.size, 1, 'حلقة واحدة');
  const run = () => {
    const [[id, cb]] = [...page.env.win._raf.entries()];
    page.env.win._raf.delete(id);
    cb();
  };
  assert.deepEqual(classesOf(rows, 'cur'), [0]);
  page.video.silentTo(3.6);
  run();
  assert.deepEqual(classesOf(rows, 'cur'), [1]);
  assert.equal(page.env.win._raf.size, 1, 'تواصل');
  page.video.setPlaying(false);
  assert.equal(page.env.win._raf.size, 0, 'تتوقف بالإيقاف');
});

// ———— التتبّع ————

const many = (n) => arCues(n, { durMs: 1000, gapMs: 0, startMs: 0 }); // مقطع لكل ثانية

test('التتبّع مفعّل: عند أول عرض يوضع الصف الحالي في موضعه داخل القائمة (لا الصفحة)', () => {
  const { page, list, v } = open({ cues: many(100), t: 50.5 });
  page.controller.set({}); // أول إعادة رسم بعد التخطيط: وضع أول تمرير (snap)
  const last = list.scrolls.at(-1);
  assert.ok(last, 'تحرّكت القائمة');
  assert.equal(last.top, 50 * 50 - Math.round(400 * 0.3), 'الصف 50 عند ثلاثين بالمئة من ارتفاع القائمة');
  assert.equal(last.behavior, 'auto', 'فورًا لا بسلاسة');
  assert.equal(page.doc.documentElement.scrollTop ?? 0, 0, 'الصفحة لم تتحرك');
  assert.equal(hidden(v.resume), true);
});

test('التتبّع أثناء التشغيل: داخل النطاق المريح لا تتحرك القائمة، وخارجه تتحرك، والبعيد جدًا فورًا', () => {
  const { page, list } = open({ cues: many(300), t: 50.5 });
  page.controller.set({});
  const base = list.scrolls.length;
  const view = list.scrollTop;
  page.video.tickTo(51.5); // صف 51: أعلاه 2550 داخل [view+32, view+240]
  assert.equal(list.scrolls.length, base, 'داخل النطاق');
  page.video.tickTo(250.5); // بعيد خارج النطاق
  assert.equal(list.scrolls.length, base + 1);
  assert.equal(list.scrolls.at(-1).top, 250 * 50 - 120);
  assert.equal(list.scrolls.at(-1).behavior, 'auto', 'المسافة > ثلاثة أضعاف ارتفاع القائمة ← فورًا');
  assert.ok(list.scrollTop !== view);
});

test('التتبّع: الانتقال القريب بسلاسة', () => {
  const { page, list } = open({ cues: many(100), t: 50.5 });
  page.controller.set({});
  const view = list.scrollTop; // 2380
  page.video.tickTo(58.5); // صف 58 أعلاه 2900: خارج النطاق (> view + 240) والمسافة قريبة
  const s = list.scrolls.at(-1);
  assert.equal(s.top, 58 * 50 - 120);
  assert.equal(s.behavior, 'smooth');
  assert.ok(Math.abs(s.top - view) < 400 * 3);
});

test('تمرير المستخدم (عجلة) يوقف التتبّع: يتبدّل المفتاح، وتظهر «العودة إلى ‹الزمن›»، ولا تتحرك القائمة بعدها', () => {
  const { page, list, v } = open({ cues: many(100), t: 50.5 });
  page.controller.set({});
  const base = list.scrolls.length;
  list.dispatchEvent({ type: 'wheel', bubbles: true });
  assert.equal(ui(page).switchEl.getAttribute('aria-checked'), 'false');
  assert.equal(page.handle.peek().follow, false);
  const pill = ui(page).resume;
  assert.equal(hidden(pill), false, 'تظهر فور إيقاف التتبّع');
  assert.ok(pill.textContent.includes('العودة إلى'));
  assert.ok(pill.textContent.includes('00:50'), 'زمن المرساة');
  assert.equal(pill.getAttribute('aria-label'), 'العودة إلى 00:50');
  page.video.tickTo(80.5);
  assert.equal(list.scrolls.length, base, 'لا تحرّك بعد الإيقاف');
  assert.ok(ui(page).resume.textContent.includes('01:20'), 'الزمن يتبع المرساة الحالية');
  assert.equal(v.rows().length, 100);
});

test('تمرير اللمس ولوحة المفاتيح (أسهم وPageUp وHome…) وشريط التمرير توقف التتبّع؛ والضغط على صف أو مفتاح عادي لا', () => {
  for (const [type, extra] of [['touchmove', {}], ['keydown', { key: 'ArrowDown' }], ['keydown', { key: 'PageUp' }], ['keydown', { key: 'Home' }], ['keydown', { key: 'End' }]]) {
    const { page, list } = open({ cues: many(30), t: 5.5 });
    list.dispatchEvent({ type, bubbles: true, ...extra });
    assert.equal(page.handle.peek().follow, false, `${type} ${extra.key ?? ''}`);
  }
  const bar = open({ cues: many(30), t: 5.5 });
  bar.list.dispatchEvent({ type: 'mousedown', bubbles: true });
  assert.equal(bar.page.handle.peek().follow, false, 'شريط التمرير (الهدف القائمة نفسها)');
  const keep = open({ cues: many(30), t: 5.5 });
  key(keep.list, 'a');
  keep.rows[3].dispatchEvent({ type: 'mousedown', bubbles: true });
  click(keep.rows[3]);
  assert.equal(keep.page.handle.peek().follow, true, 'ليست تمريرًا');
});

test('«العودة إلى …»: تعيد التتبّع وتضع المرساة في موضعها وتختفي', () => {
  const { page, list } = open({ cues: many(100), t: 50.5 });
  page.controller.set({});
  list.dispatchEvent({ type: 'wheel', bubbles: true });
  list.scrollTop = 0; // المستخدم ابتعد
  page.video.tickTo(60.5);
  const base = list.scrolls.length;
  click(ui(page).resume);
  assert.equal(page.handle.peek().follow, true);
  assert.equal(ui(page).switchEl.getAttribute('aria-checked'), 'true');
  assert.equal(list.scrolls.length, base + 1);
  assert.equal(list.scrolls.at(-1).top, 60 * 50 - 120, 'المرساة الحالية');
  assert.equal(hidden(ui(page).resume), true);
});

test('المفتاح: إطفاؤه يوقف التتبّع وإشعاله يعيده بالتمرير إلى المرساة', () => {
  const { page, list } = open({ cues: many(100), t: 50.5 });
  page.controller.set({});
  click(ui(page).switchEl);
  assert.equal(page.handle.peek().follow, false);
  assert.equal(hidden(ui(page).resume), false);
  list.scrollTop = 0;
  const base = list.scrolls.length;
  click(ui(page).switchEl);
  assert.equal(page.handle.peek().follow, true);
  assert.equal(list.scrolls.length, base + 1);
  assert.equal(list.scrolls.at(-1).top, 50 * 50 - 120);
});

test('«العودة إلى» تبقى ظاهرة ما دام التتبّع متوقفًا (ولو تمرّر المستخدم قرب المرساة) وتزول بالعودة', () => {
  const { page, list } = open({ cues: many(100), t: 50.5 });
  page.controller.set({});
  list.dispatchEvent({ type: 'wheel', bubbles: true });
  list.scrollTop = 2400;
  list.dispatchEvent({ type: 'scroll' });
  assert.equal(hidden(ui(page).resume), false);
  page.video.tickTo(51.5);
  assert.ok(ui(page).resume.textContent.includes('00:51'));
  click(ui(page).resume);
  assert.equal(hidden(ui(page).resume), true);
});

test('التتبّع لا يستعمل scrollIntoView (يحرّك القائمة وحدها)', () => {
  const { page, rows, list } = open({ cues: many(100), t: 50.5 });
  let called = 0;
  rows.forEach((r) => {
    r.scrollIntoView = () => called++;
  });
  page.controller.set({});
  page.video.tickTo(90.5);
  assert.equal(called, 0);
  assert.ok(list.scrolls.length > 0);
});

// ———— تبديل الفيديو والخانة والبيانات ————

test('تبديل الفيديو يمسح الصفوف فورًا ثم تُبنى صفوف الجديد، وحالة التتبّع لا تتسرب', () => {
  const { page, list } = open({ cues: many(20), t: 5.5 });
  assert.equal(page.handle.peek().rows, 20);
  list.dispatchEvent({ type: 'wheel', bubbles: true });
  page.navigateTo(B);
  assert.equal(page.handle.peek().kind, 'loading', 'تنقّل جارٍ');
  assert.equal(page.handle.peek().rows, 0, 'مُسحت الصفوف القديمة');
  assert.equal(ui(page).rows().length, 0);
  page.controller.set({ videoId: B, loading: true, arabic: null, activeSlot: null });
  page.controller.set({ loading: false, arabic: { cues: cueList([0, 1000, 'الفيديو الثاني']), edited: false, fileName: 'b.srt', comparison: null }, activeSlot: 1 });
  page.env.win.advance(2000);
  assert.equal(page.handle.peek().kind, 'ready');
  assert.equal(page.handle.peek().rows, 1);
  assert.equal(ui(page).rows()[0].children[1].children[0].textContent, 'الفيديو الثاني');
  assert.equal(page.handle.peek().current, -1, 'لا صف حالي قديم');
});

test('الفيديو في الحالة غير فيديو الصفحة: لا صفوف أبدًا (لا خلط بين الفيديوهات)', () => {
  const page = watchPage({ state: makeState({ videoId: B }) });
  const handle = page.mount();
  assert.equal(handle.peek().rows, 0);
  assert.equal(handle.peek().kind, 'loading');
  void A;
});

test('تبديل الخانة (مقاطع أخرى): تُبنى الصفوف من جديد ويُحسب الحالي من المقاطع الجديدة لا المخزَّنة', () => {
  const { page, rows } = open({ t: 4 });
  assert.deepEqual(classesOf(rows, 'cur'), [1]);
  const next = cueList([0, 1000, 'ترجمة بديلة'], [1000, 5000, 'طويلة'], [5000, 6000, 'ثالثة']);
  page.controller.set({
    arabic: { cues: next, edited: false, fileName: 'alt.srt', comparison: null }, activeSlot: 3,
    slots: [1, 2, 3].map((n) => ({ n, filled: n === 3, active: n === 3, name: 'بديلة', edited: false, cueCount: n === 3 ? 3 : 0 })),
  });
  const now = ui(page).rows();
  assert.equal(now.length, 3);
  assert.deepEqual(now.map((r) => r.children[1].children[0].textContent), ['ترجمة بديلة', 'طويلة', 'ثالثة']);
  assert.deepEqual(classesOf(now, 'cur'), [1], 'عند 4 ث المقطع الثاني (1–5)');
  assert.equal(ui(page).status.textContent, 'متزامن · الترجمة 3 «بديلة» · 3 مقاطع');
});

test('تعديل المحرّر لنص المقطع (مصفوفة جديدة): إعادة بناء، والموضع الحالي محفوظ', () => {
  const { page } = open({ t: 4 });
  const edited = arCues(5).map((c) => ({ ...c, text: `${c.text} معدّل` }));
  page.controller.set({ arabic: { cues: edited, edited: true, fileName: 'talk.ar.srt', comparison: null } });
  const rows = ui(page).rows();
  assert.equal(rows[1].children[1].children[0].textContent, 'سطر 2 معدّل');
  assert.deepEqual(classesOf(rows, 'cur'), [1]);
});

test('تغيّر الحالة بلا تغيّر المقاطع لا يعيد البناء (صفوف بأعيانها)', () => {
  const { page, rows, handle } = open({ cues: many(50), t: 10.5 });
  const rebuilds = handle.diagnostics().session.rebuilds;
  page.controller.set({ notice: { code: 'X' } });
  page.controller.set({ version: 50 });
  page.controller.set({ settings: { ...page.controller.getState().settings, offsetStepMs: 1000 } });
  assert.ok(ui(page).rows()[7] === rows[7]);
  assert.equal(handle.diagnostics().session.rebuilds, rebuilds);
});

test('مقاطع غير مرتبة: الصفوف بترتيب الملف، والحالي بقاعدة الطبقة', () => {
  const cues = cueList([6000, 8000, 'ثالث زمنيًا'], [1000, 3000, 'أول زمنيًا'], [3500, 5500, 'ثانٍ زمنيًا']);
  const { page, rows } = open({ cues, t: 4 });
  assert.deepEqual(rows.map((r) => r.children[1].children[0].textContent), ['ثالث زمنيًا', 'أول زمنيًا', 'ثانٍ زمنيًا']);
  assert.deepEqual(classesOf(rows, 'cur'), [2]);
  assert.deepEqual(classesOf(rows, 'past'), [1]);
  page.video.tickTo(7);
  assert.deepEqual(classesOf(rows, 'cur'), [0]);
  assert.deepEqual(classesOf(rows, 'past').sort(), [1, 2]);
});

// ———— الكفاءة ————

test('آلاف المقاطع: بناء مرة واحدة، وتغيّر الصف الحالي يمس صفوفًا قليلة، والتقدم داخل المقطع لا يمس DOM', () => {
  const cues = many(3000);
  const en = english({ cues: cues.map((c) => ({ ...c, text: `line ${c.n}` })) });
  const page = watchPage({ state: makeState({ arabic: { cues }, english: en }) });
  page.video.silentTo(100.5);
  const t0 = process.hrtime.bigint();
  const handle = page.mount();
  const buildMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const v = ui(page);
  assert.equal(handle.peek().rows, 3000);
  assert.ok(buildMs < 3000, `بناء 3000 صف في ${buildMs.toFixed(0)}ms`);
  assert.equal(v.rows()[2999].children[1].children[1].textContent, 'line 3000');
  layoutList(v.list);
  page.controller.set({});
  const rebuilds = handle.diagnostics().session.rebuilds;
  assert.equal(rebuilds, 1);

  let mutations = 0;
  const MO = page.win.MutationObserver;
  const mo = new MO(() => {
    mutations++;
  });
  mo.observe(v.list, { attributes: true, childList: true, subtree: true });
  page.video.tickTo(100.7); // داخل المقطع نفسه
  page.video.tickTo(100.9);
  assert.equal(mutations, 0, 'التقدم داخل المقطع بلا تغيّر في DOM (نمط فقط)');
  page.video.tickTo(101.5); // المقطع التالي
  assert.ok(mutations > 0 && mutations <= 12, `تغيّر الحالي لمس ${mutations} تعديلًا`);
  assert.equal(handle.diagnostics().session.rebuilds, rebuilds, 'لا إعادة بناء');
  mutations = 0;
  page.video.tickTo(2000.5); // قفزة بعيدة: الماضي يتغير لآلاف الصفوف (صنف فقط)، لا بناء
  assert.equal(handle.diagnostics().session.rebuilds, rebuilds);
  mo.disconnect();
});

test('آلاف المقاطع: تغيّر الإزاحة لا يعيد البناء ويحدّث الأزمنة وحدها', () => {
  const cues = many(2500);
  const page = watchPage({ state: makeState({ arabic: { cues } }) });
  const handle = page.mount();
  const first = ui(page).rows()[0];
  page.controller.setOffset(5000);
  assert.ok(ui(page).rows()[0] === first);
  assert.equal(handle.diagnostics().session.rebuilds, 1);
  assert.equal(ui(page).rows()[2499].children[0].textContent, '41:44');
});

test('مراجعة الهوية L2: الإغلاق ثم الفتح، أو تحميل ترجمة أخرى، يعيدان التتبّع من الحالي (لا «العودة إلى» قديمة)', () => {
  const { page, list } = open({ cues: many(100), t: 50.5 });
  list.dispatchEvent({ type: 'wheel', bubbles: true });
  assert.equal(page.handle.peek().follow, false);
  const ui0 = page.controller.getState().prefs.ui;
  page.controller.set({ prefs: { ui: { ...ui0, panelOpen: false } } });
  assert.equal(page.handle.peek().mode, 'none');
  page.controller.set({ prefs: { ui: { ...ui0, panelOpen: true } } });
  const p = page.handle.peek();
  assert.equal(p.mode, 'open');
  assert.equal(p.follow, true, 'التتبّع مفعّل بعد الفتح');
  assert.equal(p.resume, null, 'لا «العودة إلى» من الجلسة السابقة');
  assert.equal(ui(page).switchEl.getAttribute('aria-checked'), 'true');
  // ترجمة أخرى تُحمَّل (حالة تحميل ثم صفوف): من الحالي أيضًا.
  list.dispatchEvent({ type: 'wheel', bubbles: true });
  assert.equal(page.handle.peek().follow, false);
  page.controller.set({ loading: true, arabic: null });
  page.controller.set({ loading: false, arabic: { cues: many(80) } });
  assert.equal(page.handle.peek().follow, true);
});

