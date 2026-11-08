// نموذج المحفوظات (P7-AC2/AC3): البحث بالعنوان والمعرّف بلا تشكيل، والترتيب، والزمن النسبي بالعربية، وبيانات الصف
// وشاراته، وخيارات التصدير بأسباب التعطيل، وملخص المقارنة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chipLabel, comparisonSummary, copyGate, dateGroupOf, deleteSummary, exportOptions, groupEntries, normalizeQuery, relativeTime,
  rowModel, rowStatus, searchEntries, slotsPhrase, sortEntries, translationTotal,
} from '../../../../src/pages/library/model.js';
import { sampleBundle } from '../../../helpers/fixtures-v2.js';

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

test('rowModel: سطر «عُدّل منذ · N مقطعًا» والتاريخ المطلق، وعدد مقاطع الترجمة النشطة', () => {
  const m = rowModel(entry(), NOW);
  assert.equal(m.whenText, 'عُدّل قبل ساعتين');
  assert.equal(m.relative, 'قبل ساعتين');
  assert.match(m.absolute, /2026/);
  assert.equal(m.countText, '425 مقطعًا');
  assert.equal(m.offsetText, null, 'إزاحة صفر: لا نص');
  assert.equal(rowModel(entry({ view: { displayOffsetMs: 500, displayMode: 'ar' } }), NOW).offsetText, 'الإزاحة \u2066+0.5\u2069 ث', 'معزولة LTR (CL-001)');
  assert.equal(rowModel(entry({ view: { displayOffsetMs: -1000, displayMode: 'ar' } }), NOW).offsetText, 'الإزاحة \u2066−1.0\u2069 ث');
  assert.equal(m.displayTitle, 'محاضرة عن الخطوط');
  assert.equal(rowModel(entry({ updatedAt: ago(5 * 1000) }), NOW).whenText, 'عُدّل الآن');
  assert.equal(rowModel(entry({ updatedAt: 'ليس تاريخًا' }), NOW).whenText, null, 'لا تاريخ مخمّن');
  // بلا ترجمة: مقاطع المسار الإنجليزي (اليدوي أولًا) بوصفها إنجليزية، وإلا لا شيء.
  const en = [{ key: 'en|asr', kind: 'asr', cueCount: 9 }, { key: 'en|manual', kind: 'manual', cueCount: 286 }];
  assert.equal(rowModel(entry({ arabic: null, english: en }), NOW).countText, '286 مقطعًا في الأصل');
  assert.equal(rowModel(entry({ arabic: null, english: [] }), NOW).countText, null);
});

test('rowModel: الشرائح للترجمات الموجودة وحدها، وأول خانة فارغة للرفع، وحالة الأصل لسطر «لا ترجمة»', () => {
  const slot = (n, filled, extra = {}) => ({ n, filled, active: false, name: null, edited: false, cueCount: filled ? 5 : 0, ...extra });
  const m = rowModel(entry({ slots: [slot(1, false), slot(2, true, { active: true, name: 'Claude' }), slot(3, true)] }), NOW);
  assert.deepEqual(m.filled.map((s) => s.n), [2, 3], 'الفارغة لا تُعدّ نسخةً');
  assert.equal(m.nextEmpty, 1, 'أول خانة فارغة ولو سبقت الممتلئة');
  assert.deepEqual(m.filled.map(chipLabel), ['2 · Claude', 'الترجمة 3'], 'الاسم المختصر إن وُجد وإلا «الترجمة N»');
  assert.equal(rowModel(entry({ slots: [slot(1, true, { active: true }), slot(2, true), slot(3, true)] }), NOW).nextEmpty, null, 'ثلاث ترجمات: لا شريحة رفع');
  // سجل الإصدار الأول بلا slots: النشطة في 1، والتالية 2.
  const old = rowModel(entry(), NOW);
  assert.deepEqual(old.filled.map((s) => s.n), [1]);
  assert.equal(old.nextEmpty, 2);
  const none = rowModel(entry({ arabic: null, english: [] }), NOW);
  assert.deepEqual(none.filled, []);
  assert.equal(none.nextEmpty, 1);
  assert.equal(none.sourceText, 'الأصل غير ملتقط');
  assert.equal(rowModel(entry({ arabic: null }), NOW).sourceText, 'الأصل جاهز');
  assert.equal(none.hasArabic, false);
});

test('rowStatus: شارة واحدة بأولوية «تحتاج مراجعة» ثم التحذير الآلي ثم «معدّلة» ثم «مترجمة»، وبلا ترجمة «بانتظار الترجمة»', () => {
  const ar = (over = {}) => ({ fileName: 'x', cueCount: 3, edited: false, matched: true, missing: 0, extra: 0, drift: 0, ...over });
  const summary = (over = {}) => ({ filled: 1, edited: 0, warned: 0, marks: { todo: 0, done: 0 }, ...over });
  assert.deepEqual(rowStatus(entry({ arabic: null })).text, 'بانتظار الترجمة');
  assert.equal(rowStatus(entry({ arabic: null })).tone, 'neutral');
  assert.deepEqual([rowStatus(entry({ arabic: ar() })).text, rowStatus(entry({ arabic: ar() })).tone], ['مترجمة', 'success']);
  assert.deepEqual([rowStatus(entry({ arabic: ar({ edited: true }) })).text, rowStatus(entry({ arabic: ar({ edited: true }) })).tone], ['معدّلة', 'edited']);
  assert.equal(rowStatus(entry({ arabic: ar(), summary: summary({ edited: 1 }) })).text, 'معدّلة', 'معدّلة في خانة غير نشطة');
  const warned = rowStatus(entry({ arabic: ar({ edited: true, matched: false, missing: 3 }) }));
  assert.deepEqual([warned.text, warned.tone, warned.title], ['3 مقاطع ناقصة', 'warning', '3 مقاطع ناقصة · معدّلة'], 'التحذير قبل «معدّلة» وتلميحه يسرد الحالات المنطبقة');
  assert.equal(rowStatus(entry({ arabic: ar({ matched: false, missing: 2, extra: 1, drift: 12 }) })).text, 'مقطعان ناقصان · مقطع زائد · توقيت مختلف في 12 مقطعًا');
  assert.equal(rowStatus(entry({ arabic: ar({ matched: false, missing: 3, extra: 3, drift: 2 }) })).text, '3 مقاطع ناقصة · 3 مقاطع زائدة · توقيت مختلف في مقطعين');
  assert.equal(rowStatus(entry({ arabic: ar({ matched: null }) })).tone, 'success', 'لا بصمة: لا تحذير');
  const review = rowStatus(entry({ arabic: ar({ edited: true, matched: false, missing: 1 }), summary: summary({ marks: { todo: 2, done: 0 } }) }));
  assert.deepEqual([review.text, review.tone], ['تحتاج مراجعة (2)', 'info']);
});

test('التجميع بالتاريخ: اليوم من منتصف ليل الجهاز، وهذا الأسبوع الأيام الستة قبله، وأقدم؛ والمستقبلي اليوم وغير الصالح أقدم', () => {
  const now = new Date(2026, 10, 3, 15, 30).getTime(); // محلي: 3 نوفمبر 15:30
  const at = (daysAgo, h = 12) => new Date(2026, 10, 3 - daysAgo, h, 0).toISOString();
  assert.equal(dateGroupOf(at(0, 0), now), 'today', 'منتصف الليل نفسه');
  assert.equal(dateGroupOf(at(0, 9), now), 'today');
  assert.equal(dateGroupOf(at(1, 23), now), 'week', 'أمس مساءً');
  assert.equal(dateGroupOf(at(6, 0), now), 'week', 'قبل ست أيام من منتصف الليل');
  assert.equal(dateGroupOf(at(7, 12), now), 'older');
  assert.equal(dateGroupOf(new Date(now + 5 * HOUR).toISOString(), now), 'today', 'ساعة جهاز متقدمة');
  assert.equal(dateGroupOf('ليس تاريخًا', now), 'older');

  const list = [entry({ videoId: 'AAAAAAAAAAA', updatedAt: at(0) }), entry({ videoId: 'BBBBBBBBBBB', updatedAt: at(0, 8) }), entry({ videoId: 'CCCCCCCCCCC', updatedAt: at(3) }), entry({ videoId: 'DDDDDDDDDDD', updatedAt: at(30) })];
  const groups = groupEntries(list, now);
  assert.deepEqual(groups.map((g) => [g.key, g.label, g.entries.map((e) => e.videoId)]), [
    ['today', 'اليوم', ['AAAAAAAAAAA', 'BBBBBBBBBBB']], ['week', 'آخر 7 أيام', ['CCCCCCCCCCC']], ['older', 'أقدم', ['DDDDDDDDDDD']],
  ], 'ترتيب الأقسام وترتيب الصفوف داخلها كما وردت');
  assert.deepEqual(groupEntries([list[3]], now).map((g) => g.key), ['older'], 'الأقسام الفارغة لا تُعاد');
  assert.deepEqual(groupEntries([], now), []);
});

test('translationTotal: مجموع الخانات الممتلئة (ولسجل الإصدار الأول ترجمة واحدة)', () => {
  const slots = (...f) => f.map((filled, i) => ({ n: i + 1, filled }));
  assert.equal(translationTotal([entry({ slots: slots(true, true, false) }), entry({ slots: slots(true, false, false) }), entry({ arabic: null, slots: slots(false, false, false) })]), 3);
  assert.equal(translationTotal([entry(), entry({ arabic: null })]), 1, 'بلا slots: النشطة وحدها');
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
    ['الترجمة — النسخة الحالية', null], ['الترجمة — النسخة المرفوعة', null], ['الإنجليزية — المستخرجة', null],
  ]);
  assert.deepEqual(full[2].action, { type: 'en', trackKey: 'en|manual' });
  assert.equal(full[2].hint, '427 مقطعًا');

  const plain = exportOptions(entry());
  assert.equal(plain[1].disabledReason, 'لم تُعدَّل الترجمة، فالنسخة المرفوعة هي الحالية.');

  const englishOnly = exportOptions(entry({ arabic: null }));
  assert.equal(englishOnly[0].disabledReason, 'لا ترجمة محفوظة لهذا الفيديو.');
  assert.equal(englishOnly[1].disabledReason, 'لا ترجمة محفوظة لهذا الفيديو.');
  assert.equal(englishOnly[2].disabledReason, null);

  const nothing = exportOptions(entry({ arabic: null, english: [] }));
  assert.equal(nothing.at(-1).disabledReason, 'لا أصل محفوظ لهذا الفيديو.');

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
  assert.deepEqual(comparisonSummary(null), { tone: 'info', lines: ['لا مرجع للمقارنة بالأصل، فيُعرض الملف كما هو.'] });
  assert.equal(comparisonSummary(report({ fingerprintId: null, countSource: null })).tone, 'info');
  assert.deepEqual(comparisonSummary(report({ matched: true, countTarget: 427 })), { tone: 'success', lines: ['مطابق للأصل'] });
  const missing = comparisonSummary(report({ missing: [57, 58, 201] }));
  assert.equal(missing.tone, 'warning');
  assert.deepEqual(missing.lines, ['عدد المقاطع: 425 من 427', '3 مقاطع ناقصة: 57، 58، 201']);
  assert.equal(comparisonSummary(report({ countTarget: 427, extra: [428] })).lines[0], 'مقطع واحد زائد: 428');
  assert.equal(comparisonSummary(report({ countTarget: 427, drift: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, startDeltaMs: 300, endDeltaMs: 0 })) })).lines[0], 'توقيت مختلف في 12 مقطعًا');
  assert.equal(comparisonSummary(report({ countTarget: 427, drift: [{ n: 1, startDeltaMs: 300, endDeltaMs: 0 }] })).lines[0], 'توقيت مختلف في مقطع واحد');
  assert.match(comparisonSummary(report({ countTarget: 427, empty: [3, 4] })).lines[0], /^مقطعان فارغان: 3، 4$/);
  const many = comparisonSummary(report({ countTarget: 427, missing: Array.from({ length: 20 }, (_, i) => i + 1) })).lines.at(-1);
  assert.match(many, /^20 مقطعًا ناقصًا: 1، 2، 3، 4، 5، 6، 7، 8…$/);
  assert.equal(comparisonSummary(report({ countTarget: 427, numbering: 'different' })).lines[0], 'ترقيم المقاطع يختلف عن الأصل.');
});

test('slotsPhrase: «الترجمة 2» و«الترجمتان 1 و3» و«الترجمات 1 و2 و3»', () => {
  assert.equal(slotsPhrase([2]), 'الترجمة 2');
  assert.equal(slotsPhrase([1, 3]), 'الترجمتان 1 و3');
  assert.equal(slotsPhrase([1, 2, 3]), 'الترجمات 1، 2 و3');
});

test('deleteSummary: بنود لما يوجد فعلًا وحده، لكل ترجمة وللكل، وما يبقى', () => {
  const LRI = String.fromCodePoint(0x2066);
  const PDI = String.fromCodePoint(0x2069);
  const b = sampleBundle({ videoId: 'AAAAAAAAAAA', third: true });
  // الكل: ثلاث ترجمات بأسماء، والسابقة، وتعديلات الأولى (5)، وعلامات الأولى والثانية (3)، وإزاحاتها، وموضع الأولى، والإنجليزي والبصمات.
  assert.deepEqual(deleteSummary(b, { scope: 'all' }), {
    items: [
      'الترجمات 1 و2 «مراجعة» و3', 'النسخة السابقة (من الترجمة 2)', '5 تعديلات يدوية', '3 علامات مراجعة', 'الإزاحات المحفوظة', 'آخر موضع محفوظ في المحرّر',
      'ملف أصل محفوظ', 'مراجع المقارنة بالأصل (2)', 'عنوان الفيديو ومدته وإعدادات عرضه',
    ],
    keeps: [],
  });
  // ترجمة نشطة واحدة: الأولى بتعديلاتها وعلاماتها (2) وإزاحتها وموضعها؛ ويبقى غيرها والسابقة والإنجليزي، وتصبح الثانية النشطة.
  const one = deleteSummary(b, { scope: 'slot', n: 1 });
  assert.deepEqual(one.items, [`الترجمة 1 — ملف ${LRI}${b.slots[0].track.fileName}${PDI}`, '5 تعديلات يدوية', 'علامتا مراجعة', `الإزاحة المحفوظة (${LRI}+0.5${PDI} ث)`, 'آخر موضع محفوظ في المحرّر']);
  assert.deepEqual(one.keeps, ['الترجمتان 2 و3 تبقى، وتصبح الترجمة 2 النشطة', 'النسخة السابقة تبقى', 'ملفات الأصل المحفوظة ومراجع المقارنة تبقى']);
  // غير نشطة بلا شيء: الثانية بعلامة واحدة وإزاحة؛ لا «تصبح النشطة» لأن النشطة غيرها.
  const two = deleteSummary(b, { scope: 'slot', n: 2 });
  assert.deepEqual(two.items.slice(1), ['علامة مراجعة واحدة', `الإزاحة المحفوظة (${LRI}−1.2${PDI} ث)`]);
  assert.ok(two.items[0].startsWith('الترجمة 2 «مراجعة» — ملف'));
  assert.deepEqual(two.keeps, ['الترجمتان 1 و3 تبقى', 'النسخة السابقة تبقى', 'ملفات الأصل المحفوظة ومراجع المقارنة تبقى']);
  // بلا سابقة ولا ترجمة أخرى: لا بنود «تبقى» لها.
  const solo = sampleBundle({ videoId: 'AAAAAAAAAAA', previous: false });
  solo.slots[1] = { n: 2, name: null, track: null, offsetMs: 0, marks: [], position: null };
  assert.deepEqual(deleteSummary(solo, { scope: 'slot', n: 1 }).keeps, ['ملفات الأصل المحفوظة ومراجع المقارنة تبقى']);
  assert.ok(!deleteSummary(solo, { scope: 'all' }).items.some((t) => t.includes('السابقة')), 'لا سابقة: لا بند لها');
  // مراجعة الهوية L5: لا ترجمة ممتلئة وبقيت نسخة سابقة: تُذكر لأنها تُحذف مع الفيديو.
  const onlyPrev = sampleBundle({ videoId: 'AAAAAAAAAAA' });
  onlyPrev.slots = onlyPrev.slots.map((x) => ({ ...x, track: null, marks: [], offsetMs: 0, position: null }));
  assert.ok(deleteSummary(onlyPrev, { scope: 'all' }).items.includes(`النسخة السابقة (من الترجمة ${onlyPrev.previous.from})`));
});
