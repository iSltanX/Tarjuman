// نقطة التركيب mountPanel: المضيف أول ابن في العمود الثانوي، وإعادة إدراجه، وانتظار العمود، وصفحات غير الفيديو، والتنقل،
// وملء الشاشة، ووضع يوتيوب (فاتح/داكن)، وهندسة الارتفاع والعرض، وأخطاء التركيب، والتنظيف.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH_MS, MAX_FAILURES, mountPanel } from '../../../../src/player/panel/index.js';
import { A, B, makeState, settle, ui, watchPage } from './harness.js';

const hosts = (page) => page.inner.children.filter((c) => c.id === 'tarjuman-panel');

test('المضيف أول ابن في #secondary-inner (قبل عناصر يوتيوب)، مرة واحدة، والحالة mounted', () => {
  const page = watchPage();
  const handle = page.mount();
  assert.equal(handle.state, 'mounted');
  assert.equal(hosts(page).length, 1);
  assert.ok(page.inner.children[0] === hosts(page)[0], 'الأول لا الأخير');
  assert.ok(page.inner.children[1] === page.related);
  page.env.win.advance(HEALTH_MS * 5);
  assert.equal(hosts(page).length, 1, 'الفحص الدوري لا يكرر المضيف');
  assert.equal(handle.diagnostics().attempts, 1);
  assert.equal(handle.diagnostics().session.hostMoves, 1);
});

test('الجذر مغلق الاسم: Shadow DOM لا يصل إليه يوتيوب، والمضيف بمعرّف ثابت', () => {
  const page = watchPage();
  page.mount();
  const host = hosts(page)[0];
  assert.equal(host.id, 'tarjuman-panel');
  assert.ok(host.shadowRoot, 'جذر ظل');
  assert.equal(host.children.length, 0, 'لا أبناء خفيفة: كل شيء داخل الظل');
});

test('لا يغطي الفيديو: المضيف ليس داخل المشغّل ولا فوق عمود الفيديو الأول', () => {
  const page = watchPage();
  page.mount();
  const host = hosts(page)[0];
  assert.equal(page.player.contains(host), false);
  assert.equal(page.primary.contains(host), false);
  assert.equal(page.secondary.contains(host), true);
});

test('بديل #secondary حين لا #secondary-inner', () => {
  const page = watchPage();
  page.inner.remove();
  const handle = page.mount();
  assert.equal(handle.state, 'mounted');
  assert.ok(page.secondary.children[0].id === 'tarjuman-panel');
});

test('عند document_start بلا العمود: ينتظر ثم يركّب فور ظهوره بلا تكرار', () => {
  const page = watchPage({ withColumn: false });
  const handle = page.mount();
  assert.equal(handle.state, 'waiting');
  assert.equal(page.env.observers(), 1, 'مراقب على المستند ما دام العمود غائبًا');
  page.flexy.appendChild(page.secondary);
  page.env.win.advance(60); // تجميع دفعات التغيّر 50ms
  assert.equal(handle.state, 'mounted');
  assert.equal(hosts(page).length, 1);
  page.env.win.advance(HEALTH_MS * 3);
  assert.equal(hosts(page).length, 1);
});

test('يوتيوب يدرج عنصرًا قبل المضيف: يعود أول ابن عند الفحص', () => {
  const page = watchPage();
  page.mount();
  const promo = page.doc.createElement('div');
  promo.className = 'promo';
  page.inner.insertBefore(promo, page.inner.children[0]);
  page.env.win.advance(60); // مراقب أبناء العمود (50ms) يعيده قبل الفحص الدوري
  assert.ok(page.inner.children[0].id === 'tarjuman-panel');
  assert.equal(hosts(page).length, 1);
});

test('يوتيوب يزيل المضيف وحده: يعاد إدراجه، وحالة اللوحة تبقى', () => {
  const page = watchPage();
  page.mount();
  const before = hosts(page)[0];
  before.remove();
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(hosts(page).length, 1);
  assert.ok(hosts(page)[0] === before, 'المضيف نفسه لا جلسة جديدة');
});

test('يوتيوب يعيد رسم العمود بعنصر جديد: ينتقل المضيف إلى الجديد دون فقد الجلسة', () => {
  const page = watchPage();
  const handle = page.mount();
  const host = hosts(page)[0];
  const next = page.doc.createElement('div');
  next.id = 'secondary-inner';
  next.appendChild(page.doc.createElement('div'));
  page.inner.remove();
  page.secondary.appendChild(next);
  page.env.win.advance(HEALTH_MS + 10);
  assert.ok(host.parentNode === next);
  assert.ok(next.children[0] === host);
  assert.equal(handle.state, 'mounted');
  assert.equal(handle.diagnostics().attempts, 1, 'لا جلسة ثانية');
});

test('العمود يغيب مؤقتًا (إعادة رسم): يخرج المضيف ويعود عند ظهوره', () => {
  const page = watchPage();
  const handle = page.mount();
  page.secondary.remove();
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(handle.state, 'waiting');
  assert.equal(page.hostEl(), null);
  page.flexy.appendChild(page.secondary);
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(handle.state, 'mounted');
  assert.equal(hosts(page).length, 1);
});

test('خارج صفحة الفيديو لا لوحة: الجلسة تُدمَّر والمضيف يخرج، ويعود بالتنقل إلى فيديو', () => {
  const page = watchPage({ href: 'https://www.youtube.com/' });
  const handle = page.mount();
  assert.equal(handle.state, 'waiting');
  assert.equal(hosts(page).length, 0);
  assert.equal(page.controller.subscribers(), 0);
  page.navigateTo(A);
  page.env.win.advance(60);
  assert.equal(handle.state, 'mounted');
  assert.equal(hosts(page).length, 1);
  page.env.win.navigate('https://www.youtube.com/results?search_query=x');
  page.doc.dispatchEvent({ type: 'yt-navigate-finish' });
  page.env.win.advance(60);
  assert.equal(handle.state, 'waiting');
  assert.equal(hosts(page).length, 0, 'خرج المضيف من العمود');
  assert.equal(page.controller.subscribers(), 0, 'لا اشتراك معلّق');
});

test('الانتقال بين فيديوهين: الجلسة نفسها والمضيف نفسه (لا ازدواج)', () => {
  const page = watchPage();
  const handle = page.mount();
  const host = hosts(page)[0];
  page.navigateTo(B);
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(hosts(page).length, 1);
  assert.ok(hosts(page)[0] === host);
  assert.equal(handle.diagnostics().attempts, 1);
});

test('ملء الشاشة: يُخفى المضيف ثم يعود بالخروج منه', () => {
  const page = watchPage();
  page.mount();
  const host = hosts(page)[0];
  assert.equal(host.hasAttribute('hidden'), false);
  page.player.classList.add('ytp-fullscreen');
  page.ev('fullscreenchange');
  assert.equal(host.hasAttribute('hidden'), true);
  assert.equal(ui(page).panel.hasAttribute('hidden') || ui(page).entry.hasAttribute('hidden'), true);
  page.player.classList.remove('ytp-fullscreen');
  page.ev('fullscreenchange');
  assert.equal(host.hasAttribute('hidden'), false);
  assert.equal(ui(page).panel.hasAttribute('hidden'), false);
});

test('وضع يوتيوب: فاتح افتراضيًا، وداكن بسمة html[dark] ويعود بإزالتها', () => {
  const page = watchPage();
  const handle = page.mount();
  assert.equal(handle.peek().theme, 'light');
  page.doc.documentElement.setAttribute('dark', '');
  assert.equal(handle.peek().theme, 'dark');
  assert.equal(ui(page).root.querySelector('.root').getAttribute('data-theme'), 'dark');
  page.doc.documentElement.removeAttribute('dark');
  assert.equal(handle.peek().theme, 'light');
});

test('وضع يوتيوب الداكن من أول تركيب إن كانت السمة موجودة', () => {
  const page = watchPage();
  page.doc.documentElement.setAttribute('dark', '');
  const handle = page.mount();
  assert.equal(handle.peek().theme, 'dark');
});

test('الهندسة: عريض ← الارتفاع بارتفاع المشغّل ويتبعه عند تغيّر الحجم', () => {
  const page = watchPage();
  const handle = page.mount();
  const host = hosts(page)[0];
  assert.equal(handle.peek().place, 'beside');
  assert.equal(handle.peek().heightPx, 360);
  assert.equal(host.style.getPropertyValue('--tj-panel-h'), '360px');
  assert.equal(host.getAttribute('data-place'), 'beside');
  page.player.rect = { ...page.player.rect, height: 480, bottom: 480 };
  page.env.win.resize(page.player);
  assert.equal(handle.peek().heightPx, 480);
  assert.equal(host.style.getPropertyValue('--tj-panel-h'), '480px');
});

test('الهندسة: ضيق أو مسرح (العمود تحت الفيديو) ← تحت وبلا ارتفاع المشغّل (حدّ أقصى بالأنماط)', () => {
  const page = watchPage({ beside: false });
  const handle = page.mount();
  const host = hosts(page)[0];
  assert.equal(handle.peek().place, 'below');
  assert.equal(handle.peek().heightPx, null);
  assert.equal(host.getAttribute('data-place'), 'below');
  assert.equal(host.style.getPropertyValue('--tj-panel-h'), '');
  page.setGeometry(true);
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(handle.peek().place, 'beside', 'العودة إلى العريض');
});

test('عرض العمود: ضيق ≤ 320 وعريض ≥ 560 من قياس المضيف، ويتبع تغيّر الحجم', () => {
  const page = watchPage();
  const handle = page.mount();
  const host = hosts(page)[0];
  host.rect = { left: 664, top: 0, width: 402, height: 360, right: 1066, bottom: 360 };
  page.env.win.resize(host);
  assert.deepEqual([handle.peek().narrow, handle.peek().wide], [false, false]);
  host.rect = { ...host.rect, width: 300 };
  page.env.win.resize(host);
  assert.deepEqual([handle.peek().narrow, handle.peek().wide], [true, false]);
  host.rect = { ...host.rect, width: 320 };
  page.env.win.resize(host);
  assert.equal(handle.peek().narrow, true, '320 يُعدّ ضيقًا');
  host.rect = { ...host.rect, width: 640 };
  page.env.win.resize(host);
  assert.deepEqual([handle.peek().narrow, handle.peek().wide], [false, true]);
  assert.equal(ui(page).root.querySelector('.root').hasAttribute('data-wide'), true);
});

test('فشل بناء الجلسة لا يُرمى: رمز PL_MOUNT_FAILED، ويتوقف بعد المحاولات، ويستأنف بالتنقل', () => {
  const page = watchPage();
  let calls = 0;
  const bad = { ...page.controller, getState: page.controller.getState, subscribe() { calls++; throw new Error('boom'); } };
  const handle = mountPanel(bad, { doc: page.doc, win: page.win, uiFonts: null });
  assert.equal(handle.state, 'error');
  assert.equal(handle.diagnostics().lastCode, 'PL_MOUNT_FAILED');
  assert.ok(handle.diagnostics().lastDetail.includes('boom'));
  assert.equal(hosts(page).length, 0, 'لا مضيف نصف مركّب');
  for (let i = 0; i < MAX_FAILURES + 3; i++) page.env.win.advance(HEALTH_MS + 10);
  assert.equal(calls, MAX_FAILURES, 'يتوقف بعد المحاولات المتتالية');
  page.doc.dispatchEvent({ type: 'yt-navigate-finish' });
  page.env.win.advance(60);
  assert.equal(calls, MAX_FAILURES + 1, 'التنقل يصفّر العدّاد فيحاول من جديد');
  handle.unmount();
});

test('فشل الرسم لا يُرمى ولا يعطّل اللوحة: رمز PL_RENDER_FAILED ثم تتعافى عند الحالة التالية', () => {
  const page = watchPage();
  const handle = page.mount();
  const real = page.controller.getState;
  let broken = true;
  page.controller.getState = () => {
    if (broken) throw new Error('state boom');
    return real();
  };
  page.controller.set({ version: 99 });
  assert.equal(handle.diagnostics().session.lastCode, 'PL_RENDER_FAILED');
  assert.ok(handle.diagnostics().session.renderFailures >= 1);
  broken = false;
  page.controller.set({ version: 100 });
  assert.equal(handle.state, 'mounted');
  assert.equal(ui(page).panel.hasAttribute('hidden'), false);
});

test('unmount: يزيل المضيف والاشتراك والمراقبين والمؤقتات، ويصير stub', () => {
  const page = watchPage();
  const handle = page.mount();
  assert.equal(page.controller.subscribers(), 1);
  handle.unmount();
  assert.equal(handle.state, 'stub');
  assert.equal(hosts(page).length, 0);
  assert.equal(page.controller.subscribers(), 0);
  assert.equal(page.env.observers(), 0);
  assert.equal(page.env.resizeObservers(), 0);
  assert.equal(page.env.win.pendingTimers(), 0);
  assert.equal(page.doc.listenerCount('yt-navigate-finish'), 0);
  assert.equal(page.doc.listenerCount('fullscreenchange'), 0);
  assert.equal(page.env.win.listenerCount('resize'), 0);
  handle.unmount();
});

test('الخطوط تُطلب مرة عند أول تركيب ناجح، وتعذّرها رمز لا خطأ', async () => {
  const page = watchPage();
  const calls = [];
  const handle = page.mount({ uiFonts: async (env) => { calls.push(env); return { loaded: ['cairo', 'almarai'], failed: [] }; } });
  await settle();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].doc === page.doc);
  page.env.win.advance(HEALTH_MS * 3);
  assert.equal(calls.length, 1, 'لا إعادة طلب بعد النجاح');
  assert.deepEqual(handle.diagnostics().fonts, { loaded: ['cairo', 'almarai'], failed: [] });
  handle.unmount();
  const p2 = watchPage();
  const h2 = p2.mount({ uiFonts: async () => { throw new Error('no fonts'); } });
  await settle();
  assert.deepEqual(h2.diagnostics().fonts, { loaded: [], failed: ['all'] });
  assert.equal(h2.state, 'mounted', 'التركيب لا ينتظر الخطوط ولا يفشل بها');
});

test('التشخيص: أعداد ورموز فقط، بلا نص مقاطع ولا روابط', () => {
  const page = watchPage({ state: makeState({ arabic: { cues: [{ n: 1, startMs: 0, endMs: 1000, text: 'نص-سري-لا-يظهر' }] } }) });
  const handle = page.mount();
  const json = JSON.stringify(handle.diagnostics());
  assert.ok(!json.includes('نص-سري'));
  assert.ok(!json.includes('youtube.com'));
  assert.equal(handle.diagnostics().session.rows, 1);
});

test('تخطيط العمود الواحد (عرض ضيق): يوتيوب يخفي العمود فينتقل المضيف إلى #below بعد بيانات الفيديو، ويعود بعودة العمودين', () => {
  const page = watchPage();
  const below = page.doc.createElement('div');
  below.id = 'below';
  // كما في يوتيوب: البيانات داخل صندوق في #below لا ابنًا مباشرًا.
  const meta = page.doc.createElement('div');
  meta.className = 'box';
  meta.appendChild(page.doc.createElement('ytd-watch-metadata'));
  const comments = page.doc.createElement('ytd-comments');
  below.append(meta, comments);
  page.primary.appendChild(below);
  page.mount();
  const host = page.hostEl();
  assert.ok(host, 'في العمود أولًا');
  // يوتيوب يتحول إلى عمود واحد: يخفي #secondary وينقل المقترحات تحت الفيديو.
  page.flexy.setAttribute('is-single-column', '');
  page.inner.rect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
  below.rect = { left: 0, top: 380, width: 640, height: 900, right: 640, bottom: 1280 };
  page.env.win.advance(HEALTH_MS + 10);
  assert.ok(host.parentNode === below, 'انتقل إلى #below');
  assert.ok(below.children[0] === meta && below.children[1] === host && below.children[2] === comments, 'بعد بيانات الفيديو وقبل التعليقات');
  assert.equal(page.handle.peek().place, 'below');
  assert.equal(page.hostEl(), null, 'لم يبقَ في العمود المخفي');
  // يوتيوب يدرج عنصرًا بين البيانات والمضيف: يعود بعدها مباشرة عند الفحص.
  const chips = page.doc.createElement('ytd-chips');
  below.insertBefore(chips, host);
  page.env.win.advance(HEALTH_MS + 10);
  assert.ok(below.children[1] === host, 'يعود بعد البيانات مباشرة');
  // عودة العمودين: إلى أول العمود الثانوي، بالجلسة نفسها.
  page.flexy.removeAttribute('is-single-column');
  page.setGeometry(true);
  page.env.win.advance(HEALTH_MS + 10);
  assert.ok(page.hostEl() === host && page.inner.children[0] === host, 'عاد أول العمود');
  assert.equal(page.handle.peek().place, 'beside');
  page.handle.unmount();
});

/** صفحة بـ#columns (كيوتيوب) ونمط محسوب: اتجاه الحاوية وحشو العمودين وهوامشهما كما في واجهته العربية (الفيديو يمينًا). */
function rtlPage({ dir = 'rtl' } = {}) {
  const page = watchPage();
  const cols = page.doc.createElement('div');
  cols.id = 'columns';
  page.flexy.appendChild(cols);
  page.primary.remove();
  page.secondary.remove();
  cols.append(page.primary, page.secondary);
  page.cols = cols;
  page.dir = dir;
  page.native = {
    primary: { paddingLeft: '16px', paddingRight: '0px', marginLeft: '0px', marginRight: '16px' },
    secondary: { paddingLeft: '16px', paddingRight: '0px', marginLeft: '0px', marginRight: '0px' },
  };
  page.win.innerWidth = 1400;
  // حيّ كما في المتصفح: النمط السطري يغلب القيمة الأصلية فور كتابته (فقراءة جانب بعد كتابة الآخر تعيد المكتوب).
  const live = (el, key) => {
    const out = {};
    for (const [css, js] of [['padding-left', 'paddingLeft'], ['padding-right', 'paddingRight'], ['margin-left', 'marginLeft'], ['margin-right', 'marginRight']]) {
      Object.defineProperty(out, js, { enumerable: true, get: () => el.style.getPropertyValue(css) || page.native[key][js] });
    }
    return out;
  };
  page.win.getComputedStyle = (el) => (el === cols ? { direction: page.dir } : el === page.primary ? live(el, 'primary') : el === page.secondary ? live(el, 'secondary') : {});
  return page;
}
const SIDE_PROPS = ['padding-left', 'padding-right', 'margin-left', 'margin-right'];
const sides = (el) => SIDE_PROPS.map((k) => el.style.getPropertyValue(k));
const mirrored = (page) => ({ flex: page.cols.style.getPropertyValue('flex-direction'), primary: sides(page.primary), secondary: sides(page.secondary) });
const NONE = { flex: '', primary: ['', '', '', ''], secondary: ['', '', '', ''] };
const prefsUi = (page, over) => page.controller.set({ prefs: { ...page.controller.getState().prefs, ui: { ...page.controller.getState().prefs.ui, ...over } } });

test('الواجهة العربية (قرار سلطان): تخطيط العمودين معكوس كالمرآة فاللوحة يمين الفيديو بالمقاسات نفسها؛ والإخفاء يعيد يوتيوب كما كان', () => {
  const page = rtlPage();
  page.cols.style.setProperty('flex-direction', 'row');
  page.mount();
  // المشغّل: حشوه الأيسر (الفاصل) يصير أيمن وهامشه الأيمن (حافة الصفحة) يصير أيسر؛ والعمود: حشوه الأيسر (حافة الصفحة) يصير أيمن.
  assert.deepEqual(mirrored(page), { flex: 'row-reverse', primary: ['0px', '16px', '16px', '0px'], secondary: ['0px', '16px', '0px', '0px'] });
  assert.equal(page.handle.peek().mirrored, true);
  assert.equal(page.handle.diagnostics().session.mirrored, true);
  // إخفاء الزر: لا لوحة، فيعود تخطيط يوتيوب وقيمته السطرية السابقة كما كانت.
  prefsUi(page, { panelEntry: false, panelOpen: false });
  assert.equal(page.handle.peek().mode, 'none');
  assert.deepEqual(mirrored(page), { ...NONE, flex: 'row' });
  assert.equal(page.handle.peek().mirrored, false);
  prefsUi(page, { panelEntry: true });
  assert.equal(mirrored(page).flex, 'row-reverse', 'يعود العكس بعودة الزر');
  // يوتيوب يغيّر تخطيطه (عرض النافذة): تُستعاد قيمه ثم تُقرأ الجديدة وتُعكس.
  page.native.primary = { paddingLeft: '24px', paddingRight: '0px', marginLeft: '0px', marginRight: '24px' };
  page.win.innerWidth = 1280;
  page.env.win.advance(HEALTH_MS + 10);
  assert.deepEqual(mirrored(page).primary, ['0px', '24px', '24px', '0px'], 'بقيم يوتيوب الجديدة');
  // الإزالة تستعيد كل شيء.
  page.handle.unmount();
  assert.deepEqual(mirrored(page), { ...NONE, flex: 'row' });
});

test('الواجهة LTR لا تُمس، والتحوّل إليها يستعيد؛ والعمود الواحد (#below) يستعيد؛ والإزالة تستعيد', () => {
  const ltr = rtlPage({ dir: 'ltr' });
  ltr.mount();
  assert.deepEqual(mirrored(ltr), NONE, 'الإنجليزية: العمود يمين الفيديو أصلًا');
  assert.equal(ltr.handle.peek().mirrored, false);
  ltr.handle.unmount();

  const page = rtlPage();
  page.mount();
  assert.equal(mirrored(page).flex, 'row-reverse');
  page.dir = 'ltr';
  page.env.win.advance(HEALTH_MS + 10);
  assert.deepEqual(mirrored(page), NONE, 'تحوّل يوتيوب إلى LTR');
  page.dir = 'rtl';
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(mirrored(page).flex, 'row-reverse');
  // العمود الواحد: اللوحة تحت الفيديو في #below، فلا عكس.
  const below = page.doc.createElement('div');
  below.id = 'below';
  page.primary.appendChild(below);
  page.flexy.setAttribute('is-single-column', '');
  page.env.win.advance(HEALTH_MS + 10);
  assert.ok(page.hostEl() === null && below.children.some((c) => c.id === 'tarjuman-panel'));
  assert.deepEqual(mirrored(page), NONE, 'العمود الواحد يستعيد');
  page.flexy.removeAttribute('is-single-column');
  page.env.win.advance(HEALTH_MS + 10);
  assert.equal(mirrored(page).flex, 'row-reverse', 'وعودة العمودين تعيده');
  page.handle.unmount();
  assert.deepEqual(mirrored(page), NONE, 'الإزالة تستعيد');
});
