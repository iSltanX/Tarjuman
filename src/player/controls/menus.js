// محتوى القوائم الصغيرة (figma-design-brief §٦): التحميل، والرفع والعرض، والتوقيت، وتأكيد الاستبدال. كل باني دالة
// نقية من نموذج العرض إلى عقد DOM (textContent وsetAttribute فقط)، والأفعال تُبلَّغ إلى الجلسة. العنصر الذي يُستعاد
// إليه التركيز بعد إعادة البناء يحمل data-fid، وأول عنصر للتركيز data-first. نص تعليمات الترجمة لا يمر من هنا أبدًا.
import { messageFor } from '../../core/errors/index.js';
import { describeTrack } from '../../core/export/describe.js';
import { formatOffset } from '../../ui/format.js';
import { LABELS, comparisonSummary, cueCount, offsetMeaning, shortTime, stepSeconds } from './text.js';

/**
 * @typedef {(name: string, value?: unknown) => void} Act
 * @typedef {(tag: string, o?: { className?: string, text?: string, attrs?: Record<string, string>, on?: Record<string, (ev: any) => void>, children?: (Node | null | false | undefined)[] }) => HTMLElement} H
 */

/** @param {Document} doc @returns {H} */
export function builder(doc) {
  return (tag, { className, text, attrs, on, children } = {}) => {
    const n = doc.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    for (const [k, v] of Object.entries(attrs ?? {})) if (v !== null && v !== undefined) n.setAttribute(k, v);
    for (const [t, fn] of Object.entries(on ?? {})) n.addEventListener(t, fn);
    for (const c of children ?? []) if (c) n.appendChild(c);
    return n;
  };
}

const sign = (ms) => (Math.round(ms / 100) === 0 ? 'zero' : ms > 0 ? 'positive' : 'negative');

/** @param {H} h @param {'info' | 'warn' | 'error'} tone @param {string} text @param {Node[]} [extra] */
function alert(h, tone, text, extra = []) {
  const glyph = tone === 'info' ? 'ⓘ' : tone === 'warn' ? '⚠' : '✕';
  return h('div', {
    className: 'alert',
    attrs: { 'data-tone': tone, role: tone === 'info' ? 'note' : 'alert' },
    children: [h('span', { className: 'glyph', text: glyph, attrs: { 'aria-hidden': 'true' } }), h('div', { className: 'stack', children: [h('span', { text }), ...extra] })],
  });
}

/** زر بنص؛ المعطّل يبقى قابلًا للتركيز ويقرأ سببه. */
function button(h, cls, text, { act, name, value, disabled = false, reason = null, fid = null, first = false, extra = {} } = {}) {
  return h('button', {
    className: cls,
    attrs: {
      type: 'button', 'data-fid': fid, 'data-first': first ? '' : null,
      'aria-disabled': disabled ? 'true' : null, 'aria-description': disabled && reason ? reason : null, ...extra,
    },
    // التعطيل يُقرأ من العقدة لحظة النقر: العقدة تبقى عبر التحديث في مكانها وقد يتغير تعطيلها.
    on: { click: (ev) => (ev.currentTarget.getAttribute('aria-disabled') === 'true' ? undefined : act(name, value)) },
    children: [h('span', { className: 'stack', children: [h('span', { text }), disabled && reason ? h('span', { className: 'reason', text: reason }) : null] })],
  });
}

/** مجموعة اختيار واحد أفقية (عادي / مقاطع أطول، والخطوة). */
function segmented(h, label, options, current, act, name, fid) {
  return h('div', {
    className: 'seg',
    attrs: { role: 'radiogroup', 'aria-label': label },
    children: options.map((o) => h('button', {
      text: o.label,
      attrs: { type: 'button', role: 'radio', 'aria-checked': o.value === current ? 'true' : 'false', 'data-fid': `${fid}:${o.value}` },
      on: { click: () => act(name, o.value) },
    })),
  });
}

/**
 * قائمة التحميل (§٦.١).
 * @param {H} h @param {Act} act
 * @param {{
 *   live: boolean, unavailable: boolean, captureIssue: string | null, invalid: { code: string | null }[],
 *   tracks: import('../../extract/index.js').TrackInfo[], selectedKey: string | null, mode: 'normal' | 'long', durationMs: number | null,
 *   why: boolean, fallbackOpen: boolean, split: boolean, splitSize: string, splitError: string | null,
 *   busy: boolean, copyBusy: boolean, done: string | null, result: { tone: 'info' | 'warn' | 'error', text: string }[],
 * }} m
 */
export function downloadMenu(h, act, m) {
  const out = [h('h2', { className: 'title', text: LABELS.downloadTitle })];
  if (m.live) {
    out.push(alert(h, 'info', messageFor('EX_LIVE')));
    return out;
  }
  if (!m.tracks.length) {
    if (m.captureIssue) out.push(alert(h, 'warn', messageFor(m.captureIssue)));
    for (const t of m.invalid) out.push(alert(h, 'error', messageFor(t.code ?? 'EX_NO_TRACK')));
    if (m.unavailable && !m.captureIssue) {
      out.push(alert(h, 'info', messageFor('CT_NO_CAPTIONS')));
    } else {
      const why = button(h, 'link', LABELS.whyLink, { act, name: 'why', fid: 'why', first: true, extra: { 'aria-expanded': m.why ? 'true' : 'false' } });
      out.push(alert(h, 'info', messageFor('CT_NOT_CAPTURED'), [h('span', { children: [why] }), m.why ? h('span', { className: 'note', text: LABELS.why }) : null]));
    }
    return out;
  }

  const sel = m.tracks.find((t) => t.key === m.selectedKey) ?? m.tracks[0];
  if (m.tracks.length > 1) {
    out.push(h('div', {
      attrs: { role: 'group', 'aria-label': LABELS.trackChoice },
      children: m.tracks.map((t, i) => h('button', {
        className: 'item',
        text: describeTrack(t),
        attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': t.key === sel.key ? 'true' : 'false', 'data-fid': `track:${t.key}`, 'data-first': i === 0 ? '' : null },
        on: { click: () => act('track', t.key) },
      })),
    }));
  } else {
    out.push(h('div', { className: 'row status', children: [h('span', { text: describeTrack(sel) }), h('span', { className: 'ok', text: '✓', attrs: { 'aria-hidden': 'true' } })] }));
  }
  for (const w of sel.warnings ?? []) {
    const text = w === 'EX_MAYBE_INCOMPLETE' && Number.isFinite(sel.lastEndMs) && Number.isFinite(m.durationMs)
      ? messageFor('CT_INCOMPLETE_AT', { last: shortTime(sel.lastEndMs), duration: shortTime(m.durationMs) })
      : messageFor(w);
    out.push(alert(h, 'warn', text));
  }

  out.push(segmented(h, 'وضع التصدير', [{ value: 'normal', label: LABELS.modeNormal }, { value: 'long', label: LABELS.modeLong }], m.mode, act, 'mode', 'mode'));
  out.push(h('div', { className: 'note', text: m.mode === 'long' ? LABELS.modeLongNote : LABELS.modeNormalNote }));

  const dl = m.busy ? LABELS.checking : m.done ? `✓ نُزّل ${m.done}` : LABELS.downloadSrt;
  out.push(h('div', {
    className: 'actions',
    children: [
      button(h, 'primary', dl, { act, name: 'download', fid: 'download', first: m.tracks.length === 1, disabled: m.busy, extra: { 'data-done': m.done && !m.busy ? '' : null, 'aria-busy': m.busy ? 'true' : null } }),
      button(h, 'secondary', LABELS.copyInstructions, { act, name: 'copy', fid: 'copy', disabled: m.copyBusy }),
    ],
  }));
  for (const r of m.result) out.push(alert(h, r.tone, r.text));

  out.push(h('div', { className: 'sep' }));
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
      const size = h('input', {
        className: 'num',
        attrs: { type: 'text', inputmode: 'numeric', 'data-fid': 'splitSize', 'aria-label': LABELS.splitSize, 'aria-invalid': m.splitError ? 'true' : 'false', autocomplete: 'off', spellcheck: 'false' },
        on: { input: (ev) => act('splitSize', ev.target.value) },
      });
      size.value = m.splitSize;
      out.push(h('div', { className: 'row field', children: [h('label', { text: LABELS.splitSize }), size] }));
      out.push(h('div', { className: 'field-error', text: m.splitError ?? '', attrs: { 'aria-live': 'polite' } }));
    }
  }
  return out;
}

/**
 * قائمة الرفع والعرض (§٦.٢).
 * @param {H} h @param {Act} act
 * @param {{
 *   fileName: string, count: number, edited: boolean, comparison: object | null, notes: string[],
 *   warnings: string[], mode: 'ar' | 'dual' | 'off', dualAvailable: boolean, busy: boolean, error: string | null,
 * }} m
 */
export function displayMenu(h, act, m) {
  const summary = comparisonSummary(m.comparison);
  const out = [
    h('h2', { className: 'title', text: LABELS.displayTitle }),
    h('div', {
      className: 'row',
      children: [
        h('span', { className: 'name', text: m.fileName, attrs: { dir: 'ltr', title: m.fileName } }),
        h('span', { text: `· ${cueCount(m.count)}` }),
      ],
    }),
    h('div', { className: 'row summary', text: summary.text, attrs: { 'data-tone': summary.tone } }),
  ];
  if (m.edited) out.push(h('div', { className: 'note', text: 'عُدّلت في المحرّر بعد الرفع.' }));
  for (const w of m.warnings) out.push(alert(h, 'warn', w));
  const notes = m.notes.slice(0, 2);
  for (const n of notes) out.push(h('div', { className: 'note', text: n }));
  if (m.notes.length > notes.length) out.push(h('div', { className: 'note', text: `وملاحظات أخرى (${m.notes.length - notes.length}).` }));
  out.push(h('div', { className: 'note', text: LABELS.editorHint }));
  out.push(h('div', { className: 'sep' }));

  const modes = [
    { value: 'ar', label: LABELS.modeAr },
    { value: 'dual', label: LABELS.modeDual, disabled: !m.dualAvailable, reason: messageFor('CT_DUAL_UNAVAILABLE') },
    { value: 'off', label: LABELS.modeOff },
  ];
  out.push(h('div', {
    attrs: { role: 'group', 'aria-label': 'وضع العرض' },
    children: modes.map((o) => {
      const b = button(h, 'item', o.label, {
        act, name: 'displayMode', value: o.value, disabled: !!o.disabled, reason: o.reason ?? null, fid: `mode:${o.value}`, first: o.value === m.mode,
        extra: { role: 'menuitemradio', 'aria-checked': o.value === m.mode ? 'true' : 'false' },
      });
      return b;
    }),
  }));
  out.push(h('div', { className: 'sep' }));
  out.push(button(h, 'item', m.busy ? LABELS.importing : LABELS.replace, { act, name: 'replace', fid: 'replace', disabled: m.busy, extra: { 'aria-busy': m.busy ? 'true' : null } }));
  if (m.error) out.push(alert(h, 'error', m.error));
  return out;
}

/**
 * تأكيد الاستبدال داخل المشغّل (§٦.٢): ملخص المقارنة الجديد وتنبيه تصفير الإزاحة.
 * @param {H} h @param {Act} act
 * @param {{ fileName: string, count: number, comparison: object | null, warnings: string[], offsetMs: number }} m
 */
export function confirmMenu(h, act, m) {
  const summary = comparisonSummary(m.comparison);
  const out = [
    h('h2', { className: 'title', text: LABELS.confirmTitle }),
    h('div', { className: 'row', children: [h('span', { className: 'name', text: m.fileName, attrs: { dir: 'ltr' } }), h('span', { text: `· ${cueCount(m.count)}` })] }),
    h('div', { className: 'row summary', text: summary.text, attrs: { 'data-tone': summary.tone } }),
  ];
  for (const w of m.warnings) out.push(alert(h, 'warn', w));
  if (Math.round(m.offsetMs / 100) !== 0) out.push(alert(h, 'info', LABELS.offsetResetNote));
  out.push(h('div', {
    className: 'actions inline',
    children: [
      button(h, 'primary', LABELS.replaceConfirm, { act, name: 'confirmReplace', fid: 'confirm' }),
      button(h, 'secondary', LABELS.cancel, { act, name: 'cancelReplace', fid: 'cancel', first: true }),
    ],
  }));
  return out;
}

/**
 * قائمة خيارات التوقيت (§٦.٣): مكمّلة لزرّي − و+ لا بديل عنهما.
 * @param {H} h @param {Act} act
 * @param {{ offsetMs: number, offsetText: string, offsetError: string | null, stepMs: number, custom: boolean, stepText: string, stepError: string | null }} m
 */
export function timingMenu(h, act, m) {
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
    h('div', { className: 'sep' }),
    h('div', { className: 'row field', children: [h('label', { text: LABELS.offsetField, attrs: { for: 'tj-offset' } }), offset, h('span', { className: 'unit', text: LABELS.seconds })] }),
    h('div', { className: 'field-error', text: m.offsetError ?? '', attrs: { id: 'tj-offset-error', 'aria-live': 'polite' } }),
    h('div', { className: 'row', children: [h('span', { text: LABELS.stepField })] }),
    segmented(h, LABELS.stepField, [{ value: '500', label: '0.5' }, { value: '1000', label: '1' }, { value: 'custom', label: LABELS.stepCustom }], preset, act, 'step', 'step'),
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
  out.push(h('div', { className: 'actions', children: [button(h, 'secondary', LABELS.reset, { act, name: 'reset', fid: 'reset' })] }));
  out.push(h('div', { className: 'note', text: LABELS.signLegend }));
  out.push(h('div', { className: 'note', text: LABELS.perVideo }));
  return out;
}

/** نص الخطوة في حقلها المخصص: «0.3». @param {number} ms */
export const stepText = (ms) => stepSeconds(ms);
