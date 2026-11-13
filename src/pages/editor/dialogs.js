// حوارات المحرّر فوق <dialog> (مواصفة التصميم §١٤.٢ TJ/Dialog بمقاساتها): أزرار بقيمها، وEsc إلغاء، والتركيز
// الأول على الخيار الآمن. confirmDialog في src/ui لا يكفي هنا: المعاينة والتصدير يحتاجان مقاسًا أكبر وأزرارًا
// تتعطّل بسببها أثناء فتح الحوار.
import { t } from '../../i18n/index.js';
import { button, el } from '../../ui/components.js';
import { holdPage } from '../../ui/page-hold.js';

/**
 * يعطّل زرًا بسبب ظاهر ومقروء (§١٢ «معطّل بسبب») أو يعيده. الزر يبقى قابلًا للتركيز. والسبب وصفٌ في عنصر aria-hidden فلا يدخل
 * اسم الزر المحسوب من محتواه (كان يُقرأ مرتين؛ تدقيق 7a66f91، U91).
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
    sr = el('span', { className: 'tj-sr-only', attrs: { id: `ed-reason-${Math.random().toString(36).slice(2, 8)}`, 'aria-hidden': 'true' }, doc: b.ownerDocument });
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
    // تبديل اللغة يُؤجَّل حتى يُغلق الحوار، فلا تتبدّل الصفحة خلفه ويبقى هو بلغة أخرى.
    const release = holdPage();
    // اسمه عنوانه، ووصفه فقرة السؤال إن كانت (كـconfirmDialog؛ كان حارس المغادرة يُسمع عنوانه دون سؤاله، ت-١٤). وحوار المحتوى وحده
    // (معاينة أو جدول أو نموذج) بلا وصف: يُقرأ بالتنقّل فيه، والوصف به يقرأ الجدول كله عند الفتح.
    const dialog = el('dialog', {
      className: `tj-dialog ed-dialog ed-dialog--${size}${tone === 'danger' ? ' tj-dialog--danger' : ''}`,
      attrs: { 'aria-labelledby': 'ed-dialog-title', 'aria-describedby': body ? 'ed-dialog-body' : null },
      doc,
    });
    const buttons = actions.map((a) => {
      const b = button({ label: a.label, variant: a.variant ?? 'secondary', className: a.className ?? '', type: 'submit', value: a.value, doc });
      a.ref?.(b);
      return b;
    });
    dialog.append(el('form', {
      className: 'tj-dialog__form', attrs: { method: 'dialog' },
      children: [
        el('h2', { className: 'tj-dialog__title', text: title, attrs: { id: 'ed-dialog-title' }, doc }),
        body ? el('p', { className: 'tj-dialog__body', text: body, attrs: { id: 'ed-dialog-body' }, doc }) : null,
        content,
        el('div', { className: 'tj-dialog__footer', children: buttons, doc }),
      ],
      doc,
    }));
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue || null);
      dialog.remove();
      release();
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
    doc, title: t('editor.leave.title'), body: text, tone: 'danger', focus: 'stay',
    actions: [{ label: t('editor.leave.stay'), value: 'stay', variant: 'primary' }, { label: t('editor.leave.leave'), value: 'leave', variant: 'danger' }],
  });
  return v === 'leave';
}
