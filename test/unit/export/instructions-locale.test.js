// لغة تعليمات الترجمة (2.1.1): النص يتبع لغة واجهة الإضافة وحدها. العربية هي الملحقان أ وب حرفيًا، والإنجليزية الملحق ج حرفيًا وتقابلها بندًا
// بندًا وبالمتغيرات نفسها، ولغتا الزوج واسم الملف والعنوان والرابط لا تتأثر. والنص يُبنى لحظة النسخ، فتبديل اللغة يظهر في النسخة التالية.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLocale, setLocale } from '../../../src/i18n/index.js';
import { TjError } from '../../../src/core/errors/index.js';
import {
  GLOSSARY_TEMPLATE, INSTRUCTIONS_TEMPLATE, MACHINE_SOURCE_LINE, PATCH_INSTRUCTIONS_TEMPLATE, cleanTitle, glossaryParagraph, instructions, languageValues, patchInstructions,
} from '../../../src/core/export/instructions.js';
import {
  GLOSSARY_TEMPLATE_EN, INSTRUCTIONS_TEMPLATE_EN, MACHINE_SOURCE_LINE_EN, PATCH_INSTRUCTIONS_TEMPLATE_EN, STYLE_ARABIC_EN, STYLE_OTHER_EN, TITLE_UNAVAILABLE_EN,
} from '../../../src/core/export/instructions-en.js';
import { createCopyState } from '../../../src/pages/library/copy.js';
import { copyArgs } from '../../../src/pages/popup/status.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SPEC = readFileSync(path.join(ROOT, 'docs/product-spec.md'), 'utf8');
const VIDEO_ID = 'aB3kL9mPq2X';
const URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const BASE = { videoId: VIDEO_ID, title: 'How Stars Guided Caravans', source: 'en', target: 'ar' };
const TERMS = [{ source: 'caravan', target: 'قافلة', note: 'desert context' }, { source: 'dune', target: 'كثيب' }];
const PARTS = [{ index: 1, from: 1, to: 400 }, { index: 2, from: 401, to: 812 }];
const ARABIC_LETTER = /[؀-ۿ]/;

afterEach(() => setLocale('ar'));

/** كتل text في الملحق ج بترتيبها: التعليمات، وسطرا الأسلوب، وبند المصدر الآلي، والقاموس، والاستكمال. */
function appendixC() {
  const at = SPEC.indexOf('## ملحق ج');
  assert.ok(at > 0, 'الملحق ج موجود في المواصفة');
  return [...SPEC.slice(at).matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1]);
}
const vars = (t) => [...new Set(t.match(/\{\{\w+\}\}/g))].sort();
const bullets = (t) => t.split('\n').filter((l) => l.startsWith('- ')).length;
const sections = (t) => t.split('\n\n').length;

test('القوالب الإنجليزية مطابقة حرفيًا للملحق ج', () => {
  const [main, style, machine, glossary, patch] = appendixC();
  assert.equal(INSTRUCTIONS_TEMPLATE_EN, main);
  assert.equal(`${STYLE_ARABIC_EN}\n${STYLE_OTHER_EN}`, style);
  assert.equal(MACHINE_SOURCE_LINE_EN, machine);
  assert.equal(GLOSSARY_TEMPLATE_EN, glossary);
  assert.equal(PATCH_INSTRUCTIONS_TEMPLATE_EN, patch);
});

test('الإنجليزية تقابل العربية: المتغيرات نفسها، وعدد الأقسام والبنود نفسه', () => {
  for (const [ar, en] of [[INSTRUCTIONS_TEMPLATE, INSTRUCTIONS_TEMPLATE_EN], [GLOSSARY_TEMPLATE, GLOSSARY_TEMPLATE_EN], [PATCH_INSTRUCTIONS_TEMPLATE, PATCH_INSTRUCTIONS_TEMPLATE_EN], [MACHINE_SOURCE_LINE, MACHINE_SOURCE_LINE_EN]]) {
    assert.deepEqual(vars(en), vars(ar));
    assert.equal(sections(en), sections(ar));
    assert.equal(bullets(en), bullets(ar));
    assert.equal(ARABIC_LETTER.test(en), false, 'لا حرف عربي في القالب الإنجليزي');
  }
  for (const needed of ['00:01:02,500 --> 00:01:05,000', 'UTF-8', '.srt', '[Music]', '1–400 then 401–800']) assert.ok(INSTRUCTIONS_TEMPLATE_EN.includes(needed), needed);
});

test('واجهة إنجليزية: نص إنجليزي كامل بأسماء اللغات الإنجليزية، ولا متغير باقٍ', () => {
  setLocale('en');
  const out = instructions(BASE);
  assert.ok(out.startsWith('Translate a video subtitle file (SRT) from English (en) to Arabic (ar)\n'));
  assert.ok(out.includes(`- Title: ${BASE.title}\n- Link: ${URL}\n`));
  assert.ok(out.includes(`- ${STYLE_ARABIC_EN}\n`), 'أسلوب العربية حين تكون اللغة المطلوبة العربية');
  assert.ok(out.includes('talk.en.srt becomes talk.ar.srt'));
  assert.ok(out.includes('left in English without a reason'));
  assert.equal(/\{\{|\}\}/.test(out), false);
  assert.equal(ARABIC_LETTER.test(out), false);
});

test('واجهة عربية: النص هو الملحق أ كما كان، ولا كلمة من القالب الإنجليزي', () => {
  const out = instructions(BASE);
  assert.ok(out.startsWith('ترجمة ملف ترجمة فيديو (SRT) من الإنجليزية (en) إلى العربية (ar)\n'));
  assert.equal(out.includes('Translate a video subtitle file'), false);
});

test('لغة التعليمات لا تغيّر الزوج: الرمزان واسم الملف والعنوان والرابط واحدة في اللغتين', () => {
  for (const pair of [{ source: 'ja', target: 'fr' }, { source: 'ar', target: 'en' }, { source: 'pt-BR', target: 'de' }]) {
    const spec = { ...BASE, ...pair };
    const ar = instructions({ ...spec, locale: 'ar' });
    const en = instructions({ ...spec, locale: 'en' });
    for (const text of [ar, en]) {
      for (const fixed of [`(${pair.source})`, `(${pair.target})`, `talk.${pair.source}.srt`, `talk.${pair.target}.srt`, URL, BASE.title]) assert.ok(text.includes(fixed), fixed);
    }
    assert.notEqual(ar, en);
  }
  const en = instructions({ ...BASE, source: 'ja', target: 'fr', locale: 'en' });
  assert.ok(en.includes('from Japanese (ja) to French (fr)'));
  assert.ok(en.includes(STYLE_OTHER_EN.replace('{{in_target}}', 'in French')), 'أسلوب اللغات الأخرى');
});

test('النص يتبع لغة الواجهة عند كل بناء: عربية ثم إنجليزية ثم عربية', () => {
  const ar = instructions(BASE);
  setLocale('en');
  assert.equal(getLocale(), 'en');
  const en = instructions(BASE);
  assert.notEqual(en, ar);
  assert.ok(en.startsWith('Translate'));
  setLocale('ar');
  assert.equal(instructions(BASE), ar, 'العودة إلى العربية تعيد النص نفسه بايتًا');
  setLocale('en');
  assert.equal(instructions(BASE), en, 'والعودة إلى الإنجليزية كذلك');
});

test('locale الصريح يغلب لغة الواجهة، فلا يختلط نصان: العربية سليمة تحت واجهة إنجليزية بأجزائها وقاموسها', () => {
  const arUnderAr = instructions({ ...BASE, parts: PARTS, glossary: TERMS });
  setLocale('en');
  assert.equal(instructions({ ...BASE, parts: PARTS, glossary: TERMS, locale: 'ar' }), arUnderAr);
  assert.ok(arUnderAr.includes('عدد المقاطع الكلي: 812 مقطعًا، في جزأين.'));
});

test('فقرة الأجزاء والقاموس والمصدر الآلي بالإنجليزية في مواضعها', () => {
  setLocale('en');
  const out = instructions({ ...BASE, via: 'ko', parts: PARTS, glossary: TERMS });
  assert.ok(out.includes('- The attached file is a machine translation that YouTube generated from Korean (ko),'));
  assert.ok(out.indexOf('machine translation that YouTube') < out.indexOf('\n\nUnderstand before you translate'));
  const style = out.indexOf('\n\nStyle\n');
  const glossary = out.indexOf('\n\nPreferred terms\n');
  const srt = out.indexOf('\n\nSRT structure: follow it exactly');
  assert.ok(style < glossary && glossary < srt);
  assert.ok(out.includes('Equivalents (term in English = preferred equivalent in Arabic):\n- caravan = قافلة (desert context)\n- dune = كثيب\n'));
  assert.ok(out.endsWith('The output of each part must contain the same segments as that part, with the same numbering and in the same order.'));
  assert.ok(out.includes('Total segments: 812 segments, in 2 parts.\nThe file is split into parts with continuous numbering: Part 1 (segments 1–400), Part 2 (segments 401–812).'));
});

test('تعليمات الاستكمال تتبع اللغة، والقاموس قبل البند الأخير', () => {
  assert.ok(patchInstructions(BASE).startsWith('استكمال ترجمة مقاطع محددة'));
  setLocale('en');
  const out = patchInstructions({ ...BASE, glossary: TERMS });
  assert.ok(out.startsWith('Complete the translation of specific segments in an SRT file from English (en) to Arabic (ar)\n'));
  assert.ok(out.includes(` ${STYLE_ARABIC_EN} If the full translation`));
  assert.ok(out.indexOf('Preferred terms') < out.lastIndexOf('\n- If any passages remain ambiguous'));
  assert.equal(/\{\{|\}\}/.test(out), false);
});

test('العنوان بيانات بالإنجليزية كذلك: غيابه «Not available»، ولا يُوسَّع متغير داخله، ولا يربكه اسم قسم', () => {
  setLocale('en');
  assert.equal(TITLE_UNAVAILABLE_EN, 'Not available');
  assert.equal(cleanTitle(null), 'Not available');
  assert.ok(instructions({ ...BASE, title: null }).includes('- Title: Not available\n'));
  const title = '{{target_language}} SRT structure: follow it exactly';
  const out = instructions({ ...BASE, title, glossary: TERMS });
  assert.ok(out.includes(`- Title: ${title}\n`));
  assert.ok(out.indexOf('Preferred terms') > out.indexOf('\n\nStyle\n'));
});

test('أسماء اللغات: رمز لا يعرف المتصفح اسمه يبقى رمزًا، والأخطاء نفسها في اللغتين', () => {
  assert.deepEqual(languageValues('en', 'en'), { label: 'English (en)', in: 'in English', code: 'en' });
  assert.equal(languageValues('en', 'ar').label, 'الإنجليزية (en)');
  assert.equal(languageValues('qaa', 'en').label, 'qaa');
  for (const locale of ['ar', 'en']) {
    assert.throws(() => instructions({ ...BASE, target: 'en', locale }), (e) => e instanceof TjError && e.code === 'MD_INVALID');
    assert.throws(() => instructions({ ...BASE, videoId: 'bad', locale }), (e) => e instanceof TjError && e.code === 'TJ_BAD_VIDEO_ID');
  }
  assert.equal(glossaryParagraph([], { source: 'en', target: 'ar' }, 'en'), null);
});

test('دورة النسخ: النص يُبنى عند الضغطة بلغة الواجهة وقتها، فتبديل اللغة يظهر في النسخة التالية مباشرة', async () => {
  const written = [];
  const reply = { videoId: VIDEO_ID, title: BASE.title, source: { lang: 'en', via: null }, lastExport: null };
  const copy = createCopyState({
    buildText: () => instructions(copyArgs({ reply, pair: { from: 'en', to: 'ar' }, glossary: null })),
    write: async (t) => { written.push(t); },
    announce: () => {},
    onState: () => {},
    setTimer: () => 0,
    clearTimer: () => {},
  });
  assert.equal(await copy.copy(), 'success');
  setLocale('en');
  assert.equal(await copy.copy(), 'success');
  setLocale('ar');
  assert.equal(await copy.copy(), 'success');
  assert.ok(written[0].startsWith('ترجمة ملف ترجمة فيديو'));
  assert.ok(written[1].startsWith('Translate a video subtitle file'));
  assert.equal(written[2], written[0]);
});
