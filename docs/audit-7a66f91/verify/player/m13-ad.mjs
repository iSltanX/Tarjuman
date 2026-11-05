// M-13: «علّم للمراجعة» و«مزامنة بجملة…» أثناء الإعلان يقرآن زمن عنصر الفيديو (زمن الإعلان) دون فحص isAdShowing.
import { imp, settleN, log } from './common.mjs';
const H = await imp('test/unit/player/controls/harness.js');
const { isAdShowing, seekMainVideo } = await imp('src/player/youtube-dom.js');

const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
const { ui, env, controller } = page;
// إعلان قبل الفيديو أو في وسطه: الفيديو نفسه (html5-main-video) يشغّل الإعلان، وزمنه 4.0 ث من الإعلان.
page.player.classList.add('ad-showing');
page.video.currentTime = 4.0;
log('isAdShowing =', isAdShowing(env.doc), '| seekMainVideo أثناء الإعلان يرفض؟', seekMainVideo(10000, env.doc) === false);

H.click(ui.btn('upload'), 0); // قائمة الترجمة
await settleN(2);
H.click(ui.item('علّم'), 0);
await settleN(4);
log('نداءات markCue أثناء الإعلان:', JSON.stringify(controller.calls.filter((c) => c[0] === 'markCue')));
log('الرسائل:', JSON.stringify(ui.toasts()));

H.click(ui.btn('upload'), 0); // إغلاق
H.click(ui.btn('badge'), 0); // التوقيت
await settleN(2);
H.click(ui.item('مزامنة'), 0);
await settleN(2);
log('رأس المزامنة:', ui.menu().querySelector('h2')?.textContent, '| الجمل المعروضة:', ui.menu().querySelectorAll('button').filter((b) => (b.getAttribute('data-fid') ?? '').startsWith('sentence:')).length);
const first = ui.menu().querySelector('[data-fid="sentence:0"]');
H.click(first, 0);
await settleN(4);
log('نداءات setOffset:', JSON.stringify(controller.calls.filter((c) => c[0] === 'setOffset')), '| الإزاحة الآن', controller.getState().view.displayOffsetMs);
