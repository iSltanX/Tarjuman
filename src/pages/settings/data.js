// بطاقة «البيانات» (R45، P13-AC4/AC5، مواصفة التصميم §١٩.٨): «إنشاء نسخة احتياطية» بخيار تضمين النسخ السابقة (مفعّل
// افتراضيًا) تُحفظ عبر saveFile فتتبع مكان الحفظ، و«استعادة من ملف…» تتحقق من الملف كله قبل أي كتابة ثم تعرض المعاينة:
// الأعداد، والجديدة تُضاف، والموجودة تُتخطى افتراضيًا مع «استبدال» لكل صف و«استبدال كل الموجود» بنبرة الخطر، و«استعادة
// الإعدادات والقاموس» غير مختارة، ورابط «نزّل نسخة من بياناتك الحالية أولًا». ثم تقدم ظاهر وتقرير بما أضيف وما تُخطّي وما
// استُبدل وما تعذّر، مع «أعد المحاولة» لما تعذّر وحده. لا يدخل شيء من محتوى النسخة التشخيص ولا السجلات.
import {
  createBackup, mergeReports, planRestore, readBackup, reportCode, restoreItems, retryItems, runRestore, yieldToPage,
} from '../../core/backup/index.js';
import { messageFor, toErrorInfo } from '../../core/errors/index.js';
import { alertBox, button, el, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatCount } from '../../ui/format.js';

let seq = 0;
const PREVIEW_FRESH_MAX = 100;
const FORMS = Object.freeze({
  translation: Object.freeze({ one: 'ترجمة واحدة', two: 'ترجمتان', few: 'ترجمات', many: 'ترجمة', single: 'ترجمة' }),
  mark: Object.freeze({ one: 'علامة واحدة', two: 'علامتان', few: 'علامات', many: 'علامة', single: 'علامة' }),
  previous: Object.freeze({ one: 'نسخة سابقة واحدة', two: 'نسختان سابقتان', few: 'نسخ سابقة', many: 'نسخة سابقة', single: 'نسخة سابقة' }),
});
export { FORMS as DATA_COUNT_FORMS };

/** التاريخ المطلق بأرقام لاتينية. @param {string} iso */
export function backupDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ar-u-nu-latn-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
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

/** سطر التقرير: «أضيف 2 · تُخطّي 1 · استُبدل 0 · تعذّر 0». @param {import('../../core/backup/restore.js').RestoreReport} r */
export const reportLine = (r) => `أضيف ${r.added.length} · تُخطّي ${r.skipped.length} · استُبدل ${r.replaced.length} · تعذّر ${r.failed.length + r.remaining.length}`;

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
      text.textContent = total ? `${label}: ${done} من ${total}` : `${label}…`;
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
  let busy = false;

  // ---- الإنشاء ----
  const includePrev = el('input', { attrs: { id: `${id}-prev`, type: 'checkbox' }, doc });
  includePrev.checked = true;
  const prevLabel = el('label', { className: 'st-check', attrs: { for: `${id}-prev` }, children: [includePrev, el('span', { text: 'تضمين النسخ السابقة', doc })], doc });
  const createResult = el('div', { className: 'st-data__result', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  const createMeter = progressMeter(doc);
  const createBtn = button({ label: 'إنشاء نسخة احتياطية', icon: 'download', variant: 'secondary', doc, onClick: () => { makeBackup(createResult, { includePrevious: includePrev.checked, meter: createMeter }); } });

  // ---- الاستعادة ----
  const restoreBtn = button({ label: 'استعادة من ملف…', icon: 'upload', variant: 'secondary', doc, onClick: () => { restoreFromFile(); } });
  const restoreMeter = progressMeter(doc);
  const restoreResult = el('div', { className: 'st-data__result', doc });

  const setBusy = (on) => {
    busy = on;
    for (const b of [createBtn, restoreBtn]) {
      b.setAttribute('aria-disabled', on ? 'true' : 'false');
      b.setAttribute('aria-busy', on ? 'true' : 'false');
    }
  };

  /** نتيجة الحفظ سطرًا: النجاح باسم الملف وأعداده، والرجوع إلى التنزيل العادي، والإلغاء، والفشل. */
  function saveOutcome(host, saved, built) {
    const kids = [];
    if (saved.ok) {
      kids.push(alertBox({ tone: 'success', text: `${messageFor('BK_CREATED', { videos: formatCount(built.counts.videos, COUNT_FORMS.video) })} ${built.name}`, doc }));
      if (saved.mode === 'blob') kids.push(alertBox({ tone: 'info', text: messageFor('SV_FALLBACK_BLOB'), doc }));
    } else {
      kids.push(alertBox({ tone: saved.code === 'SV_CANCELLED' ? 'info' : 'danger', text: messageFor(saved.code), doc }));
    }
    if (built.skipped.length) {
      kids.push(alertBox({ tone: 'warning', text: `لم يُضمَّن ${formatCount(built.skipped.length, COUNT_FORMS.video)} لتعذّر قراءة سجله: ${built.skipped.map((s) => s.videoId).join('، ')}`, doc }));
    }
    host.replaceChildren(...kids);
  }

  /** ينشئ نسخة ويحفظها، ويكتب النتيجة في host. يعيد هل حُفظت. */
  async function makeBackup(host, { includePrevious, meter }) {
    if (busy) return false;
    setBusy(true);
    host.replaceChildren();
    try {
      const built = await createBackup({ store, appVersion: version, includePrevious, now, pause, onProgress: meter.show('جارٍ تجهيز النسخة') });
      meter.hide();
      const saved = await env.saveFile({ name: built.name, text: built.text });
      saveOutcome(host, saved, built);
      return saved.ok;
    } catch (err) {
      meter.hide();
      host.replaceChildren(alertBox({ tone: 'danger', title: 'تعذّر إنشاء النسخة الاحتياطية', text: toErrorInfo(err).message, doc }));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** المعاينة داخل الحوار، وحالتها: الاستبدال المختار وخيار الإعدادات. */
  function preview(read, plan, existingById) {
    const replace = new Set();
    let replaceAll = false;
    const kids = [];
    kids.push(el('p', { className: 'tj-body-sm st-restore__meta', text: `أُنشئت ${backupDate(read.header.createdAt)} · ترجمان ${read.header.app.version}`, doc }));
    kids.push(el('p', { className: 'tj-body-sm st-restore__counts', text: countsLine(plan.counts), doc }));
    if (plan.invalid.length) {
      kids.push(alertBox({
        tone: 'warning',
        title: `تعذّرت قراءة ${formatCount(plan.invalid.length, COUNT_FORMS.video)} من النسخة، وسيُتخطى`,
        text: plan.invalid.slice(0, 20).map((x) => `${x.videoId ?? `#${x.index + 1}`}: ${messageFor(x.code)}`).join('\n'),
        doc,
      }));
    }
    for (const w of read.warnings) kids.push(alertBox({ tone: 'warning', text: messageFor(w.code, w.params), doc }));

    const titleOf = (v) => v.title ?? v.videoId;
    if (plan.fresh.length) {
      const shown = plan.fresh.slice(0, PREVIEW_FRESH_MAX);
      kids.push(el('section', {
        className: 'st-restore__group',
        children: [
          el('h3', { className: 'tj-h4', text: `جديدة — ستُضاف (${plan.fresh.length})`, doc }),
          el('ul', {
            className: 'st-restore__list', attrs: { role: 'list' },
            children: [
              ...shown.map((v) => el('li', { className: 'st-restore__item', children: [el('span', { className: 'st-restore__title', text: titleOf(v), dir: 'auto', doc }), el('span', { className: 'tj-caption', text: formatCount(v.counts.translations, FORMS.translation), doc })], doc })),
              plan.fresh.length > shown.length ? el('li', { className: 'tj-caption', text: `و${formatCount(plan.fresh.length - shown.length, COUNT_FORMS.video)} غيرها`, doc }) : null,
            ],
            doc,
          }),
        ],
        doc,
      }));
    }
    const replaceNote = el('p', { className: 'tj-caption st-restore__danger', text: 'الاستبدال يكتب فوق الفيديو كاملًا ولا يحفظ له نسخة سابقة.', doc });
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
        const box = el('input', { attrs: { id: `${id}-r-${v.videoId}`, type: 'checkbox', 'data-video': v.videoId, 'aria-label': `استبدال: ${titleOf(v)}` }, doc });
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
            el('span', { className: 'st-restore__title', text: titleOf(v), dir: 'auto', doc }),
            newer ? statusPill({ tone: 'warning', text: 'الحالية أحدث', title: `الحالية: ${backupDate(local.updatedAt)} · في النسخة: ${backupDate(v.updatedAt)}`, doc }) : null,
            el('label', { className: 'st-check st-restore__replace', attrs: { for: box.getAttribute('id') }, children: [box, el('span', { text: 'استبدال', doc })], doc }),
          ],
          doc,
        });
      });
      kids.push(el('section', {
        className: 'st-restore__group',
        children: [
          el('h3', { className: 'tj-h4', text: `موجودة — تُتخطى افتراضيًا (${plan.existing.length})`, doc }),
          el('label', {
            className: 'st-switch st-switch--danger', attrs: { for: `${id}-all` },
            children: [all, el('span', { className: 'st-switch__track', attrs: { 'aria-hidden': 'true' }, doc }), el('span', { className: 'st-switch__label', text: 'استبدال كل الموجود', doc })],
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
      className: 'st-check', attrs: { for: `${id}-settings`, ...(plan.hasSettings ? {} : { title: 'لا إعدادات صالحة في هذه النسخة.' }) },
      children: [settingsBox, el('span', { text: 'استعادة الإعدادات والقاموس', doc })],
      doc,
    }));
    const firstResult = el('div', { className: 'st-data__result', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
    const firstMeter = progressMeter(doc);
    const first = button({ label: 'نزّل نسخة من بياناتك الحالية أولًا', icon: 'download', variant: 'ghost', size: 'sm', className: 'st-restore__first', doc, onClick: () => { makeBackup(firstResult, { includePrevious: true, meter: firstMeter }); } });
    kids.push(el('div', { className: 'st-restore__first-box', children: [first, firstMeter.root, firstResult], doc }));
    return {
      root: el('div', { className: 'st-restore', children: kids, doc }),
      choice: () => ({ replace: replaceAll ? 'all' : new Set(replace), settings: settingsBox.checked && plan.hasSettings }),
    };
  }

  function renderReport(report, titles, retry) {
    const code = reportCode(report);
    const tone = code === 'BK_RESTORE_DONE' ? 'success' : code === 'BK_RESTORE_STOPPED' ? 'danger' : 'warning';
    const lines = [reportLine(report)];
    if (report.settings === 'restored') lines.push('استُعيدت الإعدادات والقاموس.');
    if (report.settings === 'failed') lines.push(messageFor('BK_RESTORE_SETTINGS_FAILED'));
    for (const f of report.failed.slice(0, 20)) lines.push(`${titles.get(f.videoId) ?? f.videoId}: ${f.message}`);
    if (report.remaining.length) lines.push(`لم يُكتب بعد: ${formatCount(report.remaining.length, COUNT_FORMS.video)}.`);
    const again = report.failed.length || report.remaining.length || report.settings === 'failed'
      ? button({ label: 'أعد المحاولة', icon: 'restore', size: 'sm', variant: 'secondary', doc, onClick: () => { retry(); } })
      : null;
    restoreResult.replaceChildren(alertBox({ tone, title: messageFor(code), text: lines.join('\n'), action: again ?? undefined, doc }));
  }

  async function run({ items, skipped, settings, prefs, titles, before }) {
    setBusy(true);
    try {
      const report = await runRestore({ store, items, skipped, settings, prefs, pause, onProgress: restoreMeter.show('جارٍ الاستعادة') });
      restoreMeter.hide();
      const merged = before ? mergeReports(before, report) : report;
      renderReport(merged, titles, () => run({
        items: retryItems(merged, items), skipped: [],
        settings: merged.settings === 'failed' ? settings : null, prefs: merged.settings === 'failed' ? prefs : null,
        titles, before: merged,
      }));
      await env.onRestored?.();
      return merged;
    } catch (err) {
      restoreMeter.hide();
      restoreResult.replaceChildren(alertBox({ tone: 'danger', title: 'تعذّرت الاستعادة', text: toErrorInfo(err).message, doc }));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromFile() {
    if (busy) return null;
    const file = await env.pickFile();
    if (!file) return null;
    restoreResult.replaceChildren();
    setBusy(true);
    let read;
    let library;
    try {
      read = await readBackup(file, { pause, onProgress: restoreMeter.show('جارٍ فحص النسخة') });
      library = read.ok ? await store.listLibrary() : [];
    } catch (err) {
      read = { ok: false, code: toErrorInfo(err).code, message: toErrorInfo(err).message };
    } finally {
      restoreMeter.hide();
      setBusy(false);
    }
    if (!read.ok) {
      restoreResult.replaceChildren(alertBox({ tone: 'danger', title: 'تعذّرت الاستعادة من هذا الملف', text: read.message ?? messageFor(read.code, read.params), doc }));
      return null;
    }
    const existingById = new Map(library.map((x) => [x.entry.videoId, x.entry]));
    const plan = planRestore(read, existingById.keys());
    if (!plan.counts.videos && !plan.hasSettings) {
      restoreResult.replaceChildren(alertBox({ tone: 'warning', text: messageFor('BK_NOTHING'), doc }));
      return null;
    }
    const view = preview(read, plan, existingById);
    const ok = await env.confirm({ title: 'استعادة من نسخة احتياطية', confirmLabel: 'استعادة', content: view.root, doc });
    if (!ok) return null;
    const choice = view.choice();
    const { items, skipped } = restoreItems(plan, choice.replace);
    const titles = new Map(read.videos.map((v) => [v.videoId, v.title ?? v.videoId]));
    return run({
      items, skipped,
      settings: choice.settings ? read.settings?.patch ?? null : null,
      prefs: choice.settings ? read.prefs?.patch ?? null : null,
      titles, before: null,
    });
  }

  return {
    createRow: el('div', { className: 'st-data', children: [prevLabel, el('div', { className: 'st-actions', children: [createBtn], doc }), createMeter.root, createResult], doc }),
    restoreRow: el('div', { className: 'st-data', children: [el('div', { className: 'st-actions', children: [restoreBtn], doc }), restoreMeter.root, restoreResult], doc }),
    makeBackup, restoreFromFile,
    get busy() { return busy; },
  };
}
