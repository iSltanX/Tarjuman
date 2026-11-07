// محتوى القوائم الصغيرة (مواصفة التصميم §٦ و§١٩): التحميل، والرفع والعرض، والتوقيت، وتأكيد الاستبدال. كل باني دالة
// نقية من نموذج العرض إلى عقد DOM (textContent وsetAttribute فقط)، والأفعال تُبلَّغ إلى الجلسة. العنصر الذي يُستعاد
// إليه التركيز بعد إعادة البناء يحمل data-fid، وأول عنصر للتركيز data-first. القوائم إجراءات سريعة مضغوطة بلا فقرات شرح
// («المشغّل للمشاهدة»): الأدوات المرتبطة في صفوف (أوضاع العرض، والتنزيل والنسخ، والمزامنة والتصفير)، والشرح في التلميح،
// والتفاصيل في صفحات الإضافة. نص تعليمات الترجمة لا يمر من هنا أبدًا.
import { messageFor } from '../../core/errors/index.js';
import { formatOffset, textDirection } from '../../ui/format.js';
import { glyph } from './glyphs.js';
import {
  LABELS, comparisonSummary, cueCount, dualLabels, editsLine, glossaryTag, keptLine, offsetMeaning, partRow, previousLostLine, shortTime, slotLabel, stepSeconds,
  syncAt, trackLine, translationLine,
} from './text.js';

/**
 * @typedef {(name: string, value?: unknown) => void} Act
 * @typedef {(tag: string, o?: { className?: string, text?: string, attrs?: Record<string, string>, on?: Record<string, (ev: any) => void>, children?: (Node | null | false | undefined)[] }) => HTMLElement} H
 * @typedef {{ n: number, filled: boolean, active: boolean, name: string | null }} SlotModel
 */

/** @param {Document} doc @returns {H & { glyph: (tone: string, className?: string) => SVGSVGElement }} */
export function builder(doc) {
  const h = (tag, { className, text, attrs, on, children } = {}) => {
    const n = doc.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    for (const [k, v] of Object.entries(attrs ?? {})) if (v !== null && v !== undefined) n.setAttribute(k, v);
    for (const [t, fn] of Object.entries(on ?? {})) n.addEventListener(t, fn);
    for (const c of children ?? []) if (c) n.appendChild(c);
    return n;
  };
  h.glyph = (tone, className) => glyph(doc, tone, className);
  return h;
}

const sign = (ms) => (Math.round(ms / 100) === 0 ? 'zero' : ms > 0 ? 'positive' : 'negative');

/** @param {H} h @param {'info' | 'warn' | 'error'} tone @param {string} text @param {Node[]} [extra] */
function alert(h, tone, text, extra = []) {
  return h('div', {
    className: 'alert',
    attrs: { 'data-tone': tone, role: tone === 'info' ? 'note' : 'alert' },
    children: [h.glyph?.(tone) ?? null, h('div', { className: 'stack', children: [h('span', { text }), ...extra] })],
  });
}

/** عنوان قسم صغير فوق مجموعته («اللغة»، «وضع التصدير»، «وضع العرض»). */
const label = (h, text) => h('div', { className: 'label', text });
const sep = (h) => h('div', { className: 'sep' });

/** سطر حالة برمزه SVG ونص بنغمته: «الإنجليزية · يدوية · 412 مقطعًا» أو «العربية · 412 مقطعًا · معدّلة». */
function statusRow(h, tone, text, fid) {
  return h('div', {
    className: 'row status', attrs: { 'data-tone': tone, 'data-fid': fid },
    children: [h.glyph?.(tone) ?? null, h('span', { className: 'line__text', text })],
  });
}

/** سطر ملخص المقارنة برمزه: «مطابق للأصل» بعلامة النجاح، والاختلاف بعلامة التحذير. */
function summaryRow(h, summary) {
  return h('div', {
    className: 'row summary', attrs: { 'data-tone': summary.tone },
    children: [summary.tone === 'info' ? null : h.glyph?.(summary.tone === 'ok' ? 'ok' : 'warn') ?? null, h('span', { text: summary.text.replace(/\s*✓$/, '') })],
  });
}

/** زر بنص (وأيقونة اختيارية)؛ المعطّل يبقى قابلًا للتركيز ويقرأ سببه. */
function button(h, cls, text, { act, name, value, disabled = false, reason = null, fid = null, first = false, icon = null, title = null, extra = {} } = {}) {
  return h('button', {
    className: cls,
    attrs: {
      type: 'button', 'data-fid': fid, 'data-first': first ? '' : null, title: title ?? (disabled && reason ? reason : null),
      'aria-disabled': disabled ? 'true' : null, 'aria-description': disabled && reason ? reason : null, ...extra,
    },
    // التعطيل يُقرأ من العقدة لحظة النقر: العقدة تبقى عبر التحديث في مكانها وقد يتغير تعطيلها.
    on: { click: (ev) => (ev.currentTarget.getAttribute('aria-disabled') === 'true' ? undefined : act(name, value)) },
    children: [
      icon ? h.glyph?.(icon, 'glyph glyph--btn') ?? null : null,
      h('span', { className: 'stack', children: [h('span', { text }), disabled && reason && cls.includes('item') ? h('span', { className: 'reason', text: reason }) : null] }),
    ],
  });
}

/**
 * مجموعة اختيار واحد أفقية (عادي / مقاطع أطول، وأوضاع العرض، والخطوة). الخيار المعطّل يبقى قابلًا للتركيز ويذكر سببه في
 * التلميح واسم الوصول؛ والشرح الطويل في التلميح لا في سطر تحت المجموعة.
 * @param {{ value: string, label: string, title?: string, aria?: string, disabled?: boolean, reason?: string | null }[]} options
 */
function segmented(h, label, options, current, act, name, fid, { first = false, root = null } = {}) {
  const focusV = (options.find((o) => o.value === current) ?? options[0])?.value;
  return h('div', {
    className: 'seg',
    attrs: { role: 'radiogroup', 'aria-label': label },
    // نقطة Tab واحدة للمجموعة، والأسهم تنقل التركيز بين خياراتها (تُقرأ بترتيب الصفحة RTL: الأيسر إلى التالي).
    on: {
      keydown: (ev) => {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        const list = [...ev.currentTarget.children];
        const at = list.indexOf(root?.activeElement ?? null);
        if (at === -1 || list.length < 2) return;
        ev.preventDefault();
        list[(at + (ev.key === 'ArrowLeft' ? 1 : -1) + list.length) % list.length].focus();
      },
    },
    children: options.map((o) => h('button', {
      text: o.label,
      attrs: {
        type: 'button', role: 'radio', 'aria-checked': o.value === current ? 'true' : 'false', 'data-fid': `${fid}:${o.value}`,
        'data-first': first && o.value === current ? '' : null, tabindex: o.value === focusV ? '0' : '-1',
        'aria-label': o.aria ?? null, title: o.disabled && o.reason ? o.reason : o.title ?? o.aria ?? null,
        'aria-disabled': o.disabled ? 'true' : null, 'aria-description': o.disabled && o.reason ? o.reason : null,
      },
      on: { click: (ev) => (ev.currentTarget.getAttribute('aria-disabled') === 'true' ? undefined : act(name, o.value)) },
    })),
  });
}

/**
 * أزرار خانات ضمن مجموعة اختيار واحد داخل الجذر المغلق (فالتركيز من الجذر لا من المستند): التركيز بالأسهم بين المتاحة، وEnter
 * وSpace تختار. الأرقام تُقرأ من اليسار كخط الأعداد.
 * @param {H} h @param {{ n: number, text: string, label: string, title: string | null, checked: boolean, fid: string }[]} items
 */
function radioRow(h, act, name, items, { disabled = false, root = null, label, first = false } = {}) {
  const focusN = (items.find((i) => i.checked) ?? items[0])?.n ?? null;
  return h('div', {
    className: 'slots',
    attrs: { role: 'radiogroup', 'aria-label': label, 'aria-disabled': disabled ? 'true' : null },
    on: {
      keydown: (ev) => {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        const list = [...ev.currentTarget.children].filter((b) => b.getAttribute('aria-disabled') !== 'true');
        const at = list.indexOf(root?.activeElement ?? null);
        if (at === -1 || list.length < 2) return;
        ev.preventDefault();
        list[(at + (ev.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length].focus();
      },
    },
    children: items.map((it) => h('button', {
      className: `slot${it.n === null ? ' slot--new' : ''}`, text: it.text,
      attrs: {
        type: 'button', role: 'radio', 'aria-checked': it.checked ? 'true' : 'false', 'aria-disabled': disabled ? 'true' : null,
        'aria-label': it.label, title: it.title, 'data-fid': it.fid, tabindex: it.n === focusN ? '0' : '-1',
        'data-first': first && it.checked ? '' : null,
      },
      // الإتاحة والاختيار يُقرآن من العقدة لحظة النقر (تبقى في مكانها عبر التحديث).
      on: { click: (ev) => (ev.currentTarget.getAttribute('aria-disabled') !== 'true' && ev.currentTarget.getAttribute('aria-checked') !== 'true' ? act(name, it.value) : undefined) },
    })),
  });
}

/**
 * محدد الترجمات الموجودة (§١٩.٢، وجولة الصقل): زر لكل خانة محفوظة برقمها، والنشطة بلون الإبراز، ولا خانات فارغة؛ ولا شيء
 * حين لا تكون إلا ترجمة واحدة (null). رقم الخانة هويتها الثابتة في المشغّل والمحفوظات والمحرّر، فيبقى الربط سليمًا بعد الحذف.
 * @param {H} h @param {Act} act @param {SlotModel[]} slots
 * @param {{ disabled?: boolean, root?: ShadowRoot | null }} [o]
 */
function slotPicker(h, act, slots, { disabled = false, root = null } = {}) {
  const filled = slots.filter((s) => s.filled);
  if (filled.length < 2) return null;
  return radioRow(h, act, 'slot', filled.map((s) => ({
    n: s.n, value: s.n, text: String(s.n), label: slotLabel(s), title: s.name ? `${slotLabel(s)} — ${s.name}` : slotLabel(s), checked: s.active, fid: `slot:${s.n}`,
  })), { disabled, root, label: LABELS.slots });
}

/**
 * «حفظ في» عند تأكيد الرفع: الخانات المحفوظة (الحفظ فيها استبدال) ثم «جديدة» لأول خانة فارغة إن وُجدت. لا تُعرض الخانات الفارغة
 * أرقامًا. وحين لا خيار إلا «جديدة» سطر وصفي بلا محدد.
 * @param {H} h @param {Act} act @param {SlotModel[]} slots @param {number} target
 * @param {{ disabled?: boolean, root?: ShadowRoot | null }} [o]
 */
function targetPicker(h, act, slots, target, { disabled = false, root = null } = {}) {
  const filled = slots.filter((s) => s.filled);
  const free = slots.find((s) => !s.filled) ?? null;
  if (!filled.length) return h('span', { className: 'dim', text: LABELS.savesAsNew });
  const items = filled.map((s) => ({ n: s.n, value: s.n, text: String(s.n), label: `استبدال ${slotLabel(s)}`, title: s.name ? `استبدال ${slotLabel(s)} — ${s.name}` : `استبدال ${slotLabel(s)}`, checked: s.n === target, fid: `target:${s.n}` }));
  if (free) items.push({ n: null, value: free.n, text: LABELS.saveNew, label: LABELS.saveNewLabel, title: LABELS.saveNewLabel, checked: free.n === target, fid: `target:${free.n}` });
  return radioRow(h, act, 'target', items, { disabled, root, label: LABELS.saveTo, first: true });
}

/** سطر نتيجة مستقل (§١٩.٥): «✓ نُزّل …» أو «✓ نُسخت التعليمات»؛ وتعذّر النسخ زر يعيد المحاولة. */
function resultLine(h, act, line, fid) {
  const tone = line.tone === 'ok' ? 'ok' : line.tone === 'error' ? 'error' : 'info';
  if (line.tone === 'error' && fid === 'copyLine') {
    return h('button', { className: 'line', attrs: { type: 'button', 'data-tone': 'error', 'data-fid': fid, 'aria-live': 'polite' }, on: { click: () => act('copy') }, children: [h.glyph?.(tone) ?? null, h('span', { text: line.text })] });
  }
  return h('div', { className: 'line', attrs: { 'data-tone': line.tone, 'data-fid': fid, role: line.tone === 'error' ? 'alert' : 'status' }, children: [h.glyph?.(tone) ?? null, h('span', { className: 'line__text', text: line.text })] });
}

/**
 * قائمة التحميل (§٦.١ و§١٩.٥، وجولة الصقل): زرّان مستقلان في صف واحد، «تنزيل الملف» يحفظ ملف SRT وحده و«نسخ التعليمات» ينسخ
 * التعليمات وحدها (بالقاموس إن أُرفق)، ولكلٍّ سطر نتيجته؛ وخطوات اختيار English بسطر عند التقاط مسار عربي أو مترجم آليًا (وملاحظة Brave)؛ وأحجام الأجزاء تحت
 * التقسيم الاحتياطي. لا عرض لنص التعليمات ولا لمكان الحفظ.
 * @param {H} h @param {Act} act
 * @param {{
 *   live: boolean, unavailable: boolean, captureIssue: string | null, invalid: { code: string | null }[],
 *   tracks: import('../../extract/index.js').TrackInfo[], selectedKey: string | null, mode: 'normal' | 'long', durationMs: number | null,
 *   why: boolean, fallbackOpen: boolean, split: boolean, splitSize: string, splitError: string | null,
 *   busy: boolean, copyBusy: boolean, saveLine: { tone: string, text: string } | null, copyLine: { tone: string, text: string } | null,
 *   result: { tone: 'info' | 'warn' | 'error', text: string }[], glossary: number, englishGuide: { brave: boolean } | null,
 *   parts: { index: number, from: number, to: number, chars: number }[] | null, partsRaised: boolean,
 * }} m partsRaised: رُفع حجم الجزء ليبقى عدد الأجزاء ضمن حد الرفع (U31)، فيُقال تحت الأحجام قبل التنزيل
 */
export function downloadMenu(h, act, m, root = null) {
  const out = [h('h2', { className: 'title', text: LABELS.downloadTitle })];
  if (m.live) {
    out.push(alert(h, 'info', messageFor('EX_LIVE')));
    return out;
  }
  if (!m.tracks.length) {
    // المسار المحفوظ من تنزيل سابق بلا التقاط في هذه الزيارة: يُنزَّل من هنا كما في المحفوظات (تدقيق Fable، FA-17، بقرار سلطان)،
    // وتبقى إرشادات CC بعده لمن يريد التقاطًا جديدًا (الوضع الطويل أو التقسيم).
    if (m.saved) {
      out.push(label(h, LABELS.languageTitle));
      out.push(statusRow(h, 'ok', `${trackLine(m.saved)} · ${LABELS.savedTag}`, 'language'));
      out.push(h('div', { className: 'note', text: LABELS.savedNote, attrs: { 'data-fid': 'savedNote' } }));
      out.push(h('div', {
        className: 'actions inline',
        children: [
          button(h, 'primary', m.busy ? LABELS.checking : LABELS.downloadSaved, {
            act, name: 'download', fid: 'download', first: true, disabled: m.busy, icon: 'download', title: LABELS.downloadSavedHint,
            extra: { 'aria-busy': m.busy ? 'true' : null, 'aria-description': LABELS.downloadSavedHint },
          }),
          button(h, 'secondary', LABELS.copyShort, {
            act, name: 'copy', fid: 'copy', disabled: m.copyBusy, icon: 'copy', title: LABELS.copyHint, extra: { 'aria-description': LABELS.copyHint },
          }),
        ],
      }));
      if (m.glossary) out.push(h('div', { className: 'tag', text: glossaryTag(m.glossary), attrs: { 'data-fid': 'glossary' } }));
      if (m.saveLine) out.push(resultLine(h, act, m.saveLine, 'saveLine'));
      if (m.copyLine) out.push(resultLine(h, act, m.copyLine, 'copyLine'));
      for (const r of m.result) out.push(alert(h, r.tone, r.text));
      out.push(sep(h));
    }
    if (m.captureIssue) {
      const guide = m.englishGuide
        ? [h('span', { className: 'steps', text: LABELS.englishSteps }), m.englishGuide.brave ? h('span', { className: 'note-in', text: LABELS.braveNote }) : null]
        : [];
      out.push(alert(h, 'warn', messageFor(m.captureIssue), guide.filter(Boolean)));
    }
    for (const t of m.invalid) out.push(alert(h, 'error', messageFor(t.code ?? 'EX_NO_TRACK')));
    if (m.unavailable && !m.captureIssue) {
      out.push(alert(h, 'info', messageFor('CT_NO_CAPTIONS')));
    } else {
      const why = button(h, 'link', LABELS.whyLink, { act, name: 'why', fid: 'why', first: !m.saved, extra: { 'aria-expanded': m.why ? 'true' : 'false' } });
      out.push(alert(h, 'info', messageFor('CT_NOT_CAPTURED'), [h('span', { children: [why] }), m.why ? h('span', { className: 'note', text: LABELS.why }) : null]));
    }
    return out;
  }

  const sel = m.tracks.find((t) => t.key === m.selectedKey) ?? m.tracks[0];
  // «اللغة»: لغة الأصل الملتقط الفعلية باسمها (من رمز مساره) ونوعه وعدد مقاطعه، لا لغة مفترضة.
  out.push(label(h, LABELS.languageTitle));
  if (m.tracks.length > 1) {
    // مجموعة اختيار واحد في حوار (لا بنود قائمة؛ تدقيق 7a66f91، U44): نقطة Tab واحدة على المختار، والأسهم تنقل التركيز بين المسارات.
    out.push(h('div', {
      attrs: { role: 'radiogroup', 'aria-label': LABELS.trackChoice },
      on: {
        keydown: (ev) => {
          const step = ev.key === 'ArrowDown' || ev.key === 'ArrowLeft' ? 1 : ev.key === 'ArrowUp' || ev.key === 'ArrowRight' ? -1 : 0;
          if (!step) return;
          const list = [...ev.currentTarget.children];
          const at = list.indexOf(root?.activeElement ?? null);
          if (at === -1 || list.length < 2) return;
          ev.preventDefault();
          list[(at + step + list.length) % list.length].focus();
        },
      },
      children: m.tracks.map((t) => h('button', {
        className: 'item',
        text: trackLine(t),
        attrs: {
          type: 'button', role: 'radio', 'aria-checked': t.key === sel.key ? 'true' : 'false', 'data-fid': `track:${t.key}`,
          'data-first': t.key === sel.key ? '' : null, tabindex: t.key === sel.key ? '0' : '-1',
        },
        on: { click: () => act('track', t.key) },
      })),
    }));
  } else {
    // مسار قد يكون ناقصًا لا يُعلَّم بعلامة سلامة.
    out.push(statusRow(h, sel.warnings?.length ? 'warn' : 'ok', trackLine(sel), 'language'));
  }
  for (const w of sel.warnings ?? []) {
    const text = w === 'EX_MAYBE_INCOMPLETE' && Number.isFinite(sel.lastEndMs) && Number.isFinite(m.durationMs)
      ? messageFor('CT_INCOMPLETE_AT', { last: shortTime(sel.lastEndMs), duration: shortTime(m.durationMs) })
      : messageFor(w);
    out.push(alert(h, 'warn', text));
  }

  out.push(label(h, LABELS.exportMode));
  out.push(segmented(h, LABELS.exportMode, [
    { value: 'normal', label: LABELS.modeNormal, title: LABELS.modeNormalNote },
    { value: 'long', label: LABELS.modeLong, title: LABELS.modeLongNote },
  ], m.mode, act, 'mode', 'mode', { root }));

  out.push(sep(h));
  out.push(h('div', {
    className: 'actions inline',
    children: [
      // اسم الوصول هو النص الظاهر نفسه (ومنه «جارٍ التنزيل…»)، والتفصيل وصف إضافي لا يحل محله.
      button(h, 'primary', m.busy ? LABELS.checking : LABELS.downloadFile, {
        act, name: 'download', fid: 'download', first: m.tracks.length === 1, disabled: m.busy, icon: 'download', title: LABELS.downloadFileHint,
        extra: { 'aria-busy': m.busy ? 'true' : null, 'aria-description': LABELS.downloadFileHint },
      }),
      button(h, 'secondary', LABELS.copyShort, {
        act, name: 'copy', fid: 'copy', disabled: m.copyBusy, icon: 'copy', title: LABELS.copyHint, extra: { 'aria-description': LABELS.copyHint },
      }),
    ],
  }));
  if (m.glossary) out.push(h('div', { className: 'tag', text: glossaryTag(m.glossary), attrs: { 'data-fid': 'glossary' } }));
  if (m.saveLine) out.push(resultLine(h, act, m.saveLine, 'saveLine'));
  if (m.copyLine) out.push(resultLine(h, act, m.copyLine, 'copyLine'));
  for (const r of m.result) out.push(alert(h, r.tone, r.text));

  out.push(sep(h));
  out.push(h('button', {
    className: 'item',
    text: LABELS.fallback,
    attrs: { type: 'button', 'aria-expanded': m.fallbackOpen ? 'true' : 'false', 'data-fid': 'fallback' },
    on: { click: () => act('fallback') },
  }));
  if (m.fallbackOpen) {
    const check = h('input', {
      className: 'check',
      attrs: { type: 'checkbox', 'data-fid': 'split' },
      on: { change: (ev) => act('split', !!ev.target.checked) },
    });
    check.checked = m.split;
    out.push(h('label', { className: 'item', children: [check, h('span', { text: LABELS.split })] }));
    if (m.split) {
      // التسمية المرئية مربوطة بالحقل، ورسالة خطئه وصفه (U48)، كحقلَي الإزاحة والخطوة.
      const size = h('input', {
        className: 'num',
        attrs: {
          type: 'text', inputmode: 'numeric', id: 'tj-split', 'data-fid': 'splitSize', 'aria-invalid': m.splitError ? 'true' : 'false',
          'aria-describedby': 'tj-split-error', autocomplete: 'off', spellcheck: 'false',
        },
        on: { input: (ev) => act('splitSize', ev.target.value) },
      });
      size.value = m.splitSize;
      out.push(h('div', { className: 'row field', children: [h('label', { text: LABELS.splitSize, attrs: { for: 'tj-split' } }), size] }));
      out.push(h('div', { className: 'field-error', text: m.splitError ?? '', attrs: { id: 'tj-split-error', 'aria-live': 'polite' } }));
      if (m.parts) {
        out.push(h('div', {
          className: 'parts', attrs: { role: 'list', 'aria-label': LABELS.partsLabel },
          children: m.parts.map((p) => h('div', { className: 'row part', attrs: { role: 'listitem' }, children: [h('bdi', { text: partRow(p), attrs: { dir: 'ltr' } })] })),
        }));
        if (m.partsRaised) out.push(h('div', { className: 'note', text: messageFor('EX_SPLIT_SIZE_RAISED'), attrs: { 'data-fid': 'partsRaised' } }));
      }
    }
  }
  return out;
}

/**
 * قائمة الرفع والعرض (§٦.٢ و§١٩.٣، وجولة الصقل) بترتيبها: العنوان ومحدد الترجمات الموجودة (حين تكون أكثر من واحدة)، ثم
 * الملف وعدده، وسطر الملخص، وأوضاع العرض الثلاثة في صف واحد، ثم «علّم للمراجعة» و«رفع ترجمة…» (أو «استبدال…») في صف.
 * @param {H} h @param {Act} act
 * @param {{
 *   fileName: string, count: number, edited: boolean, comparison: object | null, notes: string[], slots: SlotModel[],
 *   switching: boolean, uploadLabel: string,
 *   warnings: string[], mode: 'ar' | 'dual' | 'off', dualAvailable: boolean, originalLang: string | null, busy: boolean, error: string | null,
 *   ad?: boolean,
 * }} m originalLang رمز لغة مسار الأصل الفعلي (يسمّي وضع «فوق الأصل»)، أو null؛ وad إعلان يُعرض الآن
 * @param {ShadowRoot | null} [root] جذر القائمة (للتركيز بالأسهم في المحدد)
 */
export function displayMenu(h, act, m, root = null) {
  const summary = comparisonSummary(m.comparison);
  const dual = dualLabels(m.originalLang);
  const out = [
    h('div', { className: 'head', children: [h('h2', { className: 'title', text: LABELS.displayTitle }), slotPicker(h, act, m.slots, { disabled: m.switching, root })] }),
    statusRow(h, 'ok', translationLine(m.count, m.edited), 'arabicLine'),
    h('div', { className: 'row file', children: [h('span', { className: 'name', text: m.fileName, attrs: { dir: 'ltr', title: m.fileName } })] }),
    summaryRow(h, summary),
  ];
  for (const w of m.warnings) out.push(alert(h, 'warn', w));
  const notes = m.notes.slice(0, 1);
  for (const n of notes) out.push(h('div', { className: 'note', text: n }));
  if (m.notes.length > notes.length) out.push(h('div', { className: 'note', text: `وملاحظات أخرى (${m.notes.length - notes.length}) في المحرّر.` }));
  out.push(sep(h));
  out.push(label(h, LABELS.displayMode));
  // «فوق ‹لغة الأصل›»: باسم لغته الفعلية من مساره، وبلا أصل «فوق الأصل» معطّلًا بسببه.
  const dualReason = messageFor('CT_DUAL_UNAVAILABLE');
  out.push(segmented(h, LABELS.displayMode, [
    { value: 'ar', label: LABELS.segAr, aria: LABELS.modeAr },
    { value: 'dual', label: dual.short, aria: dual.aria, disabled: !m.dualAvailable, reason: dualReason },
    { value: 'off', label: LABELS.segOff, aria: LABELS.modeOff },
  ], m.mode, act, 'displayMode', 'mode', { first: true, root }));
  if (!m.dualAvailable) out.push(h('div', { className: 'note', text: dualReason, attrs: { 'data-fid': 'dualReason' } }));
  out.push(sep(h));
  out.push(h('div', {
    className: 'actions inline',
    children: [
      // أثناء الإعلان زمن الفيديو زمن الإعلان: معطّل بسببه (U47).
      button(h, 'secondary', LABELS.markReview, { act, name: 'mark', fid: 'mark', icon: 'flag', disabled: !!m.ad, reason: m.ad ? messageFor('CT_AD_SHOWING') : null }),
      button(h, 'secondary', m.busy ? LABELS.importing : m.uploadLabel, { act, name: 'replace', fid: 'replace', disabled: m.busy, icon: 'upload', extra: { 'aria-busy': m.busy ? 'true' : null } }),
    ],
  }));
  if (!m.slots.some((x) => !x.filled)) out.push(h('div', { className: 'note', text: LABELS.slotsFull }));
  if (m.error) out.push(alert(h, 'error', m.error));
  return out;
}

/**
 * التأكيد المضغوط بعد فحص الملف (§١٩.٣): الملف وعدده، وسطر الملخص، وسطر قرينة الاسم، و«حفظ في» 1 2 3 (الممتلئة تعني
 * الاستبدال)، وعند استبدال خانة معدّلة سطر ما سيُستبدل ومربع «إبقاء تعديلاتي» (معطّل بسببه في التلميح واسم الوصول حين
 * لا تسمح المحاذاة)، وتنبيه تصفير الإزاحة للنشطة. لا جدول فروق هنا.
 * @param {H} h @param {Act} act
 * @param {{
 *   fileName: string, count: number, comparison: object | null, warnings: string[], hint: string | null,
 *   slots: SlotModel[], target: number, filled: boolean, edits: number, keepAvailable: boolean, keep: boolean, conflicts: number,
 *   offsetNote: boolean, previousFrom?: number | null, busy: boolean, error: string | null,
 * }} m
 * @param {ShadowRoot | null} [root]
 */
export function confirmMenu(h, act, m, root = null) {
  const summary = comparisonSummary(m.comparison);
  const out = [
    h('h2', { className: 'title', text: m.filled ? LABELS.confirmTitle : LABELS.uploadTitle }),
    h('div', { className: 'row file', children: [h('span', { className: 'name', text: m.fileName, attrs: { dir: 'ltr', title: m.fileName } }), h('span', { className: 'dim', text: `· ${cueCount(m.count)}` })] }),
    summaryRow(h, summary),
  ];
  if (m.hint) out.push(alert(h, 'warn', m.hint));
  for (const w of m.warnings) out.push(alert(h, 'warn', w));
  out.push(sep(h));
  out.push(h('div', {
    className: 'row target',
    children: [h('span', { text: LABELS.saveTo }), targetPicker(h, act, m.slots, m.target, { disabled: m.busy, root })],
  }));
  if (m.filled && m.edits > 0) {
    out.push(h('div', { className: 'row edits', text: m.keep ? keptLine(m.conflicts) : editsLine(m.edits), attrs: { 'data-tone': m.keep ? 'ok' : 'warn', 'aria-live': 'polite' } }));
    const reason = m.keepAvailable ? null : messageFor('CT_KEEP_UNAVAILABLE');
    const check = h('input', {
      className: 'check',
      attrs: {
        type: 'checkbox', 'data-fid': 'keep', disabled: m.keepAvailable && !m.busy ? null : '',
        'aria-label': reason ? `${LABELS.keepEdits} — ${reason}` : LABELS.keepEdits,
      },
      on: { change: (ev) => act('keep', !!ev.target.checked) },
    });
    check.checked = m.keep;
    out.push(h('label', {
      className: 'item', attrs: { title: reason, 'aria-disabled': reason ? 'true' : null },
      children: [check, h('span', { text: LABELS.keepEdits })],
    }));
  }
  if (m.offsetNote) out.push(alert(h, 'info', LABELS.offsetResetNote));
  if (m.previousFrom) out.push(alert(h, 'warn', previousLostLine(m.previousFrom, m.target)));
  out.push(sep(h));
  out.push(h('div', {
    className: 'actions inline',
    children: [
      button(h, 'primary', m.busy ? LABELS.importing : m.filled ? LABELS.replaceConfirm : LABELS.save, { act, name: 'confirmReplace', fid: 'confirm', disabled: m.busy, extra: { 'aria-busy': m.busy ? 'true' : null } }),
      button(h, 'secondary', LABELS.cancel, { act, name: 'cancelReplace', fid: 'cancel' }),
    ],
  }));
  if (m.error) out.push(alert(h, 'error', m.error));
  return out;
}

/**
 * قائمة خيارات التوقيت (§٦.٣): مكمّلة لزرّي − و+ لا بديل عنهما.
 * @param {H} h @param {Act} act
 * @param {{ offsetMs: number, offsetText: string, offsetError: string | null, stepMs: number, custom: boolean, stepText: string, stepError: string | null, ad?: boolean }} m
 */
export function timingMenu(h, act, m, root = null) {
  if (m.sync) return syncView(h, act, m.sync);
  const value = formatOffset(m.offsetMs);
  const offset = h('input', {
    className: 'num',
    attrs: {
      type: 'text', inputmode: 'decimal', id: 'tj-offset', 'data-fid': 'offset', 'data-first': '', 'aria-invalid': m.offsetError ? 'true' : 'false',
      'aria-describedby': 'tj-offset-error', autocomplete: 'off', spellcheck: 'false',
    },
    on: {
      input: (ev) => act('offsetText', ev.target.value),
      keydown: (ev) => {
        if (ev.key === 'Enter') act('applyOffset', ev.target.value);
      },
      change: (ev) => act('applyOffset', ev.target.value),
    },
  });
  offset.value = m.offsetText;
  const preset = m.custom ? 'custom' : String(m.stepMs);
  const out = [
    h('h2', { className: 'title', text: LABELS.timingTitle }),
    h('div', {
      className: 'big', attrs: { 'data-sign': sign(m.offsetMs), 'data-fid': 'big', 'aria-live': 'polite' },
      children: [h('bdi', { text: value, attrs: { dir: 'ltr' } }), h('span', { text: ` ${LABELS.seconds}` })],
    }),
    h('div', { className: 'meaning', text: offsetMeaning(m.offsetMs), attrs: { 'data-fid': 'meaning' } }),
    sep(h),
    h('div', { className: 'row field', children: [h('label', { text: LABELS.offsetField, attrs: { for: 'tj-offset' } }), offset, h('span', { className: 'unit', text: LABELS.seconds })] }),
    h('div', { className: 'field-error', text: m.offsetError ?? '', attrs: { id: 'tj-offset-error', 'aria-live': 'polite' } }),
    h('div', {
      className: 'row field',
      children: [h('span', { className: 'flabel', text: LABELS.stepField }), segmented(h, LABELS.stepField, [{ value: '500', label: '0.5' }, { value: '1000', label: '1' }, { value: 'custom', label: LABELS.stepCustom }], preset, act, 'step', 'step', { root })],
    }),
  ];
  if (!m.custom && m.stepError) out.push(h('div', { className: 'field-error', text: m.stepError, attrs: { 'aria-live': 'polite' } }));
  if (m.custom) {
    const step = h('input', {
      className: 'num',
      attrs: { type: 'text', inputmode: 'decimal', id: 'tj-step', 'data-fid': 'stepText', 'aria-invalid': m.stepError ? 'true' : 'false', 'aria-describedby': 'tj-step-error', autocomplete: 'off', spellcheck: 'false' },
      on: {
        input: (ev) => act('stepText', ev.target.value),
        keydown: (ev) => {
          if (ev.key === 'Enter') act('applyStep', ev.target.value);
        },
        change: (ev) => act('applyStep', ev.target.value),
      },
    });
    step.value = m.stepText;
    out.push(h('div', { className: 'row field', children: [h('label', { text: LABELS.stepCustomField, attrs: { for: 'tj-step' } }), step, h('span', { className: 'unit', text: LABELS.seconds })] }));
    out.push(h('div', { className: 'field-error', text: m.stepError ?? '', attrs: { id: 'tj-step-error', 'aria-live': 'polite' } }));
  }
  out.push(sep(h));
  out.push(h('div', {
    className: 'actions inline',
    children: [
      button(h, 'secondary', LABELS.sync, { act, name: 'sync', fid: 'sync', disabled: !!m.ad, reason: m.ad ? messageFor('CT_AD_SHOWING') : null }),
      button(h, 'secondary', LABELS.reset, { act, name: 'reset', fid: 'reset', icon: 'restore', title: LABELS.resetHint, extra: { 'aria-description': LABELS.resetHint } }),
    ],
  }));
  out.push(h('div', { className: 'note', text: LABELS.signLegend }));
  return out;
}

/**
 * العرض الفرعي «مزامنة بجملة» (§١٩.٤): رأسه «عند 12:34» (لحظة الفتح الثابتة) و«رجوع»، ثم حتى سبع جمل من النشطة، كلٌّ سطر
 * واحد مقصوص (الظاهرة الآن مميّزة)، ثم «أبكر» و«أحدث». لا شرح.
 * @param {H} h @param {Act} act
 * @param {{ at: string, visible: number | null, items: { index: number, n: number, text: string }[], earlier: boolean, later: boolean }} v
 */
function syncView(h, act, v) {
  return [
    h('div', {
      className: 'head',
      children: [
        h('h2', { className: 'title', text: syncAt(v.at) }),
        button(h, 'link', LABELS.back, { act, name: 'syncBack', fid: 'syncBack' }),
      ],
    }),
    label(h, LABELS.sentenceNow),
    h('div', {
      className: 'sentences',
      attrs: { role: 'group', 'aria-label': LABELS.syncTitle },
      children: v.items.map((it) => h('button', {
        className: 'item sentence', text: it.text,
        attrs: { type: 'button', 'data-fid': `sentence:${it.index}`, title: it.text, 'aria-current': it.index === v.visible ? 'true' : null, dir: textDirection(it.text) },
        on: { click: () => act('sentence', it.index) },
      })),
    }),
    sep(h),
    h('div', {
      className: 'actions inline',
      children: [
        button(h, 'secondary', LABELS.earlier, { act, name: 'syncEarlier', fid: 'syncEarlier', disabled: !v.earlier }),
        button(h, 'secondary', LABELS.later, { act, name: 'syncLater', fid: 'syncLater', disabled: !v.later }),
      ],
    }),
  ];
}

/** نص الخطوة في حقلها المخصص: «0.3». @param {number} ms */
export const stepText = (ms) => stepSeconds(ms);
