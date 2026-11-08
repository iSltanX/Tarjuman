// المحفوظات بالإنجليزية: العرض الأساسي والتوسيع وقائمة «المزيد» ونصوص النموذج بلا حرف عربي (ما عدا عناوين المستخدم)، واتجاه اللغة،
// والأزمنة النسبية بقواعد الجمع، ورجوع اللغة إلى العربية يعيد النصوص نفسها.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { getDir, setLocale } from '../../../../src/i18n/index.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import {
  FILTERS, SORTS, comparisonSummary, deleteSummary, exportOptions, relativeTime, rowModel, rowStatus, slotsPhrase,
} from '../../../../src/pages/library/model.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { sampleBundle } from '../../../helpers/fixtures-v2.js';
import { newDocument, settle, textOf } from './fake-dom.js';

const ARABIC = /[؀-ۿ]/;
const hasArabic = (s) => ARABIC.test(String(s));
after(() => setLocale('ar'));

function allText(root) {
  const parts = [];
  for (const el of [root, ...root.descendants()]) {
    parts.push(el.textContent, el.value ?? '', el.title ?? '');
    for (const v of el._attrs.values()) parts.push(v);
  }
  return parts.join('\n');
}

async function mount() {
  let clock = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (clock += 1000) });
  for (const [i, id] of ['AAAAAAAAAAA', 'BBBBBBBBBBB'].entries()) {
    await store.updateVideo(id, () => ({ ...videoRecord({ videoId: id, offset: 0, arabic: i === 0 }), title: `Video ${i + 1}` }));
    if (i === 0) await store.getSettings();
  }
  await area.flush();
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 3 * 3600 * 1000 + 60000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }),
    clipboardWrite: async () => {}, pickFiles: async () => null, diagnosticsText: async () => '{}',
    setTimer: () => 1, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  return { lib, doc, root: lib.root };
}

test('الإنجليزية: الصفحة والتوسيع وقائمة المزيد بلا حرف عربي، والاتجاه LTR', async () => {
  setLocale('en');
  assert.equal(getDir(), 'ltr');
  const m = await mount();
  const text = allText(m.root);
  assert.equal(hasArabic(text), false, `ظهر حرف عربي: ${text.split('\n').find(hasArabic)}`);
  assert.equal(textOf(m.root.querySelector('.lib-count')), '2 videos · 1 translation');
  assert.match(textOf(m.root.querySelector('.lib-caption')), /Show translations/);
  const search = m.root.querySelector('.lib-search__input');
  assert.equal(search.getAttribute('data-tj-keep'), 'library.search');
  assert.equal(search.getAttribute('placeholder'), 'Search by title or ID');
  m.root.querySelector('.lib-toggle').click();
  await settle(4);
  const more = m.root.querySelector('.lib-more .tj-menu__button, .tj-menu__button');
  more.click();
  const after = allText(m.root);
  assert.equal(hasArabic(after), false, `بعد التوسيع والقائمة: ${after.split('\n').find(hasArabic)}`);
  assert.match(after, /Export SRT/);
  assert.match(after, /Delete video data/);
});

test('الإنجليزية: النموذج (التصفية والترتيب والحالة والأزمنة والجمع والتصدير والحذف والمقارنة)', () => {
  setLocale('en');
  assert.deepEqual(FILTERS.map((f) => f.label), ['All', 'Awaiting translation', 'Translated', 'Edited', 'Differs from original', 'Needs review']);
  assert.deepEqual(SORTS.map((s) => s.label), ['Last edited', 'Title']);
  const now = Date.parse(NOW);
  const ago = (ms) => relativeTime(new Date(now - ms).toISOString(), now);
  assert.equal(ago(10 * 1000), 'Just now');
  assert.equal(ago(60 * 1000), '1 minute ago');
  assert.equal(ago(3 * 3600 * 1000), '3 hours ago');
  assert.equal(ago(30 * 3600 * 1000), 'Yesterday');
  assert.equal(ago(3 * 86400 * 1000), '3 days ago');
  assert.equal(ago(14 * 86400 * 1000), '2 weeks ago');
  assert.equal(ago(400 * 86400 * 1000), '1 year ago');
  assert.equal(slotsPhrase([1]), 'Translation 1');
  assert.equal(slotsPhrase([1, 3]), 'Translations 1 and 3');
  assert.equal(slotsPhrase([1, 2, 3]), 'Translations 1, 2 and 3');

  const entry = { videoId: 'AAAAAAAAAAA', title: null, updatedAt: NOW, rev: 1, english: [], arabic: null, view: { displayOffsetMs: 0 } };
  const row = rowModel(entry, now);
  assert.equal(row.displayTitle, 'No saved title');
  assert.equal(row.sourceText, 'Original not captured');
  assert.match(row.whenText, /^Edited /);
  assert.equal(rowStatus(entry).text, 'Awaiting translation');
  assert.equal(hasArabic(JSON.stringify(exportOptions(entry))), false);

  const b0 = sampleBundle();
  const b = { ...b0, slots: b0.slots.map((s) => ({ ...s, name: s.name ? 'Review' : s.name, track: s.track && { ...s.track, fileName: 'a.srt' } })) }; // أسماء الخانات والملفات بيانات المستخدم
  const sum = deleteSummary(b, { scope: 'all' });
  assert.equal(hasArabic([...sum.items, ...sum.keeps].join('\n')), false, [...sum.items].join('\n'));
  const slot = deleteSummary(b, { scope: 'slot', n: b.active ?? 1 });
  assert.equal(hasArabic([...slot.items, ...slot.keeps].join('\n')), false, [...slot.items, ...slot.keeps].join('\n'));

  const report = { fingerprintId: 'f', matched: false, countSource: 5, countTarget: 4, missing: [5], extra: [], drift: [2, 3, 4], empty: [], noArabic: [], renumbered: false, numbering: 'same' };
  const lines = comparisonSummary(report).lines;
  assert.equal(hasArabic(lines.join('\n')), false);
  assert.deepEqual(lines, ['Segment count: 4 of 5', '1 segment missing: 5', 'Timing differs in 3 segments']);
  assert.deepEqual(comparisonSummary({ ...report, matched: true, missing: [], drift: [], countSource: 4 }).lines, ['Matches the original']);
});

test('رجوع اللغة إلى العربية يعيد النصوص العربية نفسها', () => {
  setLocale('ar');
  assert.equal(getDir(), 'rtl');
  assert.deepEqual(FILTERS.map((f) => f.label), ['الكل', 'بانتظار الترجمة', 'مترجمة', 'معدّلة', 'فيها فروق عن الأصل', 'تحتاج مراجعة']);
  assert.equal(slotsPhrase([1, 3]), 'الترجمتان 1 و3');
  const now = Date.parse(NOW);
  assert.equal(relativeTime(new Date(now - 3 * 3600 * 1000).toISOString(), now), 'قبل 3 ساعات');
  void makeCues;
});
