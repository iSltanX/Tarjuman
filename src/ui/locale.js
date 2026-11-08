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
 * يتبع تغيّر لغة الواجهة من أي سياق. لا يُبلَّغ إلا بتغيّر فعلي عن لغة هذا السياق، والقيمة الممسوحة لا تغيّر شيئًا. وما وصل والسياق مشغول
 * (held) يُعلَّق كله، ولا تتغير لغة السياق نفسها، فلا يختلط نصان بلغتين في عمل جارٍ؛ وflush يطبّق آخر قيمة حين يفرغ، وoffer يعرض قيمة قُرئت من التخزين.
 * @param {{ onChange: (fn: (c: { uiLocale?: { newValue: unknown } | null }) => void) => () => void }} store
 * @param {(locale: 'ar' | 'en') => void} onChange
 * @param {{ held?: () => boolean }} [o]
 * @returns {(() => void) & { flush: () => void, offer: (locale: 'ar' | 'en') => void, pending: () => 'ar' | 'en' | null }}
 */
export function watchLocale(store, onChange, { held = () => false } = {}) {
  let pending = null;
  const apply = (locale) => {
    if (locale === getLocale()) return;
    setLocale(locale);
    onChange(locale);
  };
  const offer = (locale) => {
    if (held()) {
      pending = locale;
      return;
    }
    pending = null;
    apply(locale);
  };
  const off = store.onChange((change) => {
    if (!change.uiLocale) return;
    const next = normalizeUiLocale(change.uiLocale.newValue)?.locale;
    if (next) offer(next);
  });
  const dispose = () => off();
  dispose.offer = offer;
  dispose.flush = () => {
    if (pending === null || held()) return;
    const next = pending;
    pending = null;
    apply(next);
  };
  dispose.pending = () => pending;
  return dispose;
}

/** يضبط lang وdir على عنصر الجذر للصفحة. @param {Document} doc */
export function applyDocumentLocale(doc) {
  const root = doc.documentElement;
  if (!root) return;
  root.setAttribute('lang', getLocale());
  root.setAttribute('dir', localeDir(getLocale()));
}
