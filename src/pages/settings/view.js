// واجهة الإعدادات (P7-AC4/AC8/AC9/AC10، figma-design-brief §١٠): عمود واحد بأقسام بطاقات، والحفظ فوري لكل خيار برسالة
// «حُفظ» بجانبه. العرض (الوضع الافتراضي، وخط الترجمة، وحجمها بمنزلق، والخلفية، والموضع، ومعاينة حية)، والتوقيت،
// والتصدير، والمقارنة، والتخزين (والمسح بكتابة «امسح»)، والتشخيص، و«حول». خط الترجمة وحجمها يخصان المعاينة وما
// يُعرض فوق الفيديو وحدهما، وخطوط الصفحة نفسها لا تتغير. لا طلبات شبكة، وكل نص عبر textContent.
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { DEFAULT_SETTINGS, SUBTITLE_BACKGROUNDS, SUBTITLE_POSITIONS, SUBTITLE_SCALE } from '../../core/model/settings.js';
import { alertBox, confirmDialog, el, ltr } from '../../ui/components.js';
import { formatBytes } from '../../ui/format.js';
import { SUBTITLE_FONT_LIST, subtitleFontStack } from '../../ui/subtitle-fonts.js';
import { pageIcon } from '../library/icons.js';
import { aboutSection } from './about.js';
import { numberField, savedMark, segmented } from './controls.js';
import {
  CONFIRM_WORD, DEFAULT_SCALE_MARK_PCT, PREVIEW_BOX, PREVIEW_LINES, completenessText, confirmWordOk, parseCompleteness, parseDrift, parseSplit,
  parseStep, previewStyle, resetState, snapScale, stepChoice, stepText,
} from './model.js';

export const SUBTITLE_NOTE = 'يخص الترجمة فوق الفيديو وحدها، والخطوط مضمّنة في الإضافة.';
export const SCALE_NOTE = 'من 70% إلى 160% بخطوة 5% · الافتراضي 100%';
export const PREVIEW_NOTE = 'المعاينة تتحدث فور تغيير الخط أو الحجم. الحجم نسبة من ارتفاع المشغّل، فيكبر النص في ملء الشاشة.';
export const INSTALL_REMINDER = 'ثبّت أيقونة ترجمان في شريط المتصفح من قائمة الإضافات.';
export const MODE_NOTES = Object.freeze({
  normal: 'عادي: مقاطع كما في يوتيوب، للتزامن الأدق.',
  long: 'مقاطع أطول: جمل أطول ليفهم النموذج السياق، بالترقيم والتوقيت نفسيهما.',
});
const BG_LABELS = Object.freeze({ none: 'بلا', soft: 'خفيفة', solid: 'صلبة' });
const POSITION_LABELS = Object.freeze({ bottom: 'أسفل', raised: 'مرتفع', top: 'أعلى' });

/**
 * @typedef {{
 *   store: ReturnType<typeof import('../../core/store/index.js').createStore>,
 *   version: string, doc?: Document,
 *   clipboardWrite: (text: string) => Promise<void>,
 *   diagnosticsText: () => Promise<string>,
 *   confirm?: typeof confirmDialog,
 *   setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void,
 * }} SettingsEnv
 */

/** @param {SettingsEnv} env */
export function createSettings(env) {
  const { store, doc = document, version } = env;
  const setTimer = env.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = env.clearTimer ?? ((id) => clearTimeout(id));
  const confirm = env.confirm ?? confirmDialog;
  const marks = () => savedMark({ doc, setTimer, clearTimer });
  let settings = DEFAULT_SETTINGS;
  let stepCustom = false;
  /** مؤشر إلى ما يحدّث الواجهة من الإعدادات (يُملأ أدناه). */
  const sync = [];

  const root = el('div', { className: 'st', doc });
  const reminderHost = el('div', { doc });
  const alertHost = el('div', { attrs: { role: 'status' }, doc });

  /** يحفظ تعديلًا جزئيًا ويبلّغ العلامة بالنتيجة؛ الفشل يُبقي القيمة السابقة في الواجهة. */
  async function save(patch, mark) {
    try {
      settings = await store.setSettings(patch);
      mark.flash(messageFor('PG_SAVED'), 'success');
    } catch (err) {
      mark.flash(messageFor('PG_SAVE_FAILED'), 'danger');
      settings = await store.getSettings().catch(() => settings);
    }
    syncAll();
    return settings;
  }

  const card = (id, title, ...children) => el('section', {
    className: 'tj-card st-card', attrs: { 'aria-labelledby': id },
    children: [el('h2', { className: 'tj-h3', text: title, attrs: { id }, doc }), ...children], doc,
  });
  const row = (label, control, ...extra) => el('div', { className: 'st-row', children: [el('div', { className: 'st-row__label', children: [typeof label === 'string' ? el('span', { className: 'tj-label', text: label, doc }) : label], doc }), el('div', { className: 'st-row__control', children: [control, ...extra], doc })], doc });
  const note = (text) => el('p', { className: 'tj-caption st-note', text, doc });

  // ---- العرض ----
  const displayMark = marks();
  const displaySeg = segmented({
    legend: 'وضع العرض الافتراضي', value: settings.displayModeDefault, doc,
    options: [{ value: 'ar', label: 'العربية وحدها' }, { value: 'dual', label: 'العربية فوق الإنجليزية' }],
    onChange: (v) => save({ displayModeDefault: v }, displayMark),
  });
  sync.push(() => displaySeg.set(settings.displayModeDefault));

  const fontMark = marks();
  const fontInputs = [];
  const fontList = el('fieldset', {
    className: 'st-fonts',
    children: [
      el('legend', { className: 'tj-sr-only', text: 'خط الترجمة', doc }),
      ...SUBTITLE_FONT_LIST.map((f) => {
        const input = el('input', { attrs: { type: 'radio', name: 'st-font', value: f.id }, doc });
        input.checked = f.id === settings.appearance.font;
        input.addEventListener('change', () => { if (input.checked) save({ appearance: { font: f.id } }, fontMark); });
        fontInputs.push(input);
        const name = el('span', { className: 'st-font__name', text: f.nameAr, doc });
        name.style.fontFamily = subtitleFontStack(f.id); // اسم كل خط بخطه نفسه
        return el('label', {
          className: 'st-font',
          children: [input, name, el('span', { className: 'st-font__meta', children: [ltr(f.nameLatin, { mono: false, doc }), ` · ${f.note}`], doc })],
          doc,
        });
      }),
    ],
    doc,
  });
  sync.push(() => fontInputs.forEach((input, i) => { input.checked = SUBTITLE_FONT_LIST[i].id === settings.appearance.font; }));

  const scaleMark = marks();
  const scaleId = 'st-scale';
  const scaleOut = el('output', { className: 'st-scale__value tj-mono', attrs: { for: scaleId }, doc });
  const slider = el('input', {
    className: 'st-scale__input',
    attrs: { id: scaleId, type: 'range', min: String(SUBTITLE_SCALE.min), max: String(SUBTITLE_SCALE.max), step: String(SUBTITLE_SCALE.step), 'aria-valuetext': '100%' },
    doc,
  });
  slider.value = String(settings.appearance.scale);
  const scaleText = (v) => `${v}%`;
  const showScale = (v) => {
    scaleOut.textContent = scaleText(v);
    slider.setAttribute('aria-valuetext', scaleText(v));
  };
  const previewScale = (v) => { preview.update({ ...settings.appearance, scale: v }); showScale(v); };
  slider.addEventListener('input', () => previewScale(snapScale(slider.value)));
  slider.addEventListener('change', () => save({ appearance: { scale: snapScale(slider.value) } }, scaleMark));
  const defaultMark = el('span', { className: 'st-scale__mark', attrs: { 'aria-hidden': 'true' }, doc });
  defaultMark.style.insetInlineStart = `${DEFAULT_SCALE_MARK_PCT}%`;
  const sliderBox = el('div', { className: 'st-scale__box', children: [el('div', { className: 'st-scale__track', children: [slider, defaultMark], doc }), scaleOut], doc });
  sync.push(() => { slider.value = String(settings.appearance.scale); showScale(settings.appearance.scale); });

  const resetBtn = el('button', {
    className: 'tj-btn tj-btn--ghost tj-btn--sm st-reset', attrs: { type: 'button' },
    children: [pageIcon('restore', { doc }), el('span', { text: 'استعادة الخط والحجم الافتراضيين', doc })], doc,
  });
  // السبب خارج الزر فلا يدخل اسمه؛ يرتبط به وصفًا (aria-describedby) وبـtitle.
  const resetReason = el('span', { className: 'tj-sr-only', attrs: { id: 'st-reset-reason' }, doc });
  resetBtn.addEventListener('click', (e) => {
    if (resetBtn.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    save({ appearance: { font: DEFAULT_SETTINGS.appearance.font, scale: DEFAULT_SETTINGS.appearance.scale } }, scaleMark);
  });
  sync.push(() => {
    const r = resetState(settings.appearance);
    resetBtn.setAttribute('aria-disabled', r.isDefault ? 'true' : 'false');
    resetBtn.title = r.disabledReason ?? '';
    resetReason.textContent = r.disabledReason ?? '';
    if (r.isDefault) resetBtn.setAttribute('aria-describedby', 'st-reset-reason');
    else resetBtn.removeAttribute('aria-describedby');
  });

  const bgMark = marks();
  const bgSeg = segmented({
    legend: 'الخلفية', value: settings.appearance.background, doc,
    options: SUBTITLE_BACKGROUNDS.map((v) => ({ value: v, label: BG_LABELS[v] })),
    onChange: (v) => save({ appearance: { background: v } }, bgMark),
  });
  sync.push(() => bgSeg.set(settings.appearance.background));
  const posMark = marks();
  const posSeg = segmented({
    legend: 'الموضع', value: settings.appearance.position, doc,
    options: SUBTITLE_POSITIONS.map((v) => ({ value: v, label: POSITION_LABELS[v] })),
    onChange: (v) => save({ appearance: { position: v } }, posMark),
  });
  sync.push(() => posSeg.set(settings.appearance.position));

  // المعاينة الحية: صندوق فيديو داكن بسطرين، يتحدث فور تغيير أي من المظهر.
  const preview = (() => {
    const stage = el('div', { className: 'st-preview__stage', children: PREVIEW_LINES.map((t) => el('p', { className: 'st-preview__line', text: t, attrs: { lang: 'ar', dir: 'rtl' }, doc })), doc });
    const screen = el('div', { className: 'st-preview__screen', children: [stage], doc });
    screen.style.width = `${PREVIEW_BOX.width}px`;
    screen.style.aspectRatio = `${PREVIEW_BOX.width} / ${PREVIEW_BOX.height}`;
    const box = el('div', { className: 'st-preview', attrs: { role: 'img', 'aria-label': 'معاينة حية لشكل الترجمة فوق الفيديو' }, children: [screen], doc });
    return {
      root: box, stage,
      update(a) {
        const s = previewStyle(a);
        stage.style.fontFamily = s.fontFamily;
        stage.style.fontSize = s.fontSize;
        stage.style.top = s.anchor === 'top' ? s.offset : 'auto';
        stage.style.bottom = s.anchor === 'bottom' ? s.offset : 'auto';
        stage.setAttribute('data-bg', s.background);
        stage.setAttribute('data-anchor', s.anchor);
        stage.setAttribute('data-font', a.font);
        stage.setAttribute('data-scale', String(a.scale));
        screen.style.setProperty('--st-sub-text', s.text);
        screen.style.setProperty('--st-sub-bg-soft', s.softBg);
        screen.style.setProperty('--st-sub-bg-solid', s.solidBg);
      },
    };
  })();
  sync.push(() => preview.update(settings.appearance));

  const display = card('st-display-title', 'العرض',
    row('وضع العرض الافتراضي', displaySeg.root, displayMark.root),
    row(el('span', { className: 'tj-label', text: 'خط الترجمة', doc }), fontList, fontMark.root),
    note(SUBTITLE_NOTE),
    row('حجم الخط', sliderBox, scaleMark.root),
    note(SCALE_NOTE),
    el('div', { className: 'st-reset-row', children: [resetBtn, resetReason], doc }),
    row('الخلفية', bgSeg.root, bgMark.root),
    row('الموضع', posSeg.root, posMark.root),
    preview.root,
    note(PREVIEW_NOTE));

  // ---- التوقيت ----
  const stepMark = marks();
  let stepField;
  const stepSeg = segmented({
    legend: 'خطوة أزرار ±', value: stepChoice(settings.offsetStepMs), doc,
    options: [{ value: '0.5', label: '0.5' }, { value: '1', label: '1' }, { value: 'custom', label: 'مخصص' }],
    onChange: (v) => {
      stepCustom = v === 'custom';
      customHost.hidden = !stepCustom;
      if (v === 'custom') { stepField.input.focus(); return; }
      stepField.setError(null);
      save({ offsetStepMs: v === '1' ? 1000 : 500 }, stepMark);
    },
  });
  stepField = numberField({
    label: 'الخطوة المخصصة', hint: 'بالثواني، من 0.1 إلى 10 بمضاعفات 0.1.', unit: 'ث', value: stepText(settings.offsetStepMs), parse: parseStep, mark: null, doc,
    commit: (ms) => save({ offsetStepMs: ms }, stepMark),
  });
  const customHost = el('div', { className: 'st-custom', children: [stepField.root], doc });
  customHost.hidden = true;
  sync.push(() => {
    const choice = stepChoice(settings.offsetStepMs);
    stepSeg.set(stepCustom ? 'custom' : choice);
    customHost.hidden = !(stepCustom || choice === 'custom');
    stepField.set(stepText(settings.offsetStepMs));
  });
  const timing = card('st-timing-title', 'التوقيت',
    row('خطوة أزرار ±', stepSeg.root, stepMark.root),
    customHost,
    el('p', { className: 'tj-body-sm', text: '+ تأخير: تظهر لاحقًا · − تقديم: تظهر أبكر', doc }),
    note('الإزاحة تُحفظ لكل فيديو، ولا تغيّر ملفك.'));

  // ---- التصدير ----
  const exportMark = marks();
  const modeSeg = segmented({
    legend: 'الوضع الافتراضي للتصدير', value: settings.export.modeDefault, doc,
    options: [{ value: 'normal', label: 'عادي' }, { value: 'long', label: 'مقاطع أطول' }],
    onChange: (v) => save({ export: { modeDefault: v } }, exportMark),
  });
  sync.push(() => modeSeg.set(settings.export.modeDefault));
  const splitMark = marks();
  const splitField = numberField({
    label: 'عتبة اقتراح التقسيم الاحتياطي', unit: 'مقطع', value: String(settings.export.splitThreshold), parse: parseSplit, mark: splitMark.root, doc,
    hint: `الافتراضي ${DEFAULT_SETTINGS.export.splitThreshold}. يُقترح التقسيم للملفات الأطول.`,
    commit: (n) => save({ export: { splitThreshold: n } }, splitMark),
  });
  sync.push(() => splitField.set(String(settings.export.splitThreshold)));
  const exporting = card('st-export-title', 'التصدير',
    row('الوضع الافتراضي', modeSeg.root, exportMark.root),
    el('div', { className: 'st-notes', children: [note(MODE_NOTES.normal), note(MODE_NOTES.long)], doc }),
    splitField.root);

  // ---- المقارنة ----
  const driftMark = marks();
  const driftField = numberField({
    label: 'عتبة انحراف التوقيت', unit: 'ملي ثانية', value: String(settings.thresholds.driftMs), parse: parseDrift, mark: driftMark.root, doc,
    hint: `الافتراضي ${DEFAULT_SETTINGS.thresholds.driftMs} ملي ثانية.`,
    commit: (n) => save({ thresholds: { driftMs: n } }, driftMark),
  });
  sync.push(() => driftField.set(String(settings.thresholds.driftMs)));
  const compMark = marks();
  const compField = numberField({
    label: 'نسبة الاكتمال', unit: '%', value: completenessText(settings.thresholds.completeness), parse: parseCompleteness, mark: compMark.root, doc,
    hint: `الافتراضي ${completenessText(DEFAULT_SETTINGS.thresholds.completeness)}%.`,
    commit: (v) => save({ thresholds: { completeness: v } }, compMark),
  });
  sync.push(() => compField.set(completenessText(settings.thresholds.completeness)));
  const comparison = card('st-compare-title', 'المقارنة', el('div', { className: 'st-fields', children: [driftField.root, compField.root], doc }));

  // ---- التخزين ----
  const usageText = el('span', { className: 'tj-caption', doc });
  const meterFill = el('span', { className: 'st-meter__fill', doc });
  const meter = el('span', { className: 'st-meter', attrs: { role: 'meter', 'aria-label': 'المساحة المستخدمة', 'aria-valuemin': '0', 'aria-valuemax': '100' }, children: [meterFill], doc });
  const storageMark = marks();
  const capacityAlert = el('div', { doc });
  async function refreshCapacity() {
    try {
      const cap = await store.capacity();
      usageText.textContent = cap.quotaBytes ? `المستخدم ${formatBytes(cap.bytesInUse)} من ${formatBytes(cap.quotaBytes)}` : `المستخدم ${formatBytes(cap.bytesInUse)} (بلا حد ثابت)`;
      meter.hidden = !cap.quotaBytes;
      if (cap.quotaBytes) {
        const pct = Math.min(100, Math.round((cap.bytesInUse / cap.quotaBytes) * 100));
        meterFill.style.width = `${pct}%`;
        meter.setAttribute('aria-valuenow', String(pct));
        meter.className = `st-meter st-meter--${cap.level}`;
      }
      capacityAlert.replaceChildren(...(cap.code ? [alertBox({ tone: cap.level === 'full' ? 'danger' : 'warning', text: messageFor(cap.code), doc })] : []));
    } catch (err) {
      usageText.textContent = toErrorInfo(err).message;
    }
  }
  const clearBtn = el('button', { className: 'tj-btn tj-btn--danger', attrs: { type: 'button' }, children: [pageIcon('trash', { doc }), el('span', { text: 'مسح كل البيانات', doc })], doc });
  clearBtn.addEventListener('click', () => { clearAll(); });
  async function clearAll() {
    const typed = el('input', { className: 'tj-field__input', attrs: { id: 'st-confirm-word', type: 'text', autocomplete: 'off', placeholder: CONFIRM_WORD }, doc });
    const content = el('div', {
      className: 'st-confirm',
      children: [el('label', { className: 'tj-field__label', text: `اكتب «${CONFIRM_WORD}» للتأكيد`, attrs: { for: 'st-confirm-word' }, doc }), typed],
      doc,
    });
    const pending = confirm({
      title: 'مسح كل البيانات؟',
      body: 'تُحذف كل الترجمات المحفوظة والإعدادات من هذا المتصفح، ولا يمكن التراجع عن ذلك.',
      confirmLabel: 'مسح كل البيانات', tone: 'danger', content, doc,
    });
    // زر التأكيد لا يعمل حتى تُكتب الكلمة نفسها (والإدخال بـEnter يمرّ بالزر نفسه فيُمنع كذلك).
    const confirmBtn = content.closest?.('form')?.querySelector('button[value="confirm"]');
    if (confirmBtn) {
      const gate = () => {
        const ok = confirmWordOk(typed.value);
        confirmBtn.setAttribute('aria-disabled', ok ? 'false' : 'true');
        confirmBtn.title = ok ? '' : messageFor('PG_CLEAR_CONFIRM_WORD');
      };
      typed.addEventListener('input', gate);
      gate();
    }
    if (!(await pending) || !confirmWordOk(typed.value)) return;
    try {
      await store.clearAll();
      settings = await store.getSettings();
      storageMark.flash(messageFor('PG_CLEAR_DONE'), 'success');
      syncAll();
      await refreshCapacity();
      await refreshReminder();
    } catch (err) {
      storageMark.flash(toErrorInfo(err).message, 'danger');
    }
  }
  const storage = card('st-storage-title', 'التخزين',
    el('div', { className: 'st-quota', children: [usageText, meter], doc }),
    capacityAlert,
    el('div', { className: 'st-row__control', children: [clearBtn, storageMark.root], doc }));

  // ---- التشخيص ----
  const diagMark = marks();
  const diagBtn = el('button', { className: 'tj-btn tj-btn--secondary st-diag__button', attrs: { type: 'button' }, children: [pageIcon('clipboard', { doc }), el('span', { text: 'نسخ تقرير التشخيص', doc })], doc });
  diagBtn.addEventListener('click', async () => {
    try {
      await env.clipboardWrite(await env.diagnosticsText());
      diagMark.flash(messageFor('PG_DIAGNOSTICS_DONE'), 'success');
    } catch {
      diagMark.flash(messageFor('PG_DIAGNOSTICS_FAILED'), 'danger');
    }
  });
  const panel = (tone, title, text) => el('div', { className: `st-panel st-panel--${tone}`, children: [el('strong', { className: 'st-panel__title', text: title, doc }), el('p', { className: 'tj-body-sm', text, doc })], doc });
  const diagnostics = card('st-diag-title', 'التشخيص',
    el('div', { className: 'st-row__control', children: [diagBtn, diagMark.root], doc }),
    el('div', {
      className: 'st-panels',
      children: [
        panel('ok', 'يتضمن', 'الإصدار، والمتصفح، ونوع الخطأ، وأحجامًا وأعدادًا.'),
        panel('no', 'لا يتضمن أبدًا', 'روابط، أو رموز جلسة، أو ملفات ارتباط، أو نص الترجمة.'),
      ],
      doc,
    }));

  async function refreshReminder() {
    // لا مفتاح «أول تشغيل» في التخزين (عقد المفاتيح)؛ فالتذكير يظهر ما دامت المحفوظات فارغة.
    try {
      const empty = (await store.listIndex()).length === 0;
      reminderHost.replaceChildren(...(empty ? [alertBox({ tone: 'info', text: INSTALL_REMINDER, doc })] : []));
    } catch {
      reminderHost.replaceChildren();
    }
  }

  function syncAll() {
    for (const fn of sync) fn();
  }

  root.append(
    el('header', { className: 'st-header', children: [el('span', { className: 'tj-mark', text: 'ت', attrs: { 'aria-hidden': 'true' }, doc }), el('h1', { className: 'tj-h1', text: 'الإعدادات', doc })], doc }),
    el('p', { className: 'tj-caption', text: 'كل خيار يُحفظ فورًا على جهازك، وتظهر «حُفظ» بجانبه.', doc }),
    reminderHost, alertHost, display, timing, exporting, comparison, storage, diagnostics, aboutSection({ version, doc }),
  );
  syncAll();

  const unsubscribe = store.onChange((change) => {
    if (!change.settings && !change.cleared) return;
    store.getSettings().then((s) => { settings = s; syncAll(); }).catch(() => {});
  });

  return {
    root, preview, slider,
    get settings() { return settings; },
    async load() {
      try {
        settings = await store.getSettings();
        syncAll();
      } catch (err) {
        const info = toErrorInfo(err);
        alertHost.replaceChildren(alertBox({ tone: 'danger', title: 'تعذّرت قراءة الإعدادات', text: `${info.message} (${info.code})`, doc }));
      }
      await Promise.all([refreshCapacity(), refreshReminder()]);
    },
    dispose: unsubscribe,
  };
}
