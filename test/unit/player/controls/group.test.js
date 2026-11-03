// الأزرار الخمسة (P6-AC1 وAC2 وAC10 الجزء الآلي): الحالات والتلميحات بالخطوة الحالية، والمقاسات الثلاثة دون إخفاء
// − و+، وتبعية القوائم والتلميحات لظهور الشريط، و± يغيّر الإزاحة وحدها بخطوة الإعداد مع نبضة وتلميح عابر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { FLASH_MS } from '../../../../src/player/controls/session.js';
import { groupCss } from '../../../../src/player/controls/styles.js';
import { arabic, click, key, makeState, mountPage, settle, trackInfo } from './harness.js';

const withArabic = (over = {}) => makeState({ arabic: arabic(), ...over });

test('بلا ترجمة عربية: − والشارة و+ معطّلة بسببها (تبقى قابلة للتركيز)، والرفع والتحميل متاحان', () => {
  const { ui } = mountPage();
  for (const k of ['minus', 'badge', 'plus']) {
    assert.equal(ui.btn(k).getAttribute('aria-disabled'), 'true', k);
    assert.match(ui.btn(k).getAttribute('aria-label'), /ارفع ترجمة عربية أولًا/);
  }
  assert.equal(ui.btn('upload').getAttribute('aria-disabled'), null);
  assert.equal(ui.btn('download').getAttribute('aria-disabled'), null);
  assert.equal(ui.btn('upload').getAttribute('aria-label'), 'رفع الترجمة العربية (SRT)');
  assert.equal(ui.btn('download').getAttribute('aria-label'), 'تحميل الأصل (SRT)');
});

test('أثناء قراءة المحفوظ: أفعال العرض معطّلة بسبب ظاهر، والضغط لا يغيّر شيئًا', () => {
  const page = mountPage({ state: withArabic({ loading: true }) });
  assert.match(page.ui.btn('plus').getAttribute('aria-label'), /جارٍ قراءة/);
  click(page.ui.btn('plus'));
  assert.deepEqual(page.controller.calls, []);
  assert.match(page.ui.tip(), /جارٍ قراءة/, 'الضغط على المعطّل يظهر سببه');
});

test('التلميحات بالخطوة الحالية ومعنى الإشارة، والشارة بإشارتها', () => {
  const page = mountPage({ state: withArabic({ view: { displayOffsetMs: 500, displayMode: 'ar' } }) });
  const { ui } = page;
  assert.equal(ui.btn('minus').getAttribute('aria-label'), 'تقديم الترجمة 0.5 ث (تظهر أبكر)');
  assert.equal(ui.btn('plus').getAttribute('aria-label'), 'تأخير الترجمة 0.5 ث (تظهر لاحقًا)');
  assert.equal(ui.btn('badge').getAttribute('aria-label'), 'الإزاحة: \u2066+0.5\u2069 ث (تظهر الترجمة لاحقًا). اضغط للخيارات');
  assert.equal(ui.btn('badge').textContent, '+0.5');
  assert.equal(ui.btn('badge').getAttribute('data-sign'), 'positive');
  page.controller.set({ settings: { ...DEFAULT_SETTINGS, offsetStepMs: 1000 }, view: { displayOffsetMs: -1500, displayMode: 'ar' } });
  assert.equal(ui.btn('minus').getAttribute('aria-label'), 'تقديم الترجمة 1 ث (تظهر أبكر)');
  assert.equal(ui.btn('badge').textContent, '−1.5');
  assert.equal(ui.btn('badge').getAttribute('data-sign'), 'negative');
  assert.match(ui.btn('badge').getAttribute('aria-label'), /\(تظهر الترجمة أبكر\)/);
  page.controller.set({ view: { displayOffsetMs: 0, displayMode: 'ar' } });
  assert.equal(ui.btn('badge').textContent, '0.0');
  assert.equal(ui.btn('badge').getAttribute('data-sign'), 'zero', 'الصفر باهت');
  // التلميح فوق الزر عند المرور أو التركيز
  ui.btn('plus').dispatchEvent({ type: 'pointerenter' });
  assert.equal(ui.tip(), 'تأخير الترجمة 1 ث (تظهر لاحقًا)');
  ui.btn('plus').dispatchEvent({ type: 'pointerleave' });
  assert.equal(ui.tip(), null);
  ui.btn('download').focus();
  assert.equal(ui.tip(), 'تحميل الأصل (SRT)');
});

test('− و+ يغيّران الإزاحة وحدها بخطوة الإعداد: نبضة وتلميح عابر لثانية، ولا مساس بالمظهر ولا بالمقاطع', () => {
  const page = mountPage({ state: withArabic() });
  const { ui, controller } = page;
  const before = controller.getState();
  click(ui.btn('plus'));
  click(ui.btn('plus'));
  click(ui.btn('minus'));
  assert.deepEqual(controller.calls, [['nudgeOffset', 1], ['nudgeOffset', 1], ['nudgeOffset', -1]]);
  const after = controller.getState();
  assert.equal(after.view.displayOffsetMs, 500);
  assert.equal(ui.btn('badge').textContent, '+0.5');
  assert.equal(ui.btn('badge').hasAttribute('data-pulse'), true);
  assert.equal(ui.tip(), '\u2066+0.5\u2069 ث · تظهر لاحقًا');
  assert.strictEqual(after.settings, before.settings, 'الإعدادات (ومنها الخط والحجم) كما هي');
  assert.strictEqual(after.arabic, before.arabic, 'المقاطع المحفوظة كما هي');
  page.env.win.advance(FLASH_MS + 10);
  assert.equal(ui.tip(), null);
  assert.equal(ui.btn('badge').hasAttribute('data-pulse'), false);
  click(ui.btn('minus'));
  click(ui.btn('minus'));
  assert.equal(ui.tip(), '\u2066−0.5\u2069 ث · تظهر أبكر');
});

test('Enter والمسافة على أزرار الشريط لا تصل إلى اختصارات يوتيوب، وغيرها يمر', () => {
  const page = mountPage({ state: withArabic() });
  const seen = [];
  page.env.doc.addEventListener('keydown', (ev) => seen.push(ev.key));
  key(page.ui.btn('plus'), ' ');
  key(page.ui.btn('plus'), 'Enter');
  key(page.ui.btn('plus'), 'ArrowRight');
  assert.deepEqual(seen, ['ArrowRight']);
});

test('المقاسات: عادي، ومضغوط تحت 560px، وملء الشاشة (والوضع الكبير)؛ الخمسة باقية في كل مقاس', () => {
  const page = mountPage({ width: 854, height: 480 });
  assert.equal(page.ui.size(), 'normal');
  page.player.rect = { top: 0, left: 0, width: 426, height: 240, bottom: 240, right: 426 };
  page.env.win.resize(page.player);
  assert.equal(page.ui.size(), 'compact');
  assert.deepEqual(page.ui.kinds(), ['download', 'upload', 'minus', 'badge', 'plus'], '− و+ لا تُنقلان ولا تُخفيان');
  assert.ok(page.ui.kinds().every((k) => !page.ui.btn(k).hasAttribute('hidden')));
  page.player.classList.add('ytp-fullscreen');
  assert.equal(page.ui.size(), 'fullscreen');
  page.player.classList.remove('ytp-fullscreen');
  page.player.rect = { top: 0, left: 0, width: 1280, height: 720, bottom: 720, right: 1280 };
  page.env.win.resize(page.player);
  assert.equal(page.ui.size(), 'normal');
  page.player.classList.add('ytp-big-mode');
  assert.equal(page.ui.size(), 'fullscreen', 'الوضع الكبير مقاس ملء الشاشة');
});

test('القوائم تتبع الشريط: قائمة فُتحت بالفأرة تُغلق حين يُخفي يوتيوب أدواته فلا تعود فجأة معه، وبالتركيز فيها تبقى', () => {
  const page = mountPage({ state: withArabic() });
  const { ui } = page;
  click(ui.btn('badge'));
  assert.equal(ui.menuOpen(), true);
  assert.equal(ui.barState(), 'shown');
  page.player.classList.add('ytp-autohide');
  assert.equal(ui.barState(), 'hidden');
  assert.equal(ui.menuOpen(), false, 'لا تركيز فيها: تُغلق مع الشريط');
  page.player.classList.remove('ytp-autohide');
  assert.equal(ui.barState(), 'shown');
  assert.equal(ui.menuOpen(), false, 'ولا تعود مع الشريط');
  // بلوحة المفاتيح: التركيز داخل القائمة يبقيها منطقيًا (التركيز والكتابة لا يضيعان) وتتبع الشريط بالشفافية.
  click(ui.btn('badge'), 0);
  assert.equal(ui.menuOpen(), true);
  page.player.classList.add('ytp-autohide');
  assert.equal(ui.barState(), 'hidden');
  assert.equal(ui.menuOpen(), true, 'التركيز فيها: باقية');
  page.player.classList.remove('ytp-autohide');
  assert.equal(ui.barState(), 'shown');
  assert.equal(ui.menuOpen(), true);
});

test('بلا نقاط حالة ولا حروف ولا صناديق على الأزرار: أيقونات SVG وحدها، والشارة قيمتها وحدها', () => {
  const page = mountPage({ state: makeState({ arabic: arabic(), captured: [trackInfo()] }) });
  for (const k of ['download', 'upload', 'minus', 'plus']) {
    const b = page.ui.btn(k);
    assert.equal(b.querySelectorAll('.dot').length, 0, `${k}: لا نقطة حالة`);
    assert.equal(b.querySelectorAll('.spin').length, 0, `${k}: لا دوّار`);
    assert.equal(b.querySelectorAll('svg.icon').length, 1, `${k}: أيقونة واحدة`);
    assert.equal(b.textContent, '', `${k}: لا حرف ولا نص`);
    const svg = b.querySelector('svg.icon');
    assert.ok(svg.children.length >= 1 && svg.children.every((n) => n.tagName.toLowerCase() === 'path'), `${k}: مسارات خطية فقط (لا صندوق ولا حرف)`);
  }
  assert.equal(page.ui.btn('badge').querySelectorAll('svg').length, 0);
  assert.equal(page.ui.btn('badge').textContent, '0.0');
  assert.equal(page.ui.groupHost().shadowRoot.querySelectorAll('[data-tone]').length, 0, 'لا سمة نغمة (نقطة) في المجموعة');
});

test('معنى الحالة في اسم الوصول ووصفه وتلميحه بدل النقطة: جاهز، ومسار ناقص، وترجمة محمّلة أو فيها فروق', () => {
  const page = mountPage();
  const { ui } = page;
  const tipOf = (k) => {
    ui.btn(k).dispatchEvent({ type: 'pointerenter' });
    const t = ui.tip();
    ui.btn(k).dispatchEvent({ type: 'pointerleave' });
    return t;
  };
  assert.equal(ui.btn('download').getAttribute('aria-description'), null);
  assert.equal(tipOf('download'), 'تحميل الأصل (SRT)', 'لا مسار: الاسم وحده');
  page.controller.set({ captured: [trackInfo()] });
  assert.equal(ui.btn('download').getAttribute('aria-label'), 'تحميل الأصل (SRT)', 'اسم الوصول هو اسم الوظيفة');
  assert.equal(ui.btn('download').getAttribute('aria-description'), 'المسار جاهز');
  assert.equal(tipOf('download'), 'تحميل الأصل (SRT) · المسار جاهز');
  page.controller.set({ captured: [trackInfo({ warnings: ['EX_MAYBE_INCOMPLETE'] })] });
  assert.equal(ui.btn('download').getAttribute('aria-description'), 'قد يكون المسار ناقصًا');
  assert.equal(tipOf('download'), 'تحميل الأصل (SRT) · قد يكون المسار ناقصًا');
  page.controller.set({ arabic: arabic() });
  assert.equal(ui.btn('upload').getAttribute('aria-label'), 'الترجمة: talk.ar.srt');
  assert.equal(ui.btn('upload').getAttribute('aria-description'), 'مطابق للأصل');
  assert.equal(tipOf('upload'), 'الترجمة', 'محمّلة سليمة: الاسم وحده (والتفصيل في الوصف)');
  page.controller.set({ arabic: arabic({ comparison: { ...arabic().comparison, matched: false, missing: [3], countTarget: 4 } }) });
  assert.equal(ui.btn('upload').getAttribute('aria-description'), 'مقطع واحد ناقص: 3', 'نقص كشفته المقارنة: تفصيله لقارئ الشاشة');
  assert.equal(tipOf('upload'), 'الترجمة · فيها فروق عن الأصل');
});

test('الاسم تلميح عند المرور وعند التركيز بلوحة المفاتيح للأزرار الخمسة كلها، ويزول بالمغادرة وفقد التركيز', () => {
  const page = mountPage({ state: withArabic({ view: { displayOffsetMs: 500, displayMode: 'ar' } }) });
  const { ui } = page;
  const expected = {
    download: 'تحميل الأصل (SRT)',
    upload: 'الترجمة',
    minus: 'تقديم الترجمة 0.5 ث (تظهر أبكر)',
    badge: 'الإزاحة: \u2066+0.5\u2069 ث (تظهر الترجمة لاحقًا). اضغط للخيارات',
    plus: 'تأخير الترجمة 0.5 ث (تظهر لاحقًا)',
  };
  for (const [kind, text] of Object.entries(expected)) {
    const b = ui.btn(kind);
    b.dispatchEvent({ type: 'pointerenter' });
    assert.equal(ui.tip(), text, `${kind}: عند المرور`);
    b.dispatchEvent({ type: 'pointerleave' });
    assert.equal(ui.tip(), null, `${kind}: يزول بالمغادرة`);
    b.focus();
    assert.equal(ui.tip(), text, `${kind}: عند التركيز بلوحة المفاتيح`);
    b.blur();
    assert.equal(ui.tip(), null, `${kind}: يزول بفقد التركيز`);
  }
  // الاسم هو نص التلميح نفسه: لا يتناقض اسم الوصول مع ما يراه المستخدم.
  for (const kind of ['minus', 'badge', 'plus']) assert.equal(ui.btn(kind).getAttribute('aria-label'), expected[kind]);
});

test('لا ترجمة بعد: تلميح زر الترجمة «رفع الترجمة العربية (SRT)»؛ والمعطّل يصحب سببه تلميحه واسمه', () => {
  const page = mountPage();
  const { ui } = page;
  ui.btn('upload').dispatchEvent({ type: 'pointerenter' });
  assert.equal(ui.tip(), 'رفع الترجمة العربية (SRT)');
  ui.btn('upload').dispatchEvent({ type: 'pointerleave' });
  ui.btn('plus').focus();
  assert.match(ui.tip(), /^تأخير الترجمة 0\.5 ث \(تظهر لاحقًا\) — ارفع ترجمة عربية أولًا/);
  assert.equal(ui.btn('plus').getAttribute('aria-label'), ui.tip());
});

test('حجم الأيقونات وسُمكها: مقاس واحد في الخمسة، وسُمك 1.9 (عادي 22، ومضغوط 20، وملء الشاشة 26)', () => {
  const page = mountPage();
  for (const k of ['download', 'upload', 'minus', 'plus']) {
    for (const path of page.ui.btn(k).querySelectorAll('svg path')) assert.equal(path.getAttribute('stroke-width'), '1.9', k);
    assert.equal(page.ui.btn(k).querySelector('svg').getAttribute('viewBox'), '0 0 24 24');
  }
  const css = groupCss();
  assert.match(css, /\.group \{[^}]*--w: 48px; --icon: 22px/);
  assert.match(css, /\.group\[data-size="compact"\] \{ --w: 40px; --icon: 20px/);
  assert.match(css, /\.group\[data-size="fullscreen"\] \{ --w: 54px; --icon: 26px/);
  assert.match(css, /\.btn:focus-visible \{ outline: 2px solid #FFFFFF; outline-offset: -6px/, 'حلقة تركيز بيضاء داخلية');
  assert.match(css, /\.btn\[aria-expanded="true"\] \.icon \{ color: var\(--tj-p-accent\)/, 'القائمة المفتوحة تلوّن الأيقونة بالإبراز');
  assert.doesNotMatch(css, /\.dot|\.spin|tj-spin/, 'لا نقاط ولا دوّار');
});

test('الانشغال: ماستا نبض مكان الأيقونة في الصندوق نفسه، بلا دوّار، مع aria-busy', async () => {
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  const b = page.ui.btn('download');
  const load = b.querySelector('.load');
  assert.equal(load.hasAttribute('hidden'), true);
  assert.equal(load.querySelectorAll('i').length, 2, 'ماستان');
  assert.equal(b.getAttribute('aria-busy'), null);
  click(b);
  click(page.ui.item('تنزيل الملف'));
  assert.equal(load.hasAttribute('hidden'), false);
  assert.equal(b.getAttribute('aria-busy'), 'true');
  assert.equal(b.hasAttribute('data-busy'), true, 'الأيقونة تُخفى بهذه السمة وتحل الماستان محلها');
  assert.ok(b.querySelector('.spin') === null, 'لا دوّار');
  assert.match(b.getAttribute('aria-description'), /جارٍ التنزيل/);
  await settle();
  assert.equal(load.hasAttribute('hidden'), true);
  assert.equal(b.getAttribute('aria-busy'), null);
  assert.equal(b.hasAttribute('data-busy'), false);
});

test('بث جارٍ أو زر CC معطّل: التحميل «غير متاح» بسببه ويبقى يفتح قائمته شارحة', () => {
  const page = mountPage();
  page.cc.setAttribute('aria-disabled', 'true');
  page.env.win.advance(1100);
  assert.equal(page.ui.btn('download').hasAttribute('data-unavailable'), true);
  assert.match(page.ui.btn('download').getAttribute('aria-label'), /لا يحتوي ترجمة إنجليزية متاحة/);
  click(page.ui.btn('download'));
  assert.match(page.ui.menuText(), /هذا الفيديو لا يحتوي ترجمة إنجليزية متاحة\./);
});
