// نافذة الأيقونة (P7-AC1، وإعادة التصميم): نافذة استخدام سريعة لا مجرد روابط: بطاقة الفيديو الحالي (العنوان والحالة
// وسطر الأدوات)، وإجراءات سريعة بحسب السياق (تحرير الترجمة، ونسخ تعليمات الترجمة من هنا مباشرة، والعثور عليه في
// المحفوظات)، وعلى غير صفحة فيديو آخر الترجمات لفتحها أو تحريرها؛ ومدخلان خفيفان للمحفوظات والإعدادات. كل بند يفتح
// صفحته في تبويب جديد وتُغلق النافذة. لا طلبات شبكة، وكل نص عبر textContent، ونص التعليمات يُنسخ ولا يُعرض.
import { messageFor } from '../../core/errors/index.js';
import { instructions } from '../../core/export/instructions.js';
import { watchUrl } from '../../core/model/ids.js';
import { createStore } from '../../core/store/index.js';
import { alertBox, button, el, icon, statusPill } from '../../ui/components.js';
import { extensionVersion, openPage, startPage } from '../../ui/page.js';
import { createCopyState } from '../library/copy.js';
import {
  attachedGlossary, browserLabel, captureLine, describeStatus, editorGate, pageReport, queryPageDiagnostics, quickActions, queryVideoState,
  recentEntries, toolsStatus,
} from './status.js';

/** زر النسخ: اسمه الكامل حين يكون رئيسيًا بعرض النافذة، ومختصرًا حين يجاور زرًا آخر. */
const COPY_LABEL = Object.freeze({ idle: 'نسخ تعليمات الترجمة', idleShort: 'نسخ التعليمات', success: 'تم النسخ', error: 'أعد المحاولة' });

const skeleton = () => el('section', {
  className: 'tj-popup__status',
  attrs: { 'aria-busy': 'true', 'aria-label': 'جارٍ قراءة حالة الفيديو' },
  children: [el('div', { className: 'tj-skeleton tj-popup__skel-title' }), el('div', { className: 'tj-skeleton tj-popup__skel-line' })],
});

/** «نسخ تشخيص الصفحة» (§١٩.٦): رابط صغير ونتيجته بسطر. التقرير رموز وأعداد منقّاة، ولا يُعرض. */
function diagnosticsLink(reply) {
  const result = el('span', { className: 'tj-caption tj-popup__diag-result', attrs: { role: 'status', 'aria-live': 'polite' } });
  const link = el('button', { className: 'tj-popup__diag', text: 'نسخ تشخيص الصفحة', attrs: { type: 'button', 'data-action': 'diagnostics' } });
  link.addEventListener('click', async () => {
    link.setAttribute('aria-busy', 'true');
    let ok = false;
    try {
      const sections = await queryPageDiagnostics();
      await navigator.clipboard.writeText(pageReport({ reply, sections, version: extensionVersion(), browser: browserLabel() }));
      ok = true;
    } catch {
      ok = false;
    }
    link.removeAttribute('aria-busy');
    result.textContent = ok ? '✓ نُسخ التشخيص' : 'تعذّر النسخ — أعد المحاولة';
    result.setAttribute('data-tone', ok ? 'success' : 'danger');
  });
  return el('p', { className: 'tj-popup__diag-row', children: [link, result] });
}

/**
 * @param {ReturnType<typeof describeStatus>} s @param {ReturnType<typeof toolsStatus>} tools
 * @param {ReturnType<typeof captureLine>} capture @param {object | null} reply
 */
function statusCard(s, tools, capture, reply) {
  const card = el('section', { className: 'tj-popup__status', attrs: { 'aria-live': 'polite' } });
  if (s.kind === 'not-video') {
    card.append(el('p', { className: 'tj-body-sm', text: messageFor('TJ_NOT_YOUTUBE') }));
    return card;
  }
  card.append(el('h2', { className: 'tj-popup__title tj-clamp-2 tj-auto', text: s.title, attrs: { title: s.title } }));
  if (s.kind === 'loading') {
    card.append(el('div', { className: 'tj-skeleton tj-popup__skel-line' }));
  } else if (s.kind === 'has-subtitle') {
    card.append(el('p', { className: 'tj-body-sm', text: s.line }));
    const pills = [statusPill({ tone: 'brand', text: s.mode, plain: true })];
    if (s.edited) pills.push(statusPill({ tone: 'edited', text: 'معدّلة' }));
    if (s.matched === false) pills.push(statusPill({ tone: 'warning', text: 'تختلف عن الأصل' }));
    card.append(el('div', { className: 'tj-popup__pills', children: pills }));
  } else {
    card.append(el('p', { className: 'tj-body-sm', text: 'لا ترجمة عربية محفوظة' }));
    card.append(el('p', { className: 'tj-caption', text: s.englishLine }));
  }
  if (capture) card.append(el('p', { className: 'tj-caption tj-popup__capture', text: capture.text }));
  if (tools) {
    card.append(el('p', { className: `tj-caption tj-popup__tools tj-popup__tools--${tools.tone}`, text: tools.text }));
    if (tools.reason && tools.reason !== tools.text) card.append(el('p', { className: 'tj-caption tj-popup__reason', text: tools.reason }));
    card.append(diagnosticsLink(reply));
  }
  return card;
}

/** عنصر تنقّل خفيف إلى صفحة (المحفوظات أو الإعدادات). */
function pageLink({ action, iconName, name, onOpen }, notice) {
  const b = el('button', {
    className: 'tj-menuitem',
    attrs: { type: 'button', 'data-action': action },
    children: [icon(iconName), el('span', { className: 'tj-menuitem__text', children: [el('span', { className: 'tj-menuitem__name', text: name })] }), el('span', { className: 'tj-menuitem__end', children: [icon('chevron', { className: 'tj-icon tj-icon--sm tj-popup__chev' })] })],
  });
  b.addEventListener('click', async () => {
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
    const store = createStore();
    const notice = el('div', { attrs: { role: 'status' } });
    const settingsBtn = button({ label: 'الإعدادات', iconOnly: true, icon: 'settings', variant: 'ghost', size: 'sm', className: 'tj-popup__gear', onClick: async () => {
      try {
        await openPage('settings');
        window.close();
      } catch {
        notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
      }
    } });
    settingsBtn.setAttribute('data-action', 'settings');
    app.append(el('header', {
      className: 'tj-popup__head',
      children: [el('span', { className: 'tj-mark', text: 'ت', attrs: { 'aria-hidden': 'true' } }), el('span', { className: 'tj-popup__brand', text: 'ترجمان' }), el('span', { className: 'tj-caption tj-popup__local', text: 'محلي بالكامل' }), settingsBtn],
    }));
    const placeholder = skeleton();
    const actionsHost = el('div', { className: 'tj-popup__actions' });
    const recentHost = el('div', { className: 'tj-popup__recent' });
    app.append(placeholder, actionsHost, recentHost);
    // «المحفوظات» و«الإعدادات» لا تنتظران حالة الفيديو (قد تتأخر حتى مهلتها إن علق سكربت المحتوى).
    app.append(el('nav', {
      className: 'tj-popup__menu',
      attrs: { 'aria-label': 'صفحات ترجمان' },
      children: [
        pageLink({ action: 'library', iconName: 'library', name: 'المحفوظات', onOpen: () => openPage('library') }, notice),
        pageLink({ action: 'settings', iconName: 'settings', name: 'الإعدادات', onOpen: () => openPage('settings') }, notice),
      ],
    }), notice);

    const reply = await queryVideoState();
    const status = describeStatus(reply);
    placeholder.replaceWith(statusCard(status, toolsStatus(reply), captureLine(reply), reply));
    // القاموس المرفق في نسخ التعليمات من هنا كما في المشغّل والمحفوظات (النص نفسه من instructions).
    let glossary = null;
    try {
      glossary = attachedGlossary(await store.getPrefs());
    } catch {
      glossary = null;
    }

    // الإجراءات السريعة للفيديو الحالي.
    const gate = editorGate(reply);
    for (const a of quickActions(reply)) {
      let b;
      if (a.id === 'editor') {
        b = button({ label: a.label, icon: 'edit', variant: a.primary ? 'primary' : 'secondary', disabledReason: a.disabledReason, onClick: async () => {
          try {
            await openPage('editor', { v: gate.videoId });
            window.close();
          } catch {
            notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
          }
        } });
      } else if (a.id === 'copy') {
        const idle = a.primary ? COPY_LABEL.idle : COPY_LABEL.idleShort;
        const label = el('span', { text: idle });
        let glyph = icon('copy');
        b = el('button', { className: `tj-btn tj-btn--${a.primary ? 'primary' : 'secondary'}`, attrs: { type: 'button', 'data-state': 'idle', 'aria-label': COPY_LABEL.idle, title: 'ينسخ تعليمات الترجمة لترفقها مع ملف SRT الإنجليزي.' }, children: [glyph, label] });
        const copy = createCopyState({
          buildText: () => instructions({ videoId: reply.videoId, title: reply.title, glossary }),
          write: (text) => navigator.clipboard.writeText(text),
          announce: (code) => notice.replaceChildren(code === 'PG_COPY_DONE' ? el('span', { className: 'tj-sr-only', text: messageFor(code) }) : alertBox({ tone: 'danger', text: messageFor(code) })),
          onState: (next) => {
            label.textContent = next === 'idle' ? idle : COPY_LABEL[next];
            const fresh = icon(next === 'success' ? 'check' : 'copy');
            glyph.replaceWith(fresh);
            glyph = fresh;
            b.setAttribute('data-state', next);
            b.classList.toggle('tj-popup__copy--success', next === 'success');
            b.classList.toggle('tj-popup__copy--error', next === 'error');
          },
        });
        b.addEventListener('click', () => { copy.copy(); });
      } else {
        b = button({ label: a.label, icon: 'library', variant: 'secondary', disabledReason: a.disabledReason, onClick: async () => {
          try {
            await openPage('library', undefined, { hash: `q=${reply.videoId}` });
            window.close();
          } catch {
            notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
          }
        } });
      }
      b.setAttribute('data-action', a.id);
      if (a.primary) b.classList.add('tj-popup__primary');
      actionsHost.append(b);
    }
    if (status.kind === 'no-subtitle') actionsHost.append(el('p', { className: 'tj-caption tj-popup__hint', text: 'ارفع الملف العربي من زر الرفع في شريط المشغّل.' }));

    // ليست صفحة فيديو: آخر الترجمات من المحفوظات.
    if (status.kind === 'not-video') {
      try {
        const recent = recentEntries(await store.listIndex());
        if (recent.length) {
          recentHost.append(el('h3', { className: 'tj-popup__section', text: 'آخر الترجمات' }));
          for (const e of recent) {
            const title = el('span', { className: 'tj-popup__recent-title tj-truncate tj-auto', text: e.title ?? e.videoId, attrs: { title: e.title ?? e.videoId } });
            const openBtn = button({ label: `فتح الفيديو: ${e.title ?? e.videoId}`, iconOnly: true, icon: 'external', variant: 'ghost', size: 'sm', title: 'فتح الفيديو', onClick: async () => {
              await chrome.tabs.create({ url: watchUrl(e.videoId) });
              window.close();
            } });
            const editBtn = button({ label: `تحرير: ${e.title ?? e.videoId}`, iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', title: 'تحرير الترجمة', disabledReason: e.arabic ? null : messageFor('PG_NO_ARABIC'), onClick: async () => {
              await openPage('editor', { v: e.videoId });
              window.close();
            } });
            recentHost.append(el('div', { className: 'tj-popup__recent-row', children: [title, el('span', { className: 'tj-popup__recent-actions', children: [editBtn, openBtn] })] }));
          }
        }
      } catch {
        // المحفوظات غير متاحة الآن: تبقى النافذة بمدخليها.
      }
    }
    // اكتمل العرض (للحزام الحي: لا يقرأ النافذة قبل آخر الترجمات).
    app.setAttribute('data-ready', '1');
  },
});
