// تدقيق Fable (FA-14 = UX-05، بقرار سلطان 2026-11-07 «التركيز يتبع الترتيب المرئي»؛ كان قرارًا معلّقًا في identity-redesign §٦.١):
// تحت 900 بكسل كانت اللوحة الجانبية المطوية فوق القائمة بـorder:-1 بصريًا، وبعدها في الشجرة فيصلها Tab وقارئ الشاشة آخرًا.
// صارت تُنقل قبل القائمة في الشجرة نفسها تحت 900 وتعود بعدها فوقه، ويبقى التركيز في عنصره، ولا order في الأنماط.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../../../../src/core/store/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument } from '../../../helpers/editor-dom.js';

/** استعلام وسائط وهمي يُبدَّل في الاختبار ويبلّغ مستمعيه. */
function fakeQuery(matches) {
  const listeners = [];
  return {
    get matches() { return matches; },
    set(v) { matches = v; for (const fn of listeners) fn({ matches }); },
    addEventListener: (type, fn) => { if (type === 'change') listeners.push(fn); },
  };
}

async function mounted({ narrow }) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const store = createStore({ area, now: () => (at += 1000) });
  const initial = sampleBundle();
  await seedBundle(store, initial);
  const env = editorDocument({ videoId: initial.videoId });
  const query = fakeQuery(narrow);
  env.doc.defaultView.matchMedia = (q) => { assert.equal(q, '(max-width: 900px)'); return query; };
  await mountEditor(env.root, { videoId: initial.videoId, store, doc: env.doc, now: () => (at += 1000) });
  await env.flush();
  return { env, query };
}
const order = (env) => [...env.root.querySelector('.ed-body').children].map((c) => c.className.split(' ')[0]);

test('FA-14: تحت 900 اللوحة قبل القائمة في الشجرة (ترتيب Tab كالترتيب المرئي)، وفوقه بعدها كما كان', async () => {
  const narrow = await mounted({ narrow: true });
  assert.deepEqual(order(narrow.env), ['ed-side', 'ed-main']);
  const wide = await mounted({ narrow: false });
  assert.deepEqual(order(wide.env), ['ed-main', 'ed-side']);
});

test('FA-14: عبور 900 ينقل اللوحة وحدها ويبقي التركيز في عنصره داخلها', async () => {
  const { env, query } = await mounted({ narrow: false });
  const tab = env.root.querySelector('.ed-tabs [role="tab"]');
  tab.focus();
  assert.ok(env.doc.activeElement === tab);
  query.set(true);
  assert.deepEqual(order(env), ['ed-side', 'ed-main']);
  assert.ok(env.doc.activeElement === tab, 'التركيز باقٍ');
  query.set(false);
  assert.deepEqual(order(env), ['ed-main', 'ed-side']);
  assert.ok(env.doc.activeElement === tab);
});

test('FA-14: لا order بصري للوحة في أنماط العرض الضيق', () => {
  const css = readFileSync(new URL('../../../../src/pages/editor/editor.css', import.meta.url), 'utf8');
  const at = css.indexOf('@media (max-width: 900px)');
  const block = css.slice(at, css.indexOf('\n}', at));
  assert.doesNotMatch(block, /\.ed-side \{[^}]*order:/);
});
