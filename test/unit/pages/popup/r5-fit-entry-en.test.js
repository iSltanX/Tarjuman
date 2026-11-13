// ح-60 بالإنجليزية: نافذة الإضافة في حالتها المعتادة بلغة الواجهة الإنجليزية (uiLocale في التخزين): الأساسي ظاهر، و«Steps» مطوية،
// والشروح أوصاف، و«Copy page diagnostics» في سطر الأدوات، ولا حرف عربي. تُحمَّل نقطة الدخول مرة واحدة في هذه العملية.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEntryEnv } from '../../../helpers/c8-entry-env.js';
import { findAll, settle, textOf } from '../library/fake-dom.js';

const reply = {
  v: 1, ok: true, watch: true, videoId: 'ePes07acH_w', title: 'Naval Heritage', loading: false, arabic: null,
  english: { captured: [{ key: 'en|asr', kind: 'asr', cueCount: 1066, ok: true }], saved: [] },
  view: { displayOffsetMs: 0, displayMode: 'ar' }, mounted: { overlay: 'mounted', controls: 'mounted' },
  source: { key: 'en|asr', lang: 'en', kind: 'asr', via: null, from: 'captured' },
};
const env = createEntryEnv({
  tabs: { query: async () => [{ id: 7 }], sendMessage: async (id, msg) => (msg?.type === 'tj:get-video-state' ? reply : undefined) },
  storage: { uiLocale: { schema: 1, locale: 'en', source: 'user', at: '2026-11-14T00:00:00.000Z' } },
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
const doc = env.doc;
const all = (pred) => findAll(doc.documentElement, pred);
const byAction = (a) => doc.querySelectorAll('button').find((b) => b.getAttribute('data-action') === a) ?? null;
const shown = (node) => {
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) if (n.hidden || n.classList?.contains('tj-sr-only')) return false;
  return true;
};

test('ح-60 بالإنجليزية: الأساسي ظاهر، و«Steps» مطوية، والشروح أوصاف، والتشخيص في سطر الأدوات', () => {
  const card = all((e) => e.classList?.contains('tj-popup__status'))[0];
  assert.equal(textOf(card.querySelector('.tj-popup__english')), 'English · auto-generated · 1066 segments · captured');
  assert.ok(shown(byAction('copy')));
  const label = doc.querySelectorAll('label').find((l) => l.getAttribute('for') === 'tj-paste');
  assert.ok(shown(label));
  assert.equal(textOf(label), 'Paste the translation here');
  const toggle = byAction('steps');
  assert.equal(textOf(toggle), 'Steps');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(shown(doc.querySelector('#tj-steps')), false);
  assert.equal(doc.querySelector('#tj-pair-caption').classList.contains('tj-sr-only'), true);
  assert.equal(doc.querySelector('#tj-paste-hint').classList.contains('tj-sr-only'), true);
  assert.equal(textOf(doc.querySelector('#tj-pair-source')), 'Original language detected from the video’s subtitles.');
  const tools = all((e) => e.classList?.contains('tj-popup__tools'))[0];
  assert.equal(textOf(tools), 'Player tools are workingCopy page diagnostics');
  assert.equal(/[؀-ۿ]/.test(textOf(doc.querySelector('main'))), false, textOf(doc.querySelector('main')));
});
