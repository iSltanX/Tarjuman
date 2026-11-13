// نافذة الأيقونة (P7-AC1، وإعادة التصميم، وجولة الصقل، والهوية البصرية docs/identity.md، وAA3 لوحة 09): نافذة استخدام سريعة لا مجرد
// روابط: رأس بالشعار المعتمد و«ترجماتك وإعداداتك في متصفحك»، وبطاقة الفيديو الحالي (العنوان والحالة ومؤشر «محفوظ» وسطر الأدوات و«تحرير
// الترجمة» مؤطّرًا)، وصف «زر النص المتزامن مخفي» بزر إظهاره حين أخفاه المستخدم، ثم كتلة «تعليمات الترجمة»: «من» (تُعبّأ من
// لغة مسار الفيديو الملتقط أو المنزَّل كما أرسلها يوتيوب، قرار سلطان ق٥) و«إلى» (آخر لغة اختيرت أو الافتراضي) وزر مبادلة، وزر
// نسخ واحد معطّل حتى تُحدَّد اللغتان وتختلفا؛ ثم ثلاث خطوات تُرشد فيديو بلا ترجمة، وعلى غير صفحة فيديو آخر الترجمات لفتحها أو
// تحريرها؛ ثم تذييل بمدخل واحد لكل وجهة. كل وجهة تفتح صفحتها في تبويب جديد وتُغلق النافذة. لا طلبات شبكة، وكل نص عبر
// textContent، ونص التعليمات يُنسخ ولا يُعرض. البناة في view.js والمنطق في status.js وصف الإظهار في entry.js والمنتقي في
// ui/lang-picker.js.
import { messageFor } from '../../core/errors/index.js';
import { instructions } from '../../core/export/instructions.js';
import { watchUrl } from '../../core/model/ids.js';
import { initialPair, normalizeLangPrefs, pairPatch } from '../../core/model/lang-prefs.js';
import { recordPair } from '../../core/model/pair.js';
import { browserLabel } from '../../core/report/diagnostics.js';
import { createStore } from '../../core/store/index.js';
import { t } from '../../i18n/index.js';
import { copyText } from '../../ui/clipboard.js';
import { alertBox, button, el, icon } from '../../ui/components.js';
import { pasteKeys, textDirection } from '../../ui/format.js';
import { langPair } from '../../ui/lang-picker.js';
import { logo } from '../../ui/logo.js';
import { extensionVersion, openPage, startPage } from '../../ui/page.js';
import { createCopyState } from '../library/copy.js';
import { bindEntryRow } from './entry.js';
import {
  PAIR_TEXT, attachedGlossary, captureLine, completeAction, copyArgs, describeStatus, detectedSource, editorGate, guideSteps, libraryHash, originDownloaded, missAction, missText, pageReport, sendPaste,
  pairState, queryPageDiagnostics, queryPopupState, quickActions, recentEntries, recentLine, toolsStatus, untilSettled, videoLangs,
} from './status.js';
import { guideList, notVideoNote, pairSkeleton, skeletonCard, statusCard } from './view.js';

/** «نسخ تشخيص الصفحة» (§١٩.٦): رابط صغير ونتيجته بسطر. التقرير رموز وأعداد منقّاة، ولا يُعرض. */
function diagnosticsLink(reply) {
  const result = el('span', { className: 'tj-popup__diag-result', attrs: { role: 'status', 'aria-live': 'polite' } });
  const link = el('button', { className: 'tj-popup__diag', text: t('popup.diag.link'), attrs: { type: 'button', 'data-action': 'diagnostics' } });
  link.addEventListener('click', async () => {
    link.setAttribute('aria-busy', 'true');
    let ok = false;
    try {
      // الحافظة لحظة النقرة بوعد التقرير، قبل أي await (تحقق Gemini، B1): مغادرة التركيز أثناء الجمع كانت تُفشل writeText في Chromium.
      await copyText((async () => {
        const sections = await queryPageDiagnostics();
        // المتصفح بكشف بلاغ المشكلة (U53): Firefox وEdge باسميهما.
        const browser = await browserLabel();
        return pageReport({ reply, sections, version: extensionVersion(), browser });
      })());
      ok = true;
    } catch {
      ok = false;
    }
    link.removeAttribute('aria-busy');
    result.textContent = ok ? t('popup.diag.done') : t('popup.diag.failed');
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
  title: () => t('popup.title'),
  async render(app) {
    const store = createStore();
    const notice = el('div', { className: 'tj-popup__notice', attrs: { role: 'status' } });
    // عنوان الصفحة الوحيد (axe page-has-heading-one؛ تدقيق 7a66f91، U92): اسم المنتج مخفيًا بصريًا، والشعار يمثله مرئيًا.
    app.append(el('header', {
      className: 'tj-popup__head',
      children: [el('h1', { className: 'tj-sr-only', text: t('common.productName') }), logo({ width: 24, wordSize: 18 }), el('span', { className: 'tj-popup__local', children: [icon('shield', { className: 'tj-icon tj-icon--sm' }), el('span', { text: t('common.nav.yourData') })] })],
    }));
    const main = el('div', { className: 'tj-popup__main' });
    const eyebrow = el('span', { className: 'tj-popup__eyebrow', text: t('popup.currentVideo') });
    let card = skeletonCard();
    const entryHost = el('div', { className: 'tj-popup__entry-host' });
    // كتلة «تعليمات الترجمة» (لوحة 09): عنوانها وهيكلها حتى يصل الرد وتفضيلات اللغات.
    const pairTitle = el('h2', { className: 'tj-popup__eyebrow', text: PAIR_TEXT.title, attrs: { id: 'tj-pair-title' } });
    const pairHost = el('section', { className: 'tj-popup__pair', attrs: { 'aria-labelledby': 'tj-pair-title' }, children: [pairTitle, pairSkeleton()] });
    // ف5: «الصق الترجمة هنا» لمن يعيد نموذجه النص في المحادثة لا ملفًا. اللصق بحدث اللصق في الحقل وحده: لا إذن قراءة الحافظة
    // ولا قراءة برمجية لها. النص يُرسل إلى صفحة الفيديو فيمر بخط الرفع نفسه (الفحص والمقارنة والتأكيد).
    const pasteArea = el('textarea', {
      className: 'tj-field__input tj-popup__paste-input',
      attrs: { id: 'tj-paste', rows: '2', placeholder: t('popup.paste.placeholder', pasteKeys()), 'aria-describedby': 'tj-paste-hint tj-paste-status', spellcheck: 'false', autocomplete: 'off' },
    });
    const pasteStatus = el('p', { className: 'tj-popup__pair-caption', attrs: { id: 'tj-paste-status', 'aria-live': 'polite' } });
    const pasteHost = el('section', {
      className: 'tj-popup__pair tj-popup__paste', attrs: { 'aria-labelledby': 'tj-paste-label' },
      children: [
        el('label', { className: 'tj-popup__eyebrow', text: t('popup.paste.label'), attrs: { id: 'tj-paste-label', for: 'tj-paste' } }),
        pasteArea,
        el('p', { className: 'tj-popup__pair-note', text: t('popup.paste.hint'), attrs: { id: 'tj-paste-hint' } }),
        pasteStatus,
      ],
    });
    pasteHost.hidden = true;
    const stepsHost = el('div', { className: 'tj-popup__guide' });
    const diagHost = el('div', { className: 'tj-popup__diag-host' });
    const recentTitle = el('span', { className: 'tj-popup__eyebrow', text: t('popup.recent') });
    recentTitle.hidden = true;
    const recentHost = el('div', { className: 'tj-popup__recent' });
    main.append(eyebrow, card, entryHost, pairHost, pasteHost, stepsHost, diagHost, recentTitle, recentHost, notice);
    app.append(main);
    // مدخل واحد لكل وجهة، ولا ينتظر حالة الفيديو (قد تتأخر حتى مهلتها إن علق سكربت المحتوى). المحفوظات تُفتح على صف الفيديو
    // الحالي إن كان محفوظًا (تُعرف بعد الرد).
    let reply = null;
    app.append(el('nav', {
      className: 'tj-popup__nav',
      attrs: { 'aria-label': t('common.nav.pages') },
      children: [
        pageLink({ action: 'library', iconName: 'library', name: t('common.nav.library'), onOpen: () => openPage('library', undefined, { hash: libraryHash(reply) }) }, notice),
        pageLink({ action: 'settings', iconName: 'settings', name: t('common.nav.settings'), onOpen: () => openPage('settings') }, notice),
      ],
    }));
    // «زر النص المتزامن مخفي» لا ينتظر رد الصفحة هو الآخر: التفضيلات من التخزين مباشرة.
    const entry = bindEntryRow({ store, host: entryHost });

    const [first, langRead, prefs, glossaries] = await Promise.all([
      queryPopupState(),
      store.getLangPrefs().then((v) => ({ ok: true, v }), () => ({ ok: false, v: normalizeLangPrefs(null) })),
      store.getPrefs().catch(() => null),
      // قوائم المصطلحات لكل زوج (الفكرة ٨): تعذّر قراءتها يرفق القاموس العام وحده.
      typeof store.getGlossaries === 'function' ? store.getGlossaries().catch(() => null) : null,
    ]);
    let state = first;
    reply = state.reply;
    let langPrefs = langRead.v;
    // تفضيلات اللغات من سياق آخر (الإعدادات أو تبويب آخر): «الأخيرة» وما يُحفظ بعدها يتبعانها.
    store.onChange((change) => {
      if (change.langPrefs) langPrefs = normalizeLangPrefs(change.langPrefs.newValue ?? null);
    });
    // القاموس المرفق في نسخ التعليمات من هنا كما في المحفوظات (النص نفسه من instructions): بالزوج المختار لحظة النسخ (الفكرة ٨).

    // ---- كتلة «تعليمات الترجمة» ----
    /** الزوج الظاهر الآن؛ ولمس المستخدم له يوقف التعبئة التلقائية عند استقرار الرد. */
    let pair = { from: null, to: null };
    let touched = false;
    let picker = null;
    const sourceNote = el('p', { className: 'tj-popup__pair-note' });
    const caption = el('p', { className: 'tj-popup__pair-caption', attrs: { id: 'tj-pair-caption', 'aria-live': 'polite' } });
    const copyLabel = el('span', { text: PAIR_TEXT.copy });
    let copyGlyph = icon('copy');
    const copyBtn = el('button', {
      className: 'tj-btn tj-btn--lg tj-btn--primary tj-popup__copy',
      attrs: { type: 'button', 'data-action': 'copy', 'data-state': 'idle', 'aria-describedby': 'tj-pair-caption' },
      children: [copyGlyph, copyLabel],
    });
    let copyState = 'idle';

    function paintPair() {
      const st = pairState({ reply, pair });
      sourceNote.textContent = st.sourceNote ?? '';
      if (st.ready) copyBtn.removeAttribute('aria-disabled');
      else copyBtn.setAttribute('aria-disabled', 'true');
      // النتيجة على الزر نفسه لثانيتين (لونًا وأيقونةً وكلمة)، ثم يعود؛ والشرح تحت الزر بحسب الحالة.
      copyLabel.textContent = copyState === 'success' ? PAIR_TEXT.copied : copyState === 'error' ? PAIR_TEXT.failed : PAIR_TEXT.copy;
      const glyph = icon(copyState === 'success' ? 'check' : copyState === 'error' ? 'restore' : 'copy');
      copyGlyph.replaceWith(glyph);
      copyGlyph = glyph;
      copyBtn.setAttribute('data-state', copyState);
      copyBtn.classList.toggle('tj-popup__copy--success', copyState === 'success');
      copyBtn.classList.toggle('tj-popup__copy--error', copyState === 'error');
      // تعذّر النسخ: الزر والتنبيه يقولانه، فلا سطر مكرر تحته (لوحة 09، الحالة 7).
      caption.textContent = copyState === 'success' ? st.done : copyState === 'error' ? '' : st.caption;
      caption.setAttribute('data-tone', copyState === 'success' ? 'success' : copyState === 'error' ? 'danger' : st.ready ? 'neutral' : 'muted');
    }

    const copy = createCopyState({
      buildText: () => instructions(copyArgs({ reply, pair, glossary: attachedGlossary(prefs, glossaries, pair) })),
      write: (text) => navigator.clipboard.writeText(text),
      announce: (code) => notice.replaceChildren(code === 'PG_COPY_DONE' ? el('span', { className: 'tj-sr-only', text: messageFor(code) }) : alertBox({ tone: 'danger', text: messageFor(code) })),
      onState: (st) => {
        copyState = st;
        paintPair();
      },
    });
    copyBtn.addEventListener('click', () => {
      if (copyBtn.getAttribute('aria-disabled') === 'true') return;
      copy.copy();
    });

    async function savePair(why) {
      const videoId = reply?.watch && !reply.loading ? reply.videoId : null;
      try {
        langPrefs = await store.setLangPrefs(pairPatch(langPrefs, { videoId, pair, why }));
      } catch {
        // الزوج يبقى كما اختير في النافذة الآن؛ تعذّر حفظه يُقال ولا يمحوه.
        notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_PAIR_NOT_SAVED') }));
      }
    }

    function buildPair() {
      pair = (() => {
        const p = initialPair(langPrefs, { videoId: reply?.watch && !reply.loading ? reply.videoId : null, sourceLang: detectedSource(reply) });
        return { from: p.from, to: p.to };
      })();
      picker = langPair({
        from: pair.from, to: pair.to,
        recent: () => langPrefs.recent,
        video: () => videoLangs(reply),
        onChange: (next, why) => {
          touched = true;
          pair = next;
          if (copyState !== 'idle') copy.dispose();
          copyState = 'idle';
          paintPair();
          paintSteps();
          savePair(why);
        },
      });
      pairHost.replaceChildren(pairTitle, picker.root, sourceNote, copyBtn, caption);
      paintPair();
    }

    /** يعيد التعبئة بعد استقرار الرد ما لم يلمس المستخدم الزوج. */
    function refreshPair() {
      if (!picker) return buildPair();
      if (touched) return paintPair();
      const p = initialPair(langPrefs, { videoId: reply?.watch && !reply.loading ? reply.videoId : null, sourceLang: detectedSource(reply) });
      pair = { from: p.from, to: p.to };
      picker.set(pair);
      return paintPair();
    }

    // الكتابة في الحقل لا تُرسل شيئًا: اللصق وحده.
    pasteArea.addEventListener('input', () => { pasteArea.value = ''; });
    pasteArea.addEventListener('paste', async (ev) => {
      ev.preventDefault();
      const videoId = reply?.watch && !reply.loading ? reply.videoId : null;
      if (!videoId) {
        pasteStatus.setAttribute('data-tone', 'danger');
        pasteStatus.textContent = t('popup.paste.failed');
        return;
      }
      const text = ev.clipboardData?.getData('text/plain') ?? '';
      pasteStatus.setAttribute('data-tone', 'neutral');
      pasteStatus.textContent = '';
      const r = await sendPaste({ videoId, text });
      if (r.ok) {
        pasteStatus.setAttribute('data-tone', 'success');
        pasteStatus.textContent = t('popup.paste.sent');
        return;
      }
      pasteStatus.setAttribute('data-tone', 'danger');
      pasteStatus.textContent = ['empty', 'tooLarge', 'failed', 'busy'].includes(r.code) ? t(`popup.paste.${r.code}`) : messageFor(r.code);
    });

    function paintSteps() {
      stepsHost.replaceChildren();
      // فيديو بلا ترجمة: ثلاث خطوات، والأولى منجزة بتنزيل الأصل فعلًا لا بالتقاطه، بالزوج المختار.
      const steps = guideSteps(reply, pair, downloaded);
      if (steps) stepsHost.append(guideList(steps));
    }

    /** يرسم البطاقة والكتلة والخطوات والتشخيص من الحالة؛ ويُعاد بعد «جارٍ القراءة»، والزر المركّز يبقى مركّزًا. */
    function paint() {
      const status = describeStatus(reply);
      const focused = card.contains(document.activeElement) ? document.activeElement.getAttribute('data-action') : null;
      let next;
      if (status.kind === 'not-video') {
        eyebrow.hidden = true;
        // إذن يوتيوب مسحوب (الفكرة ٣-أ): رابط إلى «التشخيص» في الإعدادات حيث زر «السماح»، والنافذة لا تطلب الإذن بنفسها.
        const act = missAction(state.miss);
        const go = act ? button({
          label: act.label, icon: 'settings', size: 'sm', variant: 'secondary',
          onClick: async () => {
            try {
              await openPage('settings', undefined, { hash: act.hash });
              window.close();
            } catch {
              notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
            }
          },
        }) : null;
        go?.setAttribute('data-action', 'site-access');
        next = notVideoNote(document, missText(state.miss), go);
      } else {
        // «تحرير الترجمة» مؤطّرًا داخل البطاقة (لوحة 09).
        const gate = editorGate(reply);
        const a = quickActions(reply)[0] ?? null;
        const action = a ? button({
          label: a.label, icon: 'edit', size: 'sm', variant: 'outline', disabledReason: a.disabledReason,
          onClick: async () => {
            try {
              await openPage('editor', { v: gate.videoId });
              window.close();
            } catch {
              notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
            }
          },
        }) : null;
        action?.setAttribute('data-action', a.id);
        // «أكمل الناقص (N)» (ف1): نقرة تفتح المحرّر على «الاستكمال» والناقصة مختارة.
        const c = completeAction(reply, missing);
        const complete = c ? button({
          label: c.label, icon: 'edit', size: 'sm', variant: 'secondary', title: c.title,
          onClick: async () => {
            try {
              await openPage('editor', { v: c.videoId, p: 'complete' });
              window.close();
            } catch {
              notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
            }
          },
        }) : null;
        complete?.setAttribute('data-action', c.id);
        next = statusCard(status.kind === 'has-subtitle' ? { ...status, missing } : status, toolsStatus(reply), captureLine(reply), document, [complete, action]);
      }
      card.replaceWith(next);
      card = next;
      // حقل اللصق لصفحة فيديو استقر ردها وأدوات المشغّل فيها مركّبة.
      pasteHost.hidden = !(reply?.watch && !reply.loading && reply.mounted?.controls === 'mounted');
      if (focused) card.querySelector(`[data-action="${focused}"]`)?.focus();
      diagHost.replaceChildren();
      // «جارٍ القراءة»: هيكل الكتلة حتى يستقر الرد (لوحة 09، الحالة 6)، فلا يُعرض زوج قبل معرفة مسار الفيديو.
      if (reply?.watch && reply.loading) {
        // قائمة مفتوحة تُغلق قبل إزالة حقلها، فلا يبقى مستمع على المستند.
        if (picker) {
          picker.fromField.close();
          picker.toField.close();
          picker = null;
        }
        pairHost.replaceChildren(pairTitle, pairSkeleton());
      } else refreshPair();
      paintSteps();
      // تشخيص الصفحة حيث تُعرض حالة أدوات المشغّل.
      if (toolsStatus(reply)) diagHost.append(diagnosticsLink(reply));
      return status;
    }

    /** المقاطع الناقصة في الترجمة النشطة من ملخص الفيديو في المحفوظات (ف1)، و0 حين لا ترجمة أو تعذّرت القراءة. */
    const readMissing = async () => {
      if (!reply?.arabic || !reply.videoId) return 0;
      try {
        return (await store.listIndex()).find((e) => e.videoId === reply.videoId)?.arabic?.missing ?? 0;
      } catch {
        return 0;
      }
    };
    let missing = 0;
    let downloaded = await originDownloaded(store, reply);
    missing = await readMissing();
    let status = paint();
    // «جارٍ القراءة» (بداية الصفحة أو تنقّل فيها): يُعاد الاستعلام حتى يستقر، بحد (L-25).
    if (reply?.loading) {
      state = await untilSettled(queryPopupState, state);
      if (state.reply && !state.reply.loading) {
        reply = state.reply;
        downloaded = await originDownloaded(store, reply);
        missing = await readMissing();
        status = paint();
      }
    }
    if (!langRead.ok) notice.replaceChildren(alertBox({ tone: 'warning', text: messageFor('PG_LANG_PREFS_UNREAD') }));

    // ليست صفحة فيديو: آخر الترجمات من المحفوظات، ولكلٍّ زوجه اللغوي.
    if (status.kind === 'not-video') {
      try {
        const recent = recentEntries(await store.listIndex());
        if (recent.length) {
          const pairs = await Promise.all(recent.map((e) => store.getBundle(e.videoId).then((b) => (b ? recordPair(b.record) : null), () => null)));
          const list = el('div', { className: 'tj-popup__recent-list' });
          const nowMs = Date.now();
          for (const [i, e] of recent.entries()) {
            const name = e.title ?? e.videoId;
            const saved = langPrefs.videos[e.videoId] ?? null;
            const p = pairs[i] ? { from: pairs[i].from ?? saved?.from ?? null, to: pairs[i].to ?? (e.arabic ? null : saved?.to ?? null) } : saved;
            const title = el('span', { className: 'tj-popup__recent-title tj-truncate tj-auto', text: name, dir: textDirection(name), attrs: { title: name } });
            const meta = el('span', { className: 'tj-popup__recent-meta', text: recentLine(e, nowMs, p) });
            // تعذّر فتح التبويب أو الصفحة يُقال كما في أزرار الحالة، لا رفضٌ صامت (تدقيق 5fedcb9، GM-027.2).
            const go = (fn) => async () => {
              try {
                await fn();
                window.close();
              } catch {
                notice.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_OPEN_FAILED') }));
              }
            };
            const openBtn = button({ label: t('popup.recentRow.open', { name }), iconOnly: true, icon: 'external', variant: 'ghost', size: 'sm', title: t('popup.recentRow.openTitle'), onClick: go(() => chrome.tabs.create({ url: watchUrl(e.videoId) })) });
            const editBtn = button({ label: t('popup.recentRow.edit', { name }), iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', title: t('popup.recentRow.editTitle'), disabledReason: e.arabic ? null : messageFor('PG_NO_ARABIC'), onClick: go(() => openPage('editor', { v: e.videoId })) });
            list.append(el('div', { className: 'tj-popup__recent-row', children: [el('span', { className: 'tj-popup__recent-text', children: [title, meta] }), el('span', { className: 'tj-popup__recent-actions', children: [editBtn, openBtn] })] }));
          }
          recentTitle.hidden = false;
          recentHost.append(el('div', { className: 'tj-popup__card tj-popup__card--list', children: [list] }));
        }
      } catch {
        // المحفوظات غير متاحة الآن: تبقى النافذة بمدخليها.
      }
    }
    await entry.ready;
    // اكتمل العرض (للحزام الحي: لا يقرأ النافذة قبل آخر الترجمات).
    app.setAttribute('data-ready', '1');
  },
});
