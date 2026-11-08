// حوار «تصحيح الانجراف…» (R54، مواصفة التصميم §١٩.٩): مرساتان، لكلٍّ رقم مقطع وزمن بدايته الصحيح أو الفرق المقيس (+1.2 أو
// −0.8 ث)، ومعاينة حية بما سيتغير من المحرّك نفسه (driftCorrect في P11) قبل التطبيق، والمرفوض يذكر سببه ولا يُطبَّق. يعيد
// المرساتين أو null، والتطبيق خطوة واحدة في الجلسة (app.js).
import { driftCorrect } from '../../core/edit/drift.js';
import { parseCueNumber, parseSeconds, parseTimecode } from '../../core/edit/index.js';
import { isTjError, messageFor } from '../../core/errors/index.js';
import { alertBox, el, ltr } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatTimecode, ltrInline } from '../../ui/format.js';
import { openDialog, setDisabled } from './dialogs.js';
import { numberList, seconds } from './text.js';

/**
 * يقرأ زمن المرساة: HH:MM:SS,mmm زمنًا صحيحًا، أو ثوانيَ بإشارة اختيارية فرقًا عن البداية الحالية.
 * @param {string} raw @param {number} currentMs
 * @returns {{ ok: true, toMs: number, delta: number } | { ok: false }}
 */
export function parseAnchorTime(raw, currentMs) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false };
  if (/[:：]/.test(text)) {
    const t = parseTimecode(text);
    return t.ok && t.ms >= 0 ? { ok: true, toMs: t.ms, delta: t.ms - currentMs } : { ok: false };
  }
  const d = parseSeconds(text);
  return d.ok && currentMs + d.ms >= 0 ? { ok: true, toMs: currentMs + d.ms, delta: d.ms } : { ok: false };
}

/**
 * ملخص المعاينة: عدد ما يتغير وأقصى تغيّر، وعيّنات (الأول والمرساتان والأخير).
 * @param {{ n: number, startMs: number, endMs: number }[]} before @param {{ n: number, startMs: number, endMs: number }[]} after
 * @param {number[]} sampleIndices
 */
export function driftSummary(before, after, sampleIndices) {
  let changed = 0;
  let max = 0;
  let maxN = null;
  before.forEach((c, i) => {
    const d = after[i].startMs - c.startMs;
    if (d || after[i].endMs !== c.endMs) changed++;
    if (Math.abs(d) > Math.abs(max)) {
      max = d;
      maxN = c.n;
    }
  });
  const samples = [...new Set(sampleIndices)].filter((i) => i >= 0 && i < before.length).sort((a, b) => a - b)
    .map((i) => ({ n: before[i].n, from: before[i].startMs, to: after[i].startMs }));
  return { changed, max, maxN, samples };
}

/**
 * @param {{ doc: Document, cues: { n: number, startMs: number, endMs: number, text: string }[], activeIndex: number | null }} o
 * @returns {Promise<{ a: { n: number, toMs: number }, b: { n: number, toMs: number } } | null>}
 */
export async function openDriftDialog({ doc, cues, activeIndex }) {
  if (cues.length < 2) {
    await openDialog({ doc, title: 'تصحيح الانجراف', body: 'يلزم مقطعان على الأقل لنقطتي التصحيح.', actions: [{ label: 'حسنًا', value: 'ok', variant: 'primary' }] });
    return null;
  }
  const first = 0;
  const last = activeIndex !== null && activeIndex > 0 ? activeIndex : cues.length - 1;
  const byN = new Map();
  cues.forEach((c, i) => { if (!byN.has(c.n)) byN.set(c.n, i); });

  // المرساة بموضعها: قطعتا شطر تحملان رقمًا واحدًا، فالرقم المكتوب كما اقتُرح يبقى على المقطع المقترح نفسه، وغيره أول ظهوره
  // (تدقيق 5fedcb9، GM-005: كانت النقطة الثانية على القطعة الثانية تُقرأ الأولى فيرفض الحوار أو يحسب انحرافًا زائفًا).
  const anchor = (label, i) => {
    const nIn = el('input', { className: 'ed-amount', dir: 'ltr', attrs: { type: 'text', inputmode: 'numeric', value: String(cues[i].n), 'aria-label': `${label}: رقم المقطع` }, doc });
    const tIn = el('input', { className: 'ed-time', dir: 'ltr', attrs: { type: 'text', value: formatTimecode(cues[i].startMs), 'aria-label': `${label}: الزمن الصحيح أو الفرق`, spellcheck: 'false', autocomplete: 'off' }, doc });
    const note = el('p', { className: 'tj-caption', doc });
    const box = el('fieldset', {
      className: 'ed-fieldset',
      children: [
        el('legend', { className: 'tj-label', text: label, doc }),
        el('div', { className: 'ed-group', children: [el('span', { text: 'المقطع', doc }), nIn, el('span', { text: 'يبدأ عند', doc }), tIn], doc }),
        note,
      ],
      doc,
    });
    return { box, nIn, tIn, note, start: i };
  };
  const A = anchor('النقطة الأولى', first);
  const B = anchor('النقطة الثانية', last);
  const preview = el('div', { className: 'tj-stack', doc });
  let applyBtn = null;
  let result = null;

  const readAnchor = (x) => {
    // الرقم بالأرقام العربية أو اللاتينية كحقل الزمن المجاور (U27).
    const n = parseCueNumber(x.nIn.value);
    const i = n !== null ? (cues[x.start]?.n === n ? x.start : byN.get(n)) : undefined;
    if (i === undefined) {
      x.note.textContent = 'لا مقطع بهذا الرقم.';
      return null;
    }
    const t = parseAnchorTime(x.tIn.value, cues[i].startMs);
    if (!t.ok) {
      x.note.textContent = `اكتب زمنًا مثل 00:12:01,300، أو فرقًا بالثواني مثل ${ltrInline('+1.2')} أو ${ltrInline('−0.8')}.`;
      return null;
    }
    x.note.textContent = `الآن ${formatTimecode(cues[i].startMs)}، ويصبح ${formatTimecode(t.toMs)} (${ltrInline(`${t.delta >= 0 ? '+' : '−'}${seconds(t.delta)}`)} ث).`;
    return { n, toMs: t.toMs, index: i };
  };

  const refresh = () => {
    result = null;
    const a = readAnchor(A);
    const b = readAnchor(B);
    let why = null;
    let summary = null;
    if (!a || !b) why = 'أكمل النقطتين أولًا.';
    else {
      try {
        const r = driftCorrect(cues, { a: { n: a.n, toMs: a.toMs, index: a.index }, b: { n: b.n, toMs: b.toMs, index: b.index } });
        if (!r.ok) why = messageFor('ED_DRIFT_NEGATIVE', { list: numberList(r.negative) });
        else {
          summary = driftSummary(cues, r.cues, [0, a.index, b.index, cues.length - 1]);
          result = { a: { n: a.n, toMs: a.toMs, index: a.index }, b: { n: b.n, toMs: b.toMs, index: b.index } };
        }
      } catch (err) {
        if (!isTjError(err)) throw err;
        why = messageFor(err.code);
      }
    }
    const rows = summary ? summary.samples.map((s) => el('tr', {
      children: [
        el('td', { className: 'tj-mono-sm', text: String(s.n), doc }),
        el('td', { children: [ltr(formatTimecode(s.from), { doc })], doc }),
        el('td', { children: [ltr(formatTimecode(s.to), { doc })], doc }),
      ],
      doc,
    })) : [];
    preview.replaceChildren(...[
      why ? alertBox({ tone: 'danger', title: 'لا يُطبَّق', text: why, doc }) : null,
      summary ? el('p', {
        className: 'tj-body-sm',
        text: summary.changed
          ? `يتغير توقيت ${formatCount(summary.changed, COUNT_FORMS.cue)} من ${cues.length}، وأكبر تغيير ${ltrInline(`${summary.max >= 0 ? '+' : '−'}${seconds(summary.max)}`)} ث (المقطع ${summary.maxN}). النص والأرقام كما هي.`
          : 'التوقيت مطابق للنقطتين؛ لا شيء يتغير.',
        doc,
      }) : null,
      rows.length ? el('div', {
        className: 'ed-preview-table',
        children: [el('table', {
          children: [
            el('thead', { children: [el('tr', { children: ['#', 'البداية الآن', 'بعد التصحيح'].map((t) => el('th', { text: t, attrs: { scope: 'col' }, doc })), doc })], doc }),
            el('tbody', { children: rows, doc }),
          ],
          doc,
        })],
        doc,
      }) : null,
    ].filter(Boolean));
    if (applyBtn) setDisabled(applyBtn, why ?? (summary && !summary.changed ? 'لا شيء يتغير.' : null));
  };
  for (const x of [A, B]) for (const input of [x.nIn, x.tIn]) input.addEventListener('input', refresh);

  const content = el('div', {
    className: 'tj-stack',
    children: [
      el('p', { className: 'tj-body-sm', text: 'حين تتأخر الترجمة أو تتقدم تدريجيًا على طول الفيديو: اختر مقطعين متباعدين، واكتب لكلٍّ منهما زمن بدايته الصحيح كما تسمعه في الفيديو أو مقدار الفرق بالثواني. يُضبط توقيت الملف كله على الخط بينهما.', doc }),
      A.box, B.box, preview,
    ],
    doc,
  });
  refresh();
  const v = await openDialog({
    doc, size: 'lg', title: 'تصحيح الانجراف', content, focus: 'cancel',
    actions: [
      { label: 'تطبيق التصحيح', value: 'apply', variant: 'primary', ref: (b) => { applyBtn = b; refresh(); } },
      { label: 'إلغاء', value: 'cancel' },
    ],
  });
  return v === 'apply' ? result : null;
}
