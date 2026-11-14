// مسودة المحرّر (الفكرة ٩، ح-48؛ عقد storage §١٦): ما لم يُحفظ من تعديلات الخانة يُكتب تلقائيًا في مفتاح المسودة بعد سكون قصير،
// وبحد أقصى أثناء الكتابة المتصلة، وفورًا عند إخفاء التبويب ومغادرة الصفحة؛ ويُحذف حين لا يبقى ما لم يُحفظ (بعد الحفظ أو التجاهل).
// والاستعادة بضغطة صريحة من لافتة ثابتة لا بصمت (المواصفة §٤). هنا الجدولة واللافتة؛ والقرار عند الفتح في model/draft.js، والكتابة
// عبر الكاتب الواحد. الكتابة أفضل جهد: تعذّرها لا يقطع التحرير ولا يُظهر رسالة كل ثانيتين، والحفظ الصريح يبقى طريق الحفظ.
import { draftCuesHash, draftOf } from '../../core/model/draft.js';
import { t } from '../../i18n/index.js';
import { alertBox, button, el } from '../../ui/components.js';
import { absoluteTime } from '../library/model.js';

/** سكون بعد آخر تغيير قبل كتابة المسودة. */
export const DRAFT_IDLE_MS = 2000;
/** أقصى انتظار أثناء الكتابة المتصلة: لا يمضي أطول من هذا بلا مسودة. */
export const DRAFT_MAX_MS = 15000;

/**
 * @typedef {{ session: ReturnType<typeof import('../../core/edit/index.js').createEditSession>, slot: 1 | 2 | 3,
 *   opened: { track: { fileName: string, importedAt: string, editedAt: string | null }, offsetMs: number } }} DraftTarget
 */

/**
 * جدولة كتابة المسودة لجلسة المحرّر الحاضرة. لا كتابة ما لم تتغير نسخة الجلسة منذ آخر كتابة (الجلسة الجديدة تبدأ من نسختها 0)،
 * والجلسة بلا تغييرات غير محفوظة تحذف مسودتها بدل كتابتها. وحين «تُمسك» (لافتة مسودة سابقة تنتظر قرار المستخدم) لا يُكتب شيء
 * لهذه الخانة، فلا تحل مسودة جديدة محل التي لم يُقرَّر فيها بعد.
 * @param {{ win: Window, store: object, videoId: string, now: () => number, current: () => DraftTarget | null }} o
 */
export function createDraftKeeper({ win, store, videoId, now, current }) {
  const supported = typeof store?.setDraft === 'function' && typeof store?.clearDraft === 'function';
  let idle = 0;
  let max = 0;
  let held = false;
  /** آخر جلسة كُتبت مسودتها ونسختها حينئذ. */
  let seen = { session: null, version: 0 };
  /**
   * بصمة مقاطع الأساس (تحقق 2.3.0 ص-٩): تُحسب أول حاجة لكل خانة مفتوحة، لا مع كل كتابة (5000 مقطع نحو 25 م.ث على الخيط الرئيسي).
   * وتُعاد حين يتغير الأساس: كائن الترجمة (الحفظ وتبديل الخانة والاستبدال والرجوع إلى المرفوعة تفتحها من حزمة جديدة)، أو مقاطعها،
   * أو تاريخ تعديلها.
   */
  let base = { track: null, cues: null, editedAt: undefined, hash: '' };
  const baseHash = (track) => {
    const cues = track.current ?? track.original;
    if (base.track !== track || base.cues !== cues || base.editedAt !== track.editedAt) base = { track, cues, editedAt: track.editedAt, hash: draftCuesHash(cues) };
    return base.hash;
  };
  let chain = Promise.resolve();
  const stop = () => {
    win.clearTimeout(idle);
    win.clearTimeout(max);
    idle = 0;
    max = 0;
  };
  /** الطلبات واحدًا بعد آخر بترتيب جدولتها؛ والفشل لا يقطع ما بعده. */
  const send = (fn) => {
    chain = chain.then(fn).catch(() => {});
    return chain;
  };
  const keeper = {
    get held() { return held; },
    /** تغيّرت الجلسة: كتابة بعد السكون، ولا تتأخر أكثر من الحد الأقصى منذ أول تغيير لم يُكتب. */
    schedule() {
      if (!supported || held) return;
      win.clearTimeout(idle);
      idle = win.setTimeout(() => keeper.flush(), DRAFT_IDLE_MS);
      if (!max) max = win.setTimeout(() => keeper.flush(), DRAFT_MAX_MS);
    },
    /**
     * الآن (الإخفاء والمغادرة، وبعد الحفظ والتجاهل): المسودة إن بقي ما لم يُحفظ، وحذفها إن لم يبقَ. force يكتب ولو لم تتغير النسخة
     * (بعد الحفظ: الأساس تغيّر وإن بقيت النسخة).
     * @param {{ force?: boolean }} [o]
     */
    flush({ force = false } = {}) {
      stop();
      const c = supported && !held ? current() : null;
      if (!c) return chain;
      const { session, slot, opened } = c;
      const last = seen.session === session ? seen.version : 0;
      if (!force && session.version === last) return chain;
      seen = { session, version: session.version };
      const draft = session.dirty
        ? draftOf({ cues: session.snapshot(), offsetMs: session.offsetMs, committedMs: session.committedMs }, opened, new Date(now()).toISOString(), baseHash(opened.track))
        : null;
      return send(() => (draft ? store.setDraft(videoId, slot, draft) : store.clearDraft(videoId, slot)));
    },
    /** تجاهل صريح لما في خانة (التبديل أو المغادرة دون حفظ): تُحذف مسودتها، إلا خانة تنتظر لافتتها قرارًا. @param {1 | 2 | 3} slot */
    drop(slot) {
      stop();
      if (!supported || held) return chain;
      return send(() => store.clearDraft(videoId, slot));
    },
    /** إمساك الكتابة ما دامت لافتة مسودة سابقة تنتظر القرار. @param {boolean} on */
    hold(on) {
      held = on;
      if (on) stop();
    },
    /** ينتظر ما أُرسل. */
    settled: () => chain,
  };
  return keeper;
}

/**
 * لافتة المسودة الثابتة بمكوّن التنبيه: «استعادة / تجاهل» حين تطابق هويتها الخانة (ومعها سطر الإزاحة حين تُتبنّى الحاضرة)، و«تنزيل
 * المسودة (SRT) / تجاهل» حين تغيّرت الخانة بعدها، بلا دمج آلي. آخر حفظ لها تاريخٌ بلغة الواجهة لا عددٌ. data-fid للمجسّ الحي.
 * @param {{ doc: Document, kind: 'same' | 'offset' | 'changed', savedAt: string, onRestore: () => void, onDiscard: () => void, onDownload: () => void }} o
 */
export function draftBanner({ doc, kind, savedAt, onRestore, onDiscard, onDownload }) {
  const changed = kind === 'changed';
  const when = absoluteTime(savedAt);
  const text = [
    t(changed ? 'editor.draft.changedBody' : 'editor.draft.body'),
    kind === 'offset' ? t('editor.draft.offsetNote') : null,
    when ? t('editor.draft.saved', { time: when }) : null,
  ].filter(Boolean).join(' ');
  const tagged = (b, fid) => {
    b.setAttribute('data-fid', fid);
    return b;
  };
  const main = changed
    ? tagged(button({ label: t('editor.draft.download'), icon: 'download', variant: 'primary', size: 'sm', onClick: onDownload, doc }), 'draftDownload')
    : tagged(button({ label: t('editor.draft.restore'), variant: 'primary', size: 'sm', onClick: onRestore, doc }), 'draftRestore');
  const box = alertBox({
    tone: changed ? 'warning' : 'info', title: t(changed ? 'editor.draft.changedTitle' : 'editor.draft.title'), text, doc,
    action: el('div', { className: 'ed-group', children: [main, tagged(button({ label: t('editor.draft.discard'), variant: 'ghost', size: 'sm', onClick: onDiscard, doc }), 'draftDiscard')], doc }),
  });
  box.setAttribute('data-fid', 'draftBanner');
  box.setAttribute('data-kind', kind);
  return box;
}
