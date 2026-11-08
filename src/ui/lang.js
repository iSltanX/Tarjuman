// اسم لغة الأصل بالعربية من رمز مساره الفعلي (لا اسم لغة مكتوب بالشيفرة: الأصل ما التقطه المشغّل لا ما نفترضه)، بأسماء
// Intl.DisplayNames. دالة واحدة للوحة النص المتزامن وأدوات الشريط (مراجعة الهوية L1): تطبّع «_» إلى «-»، ولا تعيد «root»
// ولا اسمًا لرمز غير محدد (und)، ولا اسمًا فيه شظية لاتينية (en-orig ← «الإنجليزية (Orig)» يُستبدل باللغة الأساسية).
// ما لا يعرفه المتصفح يبقى رمزه، وبلا رمز null. لا ترمي أبدًا.

import { getLocale, t } from '../i18n/index.js';

const UNDEFINED_LANG = /^(und|root|mul|zxx|mis)$/i;
const cache = new WeakMap();

/** @param {typeof Intl.DisplayNames} DisplayNames @param {string} locale */
function namesOf(DisplayNames, locale) {
  let byLocale = cache.get(DisplayNames);
  if (!byLocale) cache.set(DisplayNames, (byLocale = new Map()));
  if (byLocale.has(locale)) return byLocale.get(locale);
  let names = null;
  try {
    names = new DisplayNames([locale], { type: 'language' });
  } catch {
    names = null;
  }
  byLocale.set(locale, names);
  return names;
}

/** اسم لا يحمل شظية من الرمز: بالعربية بلا حرف لاتيني، وبالإنجليزية بلا مقطع الرمز نفسه (en-orig ← «English (Orig)» يُستبدل). */
function cleanName(name, code, locale) {
  if (!name || name.toLowerCase() === code.toLowerCase() || name === 'root') return false;
  if (locale === 'ar') return !/[A-Za-z]/.test(name);
  const tail = code.split('-').slice(1);
  return !tail.some((p) => /[A-Za-z]/.test(p) && p.length > 3 && name.toLowerCase().includes(p.toLowerCase()));
}

/**
 * @param {string | null | undefined} code رمز المسار (en، en-GB، en_US، en-orig…)
 * @param {{ region?: boolean, DisplayNames?: typeof Intl.DisplayNames | null }} [o] region: الاسم بلهجته («الإنجليزية
 *   (المملكة المتحدة)») أولًا، وإلا اللغة الأساسية وحدها؛ DisplayNames للاختبار
 * @returns {string | null}
 */
export function languageName(code, { region = true, DisplayNames = globalThis.Intl?.DisplayNames } = {}) {
  const raw = String(code ?? '').trim();
  if (!raw) return null;
  const norm = raw.replace(/_/g, '-');
  const base = norm.split('-')[0];
  if (UNDEFINED_LANG.test(base)) return null;
  const locale = getLocale();
  const names = typeof DisplayNames === 'function' ? namesOf(DisplayNames, locale) : null;
  if (!names) return raw;
  const tries = region && norm !== base ? [norm, base] : [base, norm];
  for (const c of tries) {
    let n = null;
    try {
      n = names.of(c);
    } catch {
      // رمز غير صالح عند هذا المتصفح: التالي.
    }
    if (cleanName(n, c, locale)) return n;
  }
  return raw;
}

/** اسم لغة بلغة الواجهة من رمز للعرض: المعروف باسمه، والمجهول برمزه، وبلا رمز null. @param {string | null | undefined} code */
const nameOf = (code) => (code ? languageName(code, { region: true }) : null);

/**
 * الزوج اللغوي في سطر (AA3، لوحة 19 البند ٢): «الإنجليزية ← العربية»، أو «الإنجليزية ← لغة غير محددة» لترجمة حُفظت بلا لغة، أو لغة
 * الأصل وحدها لفيديو بلا ترجمة؛ وبلا أصل ولا ترجمة null. السهم في اتجاه القراءة من اليمين: من الأصل إلى الترجمة.
 * @param {{ from?: string | null, to?: string | null, translated?: boolean }} p translated: للفيديو ترجمة (فغياب «إلى» «غير محددة»)
 * @returns {string | null}
 */
export function pairLabel({ from = null, to = null, translated = false } = {}) {
  const f = nameOf(from);
  const target = nameOf(to) ?? (translated ? t('common.languageUnknown') : null);
  if (f && target) return t('common.pair', { from: f, to: target });
  return f ?? (target ? t('common.pairNoFrom', { to: target }) : null);
}
