// واجهة الإعدادات (P7-AC4/AC8/AC9/AC10، وإعادة التصميم، وP13-AC4/AC7/AC8): تنقّل جانبي في البداية (اليمين) بأقسام قصيرة،
// ومحتوى القسم المختار بجواره، والحفظ فوري لكل خيار بعلامة «حُفظ» تحت تسميته، و«استعادة الافتراضي» لكل قسم له افتراضيات.
// القسم المختار في جزء العنوان (#export) فيبقى عند التحديث وتُفتح الصفحة عليه من رابط. خط الترجمة وحجمها يخصان المعاينة
// وما يُعرض فوق الفيديو وحدهما، وخطوط الصفحة نفسها لا تتغير. والإصدار الثاني: مكان الحفظ أول «التصدير»، وحد سرعة القراءة
// في «المقارنة والمراجعة»، وبطاقتا «المصطلحات» و«البيانات»، وسعة الترجمات والسوابق في «التخزين»؛ وتفضيلاته في prefs.
// لا طلبات شبكة، وكل نص عبر textContent.
import { thumbnailsShown } from '../../core/consent/thumbnails.js';
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { DEFAULT_PREFS } from '../../core/model/prefs.js';
import { DEFAULT_GLOSSARIES } from '../../core/model/glossaries.js';
import { getDir, getLocale, isLocale, t, texts, LOCALE_NAMES } from '../../i18n/index.js';
import { DEFAULT_SETTINGS, SUBTITLE_BACKGROUNDS, SUBTITLE_POSITIONS, SUBTITLE_SCALE } from '../../core/model/settings.js';
import { alertBox, button, confirmDialog, el, icon, ltr, statusPill } from '../../ui/components.js';
import { formatBytes, ltrInline } from '../../ui/format.js';
import { numberField, savedMark, segmented } from '../../ui/forms.js';
import { SUBTITLE_FONT_LIST, subtitleFontStack } from '../../ui/subtitle-fonts.js';
import { createLanguages } from './langs.js';
import { aboutSection } from './about.js';
import { reportPanel } from './report.js';
import { dataControl } from './data.js';
import { glossaryControl } from './glossary.js';
import { whileHeld } from '../../ui/page-hold.js';
import { saveLocationControl } from './location.js';
import { shortcutsControl } from './shortcuts.js';
import {
  DEFAULT_SCALE_MARK_PCT, DEFAULT_SECTION, PREVIEW_BOX, READING_DEFAULT_CPS, SECTIONS, completenessText, confirmWord,
  confirmWordOk, parseCompleteness, parseDrift, parseReadingSpeed, parseSplit, previewStyle, readingText,
  previewLines, SECTION_ALIASES, sectionFor, sectionReset, snapScale,
} from './model.js';

// نصوص الصفحة في فهرس التوطين (settings.*) وتُقرأ بلغة الواجهة الحالية عند كل استعمال، لا عند تحميل الوحدة.
export const subtitleNote = () => t('settings.display.subtitleNote');
export const scaleNote = () => t('settings.display.scaleNote');
export const installReminder = () => t('settings.storage.installReminder');
export const saveHint = () => t('settings.saveHint');
export const resetLabel = () => t('settings.reset.label');
/** تعذّر قياس المساحة أو الأحجام وحده (تدقيق 7a66f91، U03): المحفوظات سليمة، فلا «تعذّرت قراءة المحفوظات» ولا «لم يُحذف شيء». */
export const capacityUnavailable = () => t('settings.storage.capacityUnavailable');
export const sizesUnavailable = () => t('settings.storage.sizesUnavailable');
/**
 * مفاتيح الواجهة على هذا الجهاز في «العرض» (prefs.ui). اللوحة مغلقة افتراضيًا (قرار سلطان 2026-11-03)، وتُفتح وتُغلق من زرها في شريط
 * المشغّل وحده، وتبقى على آخر حال (ح4، 2026-11-10: حُذف مفتاح «مفتوحة في صفحات الفيديو» المكرر، وقيمته المحفوظة كما هي).
 */
export const ENTRY_SWITCH = texts('settings.entrySwitch');
// Firefox (قرار سلطان 2026-11-04، core/consent/thumbnails.js): التفعيل يطلب موافقة «نشاط التصفح»، والصور مطفأة حتى يوافق. note وnoteFirefox قالبان بـ{host}.
export const THUMBNAILS_SWITCH = texts('settings.thumbsSwitch');
const thumbsNote = (firefox) => t(firefox ? 'settings.thumbsSwitch.noteFirefox' : 'settings.thumbsSwitch.note', { host: ltrInline('i.ytimg.com') });
export const MODE_NOTES = texts('settings.modeNotes');
const BG_KEYS = Object.freeze({ none: 'bgNone', soft: 'bgSoft', solid: 'bgSolid' });
const POSITION_KEYS = Object.freeze({ bottom: 'posBottom', raised: 'posRaised', top: 'posTop' });
const bgLabel = (v) => t(`settings.display.${BG_KEYS[v]}`);
const positionLabel = (v) => t(`settings.display.${POSITION_KEYS[v]}`);

/**
 * @typedef {{
 *   store: ReturnType<typeof import('../../core/store/index.js').createStore>,
 *   version: string, doc?: Document, now?: () => number,
 *   clipboardWrite: (text: string | Promise<string>) => Promise<void>,
 *   diagnosticsText: () => Promise<string>,
 *   saveFile?: (file: { name: string, text: string }) => Promise<{ ok: true, mode: string, downloadId: number | null } | { ok: false, code: string }>,
 *   savedPath?: (downloadId: number) => Promise<string | null>,
 *   pickFile?: () => Promise<File | null>,
 *   pause?: () => Promise<void>,
 *   confirm?: typeof confirmDialog,
 *   nav?: { get: () => string | null, set: (id: string) => void, onChange: (fn: () => void) => () => void },
 *   report?: import('./report.js').ReportEnv,
 *   setTimer?: (fn: () => void, ms: number) => unknown, clearTimer?: (id: unknown) => void,
 *   thumbsConsent?: { needed: boolean, check: () => Promise<boolean>, request: () => Promise<boolean>, watch?: (fn: (e: { revoked: boolean }) => void) => () => void },
 *   youtubeAccess?: { check: () => Promise<boolean | null>, request: () => Promise<boolean>, watch?: (fn: () => void) => () => void },
 *   shortcuts?: { target: 'chromium' | 'firefox', tabs?: { create: (o: { url: string }) => Promise<unknown> }, commands?: { openShortcutSettings?: () => Promise<unknown> } },
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
  /** قوائم المصطلحات لكل زوج (الفكرة ٨): مفتاحها glossaries، وتعذّر قراءتها يبقي آخر ما قُرئ. */
  let glossaries = DEFAULT_GLOSSARIES;
  const readGlossaries = () => (typeof store.getGlossaries === 'function' ? store.getGlossaries().catch(() => glossaries) : Promise.resolve(glossaries));
  // موافقة صور المحفوظات (Firefox وحده؛ core/consent/thumbnails.js): الصور تظهر بالمفتاح والموافقة معًا، وفي Chromium بالمفتاح.
  const thumbsConsent = env.thumbsConsent ?? { needed: false, check: () => Promise.resolve(true), request: () => Promise.resolve(true) };
  let thumbsGranted = !thumbsConsent.needed;
  // سحب الموافقة من صفحة إضافات Firefox لا يكتب في التخزين (تدقيق 7a66f91، U02)، فتُعاد قراءتها مع تغيّر التفضيلات، ومع أحداث
  // الأذونات، وعند ظهور الصفحة؛ وآخر قراءة بدأت هي الحاكمة.
  let consentGen = 0;
  function readConsent() {
    if (!thumbsConsent.needed) return Promise.resolve(thumbsGranted);
    const gen = ++consentGen;
    return thumbsConsent.check().then((g) => g === true, () => false).then((g) => {
      if (gen === consentGen && g !== thumbsGranted) {
        thumbsGranted = g;
        syncAll();
      }
      return thumbsGranted;
    });
  }
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

  /**
   * تغيير القاموس بمصطلح واحد على أحدث تفضيلات في الكاتب (U13)؛ يعيد نتيجة العملية، أو null عند الفشل كما في savePrefs.
   * @param {() => Promise<{ prefs: object }>} op @param {{ flash: Function }} mark
   */
  async function changeTerms(op, mark) {
    let r;
    try {
      r = await op();
    } catch {
      mark.flash(messageFor('PG_SAVE_FAILED'), 'danger');
      prefs = await store.getPrefs().catch(() => prefs);
      syncAll(true);
      return null;
    }
    prefs = r.prefs;
    syncAll();
    return r;
  }
  const addTerm = (term, mark) => changeTerms(() => store.addTerm(term), mark);
  const removeTerm = (source, mark) => changeTerms(() => store.removeTerm(source), mark);

  /**
   * تعديل قوائم الأزواج على أحدث قيمة في الكاتب (الفكرة ٨)، كـchangeTerms: نتيجة العملية، أو null عند الفشل بعلامة «تعذّر الحفظ».
   * @param {() => Promise<{ glossaries: object }>} op @param {{ flash: Function }} mark
   */
  async function changeLists(op, mark) {
    let r;
    try {
      r = await op();
    } catch {
      mark.flash(messageFor('PG_SAVE_FAILED'), 'danger');
      glossaries = await readGlossaries();
      syncAll(true);
      return null;
    }
    glossaries = r.glossaries;
    syncAll();
    return r;
  }
  const glossaryLists = {
    add: (pair, mark) => changeLists(() => store.addGlossaryList(pair), mark),
    remove: (pair, mark) => changeLists(() => store.removeGlossaryList(pair), mark),
    addTerm: (pair, term, mark) => changeLists(() => store.addListTerm(pair, term), mark),
    removeTerm: (pair, source, mark) => changeLists(() => store.removeListTerm(pair, source), mark),
  };

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
    const shown = () => (key === 'thumbnails' ? thumbnailsShown(prefs.ui.thumbnails, thumbsGranted) : prefs.ui[key]);
    input.addEventListener('change', () => {
      // تفعيل الصور في Firefox: طلب الموافقة أول ما في الضغطة (قبل أي انتظار)، والممنوحة تعود بلا سؤال؛ والرفض يبقيها مطفأة.
      if (key === 'thumbnails' && thumbsConsent.needed && input.checked) {
        thumbsConsent.request().then((granted) => {
          consentGen++;
          thumbsGranted = granted === true;
          if (!thumbsGranted) {
            input.checked = false;
            mark.flash(THUMBNAILS_SWITCH.refused, 'info');
            return;
          }
          savePrefs({ ui: { thumbnails: true } }, mark);
        });
        return;
      }
      let patch = { [key]: input.checked };
      if (key === 'panelEntry' && !input.checked) patch = { panelEntry: false, panelOpen: false };
      savePrefs({ ui: patch }, mark);
    });
    sync.push(() => { input.checked = shown(); });
    input.checked = shown();
    // الاسم تسمية الصف ثم نص الحال («زر النص المتزامن، يظهر في صفحات الفيديو»)، لا نص الحال وحده (تدقيق 7a66f91، U87).
    input.setAttribute('aria-labelledby', `st-ui-${key}-row st-ui-${key}-text`);
    return el('label', {
      className: 'st-switch', attrs: { for: `st-ui-${key}` },
      children: [input, el('span', { className: 'st-switch__track', attrs: { 'aria-hidden': 'true' }, doc }), el('span', { className: 'st-switch__label', text, attrs: { id: `st-ui-${key}-text` }, doc })],
      doc,
    });
  }
  /** صف مفتاح: تسميته بمعرّف يشير إليه اسم المفتاح. */
  const named = (r, key) => {
    r.querySelector('.tj-label').setAttribute('id', `st-ui-${key}-row`);
    return r;
  };

  /** قسم بعنوان ووصف و«استعادة الافتراضي» إن كان له افتراضيات. */
  function section(def, ...children) {
    const reset = sectionReset(settings, def.id, prefs);
    let resetBtn = null;
    let resetMark = null;
    // «اللغات» (AA3): افتراضياتها في تفضيلات اللغات لا في الإعدادات، فاستعادتها من القسم نفسه.
    const custom = customResets[def.id] ?? null;
    if (custom) {
      resetMark = marks();
      resetBtn = button({ label: resetLabel(), variant: 'ghost', size: 'sm', icon: 'restore', className: 'st-section__reset', doc, onClick: () => (custom.isDefault() ? undefined : custom.run(resetMark)) });
      resetBtn.setAttribute('aria-label', t('settings.reset.aria', { label: resetLabel(), title: def.title }));
      sync.push(() => {
        resetBtn.setAttribute('aria-disabled', custom.isDefault() ? 'true' : 'false');
        resetBtn.title = custom.isDefault() ? custom.defaultNote : '';
      });
    } else if (reset) {
      resetMark = marks();
      resetBtn = button({ label: resetLabel(), variant: 'ghost', size: 'sm', icon: 'restore', className: 'st-section__reset', doc, onClick: async () => {
        const r = sectionReset(settings, def.id, prefs);
        if (!r || r.isDefault) return;
        if (Object.keys(r.patch).length) await save(r.patch, resetMark);
        if (Object.keys(r.prefsPatch).length) await savePrefs(r.prefsPatch, resetMark);
      } });
      // اسم يسمّي القسم: في «التصدير» زرّان كانا باسم واحد (U58).
      resetBtn.setAttribute('aria-label', t('settings.reset.aria', { label: resetLabel(), title: def.title }));
      sync.push(() => {
        const r = sectionReset(settings, def.id, prefs);
        resetBtn.setAttribute('aria-disabled', r.isDefault ? 'true' : 'false');
        resetBtn.title = r.disabledReason ?? '';
      });
    }
    const head = el('div', {
      className: 'st-section__head',
      children: [
        el('div', { className: 'st-section__titles', children: [el('h2', { className: 'tj-h3', text: def.title, attrs: { id: `st-${def.id}-title` }, doc }), def.desc ? el('p', { className: 'tj-caption', text: def.desc, doc }) : null], doc }),
        resetBtn ? el('div', { className: 'st-section__actions', children: [resetBtn, resetMark.root], doc }) : null,
      ],
      doc,
    });
    return el('section', { className: 'st-section', attrs: { id: def.id, 'aria-labelledby': `st-${def.id}-title`, 'data-section': def.id }, children: [head, ...children], doc });
  }
  const byId = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
  /** استعادة افتراضي لأقسام بلا مفاتيح إعدادات (اللغات). @type {Record<string, { isDefault: () => boolean, run: (mark: object) => unknown }>} */
  const customResets = {};

  // ---- العرض ----
  const displayMark = marks();
  const displaySeg = segmented({
    legend: t('settings.display.mode'), value: settings.displayModeDefault, doc,
    options: [{ value: 'ar', label: t('settings.display.modeAr') }, { value: 'dual', label: t('settings.display.modeDual') }],
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
      el('legend', { className: 'tj-sr-only', text: t('settings.display.font'), doc }),
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
          children: [input, name, i === 0 ? el('span', { className: 'st-font__tag', text: t('settings.display.fontDefault'), doc }) : null],
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
    attrs: { id: scaleId, type: 'range', min: String(SUBTITLE_SCALE.min), max: String(SUBTITLE_SCALE.max), step: String(SUBTITLE_SCALE.step), 'aria-label': t('settings.display.fontSizeAria'), 'aria-valuetext': '100%' },
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
    legend: t('settings.display.background'), value: settings.appearance.background, doc,
    options: SUBTITLE_BACKGROUNDS.map((v) => ({ value: v, label: bgLabel(v) })),
    onChange: (v) => save({ appearance: { background: v } }, bgMark),
  });
  sync.push(() => bgSeg.set(settings.appearance.background));
  const posMark = marks();
  const posSeg = segmented({
    legend: t('settings.display.position'), value: settings.appearance.position, doc,
    options: SUBTITLE_POSITIONS.map((v) => ({ value: v, label: positionLabel(v) })),
    onChange: (v) => save({ appearance: { position: v } }, posMark),
  });
  sync.push(() => posSeg.set(settings.appearance.position));

  // المعاينة الحية: صندوق فيديو داكن بسطرين، يتحدث فور تغيير أي من المظهر.
  const preview = (() => {
    const stage = el('div', { className: 'st-preview__stage', children: previewLines().map((line) => el('p', { className: 'st-preview__line', text: line, attrs: { lang: getLocale(), dir: getDir() }, doc })), doc });
    const screen = el('div', { className: 'st-preview__screen', children: [stage], doc });
    screen.style.width = `${PREVIEW_BOX.width}px`;
    screen.style.aspectRatio = `${PREVIEW_BOX.width} / ${PREVIEW_BOX.height}`;
    const box = el('div', { className: 'st-preview', attrs: { role: 'img', 'aria-label': t('settings.display.previewAria') }, children: [screen], doc });
    return {
      root: box, stage,
      update(a) {
        const s = previewStyle(a);
        stage.style.fontFamily = s.fontFamily;
        stage.style.fontSize = s.fontSize;
        stage.style.setProperty('--st-cap', s.lineCap);
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

  // مفاتيح الواجهة (prefs.ui) على هذا الجهاز: زر لوحة النص المتزامن في شريط المشغّل، وصور الفيديو في المحفوظات.
  const entryMark = marks();
  const entrySwitch = uiSwitch('panelEntry', ENTRY_SWITCH.text, entryMark);
  const thumbsMark = marks();
  const thumbsSwitch = uiSwitch('thumbnails', THUMBNAILS_SWITCH.text, thumbsMark);
  // اختصارات لوحة المفاتيح (الفكرة ١٠، ح-55): في «العرض» لأن أوامرها الخمسة تعمل على الترجمة فوق الفيديو (الوضع والتوقيت والعلامة
  // والإعادة)، بجوار «زر النص المتزامن» من أدوات صفحة الفيديو. لا قيمة تُحفظ: الربط في صفحة اختصارات المتصفح.
  const shortcuts = shortcutsControl({ doc, target: env.shortcuts?.target ?? 'chromium', tabs: env.shortcuts?.tabs, commands: env.shortcuts?.commands });
  const shortcutsRow = rowWithHint(t('settings.shortcuts.label'), t('settings.shortcuts.hint'), null, shortcuts.root);
  shortcutsRow.setAttribute('data-row', 'shortcuts');

  // لغة الواجهة (أعلى «العرض»): مفتاح مستقل uiLocale عبر المخزن (setUiLocale) لا في settings ولا prefs ولا langPrefs ولا النسخة الاحتياطية،
  // ولا يمسه «استعادة الافتراضي». التغيير يسمعه startPage (watchLocale) فتعيد الصفحة تحميل نفسها، فلا إعادة رسم هنا. الاسمان بصيغتيهما
  // في اللغتين: اسم اللغة لا يُترجم، ويُعزل اتجاه كل منهما.
  const uiLocaleMark = marks();
  // اسم كل لغة بلغتها نفسها: «العربية» و«English» في الواجهتين.
  const UI_LOCALE_OPTIONS = Object.freeze([{ value: 'ar', label: LOCALE_NAMES.ar, dir: 'rtl' }, { value: 'en', label: LOCALE_NAMES.en, dir: 'ltr' }]);
  const uiLocaleSeg = segmented({
    legend: t('settings.uiLocale.title'), value: getLocale(), doc, className: 'st-ui-locale',
    options: UI_LOCALE_OPTIONS.map(({ value, label }) => ({ value, label })),
    onChange: async (v) => {
      try {
        await store.setUiLocale(v);
      } catch {
        uiLocaleMark.flash(messageFor('PG_SAVE_FAILED'), 'danger');
        uiLocaleSeg.set(uiLocaleSaved);
      }
    },
  });
  let uiLocaleSaved = getLocale();
  uiLocaleSeg.root.setAttribute('data-tj-keep', 'ui-locale');
  uiLocaleSeg.root.querySelectorAll('.tj-seg__label').forEach((label, i) => {
    const o = UI_LOCALE_OPTIONS[i];
    label.replaceChildren(el('bdi', { text: o.label, dir: o.dir, attrs: { lang: o.value }, doc }));
  });
  const uiLocaleRow = row(t('settings.uiLocale.title'), uiLocaleMark, uiLocaleSeg.root);
  /** القيمة المحفوظة في المخزن لا لغة الصفحة الآن: تُقرأ عند التحميل، وتتبع تغيّرها من سياق آخر. */
  async function readUiLocale() {
    try {
      const saved = await store.getUiLocale();
      if (isLocale(saved?.locale)) {
        uiLocaleSaved = saved.locale;
        uiLocaleSeg.set(saved.locale);
      }
    } catch {
      // تبقى لغة الصفحة الحالية.
    }
  }

  const display = section(byId.display,
    uiLocaleRow,
    row(t('settings.display.mode'), displayMark, displaySeg.root),
    row(t('settings.display.font'), fontMark, fontList, fontMeta, note(subtitleNote())),
    row(t('settings.display.fontSize'), scaleMark, sliderBox, note(scaleNote())),
    row(t('settings.display.background'), bgMark, bgSeg.root),
    row(t('settings.display.position'), posMark, posSeg.root),
    row(t('settings.display.preview'), null, preview.root),
    named(rowWithHint(ENTRY_SWITCH.label, ENTRY_SWITCH.hint, entryMark, entrySwitch, note(ENTRY_SWITCH.note)), 'panelEntry'),
    shortcutsRow,
    named(row(THUMBNAILS_SWITCH.label, thumbsMark, thumbsSwitch, note(thumbsNote(thumbsConsent.needed))), 'thumbnails'));

  // ---- اللغات (AA3، لوحة 15) ----
  const langs = createLanguages({ store, doc, marks, row, rowWithHint, note, confirm });
  customResets.langs = { isDefault: langs.reset.isDefault, defaultNote: langs.reset.defaultNote, run: async (mark) => { await langs.reset.run(mark); syncAll(); } };
  const langsSection = section(byId.langs, ...langs.rows);
  let unknownCounted = false;


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
    row(t('settings.export.where'), locationMark, location.root));

  const exportMark = marks();
  const modeSeg = segmented({
    legend: t('settings.export.mode'), value: settings.export.modeDefault, doc,
    options: [{ value: 'normal', label: t('settings.export.modeNormal') }, { value: 'long', label: t('settings.export.modeLong') }],
    onChange: (v) => save({ export: { modeDefault: v } }, exportMark),
  });
  sync.push(() => modeSeg.set(settings.export.modeDefault));
  const splitMark = marks();
  const splitField = numberField({
    label: t('settings.export.splitLabel'), unit: t('settings.export.splitUnit'), value: String(settings.export.splitThreshold), parse: parseSplit, mark: splitMark.root, doc,
    hint: t('settings.export.splitHint', { n: DEFAULT_SETTINGS.export.splitThreshold }),
    commit: (n) => save({ export: { splitThreshold: n } }, splitMark),
  });
  sync.push((force) => splitField.set(String(settings.export.splitThreshold), { force }));
  // يعمل عند تنزيل الأصل لا عند رفع الترجمة، فمكانه هنا قرب «شكل المقاطع الافتراضي» (ق-7).
  const compMark = marks();
  const compField = numberField({
    label: t('settings.export.completeLabel'), unit: t('settings.export.completeUnit'), value: completenessText(settings.thresholds.completeness), parse: parseCompleteness, mark: compMark.root, doc,
    hint: t('settings.export.completeHint', { n: completenessText(DEFAULT_SETTINGS.thresholds.completeness) }),
    commit: (v) => save({ thresholds: { completeness: v } }, compMark),
  });
  sync.push((force) => compField.set(completenessText(settings.thresholds.completeness), { force }));
  exporting.append(
    row(t('settings.export.mode'), exportMark, modeSeg.root, el('div', { className: 'st-notes', children: [note(MODE_NOTES.normal), note(MODE_NOTES.long)], doc })),
    el('div', { className: 'st-fields', children: [compField.root], doc }),
    row(t('settings.export.splitRow'), null, splitField.root),
  );

  // ---- المقارنة ----
  const driftMark = marks();
  const driftField = numberField({
    label: t('settings.compare.driftLabel'), unit: t('settings.compare.driftUnit'), value: String(settings.thresholds.driftMs), parse: parseDrift, mark: driftMark.root, doc,
    hint: t('settings.compare.driftHint', { n: DEFAULT_SETTINGS.thresholds.driftMs }),
    commit: (n) => save({ thresholds: { driftMs: n } }, driftMark),
  });
  sync.push((force) => driftField.set(String(settings.thresholds.driftMs), { force }));
  // حد سرعة القراءة (R55): فارغ = الافتراضي المعايَر، بعلامة «الافتراضي» ظاهرة.
  const readingMark = marks();
  const readingField = numberField({
    label: t('settings.compare.readingLabel'), unit: t('settings.compare.readingUnit'), value: readingText(prefs.review.maxCps), parse: parseReadingSpeed, mark: readingMark.root, doc,
    hint: t('settings.compare.readingHint', { cps: READING_DEFAULT_CPS }),
    commit: (v) => savePrefs({ review: { maxCps: v } }, readingMark),
  });
  readingField.input.setAttribute('placeholder', String(READING_DEFAULT_CPS));
  const readingDefault = statusPill({ tone: 'neutral', plain: true, text: t('settings.compare.readingDefault', { cps: READING_DEFAULT_CPS }), doc });
  sync.push((force) => {
    readingField.set(readingText(prefs.review.maxCps), { force });
    readingDefault.hidden = prefs.review.maxCps !== null;
  });
  const comparison = section(byId.compare,
    el('div', { className: 'st-fields', children: [driftField.root], doc }),
    el('div', { className: 'st-fields st-fields--review', children: [readingField.root, readingDefault], doc }));

  // ---- المصطلحات ----
  const glossaryAttachMark = marks();
  const glossaryListMark = marks();
  const glossary = glossaryControl({
    doc, getPrefs: () => prefs, savePrefs, addTerm, removeTerm, attachMark: glossaryAttachMark, listMark: glossaryListMark,
    getGlossaries: () => glossaries, lists: typeof store.addGlossaryList === 'function' ? glossaryLists : null, confirm,
  });
  sync.push(() => glossary.sync());
  const glossarySection = section(byId.glossary,
    row(t('settings.glossary.attachRow'), glossaryAttachMark, glossary.attachRow, note(t('settings.glossary.attachNote'))),
    row(t('settings.glossary.listRow'), glossaryListMark, glossary.head, glossary.list));

  // ---- التخزين ----
  const usageText = el('span', { className: 'tj-body-sm st-quota__text', doc });
  const meterFill = el('span', { className: 'tj-meter__fill', doc });
  const meter = el('span', { className: 'tj-meter', attrs: { role: 'meter', 'aria-label': t('settings.storage.used'), 'aria-valuemin': '0', 'aria-valuemax': '100' }, children: [meterFill], doc });
  const storageMark = marks();
  const capacityAlert = el('div', { doc });
  async function refreshCapacity() {
    try {
      const cap = await store.capacity();
      usageText.textContent = cap.quotaBytes ? t('settings.storage.usedOf', { used: formatBytes(cap.bytesInUse), quota: formatBytes(cap.quotaBytes) }) : t('settings.storage.noLimit', { used: formatBytes(cap.bytesInUse) });
      meter.hidden = !cap.quotaBytes;
      if (cap.quotaBytes) {
        const pct = Math.min(100, Math.round((cap.bytesInUse / cap.quotaBytes) * 100));
        meterFill.style.width = `${pct}%`;
        meter.setAttribute('aria-valuenow', String(pct));
        meter.className = `tj-meter tj-meter--${cap.level}`;
      }
      capacityAlert.replaceChildren(...(cap.code ? [alertBox({ tone: cap.level === 'full' ? 'danger' : 'warning', text: messageFor(cap.code), doc })] : []));
    } catch {
      // قياس المساحة وحده تعذّر (getBytesInUse غائبة أو رفض عابر، تدقيق 7a66f91 U03): المحفوظات نفسها سليمة.
      usageText.textContent = capacityUnavailable();
      meter.hidden = true;
      capacityAlert.replaceChildren();
    }
  }
  const clearBtn = button({ label: t('settings.storage.clearButton'), variant: 'danger', icon: 'trash', doc, onClick: () => { whileHeld(() => clearAll()); } });
  async function clearAll() {
    const typed = el('input', { className: 'tj-field__input', attrs: { id: 'st-confirm-word', type: 'text', autocomplete: 'off', placeholder: confirmWord() }, doc });
    const content = el('div', {
      className: 'st-confirm',
      children: [el('label', { className: 'tj-field__label', text: t('settings.storage.confirmLabel', { word: confirmWord() }), attrs: { for: 'st-confirm-word' }, doc }), typed],
      doc,
    });
    const pending = confirm({
      title: t('settings.storage.confirmTitle'),
      body: t('settings.storage.confirmBody'),
      confirmLabel: t('settings.storage.clearButton'), tone: 'danger', content, doc,
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
    let result;
    try {
      result = await store.clearAll();
    } catch (err) {
      storageMark.flash(toErrorInfo(err).message, 'danger');
      return;
    }
    // المسح نجح: يُقال ذلك، وما تعذّر بعده (التهيئة، وإبقاء إطفاء الصور) تنبيه منفصل لا «خطأ غير متوقع» (تدقيق 7a66f91، U56).
    storageMark.flash(messageFor('PG_CLEAR_DONE'), 'success');
    const warnings = [];
    if (result?.reinit === 'failed') warnings.push(messageFor('PG_CLEAR_REINIT_FAILED'));
    if (result?.thumbs === 'failed') warnings.push(messageFor('PG_CLEAR_THUMBS_FAILED'));
    clearAlert.replaceChildren(...(warnings.length ? [alertBox({ tone: 'warning', title: messageFor('PG_CLEAR_DONE'), text: warnings.join('\n'), doc })] : []));
    [settings, prefs, glossaries] = await Promise.all([store.getSettings().catch(() => DEFAULT_SETTINGS), store.getPrefs().catch(() => DEFAULT_PREFS), readGlossaries()]);
    syncAll();
    await Promise.all([refreshCapacity(), refreshReminder(), refreshLibraryUsage(), location.refreshLast()]).catch(() => {});
  }
  const clearAlert = el('div', { className: 'st-clear-alert', doc });
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
      libraryText.textContent = translations ? t('settings.storage.libraryCounts', { translations, videos }) : t('settings.storage.libraryEmpty');
      libraryBytes.textContent = '';
      if (!list.length) return;
      // الأحجام معًا لا واحدًا بعد آخر (GM-009): رحلة لكل فيديو بالتوازي بدل أربع متتالية. وفشل قياسها لا يمحو الأعداد (U03).
      const sizes = await Promise.all(list.map((x) => store.bundleBytes(x.entry.videoId))).catch(() => null);
      if (mine !== usageSeq) return;
      if (!sizes) {
        libraryBytes.textContent = sizesUnavailable();
        return;
      }
      const alts = sizes.reduce((s, b) => s + b.alts, 0);
      const previous = sizes.reduce((s, b) => s + b.previous, 0);
      libraryBytes.textContent = t('settings.storage.libraryBytes', { alts: formatBytes(alts), previous: formatBytes(previous) });
    } catch (err) {
      if (mine === usageSeq) libraryText.textContent = toErrorInfo(err).message;
    }
  }
  const storage = section(byId.storage,
    row(t('settings.storage.used'), null, el('div', { className: 'st-quota', children: [usageText, meter], doc }), capacityAlert),
    row(t('settings.storage.libraryRow'), null, el('div', { className: 'st-library', children: [libraryText, libraryBytes], doc })),
    row(t('settings.storage.clearRow'), storageMark, el('div', { className: 'st-actions', children: [clearBtn], doc }), clearAlert, note(t('settings.storage.clearNote'))));
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
        readGlossaries().then((g) => { glossaries = g; }),
      ]);
      syncAll();
      await Promise.all([refreshCapacity(), refreshReminder(), refreshLibraryUsage()]);
    },
  });
  const dataSection = section(byId.data,
    row(t('settings.data.createRow'), null, data.createRow, note(t('settings.data.createNote'))),
    row(t('settings.data.restoreRow'), null, data.restoreRow, note(t('settings.data.restoreNote'))));

  // ---- التشخيص ----
  // «الوصول إلى يوتيوب» أول القسم (الفكرة ٣-أ، ح-41): إذن يوتيوب نفسه الذي مُنح عند التثبيت (core/consent/youtube-access.js)، «ممنوح»
  // بلا زر و«مسحوب» بزر «السماح» يعيد طلبه. لا يُكتب في التخزين، فيُقرأ عند الفتح ومع أحداث الأذونات وعند ظهور الصفحة، وآخر قراءة
  // بدأت هي الحاكمة. والمجهول (لا واجهة أو رفضت) لا يدّعي شيئًا فيُخفى السطر. والمنح لا يحقن سكربت المحتوى في تبويب مفتوح، فبعده
  // (بالزر أو من المتصفح) سطر «أعد تحميل صفحة يوتيوب المفتوحة…».
  const access = env.youtubeAccess ?? { check: () => Promise.resolve(null), request: () => Promise.resolve(false) };
  /** @type {boolean | null} */
  let accessState = null;
  let accessRegained = false;
  let accessGen = 0;
  const accessMark = marks();
  const accessHost = el('div', { className: 'st-access', doc });
  const accessNotes = el('div', { className: 'st-notes', attrs: { 'aria-live': 'polite' }, doc });
  const allowBtn = button({ label: t('settings.access.allow'), variant: 'primary', icon: 'shield', doc, onClick: () => {
    // الطلب أول ما في الضغطة قبل أي انتظار: المتصفح لا يطلب الإذن خارج فعل المستخدم.
    const pending = access.request();
    Promise.resolve(pending).then((granted) => granted === true, () => false).then((granted) => {
      if (!granted) accessMark.flash(t('settings.access.refused'), 'info');
      return readAccess();
    });
  } });
  allowBtn.setAttribute('aria-label', t('settings.access.allowAria'));
  allowBtn.setAttribute('data-action', 'youtube-access');
  const accessRow = row(t('settings.access.row'), accessMark, accessHost, accessNotes);
  accessRow.setAttribute('data-row', 'youtube-access');
  function paintAccess() {
    const hadFocus = doc.activeElement === allowBtn;
    accessRow.hidden = accessState === null;
    accessHost.replaceChildren(
      ...(accessState === null ? [] : [statusPill({ tone: accessState ? 'success' : 'warning', text: t(accessState ? 'settings.access.granted' : 'settings.access.revoked'), doc })]),
      ...(accessState === false ? [allowBtn] : []),
    );
    accessNotes.replaceChildren(...(accessState === false ? [note(t('settings.access.revokedNote'))] : accessState && accessRegained ? [note(t('settings.access.reload'))] : []));
    // الزر يختفي بالمنح: التركيز إلى عنوان القسم لا إلى أول الصفحة.
    if (hadFocus && accessState !== false) root.querySelector('#st-diagnostics-title')?.focus?.();
  }
  function readAccess() {
    const gen = ++accessGen;
    return Promise.resolve().then(() => access.check()).then((v) => (typeof v === 'boolean' ? v : null), () => null).then((v) => {
      if (gen !== accessGen) return accessState;
      if (accessState === false && v === true) accessRegained = true;
      if (v === false) accessRegained = false;
      accessState = v;
      paintAccess();
      return accessState;
    });
  }
  paintAccess();
  const diagMark = marks();
  const diagBtn = button({ label: t('settings.diag.copy'), variant: 'secondary', icon: 'copy', doc, onClick: async () => {
    try {
      // الحافظة لحظة النقرة بوعد التقرير لا بعد جمعه (تحقق Gemini، B1): مغادرة التركيز أثناء الجمع كانت تُفشل النسخ في Chromium.
      await env.clipboardWrite(env.diagnosticsText());
      diagMark.flash(messageFor('PG_DIAGNOSTICS_DONE'), 'success');
    } catch {
      diagMark.flash(messageFor('PG_DIAGNOSTICS_FAILED'), 'danger');
    }
  } });
  const panel = (tone, title, text) => el('div', { className: `st-panel st-panel--${tone}`, children: [el('strong', { className: 'st-panel__title', text: title, doc }), el('p', { className: 'tj-body-sm', text, doc })], doc });
  const diagnostics = section(byId.diagnostics,
    accessRow,
    row(t('settings.diag.row'), diagMark, el('div', { className: 'st-actions', children: [diagBtn], doc }),
      el('div', {
        className: 'st-panels',
        children: [
          panel('ok', t('settings.diag.includesTitle'), t('settings.diag.includes')),
          panel('no', t('settings.diag.excludesTitle'), t('settings.diag.excludes')),
        ],
        doc,
      })));

  // ---- حول ----
  // «الإبلاغ عن مشكلة» (جولة النشر T2.1): النسخ بحافظة الصفحة نفسها، والباقي من المصادر الحية ما لم تمرّرها البيئة.
  const report = reportPanel({ doc, env: { copy: env.clipboardWrite, ...env.report } });
  const about = aboutSection({ version, doc, report: report.root, section: (...kids) => section(byId.about, ...kids) });

  async function refreshReminder() {
    // لا مفتاح «أول تشغيل» في التخزين (عقد المفاتيح)؛ فالتذكير يظهر ما دامت المحفوظات فارغة.
    try {
      const empty = (await store.listIndex()).length === 0;
      reminderHost.replaceChildren(...(empty ? [alertBox({ tone: 'info', text: installReminder(), doc })] : []));
    } catch {
      reminderHost.replaceChildren();
    }
  }

  /** force: القيم المحفوظة تُفرض حتى على حقل مركَّز (بعد فشل حفظ). */
  function syncAll(force = false) {
    for (const fn of sync) fn(force);
  }

  // ---- التنقّل بين الأقسام ----
  const sections = { display, langs: langsSection, export: exporting, compare: comparison, glossary: glossarySection, storage, data: dataSection, diagnostics, about };
  // جزء عنوان لقسم محذوف (#timing) يفتح بديله، ويُكتب البديل في العنوان (ح3).
  const fromHash = nav.get();
  let active = sectionFor(fromHash) ?? DEFAULT_SECTION;
  const navLinks = SECTIONS.map((s) => el('a', {
    className: 'st-nav__link', attrs: { href: `#${s.id}`, 'data-section': s.id },
    children: [icon(s.icon, { doc }), el('span', { className: 'st-nav__name', text: s.title, doc })],
    on: { click: (e) => { e.preventDefault?.(); select(s.id, { focus: true }); } },
    doc,
  }));
  const sideNav = el('nav', { className: 'st-nav', attrs: { 'aria-label': t('settings.navLabel') }, children: navLinks, doc });

  /**
   * @param {string} id @param {{ focus?: boolean, remember?: boolean }} [o] remember: يُكتب القسم في جزء العنوان. لا يُكتب عند
   * الفتح الأول بلا جزء: كتابته المتزامنة أثناء التحليل تمرّر الصفحة إلى القسم فيختفي عنوانها تحت الرأس (تدقيق 7a66f91، U57).
   */
  function select(id, { focus = false, remember = true } = {}) {
    id = sectionFor(id) ?? DEFAULT_SECTION;
    // مغادرة قسم النسخ الاحتياطي بعد ظهور تقرير الاستعادة تعني أنه قُرئ: يصير تبديل لغة معلّق ممكنًا.
    if (active === 'data' && id !== 'data') data.releaseReport();
    active = id;
    for (const [key, sec] of Object.entries(sections)) sec.hidden = key !== id;
    for (const link of navLinks) {
      if (link.getAttribute('data-section') === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (remember) nav.set(id);
    if (focus) sections[id].querySelector('h2')?.focus?.();
    // عدّ الترجمات بلا لغة يقرأ المحفوظات كلها: عند فتح القسم أول مرة، لا مع كل صفحة.
    if (id === 'langs' && !unknownCounted) {
      unknownCounted = true;
      langs.countUnknown().catch(() => {});
    }
  }
  const offNav = nav.onChange(() => {
    const raw = nav.get();
    const id = sectionFor(raw);
    if (id && (id !== active || raw !== id)) select(id);
  });

  root.append(
    sideNav,
    el('div', {
      className: 'st-content',
      children: [
        el('header', { className: 'st-head', children: [el('h1', { className: 'tj-display', text: t('common.nav.settings'), doc }), el('p', { className: 'tj-caption', text: saveHint(), doc })], doc }),
        reminderHost, alertHost, display, langsSection, exporting, comparison, glossarySection, storage, dataSection, diagnostics, about,
      ],
      doc,
    }),
  );
  for (const sec of Object.values(sections)) sec.querySelector('h2').tabIndex = -1;
  syncAll();
  // يُكتب العنوان عند الفتح لبديل قسم محذوف وحده (#timing ⇒ #display)؛ وجزء غير معروف يبقى كما كان (U57، وط1).
  select(active, { remember: typeof fromHash === 'string' && Object.hasOwn(SECTION_ALIASES, fromHash) });
  // القيم الظاهرة قبل القراءة افتراضية: الصفحة «مشغولة» حتى تُقرأ المحفوظة (تدقيق Fable، UX-23)، وبفشل القراءة لا تبقى الأدوات
  // فعّالة فوق قيم افتراضية قد لا تكون المحفوظة (inert)، ورسالة الخطأ وحدها تُقرأ.
  root.setAttribute('aria-busy', 'true');

  // المساحة والترجمات والتذكير تتبع المحفوظات حين تتغير من تبويب آخر (حفظ، أو رفع، أو حذف)، بعد سكون قصير لا مع كل كتابة
  // (تدقيق 5fedcb9، GM-027.1).
  let usageTimer = null;
  const later = doc.defaultView?.setTimeout?.bind(doc.defaultView) ?? setTimeout;
  const unsubscribe = store.onChange((change) => {
    if (change.settings || change.cleared) {
      store.getSettings().then((s) => {
        settings = s;
        syncAll();
      }).catch(() => {});
    }
    if (change.prefs || change.cleared) {
      Promise.all([store.getPrefs(), readConsent()]).then(([p]) => { prefs = p; syncAll(); location.refreshLast(); }).catch(() => {});
    }
    if (change.glossaries || change.cleared) {
      readGlossaries().then((g) => { glossaries = g; syncAll(); });
    }
    if (change.langPrefs || change.cleared) {
      langs.apply(change.langPrefs?.newValue ?? null);
      syncAll();
    }
    if ((Object.keys(change.videos ?? {}).length || change.index || change.bundles?.length || change.cleared) && usageTimer === null) {
      usageTimer = later(() => {
        usageTimer = null;
        Promise.all([refreshCapacity(), refreshReminder(), refreshLibraryUsage(), unknownCounted ? langs.countUnknown() : null]).catch(() => {});
      }, 300);
    }
  });

  const onVisible = () => {
    if (doc.visibilityState === 'hidden') return;
    readConsent();
    readAccess();
  };
  doc.addEventListener?.('visibilitychange', onVisible);
  const win = doc.defaultView ?? null;
  win?.addEventListener?.('pageshow', onVisible);
  const unwatchConsent = thumbsConsent.needed && typeof thumbsConsent.watch === 'function'
    ? thumbsConsent.watch(({ revoked }) => {
      if (revoked) {
        consentGen++;
        if (thumbsGranted) {
          thumbsGranted = false;
          syncAll();
        }
      }
      readConsent();
    })
    : () => {};
  const unwatchAccess = typeof access.watch === 'function' ? access.watch(() => { readAccess(); }) : () => {};

  return {
    root, preview, slider, select, data, location, glossary, langs,
    get active() { return active; },
    get settings() { return settings; },
    get prefs() { return prefs; },
    async load() {
      try {
        [settings, prefs] = await Promise.all([store.getSettings(), store.getPrefs(), readConsent(), langs.load(), readUiLocale(), readAccess(), readGlossaries().then((g) => { glossaries = g; })]);
        syncAll();
        for (const sec of Object.values(sections)) sec.removeAttribute('inert');
      } catch (err) {
        const info = toErrorInfo(err);
        alertHost.replaceChildren(alertBox({ tone: 'danger', title: t('settings.loadFailed'), text: `${info.message} (${info.code})`, doc }));
        for (const sec of Object.values(sections)) sec.setAttribute('inert', '');
      } finally {
        root.removeAttribute('aria-busy');
      }
      await Promise.all([refreshCapacity(), refreshReminder(), refreshLibraryUsage(), location.refreshLast()]);
    },
    dispose() {
      unsubscribe();
      offNav();
      unwatchConsent();
      unwatchAccess();
      doc.removeEventListener?.('visibilitychange', onVisible);
      win?.removeEventListener?.('pageshow', onVisible);
    },
  };
}
