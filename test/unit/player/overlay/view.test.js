// عرض الطبقة بالـDOM الوهمي: هيكل الحاوية، وسطر لكل سطر باتجاهه، والوضع المزدوج، وtextContent وحده،
// والتلاشي 80ms بلا وميض بين مقطعين، والإخفاء التام، والمظهر، وعدم التقاط النقرات، وإخفاء ترجمة يوتيوب.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverlayView } from '../../../../src/player/overlay/view.js';
import { createCaptionHider } from '../../../../src/player/overlay/caption-hider.js';
import { overlayCss, hideNativeCss, HOST_ID } from '../../../../src/player/overlay/styles.js';
import { splitLines } from '../../../../src/player/overlay/text.js';
import { addPlayer, createFakeEnv } from './fake-dom.js';
import { SAMPLES } from './samples.js';

function setup() {
  const env = createFakeEnv();
  const parts = addPlayer(env);
  const view = createOverlayView(env);
  view.attachTo(parts.player);
  // ظل الحاوية مغلق في المتصفح؛ في الوهمي نصل إليه عبر الـhost لقراءة الأبناء.
  const stage = view.host.shadowRoot.children.find((c) => c.className.includes('stage'));
  return { env, ...parts, view, stage };
}
const dirs = (stage) => stage.children.map((c) => c.getAttribute('dir'));
const texts = (stage) => stage.children.map((c) => c.textContent);

test('الهيكل: مضيف بمعرّف ترجمان داخل #movie_player وظل فيه ورقة أنماط وطبقة عرض فارغة', () => {
  const { view, player, stage } = setup();
  assert.equal(view.host.id, HOST_ID);
  assert.ok(view.host.parentNode === player);
  assert.equal(view.styleMode, 'adopted', 'لا عنصر <style> ولا سمة style');
  assert.equal(view.host.shadowRoot.adoptedStyleSheets.length, 1);
  assert.ok(stage.hasAttribute('data-empty'));
  assert.equal(stage.children.length, 0);
  assert.equal(view.isConnected(), true);
  view.attachTo(player);
  assert.equal(player.children.filter((c) => c.id === HOST_ID).length, 1, 'لا تكرار');
});

test('الورقة: لا تلتقط النقرات في أي طبقة، وتخفي نفسها بـhidden، وتستعمل رموز المشغّل', () => {
  const css = overlayCss();
  assert.match(css, /:host \{ all: initial;[^}]*pointer-events: none/, 'المضيف');
  assert.match(css, /\.stage \{[^}]*pointer-events: none/, 'حاوية الأسطر');
  assert.match(css, /\.line \{[^}]*pointer-events: none/, 'كل سطر');
  assert.match(css, /:host\(\[hidden\]\) \{ display: none; \}/);
  assert.match(css, /--tj-p-sub-bg-soft/);
  assert.match(css, /--tj-p-font-body/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /@import|url\(/i, 'لا موارد خارجية');
  assert.match(hideNativeCss(), /#movie_player \.ytp-caption-window-container \{ display: none !important; \}/);
});

test('إن لم تتوفر ورقة مبنية يسقط إلى عنصر <style> بـtextContent', () => {
  const env = createFakeEnv();
  env.win.CSSStyleSheet = class {
    constructor() {
      throw new Error('غير مدعوم');
    }
  };
  addPlayer(env);
  const view = createOverlayView(env);
  assert.equal(view.styleMode, 'style');
  const style = view.host.shadowRoot.children.find((c) => c.tagName === 'style');
  assert.ok(style && style.textContent.includes('.stage'));
});

test('عيّنة النص المختلط (12 حالة): سطر لكل سطر باتجاهه وبالنص حرفيًا', () => {
  const { view, stage } = setup();
  for (const s of SAMPLES) {
    const lines = splitLines(s.text);
    view.render({ ar: lines, en: [] });
    assert.deepEqual(dirs(stage), s.dirs, `عيّنة ${s.id}`);
    assert.deepEqual(texts(stage), lines, `عيّنة ${s.id}`);
    assert.ok(!stage.hasAttribute('data-empty'));
  }
});

test('الوضع المزدوج: العربي أولًا ثم الإنجليزي تحته في الطبقة نفسها، لكل منهما اتجاهه', () => {
  const { view, stage } = setup();
  view.render({ ar: ['مرحبًا بكم في المحاضرة'], en: ['Welcome to the lecture'] });
  assert.deepEqual(stage.children.map((c) => c.className), ['line ar', 'line en']);
  assert.deepEqual(dirs(stage), ['rtl', 'ltr']);
  assert.deepEqual(texts(stage), ['مرحبًا بكم في المحاضرة', 'Welcome to the lecture']);
  view.render({ ar: ['سطر'], en: ['API بالعربية؟'] });
  assert.deepEqual(dirs(stage), ['rtl', 'ltr'], 'سطر الأصل بلغة مساره الإنجليزية (AA1)');
  view.setLang('ar');
  view.render({ ar: ['Hello there'], en: ['API بالعربية؟'] });
  assert.deepEqual(dirs(stage), ['ltr', 'rtl'], 'الترجمة بلا لغة من حروفها، والأصل العربي RTL');
  view.setTranslationLang('he');
  view.render({ ar: ['Shalom'], en: [] });
  assert.deepEqual(dirs(stage), ['rtl'], 'لغة الترجمة المعروفة أقوى من حروفها');
});

test('النص يدخل textContent وحده: لا عناصر ولا سمات من نص المقطع', () => {
  const { view, stage } = setup();
  const evil = '<img src=x onerror=alert(1)> و <script>x()</script>';
  view.render({ ar: [evil], en: [] });
  assert.equal(stage.children.length, 1);
  assert.equal(stage.children[0].children.length, 0, 'لا أبناء داخل السطر');
  assert.equal(stage.children[0].textContent, evil);
  // dir من حروف النص، وlang من نوع السطر (تدقيق 7a66f91، C6، U48): لا سمة من نص المقطع نفسه.
  assert.deepEqual([...stage.children[0]._attrs.keys()].sort(), ['dir', 'lang']);
  assert.equal(stage.children[0].getAttribute('lang'), 'und', 'لغة ترجمة غير محددة (AA1؛ كانت ar ثابتة)');
});

test('التلاشي: الفراغ يلاشي 80ms ثم يُزال المحتوى، وعودة مقطع قبل ذلك تلغي الإزالة', () => {
  const { env, view, stage } = setup();
  view.render({ ar: ['أ'], en: [] });
  view.render({ ar: [], en: [] });
  assert.ok(stage.hasAttribute('data-empty'));
  assert.equal(stage.children.length, 1, 'ما زال يتلاشى');
  env.win.advance(60);
  assert.equal(stage.children.length, 1);
  env.win.advance(100);
  assert.equal(stage.children.length, 0, 'أُزيل بعد التلاشي');
  view.render({ ar: ['ب'], en: [] });
  view.render({ ar: [], en: [] });
  env.win.advance(50);
  view.render({ ar: ['ج'], en: [] });
  env.win.advance(500);
  assert.deepEqual(texts(stage), ['ج'], 'لم يُزل المقطع الجديد');
  assert.ok(!stage.hasAttribute('data-empty'));
});

test('مقطعان متتاليان بلا فجوة يتبدلان في مكانهما بلا وميض (لا data-empty بينهما)', () => {
  const { view, stage } = setup();
  view.render({ ar: ['أ'], en: [] });
  let sawEmpty = false;
  const orig = stage.setAttribute.bind(stage);
  stage.setAttribute = (k, v) => {
    if (k === 'data-empty') sawEmpty = true;
    orig(k, v);
  };
  view.render({ ar: ['ب'], en: [] });
  assert.equal(sawEmpty, false);
  assert.deepEqual(texts(stage), ['ب']);
});

test('إعادة رسم الأسطر نفسها لا تغيّر العناصر', () => {
  const { view, stage } = setup();
  view.render({ ar: ['أ', 'ب'], en: [] });
  const first = [...stage.children];
  view.render({ ar: ['أ', 'ب'], en: [] });
  assert.equal(stage.children.length, first.length);
  assert.ok(stage.children.every((c, i) => c === first[i]));
});

test('الإخفاء التام يمسح فورًا ويضع hidden، وإظهاره يزيلها', () => {
  const { view, stage } = setup();
  view.render({ ar: ['أ'], en: ['a'] });
  view.setHidden(true);
  assert.equal(view.host.hasAttribute('hidden'), true);
  assert.equal(stage.children.length, 0, 'لا يبقى شيء من السابق');
  assert.deepEqual(view.peek().lines, []);
  view.setHidden(false);
  assert.equal(view.host.hasAttribute('hidden'), false);
});

test('المظهر والهندسة: الخلفية سمة، والحجم والارتفاع متغيرا CSS بـCSSOM، والمرساة سمة', () => {
  const { view, stage } = setup();
  view.setAppearance({ background: 'solid' });
  assert.equal(stage.getAttribute('data-bg'), 'solid');
  view.setLayout({ fontPx: 33, anchor: 'bottom', offsetPx: 62 });
  assert.equal(view.host.style.getPropertyValue('--tj-fs'), '33px');
  assert.equal(view.host.style.getPropertyValue('--tj-offset'), '62px');
  assert.equal(view.host.getAttribute('data-anchor'), 'bottom');
  assert.equal(view.host.hasAttribute('style'), false, 'لا سمة style نصية');
});

test('peek للحزام الحي: النص والاتجاه والحالة', () => {
  const { view } = setup();
  view.render({ ar: ['سطر'], en: ['line'] });
  const p = view.peek();
  assert.deepEqual(p.lines, [{ kind: 'ar', dir: 'rtl', text: 'سطر' }, { kind: 'en', dir: 'ltr', text: 'line' }]);
  assert.deepEqual([p.hidden, p.empty, p.connected], [false, false, true]);
});

test('destroy يزيل المضيف ويفرّغ المؤقتات', () => {
  const { env, view, player } = setup();
  view.render({ ar: ['أ'], en: [] });
  view.render({ ar: [], en: [] });
  view.destroy();
  assert.equal(player.children.some((c) => c.id === HOST_ID), false);
  assert.equal(env.win.pendingTimers(), 0);
});

test('مخفي ترجمة يوتيوب: ورقة على المستند تُضاف وتُسحب ولا تتكرر', () => {
  const env = createFakeEnv();
  addPlayer(env);
  const hider = createCaptionHider(env);
  assert.equal(env.doc.adoptedStyleSheets.length, 0);
  hider.set(true);
  hider.set(true);
  assert.equal(env.doc.adoptedStyleSheets.length, 1);
  assert.match(env.doc.adoptedStyleSheets[0].css, /ytp-caption-window-container/);
  hider.set(false);
  assert.equal(env.doc.adoptedStyleSheets.length, 0);
  hider.set(true);
  hider.destroy();
  assert.equal(env.doc.adoptedStyleSheets.length, 0);
  assert.equal(hider.isOn(), false);
});

test('مخفي الترجمة يسقط إلى <style> في head إن لم تتوفر الورقة المبنية', () => {
  const env = createFakeEnv();
  env.win.CSSStyleSheet = class {
    constructor() {
      throw new Error('غير مدعوم');
    }
  };
  const hider = createCaptionHider(env);
  hider.set(true);
  const style = env.doc.head.children.find((c) => c.tagName === 'style');
  assert.ok(style && style.textContent.includes('display: none !important'));
  hider.set(false);
  assert.equal(env.doc.head.children.length, 0);
});

test('تدقيق 5fedcb9 (CL-003): الطبقة تنشر أعلى سطرها الظاهر عن أسفل المشغّل لرسائل الأدوات، وتزيله فارغة أو في الأعلى', async () => {
  const { createOverlayView } = await import('../../../../src/player/overlay/view.js');
  const { createFakeEnv } = await import('./fake-dom.js');
  const env = createFakeEnv({ href: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' });
  const v = createOverlayView({ doc: env.doc, win: env.win });
  v.setLayout({ fontPx: 22, anchor: 'bottom', offsetPx: 60 });
  assert.equal(v.host.getAttribute('data-stage-top'), null, 'لا سطر');
  v.render({ ar: ['سطر'], en: [] });
  assert.ok(Number(v.host.getAttribute('data-stage-top')) >= 60);
  v.render({ ar: [], en: [] });
  assert.equal(v.host.getAttribute('data-stage-top'), null);
  v.setLayout({ fontPx: 22, anchor: 'top', offsetPx: 30 });
  v.render({ ar: ['سطر'], en: [] });
  assert.equal(v.host.getAttribute('data-stage-top'), null, 'الأعلى لا يزاحم رسائل الأسفل');
});
