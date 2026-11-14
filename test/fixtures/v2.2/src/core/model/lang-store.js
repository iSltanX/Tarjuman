// بيانات اللغة في التخزين (AA1، حرية اللغات؛ عقد storage §١٣): الحزمة في الذاكرة فيها مسارات بأي لغة ومترجمة آليًا (via)
// وترجمات بلغتها (lang)، والإصدار الأول و1.1.0 يقرآن السجل والتوابع بمدققات صارمة لا تعرف ذلك. فيُكتب لهما «إسقاط» بما
// يفهمانه وحده (المسارات الإنجليزية الأصلية وبصماتها، والترجمات بمفاتيحها الثمانية)، ويُكتب الباقي في مفتاح مرافق جديد
// lang:<id> يتجاهلانه (parseKey فيهما يعيده null). وعند القراءة يُدمج المرافق في الحزمة: المسارات والبصمات كما هي، ولغة كل
// ترجمة ومرجعها بمطابقة هويتها (importedAt وfileName) في خانتها، فما استبدله إصدار سابق لا يأخذ لغة غيره. لا حذف ولا ترحيل:
// المخطط يبقى 1 كقرار الإصدار الثاني (عقد storage §٧).
import { isV1Track, validateComparisonReport, validateFingerprint, validateSourceTrack } from './tracks.js';
import { isSourceLang, isVideoId } from './ids.js';
import { LIMITS, OK, eachOf, exactKeys, fail, firstFailure, isIntIn, isIsoDate, isText } from './validate.js';

export const LANG_SCHEMA = 1;

/**
 * @typedef {import('./tracks.js').ArabicTrack} ArabicTrack
 * @typedef {import('./tracks.js').ComparisonReport} ComparisonReport
 * @typedef {{ importedAt: string, fileName: string, lang: string | null, ref: { fingerprintId: string, comparison: ComparisonReport | null } | null }} TrackMeta
 * @typedef {{
 *   schema: 1, videoId: string, base: { rev: number, createdAt: string, updatedAt: string } | null,
 *   sources: object[], prints: object[], slots: (TrackMeta | null)[], previous: TrackMeta | null
 * }} LangValue
 */

const copy = (x) => structuredClone(x);

/**
 * الترجمة كما يقرؤها 1.1.0، وما يُحفظ عنها في المرافق: لغتها، ومرجعها إن أشار إلى بصمة لا يراها 1.1.0 (بصمة مسار بغير
 * الإنجليزية)، فيصير المرجع في الإسقاط null والمقارنة null (حالة يقبلها مدققه بلا ثوابت مقارنة).
 * @param {ArabicTrack} t @param {Set<string>} v1Prints
 * @returns {{ track: ArabicTrack, meta: TrackMeta | null }}
 */
export function storedTrack(t, v1Prints) {
  const { lang = null, ...rest } = t;
  const out = copy(rest);
  let ref = null;
  const foreign = (id) => id !== null && id !== undefined && !v1Prints.has(id);
  // المسح لمرجع بصمة لا يراها 1.1.0 وحده. ترجمة مرجعها فارغ ومقارنتها باقية لبصمة غائبة (أخلاها إصدار سابق) تبقى كما هي:
  // مدققا الأول و1.1.0 يقبلانها، والمسح كان يُسقط تحذيرها ويجعل نسخة 1.1.0 الاحتياطية تُرفض (تدقيق V2، U-011).
  if (out.fingerprintId !== null && out.fingerprintId !== undefined && (foreign(out.fingerprintId) || (out.comparison && foreign(out.comparison.fingerprintId)))) {
    ref = { fingerprintId: out.fingerprintId, comparison: out.comparison ? copy(out.comparison) : null };
    out.fingerprintId = null;
    out.comparison = null;
  }
  const meta = lang !== null || ref ? { importedAt: t.importedAt, fileName: t.fileName, lang, ref } : null;
  return { track: out, meta };
}

/**
 * إسقاط السجل: ما يقرؤه 1.1.0، والباقي للمرافق.
 * @param {import('./video.js').VideoRecord} record
 */
export function splitRecord(record) {
  const english = record.english.filter(isV1Track);
  const v1Keys = new Set(english.map((t) => t.key));
  const fingerprints = record.fingerprints.filter((f) => v1Keys.has(f.trackKey));
  const v1Prints = new Set(fingerprints.map((f) => f.id));
  const sources = record.english.filter((t) => !isV1Track(t));
  const prints = record.fingerprints.filter((f) => !v1Keys.has(f.trackKey));
  const active = record.arabic ? storedTrack(record.arabic, v1Prints) : null;
  return {
    record: { ...copy(record), english: copy(english), fingerprints: copy(fingerprints), arabic: active ? active.track : null },
    activeMeta: active ? active.meta : null,
    sources: copy(sources),
    prints: copy(prints),
    v1Prints,
  };
}

/** قيمة المرافق الفارغة: لا حاجة إلى كتابتها إن لم يكن مفتاحها موجودًا. @param {LangValue} v */
export const isEmptyLang = (v) => !v.sources.length && !v.prints.length && v.slots.every((x) => x === null) && v.previous === null;

/** هل الترجمة في الخانة هي التي وُصفت (لم يستبدلها إصدار سابق). @param {ArabicTrack | null} t @param {TrackMeta | null} m */
const sameTrack = (t, m) => !!t && !!m && t.importedAt === m.importedAt && t.fileName === m.fileName;

/**
 * يدمج المرافق في حزمة فُكّت من قيم 1.1.0 (يعدّلها في مكانها). المسارات والبصمات تُضاف بلا تكرار وفي الحدود (ما يشير إليه
 * مرجع يبقى)، ولغة الترجمة ومرجعها لا يُطبَّقان إلا على الترجمة نفسها في خانتها.
 * @param {import('./slots.js').Bundle} b
 * @param {LangValue} v
 * @returns {boolean} هل اختلف شيء عما وُصف (تُعاد الكتابة لتحديث النسخة)
 */
export function mergeLang(b, v) {
  let stale = false;
  const r = b.record;
  const keys = new Set(r.english.map((t) => t.key));
  for (const s of v.sources) if (!keys.has(s.key)) r.english.push(copy(s));
  const ids = new Set(r.fingerprints.map((f) => f.id));
  for (const f of v.prints) if (!ids.has(f.id)) r.fingerprints.push(copy(f));
  const apply = (track, meta) => {
    if (!meta) return;
    if (!sameTrack(track, meta)) {
      stale = true;
      return;
    }
    if (meta.lang !== null) track.lang = meta.lang;
    if (meta.ref && track.fingerprintId === null && r.fingerprints.some((f) => f.id === meta.ref.fingerprintId)) {
      track.fingerprintId = meta.ref.fingerprintId;
      track.comparison = meta.ref.comparison ? copy(meta.ref.comparison) : null;
    }
  };
  for (const s of b.slots) {
    const meta = v.slots[s.n - 1];
    if (s.n === b.active) apply(r.arabic, meta);
    else apply(s.track, meta);
  }
  if (b.previous) apply(b.previous.track, v.previous);
  else if (v.previous) stale = true;
  // الحدود بعد الدمج: إصدار سابق قد يكون أضاف مسارات أو بصمات إنجليزية فوق ما يُحفظ هنا.
  const referenced = new Set([r.arabic?.fingerprintId, ...b.slots.map((s) => s.track?.fingerprintId), b.previous?.track.fingerprintId].filter(Boolean));
  const fit = fitLimits(r.english, r.fingerprints, referenced);
  if (fit.changed) {
    r.english = fit.english;
    r.fingerprints = fit.fingerprints;
    stale = true;
  }
  return stale;
}

/**
 * يعيد المسارات والبصمات إلى حدودها بقاعدة واحدة (تدقيق V2، U-012 وU-013؛ عقد storage §١٣): تُسقط الأقدم من البصمات غير المشار
 * إليها (بصمات المسارات بغير الإنجليزية أولًا ثم الإنجليزية)، ثم الأقدم من المسارات التي كل بصماتها غير مشار إليها (ولا بصمة
 * لها كذلك) مع بصماتها، والأجنبي أولًا. protectKey مسار لا يُسقط (المصدَّر الآن). ما هو مشار إليه لا يُسقط أبدًا، فإن امتلأ
 * بالمشار إليه وقف الإسقاط.
 * @param {object[]} english @param {object[]} fingerprints @param {Set<string>} referenced @param {string | null} [protectKey]
 * @returns {{ english: object[], fingerprints: object[], changed: boolean }}
 */
export function fitLimits(english, fingerprints, referenced, protectKey = null) {
  let en = english.slice();
  let fps = fingerprints.slice();
  let changed = false;
  /** الأقدم المقبول، وغير الإنجليزي أولًا. */
  const oldest = (list, ok, foreign) => {
    const f = list.findIndex((x) => ok(x) && foreign(x));
    return f !== -1 ? f : list.findIndex(ok);
  };
  while (fps.length > LIMITS.maxFingerprints) {
    const v1Keys = new Set(en.filter(isV1Track).map((t) => t.key));
    const i = oldest(fps, (f) => !referenced.has(f.id) && f.trackKey !== protectKey, (f) => !v1Keys.has(f.trackKey));
    if (i === -1) break;
    fps.splice(i, 1);
    changed = true;
  }
  while (en.length > LIMITS.maxEnglishTracks) {
    const droppable = (t) => t.key !== protectKey && !fps.some((f) => f.trackKey === t.key && referenced.has(f.id));
    const i = oldest(en, droppable, (t) => !isV1Track(t));
    if (i === -1) break;
    const { key } = en[i];
    en.splice(i, 1);
    fps = fps.filter((f) => f.trackKey !== key);
    changed = true;
  }
  return { english: en, fingerprints: fps, changed };
}

/**
 * قيمة المرافق لحزمة، مع إسقاط ترجماتها (الخانات غير النشطة والسابقة) لما يقرؤه 1.1.0. base يضبطها التخزين بعد rev.
 * @param {import('./slots.js').Bundle} b
 * @returns {{ record: import('./video.js').VideoRecord, lang: LangValue, alts: (ArabicTrack | null)[], previous: ArabicTrack | null }}
 */
export function packLang(b) {
  const split = splitRecord(b.record);
  const slots = [null, null, null];
  const alts = [null, null, null];
  for (const s of b.slots) {
    if (s.n === b.active) slots[s.n - 1] = split.activeMeta;
    else if (s.track) {
      const { track, meta } = storedTrack(s.track, split.v1Prints);
      alts[s.n - 1] = track;
      slots[s.n - 1] = meta;
    }
  }
  let previous = null;
  let prevMeta = null;
  if (b.previous) {
    const p = storedTrack(b.previous.track, split.v1Prints);
    previous = p.track;
    prevMeta = p.meta;
  }
  return {
    record: split.record,
    lang: { schema: LANG_SCHEMA, videoId: b.videoId, base: null, sources: split.sources, prints: split.prints, slots, previous: prevMeta },
    alts,
    previous,
  };
}

/** @param {unknown} m @param {string} path */
function validateMeta(m, path) {
  if (m === null) return OK;
  return firstFailure([
    () => exactKeys(m, ['importedAt', 'fileName', 'lang', 'ref'], path),
    () => (isIsoDate(m.importedAt) ? OK : fail(`${path}.importedAt`, 'تاريخ غير صالح')),
    () => (isText(m.fileName, LIMITS.maxFileNameChars) && m.fileName.length > 0 ? OK : fail(`${path}.fileName`, 'اسم ملف غير صالح')),
    () => (m.lang === null || isSourceLang(m.lang) ? OK : fail(`${path}.lang`, 'رمز لغة غير صالح')),
    () => (m.ref === null ? OK : firstFailure([
      () => exactKeys(m.ref, ['fingerprintId', 'comparison'], `${path}.ref`),
      () => (typeof m.ref.fingerprintId === 'string' ? OK : fail(`${path}.ref.fingerprintId`, 'معرّف بصمة غير صالح')),
      () => (m.ref.comparison === null ? OK : validateComparisonReport(m.ref.comparison, `${path}.ref.comparison`)),
    ])),
    () => (m.lang !== null || m.ref !== null ? OK : fail(path, 'وصف بلا لغة ولا مرجع يُكتب null')),
  ]);
}

/**
 * قيمة المرافق `lang:<id>` كما تُقرأ من التخزين.
 * @param {unknown} v @param {string} [path]
 */
export function validateLangValue(v, path = 'lang') {
  return firstFailure([
    () => exactKeys(v, ['schema', 'videoId', 'base', 'sources', 'prints', 'slots', 'previous'], path),
    () => (v.schema === LANG_SCHEMA ? OK : fail(`${path}.schema`, 'إصدار غير معروف')),
    () => (isVideoId(v.videoId) ? OK : fail(`${path}.videoId`, 'معرّف فيديو غير صالح')),
    () => exactKeys(v.base, ['rev', 'createdAt', 'updatedAt'], `${path}.base`),
    () => (isIntIn(v.base.rev, 1, Number.MAX_SAFE_INTEGER) && isIsoDate(v.base.createdAt) && isIsoDate(v.base.updatedAt) ? OK : fail(`${path}.base`, 'نسخة سجل غير صالحة')),
    () => eachOf(v.sources, `${path}.sources`, LIMITS.maxEnglishTracks, (t, p) => firstFailure([
      () => validateSourceTrack(t, p),
      () => (!isV1Track(t) ? OK : fail(p, 'مسار يقرؤه السجل نفسه')),
    ])),
    () => (new Set(v.sources.map((t) => t.key)).size === v.sources.length ? OK : fail(`${path}.sources`, 'مفتاح مسار مكرر')),
    () => eachOf(v.prints, `${path}.prints`, LIMITS.maxFingerprints, (f, p) => validateFingerprint(f, p)),
    () => (new Set(v.prints.map((f) => f.id)).size === v.prints.length ? OK : fail(`${path}.prints`, 'معرّف بصمة مكرر')),
    () => {
      const keys = new Set(v.sources.map((t) => t.key));
      const bad = v.prints.findIndex((f) => f.videoId !== v.videoId || !keys.has(f.trackKey));
      return bad === -1 ? OK : fail(`${path}.prints[${bad}]`, 'البصمة لفيديو آخر أو لمسار غير محفوظ هنا');
    },
    () => (Array.isArray(v.slots) && v.slots.length === 3 ? OK : fail(`${path}.slots`, 'ليست ثلاثة عناصر')),
    () => firstFailure(v.slots.map((m, i) => () => validateMeta(m, `${path}.slots[${i}]`))),
    () => validateMeta(v.previous, `${path}.previous`),
  ]);
}
