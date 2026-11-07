// اسم لغة الأصل بالعربية من رمز مساره الفعلي (لا اسم لغة مكتوب بالشيفرة: الأصل ما التقطه المشغّل لا ما نفترضه)، بأسماء
// Intl.DisplayNames. دالة واحدة للوحة النص المتزامن وأدوات الشريط (مراجعة الهوية L1): تطبّع «_» إلى «-»، ولا تعيد «root»
// ولا اسمًا لرمز غير محدد (und)، ولا اسمًا فيه شظية لاتينية (en-orig ← «الإنجليزية (Orig)» يُستبدل باللغة الأساسية).
// ما لا يعرفه المتصفح يبقى رمزه، وبلا رمز null. لا ترمي أبدًا.

const UNDEFINED_LANG = /^(und|root|mul|zxx|mis)$/i;
const cache = new WeakMap();

/** @param {typeof Intl.DisplayNames} DisplayNames */
function namesOf(DisplayNames) {
  if (cache.has(DisplayNames)) return cache.get(DisplayNames);
  let names = null;
  try {
    names = new DisplayNames(['ar'], { type: 'language' });
  } catch {
    names = null;
  }
  cache.set(DisplayNames, names);
  return names;
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
  const names = typeof DisplayNames === 'function' ? namesOf(DisplayNames) : null;
  if (!names) return raw;
  const tries = region && norm !== base ? [norm, base] : [base, norm];
  for (const c of tries) {
    let n = null;
    try {
      n = names.of(c);
    } catch {
      // رمز غير صالح عند هذا المتصفح: التالي.
    }
    if (n && n.toLowerCase() !== c.toLowerCase() && n !== 'root' && !/[A-Za-z]/.test(n)) return n;
  }
  return raw;
}

/** اسم لغة بالعربية من رمز للعرض: المعروف باسمه، والمجهول برمزه، وبلا رمز null. @param {string | null | undefined} code */
const nameOf = (code) => (code ? languageName(code, { region: true }) : null);

/**
 * الزوج اللغوي في سطر (AA3، لوحة 19 البند ٢): «الإنجليزية ← العربية»، أو «الإنجليزية ← لغة غير محددة» لترجمة حُفظت بلا لغة، أو لغة
 * الأصل وحدها لفيديو بلا ترجمة؛ وبلا أصل ولا ترجمة null. السهم في اتجاه القراءة من اليمين: من الأصل إلى الترجمة.
 * @param {{ from?: string | null, to?: string | null, translated?: boolean }} p translated: للفيديو ترجمة (فغياب «إلى» «غير محددة»)
 * @returns {string | null}
 */
export function pairLabel({ from = null, to = null, translated = false } = {}) {
  const f = nameOf(from);
  const t = nameOf(to) ?? (translated ? 'لغة غير محددة' : null);
  if (f && t) return `${f} ← ${t}`;
  return f ?? (t ? `؟ ← ${t}` : null);
}
