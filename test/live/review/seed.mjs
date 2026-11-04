// بذرة الاختبار الحي لإصلاحات المراجعة المستقلة (الفرع tj/review-apply): فيديوهات اصطناعية بمعرّفات من 11 محرفًا، كلٌّ
// لسيناريو واحد فلا يتأثر سيناريو بما فعله غيره. تُبنى في Node عبر التخزين نفسه (createStore فوق مساحة في الذاكرة)، فتُكتب
// المفاتيح كما يكتبها ترجمان، ثم تُزرع في صفحة الإضافة بـchrome.storage.local.set. صور الفيديو مطفأة في التفضيلات: لا طلب
// خارجي لمعرّفات لا وجود لها.
import { buildExport } from '../../../src/core/export/index.js';
import { writeSrt } from '../../../src/core/srt/writer.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { NOW, englishTrack, makeCues, videoRecord } from '../../helpers/fixtures.js';
import { sampleBundle, samplePrefs, seedBundle } from '../../helpers/fixtures-v2.js';

export const IDS = Object.freeze({
  /** حذف الترجمة النشطة من «المزيد» ثم تفعيل 2 من التبويب الآخر قبل الموافقة. */
  active: 'RvDelActive',
  /** حذف ترجمة من بطاقتها ثم تسميتها من التبويب الآخر قبل الموافقة. */
  card: 'RvDelCard01',
  /** حذف النسخة السابقة ثم استعادتها من التبويب الآخر قبل الموافقة. */
  previous: 'RvDelPrev01',
  /** حذف كل بيانات الفيديو ثم تسمية ترجمة من التبويب الآخر قبل الموافقة. */
  all: 'RvDelAll001',
  /** النص الدراسي بإزاحة سالبة تجعل المقطع 1 قبل بداية الفيديو. */
  studyNeg: 'RvStudyNeg1',
  /** النص الدراسي بإزاحة موجبة: لا إشعار. */
  studyPos: 'RvStudyPos1',
  /** تصدير الإنجليزية بالنص نفسه وتوقيت مختلف عن بصمة قديمة، ثم رفع الترجمة. */
  fingerprint: 'RvFingerpr1',
});

/** مقاطع متباعدة (فقرة لكل مقطع في النص الدراسي): تبدأ 1000 و6000 و11000. */
export const spaced = () => makeCues(3, { startMs: 1000, durMs: 2000, gapMs: 3000 });
/** الإزاحتان وروابط النص الدراسي المتوقعة بالثواني (المحفوظ + الإزاحة، وما قبل الصفر وحده من 0). */
export const STUDY = Object.freeze({
  negOffset: -2000, negLinks: [0, 4, 9], negLinksBefore: [1, 6, 11],
  posOffset: 500, posLinks: [1, 6, 11],
});

/** مسار إنجليزي بنص ثابت وتوقيت مزاح بـshift. */
export const englishAt = (shift) => englishTrack({ cues: makeCues(5, { text: (i) => `line ${i}`, startMs: 1000 + shift }) });
export const FP_SHIFT = 1500;
/** الترجمة العربية لملف الإنجليزية بتوقيته الجديد (ما يعود به المستخدم بعد ترجمة ما نزل). */
export const arabicForNewTiming = () => writeSrt(englishAt(FP_SHIFT).cues.map((c) => ({ ...c, text: `ترجمة ${c.n}` })));

export async function buildReviewSeed() {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse(NOW);
  const store = createStore({ area, now: () => (t += 1000) });
  await store.setPrefs({ ...samplePrefs({ mode: 'downloads' }), ui: { thumbnails: false, panelEntry: true, panelOpen: false, panelDual: true } });
  const titled = (bundle, title) => ({ ...bundle, record: { ...bundle.record, title } });
  await seedBundle(store, titled(sampleBundle({ videoId: IDS.active, third: true }), 'مراجعة: حذف النشطة'));
  await seedBundle(store, titled(sampleBundle({ videoId: IDS.card, third: true }), 'مراجعة: حذف بطاقة'));
  await seedBundle(store, titled(sampleBundle({ videoId: IDS.previous, third: true, previous: true }), 'مراجعة: حذف السابقة'));
  await seedBundle(store, titled(sampleBundle({ videoId: IDS.all, third: true }), 'مراجعة: حذف الكل'));
  await store.updateVideo(IDS.studyNeg, () => ({ ...videoRecord({ videoId: IDS.studyNeg, offset: STUDY.negOffset, cues: spaced() }), title: 'مراجعة: نص دراسي بإزاحة سالبة' }));
  await store.updateVideo(IDS.studyPos, () => ({ ...videoRecord({ videoId: IDS.studyPos, offset: STUDY.posOffset, cues: spaced() }), title: 'مراجعة: نص دراسي بإزاحة موجبة' }));
  const old = buildExport({ videoId: IDS.fingerprint, track: englishAt(0), mode: 'normal', now: Date.parse('2026-10-01T00:00:00.000Z') }).fingerprint;
  await store.updateVideo(IDS.fingerprint, () => ({
    ...videoRecord({ videoId: IDS.fingerprint, arabic: false }), title: 'مراجعة: بصمة التصدير',
    english: [englishAt(FP_SHIFT)], fingerprints: [old],
  }));
  await area.flush();
  return { items: area.dump(), store, oldFingerprintId: old.id };
}
