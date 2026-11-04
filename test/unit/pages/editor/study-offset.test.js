// «نص دراسي…» من المحرّر بإزاحة عرض ومقطع قبل بداية الفيديو (المراجعة المستقلة 2026-11-04): بقية المقاطع بإزاحتها، والمقطع
// السالب وحده رابطه من 0:00، والحوار يذكر رقمه قبل التنزيل. كانت الإزاحة تسقط عن كل المقاطع بلا تنبيه. العقد بـassert.ok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { mountEditor } from '../../../../src/pages/editor/app.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { sampleBundle, seedBundle } from '../../../helpers/fixtures-v2.js';
import { editorDocument } from '../../../helpers/editor-dom.js';

test('المحرّر: مقطع قبل الصفر لا يُسقط إزاحة العرض (+0.5 ث) عن بقية المقاطع، ويُذكر في حوار النص الدراسي', async () => {
  const saved = [];
  let at = Date.parse(NOW);
  const now = () => (at += 1000);
  const store = createStore({ area: createMemoryArea({ unlimited: true }), now });
  const initial = sampleBundle(); // الخانة 1 النشطة بإزاحة +500 ومقاطع تبدأ 1000 و3500 و6000 و8500 و11000
  await seedBundle(store, initial);
  const env = editorDocument({ videoId: initial.videoId });
  const editor = await mountEditor(env.root, { videoId: initial.videoId, store, doc: env.doc, now, saveFile: async (f) => { saved.push(f); return { ok: true, mode: 'downloads', downloadId: 1 }; } });
  await env.flush();
  editor.state.session.setTime(0, 'start', -1500); // قبل الصفر حتى بعد الإزاحة
  // المقطع الأخير فقرة وحده (صمت طويل قبله): 30600 تصير 31100 بالإزاحة (t=31s) و30600 بدونها (t=30s).
  editor.state.session.setTime(4, 'end', 32600);
  editor.state.session.setTime(4, 'start', 30600);
  env.root.querySelectorAll('button').find((b) => b.textContent.includes('تصدير')).click();
  await env.flush();
  env.doc.querySelectorAll('[role="menuitem"], button').find((b) => b.textContent.includes('نص دراسي')).click();
  await env.flush();
  const dialog = env.doc.querySelector('dialog[open]');
  assert.ok(dialog);
  assert.ok(dialog.textContent.includes('ما رقمه 1، فيبدأ رابطه في النص الدراسي من 0:00'), 'الحوار يذكر المقطع 1 قبل التنزيل');
  dialog.close('save');
  await env.flush();
  assert.equal(saved.length, 1);
  const links = [...saved[0].text.matchAll(/&t=(\d+)s/g)].map((x) => Number(x[1]));
  assert.deepEqual(links, [0, 31], 'الأول من بداية الفيديو، والأخير بالإزاحة');
});
