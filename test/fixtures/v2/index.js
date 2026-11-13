// عيّنات الإصدار الثاني (P11): مسارات طويلة مركّبة من مولّد حتمي بذرته ثابتة، فتتكرر الحالة نفسها في كل تشغيل دون
// ملفات ضخمة في المستودع. كل تحويل دالة نقية تعيد مصفوفة جديدة. وصفها وحالاتها المتوقعة في README.md بجانبها، والعيّنات
// الحقيقية (P1 ومقابلاتها العربية من P9) تُقرأ من مواضعها كما هي.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../..');

/** مولّد عشوائي حتمي (mulberry32) يعطي أعدادًا في [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EN = ['the', 'story', 'village', 'river', 'nobody', 'expected', 'what', 'came', 'next', 'we', 'built', 'a', 'small',
  'school', 'children', 'learned', 'to', 'read', 'every', 'morning', 'and', 'then', 'they', 'wrote', 'letters', 'home', 'about',
  'ships', 'battle', 'carrier', 'pilots', 'radio', 'signal', 'island', 'weather', 'ocean'];
const AR = ['القصة', 'القرية', 'النهر', 'لم', 'يتوقع', 'أحد', 'ما', 'جاء', 'بعد', 'بنينا', 'مدرسة', 'صغيرة', 'تعلّم',
  'الأطفال', 'القراءة', 'كل', 'صباح', 'ثم', 'كتبوا', 'رسائل', 'إلى', 'البيت', 'عن', 'السفن', 'المعركة', 'الحاملة', 'الطيارون',
  'اللاسلكي', 'الإشارة', 'الجزيرة', 'الطقس', 'المحيط'];

const pick = (r, list) => list[Math.floor(r() * list.length)];
const words = (r, list, count) => Array.from({ length: count }, () => pick(r, list)).join(' ');

/**
 * مسار طويل بأزمنة متفاوتة: مدة المقطع 0.9–5.1 ث، وفاصل حتى 0.4 ث، وصمت 2.5–7.5 ث في نحو 6% من المواضع،
 * ونهاية جملة كل مقطعين إلى أربعة. النص إنجليزي أو عربي من قائمة كلمات (لا معنى له، ويكفي للبنية).
 * @param {number} [count]
 * @param {{ seed?: number, lang?: 'en' | 'ar', startMs?: number }} [opts]
 */
export function longTrack(count = 2400, { seed = 11, lang = 'en', startMs = 1200 } = {}) {
  const r = rng(seed);
  const list = lang === 'ar' ? AR : EN;
  const cues = [];
  let t = startMs;
  let sinceStop = 0;
  for (let n = 1; n <= count; n++) {
    const dur = 900 + Math.floor(r() * 4200);
    sinceStop++;
    const stop = sinceStop >= 2 + Math.floor(r() * 3);
    if (stop) sinceStop = 0;
    const body = words(r, list, 3 + Math.floor(r() * 7));
    cues.push({ n, startMs: t, endMs: t + dur, text: `${body}${stop ? '.' : ''}` });
    t += dur + (r() < 0.06 ? 2500 + Math.floor(r() * 5000) : Math.floor(r() * 400));
  }
  return cues;
}

/** ترجمة «عربية» بأزمنة المسار وأرقامه نفسها ونص آخر (كما يعيد النموذج ملفًا سليمًا). */
export function arabicTwin(cues, { seed = 23 } = {}) {
  const r = rng(seed);
  return cues.map((c) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: `${words(r, AR, 2 + Math.floor(r() * 6))}${c.text.endsWith('.') ? '.' : ''}` }));
}

const copy = (cues) => cues.map(({ n, startMs, endMs, text }) => ({ n, startMs, endMs, text }));

/** إعادة الترقيم 1..N (كما يفعل نموذج يعيد ترقيم ملف بعد دمج أو حذف). */
export const renumber = (cues) => cues.map((c, i) => ({ ...c, n: i + 1 }));

/** دمج المقطع i مع التالي: من بداية الأول إلى نهاية الثاني، والنصان في سطرين، ورقم الأول. */
export function mergeAt(cues, i) {
  const out = copy(cues);
  const [a, b] = [out[i], out[i + 1]];
  out.splice(i, 2, { n: a.n, startMs: a.startMs, endMs: b.endMs, text: `${a.text}\n${b.text}` });
  return out;
}

/** شطر المقطع i عند منتصف زمنه وكلماته؛ القطعتان برقمه. */
export function splitAt(cues, i) {
  const out = copy(cues);
  const c = out[i];
  const mid = Math.round((c.startMs + c.endMs) / 2);
  const w = c.text.split(/\s+/);
  const half = Math.max(1, Math.floor(w.length / 2));
  out.splice(i, 1, { n: c.n, startMs: c.startMs, endMs: mid, text: w.slice(0, half).join(' ') }, { n: c.n, startMs: mid, endMs: c.endMs, text: w.slice(half).join(' ') || '…' });
  return out;
}

/** حذف مقاطع بمواضعها (من الأكبر حتى لا تتزحزح المواضع). */
export function dropAt(cues, indices) {
  const out = copy(cues);
  [...indices].sort((a, b) => b - a).forEach((i) => out.splice(i, 1));
  return out;
}

/**
 * انحراف صغير في نسبة من المقاطع (كما ينسخ النموذج سطر زمن بخطأ يسير): ±maxMs على البداية والنهاية، والترتيب محفوظ.
 * @returns {{ cues: object[], touched: number[] }} touched مواضع ما تغيّر
 */
export function driftSome(cues, { rate = 0.05, maxMs = 300, seed = 5 } = {}) {
  const r = rng(seed);
  const out = copy(cues);
  const touched = [];
  out.forEach((c, i) => {
    if (r() >= rate) return;
    const ds = Math.round((r() * 2 - 1) * maxMs);
    const de = Math.round((r() * 2 - 1) * maxMs);
    const prevEnd = i ? out[i - 1].endMs : 0;
    const nextStart = i + 1 < out.length ? out[i + 1].startMs : Infinity;
    const s = Math.max(prevEnd, c.startMs + ds);
    const e = Math.min(nextStart, Math.max(s + 200, c.endMs + de));
    if (s === c.startMs && e === c.endMs) return;
    c.startMs = s;
    c.endMs = e;
    touched.push(i);
  });
  return { cues: out, touched };
}

/** إزاحة عامة لكل الأزمنة (كما يفعل «± للملف» في المحرّر ثم الحفظ). */
export const shiftAll = (cues, deltaMs) => cues.map((c) => ({ ...c, startMs: c.startMs + deltaMs, endMs: c.endMs + deltaMs }));

/**
 * الحالة المركّبة الأخطر: دمج عند mergeIndex وشطر عند splitIndex ثم إعادة ترقيم، فيعود العدد إلى أصله والترقيم متسلسلًا،
 * وبينهما كل مقطع مزاح عن رقمه بمقطع. المقارنة بالرقم وحده تراه «مطابقًا عددًا وترقيمًا».
 * @returns {{ cues: object[], mergeIndex: number, splitIndex: number, shifted: [number, number] }} shifted مدى المواضع المزاحة
 */
export function mergeSplitShift(cues, { mergeIndex = 400, splitIndex = 1600 } = {}) {
  const merged = mergeAt(cues, mergeIndex);
  // بعد الدمج يتقدّم كل ما بعده موضعًا: المقطع الأصلي splitIndex صار عند splitIndex − 1.
  const out = renumber(splitAt(merged, splitIndex - 1));
  return { cues: out, mergeIndex, splitIndex, shifted: [mergeIndex + 1, splitIndex - 1] };
}

/** العيّنة الحقيقية: مقاطع SRT العربية من P9 (ترجمة عيّنتي P1) مع اسمها. */
export function realArabic(name) {
  return readFileSync(path.join(ROOT, 'test/e2e/fixtures', name), 'utf8');
}

export const REAL_ARABIC = Object.freeze({
  manual: 'iG9CE55wbtY.en.manual.normal.ar.srt',
  asrLong: 'Y9rkKtK1b44.en.asr.long.ar.srt',
});

/**
 * الأصل الإنجليزي الذي ترجمه النموذج إلى عيّنتي ميدواي العربيتين: ناتج ما قبل ع-٣ مجمّدًا في test/fixtures/export (العادي ملف P1 الحي
 * بايتًا، والأطول من محوّل ما قبل ع-٣). ترجمة النموذج بُنيت على ترقيمه، فتُقارن به لا بتحويل اليوم الذي صار يقطع مجموعات ASR
 * التي لا تتسع في سطرين. لا يُعدَّل ولا تُعدَّل الترجمة.
 */
export const SOURCE_BEFORE_E03 = Object.freeze({
  asrNormal: 'Y9rkKtK1b44.en.asr.before-e03.srt',
  asrLong: 'Y9rkKtK1b44.en.asr.long.before-e03.srt',
});

/** نص ملف الأصل المجمّد. @param {string} name من SOURCE_BEFORE_E03 */
export function sourceBeforeE03(name) {
  return readFileSync(path.join(ROOT, 'test/fixtures/export', name), 'utf8');
}

/** ملف نصي من هذا المجلد (عيّنات Markdown وTXT). */
export const readV2 = (name) => readFileSync(path.join(DIR, name), 'utf8');
