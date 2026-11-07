// علامات المراجعة وآخر موضع (عقد data-model §١٢، R53): العلامة ترتبط برقم المقطع وزمن بدايته وبصمة نصه في ترجمة محددة،
// وتُحل إلى «مرتبطة» أو «قد تكون انتقلت» أو «يتيمة» دون إلصاق بالرقم وحده، فيظهر مصيرها بعد الاستبدال والدمج والشطر.
// العلامة لا تحمل نصًا.
import { LIMITS, OK, eachOf, exactKeys, fail, firstFailure, isIntIn, isIsoDate } from './validate.js';

export const MARK_KINDS = Object.freeze(['todo', 'done']);
/** نافذة البحث عن نص المقطع نفسه بعد انتقال زمنه (تصحيح انجراف أو إزاحة). */
export const MOVE_WINDOW_MS = 10000;
const HASH_RE = /^[0-9a-f]{8}$/;

/**
 * @typedef {import('./cue.js').Cue} Cue
 * @typedef {{ n: number, startMs: number, textHash: string, kind: 'todo' | 'done', at: string }} Mark
 * @typedef {{ n: number, startMs: number, at: string }} Position
 * @typedef {{ state: 'linked' | 'moved' | 'orphan', index: number | null }} MarkResolution
 */

const encoder = new TextEncoder();

/**
 * بصمة نص المقطع: FNV-1a بـ32 بت لبايتات UTF-8 بعد التشذيب وطيّ المسافات، بثمانية محارف ست عشرية.
 * @param {string} text
 */
export function cueTextHash(text) {
  let h = 0x811c9dc5;
  for (const b of encoder.encode(String(text).trim().replace(/\s+/g, ' '))) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** مرساة العلامة من المقطع. @param {Cue} cue */
export const markAnchor = (cue) => ({ n: cue.n, startMs: cue.startMs, textHash: cueTextHash(cue.text) });

/** المرساة نفسها (الرقم والزمن والبصمة). */
export const sameAnchor = (a, b) => a.n === b.n && a.startMs === b.startMs && a.textHash === b.textHash;

/** @param {unknown} m @param {string} [path] */
export function validateMark(m, path = 'mark') {
  return firstFailure([
    () => exactKeys(m, ['n', 'startMs', 'textHash', 'kind', 'at'], path),
    () => (isIntIn(m.n, 1, LIMITS.maxCues * 10) ? OK : fail(`${path}.n`, 'رقم مقطع غير صالح')),
    () => (isIntIn(m.startMs, 0, LIMITS.maxTimeMs) ? OK : fail(`${path}.startMs`, 'زمن غير صالح')),
    () => (typeof m.textHash === 'string' && HASH_RE.test(m.textHash) ? OK : fail(`${path}.textHash`, 'بصمة نص غير صالحة')),
    () => (MARK_KINDS.includes(m.kind) ? OK : fail(`${path}.kind`, 'نوع علامة غير معروف')),
    () => (isIsoDate(m.at) ? OK : fail(`${path}.at`, 'تاريخ غير صالح')),
  ]);
}

/** @param {unknown} list @param {string} [path] */
export function validateMarks(list, path = 'marks') {
  return firstFailure([
    () => eachOf(list, path, LIMITS.maxMarks, validateMark),
    () => {
      const keys = list.map((m) => `${m.n}|${m.startMs}|${m.textHash}`);
      return new Set(keys).size === keys.length ? OK : fail(path, 'علامتان للمقطع نفسه');
    },
  ]);
}

/** @param {unknown} p @param {string} [path] */
export function validatePosition(p, path = 'position') {
  if (p === null) return OK;
  return firstFailure([
    () => exactKeys(p, ['n', 'startMs', 'at'], path),
    () => (isIntIn(p.n, 1, LIMITS.maxCues * 10) && isIntIn(p.startMs, 0, LIMITS.maxTimeMs) ? OK : fail(path, 'موضع غير صالح')),
    () => (isIsoDate(p.at) ? OK : fail(`${path}.at`, 'تاريخ غير صالح')),
  ]);
}

/**
 * فهرس بصمات المقاطع مرة واحدة لحل علامات كثيرة.
 * @param {Cue[]} cues
 */
export function prepareCues(cues) {
  const hashes = cues.map((c) => cueTextHash(c.text));
  const exact = new Map();
  hashes.forEach((h, i) => {
    const k = `${h}|${cues[i].startMs}`;
    if (!exact.has(k)) exact.set(k, []);
    exact.get(k).push(i);
  });
  return { cues, hashes, exact };
}

/**
 * حلّ ارتباط العلامة بالمقاطع الحالية لترجمتها (الجدول في عقد data-model §١٢).
 * @param {{ n: number, startMs: number, textHash: string }} mark
 * @param {Cue[]} cues
 * @param {ReturnType<typeof prepareCues>} [prep]
 * @returns {MarkResolution}
 */
export function resolveMark(mark, cues, prep = prepareCues(cues)) {
  const same = prep.exact.get(`${mark.textHash}|${mark.startMs}`);
  if (same?.length) {
    const best = same.slice().sort((a, b) => Math.abs(cues[a].n - mark.n) - Math.abs(cues[b].n - mark.n))[0];
    return { state: 'linked', index: best };
  }
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const d = Math.abs(c.startMs - mark.startMs);
    const sameText = prep.hashes[i] === mark.textHash && d <= MOVE_WINDOW_MS;
    const sameSpot = c.n === mark.n && c.startMs === mark.startMs;
    const contains = c.startMs <= mark.startMs && mark.startMs < Math.max(c.endMs, c.startMs + 1);
    if ((sameText || sameSpot || contains) && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best === null ? { state: 'orphan', index: null } : { state: 'moved', index: best };
}

/**
 * @param {Mark[]} marks @param {Cue[]} cues
 * @returns {(MarkResolution & { mark: Mark })[]}
 */
export function resolveMarks(marks, cues) {
  const prep = prepareCues(cues);
  return marks.map((mark) => ({ mark, ...resolveMark(mark, cues, prep) }));
}

/**
 * آخر موضع: أقرب مقطع بزمن البداية، أو null.
 * @param {Position | null} position @param {Cue[]} cues
 */
export function resolvePosition(position, cues) {
  if (!position || !cues.length) return null;
  let best = 0;
  for (let i = 1; i < cues.length; i++) if (Math.abs(cues[i].startMs - position.startMs) < Math.abs(cues[best].startMs - position.startMs)) best = i;
  return best;
}

/** @param {Mark[]} marks */
export const markCounts = (marks) => ({ todo: marks.filter((m) => m.kind === 'todo').length, done: marks.filter((m) => m.kind === 'done').length });
