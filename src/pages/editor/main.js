// المحرّر — بديل P2 المؤقت (تملكه P8): يقرأ v من العنوان (editor/index.html?v=VIDEO_ID) ويعرض حالة السجل.
import { createStore } from '../../core/store/index.js';
import { messageFor } from '../../core/errors/index.js';
import { videoParam } from '../../core/model/ids.js';
import { alertBox, el, ltr, statusPill } from '../../ui/components.js';
import { COUNT_FORMS, formatCount, formatOffset } from '../../ui/format.js';
import { startPage } from '../../ui/page.js';

startPage({
  title: 'المحرّر',
  wide: true,
  async render(app) {
    const v = videoParam(location.search);
    app.append(el('header', { className: 'tj-row', children: [el('h1', { className: 'tj-h1', text: 'المحرّر' }), v ? ltr(v) : null, statusPill({ tone: 'info', text: 'أساس مؤقت' })] }));
    if (!v) {
      app.append(alertBox({ tone: 'danger', title: 'تعذّر فتح المحرّر', text: messageFor('TJ_BAD_VIDEO_ID') }));
      return;
    }
    const rec = await createStore().getVideo(v);
    if (!rec?.arabic) {
      app.append(alertBox({ tone: 'info', text: messageFor('ST_NO_RECORD') }));
      return;
    }
    const cues = rec.arabic.current ?? rec.arabic.original;
    app.append(el('p', { className: 'tj-h4 tj-auto', text: rec.title ?? v }));
    app.append(el('p', { className: 'tj-body-sm', text: `${formatCount(cues.length, COUNT_FORMS.cue)} · إزاحة العرض ${formatOffset(rec.view.displayOffsetMs)} ث` }));
  },
});
