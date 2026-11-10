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
  // وسم قديم مركب يُطوى في الشكل القياسي إلى مقاطع أقل (zh-hakka ← hak، art-lojban ← jbo): يُعاد القياسي كله، فلا تُمسخ اللغة
  // إلى أساسها العام zh أو art (AV2 U-005). والرمز القديم المفرد (iw) مقاطعه متساوية فيبقى كما ورد.
  if (canon.split('-').length < dashed.split('-').length) return canon;
  return [first, ...rest].join('-');
}

/** اللغة الأساسية من الرمز (en من en-GB)، أو null. @param {unknown} code */
export function baseLang(code) {
  const n = normalizeLang(code);
  return n ? n.split('-')[0] : null;
}

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
 * اسم اللغة بلغة الواجهة: العربية بقواعد arabicName، والإنجليزية من CLDR بلا شظية من الرمز (en-orig ← English).
 * @param {unknown} code @param {{ locale?: 'ar' | 'en', region?: boolean }} [o]
 * @returns {string | null}
 */
export function localizedName(code, { locale = 'ar', region = true } = {}) {
  if (locale === 'ar') return arabicName(code, { region });
  const n = normalizeLang(code);
  if (!n) return null;
  const dn = displayNames(locale, 'none');
  if (!dn) return null;
  const parts = n.split('-');
  const tries = region && parts.length > 1 ? [n, parts[0]] : [parts[0], n];
  for (const c of tries) {
    const name = safe(() => dn.of(c), null);
    if (!name || name.toLowerCase() === c.toLowerCase()) continue;
    if (c.split('-').slice(1).some((p) => p.length > 3 && /[A-Za-z]/.test(p) && name.toLowerCase().includes(p.toLowerCase()))) continue;
    return name;
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
 * @param {unknown} code @param {'ar' | 'en'} [locale] لغة الواجهة لحقل name، وarabic يبقى الاسم العربي دائمًا
 * @returns {{ code: string, arabic: string, name: string, native: string | null, dir: 'rtl' | 'ltr' | null, known: boolean } | null}
 */
export function describeLang(code, locale = 'ar') {
  const n = normalizeLang(code);
  if (!n) return null;
  const arabic = arabicName(n);
  return { code: n, arabic: arabic ?? n, name: localizedName(n, { locale }) ?? arabic ?? n, native: nativeName(n), dir: langDirection(n), known: arabic !== null };
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

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const knownCache = new Map();

/**
 * كل اللغات التي يعرف المتصفح اسمها العربي، من رموز ISO 639-1 الثنائية كلها (aa…zz) بلا قائمة مكتوبة: ما لا اسم له في بيانات
 * CLDR عند المتصفح لا يدخل، والرمز القديم الذي له رمز معياري (iw، in، ji…) يُسقط لصالح معياره. مرتبة بالاسم العربي. الرموز
 * الأطول (pt-BR وzh-Hant وfil) تُكتب في البحث أو تأتي من مسارات الفيديو، فلا تُستثنى لغة.
 * @param {'ar' | 'en'} [locale] لغة الواجهة: تحدد حقل name وترتيب القائمة
 * @returns {{ code: string, arabic: string, name: string, native: string | null, dir: 'rtl' | 'ltr' | null }[]}
 */
export function knownLanguages(locale = 'ar') {
  if (knownCache.has(locale)) return knownCache.get(locale);
  const out = [];
  for (const a of LETTERS) {
    for (const b of LETTERS) {
      const code = a + b;
      if (safe(() => Intl.getCanonicalLocales(code)[0], null) !== code) continue;
      const arabic = arabicName(code);
      if (arabic) out.push({ code, arabic, name: localizedName(code, { locale }) ?? arabic, native: nativeName(code), dir: langDirection(code) });
    }
  }
  // الترتيب بالاسم بلا «ال» في أوله، فتتجاور «الإنجليزية» و«إنجليزية» و«دزونكا» بحروفها لا بأداة التعريف.
  const collator = safe(() => new Intl.Collator(locale), null);
  const key = (x) => foldForSearch(x.name);
  out.sort((x, y) => (collator ? collator.compare(key(x), key(y)) : key(x) < key(y) ? -1 : 1));
  const frozen = Object.freeze(out.map((x) => Object.freeze(x)));
  knownCache.set(locale, frozen);
  return frozen;
}

/** نص للمطابقة: بلا تشكيل ولا تطويل، وألفات موحّدة، والتاء المربوطة هاءً، وبلا «ال» في أول كل كلمة، وبحروف صغيرة. */
export function foldForSearch(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ̀-ͯ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/(^|\s)ال/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * اللغات المطابقة لنص بحث في اسمها العربي أو الأصلي أو رمزها، بترتيب القائمة؛ ورمز صالح يعرف المتصفح اسمه ولا يرد فيها
 * (pt-BR، zh-Hant) يتقدّمها. نص فارغ يعيد القائمة كما هي.
 * @param {string} query
 * @param {readonly { code: string, arabic: string, native: string | null }[]} [list]
 * @returns {{ code: string, arabic: string, native: string | null, dir: 'rtl' | 'ltr' | null }[]}
 */
export function searchLanguages(query, list = knownLanguages(), locale = 'ar') {
  const q = foldForSearch(query);
  if (!q) return [...list];
  // الأقرب أولًا: الرمز نفسه، ثم رمز يبدأ بالنص، ثم اسم يبدأ به، ثم اسم يحويه؛ وبالترتيب الأصلي داخل كل درجة.
  const rank = (l) => {
    const code = l.code.toLowerCase();
    const names = [foldForSearch(l.arabic), foldForSearch(l.native), foldForSearch(l.name)];
    if (code === q) return 0;
    if (code.startsWith(q)) return 1;
    if (names.some((n) => n.startsWith(q) || n.split(' ').some((w) => w.startsWith(q)))) return 2;
    if (names.some((n) => n.includes(q))) return 3;
    return -1;
  };
  const hits = list.map((l, i) => ({ l, i, r: rank(l) })).filter((x) => x.r >= 0).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.l);
  // رمز مكتوب بلهجته أو نصه (pt-BR، zh-Hant) يتقدّم النتائج؛ والرمز البديل لرمز في القائمة (deu، iw) لا يكرّرها.
  const typed = normalizeLang(String(query).trim());
  const canon = typed ? safe(() => Intl.getCanonicalLocales(typed)[0], null) : null;
  if (typed && arabicName(typed) && !list.some((l) => l.code === typed || l.code === canon)) {
    const d = describeLang(typed, locale);
    hits.unshift({ code: d.code, arabic: d.arabic, name: d.name, native: d.native, dir: d.dir });
  }
  return hits;
}

/**
 * هل يوافق نص الملف نص كتابة اللغة المقترحة (AA3): أكثر حروف أول المقاطع من نصها. لا يستنتج لغة من النص أبدًا، وإنما يمنع وسم ملف
 * فرنسي بالعربية لأن «إلى» في النافذة عربية فيُعرض بغير اتجاهه. اللغة التي لا يُعرف نصها تُقبل، ونص بلا حروف يُقبل.
 * @param {{ text: string }[]} cues @param {string} lang
 */
export function textFitsLang(cues, lang) {
  const re = scriptLetterPattern(lang);
  if (!re) return true;
  let letters = 0;
  let fit = 0;
  for (const c of cues.slice(0, 200)) {
    for (const ch of String(c?.text ?? '')) {
      if (!/\p{L}/u.test(ch)) continue;
      letters++;
      if (re.test(ch)) fit++;
    }
  }
  return letters === 0 || fit / letters >= 0.5;
}

