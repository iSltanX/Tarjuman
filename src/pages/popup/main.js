// نافذة الأيقونة (P7-AC1، figma-design-brief §٨): سطر حالة للفيديو الحالي برسالة إلى سكربت المحتوى في التبويب النشط،
// وثلاثة بنود: المحرّر (للفيديو الحالي إن كانت له ترجمة، وإلا معطّل بسببه) والمحفوظات والإعدادات. كل بند يفتح صفحته في
// تبويب جديد وتُغلق النافذة. لا طلبات شبكة، وكل نص عبر textContent.
import { messageFor } from '../../core/errors/index.js';
import { alertBox, el, icon, statusPill } from '../../ui/components.js';
import { openPage, startPage } from '../../ui/page.js';
import { describeStatus, editorGate, queryVideoState } from './status.js';

const skeleton = () => el('section', {
  className: 'tj-card tj-popup__status',
  attrs: { 'aria-busy': 'true', 'aria-label': 'جارٍ قراءة حالة الفيديو' },
  children: [el('div', { className: 'tj-skeleton tj-popup__skel-title' }), el('div', { className: 'tj-skeleton tj-popup__skel-line' })],
});

/** @param {ReturnType<typeof describeStatus>} s */
function statusCard(s) {
  const card = el('section', { className: 'tj-card tj-popup__status', attrs: { 'aria-live': 'polite' } });
  if (s.kind === 'not-video') {
    card.append(el('p', { className: 'tj-body-sm', text: messageFor('TJ_NOT_YOUTUBE') }));
    return card;
  }
  card.append(el('h2', { className: 'tj-h4 tj-clamp-2 tj-auto', text: s.title }));
  if (s.kind === 'loading') {
    card.append(el('div', { className: 'tj-skeleton tj-popup__skel-line' }));
  } else if (s.kind === 'has-subtitle') {
    card.append(el('p', { className: 'tj-body-sm', text: s.line }));
    if (s.edited) card.append(statusPill({ tone: 'edited', text: 'معدّلة' }));
  } else {
    card.append(el('p', { className: 'tj-body-sm', text: 'لا ترجمة عربية محفوظة' }));
    card.append(el('p', { className: 'tj-caption', text: s.englishLine }));
  }
  return card;
}

/**
 * @param {{ iconName: Parameters<typeof icon>[0], name: string, desc: string, disabledReason?: string | null, onOpen: () => Promise<unknown> }} o
 * @param {HTMLElement} notice حيّز رسالة الفشل
 */
function menuItem({ iconName, name, desc, disabledReason = null, onOpen }, notice) {
  const b = el('button', {
    className: 'tj-menuitem',
    attrs: { type: 'button', ...(disabledReason ? { 'aria-disabled': 'true', title: disabledReason } : {}) },
    children: [icon(iconName), el('span', { className: 'tj-menuitem__text', children: [el('span', { className: 'tj-menuitem__name', text: name }), el('span', { className: 'tj-menuitem__desc', text: disabledReason ?? desc })] })],
  });
  b.addEventListener('click', async () => {
    if (disabledReason) return;
    try {
      await onOpen();
      window.close();
    } catch {
      notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
    }
  });
  return b;
}

startPage({
  title: 'نافذة الأيقونة',
  async render(app) {
    app.append(el('header', {
      className: 'tj-popup__head',
      children: [el('span', { className: 'tj-mark', text: 'ت', attrs: { 'aria-hidden': 'true' } }), el('span', { className: 'tj-popup__brand', text: 'ترجمان' }), el('span', { className: 'tj-caption', text: 'محلي بالكامل' })],
    }));
    const placeholder = skeleton();
    app.append(placeholder);
    const reply = await queryVideoState();
    placeholder.replaceWith(statusCard(describeStatus(reply)));
    const gate = editorGate(reply);
    const notice = el('div', { attrs: { role: 'status' } });
    app.append(el('nav', {
      className: 'tj-popup__menu',
      attrs: { 'aria-label': 'صفحات ترجمان' },
      children: [
        menuItem({ iconName: 'editor', name: 'المحرّر', desc: 'تحرير ترجمة هذا الفيديو', disabledReason: gate.reason, onOpen: () => openPage('editor', { v: gate.videoId }) }, notice),
        menuItem({ iconName: 'library', name: 'المحفوظات', desc: 'كل الترجمات حسب الفيديو', onOpen: () => openPage('library') }, notice),
        menuItem({ iconName: 'settings', name: 'الإعدادات', desc: 'العرض والتوقيت والتصدير والتخزين', onOpen: () => openPage('settings') }, notice),
      ],
    }), notice);
  },
});
