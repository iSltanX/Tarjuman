// بذرة المحفوظات للاختبار الحي لإعادة التصميم: «قليلة» (أربعة فيديوهات بحالات مختلفة) و«كثيرة» (ستون فيديو بعناوين
// طويلة ومختلطة وبلا عنوان). تُبنى في Node من المسارين الحقيقيين الملتقطين حيًا (test/fixtures/json3) وتجتاز مدققات
// النموذج، ثم تُكتب من صفحة إضافة بـchrome.storage.local.set (مسار الدخان نفسه).
import { compare } from '../../../src/core/compare/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import {
  summarizeVideo, validateIndexEntry, validateVideoRecord, withArabicEdit, withArabicImport, withExport, withView,
} from '../../../src/core/model/index.js';
import { realTrack } from '../../helpers/fixtures.js';

const SAMPLE_AR = [
  'مرحبًا بكم في هذا الحديث.', 'أريد اليوم أن أشارككم قصة.', 'تبدأ في قاعة صغيرة.', 'كان الجميع ينتظر بصبر.',
  'ثم تغيّر كل شيء فجأة.', 'لم نكن نتوقع هذه النتيجة أبدًا.', 'وهكذا بدأت الفكرة تكبر.', 'سأحكي لكم الآن ما حدث بعدها.',
  'الإبداع لا يقل أهمية عن القراءة والكتابة.', 'علينا أن نعامله بالاحترام نفسه.',
];
const arabicFor = (cues) => cues.map((c, i) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: SAMPLE_AR[i % SAMPLE_AR.length] }));
const H = 3600 * 1000;

/**
 * @param {{ videoId: string, title: string | null, kind: 'manual' | 'asr', cues: object[], durationMs: number, arabic: 'matched' | 'missing' | 'none',
 *   edited?: boolean, offsetMs?: number, agoMs: number, now?: number }} o
 */
export function build({ videoId, title, kind, cues, durationMs, arabic, edited = false, offsetMs = 0, agoMs, now = Date.now() }) {
  const at = new Date(now - agoMs).toISOString();
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

export const SEED_IDS = Object.freeze({ ted: 'iG9CE55wbtY', asr: 'Y9rkKtK1b44', typo: 'Zx81mN4qR7t', untitled: 'Lm2Nb6Vc8Xz' });

const LONG_TITLES = [
  'محاضرة كاملة عن تصميم الواجهات التي تحترم القارئ العربي: من الشبكة الطباعية إلى اتجاه النص والمسافات والأيقونات',
  'How Browsers Render Arabic Text — a deep dive into shaping, bidi, fallback fonts and why your UI breaks at 2am',
  'Kubernetes في الإنتاج: كيف نشرنا deployment بلا توقف — الجزء 2 (مع Helm وArgoCD)',
  'Typography for Long-form Reading — Part 2',
  'مقابلة: لماذا نترجم بأنفسنا؟ — NWC Arabic subtitles',
  'The History of the Arabic Script (2026 edition) — v1.22.0 release talk',
];

/** أربعة فيديوهات بحالات مختلفة: معدّلة بإزاحة، وبانتظار الترجمة، وبتحذير مقارنة، وبلا عنوان. */
export function buildSeedFew(now = Date.now()) {
  const manual = realTrack('manual');
  const asr = realTrack('asr');
  const items = [
    build({ videoId: SEED_IDS.ted, title: manual.fixture.source.title, kind: 'manual', cues: manual.cues, durationMs: manual.fixture.durationMs, arabic: 'matched', edited: true, offsetMs: 500, agoMs: 2 * H, now }),
    build({ videoId: SEED_IDS.asr, title: 'لماذا نترجم بأنفسنا؟ — NWC Arabic subtitles', kind: 'asr', cues: asr.cues, durationMs: asr.fixture.durationMs, arabic: 'none', agoMs: 26 * H, now }),
    build({ videoId: SEED_IDS.typo, title: 'Typography for Long-form Reading — Part 2', kind: 'manual', cues: manual.cues.slice(0, 40), durationMs: 600000, arabic: 'missing', offsetMs: -1000, agoMs: 3 * 24 * H, now }),
    build({ videoId: SEED_IDS.untitled, title: null, kind: 'manual', cues: manual.cues.slice(0, 12), durationMs: 120000, arabic: 'matched', agoMs: 7 * 24 * H, now }),
  ];
  return { items };
}

/** ستون فيديو: الأربعة أعلاه ثم 56 بعناوين طويلة ومختلطة بحالات متنوعة (للتمرير و«عرض المزيد» والأعداد). */
export function buildSeedMany(now = Date.now()) {
  const manual = realTrack('manual');
  const base = buildSeedFew(now).items;
  const rest = [];
  for (let i = 0; i < 56; i++) {
    const id = `Vd${String(i).padStart(9, '0')}`.replace(/[^A-Za-z0-9_-]/g, '0');
    const state = i % 5 === 0 ? 'none' : i % 7 === 0 ? 'missing' : 'matched';
    rest.push(build({
      videoId: id, title: i % 9 === 8 ? null : `${LONG_TITLES[i % LONG_TITLES.length]} — ${i + 1}`,
      kind: i % 3 === 0 ? 'asr' : 'manual', cues: manual.cues.slice(0, 20 + (i % 15)), durationMs: 300000 + i * 1000,
      arabic: state, edited: state === 'matched' && i % 4 === 1, offsetMs: i % 6 === 2 ? 500 : 0, agoMs: (8 + i) * H, now,
    }));
  }
  return { items: [...base, ...rest] };
}

/** الأزواج التي تُكتب في chrome.storage.local (سجل ومُلخّصه لكل فيديو). */
export const storageItems = (items) => Object.fromEntries(items.flatMap((i) => [[`video:${i.record.videoId}`, i.record], [`index:${i.record.videoId}`, i.index]]));
