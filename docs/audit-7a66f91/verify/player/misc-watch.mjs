// L-26 (المشغّل المصغّر)، P-6 (تبنّي ورقة الإخفاء مرة)، P-7 (تجاذب أول الشريط)، TJ-HYP-001 (قبل hydrate)، L-17 (الشريط)، E-3 (عمل دوري).
import { imp, settleN, log } from './common.mjs';
const O = await imp('test/unit/player/overlay/harness.js');
const { mountOverlay } = await imp('src/player/overlay/index.js');
const H = await imp('test/unit/player/controls/harness.js');
const P = await imp('test/unit/player/panel/harness.js');

// L-26: من صفحة المشاهدة إلى الرئيسية والفيديو مستمر في المشغّل المصغّر (العنوان صار "/")
{
  const page = O.watchPage();
  page.video.tickTo?.(2.0);
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win, fonts: null });
  page.env.win.advance(2000);
  const peek1 = handle.peek?.() ?? null;
  const host = page.player.children.find((c) => c.id === 'tarjuman-overlay');
  log('L-26 قبل: مخفية؟', host?.hasAttribute('hidden'), '| النص:', host?.shadowRoot.querySelector('.stage')?.textContent);
  page.env.doc.dispatchEvent({ type: 'yt-navigate-start' });
  page.env.win.navigate('https://www.youtube.com/');
  page.env.doc.dispatchEvent({ type: 'yt-navigate-finish' });
  page.env.win.advance(2000);
  log('L-26 بعد الانتقال إلى "/" والمشغّل نفسه باقٍ (المصغّر): مخفية؟', host?.hasAttribute('hidden'), '| الإخفاء الأصلي مفعّل؟', page.env.doc.adoptedStyleSheets.length > 0, '| peek', JSON.stringify(peek1 ? 'ok' : null));
  handle.unmount?.();
}

// P-6: يوتيوب أو إضافة أخرى تعيد تعيين document.adoptedStyleSheets
{
  const page = O.watchPage();
  page.video.tickTo?.(2.0);
  const handle = mountOverlay(page.controller, { doc: page.env.doc, win: page.env.win, fonts: null });
  page.env.win.advance(1500);
  const doc = page.env.doc;
  log('P-6 قبل: أوراق المستند', doc.adoptedStyleSheets.length, '| تحوي إخفاء الترجمة؟', doc.adoptedStyleSheets.some((s) => s.css?.includes('ytp-caption-window-container')));
  doc.adoptedStyleSheets = []; // طمس من طرف آخر
  page.controller.set({ view: { displayOffsetMs: 100, displayMode: 'ar' } }); // تحديث حالة
  page.env.win.advance(5000); // فحوص الصحة الدورية
  log('P-6 بعد الطمس + تحديث + 5 ث فحوص: أوراق المستند', doc.adoptedStyleSheets.length, '| ما زالت الطبقة تعدّ نفسها مخفية للأصلية:', handle.diagnostics?.().session?.captionsHidden ?? '?');
  handle.unmount?.();
}

// P-7: إضافة منافسة تعيد زرها أول أدوات الشريط عند كل تغيّر في أبنائه
{
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const { env, right } = page;
  const rival = env.doc.createElement('div');
  rival.id = 'rival-ext';
  right.insertBefore(rival, right.firstChild);
  let rivalMoves = 0;
  let pending = false;
  const mo = new env.win.MutationObserver(() => {
    if (right.firstChild !== rival && !pending) {
      pending = true;
      queueMicrotask(() => { pending = false; rivalMoves++; right.insertBefore(rival, right.firstChild); });
    }
  });
  mo.observe(right, { childList: true });
  const r0 = page.handle.diagnostics().session.reinserts;
  for (let i = 0; i < 20; i++) { env.win.advance(50); await settleN(1); }
  log('P-7: خلال ثانية وهمية: إعادات إدراج ترجمان =', page.handle.diagnostics().session.reinserts - r0, '| نقلات المنافس =', rivalMoves, '| الأول الآن:', right.firstChild.id || right.firstChild.className);
  mo.disconnect();
}

// TJ-HYP-001: الأدوات أثناء loading ثم بعده
{
  const page = H.mountPage({ state: H.makeState({ loading: true }) });
  const snap = () => page.ui.kinds().map((k) => { const b = page.ui.btn(k); return `${k}${b.hasAttribute('hidden') ? '(hidden)' : ''}${b.getAttribute('aria-disabled') === 'true' ? '(disabled)' : ''}`; }).join(' ');
  log('HYP-001 أثناء التحميل:', snap(), '| اسم الرفع:', page.ui.btn('upload').getAttribute('aria-label'));
  const s = H.makeState({ arabic: H.arabic() });
  page.controller.set({ ...s, loading: false });
  await settleN(2);
  log('HYP-001 بعد التحميل:', snap(), '| اسم الرفع:', page.ui.btn('upload').getAttribute('aria-label'));
}

// L-17 من الشريط: فشل فتح اللوحة يظهر رسالة
{
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  page.controller.updatePrefs = async () => { throw new Error('write failed'); };
  H.click(page.ui.btn('panel'), 0);
  await settleN(4);
  log('L-17 (زر اللوحة في الشريط مع فشل الحفظ): الرسائل =', JSON.stringify(page.ui.toasts()));
}

// E-3: اللوحة مغلقة: كم مرة تُعاد الحلقة وتُقرأ الهندسة في 10 ثوانٍ؟
{
  const page = P.watchPage({ state: P.makeState({ prefs: { ...P.makeState().prefs, ui: { ...P.makeState().prefs.ui, panelOpen: false } } }) });
  let rects = 0;
  const wrap = (el) => { const f = el.getBoundingClientRect.bind(el); el.getBoundingClientRect = () => { rects++; return f(); }; };
  wrap(page.player); wrap(page.inner);
  const handle = page.mount();
  await settleN(3);
  const r0 = handle.diagnostics().session.renders;
  rects = 0;
  page.win.advance(10_000);
  await settleN(2);
  const d = handle.diagnostics();
  log('E-3: اللوحة', d.session.mode, '| عروض في 10 ث:', d.session.renders - r0, '| قراءات getBoundingClientRect للمشغّل والعمود:', rects, '| مؤقتات معلّقة:', page.win.pendingTimers());
}
