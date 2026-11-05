// TJ-10 (DeepSeek ED-003): زمن مكتوب في حقل لم يُغادَر.
// المسار ١: beforeunload لا يعتمده (U19). المسار ٢: حفظ بطيء والمستخدم يكتب في حقل زمن أثناءه، ثم يكتمل الحفظ فيُعاد رسم الصف بالقوة.
import { log, mounted, settle } from './harness.mjs';

// ---- المسار ١ ----
{
  const m = await mounted();
  const f = m.field(0, 'start');
  f.focus();
  f.value = '00:00:03,250';
  const e = m.fireWin('beforeunload');
  log('[١] زمن مكتوب بلا مغادرة: dirty =', m.editor.state.session.dirty, '| hasDrafts =', m.editor.state.session.hasDrafts, '| beforeunload يمنع؟', e.defaultPrevented);
  const ta = m.field(1, 'text');
  ta.focus();
  ta.value = `${ta.value} س`;
  ta.dispatchEvent({ type: 'input' });
  log('[١ ضابط] نص مكتوب: beforeunload يمنع؟', m.fireWin('beforeunload').defaultPrevented);
}

// ---- المسار ٢ ----
async function slowSave(label, typeDuring) {
  const gate = { paused: false, release: null };
  const wrap = (store) => ({
    ...store,
    updateBundle: async (...args) => {
      if (gate.paused) await new Promise((r) => { gate.release = r; });
      return store.updateBundle(...args);
    },
  });
  const m = await mounted({ wrap });
  // تعديل نص في مقطع آخر ليكون هناك ما يُحفظ.
  const ta = m.field(2, 'text');
  ta.focus();
  ta.value = `${ta.value} ح`;
  ta.dispatchEvent({ type: 'input' });
  await m.env.flush();
  gate.paused = true;
  const saving = m.editor.save();
  await settle();
  const versionBefore = m.editor.state.session.version;
  const f = m.field(0, 'end');
  await typeDuring(m, f);
  log(`[٢-${label}] أثناء الحفظ: قيمة الحقل المركّز =`, JSON.stringify(f.value), '| العنصر المركّز هو الحقل؟', m.env.doc.activeElement === f, '| تغيّرت نسخة الجلسة؟', m.editor.state.session.version !== versionBefore);
  gate.paused = false;
  gate.release?.();
  await saving;
  await m.env.flush();
  const f2 = m.field(0, 'end');
  log(`[٢-${label}] بعد اكتمال الحفظ: الحقل نفسه؟`, f2 === f, '| قيمته =', JSON.stringify(f2.value), '| ما زال مركّزًا؟', m.env.doc.activeElement === f2,
    '| dirty =', m.editor.state.session.dirty, '| hasDrafts =', m.editor.state.session.hasDrafts, '| نهاية المقطع 1 في الجلسة =', m.editor.state.session.cueAt(0).endMs);
  const e = m.fireWin('beforeunload');
  log(`[٢-${label}] ثم إغلاق التبويب: beforeunload يمنع؟`, e.defaultPrevented);
}
await slowSave('زمن بلا مغادرة', async (m, f) => { f.focus(); f.value = '00:00:08,750'; });
await slowSave('ضابط: نص في مقطع آخر', async (m) => {
  const t = m.field(1, 'text');
  t.focus();
  t.value = `${t.value} أثناء`;
  t.dispatchEvent({ type: 'input' });
});
