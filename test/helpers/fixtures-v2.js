// عيّنات الإصدار الثاني للمراحل كلها (عقد data-model §١٠–§١٥، وعقد storage §٧): تفضيلات بقاموس، وحزمة بثلاث ترجمات
// ونسخة سابقة وعلامات وآخر موضع، وزرعها في محاكاة التخزين بالتوابع كما يكتبها التخزين نفسه. تجتاز المدققات.
import { cueTextHash } from '../../src/core/model/marks.js';
import { NOW, VIDEO_ID, comparison, englishTrack, fingerprint, makeCues, videoRecord } from './fixtures.js';

/** تفضيلات بقاموس من ثلاثة مصطلحات وحد قراءة ومجلد فرعي. */
export function samplePrefs({ mode = 'subfolder', folder = 'Tarjuman' } = {}) {
  return {
    schema: 1,
    glossary: {
      attach: true,
      terms: [
        { source: 'prompt', target: 'موجِّه', note: null },
        { source: 'token', target: 'رمز', note: 'في سياق النماذج اللغوية' },
        { source: 'fine-tuning', target: 'ضبط دقيق', note: null },
      ],
    },
    review: { maxCps: 17 },
    saveLocation: { mode, folder },
  };
}

/**
 * ترجمة عربية بنص مميز لكل خانة.
 * @param {{ label: string, count?: number, edited?: boolean, fingerprintId?: string | null, importedAt?: string }} o
 */
export function arabicTrack({ label, count = 5, edited = false, fingerprintId = null, importedAt = NOW }) {
  const original = makeCues(count, { text: (i) => `${label} ${i}` });
  return {
    fileName: `${VIDEO_ID}.${label}.ar.srt`, importedAt, original,
    current: edited ? original.map((c) => ({ ...c, text: `${c.text} (معدّل)` })) : null,
    editedAt: edited ? NOW : null,
    fingerprintId, comparison: fingerprintId ? comparison({ fingerprintId, count }) : null, notes: [],
  };
}

/** علامة على مقطع. */
export const markOn = (cue, kind = 'todo', at = NOW) => ({ n: cue.n, startMs: cue.startMs, textHash: cueTextHash(cue.text), kind, at });

/**
 * حزمة كاملة: الخانة 1 نشطة معدّلة بإزاحة 500 وعلامتين وموضع، والخانة 2 «مراجعة» بإزاحة −1200 ومرجع بصمة، والخانة 3 فارغة
 * (أو ممتلئة بـthird)، ونسخة سابقة من الخانة 2. السجل بمسار إنجليزي وبصمتين.
 * @param {{ videoId?: string, third?: boolean, previous?: boolean, active?: 1 | 2 | 3 }} [o]
 */
export function sampleBundle({ videoId = VIDEO_ID, third = false, previous = true, active = 1 } = {}) {
  const track = englishTrack();
  const fp1 = fingerprint({ videoId, track, id: 'fp_test000001' });
  const fp2 = fingerprint({ videoId, track, id: 'fp_test000002', mode: 'long' });
  const t1 = arabicTrack({ label: 'أولى', edited: true, fingerprintId: fp1.id });
  const t2 = arabicTrack({ label: 'ثانية', fingerprintId: fp2.id });
  const t3 = third ? arabicTrack({ label: 'ثالثة', count: 4 }) : null;
  const slots = [
    { n: 1, name: null, track: t1, offsetMs: 500, marks: [markOn(t1.current[0]), markOn(t1.current[2], 'done')], position: { n: 3, startMs: t1.current[2].startMs, at: NOW } },
    { n: 2, name: 'مراجعة', track: t2, offsetMs: -1200, marks: [markOn(t2.original[1])], position: null },
    { n: 3, name: null, track: t3, offsetMs: t3 ? 300 : 0, marks: [], position: null },
  ];
  const act = slots[active - 1];
  const record = {
    ...videoRecord({ videoId, offset: act.offsetMs, mode: 'dual' }),
    english: [track], fingerprints: [fp1, fp2], arabic: structuredClone(act.track),
  };
  return {
    videoId, record, active, slots,
    previous: previous ? { from: 2, savedAt: NOW, track: arabicTrack({ label: 'سابقة', count: 3 }), offsetMs: 0 } : null,
  };
}

/**
 * يزرع حزمة في مساحة تخزين عبر التخزين نفسه (فتُكتب المفاتيح كما يكتبها الإصدار الثاني).
 * @param {ReturnType<typeof import('../../src/core/store/index.js').createStore>} store
 * @param {ReturnType<typeof sampleBundle>} bundle
 */
export const seedBundle = (store, bundle) => store.updateBundle(bundle.videoId, () => bundle);
