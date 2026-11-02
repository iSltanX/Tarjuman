// المكوّنات المرفوعة إلى src/ui (P10-AC7، عقد interfaces §١٥): المقطّعة، وحقل الرقم بوحدة، وعلامة «حُفظ»، والرسالة
// العابرة بتراجع، واختيار الترجمة 1 2 3؛ بحالاتها وأسماء الوصول، وdom وtextContent فقط، وبأصناف tj- في components.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { numberField, savedMark, segmented } from '../../../src/ui/forms.js';
import { createToaster, TOAST_MAX } from '../../../src/ui/toast.js';
import { slotLabel, slotPicker } from '../../../src/ui/components.js';
import { slotModels } from '../../../src/core/model/bundle.js';
import { newDocument, textOf } from '../pages/library/fake-dom.js';
import { sampleBundle } from '../../helpers/fixtures-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
function timers() {
  const q = new Map();
  let n = 0;
  return { setTimer: (fn, ms) => { q.set(++n, { fn, ms }); return n; }, clearTimer: (id) => q.delete(id), q, runAll() { const b = [...q.values()]; q.clear(); b.forEach((t) => t.fn()); } };
}

test('المقطّعة: radio حقيقية بأسطورة مخفية، والتغيير يبلّغ مرة، وset بلا إبلاغ، والمعطّل بسببه', () => {
  const doc = newDocument();
  const seen = [];
  const s = segmented({ legend: 'الخطوة', value: 'a', onChange: (v) => seen.push(v), doc, options: [{ value: 'a', label: 'أ' }, { value: 'b', label: 'ب' }, { value: 'c', label: 'ج', disabledReason: 'غير متاح' }] });
  assert.equal(s.root.tagName, 'fieldset');
  assert.equal(s.root.classList.contains('tj-seg'), true);
  assert.equal(textOf(s.root.querySelector('legend')), 'الخطوة');
  s.inputs[1].checked = true;
  s.inputs[1].dispatchEvent({ type: 'change' });
  s.inputs[1].dispatchEvent({ type: 'change' });
  assert.deepEqual(seen, ['b']);
  s.set('a');
  assert.equal(s.value(), 'a');
  assert.deepEqual(seen, ['b']);
  assert.equal(s.inputs[2].disabled, true);
  assert.equal(s.inputs[2].parentNode.title, 'غير متاح');
});

test('حقل الرقم بوحدة: الخطأ تحت الحقل بلا حفظ، والصالح يُحفظ، وset لا يمس الحقل المركّز إلا بـforce', async () => {
  const doc = newDocument();
  const commits = [];
  const f = numberField({ label: 'العتبة', unit: 'ms', hint: 'تلميح', value: '100', parse: (t) => (/^\d+$/.test(t) ? { ok: true, value: Number(t) } : { ok: false, code: 'MD_INVALID' }), commit: (v) => commits.push(v), doc });
  assert.equal(f.root.classList.contains('tj-num'), true);
  assert.equal(textOf(f.root.querySelector('.tj-num__unit')), 'ms');
  f.input.value = 'x';
  f.input.dispatchEvent({ type: 'change' });
  assert.equal(f.root.classList.contains('tj-field--error'), true);
  assert.equal(f.input.getAttribute('aria-invalid'), 'true');
  assert.deepEqual(commits, []);
  f.input.value = '250';
  f.input.dispatchEvent({ type: 'change' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(commits, [250]);
  assert.equal(f.input.getAttribute('aria-invalid'), 'false');
  f.input.focus();
  f.set('999');
  assert.equal(f.input.value, '250', 'لا تُمحى كتابة المستخدم');
  f.set('999', { force: true });
  assert.equal(f.input.value, '999');
});

test('علامة «حُفظ»: منطقة حيّة، وتختفي بعد مدتها، والخطأ أطول', () => {
  const doc = newDocument();
  const t = timers();
  const m = savedMark({ doc, ...t });
  assert.equal(m.root.getAttribute('aria-live'), 'polite');
  m.flash('حُفظ');
  assert.equal(m.root.className, 'tj-saved tj-saved--success');
  assert.equal(textOf(m.root), 'حُفظ');
  const okMs = [...t.q.values()][0].ms;
  t.runAll();
  assert.equal(textOf(m.root), '');
  m.flash('تعذّر', 'danger');
  assert.ok([...t.q.values()][0].ms > okMs);
});

test('الرسالة العابرة: نبرة بنص، وإعلان، وحد ثلاث، وزر «تراجع» يزيل الرسالة وينفّذ مرة', () => {
  const doc = newDocument();
  const t = timers();
  const toaster = createToaster({ doc, ...t });
  let undone = 0;
  const node = toaster.show('الترجمة 2', 'info', { action: { label: 'تراجع', onClick: () => { undone++; } } });
  assert.equal(node.classList.contains('tj-toast--info'), true);
  const btn = node.querySelector('.tj-toast__action');
  assert.equal(textOf(btn), 'تراجع');
  btn.click();
  assert.equal(undone, 1);
  assert.equal(toaster.root.children.length, 0);
  for (let i = 0; i < TOAST_MAX + 2; i++) toaster.show(`رسالة ${i}`, 'success');
  assert.equal(toaster.root.children.length, TOAST_MAX);
  t.runAll();
  assert.equal(textOf(toaster.live).length > 0, true, 'أُعلن');
});

test('محدد الترجمات من نماذج الحزمة: المحفوظة وحدها بأرقامها، والنشطة aria-checked، وأسماء الوصول والاسم المختصر تلميحًا', () => {
  const doc = newDocument();
  const picked = [];
  const p = slotPicker({ slots: slotModels(sampleBundle()), onSelect: (n) => picked.push(n), doc });
  const [b1, b2] = p.buttons;
  assert.equal(p.buttons.length, 2, 'لا زر للخانة الفارغة');
  assert.equal(p.root.hidden, false);
  assert.equal(b1.getAttribute('aria-checked'), 'true');
  assert.equal(b1.getAttribute('aria-label'), 'الترجمة 1، نشطة');
  assert.equal(b2.title, 'الترجمة 2 — مراجعة');
  assert.equal(p.button(3), null);
  b1.click();
  b2.click();
  assert.deepEqual(picked, [2], 'النشطة لا تبلّغ');
  assert.equal(slotLabel({ n: 2, filled: true, active: false }), 'الترجمة 2');
});

test('محدد الترجمات يُعاد بناؤه بالإضافة والحذف: ترجمة واحدة تخفيه، وثلاث تعرض الثلاث، والربط برقم الخانة لا بموضع الزر', () => {
  const doc = newDocument();
  const picked = [];
  const s = (filled, active) => [1, 2, 3].map((n) => ({ n, filled: filled.includes(n), active: n === active, name: null }));
  const p = slotPicker({ slots: s([1], 1), onSelect: (n) => picked.push(n), doc });
  assert.equal(p.root.hidden, true, 'ترجمة واحدة: لا «1» وحده');
  p.update(s([1, 2, 3], 3));
  assert.equal(p.root.hidden, false);
  assert.deepEqual(p.buttons.map((b) => [b.textContent, b.getAttribute('aria-checked')]), [['1', 'false'], ['2', 'false'], ['3', 'true']]);
  p.update(s([2, 3], 2));
  assert.deepEqual(p.buttons.map((b) => b.textContent), ['2', '3'], 'حُذفت الأولى');
  p.buttons[1].click();
  assert.deepEqual(picked, [3]);
  p.update(s([], null));
  assert.equal(p.buttons.length, 0);
  assert.equal(p.root.hidden, true);
});

test('أصناف المكوّنات المرفوعة معرّفة في components.css بالوضعين (رموز tj- لا ألوان ثابتة)', async () => {
  const css = await readFile(path.join(ROOT, 'src/ui/components.css'), 'utf8');
  for (const cls of ['.tj-seg', '.tj-num', '.tj-num__unit', '.tj-saved--success', '.tj-saved--danger', '.tj-toast--action', '.tj-toast__action', '.tj-slots__slot', '.tj-chip', '.tj-choice', '.tj-menu__item']) {
    assert.ok(css.includes(cls), cls);
  }
  const added = css.slice(css.indexOf('.tj-toast--action'), css.indexOf('/* ---- مقياس السعة'));
  assert.doesNotMatch(added, /#[0-9a-f]{3,8}\b|rgb\(/i, 'الألوان من الرموز وحدها');
});
