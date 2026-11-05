// تدقيق 7a66f91، المرحلة C6 (أسطح المشغّل): لوحة النص المتزامن. سكربتات الإعادة في docs/audit-7a66f91/verify/player
// (m11-transcript وpanel-misc وa022) وverify-ds/ui (v01-player) صارت اختبارات انحدار تفشل على الشيفرة السابقة للسبب المقصود.
// والمقارنة بين العقد بالهوية (assert.ok(a === b)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { DEFAULT_PREFS, mergePrefs } from '../../../../src/core/model/prefs.js';
import { panelCss } from '../../../../src/player/panel/styles.js';
import * as P from './harness.js';

const flushN = async (n = 5) => { for (let i = 0; i < n; i++) await P.settle(); };
const tabbable = (u) => u.qa('.t').filter((b) => b.getAttribute('tabindex') !== '-1');

async function mounted(over = {}, controllerOpts = {}) {
  const page = P.watchPage({ state: P.makeState(over), controllerOpts });
  page.mount();
  await flushN(3);
  return { page, u: P.ui(page) };
}

// ———— U45 ————

test('U45: صفوف كثيرة نقطة Tab واحدة (tabindex متنقل)، والأسهم وHome وEnd تنقل التركيز بين الصفوف', async () => {
  const { u } = await mounted({ arabic: { cues: P.arCues(300), edited: false, fileName: 'x.srt', comparison: null } });
  assert.equal(u.rows().length, 300);
  assert.equal(tabbable(u).length, 1, 'نقطة Tab واحدة');
  const times = u.qa('.t');
  times[0].focus();
  times[0].dispatchEvent({ type: 'focusin', bubbles: true });
  P.key(times[0], 'ArrowDown');
  assert.ok(u.root.activeElement === times[1], 'السهم إلى التالي');
  assert.deepEqual(tabbable(u).map((b) => b.parentNode.getAttribute('data-i')), ['1'], 'والنقطة تتبع التركيز');
  P.key(times[1], 'End');
  assert.ok(u.root.activeElement === times[299], 'End إلى الأخير');
  P.key(times[299], 'Home');
  assert.ok(u.root.activeElement === times[0], 'Home إلى الأول');
  P.key(times[0], 'ArrowUp');
  assert.ok(u.root.activeElement === times[0], 'لا التفاف قبل الأول');
});

test('U45: زر الزمن موصوف بنص صفه (والأصل تحته)، فيُقرأ المقطع لا زمنه وحده', async () => {
  const prefs = mergePrefs(DEFAULT_PREFS, { ui: { panelOpen: true, panelDual: true } });
  const { u } = await mounted({ english: P.english(), prefs });
  const row = u.rows()[1];
  const t = row.querySelector('.t');
  const ids = String(t.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  assert.equal(ids.length, 2, 'العربي والأصل');
  // بالسمة: الـDOM الوهمي لا يربط setAttribute('id') بخاصية id التي يطابقها محدد #.
  assert.equal(u.qa(`[id="${ids[0]}"]`)[0]?.textContent, 'سطر 2');
  assert.equal(u.qa(`[id="${ids[1]}"]`)[0]?.textContent, 'line 2');
});

test('U45: التركيز بلوحة المفاتيح داخل القائمة يوقف التتبّع، والتركيز بنقرة على صف لا', async () => {
  const { page, u } = await mounted({ arabic: { cues: P.arCues(40), edited: false, fileName: 'x.srt', comparison: null } });
  P.layoutList(u.list, { rowH: 50, viewH: 400 });
  const t = u.qa('.t')[10];
  t.dispatchEvent({ type: 'pointerdown', bubbles: true });
  t.focus();
  t.dispatchEvent({ type: 'focusin', bubbles: true });
  t.dispatchEvent({ type: 'pointerup', bubbles: true });
  page.win.advance(10);
  assert.equal(u.switchEl.getAttribute('aria-checked'), 'true', 'النقرة لا توقف التتبّع');
  const k = u.qa('.t')[20];
  k.focus();
  k.dispatchEvent({ type: 'focusin', bubbles: true });
  await flushN(2);
  assert.equal(u.switchEl.getAttribute('aria-checked'), 'false', 'Tab إلى صف يوقفه فلا تُسحب القائمة من تحته');
});

// ———— U48 ————

test('U48: جذر اللوحة عربي (lang)، وسطر الأصل بلغة مساره', async () => {
  const prefs = mergePrefs(DEFAULT_PREFS, { ui: { panelOpen: true, panelDual: true } });
  const { u } = await mounted({ english: P.english({ lang: 'en-GB' }), prefs });
  assert.equal(u.q('.root').getAttribute('lang'), 'ar');
  const en = u.qa('.en');
  assert.ok(en.length > 0);
  assert.ok(en.every((e) => e.getAttribute('lang') === 'en-GB'));
});

test('U48: حقل الخطوة المخصصة موصوف برسالة خطئه', async () => {
  const { u } = await mounted();
  const custom = u.q('.foot').querySelectorAll('[role="radio"]').find((b) => b.getAttribute('data-v') === 'custom');
  P.click(custom);
  await flushN(2);
  const step = u.q('input.num');
  step.value = '0.05';
  step.dispatchEvent({ type: 'change', target: step });
  await flushN(2);
  const err = u.q('.foot').querySelectorAll('div').find((d) => d.className === 'field-error');
  assert.equal(step.getAttribute('aria-invalid'), 'true');
  assert.ok(err.getAttribute('id'));
  assert.equal(step.getAttribute('aria-describedby'), err.getAttribute('id'));
});

// ———— U49 ————

const visibleAlerts = (u) => u.qa('[role="alert"]').filter((e) => {
  for (let n = e; n && n !== u.root; n = n.parentNode) if (n.hasAttribute?.('hidden')) return false;
  return true;
});

test('U49 (L-17): إخفاق إغلاق اللوحة من زرها يُقال داخلها', async () => {
  const { page, u } = await mounted({ english: P.english() }, { prefsFail: true });
  P.click(u.q('.head').querySelectorAll('button').at(-1));
  await flushN();
  assert.equal(u.host.getAttribute('data-mode'), 'open');
  const shown = visibleAlerts(u).map((a) => a.textContent);
  assert.ok(shown.some((t) => t.includes(messageFor('PL_PREFS_FAILED'))), JSON.stringify(shown));
  assert.equal(page.handle.diagnostics().session.actionFailures, 1);
});

test('U49 (L-17): إخفاق «فوق الأصل» يُقال داخل اللوحة، والفعل التالي يمسحه', async () => {
  const { u } = await mounted({ english: P.english() }, { prefsFail: true });
  P.click(u.segs()[1]);
  await flushN();
  assert.ok(visibleAlerts(u).some((a) => a.textContent.includes(messageFor('PL_PREFS_FAILED'))));
  P.click(u.q('.foot').querySelectorAll('button').find((b) => b.getAttribute('aria-label')?.startsWith('تأخير')));
  await flushN();
  assert.ok(!visibleAlerts(u).some((a) => a.textContent.includes(messageFor('PL_PREFS_FAILED'))));
});

test('U49 (N09): إخفاق «إخفاء الزر» لا يزيل رسالة التراجع صامتًا: تعود اللوحة ومعها السبب', async () => {
  const { u } = await mounted({}, { prefsFail: true });
  P.click(u.qa('.head .b')[0]);
  P.click(u.q('.menu [role="menuitem"]'));
  await flushN();
  assert.equal(u.host.getAttribute('data-mode'), 'open');
  assert.ok(visibleAlerts(u).some((a) => a.textContent.includes(messageFor('PL_PREFS_FAILED'))));
});

test('U49 (L-27): تحديد نص في صف أو النقر المزدوج عليه لا يقفز بالفيديو، والنقر على زمنه يقفز', async () => {
  const { page, u } = await mounted();
  const row = u.rows()[2];
  page.video.writes.length = 0;
  page.doc.getSelection = () => ({ isCollapsed: false, toString: () => 'سطر' });
  P.click(row.querySelector('.ar'));
  page.doc.getSelection = () => ({ isCollapsed: true, toString: () => '' });
  row.querySelector('.ar').dispatchEvent({ type: 'click', bubbles: true, detail: 2 });
  assert.deepEqual(page.video.writes, [], 'لا قفز');
  P.click(row.querySelector('.ar'));
  assert.equal(page.video.writes.length, 1, 'نقرة واحدة على النص بلا تحديد تقفز');
  page.doc.getSelection = () => ({ isCollapsed: false, toString: () => 'سطر' });
  P.click(row.querySelector('.t'));
  assert.equal(page.video.writes.length, 2, 'زر الزمن يقفز دائمًا');
});

test('U49 (CL-X2): سطر الحالة نص واحد يُقص بـ«…» داخل حاوية flex', async () => {
  const { u } = await mounted();
  const text = u.q('.status__text');
  assert.ok(text, 'نص الحالة في عنصر واحد');
  assert.ok(u.status.textContent.includes(text.textContent));
  const rule = panelCss().match(/\.status__text \{[^}]*\}/)?.[0] ?? '';
  for (const d of ['min-width: 0', 'overflow: hidden', 'text-overflow: ellipsis', 'white-space: nowrap']) assert.ok(rule.includes(d), d);
});
