// TJ-50، جزء المحرّر (pages/editor/dialogs.js:10-27): سبب التعطيل داخل الزر وفي aria-describedby معًا.
// تقريب حساب الاسم (accname 1.2 للاسم من المحتوى): aria-label إن وُجد، وإلا نص كل الأحفاد غير المخفية (tj-sr-only ليس مخفيًا).
import { ROOT, log, mounted, buttonNamed, textOf } from './harness.mjs';

const nameOf = (b) => b.getAttribute('aria-label') ?? b.textContent;
const descOf = (b, doc) => {
  const id = b.getAttribute('aria-describedby');
  if (!id) return null;
  const d = [...doc.body.descendants()].find((e) => e.getAttribute?.('id') === id);
  return d ? { text: d.textContent, insideButton: b.contains(d) } : { text: '(غير موجود)', insideButton: false };
};
const m = await mounted();
const doc = m.env.doc;
for (const label of ['حفظ', 'استبدال هنا', 'معاينة استبدال الكل…', 'تراجع', 'إعادة']) {
  const b = label === 'حفظ' ? m.env.root.querySelector('.ed-head .tj-btn--primary') : buttonNamed(m.env.root, label)
    ?? [...m.env.root.descendants()].find((e) => e.tagName === 'button' && textOf(e).startsWith(label));
  if (!b) { log(label, ': لم يُعثر عليه'); continue; }
  const d = descOf(b, doc);
  log(`«${label}»: aria-disabled=${b.getAttribute('aria-disabled')} | الاسم ≈ ${JSON.stringify(nameOf(b))} | الوصف = ${JSON.stringify(d?.text ?? null)} | عقدة الوصف داخل الزر؟ ${d?.insideButton ?? '—'}`);
}
// ضابط المكوّن العام ui/components.js (disabledReason عند الإنشاء)
const { button } = await import(`${ROOT}/src/ui/components.js`);
const b2 = button({ label: 'استعادة التوقيت الأصلي…', disabledReason: 'للقراءة فقط', doc });
doc.body.append(b2);
log(`[components.js] الاسم ≈ ${JSON.stringify(nameOf(b2))} | الوصف = ${JSON.stringify(descOf(b2, doc)?.text)} | داخل الزر؟ ${descOf(b2, doc)?.insideButton}`);
