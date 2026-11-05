// M-15 (اسم حوار التأكيد)، وL-19 (هل القائمة المشار إليها بـaria-controls موجودة في الشجرة؟)، وM-16 (مهلة «تراجع» وموضعه)،
// وTJ-AUD-020 (زر «إظهاره» في نافذة الأيقونة)، وL-7 (نصوص العدد).
import { TJ_ROOT as T } from '../_root.mjs';
const { confirmDialog } = await import(`${T}/src/ui/components.js`);
const { createMenu } = await import(`${T}/src/ui/menu.js`);
const { createToaster, TOAST_MS } = await import(`${T}/src/ui/toast.js`);
const { bindEntryRow } = await import(`${T}/src/pages/popup/entry.js`);
const { fingerprintLabel, deleteSummary } = await import(`${T}/src/pages/library/model.js`);
const { COUNT_FORMS, formatCount } = await import(`${T}/src/ui/format.js`);
const { messageFor } = await import(`${T}/src/core/errors/index.js`);
const { newDocument, settle, textOf, findAll } = await import(`${T}/test/unit/pages/library/fake-dom.js`);

// M-15
{
  const doc = newDocument();
  confirmDialog({ title: 'حذف بيانات هذا الفيديو؟', body: 'لا يمكن التراجع.', confirmLabel: 'حذف', tone: 'danger', doc }).catch((e) => console.log('(قيد الـDOM الوهمي: محدد [value] على خاصية لا سمة — لا أثر على الحكم)'));
  const d = doc.body.querySelector('dialog');
  const attrs = ['aria-labelledby', 'aria-describedby', 'aria-label', 'role'].map((a) => `${a}=${d.getAttribute(a)}`).join(' ');
  console.log('M-15) سمات <dialog>:', attrs, '| h2 له id =', Boolean(d.querySelector('h2').id), '| التركيز الأول (في الشيفرة): زر «إلغاء»');
}

// L-19
{
  const doc = newDocument();
  const m = createMenu({ label: 'المزيد', items: [{ id: 'a', label: 'أ', onSelect() {} }], doc });
  doc.body.append(m.root);
  const id = m.button.getAttribute('aria-controls');
  const target = doc.getElementById(id);
  console.log('L-19) aria-controls =', id, '| العنصر موجود في الشجرة =', Boolean(target), '| مخفي =', target?.hidden, '| role =', target?.getAttribute('role'));
}

// M-16
{
  const doc = newDocument();
  const delays = [];
  const toaster = createToaster({ doc, setTimer: (fn, ms) => { delays.push(ms); return delays.length; }, clearTimer: () => {} });
  toaster.show(messageFor('PG_SLOT_ACTIVATED', { n: 2 }), 'success', { action: { label: 'تراجع', onClick() {} } });
  console.log('M-16) مدة رسالة «تراجع» =', delays.filter((x) => x > 100), 'ms (TOAST_MS =', TOAST_MS, ') | نص الإعلان =', JSON.stringify(messageFor('PG_SLOT_ACTIVATED', { n: 2 })));
  const node = toaster.root.querySelector('.tj-toast');
  console.log('M-16) مستمعو mouseenter/focusin على الرسالة =', [...(node._listeners?.keys() ?? [])].join(',') || 'لا شيء');
}

// TJ-AUD-020: «إظهاره» في نافذة الأيقونة
{
  const doc = newDocument();
  const host = doc.createElement('div');
  doc.body.append(host);
  let prefs = { ui: { panelEntry: false } };
  const store = { getPrefs: async () => prefs, setPrefs: async (p) => { prefs = { ui: { ...prefs.ui, ...p.ui } }; return prefs; }, onChange: () => () => {} };
  const row = bindEntryRow({ store, host, doc });
  await row.ready;
  const btn = host.querySelector('[data-action="show-entry"]');
  btn.focus();
  btn.click();
  await settle(5);
  console.log('020/popup) بعد «إظهاره»: التركيز متصل =', doc.documentElement.contains(doc.activeElement), '| النتيجة =', textOf(host));
}

// L-7
const fp = (n) => fingerprintLabel({ trackKey: 'en|manual', mode: 'normal', count: 120, parts: Array.from({ length: n }, (_, i) => i) });
console.log('L-7) بصمة بجزأين:', fp(2), '| بـ11 جزءًا:', fp(11));
console.log('L-7) إعلان نتائج البحث:', [1, 2, 3, 11].map((n) => `${formatCount(n, COUNT_FORMS.video)} مطابق`).join(' | '));
