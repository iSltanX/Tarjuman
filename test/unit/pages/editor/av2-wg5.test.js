// التدقيق الموحد V2، المجموعة WG-5: مقارنة المحرّر تتبع لغة الخانة (U-028)، وإشعار التراجع يُمسك بالتركيز والمؤشر (U-042).
// العقد تُقارن بـassert.ok(a === b) لا assert.equal (انظر app-audit.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { withSlotLang } from '../../../../src/core/model/bundle.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';
import { buttonNamed, textOf } from '../library/fake-dom.js';

function frenchBundle(lang) {
  const b = sampleBundle();
  const t = b.slots[0].track; // مرتبطة بالبصمة fp_test000001 (مسار en)
  const cues = makeCues(5, { text: (i) => `Bonjour ${i}` });
  t.original = cues;
  t.current = cues.map((c) => ({ ...c }));
  if (lang) t.lang = lang;
  else {
    delete t.lang;
    t.fileName = 'subtitle.srt'; // بلا رمز لغة في الاسم أيضًا: لغة «غير محددة»
  }
  b.slots[0].marks = [];
  b.slots[0].position = null;
  b.record.arabic = structuredClone(t);
  return b;
}

async function open(lang) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const bundle = frenchBundle(lang);
  await seedBundle(store, bundle);
  const env = editorDocument({ videoId: bundle.videoId });
  const editor = await mountEditor(env.root, { videoId: bundle.videoId, store, doc: env.doc, now });
  await env.flush();
  return { env, editor, store, bundle, S: editor.state };
}

test('AV2 U-028: خانة فرنسية تعطي مقارنة المحرّر noArabic فارغة، وخانة بلا لغة كذلك', async () => {
  for (const lang of ['fr', undefined]) {
    const { S, env } = await open(lang);
    assert.deepEqual(S.comparison.noArabic, [], `lang=${lang}`);
    assert.ok(!textOf(env.root).includes('غير مترجم:'), `lang=${lang}`);
  }
});

test('AV2 U-028: تغيّر لغة الخانة من تبويب آخر إلى ar يحدّث المقارنة إلى [1..5]، وعودتها إلى fr تفرّغها', async () => {
  const { S, env, store, bundle } = await open('fr');
  assert.deepEqual(S.comparison.noArabic, []);
  const setLang = async (lang) => {
    const opened = await store.getBundle(bundle.videoId);
    await store.updateBundle(bundle.videoId, () => withSlotLang(opened, 1, lang, NOW), { expect: opened });
    await env.flush();
    await settle();
    await env.flush();
  };
  await setLang('ar');
  assert.deepEqual(S.comparison.noArabic, [1, 2, 3, 4, 5]);
  await setLang('fr');
  assert.deepEqual(S.comparison.noArabic, []);
});

test('AV2 U-028: «اعتماد هذا المرجع» لخانة فرنسية يخزّن noArabic=[] لا [1..5]', async () => {
  const { env, store, bundle } = await open('fr');
  const choice = env.root.querySelector('.ed-ref-choice');
  assert.ok(choice, 'قائمة المرجع');
  choice.value = 'fp_test000002';
  choice.dispatchEvent({ type: 'change' });
  await env.flush();
  buttonNamed(env.root, 'اعتماد هذا المرجع').dispatchEvent({ type: 'click' });
  await env.flush();
  await settle();
  await env.flush();
  const saved = (await store.getBundle(bundle.videoId)).slots[0].track;
  assert.equal(saved.fingerprintId, 'fp_test000002');
  assert.deepEqual(saved.comparison.noArabic, []);
});

// ———— U-042: رسالة «تراجع» في المحرّر تُمسك بالمؤشر والتركيز ————

async function markToast() {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const b = sampleBundle();
  const t = b.slots[0].track;
  const cues = makeCues(3);
  t.original = cues;
  t.current = cues.map((c) => ({ ...c }));
  t.fingerprintId = null;
  t.comparison = null;
  b.slots[0].marks = [];
  b.slots[0].position = null;
  b.record.arabic = structuredClone(t);
  await seedBundle(store, b);
  const env = editorDocument({ videoId: b.videoId });
  await mountEditor(env.root, { videoId: b.videoId, store, doc: env.doc, now });
  await env.flush();
  const markBtn = env.root.querySelector('.ed-row[data-index="1"] [data-act="mark"]');
  markBtn.focus();
  markBtn.dispatchEvent({ type: 'click', target: markBtn });
  await settle(10);
  await env.flushFrames();
  const toastEl = env.root.querySelector('.ed-toast');
  return { env, toastEl, undo: toastEl.querySelector('button'), markBtn };
}
const shown = (toastEl) => toastEl.className.includes('is-shown');

test('AV2 U-042: المؤشر على رسالة التراجع يمسكها بعد 7 ث، وتزول بعد مدتها من مغادرته', async () => {
  const { env, toastEl } = await markToast();
  assert.ok(shown(toastEl));
  toastEl.dispatchEvent({ type: 'mouseenter' });
  await env.advance(7000);
  await env.advance(7000);
  assert.ok(shown(toastEl), 'ما زالت ظاهرة والمؤشر فوقها');
  toastEl.dispatchEvent({ type: 'mouseleave' });
  await env.advance(6900);
  assert.ok(shown(toastEl), 'المدة كاملة من المغادرة');
  await env.advance(200);
  assert.ok(!shown(toastEl));
  assert.ok(toastEl.hasAttribute('inert'));
});

test('AV2 U-042: التركيز على زر التراجع يمسكها، وبعد خروجه تزول وينتقل التركيز إلى ما كان عليه لا إلى body', async () => {
  const { env, toastEl, undo, markBtn } = await markToast();
  undo.focus();
  toastEl.dispatchEvent({ type: 'focusin', target: undo, relatedTarget: markBtn });
  await env.advance(7000);
  await env.advance(7000);
  assert.ok(shown(toastEl), 'التركيز فيها');
  assert.ok(env.doc.activeElement === undo);
  toastEl.dispatchEvent({ type: 'focusout', target: undo, relatedTarget: null });
  await env.advance(7100);
  assert.ok(!shown(toastEl));
  const now = env.doc.activeElement;
  assert.ok(now !== undo && !toastEl.contains(now), 'خرج التركيز من الرسالة');
  assert.ok(now !== env.doc.body, 'لم يسقط إلى body');
});
