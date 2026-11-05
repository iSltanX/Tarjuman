// CL-X7: حالات خطأ المحرّر (معرّف غير صالح، وسجل تالف) — هل فيها زر أو رابط للخروج (المحفوظات)؟
// وللمقارنة: الحالة الفارغة (لا ترجمة محفوظة) فيها «فتح الفيديو» و«المحفوظات».
import { log, createStore, createMemoryArea, mountEditor, editorDocument, textOf, findAll } from './harness.mjs';

for (const [label, videoId, initial] of [
  ['معرّف غير صالح', null, {}],
  ['سجل تالف', 'BBBBBBBBBBB', { 'video:BBBBBBBBBBB': { schema: 1, videoId: 'BBBBBBBBBBB', broken: true } }],
  ['لا سجل (الحالة الفارغة)', 'CCCCCCCCCCC', {}],
]) {
  const store = createStore({ area: createMemoryArea({ unlimited: true, initial }) });
  const env = editorDocument({ videoId: videoId ?? 'x' });
  const r = await mountEditor(env.root, { videoId, store, doc: env.doc });
  const exits = findAll(env.root, (e) => e.tagName === 'button' || e.tagName === 'a').map((b) => textOf(b));
  log(`${label}: api=${r === null ? 'null' : 'obj'} | النص: ${textOf(env.root)} | أزرار/روابط: ${JSON.stringify(exits)}`);
}
