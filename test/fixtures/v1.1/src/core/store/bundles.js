// قراءة الحزمة وكتابتها على مفاتيح التخزين (عقد storage §٧–§٩): قراءة واحدة لمفاتيح الفيديو الخمسة، وتحقق صارم من كل
// قيمة، ثم فك ومصالحة (unpackBundle)؛ والكتابة set واحدة فيها السجل ومُلخّصه والرأس والتوابع المتغيرة وحدها. لا حذف
// داخل كتابة عادية (remove منفصلة لا تكون ذرية مع set)، فالتابع المُفرَّغ يُكتب بقيمته الفارغة.
import { TjError } from '../errors/index.js';
import { COMPANION_VALIDATORS, isEmptyCompanion, isTrivialBundle, packBundle } from '../model/bundle.js';
import { summarizeVideo, validateVideoRecord } from '../model/video.js';
import { altsKey, bundleKey, indexKey, marksKey, prevKey, videoKey } from './keys.js';
import { canonical } from './version.js';

/** @typedef {{ record: object | null, head: object | null, alts: object | null, prev: object | null, marks: object | null }} RawBundle */

const KEY_OF = { head: bundleKey, alts: altsKey, prev: prevKey, marks: marksKey };
const COMPANIONS = ['alts', 'prev', 'marks'];

/** مفاتيح قراءة الحزمة. @param {string} id */
export const bundleReadKeys = (id) => [videoKey(id), bundleKey(id), altsKey(id), prevKey(id), marksKey(id)];

/**
 * @param {Record<string, unknown>} items نتيجة area.get
 * @param {string} id
 * @returns {RawBundle}
 */
export function rawBundle(items, id) {
  const get = (k) => (items[k] === undefined ? null : items[k]);
  return { record: get(videoKey(id)), head: get(bundleKey(id)), alts: get(altsKey(id)), prev: get(prevKey(id)), marks: get(marksKey(id)) };
}

/**
 * تحقق صارم من القيم المقروءة؛ التالف ST_CORRUPT_RECORD (لا يُحذف تلقائيًا، ويصلح له deleteVideo).
 * @param {RawBundle} raw @param {string} id
 */
export function checkRaw(raw, id) {
  if (raw.record !== null) {
    const r = validateVideoRecord(raw.record);
    if (!r.ok) throw new TjError('ST_CORRUPT_RECORD', { detail: `${id}: ${r.path} — ${r.reason}` });
  }
  for (const kind of ['head', ...COMPANIONS]) {
    const v = raw[kind];
    if (v === null) continue;
    const r = COMPANION_VALIDATORS[kind](v);
    if (!r.ok || v.videoId !== id) throw new TjError('ST_CORRUPT_RECORD', { detail: `${id} (${kind}): ${r.ok ? 'معرّف فيديو آخر' : `${r.path} — ${r.reason}`}` });
  }
  const { head, alts } = raw;
  if (head && alts && head.active !== null && alts.slots[head.active - 1] !== null) {
    throw new TjError('ST_CORRUPT_RECORD', { detail: `${id} (alts): خانة النشطة خارج السجل` });
  }
  return raw;
}

/**
 * عناصر set واحدة لكتابة حزمة (بعد ضبط rev والتواريخ في سجلها).
 * @param {import('../model/slots.js').Bundle} next @param {RawBundle} raw ما قُرئ قبل الكتابة
 * @param {{ forceHead?: boolean }} [opts]
 */
export function itemsFor(next, raw, { forceHead = false } = {}) {
  const id = next.videoId;
  const p = packBundle(next);
  const items = { [videoKey(id)]: p.record, [indexKey(id)]: summarizeVideo(p.record) };
  if (forceHead || raw.head !== null || !isTrivialBundle(next)) {
    items[bundleKey(id)] = { ...p.head, base: { rev: p.record.rev, createdAt: p.record.createdAt, updatedAt: p.record.updatedAt } };
  }
  for (const kind of COMPANIONS) {
    const value = p[kind];
    const stored = raw[kind];
    // مقارنة بنيوية لا نصية: chrome.storage يعيد مفاتيح الكائنات مرتبة، فكانت كل كتابة تعيد إرسال الترجمات الأخرى والسابقة
    // والعلامات (تدقيق 5fedcb9، GM-010؛ كان قيدًا معروفًا في known-limitations §٤).
    const changed = stored === null ? !isEmptyCompanion(kind, value) : canonical(stored) !== canonical(value);
    if (changed) items[KEY_OF[kind](id)] = value;
  }
  return items;
}


/**
 * إنقاذ ما يصح من حزمة تالفة للنسخة الاحتياطية وحدها (تدقيق 7a66f91، U94، قرار Q29): السجل إن صح، وكل تابع يجتاز مدققه ويتسق
 * معه؛ والتالف يُسقط ويُسمّى. بلا رأس صالح لا تُقرأ التوابع (الرأس يربطها بالسجل)، فتُسمّى مستبعدة هي أيضًا. لا كتابة هنا: الأصل
 * التالف يبقى كما هو في التخزين.
 * @param {RawBundle} raw @param {string} id
 * @returns {{ raw: RawBundle, dropped: ('head' | 'alts' | 'prev' | 'marks')[] } | null} null إن كان السجل نفسه تالفًا أو غائبًا
 */
export function salvageRaw(raw, id) {
  if (raw.record === null || !validateVideoRecord(raw.record).ok || raw.record.videoId !== id) return null;
  const out = { ...raw };
  const dropped = [];
  for (const kind of ['head', ...COMPANIONS]) {
    const v = out[kind];
    if (v === null) continue;
    const r = COMPANION_VALIDATORS[kind](v);
    if (!r.ok || v.videoId !== id) {
      out[kind] = null;
      dropped.push(kind);
    }
  }
  if (out.head && out.alts && out.head.active !== null && out.alts.slots[out.head.active - 1] !== null) {
    out.alts = null;
    dropped.push('alts');
  }
  if (!out.head) {
    for (const kind of COMPANIONS) {
      if (out[kind] === null) continue;
      out[kind] = null;
      dropped.push(kind);
    }
  }
  return { raw: out, dropped };
}

/** هل في القراءة توابع (لسجل محذوف = يتيمة). @param {RawBundle} raw */
export const hasCompanions = (raw) => raw.head !== null || raw.alts !== null || raw.prev !== null || raw.marks !== null;
