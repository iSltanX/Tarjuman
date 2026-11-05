// TJ-14 (DeepSeek ED-005): مسودة زمن غير صالحة وحدها. الرأس والشريط السفلي والحوارات وحارس المغادرة.
import { log, mounted, textOf, openDialogEl } from './harness.mjs';

const m = await mounted();
const S = m.editor.state;
const f = m.field(0, 'start');
f.focus();
f.value = '00:00:xx';
f.dispatchEvent({ type: 'change' });
await m.env.flush();
log('dirty =', S.session.dirty, '| hasDrafts =', S.session.hasDrafts, '| errors =', S.session.issues().errors, '| changedCount =', S.session.changedCount);
log('شارة الرأس:', JSON.stringify(textOf(m.env.root.querySelector('.ed-status'))), '| الشريط السفلي مخفي؟', m.env.root.querySelector('.ed-unsaved').hidden, '| عنوان التبويب:', JSON.stringify(m.env.doc.title));
log('beforeunload يمنع؟', m.fireWin('beforeunload').defaultPrevented);
const p = m.editor.switchSlot(2);
await m.env.flush();
const d = openDialogEl(m.env);
log('حوار التبديل:', JSON.stringify(textOf(d.querySelector('p'))));
d.close('stay');
await p;
