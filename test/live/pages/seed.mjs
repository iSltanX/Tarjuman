// بيانات محفوظة للاختبار الحي لصفحات P7: مساران إنجليزيان حقيقيان من عينتي json3 الملتقطتين حيًا (يدوي TED وتلقائي)، وبصمات
// حقيقية من buildExport، وعربية عيّنة بأزمنة المقاطع نفسها، فتظهر شارات الملفات والمقارنة والإزاحة كما يراها المستخدم.
// تُبنى في Node وتجتاز مدققات النموذج قبل كتابتها، ثم تُكتب من صفحة إضافة بـchrome.storage.local.set (مسار الدخان نفسه).
import { compare } from '../../../src/core/compare/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import {
  createVideoRecord, summarizeVideo, validateIndexEntry, validateVideoRecord, withArabicEdit, withArabicImport, withExport, withView,
} from '../../../src/core/model/index.js';
import { realTrack } from '../../helpers/fixtures.js';

const SAMPLE_AR = [
  'مرحبًا بكم في هذا الحديث.', 'أريد اليوم أن أشارككم قصة.', 'تبدأ في قاعة صغيرة.', 'كان الجميع ينتظر بصبر.',
  'ثم تغيّر كل شيء فجأة.', 'لم نكن نتوقع هذه النتيجة أبدًا.', 'وهكذا بدأت الفكرة تكبر.', 'سأحكي لكم الآن ما حدث بعدها.',
  'الإبداع لا يقل أهمية عن القراءة والكتابة.', 'علينا أن نعامله بالاحترام نفسه.',
];
const arabicFor = (cues) => cues.map((c, i) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: SAMPLE_AR[i % SAMPLE_AR.length] }));
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const H = 3600 * 1000;

/**
 * @param {{ videoId: string, title: string | null, kind: 'manual' | 'asr', cues: object[], durationMs: number, arabic: 'matched' | 'missing' | 'none',
 *   edited?: boolean, offsetMs?: number, agoMs: number }} o
 */
function build({ videoId, title, kind, cues, durationMs, arabic, edited = false, offsetMs = 0, agoMs }) {
  const at = iso(agoMs);
  const track = { key: `en|${kind}`, lang: 'en', kind, capturedAt: at, source: 'capture', cues };
  const out = buildExport({ videoId, title, mode: 'normal', now: at, track: { key: track.key, lang: 'en', kind, cues } });
  let rec = withExport(null, { videoId, title, durationMs, englishTrack: track, fingerprint: out.fingerprint }, at);
  if (arabic !== 'none') {
    let ar = arabicFor(cues);
    if (arabic === 'missing') ar = ar.filter((c) => ![5, 6, 7].includes(c.n));
    const comparison = compare(ar, out.fingerprint, { driftMs: 100 });
    rec = withArabicImport(rec, { videoId, fileName: `${videoId}.ar.srt`, cues: ar, comparison, fingerprintId: out.fingerprint.id, notes: [], displayModeDefault: 'ar' }, at).record;
    if (edited) rec = withArabicEdit(rec, { cues: ar.map((c) => (c.n === 1 ? { ...c, text: `${c.text} (معدّلة)` } : c)) }, at);
    if (offsetMs) rec = withView(rec, { displayOffsetMs: offsetMs }, at);
  }
  rec = { ...rec, rev: 1, createdAt: at, updatedAt: at };
  const check = validateVideoRecord(rec);
  if (!check.ok) throw new Error(`سجل عيّنة غير صالح (${videoId}): ${check.path} — ${check.reason}`);
  const index = summarizeVideo(rec);
  const ic = validateIndexEntry(index);
  if (!ic.ok) throw new Error(`مُلخّص غير صالح (${videoId}): ${ic.path}`);
  return { record: rec, index };
}

/** معرّفات العيّنات وعناوينها (عناوين المسارين الحقيقيين من فهرس العينات). */
export const SEED_IDS = Object.freeze({ ted: 'iG9CE55wbtY', asr: 'Y9rkKtK1b44', typo: 'Zx81mN4qR7t', untitled: 'Lm2Nb6Vc8Xz' });

/** @returns {{ items: { record: object, index: object }[], expectTitles: Record<string, string | null> }} */
export function buildSeed() {
  const manual = realTrack('manual');
  const asr = realTrack('asr');
  const items = [
    build({ videoId: SEED_IDS.ted, title: manual.fixture.source.title, kind: 'manual', cues: manual.cues, durationMs: manual.fixture.durationMs, arabic: 'matched', edited: true, offsetMs: 500, agoMs: 2 * H }),
    build({ videoId: SEED_IDS.asr, title: 'لماذا نترجم بأنفسنا؟ — NWC Arabic subtitles', kind: 'asr', cues: asr.cues, durationMs: asr.fixture.durationMs, arabic: 'none', agoMs: 26 * H }),
    build({ videoId: SEED_IDS.typo, title: 'Typography for Long-form Reading — Part 2', kind: 'manual', cues: manual.cues.slice(0, 40), durationMs: 600000, arabic: 'missing', offsetMs: -1000, agoMs: 3 * 24 * H }),
    build({ videoId: SEED_IDS.untitled, title: null, kind: 'manual', cues: manual.cues.slice(0, 12), durationMs: 120000, arabic: 'matched', agoMs: 7 * 24 * H }),
  ];
  return { items, expectTitles: Object.fromEntries(items.map((i) => [i.record.videoId, i.record.title])) };
}

/** الأزواج التي تُكتب في chrome.storage.local (سجل ومُلخّصه لكل فيديو). */
export const storageItems = (items) => Object.fromEntries(items.flatMap((i) => [[`video:${i.record.videoId}`, i.record], [`index:${i.record.videoId}`, i.index]]));

/** ملف SRT عربي للاستبدال: يطابق البصمة تامًا (مقاطع الفيديو الأول)، بنص مختلف ليُرى الاستبدال. */
export function replacementSrt(cues) {
  const ts = (ms) => {
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
  };
  return cues.map((c) => `${c.n}\n${ts(c.startMs)} --> ${ts(c.endMs)}\nترجمة بديلة للمقطع ${c.n}\n`).join('\n');
}
