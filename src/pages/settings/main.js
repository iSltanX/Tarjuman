// الإعدادات (P7 ثم P13): تركيب الصفحة في المتصفح وحده: التخزين الحقيقي والحافظة بضغطة المستخدم وإصدار البيان، والحفظ
// عبر saveFile (يتبع مكان الحفظ المختار)، والمكان الفعلي لآخر ملف من سجل المتصفح وحده، ومنتقي ملف النسخة الاحتياطية.
// المنطق كله في view.js وmodel.js وdata.js وglossary.js وlocation.js وdiagnostics.js. خطوط المعاينة من ملفات الإضافة.
import { buildTarget, needsConsent, requestThumbnailsConsent, thumbnailsConsent, watchThumbnailsConsent } from '../../core/consent/thumbnails.js';
import { saveFile, savedPath } from '../../core/save/index.js';
import { createStore } from '../../core/store/index.js';
import { t } from '../../i18n/index.js';
import { copyText } from '../../ui/clipboard.js';
import { extensionVersion, startPage } from '../../ui/page.js';
import { pickFiles } from '../../ui/picker.js';
import { collectDiagnostics } from './diagnostics.js';
import { createSettings } from './view.js';

/** منتقي ملف JSON واحد داخل ضغطة المستخدم، ملحقًا بالمستند ما دام مفتوحًا (I03)؛ null عند الإلغاء. */
const pickFile = () => pickFiles({ accept: '.json,application/json' }).then((files) => files?.[0] ?? null);

startPage({
  title: () => t('common.nav.settings'),
  nav: 'settings',
  wide: true,
  async render(app) {
    const store = createStore();
    const version = extensionVersion();
    const target = buildTarget();
    const settings = createSettings({
      store, version,
      // النص الجاهز بـwriteText، ووعد التقرير بـClipboardItem في النقرة نفسها (B1).
      clipboardWrite: (text) => copyText(text),
      diagnosticsText: () => collectDiagnostics({ store, version }),
      saveFile: (file) => saveFile(file, { store }),
      savedPath: (id) => savedPath(id),
      pickFile: () => pickFile(),
      // صور المحفوظات في Firefox بموافقة «نشاط التصفح» (core/consent/thumbnails.js)؛ وفي Chromium بالمفتاح وحده.
      thumbsConsent: {
        needed: needsConsent(target),
        check: () => thumbnailsConsent(chrome, target),
        request: () => requestThumbnailsConsent(chrome, target),
        watch: (fn) => watchThumbnailsConsent(chrome, target, fn),
      },
    });
    app.append(settings.root);
    await settings.load();
  },
});
