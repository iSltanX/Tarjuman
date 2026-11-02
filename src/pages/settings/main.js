// الإعدادات (P7): تركيب الصفحة في المتصفح وحده: التخزين الحقيقي والحافظة بضغطة المستخدم وإصدار البيان.
// المنطق كله في view.js وmodel.js وdiagnostics.js. خطوط المعاينة من ملفات الإضافة (fonts.css)، وخطوط الصفحة لا تتغير.
import { createStore } from '../../core/store/index.js';
import { extensionVersion, startPage } from '../../ui/page.js';
import { collectDiagnostics } from './diagnostics.js';
import { createSettings } from './view.js';

startPage({
  title: 'الإعدادات',
  nav: 'settings',
  wide: true,
  async render(app) {
    const store = createStore();
    const version = extensionVersion();
    const settings = createSettings({
      store, version,
      clipboardWrite: (text) => navigator.clipboard.writeText(text),
      diagnosticsText: () => collectDiagnostics({ store, version }),
    });
    app.append(settings.root);
    await settings.load();
  },
});
