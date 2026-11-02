// لوحة «الترجمات…» (R43/R44، P13-AC1/AC3، مواصفة التصميم §١٩.٧): لوحة جانبية بعرض نحو 420 فيها بطاقة لكل خانة (الرقم،
// والاسم المختصر القابل للتعديل، والملف، والتاريخ، و«معدّلة»، وملخص المقارنة، والمرجع و«تغيير المرجع…» عند التعدد،
// والإزاحة، والعلامات، و«تفعيل»، و«حذف هذه الترجمة» بتأكيد)، وبطاقة «النسخة السابقة» (مصدرها وتاريخها وسعتها، و«استعادة»
// بتبديل قابل للعكس، و«حذف»). هنا التفاصيل التي لا تُعرض فوق الفيديو. كل تغيير كتابة واحدة، ثم تُقرأ الحزمة من جديد.
import { TjError, messageFor, toErrorInfo } from '../../core/errors/index.js';
import { SLOT_NAME_MAX } from '../../core/model/slots.js';
import { alertBox, button, el, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatBytes, formatCount, formatOffset } from '../../ui/format.js';
import { activateSlot, changeReference, deletePrevious, deleteSlot, renameSlot, restorePrevious } from './actions.js';
import { absoluteTime, comparisonSummary, fingerprintLabel, manualEdits, previousCard, relativeTime } from './model.js';

let seq = 0;
const EDIT_FORMS = Object.freeze({ one: 'تعديل يدوي واحد', two: 'تعديلان يدويان', few: 'تعديلات يدوية', many: 'تعديلًا يدويًا', single: 'تعديل يدوي' });

/**
 * يفتح اللوحة ويعيد وعدًا يُحل عند إغلاقها.
 * @param {{
 *   doc: Document, store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, title: string,
 *   now: () => number, confirm: typeof import('../../ui/components.js').confirmDialog,
 *   toaster: { show: (text: string, tone?: string, opts?: object) => unknown },
 *   onChanged: () => Promise<void> | void, upload: (n: 1 | 2 | 3) => Promise<boolean>,
 * }} env
 */
export function openTranslations(env) {
  const { doc, store, videoId, now } = env;
  const id = `lib-panel-${++seq}`;
  const body = el('div', { className: 'lib-panel__body', doc });
  const close = button({ label: 'إغلاق', iconOnly: true, icon: 'x', variant: 'ghost', size: 'sm', doc, onClick: () => dialog.close() });
  const dialog = el('dialog', {
    className: 'tj-dialog lib-panel', attrs: { 'aria-labelledby': `${id}-title` },
    children: [
      el('div', { className: 'lib-panel__head', children: [el('h2', { className: 'tj-h3 lib-panel__title', text: `الترجمات — ${env.title}`, dir: 'auto', attrs: { id: `${id}-title` }, doc }), close], doc }),
      body,
    ],
    doc,
  });

  const fail = (err) => env.toaster.show(toErrorInfo(err).message, 'danger');
  /** فعل كتابة: ينفّذ ثم يعيد الرسم ويبلّغ القائمة؛ الفيديو المحذوف يغلق اللوحة. */
  async function act(fn, done) {
    busy++;
    try {
      await fn();
      if (done) env.toaster.show(done, 'success');
    } catch (err) {
      fail(err);
      if (err instanceof TjError && err.code === 'PG_VIDEO_GONE') {
        busy--;
        dialog.close();
        await env.onChanged();
        return;
      }
    }
    await render();
    busy--;
    await env.onChanged();
  }

  function nameField(s) {
    const fid = `${id}-name-${s.n}`;
    const input = el('input', { className: 'tj-field__input lib-slot__name', attrs: { id: fid, type: 'text', maxlength: String(SLOT_NAME_MAX), placeholder: 'مثل: مراجعة', autocomplete: 'off' }, dir: 'auto', doc });
    input.value = s.name ?? '';
    const error = el('span', { className: 'tj-field__error', attrs: { id: `${fid}-error`, role: 'alert' }, doc });
    error.hidden = true;
    input.addEventListener('change', () => {
      const name = input.value.replace(/\s+/g, ' ').trim();
      if (name === (s.name ?? '')) return;
      act(async () => {
        try {
          await renameSlot({ store, videoId, n: s.n, name: name || null });
        } catch (err) {
          if (err instanceof TjError && err.code === 'MD_INVALID') throw new TjError('PG_SLOT_NAME_INVALID');
          throw err;
        }
      }, messageFor('PG_SLOT_RENAMED'));
    });
    return el('div', { className: 'tj-field lib-slot__field', children: [el('label', { className: 'tj-field__label', text: 'الاسم المختصر', attrs: { for: fid }, doc }), input, error], doc });
  }

  function referenceRow(b, s) {
    const fps = b.record.fingerprints;
    const current = fps.find((f) => f.id === s.track.fingerprintId) ?? null;
    const label = current ? fingerprintLabel(current, absoluteTime(current.createdAt)) : 'بلا مرجع';
    const children = [el('p', { className: 'tj-body-sm lib-slot__ref', children: ['المرجع: ', el('span', { text: label, doc })], doc })];
    if (fps.length > 1 || (fps.length === 1 && !current)) {
      const sid = `${id}-ref-${s.n}`;
      const select = el('select', {
        className: 'tj-field__input lib-slot__select', attrs: { id: sid },
        children: [
          ...fps.map((f) => el('option', { text: fingerprintLabel(f, absoluteTime(f.createdAt)), attrs: { value: f.id }, doc })),
          el('option', { text: 'بلا مرجع', attrs: { value: '' }, doc }),
        ],
        doc,
      });
      select.value = current?.id ?? '';
      select.addEventListener('change', () => {
        act(() => changeReference({ store, videoId, n: s.n, fingerprintId: select.value || null, now }), messageFor('PG_REFERENCE_CHANGED', { n: s.n }));
      });
      children.push(el('div', { className: 'tj-field lib-slot__field', children: [el('label', { className: 'tj-field__label', text: 'تغيير المرجع…', attrs: { for: sid }, doc }), select], doc }));
    }
    return children;
  }

  function slotCard(b, s) {
    const head = el('div', {
      className: 'lib-slot__head',
      children: [
        el('h3', { className: 'tj-h4', text: `الترجمة ${s.n}`, doc }),
        !s.track ? statusPill({ tone: 'neutral', plain: true, text: 'فارغة', doc }) : b.active === s.n ? statusPill({ tone: 'brand', text: 'نشطة', doc }) : null,
      ],
      doc,
    });
    if (!s.track) {
      return el('section', {
        className: 'lib-slot lib-slot--empty', attrs: { 'data-slot': String(s.n) },
        children: [head, el('div', { className: 'lib-slot__actions', children: [button({ label: 'رفع ترجمة إليها…', icon: 'upload', size: 'sm', variant: 'secondary', doc, onClick: () => uploadInto(s.n) })], doc })],
        doc,
      });
    }
    const t = s.track;
    const cues = t.current ?? t.original;
    const edits = manualEdits(t);
    const summary = comparisonSummary(t.comparison);
    const todo = s.marks.filter((m) => m.kind === 'todo').length;
    const done = s.marks.length - todo;
    const actions = [
      b.active === s.n ? null : button({ label: 'تفعيل', icon: 'check', size: 'sm', variant: 'secondary', doc, onClick: () => act(() => activateSlot({ store, videoId, n: s.n, now }), messageFor('PG_SLOT_ACTIVATED', { n: s.n })) }),
      button({ label: 'رفع ملف بديل…', icon: 'replace', size: 'sm', variant: 'ghost', doc, onClick: () => uploadInto(s.n) }),
      button({ label: 'حذف هذه الترجمة…', icon: 'trash', size: 'sm', variant: 'ghost', className: 'lib-slot__delete', doc, onClick: () => removeSlot(b, s) }),
    ];
    return el('section', {
      className: `lib-slot${b.active === s.n ? ' lib-slot--active' : ''}`, attrs: { 'data-slot': String(s.n) },
      children: [
        head,
        nameField(s),
        el('p', {
          className: 'tj-body-sm lib-slot__file',
          children: [ltr(t.fileName, { mono: false, doc }), ` · ${formatCount(cues.length, COUNT_FORMS.cue)} · `, el('span', { text: `رُفعت ${relativeTime(t.importedAt, now())}`, attrs: { title: absoluteTime(t.importedAt) }, doc })],
          doc,
        }),
        edits ? el('p', { className: 'lib-slot__edited', children: [statusPill({ tone: 'edited', text: 'معدّلة', doc }), el('span', { className: 'tj-caption', text: ` ${formatCount(edits, EDIT_FORMS)}`, doc })], doc }) : null,
        alertBox({ tone: summary.tone, text: summary.lines.join('\n'), doc }),
        ...referenceRow(b, s),
        el('p', { className: 'tj-caption lib-slot__offset', text: `الإزاحة ${formatOffset(s.offsetMs)} ث`, doc }),
        s.marks.length ? el('p', { className: 'tj-caption lib-slot__marks', text: `العلامات: ${todo} أعود إليه · ${done} راجعته`, doc }) : null,
        el('div', { className: 'lib-slot__actions', children: actions, doc }),
      ],
      doc,
    });
  }

  async function removeSlot(b, s) {
    const others = b.slots.filter((x) => x.track && x.n !== s.n).map((x) => x.n);
    const body = b.active === s.n && others.length
      ? `تُحذف الترجمة ${s.n} باسمها وعلاماتها، وتصبح الترجمة ${others[0]} النشطة. النسخة السابقة تبقى. لا يمكن التراجع.`
      : `تُحذف الترجمة ${s.n} باسمها وعلاماتها. النسخة السابقة تبقى. لا يمكن التراجع.`;
    const ok = await env.confirm({ title: `حذف الترجمة ${s.n}؟`, body, confirmLabel: 'حذف', tone: 'danger', doc });
    if (!ok) return;
    await act(() => deleteSlot({ store, videoId, n: s.n, now }), messageFor('PG_SLOT_DELETED', { n: s.n }));
  }

  async function uploadInto(n) {
    if (await env.upload(n)) await render();
  }

  function previousSection(b, bytes) {
    const card = previousCard(b.previous, bytes, now(), formatBytes);
    const head = el('h3', { className: 'tj-h4', text: 'النسخة السابقة', doc });
    if (!card) {
      return el('section', { className: 'lib-slot lib-prev lib-prev--none', children: [head, el('p', { className: 'tj-caption', text: 'لا نسخة سابقة. تُحفظ تلقائيًا عند استبدال أي ترجمة، وتعود منها بضغطة.', doc })], doc });
    }
    const target = b.slots[card.from - 1];
    const restore = button({
      label: 'استعادة', icon: 'restore', size: 'sm', variant: 'secondary', doc,
      onClick: async () => {
        const ok = await env.confirm({
          title: `استعادة النسخة السابقة إلى الترجمة ${card.from}؟`,
          body: target.track
            ? `تعود النسخة السابقة إلى الترجمة ${card.from}، وتصبح الحالية فيها هي النسخة السابقة؛ واستعادة ثانية تعكس ذلك.`
            : `تعود النسخة السابقة إلى الترجمة ${card.from} الفارغة.`,
          confirmLabel: 'استعادة', doc,
        });
        if (ok) await act(() => restorePrevious({ store, videoId, now }), messageFor('PG_PREVIOUS_RESTORED', { n: card.from }));
      },
    });
    const remove = button({
      label: 'حذف', icon: 'trash', size: 'sm', variant: 'ghost', doc,
      onClick: async () => {
        const ok = await env.confirm({ title: 'حذف النسخة السابقة؟', body: 'لا يمكن استعادتها بعد الحذف.', confirmLabel: 'حذف', tone: 'danger', doc });
        if (ok) await act(() => deletePrevious({ store, videoId }), messageFor('PG_PREVIOUS_DELETED'));
      },
    });
    return el('section', {
      className: 'lib-slot lib-prev',
      children: [
        head,
        el('p', { className: 'tj-body-sm lib-prev__line', text: card.line, attrs: { title: card.absolute }, doc }),
        el('p', { className: 'tj-caption', children: [ltr(card.fileName, { mono: false, doc }), ` · ${card.cueText}`], doc }),
        el('p', { className: 'tj-caption', text: 'ليست ترجمة رابعة: لا تظهر في 1 2 3، وتعود إلى خانتها بالاستعادة.', doc }),
        el('div', { className: 'lib-slot__actions', children: [restore, remove], doc }),
      ],
      doc,
    });
  }

  async function render() {
    let b;
    let bytes = null;
    try {
      b = await store.getBundle(videoId);
      bytes = b?.previous ? (await store.bundleBytes(videoId)).previous : null;
    } catch (err) {
      body.replaceChildren(alertBox({ tone: 'danger', text: toErrorInfo(err).message, doc }));
      return;
    }
    if (!b) {
      body.replaceChildren(alertBox({ tone: 'info', text: messageFor('PG_VIDEO_GONE'), doc }));
      return;
    }
    shown = `${b.record.rev}|${b.record.updatedAt}`;
    body.replaceChildren(...b.slots.map((s) => slotCard(b, s)), previousSection(b, bytes));
  }

  // تغيّر الحزمة من مكان آخر (تبويب آخر أو المشغّل) واللوحة مفتوحة: يُعاد رسمها بنسختها الأحدث، فلا تبني تأكيداتها على لقطة
  // قديمة؛ إلا والمستخدم يكتب اسمًا أو فعلٌ جارٍ (يرسمها بنفسه بعده). صدى كتابات اللوحة نفسها لا يعيد الرسم (تدقيق 5fedcb9،
  // GM-016.2).
  let shown = null;
  let busy = 0;
  const later = doc.defaultView?.setTimeout?.bind(doc.defaultView) ?? setTimeout;
  let pending = null;
  const refreshIfChanged = async () => {
    pending = null;
    if (busy || (doc.activeElement && body.contains(doc.activeElement) && doc.activeElement.tagName === 'input')) return;
    let latest;
    try {
      latest = await store.getBundle(videoId);
    } catch {
      return;
    }
    if (!latest || `${latest.record.rev}|${latest.record.updatedAt}` !== shown) await render();
  };
  const unsubscribe = typeof store.onChange === 'function' ? store.onChange((ch) => {
    if (!(ch.cleared || ch.videos?.[videoId] || ch.bundles?.includes(videoId)) || pending) return;
    pending = later(refreshIfChanged, 150);
  }) : () => {};

  // رسائل نتائج الأفعال داخل الحوار المشروط لا تحت خلفيته: ما خارجه خامل بصريًا ولقارئ الشاشة (تدقيق 5fedcb9، CL-006
  // وCL-015). تُنقل حاويتا الممرر إليه مدة فتحه وتعودان مكانهما.
  const moved = [env.toaster.root, env.toaster.live].filter((n) => n && n.parentNode).map((n) => ({ n, parent: n.parentNode, next: n.nextSibling }));
  const closed = new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      unsubscribe();
      for (const { n, parent, next } of moved) parent.insertBefore(n, next && next.parentNode === parent ? next : null);
      dialog.remove();
      resolve();
    }, { once: true });
  });
  doc.body.append(dialog);
  dialog.showModal();
  for (const { n } of moved) dialog.append(n);
  const ready = render().then(() => close.focus?.());
  return { dialog, closed, ready, render };
}
