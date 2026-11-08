// صف «زر النص المتزامن مخفي» في نافذة الأيقونة: حين يكون prefs.ui.panelEntry=false (أخفاه المستخدم من قائمة اللوحة أو من
// الإعدادات) يظهر الصف بزر «إظهاره» الذي يكتب prefs.ui.panelEntry=true في التخزين (docs/product-spec.md §٦.٦: يعود من
// نافذة الأيقونة أو الإعدادات). النتيجة تُقال كما حدثت: النجاح من القيمة التي رجعت من التخزين لا من افتراض، والفشل برسالته
// ويبقى الصف ليُعاد الضغط. ويتبع الصف التفضيلات حين تتغير من سياق آخر (الإعدادات أو قائمة اللوحة). DOM وtextContent فقط.
import { messageFor } from '../../core/errors/index.js';
import { t, texts } from '../../i18n/index.js';
import { alertBox, button, el } from '../../ui/components.js';
import { popupIcon } from './icons.js';
import { entryHidden } from './status.js';

/** نصوص صف «زر النص المتزامن مخفي» بلغة الواجهة الحالية (popup.entry). */
export const ENTRY_TEXT = texts('popup.entry');

/**
 * @param {{
 *   store: Pick<ReturnType<typeof import('../../core/store/index.js').createStore>, 'getPrefs' | 'setPrefs' | 'onChange'>,
 *   host: HTMLElement, doc?: Document
 * }} o host حاوية فارغة تبقى في الشجرة (فيها منطقة حيّة لنتيجة الإظهار)
 * @returns {{ ready: Promise<void>, sync: () => Promise<void>, dispose: () => void }}
 */
export function bindEntryRow({ store, host, doc = document }) {
  const slot = el('div', { className: 'tj-popup__entry-slot', doc });
  const live = el('div', { className: 'tj-popup__entry-result', attrs: { role: 'status', 'aria-live': 'polite' }, doc });
  host.append(slot, live);
  let busy = false;
  let done = false;

  function row() {
    const show = button({
      label: ENTRY_TEXT.show, size: 'sm', doc, onClick: () => { showEntry(); },
      title: t('popup.entry.showTitle'),
    });
    show.setAttribute('data-action', 'show-entry');
    return el('div', {
      className: 'tj-popup__entry', attrs: { role: 'group', 'aria-label': t('popup.entry.group') },
      children: [popupIcon('eye-off', { doc, className: 'tj-icon tj-icon--sm' }), el('span', { className: 'tj-popup__entry-text', text: ENTRY_TEXT.hidden, doc }), show],
      doc,
    });
  }

  /** @param {import('../../core/model/prefs.js').Prefs | null} prefs */
  function render(prefs) {
    if (entryHidden(prefs)) {
      // أُخفي الزر ثانيةً بعد إظهاره من هنا: تُمحى النتيجة السابقة وحدها؛ ورسالة فشل إظهارٍ جارٍ تبقى ما دام الصف باقيًا.
      if (done) {
        done = false;
        live.replaceChildren();
      }
      if (!slot.children.length) slot.replaceChildren(row());
      return;
    }
    slot.replaceChildren();
    // ما بعد الإظهار الناجح من هنا: سطر النتيجة يبقى ظاهرًا، ويُمحى ما عداه (لم يكن مخفيًا أصلًا).
    if (!done) live.replaceChildren();
  }

  async function sync() {
    let prefs = null;
    try {
      prefs = await store.getPrefs();
    } catch {
      prefs = null; // التفضيلات غير مقروءة الآن: لا صف (لا نعلن إخفاءً لا نعرفه)
    }
    render(prefs);
  }

  async function showEntry() {
    if (busy) return;
    busy = true;
    const btn = slot.querySelector('[data-action="show-entry"]');
    btn?.setAttribute('aria-busy', 'true');
    live.replaceChildren();
    try {
      const next = await store.setPrefs({ ui: { panelEntry: true } });
      if (!entryHidden(next)) {
        done = true;
        slot.replaceChildren();
        live.replaceChildren(el('p', { className: 'tj-popup__result tj-popup__result--ok', children: [popupIcon('check', { doc, className: 'tj-icon tj-icon--sm' }), el('span', { text: ENTRY_TEXT.done, doc })], doc }));
      } else {
        live.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_SAVE_FAILED'), doc }));
      }
    } catch {
      live.replaceChildren(alertBox({ tone: 'danger', text: messageFor('PG_SAVE_FAILED'), doc }));
    } finally {
      busy = false;
      btn?.removeAttribute('aria-busy');
    }
  }

  const off = store.onChange((change) => {
    if (change.prefs || change.cleared) sync();
  });
  const ready = sync();
  return { ready, sync, dispose: off };
}
