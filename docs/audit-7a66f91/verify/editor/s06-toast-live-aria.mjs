// M-14: زر «تراجع» في الرسالة العابرة بعد اختفائها. L-28: المناطق الحية تُعاد كتابتها مع كل ضغطة. L-30: خطأ حقل النص غير مربوط به.
import { mounted, log, textOf, findAll } from './harness.mjs';

{
  const { editor, env, store, videoId, row } = await mounted();
  const toast = env.root.querySelector('.ed-toast');
  log('[M-14] الرسالة العابرة: role =', toast.getAttribute('role'), '| aria-live =', toast.getAttribute('aria-live'), '| داخل الرأس؟', toast.parentNode === env.root.querySelector('.ed-head'));
  row(1).querySelector('[data-act="mark"]').click();
  await env.flush(1);
  const btn = toast.querySelector('button');
  log('[M-14] بعد تبديل علامة: النص =', JSON.stringify(textOf(toast)), '| زر:', Boolean(btn));
  await env.flush(4); // تمضي مهلة 7 ث (المؤقتات الوهمية)
  log('[M-14] بعد المهلة: is-shown؟', toast.classList.contains('is-shown'), '| الزر في الـDOM؟', toast.contains(btn), '| hidden =', btn.hidden, '| inert =', btn.getAttribute('inert'), '| tabindex =', btn.getAttribute('tabindex'), '| aria-hidden =', toast.getAttribute('aria-hidden'));
  const names = findAll(env.root.querySelector('.ed-head'), (e) => e.tagName === 'button').map((b) => b.getAttribute('aria-label') ?? textOf(b));
  log('[M-14] أزرار الرأس بترتيب الـDOM (آخر أربعة):', names.slice(-4).join(' | '), '| عدد الأزرار باسم «تراجع»:', names.filter((x) => x === 'تراجع').length);
  const before = (await store.getBundle(videoId)).slots[0].marks.length;
  btn.click();
  await env.flush(4);
  const after = (await store.getBundle(videoId)).slots[0].marks.length;
  log('[M-14] تفعيل الزر غير الظاهر (Enter بعد Tab): العلامات المحفوظة', before, '→', after, '| النص الظاهر الآن:', JSON.stringify(textOf(toast)), '| is-shown؟', toast.classList.contains('is-shown'));
}

{
  const { editor, env, field } = await mounted();
  const status = env.root.querySelector('.ed-status');
  const notice = env.root.querySelector('.ed-notice');
  const result = env.root.querySelector('.ed-result');
  log('[L-28] أدوار: status =', status.getAttribute('role'), '| notice =', notice.getAttribute('role'), '| result =', result.getAttribute('role'), result.getAttribute('aria-live'));
  const ta = field(0, 'text');
  ta.focus();
  const type = async (ch) => { ta.value += ch; ta.dispatchEvent({ type: 'input' }); await env.flush(); };
  await type('ا');
  const a = { pill: status.childNodes[0], txt: textOf(status), nNode: notice.childNodes[0], nTxt: textOf(notice) };
  await type('ب');
  const b = { pill: status.childNodes[0], txt: textOf(status), nNode: notice.childNodes[0], nTxt: textOf(notice) };
  log('[L-28] شارة الحالة (role=status):', JSON.stringify(a.txt), '→', JSON.stringify(b.txt), '| عقدة جديدة بالنص نفسه؟', a.pill !== b.pill);
  log('[L-28] تنبيه الإزاحة (role=alert): مخفي؟', notice.hidden, '| النص', JSON.stringify(b.nTxt), '| عقدة نص جديدة بالنص نفسه؟', a.nNode !== b.nNode && a.nTxt === b.nTxt);
  editor.state.result = { tone: 'success', text: 'نتيجة سابقة' };
  field(1, 'text').dispatchEvent({ type: 'focusin' });
  const r1 = result.childNodes[0];
  field(2, 'text').dispatchEvent({ type: 'focusin' });
  const r2 = result.childNodes[0];
  log('[L-28] سطر النتيجة (role=status) عند تنقّل التركيز بين صفين: عقدة نص جديدة بالنص نفسه؟', r1 !== r2, JSON.stringify(textOf(result)));
}

{
  const { editor, env, field, row } = await mounted();
  const ta = field(0, 'text');
  ta.focus();
  ta.value = '';
  ta.dispatchEvent({ type: 'input' });
  await env.flush();
  const issues = editor.state.session.issues().byIndex.get(0) ?? [];
  const msg = row(0).querySelector('.ed-row__msg');
  log('[L-30] مشكلات المقطع 1 بعد تفريغ النص:', issues.map((x) => `${x.code}/${x.field}/${x.tone}`).join(', '), '| الرسالة:', JSON.stringify(textOf(msg)), 'id =', msg.id, 'hidden =', msg.hidden);
  log('[L-30] textarea: aria-describedby =', ta.getAttribute('aria-describedby'), '| aria-invalid =', ta.getAttribute('aria-invalid'));
  const st = field(0, 'start');
  log('[L-30] للمقارنة حقل البداية: aria-describedby =', st.getAttribute('aria-describedby'), '| aria-invalid =', st.getAttribute('aria-invalid'));
}
