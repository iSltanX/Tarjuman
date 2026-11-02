// المعرّفات والمفاتيح وعناوين الصفحات (عقد data-model §١ وinterfaces §٦). لا شبكة ولا chrome هنا.

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const ENGLISH_LANG_RE = /^en(?:[-_][A-Za-z0-9]{1,8})*$/i;
export const FINGERPRINT_ID_RE = /^fp_[a-z0-9]{6,40}$/;
export const TRACK_KINDS = Object.freeze(['manual', 'asr']);

/** @param {unknown} id */
export const isVideoId = (id) => typeof id === 'string' && VIDEO_ID_RE.test(id);

/**
 * مفتاح المسار الإنجليزي: lang|kind، مثل en|manual أو en-GB|asr.
 * @param {string} lang @param {'manual' | 'asr'} kind
 */
export const trackKey = (lang, kind) => `${lang}|${kind}`;

/**
 * @param {unknown} key
 * @returns {{ lang: string, kind: 'manual' | 'asr' } | null}
 */
export function parseTrackKey(key) {
  if (typeof key !== 'string') return null;
  const [lang, kind, extra] = key.split('|');
  if (extra !== undefined || !ENGLISH_LANG_RE.test(lang ?? '') || !TRACK_KINDS.includes(kind)) return null;
  return { lang, kind: /** @type {'manual' | 'asr'} */ (kind) };
}

/**
 * معرّف بصمة جديد: fp_ ثم الزمن بأساس 36 ثم ستة محارف عشوائية.
 * @param {number} [now] @param {() => number} [rand]
 */
export function newFingerprintId(now = Date.now(), rand = Math.random) {
  let tail = '';
  while (tail.length < 6) tail += Math.floor(rand() * 36).toString(36);
  return `fp_${now.toString(36)}${tail}`;
}

/** مسارات صفحات الإضافة نسبةً إلى جذرها؛ تُحوَّل إلى عنوان بـchrome.runtime.getURL. */
export const PAGES = Object.freeze({
  popup: 'pages/popup/index.html',
  library: 'pages/library/index.html',
  settings: 'pages/settings/index.html',
  editor: 'pages/editor/index.html',
});

/**
 * @param {keyof typeof PAGES} name
 * @param {{ v?: string }} [params] v لمعرّف الفيديو (المحرّر وحده يحتاجه)
 */
export function pagePath(name, params = {}) {
  const base = PAGES[name];
  if (!base) throw new RangeError(`صفحة غير معروفة: ${name}`);
  if (params.v === undefined) return base;
  if (!isVideoId(params.v)) throw new RangeError('معرّف فيديو غير صالح');
  return `${base}?v=${params.v}`;
}

/**
 * معرّف الفيديو من معامل v في عنوان صفحة الإضافة، أو null.
 * @param {string} search مثل location.search
 */
export function videoParam(search) {
  const v = new URLSearchParams(search).get('v');
  return isVideoId(v) ? v : null;
}

/**
 * عنوان صفحة المشاهدة الوحيد الذي تفتحه الإضافة (أمر «فتح الفيديو»)، وعند زمن بالثواني الصحيحة للقفز (الإصدار الثاني).
 * @param {string} videoId
 * @param {{ atMs?: number }} [opts]
 */
export function watchUrl(videoId, { atMs } = {}) {
  if (!isVideoId(videoId)) throw new RangeError('معرّف فيديو غير صالح');
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  if (atMs === undefined) return base;
  if (!Number.isInteger(atMs) || atMs < 0) throw new RangeError('زمن غير صالح');
  return `${base}&t=${Math.floor(atMs / 1000)}s`;
}
