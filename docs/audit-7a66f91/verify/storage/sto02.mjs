// STO-02: حوار «استعادة الأصل…» في المحرّر مفتوح، وسياق آخر يحفظ تحريرًا جديدًا للخانة نفسها، ثم يؤكد المستخدم الحوار.
// حالتان: (أ) الجلسة نظيفة (لا تعديلات غير محفوظة) — المتوقع أن يُرفض التأكيد أو يُعاد عرضه. (ب) ضابط: الجلسة فيها تعديل.
import assert from 'node:assert/strict';
import { load, out } from './common.mjs';
const { createStore } = await load('src/core/store/index.js');
const { mountEditor } = await load('src/pages/editor/app.js');
const { saveSlot } = await load('src/pages/editor/persist.js');
const { createMemoryArea } = await load('test/helpers/chrome-storage.js');
const { sampleBundle, seedBundle } = await load('test/helpers/fixtures-v2.js');
const { editorDocument } = await load('test/helpers/editor-dom.js');

const id = 'AAAAAAAAAAA';
for (const dirty of [false, true]) {
  const area = createMemoryArea({ unlimited: true });
  let t = Date.parse('2026-11-01T12:00:00.000Z');
  const now = () => (t += 1000);
  const store = createStore({ area, now });
  const other = createStore({ area, now });
  const seeded = await seedBundle(store, sampleBundle({ videoId: id }));
  const env = editorDocument({ videoId: id });
  const editor = await mountEditor(env.root, { videoId: id, store, doc: env.doc, now });
  await env.flush();
  if (dirty) editor.state.session.setText(1, 'مسودة محلية');
  const btn = env.root.querySelectorAll('button').find((x) => x.textContent.includes('استعادة الأصل'));
  assert.ok(btn, 'زر استعادة الأصل');
  btn.click();
  await env.flush();
  const dialog = env.doc.querySelector('dialog[open]');
  assert.ok(dialog, 'الحوار مفتوح');
  const openedRevAtDialog = editor.state.opened.record.rev;
  const textAtDialog = editor.state.session.cueAt(0).text;
  // تبويب آخر يحفظ تحريرًا أحدث للخانة 1 والحوار مفتوح.
  const latest = await other.getBundle(id);
  const cues = structuredClone(latest.slots[0].track.current);
  cues[0].text = 'تحرير-التبويب-الآخر';
  await saveSlot(other, id, latest, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now });
  await area.flush();
  await env.flush(8);
  const behind = { openedRev: editor.state.opened.record.rev, text0: editor.state.session.cueAt(0).text, external: editor.state.external ?? null, dialogStillOpen: !!env.doc.querySelector('dialog[open]') };
  dialog.close('restore');
  await env.flush(8);
  await area.flush();
  const final = await other.getBundle(id);
  out(`STO-02-${dirty ? 'dirty' : 'clean'}`, {
    atDialog: { rev: openedRevAtDialog, text0: textAtDialog, seededRev: seeded.record.rev },
    behindDialog: behind,
    afterConfirm: { rev: final.record.rev, current: final.slots[0].track.current === null ? null : final.slots[0].track.current[0].text, external: editor.state.external ?? null },
    otherEditLost: final.slots[0].track.current === null,
  });
}
