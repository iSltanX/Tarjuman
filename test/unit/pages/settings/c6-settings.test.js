// تدقيق 7a66f91، المرحلة C6: جزء الصفحات من U48. المصطلح الإنجليزي في جدول القاموس بلغته (lang="en"؛ DS-F12). يفشل على الشيفرة السابقة.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../../../src/core/store/index.js';
import { createSettings } from '../../../../src/pages/settings/view.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { NOW } from '../../../helpers/fixtures.js';
import { findAll, newDocument, settle } from '../library/fake-dom.js';

test('U48: المصطلح الإنجليزي في جدول القاموس بـlang="en"', async () => {
  let t = Date.parse(NOW);
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => (t += 1000) });
  await area.flush();
  const doc = newDocument();
  const settings = createSettings({
    store, doc, version: '0.3.0', now: () => Date.parse('2026-11-02T10:00:00.000Z'), pause: () => Promise.resolve(),
    clipboardWrite: async () => {}, diagnosticsText: async () => '{}', saveFile: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }),
    savedPath: async () => null, pickFile: async () => null, confirm: async () => false, setTimer: () => 0, clearTimer: () => {},
  });
  doc.body.append(settings.root);
  await settings.load();
  const g = settings.glossary;
  g.inputs.source.value = 'prompt';
  g.inputs.target.value = 'موجِّه';
  g.form.dispatchEvent({ type: 'submit', preventDefault() {} });
  await settle();
  const cells = findAll(settings.root, (e) => e.classList?.contains('st-gl__source'));
  assert.equal(cells.length, 1);
  assert.equal(cells[0].getAttribute('lang'), 'en');
});
