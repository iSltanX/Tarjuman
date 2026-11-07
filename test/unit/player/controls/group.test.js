// أزرار الشريط (P6-AC1 وAC2 وAC10 الجزء الآلي): الحالات والتلميحات بالخطوة الحالية، والمقاسات بالمساحة الخالية دون إخفاء
// − و+، وزر النص المتزامن، وتبعية القوائم والتلميحات لظهور الشريط، و± يغيّر الإزاحة وحدها بخطوة الإعداد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { FLASH_MS, TIP_HIDE_MS } from '../../../../src/player/controls/session.js';
import { fitSize, roomFor } from '../../../../src/player/controls/bar.js';
import { mountControls } from '../../../../src/player/controls/index.js';
import { groupCss } from '../../../../src/player/controls/styles.js';
import { createPanelLink } from '../../../../src/player/link.js';
import { arabic, click, inspect, key, makeState, mountPage, settle, trackInfo } from './harness.js';

const withArabic = (over = {}) => makeState({ arabic: arabic(), ...over });

test('بلا ترجمة عربية: − والشارة و+ معطّلة بسببها (تبقى قابلة للتركيز)، والرفع والتحميل متاحان', () => {
  const { ui } = mountPage();
  for (const k of ['minus', 'badge', 'plus']) {
    assert.equal(ui.btn(k).getAttribute('aria-disabled'), 'true', k);
    assert.match(ui.btn(k).getAttribute('aria-label'), /ارفع ترجمة أولًا/);
  }
  assert.equal(ui.btn('upload').getAttribute('aria-disabled'), null);
  assert.equal(ui.btn('download').getAttribute('aria-disabled'), null);
  assert.equal(ui.btn('upload').getAttribute('aria-label'), 'رفع الترجمة (SRT)');
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
  // يبقى لحظة بعد المغادرة فيمكن المرور فوقه (تدقيق 7a66f91، C6، U89).
  page.env.win.advance(TIP_HIDE_MS + 10);
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

test('المقاسات: عادي، ومضغوط تحت 560px، وملء الشاشة (والوضع الكبير)؛ الستة باقية في كل مقاس يتسع لها', () => {
  const page = mountPage({ width: 854, height: 480 });
  assert.equal(page.ui.size(), 'normal');
  page.player.rect = { top: 0, left: 0, width: 426, height: 240, bottom: 240, right: 426 };
  page.env.win.resize(page.player);
  assert.equal(page.ui.size(), 'compact');
  assert.deepEqual(page.ui.kinds(), ['download', 'upload', 'panel', 'minus', 'badge', 'plus'], '− و+ لا تُنقلان ولا تُخفيان');
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
    assert.equal(ui.tip(), text, `${kind}: يبقى لحظة بعد المغادرة (U89)`);
    page.env.win.advance(TIP_HIDE_MS + 10);
    assert.equal(ui.tip(), null, `${kind}: يزول بالمغادرة`);
    b.focus();
    assert.equal(ui.tip(), text, `${kind}: عند التركيز بلوحة المفاتيح`);
    b.blur();
    assert.equal(ui.tip(), null, `${kind}: يزول بفقد التركيز`);
  }
  // الاسم هو نص التلميح نفسه: لا يتناقض اسم الوصول مع ما يراه المستخدم.
  for (const kind of ['minus', 'badge', 'plus']) assert.equal(ui.btn(kind).getAttribute('aria-label'), expected[kind]);
});

test('لا ترجمة بعد: تلميح زر الترجمة «رفع الترجمة (SRT)»؛ والمعطّل يصحب سببه تلميحه واسمه', () => {
  const page = mountPage();
  const { ui } = page;
  ui.btn('upload').dispatchEvent({ type: 'pointerenter' });
  assert.equal(ui.tip(), 'رفع الترجمة (SRT)');
  ui.btn('upload').dispatchEvent({ type: 'pointerleave' });
  ui.btn('plus').focus();
  assert.match(ui.tip(), /^تأخير الترجمة 0\.5 ث \(تظهر لاحقًا\) — ارفع ترجمة أولًا/);
  assert.equal(ui.btn('plus').getAttribute('aria-label'), ui.tip());
});

test('حجم الأيقونات وسُمكها: مقاس واحد في الستة، وسُمك 1.9 (عادي 22، ومضغوط 20، وأضيق 18، وملء الشاشة 26)', () => {
  const page = mountPage();
  for (const k of ['download', 'upload', 'panel', 'minus', 'plus']) {
    for (const path of page.ui.btn(k).querySelectorAll('svg path, svg rect')) assert.equal(path.getAttribute('stroke-width'), '1.9', k);
    assert.equal(page.ui.btn(k).querySelector('svg').getAttribute('viewBox'), '0 0 20 20', 'أيقونات الهوية على شبكة 20');
  }
  const css = groupCss();
  assert.match(css, /\.group \{[^}]*--w: 48px; --icon: 22px/);
  assert.match(css, /\.group\[data-size="compact"\] \{ --w: 40px; --icon: 20px/);
  assert.match(css, /\.group\[data-size="tight"\] \{ --w: 34px; --icon: 18px/);
  assert.match(css, /\.group\[data-size="fullscreen"\] \{ --w: 54px; --icon: 26px/);
  assert.match(css, /\.btn:focus-visible \{ outline: 2px solid #FFFFFF; outline-offset: -6px/, 'حلقة تركيز بيضاء داخلية');
  assert.match(css, /\.btn\[aria-expanded="true"\], \.btn\[aria-pressed="true"\] \{ color: var\(--tj-p-accent\); \}/, 'المفتوح والمضغوط بالطين الليلي (الهوية الرابعة، لوحة 10)');
  assert.match(css, /\.btn\[aria-expanded="true"\]::after, \.btn\[aria-pressed="true"\]::after \{ content: ""; position: absolute; left: 50%; bottom: 4px; width: 14px; height: 2px;[^}]*background: var\(--tj-p-accent\)/, 'وخطٌّ طيني تحت الأيقونة');
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
  assert.match(page.ui.btn('download').getAttribute('aria-label'), /لا يحتوي ترجمة متاحة في يوتيوب/);
  click(page.ui.btn('download'));
  assert.match(page.ui.menuText(), /هذا الفيديو لا يحتوي ترجمة متاحة في يوتيوب\./);
});

// ———— زر اللوحة والملاءمة (ملاحظة سلطان 2026-11-03) ————

test('زر النص المتزامن في الشريط: مغلقة افتراضيًا (aria-pressed=false)، والضغط يكتب panelOpen، ويتبع التفضيل من أي مكان، ويختفي بإخفاء زرها', () => {
  const page = mountPage({ state: withArabic() });
  const { ui } = page;
  const b = ui.btn('panel');
  assert.equal(b.getAttribute('aria-label'), 'النص المتزامن');
  assert.equal(b.getAttribute('aria-pressed'), 'false');
  assert.equal(b.hasAttribute('hidden'), false);
  b.focus();
  assert.equal(ui.tip(), 'فتح النص المتزامن');
  click(b);
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'updatePrefs').at(-1)[1], { ui: { panelOpen: true } });
  const prefs = page.controller.getState().prefs;
  page.controller.set({ prefs: { ...prefs, ui: { ...prefs.ui, panelOpen: true } } });
  assert.equal(b.getAttribute('aria-pressed'), 'true');
  click(b);
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'updatePrefs').at(-1)[1], { ui: { panelOpen: false } });
  page.controller.set({ prefs: { ...prefs, ui: { ...prefs.ui, panelEntry: false, panelOpen: false } } });
  assert.equal(b.hasAttribute('hidden'), true, 'أُخفي زرها من قائمة اللوحة أو الإعدادات');
});

test('زر اللوحة بلوحة المفاتيح يطلب التركيز داخل اللوحة (صلة link)، والفأرة لا تطلبه؛ واللوحة تعيد التركيز إليه', () => {
  const link = createPanelLink();
  const env = mountPage({ state: withArabic() });
  env.handle.unmount();
  const handle = mountControls(env.controller, { doc: env.env.doc, win: env.env.win, exportFlow: env.flows.exportFlow, importFlow: env.flows.importFlow, link });
  const b = inspect(env.env, env).btn('panel');
  b.dispatchEvent({ type: 'click', bubbles: true, detail: 1 });
  assert.equal(link.takePanelFocus(), false, 'بالفأرة');
  b.dispatchEvent({ type: 'click', bubbles: true, detail: 0 });
  assert.equal(link.takePanelFocus(), true, 'بلوحة المفاتيح');
  assert.equal(link.focusButton(), true);
  assert.ok(env.env.doc._focused === b, 'التركيز على زر اللوحة');
  handle.unmount();
  assert.equal(link.focusButton(), false, 'الإزالة تلغي التسجيل');
});

test('الملاءمة بالمساحة الخالية في الشريط لا بعرض المشغّل وحده: عادي (48)، فمضغوط (40)، فأضيق (34)', () => {
  const bar = (room, size = 'normal') => ({ size, room });
  assert.equal(fitSize(bar(null), 5), 'normal', 'بلا قياس: المقاس الأساسي');
  assert.equal(fitSize(bar(5 * 48 + 56 + 8), 5), 'normal');
  assert.equal(fitSize(bar(5 * 48 + 56 + 7), 5), 'compact');
  assert.equal(fitSize(bar(5 * 40 + 50 + 8), 5), 'compact');
  assert.equal(fitSize(bar(5 * 40 + 50 + 7), 5), 'tight');
  assert.equal(fitSize(bar(100), 5), 'tight', 'لا مقاس أصغر: يُقاس الفيض ويُبلَّغ');
  assert.equal(fitSize(bar(4 * 40 + 50 + 8), 4), 'compact', 'زر اللوحة مخفي: أربعة');
  assert.equal(fitSize(bar(2000, 'compact'), 5), 'compact', 'وضع يوتيوب الصغير يبقى مضغوطًا');
  assert.equal(fitSize(bar(10, 'fullscreen'), 5), 'fullscreen');
});

test('roomFor: من نهاية أدوات يوتيوب اليسرى (وسهم الفصل ومنزلق الصوت محجوزان) إلى نهاية الشريط، ناقص أدوات يوتيوب اليمنى، ولا يتغير بمرور المؤشر', () => {
  const page = mountPage({ width: 760 });
  const { env } = page;
  const mk = (cls, left, right, text = '') => {
    const el = env.doc.createElement('div');
    el.className = cls;
    if (text) el.textContent = text;
    el.rect = { top: 0, bottom: 40, left, right, width: right - left, height: 40 };
    page.left.appendChild(el);
    return el;
  };
  mk('ytp-play-button', 12, 68);
  const vol = mk('ytp-volume-panel', 70, 70);
  const time = mk('ytp-time-display', 120, 242);
  const chapter = mk('ytp-chapter-container', 242, 500, 'Intro');
  page.chrome.rect = { ...page.chrome.rect, left: 12, right: 748, width: 736 };
  page.right.rect = { top: 0, bottom: 40, left: 300, right: 748, width: 448, height: 40 };
  page.ui.groupHost().rect = { top: 0, bottom: 40, left: 300, right: 500, width: 200, height: 40 };
  // الوقت ينتهي عند 242، ثم سهم الفصل 44 ومنزلق الصوت المطوي 52: 338؛ و748 − 338 − (448 − 200) = 162 ← 160 (مضاعف 4).
  assert.equal(roomFor(env.doc, page.ui.groupHost()), 160);
  // المؤشر على زر الصوت: يتسع المنزلق 52 فيُدفع الوقت 52، ويخفي يوتيوب عنوان الفصل؛ والمساحة كما هي.
  vol.rect = { ...vol.rect, right: 122, width: 52 };
  time.rect = { ...time.rect, left: 172, right: 294 };
  chapter.rect = { ...chapter.rect, left: 294, right: 294, width: 0 };
  assert.equal(roomFor(env.doc, page.ui.groupHost()), 160);
  // فيديو بلا فصول (العنوان فارغ): لا يُحجز السهم.
  chapter.textContent = '';
  assert.equal(roomFor(env.doc, page.ui.groupHost()), 204);
  assert.equal(roomFor(env.doc, null), null);
});

test('الأضيق (product-spec §٦.١): الأزرار الستة كلها في الشريط، − و+ منها، لا تُنقل إلى قائمة ولا تُخفى', () => {
  const css = groupCss();
  assert.doesNotMatch(css, /data-kind="(minus|plus)"\][^{]*\{[^}]*display: none/, 'لا نمط يخفي − أو +');
  const page = mountPage({ state: withArabic(), width: 760 });
  const mk = (cls, left, right) => {
    const el = page.env.doc.createElement('div');
    el.className = cls;
    el.rect = { top: 0, bottom: 40, left, right, width: right - left, height: 40 };
    page.left.appendChild(el);
  };
  mk('ytp-time-display', 120, 242);
  page.chrome.rect = { ...page.chrome.rect, left: 12, right: 748, width: 736 };
  page.right.rect = { top: 0, bottom: 40, left: 300, right: 748, width: 540, height: 40 };
  page.ui.groupHost().rect = { top: 0, bottom: 40, left: 300, right: 584, width: 284, height: 40 };
  page.env.win.resize(page.player);
  // 748 − 242 − (540 − 284) = 250 ← 248: أقل من المضغوط (5×40+50+8 = 258)، ويتسع للأضيق (5×34+42+8 = 220).
  assert.equal(page.ui.size(), 'tight');
  assert.deepEqual(page.ui.kinds(), ['download', 'upload', 'panel', 'minus', 'badge', 'plus']);
  assert.ok(page.ui.kinds().every((k) => !page.ui.btn(k).hasAttribute('hidden')));
  click(page.ui.btn('plus'));
  assert.deepEqual(page.controller.calls.filter((c) => c[0] === 'nudgeOffset').map((c) => c[1]), [1], '+ يعمل في الأضيق');
});
