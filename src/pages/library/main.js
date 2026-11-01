// المحفوظات (P7): تركيب الصفحة في المتصفح وحده: التخزين الحقيقي، وفتح التبويبات بـchrome.tabs.create (لا يحتاج إذن tabs)،
// والتنزيل المحلي بـBlob، والحافظة بضغطة المستخدم، ومنتقي الملفات. المنطق كله في view.js وactions.js وmodel.js.
import { download } from '../../core/export/index.js';
import { createStore } from '../../core/store/index.js';
import { extensionVersion, openPage, startPage } from '../../ui/page.js';
import { collectDiagnostics } from '../settings/diagnostics.js';
import { createLibrary } from './view.js';

/** منتقي ملفات SRT (أو أجزاؤها): يُنشأ ويُنقر داخل ضغطة المستخدم، ويعيد null عند الإلغاء. */
function pickFiles(doc = document) {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.srt,.txt,text/plain,application/x-subrip';
    input.addEventListener('change', () => resolve(input.files && input.files.length ? Array.from(input.files) : null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

startPage({
  title: 'المحفوظات',
  wide: true,
  async render(app) {
    const store = createStore();
    const lib = createLibrary({
      store,
      openTab: (url) => chrome.tabs.create({ url }),
      openPage,
      download,
      clipboardWrite: (text) => navigator.clipboard.writeText(text),
      pickFiles: () => pickFiles(),
      diagnosticsText: () => collectDiagnostics({ store, version: extensionVersion() }),
    });
    app.append(lib.root);
    await lib.load();
  },
});
