// ملف التصحيح والأجزاء المستلمة تباعًا (R52): ملف SRT صغير بأرقام الملف الكامل (غير متتالية عن قصد) يعيده النموذج من ملف
// الاستكمال. يثبت أنه لهذا الفيديو وهذا المرجع بالأرقام والأزمنة: كل مقطع رقمه داخل البصمة وزمنه زمنها حرفيًا. ثم خطة تضع
// كل مقطع في موضعه من الترجمة الحالية ولا تمس غيره: استبدال نص المقطع المقابل (بتوقيته وأرقامه كما هي)، أو إدراج الناقص
// بزمن البصمة مزاحًا بإزاحة جيرانه بين جاريه. المواضع من محاذاة الترجمة بالبصمة لا من الرقم وحده. والتطبيق دالة منفصلة
// بعد المعاينة.
import { shortList } from '../align/align.js';
import { ALIGN_DEFAULTS, alignCues, iou, toBlocks } from '../align/index.js';
import { isBlankText, untranslatedTest } from '../compare/compare.js';
import { parseTrackKey } from '../model/ids.js';
import { TjError, messageFor, toErrorInfo } from '../errors/index.js';
import { fnv1a64 } from '../export/hash.js';
import { LIMITS } from '../model/validate.js';
import { parseSrtLenient } from '../srt/lenient.js';
import { displayName, toList } from './files.js';
import { ltrInline } from '../../ui/format.js';
import { MAX_FILES, readFileText } from './read-file.js';
import { videoIdFromName } from './review.js';
import { bilingualCheck, withoutMatchedLines } from './bilingual.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */
/**
 * @typedef {{ n: number, action: 'replace' | 'insert', index: number, before: Cue | null, after: Cue }} PatchItem
 *   index: للاستبدال موضع المقطع في الترجمة، وللإدراج الموضع الذي يُدرج قبله (طول الترجمة = في آخرها).
 * @typedef {{ index: number, from: number, to: number, total: number, received: number, complete: boolean }} PartStatus
 * @typedef {{
 *   fingerprintId: string, count: number, base: { count: number, key: string }, items: PatchItem[],
 *   skipped: { n: number, reason: 'empty' | 'structure' | 'weak' }[], warnings: { code: string, params?: Record<string, string | number> }[],
 *   notes: string[], parts: PartStatus[] | null
 * }} PatchPlan
 */

const one = ({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text });

/** بصمة الترجمة التي حُسبت عليها الخطة: تغيّر أي مقطع بعد القراءة يمنع التطبيق. */
export const cuesKey = (cues) => `fnv1a64:${fnv1a64(cues.map((c) => `${c.n}\t${c.startMs}\t${c.endMs}\t${c.text}`).join('\n'))}`;

const TREND_SPAN = 5;

/**
 * مواضع البصمة في الترجمة: المقابل 1:1، وما دخل دمجًا أو شطرًا في الترجمة، وما يقابله مقطع بزمن لا يطابق زمنه بوضوح
 * (weak: لا يُستبدل، كمقطع أضافه المستخدم فوق موضع ساقط)، وموضع الإدراج لما لا مقابل له. التقابل الزمني يُقاس بعد طرح
 * وسيط فروق الأزواج المجاورة، فلا تُسقطه إزاحة عامة ولا انجراف تدريجي. وللإدراج: extra مقاطع الترجمة التي لا مقابل لها،
 * وshiftAt(i) وسيط فروق أقرب الأزواج إلى موضع لا مقابل له (خمسة من كل جهة، وصفر بلا أزواج).
 * @param {Fingerprint} fingerprint @param {Cue[]} cues
 */
function mapToFingerprint(fingerprint, cues) {
  const at = new Map();
  const structure = new Set();
  const weak = new Set();
  const insertAt = new Int32Array(fingerprint.count);
  const extra = new Uint8Array(cues.length);
  const onesBefore = new Int32Array(fingerprint.count);
  if (!cues.length) return { ok: true, at, structure, weak, insertAt, extra, shiftAt: () => 0 };
  const alignment = alignCues(fingerprint.cues.map((c) => ({ ...c, text: '' })), cues);
  if (alignment.confidence === 'low') return { ok: false, reasons: alignment.reasons };
  let seen = 0;
  const ones = [];
  for (const block of toBlocks(alignment.pairs)) {
    if (block.a.length && block.b.length) {
      if (block.a.length === 1 && block.b.length === 1) ones.push([block.a[0], block.b[0]]);
      else block.a.forEach((i) => structure.add(i));
    } else block.b.forEach((j) => { extra[j] = 1; });
    for (const i of block.a) {
      insertAt[i] = seen;
      onesBefore[i] = ones.length;
    }
    if (block.b.length) seen = block.b.at(-1) + 1;
  }
  const deltas = ones.map(([i, j]) => cues[j].startMs - fingerprint.cues[i].startMs);
  ones.forEach(([i, j], p) => {
    const near = deltas.slice(Math.max(0, p - TREND_SPAN), p + TREND_SPAN + 1).sort((x, y) => x - y);
    const shift = near[near.length >> 1];
    const f = fingerprint.cues[i];
    const c = cues[j];
    if (iou(f.startMs, f.endMs, c.startMs - shift, c.endMs - shift) >= ALIGN_DEFAULTS.weakIou) at.set(i, j);
    else weak.add(i);
  });
  const shiftAt = (i) => {
    const p = onesBefore[i];
    const near = deltas.slice(Math.max(0, p - TREND_SPAN), p + TREND_SPAN).sort((x, y) => x - y);
    return near.length ? near[near.length >> 1] : 0;
  };
  return { ok: true, at, structure, weak, insertAt, extra, shiftAt };
}

/** حالة كل جزء من الأرقام المستلمة (مواضع البصمة من 0). */
function statusOf(fingerprint, received) {
  if (!Array.isArray(fingerprint.parts)) return null;
  return fingerprint.parts.map(({ index, from, to }) => {
    let got = 0;
    for (let n = from; n <= to; n++) if (received.has(n - 1)) got++;
    return { index, from, to, total: to - from + 1, received: got, complete: got === to - from + 1 };
  });
}

function receivedOf(map, cues) {
  const received = new Set([...map.structure, ...map.weak]);
  for (const [i, j] of map.at) if (!isBlankText(cues[j].text)) received.add(i);
  return received;
}

/**
 * حالة استلام الأجزاء المشتقة من الترجمة الحالية (R52): لكل جزء من التقسيم الاحتياطي عدد مقاطعه المترجمة. null بلا أجزاء
 * أو حين لا تُحاذى الترجمة بالبصمة بثقة.
 * @param {Fingerprint} fingerprint @param {Cue[]} cues
 * @returns {PartStatus[] | null}
 */
export function partsStatus(fingerprint, cues) {
  if (!fingerprint?.parts) return null;
  const map = mapToFingerprint(fingerprint, cues);
  return map.ok ? statusOf(fingerprint, receivedOf(map, cues)) : null;
}

/**
 * @param {File | File[] | FileList} fileOrFiles ملف التصحيح، أو أجزاء مستلمة (أكثر من ملف يُجمع بالأرقام)
 * @param {{ fingerprint: Fingerprint, cues: Cue[], target?: string | null, originals?: { lang?: string, cues?: Cue[] }[] }} ctx البصمة التي بُني
 *   عليها ملف الاستكمال أو التقسيم، والترجمة الحالية، ولغتها لفحص «غير مترجم» (AA1: null لا فحص، والافتراضي العربية كما كان)، ومسار
 *   الأصل المحفوظ لحارس الملف الثنائي (الفكرة ١١، ح-49)
 * @returns {Promise<{ ok: true, plan: PatchPlan, bilingual: { count: number, total: number, line: 'last' | 'first', plan: PatchPlan | null } | null }
 *   | { ok: false, error: { code: string, message: string, line?: number } }>} bilingual: الملف مصدَّر «مع الأصل» (IM_BILINGUAL)، ومعه خطته
 *   بلا سطر الأصل (وملاحظتها) تعرضها المعاينة بنقرة «أزل سطر الأصل من كل مقطع»؛ ولا يُزال شيء قبلها.
 */
export async function readPatch(fileOrFiles, { fingerprint, cues = [], target = 'ar', originals = [] } = {}) {
  let multi = false;
  let current = null;
  try {
    if (!fingerprint || !Array.isArray(fingerprint.cues) || !fingerprint.cues.length) throw new TjError('IM_PATCH_NO_REFERENCE');
    const files = toList(fileOrFiles);
    if (!files.length) throw new TjError('IM_NO_FILE');
    if (files.length > MAX_FILES) throw new TjError('IM_TOO_MANY_FILES', { params: { count: files.length, max: MAX_FILES } });
    multi = files.length > 1;

    // التحقق أثناء القراءة: يتوقف عند أول ملف يثبت بطلانه ولا يقرأ البقية (تدقيق 7a66f91، U40).
    const check = patchChecker(fingerprint);
    const incoming = [];
    const notes = [];
    const warnings = [];
    let total = 0;
    for (const file of files) {
      current = displayName(file);
      const parsed = parseSrtLenient(await readFileText(file));
      // الحد على المجموع كما في readImport؛ والأرقام الفريدة داخل البصمة تحدّه بعددها، فهو حارس لا مسار معتاد.
      total += parsed.cues.length;
      if (total > LIMITS.maxCues) throw new TjError('IM_TOO_MANY_CUES', { params: { max: LIMITS.maxCues } });
      for (const c of [...parsed.cues].sort((x, y) => x.n - y.n)) check(c);
      incoming.push(...parsed.cues);
      // اسم الجزء معزول LTR كما في readImport (تحقق 2.3.0، ص-١٨).
      for (const note of parsed.notes) notes.push(multi ? `«${ltrInline(current)}»: ${note}` : note);
      const hint = videoIdFromName(current, { videoId: fingerprint.videoId });
      if (hint?.differs) warnings.push({ code: 'IM_PATCH_NAME_OTHER_VIDEO', params: { videoId: hint.videoId } });
    }
    current = null;
    incoming.sort((x, y) => x.n - y.n);
    const plan = planFrom(incoming, { fingerprint, cues, target, notes: [...notes], warnings: [...warnings] });
    const bi = bilingualCheck(incoming, originals);
    if (!bi) return { ok: true, plan, bilingual: null };
    let stripped = null;
    try {
      const removed = messageFor('IM_NOTE_BILINGUAL_REMOVED', { count: bi.count, line: bi.line });
      stripped = planFrom(withoutMatchedLines(incoming, bi), { fingerprint, cues, target, notes: [...notes, removed], warnings: [...warnings] });
    } catch {
      stripped = null;
    }
    return { ok: true, plan, bilingual: { count: bi.count, total: bi.total, line: bi.line, plan: stripped } };
  } catch (err) {
    const info = toErrorInfo(err);
    const error = { code: info.code, message: multi && current ? `«${ltrInline(current)}»: ${info.message}` : info.message };
    const line = err instanceof TjError ? err.params?.line : undefined;
    if (line) error.line = line;
    if (info.code === 'TJ_UNEXPECTED') error.detail = info.detail;
    return { ok: false, error };
  }
}

/**
 * فاحص مقاطع التصحيح بالبصمة: الرقم داخلها، والزمن زمنها حرفيًا، ولا تكرار. والمجموع لا يتجاوز عدد البصمة لأن الأرقام فريدة
 * داخلها. يرمي TjError عند أول مقطع باطل.
 * @param {Fingerprint} fingerprint
 * @returns {(c: Cue) => void}
 */
function patchChecker(fingerprint) {
  const byStart = new Map();
  fingerprint.cues.forEach((c, i) => { if (!byStart.has(c.startMs)) byStart.set(c.startMs, i); });
  const seen = new Set();
  return (c) => {
    if (seen.has(c.n)) throw new TjError('IM_PATCH_DUPLICATE', { params: { n: c.n } });
    seen.add(c.n);
    if (c.n > fingerprint.count) throw new TjError('IM_PATCH_OUT_OF_RANGE', { params: { n: c.n, count: fingerprint.count } });
    const s = fingerprint.cues[c.n - 1];
    if (c.startMs !== s.startMs || c.endMs !== s.endMs) {
      const k = byStart.get(c.startMs);
      if (k !== undefined && fingerprint.cues[k].endMs === c.endMs) throw new TjError('IM_PATCH_RENUMBERED', { params: { n: c.n, expected: k + 1 } });
      throw new TjError('IM_PATCH_TIME_MISMATCH', { params: { n: c.n } });
    }
  };
}

/**
 * الخطة من مقاطع مقروءة ومفحوصة بترتيب أرقامها: كل مقطع في موضعه من الترجمة الحالية (استبدال أو إدراج). يرمي TjError
 * (IM_PATCH_UNALIGNED أو IM_PATCH_NOTHING).
 * @param {Cue[]} incoming @param {{ fingerprint: Fingerprint, cues: Cue[], target: string | null, notes: string[], warnings: PatchPlan['warnings'] }} ctx
 * @returns {PatchPlan}
 */
function planFrom(incoming, { fingerprint, cues, target, notes, warnings }) {
  const map = mapToFingerprint(fingerprint, cues);
  if (!map.ok) throw new TjError('IM_PATCH_UNALIGNED', { params: { reasons: map.reasons.join(' ') } });
  /** @type {PatchItem[]} */
  const items = [];
  const skipped = [];
  for (const c of incoming) {
    const i = c.n - 1;
    if (isBlankText(c.text)) skipped.push({ n: c.n, reason: 'empty' });
    else if (map.structure.has(i)) skipped.push({ n: c.n, reason: 'structure' });
    else if (map.weak.has(i)) skipped.push({ n: c.n, reason: 'weak' });
    else if (map.at.has(i)) {
      const j = map.at.get(i);
      items.push({ n: c.n, action: 'replace', index: j, before: one(cues[j]), after: { ...one(cues[j]), text: c.text } });
    } else {
      // زمن البصمة بإزاحة جيرانه في الترجمة، فلا يسبقهم ولا يتأخر عنهم بإزاحة ثُبّتت (تحقق Gemini، ع-٢). وموضعه بين المقاطع
      // الزائدة المجاورة بمقارنة الزمن لا بترتيب المحاذاة (ع-١٢). وما بقي يكسر الترتيب مع جاريه أو يخرج عن حدود الزمن لا يُدرج:
      // يُتخطى بتحذير الموضع الضعيف، ولا قصّ صامت.
      const s = fingerprint.cues[i];
      const shift = map.shiftAt(i);
      const startMs = s.startMs + shift;
      const endMs = s.endMs + shift;
      let index = map.insertAt[i];
      while (index > 0 && map.extra[index - 1] && cues[index - 1].startMs > startMs) index--;
      while (index < cues.length && map.extra[index] && cues[index].startMs <= startMs) index++;
      const prev = cues[index - 1];
      const next = cues[index];
      if (startMs < 0 || endMs > LIMITS.maxTimeMs || (prev && prev.startMs > startMs) || (next && next.startMs < startMs)) {
        skipped.push({ n: c.n, reason: 'weak' });
      } else items.push({ n: c.n, action: 'insert', index, before: null, after: { n: c.n, startMs, endMs, text: c.text } });
    }
  }
  // لا مقطع مترجم أصلًا خطأ؛ أما ما تُخطّي لموضعه في الترجمة فخطة بلا بنود يشرحها التحذير.
  if (!items.length && skipped.every((x) => x.reason === 'empty')) throw new TjError('IM_PATCH_NOTHING');
  const listOf = (ns) => ({ list: shortList(ns) });
  const empty = skipped.filter((x) => x.reason === 'empty').map((x) => x.n);
  const structural = skipped.filter((x) => x.reason === 'structure').map((x) => x.n);
  const weakOnes = skipped.filter((x) => x.reason === 'weak').map((x) => x.n);
  const untranslated = untranslatedTest(target, parseTrackKey(fingerprint.trackKey)?.lang ?? null, cues);
  const noArabic = untranslated ? items.filter((x) => untranslated(x.after.text)).map((x) => x.n) : [];
  if (empty.length) warnings.push({ code: 'IM_PATCH_SKIPPED_EMPTY', params: listOf(empty) });
  if (structural.length) warnings.push({ code: 'IM_PATCH_SKIPPED_STRUCTURE', params: listOf(structural) });
  if (weakOnes.length) warnings.push({ code: 'IM_PATCH_SKIPPED_WEAK', params: listOf(weakOnes) });
  if (noArabic.length) warnings.push({ code: 'IM_PATCH_NO_ARABIC', params: listOf(noArabic) });

  const received = receivedOf(map, cues);
  for (const it of items) received.add(it.n - 1);
  return {
    fingerprintId: fingerprint.id, count: fingerprint.count, base: { count: cues.length, key: cuesKey(cues) },
    items, skipped, warnings, notes, parts: statusOf(fingerprint, received),
  };
}

/**
 * الخطة نفسها من مقاطع في الذاكرة لا من ملفات (ف3: ملف مرفوع قُرئ بالاستيراد): الفحص والمواضع كما في readPatch بلا ملاحظات
 * قراءة ولا قرينة اسم. لا يرمي.
 * @param {Cue[]} cues مقاطع الملف المرفوع
 * @param {{ fingerprint: Fingerprint, cues: Cue[], target?: string | null }} ctx البصمة، والترجمة الحالية، ولغتها
 * @returns {{ ok: true, plan: PatchPlan } | { ok: false, error: { code: string, message: string } }}
 */
export function planPatchCues(cues, { fingerprint, cues: current = [], target = 'ar' } = {}) {
  try {
    if (!fingerprint || !Array.isArray(fingerprint.cues) || !fingerprint.cues.length) throw new TjError('IM_PATCH_NO_REFERENCE');
    if (cues.length > LIMITS.maxCues) throw new TjError('IM_TOO_MANY_CUES', { params: { max: LIMITS.maxCues } });
    const incoming = [...cues].sort((x, y) => x.n - y.n);
    const check = patchChecker(fingerprint);
    for (const c of incoming) check(c);
    return { ok: true, plan: planFrom(incoming, { fingerprint, cues: current, target, notes: [], warnings: [] }) };
  } catch (err) {
    const info = toErrorInfo(err);
    return { ok: false, error: { code: info.code, message: info.message } };
  }
}

/**
 * تطبيق الخطة بعد المعاينة: الاستبدال نصًا في موضعه، والإدراج قبل موضعه بترتيب الأرقام، وكل ما عداها كما هو. وإن كانت الترجمة
 * متسلسلة الأرقام تصاعديًا وكسر الإدراج ذلك (ترجمة أُعيد ترقيمها بعد نقص، فيأخذ المُدرج رقم مقطع قائم)، أُعيد الترقيم من 1 فلا
 * يتكرر رقم (تدقيق 7a66f91، U96). ولا يُمس ترقيم كان شاذًا قبل الإدراج.
 * @param {Cue[]} cues الترجمة التي قُرئت عليها الخطة نفسها
 * @param {PatchPlan} plan
 * @param {{ only?: number[] }} [opts] أرقام المقاطع المختارة من الخطة (الافتراضي كلها)
 * @returns {{ cues: Cue[], renumbered: boolean }}
 * @throws {TjError} IM_PATCH_STALE إن تغيّرت الترجمة بعد القراءة
 */
export function applyPatchDetailed(cues, plan, { only } = {}) {
  if (!plan?.base || plan.base.count !== cues.length || plan.base.key !== cuesKey(cues)) throw new TjError('IM_PATCH_STALE');
  const pick = Array.isArray(only) ? new Set(only) : null;
  const replace = new Map();
  const inserts = new Map();
  for (const it of plan.items) {
    if (pick && !pick.has(it.n)) continue;
    if (it.action === 'replace') replace.set(it.index, it.after);
    else {
      if (!inserts.has(it.index)) inserts.set(it.index, []);
      inserts.get(it.index).push(it.after);
    }
  }
  const out = [];
  for (let k = 0; k <= cues.length; k++) {
    for (const c of (inserts.get(k) ?? []).sort((x, y) => x.n - y.n)) out.push(one(c));
    if (k < cues.length) out.push(one(replace.get(k) ?? cues[k]));
  }
  const increasing = (list) => list.every((c, i) => i === 0 || c.n > list[i - 1].n);
  if (out.length > cues.length && increasing(cues) && !increasing(out)) {
    return { cues: out.map((c, i) => ({ ...c, n: i + 1 })), renumbered: true };
  }
  return { cues: out, renumbered: false };
}

/**
 * applyPatchDetailed بالمقاطع وحدها (عقد interfaces §١٥).
 * @param {Cue[]} cues @param {PatchPlan} plan @param {{ only?: number[] }} [opts]
 * @returns {Cue[]}
 */
export const applyPatch = (cues, plan, opts) => applyPatchDetailed(cues, plan, opts).cues;
