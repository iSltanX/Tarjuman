// انحدار C2 في المحرّر (تدقيق 7a66f91، U09)، محوّل من verify/storage/sto02: حوار «استعادة الأصل…» مفتوح، وتبويب آخر
// يحفظ تحريرًا أحدث للخانة نفسها، ثم يؤكد المستخدم. المقبول: لا يمحو التأكيدُ التحريرَ الأحدث، ويظهر التعارض.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { saveSlot } from '../../../../src/pages/editor/persist.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument } from '../../../helpers/editor-dom.js';

const ID = 'AAAAAAAAAAA';

for (const dirty of [false, true]) {
  test(`U09: «استعادة الأصل…» بتأكيد قديم بعد حفظ من تبويب آخر (${dirty ? 'مع تعديل غير محفوظ' : 'الجلسة نظيفة'}) — لا يُمحى الحفظ الأحدث`, async () => {
    const area = createMemoryArea({ unlimited: true });
    let t = Date.parse('2026-11-01T12:00:00.000Z');
    const now = () => (t += 1000);
    const store = createStore({ area, now });
    const other = createStore({ area, now });
    await seedBundle(store, sampleBundle({ videoId: ID }));
    const env = editorDocument({ videoId: ID });
    const editor = await mountEditor(env.root, { videoId: ID, store, doc: env.doc, now });
    await env.flush();
    if (dirty) editor.state.session.setText(1, 'مسودة محلية');
    env.root.querySelectorAll('button').find((x) => x.textContent.includes('استعادة الأصل')).click();
    await env.flush();
    const dialog = env.doc.querySelector('dialog[open]');
    assert.ok(dialog, 'الحوار مفتوح');
    const latest = await other.getBundle(ID);
    const cues = structuredClone(latest.slots[0].track.current);
    cues[0].text = 'تحرير-التبويب-الآخر';
    await saveSlot(other, ID, latest, 1, { cues, offsetChanged: false, offsetMs: 0 }, { now });
    await area.flush();
    await env.flush(8);
    dialog.close('restore');
    await env.flush(8);
    await area.flush();
    const final = await other.getBundle(ID);
    assert.notEqual(final.slots[0].track.current, null, 'التحرير الأحدث لم يُمحَ');
    assert.equal(final.slots[0].track.current[0].text, 'تحرير-التبويب-الآخر');
    assert.equal(editor.state.external, 'changed', 'التعارض ظاهر');
  });
}
