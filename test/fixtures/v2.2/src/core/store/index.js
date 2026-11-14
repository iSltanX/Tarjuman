// وحدة التخزين (عقد docs/contracts/storage.md) فوق chrome.storage.local. سجل لكل فيديو ومُلخّصه في
// مفتاح فهرس مستقل يُكتبان في عملية set واحدة، فلا يتسابق سياقان على مفتاح فهرس مشترك. القراءة مباشرة في كل سياق،
// والكتابة كلها عبر الكاتب الواحد في العامل الخلفي (writer.js، §١٢؛ تدقيق 7a66f91، C2): السياق يحسب ما يكتبه من قراءته
// ويرسله مع النسخة التي بنى عليها، فيقارنها الكاتب بالحاضرة ويكتب في الخطوة نفسها أو يرفض بـST_CONFLICT. وكتابات السياق
// الواحد متسلسلة هنا أيضًا، فتُبنى كل كتابة على نتيجة التي قبلها.
import { TjError } from '../errors/index.js';
import { assertValid } from '../model/validate.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../model/settings.js';
import { DEFAULT_PREFS, normalizePrefs, sourceKey } from '../model/prefs.js';
import { DEFAULT_LANG_PREFS, normalizeLangPrefs } from '../model/lang-prefs.js';
import { normalizeUiLocale } from '../model/ui-locale.js';
import { storeRequest } from '../model/messages.js';
import { summarizeVideo, validateIndexEntry, validateVideoRecord } from '../model/video.js';
import { isVideoId, parseTrackKey } from '../model/ids.js';
import { validateLangValue } from '../model/lang-store.js';
import { slotPairs } from '../model/pair.js';
import { rankTracks } from '../model/track-order.js';
import {
  applyRecordChange, bundleFromBackup, bundleFromRecord, slotModels, summarizeBundle, syncActive, unpackBundle,
} from '../model/bundle.js';
import { validateAltsValue, validateBundle, validateHead, validateMarksValue } from '../model/slots.js';
import { chromeLocalArea } from './area.js';
import { bundleReadKeys, checkRaw, hasCompanions, itemsFor, rawBundle, salvageRaw } from './bundles.js';
import { computeCapacity } from './capacity.js';
import {
  COMPANION_KINDS, KEY_LANG_PREFS, KEY_META, KEY_PREFS, KEY_SAVES, KEY_SETTINGS, KEY_UI_LOCALE, altsKey, bundleKey, indexKey, langKey, marksKey, parseKey, prevKey, videoKey,
} from './keys.js';
// واجهة التخزين تعرض للصفحات والمتحكم ما تحتاجه من النموذج للحزمة دون استيراد إضافي.
export { bundleFromRecord, slotModels } from '../model/bundle.js';
import { MIGRATIONS, STORAGE_SCHEMA } from './migrate.js';
import { createWriter } from './writer.js';
import { localTransport, messageTransport } from './transport.js';
import { printKeys, rawPrint, versionOf } from './version.js';

export { STORAGE_SCHEMA, MIGRATIONS } from './migrate.js';
export { computeCapacity, WARN_RATIO, FULL_RATIO, ADVISORY_BYTES } from './capacity.js';
export {
  videoKey, indexKey, bundleKey, altsKey, prevKey, marksKey, langKey, companionKeys, parseKey, KEY_META, KEY_SETTINGS, KEY_PREFS, KEY_SAVES, KEY_LANG_PREFS,
} from './keys.js';
export { createWriter } from './writer.js';
export { localTransport, messageTransport } from './transport.js';
export { versionOf } from './version.js';

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
 *   langPrefs: { oldValue: unknown, newValue: unknown } | null,
 *   bundles: string[], uiLocale?: { oldValue: unknown, newValue: unknown } | null
 * }} StoreChange langPrefs (AA3): تغيّر تفضيلات اللغات من أي سياق، وuiLocale لغة الواجهة ويغيب إن لم تتغير
 */

// كاتب واحد لكل مساحة في السياق نفسه (الاختبارات والأدوات): مخزنان على المساحة نفسها يمرّان به كما يمرّ سياقان في المتصفح
// بالعامل الخلفي. المساحة المغلّفة بنسخ خصائصها ({ ...area }) تحمل origin إلى الأصل، فتشاركه ما دامت تكتب به (غلاف قراءة).
// وغلاف يستبدل set أو remove أو clear (حقن فشل الكتابة) يأخذ كاتبًا يكتب من خلاله، كعامل خلفي تفشل كتابته.
const writers = new WeakMap();

/**
 * @param {import('./area.js').StorageArea & { origin?: import('./area.js').StorageArea }} area
 * @param {{ schema?: number, migrations?: Record<number, import('./migrate.js').MigrationStep> }} [opts]
 */
export function sharedWriter(area, { schema = STORAGE_SCHEMA, migrations = MIGRATIONS } = {}) {
  const origin = area.origin ?? area;
  const base = area.set === origin.set && area.remove === origin.remove && area.clear === origin.clear ? origin : area;
  let byMigrations = writers.get(base);
  if (!byMigrations) writers.set(base, (byMigrations = new Map()));
  let bySchema = byMigrations.get(migrations);
  if (!bySchema) byMigrations.set(migrations, (bySchema = new Map()));
  if (!bySchema.has(schema)) bySchema.set(schema, createWriter({ area: base, schema, migrations }));
  return bySchema.get(schema);
}

const newWid = () => globalThis.crypto.randomUUID();

/**
 * @param {{
 *   area?: import('./area.js').StorageArea,
 *   now?: () => number,
 *   schema?: number,
 *   migrations?: Record<number, import('./migrate.js').MigrationStep>,
 *   transport?: import('./transport.js').StoreTransport,
 * }} [opts] بلا area ولا transport: chrome.storage.local للقراءة والعامل الخلفي للكتابة (الإنتاج). وبـarea وحدها: الكاتب
 *   المشترك لتلك المساحة في السياق نفسه. والعامل الخلفي يمرّر transport إلى كاتبه.
 */
export function createStore({ area, now = () => Date.now(), schema = STORAGE_SCHEMA, migrations = MIGRATIONS, transport } = {}) {
  if (!transport) transport = area ? localTransport(sharedWriter(area, { schema, migrations })) : messageTransport(globalThis.chrome.runtime);
  area ??= chromeLocalArea();
  const iso = () => new Date(now()).toISOString();
  let readyPromise = null;
  let chain = Promise.resolve();
  /** كتابات هذا السياق واحدة بعد أخرى، فلا يضيع تعديل بين قراءة وكتابة متزامنتين. */
  const exclusive = (fn) => {
    const p = chain.then(fn);
    chain = p.catch(() => {});
    return p;
  };

  /** طلب إلى الكاتب الواحد؛ رده المرفوض TjError برمزه. */
  async function call(op, args = {}) {
    const r = await transport.send(storeRequest(op, args, newWid()));
    if (r.ok) return r.value;
    throw new TjError(r.code, { detail: r.detail ?? undefined });
  }
  /**
   * بعد حذف بيانات فيديو: يزيل زوج لغاته من langPrefs فلا يبقى معرّفه محليًا ولا في النسخة الاحتياطية (تدقيق V2، U-019). عبر
   * طابور التفضيلات في الكاتب نفسه فتبقى كتابات التفضيلات الأخرى سليمة، وبلا كتابة إن لم يكن له زوج. وحذف ترجمة واحدة لا يمرّ
   * من هنا فيبقى الزوج؛ واختيارات ما قبل الحفظ لا تُكنس إلا بحذف فيديو بعينه.
   */
  async function dropLangPair(videoId) {
    const { [KEY_LANG_PREFS]: raw } = await read(KEY_LANG_PREFS);
    if (raw !== undefined && Object.hasOwn(normalizeLangPrefs(raw).videos, videoId)) await call('langPrefs', { patch: { video: { videoId, pair: null } } });
  }
  const isConflict = (err) => err instanceof TjError && err.code === 'ST_CONFLICT';

  // الترحيل مرة لكل سياق: meta بالإصدار الحالي يكفي بلا رسالة (الحالة الدائمة)، وإلا يرحّل الكاتب أو يرفض الأحدث.
  const ready = () => {
    readyPromise ??= (async () => {
      const { [KEY_META]: meta } = await read(KEY_META);
      if (meta && typeof meta === 'object' && meta.schema === schema) return { from: schema, to: schema, migrated: false };
      return call('ready', { at: iso() });
    })().catch((err) => {
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

  /** يحذف توابع فيديو لا سجل له: الكاتب يعيد التحقق من غياب السجل داخل طابور الفيديو، فلا يسبقه استعادة (I01). */
  const removeOrphan = (videoId) => call('orphan', { videoIds: [videoId] });

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
    if (cur.changed) {
      try {
        return await exclusive(() => writeBundle(videoId, () => undefined));
      } catch (err) {
        // فشل كتابة المصالحة (حصة أو انقطاع أو بيانات لا تجتاز التحقق) لا يجعل الفيديو غير مقروء ما دامت الحزمة المصالحة في
        // الذاكرة صالحة: تُخدَم دون تذكّر، وتُعاد الكتابة في القراءة التالية (تدقيق V2، U-012). الحزمة غير الصالحة تبقى خطأً.
        if (!validateBundle(cur.bundle).ok) throw err;
        return cur.bundle;
      }
    }
    return (writes.get(videoId) ?? 0) === gen ? remember(cur.bundle) : cur.bundle;
  }

  /**
   * لبّ الكتابة (داخل exclusive): قراءة ومصالحة، ثم fn، ثم طلب «مقارنة ثم تبديل» إلى الكاتب على النسخة المقروءة (عقد storage
   * §٨ و§١٢). fn تعيد حزمة أو null للحذف أو undefined لعدم التغيير (وما غيّرته المصالحة يُكتب حينئذ). إن كتب سياق آخر بين
   * القراءة والطلب رفضه الكاتب، فتُعاد fn على الأحدث (حتى ثلاث مرات)، أو يُرمى ST_CONFLICT إن مُرِّر expect.
   * @param {string} videoId
   * @param {(b: Bundle | null) => Bundle | null | undefined | Promise<Bundle | null | undefined>} fn
   * @param {{ expect?: VideoRecord | Bundle | null }} [opts]
   * @returns {Promise<Bundle | null>}
   */
  async function writeBundle(videoId, fn, { expect, touch = true } = {}) {
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
      const base = versionOf(cur.raw.record);
      try {
        if (draft === null) {
          if (cur.raw.record || hasCompanions(cur.raw)) await call('delete', { videoId, base });
          wrote(videoId);
          cache.delete(videoId);
          await dropLangPair(videoId);
          return null;
        }
        const at = iso();
        const prior = cur.raw.record;
        const next = structuredClone(draft);
        next.videoId = videoId;
        // touch: false لكتابة لا تعدّل المحتوى (لغة الترجمة، AA3): المراجعة تتقدم فيرى كل سياق التغيير، وتاريخ التعديل وترتيب المحفوظات كما هما.
        next.record = { ...next.record, videoId, rev: (prior?.rev ?? 0) + 1, createdAt: prior?.createdAt ?? at, updatedAt: touch || !prior ? at : prior.updatedAt };
        syncActive(next);
        assertValid(validateBundle(next), 'video');
        // سجل جديد لمعرّف بقيت له توابع يتيمة (حذفه الأول): رأس جديد، والتوابع القديمة تُطمس بقيمها الجديدة.
        await call('put', { videoId, base, items: itemsFor(next, cur.raw, { forceHead: !prior && hasCompanions(cur.raw) }) });
        wrote(videoId);
        return remember(next);
      } catch (err) {
        if (!isConflict(err) || expect !== undefined || attempt >= 3) throw err;
      }
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
    // مُلخّصات وتوابع بلا سجل: يزيلها الكاتب بعد إعادة التحقق داخل طابور كل فيديو (I01).
    const orphans = new Set([...index, ...COMPANION_KINDS.flatMap((kind) => [...ids(kind)])].filter((id) => !videos.has(id)));
    if (orphans.size) await call('orphan', { videoIds: [...orphans] });
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
      const repaired = [];
      for (const id of missing) {
        const rec = recs[videoKey(id)];
        if (!validateVideoRecord(rec).ok) continue;
        entries.set(id, summarizeVideo(rec));
        repaired.push(id);
      }
      if (repaired.length) await call('index', { videoIds: repaired });
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
      // الدمج على القيمة الحاضرة في الكاتب نفسه: رقعتا مجموعتين من سياقين لا تمحو إحداهما الأخرى (N21).
      return exclusive(async () => {
        await ready();
        return call('settings', { patch });
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
        return call('prefs', { patch });
      });
    },

    /** @returns {Promise<import('../model/lang-prefs.js').LangPrefs>} تفضيلات اللغات كاملة دائمًا (AA1، عقد storage §١٣) */
    async getLangPrefs() {
      await ready();
      const { [KEY_LANG_PREFS]: raw } = await read(KEY_LANG_PREFS);
      return normalizeLangPrefs(raw ?? DEFAULT_LANG_PREFS);
    },

    /**
     * @param {Parameters<typeof import('../model/lang-prefs.js').applyLangPrefs>[1]} patch
     * @returns {Promise<import('../model/lang-prefs.js').LangPrefs>}
     */
    setLangPrefs(patch) {
      return exclusive(async () => {
        await ready();
        return call('langPrefs', { patch });
      });
    },

    /** @returns {Promise<import('../model/ui-locale.js').UiLocale | null>} إعداد لغة الواجهة المحفوظ، وnull قبل التهيئة (عقد storage §١٤) */
    async getUiLocale() {
      const { [KEY_UI_LOCALE]: raw } = await read(KEY_UI_LOCALE);
      return normalizeUiLocale(raw);
    },

    /**
     * التهيئة الأولى بإشارات هذا السياق؛ الكاتب يحسم بين السياقات ويعيد القيمة الموحّدة، ولا يغيّر قيمة موجودة.
     * @param {{ youtube?: unknown, browser?: unknown }} signals
     * @returns {Promise<import('../model/ui-locale.js').UiLocale>}
     */
    initUiLocale({ youtube = null, browser = null } = {}) {
      return call('uiLocaleInit', { youtube, browser, at: iso() });
    },

    /**
     * اختيار المستخدم للغة الواجهة.
     * @param {'ar' | 'en'} locale
     * @returns {Promise<import('../model/ui-locale.js').UiLocale>}
     */
    setUiLocale(locale) {
      return call('uiLocale', { locale, at: iso() });
    },

    /**
     * يضيف مصطلحًا إلى القاموس على أحدث تفضيلات، بمفتاحه الموحّد (تدقيق 7a66f91، U13): لا يُسقط مصطلحًا أضافته صفحة أخرى، والمكرر
     * والحد يُفحصان على المخزَّن نفسه.
     * @param {import('../model/prefs.js').GlossaryTerm} term
     * @returns {Promise<{ prefs: import('../model/prefs.js').Prefs, added: boolean, reason: 'duplicate' | 'limit' | null }>}
     */
    addTerm(term) {
      return exclusive(async () => {
        await ready();
        return call('prefs', { term });
      });
    },

    /**
     * يحذف مصطلحًا بإنجليزيه (بلا اعتبار لحالة الأحرف) على أحدث تفضيلات (U13).
     * @param {string} source @returns {Promise<{ prefs: import('../model/prefs.js').Prefs, removed: boolean }>}
     */
    removeTerm(source) {
      return exclusive(async () => {
        await ready();
        return call('prefs', { removeKey: sourceKey(String(source)) });
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
        await call('saves', { downloadId, at: iso() });
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
     * للنسخة الاحتياطية وحدها (U94): حزمة فيديو تابعٌ له تالف، من سجله وتوابعه السليمة، وأسماء ما استُبعد. قراءة فقط، والأصل
     * التالف يبقى (لا يُحذف ولا يُصلَح هنا). null إن كان السجل نفسه لا يُقرأ.
     * @param {string} videoId
     * @returns {Promise<{ bundle: Bundle, dropped: ('head' | 'alts' | 'prev' | 'marks')[] } | null>}
     */
    async salvageBundle(videoId) {
      checkId(videoId);
      await ready();
      const s = salvageRaw(rawBundle(await read(bundleReadKeys(videoId)), videoId), videoId);
      if (!s) return null;
      const { bundle } = unpackBundle(s.raw);
      return bundle ? { bundle: structuredClone(bundle), dropped: s.dropped } : null;
    },

    /**
     * مثل updateVideo على الحزمة: fn(نسخة أو null) تعيد حزمة أو null أو undefined. كتابة ذرية واحدة.
     * @param {string} videoId
     * @param {(b: Bundle | null) => Bundle | null | undefined | Promise<Bundle | null | undefined>} fn
     * @param {{ expect?: VideoRecord | Bundle | null }} [opts]
     * @returns {Promise<Bundle | null>}
     */
    updateBundle(videoId, fn, { expect, touch = true } = {}) {
      checkId(videoId);
      return exclusive(async () => {
        await ready();
        const next = await writeBundle(videoId, fn, { expect, touch });
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

    /**
     * يحذف الفيديو كله. `expect` (سجل أو حزمة أو مُلخّص) يقيّده بنسخة رآها المستخدم، و`print` (من rawPrint) بقيم سجل لا يُقرأ
     * كما عُرض في تأكيده (تدقيق 7a66f91، U08)؛ فإن تغيّر منذئذ رُفض بـST_CONFLICT ولم يُحذف شيء.
     * @param {string} videoId @param {{ expect?: VideoRecord | Bundle | IndexEntry | null, print?: string }} [opts]
     */
    deleteVideo(videoId, { expect, print } = {}) {
      checkId(videoId);
      return exclusive(async () => {
        await ready();
        wrote(videoId);
        cache.delete(videoId);
        await call('delete', { videoId, ...(expect !== undefined ? { base: versionOf(expect) } : {}), ...(print !== undefined ? { print } : {}) });
        await dropLangPair(videoId);
      });
    },

    /**
     * بصمة القيم الخام لمفاتيح الفيديو الستة كما هي ولو لم تُقرأ (لتأكيد حذف السجل التالف، U08).
     * @param {string} videoId @returns {Promise<string>}
     */
    async rawPrint(videoId) {
      checkId(videoId);
      await ready();
      return rawPrint(await read(printKeys(videoId)), videoId);
    },

    /**
     * واجهة كتابة الاستعادة (عقد storage §١٠، backup.md §٦): الموجود يُتخطى افتراضيًا، والتواريخ كما في النسخة.
     * @param {unknown} entry مدخل فيديو من النسخة الاحتياطية
     * @param {{ replace?: boolean, expect?: VideoRecord | Bundle | IndexEntry | null | { print: string } }} [opts] expect نسخة الفيديو
     *   عند المعاينة (null = لم يكن موجودًا): إن تغيّر بعدها لا يُكتب شيء والحالة changed (تدقيق 7a66f91، U11). وللسجل غير المقروء
     *   { print } من rawPrint: تُقارَن القيم الخام هنا ثم داخل طابور الكاتب (تدقيق V2، U-023؛ النسخة لا تكفي لسجل لا يُقرأ)
     * @returns {Promise<{ status: 'added' | 'skipped' | 'replaced' | 'changed' }>}
     */
    restoreVideo(entry, { replace = false, expect } = {}) {
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
          const byPrint = expect !== undefined && expect !== null && typeof expect.print === 'string';
          if (byPrint) {
            if (rawPrint(await read(printKeys(videoId)), videoId) !== expect.print) return { status: 'changed' };
          } else if (expect !== undefined && versionOf(raw.record) !== versionOf(expect)) return { status: 'changed' };
          if (raw.record !== null && !replace) return { status: 'skipped' };
          const prior = raw.record !== null && Number.isInteger(raw.record.rev) && raw.record.rev > 0 ? raw.record.rev : 0;
          const next = structuredClone(parsed.bundle);
          next.record.rev = prior + 1;
          syncActive(next);
          assertValid(validateBundle(next), 'bundle');
          // كما في writeBundle: الكاتب يقارن بالنسخة المقروءة، فسجلٌ أنشأه سياق آخر بين القراءة والكتابة يُعاد تقييم تخطيه بدل
          // الكتابة فوقه بتقرير «أضيف» (CX-003). والتوابع اليتيمة لسجل غائب تُطمس برأس جديد.
          try {
            await call('put', { videoId, base: versionOf(raw.record), ...(byPrint ? { print: expect.print } : {}), items: itemsFor(next, raw, { forceHead: raw.record === null && hasCompanions(raw) }) });
          } catch (err) {
            if (isConflict(err) && attempt < 3) continue;
            throw err;
          }
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
      // الرأس المطابق لمُلخّصه (كتبهما الإصدار الثاني معًا) يكفي للفرز: ملخصه والأسماء والنشطة، ومعه الخانات غير النشطة
      // والعلامات في قراءة واحدة للكل، بلا السجلات ولا السوابق (عقد data-model §١٥ وR46: «دون قراءة الترجمات»؛ تدقيق 5fedcb9،
      // GM-009: كانت كل حزمة تُقرأ كاملة واحدة بعد أخرى). وما لا يطابق أو لا يصح يمر بالقراءة الكاملة والمصالحة كما كان.
      const matching = (entry) => {
        const h = heads[bundleKey(entry.videoId)];
        return h !== undefined && validateHead(h).ok && h.videoId === entry.videoId && h.base.rev === entry.rev && h.base.updatedAt === entry.updatedAt;
      };
      const quick = entries.filter(matching).map((e) => e.videoId);
      // وبلا رأس (سجل الإصدار الأول، أو فيديو بترجمة واحدة كتبه 2.0.0 فلا رأس له): مرافق اللغة وحدها، في القراءة نفسها.
      const headless = entries.filter((e) => heads[bundleKey(e.videoId)] === undefined).map((e) => e.videoId);
      const light = quick.length || headless.length ? await read([...quick.flatMap((id) => [altsKey(id), marksKey(id), langKey(id)]), ...headless.map(langKey)]) : {};
      /** مرافق اللغة الصالحة للفيديو، وإلا null (التالف كأنه غائب). */
      const langOf = (entry) => {
        const lv = light[langKey(entry.videoId)] ?? null;
        return lv && validateLangValue(lv).ok && lv.videoId === entry.videoId ? lv : null;
      };
      /**
       * مرافق لغة صالح لكنه لا يطابق سجل الصف (كتب السجلَّ إصدارٌ سابق دونه: حذفه ثم رفع سجل جديد، أو استبدل ترجمة باسمها): لا يُقرن
       * بالصف، ويمر الفيديو بالقراءة الكاملة التي تصالحه (تدقيق V2، U-014).
       */
      const staleLang = (entry) => {
        const lv = langOf(entry);
        return !!lv && (lv.base.rev !== entry.rev || lv.base.updatedAt !== entry.updatedAt);
      };
      /**
       * مرجع في مرافق اللغة لخانة ممتلئة (مرجعها بصمة مسار بغير الإنجليزية): مُلخّص الصف من السجل المسقَط يصفّر المقارنة، فيُقرأ
       * الفيديو كاملًا كما مع أكثر من مسار أصل (تدقيق V2، U-009). ولا تُنسخ المقارنة إلى الصف: تعود متقادمة بعد الاستكمال.
       */
      const hasForeignRef = (entry, filled) => {
        const lv = langOf(entry);
        return !!lv && lv.slots.some((m, i) => m && m.ref && filled[i]);
      };
      // مسارات الأصل بغير الإنجليزية في المرافق (AA1): تُضم إلى مُلخّص الصف كما في القراءة الكاملة، فتُصدَّر وتُعدّ من المحفوظات.
      const withSources = (entry) => {
        const lv = langOf(entry);
        const extra = lv ? lv.sources.filter((t) => !entry.english.some((x) => x.key === t.key)).map((t) => ({ key: t.key, kind: t.kind, cueCount: t.cues.length })) : [];
        return extra.length ? { ...entry, english: [...entry.english, ...extra] } : entry;
      };
      /**
       * الزوج اللغوي لكل خانة (AA3) من المُلخّص ومرافق اللغة دون قراءة السجلات: لغة الترجمة من المرافق إن طابقت هويتها ترجمة الخانة
       * (اسم الملف للنشطة، ومعه تاريخ الاستيراد لغيرها)، والأصل أول مسار بترتيب قائمة التحميل. القيمة التالفة كأنها غائبة.
       */
      const pairsFromHead = (entry, alts) => {
        if (staleLang(entry)) return null;
        const lang = langOf(entry);
        const sources = rankTracks([...entry.english.map((t) => parseTrackKey(t.key)), ...(lang?.sources ?? []).map((t) => parseTrackKey(t.key))].filter(Boolean));
        // أكثر من مسار أصل: مسار بصمة الترجمة في السجل لا في المُلخّص، فيُقرأ الفيديو كاملًا (القراءة البطيئة) بدل تخمين أوله.
        if (sources.length > 1) return null;
        const from = sources[0] ?? null;
        return [1, 2, 3].map((n) => {
          const meta = lang?.slots[n - 1] ?? null;
          const t = alts?.slots[n - 1]?.track ?? null;
          const activeHere = entry.arabic && !t;
          if (!t && !activeHere) return null;
          const same = meta && (t ? meta.importedAt === t.importedAt && meta.fileName === t.fileName : meta.fileName === entry.arabic.fileName);
          return { from: from?.lang ?? null, to: same ? meta.lang ?? null : null, via: from?.via ?? null };
        });
      };
      const fromHead = (entry, head) => {
        const alts = light[altsKey(entry.videoId)] ?? null;
        const marks = light[marksKey(entry.videoId)] ?? null;
        if ((alts !== null && (!validateAltsValue(alts).ok || alts.videoId !== entry.videoId)) || (marks !== null && (!validateMarksValue(marks).ok || marks.videoId !== entry.videoId))) return null;
        const slots = [1, 2, 3].map((n) => {
          const active = head.active === n;
          const t = active ? null : alts?.slots[n - 1]?.track ?? null;
          return {
            n, filled: active ? !!entry.arabic : !!t, active, name: head.names[n - 1],
            edited: active ? !!entry.arabic?.edited : !!t && t.current !== null,
            cueCount: active ? entry.arabic?.cueCount ?? 0 : t ? (t.current ?? t.original).length : 0,
          };
        });
        const pairs = pairsFromHead(entry, alts);
        if (!pairs || hasForeignRef(entry, slots.map((x) => x.filled))) return null;
        return { entry: withSources(entry), summary: head.summary, slots, pairs: slots.map((x) => (x.filled ? pairs[x.n - 1] : null)) };
      };
      const out = [];
      for (const entry of entries) {
        const head = heads[bundleKey(entry.videoId)];
        if (head === undefined) {
          // بلا رأس: الترجمة النشطة في الخانة 1. وبمرافق لغة (كتبها 2.0.0) يُقرأ الزوج منها كما مع الرأس: لغة الترجمة إن طابق اسم
          // ملفها، والأصل بترتيب قائمة التحميل، وأكثر من مسار أصل يمر بالقراءة الكاملة أدناه. وسجل الإصدار الأول بلا مرافق: لغة
          // الأصل من مُلخّصه، والترجمة «غير محددة» (المحفوظات تعرض ما كان يُعرض قبل 2.0.0 بلا قراءة السجل).
          const slots = slotModelsFromIndex(entry);
          const src = parseTrackKey(entry.english[0]?.key);
          const pairs = langOf(entry) ? pairsFromHead(entry, null) : [1, 2, 3].map(() => ({ from: src?.lang ?? null, to: null, via: src?.via ?? null }));
          if (pairs && !staleLang(entry) && !hasForeignRef(entry, slots.map((x) => x.filled))) {
            out.push({ entry: withSources(entry), summary: trivialSummary(entry), slots, pairs: slots.map((x) => (x.filled ? pairs[x.n - 1] : null)) });
            continue;
          }
        }
        const row = head !== undefined && quick.includes(entry.videoId) ? fromHead(entry, head) : null;
        if (row) {
          out.push(row);
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
        out.push({ entry: fresh, summary: b ? summarizeBundle(b) : trivialSummary(entry), slots: b ? slotModels(b) : slotModelsFromIndex(entry), pairs: b ? slotPairs(b) : [null, null, null] });
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

    /**
     * «مسح كل البيانات»: كل المحفوظات والإعدادات، ثم meta جديد. التأكيد شأن الواجهة. وإطفاء «صور الفيديو في المحفوظات» وحده
     * يبقى بعده (تدقيق 7a66f91، U05، قرار Q10): المسح لا يعيد الصور إلى افتراضيها فيُطلب من يوتيوب ما رفضه المستخدم.
     * @returns {Promise<{ reinit: 'ok' | 'failed', thumbs: 'kept' | 'failed' | null }>}
     */
    clearAll() {
      // الكاتب ينتظر كل كتابة جارية ثم يمسح، وما يصل بعده على نسخة قديمة يُرفض (N22). يُرمى ST_WRITE_FAILED إن تعذّر المسح
      // نفسه وحده؛ وبعد نجاحه يُعاد ما تعذّر من التهيئة وإبقاء إطفاء الصور نتيجةً لا خطأً (تدقيق 7a66f91، U56): كانت الصفحة تقول
      // «خطأ غير متوقع» والبيانات قد مُسحت.
      return exclusive(async () => {
        const r = await call('clear', { at: iso() });
        readyPromise = null;
        cache.clear();
        return { reinit: r?.reinit === 'failed' ? 'failed' : 'ok', thumbs: r?.thumbs === 'failed' ? 'failed' : r?.thumbs === 'kept' ? 'kept' : null };
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
        const out = { videos: {}, settings: null, index: false, cleared: false, prefs: null, langPrefs: null, bundles: [] };
        for (const [key, ch] of Object.entries(changes)) {
          const k = parseKey(key);
          if (!k) continue;
          if (k.kind === 'video') out.videos[k.videoId] = { oldValue: ch.oldValue ?? null, newValue: ch.newValue ?? null };
          else if (k.kind === 'settings') out.settings = { oldValue: ch.oldValue, newValue: ch.newValue };
          else if (k.kind === 'index') out.index = true;
          else if (k.kind === 'meta' && ch.newValue === undefined) out.cleared = true;
          else if (k.kind === 'prefs') out.prefs = { oldValue: ch.oldValue, newValue: ch.newValue };
          // تفضيلات اللغات (AA3): الصفحات والمشغّل يتبعون الزوج واللغات الأخيرة حين تتغير من سياق آخر.
          else if (k.kind === 'langPrefs') out.langPrefs = { oldValue: ch.oldValue ?? null, newValue: ch.newValue ?? null };
          else if (k.kind === 'uiLocale') out.uiLocale = { oldValue: ch.oldValue ?? null, newValue: ch.newValue ?? null };
          else if (COMPANION_KINDS.includes(k.kind) && !out.bundles.includes(k.videoId)) out.bundles.push(k.videoId);
        }
        if (Object.keys(out.videos).length || out.settings || out.index || out.cleared || out.prefs || out.langPrefs || out.uiLocale || out.bundles.length) fn(out);
      });
    },
  };
}
