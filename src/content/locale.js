// لغة الواجهة على صفحة يوتيوب: يقرأ المحفوظ، وإن غاب يهيّئه من لغة واجهة يوتيوب الفعلية، ثم يطلب من العناصر المركّبة إعادة بناء نصوصها.
// اللغة واتجاهها يخصان عناصر ترجمان وحدها: لا يُلمس lang ولا dir على صفحة يوتيوب.
import { bootLocale, watchLocale } from '../ui/locale.js';
import { youtubeUiLanguage } from '../player/youtube-dom.js';

/**
 * @param {Document} doc @returns {Promise<string | null>} html[lang]، وعند document_start قد لا يكون كُتب بعد فيُنتظر DOMContentLoaded
 */
async function readYoutubeLanguage(doc) {
  const now = youtubeUiLanguage(doc);
  if (now || doc.readyState !== 'loading') return now;
  await new Promise((resolve) => { doc.addEventListener('DOMContentLoaded', resolve, { once: true }); });
  return youtubeUiLanguage(doc);
}

/**
 * @param {{
 *   store: Parameters<typeof bootLocale>[0]['store'] & Parameters<typeof watchLocale>[0],
 *   mounted: Record<string, { relocalize?: () => void } | undefined>, doc?: Document
 * }} o
 * @returns {{ ready: Promise<'ar' | 'en'>, dispose: () => void }}
 */
export function installContentLocale({ store, mounted, doc = document }) {
  const relocalize = () => {
    for (const handle of Object.values(mounted)) handle?.relocalize?.();
  };
  const ready = bootLocale({ store, youtube: () => readYoutubeLanguage(doc) }).then((locale) => {
    relocalize();
    return locale;
  });
  const dispose = watchLocale(store, relocalize);
  return { ready, dispose };
}
