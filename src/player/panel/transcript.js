// قائمة الصفوف: صف لكل مقطع عربي، بزمنه (بداية المقطع + الإزاحة) ونصه (واتجاهه من حروفه) والأصل تحته إن طُلب وتوفر.
// مصمّمة لآلاف المقاطع: تُبنى الصفوف مرة لكل (المقاطع، الأصل)؛ وتغيّر الإزاحة لا يعيد البناء بل يحدّث نص الأزمنة وحدها
// (فيبقى موضع التمرير والتركيز)؛ وتحديث الحالي والماضي والتقدم عند تغيّر الزمن يمس صفوفًا قليلة لا القائمة كلها. والنقر يُفوَّض
// إلى القائمة نفسها (مستمع واحد لا مستمع لكل صف). والقائمة نقطة Tab واحدة: زر زمن واحد بـtabindex=0 (الحالي، أو آخر ما ركّزه
// المستخدم)، والأسهم وPage وHome وEnd تنقل التركيز بين الصفوف؛ وكل زر موصوف بنص صفه (تدقيق 7a66f91، U45).
// وأفعال الصف (ف9، 2026-11-10): «علّم للمراجعة» و«أسمع هذه الآن» في شريط واحد يُنقل إلى الصف الممرور عليه أو المركّز (لا زران
// في كل صف من آلاف الصفوف)، ويعود إلى صف نقطة Tab حين يغادر المؤشر القائمة، فيأتي بعد زمن صفه في ترتيب Tab. والعلامة «أعود
// إليه» سمة على صفها (data-mark) تُرى دائمًا.
import { resolveMarks } from '../../core/model/marks.js';
import { textDirection } from '../../ui/format.js';
import { el, icon, setAttr } from './dom.js';
import { originalLookup } from '../../core/align/original.js';
import { createTimeline } from './model.js';
import { LABELS, clockLabel, flatText, markedSeekLabel } from './text.js';

/** صفوف تُلحق دفعات: وسائط append الكثيرة جدًا تفشل في المتصفحات. */
const CHUNK = 500;
/** خطوة PageUp وPageDown بين الصفوف. */
const PAGE_ROWS = 10;
const NAV = Object.freeze({ ArrowDown: 1, ArrowUp: -1, PageDown: PAGE_ROWS, PageUp: -PAGE_ROWS });
/** حركة المؤشر بين الضغط والنقرة التي تجعلها سحبًا لا نقرة على الصف (B3): بالفأرة والقلم، وباللمس أوسع (القرار ٣١). */
export const DRAG_PX = 5;
export const TOUCH_DRAG_PX = 10;

/**
 * @param {{ doc: Document, onSeek: (ms: number) => void, onAct?: (act: 'mark' | 'sync', i: number) => void, syncReason?: (i: number) => string | null }} deps
 * syncReason: لماذا لا تتاح «أسمع هذه الآن» لصف i الآن (إعلان، أو جملة بعيدة عن لحظة التشغيل)، أو null.
 */
export function createTranscript({ doc, onSeek, onAct = () => {}, syncReason = () => null }) {
  // الحاوية نفسها خارج ترتيب Tab: Firefox يضع حاويات التمرير فيه، فتصير نقطتين (الحاوية ثم الصف)؛ والوصول إلى المحتوى بالصف
  // المركّز والأسهم (الحي في Firefox، C6).
  const list = el(doc, 'div', { className: 'list', attrs: { role: 'list', 'aria-label': LABELS.listLabel, tabindex: '-1' } });
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
  let originalLang = null;
  /** لغة الترجمة المعروضة (AA1)، وnull «غير محددة». */
  let translationLang = null;
  /** الصف الذي يحمل نقطة Tab، وهل التركيز داخل القائمة (فلا تُنقل النقطة من تحته مع تقدّم التشغيل). */
  let tabRow = 0;
  let focusInside = false;
  /** علامات الخانة كما وصلت (مرجعها يحكم إعادة الحل)، وصفوف «أعود إليه» بعد الحل. */
  let marksRef = null;
  /** @type {Set<number>} */
  let todo = new Set();

  // ———— شريط أفعال الصف (واحد للقائمة كلها) ————
  const markBtn = el(doc, 'button', {
    className: 'ra', attrs: { type: 'button', 'data-act': 'mark', 'aria-pressed': 'false', 'aria-label': LABELS.markRow, title: LABELS.markRowTip },
  }, [icon(doc, 'flag', { size: 'xs' })]);
  const syncBtn = el(doc, 'button', {
    className: 'ra', attrs: { type: 'button', 'data-act': 'sync', 'aria-label': LABELS.syncRow, title: LABELS.syncRowTip },
  }, [icon(doc, 'sync', { size: 'xs' })]);
  // سبب تعطيل «أسمع هذه الآن» نصًا مخفيًا يصف الزر، فيقرؤه قارئ الشاشة قبل الضغط لا بعده وحده (مراجعة المرحلة 5، ط3).
  const why = el(doc, 'span', { className: 'sr', attrs: { id: 'tj-acts-why' } });
  const acts = el(doc, 'div', { className: 'acts', attrs: { role: 'group', 'aria-label': LABELS.rowActions } }, [markBtn, syncBtn, why]);
  let actsRow = -1;

  const seekMs = (i) => Math.max(0, cues[i].startMs + offsetMs);
  const timeAria = (i) => (todo.has(i) ? markedSeekLabel(labels[i]) : `${LABELS.seekTo} ${labels[i]}`);

  /** حال أزرار الشريط لصفه: العلامة مضغوطة إن كان «أعود إليه»، والمزامنة معطّلة بسببها إن وُجد. */
  function paintActs() {
    if (actsRow < 0) return;
    const arId = `tj-r${actsRow}-ar`;
    const reason = syncReason(actsRow);
    // ما لم يتغير لا يُكتب (setAttr): يُعاد الرسم مع كل تغيّر للصف الحالي، فلا يمس DOM إلا ما تغيّر.
    setAttr(markBtn, 'aria-pressed', todo.has(actsRow) ? 'true' : 'false');
    setAttr(markBtn, 'aria-describedby', arId);
    setAttr(syncBtn, 'aria-describedby', reason ? `${arId} tj-acts-why` : arId);
    setAttr(syncBtn, 'aria-disabled', reason ? 'true' : null);
    setAttr(syncBtn, 'title', reason ?? LABELS.syncRowTip);
    if (why.textContent !== (reason ?? '')) why.textContent = reason ?? '';
    syncActsTab();
  }

  /**
   * أزرار الشريط في ترتيب Tab ما دام في صف نقطة Tab وحده (بعد زمن ذلك الصف)؛ وفي صف آخر (المرور بالفأرة، أو بعد البناء والتشغيل
   * في صف بعيد) خارجه، فلا يصل Tab إلى أزرار صف غير الذي يحمل النقطة (مراجعة المرحلة 5، م1).
   */
  function syncActsTab() {
    const v = actsRow >= 0 && actsRow === tabRow ? '0' : '-1';
    setAttr(markBtn, 'tabindex', v);
    setAttr(syncBtn, 'tabindex', v);
  }

  /** ينقل الشريط إلى صف i (لا ينقله والتركيز فيه: إزالة المركّز تُفقده). @param {number} i */
  function moveActs(i) {
    if (!rowEls[i]) return;
    if (actsRow === i) return paintActs();
    if (focusOnActs()) return;
    actsRow = i;
    rowEls[i].appendChild(acts);
    paintActs();
  }
  // التركيز داخل الشريط يُتتبَّع بأحداثه (لا بـactiveElement من الجذر: لا يتاح في كل بيئة). والمحميّ منه ما جاء من لوحة
  // المفاتيح (:focus-visible): زر رُكّز بنقرة الفأرة يتبع المؤشر إلى صف آخر، وإلا بقي الشريط في صف النقرة لا يتحرك (جولة هـ).
  let actsFocusEl = null;
  acts.addEventListener('focusin', (ev) => {
    actsFocusEl = ev.target ?? null;
  });
  acts.addEventListener('focusout', (ev) => {
    const to = ev.relatedTarget ?? null;
    if (!to || !acts.contains(to)) actsFocusEl = null;
  });
  const focusOnActs = () => {
    if (!actsFocusEl) return false;
    try {
      return typeof actsFocusEl.matches === 'function' ? actsFocusEl.matches(':focus-visible') : true;
    } catch {
      return true;
    }
  };

  function rowIndexOf(target) {
    for (let n = target; n && n !== list; n = n.parentNode) {
      const v = n.getAttribute?.('data-i');
      if (v !== null && v !== undefined) return Number(v);
    }
    return -1;
  }

  /** يضع نقطة Tab على زر صف i وحده. @param {number} i */
  function setTabRow(i) {
    if (!timeEls[i]) return;
    if (i !== tabRow) timeEls[tabRow]?.setAttribute('tabindex', '-1');
    tabRow = i;
    if (timeEls[i].getAttribute('tabindex') !== '0') timeEls[i].setAttribute('tabindex', '0');
    syncActsTab();
  }

  /** أقرب زر فعل (data-act) إلى الهدف داخل الشريط، أو null. */
  function actOf(target) {
    for (let n = target; n && n !== list; n = n.parentNode) {
      if (n === acts) return null;
      const a = n.getAttribute?.('data-act');
      if (a) return a;
    }
    return null;
  }

  /**
   * هل يحدد المستخدم نصًا داخل القائمة؟ التحديد من الجذر المظلل إن أتاحه المتصفح (Chromium)، وإلا من المستند؛ ومرساته في القائمة أو
   * مضيفها (يُعاد استهدافها إليه في الجذر المغلق)، فتحديدٌ باقٍ في الصفحة لا يعطّل النقر هنا (مراجعة C6).
   */
  function selecting() {
    const root = list.getRootNode?.();
    const sel = root?.getSelection?.() ?? doc.getSelection?.();
    if (!sel || sel.isCollapsed || !String(sel).length) return false;
    const a = sel.anchorNode ?? null;
    if (!a || !root?.host) return true;
    return a === root.host || list.contains(a);
  }

  // B3: ضغطة تبدأ على عنصر وتنتهي على آخر يرسل Chromium وFirefox نقرتها إلى أقرب أب مشترك، وهو الصف، ولا تحديد نص يدل على
  // السحب. فيُحفظ موضع الضغطة، وهل بدأت في شريط الأفعال، وهل تحرك المؤشر بعدها أكثر من حدها: DRAG_PX للفأرة والقلم،
  // وTOUCH_DRAG_PX للمس (الإصبع يرتجف أكثر).
  /** @type {{ x: number, y: number, limit: number, inActs: boolean, moved: boolean } | null} */
  let press = null;
  const far = (p, ev) => Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > p.limit;
  list.addEventListener('pointerdown', (ev) => {
    const limit = ev.pointerType === 'touch' ? TOUCH_DRAG_PX : DRAG_PX;
    press = { x: ev.clientX, y: ev.clientY, limit, inActs: acts.contains(ev.target), moved: false };
  });
  list.addEventListener('pointermove', (ev) => {
    if (press && !press.moved && far(press, ev)) press.moved = true;
  });
  list.addEventListener('pointercancel', () => {
    press = null;
  });
  // ت-٤: ما ركّزته نقرة المؤشر في القائمة (زر الزمن، أو زر الشريط، أو القائمة نفسها) يُتتبَّع بأحداث التركيز كما في الشريط.
  let focusEl = null;

  // النقر على الزمن يقفز دائمًا؛ وعلى نص الصف يقفز إلا إن كان المستخدم يحدد نصًا (سحب أو نقر مزدوج لكلمة؛ U49، L-27)، أو سحب
  // المؤشر بلا تحديد، أو بدأت الضغطة في شريط الأفعال (B3).
  list.addEventListener('click', (ev) => {
    // نقرة المؤشر وحدها (detail > 0) تُنسب إلى آخر ضغطة؛ وتفعيل لوحة المفاتيح (detail = 0) لا تمسه ضغطة قديمة.
    const p = ev.detail > 0 ? press : null;
    press = null;
    const i = rowIndexOf(ev.target);
    if (i < 0 || !cues || i >= cues.length) return;
    rowClick(ev, i, p);
    // ت-٤: بعد نقرة المؤشر على صف لا يبقى التركيز في القائمة، فالمسافة وk والأسهم بعدها لمشغّل يوتيوب ولا تكرر القفز، كما بعد
    // أزرار الشريط (controls/group.js). وتفعيل لوحة المفاتيح يبقي التركيز حيث هو.
    if (ev.detail > 0 && focusInside && focusEl) focusEl.blur?.();
  });
  function rowClick(ev, i, p) {
    // زر من شريط الأفعال: فعله وحده، لا قفز. والمعطّل يُبلَّغ (فيقال سببه) بدل أن يمر صامتًا.
    const act = actOf(ev.target);
    if (act === 'mark' || act === 'sync') {
      onAct(act, i);
      return;
    }
    if (acts.contains(ev.target)) return;
    const t = timeEls[i];
    const onTime = !!t && (ev.target === t || t.contains?.(ev.target));
    // الضغط والإفلات على زر الزمن نفسه نقرة عليه مهما تحرك المؤشر فوقه؛ وما سواه سحب إن بدأ في الشريط أو تحرك المؤشر (B3).
    if (!onTime && p && (p.inActs || p.moved || far(p, ev))) return;
    if (!onTime && (ev.detail > 1 || selecting())) return;
    onSeek(seekMs(i));
  }
  list.addEventListener('keydown', (ev) => {
    const i = rowIndexOf(ev.target);
    if (i < 0 || ev.target !== timeEls[i]) return;
    const last = timeEls.length - 1;
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? last : NAV[ev.key] ? Math.max(0, Math.min(last, i + NAV[ev.key])) : -1;
    if (next < 0) return;
    ev.preventDefault();
    setTabRow(next);
    timeEls[next].focus();
  });
  list.addEventListener('focusin', (ev) => {
    focusInside = true;
    focusEl = ev.target ?? null;
    const i = rowIndexOf(ev.target);
    if (i >= 0 && ev.target === timeEls[i]) {
      setTabRow(i);
      moveActs(i);
    }
  });
  // المرور على صف يحمل إليه الشريط؛ ومغادرة القائمة تعيده إلى صف نقطة Tab (فيأتي بعد زمنه في ترتيب Tab).
  list.addEventListener('pointerover', (ev) => {
    const i = rowIndexOf(ev.target);
    if (i >= 0 && i !== actsRow) moveActs(i);
  });
  list.addEventListener('pointerleave', () => {
    if (rowEls.length) moveActs(tabRow);
  });
  list.addEventListener('focusout', (ev) => {
    const to = ev.relatedTarget ?? null;
    if (!to || !list.contains(to)) {
      focusInside = false;
      focusEl = null;
    }
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
    tabRow = 0;
    // الصف المركّز أُزيل (Firefox لا يطلق focusout عند الإزالة): لا يبقى «التركيز داخل القائمة» معلّقًا.
    focusInside = false;
    focusEl = null;
    press = null;
    acts.remove();
    actsRow = -1;
    actsFocusEl = null;
    marksRef = null;
    todo = new Set();
    generation++;
  }

  function buildRow(i, original) {
    const cue = cues[i];
    const label = clockLabel(seekMs(i));
    labels[i] = label;
    const text = flatText(cue.text);
    const arId = `tj-r${i}-ar`;
    const body = el(doc, 'div', { className: 'b2' }, [
      el(doc, 'span', { className: 'ar', text, attrs: { id: arId, dir: textDirection(text, translationLang), lang: translationLang ?? 'und' } }),
    ]);
    let described = arId;
    if (original) {
      const en = original(cue.startMs, cue.endMs);
      if (en) {
        // الأصل بلغة مساره (U48)، فيُنطق بصوتها لا بصوت العربية.
        body.appendChild(el(doc, 'span', { className: 'en', text: en, attrs: { id: `tj-r${i}-en`, lang: originalLang ?? 'en', dir: textDirection(en, originalLang) } }));
        described = `${arId} tj-r${i}-en`;
      }
    }
    const t = el(doc, 'button', {
      className: 't', text: label,
      attrs: { type: 'button', 'aria-label': `${LABELS.seekTo} ${label}`, 'aria-describedby': described, tabindex: i === 0 ? '0' : '-1' },
    });
    timeEls[i] = t;
    return el(doc, 'div', { className: 'row', attrs: { role: 'listitem', 'data-i': i } }, [t, body]);
  }

  /**
   * يضمن أن الصفوف تطابق (المقاطع، الأصل، الإزاحة). مرجعا المقاطع والأصل يحكمان إعادة البناء؛ والإزاحة وحدها تحدّث الأزمنة.
   * @param {{ cues: import('../../core/model/cue.js').Cue[], originalCues: import('../../core/model/cue.js').Cue[] | null, offsetMs: number, originalLang?: string | null, translationLang?: string | null, marks?: import('../../core/model/marks.js').Mark[] | null }} s
   * @returns {{ rebuilt: boolean, relabeled: boolean }}
   */
  function sync(s) {
    if (cues === s.cues && originalRef === s.originalCues) {
      setMarks(s.marks ?? null);
      // المقاطع نفسها ولغة الخانة أو الأصل تغيّرت (U-030): تُحدَّث lang وdir للعناصر القائمة بلا إعادة بناء.
      const nextTr = s.translationLang ?? null;
      const nextEn = s.originalLang ?? null;
      if (nextTr !== translationLang || nextEn !== originalLang) {
        translationLang = nextTr;
        originalLang = nextEn;
        for (const row of rowEls) {
          for (const span of row.children[1].children) {
            if (span.className === 'ar') {
              span.setAttribute('dir', textDirection(span.textContent, translationLang));
              span.setAttribute('lang', translationLang ?? 'und');
            } else if (span.className === 'en') {
              span.setAttribute('dir', textDirection(span.textContent, originalLang));
              span.setAttribute('lang', originalLang ?? 'en');
            }
          }
        }
      }
      if (s.offsetMs === offsetMs) return { rebuilt: false, relabeled: false };
      offsetMs = s.offsetMs;
      for (let i = 0; i < rowEls.length; i++) {
        const label = clockLabel(seekMs(i));
        if (label === labels[i]) continue;
        labels[i] = label;
        timeEls[i].textContent = label;
        timeEls[i].setAttribute('aria-label', timeAria(i));
      }
      return { rebuilt: false, relabeled: true };
    }
    clear();
    cues = s.cues;
    originalRef = s.originalCues;
    originalLang = s.originalLang ?? null;
    translationLang = s.translationLang ?? null;
    offsetMs = s.offsetMs;
    timeline = createTimeline(cues);
    const original = s.originalCues ? originalLookup(s.originalCues) : null;
    rowEls = new Array(cues.length);
    timeEls = new Array(cues.length);
    labels = new Array(cues.length);
    for (let i = 0; i < cues.length; i++) rowEls[i] = buildRow(i, original);
    for (let i = 0; i < rowEls.length; i += CHUNK) list.append(...rowEls.slice(i, i + CHUNK));
    setMarks(s.marks ?? null);
    if (rowEls.length) moveActs(0);
    generation++;
    return { rebuilt: true, relabeled: false };
  }

  /**
   * علامات «أعود إليه» على صفوفها: تُحل بمراسيها (الرقم والزمن والبصمة) إلى المقاطع المعروضة حين يتغير مرجع العلامات أو المقاطع،
   * ويُمس من الصفوف ما تغيّر وحده. «تمت المراجعة» لا تُعلَّم في اللوحة.
   * @param {import('../../core/model/marks.js').Mark[] | null} marks
   */
  function setMarks(marks) {
    if (marks === marksRef) return;
    marksRef = marks;
    const next = new Set();
    if (marks?.length && cues?.length) {
      for (const r of resolveMarks(marks, cues)) if (r.mark.kind === 'todo' && r.index !== null) next.add(r.index);
    }
    for (const i of new Set([...todo, ...next])) {
      if (todo.has(i) === next.has(i) || !rowEls[i]) continue;
      if (next.has(i)) rowEls[i].setAttribute('data-mark', 'todo');
      else rowEls[i].removeAttribute('data-mark');
    }
    const changed = [...todo, ...next].filter((i) => todo.has(i) !== next.has(i));
    todo = next;
    for (const i of changed) if (timeEls[i]) timeEls[i].setAttribute('aria-label', timeAria(i));
    paintActs();
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
        // Tab إلى القائمة يصل الحالي، ما لم يكن المستخدم يتنقل فيها الآن.
        if (!focusInside) setTabRow(row);
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
    /** هل على صف i علامة «أعود إليه». @param {number} i */
    marked: (i) => todo.has(i),
    /** صف شريط الأفعال الآن (أو -1)، وأزراره (للاختبار والحزام). */
    get actsRow() {
      return actsRow;
    },
    actsParts: { acts, markBtn, syncBtn },
    /** يعيد رسم حال الشريط (يتغير سبب تعطيل المزامنة مع زمن التشغيل والإعلان). */
    refreshActs: paintActs,
    rowEl: (i) => rowEls[i] ?? null,
    labelOf: (i) => labels[i] ?? '',
    cueAt: (i) => cues?.[i] ?? null,
    /** نسبة تقدّم الصف الحالي كما رُسمت (للتشخيص والاختبار). */
    shownProgress: () => (lastFraction < 0 ? null : lastFraction),
  };
}
