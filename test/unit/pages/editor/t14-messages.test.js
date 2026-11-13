// ت-١٤ (تحقق Fable للتصميم): رسائل المحرّر العابرة وحواراته. (أ) رسالة الخطأ كانت تزول بعد 3 ثوانٍ كغيرها، والمكوّن المشترك
// (src/ui/toast.js) يضاعف مدة الخطأ. (ب) المنطقة الحية (role=status) كانت تُنشأ inert ويُكتب نصها ثم يُزال inert في الدفعة نفسها،
// فتدخل شجرة الوصول ونصها معًا ولا تعلنها قارئات الشاشة عادة؛ صارت غير خامدة دائمًا والخمود لزر «تراجع» وحده حين تُخفى. (ج) حوارات
// المحرّر كانت بعنوانها وحده (aria-labelledby)، فحارس المغادرة يُسمع عنوانه دون سؤاله؛ صارت فقرة السؤال وصفها (aria-describedby)
// كما في confirmDialog. العقد تُقارن بـassert.ok(a === b) لا بـassert.equal (انظر fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { confirmLeave, openDialog } from '../../../../src/pages/editor/dialogs.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';
import { findAll, textOf } from '../library/fake-dom.js';

/** المحرّر مركّبًا فوق مخزن تفشل كتابته حين fail.on، ومعه سجلّ inert لحظة كل كتابة في عنصر الرسالة. */
async function mounted() {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const bundle = sampleBundle();
  await seedBundle(store, bundle);
  const fail = { on: false };
  const wrapped = {
    ...store,
    updateBundle: async (...args) => {
      if (fail.on) throw new Error('كتابة مفتعلة فشلت');
      return store.updateBundle(...args);
    },
  };
  const env = editorDocument({ videoId: bundle.videoId });
  const editor = await mountEditor(env.root, { videoId: bundle.videoId, store: wrapped, doc: env.doc, now });
  assert.ok(editor, 'رُكّب المحرّر');
  await env.flush();
  const toastEl = env.root.querySelector('.ed-toast');
  const inertAtWrite = [];
  const replace = toastEl.replaceChildren;
  toastEl.replaceChildren = function replaceChildren(...nodes) {
    inertAtWrite.push(this.hasAttribute('inert'));
    return replace.apply(this, nodes);
  };
  return { env, editor, fail, toastEl, inertAtWrite };
}
const shown = (toastEl) => toastEl.className.includes('is-shown');

test('ت-١٤ (أ): رسالة الخطأ في المحرّر تبقى ضعف مدة غيرها (6 ث لا 3) كالمكوّن المشترك', async () => {
  const { env, editor, fail, toastEl } = await mounted();
  editor.state.session.setText(0, 'تعديل يُحفظ');
  // بلا flush بعد الحفظ: flush يمضي كل المؤقتات ومنها مؤقت زوال الرسالة.
  await editor.save();
  await settle();
  assert.ok(shown(toastEl) && !toastEl.className.includes('danger'), 'رسالة النجاح');
  await env.advance(3100);
  assert.ok(!shown(toastEl), 'النجاح يزول بعد 3 ث');

  editor.state.session.setText(0, 'تعديل لا يُحفظ');
  fail.on = true;
  await editor.save();
  await settle();
  assert.ok(shown(toastEl) && toastEl.className.includes('ed-toast--danger'), 'رسالة الخطأ');
  await env.advance(3100);
  assert.ok(shown(toastEl), 'الخطأ باقٍ بعد 3 ث');
  await env.advance(2800);
  assert.ok(shown(toastEl), 'باقٍ قبل 6 ث');
  await env.advance(200);
  assert.ok(!shown(toastEl), 'يزول بعد 6 ث');
});

test('ت-١٤ (ب): المنطقة الحية للرسالة لا تُنشأ خامدة ولا تخمد: غير inert لحظة كل كتابة، والخمود لزر «تراجع» وحده حين تُخفى', async () => {
  const { env, toastEl, inertAtWrite } = await mounted();
  assert.equal(toastEl.getAttribute('role'), 'status');
  assert.equal(toastEl.hasAttribute('inert'), false, 'لا تُنشأ خامدة');
  const markBtn = env.root.querySelector('.ed-row[data-index="1"] [data-act="mark"]');
  markBtn.click();
  await settle(12);
  await env.flushFrames();
  assert.ok(shown(toastEl), 'رسالة العلامة بزر تراجع');
  const undo = toastEl.querySelector('.ed-toast__action');
  assert.ok(undo, 'زر «تراجع»');
  assert.equal(undo.hasAttribute('inert'), false, 'الزر الظاهر قابل للتفاعل');
  assert.deepEqual(inertAtWrite, [false], 'غير خامدة لحظة الكتابة');
  await env.advance(7100);
  assert.ok(!shown(toastEl));
  assert.equal(toastEl.hasAttribute('inert'), false, 'المنطقة الحية باقية في شجرة الوصول');
  assert.equal(undo.hasAttribute('inert'), true, 'زر المخفية خامد (U21)');
});

test('ت-١٤ (ج): حارس المغادرة وحوارات المحرّر بنصّ وصفُها فقرة السؤال (aria-describedby)، كـconfirmDialog', async () => {
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const text = 'لديك تغييران غير محفوظين. تغادر دون حفظ؟';
  const done = confirmLeave(env.doc, text);
  await settle();
  const dlg = env.doc.querySelector('dialog[open]');
  const id = dlg.getAttribute('aria-describedby');
  assert.ok(id, 'aria-describedby');
  const described = findAll(dlg, (e) => e.getAttribute?.('id') === id);
  assert.equal(described.length, 1, 'عنصر واحد بالمعرّف');
  assert.equal(described[0].tagName, 'p');
  assert.equal(textOf(described[0]), text);
  assert.ok(findAll(dlg, (e) => e.getAttribute?.('id') === dlg.getAttribute('aria-labelledby')).length === 1, 'والعنوان اسمه كما كان');
  dlg.close('stay');
  assert.equal(await done, false);

  // حوار بنص ومحتوى (الإنقاذ المتعذّر): الوصف فقرة السؤال لا المحتوى.
  const box = env.doc.createElement('div');
  const again = openDialog({ doc: env.doc, title: 'عنوان', body: 'السؤال', content: box, actions: [{ label: 'حسنًا', value: 'ok' }] });
  await settle();
  const d2 = env.doc.querySelector('dialog[open]');
  const p = findAll(d2, (e) => e.getAttribute?.('id') === d2.getAttribute('aria-describedby'))[0];
  assert.ok(p && textOf(p) === 'السؤال');
  d2.close('ok');
  await again;
});
