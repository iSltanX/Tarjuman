// تدقيق 7a66f91، المرحلة C5، في المحرّر: حوار «ملف الترجمة…» (كان «الترجمة SRT…» قبل الفكرة ١١) يقول قبل التنزيل ما يتغير عند إعادة الاستيراد (U99)، ويمنع التصدير
// بسطر يُقرأ رأسَ مقطع ويسمّي المقطع (U78)، والنص الدراسي ثنائي اللغة يوزّع الإنجليزي بالإزاحة نفسها (U30).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { messageFor } from '../../../../src/core/errors/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { formatVttTime } from '../../../../src/core/export/vtt.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';

async function mounted(saved = [], shape = (b) => b) {
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area: createMemoryArea({ unlimited: true }), now });
  const bundle = shape(sampleBundle());
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
  m.env.doc.querySelectorAll('[role="menuitem"], button').find((b) => b.textContent.includes('ملف الترجمة')).click();
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

// ---- الفكرة ١١: الصيغة والمحتوى ----

const radio = (dlg, name, value) => dlg.querySelectorAll('input').find((x) => x.getAttribute('name') === name && x.getAttribute('value') === value);
const pick = (input) => {
  input.checked = true;
  input.dispatchEvent({ type: 'change' });
};
const fileNameOf = (dlg) => dlg.querySelectorAll('p').find((p) => p.textContent.startsWith('اسم الملف')).querySelector('bdi').textContent;

test('الفكرة ١١: «ملف الترجمة…»: الصيغة والمحتوى بعد النسخة، والاسم يتبعهما، و«مع الأصل» ينزّل WebVTT بسطر الأصل تحت كل مقطع بالتوقيت الظاهر', async () => {
  const m = await mounted();
  const dlg = await openSrtDialog(m);
  assert.ok(dlg.textContent.includes('تصدير الترجمة') && !dlg.textContent.includes('(SRT)'), 'العنوان بلا «(SRT)»');
  assert.notEqual(radio(dlg, 'ed-format', 'srt').getAttribute('checked'), null, 'SRT افتراضيًا');
  assert.notEqual(radio(dlg, 'ed-content', 'only').getAttribute('checked'), null, 'الترجمة وحدها افتراضيًا');
  assert.equal(radio(dlg, 'ed-content', 'dual').disabled, false, 'الأصل محفوظ');
  const dualNote = dlg.querySelectorAll('p').find((p) => p.textContent === 'الملف للمشاهدة في مشغّل آخر، لا للرفع إلى ترجمان.');
  assert.equal(dualNote.hidden, true);
  assert.match(fileNameOf(dlg), /\.ar\.srt$/);
  pick(radio(dlg, 'ed-format', 'vtt'));
  pick(radio(dlg, 'ed-content', 'dual'));
  assert.match(fileNameOf(dlg), /\.ar\.dual-en\.vtt$/, 'الاسم يتبع الاختيار');
  assert.equal(dualNote.hidden, false);
  dlg.close('download');
  await settle(8);
  assert.equal(m.saved.length, 1);
  assert.match(m.saved[0].name, /\.ar\.dual-en\.vtt$/);
  assert.ok(m.saved[0].text.startsWith('WEBVTT\n\n1\n'));
  const first = m.editor.state.session.cueAt(0);
  const shownStart = first.startMs + m.editor.state.session.offsetMs;
  const block = m.saved[0].text.split('\n\n')[1].split('\n');
  assert.equal(block[1].split(' --> ')[0], formatVttTime(shownStart), 'بالتوقيت الظاهر (المحفوظ + الإزاحة)');
  assert.equal(block.at(-1), 'line 1', 'سطر الأصل المحاذي في الزمن المحفوظ');
});

test('الفكرة ١١: بلا مسار أصل محفوظ «مع الأصل» معطّل بسببه مرتبطًا بالخيار، والتنزيل الترجمة وحدها', async () => {
  const bare = (t) => (t ? { ...t, fingerprintId: null, comparison: null } : t);
  const m = await mounted([], (b) => ({
    ...b, record: { ...b.record, english: [], fingerprints: [], arabic: bare(b.record.arabic) }, slots: b.slots.map((x) => ({ ...x, track: bare(x.track) })),
  }));
  const dlg = await openSrtDialog(m);
  const dual = radio(dlg, 'ed-content', 'dual');
  assert.equal(dual.disabled, true);
  const why = dlg.querySelectorAll('p').find((p) => p.getAttribute('id') === dual.getAttribute('aria-describedby'));
  assert.equal(why?.textContent, 'لا أصل محفوظ لهذا الفيديو؛ نزّله من المشغّل أولًا.');
  dlg.close('download');
  await settle(8);
  assert.equal(m.saved.length, 1);
  assert.match(m.saved[0].name, /\.ar\.srt$/);
  assert.doesNotMatch(m.saved[0].text, /line 1/);
});
