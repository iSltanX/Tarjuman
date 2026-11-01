// المحفوظات — بديل P2 المؤقت (تملكها P7): قراءة الفهرس والسعة من التخزين لإثبات المسار، بلا أوامر.
import { createStore } from '../../core/store/index.js';
import { emptyState, el, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatBytes, formatCount } from '../../ui/format.js';
import { startPage } from '../../ui/page.js';

startPage({
  title: 'المحفوظات',
  wide: true,
  async render(app) {
    const store = createStore();
    const [entries, cap] = await Promise.all([store.listIndex(), store.capacity()]);
    app.append(el('header', {
      className: 'tj-row',
      children: [el('h1', { className: 'tj-h1', text: 'المحفوظات' }), el('span', { className: 'tj-caption', text: formatCount(entries.length, COUNT_FORMS.video) }), statusPill({ tone: 'info', text: 'أساس مؤقت' })],
    }));
    app.append(el('p', { className: 'tj-caption', text: `المستخدم ${formatBytes(cap.bytesInUse)}${cap.quotaBytes ? ` من ${formatBytes(cap.quotaBytes)}` : ''}` }));
    if (!entries.length) {
      app.append(emptyState({ title: 'لا ترجمات محفوظة بعد', steps: ['افتح فيديو', 'اضغط تحميل الترجمة', 'ارفع ملفك العربي'] }));
      return;
    }
    app.append(el('ul', {
      className: 'tj-stack',
      attrs: { role: 'list' },
      children: entries.map((e) => el('li', {
        className: 'tj-card tj-row',
        children: [el('span', { className: 'tj-h4 tj-auto', text: e.title ?? e.videoId }), ltr(e.videoId), e.arabic ? statusPill({ tone: e.arabic.edited ? 'edited' : 'success', text: e.arabic.edited ? 'AR معدّلة' : 'AR الأصل' }) : null],
      })),
    }));
  },
});
