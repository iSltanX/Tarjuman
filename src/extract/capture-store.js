// ذاكرة الالتقاط داخل الجلسة فقط، مفهرسة بمعرّف الفيديو. عند تغيّر الفيديو المعروض إلى فيديو آخر يُفرَّغ كل ما
// لا يخصه، فلا يُصدَّر إلا مسار الفيديو الحالي؛ والصفحة بلا فيديو (المشغّل المصغّر، والرئيسية والبحث) تُبقي التقاط آخر
// فيديو حتى يعود أو يأتي غيره (تحقق Gemini، Y4-أ). لا تخزين دائم ولا روابط.

const MAX_REJECTED = 100;

/**
 * @typedef {{
 *   id: number, at: number, videoId: string, lang: string, trackKind: 'manual' | 'asr', via: string | null, format: string,
 *   transport: string, bodyLength: number, body: string, acceptedFor: string,
 *   meta: { hasPot: boolean, capsAsr: boolean, kindParam: string | null }
 * }} AcceptedCapture
 */

/** @param {{ videoId: string, lang: string, trackKind: string, via?: string | null }} c */
const keyOf = (c) => `${c.videoId}|${c.lang}|${c.trackKind}${c.via ? `|${c.via}` : ''}`;

/** @param {{ now?: () => number }} [opts] */
export function createCaptureStore({ now = () => Date.now() } = {}) {
  let currentVideoId = null;
  let seq = 0;
  let navigations = 0;
  /** @type {Map<string, AcceptedCapture>} المفتاح videoId|lang|kind ثم |via للمترجم آليًا (AA1) */
  const accepted = new Map();
  const rejected = [];

  return {
    /**
     * المعرّف null لا يمسح التقاط آخر فيديو (Y4-أ): بالمشغّل المصغّر لا يعيد يوتيوب طلب الترجمة عند العودة إلى الفيديو نفسه.
     * والفيديو الآخر يمسح ما لا يخصه، ولو جاء بعد صفحة بلا فيديو.
     * @param {string | null} id
     */
    setCurrentVideo(id) {
      if (id === currentVideoId) return false;
      currentVideoId = id;
      navigations++;
      if (id !== null) for (const [key, c] of accepted) if (c.videoId !== id) accepted.delete(key);
      return true;
    },
    get currentVideoId() {
      return currentVideoId;
    },
    /** @param {Omit<AcceptedCapture, 'id' | 'at'>} capture */
    accept(capture) {
      if (capture.videoId !== currentVideoId) throw new Error('محاولة قبول التقاط لا يخص الفيديو الحالي');
      const entry = { via: null, ...capture, id: ++seq, at: now() };
      accepted.set(keyOf(entry), entry);
      return entry;
    },
    /** @param {{ code: string, reason: string, detail: string, videoId: string | null, lang: string | null, trackKind: string, hasTlang: boolean, format: string, bodyLength: number, currentVideoId: string | null }} info */
    reject(info) {
      rejected.push({ ...info, id: ++seq, at: now() });
      if (rejected.length > MAX_REJECTED) rejected.shift();
    },
    /**
     * يحرّر مدخلًا طُرد من خانات المستخرج، فلا يبقى جسمه محتفظًا به حتى التنقل (تدقيق 7a66f91، U33). لا أثر إن حل محله أحدث.
     * @param {AcceptedCapture} entry
     */
    release(entry) {
      const key = keyOf(entry);
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
