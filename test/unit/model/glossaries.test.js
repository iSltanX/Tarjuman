// قوائم المصطلحات لكل زوج لغتين (الفكرة ٨، ح-45 وح-47؛ model/glossaries.js): الشكل والتحقق الصارم، والقراءة المتسامحة، وتعديل قائمة
// أو مصطلح فيها على أحدث القيمة، وtermsFor: الترتيب (الزوج، ثم الوسم الأساسي، ثم «أي لغة ← إلى»، ثم القاموس العام) والمجموعتان
// للرأسين، وحذف المكرر بالمفتاح الموحّد، والقطع عند 100 للمجموع، و«أرفق القاموس» المطفأ، ولا تخمين من حروف المصطلح.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANY_SOURCE, DEFAULT_GLOSSARIES, GLOSSARIES_LIMITS, addList, addListTerm, attachedCount, findList, listPair, normalizeGlossaries,
  removeList, removeListTerm, sameListPair, termsFor, validateGlossaries,
} from '../../../src/core/model/glossaries.js';
import { DEFAULT_PREFS, GLOSSARY_LIMITS, sourceKey } from '../../../src/core/model/prefs.js';

const term = (source, target = `${source}-م`, note = null) => ({ source, target, note });
const list = (from, to, terms = []) => ({ from, to, terms });
const value = (...lists) => ({ schema: 1, lists });
const prefsWith = (terms, attach = true) => ({ ...structuredClone(DEFAULT_PREFS), glossary: { attach, terms } });
const sources = (xs) => xs.map((t) => t.source);

test('الشكل: الافتراضي بلا قوائم، والحدود 20 قائمة و100 مصطلح لكلٍّ (حد القاموس العام نفسه)', () => {
  assert.equal(validateGlossaries(DEFAULT_GLOSSARIES).ok, true);
  assert.deepEqual(GLOSSARIES_LIMITS, { lists: 20, terms: 100 });
  assert.equal(GLOSSARIES_LIMITS.terms, GLOSSARY_LIMITS.maxTerms);
  assert.equal(ANY_SOURCE, '*');
});

test('الكتابة صارمة: الزوج والمصطلح والحدود والتكرار، والمفتاح المجهول فشل', () => {
  const ok = value(list('en', 'ar', [term('prompt', 'موجِّه')]), list('*', 'fr'));
  assert.equal(validateGlossaries(ok).ok, true);
  for (const bad of [
    { ...ok, extra: 1 },
    { ...ok, schema: 2 },
    value(list('x!', 'ar')),
    value(list('en', '*')),
    value(list('en', 'en')),
    value(list('pt_BR', 'pt-br')),
    value(list('en', 'ar'), list('EN', 'ar')),
    value({ ...list('en', 'ar'), lang: 'en' }),
    value(list('en', 'ar', [{ ...term('a'), lang: 'en' }])),
    value(list('en', 'ar', [term('Prompt'), term('prompt')])),
    value(list('en', 'ar', Array.from({ length: 101 }, (_, i) => term(`t${i}`)))),
    value(...Array.from({ length: 21 }, (_, i) => list('*', `l${String.fromCharCode(97 + i)}`))),
  ]) assert.equal(validateGlossaries(bad).ok, false, JSON.stringify(bad).slice(0, 80));
});

test('القراءة متسامحة: القائمة التالفة أو المكررة تسقط وحدها، والمصطلح التالف أو المكرر وحده، والحدود تقص، وغير الكائن افتراضي', () => {
  const g = normalizeGlossaries({
    schema: 1,
    lists: [
      list('en', 'ar', [term('prompt'), { source: '', target: 'x', note: null }, term('PROMPT'), term('token'), 7]),
      list('en', 'en', [term('a')]),
      { from: 'ja', to: 'en' },
      list('EN', 'ar', [term('b')]),
      null,
      list('*', 'fr', [term('c')]),
    ],
  });
  assert.deepEqual(g, value(list('en', 'ar', [term('prompt'), term('token')]), list('ja', 'en', []), list('*', 'fr', [term('c')])));
  assert.equal(validateGlossaries(g).ok, true, 'ناتج القراءة يجتاز الكتابة');
  for (const raw of [null, undefined, 7, 'x', [], { lists: 'x' }]) assert.deepEqual(normalizeGlossaries(raw), value());
  const many = normalizeGlossaries(value(...Array.from({ length: 25 }, (_, i) => list('*', `l${String.fromCharCode(97 + i)}`, Array.from({ length: 130 }, (__, j) => term(`t${j}`))))));
  assert.equal(many.lists.length, 20);
  assert.equal(many.lists[0].terms.length, 100);
});

test('زوج القائمة: الصيغة المعيارية، و«أي لغة» في «من» وحدها، والمطابق لا يُقبل', () => {
  assert.deepEqual(listPair({ from: 'pt_br', to: 'AR' }), { from: 'pt-BR', to: 'ar' });
  assert.deepEqual(listPair({ from: '*', to: 'fr' }), { from: '*', to: 'fr' });
  for (const bad of [null, {}, { from: 'en', to: 'en' }, { from: 'en', to: '*' }, { from: 'x!', to: 'ar' }, { from: 'pt-BR', to: 'pt_br' }]) assert.equal(listPair(bad), null);
  assert.equal(sameListPair({ from: 'pt_BR', to: 'ar' }, { from: 'pt-br', to: 'AR' }), true);
});

test('تعديل القوائم على أحدث قيمة: إضافة زوج وحذفه، ومصطلح فيه بالمفتاح الموحّد، والأسباب', () => {
  let r = addList(value(), { from: 'en', to: 'ar' });
  assert.equal(r.added, true);
  let g = r.glossaries;
  assert.deepEqual(g, value(list('en', 'ar')));
  assert.equal(addList(g, { from: 'EN', to: 'ar' }).reason, 'duplicate');
  assert.equal(addList(g, { from: 'en', to: 'en' }).reason, 'invalid');
  const full = value(...Array.from({ length: 20 }, (_, i) => list('*', `l${String.fromCharCode(97 + i)}`)));
  assert.equal(addList(full, { from: 'en', to: 'ar' }).reason, 'limit');

  r = addListTerm(g, { from: 'en', to: 'ar' }, term('prompt', 'موجِّه'));
  assert.equal(r.added, true);
  g = r.glossaries;
  assert.equal(addListTerm(g, { from: 'en', to: 'ar' }, term('PROMPT')).reason, 'duplicate');
  assert.equal(addListTerm(g, { from: 'ja', to: 'ar' }, term('x')).reason, 'missing');
  const hundred = value(list('en', 'ar', Array.from({ length: 100 }, (_, i) => term(`t${i}`))));
  assert.equal(addListTerm(hundred, { from: 'en', to: 'ar' }, term('more')).reason, 'limit');
  assert.deepEqual(sources(findList(g, { from: 'en', to: 'ar' }).terms), ['prompt']);

  assert.equal(removeListTerm(g, { from: 'en', to: 'ar' }, sourceKey('nothing')).removed, false);
  r = removeListTerm(g, { from: 'en', to: 'ar' }, sourceKey('Prompt'));
  assert.equal(r.removed, true);
  assert.deepEqual(r.glossaries, value(list('en', 'ar')));
  assert.equal(removeList(g, { from: 'ja', to: 'ar' }).removed, false);
  assert.deepEqual(removeList(g, { from: 'en', to: 'ar' }).glossaries, value());
  assert.deepEqual(g, value(list('en', 'ar', [term('prompt', 'موجِّه')])), 'الأصل لا يتغير');
});

test('termsFor: الزوج نفسه ثم الوسم الأساسي تحت رأس الزوج، ثم «أي لغة ← إلى» والقاموس العام تحت الرأس المحايد', () => {
  const g = value(
    list('*', 'ar', [term('any')]),
    list('pt', 'ar', [term('base')]),
    list('pt-BR', 'ar', [term('exact')]),
    list('en', 'ar', [term('other-pair')]),
    list('pt-BR', 'fr', [term('other-target')]),
  );
  const r = termsFor(prefsWith([term('general')]), g, { source: 'pt-BR', target: 'ar' });
  assert.deepEqual(sources(r.pair), ['exact', 'base']);
  assert.deepEqual(sources(r.general), ['any', 'general']);
  assert.equal(r.total, 4);
  assert.equal(attachedCount(r), 4);
  // وسم أساسي في «إلى» كذلك، و«من» أوسع من قائمتها.
  assert.deepEqual(sources(termsFor(prefsWith([]), g, { source: 'pt', target: 'ar-EG' }).pair), ['base', 'exact']);
  // زوج لا قائمة له: القاموس العام وحده (ومن لا قوائم له لا يتغير عنده إلا الرأس).
  assert.deepEqual(termsFor(prefsWith([term('general')]), g, { source: 'ja', target: 'en' }), { pair: [], general: [term('general')], total: 1 });
  assert.deepEqual(termsFor(prefsWith([term('general')]), null, { source: 'en', target: 'ar' }), { pair: [], general: [term('general')], total: 1 });
  // بلا «من» معروفة: «أي لغة ← إلى» والعام وحدهما.
  assert.deepEqual(sources(termsFor(prefsWith([term('general')]), g, { source: null, target: 'ar' }).general), ['any', 'general']);
});

test('termsFor: المكرر بالمفتاح الموحّد يسقط وقائمة الزوج تتقدّم، والقطع عند 100 للمجموع وtotal قبله', () => {
  const g = value(list('en', 'ar', [term('Prompt', 'موجِّه'), ...Array.from({ length: 79 }, (_, i) => term(`p${i}`))]), list('*', 'ar', [term('PROMPT', 'تلقين'), term('any')]));
  const general = [term('prompt', 'أمر'), ...Array.from({ length: 40 }, (_, i) => term(`g${i}`))];
  const r = termsFor(prefsWith(general), g, { source: 'en', target: 'ar' });
  assert.equal(r.pair[0].target, 'موجِّه', 'قائمة الزوج تتقدّم على «أي لغة» والعام');
  assert.equal(r.pair.length, 80);
  assert.equal(r.general.length, 20);
  assert.deepEqual(sources(r.general).slice(0, 2), ['any', 'g0']);
  assert.equal(r.general.some((t) => sourceKey(t.source) === 'prompt'), false);
  assert.equal(r.total, 80 + 1 + 40);
  assert.equal(attachedCount(r), GLOSSARY_LIMITS.maxTerms);
});

test('termsFor: «أرفق القاموس» المطفأ أو تفضيلات لا تُقرأ لا ترفق شيئًا، والقيم الخام من حدث التغيير تُقرأ متسامحة', () => {
  const g = value(list('en', 'ar', [term('prompt')]));
  const none = { pair: [], general: [], total: 0 };
  assert.deepEqual(termsFor(prefsWith([term('x')], false), g, { source: 'en', target: 'ar' }), none);
  assert.deepEqual(termsFor(null, g, { source: 'en', target: 'ar' }), none);
  const raw = { glossary: { attach: true, terms: [term('ok'), { source: 'bad' }] } };
  const r = termsFor(raw, { lists: [list('en', 'ar', [term('prompt'), 5]), 'x'] }, { source: 'en', target: 'ar' });
  assert.deepEqual(r, { pair: [term('prompt')], general: [term('ok')], total: 2 });
});

test('termsFor لا يخمّن من الحروف: لغة المصطلح لغة قائمته وحدها', () => {
  // قائمة en ← ar بمصطلح ياباني الحروف تُرفق بتعليمات en ← ar، ولا تُرفق بتعليمات ja ← ar.
  const g = value(list('en', 'ar', [term('東京', 'طوكيو')]));
  assert.deepEqual(sources(termsFor(prefsWith([]), g, { source: 'en', target: 'ar' }).pair), ['東京']);
  assert.deepEqual(termsFor(prefsWith([]), g, { source: 'ja', target: 'ar' }), { pair: [], general: [], total: 0 });
});
