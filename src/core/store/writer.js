// الكاتب الواحد (عقد storage §١٢، تدقيق 7a66f91، C2، قرار سلطان Q15): كل كتابة في chrome.storage.local من كل السياقات تمر
// به في العامل الخلفي، ولا يستدعي سياقٌ غيره set ولا remove ولا clear. الكتابة «مقارنة ثم تبديل»: السياق يحسب ما يكتبه من
// قراءته ويرسل النسخة التي بنى عليها، فيقارنها الكاتب بالحاضرة ويكتب في الخطوة نفسها، أو يرفض بـST_CONFLICT. ولا تقع بين
// المقارنة والكتابة كتابة أخرى، لأن لكل فيديو طابورًا واحدًا هنا، ولكل مفتاح عام طابوره، و«المسح» حاجز ينتظرها كلها.
// والقراءة تبقى مباشرة في كل سياق (index.js).
import { TjError } from '../errors/index.js';
import { COMPANION_VALIDATORS } from '../model/bundle.js';
import { isVideoId } from '../model/ids.js';
import { DEFAULT_PREFS, addTerm, mergePrefs, normalizePrefs, removeTerm, validatePrefs, validateTerm } from '../model/prefs.js';
import { DEFAULT_SETTINGS, mergeSettings, normalizeSettings, validateSettings } from '../model/settings.js';
import { assertValid, isPlainObject } from '../model/validate.js';
import { summarizeVideo, validateIndexEntry, validateVideoRecord } from '../model/video.js';
import { MESSAGE_VERSION, isStoreRequest } from '../model/messages.js';
import { KEY_META, KEY_PREFS, KEY_SAVES, KEY_SETTINGS, altsKey, bundleKey, companionKeys, indexKey, marksKey, prevKey, videoKey } from './keys.js';
import { MIGRATIONS, STORAGE_SCHEMA, migrate } from './migrate.js';
import { canonical, printKeys, rawPrint, versionOf } from './version.js';

/** عدد ردود الطلبات المحفوظة بمعرّفاتها: إعادة الإرسال بعد خطأ قناة تأخذ الرد نفسه ولا تكتب مرتين. */
export const APPLIED_LOG_MAX = 512;

const isQuotaError = (err) => /quota|QUOTA_BYTES/i.test(String(err && err.message));
/** مفاتيح توابع الفيديو وأنواعها في COMPANION_VALIDATORS. @param {string} id */
const companionKinds = (id) => [[bundleKey(id), 'head'], [altsKey(id), 'alts'], [prevKey(id), 'prev'], [marksKey(id), 'marks']];

/**
 * @param {{ area: import('./area.js').StorageArea, schema?: number, migrations?: Record<number, import('./migrate.js').MigrationStep> }} o
 * @returns {{ handle: (req: unknown) => Promise<{ v: 1, ok: boolean, value?: unknown, code?: string, detail?: string | null }> }}
 */
export function createWriter({ area, schema = STORAGE_SCHEMA, migrations = MIGRATIONS }) {
  /** @type {Map<string, Promise<void>>} آخر عمل في كل طابور */
  const lanes = new Map();
  let barrier = Promise.resolve();
  /** @type {Map<string, Promise<object>>} */
  const applied = new Map();

  /** عمل في طابور مفتاحه، بعد ما سبقه فيه وبعد أي «مسح» معلّق. */
  function inLane(lane, fn) {
    const run = Promise.all([lanes.get(lane), barrier]).then(fn);
    const tail = run.then(() => {}, () => {});
    lanes.set(lane, tail);
    tail.then(() => {
      if (lanes.get(lane) === tail) lanes.delete(lane);
    });
    return run;
  }

  /** «المسح»: ينتظر كل الطوابير، وما يصل بعده ينتظره. */
  function exclusiveAll(fn) {
    const run = Promise.all([...lanes.values(), barrier]).then(fn);
    barrier = run.then(() => {}, () => {});
    return run;
  }

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

  const checkId = (id) => {
    if (!isVideoId(id)) throw new TjError('TJ_BAD_VIDEO_ID', { detail: String(id).slice(0, 20) });
  };

  /**
   * نسخة الفيديو الحاضرة: من مُلخّصه الصغير إن طابق المتوقع، وإلا من السجل نفسه، فلا يرفض مُلخّص فاسد أو مفقود كتابة
   * صحيحة. المُلخّص يُكتب مع السجل في كل set من الإصدارين، فيطابقه.
   */
  async function versionNow(id, expected) {
    const { [indexKey(id)]: entry } = await read(indexKey(id));
    if (entry !== undefined && validateIndexEntry(entry).ok && entry.videoId === id && versionOf(entry) === expected) return expected;
    const { [videoKey(id)]: rec } = await read(videoKey(id));
    return versionOf(rec);
  }

  /** ما يُكتب لفيديو: مفاتيحه وحدها، وكل قيمة تجتاز مدققها، والمُلخّص والرأس يطابقان السجل. */
  function checkItems(id, items) {
    const bad = (detail) => new TjError('MD_INVALID', { detail: `${id}: ${detail}` });
    if (!isPlainObject(items)) throw bad('عناصر الكتابة');
    const allowed = new Set(printKeys(id));
    for (const k of Object.keys(items)) if (!allowed.has(k)) throw bad(`مفتاح خارج الفيديو: ${k.slice(0, 40)}`);
    const rec = items[videoKey(id)];
    const r = validateVideoRecord(rec);
    if (!r.ok) throw bad(`السجل: ${r.path} — ${r.reason}`);
    if (rec.videoId !== id) throw bad('السجل لفيديو آخر');
    const entry = items[indexKey(id)];
    if (!validateIndexEntry(entry).ok || entry.videoId !== id || entry.rev !== rec.rev || entry.updatedAt !== rec.updatedAt) throw bad('المُلخّص لا يطابق السجل');
    for (const [k, kind] of companionKinds(id)) {
      if (!Object.hasOwn(items, k)) continue;
      const v = items[k];
      const c = COMPANION_VALIDATORS[kind](v);
      if (!c.ok || v.videoId !== id) throw bad(`${kind}: ${c.ok ? 'لفيديو آخر' : `${c.path} — ${c.reason}`}`);
      if (kind === 'head' && (v.base.rev !== rec.rev || v.base.updatedAt !== rec.updatedAt || v.base.createdAt !== rec.createdAt)) throw bad('الرأس لا يطابق السجل');
    }
  }

  /**
   * كتابة حزمة على النسخة base. إن كانت الحاضرة بنسخة الطلب نفسه وقيمه نفسها فقد طُبّق قبل توقف العامل، فلا يُعاد. ونسخة
   * مطابقة بقيم أخرى كاتبٌ آخر بنى على base نفسها في الملي ثانية نفسها: تعارض (N02)، لا صدى.
   */
  async function put({ videoId: id, base, items }) {
    checkId(id);
    checkItems(id, items);
    const target = versionOf(items[videoKey(id)]);
    const now = await versionNow(id, base);
    if (now !== base) {
      if (now === target) {
        const stored = await read(Object.keys(items));
        if (Object.keys(items).every((k) => canonical(stored[k] ?? null) === canonical(items[k]))) return { version: target, already: true };
      }
      throw new TjError('ST_CONFLICT', { detail: `المتوقع ${base} والمخزَّن ${now}` });
    }
    await write(items);
    return { version: target };
  }

  /** حذف الفيديو كله: بلا شرط، أو إن طابقت نسخته base، أو بصمة قيمه الخام print (السجل غير المقروء). */
  async function del({ videoId: id, base, print }) {
    checkId(id);
    if (typeof print === 'string') {
      const raw = await read(printKeys(id));
      if (rawPrint(raw, id) !== print) {
        if (!Object.keys(raw).length) return { already: true };
        throw new TjError('ST_CONFLICT', { detail: `${id}: تغيّر السجل بعد عرض التأكيد` });
      }
    } else if (typeof base === 'string') {
      const now = await versionNow(id, base);
      if (now !== base && now !== 'none') throw new TjError('ST_CONFLICT', { detail: `المتوقع ${base} والمخزَّن ${now}` });
    }
    await removeKeys(printKeys(id));
    return {};
  }

  /** توابع ومُلخّص فيديو لا سجل له تُزال، بعد إعادة التحقق داخل طابوره؛ والاستعادة تمر بالطابور نفسه (I01). */
  async function orphan(id) {
    checkId(id);
    const { [videoKey(id)]: rec } = await read(videoKey(id));
    if (rec !== undefined) return false;
    await removeKeys([indexKey(id), ...companionKeys(id)]);
    return true;
  }

  /** يعيد بناء مُلخّص سجل صالح فقده أو فسد، من السجل نفسه. */
  async function repairIndex(id) {
    checkId(id);
    const { [videoKey(id)]: rec, [indexKey(id)]: entry } = await read([videoKey(id), indexKey(id)]);
    if (rec === undefined || !validateVideoRecord(rec).ok || rec.videoId !== id) return false;
    if (entry !== undefined && validateIndexEntry(entry).ok && entry.videoId === id && versionOf(entry) === versionOf(rec)) return false;
    await write({ [indexKey(id)]: summarizeVideo(rec) });
    return true;
  }

  const eachId = (ids, fn) => {
    if (!Array.isArray(ids) || ids.length > 100000) throw new TjError('MD_INVALID', { detail: 'videoIds' });
    return Promise.all(ids.map((id) => inLane(`video:${id}`, () => fn(id)))).then((r) => r.filter(Boolean).length);
  };

  async function settings({ patch }) {
    const { [KEY_SETTINGS]: raw } = await read(KEY_SETTINGS);
    const next = mergeSettings(normalizeSettings(raw ?? DEFAULT_SETTINGS), patch);
    assertValid(validateSettings(next), 'settings');
    await write({ [KEY_SETTINGS]: next });
    return next;
  }

  async function prefs(req) {
    const { [KEY_PREFS]: raw } = await read(KEY_PREFS);
    const cur = normalizePrefs(raw ?? DEFAULT_PREFS);
    if (req.term !== undefined) {
      assertValid(validateTerm(req.term), 'term');
      const r = addTerm(cur, req.term);
      if (r.added) await write({ [KEY_PREFS]: r.prefs });
      return r;
    }
    if (req.removeKey !== undefined) {
      if (typeof req.removeKey !== 'string') throw new TjError('MD_INVALID', { detail: 'removeKey' });
      const r = removeTerm(cur, req.removeKey);
      if (r.removed) await write({ [KEY_PREFS]: r.prefs });
      return r;
    }
    const next = mergePrefs(cur, req.patch);
    assertValid(validatePrefs(next), 'prefs');
    await write({ [KEY_PREFS]: next });
    return next;
  }

  async function saves({ downloadId, at }) {
    if (!Number.isInteger(downloadId) || downloadId < 0 || typeof at !== 'string') throw new TjError('MD_INVALID', { detail: 'downloadId' });
    await write({ [KEY_SAVES]: { schema: 1, last: { downloadId, at } } });
    return {};
  }

  /** «مسح كل البيانات»: كل شيء ثم meta جديد، ويبقى إطفاء صور المحفوظات وحده (U05، Q10). */
  async function clear({ at }) {
    let thumbsOff = false;
    try {
      const { [KEY_PREFS]: raw } = await area.get(KEY_PREFS);
      thumbsOff = raw?.ui?.thumbnails === false;
    } catch {
      thumbsOff = false;
    }
    try {
      await area.clear();
    } catch (err) {
      throw new TjError('ST_WRITE_FAILED', { detail: String(err && err.message), cause: err });
    }
    await migrate(area, { schema, migrations, now: at });
    if (thumbsOff) await write({ [KEY_PREFS]: mergePrefs(DEFAULT_PREFS, { ui: { thumbnails: false } }) });
    return {};
  }

  function dispatch(req) {
    switch (req.op) {
      case 'ready': return inLane(KEY_META, () => migrate(area, { schema, migrations, now: req.at }));
      case 'put': return inLane(`video:${req.videoId}`, () => put(req));
      case 'delete': return inLane(`video:${req.videoId}`, () => del(req));
      case 'orphan': return eachId(req.videoIds, orphan);
      case 'index': return eachId(req.videoIds, repairIndex);
      case 'settings': return inLane(KEY_SETTINGS, () => settings(req));
      case 'prefs': return inLane(KEY_PREFS, () => prefs(req));
      case 'saves': return inLane(KEY_SAVES, () => saves(req));
      case 'clear': return exclusiveAll(() => clear(req));
      default: return Promise.reject(new TjError('TJ_BAD_MESSAGE', { detail: String(req.op).slice(0, 20) }));
    }
  }

  const toReply = (err) => (err instanceof TjError
    ? { v: MESSAGE_VERSION, ok: false, code: err.code, detail: err.detail ?? null }
    : { v: MESSAGE_VERSION, ok: false, code: 'ST_WRITE_FAILED', detail: String(err && err.message) });

  return {
    /**
     * طلب واحد من أي سياق. المعرّف الجاري ينتظر الوعد نفسه، والمنتهي يعيد رده المحفوظ.
     * @param {unknown} req
     */
    handle(req) {
      if (!isStoreRequest(req)) return Promise.resolve({ v: MESSAGE_VERSION, ok: false, code: 'TJ_BAD_MESSAGE', detail: null });
      const seen = applied.get(req.wid);
      if (seen) return seen;
      const reply = Promise.resolve()
        .then(() => dispatch(req))
        .then((value) => ({ v: MESSAGE_VERSION, ok: true, ...(value === undefined ? {} : { value }) }), toReply);
      applied.set(req.wid, reply);
      while (applied.size > APPLIED_LOG_MAX) applied.delete(applied.keys().next().value);
      return reply;
    },
  };
}
