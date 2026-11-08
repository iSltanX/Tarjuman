#!/usr/bin/env node
// تحليل تصدير جلسة تنقل يدوية غير مؤتمتة (P1-AC5) من سجل الجلسة في الإضافة:
// كل التقاط مقبول يخص الفيديو المعروض لحظة قبوله، ونجاح الالتقاط بعد كل تنقل، ورفض ترجمات غير المعروض
// (معاينات وإعلانات)، وإعادة التقييم من انتظار ما قبل التنقل. يكتب الأدلة المنقّاة ويطبع الملخص.
//   node test/live/p1/verify-nav.mjs <ملف.json> --label <اسم>
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets, sanitizeDeep } from '../../../src/core/diagnostics/sanitize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const label = argv.includes('--label') ? argv[argv.indexOf('--label') + 1] : 'nav';
const raw = await readFile(argv[0], 'utf8');
const data = JSON.parse(raw);
const out = { label, exportedAt: data.exportedAt, browser: data.browser, storage: data.storage || null, secretsInExport: findSecrets(raw).length, tabs: [] };

for (const tab of data.tabs) {
  const log = tab.snap.log;
  const navs = log.filter((e) => e.type === 'nav' && e.to);
  const accepts = log.filter((e) => e.type === 'accept');
  const rejects = log.filter((e) => e.type === 'reject');
  const wrong = accepts.filter((e) => e.videoId !== e.currentVideoId);
  const visited = [...new Set([log.find((e) => e.type === 'start')?.to, ...navs.map((e) => e.to)].filter(Boolean))];
  const perVideo = visited.map((v) => ({
    videoId: v,
    accepted: accepts.filter((e) => e.videoId === v).map((e) => ({ lang: e.lang, trackKind: e.trackKind, bodyLength: e.bodyLength, pendingAgeMs: e.pendingAgeMs ?? null })),
    rejectedWhileCurrent: rejects.filter((e) => e.videoId === v && e.currentVideoId === v).map((e) => e.code),
    shown: log.filter((e) => e.type === 'shown' && e.videoId === v && e.text).length,
  }));
  const others = rejects.filter((e) => e.videoId && !visited.includes(e.videoId));
  out.tabs.push({
    navigations: navs.length, visited: visited.length, acceptedTotal: accepts.length, wrongAccepted: wrong.length,
    pendingAccepted: accepts.filter((e) => e.pendingAgeMs !== undefined).length,
    pendingReevaluated: [...accepts, ...rejects].filter((e) => e.pendingAgeMs !== undefined).length,
    nonDisplayedRejected: others.map((e) => ({ code: e.code, trackKind: e.trackKind, bodyLength: e.bodyLength })),
    perVideo,
    finalSnapshot: { currentVideoId: tab.snap.currentVideoId, accepted: tab.snap.accepted.map((a) => ({ videoId: a.videoId, ok: a.ok, invariants: a.invariants ? a.invariants.filter((r) => r.ok).length : 0 })) },
  });
}

const text = `${JSON.stringify(sanitizeDeep(out), null, 2)}\n`;
if (findSecrets(text).length) throw new Error('الأدلة فيها نمط حساس؛ لم تُكتب');
const rel = `test-results/live/P1/manual/${label}.json`;
await mkdir(path.dirname(path.join(ROOT, rel)), { recursive: true });
await writeFile(path.join(ROOT, rel), text);
console.log(`الأدلة: ${rel} · أسرار في الملف الأصلي: ${out.secretsInExport}`);
for (const t of out.tabs) {
  console.log(`تنقلات ${t.navigations} · فيديوهات ${t.visited} · مقبول ${t.acceptedTotal} · خاطئ ${t.wrongAccepted} · من الانتظار ${t.pendingAccepted} (أُعيد تقييم ${t.pendingReevaluated}) · رفض لغير المعروض ${t.nonDisplayedRejected.length} (${[...new Set(t.nonDisplayedRejected.map((x) => x.code))].join('، ')})`);
  for (const v of t.perVideo) {
    console.log(`  ${v.videoId}: مقبول ${v.accepted.map((a) => `${a.lang}/${a.trackKind}/${a.bodyLength}${a.pendingAgeMs != null ? `/انتظار ${a.pendingAgeMs}ms` : ''}`).join('، ') || '—'} · مرفوض وهو المعروض ${v.rejectedWhileCurrent.join('، ') || '—'} · لقطات معروضة ${v.shown}`);
  }
}
