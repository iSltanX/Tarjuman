// مراقبة التنقل بين الفيديوهات (P5، AC5/R05): حدث يوتيوب الداخلي yt-navigate-start/finish، ومراقبة معرّف
// الفيديو في العنوان احتياطًا (watchCurrentVideo: الحدث وpopstate ومؤقت 500ms)، فلا يعتمد القرار على الحدث
// وحده. «التنقل الجاري» يبدأ بالحدث أو بتغيّر المعرّف، وينتهي بحدث الانتهاء أو بمهلة أمان؛ وما دام جاريًا
// لا تعرض الطبقة شيئًا، فلا يظهر سطر فيديو سابق فوق التالي.
import { EVENTS, videoIdFromLocation, watchCurrentVideo } from '../youtube-dom.js';

/** مهلة الأمان: إلغاء تنقّل لم يصله حدث الانتهاء لا يُخفي الترجمة إلى الأبد. */
export const SETTLE_MS = 1500;

/**
 * @param {{
 *   win: Window,
 *   onChange: (s: { videoId: string | null, navigating: boolean }) => void,
 *   settleMs?: number, pollMs?: number,
 * }} opts
 */
export function watchNavigation({ win, onChange, settleMs = SETTLE_MS, pollMs }) {
  let navigating = false;
  let settleTimer = 0;
  let stopped = false;
  let reported = { videoId: videoIdFromLocation(win.location), navigating: false };

  const read = () => ({ videoId: videoIdFromLocation(win.location), navigating });
  const emit = () => {
    if (stopped) return;
    const next = read();
    if (next.videoId === reported.videoId && next.navigating === reported.navigating) return;
    reported = next;
    onChange(next);
  };
  const cancelSettle = () => {
    if (!settleTimer) return;
    win.clearTimeout(settleTimer);
    settleTimer = 0;
  };
  const end = () => {
    cancelSettle();
    navigating = false;
    emit();
  };
  const begin = () => {
    navigating = true;
    cancelSettle();
    settleTimer = win.setTimeout(end, settleMs);
    emit();
  };

  // تغيّر المعرّف نفسه تنقّلٌ ولو لم يصل حدث بدايته (رجوع/تقدّم أو تغيير بلا حدث).
  const tracker = watchCurrentVideo({ win, pollMs, onChange: () => begin() });
  const onStart = () => begin();
  const onFinish = () => {
    tracker.current();
    end();
  };
  const onData = () => {
    tracker.current();
    emit();
  };
  const doc = win.document;
  doc.addEventListener(EVENTS.navigateStart, onStart);
  doc.addEventListener(EVENTS.navigateFinish, onFinish);
  doc.addEventListener(EVENTS.pageDataUpdated, onData);

  return {
    /** الحالة الآن بعد فحص العنوان فورًا. */
    state() {
      tracker.current();
      return read();
    },
    stop() {
      stopped = true;
      cancelSettle();
      tracker.stop();
      doc.removeEventListener(EVENTS.navigateStart, onStart);
      doc.removeEventListener(EVENTS.navigateFinish, onFinish);
      doc.removeEventListener(EVENTS.pageDataUpdated, onData);
    },
  };
}
