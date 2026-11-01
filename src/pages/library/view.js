// واجهة المحفوظات (P7-AC2/AC3/AC6/AC7، figma-design-brief §٩): قائمة مجمّعة حسب الفيديو بالبحث والترتيب والسعة،
// وأوامر كل صف: فتح الفيديو وتعديل واستبدال وتصدير SRT ونسخ (تعليمات الترجمة) وحذف. الحالات: تحميل وفارغة وممتلئة
// ونتيجة بحث فارغة وخطأ. كل نص عبر textContent، ولا طلبات شبكة، ونص تعليمات الترجمة لا يدخل DOM في أي حال.
import { TjError, messageFor, toErrorInfo } from '../../core/errors/index.js';
import { instructions } from '../../core/export/instructions.js';
import { watchUrl } from '../../core/model/ids.js';
import { alertBox, confirmDialog, el, emptyState, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatBytes, formatCount, formatOffset } from '../../ui/format.js';
import { applyReplacement, deleteVideoData, exportArabic, exportEnglish, readReplacement } from './actions.js';
import { radioGroup } from './choice.js';
import { createCopyState } from './copy.js';
import { pageIcon } from './icons.js';
import { createMenu } from './menu.js';
import { PAGE_SIZE, comparisonSummary, copyGate, exportOptions, rowModel, searchEntries, sortEntries } from './model.js';
import { createToaster } from './toast.js';

export const COPY_TIP = 'ينسخ تعليمات الترجمة لترفقها مع ملف SRT.';
export const CAPTION = '«نسخ» ينسخ تعليمات الترجمة لترفقها مع ملف SRT الإنجليزي في أي تطبيق ذكاء اصطناعي.';
const COPY_LABEL = Object.freeze({ idle: 'نسخ', success: 'تم النسخ', error: 'أعد المحاولة' });
const clip = (s, max) => (Array.from(s).length > max ? `${Array.from(s).slice(0, max - 1).join('')}…` : s);
let seq = 0;

/**
 * @typedef {{
 *   store: ReturnType<typeof import('../../core/store/index.js').createStore>,
 *   doc?: Document, now?: () => number,
 *   openTab: (url: string) => Promise<unknown>, openPage: (name: 'editor', params: { v: string }) => Promise<unknown>,
 *   download: (file: { name: string, text: string }) => void,
 *   clipboardWrite: (text: string) => Promise<void>,
 *   pickFiles: () => Promise<File[] | null>,
 *   diagnosticsText: () => Promise<string>,
 *   confirm?: typeof confirmDialog,
 *   setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void,
 * }} LibraryEnv
 */

/** زر بحجم صغير بأيقونة من أيقونات الصفحة، ومعطّل بسبب ظاهر حين يلزم. */
function actionButton(doc, { label, icon, variant = 'secondary', ariaLabel, disabledReason = null, onClick, className = '' }) {
  const b = el('button', {
    className: `tj-btn tj-btn--${variant} tj-btn--sm ${className}`.trim(),
    attrs: { type: 'button', ...(ariaLabel ? { 'aria-label': ariaLabel } : {}) },
    children: [icon ? pageIcon(icon, { doc }) : null, el('span', { text: label, doc })],
    doc,
  });
  if (disabledReason) {
    const id = `lib-reason-${++seq}`;
    b.setAttribute('aria-disabled', 'true');
    b.setAttribute('aria-describedby', id);
    b.title = disabledReason;
    b.append(el('span', { className: 'tj-sr-only', text: disabledReason, attrs: { id }, doc }));
  }
  b.addEventListener('click', (e) => {
    if (b.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  });
  return b;
}

/** @param {LibraryEnv} env */
export function createLibrary(env) {
  const { store, doc = document, now = Date.now } = env;
  const setTimer = env.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = env.clearTimer ?? ((id) => clearTimeout(id));
  const confirm = env.confirm ?? confirmDialog;
  const toaster = createToaster({ doc, setTimer, clearTimer });
  const state = {
    status: /** @type {'loading' | 'ready' | 'error'} */ ('loading'),
    entries: /** @type {import('../../core/model/video.js').IndexEntry[]} */ ([]),
    capacity: /** @type {import('../../core/store/capacity.js').Capacity | null} */ (null),
    query: '', order: /** @type {'updated' | 'title'} */ ('updated'), limit: PAGE_SIZE,
    error: /** @type {{ code: string, message: string } | null} */ (null),
  };
  const copyStates = new Set();
  let loadSeq = 0;
  let reloadTimer = null;

  // ---- الرأس والأدوات ----
  const countPill = el('span', { className: 'lib-count', doc });
  const quotaHost = el('div', { className: 'lib-quota-host', doc });
  const capacityAlert = el('div', { className: 'lib-capacity-alert', doc });
  const searchId = `lib-search-${++seq}`;
  const search = el('input', { className: 'tj-field__input lib-search__input', attrs: { id: searchId, type: 'search', placeholder: 'ابحث بالعنوان أو المعرّف', autocomplete: 'off', spellcheck: 'false' }, doc });
  const sortId = `lib-sort-${++seq}`;
  const sort = el('select', {
    className: 'tj-field__input lib-sort__select', attrs: { id: sortId },
    children: [el('option', { text: 'آخر تعديل', attrs: { value: 'updated' }, doc }), el('option', { text: 'العنوان', attrs: { value: 'title' }, doc })],
    doc,
  });
  const resultsLive = el('p', { className: 'tj-sr-only', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  const listHost = el('div', { className: 'lib-list-host', doc });
  const header = el('header', {
    className: 'lib-header',
    children: [
      el('div', { className: 'lib-titlebar', children: [el('span', { className: 'tj-mark', text: 'ت', attrs: { 'aria-hidden': 'true' }, doc }), el('h1', { className: 'tj-h1', text: 'المحفوظات', doc }), countPill], doc }),
      quotaHost,
    ],
    doc,
  });
  const toolbar = el('div', {
    className: 'lib-toolbar',
    children: [
      el('div', { className: 'lib-search', children: [el('label', { className: 'tj-sr-only', text: 'بحث بالعنوان أو المعرّف', attrs: { for: searchId }, doc }), pageIcon('search', { doc, className: 'tj-icon lib-search__icon' }), search], doc }),
      el('div', { className: 'lib-sort', children: [el('label', { className: 'tj-label', text: 'الترتيب', attrs: { for: sortId }, doc }), sort], doc }),
    ],
    doc,
  });
  const root = el('div', { className: 'lib', children: [header, el('p', { className: 'tj-caption lib-caption', text: CAPTION, doc }), capacityAlert, toolbar, resultsLive, listHost, toaster.root, toaster.live], doc });

  search.addEventListener('input', () => {
    state.query = search.value;
    state.limit = PAGE_SIZE;
    render();
    const n = visible().length;
    resultsLive.textContent = state.query.trim() ? (n ? `${formatCount(n, COUNT_FORMS.video)} مطابق` : 'لا نتائج') : '';
  });
  sort.addEventListener('change', () => {
    state.order = sort.value === 'title' ? 'title' : 'updated';
    render();
  });

  const visible = () => sortEntries(searchEntries(state.entries, state.query), state.order);

  /** أخطاء الأوامر رسائل عابرة بنص عربي من رمزها. */
  const fail = (err) => toaster.show(toErrorInfo(err).message, 'danger');
  const done = (code) => toaster.show(messageFor(code), 'success');

  // ---- الأوامر ----
  async function guarded(fn) {
    try {
      await fn();
    } catch (err) {
      fail(err);
      if (err instanceof TjError && (err.code === 'ST_CONFLICT' || err.code === 'PG_VIDEO_GONE')) await load();
    }
  }

  function askTiming(offsetMs) {
    const group = radioGroup({
      legend: 'توقيت الملف المصدَّر',
      options: [
        { value: 'shown', label: `كما يظهر الآن (المحفوظ + الإزاحة ${formatOffset(offsetMs)} ث)`, hint: 'الاختيار المناسب لما تشاهده فوق الفيديو.' },
        { value: 'saved', label: 'المحفوظ كما هو (دون الإزاحة)', hint: 'التوقيت المخزَّن في ترجمتك بلا تعديل.' },
      ],
      doc,
    });
    return confirm({ title: 'توقيت الملف المصدَّر', body: `لهذه الترجمة إزاحة عرض ${formatOffset(offsetMs)} ث. اختر التوقيت الذي يُكتب في الملف.`, confirmLabel: 'تصدير', content: group.root, doc })
      .then((ok) => (ok ? group.value() : null));
  }

  const exportFile = (m, option) => guarded(async () => {
    if (option.action.type === 'ar') {
      const r = await exportArabic({ store, videoId: m.videoId, variant: option.action.variant, askTiming, download: env.download });
      if (r) done('PG_EXPORT_DONE');
    } else {
      await exportEnglish({ store, videoId: m.videoId, trackKey: option.action.trackKey, download: env.download, now });
      done('PG_EXPORT_DONE');
    }
  });

  const replace = (m) => guarded(async () => {
    const files = await env.pickFiles();
    if (!files || !files.length) return;
    const { record, settings, result } = await readReplacement({ store, videoId: m.videoId, files });
    if (!result.ok) {
      toaster.show(result.error.message, 'danger');
      return;
    }
    const summary = comparisonSummary(result.comparison);
    const content = el('div', {
      className: 'lib-compare',
      children: [
        el('p', { className: 'tj-body-sm', children: [ltr(result.fileName, { mono: false, doc }), ` · ${formatCount(result.cues.length, COUNT_FORMS.cue)}`], doc }),
        alertBox({ tone: summary.tone, text: summary.lines.join('\n'), doc }),
        ...result.warnings.map((w) => el('p', { className: 'tj-caption', text: messageFor(w.code, w.params), doc })),
        el('p', { className: 'tj-caption', text: 'ستُصفَّر إزاحة العرض لأن الملف الجديد يحمل توقيته.', doc }),
        record.arabic ? el('p', { className: 'tj-caption', text: 'الأصل القديم لا يُحذف إلا بتأكيدك.', doc }) : null,
      ],
      doc,
    });
    const had = Boolean(record.arabic);
    const ok = await confirm({
      title: had ? `استبدال ترجمة "${clip(m.displayTitle, 80)}"؟` : `حفظ الترجمة العربية لـ"${clip(m.displayTitle, 80)}"؟`,
      confirmLabel: had ? 'استبدال' : 'حفظ', tone: had ? 'danger' : 'default', content, doc,
    });
    if (!ok) return;
    await applyReplacement({ store, record, settings, result, now });
    done(had ? 'PG_REPLACE_DONE' : 'PG_IMPORT_DONE');
    await load();
  });

  const remove = (m, hasArabic) => guarded(async () => {
    const options = hasArabic
      ? [{ value: 'arabic', label: 'العربية فقط (يبقى المسار الإنجليزي والبصمة)' }, { value: 'all', label: 'كل بيانات هذا الفيديو' }]
      : [{ value: 'all', label: 'كل بيانات هذا الفيديو' }];
    const group = radioGroup({ legend: 'ما يُحذف', options, doc });
    const ok = await confirm({
      title: `حذف ${hasArabic ? 'ترجمة' : 'بيانات'} "${clip(m.displayTitle, 80)}"؟`,
      body: 'لا يمكن التراجع عن الحذف.', confirmLabel: 'حذف', tone: 'danger', content: group.root, doc,
    });
    if (!ok) return;
    const scope = /** @type {'arabic' | 'all'} */ (group.value());
    await deleteVideoData({ store, videoId: m.videoId, scope, now });
    done(scope === 'arabic' ? 'PG_DELETE_ARABIC_DONE' : 'PG_DELETE_ALL_DONE');
    await load();
  });

  // ---- الصف ----
  function copyButton(m, entry) {
    const gate = copyGate(entry);
    const tipId = `lib-tip-${++seq}`;
    const label = el('span', { text: COPY_LABEL.idle, doc });
    let glyph = pageIcon('copy', { doc });
    const button = el('button', {
      className: 'tj-btn tj-btn--secondary tj-btn--sm lib-copy__button',
      attrs: { type: 'button', 'aria-label': `نسخ تعليمات ترجمة: ${m.accessName}`, 'aria-describedby': tipId, 'data-state': 'idle' },
      children: [glyph, label],
      doc,
    });
    const tip = el('span', { className: 'lib-copy__tip', text: gate.enabled ? COPY_TIP : gate.reason, attrs: { id: tipId, role: 'tooltip' }, doc });
    const wrap = el('span', { className: 'lib-copy', children: [button, tip], doc });
    if (!gate.enabled) {
      button.setAttribute('aria-disabled', 'true');
      return wrap;
    }
    const copy = createCopyState({
      // النص يُبنى عند الضغطة من السجل (العنوان) والمعرّف، ويُسلَّم إلى الحافظة ولا يُحفظ ولا يُعرض.
      buildText: () => instructions({ videoId: entry.videoId, title: entry.title }),
      write: (text) => env.clipboardWrite(text),
      announce: (code) => {
        toaster.announce(code === 'PG_COPY_DONE' ? `${messageFor(code)} ‹${m.accessName}›` : messageFor(code));
        if (code !== 'PG_COPY_DONE') toaster.show(messageFor(code), 'danger');
      },
      onState: (next) => {
        label.textContent = COPY_LABEL[next];
        const fresh = pageIcon(next === 'success' ? 'check' : 'copy', { doc });
        glyph.replaceWith(fresh);
        glyph = fresh;
        button.setAttribute('data-state', next);
        wrap.classList.toggle('lib-copy--success', next === 'success');
        wrap.classList.toggle('lib-copy--error', next === 'error');
      },
      setTimer, clearTimer,
    });
    copyStates.add(copy);
    button.addEventListener('click', () => { copy.copy(); });
    return wrap;
  }

  function buildRow(entry) {
    const m = rowModel(entry, now());
    const titleId = `lib-title-${++seq}`;
    const idCopy = el('button', {
      className: 'lib-idcopy', attrs: { type: 'button', 'aria-label': `نسخ معرّف الفيديو ${entry.videoId}` },
      children: [pageIcon('copy', { doc })], doc,
    });
    idCopy.addEventListener('click', async () => {
      try {
        await env.clipboardWrite(entry.videoId);
        toaster.show(messageFor('PG_ID_COPIED'), 'success');
      } catch {
        toaster.show(messageFor('PG_COPY_FAILED'), 'danger');
      }
    });
    const name = (verb) => `${verb}: ${m.accessName}`;
    const exportMenu = createMenu({
      label: 'تصدير SRT', ariaLabel: name('تصدير SRT'), icon: 'download', chevron: true, doc,
      items: exportOptions(entry).map((o) => ({ id: o.id, label: o.label, hint: o.hint, disabledReason: o.disabledReason, onSelect: () => exportFile(m, o) })),
    });
    const moreMenu = createMenu({
      label: 'المزيد', ariaLabel: name('المزيد'), icon: 'more', iconOnly: true, className: 'lib-more', doc,
      items: [{ id: 'delete', label: 'حذف…', tone: 'danger', icon: 'trash', onSelect: () => remove(m, entry.arabic !== null) }],
    });
    return el('li', {
      className: 'tj-card lib-row', attrs: { 'aria-labelledby': titleId },
      children: [
        el('div', {
          className: 'lib-row__info',
          children: [
            el('h2', { className: `tj-h4 tj-auto lib-row__title${m.hasTitle ? '' : ' lib-row__title--empty'}`, text: m.displayTitle, attrs: { id: titleId }, doc }),
            el('div', { className: 'lib-row__id', children: [ltr(entry.videoId, { doc }), idCopy], doc }),
            el('div', {
              className: 'lib-row__meta',
              children: [
                ...m.badges.map((b) => statusPill({ tone: b.tone, text: b.text, doc })),
                m.offsetText ? el('span', { className: 'tj-caption', text: m.offsetText, doc }) : null,
                el('span', { className: 'tj-caption', text: m.relative, attrs: { title: m.absolute }, doc }),
              ],
              doc,
            }),
          ],
          doc,
        }),
        el('div', {
          className: 'lib-row__actions',
          children: [
            actionButton(doc, { label: 'فتح الفيديو', icon: 'external', variant: 'ghost', ariaLabel: name('فتح الفيديو'), onClick: () => guarded(async () => { await env.openTab(watchUrl(entry.videoId)); }) }),
            actionButton(doc, { label: 'تعديل', icon: 'edit', ariaLabel: name('تعديل'), disabledReason: m.hasArabic ? null : messageFor('PG_NO_ARABIC'), onClick: () => guarded(async () => { await env.openPage('editor', { v: entry.videoId }); }) }),
            actionButton(doc, { label: m.hasArabic ? 'استبدال' : 'رفع ترجمة', icon: 'replace', ariaLabel: name(m.hasArabic ? 'استبدال الترجمة العربية' : 'رفع الترجمة العربية'), onClick: () => replace(m) }),
            exportMenu.root,
            copyButton(m, entry),
            moreMenu.root,
          ],
          doc,
        }),
      ],
      doc,
    });
  }

  // ---- الحالات ----
  function skeletonRows() {
    return el('div', { className: 'lib-skeleton', attrs: { 'aria-busy': 'true', 'aria-label': 'جارٍ قراءة المحفوظات' }, children: [1, 2, 3].map(() => el('div', { className: 'tj-card lib-row lib-row--skeleton', children: [el('div', { className: 'tj-skeleton lib-skel-a', doc }), el('div', { className: 'tj-skeleton lib-skel-b', doc })], doc })), doc });
  }

  function renderMeta() {
    countPill.textContent = state.status === 'ready' ? formatCount(state.entries.length, COUNT_FORMS.video) : '';
    countPill.hidden = state.status !== 'ready';
    quotaHost.replaceChildren();
    capacityAlert.replaceChildren();
    const cap = state.capacity;
    if (!cap) return;
    const text = cap.quotaBytes ? `المستخدم ${formatBytes(cap.bytesInUse)} من ${formatBytes(cap.quotaBytes)}` : `المستخدم ${formatBytes(cap.bytesInUse)}`;
    const children = [el('span', { className: 'tj-caption lib-quota__text', text, doc })];
    if (cap.quotaBytes) {
      const pct = Math.min(100, Math.round((cap.bytesInUse / cap.quotaBytes) * 100));
      const fill = el('span', { className: 'lib-meter__fill', doc });
      fill.style.width = `${pct}%`;
      children.push(el('span', { className: `lib-meter lib-meter--${cap.level}`, attrs: { role: 'meter', 'aria-label': 'المساحة المستخدمة', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, children: [fill], doc }));
    }
    quotaHost.append(el('div', { className: 'lib-quota', children, doc }));
    if (cap.code) capacityAlert.append(alertBox({ tone: cap.level === 'full' ? 'danger' : 'warning', text: messageFor(cap.code), doc }));
  }

  function render() {
    renderMeta();
    listHost.replaceChildren();
    for (const c of copyStates) c.dispose();
    copyStates.clear();
    if (state.status === 'loading') {
      listHost.append(skeletonRows());
      return;
    }
    if (state.status === 'error') {
      const copyDiag = actionButton(doc, {
        label: 'نسخ تقرير التشخيص', icon: 'clipboard',
        onClick: async () => {
          try {
            await env.clipboardWrite(await env.diagnosticsText());
            toaster.show(messageFor('PG_DIAGNOSTICS_DONE'), 'success');
          } catch {
            toaster.show(messageFor('PG_DIAGNOSTICS_FAILED'), 'danger');
          }
        },
      });
      listHost.append(alertBox({ tone: 'danger', title: 'تعذّرت قراءة المحفوظات', text: `${state.error?.message ?? messageFor('PG_LIST_FAILED')} (${state.error?.code ?? 'ST_READ_FAILED'})`, action: copyDiag, doc }));
      return;
    }
    if (!state.entries.length) {
      listHost.append(emptyState({ title: 'لا ترجمات محفوظة بعد', steps: ['افتح فيديو', 'اضغط تحميل الترجمة', 'ارفع ملفك العربي'], doc }));
      return;
    }
    const shown = visible();
    if (!shown.length) {
      const clear = actionButton(doc, { label: 'مسح البحث', variant: 'secondary', onClick: () => { search.value = ''; state.query = ''; render(); search.focus(); } });
      listHost.append(emptyState({ title: `لا نتائج لـ«${clip(state.query.trim(), 60)}»`, text: 'جرّب جزءًا آخر من العنوان أو المعرّف.', action: clear, doc }));
      return;
    }
    const slice = shown.slice(0, state.limit);
    listHost.append(el('ul', { className: 'lib-list', attrs: { role: 'list' }, children: slice.map(buildRow), doc }));
    if (shown.length > slice.length) {
      listHost.append(actionButton(doc, {
        label: `عرض المزيد (${formatCount(shown.length - slice.length, COUNT_FORMS.video)})`, variant: 'secondary', className: 'lib-more-rows',
        onClick: () => { state.limit += PAGE_SIZE; render(); },
      }));
    }
  }

  async function load() {
    const mine = ++loadSeq;
    try {
      const [entries, capacity] = await Promise.all([store.listIndex(), store.capacity()]);
      if (mine !== loadSeq) return;
      Object.assign(state, { entries, capacity, status: 'ready', error: null });
    } catch (err) {
      if (mine !== loadSeq) return;
      const info = toErrorInfo(err);
      Object.assign(state, { status: 'error', error: { code: info.code, message: info.message } });
    }
    render();
  }

  const unsubscribe = store.onChange(() => {
    if (reloadTimer !== null) clearTimer(reloadTimer);
    reloadTimer = setTimer(() => {
      reloadTimer = null;
      load();
    }, 200);
  });

  render();

  return {
    root, state, toaster, load,
    dispose() {
      unsubscribe();
      if (reloadTimer !== null) clearTimer(reloadTimer);
      for (const c of copyStates) c.dispose();
    },
  };
}
