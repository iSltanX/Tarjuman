// E-14: كلفة ما يجري مع كل ضغطة في المحرّر (دوال نقية فقط، Node على هذا الجهاز؛ المتصفح والجهاز الأبطأ يختلفان).
// مع كل ضغطة: session.issues() (findIssues كاملًا) فورًا، وبعد 120ms searchCues كاملًا إن كان بحث، وبعد 250ms
// currentComparison/fingerprintCoverage وresolveSlotMarks وإعادة رسم اللوحة.
import { ROOT, log } from './harness.mjs';

const { findIssues } = await import(`${ROOT}/src/core/edit/issues.js`);
const { searchCues } = await import(`${ROOT}/src/core/edit/search.js`);
const { createEditSession } = await import(`${ROOT}/src/core/edit/session.js`);
const { englishReference } = await import(`${ROOT}/src/core/edit/reference.js`);
const { resolveSlotMarks } = await import(`${ROOT}/src/core/edit/review.js`);
const { fingerprintCoverage, currentComparison } = await import(`${ROOT}/src/core/compare/index.js`);

const words = ['الْكِتَابُ', 'مُهِمٌّ', 'جِدًّا', 'لِلطُّلَّابِ', 'في', 'هذه', 'المرحلة', 'إِنَّ', 'أَحْمَدَ', 'سَيُسافِرُ', 'غَدًا', 'إلى', 'المدينة', 'الشبكة', 'العصبية'];
const time = (label, fn, reps = 5) => {
  fn();
  const t0 = performance.now();
  for (let r = 0; r < reps; r++) fn();
  const ms = (performance.now() - t0) / reps;
  log(`  ${label.padEnd(46)} ${ms.toFixed(1)} ms`);
  return ms;
};
for (const N of [2000, 5000, 10000]) {
  const cues = Array.from({ length: N }, (_, i) => {
    const s = 1000 + i * 2500;
    const line = (k0) => Array.from({ length: 6 }, (_, k) => words[(i * 7 + k * 3 + k0) % words.length]).join(' ');
    return { n: i + 1, startMs: s, endMs: s + 2000, text: `${line(0)}\n${line(5)}` };
  });
  const en = cues.map((c) => ({ ...c, text: `English line number ${c.n} with some words` }));
  const fp = { id: 'fp_test000001', videoId: 'AAAAAAAAAAA', trackKey: 'en|manual', mode: 'normal', count: N, cues: en.map(({ n, startMs, endMs }) => ({ n, startMs, endMs })), textHash: 'fnv1a64:0123456789abcdef', fileName: 'x.srt', createdAt: '2026-11-01T12:00:00.000Z', parts: null };
  log(`N=${N}`);
  const a = time('findIssues (الكثافة مفعّلة) — فورًا مع كل ضغطة', () => findIssues(cues, { density: { maxCps: 17 } }));
  const b = time('searchCues «المدينة» + تجاهل التشكيل — بعد 120ms', () => searchCues(cues, 'المدينة', { ignoreMarks: true }));
  let cov;
  const c = time('fingerprintCoverage — بعد 250ms', () => { cov = fingerprintCoverage(fp, cues); }, 3);
  const d = time('currentComparison(coverage) — بعد 250ms', () => currentComparison(cues, fp, { driftMs: 100, coverage: cov }), 3);
  const e = time('resolveSlotMarks (بلا علامات) — بعد 250ms', () => resolveSlotMarks([], cues), 3);
  time('englishReference (عند إعادة البناء)', () => englishReference(cues, en, fp, { coverage: cov }), 3);
  const s = createEditSession({ cues, offsetMs: 0, density: { maxCps: 17 } });
  let k = 0;
  time('session.setText + issues() (ضغطة واحدة)', () => { s.setText(10, `${cues[10].text}${k++ % 2 ? 'ا' : ''}`); s.issues(); }, 20);
  log(`  ≈ مجموع العمل المتزامن بعد سكون قصير: ${(a + b + c + d + e).toFixed(0)} ms`);
}
