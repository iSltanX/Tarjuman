// ح-61 (الجولة الخامسة، 2026-11-14): قائمة «تنزيل الأصل» تتسع بلا تمرير في مشغّل بعرض 854 في حالتها المعتادة (مسار ملتقط، ولغة أو لغتان،
// وملف طويل) بالمحتوى لا بالخط ولا بالعرض: سطر واحد لكل تنبيه، والتفصيل خلف زر يُفتح (aria-expanded وaria-controls، والنص في الـDOM مطويًا).
// «ملف طويل» سطر وتفصيله خلف «لماذا؟»، ولغات الفيديو الأخرى سطر وطريقتها خلف «كيف؟» (وفي تفصيل ح-58 حين يكون الفيديو بلغة الهدف)، و«تقسيم
// الملفات الطويلة» مطوي، وسطر التعليمات بعد التنزيل وحده «التالي: انسخ التعليمات من نافذة الإضافة.». والقياس الفعلي في الجولة الحية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../../../../src/i18n/index.js';
import { LABELS } from '../../../../src/player/controls/text.js';
import { click, makeState, mountPage, settle, trackInfo } from './harness.js';

const available = (langs) => ({ videoId: 'AAAAAAAAAAA', tracks: langs.map((lang) => ({ lang, kind: 'asr', name: null })), translatable: true });
const prefsTo = (to) => ({ schema: 1, pair: { from: 'auto', to }, remember: true, recent: [], videos: {}, order: [] });
const usual = (over = {}) => mountPage({ state: makeState({ captured: [trackInfo({ key: 'en|asr', kind: 'asr', cueCount: 1066 })], available: available(['en', 'ar']), langPrefs: prefsTo('ar'), ...over }) });
const self = () => mountPage({ state: makeState({ captured: [trackInfo({ key: 'en|asr|ar', lang: 'en', kind: 'asr', via: 'ar', cueCount: 1066 })], available: available(['en']), langPrefs: prefsTo('ar') }) });
const open = (page) => click(page.ui.btn('download'));
/** ظاهر في القائمة: لا hidden عليه ولا على أب داخلها. */
const shown = (page, node) => {
  for (let n = node; n && n !== page.ui.menu(); n = n.parentNode) if (n.hasAttribute?.('hidden')) return false;
  return true;
};
/** كل زر طي في القائمة: aria-expanded، وaria-controls إلى عنصر موجود. */
function disclosures(page) {
  const menu = page.ui.menu();
  return menu.querySelectorAll('button').filter((b) => b.className === 'link' && b.hasAttribute('aria-controls')).map((b) => {
    const target = menu.querySelector(`[id="${b.getAttribute('aria-controls')}"]`);
    return { fid: b.getAttribute('data-fid'), expanded: b.getAttribute('aria-expanded'), target, hidden: target?.hasAttribute('hidden') ?? null };
  });
}

test('ح-61: الحالة المعتادة (ملف طويل ولغة أخرى): «ملف طويل» سطر، واللغة الأخرى سطر، وتفصيلاهما مطويان على بُعد نقرة', () => {
  const page = usual();
  open(page);
  assert.equal(page.ui.field('longFile').querySelector('.stack').children[0].textContent, 'ملف طويل: 1066 مقطعًا. لماذا؟');
  assert.equal(page.ui.field('otherSummary').textContent, 'في هذا الفيديو لغة أخرى. كيف؟');
  const ds = disclosures(page);
  assert.deepEqual(ds.map((d) => [d.fid, d.expanded, d.hidden]), [['longWhy', 'false', true], ['otherHow', 'false', true]]);
  for (const d of ds) assert.ok(d.target, `${d.fid}: aria-controls إلى عنصر في الـDOM`);
  assert.match(page.ui.field('otherLangs').textContent, /^لاختيارها: CC ثم الإعدادات ثم «الترجمة» ثم اللغة التي تريدها$/);
  assert.equal(page.ui.item('تقسيم الملفات الطويلة').getAttribute('aria-expanded'), 'false', 'مطوي حتى يُفتح');
  assert.ok(page.ui.field('instructionsNote') === null, 'لا سطر تعليمات قبل التنزيل');
});

test('ح-61: فتح كل تفصيل يُظهره وحده، والنص نفسه في الـDOM قبل الفتح وبعده', () => {
  const page = usual();
  open(page);
  const before = page.ui.field('otherLangs').textContent;
  click(page.ui.field('otherHow'));
  assert.equal(page.ui.field('otherHow').getAttribute('aria-expanded'), 'true');
  assert.equal(shown(page, page.ui.field('otherLangs')), true);
  assert.equal(shown(page, page.ui.field('longWhyText')), false, 'الآخر باقٍ مطويًا');
  assert.equal(page.ui.field('otherLangs').textContent, before);
  click(page.ui.field('longWhy'));
  assert.equal(shown(page, page.ui.field('longWhyText')), true);
});

test('ح-61: بعد تنزيل ناجح وحده سطر «التالي: انسخ التعليمات من نافذة الإضافة.» بعد سطر النتيجة', async () => {
  const page = usual();
  open(page);
  click(page.ui.item('تنزيل الملف'));
  await settle();
  const note = page.ui.field('instructionsNote');
  assert.equal(note.textContent, 'التالي: انسخ التعليمات من نافذة الإضافة.');
  const fids = page.ui.menu().children.map((c) => c.getAttribute('data-fid'));
  assert.equal(fids.indexOf('instructionsNote'), fids.indexOf('saveLine') + 1, 'بعد سطر النتيجة');
  click(page.ui.item('مقاطع أطول'));
  assert.ok(page.ui.field('instructionsNote') === null, 'تغيير الشكل يمحو النتيجة وسطرها');
});

test('ح-61 مع ح-58: الفيديو بلغة الهدف: سطر التنبيه وحده، ولغات الفيديو الأخرى في تفصيله لا سطرًا ثانيًا', () => {
  const page = self();
  open(page);
  assert.ok(page.ui.field('roundTrip'));
  assert.ok(page.ui.field('otherSummary') === null, 'لا سطر لغات منفصل');
  const how = page.ui.field('roundTripHow');
  assert.equal(how.hasAttribute('hidden'), true);
  assert.match(how.textContent, /في هذا الفيديو لغة أخرى\. لاختيارها: CC ثم الإعدادات ثم «الترجمة» ثم اللغة التي تريدها$/, 'لا يضيع شيء');
  assert.deepEqual(disclosures(page).map((d) => d.fid), ['roundTrip', 'longWhy']);
});

test('ح-61 بالإنجليزية: السطور الثلاثة قصيرة بلا حرف عربي، والتفصيل كذلك', async () => {
  setLocale('en');
  try {
    const page = usual();
    open(page);
    assert.equal(page.ui.field('longFile').querySelector('.stack').children[0].textContent, 'Long file: 1066 segments. Why?');
    assert.equal(page.ui.field('otherSummary').textContent, 'This video has 1 other language. How?');
    assert.match(page.ui.field('otherLangs').textContent, /^To choose it: CC, then Settings, then “Subtitles\/CC”, then the language you want$/);
    click(page.ui.item('Download file'));
    await settle();
    assert.equal(page.ui.field('instructionsNote').textContent, LABELS.instructionsNext);
    assert.equal(LABELS.instructionsNext, 'Next: copy the instructions from the extension popup.');
    assert.equal(/[؀-ۿ]/.test(page.ui.menuText()), false, page.ui.menuText());
  } finally {
    setLocale('ar');
  }
});
