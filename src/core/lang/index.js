// اللغات (AA1، حرية اللغات): تطبيع رمز اللغة، واسمها بالعربية وبلغتها، ونص كتابتها واتجاهها. البيانات كلها من المتصفح نفسه
// (Intl.Locale وIntl.DisplayNames، أي بيانات CLDR)، فلا قائمة لغات مكتوبة بالشيفرة ولا اتجاه مفترض للغة بعينها. ما لا يعرفه
// المتصفح يبقى رمزه، والرمز غير الصالح null. لا شبكة ولا chrome ولا DOM هنا، ولا ترمي أي دالة.

/** رمز لغة كما يرد من يوتيوب أو من اسم ملف: لغة من 2–3 حروف (أو 5–8) ثم مقاطع BCP-47. */
const LANG_SYNTAX = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*$|^[A-Za-z]{5,8}$/;
export const MAX_LANG_CHARS = 35;

/** رموز لا تدل على لغة بعينها. */
const NOT_A_LANGUAGE = /^(und|root|mul|zxx|mis)$/i;

/** نصوص الكتابة من اليمين (ISO 15924): العربية والعبرية والسريانية والثانا وأنكو والسامرية والمندائية وغيرها. */
const RTL_SCRIPTS = new Set(['Arab', 'Aran', 'Hebr', 'Syrc', 'Thaa', 'Nkoo', 'Samr', 'Mand', 'Adlm', 'Rohg', 'Yezi', 'Mend']);

/** النصوص المركبة إلى نصوص يونيكود التي تتكون منها. */
const COMPOSITE_SCRIPTS = { Jpan: ['Hira', 'Kana', 'Hani'], Hans: ['Hani'], Hant: ['Hani'], Kore: ['Hang', 'Hani'], Hanb: ['Hani', 'Bopo'] };

/**
 * حرف من نص يُكتب من اليمين، في أي موضع من النص. الأرقام العربية الهندية ليست حروفًا فلا تقلب اتجاهًا.
 * (العربية بامتداداتها، والعبرية، والسريانية، والثانا، وأنكو، والسامرية، والمندائية، وأدلام، والروهنجية، واليزيدية.)
 */
const RTL_LETTER = /(?=[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Yezidi}\p{Script=Mende_Kikakui}])\p{L}/u;

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/**
 * رمز اللغة بصيغته المعيارية (en-GB، zh-Hant، pt-BR)، أو null إن لم يكن رمز لغة صالحًا. «_» يصير «-»، والحالة تُوحَّد
 * بقواعد BCP-47 (Intl.getCanonicalLocales)، ولا تُستبدل الرموز القديمة (iw يبقى iw كما يرسله يوتيوب).
 * @param {unknown} code
 * @returns {string | null}
 */
export function normalizeLang(code) {
  if (typeof code !== 'string') return null;
  const raw = code.trim();
  if (!raw || raw.length > MAX_LANG_CHARS || !LANG_SYNTAX.test(raw)) return null;
  const dashed = raw.replace(/_/g, '-');
  if (NOT_A_LANGUAGE.test(dashed.split('-')[0])) return null;
  const canon = safe(() => Intl.getCanonicalLocales(dashed)[0], null);
  if (!canon) return null;
  // getCanonicalLocales قد يستبدل الرمز القديم (iw ← he)؛ نبقي اللغة كما وردت ونأخذ الحالة الموحدة لبقية المقاطع.
  const first = dashed.split('-')[0].toLowerCase();
  const rest = canon.split('-').slice(1);
  return [first, ...rest].join('-');
}

/** اللغة الأساسية من الرمز (en من en-GB)، أو null. @param {unknown} code */
export function baseLang(code) {
  const n = normalizeLang(code);
  return n ? n.split('-')[0] : null;
}

/** هل الرمزان للغة واحدة بلهجتين أو بالرمز نفسه (en وen-GB نعم، en وes لا). @param {unknown} a @param {unknown} b */
export const sameBaseLang = (a, b) => {
  const x = baseLang(a);
  return x !== null && x === baseLang(b);
};

const SCRIPT_CODE = /^[A-Z][a-z]{3}$/;
/** الأسماء المعروفة لنصوص يونيكود في الرموز: Orig في en-orig مقطع خاص بيوتيوب لا نص. */
function isScript(s) {
  if (typeof s !== 'string' || !SCRIPT_CODE.test(s)) return false;
  if (Object.hasOwn(COMPOSITE_SCRIPTS, s)) return true;
  return safe(() => new RegExp(`\\p{Script=${s}}`, 'u'), null) !== null;
}

/**
 * نص الكتابة المرجح للغة (ISO 15924: Arab وLatn وCyrl وJpan…) من بيانات CLDR، أو null إن لم يُعرف.
 * @param {unknown} code
 * @returns {string | null}
 */
export function langScript(code) {
  const n = normalizeLang(code);
  if (!n) return null;
  for (const c of [n, n.split('-')[0]]) {
    const s = safe(() => new Intl.Locale(c).maximize().script, null);
    if (s && isScript(s)) return s;
  }
  return null;
}

/**
 * اتجاه كتابة اللغة: rtl أو ltr، أو null إن لم يُعرف نصها.
 * @param {unknown} code
 * @returns {'rtl' | 'ltr' | null}
 */
export function langDirection(code) {
  const s = langScript(code);
  if (!s) return null;
  return RTL_SCRIPTS.has(s) ? 'rtl' : 'ltr';
}

/**
 * اتجاه سطر نص: من لغته إن عُرفت، وإلا RTL إن احتوى أي حرف من نص يُكتب من اليمين ولو بدأ بكلمة لاتينية («API هو الواجهة»)،
 * وإلا LTR. القاعدة الثانية هي قاعدة الإصدار الأول للعربية (تدقيق 5fedcb9، CL-002) معمّمة على العبرية والفارسية وغيرهما.
 * @param {unknown} text @param {unknown} [lang]
 * @returns {'rtl' | 'ltr'}
 */
export function textDirection(text, lang = null) {
  const byLang = lang ? langDirection(lang) : null;
  if (byLang) return byLang;
  return RTL_LETTER.test(String(text ?? '')) ? 'rtl' : 'ltr';
}

/** هل في النص حرف من نص يُكتب من اليمين. @param {unknown} text */
export const hasRtlLetter = (text) => RTL_LETTER.test(String(text ?? ''));

const letterCache = new Map();
/**
 * نمط «حرف من نص هذه اللغة»، أو null إن لم يُعرف نصها. اليابانية تقبل الهيراغانا والكاتاكانا والكانجي، والكورية الهانغل
 * والهانجا، والصينية الهان.
 * @param {unknown} code
 * @returns {RegExp | null}
 */
export function scriptLetterPattern(code) {
  const s = langScript(code);
  if (!s) return null;
  if (letterCache.has(s)) return letterCache.get(s);
  const parts = COMPOSITE_SCRIPTS[s] ?? [s];
  const re = safe(() => new RegExp(`(?=[${parts.map((p) => `\\p{Script=${p}}`).join('')}])\\p{L}`, 'u'), null);
  letterCache.set(s, re);
  return re;
}

const nameCache = new Map();
/** @param {string} locale @param {'none' | 'code'} fallback */
function displayNames(locale, fallback) {
  const k = `${locale}|${fallback}`;
  if (nameCache.has(k)) return nameCache.get(k);
  const dn = safe(() => new Intl.DisplayNames([locale], { type: 'language', fallback }), null);
  nameCache.set(k, dn);
  return dn;
}

/**
 * اسم اللغة بالعربية («الإنجليزية»، «الإنجليزية (المملكة المتحدة)» إن طُلبت اللهجة)، أو null إن لم يعرفه المتصفح. لا يعيد
 * اسمًا فيه شظية لاتينية (en-orig ← اللغة الأساسية).
 * @param {unknown} code @param {{ region?: boolean }} [o]
 * @returns {string | null}
 */
export function arabicName(code, { region = true } = {}) {
  const n = normalizeLang(code);
  if (!n) return null;
  const dn = displayNames('ar', 'none');
  if (!dn) return null;
  const base = n.split('-')[0];
  const tries = region && n !== base ? [n, base] : [base, n];
  for (const c of tries) {
    const name = safe(() => dn.of(c), null);
    if (name && name.toLowerCase() !== c.toLowerCase() && !/[A-Za-z]/.test(name)) return name;
  }
  return null;
}

/**
 * اسم اللغة بلغتها نفسها («English»، «日本語»، «עברית»)، أو null إن لم يعرفه المتصفح.
 * @param {unknown} code
 * @returns {string | null}
 */
export function nativeName(code) {
  const n = normalizeLang(code);
  if (!n) return null;
  for (const c of [n, n.split('-')[0]]) {
    const dn = displayNames(c, 'none');
    const name = dn ? safe(() => dn.of(c), null) : null;
    if (name && name.toLowerCase() !== c.toLowerCase()) return name;
  }
  return null;
}

/**
 * وصف اللغة للواجهة: الاسم العربي، والأصلي، والرمز، والاتجاه. الاسم العربي إن غاب يحل محله الرمز.
 * @param {unknown} code
 * @returns {{ code: string, arabic: string, native: string | null, dir: 'rtl' | 'ltr' | null, known: boolean } | null}
 */
export function describeLang(code) {
  const n = normalizeLang(code);
  if (!n) return null;
  const arabic = arabicName(n);
  return { code: n, arabic: arabic ?? n, native: nativeName(n), dir: langDirection(n), known: arabic !== null };
}

/**
 * رمز لغة من اسم ملف ترجمة إن جاء صريحًا قبل الامتداد مباشرة (talk.ja.srt ← ja، وtalk.pt-BR.srt ← pt-BR)، وإلا null. لا يُقبل
 * إلا رمز يعرف المتصفح اسمه، فلا يُقرأ «normal» أو «long» أو كلمة من الاسم لغةً.
 * @param {unknown} fileName
 * @returns {string | null}
 */
export function langFromFileName(fileName) {
  if (typeof fileName !== 'string') return null;
  const m = /\.([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)\.srt$/i.exec(fileName.trim());
  if (!m) return null;
  const code = normalizeLang(m[1]);
  return code && arabicName(code) ? code : null;
}
