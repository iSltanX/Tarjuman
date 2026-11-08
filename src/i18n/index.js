// نظام التوطين الموحّد: فهرس واحد بمفاتيح دلالية للعربية والإنجليزية (src/i18n/ar وsrc/i18n/en)، ولغة حالية واحدة في كل سياق. لا يعتمد
// chrome.i18n لأنه يتبع لغة المتصفح وحدها ولا يقبل اختيارًا من داخل الإضافة.
//
// قيم الفهرس: نص بقوالب {name}، أو دالة (params) ← نص لما تختلف فيه الصياغة بين اللغتين، أو كائن صيغ جمع (له one).
// الاسترجاع عند نقص مفتاح: اللغة الحالية، ثم الإنجليزية، ثم عبارة عامة باللغة الحالية؛ ولا يظهر مفتاح خام أبدًا.
import { CATALOG } from './catalog.js';
import { DEFAULT_LOCALE, LOCALES, REFERENCE_LOCALE, isLocale, localeDir } from './locale.js';

export { DEFAULT_LOCALE, LOCALES, REFERENCE_LOCALE, isLocale, localeDir };

/** عبارة النقص الأخيرة: خارج الفهرس عمدًا، فلا تنقص هي نفسها. */
const UNAVAILABLE = Object.freeze({ ar: 'نص غير متاح', en: 'Text unavailable' });

const isForms = (v) => typeof v === 'object' && v !== null && typeof v.one === 'string';

/** يسطّح فهرسًا متداخلًا إلى خريطة مفاتيح منقّطة، وكائن صيغ الجمع ورقة. */
function flatten(node, prefix, out) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !isForms(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

const TABLES = Object.freeze(Object.fromEntries(LOCALES.map((l) => [l, flatten(CATALOG[l], '', new Map())])));

let current = /** @type {'ar' | 'en'} */ (REFERENCE_LOCALE);
const listeners = new Set();
const missing = new Set();

/** اللغة الحالية لهذا السياق. */
export const getLocale = () => current;
/** @returns {'rtl' | 'ltr'} */
export const getDir = () => localeDir(current);

/**
 * يغيّر لغة هذا السياق ويبلّغ المستمعين إن تغيّرت. لا يكتب في التخزين.
 * @param {'ar' | 'en'} locale
 */
export function setLocale(locale) {
  if (!isLocale(locale) || locale === current) return;
  current = locale;
  for (const fn of [...listeners]) fn(current);
}

/** @param {(locale: 'ar' | 'en') => void} fn @returns {() => void} */
export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function lookup(key) {
  const table = TABLES[current];
  if (table.has(key)) return table.get(key);
  missing.add(`${current}:${key}`);
  const fallback = TABLES[DEFAULT_LOCALE];
  return fallback.has(key) ? fallback.get(key) : undefined;
}

const fill = (text, params) => text.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(params, k) ? String(params[k]) : m));

function render(v, params) {
  if (v === undefined) return UNAVAILABLE[current];
  if (typeof v === 'function') return v(params ?? {});
  if (typeof v !== 'string' || !params) return v;
  return fill(v, params);
}

/**
 * نص المفتاح باللغة الحالية.
 * @param {string} key
 * @param {Record<string, unknown>} [params] قوالب {name} أو معاملات الدالة
 * @returns {any} نص، أو كائن صيغ الجمع لمفتاح صيغ
 */
export const t = (key, params) => render(lookup(key), params);

/** هل المفتاح في فهرس اللغة الحالية. @param {string} key */
export const hasKey = (key) => TABLES[current].has(key);

/**
 * وجه ديناميكي لقسم من الفهرس: LABELS.download يقرأ «قسم.download» باللغة الحالية عند كل قراءة، فلا تُجمَّد لغة عند تحميل الوحدة.
 * القيم النصية بقوالب تُعاد دالةً إن كانت دالة في الفهرس، وإلا نصًا خامًا.
 * @param {string} section
 * @returns {Record<string, any>}
 */
export function texts(section) {
  const prefix = `${section}.`;
  const keys = () => [...TABLES[current].keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('.')).map((k) => k.slice(prefix.length));
  return new Proxy(Object.freeze({}), {
    get: (_, k) => (typeof k === 'string' ? lookup(prefix + k) ?? UNAVAILABLE[current] : undefined),
    has: (_, k) => typeof k === 'string' && TABLES[current].has(prefix + k),
    ownKeys: () => keys(),
    getOwnPropertyDescriptor: (_, k) => (typeof k === 'string' && TABLES[current].has(prefix + k)
      ? { enumerable: true, configurable: true, value: lookup(prefix + k) }
      : undefined),
  });
}

/** نص يُحسب عند كل عرض: لعناصر تُبنى مرة ويبقى لها أن تتبع تبديل اللغة في مكانها (المحرّر). */
export class LazyText {
  /** @param {string} key @param {Record<string, unknown> | (() => Record<string, unknown>)} [params] */
  constructor(key, params) {
    this.key = key;
    this.params = params;
  }

  toString() {
    return t(this.key, typeof this.params === 'function' ? this.params() : this.params);
  }
}

/** @param {string} key @param {Record<string, unknown> | (() => Record<string, unknown>)} [params] */
export const lt = (key, params) => new LazyText(key, params);

/** يصل عناصر قائمة بفاصل اللغة الحالية («، » أو «, »). @param {readonly unknown[]} items */
export const joinList = (items) => items.join(t('common.listSep'));

/** المفاتيح الناقصة منذ بدء السياق (رموز لا نصوص)، للتشخيص والاختبارات. */
export const missingKeys = () => [...missing];

/** فهرس لغة مسطّحًا، لفحص التغطية. @param {'ar' | 'en'} locale @returns {ReadonlyMap<string, unknown>} */
export const catalogOf = (locale) => TABLES[locale];
