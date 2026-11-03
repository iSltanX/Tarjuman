// موضع المضيف في ملء الشاشة: داخل المشغّل في الحالة المعتادة، والنقل إلى عنصر ملء الشاشة الغريب،
// ولا مكان إن كان عنصر ملء الشاشة هو الفيديو نفسه.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostParent } from '../../../../src/player/watch/fullscreen.js';
import { addPlayer, createFakeEnv } from '../overlay/fake-dom.js';

function setup() {
  const env = createFakeEnv();
  return { env, ...addPlayer(env) };
}

/** النتيجة باسم الأب لا بالعقدة نفسها: فشل deepEqual على عقدة يفحص الـDOM الوهمي كله (overlay/fake-dom.js). */
const placed = (r, names) => ({ ...r, parent: Object.keys(names).find((k) => names[k] === r.parent) ?? '?' });

test('بلا ملء شاشة: داخل المشغّل', () => {
  const { env, player } = setup();
  assert.deepEqual(placed(hostParent(env.doc, player), { player }), { parent: 'player', reason: 'normal' });
});

test('عنصر ملء الشاشة هو المشغّل أو أحد آبائه: الطبقة داخله أصلًا', () => {
  const { env, player } = setup();
  env.doc.fullscreenElement = player;
  assert.deepEqual(placed(hostParent(env.doc, player), { player }), { parent: 'player', reason: 'ancestor' });
  env.doc.fullscreenElement = env.doc.body;
  assert.deepEqual(placed(hostParent(env.doc, player), { player }), { parent: 'player', reason: 'ancestor' });
});

test('عنصر ملء الشاشة غريب عن المشغّل: ينتقل المضيف إليه (البديل)', () => {
  const { env, player } = setup();
  const other = env.doc.createElement('div');
  env.doc.body.appendChild(other);
  env.doc.fullscreenElement = other;
  assert.deepEqual(placed(hostParent(env.doc, player), { player, other }), { parent: 'other', reason: 'moved' });
});

test('عنصر ملء الشاشة هو الفيديو داخل المشغّل أو عنصر لا يرسم أبناءه: لا مكان', () => {
  const { env, player, video } = setup();
  env.doc.fullscreenElement = video;
  assert.equal(hostParent(env.doc, player).reason, 'unreachable');
  const img = env.doc.createElement('img');
  env.doc.body.appendChild(img);
  env.doc.fullscreenElement = img;
  assert.equal(hostParent(env.doc, player).reason, 'unreachable');
});
