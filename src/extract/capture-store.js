// ذاكرة الالتقاط داخل الجلسة فقط، مفهرسة بمعرّف الفيديو. عند تغيّر الفيديو المعروض يُفرَّغ كل ما
// لا يخصه، فلا يُصدَّر إلا مسار الفيديو الحالي. لا تخزين دائم ولا روابط.

const MAX_REJECTED = 100;

/**
 * @typedef {{
 *   id: number, at: number, videoId: string, lang: string, trackKind: 'manual' | 'asr', format: string,
 *   transport: string, bodyLength: number, body: string, acceptedFor: string,
 *   meta: { hasPot: boolean, capsAsr: boolean, kindParam: string | null }
 * }} AcceptedCapture
 */

/** @param {{ now?: () => number }} [opts] */
export function createCaptureStore({ now = () => Date.now() } = {}) {
  let currentVideoId = null;
  let seq = 0;
  let navigations = 0;
  /** @type {Map<string, AcceptedCapture>} المفتاح videoId|lang|kind */
  const accepted = new Map();
  const rejected = [];

  return {
    /** @param {string | null} id */
    setCurrentVideo(id) {
      if (id === currentVideoId) return false;
      currentVideoId = id;
      navigations++;
      for (const [key, c] of accepted) if (c.videoId !== id) accepted.delete(key);
      return true;
    },
    get currentVideoId() {
      return currentVideoId;
    },
    /** @param {Omit<AcceptedCapture, 'id' | 'at'>} capture */
    accept(capture) {
      if (capture.videoId !== currentVideoId) throw new Error('محاولة قبول التقاط لا يخص الفيديو الحالي');
      const entry = { ...capture, id: ++seq, at: now() };
      accepted.set(`${capture.videoId}|${capture.lang}|${capture.trackKind}`, entry);
      return entry;
    },
    /** @param {{ code: string, detail: string, videoId: string | null, lang: string | null, trackKind: string, hasTlang: boolean, format: string, bodyLength: number, currentVideoId: string | null }} info */
    reject(info) {
      rejected.push({ ...info, id: ++seq, at: now() });
      if (rejected.length > MAX_REJECTED) rejected.shift();
    },
    /**
     * يحرّر مدخلًا طُرد من خانات المستخرج، فلا يبقى جسمه محتفظًا به حتى التنقل (تدقيق 7a66f91، U33). لا أثر إن حل محله أحدث.
     * @param {AcceptedCapture} entry
     */
    release(entry) {
      const key = `${entry.videoId}|${entry.lang}|${entry.trackKind}`;
      if (accepted.get(key) === entry) accepted.delete(key);
    },
    accepted() {
      return [...accepted.values()];
    },
    rejected() {
      return rejected.slice();
    },
    get navigations() {
      return navigations;
    },
  };
}
