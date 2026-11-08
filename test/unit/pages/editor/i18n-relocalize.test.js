// تبديل لغة المحرّر في مكانه: صفحة المحرّر الوحيدة التي لا تعيد التحميل (فيها تعديلات غير محفوظة وسجل تراجع في الذاكرة). تُركَّب
// بالعربية، ويُعدَّل نص ولا يُحفظ، ثم setLocale('en') وrelocalize(): لا حرف عربي في نصوص الواجهة والعناوين وسمات aria وtitle وplaceholder
// (ما عدا بيانات المستخدم: نصوص المقاطع وعنوان الفيديو وأسماء الترجمات والملفات)، والجلسة بتعديلها وسجل تراجعها كما هي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { getDir, setLocale } from '../../../../src/i18n/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { textDir } from '../../../../src/pages/editor/rows.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument } from '../../../helpers/editor-dom.js';

const ARABIC = /[؀-ۿݐ-ݿ]/;
const EDIT = 'تعديل غير محفوظ في المقطع الأول';

async function mounted() {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const initial = sampleBundle({ third: true });
  await seedBundle(store, initial);
  const env = editorDocument({ videoId: initial.videoId });
  const editor = await mountEditor(env.root, { videoId: initial.videoId, store, doc: env.doc, now });
  assert.ok(editor, 'رُكّب المحرّر');
  await env.flush();
  return { editor, env, initial };
}

/** نصوص بيانات المستخدم في الحزمة، لتُستثنى من فحص «لا عربي». */
function dataStrings(bundle) {
  const out = new Set();
  const add = (s) => { if (typeof s === 'string' && s) out.add(s); };
  add(bundle.record.title);
  for (const slot of bundle.slots) {
    add(slot.name);
    for (const track of [slot.track].filter(Boolean)) {
      add(track.fileName);
      for (const list of [track.original, track.current ?? []]) for (const cue of list) add(cue.text);
      for (const note of track.notes ?? []) add(note);
    }
  }
  for (const t of bundle.record.english) for (const cue of t.cues ?? []) add(cue.text);
  add(EDIT);
  return [...out].sort((a, b) => b.length - a.length);
}

/** كل نص مرئي أو مقروء في الصفحة: نص العقد المباشر وسمات aria-label وtitle وplaceholder وalt وقيم الخيارات المعروضة. */
function visibleStrings(doc) {
  const out = [];
  for (const node of doc.documentElement.descendants()) {
    if (node.nodeType !== 1) continue;
    for (const child of node.childNodes) if (child.nodeType === 3 && child.textContent.trim()) out.push({ where: node.tagName, text: child.textContent });
    for (const attr of ['aria-label', 'title', 'placeholder', 'alt']) {
      const v = node.getAttribute(attr);
      if (v) out.push({ where: `${node.tagName}[${attr}]`, text: v });
    }
    if (node.title) out.push({ where: `${node.tagName}.title`, text: node.title });
  }
  out.push({ where: 'document.title', text: doc.title });
  return out;
}

const offenders = (doc, data) => visibleStrings(doc).filter(({ text }) => {
  let rest = text;
  for (const d of data) rest = rest.split(d).join('');
  return ARABIC.test(rest);
});

test('تبديل اللغة في مكانه: لا حرف عربي في واجهة المحرّر بعد relocalize، والتعديل غير المحفوظ وسجل التراجع باقيان', async (t) => {
  t.after(() => setLocale('ar'));
  const { editor, env, initial } = await mounted();
  const data = dataStrings(initial);
  const S = editor.state;
  const session = S.session;
  session.setText(0, EDIT);
  await env.flush();
  assert.equal(session.dirty, true);
  assert.equal(session.canUndo, true);
  assert.equal(typeof editor.relocalize, 'function', 'الواجهة تعرض relocalize');
  assert.ok(env.root.textContent.includes('تغييرات غير محفوظة'), 'قبل التبديل: عربية');
  assert.ok(offenders(env.doc, []).length > 0);
  const version = session.version;
  const undoKind = session.undoKind;
  const active = S.activeIndex;

  setLocale('en');
  editor.relocalize();
  await env.flush();

  assert.deepEqual(offenders(env.doc, data), [], 'لا عربي في نصوص الواجهة وسماتها بعد التبديل');
  assert.ok(env.root.textContent.includes('Unsaved changes (1)'), 'الحالة بالإنجليزية');
  assert.ok(env.root.textContent.includes('You have 1 unsaved change'), 'الشريط السفلي بالإنجليزية');
  assert.ok(S.session === session, 'الجلسة نفسها لم تُستبدل');
  assert.equal(session.dirty, true, 'التعديل غير المحفوظ باقٍ');
  assert.equal(session.cueAt(0).text, EDIT);
  assert.equal(session.version, version);
  assert.equal(session.canUndo, true, 'سجل التراجع باقٍ');
  assert.equal(session.undoKind, undoKind);
  assert.equal(S.activeIndex, active);
  const row = env.doc.querySelector('.ed-row[data-index="0"]');
  assert.equal(row.querySelector('[data-field="text"]').value, EDIT, 'نص المستخدم في حقله كما هو');
  assert.equal(env.doc.querySelector('dialog[open]'), null);

  // التراجع بعد التبديل يعمل ويعيد النص الأصلي، والرسالة بالإنجليزية.
  const undone = session.undo();
  assert.equal(undone.ok, true);
  assert.notEqual(session.cueAt(0).text, EDIT);
});

test('تبديل اللغة ذهابًا وإيابًا: العربية تعود كما كانت، والاتجاه من اللغة', async (t) => {
  t.after(() => setLocale('ar'));
  const { editor, env } = await mounted();
  const before = visibleStrings(env.doc).map((x) => x.text).join('\n');
  setLocale('en');
  assert.equal(getDir(), 'ltr');
  assert.equal(textDir(''), 'ltr', 'حقل فارغ في واجهة إنجليزية');
  editor.relocalize();
  await env.flush();
  setLocale('ar');
  assert.equal(getDir(), 'rtl');
  assert.equal(textDir(''), 'rtl');
  editor.relocalize();
  await env.flush();
  const after = visibleStrings(env.doc).map((x) => x.text).join('\n');
  assert.equal(after, before, 'العودة إلى العربية تعيد النصوص كما كانت');
});

test('سهما النطاق يحترمان الاتجاه: التالي بالأيسر في RTL وبالأيمن في LTR', async (t) => {
  t.after(() => setLocale('ar'));
  const { editor, env } = await mounted();
  const radios = () => [...env.doc.querySelectorAll('.ed-seg__opt')];
  const press = (btn, k) => btn.dispatchEvent({ type: 'keydown', key: k, currentTarget: btn, target: btn, preventDefault() {} });
  editor.jumpTo(0, 'text'); // مقطع نشط: يتاح «المقطع» و«الملف كله» (المحددة معطّلة بلا تحديد)
  await env.flush();
  assert.equal(editor.state.scope, 'all');
  press(radios()[2], 'ArrowLeft');
  assert.equal(editor.state.scope, 'cue', 'RTL: ArrowLeft من الأخير يلتف إلى الأول');
  press(radios()[0], 'ArrowRight');
  assert.equal(editor.state.scope, 'all', 'RTL: ArrowRight يرجع إلى السابق');
  setLocale('en');
  editor.relocalize();
  await env.flush();
  press(radios()[2], 'ArrowRight');
  assert.equal(editor.state.scope, 'cue', 'LTR: ArrowRight من الأخير يلتف إلى الأول');
  press(radios()[0], 'ArrowLeft');
  assert.equal(editor.state.scope, 'all', 'LTR: ArrowLeft يرجع إلى السابق');
});

test('نصوص المحرّر الدقيقة بالإنجليزية: العدّ بصيغ الجمع، والنطاق، والإزاحة معزولة LTR', async (t) => {
  t.after(() => setLocale('ar'));
  const text = await import('../../../../src/pages/editor/text.js');
  setLocale('en');
  assert.equal(text.issuesSummary({ errors: 3, warnings: 1 }), '3 errors · 1 warning');
  assert.equal(text.issuesSummary({ errors: 0, warnings: 0 }), 'No issues');
  assert.equal(text.errorsToFix(1), '1 timing error');
  assert.equal(text.errorsToFix(4), '4 timing errors');
  assert.equal(text.unsavedSentence(1), 'You have 1 unsaved change');
  assert.equal(text.unsavedSentence(12), 'You have 12 unsaved changes');
  assert.equal(text.pendingSentence(0, 2), 'You have 2 invalid time fields');
  assert.equal(text.pendingSentence(3, 1), 'You have 3 unsaved changes, and 1 invalid time field');
  assert.equal(text.saveStatus(12, true), 'Unsaved changes (12)');
  assert.equal(text.scopeOption('selection', { selected: 3 }), 'Selected (3)');
  assert.equal(text.scopeTarget('all', { total: 2140 }), 'the whole file (2140 segments)');
  assert.equal(text.scopeTarget('selection', { selected: 3, total: 9 }), '3 segments');
  assert.equal(text.shiftSentence('3 segments', 500, 'before'), 'Will delay 3 segments by 0.5 s (shows later).');
  assert.equal(text.shiftSentence('segment 5', -1000, 'after'), 'Advanced segment 5 by 1.0 s.');
  assert.equal(text.numberList([1, 2, 3]), '1, 2, 3');
  assert.equal(text.offsetLine(500), 'Display offset while watching: ⁦+0.5⁩ s — separate from the saved timing');
  assert.equal(text.markActionLabel(12, null), 'Mark segment 12 “To revisit”');
  assert.equal(text.editSlotLabel({ n: 2, filled: true, active: true }, { editing: true }), 'Translation 2, being edited, active in the player');
  const lines = text.comparisonLines({
    fingerprintId: 'x', matched: false, countSource: 5, countTarget: 3, numbering: 'same', missing: [4, 5], extra: [], drift: [], empty: [], noArabic: [],
  }).map((l) => l.text);
  assert.deepEqual(lines, ['Segments: 3 of 5', '2 segments missing: 4, 5']);
});

/** يكتب في حقل زمن ويتركه مركَّزًا بلا تثبيت، كما يكون حين تُبدَّل اللغة من نافذة أخرى. */
function typeTime(env, value, field = 'start') {
  const input = env.root.querySelector(`[data-field="${field}"]`);
  input.focus();
  input.value = value;
  return input;
}

test('زمن مكتوب في حقل مركَّز يبقى بعد التبديل ويُحسب تعديلًا، والتراجع يعيده', async (ctx) => {
  ctx.after(() => setLocale('ar'));
  const { editor, env } = await mounted();
  const session = editor.state.session;
  const before = session.cueAt(0).startMs;
  assert.equal(session.dirty, false);
  typeTime(env, '00:00:01,250');
  setLocale('en');
  editor.relocalize();
  await env.flush();
  const after = env.root.querySelector('[data-field="start"]');
  assert.equal(after.value, '00:00:01,250');
  assert.equal(session.cueAt(0).startMs, 1250);
  assert.equal(session.dirty, true);
  assert.equal(env.doc.activeElement, after, 'يعود التركيز إلى حقله');
  session.undo();
  assert.equal(session.cueAt(0).startMs, before);
});

test('زمن غير صالح يبقى مسودة كما كُتب بعد التبديل', async (ctx) => {
  ctx.after(() => setLocale('ar'));
  const { editor, env } = await mounted();
  typeTime(env, '12:ab', 'end');
  setLocale('en');
  editor.relocalize();
  await env.flush();
  assert.equal(env.root.querySelector('[data-field="end"]').value, '12:ab');
  assert.equal(editor.state.session.hasDrafts, true);
});

test('موضع المؤشر في حقل الزمن يبقى بعد التبديل', async (ctx) => {
  ctx.after(() => setLocale('ar'));
  const { editor, env } = await mounted();
  const input = typeTime(env, '00:00:01,250');
  input.selectionStart = 4;
  input.selectionEnd = 7;
  const calls = [];
  const proto = Object.getPrototypeOf(input);
  const had = Object.hasOwn(proto, 'setSelectionRange') ? proto.setSelectionRange : undefined;
  proto.setSelectionRange = function setSelectionRange(a, b) { calls.push([this.dataset.field, a, b]); };
  ctx.after(() => { if (had) proto.setSelectionRange = had; else delete proto.setSelectionRange; });
  setLocale('en');
  editor.relocalize();
  await env.flush();
  assert.deepEqual(calls.at(-1), ['start', 4, 7]);
});

test('الحقل غير المعدَّل لا يصنع تعديلًا عند التبديل', async (ctx) => {
  ctx.after(() => setLocale('ar'));
  const { editor, env } = await mounted();
  const input = env.root.querySelector('[data-field="start"]');
  input.focus();
  setLocale('en');
  editor.relocalize();
  await env.flush();
  assert.equal(editor.state.session.dirty, false);
  assert.equal(editor.state.session.canUndo, false);
});
