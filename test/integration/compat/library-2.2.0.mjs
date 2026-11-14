// مولّد لقطة تخزين 2.2.0 المجمّدة (تحقق 2.3.0 ص-٢٢، قرار سلطان): مكتبة كاملة يكتبها كاتب 2.2.0 نفسه على تخزين وهمي بواجهته
// العامة وحدها، ثم يقرؤها 2.2.0 في سياق جديد. والناتج: القيم الخام كما كتبها (storage) وقراءة 2.2.0 لها (read)، فيقارن اختبار
// الترقية قراءة الرأس بقراءة 2.2.0 بلا شيفرة 2.2.0 في يده، ويقرأ الرجوعُ ما يكتبه الرأس بلقطة الشيفرة test/fixtures/v2.2.
//
// المكتبة: فيديو بثلاث خانات بأسمائها وعلاماتها وموضعها ونسخة سابقة، ومسارات بالإنجليزية واليابانية ومترجم آليًا وثلاث بصمات
// وترجمات بلغاتها (bundle: وalts: وprev: وmarks: وlang:)؛ وفيديو بترجمة واحدة؛ وفيديو بمسار أصل بلا ترجمة؛ والإعدادات والتفضيلات
// بقاموس، وتفضيلات اللغات، ولغة الواجهة، وآخر ملف نُزّل. البيانات هنا لا من مساعدات الاختبار، فلا يغيّرها تغيّر الرأس، والساعة
// ثابتة، فالمولّد حتمي: على لقطة الشيفرة يعيد اللقطة حرفيًا، ويتحقق اختبار التوافق من ذلك.
//
// التوليد (مرة واحدة، والناتج لا يُعدَّل يدويًا) على شيفرة الالتزام نفسها في مجلد مؤقت خارج المستودع:
//   git archive c04a6064f22a82c0620466d580bfbe673c655a65 src | tar -x -C <مجلد>
//   command node test/integration/compat/library-2.2.0.mjs --root <مجلد> --out test/integration/compat/library-2.2.0.json
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMemoryArea } from '../../helpers/chrome-storage.js';

export const COMMIT_2_2_0 = 'c04a6064f22a82c0620466d580bfbe673c655a65';
export const NOW = '2026-11-11T12:00:00.000Z';
export const IDS = Object.freeze({ full: 'AAAAAAAAAAA', single: 'BBBBBBBBBBB', source: 'CCCCCCCCCCC' });

const at = (s) => new Date(Date.parse(NOW) + s * 1000).toISOString();
const cues = (count, text, { startMs = 1000 } = {}) => Array.from({ length: count }, (_, i) => {
  const s = startMs + i * 2500;
  return { n: i + 1, startMs: s, endMs: s + 2000, text: text(i + 1) };
});
const sourceTrack = ({ lang = 'en', kind = 'manual', via, text }) => ({
  key: via ? `${lang}|${kind}|${via}` : `${lang}|${kind}`, lang, kind, ...(via ? { via } : {}), capturedAt: NOW, source: 'capture', cues: cues(5, text),
});
const fingerprint = (videoId, track, id, mode = 'normal') => ({
  id, videoId, trackKey: track.key, mode, count: track.cues.length,
  cues: track.cues.map(({ startMs, endMs }, i) => ({ n: i + 1, startMs, endMs })),
  textHash: 'fnv1a64:0123456789abcdef', fileName: `${videoId}.${track.lang}.${track.kind}.${mode}.srt`, createdAt: NOW, parts: null,
});
const comparison = (fingerprintId, count) => ({
  fingerprintId, matched: true, countSource: count, countTarget: count, numbering: 'same',
  missing: [], extra: [], drift: [], empty: [], noArabic: [], restoreTimingAvailable: true, driftThresholdMs: 100, notes: [],
});
const translation = ({ videoId, label, count = 5, edited = false, ref = null, lang, importedAt = NOW }) => {
  const original = cues(count, (i) => `${label} ${i}`);
  return {
    fileName: `${videoId}.${label}.srt`, importedAt, original,
    current: edited ? original.map((c) => ({ ...c, text: `${c.text} (معدّل)` })) : null,
    editedAt: edited ? at(30) : null,
    fingerprintId: ref ? ref.id : null, comparison: ref ? comparison(ref.id, count) : null, notes: [],
    ...(lang ? { lang } : {}),
  };
};
const empty = (n) => ({ n, name: null, track: null, offsetMs: 0, marks: [], position: null });
const record = (videoId, { english, fingerprints, arabic, offset = 0, mode = 'ar', title }) => ({
  schema: 1, videoId, title, durationMs: 60000, createdAt: NOW, updatedAt: NOW, rev: 1,
  english, fingerprints, arabic: arabic ? structuredClone(arabic) : null, view: { displayOffsetMs: offset, displayMode: mode },
});

/** الفيديو الكامل: ثلاث خانات (الأولى نشطة معدّلة، والثانية «مراجعة»، والثالثة بلا لغة) ونسخة سابقة، وثلاثة مسارات وثلاث بصمات. */
function fullBundle(cueTextHash) {
  const id = IDS.full;
  const en = sourceTrack({ text: (i) => `line ${i}` });
  const ja = sourceTrack({ lang: 'ja', text: (i) => `日本語の行 ${i}` });
  const mt = sourceTrack({ lang: 'ar', kind: 'asr', via: 'en', text: (i) => `ترجمة آلية ${i}` });
  const fpEn = fingerprint(id, en, 'fp_snap22001');
  const fpLong = fingerprint(id, en, 'fp_snap22002', 'long');
  const fpJa = fingerprint(id, ja, 'fp_snap22003');
  const t1 = translation({ videoId: id, label: 'أولى', edited: true, ref: fpJa, lang: 'en' });
  const t2 = translation({ videoId: id, label: 'ثانية', ref: fpLong, lang: 'fr' });
  const t3 = translation({ videoId: id, label: 'ثالثة', count: 4, importedAt: at(20) });
  const mark = (cue, kind) => ({ n: cue.n, startMs: cue.startMs, textHash: cueTextHash(cue.text), kind, at: at(40) });
  return {
    videoId: id, active: 1,
    record: record(id, { english: [en, ja, mt], fingerprints: [fpEn, fpLong, fpJa], arabic: t1, offset: 500, mode: 'dual', title: 'فيديو بثلاث ترجمات' }),
    slots: [
      { n: 1, name: null, track: t1, offsetMs: 500, marks: [mark(t1.current[0], 'todo'), mark(t1.current[2], 'done')], position: { n: 3, startMs: t1.current[2].startMs, at: at(50) } },
      { n: 2, name: 'مراجعة', track: t2, offsetMs: -1200, marks: [mark(t2.original[1], 'todo')], position: null },
      { n: 3, name: null, track: t3, offsetMs: 300, marks: [], position: null },
    ],
    previous: { from: 2, savedAt: at(10), track: translation({ videoId: id, label: 'سابقة', count: 3, lang: 'ar' }), offsetMs: 0 },
  };
}

/** فيديو بترجمة عربية واحدة على مسار إنجليزي وبصمته. */
function singleBundle() {
  const id = IDS.single;
  const en = sourceTrack({ text: (i) => `single ${i}` });
  const fp = fingerprint(id, en, 'fp_snap22004');
  const t = translation({ videoId: id, label: 'وحيدة', ref: fp, lang: 'ar' });
  return {
    videoId: id, active: 1, previous: null,
    record: record(id, { english: [en], fingerprints: [fp], arabic: t, offset: 700, title: 'فيديو بترجمة واحدة' }),
    slots: [{ n: 1, name: null, track: t, offsetMs: 700, marks: [], position: null }, empty(2), empty(3)],
  };
}

/** فيديو بمسار أصل مستخرج (تلقائي) بلا ترجمة بعد. */
function sourceOnlyBundle() {
  const id = IDS.source;
  const asr = sourceTrack({ kind: 'asr', text: (i) => `auto ${i}` });
  return {
    videoId: id, active: null, previous: null,
    record: record(id, { english: [asr], fingerprints: [fingerprint(id, asr, 'fp_snap22005')], arabic: null, title: 'فيديو بلا ترجمة' }),
    slots: [empty(1), empty(2), empty(3)],
  };
}

/**
 * يكتب المكتبة بشيفرة `root` (مجلد فيه src لإصدار 2.2.0) على مساحة جديدة، ثم يقرؤها بالشيفرة نفسها في سياق جديد.
 * @param {string} root
 * @returns {Promise<{ storage: Record<string, unknown>, read: object }>}
 */
export async function writeLibrary22(root) {
  const load = (p) => import(pathToFileURL(path.join(root, p)).href);
  const { createStore } = await load('src/core/store/index.js');
  const { cueTextHash } = await load('src/core/model/marks.js');
  let t = Date.parse(NOW);
  const now = () => (t += 1000);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now });
  await store.setSettings({
    offsetStepMs: 1000, displayModeDefault: 'dual',
    appearance: { font: 'tajawal', scale: 120, background: 'solid', position: 'raised' },
    export: { modeDefault: 'long', splitThreshold: 300 }, thresholds: { driftMs: 150, completeness: 0.9 },
  });
  await store.setPrefs({
    glossary: { attach: true, terms: [{ source: 'prompt', target: 'موجِّه', note: null }, { source: 'token', target: 'رمز', note: 'في سياق النماذج اللغوية' }] },
    review: { maxCps: 17 }, saveLocation: { mode: 'subfolder', folder: 'Tarjuman' },
    ui: { thumbnails: true, panelEntry: true, panelOpen: true, panelDual: false },
  });
  await store.addTerm({ source: 'latency', target: 'زمن الاستجابة', note: null });
  await store.setLangPrefs({ pair: { from: 'ja', to: 'en' }, remember: true, use: ['ja', 'en'], video: { videoId: IDS.full, pair: { from: 'ja', to: 'en' } } });
  await store.setUiLocale('en');
  await store.updateBundle(IDS.full, () => fullBundle(cueTextHash));
  await store.updateBundle(IDS.single, () => singleBundle());
  await store.updateBundle(IDS.source, () => sourceOnlyBundle());
  await store.setLastSave(42);
  await area.flush();

  // قراءة 2.2.0 في سياق جديد (كما يفتح المستخدم المحفوظات بعد إعادة تشغيل المتصفح): ما يراه هو من القيم نفسها.
  const reader = createStore({ area, now });
  const ids = Object.values(IDS);
  const read = {
    settings: await reader.getSettings(),
    prefs: await reader.getPrefs(),
    langPrefs: await reader.getLangPrefs(),
    uiLocale: await reader.getUiLocale(),
    lastSave: await reader.getLastSave(),
    unreadable: await reader.unreadableVideos(),
    index: await reader.listIndex(),
    library: await reader.listLibrary(),
    bundles: Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await reader.getBundle(id)]))),
  };
  await area.flush();
  return { storage: area.dump(), read };
}

/** اللقطة كما تُحفظ: البيانات ومصدرها. */
export const snapshotOf = ({ storage, read }) => ({
  note: 'لقطة تخزين مجمّدة كتبتها شيفرة 2.2.0 نفسها (c04a606، الإصدار المنشور في المتاجر) بمولّدها library-2.2.0.mjs، لاختبار الترقية من 2.2.0 والرجوع إليه (تحقق 2.3.0 ص-٢٢). لا تُعدَّل يدويًا: v2.2.test.js يتحقق أن المولّد على لقطة الشيفرة test/fixtures/v2.2 يعيدها حرفيًا.',
  version: '2.2.0',
  commit: COMMIT_2_2_0,
  storage,
  read,
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : undefined;
  };
  const root = arg('--root');
  const out = arg('--out');
  if (!root) {
    console.error('library-2.2.0: --root <مجلد فيه src من c04a606> مطلوب');
    process.exit(2);
  }
  const text = `${JSON.stringify(snapshotOf(await writeLibrary22(path.resolve(root))), null, 1)}\n`;
  if (out) await writeFile(out, text);
  else process.stdout.write(text);
}
