// TJ-AUD-014: reviewItems يربط «بلا حروف عربية» و«انحراف» برقم المقطع c.n، فبعد الشطر (قطعتان بالرقم نفسه) تُوسَم القطعة السليمة.
import { ROOT, log, makeCues, englishTrack, fingerprint } from './harness.mjs';

const { reviewItems, completionGroups, resolveSlotMarks } = await import(`${ROOT}/src/core/edit/review.js`);
const { findIssues } = await import(`${ROOT}/src/core/edit/issues.js`);
const { splitCue } = await import(`${ROOT}/src/core/edit/structure.js`);
const { currentComparison, fingerprintCoverage } = await import(`${ROOT}/src/core/compare/index.js`);

const en = englishTrack({ cues: makeCues(5, { text: (i) => `line ${i}` }) });
const fp = fingerprint({ track: en });
let cues = makeCues(5, { text: (i) => `سطر عربي ${i}` });
// شطر المقطع 2 عند المحرف 4: «سطر » | «عربي 2»
cues = splitCue(cues, 1, 4);
log('بعد الشطر:', cues.map((c) => `${c.n}:${c.startMs}-${c.endMs}:${JSON.stringify(c.text)}`).join(' | '));
// القطعة الثانية تُترك إنجليزية (لم تُترجم)، والأولى عربية.
cues[2] = { ...cues[2], text: 'untranslated piece' };
const cov = fingerprintCoverage(fp, cues);
const comparison = currentComparison(cues, fp, { driftMs: 100, coverage: cov });
log('المقارنة: noArabic =', JSON.stringify(comparison.noArabic), '| drift =', JSON.stringify(comparison.drift.map((d) => d.n)));
const items = reviewItems({ cues, issues: findIssues(cues), comparison, fingerprint: fp, marks: resolveSlotMarks([], cues), includeText: true });
for (const it of items) log('بند التقرير:', it.n, JSON.stringify(it.text), it.problems.join(','));
const groups = completionGroups({ cues, comparison, fingerprint: fp, marks: resolveSlotMarks([], cues), selection: [], numbersOf: cov.ok ? cov.numbersOf : null });
log('للمقارنة completionGroups.noArabic (يفحص نص المقطع نفسه):', JSON.stringify(groups.noArabic));

// الانحراف: قطعتان بالرقم نفسه، وإحداهما فقط منحرفة؟ (pairs تخص المقاطع المقترنة 1:1)
const drifted = cues.map((c, i) => (i === 1 ? { ...c, startMs: c.startMs + 900 } : c));
const cov2 = fingerprintCoverage(fp, drifted);
const cmp2 = currentComparison(drifted, fp, { driftMs: 100, coverage: cov2 });
log('انحراف قطعة مشطورة: drift =', JSON.stringify(cmp2.drift), '| pairs تشمل القطعتين؟', JSON.stringify(cov2.pairs));
const items2 = reviewItems({ cues: drifted, issues: findIssues(drifted), comparison: cmp2, fingerprint: fp, marks: resolveSlotMarks([], drifted) });
for (const it of items2) log('بند (انحراف):', it.n, it.startMs, it.problems.join(','));

// ملف مستورد بأرقام مكررة (بلا شطر): مقطعان برقم 3 أحدهما عربي.
const dup = makeCues(5, { text: (i) => `سطر عربي ${i}` }).map((c, i) => (i === 3 ? { ...c, n: 3, text: 'English only' } : c));
const cmp3 = currentComparison(dup, fp, { driftMs: 100 });
const items3 = reviewItems({ cues: dup, issues: findIssues(dup), comparison: cmp3, fingerprint: fp, marks: resolveSlotMarks([], dup), includeText: true });
log('أرقام مكررة في الملف: noArabic =', JSON.stringify(cmp3.noArabic));
for (const it of items3) log('بند (مكرر):', it.n, JSON.stringify(it.text), it.problems.join(','));
