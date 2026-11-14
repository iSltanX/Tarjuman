// الفكرة ١١ (ح-49) في حوار «رفع ترجمة» بالمحفوظات: ملف صدّره ترجمان «مع الأصل» يُعرض بتحذير IM_BILINGUAL وزر «أزل سطر الأصل من كل
// مقطع». لا يُزال شيء بلا نقرة (الحفظ مباشرة يحفظ الملف كما هو)، والنقرة تعيد بناء الحوار بالملف بعد الإزالة وتنقل التركيز إلى
// سطر ما أُزيل، و«حفظ» بعدها يحفظ الترجمة وحدها بملاحظتها. وبلا أصل محفوظ لا تحذير.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubtitleExport } from '../../../../src/core/export/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues, videoRecord } from '../../../helpers/fixtures.js';
import { buttonNamed, newDocument, settle, textOf } from './fake-dom.js';

const ID = 'AAAAAAAAAAA';
const CUES = makeCues(6);
const ENGLISH = CUES.map((c) => ({ ...c, text: `line ${c.n}` }));
const AR = CUES.map((c) => ({ ...c, text: `ترجمة ${c.n}` }));
const DUAL = buildSubtitleExport({ videoId: ID, cues: AR, lang: 'ar', format: 'srt', bilingual: true, original: ENGLISH, sourceLang: 'en' });
const WARN = 'يبدو الملف مصدَّرًا مع الأصل';

async function mount(onConfirm, { english = true, file = { text: DUAL.text, name: DUAL.name } } = {}) {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  const r = { ...videoRecord({ videoId: ID, cues: CUES, arabic: false }), title: 'محاضرة' };
  await store.updateVideo(ID, () => (english ? r : { ...r, english: [], fingerprints: [] }));
  await store.getSettings();
  await area.flush();
  const doc = newDocument();
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 60000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => [new File([file.text], file.name)], diagnosticsText: async () => '{}', confirm: async (o) => onConfirm(o, doc),
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  buttonNamed(lib.root, 'رفع ترجمة').click();
  await settle(20);
  return { store, root: lib.root, doc };
}

test('ح-49: التحذير وزره في حوار الرفع، والنقرة تزيل سطر الأصل في الحوار نفسه وتنقل التركيز إلى سطر ما أُزيل، و«حفظ» يحفظ الترجمة وحدها', async () => {
  let seen = null;
  const m = await mount((o, doc) => {
    doc.body.append(o.content); // الحوار في الصفحة كما يضعه confirmDialog
    const warn = o.content.querySelectorAll('.tj-alert--warning').find((a) => textOf(a).includes(WARN));
    const btn = buttonNamed(o.content, 'أزل سطر الأصل من كل مقطع');
    seen = { warn: textOf(warn), btn: !!btn, role: warn?.getAttribute('role') };
    btn.click();
    const note = o.content.querySelector('.lib-up__stripped');
    Object.assign(seen, { note: textOf(note), focused: doc.activeElement === note, gone: !textOf(o.content).includes(WARN), btnGone: !o.content.querySelectorAll('button').some((b) => textOf(b) === 'أزل سطر الأصل من كل مقطع') });
    return true;
  });
  assert.equal(seen.warn, 'يبدو الملف مصدَّرًا مع الأصل: آخر سطر في 6 مقاطع (من 6) هو نص الأصل نفسه. إن حُفظ هكذا صار الأصل جزءًا من نص الترجمة.أزل سطر الأصل من كل مقطع');
  assert.equal(seen.role, 'alert');
  assert.deepEqual({ note: seen.note, focused: seen.focused, gone: seen.gone, btnGone: seen.btnGone }, { note: 'أُزيل بطلبك سطر الأصل (آخر سطر) من 6 مقاطع.', focused: true, gone: true, btnGone: true });
  const track = (await m.store.getBundle(ID)).slots[0].track;
  assert.deepEqual(track.original.map((c) => c.text), AR.map((c) => c.text), 'الترجمة وحدها');
  assert.ok(track.notes.includes('أُزيل بطلبك سطر الأصل (آخر سطر) من 6 مقاطع.'), 'والملاحظة محفوظة معها');
});

test('تحقق 2.3.0 (ص-٢٣): الثنائي المعكوس في حوار الرفع: التحذير يقول «أول سطر»، والنقرة تحذفه، و«حفظ» يحفظ الترجمة وحدها بملاحظتها', async () => {
  // الملف نفسه معكوسًا: سطر الأصل أول كل مقطع والترجمة تحته.
  const reversed = DUAL.text.split('\n\n').map((b) => {
    const l = b.split('\n');
    return [l[0], l[1], l[3], l[2], ...l.slice(4)].join('\n');
  }).join('\n\n');
  let seen = null;
  const m = await mount((o, doc) => {
    doc.body.append(o.content);
    seen = { warn: textOf(o.content.querySelectorAll('.tj-alert--warning').find((a) => textOf(a).includes(WARN))) };
    buttonNamed(o.content, 'أزل سطر الأصل من كل مقطع').click();
    seen.note = textOf(o.content.querySelector('.lib-up__stripped'));
    return true;
  }, { file: { text: reversed, name: DUAL.name } });
  assert.ok(seen.warn.startsWith('يبدو الملف مصدَّرًا مع الأصل: أول سطر في 6 مقاطع (من 6) هو نص الأصل نفسه.'), seen.warn);
  assert.equal(seen.note, 'أُزيل بطلبك سطر الأصل (أول سطر) من 6 مقاطع.');
  const track = (await m.store.getBundle(ID)).slots[0].track;
  assert.deepEqual(track.original.map((c) => c.text), AR.map((c) => c.text), 'الترجمة وحدها');
  assert.ok(track.notes.includes('أُزيل بطلبك سطر الأصل (أول سطر) من 6 مقاطع.'), 'والملاحظة محفوظة معها');
});

test('ح-49: لا يُزال شيء بلا نقرة: «حفظ» مباشرة يحفظ الملف كما هو، ولا يُرفض', async () => {
  const m = await mount(() => true);
  const track = (await m.store.getBundle(ID)).slots[0].track;
  assert.equal(track.original[0].text, 'ترجمة 1\nline 1');
});

test('ح-49: بلا أصل محفوظ لا تحذير ولا زر', async () => {
  let text = '';
  await mount((o) => {
    text = textOf(o.content);
    return false;
  }, { english: false });
  assert.ok(text.length > 0);
  assert.ok(!text.includes(WARN) && !text.includes('أزل سطر الأصل'));
});
