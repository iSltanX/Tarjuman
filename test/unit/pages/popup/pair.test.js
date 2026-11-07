// كتلة «تعليمات الترجمة» في نافذة الإضافة (AA3، لوحة 09، قرارا سلطان ق٢ وق٥): الزر معطّل حتى تُحدَّد اللغتان وتختلفا بسبب ظاهر،
// و«من» مكتشفة من مسار الفيديو وحده، والمترجم آليًا موسوم بلغة أصله، وما يُنسخ تعليمات الزوج المختار بأجزاء آخر تنزيل إن قُسّم
// بلغة «من» نفسها؛ ومنتقي اللغة بالبحث والأخيرة ولغات الفيديو والمبادلة. لا تُمرَّر عقدة إلى assert.equal (انظر fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '../../../../src/core/export/instructions.js';
import { PAIR_TEXT, copyArgs, detectedSource, machineNote, pairState, videoLangs } from '../../../../src/pages/popup/status.js';
import { AUTO, LANG_TEXT, langField, langPair } from '../../../../src/ui/lang-picker.js';
import { findAll, newDocument, textOf } from '../library/fake-dom.js';

const reply = (over = {}) => ({
  v: 1, ok: true, watch: true, videoId: 'iG9CE55wbtY', title: 'Cosmos Laundromat', loading: false,
  english: { captured: [], saved: [] }, arabic: null, view: { displayOffsetMs: 0, displayMode: 'ar' },
  mounted: { overlay: 'mounted', controls: 'mounted' }, source: null, lastExport: null, available: null, ...over,
});
const ja = { key: 'ja|asr', lang: 'ja', kind: 'asr', via: null, from: 'captured' };

test('الزر معطّل بسببه: ليست صفحة فيديو، وجارٍ القراءة، واللغتان أو إحداهما ناقصة، والمتطابقتان؛ ويُتاح لزوج مختلف', () => {
  const r = reply({ source: ja });
  assert.equal(pairState({ reply: null, pair: { from: 'en', to: 'ar' } }).reason, PAIR_TEXT.noVideo);
  assert.equal(pairState({ reply: reply({ loading: true }), pair: { from: 'en', to: 'ar' } }).reason, PAIR_TEXT.loading);
  assert.equal(pairState({ reply: r, pair: { from: null, to: null } }).reason, PAIR_TEXT.needBoth);
  assert.equal(pairState({ reply: r, pair: { from: null, to: 'ar' } }).reason, PAIR_TEXT.needFrom);
  assert.equal(pairState({ reply: r, pair: { from: 'ja', to: null } }).reason, PAIR_TEXT.needTo);
  assert.equal(pairState({ reply: r, pair: { from: 'en', to: 'en' } }).reason, PAIR_TEXT.same);
  const ok = pairState({ reply: r, pair: { from: 'ja', to: 'en' } });
  assert.equal(ok.ready, true);
  assert.equal(ok.caption, 'تعليمات لنموذجك: ترجمة ملف SRT من اليابانية إلى الإنجليزية مع الحفاظ على أرقام المقاطع والتوقيت والصيغة.');
  assert.equal(ok.done, 'اليابانية ← الإنجليزية · ألصقها في نموذجك مع الملف.');
  assert.equal(pairState({ reply: r, pair: { from: 'ar', to: 'en' } }).ready, true, 'أي اتجاه (الحالة D)');
});

test('«من» مكتشفة من مسار الفيديو وحده (ق٥)، والمترجم آليًا موسوم بلغة أصله (ق٢)', () => {
  assert.equal(detectedSource(reply({ source: ja })), 'ja');
  assert.equal(detectedSource(reply()), null, 'بلا مسار لا تخمين');
  assert.equal(detectedSource(reply({ loading: true, source: ja })), null);
  assert.equal(pairState({ reply: reply({ source: ja }), pair: { from: 'ja', to: 'en' } }).sourceNote, PAIR_TEXT.detected);
  assert.equal(pairState({ reply: reply({ source: ja }), pair: { from: 'ko', to: 'en' } }).sourceNote, null, 'غيّرها المستخدم');
  const machine = reply({ source: { key: 'ar|asr|en', lang: 'ar', kind: 'asr', via: 'en', from: 'captured' } });
  assert.equal(pairState({ reply: machine, pair: { from: 'ar', to: 'fr' } }).sourceNote, machineNote('en'));
  assert.equal(machineNote('en'), '«من» ترجمة آلية من يوتيوب عن الإنجليزية');
});

test('ما يُنسخ: الزوج المختار، والمصدر المترجم آليًا، وأجزاء آخر تنزيل بلغة «من» نفسها وحدها، والقاموس', () => {
  const parts = [{ index: 1, from: 1, to: 200 }, { index: 2, from: 201, to: 412 }];
  const r = reply({ source: ja, lastExport: { key: 'ja|asr', lang: 'ja', via: null, parts } });
  const glossary = [{ source: 'sheep', target: 'خروف', note: null }];
  const args = copyArgs({ reply: r, pair: { from: 'ja', to: 'en' }, glossary });
  assert.deepEqual(args, { videoId: 'iG9CE55wbtY', title: 'Cosmos Laundromat', source: 'ja', target: 'en', via: null, parts, glossary });
  assert.equal(copyArgs({ reply: r, pair: { from: 'ko', to: 'en' }, glossary: null }).parts, null, 'تنزيل بلغة أخرى');
  assert.equal(copyArgs({ reply: reply({ source: ja, lastExport: { key: 'ja|asr', lang: 'ja', via: null, parts: null } }), pair: { from: 'ja', to: 'en' }, glossary: null }).parts, null);
  const text = instructions(args);
  assert.ok(text.startsWith('ترجمة ملف ترجمة فيديو (SRT) من اليابانية (ja) إلى الإنجليزية (en)'));
  assert.ok(text.includes('الجزء 2 (المقاطع 201–412)'));
  const machine = reply({ source: { key: 'ar|asr|en', lang: 'ar', kind: 'asr', via: 'en', from: 'captured' } });
  const m = copyArgs({ reply: machine, pair: { from: 'ar', to: 'fr' }, glossary: null });
  assert.equal(m.via, 'en');
  assert.ok(instructions(m).includes('ترجمة آلية أنشأها يوتيوب عن الإنجليزية (en)'));
  assert.throws(() => instructions(copyArgs({ reply: r, pair: { from: 'en', to: 'en' }, glossary: null })), (e) => e.code === 'MD_INVALID');
});

test('لغات الفيديو لقائمة «من»: المسار المختار ثم الملتقط والمحفوظ وبيانات المشغّل، بلا تكرار', () => {
  const r = reply({
    source: ja,
    english: { captured: [{ key: 'ja|asr', kind: 'asr', cueCount: 3, ok: true }, { key: 'fr|asr', kind: 'asr', cueCount: 0, ok: false }], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 2 }] },
    available: [{ lang: 'en', kind: 'manual', name: 'English' }, { lang: 'es-419', kind: 'manual', name: null }],
  });
  assert.deepEqual(videoLangs(r), ['ja', 'en', 'es-419']);
  assert.deepEqual(videoLangs(reply({ watch: false })), []);
});

test('المنتقي: الحقل باسم اللغة بالعربية، والقائمة ببحث ولغات الفيديو والأخيرة وكل اللغات، والاختيار بالنقر أو Enter', () => {
  const doc = newDocument();
  const picked = [];
  const f = langField({ label: LANG_TEXT.to, value: null, recent: () => ['ar'], video: () => ['ja'], onChange: (c) => picked.push(c), doc });
  doc.body.append(f.root);
  assert.equal(textOf(f.field.querySelector('.tj-lang__v')), LANG_TEXT.empty);
  assert.equal(f.field.getAttribute('aria-label'), 'إلى: اختر لغة');
  f.field.click();
  assert.equal(f.field.getAttribute('aria-expanded'), 'true');
  const labels = findAll(f.root, (e) => e.classList.contains('tj-lang-pop__label')).map(textOf);
  assert.deepEqual(labels, [LANG_TEXT.video, LANG_TEXT.recent, LANG_TEXT.all]);
  const options = findAll(f.root, (e) => e.getAttribute('role') === 'option');
  assert.ok(options.length > 150, 'كل اللغات من المتصفح');
  assert.equal(options[0].getAttribute('data-code'), 'ja');
  assert.equal(options[1].getAttribute('data-code'), 'ar');
  assert.equal(options.filter((o) => o.getAttribute('data-code') === 'ar').length, 1, 'لا تكرار بين المجموعات');
  assert.ok(textOf(options[0]).includes('日本語') && textOf(options[0]).includes('ja'));
  // البحث بالاسم بلا «ال» ولا همزة، ثم Enter.
  const input = f.root.querySelector('.tj-lang-pop__search');
  input.value = 'انجليزي';
  input.dispatchEvent({ type: 'input' });
  const hits = findAll(f.root, (e) => e.getAttribute('role') === 'option');
  assert.equal(hits[0].getAttribute('data-code'), 'en');
  input.dispatchEvent({ type: 'keydown', key: 'Enter' });
  assert.deepEqual(picked, ['en']);
  assert.equal(f.field.getAttribute('aria-expanded'), 'false');
  assert.equal(textOf(f.field.querySelector('.tj-lang__v')), 'الإنجليزية');
  assert.ok(f.field.classList.contains('is-set'));
  // رمز بلهجته يُكتب في البحث ويُختار بالنقر.
  f.field.click();
  input.value = 'pt-BR';
  input.dispatchEvent({ type: 'input' });
  const br = findAll(f.root, (e) => e.getAttribute('data-code') === 'pt-BR')[0];
  br.click();
  assert.deepEqual(picked, ['en', 'pt-BR']);
  f.field.click();
  input.value = 'xyzw-not';
  input.dispatchEvent({ type: 'input' });
  assert.equal(textOf(f.root.querySelector('.tj-lang-pop__none')), LANG_TEXT.none);
  input.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(f.field.getAttribute('aria-expanded'), 'false');
});

test('الصف: المبادلة تقلب اللغتين فورًا، و«تلقائي» قيمة «من» وحدها لا تنتقل إلى «إلى»', () => {
  const doc = newDocument();
  const changes = [];
  const p = langPair({ from: 'en', to: 'ar', onChange: (pair, why) => changes.push([pair, why]), doc });
  doc.body.append(p.root);
  p.swap.click();
  assert.deepEqual(p.get(), { from: 'ar', to: 'en' });
  assert.deepEqual(changes, [[{ from: 'ar', to: 'en' }, 'swap']]);
  assert.equal(textOf(p.fromField.field.querySelector('.tj-lang__v')), 'العربية');
  const auto = langPair({ from: AUTO, to: 'ar', autoFrom: LANG_TEXT.auto, onChange: () => {}, doc });
  assert.equal(textOf(auto.fromField.field.querySelector('.tj-lang__v')), LANG_TEXT.auto);
  auto.swap.click();
  assert.deepEqual(auto.get(), { from: 'ar', to: null });
  p.setDisabled(true);
  p.fromField.field.click();
  assert.equal(p.fromField.field.getAttribute('aria-expanded'), 'false', 'المعطّل لا يُفتح');
});

test('لوحة المفاتيح في المنتقي (مراجعة AA3): Enter أثناء التركيب لا يختار، وEsc لا يصعد إلى الحوار، وTab يعيد التركيز إلى الحقل', () => {
  const doc = newDocument();
  const picked = [];
  const f = langField({ label: LANG_TEXT.to, value: null, onChange: (c) => picked.push(c), doc });
  doc.body.append(f.root);
  let bubbled = 0;
  doc.body.addEventListener('keydown', () => { bubbled++; });
  f.field.click();
  const input = f.root.querySelector('.tj-lang-pop__search');
  input.value = 'en';
  input.dispatchEvent({ type: 'input' });
  input.dispatchEvent({ type: 'keydown', key: 'Enter', isComposing: true });
  assert.deepEqual(picked, [], 'التركيب لا يختار');
  input.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(f.field.getAttribute('aria-expanded'), 'false');
  assert.equal(bubbled, 1, 'Esc لا يصل إلى الحاوية (وصلها Enter أثناء التركيب وحده)');
  f.field.click();
  f.root.querySelector('.tj-lang-pop__search').dispatchEvent({ type: 'keydown', key: 'Tab' });
  assert.equal(f.field.getAttribute('aria-expanded'), 'false');
  assert.ok(doc.activeElement === f.field, 'التركيز على الحقل فيتابع Tab من موضعه');
});
