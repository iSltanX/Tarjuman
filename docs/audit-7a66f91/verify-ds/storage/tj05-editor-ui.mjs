// TJ-05 (أ) عبر واجهة المحرّر الحقيقية: «حفظ» في المحرّر و± في المشغّل معًا من سياقين على المساحة نفسها. ما الذي يراه المستخدم؟
import { load, out, settle, settleAll, clockFrom } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { createController } = await load('src/content/controller.js');
const { mountEditor } = await load('src/pages/editor/app.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { editorDocument } = await load('test/helpers/editor-dom.js');
const { textOf } = await load('test/unit/pages/library/fake-dom.js');
const ID = 'AAAAAAAAAAA';

for (const order of ['save-then-nudge', 'nudge-then-save']) {
  const area = createMemoryArea({ unlimited: true });
  const now = clockFrom();
  const es = createStore({ area, now });
  const ps = createStore({ area, now });
  await seedBundle(es, sampleBundle({ videoId: ID }));
  await area.flush();
  const c = createController({ store: ps, now, page: {}, extractor: null });
  ps.onChange((ch) => c.handleStoreChange(ch));
  await c.start(ID);
  const env = editorDocument({ videoId: ID });
  const editor = await mountEditor(env.root, { videoId: ID, store: es, doc: env.doc, now });
  await env.flush(); await settleAll();
  editor.state.session.setText(0, 'نص جديد من المحرّر');
  const toasts = [];
  const grab = () => env.doc.querySelectorAll('.tj-toast, [role=status], .ed-toast').map((x) => textOf(x)).filter(Boolean);
  const ops = order === 'save-then-nudge' ? [() => editor.save(), () => c.nudgeOffset(1)] : [() => c.nudgeOffset(1), () => editor.save()];
  const rs = await Promise.all(ops.map((f) => settle(f())));
  toasts.push(...grab());
  const afterSave = { dirty: editor.state.session.dirty, shown0: editor.state.session.cueAt(0).text };
  await area.flush(); await env.flush(10); await settleAll(); await area.flush(); await env.flush(10);
  toasts.push(...grab());
  const stored = await es.getBundle(ID);
  out(`TJ-05 المحرّر ${order}`, {
    results: rs.map((r) => (r.ok ? 'ok' : r.code)), afterSave,
    afterEvents: { dirty: editor.state.session.dirty, shown0: editor.state.session.cueAt(0).text, external: editor.state.external ?? null },
    stored0: (stored.slots[0].track.current ?? stored.slots[0].track.original)[0].text, storedOffset: stored.slots[0].offsetMs,
    toasts: [...new Set(toasts)],
  });
}
