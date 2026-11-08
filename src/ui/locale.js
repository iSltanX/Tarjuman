// تهيئة لغة الواجهة في كل سياق وتتبّعها: القيمة المحفوظة مصدر الحقيقة، وغيابها يذهب إلى الكاتب الواحد فيحسم بين الواجهات المفتوحة معًا،
// وتعذّر التخزين لا يوقف الواجهة بل تُستعمل نتيجة السياسة نفسها في هذه الجلسة.
import { getLocale, localeDir, setLocale } from '../i18n/index.js';
import { resolveInitialLocale } from '../i18n/locale.js';
import { normalizeUiLocale } from '../core/model/ui-locale.js';

/**
 * لغة واجهة المتصفح. chrome.i18n لها وحدها هنا: لقراءة الإشارة لا لنصوص الواجهة.
 * @param {typeof chrome} [api] @param {Navigator} [nav]
 * @returns {string | null}
 */
export function browserLanguage(api = globalThis.chrome, nav = globalThis.navigator) {
  try {
    const ui = api?.i18n?.getUILanguage?.();
    if (ui) return ui;
  } catch {
    // السياق أُغلق: يبقى navigator.
  }
  return nav?.language ?? null;
}

/**
 * يحدد لغة هذا السياق. لا يرمي أبدًا.
 * @param {{
 *   store: { getUiLocale: () => Promise<unknown>, initUiLocale: (s: { youtube: unknown, browser: unknown }) => Promise<unknown> },
 *   youtube?: unknown | (() => unknown | Promise<unknown>), browser?: unknown
 * }} o youtube: الإشارة أو دالة تقرؤها، ولا تُستدعى ما دام للمستخدم اختيار محفوظ
 * @returns {Promise<'ar' | 'en'>}
 */
export async function bootLocale({ store, youtube = null, browser = browserLanguage() }) {
  let saved = null;
  try {
    saved = normalizeUiLocale(await store.getUiLocale());
  } catch {
    saved = null;
  }
  if (saved) {
    setLocale(saved.locale);
    return saved.locale;
  }
  let signal = null;
  try {
    signal = typeof youtube === 'function' ? await youtube() : youtube;
  } catch {
    signal = null;
  }
  let locale;
  try {
    locale = normalizeUiLocale(await store.initUiLocale({ youtube: signal, browser }))?.locale;
  } catch {
    locale = undefined;
  }
  locale ??= resolveInitialLocale({ youtube: signal, browser }).locale;
  setLocale(locale);
  return locale;
}

/**
 * يتبع تغيّر لغة الواجهة من أي سياق. لا يُبلَّغ إلا بتغيّر فعلي عن لغة هذا السياق، والقيمة الممسوحة لا تغيّر شيئًا.
 * @param {{ onChange: (fn: (c: { uiLocale?: { newValue: unknown } | null }) => void) => () => void }} store
 * @param {(locale: 'ar' | 'en') => void} onChange
 * @returns {() => void}
 */
export function watchLocale(store, onChange) {
  return store.onChange((change) => {
    if (!change.uiLocale) return;
    const next = normalizeUiLocale(change.uiLocale.newValue)?.locale;
    if (!next || next === getLocale()) return;
    setLocale(next);
    onChange(next);
  });
}

/** يضبط lang وdir على عنصر الجذر للصفحة. @param {Document} doc */
export function applyDocumentLocale(doc) {
  const root = doc.documentElement;
  if (!root) return;
  root.setAttribute('lang', getLocale());
  root.setAttribute('dir', localeDir(getLocale()));
}
