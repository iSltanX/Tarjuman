// نسخة السجل وبصمة القيم الخام (عقد storage §٣ و§١٢)، مشتركة بين السياقات والكاتب الواحد في العامل الخلفي.
import { companionKeys, indexKey, videoKey } from './keys.js';

/**
 * نسخة السجل للمقارنة: المراجعة وتاريخ آخر حفظ معًا. تقبل سجلًا أو حزمة أو مُلخّص فهرس، و'none' للغائب.
 * @param {{ rev?: unknown, updatedAt?: unknown, record?: object } | null | undefined} r
 */
export function versionOf(r) {
  const rec = r && r.record ? r.record : r;
  return rec ? `${rec.rev}|${rec.updatedAt}` : 'none';
}

/** JSON بمفاتيح مرتبة في كل مستوى (ترتيب المصفوفات كما هو)، فلا يختلف الناتج بترتيب المفاتيح المقروءة. */
export const canonical = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));

/** مفاتيح الفيديو الستة: السجل ومُلخّصه وتوابعه. @param {string} id */
export const printKeys = (id) => [videoKey(id), indexKey(id), ...companionKeys(id)];

/**
 * بصمة القيم الخام لمفاتيح الفيديو الستة كما خُزّنت، ولو لم تجتز المدقق (حذف السجل غير المقروء بتأكيد، U08). FNV-1a
 * مزدوج على JSON المرتب: 16 محرفًا ست عشريًا، يكفي لكشف أي تغيّر بين عرض التأكيد والحذف.
 * @param {Record<string, unknown>} items نتيجة area.get لمفاتيح printKeys @param {string} id
 */
export function rawPrint(items, id) {
  const text = canonical(printKeys(id).map((k) => (items[k] === undefined ? null : items[k])));
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
