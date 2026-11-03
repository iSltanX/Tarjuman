// واجهة الإعدادات (P7-AC4/AC8/AC9/AC10، وإعادة التصميم، وP13-AC4/AC7/AC8): تنقّل جانبي في البداية (اليمين) بأقسام قصيرة،
// ومحتوى القسم المختار بجواره، والحفظ فوري لكل خيار بعلامة «حُفظ» تحت تسميته، و«استعادة الافتراضي» لكل قسم له افتراضيات.
// القسم المختار في جزء العنوان (#export) فيبقى عند التحديث وتُفتح الصفحة عليه من رابط. خط الترجمة وحجمها يخصان المعاينة
// وما يُعرض فوق الفيديو وحدهما، وخطوط الصفحة نفسها لا تتغير. والإصدار الثاني: مكان الحفظ أول «التصدير»، وحد سرعة القراءة
// في «المقارنة والمراجعة»، وبطاقتا «المصطلحات» و«البيانات»، وسعة الترجمات والسوابق في «التخزين»؛ وتفضيلاته في prefs.
// لا طلبات شبكة، وكل نص عبر textContent.
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { DEFAULT_PREFS } from '../../core/model/prefs.js';
import { DEFAULT_SETTINGS, SUBTITLE_BACKGROUNDS, SUBTITLE_POSITIONS, SUBTITLE_SCALE } from '../../core/model/settings.js';
import { alertBox, button, confirmDialog, el, icon, ltr, statusPill } from '../../ui/components.js';
import { formatBytes, ltrInline } from '../../ui/format.js';
import { numberField, savedMark, segmented } from '../../ui/forms.js';
import { SUBTITLE_FONT_LIST, subtitleFontStack } from '../../ui/subtitle-fonts.js';
import { aboutSection } from './about.js';
import { dataControl } from './data.js';
import { glossaryControl } from './glossary.js';
import { saveLocationControl } from './location.js';
import {
  CONFIRM_WORD, DEFAULT_SCALE_MARK_PCT, DEFAULT_SECTION, PREVIEW_BOX, PREVIEW_LINES, READING_DEFAULT_CPS, SECTIONS, completenessText,
  confirmWordOk, isSectionId, parseCompleteness, parseDrift, parseReadingSpeed, parseSplit, parseStep, previewStyle, readingText,
  sectionReset, snapScale, stepChoice, stepText,
} from './model.js';

export const SUBTITLE_NOTE = 'يخص الترجمة فوق الفيديو وحدها، والخطوط مضمّنة في الإضافة.';
export const SCALE_NOTE = 'من 70% إلى 160% بخطوة 5% · الافتراضي 100%';
export const PREVIEW_NOTE = 'الحجم نسبة من ارتفاع المشغّل، فيكبر النص في ملء الشاشة.';
export const INSTALL_REMINDER = 'ثبّت أيقونة ترجمان في شريط المتصفح من قائمة الإضافات.';
export const SAVE_HINT = 'كل خيار يُحفظ فورًا على جهازك.';
export const RESET_LABEL = 'استعادة الافتراضي';
/** مفاتيح الواجهة على هذا الجهاز في «العرض» (prefs.ui). اللوحة مغلقة افتراضيًا (قرار سلطان 2026-11-03)، وزرها في شريط المشغّل. */
export const ENTRY_SWITCH = Object.freeze({
  label: 'زر النص المتزامن', hint: 'في شريط المشغّل', text: 'يظهر في صفحات الفيديو',
  note: 'إطفاؤه كإخفاء الزر من اللوحة نفسها؛ وإغلاق اللوحة لا يمسّه.',
});
export const PANEL_OPEN_SWITCH = Object.freeze({
  label: 'لوحة النص المتزامن', hint: 'يمين الفيديو', text: 'مفتوحة في صفحات الفيديو',
  note: 'مطفأة افتراضيًا. زرها في شريط المشغّل يفتحها ويغلقها أيضًا، ويبقى آخر اختيار في كل الفيديوهات.',
});
export const THUMBNAILS_SWITCH = Object.freeze({
  label: 'صور الفيديو في المحفوظات', text: 'تُعرض صورة كل فيديو',
  note: `تُطلب من خوادم يوتيوب (${ltrInline('i.ytimg.com')}) بمعرّف الفيديو؛ أطفئها ليبقى كل شيء على جهازك.`,
});
export const MODE_NOTES = Object.freeze({
  normal: 'عادي: مقاطع كما في يوتيوب، للتزامن الأدق.',
  long: 'مقاطع أطول: جمل أطول ليفهم النموذج السياق، بالترقيم والتوقيت نفسيهما.',
});
const BG_LABELS = Object.freeze({ none: 'بلا', soft: 'خفيفة', solid: 'صلبة' });
const POSITION_LABELS = Object.freeze({ bottom: 'أسفل', raised: 'مرتفع', top: 'أعلى' });

/**
 * @typedef {{
 *   store: ReturnType<typeof import('../../core/store/index.js').createStore>,
 *   version: string, doc?: Document, now?: () => number,
 *   clipboardWrite: (text: string) => Promise<void>,
 *   diagnosticsText: () => Promise<string>,
 *   saveFile?: (file: { name: string, text: string }) => Promise<{ ok: true, mode: string, downloadId: number | null } | { ok: false, code: string }>,
 *   savedPath?: (downloadId: number) => Promise<string | null>,
 *   pickFile?: () => Promise<File | null>,
 *   pause?: () => Promise<void>,
 *   confirm?: typeof confirmDialog,
 *   nav?: { get: () => string | null, set: (id: string) => void, onChange: (fn: () => void) => () => void },
 *   setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void,
 * }} SettingsEnv
 */

/** التنقّل عبر جزء العنوان إن وُجدت نافذة، وإلا ذاكرة فقط (الاختبارات). */
function hashNav(doc) {
  const win = doc.defaultView ?? null;
  if (!win?.location || !win.history?.replaceState) {
    let memo = null;
    return { get: () => memo, set: (id) => { memo = id; }, onChange: () => () => {} };
  }
  return {
    get: () => String(win.location.hash ?? '').replace(/^#/, '') || null,
    set: (id) => {
      if (win.location.hash !== `#${id}`) win.history.replaceState(null, '', `#${id}`);
    },
    onChange: (fn) => {
      win.addEventListener('hashchange', fn);
      return () => win.removeEventListener('hashchange', fn);
    },
  };
}

/** @param {SettingsEnv} env */
export function createSettings(env) {
  const { store, doc = document, version } = env;
  const setTimer = env.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = env.clearTimer ?? ((id) => clearTimeout(id));
  const confirm = env.confirm ?? confirmDialog;
  const nav = env.nav ?? hashNav(doc);
  const marks = () => savedMark({ doc, setTimer, clearTimer });
  const now = env.now ?? Date.now;
  let settings = DEFAULT_SETTINGS;
  let prefs = DEFAULT_PREFS;
  let stepCustom = false;
  /** مؤشر إلى ما يحدّث الواجهة من الإعدادات (يُملأ أدناه). */
  const sync = [];

  const root = el('div', { className: 'st', doc });
  const reminderHost = el('div', { className: 'st-reminder', doc });
  const alertHost = el('div', { attrs: { role: 'status' }, doc });

  /** يحفظ تعديلًا جزئيًا ويبلّغ العلامة بالنتيجة؛ الفشل يُبقي القيمة السابقة في الواجهة. */
  async function save(patch, mark) {
    try {
      settings = await store.setSettings(patch);
      mark.flash(messageFor('PG_SAVED'), 'success');
    } catch (err) {
      mark.flash(messageFor('PG_SAVE_FAILED'), 'danger');
      settings = await store.getSettings().catch(() => settings);
      syncAll(true);
      return settings;
    }
    syncAll();
    return settings;
  }

  /** مثل save للتفضيلات (القاموس وحد القراءة ومكان الحفظ). يعيد التفضيلات الجديدة، أو null عند الفشل. */
  async function savePrefs(patch, mark) {
    try {
      prefs = await store.setPrefs(patch);
      mark.flash(messageFor('PG_SAVED'), 'success');
    } catch {
      mark.flash(messageFor('PG_SAVE_FAILED'), 'danger');
      prefs = await store.getPrefs().catch(() => prefs);
      syncAll(true);
      return null;
    }
    syncAll();
    return prefs;
  }

  // ---- البُنى المشتركة ----
  const note = (text) => el('p', { className: 'tj-caption st-note', text, doc });
  /** صف: التسمية في البداية وتحتها علامة الحفظ، والعنصر بعدها. */
  const row = (label, mark, control, ...extra) => el('div', {
    className: 'st-row',
    children: [
      el('div', { className: 'st-row__label', children: [el('span', { className: 'tj-label', text: label, doc }), mark?.root ?? null], doc }),
      el('div', { className: 'st-row__control', children: [control, ...extra], doc }),
    ],
    doc,
  });
  /** صف بسطر شرح تحت التسمية (قبل علامة الحفظ). */
  const rowWithHint = (label, hint, mark, control, ...extra) => {
    const r = row(label, mark, control, ...extra);
    r.querySelector('.st-row__label').insertBefore(el('span', { className: 'st-row__hint', text: hint, doc }), mark?.root ?? null);
    return r;
  };
  /**
   * مفتاح لتفضيل واجهة على هذا الجهاز (prefs.ui.<key>): يقرأ من التفضيلات ويكتب فيها فورًا بعلامة «حُفظ»؛ وإن فشل الحفظ عادت
   * الواجهة إلى المحفوظ (savePrefs يزامنها)، فلا يبقى المفتاح على غير ما في التخزين.
   */
  function uiSwitch(key, text, mark) {
    const input = el('input', { className: 'st-switch__input', attrs: { id: `st-ui-${key}`, type: 'checkbox', role: 'switch', 'data-pref': `ui.${key}` }, doc });
    // إطفاء «زر النص المتزامن» كإخفائه من قائمة اللوحة: يُغلق اللوحة معه، فلا تُفتح وحدها حين يعود الزر (مراجعة الهوية L4)؛ وفتح
    // اللوحة يعيد زرها، فلا تُفتح لوحة لا زر يغلقها من الشريط.
    input.addEventListener('change', () => {
      let patch = { [key]: input.checked };
      if (key === 'panelEntry' && !input.checked) patch = { panelEntry: false, panelOpen: false };
      if (key === 'panelOpen' && input.checked) patch = { panelOpen: true, panelEntry: true };
      savePrefs({ ui: patch }, mark);
    });
    sync.push(() => { input.checked = prefs.ui[key]; });
    input.checked = prefs.ui[key];
    return el('label', {
      className: 'st-switch', attrs: { for: `st-ui-${key}` },
      children: [input, el('span', { className: 'st-switch__track', attrs: { 'aria-hidden': 'true' }, doc }), el('span', { className: 'st-switch__label', text, doc })],
      doc,
    });
  }

  /** قسم بعنوان ووصف و«استعادة الافتراضي» إن كان له افتراضيات. */
  function section(def, ...children) {
    const reset = sectionReset(settings, def.id, prefs);
    let resetBtn = null;
    let resetMark = null;
    if (reset) {
      resetMark = marks();
      resetBtn = button({ label: RESET_LABEL, variant: 'ghost', size: 'sm', icon: 'restore', className: 'st-section__reset', doc, onClick: async () => {
        const r = sectionReset(settings, def.id, prefs);
        if (!r || r.isDefault) return;
        if (Object.keys(r.patch).length) await save(r.patch, resetMark);
        if (Object.keys(r.prefsPatch).length) await savePrefs(r.prefsPatch, resetMark);
      } });
      sync.push(() => {
        const r = sectionReset(settings, def.id, prefs);
        resetBtn.setAttribute('aria-disabled', r.isDefault ? 'true' : 'false');
        resetBtn.title = r.disabledReason ?? '';
      });
    }
    const head = el('div', {
      className: 'st-section__head',
      children: [
        el('div', { className: 'st-section__titles', children: [el('h2', { className: 'tj-h3', text: def.title, attrs: { id: `st-${def.id}-title` }, doc }), el('p', { className: 'tj-caption', text: def.desc, doc })], doc }),
        resetBtn ? el('div', { className: 'st-section__actions', children: [resetBtn, resetMark.root], doc }) : null,
      ],
      doc,
    });
    return el('section', { className: 'st-section', attrs: { id: def.id, 'aria-labelledby': `st-${def.id}-title`, 'data-section': def.id }, children: [head, ...children], doc });
  }
  const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

  // ---- العرض ----
  const displayMark = marks();
  const displaySeg = segmented({
    legend: 'وضع العرض الافتراضي', value: settings.displayModeDefault, doc,
    options: [{ value: 'ar', label: 'العربية وحدها' }, { value: 'dual', label: 'العربية فوق الإنجليزية' }],
    onChange: (v) => save({ displayModeDefault: v }, displayMark),
  });
  sync.push(() => displaySeg.set(settings.displayModeDefault));

  // خط الترجمة (لوحة الإعدادات المعتمدة): شريحة مدمجة لكل خط باسمه بخطه نفسه، و«الافتراضي» وسمٌ صغير في شريحته؛ ووصف المختار
  // (اسمه اللاتيني وما يميّزه) سطرٌ واحد تحت الشرائح بدل بطاقة لكل خط.
  const fontMark = marks();
  const fontInputs = [];
  const fontMeta = el('p', { className: 'st-font-meta', attrs: { id: 'st-font-meta' }, doc });
  const renderFontMeta = (id) => {
    const f = SUBTITLE_FONT_LIST.find((x) => x.id === id) ?? SUBTITLE_FONT_LIST[0];
    fontMeta.replaceChildren(el('span', { children: [ltr(f.nameLatin, { mono: false, doc }), ` · ${f.note}`], doc }));
  };
  const fontList = el('fieldset', {
    className: 'st-fonts',
    attrs: { 'aria-describedby': 'st-font-meta' },
    children: [
      el('legend', { className: 'tj-sr-only', text: 'خط الترجمة', doc }),
      ...SUBTITLE_FONT_LIST.map((f, i) => {
        const input = el('input', { attrs: { type: 'radio', name: 'st-font', value: f.id }, doc });
        input.checked = f.id === settings.appearance.font;
        input.addEventListener('change', () => {
          if (!input.checked) return;
          renderFontMeta(f.id);
          save({ appearance: { font: f.id } }, fontMark);
        });
        fontInputs.push(input);
        const name = el('span', { className: 'st-font__name', text: f.nameAr, doc });
        name.style.fontFamily = subtitleFontStack(f.id); // اسم كل خط بخطه نفسه
        return el('label', {
          className: 'st-font',
          children: [input, name, i === 0 ? el('span', { className: 'st-font__tag', text: 'الافتراضي', doc }) : null],
          doc,
        });
      }),
    ],
    doc,
  });
  renderFontMeta(settings.appearance.font);
  sync.push(() => {
    fontInputs.forEach((input, i) => { input.checked = SUBTITLE_FONT_LIST[i].id === settings.appearance.font; });
    renderFontMeta(settings.appearance.font);
  });

  const scaleMark = marks();
  const scaleId = 'st-scale';
  const scaleOut = el('output', { className: 'st-scale__value tj-mono', attrs: { for: scaleId }, doc });
  const slider = el('input', {
    className: 'st-scale__input',
    attrs: { id: scaleId, type: 'range', min: String(SUBTITLE_SCALE.min), max: String(SUBTITLE_SCALE.max), step: String(SUBTITLE_SCALE.step), 'aria-label': 'حجم خط الترجمة', 'aria-valuetext': '100%' },
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

  // مفاتيح الواجهة (prefs.ui) على هذا الجهاز: لوحة النص المتزامن وزرها في شريط المشغّل، وصور الفيديو في المحفوظات.
  const openMark = marks();
  const openSwitch = uiSwitch('panelOpen', PANEL_OPEN_SWITCH.text, openMark);
  const entryMark = marks();
  const entrySwitch = uiSwitch('panelEntry', ENTRY_SWITCH.text, entryMark);
  const thumbsMark = marks();
  const thumbsSwitch = uiSwitch('thumbnails', THUMBNAILS_SWITCH.text, thumbsMark);

  const display = section(byId.display,
    row('وضع العرض الافتراضي', displayMark, displaySeg.root),
    row('خط الترجمة', fontMark, fontList, fontMeta, note(SUBTITLE_NOTE)),
    row('حجم الخط', scaleMark, sliderBox, note(SCALE_NOTE)),
    row('الخلفية', bgMark, bgSeg.root),
    row('الموضع', posMark, posSeg.root),
    rowWithHint(PANEL_OPEN_SWITCH.label, PANEL_OPEN_SWITCH.hint, openMark, openSwitch, note(PANEL_OPEN_SWITCH.note)),
    rowWithHint(ENTRY_SWITCH.label, ENTRY_SWITCH.hint, entryMark, entrySwitch, note(ENTRY_SWITCH.note)),
    row(THUMBNAILS_SWITCH.label, thumbsMark, thumbsSwitch, note(THUMBNAILS_SWITCH.note)),
    row('معاينة حية', null, preview.root, note(PREVIEW_NOTE)));

  // ---- التوقيت ----
  const stepMark = marks();
  let stepField;
  const stepSeg = segmented({
    legend: 'خطوة أزرار ±', value: stepChoice(settings.offsetStepMs), doc,
    options: [{ value: '0.5', label: '0.5 ث' }, { value: '1', label: '1 ث' }, { value: 'custom', label: 'مخصص' }],
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
  sync.push((force) => {
    const choice = stepChoice(settings.offsetStepMs);
    stepSeg.set(stepCustom ? 'custom' : choice);
    customHost.hidden = !(stepCustom || choice === 'custom');
    stepField.set(stepText(settings.offsetStepMs), { force });
  });
  const timing = section(byId.timing,
    row('خطوة أزرار ±', stepMark, stepSeg.root, customHost, note('+ تأخير: تظهر الترجمة لاحقًا · − تقديم: تظهر أبكر. الإزاحة تُحفظ لكل فيديو ولا تغيّر ملفك.')));

  // ---- التصدير ----
  // مكان حفظ ملفات الترجمة (R65) أول بند: يتبعه كل تصدير من المحفوظات والنسخة الاحتياطية.
  const locationMark = marks();
  const location = saveLocationControl({
    doc, mark: locationMark, getPrefs: () => prefs, savePrefs,
    lastSavePath: async () => {
      const last = await store.getLastSave();
      return last && env.savedPath ? env.savedPath(last.downloadId) : null;
    },
  });
  sync.push((force) => location.sync(force));
  const exporting = section(byId.export,
    row('مكان حفظ ملفات الترجمة', locationMark, location.root));

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
  sync.push((force) => splitField.set(String(settings.export.splitThreshold), { force }));
  exporting.append(
    row('وضع التصدير الافتراضي', exportMark, modeSeg.root, el('div', { className: 'st-notes', children: [note(MODE_NOTES.normal), note(MODE_NOTES.long)], doc })),
    row('التقسيم الاحتياطي', null, splitField.root),
  );

  // ---- المقارنة ----
  const driftMark = marks();
  const driftField = numberField({
    label: 'عتبة انحراف التوقيت', unit: 'ملي ثانية', value: String(settings.thresholds.driftMs), parse: parseDrift, mark: driftMark.root, doc,
    hint: `الافتراضي ${DEFAULT_SETTINGS.thresholds.driftMs} ملي ثانية.`,
    commit: (n) => save({ thresholds: { driftMs: n } }, driftMark),
  });
  sync.push((force) => driftField.set(String(settings.thresholds.driftMs), { force }));
  const compMark = marks();
  const compField = numberField({
    label: 'نسبة الاكتمال', unit: '%', value: completenessText(settings.thresholds.completeness), parse: parseCompleteness, mark: compMark.root, doc,
    hint: `الافتراضي ${completenessText(DEFAULT_SETTINGS.thresholds.completeness)}%.`,
    commit: (v) => save({ thresholds: { completeness: v } }, compMark),
  });
  sync.push((force) => compField.set(completenessText(settings.thresholds.completeness), { force }));
  // حد سرعة القراءة (R55): فارغ = الافتراضي المعايَر، بعلامة «الافتراضي» ظاهرة.
  const readingMark = marks();
  const readingField = numberField({
    label: 'حد سرعة القراءة (حرف/ث)', unit: 'حرف/ث', value: readingText(prefs.review.maxCps), parse: parseReadingSpeed, mark: readingMark.root, doc,
    hint: `من 5 إلى 40. اتركه فارغًا للافتراضي ${READING_DEFAULT_CPS}. ينبّه المحرّر إلى المقاطع الأسرع منه ولا يمنع الحفظ.`,
    commit: (v) => savePrefs({ review: { maxCps: v } }, readingMark),
  });
  readingField.input.setAttribute('placeholder', String(READING_DEFAULT_CPS));
  const readingDefault = statusPill({ tone: 'neutral', plain: true, text: `الافتراضي ${READING_DEFAULT_CPS}`, doc });
  sync.push((force) => {
    readingField.set(readingText(prefs.review.maxCps), { force });
    readingDefault.hidden = prefs.review.maxCps !== null;
  });
  const comparison = section(byId.compare,
    el('div', { className: 'st-fields', children: [driftField.root, compField.root], doc }),
    el('div', { className: 'st-fields st-fields--review', children: [readingField.root, readingDefault], doc }));

  // ---- المصطلحات ----
  const glossaryAttachMark = marks();
  const glossaryListMark = marks();
  const glossary = glossaryControl({ doc, getPrefs: () => prefs, savePrefs, attachMark: glossaryAttachMark, listMark: glossaryListMark });
  sync.push(() => glossary.sync());
  const glossarySection = section(byId.glossary,
    row('الإرفاق', glossaryAttachMark, glossary.attachRow, note('حين يكون في القاموس مصطلحات، تُرفق بتعليمات الترجمة التي تنسخها من المشغّل أو المحفوظات.')),
    row('القاموس', glossaryListMark, el('div', { className: 'st-gl__head', children: [glossary.counter], doc }), glossary.list));

  // ---- التخزين ----
  const usageText = el('span', { className: 'tj-body-sm st-quota__text', doc });
  const meterFill = el('span', { className: 'tj-meter__fill', doc });
  const meter = el('span', { className: 'tj-meter', attrs: { role: 'meter', 'aria-label': 'المساحة المستخدمة', 'aria-valuemin': '0', 'aria-valuemax': '100' }, children: [meterFill], doc });
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
        meter.className = `tj-meter tj-meter--${cap.level}`;
      }
      capacityAlert.replaceChildren(...(cap.code ? [alertBox({ tone: cap.level === 'full' ? 'danger' : 'warning', text: messageFor(cap.code), doc })] : []));
    } catch (err) {
      usageText.textContent = toErrorInfo(err).message;
    }
  }
  const clearBtn = button({ label: 'مسح كل البيانات', variant: 'danger', icon: 'trash', doc, onClick: () => { clearAll(); } });
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
      [settings, prefs] = await Promise.all([store.getSettings(), store.getPrefs()]);
      storageMark.flash(messageFor('PG_CLEAR_DONE'), 'success');
      syncAll();
      await Promise.all([refreshCapacity(), refreshReminder(), refreshLibraryUsage(), location.refreshLast()]);
    } catch (err) {
      storageMark.flash(toErrorInfo(err).message, 'danger');
    }
  }
  // سعة الترجمات والسوابق: الأعداد من المحفوظات، والأحجام بالبايت لكل فيديو (bundleBytes)، بعد عرض الصفحة.
  const libraryText = el('span', { className: 'tj-body-sm st-library-usage', doc });
  const libraryBytes = el('span', { className: 'tj-caption st-library-bytes', doc });
  let usageSeq = 0;
  async function refreshLibraryUsage() {
    const mine = ++usageSeq;
    try {
      const list = await store.listLibrary();
      const translations = list.reduce((s, x) => s + x.summary.filled, 0);
      const videos = list.filter((x) => x.summary.filled > 0).length;
      if (mine !== usageSeq) return;
      libraryText.textContent = translations ? `الترجمات المحفوظة: ${translations} · الفيديوهات المترجمة: ${videos}` : 'لا ترجمات محفوظة بعد.';
      libraryBytes.textContent = '';
      // الأحجام معًا لا واحدًا بعد آخر (GM-009): رحلة لكل فيديو بالتوازي بدل أربع متتالية.
      const sizes = await Promise.all(list.map((x) => store.bundleBytes(x.entry.videoId)));
      const alts = sizes.reduce((s, b) => s + b.alts, 0);
      const previous = sizes.reduce((s, b) => s + b.previous, 0);
      if (mine !== usageSeq) return;
      libraryBytes.textContent = list.length ? `الترجمات غير النشطة ${formatBytes(alts)} · النسخ السابقة ${formatBytes(previous)}` : '';
    } catch (err) {
      if (mine === usageSeq) libraryText.textContent = toErrorInfo(err).message;
    }
  }
  const storage = section(byId.storage,
    row('المساحة المستخدمة', null, el('div', { className: 'st-quota', children: [usageText, meter], doc }), capacityAlert),
    row('الترجمات والنسخ السابقة', null, el('div', { className: 'st-library', children: [libraryText, libraryBytes], doc })),
    row('مسح البيانات', storageMark, el('div', { className: 'st-actions', children: [clearBtn], doc }), note('يحذف كل الترجمات المحفوظة والإعدادات من هذا المتصفح. الملفات التي نزّلتها على جهازك لا تتأثر.')));
  [...storage.children].at(-1)?.querySelector('.tj-label')?.classList.add('st-danger'); // تسمية «مسح البيانات» بنبرة الخطر

  // ---- البيانات ----
  const data = dataControl({
    doc, store, version, now, pause: env.pause, confirm,
    saveFile: env.saveFile ?? (async () => ({ ok: false, code: 'SV_FAILED' })),
    pickFile: env.pickFile ?? (async () => null),
    onSaved: () => location.refreshLast(),
    onRestored: async () => {
      await Promise.all([
        store.getSettings().then((s) => { settings = s; }).catch(() => {}),
        store.getPrefs().then((p) => { prefs = p; }).catch(() => {}),
      ]);
      syncAll();
      await Promise.all([refreshCapacity(), refreshReminder(), refreshLibraryUsage()]);
    },
  });
  const dataSection = section(byId.data,
    row('نسخة احتياطية', null, data.createRow, note('ملف JSON واحد فيه ترجماتك وعلاماتك وإعداداتك وقاموسك، يُحفظ في مكان حفظ الملفات المختار. لا يُرسل إلى أي مكان.')),
    row('الاستعادة', null, data.restoreRow, note('تُفحص النسخة كلها قبل أي كتابة. الموجود يُتخطى ما لم تختر استبداله.')));

  // ---- التشخيص ----
  const diagMark = marks();
  const diagBtn = button({ label: 'نسخ تقرير التشخيص', variant: 'secondary', icon: 'clipboard', doc, onClick: async () => {
    try {
      await env.clipboardWrite(await env.diagnosticsText());
      diagMark.flash(messageFor('PG_DIAGNOSTICS_DONE'), 'success');
    } catch {
      diagMark.flash(messageFor('PG_DIAGNOSTICS_FAILED'), 'danger');
    }
  } });
  const panel = (tone, title, text) => el('div', { className: `st-panel st-panel--${tone}`, children: [el('strong', { className: 'st-panel__title', text: title, doc }), el('p', { className: 'tj-body-sm', text, doc })], doc });
  const diagnostics = section(byId.diagnostics,
    row('تقرير التشخيص', diagMark, el('div', { className: 'st-actions', children: [diagBtn], doc }),
      el('div', {
        className: 'st-panels',
        children: [
          panel('ok', 'يتضمن', 'الإصدار، والمتصفح، ونوع الخطأ، وأحجامًا وأعدادًا.'),
          panel('no', 'لا يتضمن أبدًا', 'روابط، أو رموز جلسة، أو ملفات ارتباط، أو نص الترجمة.'),
        ],
        doc,
      })));

  // ---- حول ----
  const about = aboutSection({ version, doc, section: (...kids) => section(byId.about, ...kids) });

  async function refreshReminder() {
    // لا مفتاح «أول تشغيل» في التخزين (عقد المفاتيح)؛ فالتذكير يظهر ما دامت المحفوظات فارغة.
    try {
      const empty = (await store.listIndex()).length === 0;
      reminderHost.replaceChildren(...(empty ? [alertBox({ tone: 'info', text: INSTALL_REMINDER, doc })] : []));
    } catch {
      reminderHost.replaceChildren();
    }
  }

  /** force: القيم المحفوظة تُفرض حتى على حقل مركَّز (بعد فشل حفظ). */
  function syncAll(force = false) {
    for (const fn of sync) fn(force);
  }

  // ---- التنقّل بين الأقسام ----
  const sections = { display, timing, export: exporting, compare: comparison, glossary: glossarySection, storage, data: dataSection, diagnostics, about };
  let active = isSectionId(nav.get()) ? nav.get() : DEFAULT_SECTION;
  const navLinks = SECTIONS.map((s) => el('a', {
    className: 'st-nav__link', attrs: { href: `#${s.id}`, 'data-section': s.id },
    children: [icon(s.icon, { doc }), el('span', { className: 'st-nav__name', text: s.title, doc })],
    on: { click: (e) => { e.preventDefault?.(); select(s.id, { focus: true }); } },
    doc,
  }));
  const sideNav = el('nav', { className: 'st-nav', attrs: { 'aria-label': 'أقسام الإعدادات' }, children: navLinks, doc });

  function select(id, { focus = false } = {}) {
    if (!isSectionId(id)) id = DEFAULT_SECTION;
    active = id;
    for (const [key, sec] of Object.entries(sections)) sec.hidden = key !== id;
    for (const link of navLinks) {
      if (link.getAttribute('data-section') === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    nav.set(id);
    if (focus) sections[id].querySelector('h2')?.focus?.();
  }
  const offNav = nav.onChange(() => { if (isSectionId(nav.get()) && nav.get() !== active) select(nav.get()); });

  root.append(
    sideNav,
    el('div', {
      className: 'st-content',
      children: [
        el('header', { className: 'st-head', children: [el('h1', { className: 'tj-display', text: 'الإعدادات', doc }), el('p', { className: 'tj-caption', text: SAVE_HINT, doc })], doc }),
        reminderHost, alertHost, display, timing, exporting, comparison, glossarySection, storage, dataSection, diagnostics, about,
      ],
      doc,
    }),
  );
  for (const sec of Object.values(sections)) sec.querySelector('h2').tabIndex = -1;
  syncAll();
  select(active);

  // المساحة والترجمات والتذكير تتبع المحفوظات حين تتغير من تبويب آخر (حفظ، أو رفع، أو حذف)، بعد سكون قصير لا مع كل كتابة
  // (تدقيق 5fedcb9، GM-027.1).
  let usageTimer = null;
  const later = doc.defaultView?.setTimeout?.bind(doc.defaultView) ?? setTimeout;
  const unsubscribe = store.onChange((change) => {
    if (change.settings || change.cleared) store.getSettings().then((s) => { settings = s; syncAll(); }).catch(() => {});
    if (change.prefs || change.cleared) store.getPrefs().then((p) => { prefs = p; syncAll(); location.refreshLast(); }).catch(() => {});
    if ((Object.keys(change.videos ?? {}).length || change.index || change.bundles?.length || change.cleared) && usageTimer === null) {
      usageTimer = later(() => {
        usageTimer = null;
        Promise.all([refreshCapacity(), refreshReminder(), refreshLibraryUsage()]).catch(() => {});
      }, 300);
    }
  });

  return {
    root, preview, slider, select, data, location, glossary,
    get active() { return active; },
    get settings() { return settings; },
    get prefs() { return prefs; },
    async load() {
      try {
        [settings, prefs] = await Promise.all([store.getSettings(), store.getPrefs()]);
        syncAll();
      } catch (err) {
        const info = toErrorInfo(err);
        alertHost.replaceChildren(alertBox({ tone: 'danger', title: 'تعذّرت قراءة الإعدادات', text: `${info.message} (${info.code})`, doc }));
      }
      await Promise.all([refreshCapacity(), refreshReminder(), refreshLibraryUsage(), location.refreshLast()]);
    },
    dispose() {
      unsubscribe();
      offNav();
    },
  };
}
