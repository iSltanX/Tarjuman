// تدقيق 7a66f91، المرحلة C5، في المشغّل. القرار Q24 (CDX-PLY-06): الرفع يرتّب المراجع (reviewIncoming) مرة واحدة على الأكثر،
// وقرينة الاسم من videoIdFromName مباشرة (نحو 0.02 م.ث بدل ترتيب ثانٍ: 670 م.ث لخمسة وعشرين ألف مقطع بعشر بصمات).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameHintFor, readFor } from '../../../../src/player/controls/flows.js';
import * as core from '../../../../src/core/import/index.js';
import { buildExport } from '../../../../src/core/export/index.js';
import { fileOf } from '../../../fixtures/srt/index.js';
import { NOW, englishTrack, makeCues } from '../../../helpers/fixtures.js';

const VIDEO = 'AAAAAAAAAAA';

function setup(fps, name) {
  const track = englishTrack({ cues: makeCues(300, { text: (i) => `line ${i}` }) });
  const built = buildExport({ videoId: VIDEO, track, mode: 'normal', now: NOW });
  const fingerprints = Array.from({ length: fps }, (_, i) => ({ ...built.fingerprint, id: `fp_synth000${i}`, cues: built.fingerprint.cues.map((c) => ({ ...c, startMs: c.startMs + i * 10, endMs: c.endMs + i * 10 })) }));
  const controller = { getState: () => ({ videoId: VIDEO, settings: {}, saved: { fingerprints } }) };
  const calls = { review: 0 };
  const importFlow = {
    readImport: core.readImport,
    reviewIncoming: (x) => { calls.review++; return core.reviewIncoming(x); },
    knownVideos: async () => [{ videoId: 'BBBBBBBBBBB', title: 'آخر' }],
  };
  const file = fileOf(built.files[0].text.replaceAll('line', 'سطر'), name);
  return { controller, importFlow, calls, file };
}

test('Q24: بعشر بصمات يُرتَّب مرة واحدة (في القراءة)، والقرينة بلا ترتيب ثانٍ وتدل على الفيديو الآخر', async () => {
  const { controller, importFlow, calls, file } = setup(10, 'BBBBBBBBBBB.en.manual.normal.ar.srt');
  const read = await readFor({ controller, importFlow, files: [file] });
  assert.equal(read.ok, true, JSON.stringify(read.error));
  const hint = await nameHintFor({ controller, importFlow, read });
  assert.equal(calls.review, 1);
  assert.deepEqual(hint, { videoId: 'BBBBBBBBBBB', title: 'آخر' });
});

test('Q24: ببصمة واحدة لا ترتيب أصلًا، واسم مخصص بلا قرينة', async () => {
  const { controller, importFlow, calls, file } = setup(1, 'my-custom-name.srt');
  const read = await readFor({ controller, importFlow, files: [file] });
  assert.equal(await nameHintFor({ controller, importFlow, read }), null);
  assert.equal(calls.review, 0);
});

// ---- U31 في الواجهة: رفع حجم الجزء يُقال تحت أحجام الأجزاء قبل التنزيل ----

test('U31: معاينة الأجزاء تقول إن حجم الجزء رُفع (EX_SPLIT_SIZE_RAISED) قبل التنزيل، ولا تقوله بلا رفع', async () => {
  const { messageFor } = await import('../../../../src/core/errors/index.js');
  const { PREVIEW_MS } = await import('../../../../src/player/controls/session.js');
  const { click, makeState, mountPage, trackInfo } = await import('./harness.js');
  const page = mountPage({ state: makeState({ captured: [trackInfo()] }) });
  page.flows.parts = 3;
  click(page.ui.btn('download'));
  click(page.ui.item('تقسيم الملفات الطويلة'));
  const check = page.ui.field('split');
  check.checked = true;
  check.dispatchEvent({ type: 'change', target: check });
  const note = () => page.ui.menu().querySelector('[data-fid="partsRaised"]');
  assert.equal(page.ui.menu().querySelectorAll('.row.part').length, 3);
  assert.equal(note(), null);
  page.flows.warnings = ['EX_SPLIT_SIZE_RAISED'];
  page.ui.field('splitSize').value = '60';
  page.ui.field('splitSize').dispatchEvent({ type: 'input', target: page.ui.field('splitSize') });
  page.env.win.advance(PREVIEW_MS + 10);
  assert.equal(note()?.textContent, messageFor('EX_SPLIT_SIZE_RAISED'));
});
