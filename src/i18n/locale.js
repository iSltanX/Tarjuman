// سياسة لغة الواجهة (بلا DOM ولا فهارس ولا تخزين): تطبيع الرموز، واختيار اللغة في التهيئة الأولى، والاتجاه. يستعملها الكاتب الواحد
// في العامل الخلفي وكل واجهة، فتنتهي كلها إلى النتيجة نفسها.
//
// ترتيب المصادر عند غياب اختيار محفوظ: لغة واجهة يوتيوب إن قُرئت (html[lang] في صفحة يوتيوب، وهي لغة واجهته الفعلية لا لغة
// الفيديو)، ثم لغة واجهة المتصفح. أول مصدر مقروء هو الحَكَم: العربية بأي منطقة عربية، والإنجليزية بأي منطقة إنجليزية، وأي لغة
// أخرى أو غياب المصدرين يعود إلى DEFAULT_LOCALE.

export const LOCALES = Object.freeze(['ar', 'en']);
/** لغة الفهرس المرجعية: نصوصها هي المعتمدة، والإنجليزية ترجمة عنها. وهي لغة الوحدة قبل التهيئة (الاختبارات). */
export const REFERENCE_LOCALE = 'ar';
/**
 * الافتراضية عند لغة ثالثة أو تعذّر القراءة: الإنجليزية، لأن من لا يقرأ واجهته بالعربية يفهم الإنجليزية في الغالب أكثر من العكس،
 * وهي لغة واجهات البرمجيات المشتركة. وهي لغة الاسترجاع عند نقص ترجمة.
 */
export const DEFAULT_LOCALE = 'en';
export const LOCALE_SOURCES = Object.freeze(['user', 'youtube', 'browser', 'default']);

const TAG = /^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*$/;

/**
 * اللغة الأساسية لرمز إقليمي بحروف صغيرة: ar-SA ← ar وen_US ← en وpt-BR ← pt، وnull لما ليس رمزًا.
 * @param {unknown} tag
 * @returns {string | null}
 */
export function baseLanguage(tag) {
  if (typeof tag !== 'string') return null;
  const s = tag.trim();
  if (!s || s.length > 35 || !TAG.test(s)) return null;
  return s.split(/[-_]/)[0].toLowerCase();
}

/**
 * لغة واجهة مدعومة من رمز أيًّا كانت منطقته، أو null.
 * @param {unknown} tag
 * @returns {'ar' | 'en' | null}
 */
export function supportedLocale(tag) {
  const base = baseLanguage(tag);
  return base !== null && LOCALES.includes(base) ? /** @type {'ar' | 'en'} */ (base) : null;
}

/** @param {unknown} v @returns {v is 'ar' | 'en'} */
export const isLocale = (v) => typeof v === 'string' && LOCALES.includes(v);

/** @param {string} locale @returns {'rtl' | 'ltr'} */
export const localeDir = (locale) => (locale === 'ar' ? 'rtl' : 'ltr');

/**
 * اختيار التهيئة الأولى. أول مصدر مقروء يحسم، ولا يُنظر فيما بعده؛ فلغة يوتيوب الفرنسية مع متصفح عربي تعود إلى الافتراضية.
 * @param {{ youtube?: unknown, browser?: unknown }} [signals]
 * @returns {{ locale: 'ar' | 'en', source: 'youtube' | 'browser' | 'default' }}
 */
export function resolveInitialLocale({ youtube = null, browser = null } = {}) {
  const pick = baseLanguage(youtube) !== null ? ['youtube', youtube] : baseLanguage(browser) !== null ? ['browser', browser] : null;
  const locale = pick ? supportedLocale(pick[1]) : null;
  if (!pick || !locale) return { locale: /** @type {'en'} */ (DEFAULT_LOCALE), source: 'default' };
  return { locale, source: /** @type {'youtube' | 'browser'} */ (pick[0]) };
}
