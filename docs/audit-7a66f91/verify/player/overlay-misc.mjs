// L-16 (التداخل)، CL-X1 (وميض الفجوة القصيرة)، CL-X3 (الرسائل لا تتبع نمو سطر الترجمة)، P-11 (قائمة التوقيت لا تراعي السطر).
import { imp, settleN, log } from './common.mjs';
const { createCueIndex } = await imp('src/player/sync/cue-index.js');
const { createSyncEngine } = await imp('src/player/sync/engine.js');
const { createOverlayView } = await imp('src/player/overlay/view.js');
const { FADE_MS } = await imp('src/player/overlay/styles.js');
const { createFakeEnv } = await imp('test/unit/player/overlay/fake-dom.js');
const H = await imp('test/unit/player/controls/harness.js');

// L-16: متحدثان متداخلان
const cues = [
  { n: 1, startMs: 1000, endMs: 5000, text: 'المتحدث الأول يتكلم طويلًا' },
  { n: 2, startMs: 2000, endMs: 3000, text: 'المتحدث الثاني يقاطع' },
];
const idx = createCueIndex(cues);
for (const ms of [1500, 2500, 3500]) log(`L-16 عند ${ms}ms يظهر:`, idx.find(ms).cue?.n ?? null);

// CL-X1: مقطعان بينهما 50ms، والمحرّك على إطارات 16ms
const env = createFakeEnv();
const view = createOverlayView({ doc: env.doc, win: env.win });
env.doc.body.appendChild(view.host);
const stage = view.host.shadowRoot.querySelector('.stage');
const trace = [];
let t = 0;
const video = { currentTime: 2.99, paused: false, ended: false, addEventListener() {}, removeEventListener() {} };
const raf = [];
env.win.requestAnimationFrame = (cb) => { raf.push(cb); return raf.length; };
const engine = createSyncEngine({ win: env.win, onFrame: (f) => view.render({ ar: f.ar ? [f.ar.text] : [], en: [] }) });
const gapCues = [{ n: 1, startMs: 1000, endMs: 3000, text: 'أ' }, { n: 2, startMs: 3050, endMs: 5000, text: 'ب' }];
engine.setVideo(video);
engine.setSource({ ar: gapCues, en: null, offsetMs: 0 });
for (t = 2990; t <= 3100; t += 16) {
  video.currentTime = t / 1000;
  const cb = raf.shift();
  cb?.();
  trace.push(`${t}:${stage.hasAttribute('data-empty') ? 'فارغ' : stage.textContent}`);
}
log(`CL-X1 (FADE_MS=${FADE_MS}، فجوة 50ms): تتابع الإطارات`, trace.join(' | '));

// CL-X3 وP-11: مواضع الرسائل والقائمة نسبةً إلى data-stage-top
const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }), height: 360 });
const overlayHost = page.env.doc.createElement('div');
overlayHost.id = 'tarjuman-overlay';
overlayHost.setAttribute('data-stage-top', '70');
page.player.appendChild(overlayHost);
page.controller.set({ error: { code: 'ST_WRITE_FAILED', message: 'تعذّر الحفظ.' } }); // رسالة خطأ باقية حتى الإغلاق
await settleN(2);
page.env.win.advance(20); // تصريف المؤقتات الصفرية
await settleN(2);
const toastsEl = page.ui.layerHost().shadowRoot.querySelector('.toasts');
log('CL-X3: --y للرسائل وأعلى السطر 70 =>', toastsEl.style.getPropertyValue('--y'));
overlayHost.setAttribute('data-stage-top', '150'); // كبر السطر (ثلاثة أسطر) والرسالة ظاهرة
page.env.win.advance(1000); // استطلاع الشريط كل 500ms لا يغيّر لقطة الشريط
await settleN(2);
log('CL-X3: بعد أن صار أعلى السطر 150 ومضت ثانية: --y =', toastsEl.style.getPropertyValue('--y'), '(لم يُعَد الحساب)');
page.controller.set({}); // أي عرض جديد يعيد الحساب
await settleN(2);
log('CL-X3: بعد عرض جديد للأدوات: --y =', toastsEl.style.getPropertyValue('--y'));

// P-11: القائمة تُوضع فوق زرها بقيمة الشريط وحدها
page.ui.btn('badge').rect = { left: 400, width: 48, top: 312, bottom: 360, right: 448, height: 48 };
H.click(page.ui.btn('badge'), 0);
await settleN(2);
const menu = page.ui.menu();
log('P-11: قائمة التوقيت --y =', menu.style.getPropertyValue('--y'), 'بينما أعلى السطر 150 (bottom-based)؛ أي أن أسفل القائمة تحت أعلى السطر => تغطيه إن تقاطعا أفقيًا');
