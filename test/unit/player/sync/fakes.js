// أدوات اختبار المزامنة: عنصر فيديو وهمي يمنع الكتابة في currentTime (عقد التوقيت: لا يُمَسّ أبدًا)،
// ومُجدول إطارات يدوي بدل requestAnimationFrame.

export class FakeVideo extends EventTarget {
  constructor({ currentTime = 0, paused = true, playbackRate = 1 } = {}) {
    super();
    this._t = currentTime;
    this.paused = paused;
    this.ended = false;
    this.playbackRate = playbackRate;
    this.writes = 0;
  }

  get currentTime() {
    return this._t;
  }

  set currentTime(v) {
    this.writes++;
    throw new Error('الكتابة في currentTime ممنوعة على الطبقة');
  }

  /** أدوات الاختبار وحدها: تحريك الزمن كما يفعل المشغّل. */
  seekTo(sec, { fire = true } = {}) {
    this._t = sec;
    if (fire) {
      this.dispatchEvent(new Event('seeking'));
      this.dispatchEvent(new Event('seeked'));
    }
  }

  play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
  }

  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  setRate(r) {
    this.playbackRate = r;
    this.dispatchEvent(new Event('ratechange'));
  }

  addEventListener(type, fn, opts) {
    this._n = (this._n ?? 0) + 1;
    super.addEventListener(type, fn, opts);
  }

  removeEventListener(type, fn, opts) {
    this._n = (this._n ?? 0) - 1;
    super.removeEventListener(type, fn, opts);
  }

  /** عدد المستمعين المضافين ناقص المزالين (للتأكد من فك الربط). */
  listenerCount() {
    return this._n ?? 0;
  }
}

/** requestAnimationFrame يدوي: step() ينفّذ ما جُدول وقت الاستدعاء فقط. */
export function fakeRaf() {
  let next = 1;
  const queue = new Map();
  return {
    requestAnimationFrame(cb) {
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id) {
      queue.delete(id);
    },
    pending: () => queue.size,
    step() {
      const run = [...queue.values()];
      queue.clear();
      for (const cb of run) cb();
      return run.length;
    },
  };
}
