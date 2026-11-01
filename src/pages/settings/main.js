// الإعدادات — بديل P2 المؤقت (تملكها P7): الإصدار والسعة والإعدادات الحالية قراءةً، لإثبات المسار.
import { createStore } from '../../core/store/index.js';
import { messageFor } from '../../core/errors/index.js';
import { alertBox, el, statusPill } from '../../ui/components.js';
import { formatBytes } from '../../ui/format.js';
import { extensionVersion, startPage } from '../../ui/page.js';

startPage({
  title: 'الإعدادات',
  async render(app) {
    const store = createStore();
    const [settings, cap] = await Promise.all([store.getSettings(), store.capacity()]);
    app.append(el('header', { className: 'tj-row', children: [el('h1', { className: 'tj-h1', text: 'الإعدادات' }), statusPill({ tone: 'info', text: 'أساس مؤقت' })] }));
    const rows = [
      ['خطوة أزرار ±', `${(settings.offsetStepMs / 1000).toFixed(1)} ث`],
      ['وضع العرض الافتراضي', settings.displayModeDefault === 'dual' ? 'العربية فوق الإنجليزية' : 'العربية وحدها'],
      ['المستخدم من التخزين', `${formatBytes(cap.bytesInUse)}${cap.unlimited ? ' (بلا حد ثابت)' : ` من ${formatBytes(cap.quotaBytes)}`}`],
      ['الإصدار', extensionVersion()],
    ];
    app.append(el('section', {
      className: 'tj-card tj-stack',
      children: rows.map(([k, v]) => el('div', { className: 'tj-row', children: [el('span', { className: 'tj-label', text: k }), el('span', { className: 'tj-body-sm tj-auto', text: v })] })),
    }));
    if (cap.code) app.append(alertBox({ tone: cap.level === 'full' ? 'danger' : 'warning', text: messageFor(cap.code) }));
    app.append(el('p', { className: 'tj-caption', text: 'كل شيء محلي على جهازك.' }));
  },
});
