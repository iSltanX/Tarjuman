// المعرّفات والمفاتيح وعناوين الصفحات (عقد data-model §١ وinterfaces §٦). لا شبكة ولا chrome هنا.

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
/** لغة المسار الذي يقرؤه الإصدار الأول و1.1.0 (المسار الإنجليزي الأصلي وحده). يبقى لإسقاط السجل المخزَّن (AA1). */
export const ENGLISH_LANG_RE = /^en(?:[-_][A-Za-z0-9]{1,8})*$/i;
/** لغة مسار بأي لغة كما يرسلها يوتيوب في lang أو tlang (BCP-47، حتى 35 محرفًا، تدقيق Fable FA-09). */
export const SOURCE_LANG_RE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8}){0,4}$/;
export const MAX_SOURCE_LANG_CHARS = 35;
export const FINGERPRINT_ID_RE = /^fp_[a-z0-9]{6,40}$/;
export const TRACK_KINDS = Object.freeze(['manual', 'asr']);

/** @param {unknown} id */
export const isVideoId = (id) => typeof id === 'string' && VIDEO_ID_RE.test(id);

/** رمز لغة مسار صالح بالصيغة التي يرسلها يوتيوب (يُحفظ كما ورد). @param {unknown} lang */
export const isSourceLang = (lang) => typeof lang === 'string' && lang.length <= MAX_SOURCE_LANG_CHARS && SOURCE_LANG_RE.test(lang);

/**
 * مفتاح المسار: lang|kind للمسار الأصلي (en|manual، ja|asr)، وlang|kind|via لمسار ترجمه يوتيوب آليًا إلى lang عن مسار
 * بلغة via ونوع kind (ar|asr|en: العربية مترجمة آليًا عن الإنجليزية التلقائية؛ قرار سلطان ق٢، AA1).
 * @param {string} lang @param {'manual' | 'asr'} kind @param {string | null} [via]
 */
export const trackKey = (lang, kind, via = null) => (via ? `${lang}|${kind}|${via}` : `${lang}|${kind}`);

/**
 * مفتاح مسار بأي لغة، أصليًا أو مترجمًا آليًا.
 * @param {unknown} key
 * @returns {{ lang: string, kind: 'manual' | 'asr', via: string | null } | null}
 */
export function parseTrackKey(key) {
  if (typeof key !== 'string') return null;
  const [lang, kind, via, extra] = key.split('|');
  if (extra !== undefined || !isSourceLang(lang) || !TRACK_KINDS.includes(kind)) return null;
  if (via !== undefined && !isSourceLang(via)) return null;
  return { lang, kind: /** @type {'manual' | 'asr'} */ (kind), via: via ?? null };
}

/**
 * مفتاح مسار يقرؤه الإصدار الأول و1.1.0: إنجليزي أصلي بصيغة lang|kind وحدها. ما سواه يُخزَّن في المفتاح المرافق lang:.
 * @param {unknown} key
 * @returns {{ lang: string, kind: 'manual' | 'asr' } | null}
 */
export function parseV1TrackKey(key) {
  const p = parseTrackKey(key);
  if (!p || p.via !== null || !ENGLISH_LANG_RE.test(p.lang)) return null;
  return { lang: p.lang, kind: p.kind };
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

/** لوحات المحرّر التي يفتحها عنوانه (ف1): «الاستكمال» وحدها. */
export const EDITOR_PANELS = Object.freeze(['complete']);

/**
 * @param {keyof typeof PAGES} name
 * @param {{ v?: string, t?: 1 | 2 | 3, p?: 'complete' }} [params] v لمعرّف الفيديو (المحرّر وحده يحتاجه)، وt لخانة التحرير،
 *   وp للوحة يُفتح عليها المحرّر (ف1). t وp لا معنى لهما بلا v.
 */
export function pagePath(name, params = {}) {
  const base = PAGES[name];
  if (!base) throw new RangeError(`صفحة غير معروفة: ${name}`);
  if (params.v === undefined) return base;
  if (!isVideoId(params.v)) throw new RangeError('معرّف فيديو غير صالح');
  let out = `${base}?v=${params.v}`;
  if (params.t !== undefined) {
    if (![1, 2, 3].includes(params.t)) throw new RangeError('خانة غير صالحة');
    out += `&t=${params.t}`;
  }
  if (params.p !== undefined) {
    if (!EDITOR_PANELS.includes(params.p)) throw new RangeError('لوحة غير معروفة');
    out += `&p=${params.p}`;
  }
  return out;
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
 * نمط مطابقة يوتيوب كما في content_scripts.matches في البيان: إذنه وحده ما تسأل عنه نافذة الأيقونة (تحقق Gemini، B5-أ). نمط
 * إذن لا رابط يُفتح.
 */
export const YOUTUBE_MATCHES = Object.freeze(['https://www.youtube.com/*']);

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
