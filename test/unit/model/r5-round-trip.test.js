// ح-58 (الجولة الخامسة، 2026-11-14): الفيديو المترجم إلى لغته. المسار الملتقط ترجمة يوتيوب الآلية (tlang) عن لغة هي نفسها لغة الهدف،
// كفيديو عربي مساره الإنجليزي مترجم آليًا عن العربية والترجمة إلى العربية: يُقال في نافذة الإضافة وقائمة «تنزيل الأصل» إن الفيديو بهذه
// اللغة أصلًا فليُختر مساره الأصلي، بسطر تنبيه واحد وتفصيله خلف زر يُفتح، ولا يُمنع التنزيل ولا النسخ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundTrip } from '../../../src/core/model/pair.js';
import { setLocale } from '../../../src/i18n/index.js';
import { PAIR_TEXT, machineNote, pairState } from '../../../src/pages/popup/status.js';
import { roundTripNote } from '../../../src/pages/popup/view.js';
import { roundTripText } from '../../../src/ui/track.js';
import { click, makeState, mountPage, trackInfo } from '../player/controls/harness.js';
import { newDocument, textOf } from '../pages/library/fake-dom.js';

const ARABIC = /[؀-ۿ]/;

test('ح-58: الكشف دالة نقية: موجب حين لغة مصدر ترجمة يوتيوب الآلية هي لغة الهدف (باللغة الأساسية)', () => {
  assert.equal(roundTrip({ via: 'ar' }, 'ar'), true, 'فيديو عربي، مساره إنجليزي مترجم آليًا عن العربية، والهدف العربية');
  assert.equal(roundTrip({ lang: 'en', kind: 'asr', via: 'ar' }, 'ar-EG'), true, 'العربية بلهجتها');
  assert.equal(roundTrip({ via: 'en-GB' }, 'en'), true);
  assert.equal(roundTrip({ via: 'iw' }, 'he'), true, 'الرمز القديم كالقياسي');
  assert.equal(roundTrip({ via: 'ja' }, 'JA'), true);
});

test('ح-58: سالب حين الهدف غير لغة الأصل، أو المسار ليس ترجمة يوتيوب الآلية، أو لا هدف', () => {
  assert.equal(roundTrip({ via: 'ar' }, 'fr'), false, 'الهدف غير لغة الأصل');
  assert.equal(roundTrip({ via: 'en' }, 'ar'), false);
  assert.equal(roundTrip({ lang: 'ar', kind: 'asr' }, 'ar'), false, 'مسار أصلي بلا via (وإن كان بلغة الهدف)');
  assert.equal(roundTrip({ lang: 'ar', kind: 'manual', via: null }, 'ar'), false);
  assert.equal(roundTrip({ via: 'ar' }, null), false, 'هدف غير محدد');
  assert.equal(roundTrip(null, 'ar'), false);
  assert.equal(roundTrip({ via: 'not a lang' }, 'not a lang'), false, 'رمز غير صالح');
});

test('ح-58: نص السطر وتفصيله باللغتين، والرمز المجهول معزول', () => {
  assert.deepEqual(roundTripText('ar'), {
    lead: 'الفيديو بالعربية أصلًا:',
    action: 'اختر مساره الأصلي',
    how: 'هذا المسار ترجمه يوتيوب آليًا عن العربية. لاختيار مساره الأصلي في المشغّل: CC ثم الإعدادات ثم «الترجمة» ثم العربية. ولك أن تتابع بهذا المسار.',
  });
  assert.equal(roundTripText('ja').lead, 'الفيديو باليابانية أصلًا:');
  assert.equal(roundTripText('qqq').lead, 'الفيديو بلغة ⁦qqq⁩ أصلًا:');
  setLocale('en');
  try {
    const en = roundTripText('ar');
    assert.equal(en.lead, 'This video is in Arabic:');
    assert.equal(en.action, 'pick its own track');
    assert.match(en.how, /^This track was auto-translated by YouTube from Arabic\. To pick its own track in the player: CC, then Settings, then “Subtitles\/CC”, then Arabic\. You can also continue with this track\.$/);
    for (const s of Object.values(en)) assert.equal(ARABIC.test(s), false, s);
  } finally {
    setLocale('ar');
  }
});

// ---- نافذة الإضافة ----

const reply = (source) => ({
  v: 1, ok: true, watch: true, videoId: 'KA3zmDkEUQs', title: 'فيديو', loading: false, arabic: null, view: { displayOffsetMs: 0, displayMode: 'ar' },
  mounted: { overlay: 'mounted', controls: 'mounted' }, english: { captured: [{ key: source.key, kind: source.kind, cueCount: 419, ok: true }], saved: [] }, source,
});
const tlang = reply({ key: 'en|asr|ar', lang: 'en', kind: 'asr', via: 'ar', from: 'captured' });

test('ح-58: النافذة: «من» الإنجليزية المترجمة آليًا عن العربية و«إلى» العربية: سطر التنبيه مكان سطر المصدر، والنسخ متاح', () => {
  const st = pairState({ reply: tlang, pair: { from: 'en', to: 'ar' } });
  assert.equal(st.roundTrip, 'ar');
  assert.equal(st.sourceNote, null, 'لا سطر «الأصل: …» معه، فالتفصيل يقوله');
  assert.equal(st.ready, true, 'لا يُمنع النسخ');
  assert.equal(st.caption, PAIR_TEXT.caption);
});

test('ح-58: النافذة: لا سطر حين «إلى» غير لغة الأصل، أو «من» غير لغة المسار، أو المسار أصلي', () => {
  const fr = pairState({ reply: tlang, pair: { from: 'en', to: 'fr' } });
  assert.equal(fr.roundTrip, null);
  assert.equal(fr.sourceNote, machineNote('en', 'ar'), 'سطر الأصل المترجم آليًا كما كان');
  assert.equal(pairState({ reply: tlang, pair: { from: 'ko', to: 'ar' } }).roundTrip, null, '«من» غيّرها المستخدم');
  const own = reply({ key: 'ar|asr', lang: 'ar', kind: 'asr', via: null, from: 'captured' });
  assert.equal(pairState({ reply: own, pair: { from: 'ar', to: 'en' } }).roundTrip, null);
});

test('ح-58: سطر النافذة: تحذير بأيقونته ونصه، وزر «اختر مساره الأصلي» يفتح التفصيل ويطويه (aria-expanded وaria-controls)', () => {
  const doc = newDocument();
  const note = roundTripNote(roundTripText('ar'), doc);
  const toggle = note.querySelector('button');
  const how = note.querySelector('#tj-roundtrip-how');
  assert.ok(toggle && how);
  assert.equal(textOf(note.querySelector('.tj-popup__roundtrip')), 'الفيديو بالعربية أصلًا: اختر مساره الأصلي');
  assert.equal(note.querySelectorAll('svg').length, 1, 'أيقونة التحذير');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-controls'), 'tj-roundtrip-how');
  assert.equal(how.hidden, true, 'التفصيل في الـDOM مطويًا');
  assert.match(textOf(how), /CC ثم الإعدادات ثم «الترجمة» ثم العربية/);
  toggle.dispatchEvent({ type: 'click' });
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(how.hidden, false);
  toggle.dispatchEvent({ type: 'click' });
  assert.equal(how.hidden, true);
});

// ---- قائمة «تنزيل الأصل» ----

const machineTrack = trackInfo({ key: 'en|asr|ar', lang: 'en', kind: 'asr', via: 'ar', cueCount: 419 });
const prefsTo = (to) => ({ schema: 1, pair: { from: 'auto', to }, remember: true, recent: [], videos: {}, order: [] });
const openMenu = (state) => {
  const page = mountPage({ state });
  click(page.ui.btn('download'));
  return page;
};

test('ح-58: القائمة: سطر واحد بعد سطر اللغة، والتفصيل خلف زر يُفتح، والتنزيل باقٍ', () => {
  const page = openMenu(makeState({ captured: [machineTrack], langPrefs: prefsTo('ar') }));
  const toggle = page.ui.field('roundTrip');
  const how = page.ui.field('roundTripHow');
  assert.ok(toggle && how, 'السطر وتفصيله');
  const line = page.ui.menu().querySelectorAll('.row').find((r) => r.classList.contains('roundtrip'));
  assert.equal(line.textContent, 'الفيديو بالعربية أصلًا: اختر مساره الأصلي');
  assert.equal(line.getAttribute('data-tone'), 'warn');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(toggle.getAttribute('aria-controls'), how.getAttribute('id'));
  assert.equal(how.hasAttribute('hidden'), true, 'التفصيل في الـDOM مطويًا');
  const text = page.ui.menuText();
  assert.ok(text.indexOf('الإنجليزية، ترجمها يوتيوب آليًا عن العربية') < text.indexOf('الفيديو بالعربية أصلًا'), 'بعد سطر اللغة');
  click(toggle);
  assert.equal(page.ui.field('roundTrip').getAttribute('aria-expanded'), 'true');
  assert.equal(page.ui.field('roundTripHow').hasAttribute('hidden'), false);
  assert.match(page.ui.field('roundTripHow').textContent, /لاختيار مساره الأصلي في المشغّل: CC ثم الإعدادات ثم «الترجمة» ثم العربية/);
  const download = page.ui.item('تنزيل الملف');
  assert.ok(download, 'لا يُمنع التنزيل');
  assert.equal(download.getAttribute('aria-disabled'), null);
});

test('ح-58: القائمة: بلا تفضيلات محفوظة «إلى» الافتراضية العربية، وزوج الفيديو المحفوظ يتقدّم', () => {
  assert.ok(openMenu(makeState({ captured: [machineTrack] })).ui.field('roundTrip'), 'الافتراضي');
  const videos = { AAAAAAAAAAA: { from: null, to: 'fr' } };
  assert.ok(openMenu(makeState({ captured: [machineTrack], langPrefs: { ...prefsTo('ar'), videos, order: ['AAAAAAAAAAA'] } })).ui.field('roundTrip') === null, '«إلى» الفيديو الفرنسية');
});

test('ح-58: القائمة: لا سطر حين الهدف غير لغة الأصل، أو المسار ليس ترجمة يوتيوب الآلية', () => {
  assert.ok(openMenu(makeState({ captured: [machineTrack], langPrefs: prefsTo('fr') })).ui.field('roundTrip') === null);
  assert.ok(openMenu(makeState({ captured: [trackInfo({ key: 'ar|asr', lang: 'ar', kind: 'asr' })], langPrefs: prefsTo('ar') })).ui.field('roundTrip') === null);
  assert.ok(openMenu(makeState({ captured: [trackInfo()], langPrefs: prefsTo('ar') })).ui.field('roundTrip') === null);
});

test('ح-58: القائمة بالإنجليزية: السطر وتفصيله بلا حرف عربي', () => {
  setLocale('en');
  try {
    const page = openMenu(makeState({ captured: [machineTrack], langPrefs: prefsTo('ar') }));
    const line = page.ui.menu().querySelectorAll('.row').find((r) => r.classList.contains('roundtrip'));
    assert.equal(line.textContent, 'This video is in Arabic: pick its own track');
    assert.equal(ARABIC.test(page.ui.menuText()), false, page.ui.menuText());
  } finally {
    setLocale('ar');
  }
});
