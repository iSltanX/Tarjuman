// عرض اللوحة: مضيف واحد بجذر Shadow DOM مغلق، يبني العناصر مرة ويحدّثها في مكانها (فيبقى التركيز وموضع التمرير)، والنصوص كلها
// بـtextContent وعناصر DOM (لا HTML نصي أبدًا). أشكال أربعة بحسب النموذج: لا شيء، وزر مغلقة، ولوحة مفتوحة (هيكل التحميل،
// وخطوات «لا ترجمة»، وخطأ، وصفوف جاهزة)، ورسالة التراجع. لا يعرف المتحكم: يستقبل النموذج ويستدعي on.* لأفعال المستخدم.
import { COUNT_FORMS, formatCount } from '../../ui/format.js';
import { createSheet } from '../overlay/sheet.js';
import { el, icon, mark, setAttr, setClass, setHidden, setText } from './dom.js';
import { HOST_ID, NARROW_MAX, WIDE_MIN, panelCss } from './styles.js';
import { createTranscript } from './transcript.js';
import { LABELS, earlierTip, laterTip, offsetMeaningShort, offsetValue, statusParts, stepLabel, withOriginal } from './text.js';

/** ما يعزله جذر اللوحة عن يوتيوب: اختصارات لوحة المفاتيح (المسافة وk وf والأسهم والأرقام…) وهو يكتب أو يضغط داخلها. */
const KEYS = ['keydown', 'keyup', 'keypress'];
const STEP_PRESETS = Object.freeze([500, 1000]);

/**
 * مقطّعة اختيار واحد (radiogroup) بتنقّل الأسهم: في RTL أول عنصر أقصى اليمين، فالتالي بالسهم الأيسر. المعطّل لا يُختار ولا
 * يُتنقَّل إليه.
 * @param {Document} doc @param {string} label @param {string[]} values @param {(v: string) => void} pick
 */
function createSegs(doc, label, values, pick) {
  const group = el(doc, 'div', { className: 'segs', attrs: { role: 'radiogroup', 'aria-label': label } });
  const buttons = values.map((v) => el(doc, 'button', {
    attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-v': v },
    on: {
      click: () => {
        if (btnOf(v).getAttribute('aria-disabled') !== 'true') pick(v);
      },
    },
  }));
  const btnOf = (v) => buttons[values.indexOf(v)];
  group.append(...buttons);
  group.addEventListener('keydown', (ev) => {
    const step = ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    const enabled = buttons.filter((b) => b.getAttribute('aria-disabled') !== 'true');
    const current = buttons.find((b) => b.getAttribute('aria-checked') === 'true');
    const next = enabled.length ? enabled[(enabled.indexOf(current) + step + enabled.length) % enabled.length] : null;
    if (!next || next === current) return;
    ev.preventDefault();
    pick(next.getAttribute('data-v'));
    next.focus();
  });
  return {
    el: group,
    /** @param {string} value @param {{ text: string, aria?: string | null, title?: string | null, disabled?: boolean }[]} items */
    update(value, items) {
      buttons.forEach((b, i) => {
        const it = items[i];
        const on = values[i] === value;
        setText(b, it.text);
        setAttr(b, 'aria-checked', on ? 'true' : 'false');
        setAttr(b, 'aria-disabled', it.disabled ? 'true' : null);
        setAttr(b, 'aria-label', it.aria ?? null);
        setAttr(b, 'title', it.title ?? null);
        setAttr(b, 'tabindex', on ? '0' : '-1');
      });
    },
  };
}

/**
 * @param {{
 *   doc: Document, win: Window,
 *   on: {
 *     close: () => void, hide: () => void, undo: () => void, setDual: (v: boolean) => void,
 *     setFollow: (v: boolean) => void, resume: () => void, reset: () => void, nudge: (dir: 1 | -1) => void,
 *     step: (v: string) => void, stepText: (t: string) => void, applyStep: (t: string) => void, retry: () => void,
 *     seek: (ms: number) => void,
 *   },
 * }} deps
 */
export function createPanelView({ doc, win, on }) {
  const host = el(doc, 'div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = createSheet({ doc, win }, panelCss());
  const styleMode = sheet.adopt(root);
  const shell = el(doc, 'div', { className: 'root', attrs: { dir: 'rtl', 'data-theme': 'light' } });
  root.appendChild(shell);

  const transcript = createTranscript({ doc, onSeek: (ms) => on.seek(ms) });

  // ———— الرأس والقائمة ————
  const load = el(doc, 'span', { className: 'load', attrs: { role: 'img', 'aria-label': LABELS.loading } }, [el(doc, 'i'), el(doc, 'i')]);
  const optsBtn = el(doc, 'button', {
    className: 'b b--ghost b--icon', attrs: { type: 'button', 'aria-label': LABELS.options, 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    on: { click: () => setMenu(!menuOpen, { focus: true }) },
  }, [icon(doc, 'more')]);
  const closeBtn = el(doc, 'button', {
    className: 'b b--ghost b--icon', attrs: { type: 'button', 'aria-label': LABELS.close, title: LABELS.closeHint }, on: { click: () => on.close() },
  }, [icon(doc, 'x')]);
  const head = el(doc, 'header', { className: 'head' }, [
    el(doc, 'span', { className: 'head__mark' }, [mark(doc, 20)]),
    el(doc, 'h2', { className: 'title', text: LABELS.title }),
    el(doc, 'span', { className: 'spacer' }),
    load, optsBtn, closeBtn,
  ]);
  const hideItem = el(doc, 'button', {
    className: 'mitem', attrs: { type: 'button', role: 'menuitem' }, on: { click: () => { setMenu(false); on.hide(); } },
  }, [
    icon(doc, 'eye-off'),
    el(doc, 'span', { className: 'mitem__col' }, [
      el(doc, 'span', { text: LABELS.hideEntry }),
      el(doc, 'span', { className: 'mitem__hint', text: LABELS.hideHint }),
    ]),
  ]);
  const menu = el(doc, 'div', { className: 'menu', attrs: { role: 'menu', 'aria-label': LABELS.options, hidden: '' } }, [hideItem]);

  // ———— الشريط: الحالة والنص والمتابعة ————
  const statusEl = el(doc, 'div', { className: 'status', attrs: { 'data-fid': 'status' } });
  const segs = createSegs(doc, LABELS.segGroup, ['ar', 'dual'], (v) => on.setDual(v === 'dual'));
  const followLabel = el(doc, 'span');
  const followSwitch = el(doc, 'button', {
    className: 'switch', attrs: { type: 'button', role: 'switch', 'aria-checked': 'true' }, on: { click: () => on.setFollow(followSwitch.getAttribute('aria-checked') !== 'true') },
  }, [followLabel, el(doc, 'span', { className: 'switch__track' }, [el(doc, 'span', { className: 'switch__thumb' })])]);
  const inlineText = el(doc, 'span');
  const inlineTitle = el(doc, 'b');
  const inlineError = el(doc, 'div', { className: 'inline-error', attrs: { role: 'alert', hidden: '' } }, [
    icon(doc, 'danger', { size: 'sm' }),
    el(doc, 'span', {}, [inlineTitle, el(doc, 'span', { text: ' ' }), inlineText]),
    el(doc, 'button', { className: 'b', attrs: { type: 'button' }, text: LABELS.retry, on: { click: () => on.retry() } }),
  ]);
  const bar = el(doc, 'div', { className: 'bar' }, [
    statusEl,
    el(doc, 'div', { className: 'ctl' }, [segs.el, followSwitch]),
    inlineError,
  ]);

  // ———— الجسم ————
  const resumeTime = el(doc, 'span', { className: 'ltr' });
  const resume = el(doc, 'button', { className: 'resume', attrs: { type: 'button', hidden: '' }, on: { click: () => on.resume() } }, [
    icon(doc, 'arrow-up', { size: 'xs' }), el(doc, 'span', { text: LABELS.resume }), resumeTime,
  ]);
  const skel = el(doc, 'div', { className: 'skel', attrs: { 'aria-hidden': 'true', hidden: '' } },
    [[0.6], [0.8], [0.9], [0.5], [0.7]].map(([w]) => el(doc, 'div', { className: 'skel__row' }, [
      el(doc, 'span', { className: 'skel__bar skel__bar--t' }),
      el(doc, 'span', { className: 'skel__col' }, [
        el(doc, 'span', { className: 'skel__bar' }),
        ...(w < 0.9 ? [el(doc, 'span', { className: 'skel__bar' })] : []),
      ]),
    ])));
  const steps = el(doc, 'ol', { className: 'steps' });
  const empty = el(doc, 'div', { className: 'empty', attrs: { hidden: '' } }, [
    el(doc, 'h3', { className: 'empty__title', text: LABELS.emptyTitle }),
    steps,
    el(doc, 'p', { className: 'empty__note', text: LABELS.emptyNote }),
  ]);
  const errTitle = el(doc, 'span', { className: 'alert__title', text: LABELS.errorTitle });
  const errText = el(doc, 'span');
  const err = el(doc, 'div', { className: 'err', attrs: { hidden: '' } }, [
    el(doc, 'div', { className: 'alert', attrs: { role: 'alert' } }, [
      icon(doc, 'danger', { size: 'sm' }),
      el(doc, 'div', { className: 'alert__body' }, [errTitle, errText]),
    ]),
    el(doc, 'div', { className: 'err__actions' }, [
      el(doc, 'button', { className: 'b', attrs: { type: 'button' }, on: { click: () => on.retry() } }, [icon(doc, 'restore', { size: 'sm' }), el(doc, 'span', { text: LABELS.retry })]),
    ]),
  ]);
  const body = el(doc, 'div', { className: 'body' }, [transcript.list, resume, skel, empty, err]);

  // ———— التذييل: التوقيت المشترك ————
  const resetBtn = el(doc, 'button', {
    className: 'b b--ghost', attrs: { type: 'button', title: LABELS.resetHint }, on: { click: () => on.reset() },
  }, [icon(doc, 'restore', { size: 'sm' }), el(doc, 'span', { text: LABELS.reset })]);
  const earlierLbl = el(doc, 'span', { className: 'lbl', text: LABELS.earlier });
  const laterLbl = el(doc, 'span', { className: 'lbl', text: LABELS.later });
  const earlierBtn = el(doc, 'button', { className: 'b', attrs: { type: 'button' }, on: { click: () => on.nudge(-1) } }, [icon(doc, 'minus', { size: 'sm' }), earlierLbl]);
  const laterBtn = el(doc, 'button', { className: 'b', attrs: { type: 'button' }, on: { click: () => on.nudge(1) } }, [laterLbl, icon(doc, 'plus', { size: 'sm' })]);
  const valNum = el(doc, 'b');
  const valMean = el(doc, 'span', { className: 'mean' });
  const val = el(doc, 'div', { className: 'off__val', attrs: { dir: 'rtl', 'aria-live': 'polite' } }, [valNum, el(doc, 'span', { text: ` ${LABELS.seconds}` }), valMean]);
  const stepSegs = createSegs(doc, LABELS.stepGroup, ['500', '1000', 'custom'], (v) => on.step(v));
  const stepInput = el(doc, 'input', {
    className: 'num',
    attrs: { type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-label': LABELS.stepCustomField, hidden: '' },
    on: {
      input: (ev) => on.stepText(ev.target.value),
      keydown: (ev) => {
        if (ev.key === 'Enter') on.applyStep(ev.target.value);
      },
      change: (ev) => on.applyStep(ev.target.value),
    },
  });
  const stepError = el(doc, 'div', { className: 'field-error', attrs: { 'aria-live': 'polite', hidden: '' } });
  const foot = el(doc, 'footer', { className: 'foot' }, [
    el(doc, 'div', { className: 'foot__row' }, [
      el(doc, 'span', { className: 'foot__title', text: LABELS.timing }),
      el(doc, 'span', { className: 'foot__hint', text: LABELS.shared }),
      el(doc, 'span', { className: 'spacer' }),
      resetBtn,
    ]),
    el(doc, 'div', { className: 'off', attrs: { dir: 'ltr' } }, [earlierBtn, val, laterBtn]),
    el(doc, 'div', { className: 'foot__row' }, [
      el(doc, 'span', { className: 'foot__hint', text: LABELS.step }),
      stepSegs.el,
      stepInput,
    ]),
    stepError,
  ]);

  const panel = el(doc, 'section', { className: 'panel', attrs: { 'aria-label': LABELS.panel } }, [head, menu, bar, body, foot]);

  // ———— رسالة التراجع ————
  const undoBtn = el(doc, 'button', { className: 'act', attrs: { type: 'button' }, text: LABELS.undo, on: { click: () => on.undo() } });
  const toast = el(doc, 'div', { className: 'toast', attrs: { role: 'status', hidden: '' } }, [
    icon(doc, 'eye-off', { size: 'sm' }),
    el(doc, 'span', { text: LABELS.toastHidden }),
    undoBtn,
  ]);

  shell.append(panel, toast);

  // ———— عزل لوحة المفاتيح، وقائمة الخيارات ————
  let menuOpen = false;
  function setMenu(open, { focus = false } = {}) {
    if (menuOpen === open) return;
    menuOpen = open;
    setHidden(menu, !open);
    setAttr(optsBtn, 'aria-expanded', open ? 'true' : 'false');
    if (open && focus) hideItem.focus();
    if (!open && focus) optsBtn.focus();
  }
  for (const type of KEYS) {
    shell.addEventListener(type, (ev) => {
      if (type === 'keydown' && ev.key === 'Escape' && menuOpen) {
        ev.preventDefault();
        setMenu(false, { focus: true });
      }
      ev.stopPropagation();
    });
  }
  // خروج التركيز من القائمة (Tab) يغلقها؛ والانتقال داخلها أو إلى زرها لا.
  menu.addEventListener('focusout', (ev) => {
    const to = ev.relatedTarget;
    if (menuOpen && !(to && (menu.contains(to) || optsBtn.contains(to)))) setMenu(false);
  });
  shell.addEventListener('pointerdown', (ev) => {
    if (menuOpen && !menu.contains(ev.target) && !optsBtn.contains(ev.target)) setMenu(false);
  });
  const outside = (ev) => {
    const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
    if (menuOpen && !path.includes(host)) setMenu(false);
  };
  doc.addEventListener('pointerdown', outside, true);

  // ———— الهندسة والعرض ————
  const layout = { place: 'beside', heightPx: null, width: 0, narrow: false, wide: false };
  /** @type {{ model: import('./model.js').PanelModel, local: object } | null} */
  let last = null;
  let shown = { mode: 'none', kind: null };

  /**
   * @param {{ place?: 'beside' | 'below', heightPx?: number | null, width?: number }} l
   * @returns {boolean} هل تغيّر ما يمس النصوص (ضيق/عريض)
   */
  function setLayout(l) {
    let textual = false;
    if (l.place && l.place !== layout.place) layout.place = l.place;
    if ('heightPx' in l && l.heightPx !== layout.heightPx) layout.heightPx = l.heightPx;
    // عرض صفر: المضيف مخفي، فلا يُقاس منه ضيق ولا عرض.
    if (l.width && l.width !== layout.width) {
      layout.width = l.width;
      const narrow = l.width <= NARROW_MAX;
      const wide = l.width >= WIDE_MIN;
      textual = narrow !== layout.narrow;
      layout.narrow = narrow;
      layout.wide = wide;
    }
    setAttr(host, 'data-place', layout.place);
    if (layout.heightPx) host.style.setProperty('--tj-panel-h', `${layout.heightPx}px`);
    else host.style.removeProperty('--tj-panel-h');
    setAttr(shell, 'data-narrow', layout.narrow ? true : null);
    setAttr(shell, 'data-wide', layout.wide ? true : null);
    if (textual && last) render(last.model, last.local);
    return textual;
  }

  function renderBar(m, l) {
    const parts = m.status ? statusParts(m.status) : [];
    const key = parts.join('|');
    if (statusEl.getAttribute('data-key') !== key) {
      statusEl.setAttribute('data-key', key);
      statusEl.replaceChildren(el(doc, 'span', { className: 'dot' }), ...parts.flatMap((p, i) => [
        ...(i ? [el(doc, 'span', { className: 'muted', text: ' · ' })] : []),
        el(doc, 'span', { className: i === parts.length - 1 && i > 0 ? 'muted' : '', text: p }),
      ]));
    }
    const lang = m.original?.name ?? null;
    segs.update(m.dual ? 'dual' : 'ar', [
      { text: layout.narrow ? LABELS.arOnlyShort : LABELS.arOnly, aria: layout.narrow ? LABELS.arOnly : null },
      m.original
        ? { text: layout.narrow ? LABELS.dualShort : withOriginal(lang), aria: layout.narrow ? withOriginal(lang) : null }
        : { text: layout.narrow ? LABELS.dualShort : withOriginal('الأصل'), aria: `${withOriginal('الأصل')} — ${LABELS.noOriginal}`, title: LABELS.noOriginal, disabled: true },
    ]);
    setText(followLabel, layout.narrow ? LABELS.followShort : LABELS.follow);
    setAttr(followSwitch, 'aria-label', layout.narrow ? LABELS.follow : null);
    setAttr(followSwitch, 'aria-checked', l.follow ? 'true' : 'false');
    const ie = m.error && m.kind === 'ready';
    setHidden(inlineError, !ie);
    if (ie) {
      setText(inlineTitle, LABELS.inlineErrorTitle);
      setText(inlineText, m.error.message);
    }
  }

  /** «العودة إلى ‹الزمن›»: تُحدَّث وحدها عند تغيّر المرساة أو تمرير المستخدم دون إعادة رسم اللوحة. */
  function setResume(visible, label) {
    setHidden(resume, !visible);
    if (!visible) return;
    setText(resumeTime, label);
    setAttr(resume, 'aria-label', `${LABELS.resume} ${label}`);
  }

  function renderSteps(m) {
    const cap = m.capture;
    const items = [
      { state: cap ? 'done' : 'now', text: cap ? `${cap.langName} ${cap.kind === 'manual' ? 'اليدوية' : 'التلقائية'} ${cap.saved ? 'محفوظة' : 'ملتقطة'} · ${formatCount(cap.count, COUNT_FORMS.cue)}` : LABELS.stepCapture },
      { state: cap ? 'now' : '', text: LABELS.stepDownload },
      { state: '', text: LABELS.stepUpload },
    ];
    const key = JSON.stringify(items);
    if (steps.getAttribute('data-key') === key) return;
    steps.setAttribute('data-key', key);
    steps.replaceChildren(...items.map((it, i) => el(doc, 'li', { className: it.state }, [
      el(doc, 'span', { className: 'steps__n' }, [it.state === 'done' ? icon(doc, 'check', { size: 'xs' }) : el(doc, 'span', { text: String(i + 1) })]),
      el(doc, 'span', { text: it.text }),
    ])));
  }

  function renderFoot(m, l) {
    const zero = Math.round(m.offsetMs / 100) === 0;
    setText(valNum, offsetValue(m.offsetMs));
    setText(valMean, ` · ${offsetMeaningShort(m.offsetMs)}`);
    setClass(val, 'zero', zero);
    const lt = laterTip(m.stepMs);
    const et = earlierTip(m.stepMs);
    setAttr(earlierBtn, 'aria-label', et);
    setAttr(earlierBtn, 'title', et);
    setAttr(laterBtn, 'aria-label', lt);
    setAttr(laterBtn, 'title', lt);
    setAttr(resetBtn, 'aria-disabled', zero ? 'true' : null);
    const custom = l.step.custom || !STEP_PRESETS.includes(m.stepMs);
    stepSegs.update(custom ? 'custom' : String(m.stepMs), [
      { text: `${stepLabel(STEP_PRESETS[0])} ${LABELS.seconds}` }, { text: `${stepLabel(STEP_PRESETS[1])} ${LABELS.seconds}` }, { text: LABELS.stepCustom },
    ]);
    setHidden(stepInput, !custom);
    const want = l.step.text ?? stepLabel(m.stepMs);
    if (custom && root.activeElement !== stepInput && stepInput.value !== want) stepInput.value = want;
    setAttr(stepInput, 'aria-invalid', l.step.error ? 'true' : 'false');
    setHidden(stepError, !l.step.error);
    if (l.step.error) setText(stepError, l.step.error);
  }

  /**
   * @param {import('./model.js').PanelModel} m
   * @param {{ follow: boolean, resume: { visible: boolean, label: string }, step: { custom: boolean, text: string | null, error: string | null }, toast: boolean }} l
   * @returns {{ rebuilt: boolean, relabeled: boolean, becameReady: boolean, mode: string, kind: string | null }}
   */
  function render(m, l) {
    last = { model: m, local: l };
    const prevActive = root.activeElement ?? null;
    const readyOpen = m.mode === 'open' && m.kind === 'ready';
    const wasReady = shown.mode === 'open' && shown.kind === 'ready';

    setAttr(host, 'data-mode', m.mode);
    setHidden(host, m.mode === 'none');
    setAttr(shell, 'data-kind', m.kind);
    setHidden(panel, m.mode !== 'open');
    setHidden(toast, m.mode !== 'toast');
    if (m.mode !== 'open') setMenu(false);

    let out = { rebuilt: false, relabeled: false };
    if (m.mode === 'open') {
      setHidden(load, m.kind !== 'loading');
      setHidden(bar, !readyOpen);
      setHidden(foot, !readyOpen);
      setAttr(body, 'data-kind', m.kind);
      setHidden(transcript.list, !readyOpen);
      setHidden(skel, m.kind !== 'loading');
      setHidden(empty, m.kind !== 'empty');
      setHidden(err, m.kind !== 'error');
      setAttr(panel, 'aria-busy', m.kind === 'loading' ? 'true' : null);
      if (readyOpen) {
        out = transcript.sync({ cues: m.cues, originalCues: m.dual ? m.original.cues : null, offsetMs: m.offsetMs });
        renderBar(m, l);
        renderFoot(m, l);
        setResume(l.resume.visible, l.resume.label);
      } else {
        transcript.clear();
        setHidden(resume, true);
        if (m.kind === 'empty') renderSteps(m);
        if (m.kind === 'error') setText(errText, m.error?.message ?? '');
      }
    } else if (!(m.mode === 'none' && m.kind === 'ready')) {
      // مخفية بملء الشاشة وهي جاهزة: تبقى الصفوف بأعيانها (لا بناء عند الخروج)؛ وغير ذلك يُمسح.
      transcript.clear();
    }

    // التركيز لا يضيع بتبديل الشكل. إخفاء الزر من قائمة اللوحة: إلى «تراجع» لا إلى body (مراجعة الهوية L10)، والتراجع يعيده
    // إلى اللوحة. والإغلاق (أو تراجع لا يعيدها): يُبلَّغ المستدعي (lostFocus) فيعيده إلى زر اللوحة في شريط المشغّل.
    let lostFocus = false;
    if (prevActive && m.mode === 'toast' && panel.contains(prevActive)) undoBtn.focus();
    else if (prevActive === undoBtn && m.mode === 'open') closeBtn.focus();
    else if (prevActive && m.mode === 'none' && (panel.contains(prevActive) || prevActive === undoBtn)) lostFocus = true;

    const becameReady = readyOpen && !wasReady;
    shown = { mode: m.mode, kind: m.kind };
    return { ...out, becameReady, lostFocus, mode: m.mode, kind: m.kind };
  }

  /** @param {boolean} dark وضع يوتيوب الداكن. */
  function setTheme(dark) {
    setAttr(shell, 'data-theme', dark ? 'dark' : 'light');
  }

  function destroy() {
    doc.removeEventListener('pointerdown', outside, true);
    transcript.clear();
    sheet.release();
    host.remove();
  }

  /**
   * لقطة نصية لما يُرى (للحزام الحي والاختبارات): عدّادات ونصوص الواجهة، لا نصوص المقاطع.
   * @param {{ boxes?: boolean, rows?: number[] }} [o] boxes: مواضع الأزرار وصفوف rows (للحزام الحي يضغطها بنقرة حقيقية داخل الجذر المغلق)
   */
  function peek(o = {}) {
    const box = (e) => {
      for (let n = e; n && n !== shell; n = n.parentNode) if (n.hasAttribute?.('hidden')) return null;
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return r.width && r.height ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) } : null;
    };
    const segsOf = (g) => Array.from(g.el.children).map((b) => ({
      value: b.getAttribute('data-v'), text: b.textContent, checked: b.getAttribute('aria-checked') === 'true',
      disabled: b.getAttribute('aria-disabled') === 'true', title: b.getAttribute('title'), aria: b.getAttribute('aria-label'),
    }));
    return {
      mode: host.getAttribute('data-mode'), kind: shell.getAttribute('data-kind'), theme: shell.getAttribute('data-theme'),
      place: layout.place, width: layout.width, narrow: layout.narrow, wide: layout.wide, heightPx: layout.heightPx,
      hostHidden: host.hasAttribute('hidden'),
      status: statusEl.textContent,
      dual: segsOf(segs),
      follow: followSwitch.getAttribute('aria-checked') === 'true',
      followLabel: followLabel.textContent,
      rows: transcript.size, current: transcript.current,
      resume: resume.hasAttribute('hidden') ? null : resume.getAttribute('aria-label'),
      foot: {
        hidden: foot.hasAttribute('hidden'), value: valNum.textContent, meaning: valMean.textContent, zero: val.classList.contains('zero'),
        earlier: earlierBtn.getAttribute('aria-label'), later: laterBtn.getAttribute('aria-label'),
        step: segsOf(stepSegs), customVisible: !stepInput.hasAttribute('hidden'), stepError: stepError.hasAttribute('hidden') ? null : stepError.textContent,
      },
      steps: Array.from(steps.children).map((li) => ({ state: li.className, text: li.textContent })),
      error: err.hasAttribute('hidden') ? null : errText.textContent,
      inlineError: inlineError.hasAttribute('hidden') ? null : inlineText.textContent,
      toast: toast.hasAttribute('hidden') ? null : toast.textContent,
      menu: menuOpen,
      boxes: !o.boxes ? undefined : {
        host: box(host), panel: box(panel), opts: box(optsBtn), close: box(closeBtn), hide: box(hideItem), follow: box(followSwitch),
        resume: box(resume), reset: box(resetBtn), earlier: box(earlierBtn), later: box(laterBtn), undo: box(undoBtn), list: box(transcript.list),
        dual: Array.from(segs.el.children).map(box),
        rows: (o.rows ?? []).map((i) => ({ i, label: transcript.labelOf(i), box: box(transcript.rowEl(i)), time: box(transcript.rowEl(i)?.firstElementChild ?? null) })),
      },
      scrollTop: o.boxes ? Math.round(transcript.list.scrollTop) : undefined,
      originals: o.boxes ? transcript.list.querySelectorAll('.en').length : undefined,
    };
  }

  return {
    host, root, shell, styleMode, transcript, render, setResume, setLayout, setTheme, setMenu, destroy, peek,
    /** فُتحت اللوحة من زرها في الشريط بلوحة المفاتيح: التركيز إلى زر الإغلاق (أول ما فيها). */
    focusPanel: () => closeBtn.focus(),
    /** عناصر للاختبار والتركيز البرمجي. */
    parts: { panel, optsBtn, closeBtn, menu, hideItem, segs: segs.el, followSwitch, resume, resetBtn, earlierBtn, laterBtn, stepSegs: stepSegs.el, stepInput, toast, foot, bar, body, err, empty, skel },
  };
}
