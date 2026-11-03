// فحص الملف الوارد قبل الحفظ (R48 وR50): المراجع المرشحة مرتبة بالمطابقة الفعلية، والمقترح منها، وهل الترجيح مؤكد، وقرينة
// اسم الملف إن دل على فيديو. القرينة تنبيه لا رفض، ولا تُطلق على اسم مخصص: الرمز ذو الأحد عشر محرفًا يُقبل معرّفًا إن كان
// الفيديو الحالي أو فيديو في المحفوظات، أو جاء بنمط أسماء ترجمان، أو بدا عشوائيًا بوضوح (تبدّل أصناف المحارف ست مرات فأكثر،
// كما في المعرّفات الحقيقية، لا في Season2Ep10 أو TEDtalk2006 أو KenRobinson).
import { rankReferences } from '../compare/rank.js';

/** @typedef {import('../model/cue.js').Cue} Cue */
/** @typedef {import('../model/tracks.js').Fingerprint} Fingerprint */

export const REVIEW_THRESHOLDS = Object.freeze({ suggest: 0.5, certain: 0.8, gap: 0.1 });
const ID_LEN = 11;
const RANDOM_TRANSITIONS = 6;
const PATTERN_TRANSITIONS = 2;
// نمط أسماء ترجمان بعد المعرّف: .en.manual.normal أو .ar.asr.long، أو .manual.normal مباشرة.
const TARJUMAN_TAIL = /^\.(?:[A-Za-z]{2}(?:-[A-Za-z]+)?\.)?(?:manual|asr)\.(?:normal|long)\b/;

const charClass = (ch) => (/[A-Z]/.test(ch) ? 1 : /[a-z]/.test(ch) ? 2 : /\d/.test(ch) ? 3 : 4);
/** عدد مرات تبدّل صنف المحرف (كبير، صغير، رقم، شرطة) بين محرفين متجاورين. */
export function classTransitions(token) {
  let t = 0;
  for (let i = 1; i < token.length; i++) if (charClass(token[i]) !== charClass(token[i - 1])) t++;
  return t;
}

/**
 * الرموز المرشحة في الاسم مع ما يليها: أحد عشر محرفًا محاطة بغير محارف المعرّف، وفي سلسلة أطول كل نافذة بطوله يحيط بها من
 * جهتيها طرف السلسلة أو شرطة (فالمعرّف وسط «ar_iG9CE55wbtY_final» مرشح كطرفيها؛ تدقيق 5fedcb9، GM-026.1).
 */
function candidates(name) {
  const out = [];
  const re = /[A-Za-z0-9_-]+/g;
  let m;
  while ((m = re.exec(name))) {
    const run = m[0];
    if (run.length === ID_LEN) out.push({ token: run, after: name.slice(m.index + run.length) });
    else if (run.length > ID_LEN) {
      for (let i = 0; i + ID_LEN <= run.length; i++) {
        const opens = i === 0 || /[-_]/.test(run[i - 1]);
        const closes = i + ID_LEN === run.length || /[-_]/.test(run[i + ID_LEN]);
        if (opens && closes) out.push({ token: run.slice(i, i + ID_LEN), after: name.slice(m.index + i + ID_LEN) });
      }
    }
  }
  return out;
}

/**
 * معرّف الفيديو الذي يدل عليه اسم الملف، أو null.
 * @param {string} fileName
 * @param {{ videoId?: string | null, knownVideoIds?: string[] }} [ctx]
 * @returns {null | { videoId: string, differs: boolean }}
 */
export function videoIdFromName(fileName, { videoId = null, knownVideoIds = [] } = {}) {
  if (typeof fileName !== 'string' || !fileName) return null;
  const known = new Set(Array.isArray(knownVideoIds) ? knownVideoIds : []);
  const found = candidates(fileName);
  const rank = ({ token, after }) => {
    if (token === videoId) return 4;
    if (known.has(token)) return 3;
    if (TARJUMAN_TAIL.test(after) && classTransitions(token) >= PATTERN_TRANSITIONS) return 2;
    return classTransitions(token) >= RANDOM_TRANSITIONS ? 1 : 0;
  };
  let best = null;
  let bestRank = 0;
  for (const c of found) {
    const r = rank(c);
    if (r > bestRank) {
      best = c.token;
      bestRank = r;
    }
  }
  return best ? { videoId: best, differs: best !== videoId } : null;
}

/**
 * بصمتان لتصدير واحد بعينه (المسار والوضع والعدد والنص والأزمنة نفسها): الترجيح بينهما لا يغيّر شيئًا، وحفظ الثانية تكرار.
 * التعريف الوحيد لـ«التصدير نفسه» (الفحص هنا، وكشف التكرار في تصدير المحفوظات): الأزمنة جزء منه، فنص مطابق بتوقيت مختلف ملف
 * آخر تُحفظ بصمته، وإلا قورن ما يعود به المستخدم ببصمة أقدم فظهر انحراف غير حقيقي (تدقيق مستقل 2026-11-04).
 * @param {Fingerprint | null | undefined} x @param {Fingerprint | null | undefined} y
 */
export function sameExport(x, y) {
  return !!x && !!y && x.trackKey === y.trackKey && x.mode === y.mode && x.count === y.count && x.textHash === y.textHash
    && x.cues.length === y.cues.length && x.cues.every((c, i) => c.startMs === y.cues[i].startMs && c.endMs === y.cues[i].endMs);
}

/**
 * @param {{ fileName: string, cues: Cue[], videoId: string, fingerprints: Fingerprint[], knownVideoIds?: string[] }} input
 * @returns {{
 *   references: ReturnType<typeof rankReferences>, suggested: string | null, certain: boolean,
 *   nameHint: null | { videoId: string, differs: boolean }
 * }} suggested أفضل مرجع إن بلغ نصف الدرجة؛ وcertain حين يبلغ 0.8 ويتقدم على التالي بعُشر فأكثر، أو يطابق مطابقة تامة
 *   والتالي لا يطابق، أو كانا تصديرًا واحدًا بعينه.
 */
export function reviewIncoming({ fileName, cues, videoId, fingerprints, knownVideoIds = [] }) {
  const list = Array.isArray(fingerprints) ? fingerprints : [];
  const references = rankReferences(cues, list);
  const [top, second] = references;
  const suggested = top && top.score >= REVIEW_THRESHOLDS.suggest ? top.fingerprintId : null;
  const byId = (id) => list.find((f) => f.id === id);
  // المطابقة التامة (العدد والترقيم والتوقيت) تحسم وحدها إن لم يطابق التالي مثلها.
  const certain = !!suggested && top.score >= REVIEW_THRESHOLDS.certain
    && (!second || top.score - second.score >= REVIEW_THRESHOLDS.gap || (top.matched && !second.matched)
      || sameExport(byId(top.fingerprintId), byId(second.fingerprintId)));
  return { references, suggested, certain, nameHint: videoIdFromName(fileName, { videoId, knownVideoIds }) };
}
