// TJ-AUD-013: «تثبيت الإزاحة» ثم حفظ مع كتابة أثناء انتظاره (markSaved)، ثم ± من المشغّل: committedMs وadoptOffset وplanRescue.
// (أ) على الجلسة وحدها، (ب) على المحرّر مركّبًا بمخزن بطيء الكتابة كما في test/unit/pages/editor/app-audit.test.js.
import { ROOT, log, mounted, settle } from './harness.mjs';

const { createEditSession } = await import(`${ROOT}/src/core/edit/session.js`);
const { planRescue } = await import(`${ROOT}/src/core/edit/rescue.js`);
const { withSlotOffset } = await import(`${ROOT}/src/core/model/bundle.js`);

// (أ) الجلسة وحدها
{
  const cues = [1, 2, 3].map((n) => ({ n, startMs: n * 2000, endMs: n * 2000 + 1500, text: `س ${n}` }));
  const s = createEditSession({ cues, offsetMs: 1000 });
  s.commitOffset();
  log('[013-أ] بعد التثبيت: offset =', s.offsetMs, '| committedMs =', s.committedMs, '| أول بداية =', s.cueAt(0).startMs);
  const shape = s.checkpoint();
  const saved = { cues: s.snapshot(), offsetMs: s.offsetMs };
  s.setText(1, 'كتابة أثناء الحفظ');
  s.markSaved(saved, shape);
  log('[013-أ] بعد markSaved: base offset =', s.baseOffsetMs, '| offset =', s.offsetMs, '| committedMs =', s.committedMs, '(المتوقع 0: التثبيت صار في الأساس) | dirty =', s.dirty);
  const theirs = { cues: saved.cues, offsetMs: 500 }; // ± من المشغّل على المحفوظ
  const adopted = s.adoptOffset(500);
  log('[013-أ] adoptOffset(500) =', adopted);
  const input = { base: s.baseSnapshot(), mine: s.snapshot(), theirs: theirs.cues, offsets: { base: s.baseOffsetMs, mine: s.offsetMs, theirs: theirs.offsetMs, committed: s.committedMs } };
  const p = planRescue(input);
  log('[013-أ] planRescue بـcommitted =', input.offsets.committed, '→ offsetConflict =', p.offsetConflict, '| offsetMs =', p.offsetMs, '| ومع offsetChoice=mine →', planRescue({ ...input, offsetChoice: 'mine' }).offsetMs);
  const fixed = planRescue({ ...input, offsets: { ...input.offsets, committed: 0 } });
  log('[013-أ] للمقارنة بـcommitted = 0 → offsetConflict =', fixed.offsetConflict, '| offsetMs =', fixed.offsetMs);
}

// (ب) المحرّر مركّبًا
{
  const gate = { paused: false, release: null };
  const wrap = (store) => ({
    ...store,
    updateBundle: async (...args) => {
      if (gate.paused) await new Promise((r) => { gate.release = r; });
      return store.updateBundle(...args);
    },
  });
  const { editor, env, store, videoId } = await mounted({ wrap });
  const S = editor.state;
  log('[013-ب] الإزاحة عند الفتح =', S.session.offsetMs);
  env.root.querySelector('.ed-offset .tj-btn').click(); // «تثبيت الإزاحة في التوقيت»
  await env.flush();
  log('[013-ب] بعد التثبيت: offset =', S.session.offsetMs, '| committedMs =', S.session.committedMs);
  gate.paused = true;
  const saving = editor.save();
  await settle();
  S.session.setText(2, 'كتبتُ أثناء الحفظ');
  gate.paused = false;
  gate.release?.();
  await saving;
  await env.flush();
  log('[013-ب] بعد الحفظ (مسار markSaved): dirty =', S.session.dirty, '| baseOffset =', S.session.baseOffsetMs, '| committedMs =', S.session.committedMs, '| external =', S.external);
  // ± من المشغّل: الإزاحة وحدها في الخانة المحفوظة.
  await store.updateBundle(videoId, (b) => withSlotOffset(b, 1, 500, new Date().toISOString()));
  await env.flush(6);
  log('[013-ب] بعد ± من المشغّل (500): external =', S.external, '| offset الجلسة =', S.session.offsetMs);
  const latest = await store.getBundle(videoId);
  const offsets = { base: S.session.baseOffsetMs, mine: S.session.offsetMs, theirs: latest.slots[0].offsetMs, committed: S.session.committedMs };
  const p = planRescue({ base: S.session.baseSnapshot(), mine: S.session.snapshot(), theirs: latest.slots[0].track.current, offsets });
  log('[013-ب] مدخل onRescue offsets =', JSON.stringify(offsets), '→ offsetConflict =', p.offsetConflict, '| offsetMs المقترح =', p.offsetMs);
}
