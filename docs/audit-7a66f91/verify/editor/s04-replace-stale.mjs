// M-6: «معاينة استبدال الكل…» مفتوحة، ثم حفظ خارجي (تبويب محرّر آخر) لمحتوى الخانة والمحرّر بلا تغييرات، ثم التأكيد.
import { mounted, log, buttonNamed, openDialogEl, settle, ROOT } from './harness.mjs';

const { saveSlot } = await import(`${ROOT}/src/pages/editor/persist.js`);

async function run(label, mutate) {
  const { editor, env, store, videoId } = await mounted();
  const [searchIn, replaceIn] = env.root.querySelectorAll('.ed-search__input');
  searchIn.value = 'أولى';
  searchIn.dispatchEvent({ type: 'input' });
  await env.flush();
  buttonNamed(env.root, 'استبدال').click();
  replaceIn.value = 'ثانٍ';
  replaceIn.dispatchEvent({ type: 'input' });
  await env.flush();
  const sessionBefore = editor.state.session;
  buttonNamed(env.root, 'معاينة استبدال الكل…').click();
  await settle();
  const dlg = openDialogEl(env);
  log(`[M-6 ${label}] الحوار مفتوح:`, Boolean(dlg), '| النص قبل =', JSON.stringify(sessionBefore.cueAt(0).text));
  const other = await store.getBundle(videoId);
  const cues = other.slots[0].track.current.map((c) => ({ ...c, text: mutate(c.text) }));
  await saveSlot(store, videoId, other, 1, { cues, offsetChanged: false, offsetMs: other.slots[0].offsetMs });
  await env.flush(6);
  log(`[M-6 ${label}] بعد الحفظ الخارجي: جلسة جديدة؟`, editor.state.session !== sessionBefore, '| النص الآن =', JSON.stringify(editor.state.session.cueAt(0).text));
  dlg.close('apply');
  await env.flush(4);
  const s = editor.state.session;
  log(`[M-6 ${label}] بعد التأكيد: النص =`, JSON.stringify(s.cueAt(0).text), '| dirty =', s.dirty, '| النتيجة:', JSON.stringify(editor.state.result?.text));
}

await run('بادئة أطول', (t) => `جديد ${t}`);
await run('نص أقصر', (t) => t.slice(0, 2));
