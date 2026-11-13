// توطين لوحة النص المتزامن: الواجهة الإنجليزية بلا حرف عربي خارج بيانات المستخدم، وlang وdir على مضيف اللوحة وجذرها وحدهما، وإعادة البناء عند تبدّل اللغة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale } from '../../../../src/i18n/index.js';
import { isolate } from '../../../../src/ui/format.js';
import { HEALTH_MS } from '../../../../src/player/panel/index.js';
import { earlierTip, editFieldLabel, editHintText, editIssueText, editedNote, laterTip, offsetMeaningShort, statusParts, withOriginal } from '../../../../src/player/panel/text.js';
import { panelCss } from '../../../../src/player/panel/styles.js';
import { english, makeState, ui, watchPage } from './harness.js';

const ARABIC = /[؀-ۿ]/;
/** نصوص المستخدم في الحالة الوهمية: سطور الترجمة «سطر n» واسم الخانة «مراجعة» وعنوان الفيديو. */
const USER = /سطر \d+|مراجعة|محاضرة/g;

test('الدوال النقية بالإنجليزية: لا حرف عربي', () => {
  setLocale('en');
  try {
    const out = [earlierTip(500), laterTip(1500), offsetMeaningShort(300), offsetMeaningShort(-300), offsetMeaningShort(0), withOriginal('English'), ...statusParts({ slot: 2, name: null, count: 412 }), ...statusParts({ slot: 1, name: 'My notes', count: 1 })];
    for (const t of out) assert.ok(!ARABIC.test(t), t);
    assert.equal(statusParts({ slot: 2, name: 'Review', count: 3 }).join(' | '), `Synced | Translation 2 “${isolate('Review')}” | 3 segments`);
  } finally {
    setLocale('ar');
  }
});

test('الفكرة ٦: نصوص تحرير المقطع بالإنجليزية بلا عربية، وأسماء المفاتيح في سطر المفاتيح معزولة LTR باللغتين', () => {
  const LRI = String.fromCodePoint(0x2066);
  const PDI = String.fromCodePoint(0x2069);
  const keys = (s) => [...s.matchAll(new RegExp(`${LRI}([^${PDI}]*)${PDI}`, 'g'))].map((m) => m[1]);
  const issues = ['ED_TEXT_EMPTY', 'ED_TEXT_BLANK_LINE', 'ED_TEXT_BREAKS_SRT', 'ED_TEXT_INVALID'].map((code) => ({ code, params: code === 'ED_TEXT_INVALID' ? { max: 5000 } : null }));
  assert.deepEqual(keys(editHintText()), ['Enter', 'Shift+Enter', 'Esc']);
  assert.equal(editedNote(12), 'عُدِّل نص المقطع 12');
  assert.match(editIssueText(issues[3]), /أطول من 5000 حرف/);
  setLocale('en');
  try {
    const out = [editHintText(), editedNote(12), editFieldLabel(12), ...issues.map(editIssueText)];
    for (const t of out) assert.ok(!ARABIC.test(t), t);
    assert.deepEqual(keys(editHintText()), ['Enter', 'Shift+Enter', 'Esc']);
    assert.equal(editedNote(12), 'Edited the text of segment 12');
    assert.match(editIssueText(issues[3]), /longer than 5000 characters/);
  } finally {
    setLocale('ar');
  }
});

test('اللوحة الجاهزة بالإنجليزية: النص بلا عربية (عدا بيانات المستخدم)، وdir وlang على المضيف والجذر، ولا يُلمس عمود يوتيوب', () => {
  setLocale('en');
  try {
    const page = watchPage({ state: makeState({ english: english() }) });
    page.mount();
    const v = ui(page);
    assert.equal(v.host.getAttribute('dir'), 'ltr');
    assert.equal(v.host.getAttribute('lang'), 'en');
    assert.equal(v.q('.root').getAttribute('dir'), 'ltr');
    assert.equal(v.q('.root').getAttribute('lang'), 'en');
    assert.equal(page.inner.getAttribute('dir'), null, 'عمود يوتيوب كما هو');
    assert.equal(page.flexy.getAttribute('lang'), null);
    const text = v.root.textContent.replace(USER, '');
    assert.equal(ARABIC.test(text), false, text);
    const labels = v.qa('[aria-label],[title]').map((e) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''}`).join(' ').replace(USER, '');
    assert.equal(ARABIC.test(labels), false, labels);
    assert.ok(panelCss().includes(':host([dir="ltr"])'), 'الاتجاه على المضيف من الصفة لا من قيمة ثابتة');
  } finally {
    setLocale('ar');
  }
});

test('حالة الفراغ بالإنجليزية: الخطوات بلا عربية', () => {
  setLocale('en');
  try {
    const page = watchPage({ state: makeState({ arabic: null, activeSlot: null, english: english() }) });
    page.mount();
    const v = ui(page);
    const steps = v.qa('.steps li').map((li) => li.textContent);
    assert.equal(steps.length, 3);
    assert.match(steps[0], /^English · manual · 3 segments · captured$/);
    assert.equal(ARABIC.test(steps.join(' ')), false);
  } finally {
    setLocale('ar');
  }
});

test('relocalize: تُعاد بناء اللوحة بلغتها الجديدة ولا تتغير بدونه', () => {
  const page = watchPage();
  const handle = page.mount();
  const before = ui(page).host;
  assert.equal(before.getAttribute('lang'), 'ar');
  assert.equal(before.getAttribute('dir'), 'rtl');
  handle.relocalize();
  page.env.win.advance(HEALTH_MS * 2);
  assert.ok(ui(page).host === before, 'اللغة لم تتبدل: الجلسة نفسها');
  setLocale('en');
  try {
    handle.relocalize();
    page.env.win.advance(HEALTH_MS * 2);
    const after = ui(page).host;
    assert.ok(after !== before, 'جلسة جديدة');
    assert.equal(after.getAttribute('lang'), 'en');
    assert.equal(after.getAttribute('dir'), 'ltr');
    assert.equal(handle.diagnostics().attempts, 2);
    assert.equal(page.inner.children.filter((c) => c.id === 'tarjuman-panel').length, 1);
  } finally {
    setLocale('ar');
  }
});
