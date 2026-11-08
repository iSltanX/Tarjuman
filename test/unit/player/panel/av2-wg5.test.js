// التدقيق الموحد V2، WG-5: اللوحة المتزامنة تحدّث lang وdir للصفوف القائمة عند تغيّر لغة الخانة والمقاطع نفسها (U-030).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCues } from '../../../helpers/fixtures.js';
import { createTranscript } from '../../../../src/player/panel/transcript.js';
import { UNDO_MS } from '../../../../src/player/panel/session.js';
import { createFakeEnv } from '../overlay/fake-dom.js';
import { click, ui, watchPage } from './harness.js';

test('AV2 U-030: sync بالمقاطع نفسها ولغة fr بعد ar يحدّث lang="fr" dir="ltr" بلا إعادة بناء', () => {
  const env = createFakeEnv();
  const t = createTranscript({ doc: env.doc, onSeek: () => {} });
  const cues = makeCues(3, { text: (i) => ['Bonjour à tous', 'Merci beaucoup', 'Au revoir'][i - 1] });
  const attrs = (k) => t.list.children.map((r) => `${r.children[1].children[k].getAttribute('lang')}|${r.children[1].children[k].getAttribute('dir')}`);
  const first = t.sync({ cues, originalCues: null, offsetMs: 0, translationLang: 'ar' });
  assert.equal(first.rebuilt, true);
  assert.deepEqual(attrs(0), ['ar|rtl', 'ar|rtl', 'ar|rtl']);
  const row0 = t.list.children[0];
  const again = t.sync({ cues, originalCues: null, offsetMs: 0, translationLang: 'fr' });
  assert.equal(again.rebuilt, false);
  assert.deepEqual(attrs(0), ['fr|ltr', 'fr|ltr', 'fr|ltr']);
  assert.ok(t.list.children[0] === row0, 'الصفوف نفسها');
});

test('AV2 U-030: لغة الأصل تتبع أيضًا في صفوف الأصل', () => {
  const env = createFakeEnv();
  const t = createTranscript({ doc: env.doc, onSeek: () => {} });
  const cues = makeCues(2, { text: (i) => `مرحبًا ${i}` });
  const orig = makeCues(2, { text: (i) => `Hello ${i}` });
  t.sync({ cues, originalCues: orig, offsetMs: 0, originalLang: 'en', translationLang: 'ar' });
  const en = () => t.list.children[0].children[1].children[1].getAttribute('lang');
  assert.equal(en(), 'en');
  t.sync({ cues, originalCues: orig, offsetMs: 0, originalLang: 'de', translationLang: 'ar' });
  assert.equal(en(), 'de');
});

// ———— U-042: رسالة «أُخفي زر النص المتزامن» وفيها «تراجع» تُمسك بالمؤشر والتركيز ————

function hiddenToast() {
  const page = watchPage();
  page.mount();
  const v = ui(page);
  click(v.qa('.head .b')[0]);
  click(v.q('.menu [role="menuitem"]'));
  assert.equal(page.handle.peek().mode, 'toast');
  return { page, v };
}

test('AV2 U-042: المؤشر على رسالة اللوحة يمسكها، وتزول بعد مدتها كاملة من مغادرته', () => {
  const { page, v } = hiddenToast();
  v.toast.dispatchEvent({ type: 'mouseenter' });
  page.env.win.advance(UNDO_MS * 3);
  assert.equal(page.handle.peek().mode, 'toast');
  v.toast.dispatchEvent({ type: 'mouseleave' });
  page.env.win.advance(UNDO_MS - 100);
  assert.equal(page.handle.peek().mode, 'toast');
  page.env.win.advance(200);
  assert.equal(page.handle.peek().mode, 'none');
});

test('AV2 U-042: التركيز في رسالة اللوحة يمسكها، وخروجه يستأنف العدّ', () => {
  const { page, v } = hiddenToast();
  v.toast.dispatchEvent({ type: 'focusin', bubbles: true });
  page.env.win.advance(UNDO_MS * 3);
  assert.equal(page.handle.peek().mode, 'toast');
  v.toast.dispatchEvent({ type: 'focusout', relatedTarget: null });
  page.env.win.advance(UNDO_MS + 100);
  assert.equal(page.handle.peek().mode, 'none');
});

test('AV2 U-042: تراجع بعد إمساك الرسالة يعيد الأمرين ولا يبقى مؤقت يخفيها', () => {
  const { page, v } = hiddenToast();
  v.toast.dispatchEvent({ type: 'mouseenter' });
  page.env.win.advance(UNDO_MS * 2);
  click(v.q('.act'));
  assert.equal(page.handle.peek().mode, 'open');
  page.env.win.advance(UNDO_MS * 2);
  assert.equal(page.handle.peek().mode, 'open');
});
