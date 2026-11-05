// ملف الاستكمال (R52): مقاطع إنجليزية مختارة بأرقامها في الملف الكامل (غير متتالية عن قصد) وأزمنة البصمة، مع تعليمات الملحق
// ب. النص الإنجليزي من مصدر مثبت: المسار المحفوظ الذي صُدِّرت منه البصمة، ويُتحقق أنه يعيد البصمة نفسها عددًا وأزمنة وبصمة
// نص. في «مقاطع أطول» يُعاد اشتقاق الوضع من المسار العادي المحفوظ بالخيارات الافتراضية، ولا يُقبل إلا بمطابقة البصمة؛ وإلا
// رفض برمز. الملف يُعاد قراءته فيعطي الأرقام والأزمنة نفسها قبل التسليم. لا كتابة في التخزين.
import { mergeLong } from '../convert/long.js';
import { isVideoId } from '../model/ids.js';
import { breaksSrtText, parseSrtLenient } from '../srt/lenient.js';
import { formatSrtTime } from '../srt/time.js';
import { textHash } from './hash.js';
import { patchInstructions } from './instructions.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */
/** @typedef {import('../model/tracks.js').EnglishTrack} EnglishTrack */

/**
 * اسم ملف الاستكمال: VIDEOID.en.<kind>.<mode>.patch.srt، فيعيده النموذج بـar مكان en كما تطلب التعليمات.
 * @param {{ videoId: string, lang: string, kind: string, mode: string }} spec
 */
export const patchFileName = ({ videoId, lang, kind, mode }) => `${videoId}.${lang.replace(/_/g, '-')}.${kind}.${mode}.patch.srt`;

/**
 * المقاطع التي تعيد البصمة من المسار المحفوظ، أو null إن لم تطابقها.
 * @param {EnglishTrack} track @param {Fingerprint} fp
 * @returns {Cue[] | null}
 */
function provenSource(track, fp) {
  const base = track.cues;
  const cues = fp.mode === 'long' ? mergeLong(base).cues.map((c, i) => ({ n: i + 1, ...c })) : base.map((c, i) => ({ ...c, n: i + 1 }));
  if (cues.length !== fp.count) return null;
  if (!cues.every((c, i) => c.startMs === fp.cues[i].startMs && c.endMs === fp.cues[i].endMs)) return null;
  return textHash(cues) === fp.textHash ? cues : null;
}

const LIST_MAX = 8;
/** أول ثمانية أرقام ثم «…». @param {number[]} ns */
const numberList = (ns) => ns.slice(0, LIST_MAX).join('، ') + (ns.length > LIST_MAX ? '…' : '');

const validNumbers = (numbers, count) => Array.isArray(numbers) && numbers.length > 0
  && numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= count) && new Set(numbers).size === numbers.length;

/**
 * @param {{
 *   videoId: string, title?: string | null, fingerprint: Fingerprint, englishTracks: EnglishTrack[], numbers: number[],
 *   glossary?: { source: string, target: string, note?: string | null }[] | null
 * }} spec numbers أرقام المقاطع في الملف الكامل (1..count)
 * @returns {{ ok: true, file: { name: string, text: string }, instructions: string, count: number } | { ok: false, code: string, params?: { list: string } }}
 *   instructions بفقرة القاموس عند وجوده (إضافة W6 على العقد بطلب P11)، كـpatchInstructions({ videoId, title, glossary }).
 *   لا يرمي: نص مختار يُقرأ رأسَ مقطع EX_PATCH_SOURCE_UNWRITABLE بأرقامه في params.list (تدقيق 7a66f91، U79).
 */
export function buildPatchPackage({ videoId, title = null, fingerprint, englishTracks, numbers, glossary = null }) {
  if (!isVideoId(videoId)) return { ok: false, code: 'TJ_BAD_VIDEO_ID' };
  if (!fingerprint || !Array.isArray(fingerprint.cues)) return { ok: false, code: 'EX_PATCH_NO_SOURCE' };
  if (fingerprint.videoId !== videoId) return { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' };
  const track = Array.isArray(englishTracks) ? englishTracks.find((t) => t?.key === fingerprint.trackKey) : null;
  if (!track || !Array.isArray(track.cues) || !track.cues.length) return { ok: false, code: 'EX_PATCH_NO_SOURCE' };
  const source = provenSource(track, fingerprint);
  if (!source) return { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' };
  if (!validNumbers(numbers, fingerprint.count)) return { ok: false, code: 'EX_PATCH_BAD_NUMBERS' };

  const picked = [...numbers].sort((a, b) => a - b).map((n) => source[n - 1]);
  if (picked.some((c) => !(c.startMs < c.endMs) || String(c.text).split('\n').some((l) => l.trim() === ''))) {
    return { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' };
  }
  // سطر زمن أو رقم يليه زمن في النص يقطع الملف عند قراءته: رمز يسمّي المقاطع، لا خطأ يهرب من الزر (U79).
  const unwritable = picked.filter((c) => breaksSrtText(c.text)).map((c) => c.n);
  if (unwritable.length) return { ok: false, code: 'EX_PATCH_SOURCE_UNWRITABLE', params: { list: numberList(unwritable) } };
  const text = picked.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');
  // الذهاب والإياب: الملف يُقرأ بالأرقام والأزمنة والنص نفسها.
  let back;
  try {
    back = parseSrtLenient(text);
  } catch {
    return { ok: false, code: 'EX_INVARIANT_FAILED' };
  }
  const same = back.cues.length === picked.length && back.notes.length === 0
    && back.cues.every((c, i) => c.n === picked[i].n && c.startMs === picked[i].startMs && c.endMs === picked[i].endMs && c.text === picked[i].text);
  if (!same) return { ok: false, code: 'EX_INVARIANT_FAILED' };
  return {
    ok: true,
    file: { name: patchFileName({ videoId, lang: track.lang, kind: track.kind, mode: fingerprint.mode }), text },
    instructions: patchInstructions({ videoId, title, glossary }),
    count: picked.length,
  };
}
