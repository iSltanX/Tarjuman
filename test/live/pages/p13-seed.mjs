// بيانات الاختبار الحي لـP13: الفيديوهات الأربعة الواقعية من عيّنة P7 (مساران حقيقيان من json3) بعد ترقيتها إلى الإصدار
// الثاني بالانتقالات نفسها (ثلاث ترجمات باسم مختصر، ونسخة سابقة من استبدال، وعلامات)، ومعها مكتبة كبيرة مركّبة (300 فيديو
// بمسار إنجليزي وبصمة حقيقيين، وحتى ثلاث ترجمات من 120 مقطعًا، وتعديلات وعلامات ونقص يظهر في الفحص الآلي)، وتفضيلات
// بقاموس، وإعدادات معدّلة. تُبنى في Node بالتخزين نفسه على محاكاة، فتجتاز المدققات، ثم تُكتب في chrome.storage.local للإضافة.
import { compare } from '../../../src/core/compare/index.js';
import { buildExport } from '../../../src/core/export/index.js';
import { withMark, withSlotName, withSlotUpload } from '../../../src/core/model/bundle.js';
import { withArabicEdit, withArabicImport, withExport } from '../../../src/core/model/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { samplePrefs } from '../../helpers/fixtures-v2.js';
import { SEED_IDS, buildSeed } from './seed.mjs';

export const LARGE_COUNT = 300;
export const LARGE_CUES = 120;
export const largeId = (i) => `P13${String(i).padStart(8, '0')}`;
const H = 3600 * 1000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const SENTENCES = ['هذا سطر من الترجمة العربية للاختبار.', 'وفيه جملة ثانية أطول قليلًا من الأولى.', 'ثم سطر قصير.', 'وأخيرًا جملة تختم الفقرة.'];
const englishCues = (n) => Array.from({ length: n }, (_, k) => ({ n: k + 1, startMs: 1000 + k * 2500, endMs: 3000 + k * 2500, text: `This is English line ${k + 1}.` }));
const arabicOf = (cues, tag) => cues.map((c, k) => ({ n: c.n, startMs: c.startMs, endMs: c.endMs, text: `${SENTENCES[k % SENTENCES.length]} (${tag})` }));

/** فيديو مركّب كبير بالانتقالات نفسها؛ الأنماط تتوزع على الأقسام الخمسة. */
async function large(store, i) {
  const videoId = largeId(i);
  const at = iso((i + 1) * 60000);
  const cues = englishCues(LARGE_CUES);
  const track = { key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: at, source: 'capture', cues };
  const out = buildExport({ videoId, title: `محاضرة تجريبية رقم ${i + 1}`, mode: 'normal', now: at, track: { key: track.key, lang: 'en', kind: 'manual', cues } });
  let rec = withExport(null, { videoId, title: `محاضرة تجريبية رقم ${i + 1}`, durationMs: 330000, englishTrack: track, fingerprint: out.fingerprint }, at);
  if (i % 4 === 0) {
    await store.updateVideo(videoId, () => rec);
    return;
  }
  let ar = arabicOf(cues, 'الأولى');
  if (i % 6 === 0) ar = ar.filter((c) => ![10, 11, 12].includes(c.n));
  const input = (cuesIn, name) => ({ videoId, fileName: `${videoId}.${name}.ar.srt`, cues: cuesIn, comparison: compare(cuesIn, out.fingerprint, { driftMs: 100 }), fingerprintId: out.fingerprint.id, notes: [], displayModeDefault: 'ar' });
  rec = withArabicImport(rec, input(ar, 'first'), at).record;
  if (i % 5 === 0) rec = withArabicEdit(rec, { cues: ar.map((c) => (c.n === 2 ? { ...c, text: `${c.text} — معدّل` } : c)) }, at);
  await store.updateVideo(videoId, () => rec);
  if (i % 3 === 0 || i % 7 === 0) {
    await store.updateBundle(videoId, (b) => {
      let next = b;
      if (i % 3 === 0) {
        next = withSlotUpload(next, 2, input(arabicOf(cues, 'الثانية'), 'second'), at, { activate: false }).bundle;
        next = withSlotUpload(next, 3, input(arabicOf(cues, 'الثالثة'), 'third'), at, { activate: false }).bundle;
        next = withSlotName(next, 2, 'مراجعة');
      }
      if (i % 7 === 0) next = withMark(next, 1, { index: 3, kind: 'todo' }, at).bundle;
      return next;
    });
  }
}

/** الفيديوهات الواقعية الأربعة، والأول منها بثلاث ترجمات وسابقة وعلامات. */
async function realistic(store) {
  const { items } = buildSeed();
  for (const { record } of items) await store.updateVideo(record.videoId, () => record);
  const ted = (await store.getBundle(SEED_IDS.ted)).record;
  const cues = ted.arabic.original;
  const at = iso(H);
  const input = (tag, name) => ({
    videoId: SEED_IDS.ted, fileName: `${SEED_IDS.ted}.${name}.ar.srt`, cues: cues.map((c) => ({ ...c, text: `${c.text} [${tag}]` })),
    comparison: null, fingerprintId: null, notes: [], displayModeDefault: 'ar',
  });
  await store.updateBundle(SEED_IDS.ted, (b) => {
    let next = withSlotUpload(b, 2, input('مسودة', 'draft'), at, { activate: false }).bundle;
    next = withSlotName(next, 2, 'مراجعة');
    // استبدال الخانة 2 يحفظ ما كان فيها نسخةً سابقة.
    next = withSlotUpload(next, 2, input('مراجعة', 'review'), at, { replace: true, activate: false }).bundle;
    next = withSlotUpload(next, 3, input('حرفية', 'literal'), at, { activate: false }).bundle;
    next = withMark(next, 1, { index: 0, kind: 'todo' }, at).bundle;
    next = withMark(next, 1, { index: 4, kind: 'done' }, at).bundle;
    return next;
  });
  return { ted: SEED_IDS.ted };
}

/**
 * @param {{ large?: number }} [o]
 * @returns {Promise<{ items: Record<string, unknown>, store: ReturnType<typeof createStore>, area: ReturnType<typeof createMemoryArea>, ids: { ted: string } }>}
 */
export async function buildP13Seed({ large: count = LARGE_COUNT } = {}) {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area });
  await store.setSettings({ offsetStepMs: 1000, appearance: { scale: 120 } });
  await store.setPrefs(samplePrefs({ mode: 'downloads' }));
  const ids = await realistic(store);
  for (let i = 0; i < count; i++) await large(store, i);
  await area.flush();
  return { items: area.dump(), store, area, ids };
}

/** يقسم العناصر إلى دفعات للكتابة عبر CDP. @param {Record<string, unknown>} items */
export function chunks(items, size = 150) {
  const entries = Object.entries(items);
  const out = [];
  for (let i = 0; i < entries.length; i += size) out.push(Object.fromEntries(entries.slice(i, i + size)));
  return out;
}

/** SRT بديل لـTED بأرقامه وأزمنته، يغيّر مقطعين ليظهر الفرق ويتحاذى. */
export function tedReplacement(cues) {
  const ts = (ms) => {
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
  };
  const changed = (c) => (c.n === 3 || c.n === 9 ? `ترجمة جديدة للمقطع ${c.n}` : c.text);
  return { text: cues.map((c) => `${c.n}\n${ts(c.startMs)} --> ${ts(c.endMs)}\n${changed(c)}\n`).join('\n'), cues: cues.map((c) => ({ ...c, text: changed(c) })) };
}
