// «مكان حفظ ملفات الترجمة» (R65، P13-AC8، مواصفة التصميم §١٩.٨): أول بند في بطاقة «التصدير». الأوضاع الثلاثة والافتراضي
// مجلد التنزيلات كالسلوك الحالي، واسم المجلد الفرعي بتحقق (معطّل إلا في وضعه)، و«استعادة الافتراضي»، وسطر المكان المختار
// وصفًا للإعداد، و«آخر ملف حُفظ» من سجل المتصفح وحده لملف نزّله ترجمان واكتمل ووُجد؛ وإلا لا يُعرض مسار. لا مسار يُخزَّن.
import { t } from '../../i18n/index.js';
import { messageFor } from '../../core/errors/index.js';
import { DEFAULT_PREFS } from '../../core/model/prefs.js';
import { button, choiceGroup, el, ltr } from '../../ui/components.js';
import { DEFAULT_SUBFOLDER, SAVE_LOCATIONS, saveLocationNote, isDefaultLocation, parseFolder } from './model.js';

/**
 * @param {{
 *   doc: Document, getPrefs: () => import('../../core/model/prefs.js').Prefs,
 *   savePrefs: (patch: object, mark: { flash: Function }) => Promise<unknown>,
 *   mark: { root: HTMLElement, flash: (text: string, tone?: string) => void },
 *   lastSavePath: () => Promise<string | null>,
 * }} o
 * @returns {{ root: HTMLElement, sync: (force?: boolean) => void, refreshLast: () => Promise<void> }}
 */
export function saveLocationControl({ doc, getPrefs, savePrefs, mark, lastSavePath }) {
  const folderId = 'st-subfolder';
  const folderError = el('span', { className: 'tj-field__error', attrs: { id: `${folderId}-error`, role: 'alert' }, doc });
  folderError.hidden = true;
  const folder = el('input', {
    className: 'tj-field__input tj-field__input--mono st-subfolder',
    attrs: { id: folderId, 'data-tj-keep': 'settings.subfolder', type: 'text', 'aria-label': t('settings.location.folderName'), autocomplete: 'off', spellcheck: 'false', placeholder: DEFAULT_SUBFOLDER, maxlength: '60' },
    dir: 'ltr', doc,
  });
  const setFolderError = (code) => {
    folderError.textContent = code ? messageFor(code) : '';
    folderError.hidden = !code;
    folder.setAttribute('aria-invalid', code ? 'true' : 'false');
    if (code) folder.setAttribute('aria-describedby', folderError.id);
    else folder.removeAttribute('aria-describedby');
  };
  folder.addEventListener('change', async () => {
    const parsed = parseFolder(folder.value);
    if (!parsed.ok) {
      setFolderError(parsed.code);
      return;
    }
    setFolderError(null);
    folder.value = parsed.value;
    if (parsed.value !== getPrefs().saveLocation.folder) await savePrefs({ saveLocation: { folder: parsed.value } }, mark);
  });
  const folderBox = el('span', { className: 'st-subfolder-box', children: [folder, folderError], doc });

  const group = choiceGroup({
    legend: t('settings.export.where'), value: getPrefs().saveLocation.mode, doc,
    options: SAVE_LOCATIONS.map((o) => ({ value: o.value, label: o.label, hint: o.hint, extra: o.value === 'subfolder' ? folderBox : null })),
    onChange: (mode) => savePrefs({ saveLocation: { mode } }, mark),
  });
  const lastPath = el('span', { className: 'st-last-save__path', doc });
  const last = el('p', { className: 'tj-caption st-last-save', children: [t('settings.location.last'), lastPath], doc });
  last.hidden = true;
  // اسم وصول يميّزه عن «استعادة الافتراضي» في رأس القسم (كانا باسم واحد؛ تدقيق 7a66f91، U58).
  const reset = button({
    label: t('settings.location.reset'), variant: 'ghost', size: 'sm', icon: 'restore', className: 'st-location__reset', doc,
    onClick: () => {
      if (isDefaultLocation(getPrefs().saveLocation)) return;
      setFolderError(null);
      savePrefs({ saveLocation: structuredClone(DEFAULT_PREFS.saveLocation) }, mark);
    },
  });

  reset.setAttribute('aria-label', t('settings.location.reset'));

  function sync(force = false) {
    const loc = getPrefs().saveLocation;
    group.set(loc.mode);
    folder.disabled = loc.mode !== 'subfolder';
    if (force || doc.activeElement !== folder) {
      folder.value = loc.folder;
      if (force) setFolderError(null);
    }
    const isDefault = isDefaultLocation(loc);
    reset.setAttribute('aria-disabled', isDefault ? 'true' : 'false');
    reset.title = isDefault ? t('settings.location.resetDefault') : '';
  }

  async function refreshLast() {
    let path = null;
    try {
      path = await lastSavePath();
    } catch {
      path = null;
    }
    lastPath.replaceChildren(...(path ? [ltr(path, { mono: false, doc })] : []));
    last.hidden = !path;
  }

  const root = el('div', {
    className: 'st-location',
    children: [group.root, last, el('p', { className: 'tj-caption st-note', text: saveLocationNote(), doc }), el('div', { className: 'st-actions', children: [reset], doc })],
    doc,
  });
  return { root, group, folder, sync, refreshLast };
}
