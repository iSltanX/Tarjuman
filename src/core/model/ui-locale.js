// إعداد لغة الواجهة (عقد storage §١٤). مفتاح مستقل عن settings وprefs وlangPrefs، وعن كل لغات الفيديو والترجمة: يخص نصوص المنتج
// واتجاهها وحدها. لا يدخل النسخة الاحتياطية (للجهاز لا للبيانات)، ويبقى بعد «مسح كل البيانات» كما يبقى إطفاء الصور.
import { LOCALE_SOURCES, isLocale } from '../../i18n/locale.js';
import { OK, exactKeys, fail, firstFailure, isIsoDate, isPlainObject } from './validate.js';

export const UI_LOCALE_SCHEMA = 1;

/** @typedef {{ schema: 1, locale: 'ar' | 'en', source: 'user' | 'youtube' | 'browser' | 'default', at: string }} UiLocale */

/** @param {unknown} v */
export function validateUiLocale(v) {
  return firstFailure([
    () => exactKeys(v, ['schema', 'locale', 'source', 'at'], 'uiLocale'),
    () => (v.schema === UI_LOCALE_SCHEMA ? OK : fail('uiLocale.schema', 'إصدار غير معروف')),
    () => (isLocale(v.locale) ? OK : fail('uiLocale.locale', 'لغة غير مدعومة')),
    () => (LOCALE_SOURCES.includes(v.source) ? OK : fail('uiLocale.source', 'مصدر غير معروف')),
    () => (isIsoDate(v.at) ? OK : fail('uiLocale.at', 'تاريخ غير صالح')),
  ]);
}

/**
 * القراءة المتسامحة: القيمة الصالحة كاملة، وما عداها null فتُعاد التهيئة. لغة صالحة في قيمة ناقصة تبقى، فلا يضيع اختيار المستخدم.
 * @param {unknown} raw
 * @returns {UiLocale | null}
 */
export function normalizeUiLocale(raw) {
  if (validateUiLocale(raw).ok) return /** @type {UiLocale} */ (raw);
  if (!isPlainObject(raw) || !isLocale(raw.locale)) return null;
  return {
    schema: UI_LOCALE_SCHEMA, locale: raw.locale,
    source: LOCALE_SOURCES.includes(raw.source) ? raw.source : 'user',
    at: isIsoDate(raw.at) ? raw.at : new Date(0).toISOString(),
  };
}
