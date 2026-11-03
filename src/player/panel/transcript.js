// قائمة الصفوف: صف لكل مقطع عربي، بزمنه (بداية المقطع + الإزاحة) ونصه (واتجاهه من حروفه) والأصل تحته إن طُلب وتوفر.
// مصمّمة لآلاف المقاطع: تُبنى الصفوف مرة لكل (المقاطع، الأصل)؛ وتغيّر الإزاحة لا يعيد البناء بل يحدّث نص الأزمنة وحدها
// (فيبقى موضع التمرير والتركيز)؛ وتحديث الحالي والماضي والتقدم عند تغيّر الزمن يمس صفوفًا قليلة لا القائمة كلها. والنقر يُفوَّض
// إلى القائمة نفسها (مستمع واحد لا مستمع لكل صف).
import { textDirection } from '../../ui/format.js';
import { el } from './dom.js';
import { createTimeline, originalLookup } from './model.js';
import { LABELS, clockLabel, flatText } from './text.js';

/** صفوف تُلحق دفعات: وسائط append الكثيرة جدًا تفشل في المتصفحات. */
const CHUNK = 500;

/**
 * @param {{ doc: Document, onSeek: (ms: number) => void }} deps
 */
export function createTranscript({ doc, onSeek }) {
  const list = el(doc, 'div', { className: 'list', attrs: { role: 'list', 'aria-label': LABELS.listLabel } });
  const prog = el(doc, 'span', { className: 'prog' }, [el(doc, 'i')]);
  const bar = prog.firstChild;

  /** @type {import('../../core/model/cue.js').Cue[] | null} */
  let cues = null;
  let originalRef = null;
  let timeline = null;
  /** @type {HTMLElement[]} */
  let rowEls = [];
  let timeEls = [];
  let labels = [];
  let offsetMs = 0;
  let curRow = -1;
  let pastRank = 0;
  let lastFraction = -1;
  let generation = 0;

  const seekMs = (i) => Math.max(0, cues[i].startMs + offsetMs);

  function rowIndexOf(target) {
    for (let n = target; n && n !== list; n = n.parentNode) {
      const v = n.getAttribute?.('data-i');
      if (v !== null && v !== undefined) return Number(v);
    }
    return -1;
  }

  list.addEventListener('click', (ev) => {
    const i = rowIndexOf(ev.target);
    if (i >= 0 && cues && i < cues.length) onSeek(seekMs(i));
  });

  function clear() {
    if (!cues && !rowEls.length) return;
    prog.remove();
    list.replaceChildren();
    cues = null;
    originalRef = null;
    timeline = null;
    rowEls = [];
    timeEls = [];
    labels = [];
    curRow = -1;
    pastRank = 0;
    lastFraction = -1;
    generation++;
  }

  function buildRow(i, original) {
    const cue = cues[i];
    const label = clockLabel(seekMs(i));
    labels[i] = label;
    const t = el(doc, 'button', { className: 't', text: label, attrs: { type: 'button', 'aria-label': `${LABELS.seekTo} ${label}` } });
    timeEls[i] = t;
    const text = flatText(cue.text);
    const body = el(doc, 'div', { className: 'b2' }, [
      el(doc, 'span', { className: 'ar', text, attrs: { dir: textDirection(text) } }),
    ]);
    if (original) {
      const en = original(cue.startMs, cue.endMs);
      if (en) body.appendChild(el(doc, 'span', { className: 'en', text: en }));
    }
    return el(doc, 'div', { className: 'row', attrs: { role: 'listitem', 'data-i': i } }, [t, body]);
  }

  /**
   * يضمن أن الصفوف تطابق (المقاطع، الأصل، الإزاحة). مرجعا المقاطع والأصل يحكمان إعادة البناء؛ والإزاحة وحدها تحدّث الأزمنة.
   * @param {{ cues: import('../../core/model/cue.js').Cue[], originalCues: import('../../core/model/cue.js').Cue[] | null, offsetMs: number }} s
   * @returns {{ rebuilt: boolean, relabeled: boolean }}
   */
  function sync(s) {
    if (cues === s.cues && originalRef === s.originalCues) {
      if (s.offsetMs === offsetMs) return { rebuilt: false, relabeled: false };
      offsetMs = s.offsetMs;
      for (let i = 0; i < rowEls.length; i++) {
        const label = clockLabel(seekMs(i));
        if (label === labels[i]) continue;
        labels[i] = label;
        timeEls[i].textContent = label;
        timeEls[i].setAttribute('aria-label', `${LABELS.seekTo} ${label}`);
      }
      return { rebuilt: false, relabeled: true };
    }
    clear();
    cues = s.cues;
    originalRef = s.originalCues;
    offsetMs = s.offsetMs;
    timeline = createTimeline(cues);
    const original = s.originalCues ? originalLookup(s.originalCues) : null;
    rowEls = new Array(cues.length);
    timeEls = new Array(cues.length);
    labels = new Array(cues.length);
    for (let i = 0; i < cues.length; i++) rowEls[i] = buildRow(i, original);
    for (let i = 0; i < rowEls.length; i += CHUNK) list.append(...rowEls.slice(i, i + CHUNK));
    generation++;
    return { rebuilt: true, relabeled: false };
  }

  /**
   * الصف الحالي (أو -1) وحدّ الماضي: ما قبله muted. يمس الصفوف التي تغيّرت وحدها.
   * @param {{ row: number, past: number }} loc
   */
  function mark({ row, past }) {
    if (!timeline) return;
    if (row !== curRow) {
      if (curRow >= 0) {
        const old = rowEls[curRow];
        old.classList.remove('cur');
        old.removeAttribute('aria-current');
      }
      prog.remove();
      lastFraction = -1;
      curRow = row;
      if (row >= 0) {
        const cur = rowEls[row];
        cur.classList.add('cur');
        cur.setAttribute('aria-current', 'true');
        cur.children[1].appendChild(prog);
      }
    }
    if (past !== pastRank) {
      const lo = Math.min(past, pastRank);
      const hi = Math.max(past, pastRank);
      for (let r = lo; r < hi; r++) rowEls[timeline.rowAtRank(r)].classList.toggle('past', r < past);
      pastRank = past;
    }
  }

  /** نسبة المنقضي من الحالي (٪ بدقة جزء من ألف: تحديث الأنماط عند التغيّر فقط). @param {number} f بين 0 و1 */
  function progress(f) {
    if (curRow < 0) return;
    const v = Math.round(Math.min(1, Math.max(0, f)) * 1000) / 1000;
    if (v === lastFraction) return;
    lastFraction = v;
    bar.style.setProperty('transform', `scaleX(${v})`);
  }

  return {
    list,
    sync,
    clear,
    mark,
    progress,
    get size() {
      return rowEls.length;
    },
    get generation() {
      return generation;
    },
    get current() {
      return curRow;
    },
    timeline: () => timeline,
    rowEl: (i) => rowEls[i] ?? null,
    labelOf: (i) => labels[i] ?? '',
    cueAt: (i) => cues?.[i] ?? null,
    /** نسبة تقدّم الصف الحالي كما رُسمت (للتشخيص والاختبار). */
    shownProgress: () => (lastFraction < 0 ? null : lastFraction),
  };
}
