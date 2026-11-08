// المحرّر (P8 ثم P14): يُفتح بعنوان pages/editor/index.html?v=VIDEO_ID من نافذة الأيقونة والمحفوظات، ويقرأ v
// بـvideoParam، و&t=2 لخانة تحرير محددة (وبدونها النشطة). التركيب كله في app.js.
import { createStore } from '../../core/store/index.js';
import { videoParam } from '../../core/model/ids.js';
import { t } from '../../i18n/index.js';
import { startPage } from '../../ui/page.js';
import { mountEditor } from './app.js';
import { slotParam } from './persist.js';

startPage({
  title: () => t('common.nav.editor'),
  wide: true,
  render: (app) => mountEditor(app, { videoId: videoParam(location.search), slot: slotParam(location.search), store: createStore(), doc: document }),
});
