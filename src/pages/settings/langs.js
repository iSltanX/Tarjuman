// قسم «اللغات» في الإعدادات (AA3، لوحة 15): الزوج الافتراضي لتعليمات الترجمة في نافذة الإضافة («من» تلقائي من مسار الفيديو أو لغة
// بعينها، و«إلى»)، و«تذكّر آخر زوج»، واللغات الأخيرة بمسحها، ولغة الواجهة عرضًا فقط؛ ثم تعيين لغة الترجمات المحفوظة بلا لغة
// («غير محددة»، ومنها كل ما حُفظ قبل 2.0.0) دفعة واحدة بتأكيد صريح. كل الكتابات عبر المخزن (setLangPrefs وupdateBundle)، ولا
// يمس التعيين نص أي ترجمة ولا توقيتها. textContent وsetAttribute فقط.
import { messageFor } from '../../core/errors/index.js';
import { describeLang, textFitsLang } from '../../core/lang/index.js';
import { withSlotLang } from '../../core/model/bundle.js';
import { AUTO_SOURCE, DEFAULT_LANG_PREFS, normalizeLangPrefs } from '../../core/model/lang-prefs.js';
import { button, el } from '../../ui/components.js';
import { COUNT_FORMS, formatCount } from '../../ui/format.js';
import { LANG_TEXT, langField, langPair } from '../../ui/lang-picker.js';

export const TRANSLATION_COUNT = Object.freeze({ one: 'ترجمة واحدة', two: 'ترجمتان', few: 'ترجمات', many: 'ترجمة', single: 'ترجمة' });

export const LANGS_TEXT = Object.freeze({
  pair: 'اللغتان الافتراضيتان',
  pairNote: 'تبدأ بهما تعليمات الترجمة في نافذة الإضافة لكل فيديو لم تختر له لغتين، وما تختاره لفيديو يُحفظ له وحده. و«تلقائي» يعني لغة ترجمة يوتيوب في الفيديو.',
  remember: 'تذكّر آخر لغة ترجمة',
  rememberText: 'آخر لغة ترجمة تختارها تصبح الافتراضية للفيديوهات التالية.',
  recent: 'اللغات المستخدمة مؤخرًا',
  recentNote: 'تظهر في مجموعة خاصة قرب أعلى قائمة اختيار اللغة.',
  recentEmpty: 'لا لغات بعد',
  clear: 'مسح',
  ui: 'لغة الواجهة',
  uiValue: 'العربية',
  uiNote: 'واجهة ترجمان وتعليمات الترجمة بالعربية دائمًا، أيًّا كانت لغتا الترجمة.',
  unknown: 'ترجمات بلا لغة محددة',
  unknownHint: 'ومنها ما حُفظ قبل الإصدار 2.0.0',
  unknownNone: 'كل ترجماتك المحفوظة محددة اللغة.',
  unknownCounting: 'جارٍ عدّ الترجمات…',
  unknownUnread: 'تعذّر التحقق من لغات الترجمات المحفوظة. أعد فتح القسم للمحاولة مجددًا.',
  unknownPartial: 'تعذّرت قراءة بعض الترجمات؛ الأعداد المعروضة تخص ما أمكن قراءته.',
  unknownLang: 'اللغة',
  apply: 'تعيين لغتها',
  applyNeedsLang: 'اختر اللغة أولًا.',
  unknownNote: 'تُضاف اللغة وحدها دون أن يتغير نص الترجمة أو توقيتها أو تاريخ تعديلها، وتُتخطى الترجمة التي لا توافق حروفها اللغة المختارة. ولتغيير لغة ترجمة واحدة استعمل قائمة «الترجمة» في المشغّل.',
});

/** خانات الحزمة الممتلئة بلا لغة محددة. @param {import('../../core/model/slots.js').Bundle} b @returns {(1 | 2 | 3)[]} */
export function undeterminedSlots(b) {
  return b.slots.filter((s) => {
    const t = s.n === b.active ? b.record.arabic : s.track;
    return !!t && (t.lang ?? null) === null;
  }).map((s) => s.n);
}

/** «3 ترجمات في فيديوهين» بلا لغة. @param {number} n @param {number} videos */
export const undeterminedLine = (n, videos) => `${formatCount(n, TRANSLATION_COUNT)} في ${videos === 1 ? 'فيديو واحد' : videos === 2 ? 'فيديوهين' : formatCount(videos, COUNT_FORMS.video)}`;

/**
 * @param {{
 *   store: ReturnType<typeof import('../../core/store/index.js').createStore>, doc: Document,
 *   marks: () => { root: HTMLElement, flash: (text: string, tone: string) => void },
 *   row: (label: string, mark: object | null, control: Node, ...extra: Node[]) => HTMLElement,
 *   rowWithHint: (label: string, hint: string, mark: object | null, control: Node, ...extra: Node[]) => HTMLElement,
 *   note: (text: string) => HTMLElement,
 *   confirm: (o: object) => Promise<boolean>,
 * }} o
 */
export function createLanguages({ store, doc, marks, row, rowWithHint, note, confirm }) {
  let langPrefs = normalizeLangPrefs(DEFAULT_LANG_PREFS);

  /** يكتب تعديلًا جزئيًا بعلامة «حُفظ»؛ والفشل يعيد الواجهة إلى المحفوظ. */
  async function save(patch, mark) {
    try {
      langPrefs = await store.setLangPrefs(patch);
      mark.flash(messageFor('PG_SAVED'), 'success');
    } catch {
      mark.flash(messageFor('PG_SAVE_FAILED'), 'danger');
      langPrefs = await store.getLangPrefs().catch(() => langPrefs);
    }
    sync();
  }

  // ---- الزوج الافتراضي ----
  const pairMark = marks();
  const pair = langPair({
    from: langPrefs.pair.from, to: langPrefs.pair.to, autoFrom: LANG_TEXT.auto, doc,
    recent: () => langPrefs.recent,
    onChange: (next) => save({ pair: { from: next.from ?? AUTO_SOURCE, to: next.to } }, pairMark),
  });

  // ---- تذكّر آخر زوج ----
  const rememberMark = marks();
  const rememberInput = el('input', { className: 'st-switch__input', attrs: { id: 'st-lang-remember', type: 'checkbox', role: 'switch', 'aria-labelledby': 'st-lang-remember-row st-lang-remember-text' }, doc });
  rememberInput.addEventListener('change', () => save({ remember: rememberInput.checked }, rememberMark));
  const rememberSwitch = el('label', {
    className: 'st-switch', attrs: { for: 'st-lang-remember' },
    children: [rememberInput, el('span', { className: 'st-switch__track', attrs: { 'aria-hidden': 'true' }, doc }), el('span', { className: 'st-switch__label', text: LANGS_TEXT.rememberText, attrs: { id: 'st-lang-remember-text' }, doc })],
    doc,
  });

  // ---- اللغات الأخيرة ----
  const recentMark = marks();
  const chips = el('div', { className: 'st-lang-recent', attrs: { role: 'list', 'aria-label': LANGS_TEXT.recent }, doc });
  const clearBtn = button({ label: LANGS_TEXT.clear, variant: 'ghost', size: 'sm', doc, onClick: () => save({ recent: [] }, recentMark) });
  clearBtn.setAttribute('aria-label', `${LANGS_TEXT.clear}: ${LANGS_TEXT.recent}`);
  function paintRecent() {
    const nodes = langPrefs.recent.map((code) => {
      const d = describeLang(code);
      const native = d?.native ?? d?.arabic ?? code;
      // الاسم بلغته واتجاهها، والاسم العربي في التلميح واسم الوصول.
      return el('span', {
        className: 'tj-pill tj-pill--plain st-lang-chip', attrs: { role: 'listitem', title: `${d?.arabic ?? code} (${code})`, 'aria-label': `${d?.arabic ?? code}، ${native}` },
        children: [el('bdi', { text: native, dir: d?.dir === 'rtl' ? 'rtl' : 'ltr', doc })],
        doc,
      });
    });
    chips.replaceChildren(...(nodes.length ? nodes : [el('span', { className: 'tj-caption', text: LANGS_TEXT.recentEmpty, doc })]));
    if (langPrefs.recent.length) clearBtn.removeAttribute('aria-disabled');
    else clearBtn.setAttribute('aria-disabled', 'true');
  }

  // ---- لغة الواجهة (عرض فقط) ----
  const uiValue = el('span', { className: 'st-lang-ui', text: LANGS_TEXT.uiValue, doc });

  // ---- الترجمات بلا لغة ----
  const unknownMark = marks();
  const unknownLine = el('p', { className: 'st-lang-unknown__line', attrs: { 'aria-live': 'polite' }, text: LANGS_TEXT.unknownCounting, doc });
  let chosen = null;
  let found = { total: 0, videos: [] };
  let busy = false;
  const applyBtn = button({ label: LANGS_TEXT.apply, size: 'sm', doc, onClick: () => applyAll() });
  const target = langField({ label: LANGS_TEXT.unknownLang, value: null, recent: () => langPrefs.recent, doc, onChange: (c) => { chosen = c; paintUnknown(); } });
  const unknownControls = el('div', { className: 'st-lang-unknown', children: [target.root, applyBtn], doc });

  function paintUnknown() {
    const can = !busy && found.total > 0 && !!chosen;
    if (can) applyBtn.removeAttribute('aria-disabled');
    else applyBtn.setAttribute('aria-disabled', 'true');
    applyBtn.title = !chosen && found.total ? LANGS_TEXT.applyNeedsLang : '';
    unknownControls.hidden = found.total === 0;
    if (busy) applyBtn.setAttribute('aria-busy', 'true');
    else applyBtn.removeAttribute('aria-busy');
  }

  /** يعدّ الترجمات بلا لغة في المحفوظات كلها (قراءة فقط). */
  async function countUnknown() {
    unknownLine.textContent = LANGS_TEXT.unknownCounting;
    const videos = [];
    let total = 0;
    let entries = [];
    let indexFailed = false;
    let unread = 0;
    try {
      entries = await store.listIndex();
    } catch {
      entries = [];
      indexFailed = true;
    }
    for (const e of entries) {
      let b = null;
      try {
        b = await store.getBundle(e.videoId);
      } catch {
        b = null;
        unread++;
      }
      const slots = b ? undeterminedSlots(b) : [];
      if (slots.length) {
        videos.push({ videoId: e.videoId, slots });
        total += slots.length;
      }
    }
    found = { total, videos };
    // فشل القراءة لا يُقال عنه «كل ترجماتك محددة اللغة»: كلها تعذّرت فلا عدد يُعرض، وبعضها فالعدد لما أمكن قراءته.
    const allFailed = indexFailed || (entries.length > 0 && unread === entries.length);
    const counted = total ? undeterminedLine(total, videos.length) : '';
    unknownLine.textContent = allFailed ? LANGS_TEXT.unknownUnread
      : unread ? [counted, LANGS_TEXT.unknownPartial].filter(Boolean).join(' · ')
        : counted || LANGS_TEXT.unknownNone;
    paintUnknown();
    return found;
  }

  async function applyAll() {
    if (busy || !chosen || !found.total) return;
    const name = describeLang(chosen)?.arabic ?? chosen;
    const ok = await confirm({
      title: `تعيين ${name} لـ${formatCount(found.total, TRANSLATION_COUNT)}؟`,
      body: LANGS_TEXT.unknownNote, confirmLabel: LANGS_TEXT.apply, doc,
    });
    if (!ok) return;
    busy = true;
    paintUnknown();
    let failed = 0;
    let skipped = 0;
    for (const v of found.videos) {
      // العدّ داخل الكتابة نفسها: قد تُعاد عند تعارض، فيُحسب لآخر محاولة وحدها.
      let skippedHere = 0;
      try {
        // يُعاد الفحص داخل الكتابة: ترجمة حُدّدت لغتها أو استُبدلت من سياق آخر منذ العدّ لا تُكتب فوقها. وترجمة لا يوافق نصها نص كتابة
        // اللغة المختارة تُتخطى (textFitsLang كاقتراح لغة الرفع)، فلا تُوسم ترجمة فرنسية بالعربية. ولا يتغير تاريخ التعديل (touch: false).
        await store.updateBundle(v.videoId, (b) => {
          skippedHere = 0;
          if (!b) return undefined;
          const now = new Date().toISOString();
          let next = b;
          for (const n of undeterminedSlots(b)) {
            const t = n === b.active ? b.record.arabic : b.slots[n - 1].track;
            if (!textFitsLang(t.current ?? t.original, chosen)) {
              skippedHere++;
              continue;
            }
            next = withSlotLang(next, n, chosen, now);
          }
          return next === b ? undefined : next;
        }, { touch: false });
        skipped += skippedHere;
      } catch {
        failed++;
      }
    }
    busy = false;
    const outcome = failed ? messageFor('PG_LANG_ASSIGN_PARTIAL', { n: String(failed) }) : skipped ? messageFor('PG_LANG_ASSIGN_SKIPPED', { n: formatCount(skipped, TRANSLATION_COUNT) }) : messageFor('PG_SAVED');
    unknownMark.flash(outcome, failed ? 'danger' : skipped ? 'info' : 'success');
    await countUnknown();
  }

  function sync() {
    pair.set({ from: langPrefs.pair.from, to: langPrefs.pair.to });
    rememberInput.checked = langPrefs.remember;
    paintRecent();
    paintUnknown();
  }
  sync();

  const rows = [
    row(LANGS_TEXT.pair, pairMark, pair.root, note(LANGS_TEXT.pairNote)),
    row(LANGS_TEXT.remember, rememberMark, rememberSwitch),
    row(LANGS_TEXT.recent, recentMark, el('div', { className: 'st-lang-inline', children: [chips, clearBtn], doc }), note(LANGS_TEXT.recentNote)),
    row(LANGS_TEXT.ui, null, uiValue, note(LANGS_TEXT.uiNote)),
    rowWithHint(LANGS_TEXT.unknown, LANGS_TEXT.unknownHint, unknownMark, unknownLine, unknownControls, note(LANGS_TEXT.unknownNote)),
  ];
  rows[1].querySelector('.tj-label').setAttribute('id', 'st-lang-remember-row');

  return {
    rows,
    get langPrefs() { return langPrefs; },
    /** استعادة الافتراضي: الزوج والتذكّر، وتبقى الأخيرة وأزواج الفيديوهات. */
    reset: {
      defaultNote: 'اللغتان وخيار التذكّر على قيمها الافتراضية بالفعل.',
      isDefault: () => langPrefs.pair.from === DEFAULT_LANG_PREFS.pair.from && langPrefs.pair.to === DEFAULT_LANG_PREFS.pair.to && langPrefs.remember === DEFAULT_LANG_PREFS.remember,
      run: (mark) => save({ pair: { ...DEFAULT_LANG_PREFS.pair }, remember: DEFAULT_LANG_PREFS.remember }, mark),
    },
    async load() {
      langPrefs = await store.getLangPrefs();
      sync();
    },
    /** من سياق آخر (النافذة أو تبويب آخر). @param {unknown} value */
    apply(value) {
      langPrefs = normalizeLangPrefs(value ?? null);
      sync();
    },
    countUnknown,
    sync,
  };
}
