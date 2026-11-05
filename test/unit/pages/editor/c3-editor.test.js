// انحدارات C3 (تدقيق 7a66f91، المحرّر): المحرّر مركّبًا كاملًا فوق التخزين الحقيقي بمحاكاة chrome.storage، والـDOM الوهمي
// كالمتصفح في نوع الحقل وinstanceof والساعة (U71). كل اختبار هنا فشل على الشيفرة قبل C3 للسبب الذي يصفه.
// العقد تُقارن بـassert.ok(a === b) لا بـassert.equal (انظر fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../../../../src/core/store/index.js';
import { TjError } from '../../../../src/core/errors/index.js';
import { createEditSession, findIssues, planReplace, resolveSlotMarks, reviewGroups, reviewItems, searchCues } from '../../../../src/core/edit/index.js';
import { planRescue } from '../../../../src/core/edit/rescue.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { openDriftDialog } from '../../../../src/pages/editor/drift-dialog.js';
import { openReportDialog, openStudyDialog } from '../../../../src/pages/editor/export-dialogs.js';
import { saveSlot } from '../../../../src/pages/editor/persist.js';
import { refOptionLabel } from '../../../../src/pages/editor/text.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues } from '../../../helpers/fixtures.js';
import { markOn, sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';
import { buttonNamed, findAll, textOf } from '../library/fake-dom.js';

const FSI = String.fromCodePoint(0x2068);
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

async function mounted({ bundle = sampleBundle(), wrap = (s) => s, saveFile, before } = {}) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  await seedBundle(store, bundle);
  const env = editorDocument({ videoId: bundle.videoId });
  before?.(env);
  const editor = await mountEditor(env.root, { videoId: bundle.videoId, store: wrap(store), doc: env.doc, now, ...(saveFile ? { saveFile } : {}) });
  assert.ok(editor, 'رُكّب المحرّر');
  await env.flush();
  const key = (target, { code = 'KeyZ', shift = false } = {}) => env.fireDoc({
    type: 'keydown', code, key: code.slice(3).toLowerCase(), ctrlKey: true, metaKey: false, altKey: false, shiftKey: shift, target,
  });
  const row = (i) => env.root.querySelector(`.ed-row[data-index="${i}"]`);
  const field = (i, f) => env.root.querySelector(`.ed-row[data-index="${i}"] [data-field="${f}"]`);
  return { area, store, editor, env, videoId: bundle.videoId, key, row, field, doc: env.doc };
}

/** مخزن يؤخّر كتابة الحزمة حتى release (حفظ بطيء الرد). */
function slowWrites() {
  const gate = { paused: false, release: null };
  const wrap = (store) => ({
    ...store,
    updateBundle: async (...args) => {
      if (gate.paused) await new Promise((r) => { gate.release = r; });
      return store.updateBundle(...args);
    },
  });
  return { gate, wrap };
}

/** الخانة 1 بنصوص معطاة (نسخة حالية). */
function withTexts(texts, { count = texts.length } = {}) {
  const b = sampleBundle();
  const t = b.slots[0].track;
  const cues = makeCues(count, { text: (i) => texts[i - 1] ?? `سطر ${i}` });
  t.original = cues;
  t.current = cues.map((c) => ({ ...c }));
  t.fingerprintId = null;
  t.comparison = null;
  b.slots[0].marks = [];
  b.slots[0].position = null;
  b.record.arabic = structuredClone(t);
  return b;
}

const attached = (doc, node) => {
  for (let n = node; n; n = n.parentNode) if (n === doc.body) return true;
  return false;
};
const dialogOf = (doc) => doc.querySelector('dialog[open]');

async function searchFor(m, query, replacement = null) {
  const searchIn = m.env.root.querySelector('input[type=search]');
  searchIn.value = query;
  searchIn.dispatchEvent({ type: 'input' });
  await m.env.flush();
  if (replacement !== null) {
    buttonNamed(m.env.root, 'استبدال').click();
    const replaceIn = m.env.root.querySelector('.ed-search__replace input');
    replaceIn.value = replacement;
    replaceIn.dispatchEvent({ type: 'input' });
    await m.env.flush();
  }
  return searchIn;
}
const hereBtn = (m) => m.env.root.querySelector('.ed-search__replace').querySelectorAll('button')[0];

// ---- U71: أداة الاختبار ----

test('U71: الـDOM الوهمي كالمتصفح: instanceof بالوسم، وtype من السمة، ومؤقتات بمهلها منفصلة عن الإطارات', async () => {
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const win = env.doc.defaultView;
  const [div, input, area] = ['div', 'input', 'textarea'].map((t) => env.doc.createElement(t));
  assert.equal(div instanceof win.HTMLInputElement, false, 'عنصر div ليس حقلًا');
  assert.equal(div instanceof win.HTMLTextAreaElement, false);
  assert.equal(input instanceof win.HTMLInputElement, true);
  assert.equal(area instanceof win.HTMLTextAreaElement, true);
  assert.equal(input.type, 'text', 'النوع الافتراضي text');
  input.setAttribute('type', 'search');
  assert.equal(input.type, 'search');
  const fired = [];
  win.setTimeout(() => fired.push(120), 120);
  win.setTimeout(() => fired.push(6000), 6000);
  win.requestAnimationFrame(() => fired.push('frame'));
  await env.advance(119);
  assert.deepEqual(fired, [], 'مؤقّت 120 لا يمضي عند 119');
  await env.advance(1);
  assert.deepEqual(fired, [120]);
  await env.flushFrames();
  assert.deepEqual(fired, [120, 'frame'], 'الإطارات وحدها');
  await env.advance(6000);
  assert.deepEqual(fired, [120, 'frame', 6000]);
  const b = env.doc.createElement('button');
  b.title = 'قديم';
  b.removeAttribute('title');
  assert.equal(b.title, '', 'إزالة السمة تفرّغ التلميح');
});

// ---- U17 وU18: اختصار التراجع ----

test('U17: ⌘Z و⇧⌘Z وCtrl+Y في حقل البحث (type=search) وحقل رقمي ومحرَّر contenteditable تُترك للحقل ولا تمس المقاطع', async () => {
  const m = await mounted();
  const ta = m.field(0, 'text');
  ta.focus();
  ta.value = `${ta.value} أ`;
  ta.dispatchEvent({ type: 'input' });
  await m.env.flush();
  const edited = m.editor.state.session.cueAt(0).text;
  const search = m.env.root.querySelector('input[type=search]');
  search.focus();
  for (const k of [{}, { shift: true }, { code: 'KeyY' }]) {
    assert.equal(m.key(search, k).defaultPrevented, false, `الاختصار ${JSON.stringify(k)} للحقل`);
  }
  assert.equal(m.editor.state.session.cueAt(0).text, edited, 'لا تراجع عن تعديل المقطع');
  const num = m.doc.createElement('input');
  num.setAttribute('type', 'number');
  m.env.root.append(num);
  assert.equal(m.key(num).defaultPrevented, false, 'حقل رقمي');
  const ce = m.doc.createElement('div');
  ce.setAttribute('contenteditable', 'true');
  m.env.root.append(ce);
  assert.equal(m.key(ce).defaultPrevented, false, 'contenteditable');
  assert.equal(m.key(m.doc.body).defaultPrevented, true, 'خارج الحقول يتراجع المحرّر');
  assert.notEqual(m.editor.state.session.cueAt(0).text, edited);
});

test('U18: بعد الدمج أو الشطر يصل ⌘Z الأول إلى تراجع المحرّر في الحقل المركّز برمجيًا، وبعد الكتابة فيه يُترك للحقل', async () => {
  const m = await mounted();
  const count = m.editor.state.session.count;
  m.row(0).querySelector('[data-act="merge"]').click();
  await m.env.flush();
  assert.equal(m.editor.state.session.count, count - 1, 'دُمج');
  const focused = m.doc.activeElement;
  assert.equal(focused.dataset.field, 'text', 'التركيز في نص الصف');
  assert.equal(m.key(focused).defaultPrevented, true, '⌘Z للمحرّر');
  await m.env.flush();
  assert.equal(m.editor.state.session.count, count, 'تُراجع عن الدمج');

  // الشطر: المؤشر في نص المقطع 2 ثم «شطر».
  const ta = m.field(1, 'text');
  ta.focus();
  ta.selectionStart = 2;
  ta.dispatchEvent({ type: 'keyup' });
  m.row(1).querySelector('[data-act="split"]').click();
  await m.env.flush();
  assert.equal(m.editor.state.session.count, count + 1, 'شُطر');
  const after = m.doc.activeElement;
  // الكتابة في الحقل المركّز تجعله حقل المستخدم: ⌘Z بعدها للحقل.
  after.value = `${after.value}ب`;
  after.dispatchEvent({ type: 'input' });
  assert.equal(m.key(after).defaultPrevented, false, 'بعد الكتابة الاختصار للحقل');
});

// ---- U19 وU73: الزمن المكتوب في حقل لم يُغادَر ----

test('U19: زمن مكتوب في حقل مركّز لم يُغادَر يحذّر عند إغلاق الصفحة', async () => {
  const m = await mounted();
  const f = m.field(0, 'end');
  f.focus();
  f.value = '00:09:59,999';
  f.dispatchEvent({ type: 'input' });
  assert.equal(m.env.fireWin('beforeunload').defaultPrevented, true);
});

test('U73: اكتمال حفظ بطيء لا يكتب فوق زمن يُكتب في حقل مركّز، والإغلاق بعده يحذّر', async () => {
  const { gate, wrap } = slowWrites();
  const m = await mounted({ wrap });
  m.editor.state.session.setText(2, 'تعديل قبل الحفظ');
  gate.paused = true;
  const saving = m.editor.save();
  await settle();
  const f = m.field(0, 'end');
  f.focus();
  f.value = '00:09:59,999';
  f.dispatchEvent({ type: 'input' });
  gate.paused = false;
  gate.release?.();
  await saving;
  await m.env.flush();
  assert.equal(m.field(0, 'end').value, '00:09:59,999', 'ما كُتب في الحقل باقٍ');
  assert.equal(m.env.fireWin('beforeunload').defaultPrevented, true, 'والإغلاق يحذّر');
});

// ---- U20: ترتيب الصفوف ----

test('U20: صفوف القائمة الافتراضية مرتبة في الـDOM بعد التمرير للخلف، وبـaria-setsize وaria-posinset', async () => {
  const m = await mounted({ bundle: withTexts([], { count: 150 }) });
  const scroller = m.env.root.querySelector('.ed-list');
  const spacer = scroller.querySelector('.ed-list__spacer');
  for (const top of [3000, 2200]) {
    scroller.scrollTop = top;
    scroller.dispatchEvent({ type: 'scroll' });
    await m.env.flush();
  }
  const order = [...spacer.children].map((c) => Number(c.getAttribute('data-row')));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'ترتيب الـDOM هو الترتيب البصري');
  const first = spacer.children[0];
  assert.equal(first.getAttribute('aria-setsize'), '150');
  assert.equal(first.getAttribute('aria-posinset'), String(order[0] + 1));
});

// ---- U21: زر الرسالة العابرة ----

test('U21: زر «تراجع» في الرسالة العابرة يخرج من ترتيب التركيز حين تختفي', async () => {
  const m = await mounted();
  m.row(1).querySelector('[data-act="mark"]').click();
  await settle(12);
  const toast = m.env.root.querySelector('.ed-toast');
  assert.ok(toast.querySelector('.ed-toast__action'), 'رسالة بزر تراجع');
  assert.equal(toast.hasAttribute('inert'), false, 'ظاهرة قابلة للتفاعل');
  await m.env.advance(7000);
  assert.equal(toast.classList.contains('is-shown'), false);
  assert.equal(toast.hasAttribute('inert'), true, 'المخفية خامدة');
});

// ---- U22: التركيز في اللوحة الجانبية ----

test('U22: التركيز يبقى في اللوحة الجانبية بعد إعادة رسمها: مربع الاستكمال، ومرجع المقارنة، وإزالة اليتيمة، وتغيّر الجلسة', async () => {
  const bundle = sampleBundle();
  bundle.slots[0].marks.push(markOn({ n: 99, startMs: 999000, text: 'لا مقطع بهذا' }, 'todo'));
  const m = await mounted({ bundle });
  const { doc } = m;
  m.env.root.querySelector('#ed-tab-complete').click();
  await m.env.flush();
  const box = m.env.root.querySelector('input[data-group="marked"]');
  box.focus();
  box.checked = !box.checked;
  box.dispatchEvent({ type: 'change' });
  await m.env.flush();
  assert.ok(attached(doc, doc.activeElement), 'المركّز متصل بعد المربع');
  assert.equal(doc.activeElement.getAttribute('data-group'), 'marked', 'على المربع نفسه');
  m.editor.state.session.setText(3, 'نص جديد');
  await m.env.flush();
  assert.ok(attached(doc, doc.activeElement) && doc.activeElement.getAttribute('data-group') === 'marked', 'وبعد تغيّر الجلسة');

  m.env.root.querySelector('#ed-tab-review').click();
  await m.env.flush();
  const sel = m.env.root.querySelector('select.ed-ref-choice');
  sel.focus();
  sel.value = [...sel.children].find((o) => o.getAttribute('value') !== sel.value).getAttribute('value');
  sel.dispatchEvent({ type: 'change' });
  await m.env.flush();
  assert.ok(attached(doc, doc.activeElement) && doc.activeElement.classList.contains('ed-ref-choice'), 'على قائمة المرجع');

  const orphan = buttonNamed(m.env.root, 'إزالة العلامات اليتيمة');
  orphan.focus();
  orphan.click();
  await m.env.flush(6);
  assert.equal(m.editor.state.markView.orphans.length, 0, 'أُزيلت');
  assert.ok(attached(doc, doc.activeElement) && doc.activeElement !== doc.body, 'التركيز داخل اللوحة لا في body');
});

// ---- U23 وU74: الاستبدال ----

test('U23: «استبدال الكل» بعد حفظ خارجي والحوار مفتوح لا يستبدل نصًا تغيّر، ويطلب إعادة المعاينة', async () => {
  const m = await mounted({ bundle: withTexts(['عفوًا؟', 'عفوًا يا سيدي؟', 'عفوًا؟', 'أوه، بربّك.', 'ألديك لحظة يا سيدي؟']) });
  await searchFor(m, 'عفوًا', 'معذرة');
  buttonNamed(m.env.root, 'معاينة استبدال الكل…').click();
  await m.env.flush(1);
  const dlg = dialogOf(m.doc);
  assert.ok(dlg, 'الحوار مفتوح');
  const other = await m.store.getBundle(m.videoId);
  const cues = other.slots[0].track.current.map((c, i) => (i === 0 ? { ...c, text: 'حسنًا، عفوًا؟' } : c));
  await saveSlot(m.store, m.videoId, other, 1, { cues, offsetChanged: false, offsetMs: other.slots[0].offsetMs });
  await m.env.flush(6);
  assert.equal(m.editor.state.session.cueAt(0).text, 'حسنًا، عفوًا؟', 'أُعيد الفتح على الأحدث');
  dlg.close('apply');
  await m.env.flush(4);
  assert.equal(m.editor.state.session.cueAt(0).text, 'حسنًا، عفوًا؟', 'لا استبدال في موضع تغيّر نصه');
  assert.match(m.editor.state.result?.text ?? '', /تغيّرت المقاطع بعد البحث/);
});

test('U23: تغيّر النص ثم «استبدال هنا» قبل مهلة إعادة البحث يستبدل المطابقة الصحيحة (تراجع، أو كتابة في المقطع)', async () => {
  for (const change of ['undo', 'type']) {
    const m = await mounted({ bundle: withTexts(['السلام أولًا ثم السلام ثانيًا']) });
    await searchFor(m, 'السلام', 'سلم');
    hereBtn(m).click();
    await m.env.flush();
    if (change === 'undo') buttonNamed(m.env.root, 'تراجع').click();
    else {
      const ta = m.field(0, 'text');
      ta.focus();
      ta.value = `و${ta.value}`;
      ta.dispatchEvent({ type: 'input' });
    }
    hereBtn(m).click(); // قبل مضي المهلة
    const text = m.editor.state.session.cueAt(0).text;
    assert.ok(!/سلملام|ثمسلم/.test(text), `${change}: لا استبدال في موضع قديم (${text})`);
    assert.ok(text.includes('سلم'), `${change}: استُبدلت مطابقة صحيحة`);
  }
});

test('U74: «استبدال هنا» بعد آخر مطابقة لا يعشّش البديل في نفسه', async () => {
  const m = await mounted({ bundle: withTexts(['عفوًا؟', 'عفوًا يا سيدي؟', 'عفوًا؟', 'أوه، بربّك.', 'ألديك لحظة يا سيدي؟']) });
  await searchFor(m, 'سيدي', 'سيدي الكريم');
  for (let k = 0; k < 4; k++) {
    hereBtn(m).click();
    await m.env.flush();
  }
  const s = m.editor.state.session;
  assert.equal(s.cueAt(1).text, 'عفوًا يا سيدي الكريم؟');
  assert.equal(s.cueAt(4).text, 'ألديك لحظة يا سيدي الكريم؟');
  assert.equal(hereBtn(m).getAttribute('aria-disabled'), 'true', 'لا مطابقة أخرى خارج ما أُدرج');

  const one = await mounted({ bundle: withTexts(['قال: السلام عليكم']) });
  await searchFor(one, 'السلام', 'التحية والسلام');
  hereBtn(one).click();
  await one.env.flush();
  hereBtn(one).click();
  await one.env.flush();
  assert.equal(one.editor.state.session.cueAt(0).text, 'قال: التحية والسلام عليكم');
});

// ---- U24 وU101: الجلسة ----

test('U24: الإزاحة المثبّتة عدّاد صريح: بعد markSaved لا تعارض زائف، وبعد فيض التاريخ لا تُطبَّق مرتين', () => {
  const s = createEditSession({ cues: makeCues(3), offsetMs: 500 });
  assert.equal(s.commitOffset().ok, true);
  const at = s.checkpoint();
  const saved = s.snapshot();
  s.setText(1, 'أثناء الحفظ');
  s.markSaved({ cues: saved, offsetMs: 0 }, at);
  assert.equal(s.committedMs, 0, 'ما دخل المحفوظ ليس مثبّتًا معلّقًا');
  assert.equal(s.adoptOffset(300), true, '± المشغّل يُتبنّى');
  assert.equal(s.offsetMs, 300);
  const shown = s.cueAt(0).startMs + s.offsetMs;
  s.undo();
  s.undo();
  assert.equal(s.cueAt(0).startMs + s.offsetMs, shown, 'التراجع عن تثبيت محفوظ بعد التبنّي لا يغيّر الظاهر');

  const base = makeCues(4);
  const t = createEditSession({ cues: base, offsetMs: 500 });
  t.commitOffset();
  for (let k = 0; k < 205; k++) {
    t.setText(k % 2, `تعديل ${k}`);
    t.seal();
  }
  assert.equal(t.historySize, 200, 'سقط التثبيت من التاريخ');
  assert.equal(t.committedMs, 500, 'والعدّاد باقٍ');
  const mine = t.snapshot();
  const r = planRescue({ base, mine, theirs: base, offsets: { base: 500, mine: t.offsetMs, theirs: 1000, committed: t.committedMs } });
  assert.equal(r.ok, true);
  assert.equal(r.cues[2].startMs + r.offsetMs, base[2].startMs + 1000, 'الظاهر بإزاحة المشغّل مرة واحدة');
});

test('U101: نقل الملف كله وتثبيت الإزاحة لا يمسحان مسودات الزمن، ولا التراجع عنهما', () => {
  const s = createEditSession({ cues: makeCues(3), offsetMs: 500 });
  s.setDraft(1, 'end', '00:00:0x');
  s.shift({ kind: 'all' }, 100);
  assert.equal(s.hasDrafts, true, 'بعد النقل الكلي');
  s.undo();
  assert.equal(s.hasDrafts, true, 'بعد التراجع عنه');
  s.commitOffset();
  assert.equal(s.hasDrafts, true, 'بعد التثبيت');
  s.undo();
  assert.equal(s.hasDrafts, true, 'بعد التراجع عن التثبيت');
  assert.equal(s.issues().list.some((x) => x.code === 'ED_TIME_FORMAT'), true, 'والخطأ ظاهر');
});

// ---- U25 وU100: المراجعة والعلامات ----

test('U25: «بلا حروف عربية» في تقرير المراجعة لكل قطعة بنصها لا برقمها', () => {
  const cues = [{ n: 1, startMs: 0, endMs: 900, text: 'أولى' }, { n: 2, startMs: 1000, endMs: 1900, text: 'سطر' }, { n: 2, startMs: 2000, endMs: 2900, text: 'English only' }];
  const comparison = { fingerprintId: 'fp', drift: [], noArabic: [2], missing: [], extra: [], empty: [] };
  const items = reviewItems({ cues, issues: findIssues(cues), comparison, fingerprint: null, marks: resolveSlotMarks([], cues) });
  const flagged = items.filter((x) => x.problems.includes('ED_REVIEW_NO_ARABIC')).map((x) => x.startMs);
  assert.deepEqual(flagged, [2000], 'القطعة الإنجليزية وحدها');
});

test('U100: علامتان على مقطعين دُمجا تبقيان ظاهرتين في اللوحة، والصف بعلامة واحدة', () => {
  const cues = makeCues(5, { text: (i) => `نص ${i}` });
  const marks = [markOn(cues[1], 'todo'), markOn(cues[2], 'done')];
  const s = createEditSession({ cues });
  s.merge(1);
  const r = resolveSlotMarks(marks, s.snapshot(), { opened: null });
  assert.equal(r.byIndex.size, 1, 'الصف بعلامة واحدة');
  assert.equal(r.entries.length + r.orphans.length, 2, 'العلامتان في اللوحة');
  const g = reviewGroups({ issues: findIssues(s.snapshot()), comparison: null, marks: r });
  assert.equal(g.counts.todo + g.counts.done + g.counts.check + g.counts.orphan, 2);
});

// ---- U26: الوصول ----

test('U26: مقطّعة النطاق بالأسهم وتركيز متجوّل', async () => {
  const m = await mounted();
  m.field(1, 'text').focus();
  m.row(2).querySelector('[data-act="select"]').checked = true;
  m.row(2).querySelector('[data-act="select"]').click();
  await m.env.flush();
  const opts = m.env.root.querySelectorAll('.ed-seg__opt');
  const checked = () => opts.find((b) => b.getAttribute('aria-checked') === 'true');
  const from = checked();
  assert.equal(from.tabIndex, 0, 'المختار وحده في ترتيب Tab');
  assert.ok(opts.filter((b) => b !== from).every((b) => b.tabIndex === -1));
  from.focus();
  from.dispatchEvent({ type: 'keydown', key: 'ArrowLeft' });
  const to = checked();
  assert.ok(to !== from, 'السهم يختار التالي');
  assert.ok(m.doc.activeElement === to, 'ويركّزه');
});

test('U26: مناطق الحالة والتنبيه لا تُعاد كتابتها مع كل ضغطة حين لا يتغير نصها', async () => {
  const m = await mounted();
  const ta = m.field(1, 'text');
  ta.focus();
  ta.value = `${ta.value} أ`;
  ta.dispatchEvent({ type: 'input' });
  await m.env.flushFrames();
  const status = m.env.root.querySelector('.ed-status');
  const notice = m.env.root.querySelector('.ed-notice');
  const pill = status.firstChild;
  const noticeText = notice.childNodes[0];
  assert.ok(noticeText, 'التنبيه ظاهر (إزاحة 500 والنطاق «الملف كله»)');
  ta.value = `${ta.value}ب`;
  ta.dispatchEvent({ type: 'input' });
  await m.env.flushFrames();
  assert.ok(status.firstChild === pill, 'شارة الحالة نفسها');
  assert.ok(notice.childNodes[0] === noticeText, 'نص التنبيه نفسه');
});

test('U26: خطأ نص المقطع مربوط بحقله (aria-describedby وaria-invalid)', async () => {
  const m = await mounted();
  m.editor.state.session.setText(1, '');
  await m.env.flush();
  const ta = m.field(1, 'text');
  assert.equal(ta.getAttribute('aria-describedby'), 'ed-msg-1');
  assert.equal(ta.getAttribute('aria-invalid'), 'false', 'الفارغ تنبيه لا خطأ');
  m.editor.state.session.setText(1, `نص${String.fromCharCode(0)}`);
  await m.env.flush();
  assert.equal(m.field(1, 'text').getAttribute('aria-invalid'), 'true');
});

test('U26: لا أسطر فارغة ظاهرة في حواري التقرير والنص الدراسي', async () => {
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const visibleEmpty = (dlg) => findAll(dlg, (e) => (e.tagName === 'p' || e.tagName === 'div') && !e.hidden && !e.childNodes.length && !e.classList.contains('tj-dialog__footer'));
  const study = openStudyDialog({ doc: env.doc, hasEnglish: true, build: () => ({ file: { name: 'AAAAAAAAAAA.ar.study.md', text: 'x' } }) });
  await settle();
  assert.deepEqual(visibleEmpty(dialogOf(env.doc)).map((e) => e.tagName), [], 'النص الدراسي');
  dialogOf(env.doc).close('cancel');
  await study;
  const report = openReportDialog({ doc: env.doc, build: () => ({ count: 0, file: null }) });
  await settle();
  assert.deepEqual(visibleEmpty(dialogOf(env.doc)).map((e) => e.tagName), [], 'التقرير بلا بنود');
  dialogOf(env.doc).close('cancel');
  await report;
});

test('U26: إطار حقل النص برمز حدود الحقول (تباين 3:1) لا الحد الشعري', () => {
  const css = readFileSync(new URL('../../../../src/pages/editor/editor.css', import.meta.url), 'utf8');
  const rule = /\.ed-row__text \{[^}]*\}/.exec(css)[0];
  assert.match(rule, /border: 1px solid var\(--tj-border-input\)/);
});

// ---- U27: السلوك والنصوص ----

test('U27: «كلمة كاملة» تطابق الكلمة المشكولة آخرها، والاستبدال عبر فاصل سطر يبقيه', () => {
  assert.equal(searchCues([{ n: 1, startMs: 0, endMs: 1, text: 'جاء محمدٌ اليوم' }], 'محمد', { wholeWord: true }).length, 1);
  assert.equal(searchCues([{ n: 1, startMs: 0, endMs: 1, text: 'جاء محمدان' }], 'محمد', { wholeWord: true }).length, 0, 'ولا تطابق جزء كلمة');
  const cues = [{ n: 1, startMs: 0, endMs: 1, text: 'ذهبنا في\nالمدينة القديمة' }];
  const matches = searchCues(cues, 'في المدينة');
  assert.equal(matches.length, 1);
  assert.equal(planReplace(cues, matches, 'في القرية').changes[0].after, 'ذهبنا في\nالقرية القديمة');
  const same = [{ n: 1, startMs: 0, endMs: 1, text: 'أول السطر\nثاني السطر' }];
  assert.deepEqual(planReplace(same, searchCues(same, 'السطر ثاني'), 'السطر ثاني').changes, [], 'الاستبدال بالنص نفسه لا يغيّر شيئًا');
});

test('U27: مسودة زمن غير صالح وحدها ظاهرة في الشارة والشريط والعنوان وحوار التبديل', async () => {
  const m = await mounted({ bundle: sampleBundle({ third: true }) });
  const f = m.field(0, 'start');
  f.focus();
  f.value = '00:00:0x,000';
  f.dispatchEvent({ type: 'change' });
  await m.env.flush();
  assert.equal(m.editor.state.session.dirty, false);
  assert.notEqual(textOf(m.env.root.querySelector('.ed-status')), 'محفوظ', 'الشارة لا تقول «محفوظ»');
  assert.equal(m.env.root.querySelector('.ed-unsaved').hidden, false, 'الشريط ظاهر');
  assert.ok(m.doc.title.startsWith('●'), 'العنوان بعلامة التغيير');
  const switching = m.editor.switchSlot(3);
  await settle();
  const body = textOf(dialogOf(m.doc));
  assert.ok(!/0 تغيير/.test(body), `لا «0 تغيير»: ${body}`);
  dialogOf(m.doc).close('stay');
  await switching;
});

test('U27: حالتا الخطأ (معرّف غير صالح وسجل تالف) فيهما زر «المحفوظات»', async () => {
  for (const [videoId, store] of [
    [null, createStore({ area: createMemoryArea({ unlimited: true }) })],
    ['BBBBBBBBBBB', { ...createStore({ area: createMemoryArea({ unlimited: true }) }), getBundle: async () => { throw new TjError('ST_CORRUPT_RECORD'); } }],
  ]) {
    const env = editorDocument({ videoId: videoId ?? 'x' });
    const r = await mountEditor(env.root, { videoId, store, doc: env.doc });
    assert.equal(r, null);
    const back = buttonNamed(env.root, 'المحفوظات');
    assert.ok(back, `زر الخروج (${videoId})`);
    back.click();
    assert.match(env.doc.defaultView.location.assigned ?? '', /library\/index\.html/);
  }
});

test('U27: مرساة حوار الانجراف تقبل الأرقام العربية كحقل الزمن المجاور', async () => {
  const env = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const done = openDriftDialog({ doc: env.doc, cues: makeCues(20), activeIndex: null });
  await settle();
  const dlg = dialogOf(env.doc);
  // الـDOM الوهمي لا يعكس سمة value في الخاصية، فتُكتب المرساتان كلتاهما.
  const [nA, nB] = dlg.querySelectorAll('input[inputmode=numeric]');
  nB.value = '20';
  nA.value = '١٢';
  nA.dispatchEvent({ type: 'input' });
  assert.ok(!textOf(dlg).includes('لا مقطع بهذا الرقم'), 'قُرئ ١٢');
  dlg.close('cancel');
  await done;
});

test('U27: تلميحات الاختصارات بحسب المنصة، واسم الخانة معزول في قائمة المرجع، و«(+N)» معزول', async () => {
  const pc = await mounted();
  const undo = pc.env.root.querySelector('.ed-undo');
  pc.editor.state.session.setText(0, 'تعديل');
  await pc.env.flush();
  assert.match(undo.title, /Ctrl\+Z/, 'Ctrl على غير ماك');
  assert.doesNotMatch(undo.title, /⌘/);
  assert.match(pc.env.root.querySelector('input[type=search]').getAttribute('placeholder'), /Ctrl\+F/);
  const mac = await mounted({ before: (env) => { env.doc.defaultView.navigator = { platform: 'MacIntel' }; } });
  mac.editor.state.session.setText(0, 'تعديل');
  await mac.env.flush();
  assert.match(mac.env.root.querySelector('.ed-undo').title, /⌘Z/);

  assert.equal(refOptionLabel(2, 'Review (v2)'), `الترجمة 2 — ${FSI}Review (v2)${PDI}`);

  pc.editor.state.session.setTime(1, 'end', pc.editor.state.session.cueAt(1).startMs + 100);
  pc.editor.state.session.setText(1, '');
  await pc.env.flush();
  const msg = pc.row(1).querySelector('.ed-row__msg').textContent;
  assert.ok(msg.includes(`(${LRI}+1${PDI})`), `«(+N)» معزول: ${msg}`);
});

// ---- U75: تصدير الأصل ----

test('U75: تصدير «الأصل المستورد» من المحرّر بإزاحة غير صفرية يسأل عن التوقيت كالمحفوظات، والظاهر افتراضي', async () => {
  const saved = [];
  const m = await mounted({ saveFile: async (file) => { saved.push(file); return { ok: true, mode: 'downloads' }; } });
  m.editor.setView('original');
  await m.env.flush();
  buttonNamed(m.env.root, 'تصدير الأصل').click();
  await settle();
  const dlg = dialogOf(m.doc);
  assert.equal(dlg.querySelectorAll('input[name=ed-timing]').length, 2, 'سؤال التوقيت للأصل');
  dlg.close('download');
  await settle(8);
  assert.equal(saved.length, 1);
  assert.match(saved[0].name, /\.ar\.original\.srt$/);
  const original = m.editor.state.info.original[0];
  const first = /(\d\d):(\d\d):(\d\d),(\d{3}) -->/.exec(saved[0].text);
  const ms = ((Number(first[1]) * 60 + Number(first[2])) * 60 + Number(first[3])) * 1000 + Number(first[4]);
  assert.equal(ms, original.startMs + 500, 'الظاهر: الأصل + إزاحة العرض');
});

// ---- U16 وI06: التخطيط والخيارات ----

test('U16: الصفحة تتمرر حين لا يتسع الارتفاع، وطي بعتبتي عرض وارتفاع، وحد أدنى للقائمة', () => {
  const css = readFileSync(new URL('../../../../src/pages/editor/editor.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /body\.ed-page \{[^}]*overflow: hidden/, 'لا قص للصفحة');
  assert.match(css, /@media \(max-height: 700px\)/, 'عتبة الارتفاع');
  assert.match(css, /--ed-list-min:/, 'حد أدنى للقائمة');
});

test('U16: زرّا الطي (الأدوات واللوحة الجانبية) بحالتهما، والتبويب يفتح اللوحة المطوية', async () => {
  const m = await mounted();
  const tools = m.env.root.querySelector('.ed-fold--tools');
  const side = m.env.root.querySelector('.ed-fold--side');
  assert.equal(tools.getAttribute('aria-expanded'), 'false');
  tools.click();
  assert.equal(tools.getAttribute('aria-expanded'), 'true');
  assert.ok(m.env.root.classList.contains('ed-tools-open'));
  assert.equal(side.getAttribute('aria-expanded'), 'false');
  m.env.root.querySelector('#ed-tab-complete').click();
  assert.equal(side.getAttribute('aria-expanded'), 'true', 'اختيار تبويب يفتح اللوحة');
  assert.ok(m.env.root.classList.contains('ed-side-open'));
});

test('I06: زر خيارات البحث يتحكم بلوحة لا قائمة: aria-controls بلا aria-haspopup', async () => {
  const m = await mounted();
  const opts = buttonNamed(m.env.root, 'الخيارات');
  assert.equal(opts.hasAttribute('aria-haspopup'), false);
  const id = opts.getAttribute('aria-controls');
  assert.ok(id && m.env.root.querySelector(`#${id}`)?.classList.contains('ed-search__opts'));
});
