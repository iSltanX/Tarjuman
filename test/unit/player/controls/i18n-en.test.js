// توطين أدوات المشغّل: الواجهة الإنجليزية بلا حرف عربي خارج بيانات المستخدم، والاتجاه على عناصر ترجمان وحدها، وإعادة البناء عند تبدّل اللغة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDir, setLocale } from '../../../../src/i18n/index.js';
import { HEALTH_MS } from '../../../../src/player/controls/index.js';
import { comparisonSummary, dualLabels, editsLine, otherLanguagesLine, trackLine } from '../../../../src/player/controls/text.js';
import * as H from './harness.js';

const ARABIC = /[؀-ۿ]/;
const settleN = async (n = 6) => { for (let i = 0; i < n; i++) await H.settle(); };
const layerRoot = (page) => page.ui.layerHost().shadowRoot;
const groupRoot = (page) => page.ui.groupHost().shadowRoot;

test('الدوال النقية بالإنجليزية: لا حرف عربي، وفاصل القائمة لاتيني', () => {
  setLocale('en');
  try {
    const cmp = { fingerprintId: 'fp', missing: [57, 58, 201], extra: [], drift: [1, 2], empty: [], noArabic: [], matched: false, numbering: 'same' };
    const texts = [
      comparisonSummary(cmp).text, comparisonSummary(null).text, dualLabels('en-GB').aria, dualLabels(null).short, editsLine(12), editsLine(1),
      otherLanguagesLine(3), otherLanguagesLine(1, { other: false }), otherLanguagesLine(null),
      trackLine({ lang: 'en', kind: 'manual', cueCount: 412 }), trackLine({ lang: 'ar', kind: 'asr', via: 'en', cueCount: 1 }),
    ];
    for (const t of texts) assert.ok(!ARABIC.test(t.replace(/Arabic|العربية/g, '')), t);
    assert.match(texts[0], /3 segments missing: 57, 58, 201/);
    assert.equal(texts[4], 'This will replace 12 manual edits');
  } finally {
    setLocale('ar');
  }
});

test('الشريط والقوائم والرسائل بالإنجليزية: النصوص بلا عربية، وlang وdir على عناصر ترجمان وحدها', async () => {
  setLocale('en');
  try {
    const page = H.mountPage({ state: H.makeState({ arabic: H.arabic(), captured: [H.trackInfo()], notice: { code: 'ST_OFFSET_RESET', tone: 'info', at: 1 } }) });
    await settleN(2);
    const group = groupRoot(page).querySelector('.group');
    assert.equal(group.getAttribute('lang'), 'en');
    assert.equal(getDir(), 'ltr');
    const layer = layerRoot(page).querySelector('.layer');
    assert.equal(layer.getAttribute('lang'), 'en');
    assert.equal(layer.getAttribute('dir'), 'ltr');
    assert.equal(layerRoot(page).querySelector('.toasts').getAttribute('dir'), 'ltr');
    assert.equal(page.player.getAttribute('dir'), null, 'لا يُلمس dir المشغّل');
    assert.equal(page.player.getAttribute('lang'), null, 'ولا lang المشغّل');
    const labels = ['download', 'upload', 'panel', 'minus', 'plus', 'badge'].map((k) => `${page.ui.btn(k).getAttribute('aria-label') ?? ''}|${page.ui.btn(k).getAttribute('aria-description') ?? ''}`);
    assert.equal(ARABIC.test(`${group.getAttribute('aria-label')} ${labels.join(' ')}`), false, labels.join(' '));
    H.click(page.ui.btn('download'));
    assert.equal(ARABIC.test(`${page.ui.menuLabel()} ${page.ui.menuText()}`), false, page.ui.menuText());
    H.click(page.ui.btn('upload'));
    // سطر الملف (talk.ar.srt) من بيانات المستخدم وحدها؛ ما عداه بلا عربية.
    assert.equal(ARABIC.test(`${page.ui.menuLabel()} ${page.ui.menuText().replace(/talk\.ar\.srt/g, '')}`), false, page.ui.menuText());
    assert.equal(ARABIC.test(page.ui.toasts().map((t) => t.text).join(' ')), false);
  } finally {
    setLocale('ar');
  }
});

test('relocalize: تُبنى الجلسة بلغتها الجديدة، ويؤجَّل ما دام تأكيد رفع مفتوحًا حتى يُغلق', async () => {
  const page = H.mountPage({ state: H.makeState({ arabic: H.arabic() }) });
  const host = page.ui.groupHost();
  assert.equal(groupRoot(page).querySelector('.group').getAttribute('lang'), 'ar');
  H.click(page.ui.btn('upload'));
  H.click(page.ui.item('رفع ترجمة'));
  H.chooseFiles(page.ui, [{ name: 'again.ar.srt' }]);
  await settleN();
  assert.equal(page.ui.menuLabel(), 'رفع ترجمة', 'التأكيد مفتوح');
  setLocale('en');
  try {
    page.handle.relocalize();
    page.env.win.advance(HEALTH_MS * 2);
    assert.ok(page.ui.groupHost() === host, 'لم تُهدم الجلسة والتأكيد مفتوح');
    assert.equal(page.ui.menuLabel(), 'رفع ترجمة');
    H.click(page.ui.item('إلغاء'));
    await settleN(2);
    page.env.win.advance(HEALTH_MS * 2);
    assert.ok(page.ui.groupHost() !== host, 'أُعيد بناؤها بعد انتهاء التدفق');
    assert.equal(groupRoot(page).querySelector('.group').getAttribute('lang'), 'en');
    assert.equal(page.handle.diagnostics().attempts, 2);
    H.click(page.ui.btn('upload'));
    assert.equal(page.ui.menuLabel(), 'Translation');
  } finally {
    setLocale('ar');
  }
});
