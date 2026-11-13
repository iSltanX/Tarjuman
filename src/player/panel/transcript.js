// قائمة الصفوف: صف لكل مقطع عربي، بزمنه (بداية المقطع + الإزاحة) ونصه (واتجاهه من حروفه) والأصل تحته إن طُلب وتوفر.
// مصمّمة لآلاف المقاطع: تُبنى الصفوف مرة لكل (المقاطع، الأصل)؛ وتغيّر الإزاحة لا يعيد البناء بل يحدّث نص الأزمنة وحدها
// (فيبقى موضع التمرير والتركيز)؛ وتحديث الحالي والماضي والتقدم عند تغيّر الزمن يمس صفوفًا قليلة لا القائمة كلها. والنقر يُفوَّض
// إلى القائمة نفسها (مستمع واحد لا مستمع لكل صف). والقائمة نقطة Tab واحدة: زر زمن واحد بـtabindex=0 (الحالي، أو آخر ما ركّزه
// المستخدم)، والأسهم وPage وHome وEnd تنقل التركيز بين الصفوف؛ وكل زر موصوف بنص صفه (تدقيق 7a66f91، U45).
// وأفعال الصف (ف9، 2026-11-10): «علّم للمراجعة» و«أسمع هذه الآن» في شريط واحد يُنقل إلى الصف الممرور عليه أو المركّز (لا زران
// في كل صف من آلاف الصفوف)، ويعود إلى صف نقطة Tab حين يغادر المؤشر القائمة، فيأتي بعد زمن صفه في ترتيب Tab. والعلامة «أعود
// إليه» سمة على صفها (data-mark) تُرى دائمًا. و«عدّل النص» (الفكرة ٦، ح-54) زر ثالث فيه: حقل واحد للقائمة مكان نص الصف بنص مقطعه
// الخام (بفواصل أسطره، لا السطر الواحد المعروض)، والحفظ والإلغاء يُبلَّغان المستدعي (onEdit)، والنقر داخله لا يقفز. وتغيّر نص مقاطع
// بعددها وأرقامها وأزمنتها (حفظ الحقل، أو تعديل نص من المحرّر) يحدّث نص صفوفها في مكانها، فلا يزول الحقل ولا التمرير.
import { markAnchor, resolveMarks, sameAnchor } from '../../core/model/marks.js';
import { ltrParts, textDirection } from '../../ui/format.js';
import { el, icon, setAttr, setHidden, setText } from './dom.js';
import { originalLookup } from '../../core/align/original.js';
import { createTimeline } from './model.js';
import { LABELS, clockLabel, editFieldLabel, editHintText, flatText, markedSeekLabel } from './text.js';

/** صفوف تُلحق دفعات: وسائط append الكثيرة جدًا تفشل في المتصفحات. */
const CHUNK = 500;
/** خطوة PageUp وPageDown بين الصفوف. */
const PAGE_ROWS = 10;
const NAV = Object.freeze({ ArrowDown: 1, ArrowUp: -1, PageDown: PAGE_ROWS, PageUp: -PAGE_ROWS });
/** أسطر حقل التحرير: بعدد أسطر نصه بين حدّين، وما زاد يُمرَّر داخله. */
const EDIT_ROWS = Object.freeze({ min: 2, max: 6 });
/** حركة المؤشر بين الضغط والنقرة التي تجعلها سحبًا لا نقرة على الصف (B3): بالفأرة والقلم، وباللمس أوسع (القرار ٣١). */
export const DRAG_PX = 5;
export const TOUCH_DRAG_PX = 10;

/**
 * @param {{
 *   doc: Document, onSeek: (ms: number) => void, onAct?: (act: 'mark' | 'sync' | 'edit', i: number) => void, syncReason?: (i: number) => string | null,
 *   onEdit?: (kind: 'save' | 'lost', i: number, text: string) => void,
 * }} deps
 * syncReason: لماذا لا تتاح «أسمع هذه الآن» لصف i الآن (إعلان، أو جملة بعيدة عن لحظة التشغيل)، أو null. onEdit: 'save' طلب حفظ نص
 * الحقل المفتوح على صف i (Enter أو «حفظ»)، والمستدعي يحكم فيه (حارس النص، والكتابة) ثم يغلقه أو يقول سببه داخله؛ و'lost' (i = -1)
 * مقطع الحقل تغيّر من مكان آخر فأُغلق وفيه ما كُتب، يُبلَّغ بعد انتهاء المزامنة.
 */
export function createTranscript({ doc, onSeek, onAct = () => {}, syncReason = () => null, onEdit = () => {} }) {
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
  const editBtn = el(doc, 'button', {
    className: 'ra', attrs: { type: 'button', 'data-act': 'edit', 'aria-label': LABELS.editRow, title: LABELS.editRowTip },
  }, [icon(doc, 'edit', { size: 'xs' })]);
  // سبب تعطيل «أسمع هذه الآن» نصًا مخفيًا يصف الزر، فيقرؤه قارئ الشاشة قبل الضغط لا بعده وحده (مراجعة المرحلة 5، ط3).
  const why = el(doc, 'span', { className: 'sr', attrs: { id: 'tj-acts-why' } });
  const acts = el(doc, 'div', { className: 'acts', attrs: { role: 'group', 'aria-label': LABELS.rowActions } }, [markBtn, syncBtn, editBtn, why]);
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
    setAttr(editBtn, 'aria-describedby', arId);
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
    setAttr(editBtn, 'tabindex', v);
  }

  /** ينقل الشريط إلى صف i (لا ينقله والتركيز فيه: إزالة المركّز تُفقده، ولا والحقل مفتوح: خارج DOM حتى يُغلق). @param {number} i */
  function moveActs(i) {
    if (!rowEls[i] || edit) return;
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
    // داخل حقل التحرير (الفكرة ٦): النقر والسحب والنقر المزدوج للكتابة وحدها، لا قفز ولا إسقاط للتركيز؛ وزرّاه يعملان بمستمعيهما.
    // وهدفٌ خرج من القائمة أثناء النقرة نفسها (أغلق «حفظ» الحقل، أو أُعيد بناء الصفوف) لا يُنسب إلى صف: مسار الحدث يُحسب قبل إزالته.
    if ((edit && edit.box.contains(ev.target)) || !list.contains(ev.target)) return;
    const i = rowIndexOf(ev.target);
    if (i < 0 || !cues || i >= cues.length) return;
    rowClick(ev, i, p);
    // ت-٤: بعد نقرة المؤشر على صف لا يبقى التركيز في القائمة، فالمسافة وk والأسهم بعدها لمشغّل يوتيوب ولا تكرر القفز، كما بعد
    // أزرار الشريط (controls/group.js). وتفعيل لوحة المفاتيح يبقي التركيز حيث هو. والحقل الذي فتحته النقرة («عدّل النص») يبقى مركّزًا.
    if (ev.detail > 0 && focusInside && focusEl && !(edit && edit.box.contains(focusEl))) focusEl.blur?.();
  });
  function rowClick(ev, i, p) {
    // زر من شريط الأفعال: فعله وحده، لا قفز. والمعطّل يُبلَّغ (فيقال سببه) بدل أن يمر صامتًا.
    const act = actOf(ev.target);
    if (act === 'mark' || act === 'sync' || act === 'edit') {
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

  // ———— تحرير نص المقطع في مكانه (الفكرة ٦، ح-54) ————
  /**
   * الحقل المفتوح (واحد للقائمة)، أو null: صفه، ومرساة مقطعه كما فُتح عليه (الرقم والبداية وبصمة النص)، وعناصره، والنص الذي يُحفظ
   * الآن أو null، وهل طُلب الحفظ أو الإلغاء من لوحة المفاتيح (فيعود التركيز إلى «عدّل النص» في صفه بعد الإغلاق، وبالمؤشر يغادر
   * القائمة كما في ت-٤). وضغطاته معزولة عن يوتيوب بعازل الجذر (ownsKey في view.js: كل ضغطة في textarea)، فالجذر المغلق يُري يوتيوب
   * المضيف لا الحقل.
   * @type {{ i: number, anchor: { n: number, startMs: number, textHash: string }, base: string, box: HTMLElement, field: any, msg: HTMLElement, save: HTMLElement, cancel: HTMLElement, saving: string | null, keyboard: boolean } | null}
   */
  let edit = null;

  const arOf = (i) => rowEls[i]?.children[1]?.children[0] ?? null;
  const lineCount = (text) => String(text).split(/\r\n|\r|\n|\u2028|\u2029/).length;

  /** نص فيه مقاطع معزولة LTR عناصرَ bdi ذرية (أسماء المفاتيح في سطر الحقل)، وما سواها نص. @param {string} text */
  const richParts = (text) => ltrParts(text).map((p) => (p.ltr ? el(doc, 'bdi', { className: 'ltr', text: p.text, attrs: { dir: 'ltr' } }) : el(doc, 'span', { text: p.text })));

  /**
   * يفتح الحقل على صف i مكان نصه (.ar يُخفى، والأصل تحته يبقى)، بنص المقطع الخام أو text. الشريط يخرج من DOM حتى يُغلق.
   * @param {number} i @param {{ text?: string | null, focus?: boolean }} [o]
   * @returns {boolean}
   */
  function openEdit(i, { text = null, focus = true } = {}) {
    const cue = cues?.[i];
    const ar = arOf(i);
    if (!cue || !ar) return false;
    if (edit) closeEdit();
    const value = text ?? cue.text;
    const field = el(doc, 'textarea', {
      className: 'edit__field',
      attrs: { 'aria-label': editFieldLabel(cue.n), 'aria-describedby': 'tj-edit-msg tj-edit-hint', lang: translationLang ?? 'und', dir: textDirection(value, translationLang) },
    });
    field.value = value;
    const fit = () => setAttr(field, 'rows', String(Math.min(EDIT_ROWS.max, Math.max(EDIT_ROWS.min, lineCount(field.value)))));
    fit();
    const msg = el(doc, 'div', { className: 'edit__msg', attrs: { id: 'tj-edit-msg', role: 'alert', hidden: '' } });
    const save = el(doc, 'button', { className: 'b b--primary edit__save', attrs: { type: 'button' }, text: LABELS.editSave });
    const cancel = el(doc, 'button', { className: 'b b--ghost edit__cancel', attrs: { type: 'button' }, text: LABELS.editCancel });
    const hint = el(doc, 'span', { className: 'edit__hint', attrs: { id: 'tj-edit-hint' } }, richParts(editHintText()));
    const box = el(doc, 'div', { className: 'edit' }, [field, msg, el(doc, 'div', { className: 'edit__bar' }, [hint, cancel, save])]);
    edit = { i, anchor: markAnchor(cue), base: cue.text, box, field, msg, save, cancel, saving: null, keyboard: false };

    // Enter يحفظ وShift+Enter سطر جديد وEsc يلغي؛ وأثناء تركيب IME يُترك المفتاح للمحرّر الصيني والياباني وأمثالهما (Enter يختار).
    field.addEventListener('keydown', (ev) => {
      if (ev.isComposing || ev.keyCode === 229) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cancelEdit(true);
      } else if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        requestSave(true);
      }
    });
    field.addEventListener('input', () => {
      fit();
      setAttr(field, 'dir', textDirection(field.value, translationLang));
      if (!msg.hasAttribute('hidden')) {
        setHidden(msg, true);
        setAttr(field, 'aria-invalid', null);
      }
    });
    save.addEventListener('click', (ev) => requestSave(ev.detail === 0));
    cancel.addEventListener('click', (ev) => cancelEdit(ev.detail === 0));

    rowEls[i].classList.add('editing');
    setHidden(ar, true);
    ar.parentNode.insertBefore(box, ar.nextSibling);
    acts.remove();
    actsRow = -1;
    actsFocusEl = null;
    if (focus) {
      field.focus();
      field.setSelectionRange?.(value.length, value.length);
    }
    return true;
  }

  /** طلب الحفظ: مرة واحدة ما دامت كتابة جارية. @param {boolean} keyboard */
  function requestSave(keyboard) {
    if (!edit || edit.saving !== null) return;
    edit.keyboard = keyboard;
    onEdit('save', edit.i, edit.field.value);
  }

  /** الإلغاء: يُغلق بلا كتابة (لا أثناء كتابة جارية). @param {boolean} keyboard */
  function cancelEdit(keyboard) {
    if (!edit || edit.saving !== null) return;
    edit.keyboard = keyboard;
    closeEdit();
  }

  /** يغلق الحقل ويعيد نص الصف والشريط: التركيز إلى «عدّل النص» إن جاء الطلب من لوحة المفاتيح، وإلا يغادر القائمة. */
  function closeEdit() {
    if (!edit) return;
    const { i, box, keyboard } = edit;
    const had = !!focusEl && box.contains(focusEl);
    const focused = focusEl;
    edit = null;
    rowEls[i]?.classList.remove('editing');
    const ar = arOf(i);
    if (ar) setHidden(ar, false);
    if (had && keyboard && rowEls[i]) {
      setTabRow(i);
      moveActs(i);
      editBtn.focus();
    } else if (had) focused.blur?.();
    box.remove();
    if (actsRow < 0 && rowEls.length) moveActs(rowEls[i] ? i : tabRow);
  }

  /** سبب منع الحفظ داخل الحقل (حارس النص، أو إخفاق الكتابة)، والحقل مفتوح بنصه والتركيز فيه. @param {string} text */
  function editMessage(text) {
    if (!edit) return;
    setText(edit.msg, text);
    setHidden(edit.msg, false);
    setAttr(edit.field, 'aria-invalid', 'true');
    edit.field.focus();
  }

  /** كتابة النص جارية: الحقل للقراءة وحدها حتى تنتهي. @param {string} text */
  function editBusy(text) {
    if (!edit) return;
    edit.saving = text;
    edit.field.readOnly = true;
    setAttr(edit.box, 'aria-busy', 'true');
    setAttr(edit.save, 'aria-disabled', 'true');
  }

  /** أخفقت الكتابة: يعود الحقل قابلًا للكتابة بنصه وسببه. @param {string} text */
  function editFailed(text) {
    if (!edit) return;
    edit.saving = null;
    edit.field.readOnly = false;
    setAttr(edit.box, 'aria-busy', null);
    setAttr(edit.save, 'aria-disabled', null);
    editMessage(text);
  }

  /** نجحت كتابة text: يُغلق الحقل إن بقي مفتوحًا عليها. @param {string} text */
  function finishEdit(text) {
    if (edit && edit.saving === text) closeEdit();
  }

  /**
   * مقطع الحقل تغيّر من مكان آخر: يُغلق، وما كُتب فيه (إن اختلف عمّا فُتح عليه) يُبلَّغ بعد انتهاء المزامنة (onEdit('lost'))، فلا
   * يضيع بصمت ولا تتداخل حلقة الرسم. والتركيز إن كان فيه إلى «عدّل النص» في صفه.
   */
  function loseEdit() {
    const text = edit.field.value;
    const lost = text !== edit.base;
    edit.keyboard = true;
    closeEdit();
    if (lost) Promise.resolve().then(() => onEdit('lost', -1, text));
  }

  /**
   * الحقل بعد تغيّر نص المقاطع في المسار التدريجي: باقٍ ما دام مقطعه بمرساته؛ وإن صار نصّه النصَّ الجاري حفظه فقد نجحت الكتابة فيُغلق؛
   * وإلا فقد تغيّر من مكان آخر.
   */
  function keepEdit() {
    const c = cues[edit.i];
    if (sameAnchor(markAnchor(c), edit.anchor)) return;
    if (edit.saving !== null && c.text === edit.saving) closeEdit();
    else loseEdit();
  }

  /**
   * الحقل بعد إعادة بناء الصفوف (تغيّر العدد أو الأزمنة أو الأصل): يُعاد فتحه على مقطعه بمرساته حيث صار، بما كُتب وموضع المؤشر
   * والتركيز؛ وإن صار نصّه النصَّ الجاري حفظه فقد نجحت الكتابة؛ وإلا فقد تغيّر من مكان آخر.
   * @param {{ anchor: { n: number, startMs: number, textHash: string }, base: string, text: string, saving: string | null, keyboard: boolean, focused: boolean, sel: [number, number] | null }} p
   */
  function reopenEdit(p) {
    const at = (a) => cues.findIndex((c) => c.n === a.n && c.startMs === a.startMs && sameAnchor(markAnchor(c), a));
    const j = at(p.anchor);
    if (j >= 0 && openEdit(j, { text: p.text, focus: p.focused })) {
      edit.base = p.base;
      edit.keyboard = p.keyboard;
      if (p.focused && p.sel) edit.field.setSelectionRange?.(p.sel[0], p.sel[1]);
      if (p.saving !== null) editBusy(p.saving);
      return;
    }
    if (p.saving !== null && at({ ...p.anchor, textHash: markAnchor({ ...p.anchor, text: p.saving }).textHash }) >= 0) return;
    if (p.text !== p.base) Promise.resolve().then(() => onEdit('lost', -1, p.text));
  }

  /** الحقل المفتوح قبل إعادة البناء، ليُعاد فتحه بعدها (reopenEdit)، أو null. */
  function pendingEdit() {
    if (!edit) return null;
    const f = edit.field;
    const focused = !!focusEl && edit.box.contains(focusEl);
    const sel = Number.isInteger(f.selectionStart) && Number.isInteger(f.selectionEnd) ? [f.selectionStart, f.selectionEnd] : null;
    return { anchor: edit.anchor, base: edit.base, text: f.value, saving: edit.saving, keyboard: edit.keyboard, focused, sel };
  }

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
    // الحقل أُزيل مع صفه (إغلاق اللوحة، أو فيديو آخر، أو إعادة البناء).
    edit = null;
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
   * المقاطع نفسها عددًا وأرقامًا وأزمنةً (قد يختلف نصها): المسار التدريجي يكفي (الفكرة ٦).
   * @param {import('../../core/model/cue.js').Cue[]} a @param {import('../../core/model/cue.js').Cue[]} b
   */
  const sameShape = (a, b) => a.length === b.length && a.every((c, i) => c.n === b[i].n && c.startMs === b[i].startMs && c.endMs === b[i].endMs);

  /**
   * يضمن أن الصفوف تطابق (المقاطع، الأصل، الإزاحة). مرجعا المقاطع والأصل يحكمان إعادة البناء؛ والإزاحة وحدها تحدّث الأزمنة. ومقاطع
   * جديدة بعدد الصفوف وأرقامها وأزمنتها والأصل نفسه (حفظ نص مقطع من اللوحة أو من المحرّر) تحدّث نص الصفوف المتغيرة وحدها (retext)، فيبقى
   * حقل الكتابة والتمرير والتركيز؛ وإعادة البناء تعيد فتح الحقل على مقطعه بمرساته (reopenEdit).
   * @param {{ cues: import('../../core/model/cue.js').Cue[], originalCues: import('../../core/model/cue.js').Cue[] | null, offsetMs: number, originalLang?: string | null, translationLang?: string | null, marks?: import('../../core/model/marks.js').Mark[] | null }} s
   * @returns {{ rebuilt: boolean, relabeled: boolean }}
   */
  function sync(s) {
    const same = cues === s.cues && originalRef === s.originalCues;
    if (!same && !(cues && s.cues && originalRef === s.originalCues && sameShape(cues, s.cues))) return rebuild(s);
    if (!same) retext(s.cues);
    setMarks(s.marks ?? null, { force: !same });
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
      if (edit) {
        setAttr(edit.field, 'lang', translationLang ?? 'und');
        setAttr(edit.field, 'dir', textDirection(edit.field.value, translationLang));
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

  /**
   * المسار التدريجي (الفكرة ٦): نص الصفوف التي تغيّر نص مقطعها وحده واتجاهه، والجدول الزمني لمراجع المقاطع الجديدة (الأزمنة نفسها،
   * فالصف الحالي والماضي كما هما)؛ والحقل المفتوح باقٍ أو يُغلق بقاعدته (keepEdit).
   * @param {import('../../core/model/cue.js').Cue[]} next
   */
  function retext(next) {
    const prev = cues;
    cues = next;
    timeline = createTimeline(cues);
    generation++;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i].text === prev[i].text) continue;
      const ar = arOf(i);
      const text = flatText(cues[i].text);
      setText(ar, text);
      setAttr(ar, 'dir', textDirection(text, translationLang));
    }
    if (edit) keepEdit();
  }

  /** بناء الصفوف كلها من جديد، والحقل المفتوح يُعاد فتحه بعده (reopenEdit). @param {Parameters<typeof sync>[0]} s */
  function rebuild(s) {
    const pending = pendingEdit();
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
    if (pending) reopenEdit(pending);
    generation++;
    return { rebuilt: true, relabeled: false };
  }

  /**
   * علامات «أعود إليه» على صفوفها: تُحل بمراسيها (الرقم والزمن والبصمة) إلى المقاطع المعروضة حين يتغير مرجع العلامات أو المقاطع،
   * ويُمس من الصفوف ما تغيّر وحده. «تمت المراجعة» لا تُعلَّم في اللوحة.
   * @param {import('../../core/model/marks.js').Mark[] | null} marks @param {{ force?: boolean }} [o] force: المقاطع تغيّرت والعلامات نفسها
   */
  function setMarks(marks, { force = false } = {}) {
    if (marks === marksRef && !force) return;
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
    actsParts: { acts, markBtn, syncBtn, editBtn },
    openEdit,
    closeEdit,
    editMessage,
    editBusy,
    editFailed,
    finishEdit,
    /** صف الحقل المفتوح، أو -1. */
    editing: () => (edit ? edit.i : -1),
    /** حال الحقل للّقطة والحزام: صفه وسببه الظاهر وهل الكتابة جارية (لا نص المقطع). */
    editState: () => (edit ? { row: edit.i, message: edit.msg.hasAttribute('hidden') ? null : edit.msg.textContent, busy: edit.saving !== null } : null),
    /** عناصر الحقل (للاختبار والحزام). */
    editParts: () => (edit ? { box: edit.box, field: edit.field, msg: edit.msg, save: edit.save, cancel: edit.cancel } : null),
    /** يعيد رسم حال الشريط (يتغير سبب تعطيل المزامنة مع زمن التشغيل والإعلان). */
    refreshActs: paintActs,
    rowEl: (i) => rowEls[i] ?? null,
    labelOf: (i) => labels[i] ?? '',
    cueAt: (i) => cues?.[i] ?? null,
    /** نسبة تقدّم الصف الحالي كما رُسمت (للتشخيص والاختبار). */
    shownProgress: () => (lastFraction < 0 ? null : lastFraction),
  };
}
