// STO-07: listLibrary يقرأ alts (نصوص الخانات غير النشطة كاملة) وmarks لكل صف «سريع».
// E-12: مدة الفيديو في صف المحفوظات بـgetVideo، وهو يقرأ مفاتيح الحزمة الخمسة كلها (السجل والرأس وalts والسابقة والعلامات).
import { createMemoryArea, createStore, NOW, out, sampleBundle, seedBundle } from './_h.mjs';

const kindOf = (k) => k.split(':')[0];
function meter(area) {
  const stats = { calls: 0, bytes: {}, keys: {} };
  const raw = area.get;
  area.get = async (keys) => {
    const r = await raw(keys);
    stats.calls += 1;
    for (const [k, v] of Object.entries(r)) {
      const kind = kindOf(k);
      stats.bytes[kind] = (stats.bytes[kind] ?? 0) + Buffer.byteLength(JSON.stringify(v));
      stats.keys[kind] = (stats.keys[kind] ?? 0) + 1;
    }
    return r;
  };
  return { stats, reset: () => { stats.calls = 0; stats.bytes = {}; stats.keys = {}; } };
}
const vid = (i) => `V${String(i).padStart(10, '0')}`;

for (const { label, videos, cues, chars } of [
  { label: 'codex-1x1500x200', videos: 1, cues: 1500, chars: 200 },
  { label: 'realistic-50x900x45', videos: 50, cues: 900, chars: 45 },
]) {
  const area = createMemoryArea({ unlimited: true });
  const store = createStore({ area, now: () => Date.parse(NOW) });
  for (let i = 0; i < videos; i++) {
    const b = sampleBundle({ videoId: vid(i), third: true });
    const big = Array.from({ length: cues }, (_, j) => ({ n: j + 1, startMs: j * 2500, endMs: j * 2500 + 2000, text: 'م'.repeat(chars) }));
    b.slots[1].track.original = big;
    b.slots[2].track.original = structuredClone(big);
    b.record.durationMs = 3600000;
    await seedBundle(store, b);
  }
  await store.listLibrary(); // تسخين: الترحيل وإصلاح الفهرس
  const m = meter(area);
  const t0 = performance.now();
  const rows = await store.listLibrary();
  const ms = performance.now() - t0;
  const needed = (m.stats.bytes.index ?? 0) + (m.stats.bytes.bundle ?? 0);
  const total = Object.values(m.stats.bytes).reduce((s, x) => s + x, 0);
  out(`listLibrary-${label}`, { rows: rows.length, getCalls: m.stats.calls, bytesByKind: m.stats.bytes, totalBytes: total, indexPlusHeadBytes: needed, altsShare: +((m.stats.bytes.alts ?? 0) / total).toFixed(3), ms: +ms.toFixed(1) });

  // E-12: ما يقرؤه getVideo لصف واحد من أجل durationMs وحده.
  m.reset();
  const rec = await store.getVideo(vid(0));
  out(`getVideo-for-duration-${label}`, { durationMs: rec.durationMs, getCalls: m.stats.calls, keysByKind: m.stats.keys, bytesByKind: m.stats.bytes });
}
