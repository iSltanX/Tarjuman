// نافذة الأيقونة — بديل P2 المؤقت (تملكها P7): حالة الفيديو الحالي برسالة إلى سكربت المحتوى في التبويب
// النشط، وثلاثة بنود تفتح صفحاتها في تبويب. الصياغة النهائية والحالات كاملة في P7.
import { isVideoStateReply, videoStateRequest } from '../../core/model/messages.js';
import { messageFor } from '../../core/errors/index.js';
import { el, icon, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatOffset } from '../../ui/format.js';
import { openPage, startPage } from '../../ui/page.js';

/** @returns {Promise<import('../../core/model/messages.js').VideoStateReply | null>} null: ليست صفحة يوتيوب */
async function activeVideoState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.id === undefined) return null;
    const reply = await chrome.tabs.sendMessage(tab.id, videoStateRequest());
    return isVideoStateReply(reply) ? reply : null;
  } catch {
    return null;
  }
}

function statusCard(s) {
  const card = el('section', { className: 'tj-card tj-popup__status', attrs: { 'aria-live': 'polite' } });
  if (!s || !s.watch) {
    card.append(el('p', { className: 'tj-body-sm', text: messageFor('TJ_NOT_YOUTUBE') }));
    return card;
  }
  card.append(el('h2', { className: 'tj-h4 tj-clamp-2 tj-auto', text: s.title ?? s.videoId }));
  if (s.arabic) {
    const parts = ['ترجمة عربية', formatCount(s.arabic.cueCount, COUNT_FORMS.cue), `الإزاحة ${formatOffset(s.view.displayOffsetMs)} ث`];
    card.append(el('p', { className: 'tj-body-sm', text: parts.join(' · ') }));
    if (s.arabic.edited) card.append(statusPill({ tone: 'edited', text: 'معدّلة' }));
  } else {
    const captured = s.english.captured.some((t) => t.ok);
    card.append(el('p', { className: 'tj-body-sm', text: 'لا ترجمة عربية محفوظة' }));
    card.append(el('p', { className: 'tj-caption', text: `المسار الإنجليزي: ${captured ? 'ملتقط ✓' : 'غير ملتقط'}` }));
  }
  return card;
}

function menuItem({ iconName, name, desc, disabledReason, onOpen }) {
  const b = el('button', {
    className: 'tj-menuitem',
    attrs: { type: 'button', ...(disabledReason ? { 'aria-disabled': 'true', title: disabledReason } : {}) },
    children: [icon(iconName), el('span', { className: 'tj-menuitem__text', children: [el('span', { className: 'tj-menuitem__name', text: name }), el('span', { className: 'tj-menuitem__desc', text: disabledReason ?? desc })] })],
  });
  b.addEventListener('click', async () => {
    if (disabledReason) return;
    await onOpen();
    window.close();
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
    const placeholder = el('section', { className: 'tj-card tj-popup__status', children: [el('div', { className: 'tj-skeleton' }), el('div', { className: 'tj-skeleton' })] });
    app.append(placeholder);
    const s = await activeVideoState();
    placeholder.replaceWith(statusCard(s));
    const editorReason = !s || !s.watch ? 'افتح فيديو على يوتيوب أولًا' : !s.arabic ? 'لا ترجمة لهذا الفيديو بعد' : null;
    app.append(el('nav', {
      className: 'tj-popup__menu',
      attrs: { 'aria-label': 'صفحات ترجمان' },
      children: [
        menuItem({ iconName: 'editor', name: 'المحرّر', desc: 'تحرير ترجمة هذا الفيديو', disabledReason: editorReason, onOpen: () => openPage('editor', { v: s.videoId }) }),
        menuItem({ iconName: 'library', name: 'المحفوظات', desc: 'كل الترجمات حسب الفيديو', onOpen: () => openPage('library') }),
        menuItem({ iconName: 'settings', name: 'الإعدادات', desc: 'العرض والتوقيت والتصدير والتخزين', onOpen: () => openPage('settings') }),
      ],
    }));
  },
});
