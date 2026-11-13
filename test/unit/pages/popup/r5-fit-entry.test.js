// ح-60 (الجولة الخامسة، 2026-11-14): نافذة الإضافة في حالتها المعتادة (فيديو مفتوح، وترجمة ملتقطة، ولا ترجمة محفوظة) كانت تبلغ حد
// المتصفح 600 فتنقطع عند «الصق الترجمة هنا». الأساسي ظاهر: بطاقة الفيديو، واللغتان، ونسخ التعليمات، واللصق؛ وما يُقرأ مرة مطوي أو وصف
// أو في موضع أصغر: الخطوات الثلاث خلف «الخطوات» (aria-expanded وaria-controls، وفي الـDOM مخفية)، وشرح زر النسخ وشرح اللصق وسطر
// «مكتشفة من ترجمة الفيديو» أوصافٌ (aria-describedby)، و«نسخ تشخيص الصفحة» بجانب سطر حال الأدوات. تُحمَّل نقطة الدخول pages/popup/main.js
// ببيئة وهمية (c8-entry-env) مرة واحدة في هذه العملية. والقياس الفعلي للارتفاع في الجولة الحية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntryEnv } from '../../../helpers/c8-entry-env.js';
import { findAll, settle, textOf } from '../library/fake-dom.js';

const reply = {
  v: 1, ok: true, watch: true, videoId: 'ePes07acH_w', title: 'Naval Heritage', loading: false, arabic: null,
  english: { captured: [{ key: 'en|asr', kind: 'asr', cueCount: 1066, ok: true }], saved: [{ key: 'en|asr', kind: 'asr', cueCount: 1066 }] },
  view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' },
  source: { key: 'en|asr', lang: 'en', kind: 'asr', via: null, from: 'captured' },
};
const env = createEntryEnv({
  tabs: { query: async () => [{ id: 7 }], sendMessage: async (id, msg) => (msg?.type === 'tj:get-video-state' ? reply : undefined) },
});
const restoreLoad = env.install();
try {
  await import('../../../../src/pages/popup/main.js');
  await settle(30);
  await new Promise((r) => setImmediate(r));
  await settle(30);
} finally {
  restoreLoad();
}
const doc = env.doc;
const byAction = (a) => doc.querySelectorAll('button').find((b) => b.getAttribute('data-action') === a) ?? null;
const all = (pred) => findAll(doc.documentElement, pred);
const byClass = (c) => all((e) => e.classList?.contains(c))[0] ?? null;
/** ظاهر: لا hidden عليه ولا على أب، ولا إخفاء بصري. */
const shown = (node) => {
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) if (n.hidden || n.classList?.contains('tj-sr-only')) return false;
  return true;
};

test('ح-60: الأساسي ظاهر: بطاقة الفيديو وسطر مساره، واللغتان، ونسخ التعليمات، واللصق بتسميته', () => {
  const card = byClass('tj-popup__status');
  assert.ok(card && shown(card), 'بطاقة الفيديو');
  assert.equal(textOf(card.querySelector('.tj-popup__english')), 'الإنجليزية · تلقائية · 1066 مقطعًا · ملتقطة');
  const row = byClass('tj-lang-row');
  assert.ok(row && shown(row), 'اللغتان');
  assert.ok(shown(byAction('copy')), 'نسخ التعليمات');
  const paste = doc.querySelector('#tj-paste');
  assert.ok(paste && shown(paste), 'حقل اللصق');
  assert.equal(paste.getAttribute('rows'), '1', 'بسطر واحد (40)');
  const label = doc.querySelectorAll('label').find((l) => l.getAttribute('for') === 'tj-paste');
  assert.ok(label && shown(label), '«الصق الترجمة هنا» ظاهرة');
  assert.equal(textOf(label), 'الصق الترجمة هنا');
});

test('ح-60: الخطوات الثلاث خلف «الخطوات» في صف عنوان الكتلة: مطوية في الـDOM، ونقرة تُظهرها وأخرى تطويها', () => {
  const toggle = byAction('steps');
  assert.ok(toggle && shown(toggle), 'الزر ظاهر');
  assert.equal(textOf(toggle), 'الخطوات');
  assert.ok(toggle.parentNode.classList.contains('tj-popup__pair-head'), 'في صف «تعليمات الترجمة»');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-controls'), 'tj-steps');
  const steps = doc.querySelector('#tj-steps');
  assert.equal(shown(steps), false, 'مطوية');
  const items = findAll(steps, (e) => e.tagName === 'li');
  assert.equal(items.length, 3, 'في الـDOM');
  assert.match(textOf(items[0]), /^1نزّل الأصل \(الإنجليزية\) من زر التنزيل في الشريط — الخطوة الحالية$/);
  toggle.dispatchEvent({ type: 'click' });
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(shown(steps), true, 'فتحه يُظهرها');
  toggle.dispatchEvent({ type: 'click' });
  assert.equal(shown(steps), false);
});

test('ح-60: شرح زر النسخ وشرح اللصق وسطر «مكتشفة» أوصافٌ لعناصرها (aria-describedby) لا أسطر ظاهرة', () => {
  const caption = doc.querySelector('#tj-pair-caption');
  assert.equal(textOf(caption), 'تعليمات لنموذجك تحافظ على أرقام المقاطع وتوقيتها وصيغة SRT.');
  assert.equal(caption.classList.contains('tj-sr-only'), true);
  assert.equal(byAction('copy').getAttribute('aria-describedby'), 'tj-pair-caption');
  const hint = doc.querySelector('#tj-paste-hint');
  assert.match(textOf(hint), /^الصق رد النموذج كما هو/);
  assert.equal(hint.classList.contains('tj-sr-only'), true);
  assert.ok(doc.querySelector('#tj-paste').getAttribute('aria-describedby').split(' ').includes('tj-paste-hint'));
  const source = doc.querySelector('#tj-pair-source');
  assert.equal(textOf(source), 'لغة الأصل مكتشفة من ترجمة الفيديو.');
  assert.equal(source.classList.contains('tj-sr-only'), true);
  const from = all((e) => e.getAttribute?.('aria-describedby') === 'tj-pair-source')[0];
  assert.ok(from, 'وصف حقل «من»');
  assert.equal(from.getAttribute('title'), 'لغة الأصل مكتشفة من ترجمة الفيديو.', 'وتلميحه عند المرور');
});

test('ح-60: «نسخ تشخيص الصفحة» بجانب سطر حال الأدوات في البطاقة، لا سطرًا بعد الخطوات', () => {
  const diag = byAction('diagnostics');
  const tools = byClass('tj-popup__tools');
  assert.ok(diag && tools && tools.contains(diag), 'في سطر الأدوات');
  assert.ok(shown(diag));
  assert.match(textOf(tools), /^أدوات المشغّل تعملنسخ تشخيص الصفحة$/);
  assert.equal(byClass('tj-popup__diag-host'), null);
});

test('ح-60: ترتيب النافذة: الفيديو الحالي، ثم كتلة التعليمات (وفيها الخطوات المطوية)، ثم اللصق؛ و«الأصل محفوظ» في سطر «لا ترجمة» (ح-59)', () => {
  const main = byClass('tj-popup__main');
  const visible = [...main.children].filter((c) => shown(c) && textOf(c) !== '').map((c) => c.className.split(' ').find((k) => k.startsWith('tj-popup__')));
  assert.deepEqual(visible, ['tj-popup__eyebrow', 'tj-popup__card', 'tj-popup__pair', 'tj-popup__pair'], 'ولا خطوات ولا تشخيص بعد اللصق');
  const pair = [...main.children].filter((c) => c.classList.contains('tj-popup__pair'))[0];
  const kids = [...pair.children].map((c) => c.className.split(' ').find((k) => k.startsWith('tj-')) ?? c.tagName);
  assert.deepEqual(kids.slice(0, 2), ['tj-popup__pair-head', 'tj-popup__guide']);
  const lineRow = byClass('tj-popup__line-row');
  assert.equal(textOf(lineRow), 'لا ترجمة محفوظة بعدالأصل محفوظ');
});
