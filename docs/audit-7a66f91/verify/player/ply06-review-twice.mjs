// PLY-06 / E-4: reviewIncoming (ترتيب المراجع بالمحاذاة) يُستدعى في readFor ثم nameHintFor على المقاطع والبصمات نفسها.
import { imp, log } from './common.mjs';
const { readFor, nameHintFor } = await imp('src/player/controls/flows.js');
const importFlow = await imp('src/core/import/index.js');
const { buildExport } = await imp('src/core/export/index.js');
const { makeCues, NOW } = await imp('test/helpers/fixtures.js');

const id = 'synthetic01';
for (const [count, fps] of [[25000, 10], [25000, 1], [3000, 2]]) {
  const tr = { lang: 'en', kind: 'manual', key: 'en|manual', cues: makeCues(count, { text: (i) => `Sample ${i}` }) };
  const built = buildExport({ videoId: id, track: tr, mode: 'normal', now: Date.parse(NOW) });
  const fingerprints = Array.from({ length: fps }, (_, i) => ({ ...built.fingerprint, id: `fp_synth${i}`, cues: built.fingerprint.cues.map((c) => ({ ...c, startMs: c.startMs + i * 10, endMs: c.endMs + i * 10 })) }));
  const controller = { getState: () => ({ videoId: id, settings: {}, saved: { fingerprints } }) };
  const file = new File([built.files[0].text.replaceAll('Sample', 'مثال')], 'my-custom-name.srt');
  let runs = 0;
  let rankMs = 0;
  const flow = {
    ...importFlow,
    reviewIncoming: (x) => { runs++; const t = performance.now(); const r = importFlow.reviewIncoming(x); rankMs += performance.now() - t; return r; },
    knownVideos: async () => [],
  };
  const t0 = performance.now();
  const read = await readFor({ controller, importFlow: flow, files: [file] });
  const t1 = performance.now();
  const runsAfterRead = runs;
  const hint = await nameHintFor({ controller, importFlow: flow, read });
  const t2 = performance.now();
  const t3 = performance.now();
  const direct = importFlow.videoIdFromName('my-custom-name.srt', { videoId: id, knownVideoIds: [] });
  const t4 = performance.now();
  log(`${count} مقطعًا، ${fps} بصمة: readFor ${Math.round(t1 - t0)}ms (استدعاءات review ${runsAfterRead}) | nameHintFor ${Math.round(t2 - t1)}ms (المجموع ${runs}) | زمن review الكلي ${Math.round(rankMs)}ms | القرينة=${JSON.stringify(hint)} | videoIdFromName مباشرة ${(t4 - t3).toFixed(2)}ms => ${JSON.stringify(direct)}`);
}
