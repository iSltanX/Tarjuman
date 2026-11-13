// ح-59 (الجولة الخامسة، 2026-11-14): مؤشر «محفوظ» في بطاقة الفيديو كان يظهر تحت «لا ترجمة محفوظة بعد» فيُقرأ أن الترجمة محفوظة. ومعناه في
// الشيفرة لفيديو بلا ترجمة: للفيديو سجل في المحفوظات، ولا يكتبه حينها إلا تنزيل الأصل (withExport يحفظ المسار وبصمته). فصار «الأصل محفوظ»
// بجانب «لا ترجمة محفوظة بعد» في سطره، ولا يظهر حين يقول سطر المسار «· محفوظة» نفسه. وللفيديو بترجمة يبقى «محفوظ» مع شاراته.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../../../../src/i18n/index.js';
import { describeStatus, toolsStatus } from '../../../../src/pages/popup/status.js';
import { statusCard } from '../../../../src/pages/popup/view.js';
import { findAll, newDocument, textOf } from '../library/fake-dom.js';

const reply = (english, over = {}) => ({
  v: 1, ok: true, watch: true, videoId: 'ePes07acH_w', title: 'فيديو', loading: false, arabic: null, english,
  view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' }, ...over,
});
const capturedAndSaved = { captured: [{ key: 'en|asr', kind: 'asr', cueCount: 1066, ok: true }], saved: [{ key: 'en|asr', kind: 'asr', cueCount: 1066 }] };
const card = (r) => statusCard(describeStatus(r), toolsStatus(r), null, newDocument());
const pillsOf = (c) => findAll(c, (e) => e.classList?.contains('tj-pill')).map(textOf);

test('ح-59: أصل نُزّل من قبل والتقاط حي: «الأصل محفوظ» بجانب «لا ترجمة محفوظة بعد» في سطر واحد، لا «محفوظ» وحده', () => {
  const c = card(reply(capturedAndSaved));
  assert.deepEqual(pillsOf(c), ['الأصل محفوظ']);
  const row = findAll(c, (e) => e.classList?.contains('tj-popup__line-row'))[0];
  assert.ok(row, 'سطر واحد');
  assert.equal(textOf(row), 'لا ترجمة محفوظة بعدالأصل محفوظ');
  assert.equal(findAll(row, (e) => e.classList?.contains('tj-pill'))[0].title, 'نُزّل الأصل من قبل، فهو في المحفوظات بانتظار الترجمة');
  assert.equal(findAll(c, (e) => e.classList?.contains('tj-popup__pills')).length, 0, 'لا صف شارات تحت السطر');
});

test('ح-59: الأصل المحفوظ بلا التقاط: سطر المسار يقول «محفوظة»، فلا مؤشر يكرره؛ وبلا تنزيل سابق لا مؤشر', () => {
  const savedOnly = card(reply({ captured: [], saved: [{ key: 'en|manual', kind: 'manual', cueCount: 5 }] }));
  assert.deepEqual(pillsOf(savedOnly), []);
  assert.equal(textOf(savedOnly.querySelector('.tj-popup__english')), 'الإنجليزية · يدوية · 5 مقاطع · محفوظة');
  assert.deepEqual(pillsOf(card(reply({ captured: [{ key: 'en|asr', kind: 'asr', cueCount: 9, ok: true }], saved: [] }))), []);
});

test('ح-59: فيديو بترجمة: «محفوظ» باقٍ مع شاراته (الترجمة محفوظة فعلًا)', () => {
  const c = card(reply(capturedAndSaved, { arabic: { fileName: 'x.ar.srt', cueCount: 412, edited: false, matched: true, lang: 'ar' } }));
  assert.equal(pillsOf(c)[0], 'محفوظ');
  assert.equal(pillsOf(c).includes('الأصل محفوظ'), false);
});

test('ح-59: بالإنجليزية «Original saved» بلا حرف عربي', () => {
  setLocale('en');
  try {
    const c = card(reply(capturedAndSaved));
    assert.deepEqual(pillsOf(c), ['Original saved']);
    assert.equal(/[؀-ۿ]/.test(textOf(c).replace('فيديو', '')), false, textOf(c));
  } finally {
    setLocale('ar');
  }
});
