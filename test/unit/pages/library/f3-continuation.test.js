// ف3 (2026-11-10) في حوار «رفع ترجمة» بالمحفوظات، وف5 «لصق ترجمة…» في آخره: ترجمة مقتطعة (4 من 8) ثم الجزء الثاني بأرقامه: الافتراضي «إكمال الترجمة 1»
// بسطر ما يضيفه، و«حفظ» يُكمل الترجمة نفسها بنسخة حالية وملاحظة. وترجمة كاملة ثانية: لا خيار إكمال، والافتراضي «جديدة».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackComparison } from '../../../../src/core/compare/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, comparison, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { buttonNamed, findAll, newDocument, settle, textOf } from './fake-dom.js';

const ID = 'AAAAAAAAAAA';
const AR = makeCues(8, { text: (i) => `سطر ${i}` });
const ts = (ms) => new Date(ms).toISOString().slice(11, 23).replace('.', ',');
const numbered = (cues, name) => new File([cues.map((c) => `${c.n}\n${ts(c.startMs)} --> ${ts(c.endMs)}\n${c.text}\n`).join('\n')], name);
const allText = (node) => textOf(node);

async function mount(file, onConfirm) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  const r = videoRecord({ videoId: ID, cues: makeCues(8) });
  const fpId = r.fingerprints[0].id;
  r.arabic = { ...r.arabic, fileName: 'part1.ar.srt', original: AR.slice(0, 4), lang: 'ar', comparison: { ...comparison({ fingerprintId: fpId, count: 4 }), matched: false, countSource: 8, missing: [5, 6, 7, 8], restoreTimingAvailable: false } };
  await store.updateVideo(ID, () => ({ ...r, title: 'محاضرة' }));
  await store.getSettings();
  await area.flush();
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 60000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => [file], diagnosticsText: async () => '{}', confirm: async (o) => onConfirm(o),
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  buttonNamed(lib.root, 'رفع ترجمة…: محاضرة').click();
  await settle(20);
  return { store, root: lib.root };
}

test('الجزء الثاني بأرقامه: «إكمال الترجمة 1» افتراضيًا بسطره، و«حفظ» يُكمل الترجمة نفسها مطابقة للأصل', async () => {
  let seen = '';
  const m = await mount(numbered(AR.slice(4), 'part2.ar.srt'), (o) => {
    seen = allText(o.content);
    assert.ok(findAll(o.content, (e) => textOf(e) === 'إكمال الترجمة 1').length > 0, 'الخيار ظاهر');
    return true;
  });
  assert.match(seen, /الملف تتمة للترجمة 1: يضيف 4 مقاطع في مواضعها\. وتكتمل الترجمة بعده\./);
  assert.match(seen, /مطابق للأصل/, 'المقارنة للترجمة بعد الإكمال');
  const b = await m.store.getBundle(ID);
  assert.equal(b.slots[1].track, null, 'لا ترجمة ثانية');
  const t1 = b.slots[0].track;
  assert.equal(t1.original.length, 4, 'الأصل المرفوع باقٍ');
  assert.deepEqual(t1.current.map((c) => c.text), AR.map((c) => c.text));
  assert.equal(trackComparison(t1, b.record.fingerprints).matched, true);
  assert.match(t1.notes.at(-1), /أُكملت بالملف «part2\.ar\.srt»: 4 مقاطع/);
  await settle(10);
  const toasts = findAll(m.root, (e) => e.classList?.contains('tj-toast')).map(textOf).join(' | ');
  assert.match(toasts, /أُكملت الترجمة 1/);
});

test('ترجمة كاملة ثانية: لا خيار إكمال، ويُحفظ «جديدة» كما كان', async () => {
  const m = await mount(numbered(AR, 'full.ar.srt'), (o) => {
    assert.equal(findAll(o.content, (e) => textOf(e) === 'إكمال الترجمة 1').length, 0);
    assert.doesNotMatch(allText(o.content), /الملف تتمة/);
    return true;
  });
  const b = await m.store.getBundle(ID);
  assert.equal(b.slots[1].track?.original.length, 8, 'ترجمة ثانية');
  assert.equal(b.slots[0].track.current, null, 'الأولى كما هي');
});

test('ف5: «لصق ترجمة…» بحقل يُلصق فيه، ثم حوار الرفع نفسه، ويُحفظ النص الملصوق ترجمةً', async () => {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await store.updateVideo(ID, () => ({ ...videoRecord({ videoId: ID, arabic: false }), title: 'محاضرة' }));
  await store.getSettings();
  await area.flush();
  const doc = newDocument();
  const text = AR.map((c) => `${c.n}\n${ts(c.startMs)} --> ${ts(c.endMs)}\n${c.text}\n`).join('\n');
  const dialogs = [];
  let picked = 0;
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 60000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => { picked++; return null; }, diagnosticsText: async () => '{}',
    confirm: async (o) => {
      dialogs.push(o.title);
      const field = findAll(o.content, (e) => e.tagName === 'textarea')[0];
      if (field) {
        field.dispatchEvent({ type: 'paste', clipboardData: { getData: (type) => (type === 'text/plain' ? text : '') }, preventDefault() {} });
      }
      return true;
    },
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  buttonNamed(lib.root, 'لصق ترجمة…: محاضرة').click();
  await settle(30);
  assert.equal(picked, 0, 'لا منتقي ملفات');
  assert.match(dialogs[0], /^لصق ترجمة: /);
  assert.equal(dialogs.length, 2, 'حوار اللصق ثم حوار الرفع');
  const b = await store.getBundle(ID);
  assert.equal(b.slots[0].track.original.length, 8);
  assert.equal(b.slots[0].track.fileName, 'نص ملصوق');
});
