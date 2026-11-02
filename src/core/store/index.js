// وحدة التخزين (عقد docs/contracts/storage.md) فوق chrome.storage.local. سجل لكل فيديو ومُلخّصه في
// مفتاح فهرس مستقل يُكتبان في عملية set واحدة، فلا يتسابق سياقان على مفتاح فهرس مشترك. الكتابة داخل
// السياق الواحد متسلسلة، والتعارض بين السياقات يُكشف بنسخة السجل (rev وupdatedAt) قبل الكتابة وبـexpect.
import { TjError } from '../errors/index.js';
import { assertValid } from '../model/validate.js';
import { DEFAULT_SETTINGS, mergeSettings, normalizeSettings, validateSettings } from '../model/settings.js';
import { DEFAULT_PREFS, mergePrefs, normalizePrefs, validatePrefs } from '../model/prefs.js';
import { summarizeVideo, validateIndexEntry, validateVideoRecord } from '../model/video.js';
import { isVideoId } from '../model/ids.js';
import {
  applyRecordChange, bundleFromBackup, bundleFromRecord, slotModels, summarizeBundle, syncActive, unpackBundle,
} from '../model/bundle.js';
import { validateBundle } from '../model/slots.js';
import { chromeLocalArea } from './area.js';
import { bundleReadKeys, checkRaw, hasCompanions, itemsFor, rawBundle } from './bundles.js';
import { computeCapacity } from './capacity.js';
import {
  COMPANION_KINDS, KEY_META, KEY_PREFS, KEY_SAVES, KEY_SETTINGS, altsKey, bundleKey, companionKeys, indexKey, marksKey, parseKey, prevKey, videoKey,
} from './keys.js';
// واجهة التخزين تعرض للصفحات والمتحكم ما تحتاجه من النموذج للحزمة دون استيراد إضافي.
export { bundleFromRecord, slotModels } from '../model/bundle.js';
import { MIGRATIONS, STORAGE_SCHEMA, migrate } from './migrate.js';

export { STORAGE_SCHEMA, MIGRATIONS } from './migrate.js';
export { computeCapacity, WARN_RATIO, FULL_RATIO, ADVISORY_BYTES } from './capacity.js';
export {
  videoKey, indexKey, bundleKey, altsKey, prevKey, marksKey, companionKeys, parseKey, KEY_META, KEY_SETTINGS, KEY_PREFS, KEY_SAVES,
} from './keys.js';

/**
 * @typedef {import('../model/video.js').VideoRecord} VideoRecord
 * @typedef {import('../model/video.js').IndexEntry} IndexEntry
 * @typedef {import('../model/settings.js').Settings} Settings
 * @typedef {import('../model/slots.js').Bundle} Bundle
 * @typedef {import('../model/slots.js').SortSummary} SortSummary
 * @typedef {{
 *   videos: Record<string, { oldValue: VideoRecord | null, newValue: VideoRecord | null }>,
 *   settings: { oldValue: unknown, newValue: unknown } | null,
 *   index: boolean, cleared: boolean,
 *   prefs: { oldValue: unknown, newValue: unknown } | null,
 *   bundles: string[]
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

  /** نسخة السجل للمقارنة: المراجعة وتاريخ آخر حفظ معًا (فلا يخدع حذفٌ ثم إنشاءٌ بالمراجعة نفسها). */
  const versionOf = (r) => {
    const rec = r && r.record ? r.record : r;
    return rec ? `${rec.rev}|${rec.updatedAt}` : 'none';
  };

  // آخر حزمة قُرئت أو كُتبت لكل فيديو في هذا السياق (لـbundleOf)، بحد صغير.
  const cache = new Map();
  const CACHE_MAX = 8;
  // عدد كتابات هذا السياق لكل فيديو: قراءة بدأت قبل كتابة وانتهت بعدها لقطةٌ أقدم، فلا تحل في الذاكرة محل الأحدث
  // (تدقيق 5fedcb9، GM-004: كانت تُسقط الخانات الأخرى والعلامات من bundleOf في المشغّل).
  const writes = new Map();
  const wrote = (id) => writes.set(id, (writes.get(id) ?? 0) + 1);
  function remember(b) {
    if (!b) return b;
    cache.delete(b.videoId);
    cache.set(b.videoId, b);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return b;
  }

  /** قراءة واحدة لمفاتيح الفيديو الخمسة، وتحقق، وفك ومصالحة (عقد storage §٩). */
  async function loadBundle(videoId) {
    const raw = checkRaw(rawBundle(await read(bundleReadKeys(videoId)), videoId), videoId);
    return { raw, ...unpackBundle(raw) };
  }

  /** يحذف توابع فيديو لا سجل له، بعد إعادة التحقق من غياب السجل قبل الحذف مباشرة. */
  async function removeOrphan(videoId) {
    const { [videoKey(videoId)]: rec } = await read(videoKey(videoId));
    if (rec === undefined) await removeKeys(companionKeys(videoId));
  }

  /**
   * الحزمة بعد المصالحة؛ وما غيّرته المصالحة يُكتب مرة كتابةً عادية بنسخة متحققة، واليتيم يُنظَّف.
   * @returns {Promise<Bundle | null>}
   */
  async function readBundle(videoId) {
    const gen = writes.get(videoId) ?? 0;
    const cur = await loadBundle(videoId);
    if (cur.orphan) {
      await exclusive(() => removeOrphan(videoId));
      cache.delete(videoId);
      return null;
    }
    // undefined: يُكتب ما غيّرته المصالحة إن بقي (قراءتان متزامنتان لا تكتبان مرتين).
    if (cur.changed) return exclusive(() => writeBundle(videoId, () => undefined));
    return (writes.get(videoId) ?? 0) === gen ? remember(cur.bundle) : cur.bundle;
  }

  /**
   * لبّ الكتابة (داخل exclusive): قراءة ومصالحة، ثم fn، ثم إعادة فحص النسخة، ثم set واحدة (عقد storage §٨).
   * fn تعيد حزمة أو null للحذف أو undefined لعدم التغيير (وما غيّرته المصالحة يُكتب حينئذ).
   * @param {string} videoId
   * @param {(b: Bundle | null) => Bundle | null | undefined | Promise<Bundle | null | undefined>} fn
   * @param {{ expect?: VideoRecord | Bundle | null }} [opts]
   * @returns {Promise<Bundle | null>}
   */
  async function writeBundle(videoId, fn, { expect } = {}) {
    for (let attempt = 1; ; attempt++) {
      const cur = await loadBundle(videoId);
      if (expect !== undefined && versionOf(cur.bundle) !== versionOf(expect)) {
        throw new TjError('ST_CONFLICT', { detail: `المتوقع ${versionOf(expect)} والمخزَّن ${versionOf(cur.bundle)}` });
      }
      let draft = await fn(cur.bundle ? structuredClone(cur.bundle) : null);
      if (draft === undefined) {
        if (!cur.changed && !cur.orphan) return remember(cur.bundle);
        draft = cur.bundle;
      }
      const { [videoKey(videoId)]: latest } = await read(videoKey(videoId));
      if (versionOf(latest) !== versionOf(cur.raw.record)) {
        if (expect !== undefined || attempt >= 3) throw new TjError('ST_CONFLICT', { detail: `تغيّر أثناء التعديل: ${versionOf(cur.raw.record)} ← ${versionOf(latest)}` });
        continue;
      }
      if (draft === null) {
        wrote(videoId);
        cache.delete(videoId);
        if (cur.raw.record || hasCompanions(cur.raw)) await removeKeys([videoKey(videoId), indexKey(videoId), ...companionKeys(videoId)]);
        return null;
      }
      const at = iso();
      const prior = cur.raw.record;
      const next = structuredClone(draft);
      next.videoId = videoId;
      next.record = { ...next.record, videoId, rev: (prior?.rev ?? 0) + 1, createdAt: prior?.createdAt ?? at, updatedAt: at };
      syncActive(next);
      assertValid(validateBundle(next), 'video');
      // سجل جديد لمعرّف بقيت له توابع يتيمة (حذفه الأول): رأس جديد، والتوابع القديمة تُطمس بقيمها الجديدة.
      await write(itemsFor(next, cur.raw, { forceHead: !prior && hasCompanions(cur.raw) }));
      wrote(videoId);
      return remember(next);
    }
  }

  const trivialSummary = (entry) => ({
    filled: entry.arabic ? 1 : 0, edited: entry.arabic?.edited ? 1 : 0,
    warned: entry.arabic && (entry.arabic.missing || entry.arabic.extra || entry.arabic.drift) ? 1 : 0, marks: { todo: 0, done: 0 },
  });
  const slotModelsFromIndex = (entry) => [1, 2, 3].map((n) => ({
    n, filled: !!entry.arabic && n === 1, active: !!entry.arabic && n === 1, name: null,
    edited: !!entry.arabic?.edited && n === 1, cueCount: n === 1 && entry.arabic ? entry.arabic.cueCount : 0,
  }));

  /** يقرأ المُلخّصات ويصلحها: المفقود أو غير الصالح لسجل صالح يُعاد بناؤه، واليتيم يُحذف (ومعه توابع الإصدار الثاني). */
  async function syncIndex() {
    return (await scanIndex()).entries;
  }

  /** syncIndex ومعه سجلات بمفتاح لا تُقرأ ولا مُلخّص صالح لها (فلا تظهر في المحفوظات). */
  async function scanIndex() {
    const keys = await listKeys();
    const ids = (kind) => new Set(keys.map(parseKey).filter((k) => k && k.kind === kind).map((k) => k.videoId));
    const videos = ids('video');
    const index = ids('index');
    const orphan = [...index].filter((id) => !videos.has(id));
    if (orphan.length) await removeKeys(orphan.map(indexKey));
    const companionOrphans = new Set(COMPANION_KINDS.flatMap((kind) => [...ids(kind)]).filter((id) => !videos.has(id)));
    for (const id of companionOrphans) await removeOrphan(id);
    const present = [...index].filter((id) => videos.has(id));
    const items = present.length ? await read(present.map(indexKey)) : {};
    const entries = new Map();
    for (const id of present) {
      const e = items[indexKey(id)];
      if (validateIndexEntry(e).ok && e.videoId === id) entries.set(id, e);
    }
    const missing = [...videos].filter((id) => !entries.has(id));
    if (missing.length) {
      const recs = await read(missing.map(videoKey));
      const repaired = {};
      for (const id of missing) {
        const rec = recs[videoKey(id)];
        if (!validateVideoRecord(rec).ok) continue;
        const e = summarizeVideo(rec);
        repaired[indexKey(id)] = e;
        entries.set(id, e);
      }
      if (Object.keys(repaired).length) await write(repaired);
    }
    return { entries: [...entries.values()], unreadable: [...videos].filter((id) => !entries.has(id)).sort() };
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

    /** @returns {Promise<import('../model/prefs.js').Prefs>} تفضيلات الإصدار الثاني كاملة دائمًا (عقد storage §١٠) */
    async getPrefs() {
      await ready();
      const { [KEY_PREFS]: raw } = await read(KEY_PREFS);
      return normalizePrefs(raw ?? DEFAULT_PREFS);
    },

    /**
     * @param {Record<string, unknown>} patch تعديل جزئي حتى مستوى المجموعة
     * @returns {Promise<import('../model/prefs.js').Prefs>}
     */
    setPrefs(patch) {
      return exclusive(async () => {
        await ready();
        const { [KEY_PREFS]: raw } = await read(KEY_PREFS);
        const next = mergePrefs(normalizePrefs(raw ?? DEFAULT_PREFS), patch);
        assertValid(validatePrefs(next), 'prefs');
        await write({ [KEY_PREFS]: next });
        return next;
      });
    },

    /** @returns {Promise<{ downloadId: number, at: string } | null>} معرّف آخر ملف نزّله ترجمان (لا مسار) */
    async getLastSave() {
      await ready();
      const { [KEY_SAVES]: raw } = await read(KEY_SAVES);
      const last = raw && typeof raw === 'object' ? raw.last : null;
      return last && Number.isInteger(last.downloadId) && last.downloadId >= 0 && typeof last.at === 'string' ? { downloadId: last.downloadId, at: last.at } : null;
    },

    /** @param {number} downloadId معرّف من نتيجة downloads.download نفسها */
    setLastSave(downloadId) {
      if (!Number.isInteger(downloadId) || downloadId < 0) return Promise.reject(new TjError('MD_INVALID', { detail: 'downloadId' }));
      return exclusive(async () => {
        await ready();
        await write({ [KEY_SAVES]: { schema: 1, last: { downloadId, at: iso() } } });
      });
    },

    /**
     * السجل بعد المصالحة (عقد storage §١٠)؛ وحزمته في ذاكرة السياق لـbundleOf.
     * @param {string} videoId @returns {Promise<VideoRecord | null>}
     */
    async getVideo(videoId) {
      checkId(videoId);
      await ready();
      return (await readBundle(videoId))?.record ?? null;
    },

    /**
     * قراءة ثم تعديل ثم كتابة للسجل وتوابعه معًا. fn تستلم نسخة السجل (أو null) وتعيد سجلًا، أو null للحذف،
     * أو undefined لعدم التغيير؛ وقد تُستدعى أكثر من مرة فلتكن نقية. والناتج يمر بـapplyRecordChange: استبدال
     * النشطة يحفظ السابقة في الكتابة نفسها، وحذفها يفعّل غيرها. rev يزيد واحدًا، وupdatedAt وcreatedAt يضبطهما
     * التخزين. قبل الكتابة مباشرة يُعاد فحص نسخة السجل: إن كتب سياق آخر بينهما أُعيدت fn على الأحدث (حتى ثلاث
     * مرات)، أو رُفض بـST_CONFLICT إن مُرِّر expect.
     * @param {string} videoId
     * @param {(rec: VideoRecord | null) => VideoRecord | null | undefined | Promise<VideoRecord | null | undefined>} fn
     * @param {{ expect?: VideoRecord | Bundle | null }} [opts] ما بُني عليه التعديل (null = غير موجود)؛
     *   يرفض بـST_CONFLICT إن تغيّرت مراجعته أو تاريخ حفظه منذئذ
     * @returns {Promise<VideoRecord | null>}
     */
    updateVideo(videoId, fn, { expect } = {}) {
      checkId(videoId);
      return exclusive(async () => {
        await ready();
        const next = await writeBundle(videoId, async (b) => {
          const draft = await fn(b ? structuredClone(b.record) : null);
          if (draft === undefined || draft === null) return draft;
          return applyRecordChange(b, { ...draft, videoId }, iso());
        }, { expect });
        return next?.record ?? null;
      });
    },

    /**
     * الحزمة (عقد data-model §١٠) أو null، بعد المصالحة.
     * @param {string} videoId @returns {Promise<Bundle | null>}
     */
    async getBundle(videoId) {
      checkId(videoId);
      await ready();
      const b = await readBundle(videoId);
      return b ? structuredClone(b) : null;
    },

    /**
     * مثل updateVideo على الحزمة: fn(نسخة أو null) تعيد حزمة أو null أو undefined. كتابة ذرية واحدة.
     * @param {string} videoId
     * @param {(b: Bundle | null) => Bundle | null | undefined | Promise<Bundle | null | undefined>} fn
     * @param {{ expect?: VideoRecord | Bundle | null }} [opts]
     * @returns {Promise<Bundle | null>}
     */
    updateBundle(videoId, fn, { expect } = {}) {
      checkId(videoId);
      return exclusive(async () => {
        await ready();
        const next = await writeBundle(videoId, fn, { expect });
        return next ? structuredClone(next) : null;
      });
    },

    /**
     * متزامن: الحزمة التي قُرئت أو كُتبت مع هذا السجل نفسه (بنسخته) في هذا السياق، وإلا حزمة السجل وحده.
     * @param {VideoRecord | null} record @returns {Bundle | null}
     */
    bundleOf(record) {
      if (!record) return null;
      const hit = cache.get(record.videoId);
      return hit && versionOf(hit.record) === versionOf(record) ? hit : bundleFromRecord(record);
    },

    /** @param {string} videoId */
    deleteVideo(videoId) {
      checkId(videoId);
      return exclusive(async () => {
        await ready();
        wrote(videoId);
        cache.delete(videoId);
        await removeKeys([videoKey(videoId), indexKey(videoId), ...companionKeys(videoId)]);
      });
    },

    /**
     * واجهة كتابة الاستعادة (عقد storage §١٠، backup.md §٦): الموجود يُتخطى افتراضيًا، والتواريخ كما في النسخة.
     * @param {unknown} entry مدخل فيديو من النسخة الاحتياطية
     * @param {{ replace?: boolean }} [opts]
     * @returns {Promise<{ status: 'added' | 'skipped' | 'replaced' }>}
     */
    restoreVideo(entry, { replace = false } = {}) {
      const parsed = bundleFromBackup(entry);
      if (!parsed.ok) return Promise.reject(new TjError('MD_INVALID', { detail: `${parsed.path} — ${parsed.reason}` }));
      const videoId = parsed.bundle.videoId;
      checkId(videoId);
      return exclusive(async () => {
        await ready();
        for (let attempt = 1; ; attempt++) {
          // بلا checkRaw: الموجود (ولو تالفًا) يُتخطى افتراضيًا فلا يُكتب فوقه دون اختيار، والاستبدال الصريح يطمسه كله بما
          // في النسخة فيصلحه (تدقيق 5fedcb9، GM-006؛ كان التالف يرفض في الحالتين).
          const raw = rawBundle(await read(bundleReadKeys(videoId)), videoId);
          if (raw.record !== null && !replace) return { status: 'skipped' };
          const prior = raw.record !== null && Number.isInteger(raw.record.rev) && raw.record.rev > 0 ? raw.record.rev : 0;
          const next = structuredClone(parsed.bundle);
          next.record.rev = prior + 1;
          syncActive(next);
          assertValid(validateBundle(next), 'bundle');
          // كما في writeBundle: إعادة فحص السجل قبل الكتابة مباشرة، فسجلٌ أنشأه سياق آخر بين القراءة والكتابة يُعاد تقييم
          // تخطيه بدل الكتابة فوقه بتقرير «أضيف» (CX-003). والتوابع اليتيمة لسجل غائب تُطمس برأس جديد.
          const { [videoKey(videoId)]: latest } = await read(videoKey(videoId));
          if (versionOf(latest) !== versionOf(raw.record)) {
            if (attempt >= 3) throw new TjError('ST_CONFLICT', { detail: `تغيّر أثناء الاستعادة: ${versionOf(raw.record)} ← ${versionOf(latest)}` });
            continue;
          }
          await write(itemsFor(next, raw, { forceHead: raw.record === null && hasCompanions(raw) }));
          wrote(videoId);
          remember(next);
          return { status: raw.record ? 'replaced' : 'added' };
        }
      });
    },

    /**
     * أحجام الحزمة بالبايت لكل مفتاح (لعرض سعة السابقة).
     * @param {string} videoId
     * @returns {Promise<{ record: number, alts: number, previous: number, marks: number }>}
     */
    async bundleBytes(videoId) {
      checkId(videoId);
      try {
        const [record, alts, previous, marks] = await Promise.all([videoKey, altsKey, prevKey, marksKey].map((k) => area.getBytesInUse(k(videoId))));
        return { record, alts, previous, marks };
      } catch (err) {
        throw new TjError('ST_READ_FAILED', { detail: String(err && err.message), cause: err });
      }
    },

    /**
     * المحفوظات للفرز: مُلخّص الفهرس وملخص الفرز ونماذج 1 2 3، الأحدث أولًا. يصلح الفهرس وينظّف اليتيم ويصالح الرأس
     * الذي لا يطابق سجله.
     * @returns {Promise<{ entry: IndexEntry, summary: SortSummary, slots: ReturnType<typeof slotModels> }[]>}
     */
    async listLibrary() {
      await ready();
      const entries = (await exclusive(syncIndex)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
      const ids = entries.map((e) => e.videoId);
      const heads = ids.length ? await read(ids.map(bundleKey)) : {};
      const out = [];
      for (const entry of entries) {
        const head = heads[bundleKey(entry.videoId)];
        if (head === undefined) {
          out.push({ entry, summary: trivialSummary(entry), slots: slotModelsFromIndex(entry) });
          continue;
        }
        // للرأس: الحزمة نفسها (تصالح إن لزم)؛ والتالف يُعرض بمُلخّص سجله ولا يوقف القائمة.
        let b = null;
        try {
          b = await readBundle(entry.videoId);
        } catch {
          b = null;
        }
        const fresh = b ? summarizeVideo(b.record) : entry;
        out.push({ entry: fresh, summary: b ? summarizeBundle(b) : trivialSummary(entry), slots: b ? slotModels(b) : slotModelsFromIndex(entry) });
      }
      return out;
    },

    /**
     * فهرس المحفوظات الأحدث تعديلًا أولًا. يصلح نفسه: مُلخّص مفقود أو غير صالح يُعاد بناؤه من سجله،
     * ومُلخّص بلا سجل يُحذف. قراءة المفاتيح مرة واحدة.
     * @returns {Promise<IndexEntry[]>}
     */
    async listIndex() {
      await ready();
      const entries = await exclusive(syncIndex);
      return entries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    },

    /**
     * معرّفات فيديوهات لها سجل في التخزين لا يُقرأ ولا مُلخّص صالح له، فلا تظهر في المحفوظات (تلف خارجي). تُذكر في تقرير
     * النسخة الاحتياطية «تعذّر»، وتُعدّ «موجودة» في معاينة الاستعادة فيُختار استبدالها (تدقيق 5fedcb9، CX-H4).
     * @returns {Promise<string[]>}
     */
    async unreadableVideos() {
      await ready();
      return (await exclusive(scanIndex)).unreadable;
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
        const out = { videos: {}, settings: null, index: false, cleared: false, prefs: null, bundles: [] };
        for (const [key, ch] of Object.entries(changes)) {
          const k = parseKey(key);
          if (!k) continue;
          if (k.kind === 'video') out.videos[k.videoId] = { oldValue: ch.oldValue ?? null, newValue: ch.newValue ?? null };
          else if (k.kind === 'settings') out.settings = { oldValue: ch.oldValue, newValue: ch.newValue };
          else if (k.kind === 'index') out.index = true;
          else if (k.kind === 'meta' && ch.newValue === undefined) out.cleared = true;
          else if (k.kind === 'prefs') out.prefs = { oldValue: ch.oldValue, newValue: ch.newValue };
          else if (COMPANION_KINDS.includes(k.kind) && !out.bundles.includes(k.videoId)) out.bundles.push(k.videoId);
        }
        if (Object.keys(out.videos).length || out.settings || out.index || out.cleared || out.prefs || out.bundles.length) fn(out);
      });
    },
  };
}
