// ملف الاستكمال (R52): مقاطع إنجليزية مختارة بأرقامها في الملف الكامل (غير متتالية عن قصد) وأزمنة البصمة، مع تعليمات الملحق
// ب. النص الإنجليزي من مصدر مثبت: المسار المحفوظ الذي صُدِّرت منه البصمة، ويُتحقق أنه يعيد البصمة نفسها عددًا وأزمنة وبصمة
// نص. في «مقاطع أطول» يُعاد اشتقاق الوضع من المسار العادي المحفوظ بالخيارات الافتراضية، ولا يُقبل إلا بمطابقة البصمة؛ وإلا
// يُعاد تجميع كلمات المسار التلقائي بحدود البصمة (regroupAsr، ن-٢)، ولا يُقبل إلا بمطابقة بصمة النص؛ وإلا رفض برمز. الملف
// يُعاد قراءته فيعطي الأرقام والأزمنة نفسها قبل التسليم. لا كتابة في التخزين.
import { joinList } from '../../i18n/index.js';
import { ASR_DEFAULTS } from '../convert/asr.js';
import { mergeLong } from '../convert/long.js';
import { SENTENCE_END, hasNoSpaceScript, normalizeSpace, wrapLines } from '../convert/text.js';
import { isVideoId } from '../model/ids.js';
import { sanitizeCues } from '../text/sanitize.js';
import { breaksSrtText } from '../srt/lenient.js';
import { parseSrtStrict } from '../srt/parser.js';
import { formatSrtTime } from '../srt/time.js';
import { textHash } from './hash.js';
import { patchInstructions } from './instructions.js';
import { DEFAULT_TARGET_LANG } from '../model/lang-prefs.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */
/** @typedef {import('../model/tracks.js').EnglishTrack} EnglishTrack */

/**
 * اسم ملف الاستكمال: VIDEOID.<lang>.<kind>.<mode>.patch.srt (والمترجم آليًا .from-<via>)، فيعيده النموذج برمز لغة الترجمة مكان
 * رمز لغة المسار كما تطلب التعليمات.
 * @param {{ videoId: string, lang: string, kind: string, mode: string, via?: string | null }} spec
 */
export const patchFileName = ({ videoId, lang, kind, mode, via = null }) => `${videoId}.${lang.replace(/_/g, '-')}${via ? `.from-${via.replace(/_/g, '-')}` : ''}.${kind}.${mode}.patch.srt`;

/**
 * المقاطع التي تعيد البصمة من المسار المحفوظ، أو null إن لم تطابقها.
 * @param {EnglishTrack} track @param {Fingerprint} fp
 * @returns {Cue[] | null}
 */
function provenSource(track, fp) {
  const base = track.cues;
  const cues = fp.mode === 'long' ? mergeLong(base).cues.map((c, i) => ({ n: i + 1, ...c })) : base.map((c, i) => ({ ...c, n: i + 1 }));
  const same = cues.length === fp.count && cues.every((c, i) => c.startMs === fp.cues[i].startMs && c.endMs === fp.cues[i].endMs);
  if (same && textHash(cues) === fp.textHash) return cues;
  return track.kind === 'asr' ? regroupAsr(base, fp) : null;
}

/**
 * مقاطع البصمة من مسار تلقائي أُعيد تحويله بعد تنزيلها بتجميع أحدث (ن-٢): ع-٣ صار يقطع مجموعة لا تتسع في سطرين، فمن نزّل في
 * 2.2.0 ثم أعاد التنزيل بعد الترقية صار مساره المحفوظ 1,066 مقطعًا وبصمة ترجمته 1,056. الكلمات هي هي بترتيبها، والفرق في مواضع
 * القطع وحدها؛ فتوضع حدود البصمة على كلمات المسار المحفوظ: حدٌّ زمنه زمنُ بداية مقطع محفوظ يقع عند أول كلماته (أزمنة البدايات
 * متزايدة تمامًا فلا يلتبس)، وغيره داخل مقطع محفوظ حيث يقطع محوّل ما قبل ع-٣ من الحد السابق: نهاية جملة أو تجاوز maxChars.
 * والنص بلفّ المحوّل (lineChars)، والأزمنة أزمنة البصمة. لا يُقبل إلا إن أعاد بصمة النص نفسها، وهي تشمل مواضع الحدود؛ وإلا null
 * فالرفض كما كان. والنص الذي لا يفصل كلماته بالمسافات لا يُعاد تجميعه هنا (لفّه يغيّر نصه المطبّع الذي تُحسب عليه البصمة).
 * @param {Cue[]} base مقاطع المسار المحفوظ بالوضع العادي @param {Fingerprint} fp
 * @returns {Cue[] | null}
 */
function regroupAsr(base, fp) {
  if (!base.length || base.some((c) => hasNoSpaceScript(c.text))) return null;
  const words = [];
  const startAt = new Map();
  for (const c of base) {
    const ws = normalizeSpace(c.text).split(' ').filter(Boolean);
    if (!ws.length || startAt.has(c.startMs)) return null;
    startAt.set(c.startMs, words.length);
    words.push(...ws);
  }
  const starts = new Set(startAt.values());
  if (fp.cues[0].startMs !== base[0].startMs) return null;
  const at = [0];
  for (let i = 1; i < fp.count; i++) {
    let k = startAt.get(fp.cues[i].startMs);
    if (k === undefined) {
      const from = at[i - 1];
      let chars = words[from].length;
      for (k = from + 1; k < words.length; k++) {
        if (SENTENCE_END.test(words[k - 1]) || chars + 1 + words[k].length > ASR_DEFAULTS.maxChars) break;
        chars += 1 + words[k].length;
      }
      // القطع المحسوب عند بداية مقطع محفوظ زمنها غير زمن البصمة: ليس هذا التجميع.
      if (k >= words.length || starts.has(k)) return null;
    }
    if (k <= at[i - 1]) return null;
    at.push(k);
  }
  const cues = fp.cues.map((t, i) => ({
    n: i + 1, startMs: t.startMs, endMs: t.endMs, text: wrapLines(words.slice(at[i], at[i + 1] ?? words.length).join(' '), ASR_DEFAULTS.lineChars),
  }));
  return textHash(cues) === fp.textHash ? cues : null;
}

const LIST_MAX = 8;
/** أول ثمانية أرقام ثم «…». @param {number[]} ns */
const numberList = (ns) => joinList(ns.slice(0, LIST_MAX)) + (ns.length > LIST_MAX ? '…' : '');

const validNumbers = (numbers, count) => Array.isArray(numbers) && numbers.length > 0
  && numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= count) && new Set(numbers).size === numbers.length;

/**
 * @param {{
 *   videoId: string, title?: string | null, fingerprint: Fingerprint, englishTracks: EnglishTrack[], numbers: number[],
 *   glossary?: import('./instructions.js').InstructionGlossary, target?: string | null
 * }} spec numbers أرقام المقاطع في الملف الكامل (1..count)، وtarget لغة الترجمة التي يُستكمل لها (AA1)، وglossary المصطلحات
 *   المرفقة لزوج الاستكمال (لغة المسار ← target) كما يعيدها termsFor (الفكرة ٨)، تمر إلى patchInstructions كما هي
 * @returns {{ ok: true, file: { name: string, text: string }, instructions: string, count: number } | { ok: false, code: string, params?: { list: string } }}
 *   instructions بفقرة القاموس عند وجوده (إضافة W6 على العقد بطلب P11)، كـpatchInstructions({ videoId, title, glossary }).
 *   لا يرمي: نص مختار يُقرأ رأسَ مقطع EX_PATCH_SOURCE_UNWRITABLE بأرقامه في params.list (تدقيق 7a66f91، U79).
 */
export function buildPatchPackage({ videoId, title = null, fingerprint, englishTracks, numbers, glossary = null, target = DEFAULT_TARGET_LANG }) {
  if (!isVideoId(videoId)) return { ok: false, code: 'TJ_BAD_VIDEO_ID' };
  if (!fingerprint || !Array.isArray(fingerprint.cues)) return { ok: false, code: 'EX_PATCH_NO_SOURCE' };
  if (fingerprint.videoId !== videoId) return { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' };
  const track = Array.isArray(englishTracks) ? englishTracks.find((t) => t?.key === fingerprint.trackKey) : null;
  if (!track || !Array.isArray(track.cues) || !track.cues.length) return { ok: false, code: 'EX_PATCH_NO_SOURCE' };
  const source = provenSource(track, fingerprint);
  if (!source) return { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' };
  if (!validNumbers(numbers, fingerprint.count)) return { ok: false, code: 'EX_PATCH_BAD_NUMBERS' };

  const picked = sanitizeCues([...numbers].sort((a, b) => a - b).map((n) => source[n - 1]), { controls: true }).cues;
  if (picked.some((c) => !(c.startMs < c.endMs) || String(c.text).split('\n').some((l) => l.trim() === ''))) {
    return { ok: false, code: 'EX_PATCH_SOURCE_MISMATCH' };
  }
  // سطر زمن أو رقم يليه زمن في النص يقطع الملف عند قراءته: رمز يسمّي المقاطع، لا خطأ يهرب من الزر (U79). والعنوان والسياج والوسوم
  // ومحارف الاتجاه نص إنجليزي كما في التصدير الكامل (markdown:false، عقد interfaces)، لا تحجب الملف (AV2 U-004).
  const unwritable = picked.filter((c) => breaksSrtText(c.text, { markdown: false })).map((c) => c.n);
  if (unwritable.length) return { ok: false, code: 'EX_PATCH_SOURCE_UNWRITABLE', params: { list: numberList(unwritable) } };
  const text = picked.map((c) => `${c.n}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}\n`).join('\n');
  // الذهاب والإياب بالمحلل الصارم كما في التصدير الكامل (verifyRoundTrip): لا تجريد وسوم ولا محارف، والعنوان والسياج نص. والمحلل
  // الصارم يشترط ترقيمًا متسلسلًا وأرقام الاستكمال غير متتالية عن قصد، فيُقرأ الملف بعد إعادة ترقيم كتله ويُفحص ترقيمه الأصلي
  // كتلةً كتلة؛ والمتسامح لا يصلح هنا لأنه يرفض «# » ويجرّد الوسوم (AV2 U-004).
  const blocks = text.split('\n\n');
  let back;
  try {
    back = parseSrtStrict(blocks.map((blk, i) => `${i + 1}${blk.slice(blk.indexOf('\n'))}`).join('\n\n'));
  } catch {
    return { ok: false, code: 'EX_INVARIANT_FAILED' };
  }
  const same = back.length === picked.length && blocks.every((blk, i) => blk.slice(0, blk.indexOf('\n')) === String(picked[i].n))
    && back.every((c, i) => c.startMs === picked[i].startMs && c.endMs === picked[i].endMs && c.text === picked[i].text);
  if (!same) return { ok: false, code: 'EX_INVARIANT_FAILED' };
  return {
    ok: true,
    file: { name: patchFileName({ videoId, lang: track.lang, kind: track.kind, mode: fingerprint.mode, via: track.via ?? null }), text },
    instructions: target && target !== track.lang ? patchInstructions({ videoId, title, glossary, source: track.lang, target }) : null,
    count: picked.length,
  };
}
