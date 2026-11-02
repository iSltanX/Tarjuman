// نموذج المحفوظات (P7-AC2/AC3): البحث بالعنوان والمعرّف بلا تشكيل، والترتيب، والزمن النسبي بالعربية، وبيانات الصف
// وشاراته، وخيارات التصدير بأسباب التعطيل، وملخص المقارنة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  comparisonSummary, copyGate, exportOptions, normalizeQuery, relativeTime, rowModel, searchEntries, sortEntries,
} from '../../../../src/pages/library/model.js';

const NOW = Date.parse('2026-11-02T12:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const entry = (over = {}) => ({
  schema: 1, videoId: 'dQw4w9WgXcQ', title: 'محاضرة عن الخطوط', updatedAt: ago(2 * HOUR), rev: 1,
  english: [{ key: 'en|manual', kind: 'manual', cueCount: 427 }],
  arabic: { fileName: 'dQw4w9WgXcQ.ar.srt', cueCount: 425, edited: false, matched: true, missing: 0, extra: 0, drift: 0 },
  fingerprints: 1, view: { displayOffsetMs: 0, displayMode: 'ar' }, ...over,
});

test('normalizeQuery: يسقط التشكيل والتطويل ويوحّد الألف والياء والتاء المربوطة والحالة', () => {
  assert.equal(normalizeQuery('  مُحَاضَرَة   عن  '), 'محاضره عن');
  assert.equal(normalizeQuery('أحمد إبراهيم آمن'), 'احمد ابراهيم امن');
  assert.equal(normalizeQuery('كــتاب'), 'كتاب');
  assert.equal(normalizeQuery('How TO'), 'how to');
  assert.equal(normalizeQuery(null), '');
});

test('البحث: بالعنوان أو المعرّف (جزء منهما)، والفارغ يعيد الكل، ولا نتيجة لغير المطابق', () => {
  const list = [
    entry({ videoId: 'AAAAAAAAAAA', title: 'مُحاضرة عن الخطوط' }),
    entry({ videoId: 'aB3kL9mPq2X', title: 'How Browsers Render Arabic Text' }),
    entry({ videoId: 'Zx81mN4qR7t', title: null }),
  ];
  assert.deepEqual(searchEntries(list, '').map((e) => e.videoId), list.map((e) => e.videoId));
  assert.deepEqual(searchEntries(list, '   ').length, 3);
  assert.deepEqual(searchEntries(list, 'محاضره').map((e) => e.videoId), ['AAAAAAAAAAA'], 'بلا تشكيل ولا تمييز تاء');
  assert.deepEqual(searchEntries(list, 'BROWSERS').map((e) => e.videoId), ['aB3kL9mPq2X'], 'بلا تمييز حالة');
  assert.deepEqual(searchEntries(list, 'zx81').map((e) => e.videoId), ['Zx81mN4qR7t'], 'بالمعرّف ولو بلا عنوان');
  assert.deepEqual(searchEntries(list, 'qr7t').map((e) => e.videoId), ['Zx81mN4qR7t'], 'جزء من المعرّف');
  assert.deepEqual(searchEntries(list, 'لا يوجد'), []);
});

test('الترتيب: آخر تعديل (الأحدث أولًا) أو العنوان (بلا عنوان آخرًا)، ولا يغيّر المصفوفة الأصلية', () => {
  const a = entry({ videoId: 'AAAAAAAAAAA', title: 'ب', updatedAt: ago(3 * DAY) });
  const b = entry({ videoId: 'BBBBBBBBBBB', title: 'أ', updatedAt: ago(1 * DAY) });
  const c = entry({ videoId: 'CCCCCCCCCCC', title: null, updatedAt: ago(2 * DAY) });
  const list = [a, b, c];
  assert.deepEqual(sortEntries(list, 'updated').map((e) => e.videoId), ['BBBBBBBBBBB', 'CCCCCCCCCCC', 'AAAAAAAAAAA']);
  assert.deepEqual(sortEntries(list, 'title').map((e) => e.videoId), ['BBBBBBBBBBB', 'AAAAAAAAAAA', 'CCCCCCCCCCC']);
  assert.deepEqual(list.map((e) => e.videoId), ['AAAAAAAAAAA', 'BBBBBBBBBBB', 'CCCCCCCCCCC']);
});

test('الزمن النسبي بالعربية: الآن، ودقائق، وساعات، وأمس، وأيام، وأسابيع، وأشهر، وسنوات', () => {
  const t = (ms) => relativeTime(ago(ms), NOW);
  assert.equal(t(10 * 1000), 'الآن');
  assert.equal(t(1 * MIN), 'قبل دقيقة');
  assert.equal(t(2 * MIN), 'قبل دقيقتين');
  assert.equal(t(5 * MIN), 'قبل 5 دقائق');
  assert.equal(t(15 * MIN), 'قبل 15 دقيقة');
  assert.equal(t(1 * HOUR), 'قبل ساعة');
  assert.equal(t(2 * HOUR), 'قبل ساعتين');
  assert.equal(t(3 * HOUR), 'قبل 3 ساعات');
  assert.equal(t(12 * HOUR), 'قبل 12 ساعة');
  assert.equal(t(1 * DAY), 'أمس');
  assert.equal(t(2 * DAY), 'قبل يومين');
  assert.equal(t(3 * DAY), 'قبل 3 أيام');
  assert.equal(t(7 * DAY), 'قبل أسبوع');
  assert.equal(t(14 * DAY), 'قبل أسبوعين');
  assert.equal(t(21 * DAY), 'قبل 3 أسابيع');
  assert.equal(t(30 * DAY), 'قبل شهر');
  assert.equal(t(90 * DAY), 'قبل 3 أشهر');
  assert.equal(t(330 * DAY), 'قبل 11 شهرًا');
  assert.equal(t(365 * DAY), 'قبل سنة');
  assert.equal(t(2 * 365 * DAY), 'قبل سنتين');
  assert.equal(t(5 * 365 * DAY), 'قبل 5 سنوات');
  assert.equal(relativeTime(new Date(NOW + 5 * HOUR).toISOString(), NOW), 'الآن', 'ساعة جهاز متقدمة');
  assert.equal(relativeTime('ليس تاريخًا', NOW), '');
});

test('rowModel: شارات الملفات والتحذير والإزاحة والتاريخ', () => {
  const m = rowModel(entry({ english: [{ key: 'en|asr', kind: 'asr', cueCount: 9 }, { key: 'en|manual', kind: 'manual', cueCount: 5 }], view: { displayOffsetMs: 500, displayMode: 'ar' } }), NOW);
  assert.deepEqual(m.badges.map((b) => b.text), ['EN يدوي', 'EN تلقائي', 'AR الأصل']);
  assert.equal(m.offsetText, 'الإزاحة \u2066+0.5\u2069 ث', 'معزولة LTR (CL-001)');
  assert.equal(m.relative, 'قبل ساعتين');
  assert.match(m.absolute, /2026/);
  assert.equal(m.displayTitle, 'محاضرة عن الخطوط');
  assert.equal(rowModel(entry({ view: { displayOffsetMs: 0, displayMode: 'ar' } }), NOW).offsetText, null);
  assert.equal(rowModel(entry({ view: { displayOffsetMs: -1000, displayMode: 'ar' } }), NOW).offsetText, 'الإزاحة \u2066−1.0\u2069 ث');

  const edited = rowModel(entry({ arabic: { fileName: 'x', cueCount: 3, edited: true, matched: false, missing: 3, extra: 0, drift: 0 } }), NOW);
  assert.deepEqual(edited.badges.map((b) => [b.text, b.tone]), [['EN يدوي', 'neutral'], ['AR معدّلة', 'edited'], ['3 ناقصة', 'warning']]);
  const both = rowModel(entry({ arabic: { fileName: 'x', cueCount: 3, edited: false, matched: false, missing: 2, extra: 1, drift: 12 } }), NOW);
  assert.equal(both.badges.at(-1).text, '2 ناقصة · 1 زائدة · توقيت مختلف في 12');
  const noFp = rowModel(entry({ arabic: { fileName: 'x', cueCount: 3, edited: false, matched: null, missing: 0, extra: 0, drift: 0 } }), NOW);
  assert.equal(noFp.badges.some((b) => b.tone === 'warning'), false, 'لا بصمة: لا شارة تحذير');
  const none = rowModel(entry({ arabic: null, english: [] }), NOW);
  assert.deepEqual(none.badges, []);
  assert.equal(none.hasArabic, false);
});

test('rowModel: بلا عنوان محفوظ يظهر بنصه واسم الوصول يعود إلى المعرّف', () => {
  const m = rowModel(entry({ title: null }), NOW);
  assert.equal(m.displayTitle, 'بلا عنوان محفوظ');
  assert.equal(m.hasTitle, false);
  assert.equal(m.accessName, 'dQw4w9WgXcQ');
  assert.equal(rowModel(entry(), NOW).accessName, 'محاضرة عن الخطوط');
});

test('خيارات التصدير: العربية الحالية والأصل والإنجليزية، والمعطّل يذكر سببه', () => {
  const full = exportOptions(entry({ arabic: { fileName: 'x', cueCount: 3, edited: true, matched: true, missing: 0, extra: 0, drift: 0 } }));
  assert.deepEqual(full.map((o) => [o.label, o.disabledReason]), [
    ['العربية — النسخة الحالية', null], ['العربية — الأصل المستورد', null], ['الإنجليزية — المستخرجة', null],
  ]);
  assert.deepEqual(full[2].action, { type: 'en', trackKey: 'en|manual' });
  assert.equal(full[2].hint, '427 مقطعًا');

  const plain = exportOptions(entry());
  assert.equal(plain[1].disabledReason, 'لم تُعدَّل الترجمة، فالأصل المستورد هو النسخة الحالية.');

  const englishOnly = exportOptions(entry({ arabic: null }));
  assert.equal(englishOnly[0].disabledReason, 'لا ترجمة عربية محفوظة لهذا الفيديو.');
  assert.equal(englishOnly[1].disabledReason, 'لا ترجمة عربية محفوظة لهذا الفيديو.');
  assert.equal(englishOnly[2].disabledReason, null);

  const nothing = exportOptions(entry({ arabic: null, english: [] }));
  assert.equal(nothing.at(-1).disabledReason, 'لا مسار إنجليزي محفوظ لهذا الفيديو.');

  const two = exportOptions(entry({ english: [{ key: 'en|manual', kind: 'manual', cueCount: 5 }, { key: 'en|asr', kind: 'asr', cueCount: 9 }] }));
  assert.deepEqual(two.slice(2).map((o) => o.label), ['الإنجليزية — يدوي', 'الإنجليزية — تلقائي']);
});

test('«نسخ»: يعمل لمعرّف صالح ويُعطَّل بسببه لغيره', () => {
  assert.deepEqual(copyGate({ videoId: 'dQw4w9WgXcQ' }), { enabled: true, reason: null });
  const bad = copyGate({ videoId: 'bad' });
  assert.equal(bad.enabled, false);
  assert.match(bad.reason, /معرّف الفيديو غير صالح/);
});

const report = (over = {}) => ({
  fingerprintId: 'fp_test000001', matched: false, countSource: 427, countTarget: 425, numbering: 'same',
  missing: [], extra: [], drift: [], empty: [], noArabic: [], restoreTimingAvailable: false, driftThresholdMs: 100, notes: [], ...over,
});

test('ملخص المقارنة: لا بصمة، ومطابق، وناقص، وزائد، وتوقيت مختلف، وفارغ', () => {
  assert.deepEqual(comparisonSummary(null), { tone: 'info', lines: ['لا بصمة للمقارنة؛ عُرض الملف كما هو.'] });
  assert.equal(comparisonSummary(report({ fingerprintId: null, countSource: null })).tone, 'info');
  assert.deepEqual(comparisonSummary(report({ matched: true, countTarget: 427 })), { tone: 'success', lines: ['مطابق للأصل ✓'] });
  const missing = comparisonSummary(report({ missing: [57, 58, 201] }));
  assert.equal(missing.tone, 'warning');
  assert.deepEqual(missing.lines, ['عدد المقاطع: 425 من 427', '3 مقاطع ناقصة: 57، 58، 201']);
  assert.equal(comparisonSummary(report({ countTarget: 427, extra: [428] })).lines[0], 'مقطع واحد زائد: 428');
  assert.equal(comparisonSummary(report({ countTarget: 427, drift: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, startDeltaMs: 300, endDeltaMs: 0 })) })).lines[0], 'توقيت مختلف في 12 مقطعًا');
  assert.equal(comparisonSummary(report({ countTarget: 427, drift: [{ n: 1, startDeltaMs: 300, endDeltaMs: 0 }] })).lines[0], 'توقيت مختلف في مقطع واحد');
  assert.match(comparisonSummary(report({ countTarget: 427, empty: [3, 4] })).lines[0], /^مقطعان فارغان \(لم يترجمها النموذج\): 3، 4$/);
  const many = comparisonSummary(report({ countTarget: 427, missing: Array.from({ length: 20 }, (_, i) => i + 1) })).lines.at(-1);
  assert.match(many, /^20 مقطعًا ناقصًا: 1، 2، 3، 4، 5، 6، 7، 8…$/);
  assert.equal(comparisonSummary(report({ countTarget: 427, numbering: 'different' })).lines[0], 'ترقيم المقاطع يختلف عن الملف المصدَّر.');
});
