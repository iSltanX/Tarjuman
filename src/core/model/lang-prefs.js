// تفضيلات اللغات (AA1، حرية اللغات؛ عقد data-model §١٧): زوج تعليمات الترجمة الافتراضي («من» تلقائي من مسار الفيديو أو لغة
// بعينها، و«إلى»)، وتذكّر آخر زوج، واللغات الأخيرة، والزوج المختار لكل فيديو. في مفتاح langPrefs مستقل لا في prefs، لأن 1.1.0
// يقرأ prefs بمدقق صارم فيعدّ أي حقل جديد تلفًا. القراءة متسامحة لكل حقل، والكتابة صارمة. «إلى» الافتراضية العربية قيمةٌ
// افتراضية يغيّرها المستخدم من الإعدادات، لا افتراض في المنطق: لا شيء في الإضافة يفترض أن الترجمة إلى العربية.
import { isSourceLang, isVideoId } from './ids.js';
import { OK, exactKeys, fail, firstFailure, isPlainObject } from './validate.js';

export const LANG_PREFS_SCHEMA = 1;
/** «إلى» الافتراضية في الإعدادات (لوحة الإعدادات في الهوية: «إلى: العربية»)، ويغيّرها المستخدم. */
export const DEFAULT_TARGET_LANG = 'ar';
export const AUTO_SOURCE = 'auto';
export const LANG_PREFS_LIMITS = Object.freeze({ recent: 8, videos: 200 });

/**
 * @typedef {{ from: string | null, to: string | null }} LangPair from: رمز أو 'auto' (في الافتراضي) أو null «اختر لغة»
 * @typedef {{
 *   schema: 1, pair: { from: string, to: string | null }, remember: boolean, recent: string[], videos: Record<string, LangPair>
 * }} LangPrefs
 */

/** @type {Readonly<LangPrefs>} */
export const DEFAULT_LANG_PREFS = Object.freeze({
  schema: LANG_PREFS_SCHEMA,
  pair: Object.freeze({ from: AUTO_SOURCE, to: DEFAULT_TARGET_LANG }),
  remember: true,
  recent: Object.freeze([]),
  videos: Object.freeze({}),
});

const isCode = (x) => isSourceLang(x);
const isFrom = (x) => x === AUTO_SOURCE || isCode(x);

/** @param {unknown} p @param {string} path */
function validatePair(p, path, { allowAuto = false, allowNullFrom = false } = {}) {
  return firstFailure([
    () => exactKeys(p, ['from', 'to'], path),
    () => ((allowAuto ? isFrom(p.from) : isCode(p.from)) || (allowNullFrom && p.from === null) ? OK : fail(`${path}.from`, 'لغة غير صالحة')),
    () => (p.to === null || isCode(p.to) ? OK : fail(`${path}.to`, 'لغة غير صالحة')),
  ]);
}

/** @param {unknown} p */
export function validateLangPrefs(p) {
  const path = 'langPrefs';
  return firstFailure([
    () => exactKeys(p, ['schema', 'pair', 'remember', 'recent', 'videos'], path),
    () => (p.schema === LANG_PREFS_SCHEMA ? OK : fail(`${path}.schema`, 'إصدار غير معروف')),
    () => validatePair(p.pair, `${path}.pair`, { allowAuto: true }),
    () => (typeof p.remember === 'boolean' ? OK : fail(`${path}.remember`, 'ليس منطقيًا')),
    () => (Array.isArray(p.recent) && p.recent.length <= LANG_PREFS_LIMITS.recent && p.recent.every(isCode) && new Set(p.recent).size === p.recent.length
      ? OK : fail(`${path}.recent`, 'قائمة لغات غير صالحة')),
    () => (isPlainObject(p.videos) && Object.keys(p.videos).length <= LANG_PREFS_LIMITS.videos ? OK : fail(`${path}.videos`, 'ليست قائمة فيديوهات')),
    () => firstFailure(Object.entries(p.videos).map(([id, v]) => () => (isVideoId(id) ? validatePair(v, `${path}.videos.${id}`, { allowNullFrom: true }) : fail(`${path}.videos`, 'معرّف فيديو غير صالح')))),
  ]);
}

/**
 * القيمة كاملة من أي مدخل: كل حقل تالف يعود افتراضيه، ولا يُسقط غيره.
 * @param {unknown} raw
 * @returns {LangPrefs}
 */
export function normalizeLangPrefs(raw) {
  const r = isPlainObject(raw) ? raw : {};
  const pair = isPlainObject(r.pair) ? r.pair : {};
  const videos = {};
  if (isPlainObject(r.videos)) {
    for (const [id, v] of Object.entries(r.videos).slice(-LANG_PREFS_LIMITS.videos)) {
      if (isVideoId(id) && isPlainObject(v) && (v.from === null || isCode(v.from)) && (v.to === null || isCode(v.to))) videos[id] = { from: v.from, to: v.to };
    }
  }
  return {
    schema: LANG_PREFS_SCHEMA,
    pair: { from: isFrom(pair.from) ? pair.from : DEFAULT_LANG_PREFS.pair.from, to: pair.to === null || isCode(pair.to) ? pair.to : DEFAULT_LANG_PREFS.pair.to },
    remember: typeof r.remember === 'boolean' ? r.remember : DEFAULT_LANG_PREFS.remember,
    recent: Array.isArray(r.recent) ? [...new Set(r.recent.filter(isCode))].slice(0, LANG_PREFS_LIMITS.recent) : [],
    videos,
  };
}

/** اللغة في أول اللغات الأخيرة، بلا تكرار وفي الحد. @param {string[]} list @param {string} code */
export const withRecent = (list, code) => [code, ...list.filter((c) => c !== code)].slice(0, LANG_PREFS_LIMITS.recent);

/**
 * تعديل جزئي: pair (جزئي)، remember، recent (استبدال)، use (لغات استُعملت للتو تتقدّم في الأخيرة)، video ({ videoId, pair | null }:
 * زوج فيديو أو إزالته، والأحدث آخرًا فيُسقط الأقدم عند الحد).
 * @param {LangPrefs} cur
 * @param {{ pair?: Partial<LangPair>, remember?: boolean, recent?: string[], use?: string[], video?: { videoId: string, pair: LangPair | null }, videos?: Record<string, LangPair> }} patch
 * @returns {LangPrefs}
 */
export function applyLangPrefs(cur, patch) {
  const next = structuredClone(cur);
  if (!isPlainObject(patch)) return next;
  if (isPlainObject(patch.pair)) next.pair = { ...next.pair, ...patch.pair };
  if (patch.remember !== undefined) next.remember = patch.remember;
  if (patch.recent !== undefined) next.recent = patch.recent;
  if (Array.isArray(patch.use)) for (const c of [...patch.use].reverse()) if (isCode(c)) next.recent = withRecent(next.recent, c);
  // أزواج فيديوهات من نسخة احتياطية (AA3): تُضاف إلى الموجود ولا تمحوه، والأحدث آخرًا فيُسقط الأقدم عند الحد.
  if (isPlainObject(patch.videos)) {
    for (const [videoId, pair] of Object.entries(patch.videos)) {
      if (!isVideoId(videoId) || !isPlainObject(pair)) continue;
      delete next.videos[videoId];
      next.videos[videoId] = { from: pair.from ?? null, to: pair.to ?? null };
    }
    const ids = Object.keys(next.videos);
    for (const id of ids.slice(0, Math.max(0, ids.length - LANG_PREFS_LIMITS.videos))) delete next.videos[id];
  }
  if (isPlainObject(patch.video)) {
    const { videoId, pair } = patch.video;
    delete next.videos[videoId];
    if (pair) next.videos[videoId] = { from: pair.from ?? null, to: pair.to ?? null };
    const ids = Object.keys(next.videos);
    for (const id of ids.slice(0, Math.max(0, ids.length - LANG_PREFS_LIMITS.videos))) delete next.videos[id];
  }
  return next;
}

/**
 * زوج التعليمات المبدئي في نافذة الإضافة (AA3، قرار سلطان ق٥):
 * - «من» لفيديو: ما اختاره المستخدم لهذا الفيديو، وإلا لغة المسار الملتقط أو المنزَّل إن عُرفت بدقة (sourceLang من يوتيوب)
 *   حين يكون الافتراضي «تلقائي»، أو لغة الافتراضي إن كانت لغةً بعينها؛ وإلا null «اختر لغة». لا تخمين من نص أبدًا.
 * - «إلى»: المحفوظ لهذا الفيديو، وإلا الافتراضي (وهو آخر «إلى» اختيرت حين يكون «تذكّر آخر زوج» مفعّلًا، pairPatch).
 * - خارج صفحة فيديو: الافتراضي، و«من» التلقائي يأخذ «من» آخر زوج اختير لفيديو إن كان التذكّر مفعّلًا.
 * fromDetected: «من» هي اللغة المكتشفة نفسها (يُكتب تحتها «مكتشفة من ترجمة الفيديو»).
 * @param {LangPrefs} prefs @param {{ videoId?: string | null, sourceLang?: string | null }} [ctx]
 * @returns {{ from: string | null, to: string | null, fromDetected: boolean }}
 */
export function initialPair(prefs, { videoId = null, sourceLang = null } = {}) {
  const detected = isCode(sourceLang) ? sourceLang : null;
  const auto = prefs.pair.from === AUTO_SOURCE;
  if (!videoId) {
    const last = prefs.remember ? Object.values(prefs.videos).at(-1) ?? null : null;
    return { from: auto ? last?.from ?? null : prefs.pair.from, to: prefs.pair.to, fromDetected: false };
  }
  const saved = prefs.videos[videoId] ?? null;
  const from = saved?.from ?? (auto ? detected : prefs.pair.from);
  return { from, to: saved?.to ?? prefs.pair.to, fromDetected: detected !== null && from === detected };
}

/**
 * ما يُكتب حين يغيّر المستخدم الزوج في النافذة (AA3): اللغة التي اختارها تتقدّم في «الأخيرة»، وما غيّره يُحفظ للفيديو، و«إلى»
 * تصير الافتراضي حين يكون «تذكّر آخر زوج» مفعّلًا. «من» لا تُكتب في الافتراضي أبدًا، فلا يُفقد «تلقائي من مسار الفيديو».
 * @param {LangPrefs} prefs
 * @param {{ videoId?: string | null, pair: LangPair, why: 'from' | 'to' | 'swap' }} change
 * @returns {Parameters<typeof applyLangPrefs>[1]}
 */
export function pairPatch(prefs, { videoId = null, pair, why }) {
  const used = why === 'from' ? [pair.from] : why === 'to' ? [pair.to] : [pair.to, pair.from];
  /** @type {Parameters<typeof applyLangPrefs>[1]} */
  const patch = { use: used.filter(isCode) };
  if (videoId && isVideoId(videoId)) {
    // ما غيّره المستخدم وحده يُحفظ للفيديو، والآخر كما كان (وإلا null): «من» المكتشفة لا تُثبَّت فتتبع مسارًا يُلتقط لاحقًا، و«إلى»
    // الافتراضية لا تُثبَّت فتتبع الإعدادات.
    const saved = prefs.videos?.[videoId] ?? null;
    const from = why === 'to' ? saved?.from ?? null : pair.from;
    const to = why === 'from' ? saved?.to ?? null : pair.to;
    const p = { from: isCode(from) ? from : null, to: isCode(to) ? to : null };
    patch.video = { videoId, pair: p.from || p.to ? p : null };
  }
  if (prefs.remember && why !== 'from' && (pair.to === null || isCode(pair.to))) patch.pair = { to: pair.to };
  return patch;
}
