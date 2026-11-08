// تدقيق V2، WG-4، U-024: إعادة تنزيل مسار محفوظ بصمته معروفة (من المشغّل بلا التقاط، ومن المحفوظات) تسجّل أنه «آخر تنزيل»،
// فلا تبقى «من» والتعليمات وأجزاؤها على تنزيل سابق. البصمة المطابقة نفسها (بمعرّفها) تُحدَّث وتنتقل إلى الأحدث، فلا نسخة جديدة.
// بالوحدات الحقيقية: المخزن والمتحكم وتدفقات المشغّل ودوال المحفوظات ورد النافذة وزوجها المبدئي.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../../src/content/controller.js';
import { buildExport, instructions } from '../../../../src/core/export/index.js';
import { buildVideoStateReply } from '../../../../src/core/model/messages.js';
import { DEFAULT_LANG_PREFS, initialPair } from '../../../../src/core/model/lang-prefs.js';
import { createStore } from '../../../../src/core/store/index.js';
import { exportEnglish } from '../../../../src/pages/library/actions.js';
import { copyArgs, detectedSource } from '../../../../src/pages/popup/status.js';
import { prepareSavedExport, recordSavedFor } from '../../../../src/player/controls/flows.js';
import { createMemoryArea } from '../../../helpers/chrome-storage.js';
import { englishTrack, makeCues, videoRecord } from '../../../helpers/fixtures.js';

const at = (h) => Date.parse(`2026-11-02T${h}:00:00Z`);
const reply = (c) => buildVideoStateReply(c.getState(), { overlay: 'mounted', controls: 'mounted' });
// en أحدث التقاطًا فيختاره المشغّل بلا التقاط (U-033)، وتنزيلاه: en عند 12 ثم es عند 13 (الأحدث تنزيلًا).
const es = englishTrack({ lang: 'es', cues: makeCues(5, { text: (i) => `línea ${i}` }), capturedAt: '2026-11-02T11:00:00Z' });
const en = englishTrack({ lang: 'en', cues: makeCues(5, { text: (i) => `line ${i}` }), capturedAt: '2026-11-02T11:30:00Z' });

async function setup({ esSplit = false } = {}) {
  const rec = videoRecord({ arabic: false });
  const id = rec.videoId;
  const enX = buildExport({ videoId: id, track: en, mode: 'normal', now: at('12') });
  const esX = buildExport({ videoId: id, track: es, mode: 'normal', now: at('13'), split: esSplit ? { size: 2, by: 'count' } : null });
  rec.english = [es, en];
  rec.fingerprints = [enX.fingerprint, esX.fingerprint];
  const store = createStore({ area: createMemoryArea({ unlimited: true }) });
  await store.updateVideo(id, () => rec);
  return { id, store, ids: rec.fingerprints.map((f) => f.id) };
}

function popup(r) {
  const p = initialPair(DEFAULT_LANG_PREFS, { videoId: r.videoId, sourceLang: detectedSource(r) });
  const args = copyArgs({ reply: r, pair: { from: p.from, to: p.to }, glossary: null });
  const text = instructions(args);
  return { from: p.from, firstLine: text.split('\n')[0], partsParagraph: /الملف مقسّم إلى أجزاء/.test(text), parts: args.parts };
}

test('AV2 U-024: المشغّل بلا التقاط: إعادة تنزيل en بعد es تجعل «من» وآخر تنزيل en بلا أجزاء ولا بصمة جديدة', async () => {
  const { id, store, ids } = await setup({ esSplit: true });
  const c = createController({ store });
  await c.start(id);
  assert.equal(c.getState().english.key, 'en|manual');
  assert.equal(reply(c).lastExport.lang, 'es', 'قبل التنزيل: آخر تنزيل es المقسّم');
  const prep = prepareSavedExport({ controller: c, exportFlow: { buildExport }, now: at('14') });
  assert.equal((await recordSavedFor({ controller: c, key: prep.key, built: prep.built, videoId: id })).saved, true);
  const after = reply(c);
  assert.equal(after.source.lang, 'en');
  assert.equal(after.lastExport.lang, 'en');
  assert.equal(after.lastExport.parts, null);
  assert.deepEqual(c.getState().saved.fingerprints.map((f) => f.id).sort(), ids.slice().sort(), 'العدد والمعرّفات كما هي');
  const pp = popup(after);
  assert.equal(pp.from, 'en');
  assert.match(pp.firstLine, /\(en\)/);
  assert.equal(pp.partsParagraph, false);
  assert.equal(pp.parts, null);
});

test('AV2 U-024: المحفوظات: تصدير en بعد es يسجّل آخر تنزيل، ولا يزيد البصمات، ويبقى fingerprintSaved=false', async () => {
  const { id, store, ids } = await setup({ esSplit: true });
  const r = await exportEnglish({ store, videoId: id, trackKey: 'en|manual', save: async () => ({ ok: true, mode: 'downloads', downloadId: 1 }), now: () => at('14') });
  assert.equal(r.fingerprintSaved, false);
  const c = createController({ store });
  await c.start(id);
  const after = reply(c);
  assert.equal(after.source.lang, 'en');
  assert.equal(after.lastExport.lang, 'en');
  assert.equal(after.lastExport.parts, null);
  assert.equal(initialPair(DEFAULT_LANG_PREFS, { videoId: id, sourceLang: detectedSource(after) }).from, 'en');
  assert.deepEqual((await store.getVideo(id)).fingerprints.map((f) => f.id).sort(), ids.slice().sort());
});

test('AV2 U-024: إعادة تنزيل الأحدث أصلًا لا تكتب شيئًا، وتنزيل متكرر لـen بعد es ثم es ثم en يتبع الأخير', async () => {
  const { id, store } = await setup();
  const save = async () => ({ ok: true, mode: 'downloads', downloadId: 1 });
  const rev0 = (await store.getVideo(id)).rev;
  await exportEnglish({ store, videoId: id, trackKey: 'es|manual', save, now: () => at('14') });
  assert.equal((await store.getVideo(id)).rev, rev0, 'es هو الأحدث أصلًا: لا كتابة');
  await exportEnglish({ store, videoId: id, trackKey: 'en|manual', save, now: () => at('15') });
  const mid = createController({ store });
  await mid.start(id);
  assert.equal(reply(mid).lastExport.lang, 'en', 'بعد تنزيل en');
  await exportEnglish({ store, videoId: id, trackKey: 'es|manual', save, now: () => at('16') });
  const c = createController({ store });
  await c.start(id);
  assert.equal(reply(c).lastExport.lang, 'es');
  assert.equal((await store.getVideo(id)).fingerprints.length, 2);
});
