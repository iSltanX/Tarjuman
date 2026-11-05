// نافذة الأيقونة (P7-AC1، وإعادة التصميم، وجولة الصقل، والهوية «بُنّ على ورق»): نافذة استخدام سريعة لا مجرد روابط: رأس
// بالشعار المعتمد و«بياناتك على جهازك»، وبطاقة الفيديو الحالي (العنوان والحالة ومؤشر «محفوظ» وسطر الأدوات)، وصف «زر النص
// المتزامن مخفي» بزر إظهاره حين أخفاه المستخدم، وإجراءات سريعة بحسب السياق (تحرير الترجمة، ونسخ تعليمات الترجمة من هنا
// مباشرة)، وثلاث خطوات تُرشد فيديو بلا ترجمة عربية من حالة الأصل الفعلية، وعلى غير صفحة فيديو آخر الترجمات لفتحها أو
// تحريرها؛ ثم تذييل بمدخل واحد لكل وجهة: المحفوظات (على صف الفيديو الحالي إن كان محفوظًا) والإعدادات. كل وجهة تفتح صفحتها
// في تبويب جديد وتُغلق النافذة. لا طلبات شبكة، وكل نص عبر textContent، ونص التعليمات يُنسخ ولا يُعرض. البناة في view.js
// والمنطق في status.js وصف الإظهار في entry.js.
import { messageFor } from '../../core/errors/index.js';
import { instructions } from '../../core/export/instructions.js';
import { watchUrl } from '../../core/model/ids.js';
import { browserLabel } from '../../core/report/diagnostics.js';
import { createStore } from '../../core/store/index.js';
import { alertBox, button, el, icon } from '../../ui/components.js';
import { textDirection } from '../../ui/format.js';
import { logo } from '../../ui/logo.js';
import { extensionVersion, openPage, startPage } from '../../ui/page.js';
import { createCopyState } from '../library/copy.js';
import { bindEntryRow } from './entry.js';
import {
  attachedGlossary, captureLine, describeStatus, editorGate, guideSteps, libraryHash, missText, pageReport, queryPageDiagnostics, queryPopupState,
  quickActions, recentEntries, recentLine, toolsStatus, untilSettled,
} from './status.js';
import { guideList, notVideoNote, skeletonCard, statusCard } from './view.js';

/** زر النسخ: اسمه الكامل حين يكون رئيسيًا بعرض النافذة، ومختصرًا حين يجاور زرًا آخر. */
const COPY_LABEL = Object.freeze({ idle: 'نسخ تعليمات الترجمة', idleShort: 'نسخ التعليمات', success: 'نُسخت التعليمات', error: 'أعد المحاولة' });

/** «نسخ تشخيص الصفحة» (§١٩.٦): رابط صغير ونتيجته بسطر. التقرير رموز وأعداد منقّاة، ولا يُعرض. */
function diagnosticsLink(reply) {
  const result = el('span', { className: 'tj-popup__diag-result', attrs: { role: 'status', 'aria-live': 'polite' } });
  const link = el('button', { className: 'tj-popup__diag', text: 'نسخ تشخيص الصفحة', attrs: { type: 'button', 'data-action': 'diagnostics' } });
  link.addEventListener('click', async () => {
    link.setAttribute('aria-busy', 'true');
    let ok = false;
    try {
      const sections = await queryPageDiagnostics();
      // المتصفح بكشف قناة البلاغ (U53): Firefox وEdge باسميهما.
      const browser = await browserLabel();
      await navigator.clipboard.writeText(pageReport({ reply, sections, version: extensionVersion(), browser }));
      ok = true;
    } catch {
      ok = false;
    }
    link.removeAttribute('aria-busy');
    result.textContent = ok ? 'نُسخ التشخيص' : 'تعذّر النسخ — أعد المحاولة';
    result.setAttribute('data-tone', ok ? 'success' : 'danger');
  });
  return el('p', { className: 'tj-popup__diag-row', children: [link, result] });
}

/** مدخل وجهة في تذييل النافذة (المحفوظات أو الإعدادات): واحد لكل وجهة. */
function pageLink({ action, iconName, name, onOpen }, notice) {
  const b = el('button', {
    className: 'tj-popup__nav-item',
    attrs: { type: 'button', 'data-action': action },
    children: [icon(iconName), el('span', { text: name })],
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
    const notice = el('div', { className: 'tj-popup__notice', attrs: { role: 'status' } });
    // عنوان الصفحة الوحيد (axe page-has-heading-one؛ تدقيق 7a66f91، U92): اسم المنتج مخفيًا بصريًا، والشعار يمثله مرئيًا.
    app.append(el('header', {
      className: 'tj-popup__head',
      children: [el('h1', { className: 'tj-sr-only', text: 'ترجمان' }), logo({ height: 22 }), el('span', { className: 'tj-popup__local', children: [icon('shield', { className: 'tj-icon tj-icon--sm' }), el('span', { text: 'بياناتك على جهازك' })] })],
    }));
    const main = el('div', { className: 'tj-popup__main' });
    const eyebrow = el('span', { className: 'tj-popup__eyebrow', text: 'الفيديو الحالي' });
    let card = skeletonCard();
    const entryHost = el('div', { className: 'tj-popup__entry-host' });
    const actionsHost = el('div', { className: 'tj-popup__actions' });
    const stepsHost = el('div', { className: 'tj-popup__guide' });
    const diagHost = el('div', { className: 'tj-popup__diag-host' });
    const recentHost = el('div', { className: 'tj-popup__recent' });
    main.append(eyebrow, card, entryHost, actionsHost, stepsHost, diagHost, recentHost, notice);
    app.append(main);
    // مدخل واحد لكل وجهة، ولا ينتظر حالة الفيديو (قد تتأخر حتى مهلتها إن علق سكربت المحتوى). المحفوظات تُفتح على صف الفيديو
    // الحالي إن كان محفوظًا (تُعرف بعد الرد).
    let reply = null;
    app.append(el('nav', {
      className: 'tj-popup__nav',
      attrs: { 'aria-label': 'صفحات ترجمان' },
      children: [
        pageLink({ action: 'library', iconName: 'library', name: 'المحفوظات', onOpen: () => openPage('library', undefined, { hash: libraryHash(reply) }) }, notice),
        pageLink({ action: 'settings', iconName: 'settings', name: 'الإعدادات', onOpen: () => openPage('settings') }, notice),
      ],
    }));
    // «زر النص المتزامن مخفي» لا ينتظر رد الصفحة هو الآخر: التفضيلات من التخزين مباشرة.
    const entry = bindEntryRow({ store, host: entryHost });

    let state = await queryPopupState();
    reply = state.reply;
    // القاموس المرفق في نسخ التعليمات من هنا كما في المشغّل والمحفوظات (النص نفسه من instructions).
    let glossary = null;
    try {
      glossary = attachedGlossary(await store.getPrefs());
    } catch {
      glossary = null;
    }

    /** يرسم البطاقة والإجراءات والخطوات والتشخيص من الحالة؛ ويُعاد بعد «جارٍ القراءة»، والزر المركّز يبقى مركّزًا. */
    function paint() {
      const status = describeStatus(reply);
      const focused = actionsHost.contains(document.activeElement) ? document.activeElement.getAttribute('data-action') : null;
      let next;
      if (status.kind === 'not-video') {
        eyebrow.textContent = 'آخر الترجمات';
        next = notVideoNote(document, missText(state.miss));
        main.insertBefore(eyebrow, recentHost);
      } else {
        next = statusCard(status, toolsStatus(reply), captureLine(reply));
      }
      card.replaceWith(next);
      card = next;
      actionsHost.replaceChildren();
      stepsHost.replaceChildren();
      diagHost.replaceChildren();

      // الإجراءات السريعة للفيديو الحالي.
      const gate = editorGate(reply);
      for (const a of quickActions(reply)) {
        let b;
        if (a.id === 'editor') {
          b = button({ label: a.label, icon: 'edit', size: 'lg', variant: a.primary ? 'primary' : 'secondary', disabledReason: a.disabledReason, onClick: async () => {
            try {
              await openPage('editor', { v: gate.videoId });
              window.close();
            } catch {
              notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
            }
          } });
        } else {
          const idle = a.primary ? COPY_LABEL.idle : COPY_LABEL.idleShort;
          const label = el('span', { text: idle });
          let glyph = icon('copy');
          // الاسم هو النص الظاهر نفسه في كل حالة (WCAG 2.5.3؛ تدقيق 5fedcb9، CL-007 وGM-027.2)، والشرح في التلميح.
          b = el('button', { className: `tj-btn tj-btn--lg tj-btn--${a.primary ? 'primary' : 'secondary'}`, attrs: { type: 'button', 'data-state': 'idle', title: 'ينسخ تعليمات الترجمة وحدها لترفقها مع ملف SRT الإنجليزي.' }, children: [glyph, label] });
          const shown = reply;
          const copy = createCopyState({
            buildText: () => instructions({ videoId: shown.videoId, title: shown.title, glossary }),
            write: (text) => navigator.clipboard.writeText(text),
            announce: (code) => notice.replaceChildren(code === 'PG_COPY_DONE' ? el('span', { className: 'tj-sr-only', text: messageFor(code) }) : alertBox({ tone: 'danger', text: messageFor(code) })),
            onState: (st) => {
              label.textContent = st === 'idle' ? idle : COPY_LABEL[st];
              const fresh = icon(st === 'success' ? 'check' : 'copy');
              glyph.replaceWith(fresh);
              glyph = fresh;
              b.setAttribute('data-state', st);
              b.classList.toggle('tj-popup__copy--success', st === 'success');
              b.classList.toggle('tj-popup__copy--error', st === 'error');
            },
          });
          b.addEventListener('click', () => { copy.copy(); });
        }
        b.setAttribute('data-action', a.id);
        if (a.primary) b.classList.add('tj-popup__primary');
        actionsHost.append(b);
        if (focused === a.id) b.focus();
      }
      // فيديو بلا ترجمة عربية: ثلاث خطوات من حالة الأصل الفعلية (ملتقط أو محفوظ أو لا).
      const steps = guideSteps(reply);
      if (steps) stepsHost.append(guideList(steps));
      // تشخيص الصفحة حيث تُعرض حالة أدوات المشغّل.
      if (toolsStatus(reply)) diagHost.append(diagnosticsLink(reply));
      return status;
    }

    let status = paint();
    // «جارٍ القراءة» (بداية الصفحة أو تنقّل فيها): يُعاد الاستعلام حتى يستقر، بحد (L-25).
    if (reply?.loading) {
      state = await untilSettled(queryPopupState, state);
      if (state.reply && !state.reply.loading) {
        reply = state.reply;
        status = paint();
      }
    }

    // ليست صفحة فيديو: آخر الترجمات من المحفوظات.
    if (status.kind === 'not-video') {
      try {
        const recent = recentEntries(await store.listIndex());
        if (recent.length) {
          const list = el('div', { className: 'tj-popup__recent-list' });
          const nowMs = Date.now();
          for (const e of recent) {
            const name = e.title ?? e.videoId;
            const title = el('span', { className: 'tj-popup__recent-title tj-truncate tj-auto', text: name, dir: textDirection(name), attrs: { title: name } });
            const meta = el('span', { className: 'tj-popup__recent-meta', text: recentLine(e, nowMs) });
            // تعذّر فتح التبويب أو الصفحة يُقال كما في أزرار الحالة، لا رفضٌ صامت (تدقيق 5fedcb9، GM-027.2).
            const go = (fn) => async () => {
              try {
                await fn();
                window.close();
              } catch {
                notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
              }
            };
            const openBtn = button({ label: `فتح الفيديو: ${name}`, iconOnly: true, icon: 'external', variant: 'ghost', size: 'sm', title: 'فتح الفيديو', onClick: go(() => chrome.tabs.create({ url: watchUrl(e.videoId) })) });
            const editBtn = button({ label: `تحرير: ${name}`, iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', title: 'تحرير الترجمة', disabledReason: e.arabic ? null : messageFor('PG_NO_ARABIC'), onClick: go(() => openPage('editor', { v: e.videoId })) });
            list.append(el('div', { className: 'tj-popup__recent-row', children: [el('span', { className: 'tj-popup__recent-text', children: [title, meta] }), el('span', { className: 'tj-popup__recent-actions', children: [editBtn, openBtn] })] }));
          }
          recentHost.append(el('div', { className: 'tj-popup__card tj-popup__card--list', children: [list] }));
        } else {
          eyebrow.remove();
        }
      } catch {
        // المحفوظات غير متاحة الآن: تبقى النافذة بمدخليها.
        eyebrow.remove();
      }
    }
    await entry.ready;
    // اكتمل العرض (للحزام الحي: لا يقرأ النافذة قبل آخر الترجمات).
    app.setAttribute('data-ready', '1');
  },
});
