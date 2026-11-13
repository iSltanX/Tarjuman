// تدفق الأدوات (عقد interfaces §٥) بالوحدات الحقيقية كلها: التقاط ← controller.convertCaptured ← buildExport ←
// download ← controller.recordExport ← التخزين. هكذا ستربطه P6؛ فهنا يثبت أن مخرجات P3 تقبلها مدققات P2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../../../src/content/controller.js';
import { buildExport, download } from '../../../src/core/export/index.js';
import { createStore } from '../../../src/core/store/index.js';
import { createMemoryArea } from '../../helpers/chrome-storage.js';
import { rankUsable } from '../../../src/core/model/track-order.js';
import { captureMsg, makeExtractor, sample } from '../extract/helpers.js';

const manual = sample('manual');
const asr = sample('asr');

async function setup(s) {
  const VID = s.fixture.videoId;
  const area = createMemoryArea();
  const store = createStore({ area });
  const { extractor, state } = makeExtractor({ videoId: VID, durationMs: s.fixture.durationMs });
  const c = createController({ store, extractor, page: { title: () => 'عنوان', durationMs: () => s.fixture.durationMs } });
  await c.start(VID);
  return { VID, store, extractor, state, c };
}

/** doc وهمي يجمع ما يُنزَّل (النص والاسم) بلا متصفح. */
function sink() {
  const saved = [];
  const win = { URL: { createObjectURL: (b) => b, revokeObjectURL() {} }, Blob: class { constructor(p) { this.text = p.join(''); } }, setTimeout() {} };
  const doc = {
    body: { append() {} },
    createElement: () => ({ style: {}, click() { saved.push({ name: this.download, text: this.href.text }); }, remove() {} }),
    defaultView: win,
  };
  return { doc, saved };
}

test('تدفق كامل: يدوي بوضع طويل', async () => {
  const { VID, store, extractor, c } = await setup(manual);
  extractor.handleMessage(captureMsg({ videoId: VID, body: manual.body }));
  const key = rankUsable(c.getState().captured)[0].key;
  assert.equal(key, 'en|manual');

  const conv = c.convertCaptured(key, { mode: 'long' });
  assert.equal(conv.ok, true);
  const out = buildExport({
    videoId: VID, title: c.getState().title, mode: 'long', now: '2026-11-01T12:00:00.000Z',
    track: { key: conv.key, lang: conv.lang, kind: conv.kind, cues: conv.cues, warnings: conv.warnings },
  });
  const { doc, saved } = sink();
  for (const f of out.files) download(f, { doc });
  assert.deepEqual(saved.map((x) => x.name), [`${VID}.en.manual.long.srt`]);
  assert.equal(saved[0].text, out.files[0].text);

  const rec = await c.recordExport({ trackKey: key, fingerprint: out.fingerprint });
  const stored = await store.getVideo(VID);
  assert.equal(rec.fingerprints[0].id, out.fingerprint.id);
  assert.deepEqual(stored.fingerprints, [out.fingerprint]);
  assert.equal(stored.fingerprints[0].mode, 'long');
  assert.equal(stored.english[0].cues.length, 427, 'المسار المحفوظ بوضعه العادي كما استُخرج');
  assert.ok(stored.fingerprints[0].count < 427, 'والبصمة بوضع التصدير');
  assert.equal(stored.arabic, null);
});

test('تدفق كامل: تلقائي مقسَّم بطلب صريح، بصمة بأجزائها تقبلها مدققات التخزين', async () => {
  const { VID, store, extractor, c } = await setup(asr);
  extractor.handleMessage(captureMsg({ videoId: VID, body: asr.body, trackKind: 'asr' }));
  const conv = c.convertCaptured('en|asr', { mode: 'normal' });
  const out = buildExport({
    videoId: VID, mode: 'normal', split: { size: 300 }, now: Date.parse('2026-11-01T12:00:00.000Z'),
    track: { key: conv.key, lang: conv.lang, kind: conv.kind, cues: conv.cues },
  });
  assert.equal(out.files.length, 4);
  await c.recordExport({ trackKey: 'en|asr', fingerprint: out.fingerprint });
  const stored = await store.getVideo(VID);
  assert.deepEqual(stored.fingerprints[0].parts, out.fingerprint.parts);
  assert.equal(stored.fingerprints[0].fileName, null);
  assert.equal(stored.english[0].cues.length, 1066);
});

test('مسار معطوب: لا تصدير، والأداة تقرأ الرمز من النتيجة', async () => {
  const { VID, extractor, state, c } = await setup(manual);
  state.durationMs = 1000;
  extractor.handleMessage(captureMsg({ videoId: VID, body: manual.body }));
  const conv = c.convertCaptured('en|manual', { mode: 'normal' });
  assert.deepEqual([conv.ok, conv.code, conv.cues.length], [false, 'EX_BEYOND_DURATION', 0], 'ثابت الحدود وحده (تدقيق 7a66f91، U39)');
  assert.deepEqual(rankUsable(c.getState().captured), []);
  assert.throws(() => buildExport({
    videoId: VID, mode: 'normal', track: { key: conv.key, lang: conv.lang, kind: conv.kind, cues: conv.cues },
  }), (e) => e.code === 'EX_NO_TRACK');
});
