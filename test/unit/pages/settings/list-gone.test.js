// تحقق 2.3.0 (ص-١٨، بقرار سلطان): مسار «القائمة حُذفت من صفحة أخرى» في «المصطلحات» (src/pages/settings/glossary.js، PG_LIST_GONE) كان
// بلا اختبار، فنجت منه طفرتان: القائمة المحذوفة تبقى معروضة بعد الرفض، ورسالة غير رسالتها. الحذف هنا من مخزن ثانٍ على المساحة نفسها
// (صفحة أخرى)، وإشعاره ممسَك عن الصفحة حتى بعد الإضافة إلى القائمة المعروضة، كما لو لم يصل بعد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../../../../src/core/errors/index.js';
import { createStore } from '../../../../src/core/store/index.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { findAll, newDocument, settle, textOf } from '../library/fake-dom.js';

const PAIR = { from: 'en', to: 'ar' };

async function mounted() {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  // مساحة الصفحة: المساحة نفسها، وإشعاراتها تُمسَك ما دام held مصفوفة، ثم تُسلَّم بترتيبها.
  const gate = { held: null };
  const pageArea = {
    ...area,
    onChanged(fn) {
      return area.onChanged((changes) => (gate.held ? gate.held.push(() => fn(changes)) : fn(changes)));
    },
  };
  const store = createStore({ area: pageArea, now: () => (t += 1000) });
  await store.addGlossaryList(PAIR);
  await store.addListTerm(PAIR, { source: 'cache', target: 'الذاكرة المؤقتة', note: null });
  await area.flush();
  const doc = newDocument();
  const settings = createSettings({
    store, doc, version: '0.3.0', now: () => Date.parse('2026-11-02T10:00:00.000Z'), pause: () => Promise.resolve(),
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}', saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }),
    savedPath: async () => null, pickFile: async () => null, confirm: async () => false, setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(settings.root);
  await settings.load();
  // صفحة أخرى: مخزن ثانٍ على المساحة نفسها.
  const other = createStore({ area, now: () => (t += 1000) });
  const hold = () => { gate.held = []; };
  const release = () => { const list = gate.held ?? []; gate.held = null; for (const deliver of list) deliver(); };
  return { settings, store, other, area, hold, release, g: settings.glossary, root: settings.root };
}

test('ص-١٨: إضافة مصطلح إلى قائمة حُذفت من صفحة أخرى: رسالة PG_LIST_GONE، ويُعرض القاموس العام، والمصطلح باقٍ في الحقول ولا يُضاف إلى شيء', async () => {
  const m = await mounted();
  m.g.select(PAIR);
  await settle();
  assert.deepEqual(m.g.selected, PAIR, 'القائمة معروضة');
  const bar = findAll(m.root, (e) => e.classList?.contains('st-gl__lists'))[0];
  const pressed = () => findAll(bar, (e) => e.tagName === 'button' && e.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'));
  assert.deepEqual(pressed(), ['الإنجليزية ← العربية (1)']);

  // الحذف من الصفحة الأخرى ثم الإضافة هنا قبل أن يصل إشعاره.
  m.hold();
  assert.ok(await m.other.removeGlossaryList(PAIR));
  await m.area.flush();
  m.g.inputs.source.value = 'prompt';
  m.g.inputs.target.value = 'موجِّه';
  m.g.inputs.note.value = 'سياق';
  m.g.form.dispatchEvent({ type: 'submit', preventDefault() {} });
  await settle(5);
  await m.area.flush();
  await settle(5);
  // قبل الإشعار: الرفض نفسه يعرض القاموس العام (لا ينتظر الإشعار).
  assert.equal(m.g.selected, null, 'يُعرض القاموس العام بعد الرفض، لا القائمة المحذوفة');
  m.release();
  await settle(5);

  const formError = findAll(m.root, (e) => e.classList?.contains('st-gl__error'))[0];
  assert.equal(formError.hidden, false);
  assert.equal(textOf(formError), messageFor('PG_LIST_GONE'), 'رسالتها هي لا رسالة الحد أو المكرر');
  assert.equal(m.g.selected, null, 'يُعرض القاموس العام، لا القائمة المحذوفة');
  assert.deepEqual(pressed().filter((l) => l.startsWith('الإنجليزية')), [], 'رقاقة القائمة المحذوفة ليست المختارة');
  assert.deepEqual([m.g.inputs.source.value, m.g.inputs.target.value, m.g.inputs.note.value], ['prompt', 'موجِّه', 'سياق'], 'المصطلح باقٍ في الحقول');
  assert.deepEqual((await m.store.getGlossaries()).lists, [], 'لا قائمة تُنشأ من جديد');
  assert.deepEqual((await m.store.getPrefs()).glossary.terms, [], 'ولا يُضاف إلى القاموس العام قبل أن يضيفه المستخدم');
  // والإضافة ثانية بعدها إلى القاموس العام المعروض كما يقول السطر.
  m.g.form.dispatchEvent({ type: 'submit', preventDefault() {} });
  await settle();
  assert.deepEqual((await m.store.getPrefs()).glossary.terms.map((x) => x.source), ['prompt']);
  assert.equal(formError.hidden, true);
});
