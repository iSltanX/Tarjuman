// TJ-AUD-002a / H-2: Ctrl+Z وCtrl+Shift+Z وCtrl+Y داخل حقل البحث (type=search).
// TJ-AUD-002b: Ctrl+Z بعد الدمج والشطر واعتماد الزمن بـEnter (التركيز في textarea أو input نصي).
import { mounted, log, textOf } from './harness.mjs';

{
  const { editor, env, key, field } = await mounted();
  const S = editor.state;
  const before = S.session.cueAt(0).text;
  const ta = field(0, 'text');
  ta.focus();
  ta.value = `${before} تعديل-أ`;
  ta.dispatchEvent({ type: 'input' });
  ta.dispatchEvent({ type: 'focusout' });
  await env.flush();
  log('[002a] بعد تعديل المقطع 1:', JSON.stringify(S.session.cueAt(0).text), '| dirty =', S.session.dirty);
  const [searchIn, replaceIn] = env.root.querySelectorAll('.ed-search__input');
  log('[002a] نوع حقل البحث =', searchIn.getAttribute('type'), '| نوع حقل الاستبدال =', replaceIn.getAttribute('type'));
  let e = key(replaceIn);
  await env.flush();
  log('[002a] Ctrl+Z في حقل الاستبدال (text): المقطع =', JSON.stringify(S.session.cueAt(0).text), '| منع السلوك الأصلي؟', e.defaultPrevented);
  searchIn.focus();
  searchIn.value = 'صباح';
  e = key(searchIn);
  await env.flush();
  log('[002a] Ctrl+Z في حقل البحث (search): المقطع =', JSON.stringify(S.session.cueAt(0).text), '| منع السلوك الأصلي؟', e.defaultPrevented,
    '| نص البحث =', JSON.stringify(searchIn.value), '| dirty =', S.session.dirty, '| سطر النتيجة =', JSON.stringify(textOf(env.root.querySelector('.ed-result'))));
  e = key(searchIn, { shift: true });
  await env.flush();
  log('[002a] Ctrl+Shift+Z في حقل البحث: المقطع =', JSON.stringify(S.session.cueAt(0).text), '| منع؟', e.defaultPrevented);
  e = key(searchIn);
  await env.flush();
  e = key(searchIn, { code: 'KeyY' });
  await env.flush();
  log('[002a] Ctrl+Y في حقل البحث بعد Ctrl+Z: المقطع =', JSON.stringify(S.session.cueAt(0).text), '| منع؟', e.defaultPrevented);
}

{
  const { editor, env, key, row } = await mounted();
  const S = editor.state;
  const n0 = S.session.count;
  row(0).querySelector('[data-act="merge"]').click();
  await env.flush();
  const a = env.doc.activeElement;
  log('[002b] بعد الدمج: العدد', n0, '→', S.session.count, '| canUndo =', S.session.canUndo, '| المركّز:', a.tagName, a.getAttribute('data-field'), '| النتيجة:', JSON.stringify(S.result?.text));
  log('[002b] تلميح زر التراجع:', JSON.stringify(env.root.querySelector('.ed-undo').title));
  const e = key(a);
  await env.flush();
  log('[002b] Ctrl+Z والتركيز في نص الصف بعد الدمج: العدد =', S.session.count, '(لم يُتراجع عن الدمج؟', S.session.count === n0 - 1, ') | منع الأصلي؟', e.defaultPrevented);
  env.root.querySelector('.ed-undo').click();
  await env.flush();
  log('[002b] زر «تراجع» نفسه بعد ذلك: العدد =', S.session.count);
}

{
  const { editor, env, key, field, row } = await mounted();
  const S = editor.state;
  const ta = field(1, 'text');
  ta.focus();
  ta.dispatchEvent({ type: 'focusin' });
  ta.selectionStart = 3;
  ta.dispatchEvent({ type: 'keyup' });
  const n0 = S.session.count;
  row(1).querySelector('[data-act="split"]').click();
  await env.flush();
  const a = env.doc.activeElement;
  log('[002b] بعد الشطر: العدد', n0, '→', S.session.count, '| المركّز:', a.tagName, a.getAttribute('data-field'));
  const e = key(a);
  await env.flush();
  log('[002b] Ctrl+Z بعد الشطر: العدد =', S.session.count, '| منع الأصلي؟', e.defaultPrevented);
}

{
  const { editor, env, key, field } = await mounted();
  const S = editor.state;
  const inp = field(2, 'start');
  inp.focus();
  const was = inp.value;
  inp.value = '00:00:06,250';
  inp.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
  await env.flush();
  log('[002b] اعتماد زمن بـEnter:', was, '→', S.session.cueAt(2).startMs, 'ms | المركّز ما زال الحقل؟', env.doc.activeElement === inp, '| نوعه', inp.type);
  const e = key(inp);
  await env.flush();
  log('[002b] Ctrl+Z في حقل الزمن بعد الاعتماد: startMs =', S.session.cueAt(2).startMs, '| منع الأصلي؟', e.defaultPrevented, '(يُترك للمتصفح)');
}
