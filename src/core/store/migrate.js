// إصدار مخطط التخزين والترحيل (عقد storage §٤). الترحيل خطوة لكل إصدار، يحسب كل القيم الجديدة أولًا
// ثم يكتبها مع رفع meta.schema في عملية set واحدة، فلا يُكتب نصف ترحيل. وهو متكرر بأمان: إن شغّلته
// سياقان معًا (تبويبان وصفحة) كتبا الناتج نفسه.
import { TjError } from '../errors/index.js';
import { KEY_META, parseKey } from './keys.js';

export const STORAGE_SCHEMA = 1;

/**
 * @typedef {{ schema: number, createdAt: string, migratedAt: string | null }} Meta
 * @typedef {(ctx: { items: Record<string, unknown>, now: string }) => Promise<{ set: Record<string, unknown>, remove: string[] }> | { set: Record<string, unknown>, remove: string[] }} MigrationStep
 */

/** @type {Readonly<Record<number, MigrationStep>>} المفتاح هو الإصدار الهدف */
export const MIGRATIONS = Object.freeze({
  // 0 ← 1: بيانات بلا meta. لم تحفظ P1 شيئًا، فلا شكل سابق يُحوَّل؛ تُختم القيم ويتحقق منها التخزين عند القراءة.
  1: () => ({ set: {}, remove: [] }),
});

const isMeta = (m) => !!m && typeof m === 'object' && Number.isInteger(m.schema) && m.schema >= 0;

/**
 * @param {import('./area.js').StorageArea} area
 * @param {{ schema?: number, migrations?: Record<number, MigrationStep>, now: string }} opts
 * @returns {Promise<{ from: number | null, to: number, migrated: boolean }>}
 */
export async function migrate(area, { schema = STORAGE_SCHEMA, migrations = MIGRATIONS, now }) {
  const { [KEY_META]: meta } = await area.get(KEY_META);
  let from;
  if (isMeta(meta)) {
    from = meta.schema;
  } else {
    const keys = await area.getKeys();
    from = keys.some((k) => parseKey(k) && k !== KEY_META) ? 0 : null;
  }
  if (from === null) {
    // ملفوفة كبقية كتابات التخزين (storage §٣، تدقيق 7a66f91 U56): كانت تخرج خامًا فتُعرض «خطأ غير متوقع».
    try {
      await area.set({ [KEY_META]: { schema, createdAt: now, migratedAt: null } });
    } catch (err) {
      if (err instanceof TjError) throw err;
      throw new TjError('ST_WRITE_FAILED', { detail: String(err && err.message), cause: err });
    }
    return { from: null, to: schema, migrated: false };
  }
  if (from > schema) throw new TjError('ST_SCHEMA_NEWER', { detail: `المخزَّن ${from} والمدعوم ${schema}` });
  if (from === schema) return { from, to: schema, migrated: false };
  const createdAt = isMeta(meta) && typeof meta.createdAt === 'string' ? meta.createdAt : now;
  for (let v = from + 1; v <= schema; v++) {
    const step = migrations[v];
    if (!step) throw new TjError('ST_MIGRATION_FAILED', { detail: `لا خطوة ترحيل إلى ${v}` });
    try {
      const items = await area.get(null);
      const { set, remove } = await step({ items, now });
      await area.set({ ...set, [KEY_META]: { schema: v, createdAt, migratedAt: now } });
      if (remove.length) await area.remove(remove);
    } catch (err) {
      if (err instanceof TjError) throw err;
      throw new TjError('ST_MIGRATION_FAILED', { detail: `إلى ${v}: ${err instanceof Error ? err.message : err}`, cause: err });
    }
  }
  return { from, to: schema, migrated: true };
}
