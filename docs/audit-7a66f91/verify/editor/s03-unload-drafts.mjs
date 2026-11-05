// M-5: زمن مكتوب في حقل لم يُغادَر (بلا change) ثم beforeunload. وCL-X6: مسودة زمن غير صالح وحدها.
import { mounted, log, textOf, openDialogEl } from './harness.mjs';

{
  const { editor, env, fireWin, field, store, videoId } = await mounted();
  const S = editor.state;
  const inp = field(1, 'start');
  inp.focus();
  const was = inp.value;
  inp.value = '00:00:03,250';
  const e = fireWin('beforeunload');
  log('[M-5] الزمن', was, '← كُتب', inp.value, 'بلا مغادرة | dirty =', S.session.dirty, '| hasDrafts =', S.session.hasDrafts, '| beforeunload يحذّر؟', e.defaultPrevented);
  fireWin('pagehide');
  await env.flush();
  const saved = await store.getBundle(videoId);
  log('[M-5] بعد pagehide: المحفوظ startMs =', saved.slots[0].track.current[1].startMs, '| الجلسة', S.session.cueAt(1).startMs);
  // للمقارنة: ⌘S والمغادرة بزر «المحفوظات» يعتمدان الحقل المركّز (commitFocusedTime).
  const ta = field(2, 'text');
  ta.focus();
  ta.value = `${ta.value} زيادة`;
  ta.dispatchEvent({ type: 'input' });
  log('[M-5] للمقارنة: كتابة نص ثم beforeunload يحذّر؟', fireWin('beforeunload').defaultPrevented);
}

{
  const { editor, env, field } = await mounted();
  const S = editor.state;
  const inp = field(1, 'end');
  inp.focus();
  inp.value = '00:00:0x,000';
  inp.dispatchEvent({ type: 'change' });
  await env.flush();
  log('[CL-X6] بعد زمن غير صالح وحده: dirty =', S.session.dirty, '| hasDrafts =', S.session.hasDrafts, '| errors =', S.session.issues().errors);
  log('[CL-X6] شارة الرأس:', JSON.stringify(textOf(env.root.querySelector('.ed-status'))), '| شريط «غير محفوظ» مخفي؟', env.root.querySelector('.ed-unsaved').hidden,
    '| عنوان التبويب:', JSON.stringify(env.doc.title));
  const save = env.root.querySelector('.ed-head .tj-btn--primary');
  log('[CL-X6] زر الحفظ معطّل بسبب:', JSON.stringify(save.title), '| aria-disabled =', save.getAttribute('aria-disabled'), '| نص الزر:', JSON.stringify(textOf(save)));
  const p = editor.switchSlot(2);
  await env.flush();
  const d = openDialogEl(env);
  log('[CL-X6] حوار التبديل:', JSON.stringify(textOf(d.querySelector('p'))));
  d.close('stay');
  await p;
  await env.flush();
  const back = env.root.querySelector('.ed-back');
  // goLibrary: confirmLeave بنص ED_LEAVE_UNSAVED
  const g = back.click();
  await env.flush();
  const d2 = openDialogEl(env);
  log('[CL-X6] حوار «المحفوظات»:', d2 ? JSON.stringify(textOf(d2.querySelector('p'))) : 'لا حوار');
  d2?.close('stay');
}
