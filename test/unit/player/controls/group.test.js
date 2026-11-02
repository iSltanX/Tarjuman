// الأزرار الخمسة (P6-AC1 وAC2 وAC10 الجزء الآلي): الحالات والتلميحات بالخطوة الحالية، والمقاسات الثلاثة دون إخفاء
// − و+، وتبعية القوائم والتلميحات لظهور الشريط، و± يغيّر الإزاحة وحدها بخطوة الإعداد مع نبضة وتلميح عابر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { FLASH_MS } from '../../../../src/player/controls/session.js';
import { arabic, click, key, makeState, mountPage, trackInfo } from './harness.js';

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
  assert.equal(ui.btn('download').getAttribute('aria-label'), 'تحميل الترجمة الإنجليزية (SRT)');
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
  assert.equal(ui.btn('badge').getAttribute('aria-label'), 'الإزاحة: +0.5 ث (تظهر الترجمة لاحقًا). اضغط للخيارات');
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
  assert.equal(ui.tip(), 'تحميل الترجمة الإنجليزية (SRT)');
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
  assert.equal(ui.tip(), '+0.5 ث · تظهر لاحقًا');
  assert.strictEqual(after.settings, before.settings, 'الإعدادات (ومنها الخط والحجم) كما هي');
  assert.strictEqual(after.arabic, before.arabic, 'المقاطع المحفوظة كما هي');
  page.env.win.advance(FLASH_MS + 10);
  assert.equal(ui.tip(), null);
  assert.equal(ui.btn('badge').hasAttribute('data-pulse'), false);
  click(ui.btn('minus'));
  click(ui.btn('minus'));
  assert.equal(ui.tip(), '−0.5 ث · تظهر أبكر');
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

test('نقطة الجاهزية على زر التحميل حين يُلتقط مسار، ونقطة الحالة على الرفع بحسب المقارنة', () => {
  const page = mountPage();
  const dot = (k) => page.ui.btn(k).querySelector('.dot');
  assert.equal(dot('download').hasAttribute('hidden'), true);
  page.controller.set({ captured: [trackInfo()] });
  assert.equal(dot('download').hasAttribute('hidden'), false);
  assert.equal(dot('download').getAttribute('data-tone'), 'ready');
  page.controller.set({ arabic: arabic() });
  assert.equal(dot('upload').getAttribute('data-tone'), 'loaded');
  assert.equal(page.ui.btn('upload').getAttribute('aria-label'), 'الترجمة العربية: talk.ar.srt');
  page.controller.set({ arabic: arabic({ comparison: { ...arabic().comparison, matched: false, missing: [3], countTarget: 4 } }) });
  assert.equal(dot('upload').getAttribute('data-tone'), 'warning', 'نقص كشفته المقارنة');
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
