// تدقيق 7a66f91، المرحلة C7 (U76): تأكيد الرفع في المشغّل إلى خانة ممتلئة يحذّر من محو النسخة السابقة المحفوظة ويسمّي
// خانتها، كحوار المحفوظات؛ ولا تحذير بلا سابقة ولا في خانة فارغة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseFiles, click, makeState, mountPage, settle, slotTrack, withSlots } from './harness.js';

async function confirmFor({ previous }) {
  const slots = withSlots([slotTrack(), slotTrack({ fileName: 'b.srt' })]);
  if (previous) slots.bundle.previous = previous;
  const page = mountPage({ state: makeState({ ...slots }) });
  click(page.ui.btn('upload'));
  click(page.ui.item('رفع ترجمة…'));
  chooseFiles(page.ui, [{ name: 'new.ar.srt' }]);
  await settle();
  return page;
}

test('U76: الاستبدال يحذّر من محو النسخة السابقة ويسمّي خانتها، ولا تحذير في «جديدة» ولا بلا سابقة', async () => {
  const page = await confirmFor({ previous: { from: 2, savedAt: '2026-11-01T12:00:00.000Z' } });
  assert.equal(page.ui.menuText().includes('النسخة السابقة المحفوظة'), false, 'الافتراضي «جديدة»: لا محو');
  click(page.ui.menu().querySelector('[data-fid="target:1"]'));
  assert.match(page.ui.menuText(), /تُحفظ الترجمة الحالية نسخةً سابقة، وتُحذف النسخة السابقة المحفوظة الآن \(من الترجمة 2\) ولا يمكن استعادتها\./);
  click(page.ui.menu().querySelector('[data-fid="target:2"]'));
  assert.match(page.ui.menuText(), /\(من هذه الترجمة\)/, 'السابقة من الخانة الهدف نفسها');
  const none = await confirmFor({ previous: null });
  click(none.ui.menu().querySelector('[data-fid="target:1"]'));
  assert.equal(none.ui.menuText().includes('النسخة السابقة المحفوظة'), false);
});
