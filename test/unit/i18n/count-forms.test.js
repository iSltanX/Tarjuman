// ع-٢٦ وع-٢٧ (تحقق Gemini وFable، 2026-11-13): صيغ العدد في القوالب التي يقع فيها العدد مجرورًا أو منصوبًا، والقالبان اللذان كانا
// يضعان الرقم خامًا، والجمع الإنجليزي بالعدد. مجسّ صيغ العدد (B-probes/i18n-plurals-b.mjs) صار اختبارًا: كل قالب بالوسائط التي يمررها
// موضع استدعائه، بالأعداد 1 و2 و3 و11 و100 باللغتين؛ وما في دالة نقية يُستدعى بها، وما في شيفرة واجهة يُقرأ سطر استدعائه فيُتحقق
// أنه يمرر حالة الإعراب نفسها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogOf, setLocale, t } from '../../../src/i18n/index.js';
import { COUNT_FORMS, formatCount } from '../../../src/ui/format.js';
import { COUNT, comparisonLines, mergePreview } from '../../../src/pages/editor/text.js';
import { completeLine } from '../../../src/player/controls/text.js';

const NS = [1, 2, 3, 11, 100];
const reset = (ctx) => ctx.after(() => setLocale('ar'));
const src = (file) => readFileSync(new URL(`../../../src/${file}`, import.meta.url), 'utf8');

// المعدود بالأعداد NS، مكتوبًا هنا لا محسوبًا: المجرور والمنصوب يختلفان عن المرفوع في المثنى («مقطعين»)، والمنصوب في المفرد كذلك.
const AR = {
  cueGen: ['مقطع واحد', 'مقطعين', '3 مقاطع', '11 مقطعًا', '100 مقطع'],
  cueAcc: ['مقطعًا واحدًا', 'مقطعين', '3 مقاطع', '11 مقطعًا', '100 مقطع'],
  changeGen: ['تغيير واحد', 'تغييرين', '3 تغييرات', '11 تغييرًا', '100 تغيير'],
  translationGen: ['ترجمة واحدة', 'ترجمتين', '3 ترجمات', '11 ترجمة', '100 ترجمة'],
  videoGen: ['فيديو واحد', 'فيديوهين', '3 فيديوهات', '11 فيديو', '100 فيديو'],
  item: ['بند واحد', 'بندان', '3 بنود', '11 بندًا', '100 بند'],
  line: ['سطر واحد', 'سطران', '3 أسطر', '11 سطرًا', '100 سطر'],
};
const en = (one, other) => NS.map((n) => (n === 1 ? `1 ${one}` : `${n} ${other}`));
const EN = {
  cue: en('segment', 'segments'), change: en('change', 'changes'), translation: en('translation', 'translations'), video: en('video', 'videos'),
  item: en('item', 'items'), line: en('line', 'lines'),
};

const gen = (n, forms) => formatCount(n, forms, { case: 'gen' });
const acc = (n, forms) => formatCount(n, forms, { case: 'acc' });

/**
 * القوالب التي يمررها موضع استدعاء في شيفرة واجهة: المفتاح، وموضعه وحالة إعرابه، والوسائط كما يمررها، والجملة باللغتين (# مكان المعدود).
 * @type {{ key: string, site: [string, string, 'gen' | 'acc'], params: (n: number) => object, ar: [string, string[]], en: [string, string[]] }[]}
 */
const SITES = [
  {
    key: 'editor.search.replaced', site: ['pages/editor/app.js', "'editor.search.replaced'", 'gen'], params: (n) => ({ count: gen(n, COUNT_FORMS.cue) }),
    ar: ['استُبدل النص في #. التراجع يعيده خطوةً واحدة.', AR.cueGen], en: ['Replaced text in #. Undo reverts it in one step.', EN.cue],
  },
  {
    key: 'editor.search.picked', site: ['pages/editor/search.js', "'editor.search.picked'", 'gen'],
    params: (n) => ({ matches: formatCount(1, COUNT.match), cues: gen(n, COUNT_FORMS.cue) }),
    ar: ['المختار: موضع واحد في #.', AR.cueGen], en: ['Selected: 1 match in #.', EN.cue],
  },
  {
    key: 'editor.restoreTiming.done', site: ['pages/editor/app.js', "'editor.restoreTiming.done'", 'gen'], params: (n) => ({ count: gen(n, COUNT_FORMS.cue) }),
    ar: ['استُعيد توقيت # من الأصل. احفظ لتثبيت ذلك.', AR.cueGen], en: ['Restored the timing of # from the original. Save to keep it.', EN.cue],
  },
  {
    key: 'editor.drift.summary', site: ['pages/editor/drift-dialog.js', "'editor.drift.summary'", 'gen'],
    params: (n) => ({ count: gen(n, COUNT_FORMS.cue), total: 120, max: '+1.2', n: 40 }),
    ar: ['يتغير توقيت # من 120، وأكبر تغيير +1.2 ث (المقطع 40). النص والأرقام كما هي.', AR.cueGen],
    en: ['Timing changes for # of 120; the largest change is +1.2 s (segment 40). Text and numbers stay as they are.', EN.cue],
  },
  {
    key: 'editor.rescue.done', site: ['pages/editor/app.js', "'editor.rescue.done'", 'gen'], params: (n) => ({ count: gen(n, COUNT_FORMS.change) }),
    ar: ['أُعيد تطبيق # من تعديلاتك فوق النسخة الأحدث وفق اختياراتك في المواضع المتعارضة. لم يُكتب شيء بعد: راجعها ثم احفظ.', AR.changeGen],
    en: ['Reapplied # of your edits on top of the latest version, following your choices where they conflicted. Nothing is saved yet: review them, then save.', EN.change],
  },
  {
    key: 'editor.complete.applied', site: ['pages/editor/app.js', "'editor.complete.applied'", 'gen'], params: (n) => ({ count: gen(n, COUNT_FORMS.cue), inserted: '' }),
    ar: ['طُبّق الاستكمال المترجم على #. احفظ لتثبيت ذلك، والتراجع يعيده خطوةً واحدة.', AR.cueGen],
    en: ['Applied the translated completion to #. Save to keep it; undo reverts it in one step.', EN.cue],
  },
  {
    key: 'editor.complete.applyAll', site: ['pages/editor/app.js', "'editor.complete.applyAll'", 'gen'], params: (n) => ({ count: gen(n, COUNT_FORMS.cue) }),
    ar: ['تطبيق على #', AR.cueGen], en: ['Apply to #', EN.cue],
  },
  {
    key: 'library.upload.completeLine', site: ['pages/library/upload.js', "'library.upload.completeLine'", 'acc'], params: (n) => ({ n: 1, adds: acc(n, COUNT_FORMS.cue) }),
    ar: ['الملف تتمة للترجمة 1: يضيف # في مواضعها.', AR.cueAcc], en: ['This file continues translation 1: it adds # in place.', EN.cue],
  },
  {
    key: 'settings.langs.assignTitle', site: ['pages/settings/langs.js', "'settings.langs.assignTitle'", 'gen'],
    params: (n) => ({ name: 'X', count: gen(n, t('settings.langs.translationCount')) }),
    ar: ['تعيين X لـ#؟', AR.translationGen], en: ['Set X for #?', EN.translation],
  },
  {
    key: 'errors.BK_CREATED_PARTIAL', site: ['pages/settings/data.js', "'BK_CREATED_PARTIAL'", 'gen'], params: (n) => ({ videos: gen(n, COUNT_FORMS.video) }),
    ar: ['النسخة جزئية: في # جزءٌ تالف استُبعد وحده، وضُمّن الباقي. والأصل التالف باقٍ في المحفوظات كما هو.', AR.videoGen],
    en: ['The backup is partial: a damaged part was left out of #, and the rest was included. The damaged original remains in the Library as it is.', EN.video],
  },
];

for (const c of SITES) {
  test(`ع-٢٦: ${c.key} بالمعدود ${c.site[2] === 'acc' ? 'منصوبًا' : 'مجرورًا'} باللغتين`, (ctx) => {
    reset(ctx);
    for (const [loc, [pattern, nouns]] of [['ar', c.ar], ['en', c.en]]) {
      setLocale(loc);
      NS.forEach((n, i) => assert.equal(t(c.key, c.params(n)), pattern.replace('#', nouns[i]), `${loc} ${n}`));
    }
  });
}

test('ع-٢٦: مواضع الاستدعاء تمرر حالة الإعراب التي يفترضها قالبها', () => {
  for (const { key, site: [file, marker, kase] } of SITES) {
    const calls = src(file).split('\n').filter((line) => line.includes(marker) && line.includes('formatCount('));
    assert.ok(calls.length, `${key}: لا استدعاء في ${file}`);
    for (const line of calls) assert.ok(line.includes(`{ case: '${kase}' }`), `${key} في ${file} بلا case: '${kase}': ${line.trim()}`);
  }
  // الدوال النقية (الدمج والمقارنة واستكمال المشغّل) تُستدعى بنفسها في الاختبارات التالية.
});

test('ع-٢٦: سطر المقارنة في المحرّر «توقيت مختلف في مقطعين» كسطر المحفوظات', (ctx) => {
  reset(ctx);
  const report = (n) => ({ fingerprintId: 'fp', matched: false, countSource: 10, countTarget: 10, numbering: 'same', missing: [], extra: [], drift: Array.from({ length: n }, (_, i) => i + 1), empty: [], noArabic: [] });
  const driftLine = (n) => comparisonLines(report(n)).map((l) => l.text).find((s) => s.startsWith(t('editor.cmp.drift', { count: '' }).trim()));
  NS.forEach((n, i) => {
    assert.equal(driftLine(n), `توقيت مختلف في ${AR.cueGen[i]}`, `ar ${n}`);
    assert.equal(t('library.compare.drift', { n, count: formatCount(n, COUNT_FORMS.cue) }), driftLine(n), `المحفوظات والمحرّر بالصياغة نفسها عند ${n}`);
  });
  setLocale('en');
  NS.forEach((n, i) => assert.equal(driftLine(n), `Timing differs in ${EN.cue[i]}`, `en ${n}`));
});

test('ع-٢٦: سطر الاستكمال في المشغّل بالمعدود منصوبًا مفعولًا به', (ctx) => {
  reset(ctx);
  NS.forEach((n, i) => assert.equal(completeLine({ n: 2, adds: n, remaining: 0 }), `تتمة للترجمة 2: يضيف ${AR.cueAcc[i]} في مواضعها. وتكتمل بعده.`, `ar ${n}`));
  setLocale('en');
  NS.forEach((n, i) => assert.equal(completeLine({ n: 2, adds: n, remaining: 0 }), `Continues translation 2: adds ${EN.cue[i]} in place. The translation is complete after it.`, `en ${n}`));
});

test('ع-٢٦: القالبان الخامان بصيغ العدّ: بنود التقرير وأسطر الدمج', (ctx) => {
  reset(ctx);
  const tc = (ms) => `00:00:0${ms / 1000},000`;
  const merge = (lines) => mergePreview({ n: 7 }, { n: 8 }, { startMs: 1000, endMs: 4000, text: Array(lines).fill('س').join('\n') }, tc);
  NS.forEach((n, i) => {
    assert.equal(t('editor.report.count', { count: formatCount(n, COUNT.item) }), `${AR.item[i]} في التقرير.`, `ar ${n}`);
    assert.ok(merge(n).includes(`والنصان سطرًا بعد سطر (${AR.line[i]}).`), `ar ${n}: ${merge(n)}`);
  });
  assert.ok(src('pages/editor/export-dialogs.js').includes("t('editor.report.count', { count: formatCount(r.count, COUNT.item) })"), 'نافذة التقرير تمرر العدد بصيغه');
  setLocale('en');
  NS.forEach((n, i) => {
    assert.equal(t('editor.report.count', { count: formatCount(n, COUNT.item) }), `${EN.item[i]} in the report.`, `en ${n}`);
    assert.ok(merge(n).includes(`on separate lines (${EN.line[i]}).`), `en ${n}: ${merge(n)}`);
  });
});

test('ع-٢٦: الصحيحتا الإعراب تبقيان مرفوعتين («لم يُضمَّن فيديوهان»، «ويبقى بعده مقطعان»)، وبلا case في استدعائهما', () => {
  assert.equal(t('settings.data.notIncluded', { count: formatCount(2, COUNT_FORMS.video), ids: 'a' }), 'لم يُضمَّن فيديوهان لتعذّر قراءة سجله: a');
  assert.equal(t('library.upload.completeRemaining', { count: formatCount(2, COUNT_FORMS.cue) }), 'ويبقى بعده مقطعان ناقصًا أو غير مترجم.');
  const line = (file, marker) => src(file).split('\n').find((l) => l.includes(marker));
  assert.ok(!line('pages/settings/data.js', "'settings.data.notIncluded'").includes('case:'));
  assert.ok(!line('pages/library/upload.js', "'library.upload.completeRemaining'").includes('case:'));
});

test('formatCount: الحالة لا تمس الإنجليزية، وبلا صيغة منصوبة تُستعمل المرفوعة', (ctx) => {
  reset(ctx);
  assert.equal(formatCount(2, COUNT_FORMS.cue), 'مقطعان');
  assert.equal(formatCount(1, COUNT_FORMS.cue, { case: 'gen' }), 'مقطع واحد');
  assert.equal(formatCount(1, COUNT_FORMS.language, { case: 'acc' }), 'لغة واحدة');
  assert.equal(formatCount(2, { one: 'أ', two: 'ب', few: 'ج', many: 'د', single: 'هـ' }, { case: 'gen' }), 'ب');
  for (const [k, v] of catalogOf('ar')) {
    if (k.startsWith('common.count.')) assert.ok(typeof v.twoOblique === 'string', `${k} بلا twoOblique`);
  }
  setLocale('en');
  for (const kase of ['gen', 'acc']) {
    assert.equal(formatCount(1, COUNT_FORMS.cue, { case: kase }), '1 segment');
    assert.equal(formatCount(2, COUNT_FORMS.cue, { case: kase }), '2 segments');
  }
});
