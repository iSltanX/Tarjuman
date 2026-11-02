// انحدارات المحرّر مركّبًا كاملًا فوق التخزين الحقيقي بمحاكاة chrome.storage (تدقيق 5fedcb9): تسلسلات الحفظ والتبديل
// والتغيّر الخارجي التي تفقد عملًا غير محفوظ. الـDOM وهمي (test/helpers/editor-dom.js)، والمؤقتات لا تمضي إلا بـflush.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';

async function mounted({ wrap = (s) => s } = {}) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const initial = sampleBundle();
  await seedBundle(store, initial);
  const env = editorDocument({ videoId: initial.videoId });
  const editor = await mountEditor(env.root, { videoId: initial.videoId, store: wrap(store), doc: env.doc, now });
  assert.ok(editor, 'رُكّب المحرّر');
  await env.flush();
  return { area, store, editor, env, videoId: initial.videoId };
}

/** مخزن يؤخّر كتابة الحزمة حتى release (حفظ بطيء الرد). */
function slowWrites(store) {
  const gate = { paused: false, release: null };
  const wrapped = {
    ...store,
    updateBundle: async (...args) => {
      if (gate.paused) await new Promise((r) => { gate.release = r; });
      return store.updateBundle(...args);
    },
  };
  return { gate, wrapped };
}

test('CX-002: حفظ الخانة الأولى البطيء ثم التبديل إلى الثانية والكتابة فيها: اكتمال الحفظ لا يعيد فتح الأولى ولا يُسقط مسودة الثانية', async () => {
  let gate;
  const { editor, env, store, videoId } = await mounted({ wrap: (s) => { const w = slowWrites(s); gate = w.gate; return w.wrapped; } });
  editor.state.session.setText(0, 'تعديل الخانة الأولى');
  gate.paused = true;
  const saving = editor.save();
  await settle();
  assert.equal(editor.state.saving, true);
  const switching = editor.switchSlot(2);
  await settle();
  // إن ظهر حوار «التبديل دون حفظ» فاختيار المستخدم التبديل؛ والسلوك الصحيح ألا يُسأل عن تغييرات يجري حفظها.
  env.doc.querySelector('dialog[open]')?.close('switch');
  gate.paused = false;
  gate.release?.();
  await switching;
  await saving;
  await env.flush();
  assert.equal(editor.state.slot, 2, 'التبديل تم');
  editor.state.session.setText(0, 'مسودة جديدة في الخانة الثانية');
  const draft = editor.state.session;
  await env.flush();
  assert.equal(editor.state.slot, 2, 'ما زالت الخانة الثانية مفتوحة');
  assert.equal(editor.state.session, draft, 'جلسة الثانية نفسها');
  assert.equal(editor.state.session.dirty, true, 'مسودة الثانية غير محفوظة وباقية');
  assert.equal(editor.state.session.cueAt(0).text, 'مسودة جديدة في الخانة الثانية');
  const saved = await store.getBundle(videoId);
  assert.equal(saved.slots[0].track.current[0].text, 'تعديل الخانة الأولى', 'حُفظت الأولى');
});

test('CX-002: التبديل أثناء حفظ جارٍ ينتظره: لا حوار عن تغييرات يجري حفظها، ولا فتح لخانة أخرى قبل وصول الرد', async () => {
  let gate;
  const { editor, env, store, videoId } = await mounted({ wrap: (s) => { const w = slowWrites(s); gate = w.gate; return w.wrapped; } });
  editor.state.session.setText(0, 'تعديل الخانة الأولى');
  gate.paused = true;
  const saving = editor.save();
  await settle();
  const switching = editor.switchSlot(2);
  await settle();
  assert.equal(env.doc.querySelector('dialog[open]'), null, 'لا حوار «التبديل دون حفظ» والحفظ جارٍ');
  assert.equal(editor.state.slot, 1, 'لم يُبدَّل قبل الرد');
  gate.paused = false;
  gate.release?.();
  await Promise.all([saving, switching]);
  await env.flush();
  assert.deepEqual([editor.state.slot, editor.state.session.dirty], [2, false]);
  assert.equal((await store.getBundle(videoId)).slots[0].track.current[0].text, 'تعديل الخانة الأولى');
});

test('GM-007: زمن مكتوب في حقل لم يُغادَر يُعتمد قبل ⌘S، فلا يضيع ولا يعود الحقل إلى القديم', async () => {
  const { editor, env, store, videoId } = await mounted();
  const input = env.root.querySelector('.ed-row[data-index="1"] [data-field="start"]');
  assert.ok(input, 'حقل بداية المقطع الثاني معروض');
  input.focus();
  input.value = '00:00:03,250';
  env.fireDoc({ type: 'keydown', code: 'KeyS', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, target: input });
  await settle();
  await env.flush();
  const saved = await store.getBundle(videoId);
  assert.equal(saved.slots[0].track.current[1].startMs, 3250, 'الزمن المكتوب حُفظ');
  assert.equal(input.value, '00:00:03,250', 'الحقل يبقى على ما كُتب');
});

test('GM-007: تغيّر خارجي لا يمس محتوى الخانة (علامة من المشغّل) لا يطمس زمنًا يُكتب في الحقل المركّز', async () => {
  const { editor, env, store, videoId } = await mounted();
  const input = env.root.querySelector('.ed-row[data-index="1"] [data-field="end"]');
  input.focus();
  input.value = '00:00:09,999';
  // علامة من سياق آخر على مقطع آخر: الحزمة تتغير دون محتوى الخانة.
  await store.updateBundle(videoId, (b) => {
    b.slots[0].marks = [];
    return b;
  });
  await env.flush(5);
  assert.equal(input.value, '00:00:09,999', 'ما يُكتب في الحقل المركّز باقٍ');
  assert.equal(editor.state.external, null, 'لا تعارض');
});

test('GM-014.2: ± من المشغّل على الخانة نفسها والمحرّر لم يغيّر إزاحتها: تُتبنّى بلا لافتة تعارض، ويبقى التراجع والحفظ', async () => {
  const { editor, env, store, videoId } = await mounted();
  editor.state.session.setText(0, 'نص عدّلته في المحرّر');
  await env.flush();
  const before = editor.state.session.offsetMs;
  // كما يكتب المشغّل ± على النشطة: إزاحة العرض في السجل.
  await store.updateVideo(videoId, (r) => ({ ...r, view: { ...r.view, displayOffsetMs: r.view.displayOffsetMs + 500 } }));
  await env.flush(5);
  assert.equal(editor.state.external, null, 'لا لافتة «تغيّر من مكان آخر»');
  assert.equal(editor.state.session.offsetMs, before + 500, 'الإزاحة الجديدة متبنّاة');
  assert.equal(editor.state.session.canUndo, true, 'تاريخ التراجع باقٍ');
  assert.equal(editor.state.session.cueAt(0).text, 'نص عدّلته في المحرّر');
  await editor.save();
  const saved = (await store.getBundle(videoId)).slots[0];
  assert.deepEqual([saved.track.current[0].text, saved.offsetMs], ['نص عدّلته في المحرّر', before + 500]);
});

test('GM-014.2: إزاحة غيّرها المحرّر نفسه ثم غيّرها المشغّل: يبقى تعارضًا صريحًا (لا يُختار طرف بصمت)', async () => {
  const { editor, env, store, videoId } = await mounted();
  assert.equal(editor.state.session.commitOffset().ok, true, 'تثبيت الإزاحة يغيّرها في المحرّر');
  await env.flush();
  // كما يكتب المشغّل ± على النشطة: إزاحة العرض في السجل.
  await store.updateVideo(videoId, (r) => ({ ...r, view: { ...r.view, displayOffsetMs: r.view.displayOffsetMs + 500 } }));
  await env.flush(5);
  assert.equal(editor.state.external, 'changed');
});

test('GM-014.3: كتابة «آخر موضع» بعد سكون لا تهدم اللوحة الجانبية ولا تُسقط التركيز منها', async () => {
  const { editor, env } = await mounted();
  editor.jumpTo(4, null); // الموضع المحفوظ في العيّنة المقطع 3، فالكتابة تحدث
  // زر في قسم العلامات (يُبنى بـreplaceChildren عند كل رسم للوحة).
  const target = env.root.querySelector('section[aria-label="العلامات"] button');
  assert.ok(target, 'زر في قسم العلامات');
  target.focus();
  await env.flush(5);
  assert.equal(env.doc.activeElement, target, 'التركيز باقٍ');
  assert.equal(env.root.contains(target), true, 'العنصر نفسه ما زال في الصفحة');
  assert.equal(editor.state.info.position?.n, editor.state.session.cueAt(4).n, 'الموضع كُتب');
});

test('GM-008: تبويبا «المراجعة» و«الاستكمال» بلوحة المفاتيح: الأسهم وHome وEnd تختار وتركّز، والمختار وحده في ترتيب Tab', async () => {
  const { env } = await mounted();
  const tabs = env.root.querySelectorAll('[role="tab"]');
  assert.equal(tabs.length, 2);
  const [review, complete] = tabs;
  assert.deepEqual([review.tabIndex, complete.tabIndex], [0, -1]);
  review.focus();
  review.dispatchEvent({ type: 'keydown', key: 'ArrowLeft' });
  assert.equal(env.doc.activeElement, complete, 'الأيسر إلى التالي في RTL');
  assert.deepEqual([complete.getAttribute('aria-selected'), complete.tabIndex, review.tabIndex], ['true', 0, -1]);
  assert.equal(env.root.querySelector('#ed-pane-complete')?.hidden ?? false, false);
  complete.dispatchEvent({ type: 'keydown', key: 'Home' });
  assert.equal(env.doc.activeElement, review);
  review.dispatchEvent({ type: 'keydown', key: 'End' });
  assert.equal(env.doc.activeElement, complete);
  complete.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
  assert.equal(env.doc.activeElement, review);
});

test('GM-016.3: «→ المحفوظات» يكتب آخر موضع ثم يعود بالصف المقصود (#v=…)', async () => {
  const { editor, env, store, videoId } = await mounted();
  editor.jumpTo(4, null);
  const back = env.root.querySelectorAll('button').find((b) => b.textContent.includes('المحفوظات'));
  assert.ok(back, 'زر الرجوع');
  back.click();
  await settle();
  await env.flush();
  assert.match(env.doc.defaultView.location.assigned, /library\/index\.html#v=AAAAAAAAAAA$/);
  assert.equal((await store.getBundle(videoId)).slots[0].position?.n, editor.state.session.cueAt(4).n, 'كُتب الموضع قبل المغادرة');
});

test('GM-027.3: عتبة الانحراف من الإعدادات تسري على المقارنة الحاضرة دون إعادة فتح', async () => {
  const { editor, env, store } = await mounted();
  const before = editor.state.comparison?.driftThresholdMs;
  await store.setSettings({ thresholds: { driftMs: 750 } });
  await env.flush(5);
  assert.notEqual(before, 750);
  assert.equal(editor.state.comparison?.driftThresholdMs, 750);
});

test('GM-026.4: خطأ توقيت (زمن سالب) لا يمنع «نص دراسي» كما يقول «تصدير ▾»؛ الرابط من بداية الفيديو', async () => {
  const saved = [];
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const initial = sampleBundle();
  await seedBundle(store, initial);
  const env = editorDocument({ videoId: initial.videoId });
  const editor = await mountEditor(env.root, { videoId: initial.videoId, store, doc: env.doc, now, saveFile: async (f) => { saved.push(f); return { ok: true, mode: 'downloads', downloadId: 1 }; } });
  await env.flush();
  editor.state.session.setTime(0, 'start', -1500); // سالب حتى بعد إزاحة العرض (+0.5)
  assert.ok(editor.state.session.issues().errors > 0, 'خطأ توقيت قائم');
  const btn = env.root.querySelectorAll('button').find((b) => b.textContent.includes('تصدير'));
  btn.click();
  await env.flush();
  const study = env.doc.querySelectorAll('[role="menuitem"], button').find((b) => b.textContent.includes('نص دراسي'));
  assert.ok(study, 'بند «نص دراسي…»');
  study.click();
  await env.flush();
  const dialog = env.doc.querySelector('dialog[open]');
  assert.ok(dialog);
  assert.doesNotMatch(dialog.textContent, /لا يُصدَّر الآن/, 'لا منع بخطأ التوقيت');
  dialog.close('save');
  await env.flush();
  assert.equal(saved.length, 1, 'صُدِّر');
  assert.match(saved[0].text, /t=0s/);
});
