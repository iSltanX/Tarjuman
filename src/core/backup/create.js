// إنشاء النسخة الاحتياطية (عقد backup.md §٦ «الإنشاء»): listLibrary ثم getBundle لكل فيديو، وbundleToBackup، والبصمة.
// على دفعات باستراحة للصفحة وتقدم ظاهر؛ والفيديو الذي تعذّرت قراءته (سجل تالف أو حُذف في الأثناء) يُبلَّغ برمزه ولا يوقف
// الباقي. النص يُبنى بلصق data المسلسلة مرة واحدة بعد الترويسة، فلا يُسلسل محتوى المكتبة مرتين.
import { toErrorInfo } from '../errors/index.js';
import { bundleToBackup } from '../model/bundle.js';
import { STORAGE_SCHEMA } from '../store/migrate.js';
import { BACKUP_FORMAT, BACKUP_LIMITS, BACKUP_VERSION, HASH_ALGORITHM, backupFileName, countData, sha256Hex } from './format.js';

/** استراحة للصفحة بين الدفعات فلا تتجمد (والاختبارات تحقن غيرها). */
export const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

const byCreated = (a, b) => (a.record.createdAt < b.record.createdAt ? -1 : a.record.createdAt > b.record.createdAt ? 1
  : a.record.videoId < b.record.videoId ? -1 : a.record.videoId > b.record.videoId ? 1 : 0);

/**
 * @param {{
 *   store: ReturnType<typeof import('../store/index.js').createStore>,
 *   appVersion: string, includePrevious?: boolean, now?: () => number,
 *   onProgress?: (p: { done: number, total: number }) => void, pause?: () => Promise<void>, batch?: number,
 * }} o
 * @returns {Promise<{ name: string, text: string, counts: ReturnType<typeof countData>, skipped: { videoId: string, code: string }[] }>}
 *   skipped: فيديوهات لم تُضمَّن وسببها برمزها (لا نص).
 */
export async function createBackup({ store, appVersion, includePrevious = true, now = Date.now, onProgress = () => {}, pause = yieldToPage, batch = BACKUP_LIMITS.batch }) {
  const createdAt = new Date(now()).toISOString();
  const [settings, prefs, library] = await Promise.all([store.getSettings(), store.getPrefs(), store.listLibrary()]);
  const ids = library.map((item) => item.entry.videoId);
  const videos = [];
  // سجل بمفتاح لا يُقرأ ولا مُلخّص له لا يظهر في المحفوظات، فيُذكر «تعذّر» بدل أن يغيب عن التقرير (تدقيق 5fedcb9، CX-H4).
  const listed = new Set(ids);
  const unreadable = typeof store.unreadableVideos === 'function' ? await store.unreadableVideos() : [];
  const skipped = unreadable.filter((id) => !listed.has(id)).map((videoId) => ({ videoId, code: 'ST_CORRUPT_RECORD' }));
  onProgress({ done: 0, total: ids.length });
  for (const [i, id] of ids.entries()) {
    try {
      const bundle = await store.getBundle(id);
      if (bundle) videos.push(bundleToBackup(bundle, { includePrevious }));
      else skipped.push({ videoId: id, code: 'PG_VIDEO_GONE' });
    } catch (err) {
      skipped.push({ videoId: id, code: toErrorInfo(err).code });
    }
    if ((i + 1) % batch === 0 || i + 1 === ids.length) {
      onProgress({ done: i + 1, total: ids.length });
      await pause();
    }
  }
  videos.sort(byCreated);
  const data = { settings, prefs, videos };
  const dataJson = JSON.stringify(data);
  const header = {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt,
    app: { version: String(appVersion), storageSchema: STORAGE_SCHEMA },
    options: { previous: includePrevious },
    counts: countData(data),
    integrity: { algorithm: HASH_ALGORITHM, hash: await sha256Hex(dataJson) },
  };
  const head = JSON.stringify(header);
  return { name: backupFileName(createdAt), text: `${head.slice(0, -1)},"data":${dataJson}}`, counts: header.counts, skipped };
}
