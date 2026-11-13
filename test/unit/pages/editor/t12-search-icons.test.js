// ت-١٢ (أ) (تحقق Fable للتصميم): زرّا «النتيجة السابقة/التالية» في بحث المحرّر كانا نصّين «↑» و«↓» بخط النظام، والهوية §٥ تقول
// «وكل أسطح الإضافة تأخذ منها». صارا زرّين أيقونيين بـchev-up وchev-down من src/ui/icons.js، والاسمان لقارئ الشاشة كما كانا.
// العقد تُقارن بـassert.ok(a === b) لا بـassert.equal (انظر fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { setLocale } from '../../../../src/i18n/index.js';
import { relabel } from '../../../../src/ui/components.js';
import { ICONS } from '../../../../src/ui/icons.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument } from '../../../helpers/editor-dom.js';
import { buttonNamed, findAll, textOf } from '../library/fake-dom.js';

test('ت-١٢ (أ): زرّا التنقّل في البحث أيقونتا الهوية بلا نص سهم، باسميهما لقارئ الشاشة، ويتبعان تبديل اللغة', async () => {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const bundle = sampleBundle();
  await seedBundle(store, bundle);
  const env = editorDocument({ videoId: bundle.videoId });
  const editor = await mountEditor(env.root, { videoId: bundle.videoId, store, doc: env.doc, now });
  assert.ok(editor, 'رُكّب المحرّر');
  await env.flush();
  for (const [name, glyph] of [['النتيجة السابقة', 'chev-up'], ['النتيجة التالية', 'chev-down']]) {
    const b = buttonNamed(env.root, name);
    assert.ok(b, name);
    assert.equal(b.getAttribute('aria-label'), name);
    assert.ok(b.classList.contains('tj-btn--icon'), `${name}: زر أيقوني`);
    assert.doesNotMatch(textOf(b), /[↑↓]/, `${name}: بلا نص سهم`);
    const paths = findAll(b, (e) => e.tagName === 'path').map((p) => p.getAttribute('d'));
    assert.deepEqual(paths, ICONS[glyph].map(([, a]) => a.d), `${name}: ${glyph}`);
  }
  setLocale('en');
  try {
    relabel(env.doc);
    assert.ok(buttonNamed(env.root, 'Previous result'), 'الاسم بالإنجليزية بعد التبديل');
    assert.ok(buttonNamed(env.root, 'Next result'));
  } finally {
    setLocale('ar');
    relabel(env.doc);
  }
});
