// ت-٨ (تحقق Fable للتصميم): الاختصار يظهر مقلوبًا في الواجهة العربية: «(F⌘)» و«(V⌘ أو Ctrl+V)» و«(Enter ⇧)». ⌘ و⇧ محايدان
// بين قوس وحرف لاتيني داخل فقرة عربية فيأخذان اتجاهها. صار: كل اختصار نصٌّ معزول LTR (LRI…PDI) يُملأ في قالب من الفهرس، فلا ⌘
// ولا ⇧ ولا Ctrl+ حرفيًا في نص عربي. العقد تُقارن بـassert.ok(a === b) لا بـassert.equal (انظر fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../../../../src/core/store/index.js';
import { catalogOf, setLocale, t } from '../../../../src/i18n/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { keyHint } from '../../../../src/pages/editor/text.js';
import { createLibrary } from '../../../../src/pages/library/view.js';
import { pasteKeys } from '../../../../src/ui/format.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, videoRecord } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument } from '../../../helpers/editor-dom.js';
import { buttonNamed, findAll, newDocument, settle } from '../library/fake-dom.js';

const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const iso = (s) => `${LRI}${s}${PDI}`;

test('ت-٨: keyHint يعيد الاختصار معزولًا LTR بالمنصتين', () => {
  for (const [args, inner] of [
    [['F', { mac: true }], '⌘F'], [['Z', { mac: true, shift: true }], '⇧⌘Z'],
    [['F', { mac: false }], 'Ctrl+F'], [['Z', { mac: false, shift: true }], 'Ctrl+Shift+Z'],
  ]) {
    const h = keyHint(...args);
    assert.ok(h.startsWith(LRI), `${inner}: يبدأ بـLRI`);
    assert.ok(h.endsWith(PDI), `${inner}: ينتهي بـPDI`);
    assert.equal(h, iso(inner));
  }
});

test('ت-٨: لا ⌘ ولا ⇧ ولا Ctrl+ حرفيًا في الفهرس العربي؛ الاختصار قالب يُملأ معزولًا', () => {
  const hits = [];
  for (const [k, v] of catalogOf('ar')) if (typeof v === 'string' && /[⌘⇧]|Ctrl\+/.test(v)) hits.push(k);
  assert.deepEqual(hits, []);
});

test('ت-٨: تلميح حقل اللصق في المحفوظات والنافذة بالاختصارين معزولين، بالعربية والإنجليزية', () => {
  const keys = pasteKeys();
  assert.equal(keys.mac, iso('⌘V'));
  assert.equal(keys.pc, iso('Ctrl+V'));
  for (const key of ['library.paste.placeholder', 'popup.paste.placeholder']) {
    assert.equal(t(key, keys), `الصق هنا (${iso('⌘V')} أو ${iso('Ctrl+V')})`, key);
  }
  setLocale('en');
  try {
    for (const key of ['library.paste.placeholder', 'popup.paste.placeholder']) assert.equal(t(key, keys), `Paste here (${iso('⌘V')} or ${iso('Ctrl+V')})`, key);
  } finally {
    setLocale('ar');
  }
  // النافذة نقطة دخول تُحمَّل مرة في العملية، فيكفي أن تمرّر الاختصارين إلى القالب.
  const popup = readFileSync(new URL('../../../../src/pages/popup/main.js', import.meta.url), 'utf8');
  assert.match(popup, /placeholder: t\('popup\.paste\.placeholder', pasteKeys\(\)\)/);
});

test('ت-٨: حقل حوار «لصق ترجمة…» في المحفوظات يحمل الاختصارين معزولين', async () => {
  const ID = 'AAAAAAAAAAA';
  let at = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (at += 1000) });
  await store.updateVideo(ID, () => ({ ...videoRecord({ videoId: ID, arabic: false }), title: 'محاضرة' }));
  await store.getSettings();
  await area.flush();
  const doc = newDocument();
  let placeholder = null;
  const lib = createLibrary({
    store, doc, now: () => Date.parse(NOW) + 60000,
    openTab: async () => {}, openPage: async () => {}, saveFile: async () => ({ ok: true }), clipboardWrite: async () => {},
    pickFiles: async () => null, diagnosticsText: async () => '{}',
    confirm: async (o) => {
      placeholder = findAll(o.content, (e) => e.tagName === 'textarea')[0]?.getAttribute('placeholder') ?? null;
      return false;
    },
    setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(lib.root);
  await lib.load();
  buttonNamed(lib.root, 'لصق ترجمة…: محاضرة').click();
  await settle(20);
  assert.equal(placeholder, `الصق هنا (${iso('⌘V')} أو ${iso('Ctrl+V')})`);
});

test('ت-٨: في المحرّر تلميحات البحث والتراجع والإعادة والحفظ والسابقة/التالية بالاختصار معزولًا', async () => {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const bundle = sampleBundle();
  await seedBundle(store, bundle);
  const env = editorDocument({ videoId: bundle.videoId });
  env.doc.defaultView.navigator = { platform: 'MacIntel' };
  const editor = await mountEditor(env.root, { videoId: bundle.videoId, store, doc: env.doc, now });
  assert.ok(editor, 'رُكّب المحرّر');
  await env.flush();
  const search = env.root.querySelector('input[type=search]');
  assert.equal(search.getAttribute('placeholder'), `بحث في المقاطع (${iso('⌘F')})`);
  editor.state.session.setText(0, 'تعديل');
  await env.flush();
  assert.ok(env.root.querySelector('.ed-undo').title.includes(iso('⌘Z')), env.root.querySelector('.ed-undo').title);
  // السابقة والتالية: التلميح بالاختصار ظاهر ما دام الزر مفعّلًا بنتائج (كان يُمحى بعد أول بحث).
  search.value = 'أولى';
  search.dispatchEvent({ type: 'input' });
  await env.advance(200);
  await env.flush();
  const prev = buttonNamed(env.root, 'النتيجة السابقة');
  const next = buttonNamed(env.root, 'النتيجة التالية');
  assert.ok(prev && next, 'زرّا التنقّل باسميهما');
  assert.equal(prev.getAttribute('aria-disabled'), null, 'مفعّل بنتائج');
  assert.equal(prev.title, `السابقة (${iso('⇧ Enter')})`);
  assert.equal(next.title, `التالية (${iso('Enter')})`);
});
