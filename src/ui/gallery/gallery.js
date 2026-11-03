// معرض مكوّنات src/ui في حالاتها (بناء التطوير وحده): مرجع بصري للمراحل اللاحقة ولقطات P2-AC6. وهو صفحة إضافة،
// فيكشف للحزام الحي (P10) saveFile والتخزين وأداة القفز في صفحة إضافة حقيقية؛ بناء الإنتاج لا يحويه.
import { alertBox, button, chipGroup, choiceGroup, el, emptyState, field, ltr, slotPicker, statusPill } from '../components.js';
import { COUNT_FORMS, formatCount, formatOffset, formatTimecode } from '../format.js';
import { numberField, savedMark, segmented } from '../forms.js';
import { createMenu } from '../menu.js';
import { startPage } from '../page.js';
import { createToaster } from '../toast.js';
import { download as blobDownload } from '../../core/export/download.js';
import { saveFile, savedPath } from '../../core/save/index.js';
import { createStore } from '../../core/store/index.js';
import { jumpToVideo } from '../seek.js';

// blobDownload: التنزيل الحالي (الإصدار الأول) للمقارنة بالوضع الافتراضي. والتخزين في صفحة الإضافة وحدها: لقطات المعرض في
// smoke.mjs تفتحه من file:// بلا chrome.storage، فكان createStore() يرمي قبل الرسم فتخرج صفحة فارغة (تدقيق 5fedcb9).
const store = globalThis.chrome?.storage?.local ? createStore() : null;
globalThis.__tarjumanPage = { saveFile, savedPath, blobDownload, store, jumpToVideo };

const TOKENS = ['bg', 'surface', 'surface-2', 'sunken', 'text', 'text-2', 'muted', 'border', 'border-strong', 'brand', 'brand-soft', 'focus', 'success', 'warning', 'danger', 'info', 'edited'];

const section = (title, ...children) => el('section', { className: 'tj-card g-section', children: [el('h2', { className: 'tj-h3', text: title }), ...children] });

startPage({
  title: 'معرض المكوّنات',
  wide: true,
  render(app) {
    app.append(el('h1', { className: 'tj-display', text: 'معرض مكوّنات ترجمان' }));
    app.append(section('الألوان', el('div', {
      className: 'g-swatches',
      children: TOKENS.map((t) => el('div', { className: 'g-swatch', children: [el('span', { attrs: { style: `background: var(--tj-${t})` } }), el('code', { text: t })] })),
    })));
    app.append(section('الخطوط',
      el('p', { className: 'tj-h1', text: 'المحفوظات — عنوان h1' }),
      el('p', { className: 'tj-h4', children: ['عنوان فيديو إنجليزي معزول: ', ltr('Do schools kill creativity? | TED', { mono: false })] }),
      el('p', { className: 'tj-h4 tj-auto', text: 'Do schools kill creativity? | TED' }),
      el('p', { className: 'tj-body', text: 'نص أساسي بخط المراعي، فيه كلمة API ورقم 412.' }),
      el('p', { className: 'tj-caption', children: ['التوقيت ', ltr(formatTimecode(724500)), ' والمعرّف ', ltr('dQw4w9WgXcQ'), ' والإزاحة ', ltr(formatOffset(500), { mono: false }), ' و', ltr(formatOffset(-1000), { mono: false })] }),
      el('p', { className: 'tj-body-sm', text: [1, 2, 3, 11, 100].map((n) => formatCount(n, COUNT_FORMS.cue)).join(' · ') }),
    ));
    const variants = ['primary', 'secondary', 'ghost', 'danger'];
    app.append(section('الأزرار',
      el('div', { className: 'tj-row', children: variants.map((v) => button({ label: v === 'danger' ? 'حذف' : 'حفظ', variant: v })) }),
      el('div', { className: 'tj-row', children: [button({ label: 'صغير', size: 'sm' }), button({ label: 'متوسط' }), button({ label: 'كبير', size: 'lg', variant: 'primary' }), button({ label: 'بأيقونة', icon: 'library' })] }),
      el('div', { className: 'tj-row', children: [button({ label: 'جارٍ الحفظ', variant: 'primary', loading: true }), button({ label: 'تصدير', variant: 'primary', disabledReason: 'صحّح 3 أخطاء توقيت أولًا' }), el('span', { className: 'tj-btn__reason', text: 'صحّح 3 أخطاء توقيت أولًا' })] }),
    ));
    const err = field({ label: 'الإزاحة بالثواني', value: '0.25', mono: true, hint: 'بخطوة 0.1 ث', error: 'القيمة من مضاعفات 0.1 فقط' });
    app.append(section('الحقول',
      el('div', { className: 'tj-row', children: [field({ label: 'البحث', type: 'search', placeholder: 'بالعنوان أو المعرّف' }).root, field({ label: 'عتبة الانحراف', value: '100', mono: true, hint: 'بالملي ثانية' }).root, err.root, field({ label: 'معطّل', value: '—', disabled: true }).root] }),
    ));
    app.append(section('شارات الحالة', el('div', {
      className: 'tj-row',
      children: [statusPill({ text: 'EN يدوي' }), statusPill({ tone: 'info', text: 'جارٍ' }), statusPill({ tone: 'success', text: 'مطابق للأصل ✓' }), statusPill({ tone: 'warning', text: '3 ناقصة' }), statusPill({ tone: 'danger', text: 'خطأ' }), statusPill({ tone: 'edited', text: 'معدّلة' })],
    })));
    app.append(section('التنبيهات',
      alertBox({ tone: 'info', text: 'الإزاحة تُحفظ لكل فيديو، ولا تغيّر ملفك.' }),
      alertBox({ tone: 'success', text: 'مطابق للأصل ✓' }),
      alertBox({ tone: 'warning', title: 'قد يكون النص ناقصًا', text: 'آخر ترجمة عند 12:40 والفيديو 18:05.', action: button({ label: 'التفاصيل', size: 'sm', variant: 'ghost' }) }),
      alertBox({ tone: 'danger', title: 'تعذّرت قراءة الملف', text: 'تعذّرت قراءة الملف عند السطر 214: توقيت غير صالح.' }),
    ));
    app.append(section('الحالة الفارغة', emptyState({ title: 'لا ترجمات محفوظة بعد', steps: ['افتح فيديو', 'اضغط تحميل الترجمة', 'ارفع ملفك العربي'], action: button({ label: 'مسح البحث', variant: 'secondary' }) })));
    // حوار التأكيد معروضًا ثابتًا للقطة؛ في الصفحات يُفتح بـconfirmDialog.
    const dlg = el('div', { className: 'tj-dialog tj-dialog--danger g-dialog', attrs: { role: 'dialog', 'aria-label': 'مثال حوار' } });
    dlg.append(el('div', { className: 'tj-dialog__form', children: [
      el('h2', { className: 'tj-dialog__title', text: 'حذف ترجمة «عنوان الفيديو»؟' }),
      el('p', { className: 'tj-dialog__body', text: 'لا يمكن التراجع عن الحذف.' }),
      el('div', { className: 'tj-dialog__footer', children: [button({ label: 'حذف', variant: 'danger' }), button({ label: 'إلغاء' })] }),
    ] }));
    app.append(section('حوار التأكيد', dlg));

    // ---- مكوّنات الإصدار الثاني المرفوعة إلى src/ui (P10-AC7، عقد interfaces §١٥) ----
    const slots = (list) => list.map(([filled, active, name = null], i) => ({ n: i + 1, filled, active, name }));
    const picker = (list, size) => {
      const p = slotPicker({ slots: slots(list), size, onSelect: () => {} });
      p.root.setAttribute('data-gallery', `slots-${size}`);
      return p.root;
    };
    app.append(section('اختيار الترجمة (SlotPicker)',
      el('div', { className: 'tj-row', children: [picker([[true, true], [true, false, 'مراجعة'], [false, false]], 'sm'), el('span', { className: 'tj-caption', text: 'النشطة · محفوظة · فارغة (المشغّل والمحفوظات)' })] }),
      el('div', { className: 'tj-row', children: [picker([[true, false], [true, true], [true, false]], 'md'), el('span', { className: 'tj-caption', text: 'رأس المحرّر (md)' })] }),
      el('div', { className: 'tj-row', children: [picker([[false, false], [false, false], [false, false]], 'sm'), el('span', { className: 'tj-caption', text: 'بلا ترجمة' })] }),
    ));
    const menu = createMenu({ label: 'المزيد', chevron: true, items: [
      { kind: 'group', label: 'الترجمات' },
      { id: 'tracks', label: 'الترجمات…', icon: 'captions', onSelect: () => {} },
      { id: 'restore', label: 'استعادة النسخة السابقة', disabledReason: 'لا نسخة سابقة', onSelect: () => {} },
      { kind: 'separator' },
      { id: 'delete', label: 'حذف', tone: 'danger', onSelect: () => {} },
    ] });
    app.append(section('القائمة المنسدلة', el('div', { className: 'tj-row', children: [menu.root] })));
    const seg = segmented({ legend: 'خطوة الإزاحة', value: '500', onChange: () => {}, options: [{ value: '500', label: '0.5 ث' }, { value: '1000', label: '1 ث' }, { value: 'x', label: 'مخصّصة' }, { value: 'off', label: 'معطّلة', disabledReason: 'مثال تعطيل' }] });
    const mark = savedMark({ setTimer: () => 0, clearTimer: () => {} });
    mark.flash('حُفظ', 'success');
    const markErr = savedMark({ setTimer: () => 0, clearTimer: () => {} });
    markErr.flash('تعذّر الحفظ', 'danger');
    const num = numberField({ label: 'حد سرعة القراءة', unit: 'حرف/ث', hint: 'الافتراضي 17', value: '17', parse: (t) => ({ ok: true, value: Number(t) }), commit: () => {}, mark: mark.root });
    const numErr = numberField({ label: 'عتبة الانحراف', unit: 'ms', value: '5', parse: () => ({ ok: false, code: 'MD_INVALID' }), commit: () => {} });
    numErr.setError('MD_INVALID');
    app.append(section('المقطّعة وحقل الرقم بوحدة وعلامة «حُفظ»',
      el('div', { className: 'tj-row', children: [seg.root] }),
      el('div', { className: 'tj-row', children: [num.root, numErr.root, el('div', { children: [markErr.root] })] }),
    ));
    const choice = choiceGroup({ legend: 'مكان حفظ ملفات الترجمة', value: 'downloads', options: [
      { value: 'downloads', label: 'مجلد التنزيلات (الافتراضي)' },
      { value: 'subfolder', label: 'مجلد فرعي داخل التنزيلات', extra: field({ label: 'اسم المجلد', value: 'Tarjuman', disabled: true }).root },
      { value: 'ask', label: 'اسأل عن مكان الحفظ عند كل تنزيل', hint: 'حوار الحفظ من النظام' },
    ] });
    const chips = chipGroup({ ariaLabel: 'فرز المحفوظات', value: 'all', onChange: () => {}, options: [{ value: 'all', label: 'الكل', count: 12 }, { value: 'waiting', label: 'بانتظار الترجمة', count: 3 }, { value: 'review', label: 'تحتاج مراجعة', count: 2 }] });
    app.append(section('مجموعة الخيارات ورقائق الفرز', choice.root, chips.root));
    const toaster = createToaster({ setTimer: () => 0, clearTimer: () => {} });
    toaster.root.classList.add('g-toasts');
    toaster.show('حُفظ.', 'success');
    toaster.show('الترجمة 2', 'info', { action: { label: 'تراجع', onClick: () => {} } });
    toaster.show('تعذّر الحفظ. أعد المحاولة.', 'danger');
    app.append(section('الرسالة العابرة', toaster.root, toaster.live));
  },
});
