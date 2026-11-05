// صفحة زرع لاختبار C3 الحي (تدقيق 7a66f91، المحرّر): تُجمَّع وتُحقن في بناء تطوير مؤقت (tests/c3.html)، فتكتب الحزم عبر
// التخزين الحقيقي للإضافة (createStore()، والكتابة عبر العامل الخلفي)، وتحاكي حفظًا من تبويب آخر. لا شبكة ولا يوتيوب.
import { createStore } from '../../../src/core/store/index.js';
import { saveSlot } from '../../../src/pages/editor/persist.js';
import { NOW, comparison, englishTrack, fingerprint, makeCues } from '../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../helpers/fixtures-v2.js';

const store = createStore();

/**
 * حزمة بخانتين: الأولى نشطة معدّلة بإزاحة +0.5 ومرجع إنجليزي بعدد المقاطع نفسه، والثانية ممتلئة (لحوار التبديل).
 * @param {string} videoId @param {{ count?: number, texts?: string[] | null }} o texts نصوص الأولى (بدل المولّدة)
 */
function bundle(videoId, { count = 150, texts = null } = {}) {
  const b = sampleBundle({ videoId });
  const n = texts ? texts.length : count;
  const en = englishTrack({ cues: makeCues(n, { text: (i) => `This is the English reference line number ${i}` }) });
  const fp = fingerprint({ videoId, track: en, id: 'fp_c30000000a' });
  const ar = makeCues(n, { text: (i) => texts?.[i - 1] ?? `هذا هو السطر العربي للمقطع ${i}\nوسطر ثانٍ للتجربة` });
  const t1 = {
    fileName: `${videoId}.ar.srt`, importedAt: NOW, original: ar,
    current: ar.map((c, k) => (texts || k !== 3 ? { ...c } : { ...c, text: `${c.text} (معدّل)` })), editedAt: NOW,
    fingerprintId: fp.id, comparison: comparison({ fingerprintId: fp.id, count: n }), notes: [],
  };
  b.slots[0] = { n: 1, name: null, track: t1, offsetMs: 500, marks: [], position: null };
  b.slots[1].track.fingerprintId = null;
  b.slots[1].track.comparison = null;
  b.record.english = [en];
  b.record.fingerprints = [fp];
  b.record.arabic = structuredClone(t1);
  b.record.title = 'C3 — المحرّر في النوافذ الضيقة والقصيرة';
  return b;
}

window.__c3 = {
  ready: true,
  async seed(videoId, opts = {}) {
    await seedBundle(store, bundle(videoId, opts));
    const b = await store.getBundle(videoId);
    return { ok: Boolean(b), count: b?.slots[0].track.current.length ?? 0 };
  },
  /** حفظ من «تبويب آخر» بنص جديد للمقطع الأول في الخانة 1. */
  async externalSave(videoId, text) {
    const b = await store.getBundle(videoId);
    const cues = b.slots[0].track.current.map((c, i) => (i === 0 ? { ...c, text } : c));
    await saveSlot(store, videoId, b, 1, { cues, offsetChanged: false, offsetMs: b.slots[0].offsetMs });
    return true;
  },
};
