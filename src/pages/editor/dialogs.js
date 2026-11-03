// حوارات المحرّر فوق <dialog> (مواصفة التصميم §١٤.٢ TJ/Dialog بمقاساتها): أزرار بقيمها، وEsc إلغاء، والتركيز
// الأول على الخيار الآمن. confirmDialog في src/ui لا يكفي هنا: المعاينة والتصدير يحتاجان مقاسًا أكبر وأزرارًا
// تتعطّل بسببها أثناء فتح الحوار.
import { button, el } from '../../ui/components.js';

/**
 * يعطّل زرًا بسبب ظاهر ومقروء (§١٢ «معطّل بسبب») أو يعيده. الزر يبقى قابلًا للتركيز.
 * @param {HTMLButtonElement} b @param {string | null} reason
 */
export function setDisabled(b, reason) {
  let sr = b.querySelector(':scope > .tj-sr-only');
  if (!reason) {
    b.removeAttribute('aria-disabled');
    b.removeAttribute('title');
    b.removeAttribute('aria-describedby');
    sr?.remove();
    return;
  }
  b.setAttribute('aria-disabled', 'true');
  b.title = reason;
  if (!sr) {
    sr = el('span', { className: 'tj-sr-only', attrs: { id: `ed-reason-${Math.random().toString(36).slice(2, 8)}` }, doc: b.ownerDocument });
    b.append(sr);
  }
  sr.textContent = reason;
  b.setAttribute('aria-describedby', sr.id);
}

/**
 * @param {{
 *   doc: Document, title: string, body?: string, content?: HTMLElement | null, size?: 'sm' | 'md' | 'lg',
 *   tone?: 'default' | 'danger',
 *   actions: { label: string, value: string, variant?: 'primary' | 'secondary' | 'danger' | 'ghost', className?: string, ref?: (b: HTMLButtonElement) => void }[],
 *   focus?: string
 * }} o أول زر يحمل القيمة focus يأخذ التركيز (الافتراضي آخر زر، وهو الإلغاء عادةً)
 * @returns {Promise<string | null>} قيمة الزر، أو null عند Esc
 */
export function openDialog({ doc, title, body, content = null, size = 'sm', tone = 'default', actions, focus }) {
  return new Promise((resolve) => {
    const dialog = el('dialog', { className: `tj-dialog ed-dialog ed-dialog--${size}${tone === 'danger' ? ' tj-dialog--danger' : ''}`, attrs: { 'aria-labelledby': 'ed-dialog-title' }, doc });
    const buttons = actions.map((a) => {
      const b = button({ label: a.label, variant: a.variant ?? 'secondary', className: a.className ?? '', type: 'submit', value: a.value, doc });
      a.ref?.(b);
      return b;
    });
    dialog.append(el('form', {
      className: 'tj-dialog__form', attrs: { method: 'dialog' },
      children: [
        el('h2', { className: 'tj-dialog__title', text: title, attrs: { id: 'ed-dialog-title' }, doc }),
        body ? el('p', { className: 'tj-dialog__body', text: body, doc }) : null,
        content,
        el('div', { className: 'tj-dialog__footer', children: buttons, doc }),
      ],
      doc,
    }));
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue || null);
      dialog.remove();
    }, { once: true });
    dialog.addEventListener('cancel', () => {
      dialog.returnValue = '';
    });
    doc.body.append(dialog);
    dialog.showModal();
    (buttons.find((b) => b.value === focus) ?? buttons[buttons.length - 1])?.focus();
  });
}

/**
 * حارس المغادرة (§١١.٢): «البقاء» أساسي ومركَّز، و«المغادرة دون حفظ» صريحة.
 * @param {Document} doc @param {string} text
 */
export async function confirmLeave(doc, text) {
  const v = await openDialog({
    doc, title: 'مغادرة دون حفظ؟', body: text, tone: 'danger', focus: 'stay',
    actions: [{ label: 'البقاء', value: 'stay', variant: 'primary' }, { label: 'المغادرة دون حفظ', value: 'leave', variant: 'danger' }],
  });
  return v === 'leave';
}
