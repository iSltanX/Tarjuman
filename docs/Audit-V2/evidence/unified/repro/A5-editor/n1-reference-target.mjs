// ملاحظة مستقلة A5-N1 (امتداد): «حفظ المرجع» في المحرّر (app.js:865) يحسب التقرير المحفوظ بـcompare(...) بلا target فيُفحص
// «غير مترجم» بالعربية، ثم trackComparison (المحفوظات والمشغّل) تعيد هذا التقرير المحفوظ كما هو لترجمة غير معدّلة بلا نقص
// ولا زيادة ولا انحراف (current.js:112). نقارن بما يحسبه الاستيراد (import/index.js:130 يمرّر target).
// الاستعمال: command node n1-reference-target.mjs <جذر الشيفرة>
const R = process.argv[2];
if (!R) throw new Error('مرّر جذر الشيفرة');
const { compare } = await import(`${R}/src/core/compare/compare.js`);
const { trackComparison } = await import(`${R}/src/core/compare/current.js`);
const { makeCues, fingerprint, englishTrack } = await import(`${R}/test/helpers/fixtures.js`);

const cues = makeCues(5, { text: (i) => `Bonjour ${i}` });
const fp = fingerprint({ track: englishTrack({ cues: makeCues(5, { text: (i) => `line ${i}` }) }) });
const editorStored = compare(cues, fp, { driftMs: 100 }); // كما في app.js:865
const importStored = compare(cues, fp, { driftMs: 100, target: 'fr' }); // كما يمرّر الاستيراد لغة الترجمة
const track = (stored) => ({ original: cues, current: null, fingerprintId: fp.id, comparison: stored, lang: 'fr' });
console.log(JSON.stringify({
  editorReferenceStoredNoArabic: editorStored.noArabic,
  trackComparisonFromEditorStored: trackComparison(track(editorStored), [fp]).noArabic,
  trackComparisonFromImportStored: trackComparison(track(importStored), [fp]).noArabic,
  expected: 'French translation: [] everywhere (same script as the en source)',
}, null, 2));
