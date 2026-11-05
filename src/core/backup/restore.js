// خطة الاستعادة وتنفيذها (عقد backup.md §٦، وstorage §١٠ restoreVideo). المعاينة تقسم الفيديوهات الصالحة إلى «جديدة»
// و«موجودة»، والموجود يُتخطى ما لم يُختر استبداله صراحة. التنفيذ فيديو بعد فيديو بكتابة ذرية واحدة لكل منها وتقدم ظاهر،
// ثم تقرير: أضيف · تُخطّي · استُبدل · تعذّر. خطأ فيديو لا يوقف الباقي إلا امتلاء المساحة، فيتوقف ويبلّغ بما كُتب وما بقي.
// وإعادة المحاولة تأخذ ما تعذّر وما بقي وحده باختياره نفسه، فلا تكرار؛ وما أضيف يُتخطى في أي تشغيل لاحق لأنه صار موجودًا.
import { toErrorInfo } from '../errors/index.js';
import { yieldToPage } from './create.js';
import { BACKUP_LIMITS } from './format.js';

/**
 * @typedef {import('./read.js').BackupRead} BackupRead
 * @typedef {import('./read.js').BackupItem} BackupItem
 * @typedef {{ videoId: string, entry: object, replace: boolean }} RestoreItem
 * @typedef {{
 *   added: string[], skipped: string[], replaced: string[],
 *   failed: { videoId: string, code: string, message: string }[],
 *   remaining: string[], stopped: boolean,
 *   settings: 'restored' | 'failed' | null, settingsCode: string | null,
 *   thumbnails?: 'off' | 'failed' | null
 * }} RestoreReport
 */

/**
 * المعاينة: الجديدة (معرّفها غير محفوظ) والموجودة، بترتيب النسخة، وأعداد ما سيُضاف.
 * @param {BackupRead} backup @param {Iterable<string>} existingIds معرّفات المحفوظات الآن
 */
export function planRestore(backup, existingIds) {
  const have = new Set(existingIds);
  const fresh = backup.videos.filter((v) => !have.has(v.videoId));
  const existing = backup.videos.filter((v) => have.has(v.videoId));
  const sum = (list, k) => list.reduce((s, v) => s + (typeof v.counts[k] === 'number' ? v.counts[k] : v.counts[k] ? 1 : 0), 0);
  return {
    fresh, existing, invalid: backup.invalid,
    counts: {
      videos: backup.videos.length, translations: sum(backup.videos, 'translations'), marks: sum(backup.videos, 'marks'),
      previous: sum(backup.videos, 'previous'), fresh: fresh.length, existing: existing.length, invalid: backup.invalid.length,
    },
    hasSettings: Boolean(backup.settings && Object.keys(backup.settings.patch).length) || Boolean(backup.prefs && Object.keys(backup.prefs.patch).length),
  };
}

/**
 * عناصر التنفيذ من المعاينة: الجديدة كلها، والموجودة المختارة للاستبدال وحدها (غير المختارة تُعدّ متخطاة دون كتابة).
 * @param {ReturnType<typeof planRestore>} plan @param {Set<string> | 'all'} replace
 * @returns {{ items: RestoreItem[], skipped: string[] }}
 */
export function restoreItems(plan, replace) {
  const chosen = (id) => replace === 'all' || replace.has(id);
  return {
    items: [
      ...plan.fresh.map((v) => ({ videoId: v.videoId, entry: v.entry, replace: false })),
      ...plan.existing.filter((v) => chosen(v.videoId)).map((v) => ({ videoId: v.videoId, entry: v.entry, replace: true })),
    ],
    skipped: plan.existing.filter((v) => !chosen(v.videoId)).map((v) => v.videoId),
  };
}

/**
 * @param {{
 *   store: ReturnType<typeof import('../store/index.js').createStore>,
 *   items: RestoreItem[], skipped?: string[],
 *   settings?: object | null, prefs?: object | null, thumbnailsOff?: boolean,
 *   onProgress?: (p: { done: number, total: number }) => void, pause?: () => Promise<void>, batch?: number,
 * }} o settings وprefs تعديلا القسمين إن اختار المستخدم «استعادة الإعدادات والقاموس»، وإلا null. وthumbnailsOff إطفاء صور
 *   المحفوظات الذي في النسخة: يُطبَّق في كل استعادة ولو لم تُختر الإعدادات، لأنه رفض سابق لا يُتجاوز (U05، Q10)، ولا يشغّلها أبدًا.
 * @returns {Promise<RestoreReport>}
 */
export async function runRestore({ store, items, skipped = [], settings = null, prefs = null, thumbnailsOff = false, onProgress = () => {}, pause = yieldToPage, batch = BACKUP_LIMITS.batch }) {
  /** @type {RestoreReport} */
  const report = { added: [], skipped: [...skipped], replaced: [], failed: [], remaining: [], stopped: false, settings: null, settingsCode: null, thumbnails: null };
  if (thumbnailsOff) {
    try {
      await store.setPrefs({ ui: { thumbnails: false } });
      report.thumbnails = 'off';
    } catch {
      report.thumbnails = 'failed';
    }
  }
  if (settings || prefs) {
    try {
      if (settings && Object.keys(settings).length) await store.setSettings(settings);
      if (prefs && Object.keys(prefs).length) await store.setPrefs(prefs);
      report.settings = 'restored';
    } catch (err) {
      report.settings = 'failed';
      report.settingsCode = toErrorInfo(err).code;
    }
  }
  onProgress({ done: 0, total: items.length });
  for (const [i, item] of items.entries()) {
    try {
      const { status } = await store.restoreVideo(item.entry, { replace: item.replace });
      report[status].push(item.videoId);
    } catch (err) {
      const info = toErrorInfo(err);
      if (info.code === 'ST_QUOTA_EXCEEDED') {
        report.stopped = true;
        report.remaining = items.slice(i).map((x) => x.videoId);
        onProgress({ done: i, total: items.length });
        return report;
      }
      report.failed.push({ videoId: item.videoId, code: info.code, message: info.message });
    }
    if ((i + 1) % batch === 0 || i + 1 === items.length) {
      onProgress({ done: i + 1, total: items.length });
      await pause();
    }
  }
  return report;
}

/**
 * ما تُعاد محاولته: ما تعذّر وما بقي بعد التوقف، باختيار الاستبدال نفسه.
 * @param {RestoreReport} report @param {RestoreItem[]} items
 * @returns {RestoreItem[]}
 */
export function retryItems(report, items) {
  const again = new Set([...report.failed.map((f) => f.videoId), ...report.remaining]);
  return items.filter((x) => again.has(x.videoId));
}

/**
 * يضم تقرير إعادة المحاولة إلى السابق: ما نجح الآن يخرج من «تعذّر».
 * @param {RestoreReport} before @param {RestoreReport} retry
 * @returns {RestoreReport}
 */
export function mergeReports(before, retry) {
  return {
    added: [...before.added, ...retry.added],
    skipped: [...before.skipped, ...retry.skipped],
    replaced: [...before.replaced, ...retry.replaced],
    failed: retry.failed,
    remaining: retry.remaining,
    stopped: retry.stopped,
    settings: retry.settings ?? before.settings,
    settingsCode: retry.settings ? retry.settingsCode : before.settingsCode,
    thumbnails: retry.thumbnails ?? before.thumbnails ?? null,
  };
}

/** رمز خلاصة التقرير. @param {RestoreReport} r */
export function reportCode(r) {
  if (r.stopped) return 'BK_RESTORE_STOPPED';
  return r.failed.length || r.settings === 'failed' ? 'BK_RESTORE_PARTIAL' : 'BK_RESTORE_DONE';
}

/**
 * تشخيص الاستعادة: أعداد ورموز وحدها، بلا معرّف ولا عنوان ولا نص (R36).
 * @param {RestoreReport} r
 */
export function restoreDiagnostics(r) {
  const codes = {};
  for (const f of r.failed) codes[f.code] = (codes[f.code] ?? 0) + 1;
  return {
    added: r.added.length, skipped: r.skipped.length, replaced: r.replaced.length, failed: r.failed.length,
    remaining: r.remaining.length, stopped: r.stopped, settings: r.settings, settingsCode: r.settingsCode, codes,
  };
}
