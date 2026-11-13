// ح-57 (الجولة الخامسة، 2026-11-14): وصف مسار الأصل الواحد (src/ui/track.js) باللغتين ولأنواع المسار، والسطحان (نافذة الإضافة وقائمة
// «تنزيل الأصل») واللوحة منه نفسه. كانت ثلاث صيغ: «الإنجليزية (ترجمة يوتيوب الآلية) ملتقطة · تلقائية» و«مترجمة آليًا من يوتيوب عن
// العربية» و«ترجمة يوتيوب الآلية عن العربية».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../../../src/i18n/index.js';
import { describeStatus, machineNote } from '../../../src/pages/popup/status.js';
import { captureLine } from '../../../src/player/panel/text.js';
import { trackLine } from '../../../src/player/controls/text.js';
import { trackDescription } from '../../../src/ui/track.js';

const ARABIC = /[؀-ۿ]/;
const ar = new Intl.DisplayNames(['ar'], { type: 'language' });

test('ح-57: العربية: اليدوي والتلقائي بنوعهما، والمترجم آليًا بمصدره بلا «تلقائية»، ثم العدد بالإعراب ثم الحال', () => {
  assert.equal(trackDescription({ lang: 'en', kind: 'manual' }), 'الإنجليزية · يدوية');
  assert.equal(trackDescription({ lang: 'en', kind: 'asr' }), 'الإنجليزية · تلقائية');
  assert.equal(trackDescription({ lang: 'en', kind: 'asr', via: 'ar' }), 'الإنجليزية، ترجمها يوتيوب آليًا عن العربية');
  assert.equal(trackDescription({ lang: 'en', kind: 'asr', via: 'ar' }, { count: 1066 }), 'الإنجليزية، ترجمها يوتيوب آليًا عن العربية · 1066 مقطعًا');
  assert.equal(trackDescription({ lang: 'en', kind: 'manual' }, { count: 1 }), 'الإنجليزية · يدوية · مقطع واحد');
  assert.equal(trackDescription({ lang: 'en', kind: 'manual' }, { count: 2 }), 'الإنجليزية · يدوية · مقطعان');
  assert.equal(trackDescription({ lang: 'en', kind: 'manual' }, { count: 5 }), 'الإنجليزية · يدوية · 5 مقاطع');
  assert.equal(trackDescription({ lang: 'en', kind: 'manual' }, { count: 100 }), 'الإنجليزية · يدوية · 100 مقطع');
  assert.equal(trackDescription({ lang: 'ja', kind: 'asr' }, { count: 212, state: 'captured' }), 'اليابانية · تلقائية · 212 مقطعًا · ملتقطة');
  assert.equal(trackDescription({ lang: 'en', kind: 'manual' }, { count: 5, state: 'saved' }), 'الإنجليزية · يدوية · 5 مقاطع · محفوظة');
  for (const s of [trackDescription({ lang: 'en', kind: 'asr', via: 'ar' }), trackDescription({ lang: 'en', kind: 'asr', via: 'ar' }, { count: 3 })]) {
    assert.equal(s.includes('تلقائية'), false, s);
    assert.equal(s.includes('ترجمة يوتيوب الآلية'), false, s);
  }
});

test('ح-57: الإنجليزية بلا حرف عربي، وبالصيغة نفسها', () => {
  setLocale('en');
  try {
    assert.equal(trackDescription({ lang: 'en', kind: 'manual' }, { count: 412 }), 'English · manual · 412 segments');
    assert.equal(trackDescription({ lang: 'en', kind: 'asr' }, { count: 1 }), 'English · auto-generated · 1 segment');
    assert.equal(trackDescription({ lang: 'en', kind: 'asr', via: 'ar' }, { count: 1066 }), 'English, auto-translated by YouTube from Arabic · 1066 segments');
    assert.equal(trackDescription({ lang: 'ja', kind: 'asr' }, { count: 3, state: 'captured' }), 'Japanese · auto-generated · 3 segments · captured');
    assert.equal(trackDescription({ lang: 'en', kind: 'manual' }, { state: 'saved' }), 'English · manual · saved');
    for (const s of [trackDescription({ lang: 'und', kind: 'manual' }), trackDescription({ lang: 'fr', via: 'de' }, { count: 2, state: 'saved' })]) assert.equal(ARABIC.test(s), false, s);
    assert.equal(trackDescription({ lang: null, kind: 'manual' }), 'Original · manual');
  } finally {
    setLocale('ar');
  }
});

test('ح-57: الرمز الذي لا يُعرف اسمه يبقى رمزه، وغير المحدد «الأصل»، واللهجة إلا حين تُطلب اللغة الأساسية (اللوحة)', () => {
  assert.equal(trackDescription({ lang: 'und', kind: 'manual' }), 'الأصل · يدوية');
  assert.equal(trackDescription({ lang: 'en', via: 'qqq' }), 'الإنجليزية، ترجمها يوتيوب آليًا عن qqq');
  assert.equal(trackDescription({ lang: 'en-GB', kind: 'manual' }), `${ar.of('en-GB')} · يدوية`);
  assert.equal(trackDescription({ lang: 'en-GB', kind: 'manual' }, { region: false }), 'الإنجليزية · يدوية');
});

test('ح-57: نافذة الإضافة وقائمة «تنزيل الأصل» واللوحة بالنص نفسه للمسار نفسه، والنافذة تزيد حاله وحده', () => {
  const track = { key: 'en|asr|ar', lang: 'en', kind: 'asr', via: 'ar', cueCount: 1066 };
  const menu = trackLine(track);
  const reply = {
    v: 1, ok: true, watch: true, videoId: 'iG9CE55wbtY', title: 'ت', loading: false, arabic: null, view: { displayOffsetMs: 0, displayMode: 'ar' },
    mounted: { overlay: 'mounted', controls: 'mounted' }, english: { captured: [{ key: track.key, kind: 'asr', cueCount: 1066, ok: true }], saved: [] },
  };
  assert.equal(menu, 'الإنجليزية، ترجمها يوتيوب آليًا عن العربية · 1066 مقطعًا');
  assert.equal(describeStatus(reply).englishLine, `${menu} · ملتقطة`);
  assert.equal(captureLine({ lang: 'en', kind: 'asr', via: 'ar', count: 1066, saved: false }), `${menu} · ملتقطة`);
  assert.equal(machineNote('en', 'ar'), 'الأصل: الإنجليزية، ترجمها يوتيوب آليًا عن العربية.');
  setLocale('en');
  try {
    assert.equal(describeStatus(reply).englishLine, `${trackLine(track)} · captured`);
    assert.equal(trackLine(track), 'English, auto-translated by YouTube from Arabic · 1066 segments');
  } finally {
    setLocale('ar');
  }
});
