// بطاقة «البيانات» (R45، P13-AC4/AC5، مواصفة التصميم §١٩.٨): «إنشاء نسخة احتياطية» بخيار تضمين النسخ السابقة (مفعّل
// افتراضيًا) تُحفظ عبر saveFile فتتبع مكان الحفظ، و«استعادة من ملف…» تتحقق من الملف كله قبل أي كتابة ثم تعرض المعاينة:
// الأعداد، والجديدة تُضاف، والموجودة تُتخطى افتراضيًا مع «استبدال» لكل صف و«استبدال كل الموجود» بنبرة الخطر، و«استعادة
// الإعدادات والقاموس» غير مختارة، ورابط «نزّل نسخة من بياناتك الحالية أولًا». ثم تقدم ظاهر وتقرير بما أضيف وما تُخطّي وما
// استُبدل وما تعذّر، مع «أعد المحاولة» لما تعذّر وحده. لا يدخل شيء من محتوى النسخة التشخيص ولا السجلات.
import {
  BACKUP_LIMITS, createBackup, mergeReports, planRestore, readBackup, reportCode, restoreItems, retryItems, retrySettings, runRestore, settingsFailureCode, yieldToPage,
} from '../../core/backup/index.js';
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { getLocale, joinList, t, texts } from '../../i18n/index.js';
import { alertBox, button, el, statusPill } from '../../ui/components.js';
import { holdPage } from '../../ui/page-hold.js';
import { COUNT_FORMS, formatCount, ltrInline, textDirection } from '../../ui/format.js';

let seq = 0;
const PREVIEW_FRESH_MAX = 100;
/** صيغ العدّ بلغة الواجهة الحالية (settings.dataCount). */
const FORMS = texts('settings.dataCount');

/** التاريخ المطلق بأرقام لاتينية. @param {string} iso */
export function backupDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(`${getLocale()}-u-nu-latn-ca-gregory`, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

/** «3 فيديوهات · 4 ترجمات · 3 علامات» ومعها السابقة إن وُجدت. @param {{ videos: number, translations: number, marks: number, previous: number }} c */
export function countsLine(c) {
  const parts = [formatCount(c.videos, COUNT_FORMS.video), formatCount(c.translations, FORMS.translation), formatCount(c.marks, FORMS.mark)];
  if (c.previous) parts.push(formatCount(c.previous, FORMS.previous));
  return parts.join(' · ');
}

/** أجزاء الفيديو التي تُستبعد من نسخة جزئية بأسمائها للمستخدم (U94). */
export const PART_NAMES = texts('settings.partNames');

/** معرّف فيديو معزول LTR في سطر عربي (كانت الشرطة في أوله تنتقل إلى آخره؛ تدقيق 7a66f91، U59 DS-F11). @param {string} id */
const idText = (id) => ltrInline(id);

/** سطر التقرير: «أضيف 2 · تُخطّي 1 · استُبدل 0 · تعذّر 0». @param {import('../../core/backup/restore.js').RestoreReport} r */
/** الفعل والضمير يطابقان العدد: «تغيّر فيديو واحد…» و«تغيّرت 3 فيديوهات…». @param {number} n */
export function restoreChangedLine(n) {
  return t('settings.data.changed', { n, videos: formatCount(n, COUNT_FORMS.video) });
}

export const reportLine = (r) => t('settings.data.reportLine', { added: r.added.length, skipped: r.skipped.length, replaced: r.replaced.length, failed: r.failed.length + r.remaining.length });

/** شريط تقدم بنصه («جارٍ الاستعادة: 120 من 300»)، مخفي حتى يبدأ عمل. @param {Document} doc */
function progressMeter(doc) {
  const textId = `st-progress-${++seq}`;
  const bar = el('progress', { className: 'st-progress__bar', attrs: { max: '1', value: '0', 'aria-labelledby': textId }, doc });
  const text = el('span', { className: 'tj-caption st-progress__text', attrs: { id: textId }, doc });
  const root = el('div', { className: 'st-progress', attrs: { role: 'status', 'aria-live': 'polite' }, children: [text, bar], doc });
  root.hidden = true;
  return {
    root,
    show: (label) => ({ done, total }) => {
      root.hidden = false;
      bar.setAttribute('max', String(Math.max(1, total)));
      bar.setAttribute('value', String(done));
      text.textContent = total ? t('settings.data.progress', { label, done, total }) : t('settings.data.progressUnknown', { label });
    },
    hide: () => { root.hidden = true; },
  };
}

/**
 * @param {{
 *   doc: Document, store: ReturnType<typeof import('../../core/store/index.js').createStore>,
 *   version: string, now: () => number, pause?: () => Promise<void>,
 *   confirm: typeof import('../../ui/components.js').confirmDialog,
 *   saveFile: (file: { name: string, text: string }) => Promise<{ ok: true, mode: string, downloadId: number | null } | { ok: false, code: string }>,
 *   pickFile: () => Promise<File | null>,
 *   onRestored?: () => Promise<void> | void,
 * }} env
 */
export function dataControl(env) {
  const { doc, store, version, now } = env;
  const pause = env.pause ?? yieldToPage;
  const id = `st-data-${++seq}`;
  /** الأعمال الجارية عدّادًا (إنشاء أو فحص أو استعادة)، ومن ينتظر انتهاءها كلها، وأزرار تُعطَّل معها («أعد المحاولة»). */
  let busy = 0;
  let running = false;
  const idleWaiters = [];
  const extra = new Set();

  // ---- الإنشاء ----
  const includePrev = el('input', { attrs: { id: `${id}-prev`, type: 'checkbox' }, doc });
  includePrev.checked = true;
  const prevLabel = el('label', { className: 'st-check', attrs: { for: `${id}-prev` }, children: [includePrev, el('span', { text: t('settings.data.includePrevious'), doc })], doc });
  const createResult = el('div', { className: 'st-data__result', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  const createMeter = progressMeter(doc);
  const createBtn = button({ label: t('settings.data.create'), icon: 'download', variant: 'secondary', doc, onClick: () => { makeBackup(createResult, { includePrevious: includePrev.checked, meter: createMeter }); } });

  // ---- الاستعادة ----
  const restoreBtn = button({ label: t('settings.data.restore'), icon: 'upload', variant: 'secondary', doc, onClick: () => { restoreFromFile(); } });
  const restoreMeter = progressMeter(doc);
  const restoreResult = el('div', { className: 'st-data__result', doc });

  /** قبضة الأعمال الجارية، وقبضة تقرير الاستعادة الظاهر: إعادة التحميل تقطع الأولى وتمحو الثاني ومعه «أعد المحاولة». */
  let workHold = null;
  let reportHold = null;
  const releaseReport = () => {
    reportHold?.();
    reportHold = null;
  };
  const setBusy = (on) => {
    busy = Math.max(0, busy + (on ? 1 : -1));
    const off = busy > 0;
    if (off) workHold ??= holdPage();
    for (const b of [createBtn, restoreBtn, ...extra]) {
      b.setAttribute('aria-disabled', off ? 'true' : 'false');
      b.setAttribute('aria-busy', off ? 'true' : 'false');
    }
    if (!off) idleWaiters.splice(0).forEach((resolve) => resolve());
    if (!off) {
      workHold?.();
      workHold = null;
    }
  };
  /** يُحل حين لا عمل جاريًا: الاستعادة تبدأ بعد اكتمال «نسخة من بياناتك الحالية» التي بدأت في المعاينة. */
  const idle = () => (busy ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve());

  /** نتيجة الحفظ سطرًا: النجاح باسم الملف وأعداده، والرجوع إلى التنزيل العادي، والإلغاء، والفشل. */
  function saveOutcome(host, saved, built) {
    const kids = [];
    if (saved.ok) {
      kids.push(alertBox({ tone: 'success', text: `${messageFor('BK_CREATED', { videos: formatCount(built.counts.videos, COUNT_FORMS.video) })} ${built.name}`, doc }));
      if (saved.mode === 'blob') kids.push(alertBox({ tone: 'info', text: messageFor('SV_FALLBACK_BLOB'), doc }));
      if (saved.pending) kids.push(alertBox({ tone: 'info', text: messageFor('SV_PENDING'), doc }));
    } else {
      // «صدّره من المحفوظات» (SV_TOO_LARGE) لا معنى له هنا: المحفوظات لا تنشئ نسخًا (U55).
      const code = saved.code === 'SV_TOO_LARGE' ? 'BK_CREATE_TOO_LARGE' : saved.code;
      const sizes = { size: t('common.bytes.mb', { n: Math.ceil((built.bytes ?? 0) / (1024 * 1024)) }), max: t('common.bytes.mb', { n: Math.round(BACKUP_LIMITS.maxBytes / (1024 * 1024)) }) };
      kids.push(alertBox({ tone: code === 'SV_CANCELLED' ? 'info' : 'danger', text: messageFor(code, sizes), doc }));
    }
    // نسخة جزئية بعينها (U94، Q29): ما استُبعد من كل فيديو، والأصل التالف باقٍ.
    if (built.partial?.length) {
      kids.push(alertBox({
        tone: 'warning', title: messageFor('BK_CREATED_PARTIAL', { videos: formatCount(built.partial.length, COUNT_FORMS.video, { case: 'gen' }) }),
        text: built.partial.slice(0, 20).map((x) => t('settings.data.excluded', { id: idText(x.videoId), parts: joinList(x.dropped.map((k) => (k in PART_NAMES ? PART_NAMES[k] : k))) })).join('\n'),
        doc,
      }));
    }
    if (built.skipped.length) {
      kids.push(alertBox({ tone: 'warning', text: t('settings.data.notIncluded', { count: formatCount(built.skipped.length, COUNT_FORMS.video), ids: joinList(built.skipped.map((x) => idText(x.videoId))) }), doc }));
    }
    host.replaceChildren(...kids);
  }

  /** ينشئ نسخة ويحفظها، ويكتب النتيجة في host. يعيد هل حُفظت. */
  async function makeBackup(host, { includePrevious, meter }) {
    if (busy) return false;
    setBusy(true);
    host.replaceChildren();
    try {
      const built = await createBackup({ store, appVersion: version, includePrevious, now, pause, onProgress: meter.show(t('settings.data.preparing')) });
      meter.hide();
      const saved = await env.saveFile({ name: built.name, text: built.text });
      saveOutcome(host, saved, built);
      // «آخر ملف حُفظ» يتبع النسخة التي نزلت للتو (تدقيق 5fedcb9، GM-027.1).
      if (saved.ok) await env.onSaved?.();
      return saved.ok;
    } catch (err) {
      meter.hide();
      host.replaceChildren(alertBox({ tone: 'danger', title: t('settings.data.createFailed'), text: toErrorInfo(err).message, doc }));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** ما لا يُقرأ من النسخة وسببه، والمعرّف معزولًا. «لا يُقرأ من النسخة: 3 فيديوهات» بلا صفة تطابق العدد (U59). */
  function invalidBox(invalid) {
    return alertBox({
      tone: 'warning',
      title: t('settings.data.invalidTitle', { n: invalid.length, formatted: formatCount(invalid.length, COUNT_FORMS.video) }),
      text: invalid.slice(0, 20).map((x) => `${x.videoId ? idText(x.videoId) : `#${x.index + 1}`}: ${messageFor(x.code)}`).join('\n'),
      doc,
    });
  }

  /** المعاينة داخل الحوار، وحالتها: الاستبدال المختار وخيار الإعدادات. */
  function preview(read, plan, existingById) {
    const replace = new Set();
    let replaceAll = false;
    const kids = [];
    kids.push(el('p', { className: 'tj-body-sm st-restore__meta', text: t('settings.data.meta', { date: backupDate(read.header.createdAt), version: read.header.app.version }), doc }));
    kids.push(el('p', { className: 'tj-body-sm st-restore__counts', text: countsLine(plan.counts), doc }));
    if (plan.invalid.length) kids.push(invalidBox(plan.invalid));
    for (const w of read.warnings) kids.push(alertBox({ tone: 'warning', text: messageFor(w.code, w.params), doc }));
    if (read.thumbnailsOff) kids.push(el('p', { className: 'tj-body-sm st-restore__thumbs', text: t('settings.data.thumbsStayOff'), doc }));

    const titleOf = (v) => v.title ?? v.videoId;
    if (plan.fresh.length) {
      const shown = plan.fresh.slice(0, PREVIEW_FRESH_MAX);
      // قائمة الجديدة قابلة للطي، مفتوحة إن قصرت: في مكتبة كبيرة لا تدفن مجموعة «موجودة» (موضع القرار) تحت مئة صف.
      const fresh = el('details', {
        className: 'st-restore__group st-restore__fresh',
        children: [
          el('summary', { className: 'tj-h4 st-restore__summary', text: t('settings.data.freshTitle', { n: plan.fresh.length }), doc }),
          el('ul', {
            className: 'st-restore__list', attrs: { role: 'list' },
            children: [
              ...shown.map((v) => el('li', {
                className: 'st-restore__item',
                children: [
                  el('span', { className: 'st-restore__title', text: titleOf(v), dir: textDirection(titleOf(v)), doc }),
                  el('span', { className: 'tj-caption', text: v.counts.translations ? formatCount(v.counts.translations, FORMS.translation) : t('settings.data.noTranslation'), doc }),
                ],
                doc,
              })),
              plan.fresh.length > shown.length ? el('li', { className: 'tj-caption', text: t('settings.data.more', { count: formatCount(plan.fresh.length - shown.length, COUNT_FORMS.video) }), doc }) : null,
            ],
            doc,
          }),
        ],
        doc,
      });
      fresh.open = plan.fresh.length <= 10;
      kids.push(fresh);
    }
    const replaceNote = el('p', { className: 'tj-caption st-restore__danger', text: t('settings.data.replaceNote'), doc });
    replaceNote.hidden = true;
    if (plan.existing.length) {
      const boxes = [];
      const updateNote = () => { replaceNote.hidden = !(replaceAll || replace.size); };
      const all = el('input', { className: 'st-switch__input', attrs: { id: `${id}-all`, type: 'checkbox', role: 'switch' }, doc });
      all.addEventListener('change', () => {
        replaceAll = all.checked;
        for (const b of boxes) {
          b.checked = replaceAll || replace.has(b.getAttribute('data-video'));
          b.disabled = replaceAll;
        }
        updateNote();
      });
      const rows = plan.existing.map((v) => {
        const box = el('input', { attrs: { id: `${id}-r-${v.videoId}`, type: 'checkbox', 'data-video': v.videoId, 'aria-label': t('settings.data.replaceAria', { title: titleOf(v) }) }, doc });
        box.addEventListener('change', () => {
          if (box.checked) replace.add(v.videoId);
          else replace.delete(v.videoId);
          updateNote();
        });
        boxes.push(box);
        const local = existingById.get(v.videoId);
        const newer = local && local.updatedAt > v.updatedAt;
        return el('li', {
          className: 'st-restore__item st-restore__item--existing',
          children: [
            el('span', { className: 'st-restore__title', text: titleOf(v), dir: textDirection(titleOf(v)), doc }),
            newer ? statusPill({ tone: 'warning', text: t('settings.data.newer'), title: t('settings.data.newerTitle', { current: backupDate(local.updatedAt), backup: backupDate(v.updatedAt) }), doc }) : null,
            el('label', { className: 'st-check st-restore__replace', attrs: { for: box.getAttribute('id') }, children: [box, el('span', { text: t('settings.data.replace'), doc })], doc }),
          ],
          doc,
        });
      });
      kids.push(el('section', {
        className: 'st-restore__group',
        children: [
          el('h3', { className: 'tj-h4', text: t('settings.data.existingTitle', { n: plan.existing.length }), doc }),
          el('label', {
            className: 'st-switch st-switch--danger', attrs: { for: `${id}-all` },
            children: [all, el('span', { className: 'st-switch__track', attrs: { 'aria-hidden': 'true' }, doc }), el('span', { className: 'st-switch__label', text: t('settings.data.replaceAll'), doc })],
            doc,
          }),
          el('ul', { className: 'st-restore__list', attrs: { role: 'list' }, children: rows, doc }),
          replaceNote,
        ],
        doc,
      }));
    }
    const settingsBox = el('input', { attrs: { id: `${id}-settings`, type: 'checkbox' }, doc });
    settingsBox.checked = false;
    if (!plan.hasSettings) {
      settingsBox.disabled = true;
      settingsBox.setAttribute('aria-disabled', 'true');
    }
    kids.push(el('label', {
      className: 'st-check', attrs: { for: `${id}-settings`, ...(plan.hasSettings ? {} : { title: t('settings.data.noSettings') }) },
      children: [settingsBox, el('span', { text: t('settings.data.restoreSettings'), doc })],
      doc,
    }));
    const firstResult = el('div', { className: 'st-data__result', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
    const firstMeter = progressMeter(doc);
    let confirmBtn = null;
    // نسخة الحالي قبل الاستبدال: زر «استعادة» معطّل حتى تكتمل، والاستعادة نفسها تنتظرها (idle) فلا تسبق قراءتَها كتابةٌ.
    const first = button({
      label: t('settings.data.first'), icon: 'download', variant: 'ghost', size: 'sm', className: 'st-restore__first', doc,
      onClick: () => {
        confirmBtn?.setAttribute('aria-disabled', 'true');
        makeBackup(firstResult, { includePrevious: true, meter: firstMeter }).finally(() => confirmBtn?.setAttribute('aria-disabled', 'false'));
      },
    });
    kids.push(el('div', { className: 'st-restore__first-box', children: [first, firstMeter.root, firstResult], doc }));
    const root = el('div', { className: 'st-restore', children: kids, doc });
    return {
      root,
      bindConfirm: () => { confirmBtn = root.closest?.('form')?.querySelector('button[value="confirm"]') ?? null; },
      choice: () => ({ replace: replaceAll ? 'all' : new Set(replace), settings: settingsBox.checked && plan.hasSettings }),
    };
  }

  function renderReport(report, titles, retry) {
    const code = reportCode(report);
    const tone = code === 'BK_RESTORE_DONE' ? 'success' : code === 'BK_RESTORE_STOPPED' ? 'danger' : 'warning';
    const lines = [reportLine(report)];
    // حال كل قسم بعينه (U54): لا «بقيت الحالية كما هي» وقد تغيّر أحدهما.
    if (report.settings === 'restored') {
      const p = report.parts ?? {};
      if (p.settings || p.prefs || !p.langPrefs) {
        lines.push(t(p.settings && !p.prefs ? 'settings.data.settingsRestored' : p.prefs && !p.settings ? 'settings.data.prefsRestored' : 'settings.data.settingsPrefsRestored'));
      }
      if (p.langPrefs === 'restored') lines.push(t('settings.data.langPrefsRestored'));
    }
    if (report.settings === 'failed') lines.push(messageFor(settingsFailureCode(report) ?? 'BK_RESTORE_SETTINGS_FAILED'));
    if (report.changed?.length) lines.push(restoreChangedLine(report.changed.length));
    if (report.thumbnails === 'off') lines.push(t('settings.data.thumbsKeptOff'));
    if (report.thumbnails === 'failed') lines.push(t('settings.data.thumbsKeepFailed'));
    for (const f of report.failed.slice(0, 20)) lines.push(`${titles.get(f.videoId) ?? f.videoId}: ${f.message}`);
    if (report.remaining.length) lines.push(t('settings.data.remaining', { count: formatCount(report.remaining.length, COUNT_FORMS.video) }));
    const again = report.failed.length || report.remaining.length || report.settings === 'failed' || report.thumbnails === 'failed'
      ? button({ label: t('settings.data.retry'), icon: 'restore', size: 'sm', variant: 'secondary', doc, onClick: () => { retry(); } })
      : null;
    extra.clear();
    if (again) extra.add(again);
    reportHold ??= holdPage();
    restoreResult.replaceChildren(alertBox({ tone, title: messageFor(code), text: lines.join('\n'), action: again ?? undefined, doc }));
  }

  // chosen: ما اختاره المستخدم من الأقسام الثلاثة كاملًا، ويُمرَّر كما هو في كل إعادة محاولة، فيبقى المتعذّر مرتين متاحًا للثالثة.
  async function run({ items, skipped, settings, prefs, langPrefs = null, thumbnailsOff = false, titles, before, chosen = { settings, prefs, langPrefs } }) {
    // تشغيل واحد في كل وقت: النقر المزدوج على «أعد المحاولة» لا يشغّل تشغيلين من التقرير نفسه.
    if (running) return null;
    running = true;
    setBusy(true);
    try {
      const report = await runRestore({ store, items, skipped, settings, prefs, langPrefs, thumbnailsOff, pause, onProgress: restoreMeter.show(t('settings.data.restoring')) });
      restoreMeter.hide();
      const merged = before ? mergeReports(before, report) : report;
      // إعادة المحاولة تكتب القسم المتعذّر وحده، فلا تمحو تغييرًا أجراه المستخدم بعد التقرير في القسم الذي نجح (U54).
      const again = retrySettings(merged, chosen);
      renderReport(merged, titles, () => run({
        items: retryItems(merged, items), skipped: [],
        settings: again.settings, prefs: again.prefs, langPrefs: again.langPrefs, chosen,
        thumbnailsOff: merged.thumbnails === 'failed' && thumbnailsOff,
        titles, before: merged,
      }));
      await env.onRestored?.();
      return merged;
    } catch (err) {
      restoreMeter.hide();
      restoreResult.replaceChildren(alertBox({ tone: 'danger', title: t('settings.data.restoreFailed'), text: toErrorInfo(err).message, doc }));
      return null;
    } finally {
      running = false;
      setBusy(false);
    }
  }

  async function restoreFromFile() {
    if (busy) return null;
    const file = await env.pickFile();
    if (!file) return null;
    // من اختيار الملف إلى نهاية الاستعادة قبضة واحدة، فلا يفلت تبديل لغة بين الفحص والمعاينة والكتابة. وتقرير سابق يُطوى هنا.
    const flow = holdPage();
    try {
      restoreResult.replaceChildren();
      releaseReport();
      return await restoreChosen(file);
    } finally {
      flow();
    }
  }

  /** @param {File} file */
  async function restoreChosen(file) {
    setBusy(true);
    let read;
    let library;
    let unreadable = [];
    // بصمة كل سجل غير مقروء كما عُرضت المعاينة: تُقارَن عند التأكيد فلا تطمس استعادةٌ إصلاحًا أحدث (تدقيق V2، U-023).
    const prints = new Map();
    try {
      read = await readBackup(file, { pause, onProgress: restoreMeter.show(t('settings.data.checking')) });
      library = read.ok ? await store.listLibrary() : [];
      // سجل محلي تالف لا يظهر في المحفوظات «موجود» أيضًا: يُتخطى افتراضيًا، ويُختار استبداله لإصلاحه (CX-H4، GM-006).
      unreadable = read.ok && typeof store.unreadableVideos === 'function' ? await store.unreadableVideos() : [];
      if (typeof store.rawPrint === 'function') for (const id of unreadable) prints.set(id, await store.rawPrint(id));
    } catch (err) {
      read = { ok: false, code: toErrorInfo(err).code, message: toErrorInfo(err).message };
    } finally {
      restoreMeter.hide();
      setBusy(false);
    }
    if (!read.ok) {
      restoreResult.replaceChildren(alertBox({ tone: 'danger', title: t('settings.data.restoreFileFailed'), text: read.message ?? messageFor(read.code, read.params), doc }));
      return null;
    }
    const existingById = new Map(library.map((x) => [x.entry.videoId, x.entry]));
    // كل موجود يحمل نسخته كما عُرض، فلا يُستبدل ما حُفظ بعد المعاينة (تدقيق 7a66f91، U11).
    const plan = planRestore(read, [...existingById.keys(), ...unreadable], existingById, prints);
    if (!plan.counts.videos && !plan.hasSettings) {
      // «لا شيء يمكن استعادته» ومعه السبب إن كان في النسخة ما لا يُقرأ (U59 L-24): كانت الجملة وحدها.
      restoreResult.replaceChildren(alertBox({ tone: 'warning', text: messageFor('BK_NOTHING'), doc }), ...(plan.invalid.length ? [invalidBox(plan.invalid)] : []));
      return null;
    }
    const view = preview(read, plan, existingById);
    const pending = env.confirm({ title: t('settings.data.dialogTitle'), confirmLabel: t('settings.data.dialogConfirm'), content: view.root, doc });
    view.bindConfirm();
    if (!(await pending)) return null;
    // «نزّل نسخة من بياناتك الحالية أولًا» إن بدأت تكتمل قبل أي كتابة.
    await idle();
    const choice = view.choice();
    const { items, skipped } = restoreItems(plan, choice.replace);
    const titles = new Map(read.videos.map((v) => [v.videoId, v.title ?? v.videoId]));
    return run({
      items, skipped,
      settings: choice.settings ? read.settings?.patch ?? null : null,
      prefs: choice.settings ? read.prefs?.patch ?? null : null,
      // تفضيلات اللغات (AA3) مع «استعادة الإعدادات والقاموس».
      langPrefs: choice.settings ? read.langPrefs ?? null : null,
      thumbnailsOff: read.thumbnailsOff === true,
      titles, before: null,
    });
  }

  return {
    createRow: el('div', { className: 'st-data', children: [prevLabel, el('div', { className: 'st-actions', children: [createBtn], doc }), createMeter.root, createResult], doc }),
    restoreRow: el('div', { className: 'st-data', children: [el('div', { className: 'st-actions', children: [restoreBtn], doc }), restoreMeter.root, restoreResult], doc }),
    makeBackup, restoreFromFile, releaseReport,
    get busy() { return busy > 0; },
  };
}
