// TJ-25 (PIPE-03 ب): buildPatchPackage يرمي بدل { ok:false } حين يرفض المحلل المتسامح نص الإنجليزي، والمحرّر لا يلتقطه.
import { TED, TED_DUR, mod, out, tryIt } from './lib.mjs';
const { convertTrack } = await mod('core/convert/index.js');
const { buildExport, buildPatchPackage } = await mod('core/export/index.js');
const { messageFor } = await mod('core/errors/index.js');
const VID = 'iG9CE55wbtY';
function setup(text) {
  const d = TED();
  d.events[10].segs = [{ utf8: text }];
  const r = convertTrack({ body: JSON.stringify(d), trackKind: 'manual', durationMs: TED_DUR });
  const track = { key: 'en|manual', lang: 'en', kind: 'manual', capturedAt: '2026-11-05T00:00:00.000Z', source: 'capture', cues: r.cues };
  const ex = buildExport({ videoId: VID, track, mode: 'normal', now: '2026-11-05T00:00:00.000Z', rand: () => 0.5 });
  const n = r.cues.find((c) => c.text.includes('-->')).n;
  return { ok: r.ok, track, fp: ex.fingerprint, n };
}
for (const [label, text] of [
  ['«1 --> 2 is the arrow»', '1 --> 2 is the arrow'],
  ['سطر زمن كامل بلا رقم', 'he said\n00:00:01,000 --> 00:00:02,000'],
  ['رقم ثم سطر زمن', 'line one\n12\n00:00:01,000 --> 00:00:02,000'],
]) {
  const s = setup(text);
  const withIt = tryIt(() => buildPatchPackage({ videoId: VID, fingerprint: s.fp, englishTracks: [s.track], numbers: [s.n - 1, s.n] }));
  const without = tryIt(() => buildPatchPackage({ videoId: VID, fingerprint: s.fp, englishTracks: [s.track], numbers: [s.n + 5] }));
  out(label, { convertOk: s.ok, cueN: s.n, withCue: withIt.threw ?? (withIt.value.ok ? 'ok' : withIt.value.code), withoutCue: without.threw ?? (without.value.ok ? 'ok' : without.value.code) });
}
// محاكاة شكل الاستدعاء في المحرّر (app.js:883 onDownload: () => downloadPatch()، و889–905): الدالة async ولا try حول buildPatchPackage.
{
  const s = setup('1 --> 2 is the arrow');
  const toasts = [];
  const unhandled = [];
  process.on('unhandledRejection', (e) => unhandled.push(`${e.constructor.name}(${e.code})`));
  async function downloadPatch() {
    const pkg = buildPatchPackage({ videoId: VID, fingerprint: s.fp, englishTracks: [s.track], numbers: [s.n] });
    if (!pkg.ok) { toasts.push(messageFor(pkg.code)); return; }
    toasts.push('saved');
  }
  const onDownload = () => downloadPatch();
  onDownload();
  await new Promise((r) => setTimeout(r, 20));
  out('محاكاة نقرة «تنزيل ملف الاستكمال»', { toasts, unhandledRejections: unhandled });
}
