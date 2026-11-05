// ملاحظات في evidence/agents/editor/FINDINGS.md («ثانيًا») لم تنتقل إلى التقرير: تحقق منها.
// (س١) التراجع بعد الحفظ العادي يضيع ويبقى بعد markSaved. (س٥) علامتان على مقطعين دُمجا. (س٨) النقل الكلي والتثبيت يمسحان مسودات الزمن.
import { ROOT, log, mounted, settle, makeCues } from './harness.mjs';

const { createEditSession } = await import(`${ROOT}/src/core/edit/session.js`);
const { resolveSlotMarks, planMarkToggle } = await import(`${ROOT}/src/core/edit/review.js`);
const { markOn } = await import(`${ROOT}/test/helpers/fixtures-v2.js`);

// (س١)
{
  const m = await mounted();
  const ta = m.field(1, 'text');
  ta.focus();
  ta.value = `${ta.value} أ`;
  ta.dispatchEvent({ type: 'input' });
  await m.editor.save();
  await m.env.flush();
  log('[س١] بعد حفظ عادي: canUndo =', m.editor.state.session.canUndo);
  const gate = { paused: false, release: null };
  const m2 = await mounted({ wrap: (store) => ({ ...store, updateBundle: async (...a) => { if (gate.paused) await new Promise((r) => { gate.release = r; }); return store.updateBundle(...a); } }) });
  const t2 = m2.field(1, 'text');
  t2.focus();
  t2.value = `${t2.value} أ`;
  t2.dispatchEvent({ type: 'input' });
  gate.paused = true;
  const p = m2.editor.save();
  await settle();
  m2.editor.state.session.setText(3, 'أثناء الحفظ');
  gate.paused = false;
  gate.release?.();
  await p;
  await m2.env.flush();
  log('[س١] بعد حفظ كُتب أثناءه (markSaved): canUndo =', m2.editor.state.session.canUndo, '| historySize =', m2.editor.state.session.historySize);
}

// (س٥)
{
  const cues = makeCues(5, { text: (i) => `نص ${i}` });
  const marks = [markOn(cues[1], 'todo'), markOn(cues[2], 'done')];
  const s = createEditSession({ cues });
  s.merge(1);
  const shown = s.snapshot();
  const r = resolveSlotMarks(marks, shown, { opened: null });
  log('[س٥] بعد دمج المقطعين 2 و3 (معلَّمين): byIndex =', r.byIndex.size, '| يتيمة =', r.orphans.length, '| all =', JSON.stringify(r.all.map((x) => ({ kind: x.mark.kind, state: x.state, index: x.index }))));
  const t = planMarkToggle(r, shown, 1, null, new Date().toISOString());
  log('[س٥] إزالة علامة المقطع المدموج تزيل:', t.remove.length, 'علامة (المحجوبة معها)');
}

// (س٨)
{
  const s = createEditSession({ cues: makeCues(3), offsetMs: 500 });
  s.setDraft(1, 'end', '00:00:0x');
  log('[س٨] مسودة زمن: hasDrafts =', s.hasDrafts);
  s.shift({ kind: 'all' }, 100);
  log('[س٨] بعد نقل الملف كله +0.1: hasDrafts =', s.hasDrafts);
  s.undo();
  log('[س٨] بعد التراجع عن النقل: hasDrafts =', s.hasDrafts, '(المسودة لا تعود)');
  s.setDraft(0, 'start', 'abc');
  s.commitOffset();
  log('[س٨] مسودة ثم «تثبيت الإزاحة»: hasDrafts =', s.hasDrafts);
}
