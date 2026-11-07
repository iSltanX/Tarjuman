// التدقيق الموحد V2، المجموعة WG-6: حوار الإنقاذ بالأزمنة (U-037)، والإنقاذ بالمحرّر كاملًا مع إزاحة مثبّتة (U-036).
// العقد تُقارن بـassert.ok(a === b) لا assert.equal (انظر app-audit.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRescue } from '../../../../src/core/edit/rescue.js';
import { saveSlot } from '../../../../src/pages/editor/persist.js';
import { openRescueDialog } from '../../../../src/pages/editor/rescue-dialog.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW, makeCues } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument, settle } from '../../../helpers/editor-dom.js';
import { buttonNamed, textOf } from '../library/fake-dom.js';

test('AV2 U-037: خيارا التعارض الزمني يظهران بزمنين مختلفين', async () => {
  const base = makeCues(4);
  const mine = base.map((c, i) => (i === 1 ? { ...c, startMs: c.startMs + 300, endMs: c.endMs + 300 } : c));
  const theirs = base.map((c, i) => (i === 1 ? { ...c, startMs: c.startMs + 700, endMs: c.endMs + 700 } : c));
  const offsets = { base: 0, mine: 0, theirs: 0 };
  const first = planRescue({ base, mine, theirs, offsets });
  assert.equal(first.conflicts.length, 1);
  const e = editorDocument({ videoId: 'AAAAAAAAAAA' });
  const done = openRescueDialog({ doc: e.doc, first, offsets });
  await settle();
  const dlg = e.doc.querySelector('dialog[open]');
  const labels = dlg.querySelectorAll('label').map((l) => textOf(l));
  const a = labels.find((t) => t.includes('الأحدث:'));
  const b = labels.find((t) => t.includes('تعديلي:'));
  assert.ok(a !== b);
  assert.ok(/\d\d:\d\d:\d\d,\d{3}/.test(a) && /\d\d:\d\d:\d\d,\d{3}/.test(b), `${a} | ${b}`);
  assert.ok(a.replace('الأحدث:', '') !== b.replace('تعديلي:', ''), 'الزمنان مختلفان');
  dlg.close('cancel');
  await done;
});

async function rescueRun(otherTab) {
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  const b = sampleBundle();
  const t = b.slots[0].track;
  const cues = makeCues(12);
  t.original = cues;
  t.current = cues.map((c) => ({ ...c }));
  t.fingerprintId = null;
  t.comparison = null;
  b.slots[0].marks = [];
  b.slots[0].position = null;
  b.slots[0].offsetMs = 2000;
  b.record.view = { ...b.record.view, displayOffsetMs: 2000 };
  b.record.arabic = structuredClone(t);
  await seedBundle(store, b);
  const env = editorDocument({ videoId: b.videoId });
  const editor = await mountEditor(env.root, { videoId: b.videoId, store, doc: env.doc, now });
  await env.flush();
  const S = editor.state;
  buttonNamed(env.root, 'تثبيت الإزاحة في التوقيت').dispatchEvent({ type: 'click' });
  await env.flush();
  const f = env.root.querySelector('.ed-row[data-index="0"] [data-field="text"]');
  f.focus();
  f.value = 'مقطع أول معدّل';
  f.dispatchEvent({ type: 'input' });
  await env.flush();
  const opened = await store.getBundle(b.videoId);
  await otherTab(store, opened, cues);
  await env.flush();
  await settle();
  await env.flush();
  const btn = buttonNamed(env.root, 'مقارنة وإعادة التطبيق…');
  assert.ok(btn, 'لافتة التعارض');
  btn.dispatchEvent({ type: 'click' });
  await settle();
  await env.flush();
  const dlg = env.doc.querySelector('dialog[open]');
  const text = textOf(dlg);
  dlg.close('apply');
  await settle();
  await env.flush();
  const work = S.session.snapshot();
  return { text, shown: work.map((c) => c.startMs + S.session.offsetMs), cue1: work[0].text, cues };
}

test('AV2 U-036 (المحرّر كاملًا، أ): تحريك الطرف الآخر المقطع 6 بـ+100 بعد تثبيت الإزاحة: لا تعارض وتعديل واحد والظاهر صحيح', async () => {
  const r = await rescueRun(async (store, opened, base) => {
    const cues = base.map((c) => ({ ...c }));
    cues[5].startMs += 100;
    cues[5].endMs += 100;
    await saveSlot(store, opened.videoId, opened, 1, { cues, offsetChanged: false, offsetMs: 2000 }, { now: () => Date.parse(NOW) + 500000 });
  });
  assert.ok(r.text.includes('تعديلاتي: مقطع واحد'), r.text);
  assert.ok(r.text.includes('متعارضة: 0'), r.text);
  assert.deepEqual(r.shown, r.cues.map((c, i) => c.startMs + 2000 + (i === 5 ? 100 : 0)));
  assert.equal(r.cue1, 'مقطع أول معدّل');
});

test('AV2 U-036 (المحرّر كاملًا، ب): ثبّت الطرف الآخر الإزاحة نفسها: لا تعارض ولا تثبيت مضاعف', async () => {
  const r = await rescueRun(async (store, opened, base) => {
    const cues = base.map((c) => ({ ...c, startMs: c.startMs + 2000, endMs: c.endMs + 2000 }));
    await saveSlot(store, opened.videoId, opened, 1, { cues, offsetChanged: true, offsetMs: 0 }, { now: () => Date.parse(NOW) + 500000 });
  });
  assert.ok(r.text.includes('متعارضة: 0'), r.text);
  assert.deepEqual(r.shown, r.cues.map((c) => c.startMs + 2000));
});
