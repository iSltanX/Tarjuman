// التوسيع في الصف (docs/identity-redesign.md §٥؛ يحل محل لوحة «الترجمات…» الجانبية، وR43/R44، وP13-AC1/AC3): بطاقة لكل ترجمة
// موجودة (الرقم والاسم المختصر القابل للتعديل، والملف، والتاريخ، وعدد التعديلات اليدوية، والإزاحة، ونتيجة المقارنة،
// والمرجع و«تغيير المرجع» عند التعدد، والعلامات، و«تفعيل» لغير النشطة، و«تصدير SRT» و«ملف بديل…» و«حذف…» بتأكيد يسرد
// ما يُحذف)، وبطاقة متقطّعة واحدة للخانة الفارغة التالية بزر «رفع ترجمة…»، وسطر «نسخة سابقة محفوظة» باستعادتها (تبديل قابل
// للعكس) وحذفها حيث خانتها. لا خانة فارغة تُعرض نسخةً، ولا خانة رابعة. كل فعل كتابة واحدة عبر actions.js ثم تُقرأ الحزمة من
// جديد؛ والرسائل العابرة للمحفوظات نفسها.
import { TjError, messageFor, toErrorInfo } from '../../core/errors/index.js';
import { SLOT_NAME_MAX } from '../../core/model/slots.js';
import { alertBox, button, el, icon, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatBytes, formatCount, offsetInline, textDirection } from '../../ui/format.js';
import { activateSlot, changeReference, deletePrevious, deleteSlot, renameSlot, restorePrevious } from './actions.js';
import { deleteContent } from './delete.js';
import { captureFocus, restoreFocus, toggleKeyOf } from './focus.js';
import { EDIT_FORMS, absoluteTime, comparisonSummary, deleteSummary, fingerprintLabel, manualEdits, relativeTime } from './model.js';
import { isolate } from './text.js';

let seq = 0;

/**
 * @param {{
 *   doc: Document, store: ReturnType<typeof import('../../core/store/index.js').createStore>, videoId: string, title: string,
 *   now: () => number, confirm: typeof import('../../ui/components.js').confirmDialog,
 *   toaster: { show: (text: string, tone?: string, opts?: object) => unknown },
 *   onChanged: () => Promise<void> | void, upload: (n: 1 | 2 | 3) => Promise<boolean>,
 *   exportSlot: (n: 1 | 2 | 3) => Promise<unknown>,
 * }} env
 * @returns {{ root: HTMLElement, id: string, refresh: () => Promise<void>, dispose: () => void }}
 */
export function createExpansion(env) {
  const { doc, store, videoId, now } = env;
  const id = `lib-exp-${++seq}`;
  const fk = (k) => `${videoId}:${k}`;
  const cards = el('div', { className: 'lib-exp__cards', doc });
  const extra = el('div', { className: 'lib-exp__extra', doc });
  const root = el('div', {
    className: 'lib-exp', attrs: { id, role: 'region', 'aria-label': `ترجمات ${isolate(env.title)}`, 'aria-busy': 'true' },
    children: [
      el('div', {
        className: 'lib-exp__head',
        children: [el('h4', { className: 'lib-exp__title', text: 'ترجمات هذا الفيديو', doc }), el('span', { className: 'lib-exp__hint', text: 'النشطة وحدها تُعرض فوق الفيديو وفي اللوحة', doc })],
        doc,
      }),
      cards, extra,
    ],
    doc,
  });
  let busy = 0;
  let disposed = false;
  let editing = false;

  const fail = (err) => env.toaster.show(toErrorInfo(err).message, 'danger');
  /** فعل كتابة: ينفّذ ثم يعيد الرسم ويبلّغ القائمة؛ الفيديو المحذوف يُبلَّغ به فقط فتسقط القائمة صفّه. */
  async function act(fn, done) {
    busy++;
    try {
      await fn();
      if (done) env.toaster.show(done, 'success');
    } catch (err) {
      fail(err);
      if (err instanceof TjError && err.code === 'PG_VIDEO_GONE') {
        busy--;
        await env.onChanged();
        return;
      }
    }
    await render();
    busy--;
    await env.onChanged();
  }

  /** رقم البطاقة التي فيها التركيز الآن (لبدائله إن زال عنصره). */
  const focusedSlot = () => {
    for (let n = doc.activeElement; n && n !== root; n = n.parentNode) {
      if (n.tagName === 'section' && n.hasAttribute?.('data-slot')) return Number(n.getAttribute('data-slot'));
    }
    return null;
  };
  const firstKeyIn = (node) => node?.querySelector('[data-fk]')?.getAttribute('data-fk') ?? null;

  /**
   * بدائل التركيز بعد إعادة الرسم حين يزول العنصر المركّز (تدقيق 7a66f91، U50): «تفعيل» إلى «تصدير SRT» في بطاقته (صارت
   * النشطة)، وحقل الاسم إلى زر التسمية، وغيرهما إلى أول عنصر في بطاقته، ثم في أقرب بطاقة بعدها أو قبلها (بطاقة حُذفت)، ثم
   * إلى أول عنصر في التوسيع، ثم إلى زر التوسيع في الصف (خارج الجذر؛ كان يُبحث عنه داخله فلا يوجد أبدًا).
   */
  function fallbacks(keep, slot) {
    const m = /:card-(\d):([\w-]+)$/.exec(keep);
    const out = [];
    if (m?.[2] === 'activate') out.push(fk(`card-${m[1]}:export`));
    if (m?.[2] === 'name') out.push(fk(`card-${m[1]}:rename`));
    const at = (n) => cards.querySelector(`section[data-slot="${n}"]`);
    if (slot) {
      out.push(firstKeyIn(at(slot)));
      const shown = [...cards.children].map((c) => Number(c.getAttribute('data-slot'))).filter(Boolean);
      const near = shown.find((n) => n > slot) ?? [...shown].reverse().find((n) => n < slot);
      if (near) out.push(firstKeyIn(at(near)));
    }
    out.push(firstKeyIn(root), { key: toggleKeyOf(keep), scope: root.parentNode });
    return out;
  }

  const paint = (cardNodes, extraNodes = []) => {
    const keep = captureFocus(doc, root);
    const slot = keep ? focusedSlot() : null;
    cards.replaceChildren(...cardNodes);
    extra.replaceChildren(...extraNodes);
    root.setAttribute('aria-busy', 'false');
    if (keep) restoreFocus(root, keep, fallbacks(keep, slot));
  };

  /** رأس البطاقة: «الترجمة 2 · Claude» وزر التسمية، والتحرير في مكانه بحقل حتى 24 محرفًا (Enter يحفظ وEsc يلغي). */
  function cardHead(s, active) {
    const label = `الترجمة ${s.n}`;
    const title = el('h4', {
      className: 'tj-h4 lib-card__title', attrs: { id: `${id}-t${s.n}` },
      children: [label, s.name ? ' · ' : null, s.name ? el('bdi', { text: s.name, dir: textDirection(s.name), doc }) : null],
      doc,
    });
    const rename = button({
      label: s.name ? `إعادة تسمية الترجمة ${s.n}` : `تسمية الترجمة ${s.n}`, iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', className: 'lib-card__rename', doc,
      onClick: () => showEditor(),
    });
    rename.setAttribute('data-fk', fk(`card-${s.n}:rename`));
    const row = el('div', { className: 'lib-card__titlerow', children: [title, rename], doc });
    function showTitle() {
      editing = false;
      row.replaceChildren(title, rename);
    }
    function showEditor() {
      editing = true;
      const input = el('input', {
        className: 'tj-field__input lib-card__name',
        attrs: { type: 'text', maxlength: String(SLOT_NAME_MAX), placeholder: 'مثل: مراجعة', autocomplete: 'off', 'aria-label': `الاسم المختصر للترجمة ${s.n}`, 'data-fk': fk(`card-${s.n}:name`) },
        dir: 'auto', doc,
      });
      input.value = s.name ?? '';
      let settled = false;
      const typed = () => input.value.replace(/\s+/g, ' ').trim();
      const cancel = () => {
        settled = true;
        showTitle();
        rename.focus?.();
      };
      const commit = () => {
        if (settled) return;
        if (typed() === (s.name ?? '')) {
          cancel();
          return;
        }
        settled = true;
        editing = false;
        act(async () => {
          try {
            await renameSlot({ store, videoId, n: s.n, name: typed() || null });
          } catch (err) {
            if (err instanceof TjError && err.code === 'MD_INVALID') throw new TjError('PG_SLOT_NAME_INVALID');
            throw err;
          }
        }, messageFor('PG_SLOT_RENAMED'));
      };
      input.addEventListener('change', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      });
      // مغادرة الحقل بلا تغيير تغلقه. ويُفحص بعد إعادة الرسم الجارية: فصلُه بتحديث في الخلفية (يطلق Chromium عليه blur) يعيده
      // مع صفه ويُعاد التركيز إليه، فلا يُغلق تحت المستخدم (تدقيق 7a66f91، I05).
      input.addEventListener('blur', () => {
        Promise.resolve().then(() => {
          if (settled || !input.isConnected || doc.activeElement === input) return;
          if (typed() === (s.name ?? '')) {
            settled = true;
            showTitle();
          }
        });
      });
      row.replaceChildren(input);
      input.focus?.();
    }
    return el('div', { className: 'lib-card__head', children: [row, active ? statusPill({ tone: 'brand', text: 'نشطة', doc }) : null], doc });
  }

  /** نتيجة المقارنة بالأصل: مطابقة بعدّها، أو المقاطع الناقصة بأرقامها، أو لا بصمة للمقارنة. */
  function resultLine(t) {
    const sum = comparisonSummary(t.comparison);
    const r = t.comparison;
    const text = sum.lines.join('\n') + (sum.tone === 'success' && r && r.countSource !== null ? ` · ${r.countTarget} من ${r.countSource}` : '');
    return el('p', {
      className: `lib-result lib-result--${sum.tone}`,
      children: [icon(sum.tone === 'success' ? 'check' : sum.tone === 'warning' ? 'warning' : 'info', { doc }), el('span', { text, doc })],
      doc,
    });
  }

  function referenceRow(b, s) {
    const fps = b.record.fingerprints;
    const current = fps.find((f) => f.id === s.track.fingerprintId) ?? null;
    const label = current ? fingerprintLabel(current, absoluteTime(current.createdAt)) : 'بلا مرجع';
    const out = [el('p', { className: 'tj-caption lib-card__ref', children: ['المرجع: ', el('span', { text: label, doc })], doc })];
    if (fps.length > 1 || (fps.length === 1 && !current)) {
      const sid = `${id}-ref-${s.n}`;
      const select = el('select', {
        className: 'tj-field__input lib-card__select', attrs: { id: sid, 'data-fk': fk(`card-${s.n}:ref`) },
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
      out.push(el('div', { className: 'tj-field lib-card__field', children: [el('label', { className: 'tj-field__label', text: 'تغيير المرجع…', attrs: { for: sid }, doc }), select], doc }));
    }
    return out;
  }

  /** سطر النسخة السابقة: تاريخها وسعتها، واستعادتها بتبديل قابل للعكس وحذفها بتأكيد. `own` داخل بطاقة خانتها (بلا «من الترجمة N»). */
  function previousLine(b, bytes, own) {
    const p = b.previous;
    const parts = ['نسخة سابقة محفوظة'];
    if (!own) parts.push(`من الترجمة ${p.from}`);
    parts.push(relativeTime(p.savedAt, now()));
    if (Number.isFinite(bytes) && bytes > 0) parts.push(formatBytes(bytes));
    const target = b.slots[p.from - 1];
    const restore = button({
      label: 'استعادة', icon: 'restore', variant: 'ghost', size: 'sm', className: 'lib-prevl__restore', title: `استعادة النسخة السابقة إلى الترجمة ${p.from}`, doc,
      onClick: async () => {
        const ok = await env.confirm({
          title: `استعادة النسخة السابقة إلى الترجمة ${p.from}؟`,
          body: target.track
            ? `تعود النسخة السابقة إلى الترجمة ${p.from}، وتصبح الحالية فيها هي النسخة السابقة؛ واستعادة ثانية تعكس ذلك.`
            : `تعود النسخة السابقة إلى الترجمة ${p.from} الفارغة.`,
          confirmLabel: 'استعادة', doc,
        });
        if (ok) await act(() => restorePrevious({ store, videoId, now, expect: b }), messageFor('PG_PREVIOUS_RESTORED', { n: p.from }));
      },
    });
    restore.setAttribute('data-fk', fk('prev:restore'));
    const remove = button({
      label: 'حذف', variant: 'ghost', size: 'sm', className: 'lib-prevl__delete', title: 'حذف النسخة السابقة', doc,
      onClick: async () => {
        const ok = await env.confirm({ title: 'حذف النسخة السابقة؟', body: 'لا يمكن استعادتها بعد الحذف.', confirmLabel: 'حذف', tone: 'danger', doc });
        // النسخة المعروضة في السطر وحدها: إن صارت السابقة غيرها قبل الموافقة لا يُحذف شيء (PG_DELETE_STALE).
        if (ok) await act(() => deletePrevious({ store, videoId, expect: b }), messageFor('PG_PREVIOUS_DELETED'));
      },
    });
    remove.setAttribute('data-fk', fk('prev:delete'));
    return el('div', {
      className: 'lib-prevl',
      children: [
        icon('restore', { doc, className: 'tj-icon lib-prevl__icon' }),
        el('span', { className: 'lib-prevl__text', text: parts.join(' · '), attrs: { title: `${p.track.fileName} · ${formatCount(p.track.original.length, COUNT_FORMS.cue)} · ${absoluteTime(p.savedAt)}` }, doc }),
        restore, remove,
      ],
      doc,
    });
  }

  async function removeSlot(s) {
    // الملخص من أحدث حزمة لا من لقطة الرسم: ما يُسرد هو ما سيُحذف فعلًا.
    const fresh = await store.getBundle(videoId);
    if (!fresh) throw new TjError('PG_VIDEO_GONE');
    // خانة حذفها تبويب آخر والفيديو باقٍ: رسالتها هي، لا «لم يعد الفيديو محفوظًا» (تدقيق 7a66f91، U14).
    if (!fresh.slots[s.n - 1]?.track) throw new TjError('PG_SLOT_GONE', { detail: String(s.n) });
    const ok = await env.confirm({
      title: `حذف الترجمة ${s.n}؟`, confirmLabel: 'حذف', tone: 'danger', doc,
      content: deleteContent({ doc, subtitle: env.title, summary: deleteSummary(fresh, { scope: 'slot', n: s.n }), note: 'لا يمكن التراجع. صدّر الترجمة أولًا إن كنت قد تحتاجها.' }),
    });
    if (!ok) return;
    // ما سُرد هو ما يُحذف: إن تغيّرت الحزمة قبل الموافقة (استُبدلت الخانة من تبويب آخر مثلًا) لا يُحذف شيء (PG_DELETE_STALE).
    await act(() => deleteSlot({ store, videoId, n: s.n, now, expect: fresh }), messageFor('PG_SLOT_DELETED', { n: s.n }));
  }

  const guarded = (fn) => async () => {
    try {
      await fn();
    } catch (err) {
      fail(err);
      if (err instanceof TjError && err.code === 'PG_VIDEO_GONE') await env.onChanged();
      // الخانة الغائبة: تُعاد البطاقات، أو تُزال بطاقتها وحدها والمستخدم يسمّي خانة أخرى فلا يضيع ما يكتبه.
      if (err instanceof TjError && err.code === 'PG_SLOT_GONE') {
        if (editing || busy) cards.querySelector(`section[data-slot="${err.detail}"]`)?.remove();
        else await render();
        await env.onChanged();
      }
    }
  };

  function slotCard(b, s, bytes) {
    const active = b.active === s.n;
    const t = s.track;
    const cues = t.current ?? t.original;
    const edits = manualEdits(t);
    const todo = s.marks.filter((m) => m.kind === 'todo').length;
    const done = s.marks.length - todo;
    const name = `الترجمة ${s.n}`;
    const act1 = (label, opts) => {
      const b1 = button({ label, size: 'sm', doc, ...opts });
      b1.setAttribute('aria-label', `${label}: ${name}`);
      return b1;
    };
    const mark = (btn, k) => {
      btn.setAttribute('data-fk', fk(`card-${s.n}:${k}`));
      return btn;
    };
    const actions = [
      active ? null : mark(act1('تفعيل', { variant: 'primary', onClick: () => act(() => activateSlot({ store, videoId, n: s.n, now }), messageFor('PG_SLOT_ACTIVATED', { n: s.n })) }), 'activate'),
      mark(act1('تصدير SRT', { variant: 'secondary', icon: 'download', onClick: guarded(() => env.exportSlot(s.n)) }), 'export'),
      mark(act1('ملف بديل…', { variant: 'ghost', icon: 'replace', onClick: () => env.upload(s.n) }), 'replace'),
      mark(act1('حذف…', { variant: 'ghost', className: 'lib-card__delete', onClick: guarded(() => removeSlot(s)) }), 'delete'),
    ];
    return el('section', {
      className: `lib-card${active ? ' lib-card--active' : ''}`, attrs: { 'data-slot': String(s.n), 'aria-labelledby': `${id}-t${s.n}` },
      children: [
        cardHead(s, active),
        el('p', { className: 'lib-card__file', children: [ltr(t.fileName, { mono: true, doc }), ` · ${formatCount(cues.length, COUNT_FORMS.cue)}`], doc }),
        el('p', {
          className: 'tj-caption lib-card__meta',
          children: [
            el('span', { text: `رُفعت ${relativeTime(t.importedAt, now())}`, attrs: { title: absoluteTime(t.importedAt) }, doc }),
            ` · ${edits ? formatCount(edits, EDIT_FORMS) : 'بلا تعديل'} · الإزاحة ${offsetInline(s.offsetMs)} ث`,
          ],
          doc,
        }),
        resultLine(t),
        ...referenceRow(b, s),
        s.marks.length ? el('p', { className: 'tj-caption lib-card__marks', text: `العلامات: ${todo} أعود إليه · ${done} راجعته`, doc }) : null,
        b.previous && b.previous.from === s.n ? previousLine(b, bytes, true) : null,
        el('div', { className: 'lib-card__actions', children: actions, doc }),
      ],
      doc,
    });
  }

  function emptyCard(b, n, bytes) {
    const up = button({ label: 'رفع ترجمة…', icon: 'upload', variant: 'secondary', size: 'sm', doc, onClick: () => env.upload(n) });
    up.setAttribute('aria-label', `رفع ترجمة…: الترجمة ${n}`);
    up.setAttribute('data-fk', fk('empty:upload'));
    return el('section', {
      className: 'lib-card lib-card--empty', attrs: { 'data-slot': String(n), 'aria-labelledby': `${id}-t${n}` },
      children: [
        el('h4', { className: 'tj-h4 lib-card__title', text: `الترجمة ${n} · خانة فارغة`, attrs: { id: `${id}-t${n}` }, doc }),
        el('p', { className: 'tj-caption', text: 'ارفع ملفًا عربيًا آخر لتقارن بين الترجمات وتختار أدقّها.', doc }),
        b.previous && b.previous.from === n ? previousLine(b, bytes, true) : null,
        el('div', { className: 'lib-card__actions', children: [up], doc }),
      ],
      doc,
    });
  }

  async function render() {
    if (disposed) return;
    let b;
    let bytes = null;
    try {
      b = await store.getBundle(videoId);
      // الحجم تفصيل في سطر النسخة السابقة: فشل قياسه (تدقيق 7a66f91، U03) يحذفه وحده ولا يُسقط البطاقات وأزرارها.
      bytes = b?.previous ? await store.bundleBytes(videoId).then((x) => x.previous, () => null) : null;
    } catch (err) {
      paint([alertBox({ tone: 'danger', text: toErrorInfo(err).message, doc })]);
      return;
    }
    if (disposed) return;
    if (!b) {
      paint([alertBox({ tone: 'info', text: messageFor('PG_VIDEO_GONE'), doc })]);
      return;
    }
    const filled = b.slots.filter((s) => s.track);
    const free = b.slots.find((s) => !s.track) ?? null;
    const nodes = filled.map((s) => slotCard(b, s, bytes));
    if (free) nodes.push(emptyCard(b, free.n, bytes));
    // نسخة سابقة لخانة لا بطاقة لها (فارغة غير التالية): سطر قائم بذاته تحت البطاقات، لا تضيع الاستعادة.
    const hasOwnCard = b.previous && (filled.some((s) => s.n === b.previous.from) || free?.n === b.previous.from);
    paint(nodes, b.previous && !hasOwnCard ? [previousLine(b, bytes, false)] : []);
  }

  return {
    root, id,
    /** إعادة القراءة بعد تغيّر القائمة؛ لا تُعاد والمستخدم يسمّي أو فعلٌ جارٍ (يرسم بنفسه بعده). */
    async refresh() {
      if (busy || editing || disposed) return;
      await render();
    },
    dispose() {
      disposed = true;
    },
  };
}
