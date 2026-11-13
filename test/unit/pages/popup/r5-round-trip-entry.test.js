// ح-58 في نافذة الإضافة كاملة: فيديو عربي مساره الملتقط إنجليزي مترجم آليًا عن العربية، و«إلى» الافتراضية العربية. تُحمَّل نقطة الدخول
// pages/popup/main.js ببيئة وهمية (c8-entry-env) مرة واحدة في هذه العملية: سطر التنبيه تحت الحقلين بزرّه المطوي، ولا يُمنع النسخ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntryEnv } from '../../../helpers/c8-entry-env.js';
import { settle, textOf } from '../library/fake-dom.js';

const reply = {
  v: 1, ok: true, watch: true, videoId: 'KA3zmDkEUQs', title: 'فيديو عربي', loading: false, arabic: null,
  english: { captured: [{ key: 'en|asr|ar', kind: 'asr', cueCount: 419, ok: true }], saved: [] },
  view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' },
  source: { key: 'en|asr|ar', lang: 'en', kind: 'asr', via: 'ar', from: 'captured' },
};
const env = createEntryEnv({
  tabs: { query: async () => [{ id: 7 }], sendMessage: async (id, msg) => (msg?.type === 'tj:get-video-state' ? reply : undefined) },
});
const restoreLoad = env.install();
try {
  await import('../../../../src/pages/popup/main.js');
  await settle(30);
  await new Promise((r) => setImmediate(r));
  await settle(30);
} finally {
  restoreLoad();
}
const byAction = (a) => env.doc.querySelectorAll('button').find((b) => b.getAttribute('data-action') === a) ?? null;

test('ح-58: النافذة: سطر «الفيديو بالعربية أصلًا: اختر مساره الأصلي» تحت الحقلين، والتفصيل مطوي على بُعد نقرة', () => {
  const toggle = byAction('round-trip');
  assert.ok(toggle, 'زر السطر');
  const line = env.doc.querySelectorAll('p').find((p) => p.classList.contains('tj-popup__roundtrip'));
  assert.equal(textOf(line), 'الفيديو بالعربية أصلًا: اختر مساره الأصلي');
  const how = env.doc.querySelector('#tj-roundtrip-how');
  assert.equal(toggle.getAttribute('aria-controls'), 'tj-roundtrip-how');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(how.hidden, true);
  toggle.dispatchEvent({ type: 'click' });
  assert.equal(how.hidden, false);
  assert.match(textOf(how), /ولك أن تتابع بهذا المسار\./);
});

test('ح-58: النافذة: النسخ متاح، والوصف الواحد في البطاقة (ح-57)', () => {
  const copy = byAction('copy');
  assert.equal(copy.getAttribute('aria-disabled'), null, 'لا يُمنع النسخ');
  const english = env.doc.querySelectorAll('p').find((p) => p.classList.contains('tj-popup__english'));
  assert.equal(textOf(english), 'الإنجليزية، ترجمها يوتيوب آليًا عن العربية · 419 مقطعًا · ملتقطة');
  assert.equal(env.doc.querySelectorAll('p').some((p) => textOf(p).startsWith('الأصل: ')), false, 'سطر التنبيه يحل محل «الأصل: …»');
});
