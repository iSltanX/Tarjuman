// المحرّر (تملكه P8): يُفتح بعنوان pages/editor/index.html?v=VIDEO_ID من نافذة الأيقونة والمحفوظات، ويقرأ v
// بـvideoParam. التركيب كله في app.js.
import { createStore } from '../../core/store/index.js';
import { videoParam } from '../../core/model/ids.js';
import { startPage } from '../../ui/page.js';
import { mountEditor } from './app.js';

startPage({
  title: 'المحرّر',
  wide: true,
  render: (app) => mountEditor(app, { videoId: videoParam(location.search), store: createStore(), doc: document }),
});
