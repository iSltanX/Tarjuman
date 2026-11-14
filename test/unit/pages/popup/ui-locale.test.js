// نافذة الإضافة بـsetLocale('en'): كل تدفقات status.js (بحسب الحالة) وبناة view.js وصف «زر النص المتزامن مخفي» بالإنجليزية بلا حرف عربي
// خارج بيانات المستخدم (عنوان الفيديو) وأسماء اللغات المعزولة، والاتجاه ltr، والنصوص قصيرة تناسب نافذة 340 بكسلًا.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDir, setLocale } from '../../../../src/i18n/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { bindEntryRow } from '../../../../src/pages/popup/entry.js';
import {
  PAIR_TEXT, describeStatus, editorGate, guideSteps, machineNote, missText, pageReport, pairState, quickActions, recentLine, toolsStatus,
} from '../../../../src/pages/popup/status.js';
import { guideList, notVideoNote, skeletonCard, statusCard } from '../../../../src/pages/popup/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const ARABIC = /[؀-ۿ]/;
const reply = (over = {}) => ({
  v: 1, ok: true, watch: true, videoId: 'iG9CE55wbtY', title: 'How the Printing Press Changed Everything', loading: false,
  english: { captured: [], saved: [] }, arabic: null, view: { displayOffsetMs: 0, displayMode: 'ar' },
  mounted: { overlay: 'mounted', controls: 'mounted' }, ...over,
});
const withArabic = (over = {}) => reply({ arabic: { fileName: 'x.ar.srt', cueCount: 412, edited: true, matched: false, lang: 'ar' }, view: { displayOffsetMs: 500, displayMode: 'dual' }, ...over });
const captured = { captured: [{ key: 'ja|asr', kind: 'asr', cueCount: 212, ok: true }], saved: [] };
const inEnglish = async (fn) => {
  setLocale('en');
  try {
    return await fn();
  } finally {
    setLocale('ar');
  }
};
const noArabic = (label, ...texts) => assert.equal(texts.join('\n').match(ARABIC), null, `${label}: ${texts.join(' | ')}`);

test('الاتجاه ltr بالإنجليزية، والعنوان والنصوص الأساسية إنجليزية', async () => {
  await inEnglish(() => {
    assert.equal(getDir(), 'ltr');
    assert.equal(PAIR_TEXT.title, 'Translation instructions');
    assert.equal(PAIR_TEXT.copy, 'Copy instructions');
    noArabic('PAIR_TEXT', ...Object.values({ ...PAIR_TEXT }));
  });
  assert.equal(getDir(), 'rtl');
});

test('بطاقة الفيديو: الحالات الأربع بالإنجليزية، واللغات بأسمائها الإنجليزية', async () => {
  await inEnglish(() => {
    const doc = newDocument();
    const loading = describeStatus(reply({ loading: true }));
    assert.equal(loading.kind, 'loading');
    const none = describeStatus(reply());
    assert.equal(none.englishLine, 'The video’s subtitles haven’t been captured yet');
    const cap = describeStatus(reply({ english: captured }));
    assert.equal(cap.englishLine, 'Japanese · auto-generated · 212\u00A0segments · captured');
    const via = describeStatus(reply({ english: { captured: [{ key: 'en|asr|via=ja', kind: 'asr', cueCount: 3, ok: true }], saved: [] } }));
    noArabic('via', via.englishLine);
    const has = describeStatus(withArabic());
    assert.ok(/^Arabic translation · 412 segments · Offset .+ s$/.test(has.line), has.line);
    assert.equal(has.mode, 'Translation over original', 'بلا أصل ملتقط: «original»');
    const dualJa = describeStatus(withArabic({ english: captured }));
    assert.equal(dualJa.mode, 'Translation over Japanese');
    assert.equal(describeStatus(withArabic({ view: { displayOffsetMs: 0, displayMode: 'off' } })).mode, 'Translation hidden');
    assert.equal(describeStatus(withArabic({ view: { displayOffsetMs: 0, displayMode: 'ar' } })).mode, 'Translation only');
    assert.equal(describeStatus(withArabic({ arabic: { fileName: 'x', cueCount: 1, edited: false, matched: true, lang: null } })).line.split(' · ')[0], 'Translation in an unspecified language');
    for (const s of [none, cap, has, dualJa]) {
      const card = statusCard(s, toolsStatus(reply()), null, doc);
      noArabic(s.kind, textOf(card).replace(s.title, ''));
    }
    const pills = textOf(statusCard(has, null, null, doc));
    assert.ok(pills.includes('Saved') && pills.includes('Edited') && pills.includes('Differs from original'), pills);
  });
});

test('حالة الأدوات وتعطلها وسطر الالتقاط والملاحظات', async () => {
  await inEnglish(() => {
    assert.equal(toolsStatus(reply()).text, 'Player tools are working');
    assert.equal(toolsStatus(reply({ mounted: { overlay: 'mounted', controls: 'pending' } })).text, 'Waiting for the player');
    const bad = toolsStatus(reply({ mounted: { overlay: 'mounted', controls: 'error' } }));
    assert.deepEqual([bad.text, bad.reason], ['Couldn’t start Tarjuman’s tools in the player', 'Reload the video page and try again.']);
    assert.equal(toolsStatus(reply({ mounted: { overlay: 'error', controls: 'mounted' } })).text, 'Couldn’t show the translation over the video');
    assert.equal(missText(null), 'Open a YouTube video to start.');
    noArabic('missText', missText('stale'), missText('unknown'));
    const doc = newDocument();
    assert.equal(textOf(notVideoNote(doc)), 'Open a YouTube video to start.');
    assert.equal(skeletonCard(doc).getAttribute('aria-label'), 'Reading the video’s status');
  });
});

test('خطوات «بلا ترجمة» بالزوج وبلا زوج، وحالاتها لقارئ الشاشة', async () => {
  await inEnglish(() => {
    const doc = newDocument();
    assert.deepEqual(guideSteps(reply()).map((s) => s.text), [
      'Download the original with the download button in the bar',
      'Copy the instructions and send them with the file to an AI model to translate it',
      'Upload the translated file with “Upload translation (SRT)” in the player bar',
    ]);
    const steps = guideSteps(reply({ english: captured }), { from: 'ja', to: 'fr' }, true);
    assert.equal(steps[0].text, 'Download the original (Japanese) with the download button in the bar');
    assert.equal(steps[1].text, 'Copy the instructions and send them with the file to an AI model to translate into French');
    const list = guideList(steps, doc);
    assert.equal(list.getAttribute('aria-label'), 'Translation steps');
    noArabic('steps', textOf(list));
    assert.ok(textOf(list).includes('Done') && textOf(list).includes('Current step') && textOf(list).includes('Later'));
  });
});

test('كتلة التعليمات: كل سبب تعطيل وسطر المصدر والشرح بالإنجليزية', async () => {
  await inEnglish(() => {
    const r = reply({ source: { lang: 'ja', key: 'ja|asr', via: null }, english: captured });
    const reasons = [
      pairState({ reply: null, pair: { from: 'ja', to: 'en' } }).reason,
      pairState({ reply: reply({ loading: true }), pair: { from: 'ja', to: 'en' } }).reason,
      pairState({ reply: r, pair: { from: null, to: null } }).reason,
      pairState({ reply: r, pair: { from: null, to: 'en' } }).reason,
      pairState({ reply: r, pair: { from: 'ja', to: null } }).reason,
      pairState({ reply: r, pair: { from: 'ja', to: 'ja' } }).reason,
    ];
    noArabic('reasons', ...reasons);
    assert.equal(reasons[0], 'Copying is available on a YouTube video page.');
    const ready = pairState({ reply: r, pair: { from: 'ja', to: 'en' } });
    assert.equal(ready.ready, true);
    assert.equal(ready.sourceNote, 'Original language detected from the video’s subtitles.');
    assert.equal(ready.caption, 'Holds your model to segment numbers, timing and SRT.');
    assert.equal(ready.done, 'Paste them with the original file into your model’s chat.');
    assert.equal(machineNote('ja', 'en'), 'Original: Japanese, auto-translated by YouTube from English.');
  });
});

test('المحرّر والإجراءات السريعة وسطر آخر الترجمات', async () => {
  await inEnglish(() => {
    assert.equal(editorGate(null).reason, 'Open a YouTube video first');
    assert.equal(editorGate(reply({ loading: true })).reason, 'Reading the video’s subtitles…');
    assert.equal(editorGate(reply()).reason, 'No translation for this video yet');
    assert.deepEqual(quickActions(withArabic()).map((a) => a.label), ['Edit translation']);
    assert.equal(quickActions(reply({ loading: true }))[0].disabledReason, 'Reading the video’s subtitles…');
    const now = Date.parse(NOW);
    const line = recentLine({ updatedAt: new Date(now - 7_200_000).toISOString(), arabic: null }, now, { from: 'en', to: 'ar' });
    noArabic('recentLine', line);
    assert.ok(line.endsWith('Awaiting translation'), line);
  });
});

test('«زر النص المتزامن مخفي» بالإنجليزية: الصف والزر والنتيجة', async () => {
  await inEnglish(async () => {
    const doc = newDocument();
    const area = createMemoryArea({ unlimited: true });
    const store = createStore({ area });
    await store.setPrefs({ ui: { panelEntry: false } });
    const host = doc.createElement('div');
    const entry = bindEntryRow({ store, host, doc });
    await entry.ready;
    const row = host.querySelector('.tj-popup__entry');
    assert.equal(textOf(row.querySelector('.tj-popup__entry-text')), 'Synced transcript button is hidden');
    assert.equal(row.getAttribute('aria-label'), 'Synced transcript button');
    const show = buttonNamed(row, 'Show');
    assert.ok(show);
    noArabic('entry', textOf(row), show.title ?? '');
    show.click();
    await settle();
    assert.equal(textOf(host.querySelector('[role="status"]')), 'The synced transcript button now appears on video pages.');
    noArabic('done', textOf(host));
  });
});

test('تقرير تشخيص الصفحة المنسوخ: القيم التقنية والرموز كما هي بالإنجليزية، ولا معرّف فيديو (علامة الاستبعاد من src/core/diagnostics)', async () => {
  const sections = { player: { lastVideoId: 'iG9CE55wbtY', state: 'PL_OK' } };
  await inEnglish(() => {
    const en = pageReport({ reply: reply(), sections, version: '2.0.0', browser: 'Firefox 159', at: NOW });
    const json = JSON.parse(en);
    assert.equal(json.tarjuman, '2.0.0');
    assert.equal(json.browser, 'Firefox 159');
    assert.equal(json.sections.page.player.state, 'PL_OK', 'الرموز التقنية تبقى');
    assert.equal(en.includes('iG9CE55wbtY'), false, 'لا معرّف فيديو');
  });
});

test('اللغات المعزولة: أسماء لغات الأصل بالإنجليزية في العرض الإنجليزي، والرمز المجهول يبقى رمزه', async () => {
  await inEnglish(() => {
    const unknown = describeStatus(withArabic({ arabic: { fileName: 'x', cueCount: 2, edited: false, matched: true, lang: 'zz-ZZ' } }));
    assert.equal(unknown.line.startsWith('zz-ZZ translation') || unknown.line.startsWith('zz-ZZ'), true, unknown.line);
  });
});
