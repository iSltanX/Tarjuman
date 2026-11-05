// تدقيق 7a66f91، المرحلة C6 (أسطح المشغّل): أدوات الشريط وطبقتها. سكربتات الإعادة في docs/audit-7a66f91/verify/player
// وverify-ds/ui صارت اختبارات انحدار: كل اختبار هنا يفشل على الشيفرة السابقة للسبب المقصود. والمقارنة بين العقد بالهوية
// (assert.ok(a === b)) لا بـassert.equal، فطباعة عقدة الـDOM الوهمي عند الفشل تستنزف الذاكرة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { DEFAULT_PREFS } from '../../../../src/core/model/prefs.js';
import * as Session from '../../../../src/player/controls/session.js';
import { layerCss } from '../../../../src/player/controls/styles.js';
import { nameOtherLine } from '../../../../src/player/controls/text.js';
import { createPanelLink } from '../../../../src/player/link.js';
import * as H from './harness.js';

const LRI = '⁦';
const FSI = '⁨';
const PDI = '⁩';
const settleN = async (n = 6) => { for (let i = 0; i < n; i++) await H.settle(); };
const TIP_HIDE_MS = Session.TIP_HIDE_MS ?? 0;

/** محددات القواعد التي تعرّف خاصية بعينها في ورقة (قوائم الفاصلة مفصولة). */
function selectorsDefining(css, prop, value = null) {
  const out = [];
  for (const [, sel, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const m = body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`));
    if (m && (value === null || m[1].trim() === value)) out.push(...sel.split(',').map((s) => s.trim()));
  }
  return out;
}

const layerRoot = (page) => page.ui.layerHost().shadowRoot;
const groupRoot = (page) => page.ui.groupHost().shadowRoot;

// ———— U42 ————

test('U42: --fs معرّف على سلف لصناديق الرسائل، فخطها بحجم القوائم لا 16px خط المتصفح', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), notice: { code: 'ST_OFFSET_RESET', tone: 'info', at: 1 } }) });
  await settleN(2);
  const root = layerRoot(page);
  const toast = root.querySelector('.toast');
  assert.ok(toast, 'رسالة ظاهرة');
  const sels = selectorsDefining(layerCss(), '--fs');
  assert.ok(sels.some((s) => s === ':host' || root.querySelectorAll(s).some((el) => el.contains(toast))), `--fs على ${sels.join(' | ')} وحدها`);
  // حجم ملء الشاشة يصل إلى الرسائل أيضًا: الحاوية تحمل مقاس الطبقة، وقاعدته تعرّف 15px عليها.
  const toasts = root.querySelector('.toasts');
  assert.equal(toasts.getAttribute('data-size'), root.querySelector('.layer').getAttribute('data-size'));
  assert.ok(selectorsDefining(layerCss(), '--fs', '15px').includes('.toasts[data-size="fullscreen"]'));
});

// ———— U43 ————

test('U43: خطأ استيراد جديد يحل محل السابق، والاستيراد الناجح يمسح رسائل الاستيراد، ولا يمس رسالة خطأ غيره', async () => {
  const page = H.mountPage({ state: H.makeState() });
  const { ui, flows, controller } = page;
  const errors = [
    { code: 'IM_BAD_TIME', message: 'السطر 14: صيغة الزمن غير صالحة.' },
    { code: 'IM_EMPTY', message: 'الملف فارغ.' },
    { code: 'IM_NOT_UTF8', message: 'ترميز الملف ليس UTF-8.' },
  ];
  let next = 0;
  const ok = flows.readResult;
  flows.readResult = (files) => (next < errors.length ? { ok: false, error: errors[next++] } : ok(files));
  const upload = async (name) => {
    H.click(ui.btn('upload'));
    H.chooseFiles(ui, [{ name, size: 10, arrayBuffer: async () => new ArrayBuffer(10) }]);
    await settleN();
  };
  for (const n of ['a.srt', 'b.srt', 'c.srt']) await upload(n);
  assert.deepEqual(ui.toasts().filter((t) => t.tone === 'error').map((t) => t.text), ['ترميز الملف ليس UTF-8.']);
  controller.set({ error: { code: 'ST_WRITE_FAILED', message: 'تعذّر الحفظ.' } });
  await settleN(2);
  await upload('good.ar.srt');
  assert.ok(controller.getState().arabic, 'حُمّلت الترجمة');
  assert.deepEqual(ui.toasts().filter((t) => t.tone === 'error').map((t) => t.text), ['تعذّر الحفظ.'], 'رسالة المتحكم باقية ورسائل الاستيراد زالت');
});

// ———— U44 ————

test('U44: «تحميل الأصل» و«الترجمة» حواران لا قائمتان: أزرارهما تعلن dialog، ولا بنود menuitem داخلهما', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), captured: [H.trackInfo(), H.trackInfo({ key: 'en|asr', kind: 'asr' })] }) });
  const { ui } = page;
  for (const k of ['download', 'upload', 'badge']) assert.equal(ui.btn(k).getAttribute('aria-haspopup'), 'dialog', k);
  H.click(ui.btn('download'), 0);
  await settleN(2);
  assert.equal(ui.menu().getAttribute('role'), 'dialog');
  const roles = ui.menu().querySelectorAll('[role]').map((e) => e.getAttribute('role'));
  assert.ok(!roles.some((r) => r.startsWith('menuitem')), roles.join(','));
  // المساران مجموعة اختيار واحد بنقطة Tab واحدة والأسهم تنقل بينهما.
  const tracks = ui.menu().querySelectorAll('[role="radiogroup"]').find((g) => g.getAttribute('aria-label') === 'المسار');
  assert.ok(tracks, 'مجموعة المسارات');
  const radios = tracks.children;
  assert.deepEqual(radios.map((r) => [r.getAttribute('role'), r.getAttribute('tabindex')]), [['radio', '0'], ['radio', '-1']]);
  radios[0].focus();
  H.key(radios[0], 'ArrowDown');
  assert.ok(layerRoot(page).activeElement === radios[1], 'السهم ينقل التركيز إلى المسار التالي');
  H.click(ui.btn('download'), 0);
  H.click(ui.btn('upload'), 0);
  await settleN(2);
  assert.equal(ui.menu().getAttribute('role'), 'dialog');
});

test('U44: بلا ترجمة يفتح زر الرفع منتقي الملفات مباشرة، فلا يعلن نافذة ولا حالة توسّع', async () => {
  const page = H.mountPage({ state: H.makeState() });
  const up = page.ui.btn('upload');
  assert.equal(up.getAttribute('aria-haspopup'), null);
  assert.equal(up.getAttribute('aria-expanded'), null);
  page.controller.set(H.withSlots([H.slotTrack()]));
  page.controller.set({ arabic: H.arabic() });
  await settleN(2);
  assert.equal(up.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(up.getAttribute('aria-expanded'), 'false');
});

// ———— U46 ————

test('U46: خروج التركيز من النافذة إلى خارج الطبقة والمجموعة يغلقها؛ والانتقال إلى زرها أو داخلها أو فقده بلا وجهة لا', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const { ui, env } = page;
  const outside = env.doc.createElement('button');
  env.doc.body.appendChild(outside);
  H.click(ui.btn('badge'), 0);
  await settleN(2);
  const root = layerRoot(page);
  const inner = root.activeElement;
  assert.ok(inner, 'التركيز داخل النافذة بعد فتحها بلوحة المفاتيح');
  inner.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: ui.groupHost() });
  assert.ok(ui.menuOpen(), 'إلى زرها في الشريط');
  inner.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: null });
  assert.ok(ui.menuOpen(), 'بلا وجهة (المتصفح نفسه فقد التركيز)');
  inner.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: ui.menu().querySelectorAll('button').at(-1) });
  assert.ok(ui.menuOpen(), 'داخلها');
  outside.focus();
  inner.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: outside });
  assert.equal(ui.menuOpen(), false, 'إلى خارجها');
  assert.equal(ui.btn('badge').getAttribute('aria-expanded'), 'false');
  assert.ok(env.doc._focused === outside, 'التركيز يبقى حيث ذهب المستخدم');
});

test('U46: تأكيد الرفع المنتظر لا يُغلق بخروج التركيز (قرار ينتظر، كما مع اختفاء الشريط)', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const { ui, env } = page;
  const outside = env.doc.createElement('button');
  env.doc.body.appendChild(outside);
  H.click(ui.btn('upload'), 0);
  await settleN(2);
  H.click(ui.item('رفع ترجمة'), 0);
  H.chooseFiles(ui, [{ name: 'b.ar.srt', size: 10, arrayBuffer: async () => new ArrayBuffer(10) }]);
  await settleN();
  assert.match(ui.menuLabel(), /رفع ترجمة|استبدال/);
  const inner = layerRoot(page).activeElement ?? ui.menu().querySelector('button');
  inner.dispatchEvent({ type: 'focusout', bubbles: true, relatedTarget: outside });
  assert.ok(ui.menuOpen(), 'التأكيد باقٍ');
});

// ———— U47 ————

test('U47: أثناء الإعلان «علّم للمراجعة» و«مزامنة بجملة…» معطّلان بسببهما ولا يقرآن زمن الإعلان، ويعودان بعده', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const { ui, env, controller } = page;
  page.player.classList.add('ad-showing');
  page.video.currentTime = 4.0;
  env.win.advance(1000); // الفحص الدوري يقرأ الإعلان من المشغّل
  await settleN(2);
  H.click(ui.btn('upload'), 0);
  await settleN(2);
  const mark = ui.field('mark');
  assert.equal(mark.getAttribute('aria-disabled'), 'true');
  assert.equal(mark.getAttribute('aria-description'), messageFor('CT_AD_SHOWING'));
  H.click(mark, 0);
  await settleN();
  assert.equal(controller.calls.filter((c) => c[0] === 'markCue').length, 0);
  H.click(ui.btn('upload'), 0);
  H.click(ui.btn('badge'), 0);
  await settleN(2);
  assert.equal(ui.field('sync').getAttribute('aria-disabled'), 'true');
  H.click(ui.field('sync'), 0);
  await settleN(2);
  assert.equal(ui.field('sentence:0'), null, 'لا عرض جمل بزمن الإعلان');
  page.player.classList.remove('ad-showing');
  env.win.advance(1000);
  await settleN(2);
  assert.equal(ui.field('sync').getAttribute('aria-disabled'), null);
});

test('U47: ضغطة سبقت إعادة الرسم وقد بدأ الإعلان لا تعلّم ولا تزامن، وتقول السبب', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const { ui, controller } = page;
  H.click(ui.btn('upload'), 0);
  await settleN(2);
  page.player.classList.add('ad-showing');
  page.video.currentTime = 4.0;
  H.click(ui.field('mark'), 0);
  await settleN();
  assert.equal(controller.calls.filter((c) => c[0] === 'markCue').length, 0);
  assert.ok(ui.toasts().some((t) => t.text === messageFor('CT_AD_SHOWING')));
});

// ———— U48 ————

test('U48: جذور الشريط والطبقة والرسائل بلغتها العربية (lang)', () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  assert.equal(groupRoot(page).querySelector('.group').getAttribute('lang'), 'ar');
  assert.equal(layerRoot(page).querySelector('.layer').getAttribute('lang'), 'ar');
  assert.equal(layerRoot(page).querySelector('.toasts').getAttribute('lang'), 'ar');
});

test('U48: نقرة ± في الشريط تُعلن الإزاحة الجديدة في منطقة حية', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  H.click(page.ui.btn('plus'), 0);
  await settleN(2);
  const live = layerRoot(page).querySelectorAll('[aria-live]').filter((e) => /تظهر لاحقًا/.test(e.textContent));
  assert.equal(live.length, 1, 'منطقة حية واحدة تحمل الإزاحة');
  assert.match(live[0].textContent, /\+0\.5/);
});

test('U48: حقل «مقاطع لكل جزء» موصوف برسالة خطئه ومسمّى بتسميته المرئية', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), captured: [H.trackInfo()] }) });
  const { ui } = page;
  H.click(ui.btn('download'), 0);
  await settleN(2);
  H.click(ui.item('خيارات احتياطية'), 0);
  await settleN(2);
  const split = ui.field('split');
  split.checked = true;
  split.dispatchEvent({ type: 'change', bubbles: true, target: split });
  await settleN(2);
  const size = ui.field('splitSize');
  size.value = '7';
  size.dispatchEvent({ type: 'input', bubbles: true });
  H.click(ui.item('تنزيل الملف'), 0);
  await settleN();
  const field = ui.field('splitSize');
  const err = ui.menu().querySelectorAll('div').find((d) => d.className === 'field-error');
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.ok(err.getAttribute('id'), 'للرسالة معرّف');
  assert.equal(field.getAttribute('aria-describedby'), err.getAttribute('id'));
  const label = ui.menu().querySelectorAll('label').find((l) => l.textContent === 'مقاطع لكل جزء');
  assert.equal(label.getAttribute('for'), field.getAttribute('id'));
});

test('U48 (N08): رسالة جديدة لا تعيد إنشاء الرسائل القائمة، فلا يُعاد إعلان خطأ قديم', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  page.controller.set({ error: { code: 'E1', message: 'خطأ أول' } });
  await settleN(2);
  const root = layerRoot(page);
  const first = root.querySelector('.toast');
  page.controller.set({ error: { code: 'E2', message: 'خطأ ثانٍ' } });
  await settleN(2);
  const boxes = root.querySelector('.toasts').children;
  assert.equal(boxes.length, 2);
  assert.ok(boxes[0] === first, 'عقدة الخطأ الأول نفسها');
});

// ———— U88 ————

/** ثلاث ترجمات، والتبديل إلى الثانية يعرض «الترجمة 2» بتراجع. */
async function undoToast() {
  const page = H.mountPage({ state: H.makeState(H.withSlots([H.slotTrack(), H.slotTrack({ fileName: 'b.srt' }), null])) });
  H.click(page.ui.btn('upload'), 0);
  await settleN(2);
  H.click(page.ui.menu().querySelectorAll('button.slot')[1]);
  await settleN();
  const act = layerRoot(page).querySelector('.toasts button.act');
  assert.ok(act, 'رسالة بتراجع');
  return { page, act };
}

test('U88: رسالة جديدة لا تفصل «تراجع» المركّز، وانقضاء مهلته يعيد التركيز إلى زر ظاهر في الشريط', async () => {
  const { page, act } = await undoToast();
  act.focus();
  page.controller.set({ notice: { code: 'ST_OFFSET_RESET', tone: 'info', at: 99 } });
  await settleN(2);
  assert.ok(act.isConnected, 'الزر نفسه باقٍ');
  assert.ok(layerRoot(page).activeElement === act, 'والتركيز عليه');
  page.env.win.advance(Session.UNDO_MS + 10);
  await settleN(2);
  assert.ok(!act.isConnected, 'انقضت المهلة');
  assert.ok(groupRoot(page).activeElement === page.ui.btn('upload'), 'التركيز على «الترجمة» لا على body');
});

test('U88: تفعيل «تراجع» بلوحة المفاتيح يعيد التركيز إلى زر ظاهر في الشريط', async () => {
  const { page, act } = await undoToast();
  act.focus();
  H.click(act, 0);
  await settleN();
  assert.ok(groupRoot(page).activeElement === page.ui.btn('upload'));
});

test('U88: زر اللوحة المخفي لا يُعطى التركيز: الصلة تعيده إلى «الترجمة» الظاهر', () => {
  const link = createPanelLink();
  const prefs = { ...DEFAULT_PREFS, ui: { ...DEFAULT_PREFS.ui, panelEntry: false } };
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), prefs }), link });
  assert.ok(page.ui.btn('panel').hasAttribute('hidden'));
  assert.equal(link.focusButton(), true);
  assert.ok(groupRoot(page).activeElement === page.ui.btn('upload'));
});

// ———— U89 ————

test('U89: Esc يخفي التلميح والمؤشر فوق الزر أو التركيز عليه، ويعود بمرور أو تركيز جديد', () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const { ui, env } = page;
  const btn = ui.btn('download');
  btn.dispatchEvent({ type: 'pointerenter' });
  assert.ok(ui.tip());
  // المؤشر فوق الزر والتركيز في الصفحة: الضغطة تصل المستند لا الزر.
  env.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(ui.tip(), null, 'Esc والمؤشر فوق الزر');
  btn.dispatchEvent({ type: 'pointerleave' });
  env.win.advance(1000);
  btn.dispatchEvent({ type: 'pointerenter' });
  assert.ok(ui.tip(), 'مرور جديد');
  btn.dispatchEvent({ type: 'pointerleave' });
  env.win.advance(1000);
  btn.focus();
  assert.ok(ui.tip());
  H.key(btn, 'Escape');
  assert.equal(ui.tip(), null, 'Esc والتركيز على الزر');
});

test('U89: يمكن المرور فوق التلميح: مغادرة الزر نحوه لا تخفيه، ومغادرته تخفيه بعد مهلة قصيرة', () => {
  assert.ok(TIP_HIDE_MS > 0 && TIP_HIDE_MS <= 500, 'مهلة الإخفاء');
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const { ui, env } = page;
  const btn = ui.btn('download');
  const tip = layerRoot(page).querySelector('.tip');
  btn.dispatchEvent({ type: 'pointerenter' });
  const text = ui.tip();
  btn.dispatchEvent({ type: 'pointerleave' });
  assert.equal(ui.tip(), text, 'لم يُخفَ لحظة المغادرة');
  tip.dispatchEvent({ type: 'pointerenter' });
  env.win.advance(1000);
  assert.equal(ui.tip(), text, 'المؤشر فوق التلميح');
  tip.dispatchEvent({ type: 'pointerleave' });
  env.win.advance(TIP_HIDE_MS + 10);
  assert.equal(ui.tip(), null);
  assert.ok(selectorsDefining(layerCss(), 'pointer-events', 'auto').includes('.tip'), 'التلميح يلتقط المؤشر');
});

// ———— U49 ————

test('U49 (GEM-022b، DS-TJ-46): اسم الملف في «نُزّل» معزول LTR، وعنوان الفيديو في تحذير الاسم معزول FSI', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), captured: [H.trackInfo()] }) });
  const { ui } = page;
  H.click(ui.btn('download'), 0);
  await settleN(2);
  H.click(ui.item('تنزيل الملف'), 0);
  await settleN();
  assert.equal(ui.field('saveLine').textContent, `نُزّل ${LRI}${H.A}.en.manual.normal.srt${PDI}`);
  assert.equal(nameOtherLine('10 Tips for Beginners'), `الاسم يشير إلى فيديو آخر · ${FSI}10 Tips for Beginners${PDI}`);
});

test('U49 (CL-X3): الرسائل تتبع سطر الترجمة إن كبر بعد ظهورها، بلا عرض جديد للأدوات', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }), height: 360 });
  const overlay = page.env.doc.createElement('div');
  overlay.id = 'tarjuman-overlay';
  overlay.setAttribute('data-stage-top', '70');
  page.player.appendChild(overlay);
  page.controller.set({ error: { code: 'ST_WRITE_FAILED', message: 'تعذّر الحفظ.' } });
  await settleN(2);
  const toasts = layerRoot(page).querySelector('.toasts');
  assert.equal(toasts.style.getPropertyValue('--y'), '82px');
  overlay.setAttribute('data-stage-top', '150');
  assert.equal(toasts.style.getPropertyValue('--y'), '162px');
});

test('U49 (P-11): قائمة التوقيت فوق سطر الترجمة حين يتسع المشغّل لها، وإلا بقيت فوق زرها', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }), height: 360 });
  const overlay = page.env.doc.createElement('div');
  overlay.id = 'tarjuman-overlay';
  overlay.setAttribute('data-stage-top', '150');
  page.player.appendChild(overlay);
  page.ui.btn('badge').rect = { left: 400, width: 48, top: 312, bottom: 360, right: 448, height: 48 };
  H.click(page.ui.btn('badge'), 0);
  await settleN(2);
  const menu = page.ui.menu();
  assert.equal(menu.style.getPropertyValue('--y'), '162px', 'فوق السطر');
  overlay.removeAttribute('data-stage-top');
  overlay.setAttribute('data-stage-top', '100');
  assert.equal(menu.style.getPropertyValue('--y'), '162px', 'لا تنزل بين المقاطع ولا مع سطر أقصر');
  overlay.setAttribute('data-stage-top', '180');
  assert.equal(menu.style.getPropertyValue('--y'), '192px', 'وترتفع مع سطر أطول');
  overlay.setAttribute('data-stage-top', '150');
  H.click(page.ui.btn('badge'), 0);
  menu.rect = { top: 0, left: 0, width: 280, height: 300, right: 280, bottom: 300 };
  H.click(page.ui.btn('badge'), 0);
  await settleN(2);
  assert.equal(menu.style.getPropertyValue('--y'), '60px', 'لا مكان فوق السطر: فوق زرها كما كانت');
});

test('مراجعة C6: تلميح أُخفي والمؤشر فوقه لا يعلّق إخفاء التلميحات بعده', () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const { ui, env } = page;
  const btn = ui.btn('download');
  const tip = layerRoot(page).querySelector('.tip');
  btn.dispatchEvent({ type: 'pointerenter' });
  btn.dispatchEvent({ type: 'pointerleave' });
  tip.dispatchEvent({ type: 'pointerenter' });
  env.doc.dispatchEvent({ type: 'keydown', key: 'Escape' }); // يُخفى والمؤشر فوقه: لا pointerleave من مخفي
  assert.equal(ui.tip(), null);
  const up = ui.btn('upload');
  up.dispatchEvent({ type: 'pointerenter' });
  assert.ok(ui.tip());
  up.dispatchEvent({ type: 'pointerleave' });
  env.win.advance(TIP_HIDE_MS + 10);
  assert.equal(ui.tip(), null, 'يزول بعد المغادرة كالمعتاد');
});
