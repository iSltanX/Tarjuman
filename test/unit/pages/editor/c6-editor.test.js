// تدقيق 7a66f91، المرحلة C6: جزءا الصفحات من U48 وU49. مرجع الصف الإنجليزي في المحرّر بلغته (lang="en"؛ DS-F12)، واسم الملف في
// رسالة الحفظ معزول LTR فلا تنتقل شرطة أول المعرّف إلى آخره (GEM-022b). يفشلان على الشيفرة السابقة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { saveMessage } from '../../../../src/pages/editor/text.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument } from '../../../helpers/editor-dom.js';

const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);

test('U48: مرجع الصف الإنجليزي في المحرّر بـlang="en"', async () => {
  const bundle = sampleBundle();
  const area = createMemoryArea({ unlimited: true });
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area, now });
  await seedBundle(store, bundle);
  const env = editorDocument({ videoId: bundle.videoId });
  assert.ok(await mountEditor(env.root, { videoId: bundle.videoId, store, doc: env.doc, now }));
  await env.flush();
  const refs = env.root.querySelectorAll('.ed-row__en');
  assert.ok(refs.length > 0);
  assert.ok(refs.every((e) => e.getAttribute('lang') === 'en'));
});

test('U49 (GEM-022b): اسم الملف في رسائل الحفظ معزول LTR في النجاح والإخفاق', () => {
  const name = '-xyz1234567.ar.srt';
  const iso = `${LRI}${name}${PDI}`;
  assert.equal(saveMessage({ ok: true, mode: 'downloads' }, name, undefined, messageFor).text, `حُفظ ${iso} في مجلد التنزيلات.`);
  assert.equal(saveMessage({ ok: false, code: 'SV_FAILED' }, name, undefined, messageFor).text, `${iso}: ${messageFor('SV_FAILED')}`);
  assert.ok(saveMessage({ ok: true, mode: 'blob' }, name, undefined, messageFor).text.startsWith(iso));
});
