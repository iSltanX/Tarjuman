// ثوابت صيغة النسخة الاحتياطية وأدواتها المشتركة (عقد docs/contracts/backup.md §١–§٤): الترويسة والإصدار والحد، واسم
// الملف بتاريخ UTC بلا عنوان فيديو، وبصمة SHA-256 لبايتات JSON.stringify(data) المضغوط، وأعداد المعاينة من data نفسها.
// لا تخزين ولا DOM هنا.
import { isPlainObject } from '../model/validate.js';

export const BACKUP_FORMAT = 'tarjuman-backup';
export const BACKUP_VERSION = 1;
/** maxBytes حد الملف (يُرفض ما فوقه قبل قراءته)، وbatch عدد الفيديوهات بين كل استراحة للصفحة. */
export const BACKUP_LIMITS = Object.freeze({ maxBytes: 512 * 1024 * 1024, batch: 25 });
export const HEADER_KEYS = Object.freeze(['format', 'version', 'createdAt', 'app', 'options', 'counts', 'integrity', 'data']);
export const COUNT_KEYS = Object.freeze(['videos', 'translations', 'previous', 'marks', 'settings', 'prefs']);
export const HASH_ALGORITHM = 'SHA-256';

/** tarjuman-backup-YYYY-MM-DD.json بتاريخ الإنشاء (UTC). @param {string} iso */
export const backupFileName = (iso) => `tarjuman-backup-${String(iso).slice(0, 10)}.json`;

/**
 * SHA-256 لبايتات UTF-8 من النص، ستة عشري بأحرف صغيرة.
 * @param {string} text @param {SubtleCrypto} [subtle]
 */
export async function sha256Hex(text, subtle = globalThis.crypto.subtle) {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const list = (x) => (Array.isArray(x) ? x : []);

/**
 * أعداد مدخل فيديو: الترجمات الممتلئة (النشطة في السجل والأخريات)، والعلامات في الخانات كلها، والسابقة.
 * دفاعية: تُحسب على ما قُرئ قبل التحقق من شكله، فلا ترمي.
 * @param {unknown} entry
 */
export function entryCounts(entry) {
  if (!isPlainObject(entry)) return { translations: 0, marks: 0, previous: false };
  const active = isPlainObject(entry.record) && entry.record.arabic !== null && entry.record.arabic !== undefined ? 1 : 0;
  const alts = list(entry.alts).filter((a) => a !== null && a !== undefined).length;
  const marks = list(entry.marks).reduce((s, m) => s + (isPlainObject(m) ? list(m.marks).length : 0), 0);
  return { translations: active + alts, marks, previous: entry.previous !== null && entry.previous !== undefined };
}

/**
 * counts الترويسة من data (backup.md §٢ و§٤).
 * @param {{ settings: unknown, prefs: unknown, videos: unknown }} data
 */
export function countData(data) {
  const videos = list(data?.videos);
  const out = { videos: videos.length, translations: 0, previous: 0, marks: 0, settings: data?.settings !== null, prefs: data?.prefs !== null };
  for (const v of videos) {
    const c = entryCounts(v);
    out.translations += c.translations;
    out.marks += c.marks;
    if (c.previous) out.previous += 1;
  }
  return out;
}
