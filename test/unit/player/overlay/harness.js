// أدوات اختبار الجلسة ونقطة التركيب: متحكم وهمي بحالة قابلة للتبديل، وفيديو ببيانات الزمن، ومحاكاة أحداث
// يوتيوب (إعلان، شريط، تنقل، ملء شاشة). كلها فوق الـDOM الوهمي.
import { DEFAULT_SETTINGS } from '../../../../src/core/model/settings.js';
import { makeCues } from '../../../helpers/fixtures.js';
import { addPlayer, createFakeEnv } from './fake-dom.js';

export const A = 'AAAAAAAAAAA';
export const B = 'BBBBBBBBBBB';

/** مقاطع عربية 1.0–3.0 و3.5–5.5 و6.0–8.0 ث (نصها «سطر n»). */
export const AR_CUES = makeCues(3, { text: (i) => `سطر ${i}` });
export const EN_CUES = makeCues(3, { text: (i) => `line ${i}` });
export const AR_B = makeCues(3, { text: (i) => `ترجمة الفيديو الثاني ${i}` });

export function makeState(over = {}) {
  return {
    videoId: A, loading: false, arabic: { cues: AR_CUES, edited: false, fileName: 'a.srt', comparison: null }, english: null,
    view: { displayOffsetMs: 0, displayMode: 'ar' }, settings: DEFAULT_SETTINGS, ...over,
  };
}

export function fakeController(initial = makeState()) {
  let state = initial;
  const subs = new Set();
  return {
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /** يبدّل الحالة ويبلّغ المشتركين كما يفعل المتحكم الحقيقي. */
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of [...subs]) fn(state);
    },
    subscribers: () => subs.size,
  };
}

/** عنصر الفيديو الوهمي: currentTime عادي، لكن كتابته تُعدّ (يجب أن تبقى صفرًا). */
export function prepareVideo(video, { currentTime = 0, paused = true } = {}) {
  let t = currentTime;
  video.writes = 0;
  Object.defineProperty(video, 'currentTime', {
    get: () => t,
    set() {
      video.writes++;
      throw new Error('الكتابة في currentTime ممنوعة على الطبقة');
    },
  });
  video.paused = paused;
  video.ended = false;
  video.playbackRate = 1;
  video.seekTo = (sec) => {
    t = sec;
    video.dispatchEvent({ type: 'seeking' });
    video.dispatchEvent({ type: 'seeked' });
  };
  video.tickTo = (sec) => {
    t = sec;
  };
  video.play = () => {
    video.paused = false;
    video.dispatchEvent({ type: 'play' });
  };
  video.pause = () => {
    video.paused = true;
    video.dispatchEvent({ type: 'pause' });
  };
  return video;
}

/** بيئة جاهزة: مشغّل بفيديو، ومتحكم وهمي، واختصارات لمحاكاة يوتيوب. */
export function watchPage({ state = makeState(), href = `https://www.youtube.com/watch?v=${A}`, width = 640, height = 360, withPlayer = true } = {}) {
  const env = createFakeEnv({ href });
  const parts = withPlayer ? addPlayer(env, { width, height }) : {};
  if (parts.video) prepareVideo(parts.video);
  const controller = fakeController(state);
  return {
    env, controller, ...parts,
    ev: (type) => env.doc.dispatchEvent({ type }),
    startAd: () => parts.player.classList.add('ad-showing'),
    endAd: () => parts.player.classList.remove('ad-showing'),
    /** ينتقل يوتيوب إلى فيديو آخر: بداية، فتغيّر العنوان، فانتهاء. */
    navigateTo(id) {
      env.doc.dispatchEvent({ type: 'yt-navigate-start' });
      env.win.navigate(`https://www.youtube.com/watch?v=${id}`);
      env.doc.dispatchEvent({ type: 'yt-navigate-finish' });
    },
  };
}
