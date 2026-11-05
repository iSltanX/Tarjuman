// TJ-13 (DeepSeek ED-002): committedMs مشتق من undoStack المحدود بـ200.
// (أ) بعد markSaved يبقى (U24)، بقيمة للمشغّل تختلف عن المثبّت: تعارض زائف وإزاحة مطبَّقة غير المعروضة.
// (ب) جديد: بعد أكثر من 200 خطوة تسقط خطوة التثبيت فيصير committedMs = 0 والتثبيت غير محفوظ بعد: تُطبَّق الإزاحة مرتين.
import { ROOT, log, mounted, settle } from './harness.mjs';

const { createEditSession } = await import(`${ROOT}/src/core/edit/session.js`);
const { planRescue } = await import(`${ROOT}/src/core/edit/rescue.js`);
const { withSlotOffset } = await import(`${ROOT}/src/core/model/bundle.js`);
// عشرون مقطعًا (كمولّد العيّنات: مدة 2000 وفجوة 500) فتتقابل المحاذاة بثقة بعد نقل التثبيت +500.
const cues = () => Array.from({ length: 20 }, (_, i) => ({ n: i + 1, startMs: 1000 + i * 2500, endMs: 3000 + i * 2500, text: `س ${i + 1}` }));
const shownFirst = (plan) => (plan.ok ? plan.cues[0].startMs + plan.offsetMs : `رفض: ${plan.reason}`);
const describe = (label, s, theirsCues, theirsOffset) => {
  const input = { base: s.baseSnapshot(), mine: s.snapshot(), theirs: theirsCues, offsets: { base: s.baseOffsetMs, mine: s.offsetMs, theirs: theirsOffset, committed: s.committedMs } };
  const p = planRescue(input);
  log(`${label} offsets=${JSON.stringify(input.offsets)} → ok=${p.ok} | offsetConflict=${p.offsetConflict} | offsetMs المطبَّق=${p.offsetMs} | أول مقطع ظاهر=${shownFirst(p)}`);
  return { input, p };
};

// (ب) على الجلسة: محفوظ بإزاحة 500، تثبيت (غير محفوظ)، ثم 205 خطوات، ثم المشغّل يجعل الإزاحة 1000 على المحفوظ.
{
  const s = createEditSession({ cues: cues(), offsetMs: 500 });
  s.commitOffset();
  log('[ب] بعد التثبيت: أول بداية =', s.cueAt(0).startMs, '| offset =', s.offsetMs, '| committedMs =', s.committedMs, '| الظاهر =', s.cueAt(0).startMs + s.offsetMs);
  for (let k = 0; k < 205; k++) s.setText(1 + (k % 2), `نص ${k}`); // مقطعان بالتناوب: كل تعديل خطوة مستقلة كمغادرة الحقل
  log('[ب] بعد 205 تعديلات نص على مقطعين بالتناوب: historySize =', s.historySize, '| committedMs =', s.committedMs, '| أول بداية =', s.cueAt(0).startMs, '| offset =', s.offsetMs, '| baseOffset =', s.baseOffsetMs);
  log('[ب] adoptOffset(1000) =', s.adoptOffset(1000), '(فيظهر تعارض، وهذا متوقع لأن التثبيت غير محفوظ)');
  describe('[ب] الإنقاذ الفعلي:', s, cues(), 1000);
  // ما كان سيحدث لو بقي committedMs = 500:
  const fixed = planRescue({ base: s.baseSnapshot(), mine: s.snapshot(), theirs: cues(), offsets: { base: 500, mine: 0, theirs: 1000, committed: 500 } });
  log(`[ب] للمقارنة بـcommitted=500: offsetConflict=${fixed.offsetConflict} | offsetMs=${fixed.offsetMs} | أول مقطع ظاهر=${shownFirst(fixed)} (المتوقع: أول مقطع محفوظ 1000 + إزاحة المشغّل 1000 = 2000)`);
  // وبلا فيض (200 خطوة أو أقل) للتأكد أن الفيض هو السبب:
  const s2 = createEditSession({ cues: cues(), offsetMs: 500 });
  s2.commitOffset();
  for (let k = 0; k < 150; k++) s2.setText(1 + (k % 2), `نص ${k}`);
  describe('[ب ضابط: 150 خطوة]', s2, cues(), 1000);
}

// (أ) على المحرّر مركّبًا: تثبيت، حفظ بطيء مع كتابة أثناءه (markSaved)، ثم المشغّل يضع 300 (≠ 500 المثبّت).
{
  const gate = { paused: false, release: null };
  const wrap = (store) => ({ ...store, updateBundle: async (...args) => { if (gate.paused) await new Promise((r) => { gate.release = r; }); return store.updateBundle(...args); } });
  const m = await mounted({ wrap });
  const S = m.editor.state;
  m.env.root.querySelector('.ed-offset .tj-btn').click();
  await m.env.flush();
  gate.paused = true;
  const saving = m.editor.save();
  await settle();
  S.session.setText(2, 'كتبتُ أثناء الحفظ');
  gate.paused = false;
  gate.release?.();
  await saving;
  await m.env.flush();
  log('[أ] بعد الحفظ (markSaved): baseOffset =', S.session.baseOffsetMs, '| committedMs =', S.session.committedMs, '| أول بداية محفوظة =', (await m.store.getBundle(m.videoId)).slots[0].track.current[0].startMs);
  await m.store.updateBundle(m.videoId, (b) => withSlotOffset(b, 1, 300, new Date().toISOString()));
  await m.env.flush(6);
  log('[أ] بعد ± المشغّل إلى 300: external =', S.external, '(المتوقع null: يُتبنّى لأن المحرّر لم يغيّر إزاحته منذ المحفوظ)');
  const latest = await m.store.getBundle(m.videoId);
  describe('[أ] مدخل onRescue:', S.session, latest.slots[0].track.current, latest.slots[0].offsetMs);
  log('[أ] المتوقع: offsetConflict=false وoffsetMs=300، فأول مقطع ظاهر = المحفوظ +300');
}
