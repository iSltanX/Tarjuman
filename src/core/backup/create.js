// إنشاء النسخة الاحتياطية (عقد backup.md §٦ «الإنشاء»): listLibrary ثم getBundle لكل فيديو، وbundleToBackup، والبصمة.
// على دفعات باستراحة للصفحة وتقدم ظاهر؛ والفيديو الذي تعذّرت قراءته (سجل تالف أو حُذف في الأثناء) يُبلَّغ برمزه ولا يوقف
// الباقي. النص يُبنى بلصق data المسلسلة مرة واحدة بعد الترويسة، فلا يُسلسل محتوى المكتبة مرتين.
import { TjError, toErrorInfo } from '../errors/index.js';
import { t } from '../../i18n/index.js';
import { bundleToBackup } from '../model/bundle.js';
import { DEFAULT_LANG_PREFS, normalizeLangPrefs } from '../model/lang-prefs.js';
import { normalizeGlossaries } from '../model/glossaries.js';
import { utf8Length } from '../model/validate.js';
import { STORAGE_SCHEMA } from '../store/migrate.js';
import { BACKUP_FORMAT, BACKUP_LIMITS, BACKUP_VERSION, BACKUP_VERSION_V1, BACKUP_VERSION_V2, HASH_ALGORITHM, backupFileName, countData, sha256Hex } from './format.js';

/** استراحة للصفحة بين الدفعات فلا تتجمد (والاختبارات تحقن غيرها). */
export const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

const byCreated = (a, b) => (a.record.createdAt < b.record.createdAt ? -1 : a.record.createdAt > b.record.createdAt ? 1
  : a.record.videoId < b.record.videoId ? -1 : a.record.videoId > b.record.videoId ? 1 : 0);

/**
 * @param {{
 *   store: ReturnType<typeof import('../store/index.js').createStore>,
 *   appVersion: string, includePrevious?: boolean, now?: () => number,
 *   onProgress?: (p: { done: number, total: number }) => void, pause?: () => Promise<void>, batch?: number, maxBytes?: number,
 * }} o
 * @returns {Promise<{
 *   name: string, text: string, bytes: number, counts: ReturnType<typeof countData>,
 *   skipped: { videoId: string, code: string }[], partial: { videoId: string, dropped: ('head' | 'alts' | 'prev' | 'marks')[] }[],
 * }>}
 *   skipped: فيديوهات لم تُضمَّن وسببها برمزها (لا نص). partial: فيديوهات تابعٌ لها تالف، ضُمّن سجلها وتوابعها السليمة واستُبعد
 *   التالف وحده (تدقيق 7a66f91، U94، قرار Q29؛ كان الفيديو كله يسقط، والنسخة مسار الانتقال الوحيد إلى نسخة المتجر).
 *   يرمي BK_CREATE_TOO_LARGE إن تجاوز الملف حد القراءة بالبايت (U55، Q28)، ولا يُحفظ شيء.
 */
export async function createBackup({ store, appVersion, includePrevious = true, now = Date.now, onProgress = () => {}, pause = yieldToPage, batch = BACKUP_LIMITS.batch, maxBytes = BACKUP_LIMITS.maxBytes }) {
  const createdAt = new Date(now()).toISOString();
  const [settings, prefs, library, langRaw, glossRaw] = await Promise.all([
    store.getSettings(), store.getPrefs(), store.listLibrary(),
    typeof store.getLangPrefs === 'function' ? store.getLangPrefs().catch(() => null) : null,
    // قوائم المصطلحات لكل زوج (الفكرة ٨): تعذّر قراءتها يرفض الإنشاء كتعذّر قراءة التفضيلات، فلا تُحفظ نسخة تُسقطها بصمت.
    typeof store.getGlossaries === 'function' ? store.getGlossaries() : null,
  ]);
  // تفضيلات اللغات (AA3): تُضمَّن حين تختلف عن الافتراضي، فتصير النسخة بالإصدار 2 الذي يرفضه 1.1.0 برسالة لا بفساد صامت.
  const langPrefs = langRaw ? normalizeLangPrefs(langRaw) : null;
  const langChanged = !!langPrefs && JSON.stringify(langPrefs) !== JSON.stringify(normalizeLangPrefs(DEFAULT_LANG_PREFS));
  // قوائم الأزواج (الفكرة ٨، ح-46): تُضمَّن حين توجد قائمة وحدها، فتصير النسخة بالإصدار 3؛ وبلا قوائم تبقى بالإصدار 1 أو 2 كما كانت.
  const glossaries = glossRaw ? normalizeGlossaries(glossRaw) : null;
  const hasLists = !!glossaries && glossaries.lists.length > 0;
  const ids = library.map((item) => item.entry.videoId);
  const videos = [];
  // سجل بمفتاح لا يُقرأ ولا مُلخّص له لا يظهر في المحفوظات، فيُذكر «تعذّر» بدل أن يغيب عن التقرير (تدقيق 5fedcb9، CX-H4).
  const listed = new Set(ids);
  const unreadable = typeof store.unreadableVideos === 'function' ? await store.unreadableVideos() : [];
  const skipped = unreadable.filter((id) => !listed.has(id)).map((videoId) => ({ videoId, code: 'ST_CORRUPT_RECORD' }));
  onProgress({ done: 0, total: ids.length });
  const partial = [];
  for (const [i, id] of ids.entries()) {
    try {
      const bundle = await store.getBundle(id);
      if (bundle) videos.push(bundleToBackup(bundle, { includePrevious }));
      else skipped.push({ videoId: id, code: 'PG_VIDEO_GONE' });
    } catch (err) {
      const code = toErrorInfo(err).code;
      const saved = code === 'ST_CORRUPT_RECORD' && typeof store.salvageBundle === 'function' ? await store.salvageBundle(id).catch(() => null) : null;
      if (saved) {
        videos.push(bundleToBackup(saved.bundle, { includePrevious }));
        partial.push({ videoId: id, dropped: saved.dropped });
      } else skipped.push({ videoId: id, code });
    }
    if ((i + 1) % batch === 0 || i + 1 === ids.length) {
      onProgress({ done: i + 1, total: ids.length });
      await pause();
    }
  }
  videos.sort(byCreated);
  const v2 = langChanged || videos.some((v) => 'lang' in v);
  const data = { settings, prefs, videos, ...(langChanged ? { langPrefs } : {}), ...(hasLists ? { glossaries } : {}) };
  let dataJson;
  try {
    dataJson = JSON.stringify(data);
  } catch (err) {
    // فوق حد طول النص في المحرّك (نحو 512 مليون وحدة): لا نسخة في ملف واحد، برمزها لا «خطأ غير متوقع» (DS-H-03).
    if (err instanceof RangeError) throw tooLarge(null);
    throw err;
  }
  const header = {
    // الإصدار 3 حين توجد قوائم أزواج (الفكرة ٨)، و2 حين توجد بيانات لغة في مدخل (AA1) أو تفضيلات لغات غير افتراضية (AA3)، وإلا 1
    // الذي يستعيده 1.1.0 كما هو.
    format: BACKUP_FORMAT, version: hasLists ? BACKUP_VERSION : v2 ? BACKUP_VERSION_V2 : BACKUP_VERSION_V1, createdAt,
    app: { version: String(appVersion), storageSchema: STORAGE_SCHEMA },
    options: { previous: includePrevious },
    counts: countData(data),
    integrity: { algorithm: HASH_ALGORITHM, hash: await sha256Hex(dataJson) },
  };
  const head = JSON.stringify(header);
  let text;
  try {
    text = `${head.slice(0, -1)},"data":${dataJson}}`;
  } catch (err) {
    if (err instanceof RangeError) throw tooLarge(null);
    throw err;
  }
  // حد واحد بالبايت الفعلي للإنشاء والقراءة (U55، Q28): ما يُنشأ يُستعاد، فلا تُحفظ نسخة يرفضها readBackup.
  const bytes = utf8Length(text);
  if (bytes > maxBytes) throw tooLarge(bytes, maxBytes);
  return { name: backupFileName(createdAt), text, bytes, counts: header.counts, skipped, partial };
}

const MB = 1024 * 1024;
const mb = (n) => t('common.bytes.mb', { n });
/** @param {number | null} bytes @param {number} [max] */
function tooLarge(bytes, max = BACKUP_LIMITS.maxBytes) {
  return new TjError('BK_CREATE_TOO_LARGE', {
    detail: bytes === null ? 'string-length' : `bytes=${bytes}`,
    params: {
      size: bytes === null ? t('core.backup.moreThan', { size: mb(Math.round(max / MB)) }) : mb(Math.ceil(bytes / MB)),
      max: mb(Math.round(max / MB)),
    },
  });
}
