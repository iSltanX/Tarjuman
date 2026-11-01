// وحدة التخزين (عقد docs/contracts/storage.md) فوق chrome.storage.local. سجل لكل فيديو ومُلخّصه في
// مفتاح فهرس مستقل يُكتبان في عملية set واحدة، فلا يتسابق سياقان على مفتاح فهرس مشترك. الكتابة داخل
// السياق الواحد متسلسلة، والتعارض بين السياقات يُكشف بـrev (expectRev).
import { TjError } from '../errors/index.js';
import { assertValid } from '../model/validate.js';
import { DEFAULT_SETTINGS, mergeSettings, normalizeSettings, validateSettings } from '../model/settings.js';
import { summarizeVideo, validateIndexEntry, validateVideoRecord } from '../model/video.js';
import { isVideoId } from '../model/ids.js';
import { chromeLocalArea } from './area.js';
import { computeCapacity } from './capacity.js';
import { KEY_META, KEY_SETTINGS, indexKey, parseKey, videoKey } from './keys.js';
import { MIGRATIONS, STORAGE_SCHEMA, migrate } from './migrate.js';

export { STORAGE_SCHEMA, MIGRATIONS } from './migrate.js';
export { computeCapacity, WARN_RATIO, FULL_RATIO, ADVISORY_BYTES } from './capacity.js';
export { videoKey, indexKey, parseKey, KEY_META, KEY_SETTINGS } from './keys.js';

/**
 * @typedef {import('../model/video.js').VideoRecord} VideoRecord
 * @typedef {import('../model/video.js').IndexEntry} IndexEntry
 * @typedef {import('../model/settings.js').Settings} Settings
 * @typedef {{
 *   videos: Record<string, { oldValue: VideoRecord | null, newValue: VideoRecord | null }>,
 *   settings: { oldValue: unknown, newValue: unknown } | null,
 *   index: boolean, cleared: boolean
 * }} StoreChange
 */

const isQuotaError = (err) => /quota|QUOTA_BYTES/i.test(String(err && err.message));

/**
 * @param {{
 *   area?: import('./area.js').StorageArea,
 *   now?: () => number,
 *   schema?: number,
 *   migrations?: Record<number, import('./migrate.js').MigrationStep>,
 * }} [opts]
 */
export function createStore({ area = chromeLocalArea(), now = () => Date.now(), schema = STORAGE_SCHEMA, migrations = MIGRATIONS } = {}) {
  const iso = () => new Date(now()).toISOString();
  let readyPromise = null;
  let chain = Promise.resolve();
  /** كتابات هذا السياق واحدة بعد أخرى، فلا يضيع تعديل بين قراءة وكتابة متزامنتين. */
  const exclusive = (fn) => {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  };

  const ready = () => {
    readyPromise ??= migrate(area, { schema, migrations, now: iso() }).catch((err) => {
      readyPromise = null;
      throw err;
    });
    return readyPromise;
  };

  async function read(keys) {
    try {
      return await area.get(keys);
    } catch (err) {
      throw new TjError('ST_READ_FAILED', { detail: String(err && err.message), cause: err });
    }
  }

  async function write(items) {
    try {
      await area.set(items);
    } catch (err) {
      throw new TjError(isQuotaError(err) ? 'ST_QUOTA_EXCEEDED' : 'ST_WRITE_FAILED', { detail: String(err && err.message), cause: err });
    }
  }

  async function removeKeys(keys) {
    try {
      await area.remove(keys);
    } catch (err) {
      throw new TjError('ST_WRITE_FAILED', { detail: String(err && err.message), cause: err });
    }
  }

  async function listKeys() {
    try {
      return await area.getKeys();
    } catch (err) {
      throw new TjError('ST_READ_FAILED', { detail: String(err && err.message), cause: err });
    }
  }

  function checkId(videoId) {
    if (!isVideoId(videoId)) throw new TjError('TJ_BAD_VIDEO_ID', { detail: String(videoId).slice(0, 20) });
  }

  /** @returns {Promise<VideoRecord | null>} */
  async function readVideo(videoId) {
    const { [videoKey(videoId)]: raw } = await read(videoKey(videoId));
    if (raw === undefined) return null;
    const r = validateVideoRecord(raw);
    if (!r.ok) throw new TjError('ST_CORRUPT_RECORD', { detail: `${videoId}: ${r.path} — ${r.reason}` });
    return raw;
  }

  async function syncIndex(keys) {
    const ids = (kind) => new Set(keys.map(parseKey).filter((k) => k && k.kind === kind).map((k) => k.videoId));
    const videos = ids('video');
    const index = ids('index');
    const missing = [...videos].filter((id) => !index.has(id));
    const orphan = [...index].filter((id) => !videos.has(id));
    if (orphan.length) await removeKeys(orphan.map(indexKey));
    if (!missing.length) return;
    const items = await read(missing.map(videoKey));
    const repaired = {};
    for (const id of missing) {
      const rec = items[videoKey(id)];
      if (validateVideoRecord(rec).ok) repaired[indexKey(id)] = summarizeVideo(rec);
    }
    if (Object.keys(repaired).length) await write(repaired);
  }

  return {
    /** الترحيل مرة لكل سياق؛ كل دالة تنتظره ضمنًا. */
    ready,

    /** @returns {Promise<Settings>} كاملة دائمًا؛ الحقل التالف يعود افتراضيه */
    async getSettings() {
      await ready();
      const { [KEY_SETTINGS]: raw } = await read(KEY_SETTINGS);
      return normalizeSettings(raw ?? DEFAULT_SETTINGS);
    },

    /**
     * @param {Parameters<typeof mergeSettings>[1]} patch تعديل جزئي حتى مستوى المجموعة
     * @returns {Promise<Settings>}
     */
    setSettings(patch) {
      return exclusive(async () => {
        await ready();
        const { [KEY_SETTINGS]: raw } = await read(KEY_SETTINGS);
        const next = mergeSettings(normalizeSettings(raw ?? DEFAULT_SETTINGS), patch);
        assertValid(validateSettings(next), 'settings');
        await write({ [KEY_SETTINGS]: next });
        return next;
      });
    },

    /** @param {string} videoId @returns {Promise<VideoRecord | null>} */
    async getVideo(videoId) {
      checkId(videoId);
      await ready();
      return readVideo(videoId);
    },

    /**
     * قراءة ثم تعديل ثم كتابة للسجل ومُلخّصه معًا. fn تستلم نسخة (أو null) وتعيد سجلًا، أو null للحذف،
     * أو undefined لعدم التغيير. rev يزيد واحدًا، وupdatedAt وcreatedAt يضبطهما التخزين.
     * @param {string} videoId
     * @param {(rec: VideoRecord | null) => VideoRecord | null | undefined | Promise<VideoRecord | null | undefined>} fn
     * @param {{ expectRev?: number }} [opts] expectRev: يرفض بـST_CONFLICT إن تغيّر السجل منذ قُرئ (0 = غير موجود)
     * @returns {Promise<VideoRecord | null>}
     */
    updateVideo(videoId, fn, { expectRev } = {}) {
      checkId(videoId);
      return exclusive(async () => {
        await ready();
        const cur = await readVideo(videoId);
        if (expectRev !== undefined && (cur?.rev ?? 0) !== expectRev) {
          throw new TjError('ST_CONFLICT', { detail: `المتوقع ${expectRev} والمخزَّن ${cur?.rev ?? 0}` });
        }
        const draft = await fn(cur ? structuredClone(cur) : null);
        if (draft === undefined) return cur;
        if (draft === null) {
          if (cur) await removeKeys([videoKey(videoId), indexKey(videoId)]);
          return null;
        }
        const at = iso();
        const next = { ...draft, videoId, rev: (cur?.rev ?? 0) + 1, createdAt: cur?.createdAt ?? at, updatedAt: at };
        assertValid(validateVideoRecord(next), 'video');
        await write({ [videoKey(videoId)]: next, [indexKey(videoId)]: summarizeVideo(next) });
        return next;
      });
    },

    /** @param {string} videoId */
    deleteVideo(videoId) {
      checkId(videoId);
      return exclusive(async () => {
        await ready();
        await removeKeys([videoKey(videoId), indexKey(videoId)]);
      });
    },

    /**
     * فهرس المحفوظات الأحدث تعديلًا أولًا. يصلح نفسه: مُلخّص مفقود يُعاد بناؤه، ومُلخّص بلا سجل يُحذف.
     * @returns {Promise<IndexEntry[]>}
     */
    async listIndex() {
      await ready();
      await exclusive(async () => syncIndex(await listKeys()));
      const idx = (await listKeys()).filter((k) => parseKey(k)?.kind === 'index');
      if (!idx.length) return [];
      const items = await read(idx);
      return Object.values(items)
        .filter((e) => validateIndexEntry(e).ok)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    },

    /** @returns {Promise<import('./capacity.js').Capacity>} */
    async capacity() {
      let bytes;
      try {
        bytes = await area.getBytesInUse(null);
      } catch (err) {
        throw new TjError('ST_READ_FAILED', { detail: String(err && err.message), cause: err });
      }
      return computeCapacity(bytes, area);
    },

    /** «مسح كل البيانات»: كل المحفوظات والإعدادات، ثم meta جديد. التأكيد شأن الواجهة. */
    clearAll() {
      return exclusive(async () => {
        try {
          await area.clear();
        } catch (err) {
          throw new TjError('ST_WRITE_FAILED', { detail: String(err && err.message), cause: err });
        }
        readyPromise = null;
        await ready();
      });
    },

    /**
     * تغيّرات التخزين من أي سياق (هذا السياق أيضًا). القيم كما وصلت؛ من يحتاج سجلًا صالحًا يقرأه بـgetVideo.
     * @param {(change: StoreChange) => void} fn
     * @returns {() => void}
     */
    onChange(fn) {
      return area.onChanged((changes) => {
        /** @type {StoreChange} */
        const out = { videos: {}, settings: null, index: false, cleared: false };
        for (const [key, ch] of Object.entries(changes)) {
          const k = parseKey(key);
          if (!k) continue;
          if (k.kind === 'video') out.videos[k.videoId] = { oldValue: ch.oldValue ?? null, newValue: ch.newValue ?? null };
          else if (k.kind === 'settings') out.settings = { oldValue: ch.oldValue, newValue: ch.newValue };
          else if (k.kind === 'index') out.index = true;
          else if (k.kind === 'meta' && ch.newValue === undefined) out.cleared = true;
        }
        if (Object.keys(out.videos).length || out.settings || out.index || out.cleared) fn(out);
      });
    },
  };
}
