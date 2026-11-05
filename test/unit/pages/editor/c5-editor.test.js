// تدقيق 7a66f91، المرحلة C5، في المحرّر: حوار «الترجمة SRT…» يقول قبل التنزيل ما يتغير عند إعادة الاستيراد (U99)، ويمنع التصدير
// بسطر يُقرأ رأسَ مقطع ويسمّي المقطع (U78)، والنص الدراسي ثنائي اللغة يوزّع الإنجليزي بالإزاحة نفسها (U30).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';

async function mounted(saved = []) {
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area: createMemoryArea({ unlimited: true }), now });
  const bundle = sampleBundle();
  await seedBundle(store, bundle);
  const env = editorDocument({ videoId: bundle.videoId });
  const editor = await mountEditor(env.root, {
    videoId: bundle.videoId, store, doc: env.doc, now, saveFile: async (f) => { saved.push(f); return { ok: true, mode: 'downloads', downloadId: 1 }; },
  });
  await env.flush();
  return { editor, env, saved };
}

async function openSrtDialog(m) {
  m.env.root.querySelectorAll('button').find((b) => b.textContent.includes('تصدير')).click();
  await m.env.flush();
  m.env.doc.querySelectorAll('[role="menuitem"], button').find((b) => b.textContent.includes('الترجمة SRT')).click();
  await settle();
  return m.env.doc.querySelector('dialog[open]');
}

test('U99: وسم تنسيق في النص: الحوار يقول قبل التنزيل إنه يُجرَّد عند إعادة الاستيراد، والملف يُنزَّل', async () => {
  const m = await mounted();
  m.editor.state.session.setText(1, '<i>مائل</i>');
  await m.env.flush();
  const dlg = await openSrtDialog(m);
  assert.ok(dlg);
  const notes = dlg.querySelector('[data-fid="exportNotes"]');
  assert.equal(notes.hidden, false);
  assert.ok(notes.textContent.includes(messageFor('EX_NOTE_REREAD_CHANGES', { list: '2' })), notes.textContent);
  dlg.close('download');
  await settle(8);
  assert.equal(m.saved.length, 1);
  assert.match(m.saved[0].text, /<i>مائل<\/i>/, 'يُكتب كما هو، والتنبيه قبله');
});

test('U78: سطر زمن كامل في نص مقطع يمنع التنزيل برقم المقطع، وبلا ملاحظات', async () => {
  const m = await mounted();
  m.editor.state.session.setText(2, 'أ\n00:00:05,000 --> 00:00:06,000');
  await m.env.flush();
  const dlg = await openSrtDialog(m);
  assert.ok(dlg.textContent.includes(messageFor('ED_EXPORT_BLOCKED', { list: '3' })), dlg.textContent);
  assert.equal(dlg.querySelector('[data-fid="exportNotes"]').hidden, true);
});
