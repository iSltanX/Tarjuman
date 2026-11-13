// تحقق Gemini، Y1: البث الجاري عند الحافة المباشرة. على بث جارٍ حقيقي (mKCieTImjvU) في Chrome وBrave وEdge وFirefox شارة البث
// ظاهرة (display: inline-block) وعليها disabled والصنف ytp-live-badge-is-livehead ما دام المشاهد عند الحافة، وفي Chrome وBrave
// وEdge زالت disabled بالرجوع 60 ث؛ فكان isLiveNow يعيد false عند الحافة. والضابطان (فيديو عادي وبث مؤرشف) الشارة فيهما display: none. فالحكم «ظاهرة» وحده.
// fake-dom لا يحسب الأنماط: getComputedStyle هنا يقرأ display من النمط السطري. ولا تُمرَّر عقدة إلى assert.equal (رأس fake-dom.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLiveNow } from '../../../src/player/youtube-dom.js';
import { addPlayer, createFakeEnv } from './overlay/fake-dom.js';

/** مشغّل فيه شارة بث بالحال المطلوبة؛ display غائب = لا شارة. @param {{ display?: string, disabled?: boolean, livehead?: boolean }} [o] */
function docWith({ display, disabled = false, livehead = false } = {}) {
  const env = createFakeEnv();
  const { player } = addPlayer(env);
  if (display !== undefined) {
    const badge = env.doc.createElement('button');
    badge.className = `ytp-live-badge ytp-button${livehead ? ' ytp-live-badge-is-livehead' : ''}`;
    if (disabled) badge.setAttribute('disabled', '');
    badge.style.setProperty('display', display);
    player.appendChild(badge);
  }
  env.win.getComputedStyle = (el) => ({ display: el.style.getPropertyValue('display') || 'inline' });
  return env.doc;
}

test('Y1: بث جارٍ عند الحافة المباشرة (شارة ظاهرة عليها disabled وis-livehead) ⇒ بث', () => {
  assert.equal(isLiveNow(docWith({ display: 'inline-block', disabled: true, livehead: true })), true);
});

test('Y1: بث جارٍ بعد الرجوع عن الحافة (شارة ظاهرة بلا disabled) ⇒ بث كما كان', () => {
  assert.equal(isLiveNow(docWith({ display: 'inline-block' })), true);
});

test('Y1: فيديو عادي أو بث مؤرشف (الشارة display: none، ولو عليها disabled) ⇒ ليس بثًا', () => {
  assert.equal(isLiveNow(docWith({ display: 'none' })), false);
  assert.equal(isLiveNow(docWith({ display: 'none', disabled: true })), false);
});

test('Y1: لا شارة، أو لا نافذة تحسب الأنماط ⇒ ليس بثًا', () => {
  assert.equal(isLiveNow(docWith()), false);
  const doc = docWith({ display: 'inline-block', disabled: true });
  doc.defaultView = null;
  assert.equal(isLiveNow(doc), false);
});
