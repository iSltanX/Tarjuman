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
  doc.body.append(f.root); // كالمتصفح: المفصول لا يُركَّز (U72)
  f.input.focus();
  assert.ok(doc.activeElement === f.input);
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
  assert.ok(p.button(3) === null);
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

test('محدد الترجمات: التحديث بالقائمة نفسها لا ينقل الأزرار (نقل الزر المركّز يُسقط التركيز)، وينقل ما تغيّر موضعه وحده', () => {
  const doc = newDocument();
  const s = (filled, active) => [1, 2, 3].map((n) => ({ n, filled: filled.includes(n), active: n === active, name: null }));
  const p = slotPicker({ slots: s([1, 2, 3], 1), doc });
  const before = [...p.buttons];
  let moves = 0;
  const ins = p.root.insertBefore.bind(p.root);
  p.root.insertBefore = (n, r) => { moves++; return ins(n, r); };
  p.update(s([1, 2, 3], 2));
  assert.equal(moves, 0, 'لا نقل بلا تغيير موضع');
  // مواضع الأزرار في before لا الأزرار نفسها: فشل deepEqual على عقدة يفحص الـDOM الوهمي كله (library/fake-dom.js).
  assert.deepEqual(p.buttons.map((b) => before.indexOf(b)), [0, 1, 2], 'الأزرار نفسها بترتيبها');
  assert.equal(p.button(2).getAttribute('aria-checked'), 'true');
  p.update(s([1, 3], 3));
  assert.deepEqual(p.buttons.map((b) => b.textContent), ['1', '3']);
  assert.ok(p.button(3) === before[2], 'زر الخانة 3 هو نفسه بعد حذف الثانية');
});

// الهوية (docs/identity-v4.md) تحل محل حدّ الإبراز في CL-011: المختار صبغة بلا إطار، ودليله نصه بلون أغمق (≥ 4.5:1 على
// صبغته)، وحلقة التركيز بجواره ≥ 3:1؛ وأهداف الضغط الصغيرة مكبّرة كما هي (CL-018).
test('المختار في المقطّعات صنوبر بلا إطار بنص ≥ 4.5:1 بالوضعين، وحلقة التركيز على المسار حوله ≥ 3:1؛ وأهداف الضغط الصغيرة مكبّرة (CL-018)', async () => {
  const tokens = await readFile(path.join(ROOT, 'src/ui/tokens.css'), 'utf8');
  const dark = tokens.slice(tokens.indexOf('@media (prefers-color-scheme: dark)'));
  const light = tokens.slice(0, tokens.indexOf('@media (prefers-color-scheme: dark)'));
  const hex = (block, name) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(block)?.[1];
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [name, block] of [['فاتح', light], ['داكن', dark]]) {
    assert.ok(ratio(hex(block, 'tj-selected-ink'), hex(block, 'tj-selected')) >= 4.5, `${name}: نص المختار على صبغته`);
    // الحلقة بإزاحة 2 خارج الخيار، فتقع على مسار المقطّعة (surface-2) لا على صبغة المختار (الهوية الرابعة، لوحة 08).
    assert.ok(ratio(hex(block, 'tj-focus'), hex(block, 'tj-surface-2')) >= 3, `${name}: التركيز على المسار`);
    assert.ok(ratio(hex(block, 'tj-text-2'), hex(block, 'tj-surface-2')) >= 4.5, `${name}: غير المختار على المسار`);
  }
  const ui = await readFile(path.join(ROOT, 'src/ui/components.css'), 'utf8');
  assert.match(ui, /\.tj-seg__option input:checked \+ \.tj-seg__label \{ background: var\(--tj-selected\); color: var\(--tj-selected-ink\);/);
  assert.match(ui, /\.tj-chip \{[^}]*min-height: 32px/);
  assert.match(ui, /\.tj-slots__slot::after \{ content: ""; position: absolute; inset: -4px 0; \}/);
  const editor = await readFile(path.join(ROOT, 'src/pages/editor/editor.css'), 'utf8');
  assert.match(editor, /\.ed-row__check \{ width: 24px; height: 24px;/);
  assert.match(editor, /\.ed-seg__opt\[aria-checked="true"\] \{ background: var\(--tj-selected\); color: var\(--tj-selected-ink\); \}/);
});
