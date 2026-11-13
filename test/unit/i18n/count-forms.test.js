// ع-٢٦ وع-٢٧ (تحقق Gemini وFable، 2026-11-13): صيغ العدد في القوالب التي يقع فيها العدد مجرورًا أو منصوبًا، والقالبان اللذان كانا
// يضعان الرقم خامًا، والجمع الإنجليزي بالعدد. مجسّ صيغ العدد (B-probes/i18n-plurals-b.mjs) صار اختبارًا: كل قالب بالوسائط التي يمررها
// موضع استدعائه، بالأعداد 1 و2 و3 و11 و100 باللغتين؛ وما في دالة نقية يُستدعى بها، وما في شيفرة واجهة يُقرأ سطر استدعائه فيُتحقق
// أنه يمرر حالة الإعراب نفسها.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogOf, setLocale, t } from '../../../src/i18n/index.js';
import { COUNT_FORMS, formatCount } from '../../../src/ui/format.js';
import { messageFor } from '../../../src/core/errors/index.js';
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
  // وما بعد العدد يطابق عدده (بطلب سلطان بعد الدفعة ج): العدد من formatCount مرفوعًا (فاعل أو نائب فاعل)، والضمير والحال والفعل
  // بعده بالمفرد والمثنى والجمع، و11–99 بتمييزها المفرد.
  const video = (n) => t('settings.data.notIncluded', { n, count: formatCount(n, COUNT_FORMS.video), ids: 'a' });
  assert.equal(video(1), 'لم يُضمَّن فيديو واحد لتعذّر قراءة سجله: a');
  assert.equal(video(2), 'لم يُضمَّن فيديوهان لتعذّر قراءة سجلَّيهما: a');
  assert.equal(video(3), 'لم يُضمَّن 3 فيديوهات لتعذّر قراءة سجلاتها: a');
  const rest = (n) => t('library.upload.completeRemaining', { n, count: formatCount(n, COUNT_FORMS.cue) });
  assert.equal(rest(1), 'ويبقى بعده مقطع واحد ناقصًا أو غير مترجم.');
  assert.equal(rest(2), 'ويبقى بعده مقطعان ناقصَين أو غير مترجمَين.');
  assert.equal(rest(3), 'ويبقى بعده 3 مقاطع ناقصةً أو غير مترجمة.');
  assert.equal(rest(11), 'ويبقى بعده 11 مقطعًا ناقصًا أو غير مترجم.');
  assert.equal(rest(100), 'ويبقى بعده 100 مقطع ناقصةً أو غير مترجمة.');
  assert.equal(t('player.controls.completeRemaining', { n: 2, count: formatCount(2, COUNT_FORMS.cue) }), 'ويبقى مقطعان ناقصَين أو غير مترجمَين.');
  const marks = (n, count) => t('editor.marks.orphansRemoved', { n, count });
  assert.equal(marks(1, 'علامة واحدة'), 'أُزيلت علامة واحدة فقدت مقطعها.');
  assert.equal(marks(2, 'علامتان'), 'أُزيلت علامتان فقدتا مقطعَيهما.');
  assert.equal(marks(3, '3 علامات'), 'أُزيلت 3 علامات فقدت مقاطعها.');
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

// ع-٢٧: الجمع الإنجليزي بالعدد في رسائل تمر بالعدد الخام (count رقم أو نص رقمي). المفرد عند 1، والجمع لغيره.
const EN_PLURALS = [
  ['IM_HTML_LITERAL', (n) => (n === 1 ? '1 segment contains HTML-like tags' : `${n} segments contain HTML-like tags`)],
  ['IM_CUE_TIME_MORE', (n) => (n === 1 ? '1 more segment has the same problem: it doesn’t end after it starts.' : `${n} more segments have the same problem: they don’t end after they start.`)],
  ['IM_NOTE_CHATTER_BEFORE', (n) => `Removed ${n} explanation or heading ${n === 1 ? 'line' : 'lines'} before the file`],
  ['IM_NOTE_CHATTER_AFTER', (n) => `Removed ${n} explanation or heading ${n === 1 ? 'line' : 'lines'} after the file`],
  ['IM_NOTE_AMBIGUOUS', (n) => `The model listed ${n} ambiguous ${n === 1 ? 'passage' : 'passages'}: `],
  ['IM_NOTE_MD_EMPHASIS', (n) => `around ${n} ${n === 1 ? 'number or timing line' : 'number and timing lines'}.`],
  ['IM_NOTE_TIME_MARKS', (n) => `Fixed the format of ${n} timing ${n === 1 ? 'line' : 'lines'}:`],
  ['IM_NOTE_TAGS', (n) => `positioning commands) from ${n} ${n === 1 ? 'segment' : 'segments'}.`],
  ['IM_NOTE_CONTROL', (n) => `Removed invisible control characters from ${n} ${n === 1 ? 'segment' : 'segments'}.`],
  ['IM_NOTE_HIDDEN_CHARS', (n) => `Removed ${n} hidden ${n === 1 ? 'character' : 'characters'} from the text:`],
  ['IM_NOTE_TRIMMED', (n) => `Trimmed spaces from the edges of ${n} ${n === 1 ? 'line' : 'lines'}.`],
  ['CMP_ALIGN_WEAK', (n) => `Weak timing match in ${n} ${n === 1 ? 'segment' : 'segments'}, including`],
  ['CMP_ALIGN_NUMBER_ONLY', (n) => (n === 1 ? '1 segment is paired with its counterpart by number only' : `${n} segments are paired with their counterparts by number only`)],
  ['CMP_ALIGN_DRIFTING', (n) => `neighboring segments (${n} ${n === 1 ? 'segment' : 'segments'}), with`],
  ['CMP_ALIGN_SHIFTED', (n) => `timing in ${n} ${n === 1 ? 'segment' : 'segments'}, starting at 4–5: ${n === 1 ? 'it matches' : 'each matches'}, by its timing`],
  ['CMP_ALIGN_ONLY_A', (n) => (n === 1 ? '1 segment in the original has no counterpart' : `${n} segments in the original have no counterpart`)],
  ['CMP_ALIGN_ONLY_B', (n) => (n === 1 ? '1 segment in the file has no counterpart' : `${n} segments in the file have no counterpart`)],
  ['PG_LANG_ASSIGN_PARTIAL', (n) => `saving failed for ${n} ${n === 1 ? 'video' : 'videos'}. Try again`],
];

test('ع-٢٧: لا «1 segments» ولا «1 lines» ولا «1 videos»: الجمع الإنجليزي بالعدد، والعدد نصًا كالعدد رقمًا', (ctx) => {
  reset(ctx);
  setLocale('en');
  for (const [code, expected] of EN_PLURALS) {
    for (const n of NS) {
      for (const v of [n, String(n)]) {
        const out = messageFor(code, { count: v, n: v, list: '4, 5', first: 'Here is', seconds: '1.2', from: 4, to: 5 });
        assert.ok(out.includes(expected(n)), `${code} ${JSON.stringify(v)}: ${out}`);
        assert.ok(!/\b1 (?:segments|lines|characters|passages|videos|more segments)\b/.test(out), `${code}: ${out}`);
      }
    }
  }
});

test('ع-٢٧: المصطلح الواحد لشكل المقاطع «Standard» في كل الواجهات الإنجليزية، لا «Normal»', () => {
  const en = catalogOf('en');
  for (const k of ['player.controls.modeNormal', 'library.mode.normal', 'settings.export.modeNormal']) assert.equal(en.get(k), 'Standard', k);
  assert.match(en.get('settings.modeNotes.normal'), /^Standard: /);
  assert.equal(en.get('editor.ref.modeNormal'), 'standard');
  for (const [k, v] of en) if (typeof v === 'string') assert.ok(!/\bNormal\b/.test(v), `${k}: ${v}`);
});
