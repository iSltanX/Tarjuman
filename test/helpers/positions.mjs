// مطابقة المواضع العشوائية: نص يوتيوب المعروض عند الموضع مقابل مقاطع SRT. منطق خالص بلا متصفح، يستورده الحزام الحي في
// test/live/p1/ واختبار الوحدة؛ ونُقل من test/live/p1/ (تدقيق 7a66f91، U103) فلا يستورد اختبار الوحدة ملفًا حيًا.
// يدوي: كلمات المعروض متتالية داخل المقاطع النشطة في نافذة ±250ms (و«تطابق تام» إن ساوت المقطع النشط).
// تلقائي: كلمات المعروض متتالية داخل مقاطع النافذة [t−5s، t+1s].
import { normalizeSpace, splitWords } from '../../src/core/convert/text.js';

/** مولّد عشوائي ببذرة مسجّلة (mulberry32) لإعادة الإنتاج. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** عشرة أزمنة موزعة: موضع عشوائي داخل كل عُشر من [5%، 95%] من المدة. */
export function randomPositions(durationSec, seed, count = 10) {
  const rnd = seeded(seed);
  const from = durationSec * 0.05;
  const span = (durationSec * 0.9) / count;
  return Array.from({ length: count }, (_, i) => Math.round((from + span * i + rnd() * span) * 1000) / 1000);
}

function containsRun(hay, needle) {
  if (needle.length === 0) return true;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

const norm = (w) => w.normalize('NFC');

/**
 * @param {{ startMs: number, endMs: number, text: string }[]} cues
 * @param {'manual' | 'asr'} kind
 * @param {number} tSec الزمن الفعلي بعد القفز
 * @param {string} displayed
 */
export function judgePosition(cues, kind, tSec, displayed) {
  const t = Math.round(tSec * 1000);
  const [lo, hi] = kind === 'asr' ? [t - 5000, t + 1000] : [t - 250, t + 250];
  const windowCues = cues.filter((c) => c.endMs > lo && c.startMs <= hi);
  const active = cues.filter((c) => c.startMs <= t && t < c.endMs);
  const shown = splitWords(displayed).map(norm);
  const pool = windowCues.flatMap((c) => splitWords(c.text)).map(norm);
  if (shown.length === 0) {
    return { t, verdict: active.length === 0 ? 'silence' : 'not-rendered', match: active.length === 0, activeText: active.map((c) => c.text).join(' | ') };
  }
  const match = containsRun(pool, shown);
  const exact = kind === 'manual' && active.length === 1 && normalizeSpace(active[0].text) === normalizeSpace(displayed);
  return {
    t, verdict: exact ? 'exact' : match ? 'contained' : 'mismatch', match,
    displayed: normalizeSpace(displayed), activeText: active.map((c) => normalizeSpace(c.text)).join(' | '),
  };
}
