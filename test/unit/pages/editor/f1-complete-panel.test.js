// ف1 (2026-11-10): «أكمل الناقص» يفتح المحرّر على لوحة «الاستكمال» بمعامل p=complete في عنوانه، والناقصة مختارة (الاختيار
// الافتراضي). والمعامل يُتجاهل حين لا ناقص ولا غير مترجم.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { pagePath } from '../../../../src/core/model/ids.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { panelParam } from '../../../../src/pages/editor/persist.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { arabicTrack, sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument } from '../../../helpers/editor-dom.js';

const ID = 'AAAAAAAAAAA';

test('عنوان المحرّر: p=complete وحدها لوحة معروفة، وt خانة 1..3، ولا معنى لهما بلا v', () => {
  assert.equal(pagePath('editor', { v: ID, p: 'complete' }), `pages/editor/index.html?v=${ID}&p=complete`);
  assert.equal(pagePath('editor', { v: ID, t: 2, p: 'complete' }), `pages/editor/index.html?v=${ID}&t=2&p=complete`);
  assert.equal(pagePath('editor', { v: ID }), `pages/editor/index.html?v=${ID}`, 'بلا لوحة كما كان');
  assert.throws(() => pagePath('editor', { v: ID, p: 'review' }), RangeError);
  assert.throws(() => pagePath('editor', { v: ID, t: 4 }), RangeError);
  assert.equal(panelParam('?v=x&p=complete'), 'complete');
  assert.equal(panelParam('?v=x&p=other'), null);
  assert.equal(panelParam('?v=x'), null);
});

/** حزمة خانتها الثانية مقتطعة: 3 مقاطع من 5 في البصمة (4 و5 ناقصان). */
function truncatedBundle() {
  const b = sampleBundle({ videoId: ID, previous: false, active: 2 });
  const track = arabicTrack({ label: 'مقتطعة', count: 3, fingerprintId: b.record.fingerprints[1].id });
  b.slots[1] = { ...b.slots[1], track, marks: [] };
  b.record.arabic = structuredClone(track);
  return b;
}

async function open(bundle, opts) {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse('2026-11-10T12:00:00.000Z');
  const now = () => (t += 1000);
  const store = createStore({ area, now });
  await seedBundle(store, bundle);
  const env = editorDocument({ videoId: ID });
  const editor = await mountEditor(env.root, { videoId: ID, store, doc: env.doc, now, ...opts });
  await env.flush();
  const tab = (id) => env.root.querySelector(`#ed-tab-${id}`);
  return { env, editor, tab, pane: (id) => env.root.querySelector(`#ed-pane-${id}`) };
}

test('p=complete على ترجمة ناقصة: تبويب «الاستكمال» مختار، ولوحته ظاهرة، والناقصة في أرقام الملف', async () => {
  const { tab, pane, editor } = await open(truncatedBundle(), { slot: 2, panel: 'complete' });
  assert.equal(tab('complete').getAttribute('aria-selected'), 'true');
  assert.equal(pane('complete').hidden, false);
  assert.equal(pane('review').hidden, true);
  assert.deepEqual(editor.state.completeNumbers, [4, 5], 'الناقصة مختارة بالاختيار الافتراضي');
});

test('بلا p: «المراجعة» كما كانت، ولو كانت الترجمة ناقصة', async () => {
  const { tab } = await open(truncatedBundle(), { slot: 2 });
  assert.equal(tab('review').getAttribute('aria-selected'), 'true');
});

test('p=complete على ترجمة لا ناقص فيها ولا غير مترجم: يُتجاهل المعامل', async () => {
  const b = sampleBundle({ videoId: ID, previous: false, active: 2 });
  const { tab } = await open(b, { slot: 2, panel: 'complete' });
  assert.equal(tab('review').getAttribute('aria-selected'), 'true');
});

test('الفكرة ٨: لوحة «الاستكمال» تعدّ ما يُرفق لزوجها وتنسخ تعليماته بقائمة الزوج والقاموس العام برأسيهما، وتتبع تغيّر القوائم', async () => {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse('2026-11-10T12:00:00.000Z');
  const now = () => (t += 1000);
  const store = createStore({ area, now });
  await seedBundle(store, truncatedBundle());
  await store.setPrefs({ glossary: { attach: true, terms: [{ source: 'prompt', target: 'موجِّه', note: null }] } });
  await store.addGlossaryList({ from: 'en', to: 'ar' });
  await store.addListTerm({ from: 'en', to: 'ar' }, { source: 'cache', target: 'الذاكرة المؤقتة', note: null });
  await store.addGlossaryList({ from: 'ja', to: 'ar' });
  await store.addListTerm({ from: 'ja', to: 'ar' }, { source: '東京', target: 'طوكيو', note: null });
  const env = editorDocument({ videoId: ID });
  const written = [];
  env.doc.defaultView.navigator = { clipboard: { writeText: async (text) => { written.push(text); } } };
  await mountEditor(env.root, { videoId: ID, store, doc: env.doc, now, slot: 2, panel: 'complete' });
  await env.flush();
  const pane = env.root.querySelector('#ed-pane-complete');
  assert.ok(pane.textContent.includes('+ القاموس (2) في التعليمات.'), 'قائمة الزوج والعام، لا قائمة ja ← ar');
  const copy = [...pane.querySelectorAll('button')].find((b) => b.textContent.includes('نسخ تعليمات الاستكمال'));
  copy.click();
  await env.flush();
  assert.equal(written.length, 1);
  assert.ok(written[0].includes('المقابلات (المصطلح بالإنجليزية = المقابل المفضّل بالعربية):\n- cache = الذاكرة المؤقتة\n\nالمقابلات (المصطلح كما يرد في الملف = المقابل المفضّل في الترجمة):\n- prompt = موجِّه\n'));
  assert.equal(written[0].includes('東京'), false);
  await store.addListTerm({ from: 'en', to: 'ar' }, { source: 'build', target: 'بناء', note: null });
  await area.flush();
  await env.flush();
  assert.ok(env.root.querySelector('#ed-pane-complete').textContent.includes('+ القاموس (3) في التعليمات.'));
});
