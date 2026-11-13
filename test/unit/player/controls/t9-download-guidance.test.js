// ت-٩ (تحقق Fable للتصميم، البند 22 في الجولة الثانية): قائمة «تنزيل الأصل» بلا مسار ملتقط كانت تكرر الإرشاد ثلاث مرات (تنبيه
// الرفض بخطواته، ثم «فعّل CC…» بجواره ولو قال الرفض «أوقف الترجمة ثم شغّلها»، ثم سطر اللغات بالخطوات نفسها)، والمواصفة §٦.٥
// تقول «يكفي سطر ملخص واحد». صارت رسالة واحدة بحسب الحالة، والتفصيل (الشرح وسطر اللغات بخطواته وخطوات الترجمة الآلية وملاحظة
// Brave) خلف «لماذا؟»: زر يكشفه بـaria-expanded، بالمؤشر ولوحة المفاتيح، ولا يتكرر فيه سطر ظاهر.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { LABELS, ccLanguagesLine } from '../../../../src/player/controls/text.js';
import { A, EN_CUES, click, makeState, mountPage, trackInfo } from './harness.js';

const count = (text, part) => text.split(part).length - 1;
/** رسائل الحالة الممكنة في القائمة بلا مسار ملتقط: يظهر منها واحدة فقط. */
const STATE_CODES = ['CT_NOT_CAPTURED', 'CT_CC_NOT_CAPTURED', 'CT_NO_CAPTIONS', 'EX_EMPTY_BODY', 'EX_BEYOND_DURATION', 'EX_NOT_ENGLISH'];
/** «فعّل CC» بعدد لغات الفيديو (القرار ٢٩): رسالة حالة أيضًا، ورمزها هنا CC_LANGS:<العدد>. */
const shown = (text) => [
  ...STATE_CODES.filter((c) => text.includes(messageFor(c))),
  ...[1, 2, 3, 11].filter((n) => text.includes(ccLanguagesLine(n))).map((n) => `CC_LANGS:${n}`),
];
/** العدد في سطر اللغات خلف «لماذا؟» (otherInVideo) لا يتكرر حين قيل في الرسالة. */
const COUNTED = /في هذا الفيديو .+\. لاختيار/;
// en يدوي، وes وja لغتان أخريان، وترجمة يوتيوب الآلية متاحة.
const available = { videoId: A, tracks: [{ lang: 'en', kind: 'manual', name: 'English' }, { lang: 'es', kind: 'manual', name: 'Español' }, { lang: 'ja', kind: 'asr', name: null }], translatable: true };
const savedEnglish = { key: 'en|manual', lang: 'en', kind: 'manual', cues: EN_CUES, source: 'saved' };

/**
 * الحالات: الرسالة الوحيدة المنتظرة، وهل لها تفصيل خلف «لماذا؟»، وعدد خطوات الاختيار فيه (سطر اللغات أو السطر العام)، وهل
 * فيه خطوات الترجمة الآلية.
 */
const CASES = [
  { name: 'لا التقاط ولا قائمة لغات', state: {}, code: 'CT_NOT_CAPTURED', why: true, steps: 0, machine: false },
  { name: 'لا التقاط وفي الفيديو ثلاث لغات وترجمة آلية: «فعّل CC» بالعدد (القرار ٢٩)', state: { available }, code: 'CC_LANGS:3', why: true, steps: 1, machine: true },
  { name: 'استجابة فارغة ولغات معروفة', state: { captureIssue: { code: 'EX_EMPTY_BODY', at: 1 }, available }, code: 'EX_EMPTY_BODY', why: true, steps: 1, machine: true },
  { name: 'أصل محفوظ واستجابة فارغة (لقطة Fable)', state: { english: savedEnglish, captureIssue: { code: 'EX_EMPTY_BODY', at: 1 }, available }, code: 'EX_EMPTY_BODY', why: true, steps: 1, machine: true },
  { name: 'رفض مسار قديم بلا قائمة لغات', state: { captureIssue: { code: 'EX_NOT_ENGLISH', at: 1 } }, code: 'EX_NOT_ENGLISH', why: true, steps: 1, machine: false },
  { name: 'مسار التُقط ولم يُحوَّل', state: { captured: [trackInfo({ ok: false, code: 'EX_BEYOND_DURATION', cueCount: 0 })], available }, code: 'EX_BEYOND_DURATION', why: true, steps: 1, machine: true },
];

for (const c of CASES) {
  test(`ت-٩ (${c.name}): رسالة واحدة ظاهرة، والتفصيل خلف «لماذا؟» بلا تكرار للإرشاد`, () => {
    const page = mountPage({ state: makeState(c.state) });
    click(page.ui.btn('download'));
    const before = page.ui.menuText();
    assert.deepEqual(shown(before), [c.code], 'رسالة الحالة وحدها، بلا رسالتين متعارضتين');
    assert.equal(count(before, LABELS.pickSteps), 0, 'خطوات الاختيار خلف «لماذا؟»');
    assert.equal(count(before, LABELS.machineSteps), 0, 'وخطوات الترجمة الآلية');
    assert.equal(count(before, LABELS.why), 0, 'والشرح');
    const why = page.ui.item(LABELS.whyLink);
    if (!c.why) {
      assert.ok(why === null);
      return;
    }
    assert.ok(why, '«لماذا؟» موجود');
    assert.equal(why.getAttribute('aria-expanded'), 'false');
    click(why);
    const after = page.ui.menuText();
    assert.equal(page.ui.item(LABELS.whyLink).getAttribute('aria-expanded'), 'true');
    assert.deepEqual(shown(after), [c.code], 'والرسالة لا تتكرر بعد الكشف');
    assert.equal(count(after, LABELS.pickSteps), c.steps, 'خطوات الاختيار مرة واحدة على الأكثر');
    assert.equal(count(after, LABELS.machineSteps), c.machine ? 1 : 0);
    assert.equal(count(after, LABELS.why), 1, 'الشرح مرة واحدة');
    if (c.code.startsWith('CC_LANGS')) assert.ok(!COUNTED.test(after), 'العدد في الرسالة وحدها، لا خلف «لماذا؟»');
    click(page.ui.item(LABELS.whyLink));
    assert.equal(count(page.ui.menuText(), LABELS.pickSteps), 0, 'ويطويه الضغط مرة أخرى');
    assert.equal(page.ui.item(LABELS.whyLink).getAttribute('aria-expanded'), 'false');
  });
}

test('ت-٩: يوتيوب يعطّل CC (لا ترجمة للفيديو): رسالته وحدها، و«لماذا؟» حين يكون للفيديو لغات تُذكر', () => {
  const none = mountPage();
  none.cc.setAttribute('aria-disabled', 'true');
  none.env.win.advance(1100);
  click(none.ui.btn('download'));
  assert.deepEqual(shown(none.ui.menuText()), ['CT_NO_CAPTIONS']);
  assert.ok(none.ui.item(LABELS.whyLink) === null, 'لا تفصيل يُكشف');
});

test('ت-٩: «لماذا؟» زر يُفعَّل بلوحة المفاتيح ويبقى التركيز عليه، وملاحظة Brave في التفصيل مرة واحدة', () => {
  const page = mountPage({ state: makeState({ captureIssue: { code: 'EX_NOT_ENGLISH', at: 1 } }), brave: true });
  click(page.ui.btn('download'), 0);
  const why = page.ui.item(LABELS.whyLink);
  assert.equal(why.tagName, 'button');
  assert.equal(why.getAttribute('type'), 'button');
  assert.equal(count(page.ui.menuText(), LABELS.braveNote), 0, 'ملاحظة Brave خلف «لماذا؟»');
  why.focus();
  click(why, 0);
  const now = page.ui.item(LABELS.whyLink);
  assert.equal(now.getAttribute('aria-expanded'), 'true');
  assert.ok(page.ui.layerHost().shadowRoot.activeElement === now, 'التركيز باقٍ على «لماذا؟» بعد إعادة البناء');
  const text = page.ui.menuText();
  assert.equal(count(text, LABELS.braveNote), 1);
  assert.equal(count(text, LABELS.pickSteps), 1);
});

test('القرار ٢٩: «فعّل CC» بعدد لغات الفيديو بصيغ العدد، وخطوات الاختيار بلا عدد، بالعربية والإنجليزية', async () => {
  const { setLocale } = await import('../../../../src/i18n/index.js');
  const { otherLanguagesLine } = await import('../../../../src/player/controls/text.js');
  // ح-40: «فتظهر في هذه القائمة» بدل «ثم افتح هذه القائمة»، لأن الضغط على CC لا يغلقها وهي تتحدّث بالالتقاط.
  assert.equal(messageFor('CT_NOT_CAPTURED'), 'فعّل ترجمة يوتيوب (CC) واختر اللغة التي تريدها، فتظهر في هذه القائمة.');
  assert.equal(ccLanguagesLine(1), 'في هذا الفيديو لغة واحدة: فعّل ترجمة يوتيوب (CC) واخترها، فتظهر في هذه القائمة.');
  // «إحداهما» مع المثنى و«إحداها» مع الجمع (تحقق مستقل §١٠، البند ١).
  assert.equal(ccLanguagesLine(2), 'في هذا الفيديو لغتان: فعّل ترجمة يوتيوب (CC) واختر إحداهما، فتظهر في هذه القائمة.');
  assert.equal(ccLanguagesLine(3), 'في هذا الفيديو 3 لغات: فعّل ترجمة يوتيوب (CC) واختر إحداها، فتظهر في هذه القائمة.');
  assert.equal(ccLanguagesLine(11), 'في هذا الفيديو 11 لغة: فعّل ترجمة يوتيوب (CC) واختر إحداها، فتظهر في هذه القائمة.');
  assert.equal(otherLanguagesLine(1, { other: false, counted: false }), `لاختيارها: ${LABELS.pickSteps}`);
  assert.equal(otherLanguagesLine(2, { other: false, counted: false }), `لاختيار إحداهما: ${LABELS.pickSteps}`);
  assert.equal(otherLanguagesLine(3, { other: false, counted: false }), `لاختيار إحداها: ${LABELS.pickSteps}`);
  assert.equal(otherLanguagesLine(2), `في هذا الفيديو لغتان أخريان. لاختيار إحداهما: ${LABELS.pickSteps}`);
  setLocale('en');
  try {
    assert.equal(messageFor('CT_NOT_CAPTURED'), 'Turn on YouTube subtitles (CC) and choose the language you want. It’ll appear in this menu.');
    assert.equal(ccLanguagesLine(1), 'This video has 1 language: turn on YouTube subtitles (CC) and choose it. It’ll appear in this menu.');
    assert.equal(ccLanguagesLine(3), 'This video has 3 languages: turn on YouTube subtitles (CC) and choose one. It’ll appear in this menu.');
    assert.ok(otherLanguagesLine(3, { other: false, counted: false }).startsWith('To choose one: CC, then Settings'));
  } finally {
    setLocale('ar');
  }
});
