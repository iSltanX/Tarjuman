// المحرّر (P8 ثم P14): يُفتح بعنوان pages/editor/index.html?v=VIDEO_ID من نافذة الأيقونة والمحفوظات، ويقرأ v
// بـvideoParam، و&t=2 لخانة تحرير محددة (وبدونها النشطة)، و&p=complete ليُفتح على لوحة «الاستكمال» (ف1). التركيب كله في app.js.
import { createStore } from '../../core/store/index.js';
import { videoParam } from '../../core/model/ids.js';
import { t } from '../../i18n/index.js';
import { startPage } from '../../ui/page.js';
import { mountEditor } from './app.js';
import { panelParam, slotParam } from './persist.js';

startPage({
  title: () => t('common.nav.editor'),
  wide: true,
  // المحرّر لا يعيد التحميل عند تبديل اللغة (تعديلات غير محفوظة وسجل تراجع في الذاكرة): relocalize تبدّل نصوصه في مكانها.
  render: async (app, page) => {
    const api = await mountEditor(app, { videoId: videoParam(location.search), slot: slotParam(location.search), panel: panelParam(location.search), store: createStore(), doc: document });
    if (api) page.relocalize = api.relocalize;
  },
});
